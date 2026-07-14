import { createHash } from 'crypto';

export const COVER_LETTER_VALIDATOR_VERSION = '2026-07-10.2';

export interface CoverLetterGuardrailReport {
  validatorVersion: string;
  sourceResumeId: string;
  sourceResumeHash: string;
  targetJobTitle: string;
  targetCompany: string;
  targetHash: string;
  contentHash: string;
  evidenceCount: number;
  evidenceHashes: string[];
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeJobPacketLabel(value: unknown, maxLength = 120) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return null;
  if (/[\r\n\u0000-\u001f\u007f]/.test(value)) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function targetHash(jobTitle: string, company: string) {
  return hash(JSON.stringify({ company, jobTitle }));
}

function collectEvidence(resume: Record<string, any>) {
  const evidence: string[] = [];
  const summary = clean(resume.summary);
  if (summary) {
    evidence.push(...summary.split(/(?<=[.!?])\s+/).map(clean).filter(Boolean));
  }
  for (const experience of Array.isArray(resume.experience) ? resume.experience : []) {
    for (const key of ['bullets', 'achievements', 'responsibilities']) {
      if (Array.isArray(experience?.[key])) {
        evidence.push(...experience[key].map(clean).filter(Boolean));
      }
    }
  }
  return Array.from(new Set(evidence)).slice(0, 3);
}

export function buildTruthLockedCoverLetter(input: {
  resume: Record<string, any>;
  jobTitle: string;
  company: string;
  sourceResumeId: string;
  sourceResumeHash: string;
}) {
  const jobTitle = normalizeJobPacketLabel(input.jobTitle);
  const company = normalizeJobPacketLabel(input.company);
  if (!jobTitle || !company) throw new Error('Job title and company must be bounded single-line labels');
  const name = clean(input.resume.name) || 'Candidate';
  const evidence = collectEvidence(input.resume);
  if (evidence.length === 0) throw new Error('No verified resume evidence is available for the cover letter');
  const content = [
    'Dear Hiring Team,',
    '',
    'I am interested in the open role described in the attached posting. For your review, my resume documents:',
    '',
    ...evidence.map(item => `- ${item}`),
    '',
    'I would welcome a conversation about the role and how this documented experience may fit your needs.',
    '',
    'Sincerely,',
    name,
  ].join('\n');
  const report: CoverLetterGuardrailReport = {
    validatorVersion: COVER_LETTER_VALIDATOR_VERSION,
    sourceResumeId: input.sourceResumeId,
    sourceResumeHash: input.sourceResumeHash,
    targetJobTitle: jobTitle,
    targetCompany: company,
    targetHash: targetHash(jobTitle, company),
    contentHash: hash(content),
    evidenceCount: evidence.length,
    evidenceHashes: evidence.map(hash),
  };
  return { content, report };
}

export function isCurrentCoverLetterGuardrailReport(
  report: unknown,
  input: {
    content: unknown;
    sourceResumeId: unknown;
    sourceResumeHash: unknown;
    jobTitle: unknown;
    company: unknown;
  },
): report is CoverLetterGuardrailReport {
  if (!report || typeof report !== 'object' || typeof input.content !== 'string') return false;
  const value = report as Partial<CoverLetterGuardrailReport>;
  const jobTitle = normalizeJobPacketLabel(input.jobTitle);
  const company = normalizeJobPacketLabel(input.company);
  if (!jobTitle || !company) return false;
  return value.validatorVersion === COVER_LETTER_VALIDATOR_VERSION
    && value.sourceResumeId === input.sourceResumeId
    && value.sourceResumeHash === input.sourceResumeHash
    && value.targetJobTitle === jobTitle
    && value.targetCompany === company
    && value.targetHash === targetHash(jobTitle, company)
    && value.contentHash === hash(input.content)
    && Number.isInteger(value.evidenceCount)
    && value.evidenceCount! > 0
    && Array.isArray(value.evidenceHashes)
    && value.evidenceHashes.length === value.evidenceCount;
}
