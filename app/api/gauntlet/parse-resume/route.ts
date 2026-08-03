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

/**
 * Find the Storage object a rejected request had already uploaded, so the
 * caller's resume does not survive the rejection.
 *
 * Called only from the guard-rejection path, and deliberately does as little
 * as possible before it is sure there is something to find:
 *
 *   - Only a credentialled request can have created one; storage.rules is
 *     `request.auth != null`, so an anonymous flood has nothing in the bucket
 *     and never reaches the body read below.
 *   - Only JSON requests can name a storagePath at all.
 *   - The path must sit under the caller's own prefix.
 *
 * The identity is the one `guardApiRoute` already resolved, passed in. Calling
 * `authenticateRequest` again here would mean a second `verifyIdToken` on every
 * throttled request that presents any Authorization header at all, valid or
 * not — precisely the unthrottled amplification the guard above exists to
 * prevent, reintroduced two lines below it.
 */
async function bindAbandonedStorageObject(
    req: NextRequest,
    contentType: string,
    identity: { uid: string } | null,
) {
    if (!identity) return null;
    if (!contentType.includes('application/json')) return null;
    try {
        const body = await req.json().catch(() => null);
        const claimedPath = typeof body?.storagePath === 'string' ? body.storagePath : '';
        if (!claimedPath.startsWith(`resume_uploads/${identity.uid}/`) || claimedPath.includes('..')) {
            return null;
        }
        return getAdminStorage().bucket().file(claimedPath);
    } catch {
        // Cleanup is best effort. Nothing sweeps up what it misses: there is no
        // bucket lifecycle rule on this project, and creating one is an
        // UNCOMPLETED OWNER ACTION — see docs/storage-retention-runbook.md.
        return null;
    }
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
        let fileName = '';
        let fileBuffer: Buffer | null = null;
        let textContent = '';
        let sourceType: 'direct' | 'storage' = 'direct';

        const contentType = req.headers.get('content-type') || '';
        const contentLengthHeader = req.headers.get('content-length');
        const contentLength = Number(contentLengthHeader);
        // The outer ceiling, computed against the authenticated limits because
        // who the caller is is not known yet. The tighter anonymous bound is
        // re-applied the moment the guard resolves, below.
        const absoluteMaxRequestBytes = contentType.includes('application/json')
            ? Math.ceil(MAX_AUTH_FILE_SIZE * 4 / 3) + (512 * 1024)
            : MAX_AUTH_FILE_SIZE + (256 * 1024);
        if (!contentLengthHeader || !Number.isFinite(contentLength) || contentLength <= 0) {
            return await parseError('PARSE_FAILED', 'The upload size could not be verified.', 411);
        }
        if (contentLength > absoluteMaxRequestBytes) {
            return await parseError('FILE_TOO_LARGE', 'File too large. Max 10MB.', 413);
        }

        // ── The rate limiter runs before anything expensive. ──
        //
        // guardApiRoute is the only thing metering unauthenticated callers, so
        // nothing above it may read the body or verify a token: an attacker
        // could otherwise force a full JSON parse of up to absoluteMaxRequestBytes
        // plus a verifyIdToken on every request, unthrottled.
        const guard = await guardApiRoute(req, { rateLimit: 5, rateLimitWindow: 60_000, allowAnonymous: true });
        if (guard.error) {
            // The guard rejected, but on the resumable path the client wrote the
            // resume to the bucket before ever calling this route — so a 429 used
            // to leave real PII there with nothing scheduled to remove it. Only
            // a credentialled caller can have created such an object
            // (storage.rules requires request.auth != null), which is what keeps
            // this off the anonymous flood path entirely.
            storageFile = await bindAbandonedStorageObject(req, contentType, guard.identity);
            await cleanupStorageUpload();
            return guard.error;
        }
        const isAnon = guard.user.uid.startsWith('anon:');

        // ── The anonymous-aware size bound, still ahead of the body read. ──
        //
        // absoluteMaxRequestBytes above is computed against MAX_AUTH_FILE_SIZE
        // because the caller was unknown; now that the guard has resolved one,
        // the tighter bound applies. It has to stay above `req.json()`: an
        // unauthenticated caller who gets past this gate can otherwise force a
        // 13.85MB JSON parse where 5.85MB was the ceiling before — a 2.4x
        // amplification per allowed request, and the anonymous JSON path is
        // reachable through the legacy base64 `fileData` branch below.
        //
        // Nothing is orphaned by returning here: the only requests that can
        // exceed this bound carry the file inline (base64 or multipart), and a
        // request that carries the file inline has nothing in Storage. The
        // storagePath JSON body is a few hundred bytes and can never trip it.
        const maxRequestBytes = contentType.includes('application/json')
            ? Math.ceil((isAnon ? MAX_DIRECT_FILE_SIZE : MAX_AUTH_FILE_SIZE) * 4 / 3) + (512 * 1024)
            : (isAnon ? MAX_DIRECT_FILE_SIZE : MAX_AUTH_FILE_SIZE) + (256 * 1024);
        if (contentLength > maxRequestBytes) {
            return await parseError('FILE_TOO_LARGE', isAnon ? 'File too large. Max 4MB before sign-in.' : 'File too large. Max 10MB.', 413);
        }

        // ── Bind the storage object BEFORE anything else that can return early. ──
        //
        // Every exit below this point that can follow a REAL upload — a bad
        // extension, an unreadable body, a failed download, an empty parse — has
        // to be able to delete what the client already uploaded. The identity
        // comes from the guard, which has already verified the token, so this
        // costs no second verification.
        //
        // ...but only for a caller who could have created one. storage.rules is
        // `request.auth != null`, so an anonymous caller has never written to
        // this bucket and binding for one is provably pointless. It is also not
        // free: `guard.user.uid` is `anon:<ip>` where the ip comes from
        // client-supplied `cf-connecting-ip`/`x-forwarded-for`, so a 45-byte
        // unauthenticated POST naming `resume_uploads/anon:<its own ip>/x` used
        // to bind here and then pay a Cloud Storage delete RPC on its way out
        // through the 400 below — one outbound round-trip per request, with the
        // same spoofable header keying the throttle bucket.
        //
        // The one exit this cannot cover is the `isAnon && body.storagePath`
        // 401 further down: there the caller DID upload something, and the
        // reason we cannot bind is that the uid we resolved is not the uid that
        // wrote it. See the note at that branch.
        let jsonBody: Record<string, any> | null = null;
        if (contentType.includes('application/json')) {
            jsonBody = await req.json().catch(() => null);
            if (!isAnon) {
                const claimedPath = typeof jsonBody?.storagePath === 'string' ? jsonBody.storagePath : '';
                if (claimedPath.startsWith(`resume_uploads/${guard.user.uid}/`) && !claimedPath.includes('..')) {
                    storageFile = getAdminStorage().bucket().file(claimedPath);
                }
            }
        }

        if (contentType.includes('application/json')) {
            const body = jsonBody;
            if (!body) {
                return await parseError('PARSE_FAILED', 'The upload could not be read.');
            }
            if (!body.fileName) {
                return await parseError('PARSE_FAILED', 'No file name provided.');
            }
            fileName = String(body.fileName).toLowerCase();
            if (!getExtension(fileName)) {
                return await parseError('UNSUPPORTED_TYPE', 'Unsupported file type. Please upload a PDF, Word, or TXT file.');
            }

            if (body.storagePath) {
                if (isAnon) {
                    // The one exit that CAN follow a real upload and still
                    // orphans it. Reaching here means the client wrote the
                    // object as a signed-in user and then presented no usable
                    // token — an expired one, or auth-fetch's silent downgrade —
                    // so `guard.user.uid` is `anon:<ip>` and cannot name the
                    // prefix the object sits under. Deleting on a uid we did not
                    // verify is not an option; that would be a cross-tenant
                    // delete keyed on a spoofable header.
                    //
                    // The client compensates: resolveAuthHeaders now refuses to
                    // build headers for a signed-in user whose token cannot be
                    // read (`requireToken`), so the resumable path fails before
                    // it ever gets here and abandons the object with a real
                    // credential. If it does get here anyway, this 401 is what
                    // tells the client to do that.
                    return await parseError('AUTH_REQUIRED', 'Sign in to upload resumes larger than 4MB.', 401);
                }
                const storagePath = String(body.storagePath);
                const expectedPrefix = `resume_uploads/${guard.user.uid}/`;
                if (!storagePath.startsWith(expectedPrefix) || storagePath.includes('..')) {
                    return await parseError('PARSE_FAILED', 'Invalid resume upload path.', 403);
                }
                // Already bound above against these same two conditions; the
                // fallback only keeps the non-null contract for the download.
                storageFile = storageFile ?? getAdminStorage().bucket().file(storagePath);
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
