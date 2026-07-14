import JSZip from 'jszip';

export const MAX_ANONYMOUS_BINARY_BYTES = 2 * 1024 * 1024;
export const MAX_DOCX_ENTRIES = 220;
export const MAX_DOCX_UNCOMPRESSED_BYTES = 12 * 1024 * 1024;
export const MAX_PDF_PAGES = 40;

export class ResumeParserSafetyError extends Error {
  constructor(
    public readonly code: 'AUTH_REQUIRED' | 'PARSE_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'ResumeParserSafetyError';
  }
}

export function assertAnonymousBinaryBudget(byteLength: number, type: 'pdf' | 'docx' | 'doc') {
  if (type === 'doc') {
    throw new ResumeParserSafetyError(
      'AUTH_REQUIRED',
      'Sign in before uploading a legacy Word (.doc) resume, or save it as DOCX or TXT.',
    );
  }
  if (byteLength > MAX_ANONYMOUS_BINARY_BYTES) {
    throw new ResumeParserSafetyError(
      'AUTH_REQUIRED',
      'Sign in to process this PDF or Word resume, or use a file under 2MB.',
    );
  }
}

export async function assertDocxResourceBudget(buffer: Buffer) {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(buffer, {
      checkCRC32: false,
      createFolders: false,
    });
  } catch {
    throw new ResumeParserSafetyError('PARSE_FAILED', 'This Word file is damaged or is not a valid DOCX document.');
  }

  const entries = Object.values(archive.files);
  if (entries.length > MAX_DOCX_ENTRIES) {
    throw new ResumeParserSafetyError('PARSE_FAILED', 'This Word file is too complex to process safely.');
  }

  let uncompressedBytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    const internalSize = Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize);
    if (!Number.isFinite(internalSize) || internalSize < 0) {
      throw new ResumeParserSafetyError('PARSE_FAILED', 'This Word file has an invalid archive entry.');
    }
    uncompressedBytes += internalSize;
    if (uncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) {
      throw new ResumeParserSafetyError('PARSE_FAILED', 'This Word file expands beyond the safe processing limit.');
    }
  }
}

export function assertPdfPageBudget(pageCount: unknown) {
  const pages = Number(pageCount);
  if (!Number.isFinite(pages) || pages < 1) {
    throw new ResumeParserSafetyError('PARSE_FAILED', 'This PDF does not contain readable pages.');
  }
  if (pages > MAX_PDF_PAGES) {
    throw new ResumeParserSafetyError('PARSE_FAILED', `This PDF has more than ${MAX_PDF_PAGES} pages. Upload a shorter resume.`);
  }
}
