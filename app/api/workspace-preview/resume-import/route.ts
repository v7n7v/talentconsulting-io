import { NextRequest, NextResponse } from 'next/server';
import { isIsolatedWorkspacePreview } from '@/lib/workspace-preview';
import { parseResumeBinaryInWorker } from '@/lib/resume-binary-parser-worker';
import { resumeTextDraft } from '@/lib/resume-text-draft';

export const runtime = 'nodejs';

/** Local bytes only: no cloud storage, model, authentication bypass or account writes. */
export async function POST(request: NextRequest) {
  if (!isIsolatedWorkspacePreview() || !['127.0.0.1', 'localhost', '[::1]'].includes(request.nextUrl.hostname)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Taco-Preview': 'local-extraction' } });
  try {
    const length = Number(request.headers.get('content-length'));
    if (!Number.isFinite(length) || length <= 0 || length > 4 * 1024 * 1024 + 100_000) return json({ error: 'Choose a file up to 4 MB for local preview.' }, 413);
    if (request.headers.get('content-type')?.includes('application/json')) {
      const body = await request.json();
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (text.length < 20 || text.length > 50_000) return json({ error: 'Use between 20 and 50,000 characters.' }, 422);
      return json({ resume: resumeTextDraft(text), rawText: text, warnings: ['Local preview keeps your text in editable sections. Automatic AI field extraction is disabled here; check the sections before continuing.'] });
    }
    const body = await request.formData();
    const file = body.get('file');
    if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024) return json({ error: 'Choose a PDF, DOCX or TXT file up to 4 MB.' }, 400);
    const type = file.name.toLowerCase().split('.').pop();
    if (!['pdf', 'docx', 'txt'].includes(type || '')) return json({ error: 'Choose a PDF, DOCX or TXT file.' }, 415);
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = type === 'txt' ? { text: buffer.toString('utf8'), truncated: false } : await parseResumeBinaryInWorker({ buffer, type: type as 'pdf' | 'docx', maxExtractedChars: 50_000 });
    const text = result.text.trim();
    if (result.truncated || text.length > 50_000) return json({ error: 'This file is too long. Upload a shorter resume.' }, 422);
    if (text.length < 20 || text.includes('\0')) return json({ code: 'SCANNED_PDF', error: 'No readable resume text was found. Paste the text or choose a text-based PDF or DOCX.' }, 422);
    return json({ text, rawText: text, fileName: file.name, sourceType: 'direct', characterCount: text.length, originalCharacterCount: text.length, detectedType: type, truncated: false, warnings: [] });
  } catch {
    return json({ code: 'PARSE_FAILED', error: 'This file could not be read. Try another PDF or DOCX, or paste its text.' }, 422);
  }
}
