const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { createSyntheticResumeFixtures } = require('./resume-production-smoke');

const bundle = buildSync({
  entryPoints: ['lib/resume-binary-parser-worker.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  logLevel: 'silent',
}).outputFiles[0].text;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-binary-worker-'));
const bundlePath = path.join(tempDir, 'worker.cjs');
fs.writeFileSync(bundlePath, bundle);
const { parseResumeBinaryInWorker } = require(bundlePath);
test.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

test('the worker extracts actual synthetic DOCX and PDF resume fixtures', async () => {
  const fixtures = await createSyntheticResumeFixtures();
  for (const fixture of fixtures.filter(item => !item.fileName.endsWith('.txt'))) {
    const result = await parseResumeBinaryInWorker({
      buffer: fixture.bytes,
      type: fixture.fileName.endsWith('.pdf') ? 'pdf' : 'docx',
      maxExtractedChars: 50_000,
    });
    assert.match(result.text, new RegExp(fixture.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(result.truncated, false);
  }
});

test('malformed PDFs fail closed and textless PDFs remain identifiable as scanned', async () => {
  await assert.rejects(
    parseResumeBinaryInWorker({ buffer: Buffer.from('%PDF-not-a-document'), type: 'pdf', maxExtractedChars: 50_000 }),
    error => error?.code === 'PARSE_FAILED',
  );
  const PDFDocument = require('@react-pdf/pdfkit').default;
  const blankPdf = await new Promise((resolve, reject) => {
    const document = new PDFDocument({ autoFirstPage: true }); const chunks = [];
    document.on('data', chunk => chunks.push(Buffer.from(chunk)));
    document.once('error', reject); document.once('end', () => resolve(Buffer.concat(chunks))); document.end();
  });
  const result = await parseResumeBinaryInWorker({ buffer: blankPdf, type: 'pdf', maxExtractedChars: 50_000 });
  assert.equal(result.text.trim(), '');
  assert.equal(result.pageCount, 1);
});

test('PDF line boundaries survive extraction and limits remain enforced', async () => {
  const PDFDocument = require('@react-pdf/pdfkit').default;
  const multiPagePdf = await new Promise((resolve, reject) => {
    const document = new PDFDocument({ autoFirstPage: true }); const chunks = [];
    document.on('data', chunk => chunks.push(Buffer.from(chunk)));
    document.once('error', reject); document.once('end', () => resolve(Buffer.concat(chunks)));
    document.text('First line'); document.text('Second line'); document.addPage(); document.text('Third page'); document.end();
  });
  const result = await parseResumeBinaryInWorker({ buffer: multiPagePdf, type: 'pdf', maxExtractedChars: 50_000 });
  assert.equal(result.pageCount, 2);
  assert.match(result.text, /First line\nSecond line/);
  const truncated = await parseResumeBinaryInWorker({ buffer: multiPagePdf, type: 'pdf', maxExtractedChars: 10 });
  assert.equal(truncated.truncated, true);
  const tooManyPages = await new Promise((resolve, reject) => {
    const document = new PDFDocument({ autoFirstPage: true }); const chunks = [];
    document.on('data', chunk => chunks.push(Buffer.from(chunk)));
    document.once('error', reject); document.once('end', () => resolve(Buffer.concat(chunks)));
    for (let page = 1; page <= 41; page += 1) { if (page > 1) document.addPage(); document.text(`Page ${page}`); }
    document.end();
  });
  await assert.rejects(
    parseResumeBinaryInWorker({ buffer: tooManyPages, type: 'pdf', maxExtractedChars: 50_000 }),
    error => error?.code === 'PARSE_FAILED' && /more than/.test(error.message),
  );
});
