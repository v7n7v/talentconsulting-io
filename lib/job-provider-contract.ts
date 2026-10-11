import { createHash } from 'node:crypto';
import type { JobSalary, JobWorkplaceType, ProviderOutcome } from './job-ingestion';

export type JobProvider = 'fantastic' | 'brightdata' | 'apify';
export const JOB_PROVIDERS: JobProvider[] = ['fantastic', 'brightdata', 'apify'];
export const PROVIDER_PAGE_SIZE = 20;
export const JOB_ORIGIN_HOSTS: Record<string, string[]> = {
  greenhouse: ['greenhouse.io'], lever: ['lever.co'], ashby: ['ashbyhq.com'],
  workday: ['myworkdayjobs.com', 'myworkdaysite.com'],
  linkedin: ['linkedin.com'], indeed: ['indeed.com'], glassdoor: ['glassdoor.com'],
};

/** Vendor identity never substitutes for the original publishing site. */
export interface ProviderJob {
  provider: JobProvider;
  providerJobId: string;
  origin: string;
  sourceJobId?: string;
  title: string;
  company: string;
  url: string;
  applyUrl?: string;
  description: string;
  descriptionTruncated?: boolean;
  locations: string[];
  country?: string;
  remoteMode: JobWorkplaceType;
  salary: JobSalary;
  employmentType: string;
  publishedAt?: string;
  updatedAt?: string;
  discoveredAt?: string;
  validThrough?: string;
  observedAt: string;
  firstSeenAt?: string;
  runId?: string;
  inferredFields: string[];
  closed?: boolean;
}

/** Opaque provider cursor includes remote run/dataset identity for async workers. */
export interface ProviderPage {
  jobs: ProviderJob[];
  closedIds: string[];
  nextCursor: string | null;
  complete: boolean;
  pending?: boolean;
  rejectedRows: number;
  status: ProviderOutcome;
  remoteRunId?: string;
}
export interface ProviderPageRequest {
  cursor: string | null;
  limit: number;
  now: string;
  fetchImpl: typeof fetch;
  knownIds?: string[];
}
export interface JobProviderAdapter {
  id: JobProvider;
  configured: boolean;
  /** Maximum HTTP calls for one step, checked by the worker before invoking. */
  requestsPerPage: number;
  nextPage(request: ProviderPageRequest): Promise<ProviderPage>;
}

export class JobProviderError extends Error {
  constructor(public status: number, public code = 'provider_unavailable') {
    super(code); this.name = 'JobProviderError';
  }
}
export function providerRecordId(provider: JobProvider, id: string): string {
  return createHash('sha256').update(`${provider}|${id}`).digest('hex');
}
export function text(value: unknown, max = 1000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function httpsUrl(value: unknown): string {
  const raw = text(value, 4000);
  try {
    const url = new URL(raw);
    const secret = [...url.searchParams.keys()].some(key => /^(?:token|api[_-]?key|auth|access[_-]?token)$/i.test(key));
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !secret ? url.href : '';
  } catch { return ''; }
}
export function originFromUrl(value: unknown): string {
  const valid = httpsUrl(value);
  if (!valid) return '';
  const host = new URL(valid).hostname.toLowerCase().replace(/\.$/, '');
  return Object.keys(JOB_ORIGIN_HOSTS).find(origin => JOB_ORIGIN_HOSTS[origin].some(allowed =>
    host === allowed || host.endsWith(`.${allowed}`))) || '';
}
export function plainJobText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, 300_000)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/?(?:p|div|li|br|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi, entity => ({
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ',
    }[entity.toLowerCase()] || ' '))
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, number: string) => {
      const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    })
    .replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

/** Fixed provider hosts and no redirects prevent credentials reaching arbitrary URLs. */
export async function providerJson(url: URL, init: RequestInit, fetchImpl: typeof fetch): Promise<{ body: unknown; response: Response }> {
  if (!['data.fantastic.jobs', 'api.brightdata.com', 'api.apify.com'].includes(url.hostname)
    || url.protocol !== 'https:' || url.username || url.password || url.port) throw new JobProviderError(0, 'invalid_provider_url');
  const response = await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new JobProviderError(response.status);
  const maxBytes = 8 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > maxBytes) throw new JobProviderError(0, 'response_too_large');
  const reader = response.body?.getReader();
  if (!reader && response.status === 202) return { body: null, response };
  if (!reader) throw new SyntaxError('provider_payload_missing');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new JobProviderError(0, 'response_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = Buffer.concat(chunks).toString('utf8');
  return { body: !body && response.status === 202 ? null : JSON.parse(body), response };
}
