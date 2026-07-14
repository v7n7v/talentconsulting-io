import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminStorage } from '@/lib/firebase-admin';
import { monitor } from '@/lib/monitor';
import {
    ResumeParserSafetyError,
    assertAnonymousBinaryBudget,
} from '@/lib/resume-parser-safety';
import { parseResumeBinaryInWorker } from '@/lib/resume-binary-parser-worker';

const MAX_DIRECT_FILE_SIZE = 4 * 1024 * 1024;
const MAX_AUTH_FILE_SIZE = 10 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 50_000;
const VALID_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt'];

type DetectedResumeType = 'pdf' | 'docx' | 'doc' | 'txt';

function resumeParseError(code: string, message: string, status = 400) {
    return NextResponse.json({ code, error: message, message }, { status });
}

function getExtension(fileName: string) {
    return VALID_EXTENSIONS.find(ext => fileName.toLowerCase().endsWith(ext));
}

function trimExtractedText(text: string) {
    return text.trim().slice(0, MAX_EXTRACTED_CHARS);
}

function hasZipSignature(buffer: Buffer) {
    return buffer.length >= 4
        && buffer[0] === 0x50
        && buffer[1] === 0x4b
        && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
        && (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);
}

function hasOleSignature(buffer: Buffer) {
    const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    return buffer.length >= ole.length && ole.every((byte, index) => buffer[index] === byte);
}

function looksLikeText(buffer: Buffer, textContent?: string) {
    const sample = textContent ?? buffer.subarray(0, 2048).toString('utf8');
    if (!sample.trim()) return false;
    if (sample.includes('\u0000')) return false;
    const replacementCount = (sample.match(/\uFFFD/g) || []).length;
    return replacementCount <= Math.max(2, sample.length * 0.02);
}

function detectResumeType(fileName: string, buffer: Buffer | null, textContent: string): DetectedResumeType | null {
    if (fileName.endsWith('.txt')) {
        return buffer ? (looksLikeText(buffer, textContent) ? 'txt' : null) : (textContent.trim() ? 'txt' : null);
    }
    if (!buffer) return null;
    if (fileName.endsWith('.pdf')) {
        return buffer.subarray(0, 5).toString('ascii') === '%PDF-' ? 'pdf' : null;
    }
    if (fileName.endsWith('.docx')) {
        return hasZipSignature(buffer) ? 'docx' : null;
    }
    if (fileName.endsWith('.doc')) {
        return hasOleSignature(buffer) ? 'doc' : null;
    }
    return null;
}

async function downloadStorageFileWithLimit(storageFile: any, maxBytes: number) {
    const [metadata] = await storageFile.getMetadata();
    const declaredSize = Number(metadata?.size);
    if (!Number.isFinite(declaredSize) || declaredSize < 0) {
        throw new ResumeParserSafetyError('PARSE_FAILED', 'The uploaded resume size could not be verified.');
    }
    if (declaredSize > maxBytes) {
        throw new ResumeParserSafetyError('PARSE_FAILED', 'File too large. Max 10MB.');
    }

    return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let settled = false;
        const stream = storageFile.createReadStream({ start: 0, end: maxBytes });
        const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            stream.destroy();
            reject(error);
        };
        stream.on('data', (chunk: Buffer | Uint8Array) => {
            const bytes = Buffer.from(chunk);
            total += bytes.length;
            if (total > maxBytes) {
                fail(new ResumeParserSafetyError('PARSE_FAILED', 'File too large. Max 10MB.'));
                return;
            }
            chunks.push(bytes);
        });
        stream.once('error', (error: Error) => fail(error));
        stream.once('end', () => {
            if (settled) return;
            settled = true;
            resolve(Buffer.concat(chunks, total));
        });
    });
}

export async function POST(req: NextRequest) {
    let storageFile: any = null;
    let storagePathDeleted = false;
    const cleanupStorageUpload = async () => {
        if (!storageFile || storagePathDeleted) return;
        try {
            await storageFile.delete({ ignoreNotFound: true });
            storagePathDeleted = true;
        } catch (cleanupError: unknown) {
            console.warn('[api/gauntlet/parse-resume] Storage cleanup failed:', cleanupError instanceof Error ? cleanupError.message : 'unknown');
        }
    };
    const parseError = async (code: string, message: string, status = 400) => {
        await cleanupStorageUpload();
        return resumeParseError(code, message, status);
    };
    const parseSuccess = async (payload: Record<string, unknown>) => {
        await cleanupStorageUpload();
        return NextResponse.json({ ...payload, storagePathDeleted });
    };

    try {
        const guard = await guardApiRoute(req, { rateLimit: 5, rateLimitWindow: 60_000, allowAnonymous: true });
        if (guard.error) return guard.error;
        const isAnon = guard.user.uid.startsWith('anon:');

        let fileName = '';
        let fileBuffer: Buffer | null = null;
        let textContent = '';
        let sourceType: 'direct' | 'storage' = 'direct';

        const contentType = req.headers.get('content-type') || '';
        const contentLengthHeader = req.headers.get('content-length');
        const contentLength = Number(contentLengthHeader);
        const maxRequestBytes = contentType.includes('application/json')
            ? Math.ceil((isAnon ? MAX_DIRECT_FILE_SIZE : MAX_AUTH_FILE_SIZE) * 4 / 3) + (512 * 1024)
            : (isAnon ? MAX_DIRECT_FILE_SIZE : MAX_AUTH_FILE_SIZE) + (256 * 1024);
        if (!contentLengthHeader || !Number.isFinite(contentLength) || contentLength <= 0) {
            return await parseError('PARSE_FAILED', 'The upload size could not be verified.', 411);
        }
        if (contentLength > maxRequestBytes) {
            return await parseError('FILE_TOO_LARGE', isAnon ? 'File too large. Max 4MB before sign-in.' : 'File too large. Max 10MB.', 413);
        }

        if (contentType.includes('application/json')) {
            const body = await req.json();
            if (!body.fileName) {
                return await parseError('PARSE_FAILED', 'No file name provided.');
            }
            fileName = body.fileName.toLowerCase();
            if (!getExtension(fileName)) {
                return await parseError('UNSUPPORTED_TYPE', 'Unsupported file type. Please upload a PDF, Word, or TXT file.');
            }

            if (body.storagePath) {
                if (isAnon) {
                    return await parseError('AUTH_REQUIRED', 'Sign in to upload resumes larger than 4MB.', 401);
                }
                const storagePath = String(body.storagePath);
                const expectedPrefix = `resume_uploads/${guard.user.uid}/`;
                if (!storagePath.startsWith(expectedPrefix)) {
                    return await parseError('PARSE_FAILED', 'Invalid resume upload path.', 403);
                }
                storageFile = getAdminStorage().bucket().file(storagePath);
                try {
                    fileBuffer = await downloadStorageFileWithLimit(storageFile, MAX_AUTH_FILE_SIZE);
                } catch (error) {
                    if (error instanceof ResumeParserSafetyError) {
                        return await parseError(error.code, error.message, error.message.startsWith('File too large') ? 413 : 400);
                    }
                    throw error;
                }
                sourceType = 'storage';
            } else if (body.fileData) {
                // Temporary backward compatibility for older clients.
                fileBuffer = Buffer.from(body.fileData, 'base64');
            } else {
                return await parseError('PARSE_FAILED', 'No file data provided.');
            }

            if (!fileBuffer) {
                return await parseError('PARSE_FAILED', 'No file data provided.');
            }
            if (fileBuffer.length > MAX_AUTH_FILE_SIZE) {
                return await parseError('FILE_TOO_LARGE', 'File too large. Max 10MB.');
            }
            if (isAnon && fileBuffer.length > MAX_DIRECT_FILE_SIZE) {
                return await parseError('AUTH_REQUIRED', 'Sign in to upload resumes larger than 4MB.', 401);
            }
            if (fileName.endsWith('.txt')) {
                textContent = fileBuffer.toString('utf-8');
            }
        } else {
            const formData = await req.formData();
            const file = formData.get('file') as File;
            if (!file) return await parseError('PARSE_FAILED', 'No file provided.');
            fileName = file.name.toLowerCase();
            if (!getExtension(fileName)) {
                return await parseError('UNSUPPORTED_TYPE', 'Unsupported file type. Please upload a PDF, Word, or TXT file.');
            }
            if (file.size > MAX_AUTH_FILE_SIZE) {
                return await parseError('FILE_TOO_LARGE', 'File too large. Max 10MB.');
            }
            if (isAnon && file.size > MAX_DIRECT_FILE_SIZE) {
                return await parseError('AUTH_REQUIRED', 'Sign in to upload resumes larger than 4MB.', 401);
            }
            if (fileName.endsWith('.txt')) {
                textContent = await file.text();
            } else {
                const arrayBuffer = await file.arrayBuffer();
                fileBuffer = Buffer.from(arrayBuffer);
            }
        }

        const detectedType = detectResumeType(fileName, fileBuffer, textContent);
        if (!detectedType) {
            return await parseError('UNSUPPORTED_TYPE', 'The file contents do not match a supported resume type. Please upload a real PDF, Word, or TXT file.');
        }

        try {
            if (isAnon && fileBuffer && detectedType !== 'txt') {
                assertAnonymousBinaryBudget(fileBuffer.length, detectedType);
            }
        } catch (error) {
            if (error instanceof ResumeParserSafetyError) {
                return await parseError(error.code, error.message, error.code === 'AUTH_REQUIRED' ? 401 : 400);
            }
            throw error;
        }

        // Handle plain text files
        if (detectedType === 'txt') {
            const cleanText = trimExtractedText(textContent);
            if (!cleanText) return await parseError('PARSE_EMPTY', 'Could not extract meaningful text from this file.');
            return await parseSuccess({ text: cleanText, fileName, sourceType, characterCount: cleanText.length, detectedType });
        }

        if (fileBuffer) {
            try {
                const parsed = await parseResumeBinaryInWorker({
                    buffer: fileBuffer,
                    type: detectedType,
                    timeoutMs: isAnon ? 4_000 : 8_000,
                    maxExtractedChars: MAX_EXTRACTED_CHARS,
                });
                const cleanText = trimExtractedText(parsed.text);
                if (detectedType === 'pdf' && cleanText.length < 20) {
                    return await parseError(
                        'SCANNED_PDF',
                        'Could not extract text from this PDF. It may be image-based — please try a Word (.docx) version.'
                    );
                }
                if (!cleanText) {
                    return await parseError('PARSE_EMPTY', 'Could not extract meaningful text from this resume.');
                }
                return await parseSuccess({ text: cleanText, fileName, sourceType, characterCount: cleanText.length, detectedType });
            } catch (error) {
                if (error instanceof ResumeParserSafetyError) {
                    return await parseError(error.code, error.message);
                }
                throw error;
            }
        }

        return await parseError('UNSUPPORTED_TYPE', 'Unsupported file type. Please upload a PDF, Word (.docx), or TXT file.');

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown parse error';
        console.error('[api/gauntlet/parse-resume] Error:', message);
        monitor.critical('Tool: gauntlet/parse-resume', message);
        return await parseError('PARSE_FAILED', 'Failed to parse resume', 500);
    }
}
