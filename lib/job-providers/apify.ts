import { classifyProviderFailure, finiteSalary, normalizeEmploymentType, normalizeSalaryInterval, normalizeWorkplaceType } from '../job-ingestion';
import {
  originFromUrl, providerJson, record, text, httpsUrl, plainJobText,
  type JobProviderAdapter, type ProviderJob, type ProviderPage, type ProviderPageRequest,
} from '../job-provider-contract';

const BASE_URL = 'https://api.apify.com';
const ACTOR_ID = 'bebity~linkedin-jobs-scraper';
const PAGE_SIZE = 20;
const MAX_ITEMS = 500;
const MAX_DESCRIPTION = 100_000;

type Cursor =
  | { phase: 'poll'; runId: string; datasetId: string; cap: number }
  | { phase: 'dataset'; runId: string; datasetId: string; cap: number; offset: number };

function makePage(overrides: Partial<ProviderPage> = {}): ProviderPage {
  return { jobs: [], closedIds: [], nextCursor: null, complete: true, rejectedRows: 0, status: 'empty', ...overrides };
}

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(Math.floor(parsed), max) : fallback;
}
function dateValue(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value.trim())) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
function idValue(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return typeof value === 'string' && value.trim() && value.length <= 300 ? value.trim() : '';
}
function salaryNumber(value: unknown): number | null {
  if (typeof value === 'number') return finiteSalary(value);
  if (typeof value === 'string' && value.trim() && /^\d+(?:\.\d+)?$/.test(value.trim())) return finiteSalary(Number(value));
  return null;
}
function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  return undefined;
}
function salaryValue(row: Record<string, unknown>): { salary: ProviderJob['salary']; inferred: boolean } {
  const minRaw = pick(row, 'salaryMin', 'salary_min', 'minSalary');
  const maxRaw = pick(row, 'salaryMax', 'salary_max', 'maxSalary');
  const currency = text(pick(row, 'salaryCurrency', 'salary_currency', 'currency'), 12).toUpperCase();
  const interval = normalizeSalaryInterval(pick(row, 'salaryPeriod', 'salary_period', 'salaryInterval', 'salary_interval'));
  if (!currency) return { salary: { min: null, max: null, currency: '', interval: 'unknown' }, inferred: false };
  const source = text(pick(row, 'salarySource', 'salary_source'), 100).toLowerCase().replace(/[_ ]+/g, '-');
  const verified = ['employer', 'employer-provided', 'company-provided', 'employer-reported'].includes(source);
  const min = salaryNumber(minRaw);
  const max = salaryNumber(maxRaw);
  const inferred = (min !== null || max !== null) && !verified;
  return { salary: { min, max, currency, interval, ...(inferred ? { isPredicted: true } : {}) }, inferred };
}
function locations(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return [...new Set(items.map(item => text(typeof item === 'object' && item ? record(item).name ?? record(item).label : item, 250)).filter(Boolean))].slice(0, 20);
}
function encodeCursor(cursor: Cursor): string { return Buffer.from(JSON.stringify(cursor)).toString('base64url'); }
function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const parsed = record(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    const phase = parsed.phase;
    const runId = typeof parsed.runId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(parsed.runId) ? parsed.runId : '';
    const datasetId = typeof parsed.datasetId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(parsed.datasetId) ? parsed.datasetId : '';
    const cap = parsed.cap;
    if ((phase !== 'poll' && phase !== 'dataset') || !runId || !datasetId || !Number.isInteger(cap) || (cap as number) < 1 || (cap as number) > MAX_ITEMS) throw new Error('invalid_cursor');
    if (phase === 'poll') return { phase, runId, datasetId, cap: cap as number };
    const offset = parsed.offset;
    if (!Number.isInteger(offset) || (offset as number) < 0 || (offset as number) >= (cap as number)) throw new Error('invalid_cursor');
    return { phase, runId, datasetId, cap: cap as number, offset: offset as number };
  } catch { throw new SyntaxError('provider_cursor_malformed'); }
}
function safeId(value: unknown): string {
  const id = text(value, 100);
  return /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : '';
}
function numericHeader(response: Response, name: string): number | undefined {
  const raw = response.headers.get(name);
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** Map only the public LinkedIn job fields; recruiter/contact enrichment is intentionally ignored. */
export function mapApifyJob(row: unknown, observedAt: string): ProviderJob | null {
  const value = record(row);
  const rawUrl = pick(value, 'jobUrl', 'job_url', 'url', 'linkedinJobUrl');
  const safeUrl = httpsUrl(rawUrl);
  const origin = originFromUrl(safeUrl);
  const sourceJobId = idValue(pick(value, 'id', 'jobId', 'job_id', 'jobPostingId'));
  const title = text(pick(value, 'title', 'jobTitle', 'positionName'), 500);
  if (!safeUrl || origin !== 'linkedin' || !sourceJobId || !title) return null;
  const rawDescription = pick(value, 'description', 'descriptionHtml', 'description_html', 'descriptionText');
  const description = plainJobText(typeof rawDescription === 'string' ? rawDescription : '').slice(0, MAX_DESCRIPTION);
  const applyUrl = httpsUrl(pick(value, 'applyUrl', 'apply_url', 'applicationUrl'));
  const state = text(pick(value, 'jobState', 'job_state'), 40).toUpperCase();
  const closed = state === 'CLOSED';
  const publishedAt = dateValue(pick(value, 'publishedAt', 'postedAtTimestamp', 'postedAt', 'published_at'));
  const updatedAt = dateValue(pick(value, 'updatedAt', 'updated_at'));
  const discoveredAt = dateValue(pick(value, 'scrapedAt', 'scraped_at'));
  const country = text(record(value.locationParsed).country ?? pick(value, 'country'), 100);
  const mappedSalary = salaryValue(value);
  return {
    provider: 'apify', providerJobId: `linkedin:${sourceJobId}`, sourceJobId, origin,
    title, company: text(pick(value, 'companyName', 'company', 'company_name'), 300), url: safeUrl,
    ...(applyUrl ? { applyUrl } : {}), description,
    ...(typeof rawDescription === 'string' && rawDescription.length > MAX_DESCRIPTION ? { descriptionTruncated: true } : {}),
    locations: locations(pick(record(value.locationParsed), 'formatted') ?? pick(value, 'location', 'locations')),
    ...(country ? { country } : {}),
    remoteMode: normalizeWorkplaceType(pick(value, 'workType', 'workplaceType', 'remoteType')),
    salary: mappedSalary.salary, employmentType: normalizeEmploymentType(pick(value, 'contractType', 'employmentType', 'jobType')),
    ...(publishedAt ? { publishedAt } : {}), ...(updatedAt ? { updatedAt } : {}), ...(discoveredAt ? { discoveredAt } : {}),
    ...(dateValue(pick(value, 'validThrough', 'valid_through')) ? { validThrough: dateValue(pick(value, 'validThrough', 'valid_through')) } : {}),
    observedAt, inferredFields: mappedSalary.inferred && mappedSalary.salary.currency ? ['salary'] : [], ...(closed ? { closed: true } : {}),
  };
}

function configuredCost(value: string | undefined): number {
  if (!value) return 1;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 5 ? Math.round(parsed * 100) / 100 : 1;
}

export function createApifyAdapter(env: NodeJS.ProcessEnv = process.env): JobProviderAdapter {
  const enabled = env.APIFY_JOBS_ENABLED === 'true';
  const token = env.APIFY_API_TOKEN?.trim() || '';
  const query = env.JOB_INGEST_QUERY?.trim() || '';
  const location = env.JOB_INGEST_LOCATION?.trim() || '';
  const cap = positiveInt(env.JOB_INGEST_MAX_ITEMS, 100, MAX_ITEMS);
  const maxCost = configuredCost(env.APIFY_JOBS_MAX_COST_USD);
  const configError = enabled && (!token || !query || query.length > 200 || location.length > 200) ? 'configuration_invalid' : '';
  const configured = enabled && !configError;

  return {
    id: 'apify', configured, requestsPerPage: 1,
    async nextPage(request: ProviderPageRequest): Promise<ProviderPage> {
      if (!enabled) return makePage({ status: 'disabled' });
      if (!configured) return makePage({ status: 'malformed', rejectedRows: 1 });
      try {
        const cursor = decodeCursor(request.cursor);
        if (!cursor) {
          const runUrl = new URL(`/v2/actors/${ACTOR_ID}/runs`, BASE_URL);
          runUrl.searchParams.set('maxTotalChargeUsd', String(maxCost));
          runUrl.searchParams.set('timeout', '300');
          const actorInput: Record<string, unknown> = {
            titles: [query], rows: cap, companyProfile: false, enrichCompany: false,
          };
          if (location) actorInput.locations = [location];
          const { body } = await providerJson(runUrl, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(actorInput),
          }, request.fetchImpl);
          const root = record(body);
          const data = Object.keys(record(root.data)).length ? record(root.data) : root;
          const runId = safeId(data.id);
          const datasetId = safeId(data.defaultDatasetId ?? data.default_dataset_id);
          if (!runId || !datasetId) throw new SyntaxError('provider_run_identity_missing');
          const status = text(data.status, 40).toUpperCase();
          if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT' || status === 'TIMED_OUT') {
            return makePage({ status: 'unavailable', complete: false, remoteRunId: runId });
          }
          const nextCursor = encodeCursor({ phase: 'poll', runId, datasetId, cap });
          return makePage({ nextCursor, complete: false, pending: true, status: 'success', remoteRunId: runId });
        }

        if (cursor.phase === 'poll') {
          const runUrl = new URL(`/v2/actor-runs/${encodeURIComponent(cursor.runId)}`, BASE_URL);
          const { body } = await providerJson(runUrl, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, request.fetchImpl);
          const root = record(body);
          const data = Object.keys(record(root.data)).length ? record(root.data) : root;
          const status = text(data.status, 40).toUpperCase();
          if (status === 'READY' || status === 'RUNNING' || status === 'STARTING' || status === 'ABORTING' || status === 'TIMING-OUT') {
            return makePage({ nextCursor: request.cursor, complete: false, pending: true, status: 'success', remoteRunId: cursor.runId });
          }
          if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT' || status === 'TIMED_OUT') {
            return makePage({ nextCursor: null, complete: false, status: 'unavailable', remoteRunId: cursor.runId });
          }
          if (status !== 'SUCCEEDED') throw new SyntaxError('provider_run_status_invalid');
          const nextCursor = encodeCursor({ phase: 'dataset', runId: cursor.runId, datasetId: safeId(data.defaultDatasetId ?? data.default_dataset_id) || cursor.datasetId, cap: cursor.cap, offset: 0 });
          return makePage({ nextCursor, complete: false, status: 'success', remoteRunId: cursor.runId });
        }

        const pageSize = Number.isFinite(request.limit) && request.limit >= 1
          ? Math.min(PAGE_SIZE, Math.floor(request.limit), cursor.cap - cursor.offset) : 0;
        if (pageSize <= 0) return makePage({ complete: false, status: 'malformed', rejectedRows: 1, remoteRunId: cursor.runId });
        const itemsUrl = new URL(`/v2/datasets/${encodeURIComponent(cursor.datasetId)}/items`, BASE_URL);
        itemsUrl.searchParams.set('format', 'json');
        itemsUrl.searchParams.set('clean', 'true');
        itemsUrl.searchParams.set('offset', String(cursor.offset));
        itemsUrl.searchParams.set('limit', String(pageSize));
        itemsUrl.searchParams.set('desc', 'false');
        const { body, response } = await providerJson(itemsUrl, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, request.fetchImpl);
        if (!Array.isArray(body) || body.length > pageSize) throw new SyntaxError('provider_dataset_payload_malformed');
        const rows = body as unknown[];
        const jobs: ProviderJob[] = [];
        let rejectedRows = 0;
        for (const row of rows) {
          const mapped = mapApifyJob(row, request.now);
          if (mapped) jobs.push(mapped);
          else rejectedRows += 1;
        }
        const nextOffset = cursor.offset + rows.length;
        const total = numericHeader(response, 'x-apify-pagination-total');
        const overCap = total !== undefined && total > cursor.cap && nextOffset >= cursor.cap;
        const hasMore = nextOffset < cursor.cap && (rows.length === pageSize || (total !== undefined && nextOffset < total));
        const nextCursor = hasMore ? encodeCursor({ ...cursor, offset: nextOffset }) : null;
        if (overCap && total !== undefined) rejectedRows += total - cursor.cap;
        const status = overCap ? 'malformed' : rows.length > 0 && jobs.length === 0 ? 'malformed' : jobs.length ? 'success' : 'empty';
        return makePage({ jobs, rejectedRows, nextCursor, complete: !nextCursor && !overCap, status, remoteRunId: cursor.runId });
      } catch (error) {
        return makePage({ status: classifyProviderFailure(error), nextCursor: request.cursor, complete: false, rejectedRows: error instanceof SyntaxError ? 1 : 0 });
      }
    },
  };
}
