'use client';

import { ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '@/lib/firebase';
import { authFetch } from '@/lib/auth-fetch';

export const RESUME_UPLOAD_LIMITS = {
  directBytes: 4 * 1024 * 1024,
  authenticatedBytes: 10 * 1024 * 1024,
  extractedTextChars: 50_000,
};

const VALID_RESUME_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt'];

export type ResumeUploadErrorCode =
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'AUTH_REQUIRED'
  | 'SCANNED_PDF'
  | 'PARSE_EMPTY'
  | 'PARSE_FAILED';

export class ResumeUploadError extends Error {
  code: ResumeUploadErrorCode;

  constructor(code: ResumeUploadErrorCode, message: string) {
    super(message);
    this.name = 'ResumeUploadError';
    this.code = code;
  }
}

export interface ResumeUploadResult {
  text: string;
  fileName: string;
  sourceType: 'direct' | 'storage';
  storagePath?: string;
  characterCount?: number;
  detectedType?: 'pdf' | 'docx' | 'doc' | 'txt';
  storagePathDeleted?: boolean;
}

export function validateResumeFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const ext = VALID_RESUME_EXTENSIONS.find(e => lowerName.endsWith(e));
  if (!ext) {
    throw new ResumeUploadError('UNSUPPORTED_TYPE', 'Please upload a PDF, Word, or TXT resume.');
  }
  if (file.size > RESUME_UPLOAD_LIMITS.authenticatedBytes) {
    throw new ResumeUploadError('FILE_TOO_LARGE', 'File is too large. Upload a resume under 10MB.');
  }
  return ext;
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-140);
}

async function parseResumeRequest(body: BodyInit, headers?: HeadersInit): Promise<ResumeUploadResult> {
  const res = await authFetch('/api/gauntlet/parse-resume', {
    method: 'POST',
    headers,
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new ResumeUploadError(data.code || 'PARSE_FAILED', data.message || data.error || 'Failed to parse resume.');
  }
  if (!data.text || data.text.trim().length < 20) {
    throw new ResumeUploadError('PARSE_EMPTY', 'Could not extract meaningful text from this resume.');
  }
  return data;
}

export async function uploadAndParseResume(file: File): Promise<ResumeUploadResult> {
  validateResumeFile(file);

  if (file.size <= RESUME_UPLOAD_LIMITS.directBytes) {
    const formData = new FormData();
    formData.append('file', file);
    return parseResumeRequest(formData);
  }

  const user = auth.currentUser;
  if (!user) {
    throw new ResumeUploadError(
      'AUTH_REQUIRED',
      'Sign in to upload resumes larger than 4MB, or use a smaller PDF/Word file.'
    );
  }

  const storagePath = `resume_uploads/${user.uid}/${Date.now()}_${safeFileName(file.name)}`;
  await uploadBytes(ref(storage, storagePath), file, {
    contentType: file.type || 'application/octet-stream',
    customMetadata: {
      originalName: file.name,
      uploadedBy: user.uid,
      purpose: 'resume_parse',
    },
  });

  return parseResumeRequest(
    JSON.stringify({ storagePath, fileName: file.name }),
    { 'Content-Type': 'application/json' }
  );
}
