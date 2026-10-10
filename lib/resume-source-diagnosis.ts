import type { ResumeReviewResume } from './resume-review-ledger';

export type ResumeData = ResumeReviewResume;

export interface ResumeSourceDiagnosisInput {
  resume: ResumeData | null;
  rawText?: string;
  warnings?: string[];
  error?: string | null;
  isProcessing?: boolean;
}

export interface ResumeSourceDiagnosis {
  status: 'processing' | 'failed' | 'parsed' | 'empty';
  statusLabel: string;
  message: string;
  roleCount: number;
  skillCount: number;
  missing: string[];
  warnings: string[];
  hasReadableText: boolean;
}

const hasText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export function deriveSourceDiagnosis({ resume, rawText, warnings = [], error, isProcessing = false }: ResumeSourceDiagnosisInput): ResumeSourceDiagnosis {
  const hasReadableText = hasText(rawText);
  const roleCount = Array.isArray(resume?.experience) ? resume.experience.length : 0;
  const skillCount = Array.isArray(resume?.skills)
    ? new Set(resume.skills.flatMap(group => Array.isArray(group.items) ? group.items : []).filter(hasText).map(skill => skill.trim().toLowerCase())).size
    : 0;
  const hasParsedContent = !!resume && (
    hasText(resume.name) || hasText(resume.title) || hasText(resume.email) || hasText(resume.phone) || roleCount > 0 ||
    (resume.education?.length ?? 0) > 0 || skillCount > 0 || hasText(resume.summary)
  );
  const missing: string[] = [];
  if (!hasText(resume?.name)) missing.push('Name');
  if (!hasText(resume?.email)) missing.push('Email');
  if (!hasText(resume?.phone)) missing.push('Phone');
  if (roleCount === 0) missing.push('Experience');
  if ((resume?.education?.length ?? 0) === 0) missing.push('Education');

  const status = isProcessing ? 'processing' : error ? 'failed' : hasParsedContent ? 'parsed' : 'empty';
  const message = status === 'processing'
    ? 'Reading the source and identifying resume details.'
    : status === 'failed'
      ? hasReadableText
        ? 'Text was extracted and is retained below. Automatic structuring could not finish; review or edit the extracted text, or retry with another file.'
        : 'The source could not be read. Try another file or paste the resume text.'
      : status === 'parsed'
        ? 'Resume details were identified. Review the fields and correct anything that needs attention.'
        : 'No resume details are available yet. Choose a file or paste the resume text.';

  return {
    status,
    statusLabel: status === 'processing' ? 'Processing' : status === 'failed' ? hasReadableText ? 'Text extracted; structuring unavailable' : 'Could not read source' : status === 'parsed' ? 'Details found' : 'Not available',
    message,
    roleCount,
    skillCount,
    missing: status === 'parsed' ? missing : [],
    warnings: [...warnings],
    hasReadableText,
  };
}
