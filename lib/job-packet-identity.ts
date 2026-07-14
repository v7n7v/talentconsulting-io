import crypto from 'crypto';

export interface JobPacketIdentityInput {
  jobId: unknown;
  jobTitle: unknown;
  company: unknown;
  jobUrl: unknown;
  canonicalUrl: unknown;
  sourceName: unknown;
  jobDescription: unknown;
}

export function getJobPacketIdentity(input: JobPacketIdentityInput) {
  const clean = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
  const normalizeUrl = (value: unknown) => {
    const raw = clean(value);
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, '').toLowerCase()}`;
    } catch {
      return raw;
    }
  };
  const sourceUrl = normalizeUrl(input.canonicalUrl) || normalizeUrl(input.jobUrl);
  const sourceLocator = sourceUrl || [clean(input.sourceName), clean(input.jobId)].filter(Boolean).join(':');
  const fallbackDescription = sourceLocator
    ? ''
    : crypto.createHash('sha256').update(clean(input.jobDescription)).digest('hex').slice(0, 16);
  const identitySource = [
    clean(input.company),
    clean(input.jobTitle),
    sourceLocator,
    fallbackDescription,
  ].join('|');
  const identityHash = crypto.createHash('sha256').update(identitySource).digest('hex');
  const readable = `${clean(input.company)}-${clean(input.jobTitle)}`
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 56);

  return {
    documentId: `apply_pipeline_${readable || 'job'}_${identityHash.slice(0, 20)}`,
    identityHash,
  };
}

export function getLegacyJobPacketDocumentId(jobId: unknown): string | null {
  const raw = typeof jobId === 'string' ? jobId.trim() : '';
  if (!raw) return null;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (Math.imul(31, hash) + raw.charCodeAt(index)) | 0;
  }
  const readable = raw
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);
  return `apply_pipeline_${readable || 'job'}_${(hash >>> 0).toString(36)}`;
}

export function legacyJobPacketMatches(
  data: { company_name?: unknown; job_title?: unknown; application_link?: unknown },
  input: { company: unknown; jobTitle: unknown; jobUrl: unknown },
) {
  const clean = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
  const normalizeUrl = (value: unknown) => {
    const raw = clean(value);
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, '').toLowerCase()}`;
    } catch {
      return raw;
    }
  };
  const storedUrl = normalizeUrl(data.application_link);
  const requestedUrl = normalizeUrl(input.jobUrl);
  return clean(data.company_name) === clean(input.company)
    && clean(data.job_title) === clean(input.jobTitle)
    && (!storedUrl || storedUrl === requestedUrl);
}
