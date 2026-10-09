/** Shared evidence contract for API ingestion. Missing facts stay unknown. */
export type JobWorkplaceType = 'remote' | 'hybrid' | 'onsite' | 'unknown';
export type SalaryInterval = 'year' | 'month' | 'week' | 'day' | 'hour' | 'unknown';
export interface JobSalary {
  min: number | null;
  max: number | null;
  currency: string;
  interval?: SalaryInterval;
  isPredicted?: boolean;
}
export interface JobIngestionEvidence {
  discoveredAt?: string;
  providerEvidence?: Array<{ provider: 'fantastic' | 'brightdata' | 'apify'; providerJobId: string; runId?: string }>;
  descriptionPreview?: string;
  locations?: string[];
  country?: string;
  remoteMode?: JobWorkplaceType;
  salary?: JobSalary;
  employmentType?: string;
  publishedAt?: string;
  updatedAt?: string;
  observedAt?: string;
  applyUrl?: string;
  sourceJobId?: string;
  ingestion?: {
    parserVersion: string;
    method: 'public_api' | 'service_api';
    descriptionTruncated: boolean;
    provider?: 'fantastic' | 'brightdata' | 'apify';
    providerJobId?: string;
    runId?: string;
    inferredFields?: string[];
  };
}
export type ProviderOutcome = 'success' | 'empty' | 'disabled' | 'timeout' | 'rate_limited' | 'malformed' | 'unavailable';
export interface ProviderDiagnostic {
  provider: string;
  status: ProviderOutcome;
  httpStatus?: number;
  rejectedRows?: number;
  partial?: boolean;
}

export function normalizeJobDate(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  if (value === '' || value === 0) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

export function normalizeEmploymentType(value: unknown): string {
  const raw = Array.isArray(value) ? value.join(', ') : typeof value === 'string' ? value.trim() : '';
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  const known: Record<string, string> = {
    fulltime: 'Full-time', parttime: 'Part-time', contract: 'Contract', contractor: 'Contract',
    intern: 'Internship', internship: 'Internship', temporary: 'Temporary', freelance: 'Freelance',
  };
  return known[key] || raw || 'Not listed';
}

export function normalizeWorkplaceType(value: unknown): JobWorkplaceType {
  const key = typeof value === 'string' ? value.toLowerCase().replace(/[^a-z]/g, '') : '';
  if (key === 'remote') return 'remote';
  if (key === 'hybrid') return 'hybrid';
  if (key === 'onsite' || key === 'office') return 'onsite';
  return 'unknown';
}

export function normalizeSalaryInterval(value: unknown): SalaryInterval {
  const key = typeof value === 'string' ? value.toLowerCase().replace(/[^a-z]/g, '') : '';
  if (['year', 'yearly', 'annual', 'annually', 'peryear'].includes(key)) return 'year';
  if (['month', 'monthly', 'permonth'].includes(key)) return 'month';
  if (['week', 'weekly', 'perweek'].includes(key)) return 'week';
  if (['day', 'daily', 'perday'].includes(key)) return 'day';
  if (['hour', 'hourly', 'perhour'].includes(key)) return 'hour';
  return 'unknown';
}

export function finiteSalary(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** USD annual targets cannot be compared to foreign currency or hourly rates. */
export function comparableAnnualSalary(salary: JobSalary): number | null {
  if (salary.isPredicted === true) return null;
  if (salary.currency?.toUpperCase() !== 'USD') return null;
  // Stored pre-contract records omitted interval and historically represented annual salaries.
  if (salary.interval && salary.interval !== 'year') return null;
  return finiteSalary(salary.max) ?? finiteSalary(salary.min);
}

export function classifyProviderFailure(error: unknown): ProviderOutcome {
  const err = error as { name?: string; status?: number };
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'timeout';
  if (err?.status === 429) return 'rate_limited';
  if (err?.name === 'SyntaxError' || err?.name === 'JobPayloadError') return 'malformed';
  return 'unavailable';
}
