import { Worker } from 'node:worker_threads';
import {
  MAX_DOCX_ENTRIES,
  MAX_DOCX_UNCOMPRESSED_BYTES,
  MAX_PDF_PAGES,
  ResumeParserSafetyError,
} from '@/lib/resume-parser-safety';

type BinaryResumeType = 'pdf' | 'docx';

interface BinaryParseResult {
  text: string;
  pageCount?: number;
  originalCharacterCount?: number;
  truncated?: boolean;
}

const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require('node:worker_threads');

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

async function inspectDocx(buffer, limits) {
  const JSZip = require('jszip');
  let archive;
  try {
    archive = await JSZip.loadAsync(buffer, { checkCRC32: false, createFolders: false });
  } catch {
    fail('PARSE_FAILED', 'This Word file is damaged or is not a valid DOCX document.');
  }
  const entries = Object.values(archive.files);
  if (entries.length > limits.maxEntries) {
    fail('PARSE_FAILED', 'This Word file is too complex to process safely.');
  }
  let uncompressedBytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    const size = Number(entry._data && entry._data.uncompressedSize);
    if (!Number.isFinite(size) || size < 0) {
      fail('PARSE_FAILED', 'This Word file has an invalid archive entry.');
    }
    uncompressedBytes += size;
    if (uncompressedBytes > limits.maxUncompressedBytes) {
      fail('PARSE_FAILED', 'This Word file expands beyond the safe processing limit.');
    }
  }
}

async function parse() {
  const buffer = Buffer.from(workerData.bytes);
  const type = workerData.type;
  if (type === 'pdf') {
    // pdf-parse v1 bundles an old PDF.js parser that rejects valid PDFs with
    // modern xref streams when loaded in a fresh worker. Use the installed
    // PDF.js 4 legacy build directly and keep extraction page-bounded.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const path = require('node:path');
    const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer), disableWorker: true, isEvalSupported: false, useSystemFonts: false,
      cMapUrl: path.join(pdfjsRoot, 'cmaps') + path.sep, cMapPacked: true,
      standardFontDataUrl: path.join(pdfjsRoot, 'standard_fonts') + path.sep,
    });
    const document = await loadingTask.promise;
    const pages = Number(document.numPages);
    if (!Number.isFinite(pages) || pages < 1) {
      fail('PARSE_FAILED', 'This PDF does not contain readable pages.');
    }
    if (pages > workerData.limits.maxPdfPages) {
      fail('PARSE_FAILED', 'This PDF has more than ' + workerData.limits.maxPdfPages + ' pages. Upload a shorter resume.');
    }
    const pageText = [];
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let line = '';
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        line += item.str;
        if (item.hasEOL) { pageText.push(line.trimEnd()); line = ''; }
        else line += ' ';
      }
      if (line) pageText.push(line.trimEnd());
      page.cleanup();
    }
    await document.cleanup();
    const text = pageText.join('\n');
    return { text: text.slice(0, workerData.limits.maxExtractedChars), originalCharacterCount: text.length, truncated: text.length > workerData.limits.maxExtractedChars, pageCount: pages };
  }

  if (type === 'docx') {
    await inspectDocx(buffer, workerData.limits);
  }
  const mammoth = require('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  const text = String(result.value || '');
  return { text: text.slice(0, workerData.limits.maxExtractedChars), originalCharacterCount: text.length, truncated: text.length > workerData.limits.maxExtractedChars };
}

parse()
  .then(result => parentPort.postMessage({ ok: true, result }))
  .catch(error => parentPort.postMessage({
    ok: false,
    code: error && error.code === 'PARSE_FAILED' ? error.code : 'PARSE_FAILED',
    message: error && error.code === 'PARSE_FAILED' ? error.message : 'The resume could not be parsed safely.',
  }));
`;

export function parseResumeBinaryInWorker(input: {
  buffer: Buffer;
  type: BinaryResumeType;
  timeoutMs?: number;
  maxExtractedChars: number;
}): Promise<BinaryParseResult> {
  const timeoutMs = Math.min(Math.max(input.timeoutMs ?? 6_000, 1_000), 10_000);

  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        bytes: input.buffer,
        type: input.type,
        limits: {
          maxEntries: MAX_DOCX_ENTRIES,
          maxUncompressedBytes: MAX_DOCX_UNCOMPRESSED_BYTES,
          maxPdfPages: MAX_PDF_PAGES,
          maxExtractedChars: input.maxExtractedChars,
        },
      },
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 24,
        stackSizeMb: 4,
      },
    });

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      callback();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new ResumeParserSafetyError(
        'PARSE_FAILED',
        'This resume took too long to process safely. Try a simpler PDF, DOCX, or TXT file.',
      )));
    }, timeoutMs);
    timer.unref?.();

    worker.once('message', (message: {
      ok?: boolean;
      result?: BinaryParseResult;
      code?: string;
      message?: string;
    }) => {
      if (message.ok && message.result) {
        finish(() => resolve(message.result as BinaryParseResult));
        return;
      }
      finish(() => reject(new ResumeParserSafetyError(
        'PARSE_FAILED',
        message.message || 'The resume could not be parsed safely.',
      )));
    });
    worker.once('error', () => {
      finish(() => reject(new ResumeParserSafetyError(
        'PARSE_FAILED',
        'The resume parser stopped before it could safely finish.',
      )));
    });
    worker.once('exit', (code) => {
      if (code !== 0) {
        finish(() => reject(new ResumeParserSafetyError(
          'PARSE_FAILED',
          'The resume parser reached its safety limit.',
        )));
      }
    });
  });
}
