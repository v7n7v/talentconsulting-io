'use client';

/**
 * Resume upload — the compatibility surface over lib/upload.
 *
 * Every symbol this module ever exported still exports from here with the same
 * shape, so the existing call sites and `instanceof ResumeUploadError` keep
 * working while they migrate to `useFileUpload` one at a time.
 *
 * What changed underneath: `uploadBytes` (non-resumable, no byte events) is
 * gone. Transfers now emit real progress, and the resumable path can actually
 * pause. See lib/upload/upload-transport.ts.
 */

import {
  AUTHENTICATED_MAX_BYTES,
  DIRECT_UPLOAD_MAX_BYTES,
  EXTRACTED_TEXT_CHAR_LIMIT,
  FileUploadError,
  RESUME_ACCEPT,
  checkFileAgainstAccept,
} from '@/lib/upload/file-upload-types';
import { startResumeUpload } from '@/lib/upload/upload-transport';
import type { ResumeUploadResult } from '@/lib/upload/upload-transport';

export const RESUME_UPLOAD_LIMITS = {
  directBytes: DIRECT_UPLOAD_MAX_BYTES,
  authenticatedBytes: AUTHENTICATED_MAX_BYTES,
  extractedTextChars: EXTRACTED_TEXT_CHAR_LIMIT,
};

/**
 * Widened from the original six codes: RATE_LIMITED and NETWORK were being
 * flattened into PARSE_FAILED, which is how "you uploaded too fast" reached
 * the user as "we could not read your resume".
 */
export type { UploadErrorCode as ResumeUploadErrorCode } from '@/lib/upload/file-upload-types';

/**
 * Same class object as FileUploadError, exported under its original name so
 * `error instanceof ResumeUploadError` at the existing call sites still holds.
 */
export { FileUploadError as ResumeUploadError } from '@/lib/upload/file-upload-types';

export type { ResumeUploadResult } from '@/lib/upload/upload-transport';
export type {
  ResumeUploadHandle,
  StartResumeUploadOptions,
} from '@/lib/upload/upload-transport';
export { startResumeUpload } from '@/lib/upload/upload-transport';

/** Synchronous extension + size check. Throws, as it always did. */
export function validateResumeFile(file: File) {
  const check = checkFileAgainstAccept(file, RESUME_ACCEPT, RESUME_UPLOAD_LIMITS.authenticatedBytes);
  if (!check.ok) {
    throw new FileUploadError(
      check.code,
      check.code === 'UNSUPPORTED_TYPE'
        ? 'Please upload a PDF, Word, or TXT resume.'
        : check.message,
    );
  }
  return check.extension;
}

/**
 * Preserved wrapper: upload, parse, resolve with the text.
 *
 * Callers that want progress, pause or cancel should use `useFileUpload` (or
 * `startResumeUpload` outside React) — a promise has nowhere to put a byte
 * count, which is how the fabricated progress bar happened in the first place.
 */
export async function uploadAndParseResume(file: File): Promise<ResumeUploadResult> {
  validateResumeFile(file);
  return startResumeUpload(file).promise;
}
