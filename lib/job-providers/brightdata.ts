import { classifyProviderFailure, finiteSalary, normalizeEmploymentType, normalizeSalaryInterval, normalizeWorkplaceType } from '../job-ingestion';
import {
  originFromUrl, providerJson, record, text, httpsUrl, plainJobText,
  type JobProviderAdapter, type ProviderJob, type ProviderPage, type ProviderPageRequest,
} from '../job-provider-contract';

const BASE_URL = 'https://api.brightdata.com';
const MAX_ITEMS = 500;
const MAX_DESCRIPTION = 100_000;
const ALLOWED_ORIGINS = new Set(['linkedin', 'indeed', 'glassdoor']);
type InputRecord = Record<string, unknown>;
type Cursor = { phase: 'poll' | 'download'; snapshotId: string; limit: number };

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

function rowSalary(row: Record<string, unknown>): { salary: ProviderJob['salary']; inferred: boolean } {
  const nested = record(row.salary);
  const minRaw = pick(row, 'salary_min', 'salaryMin', 'min_salary', 'minSalary') ?? pick(nested, 'min', 'minValue');
  const maxRaw = pick(row, 'salary_max', 'salaryMax', 'max_salary', 'maxSalary') ?? pick(nested, 'max', 'maxValue');
  const currency = text(pick(row, 'salary_currency', 'salaryCurrency', 'currency') ?? nested.currency, 12).toUpperCase();
  const intervalRaw = pick(row, 'salary_period', 'salaryPeriod', 'salary_interval', 'salaryInterval', 'salary_unit', 'salaryUnit')
    ?? nested.interval ?? nested.period ?? nested.unit;
  const interval = normalizeSalaryInterval(intervalRaw);
  if (!currency) return { salary: { min: null, max: null, currency: '', interval: 'unknown' }, inferred: false };
  const salarySource = text(pick(row, 'salary_source', 'salarySource'), 100).toLowerCase().replace(/[_ ]+/g, '-');
  const verified = ['employer', 'employer-provided', 'company-provided', 'employer-reported'].includes(salarySource);
  const min = salaryNumber(minRaw);
  const max = salaryNumber(maxRaw);
  const inferred = (min !== null || max !== null) && !verified;
  return { salary: { min, max, currency, interval, ...(inferred ? { isPredicted: true } : {}) }, inferred };
}

function stringList(value: unknown): string[] {
  const candidates = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;,]/) : [];
  return [...new Set(candidates.map(item => text(typeof item === 'object' && item ? record(item).name ?? record(item).label : item, 250)).filter(Boolean))].slice(0, 20);
}

function parseInputJson(raw: string | undefined, maxItems: number): { inputs: InputRecord[]; error?: string } {
  if (!raw?.trim()) return { inputs: [], error: 'missing_input' };
  if (raw.length > 500_000) return { inputs: [], error: 'input_too_large' };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > maxItems || parsed.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
      return { inputs: [], error: 'input_shape_invalid' };
    }
    const inputs: InputRecord[] = [];
    for (const item of parsed) {
      const validated = validateUrlFields(item as InputRecord);
      if (!validated.ok || !validated.foundUrl) return { inputs: [], error: 'input_url_invalid' };
      inputs.push(validated.value);
    }
    return { inputs };
  } catch {
    return { inputs: [], error: 'input_json_invalid' };
  }
}

function validateUrlFields(input: InputRecord): { ok: boolean; foundUrl: boolean; value: InputRecord } {
  let foundUrl = false;
  const visit = (value: unknown, key = ''): { ok: boolean; value: unknown } => {
    if (Array.isArray(value)) {
      const output: unknown[] = [];
      for (const item of value) {
        const result = visit(item, key);
        if (!result.ok) return { ok: false, value: null };
        output.push(result.value);
      }
      return { ok: true, value: output };
    }
    if (value && typeof value === 'object') {
      const output: Record<string, unknown> = {};
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
        const result = visit(child, childKey);
        if (!result.ok) return { ok: false, value: null };
        output[childKey] = result.value;
      }
      return { ok: true, value: output };
    }
    if (/url/i.test(key)) {
      if (typeof value !== 'string') return { ok: false, value: null };
      const safe = httpsUrl(value);
      const origin = originFromUrl(safe);
      if (!safe || !ALLOWED_ORIGINS.has(origin)) return { ok: false, value: null };
      const parsed = new URL(safe);
      if ([...parsed.searchParams.keys()].some(name => /^(?:token|api[_-]?key|auth|access[_-]?token)$/i.test(name))) return { ok: false, value: null };
      foundUrl = true;
      return { ok: true, value: safe };
    }
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
      const safe = httpsUrl(value);
      if (!safe || !ALLOWED_ORIGINS.has(originFromUrl(safe))) return { ok: false, value: null };
      return { ok: true, value: safe };
    }
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return { ok: true, value };
    return { ok: false, value: null };
  };
  const result = visit(input);
  return { ok: result.ok, foundUrl, value: result.value as InputRecord };
}

function encodeCursor(cursor: Cursor): string { return Buffer.from(JSON.stringify(cursor)).toString('base64url'); }
function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const parsed = record(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    const phase = parsed.phase;
    const snapshotId = typeof parsed.snapshotId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(parsed.snapshotId) ? parsed.snapshotId : '';
    const limit = parsed.limit;
    if ((phase !== 'poll' && phase !== 'download') || !snapshotId || !Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_ITEMS) throw new Error('invalid_cursor');
    return { phase, snapshotId, limit: limit as number };
  } catch { throw new SyntaxError('provider_cursor_malformed'); }
}

function snapshotId(body: unknown): string {
  const value = record(body);
  const id = text(value.snapshot_id ?? value.snapshotId ?? value.id, 200);
  return /^[A-Za-z0-9_-]{1,200}$/.test(id) ? id : '';
}

/** Map only explicit source fields; salary and dates remain unknown unless their units are explicit. */
export function mapBrightDataJob(row: unknown, observedAt: string): ProviderJob | null {
  const value = record(row);
  const rawUrl = pick(value, 'url', 'job_url', 'jobUrl', 'job_link', 'job_posting_url');
  const safeUrl = httpsUrl(rawUrl);
  const origin = originFromUrl(safeUrl);
  const sourceJobId = idValue(pick(value, 'job_posting_id', 'jobid', 'job_id', 'jobId', 'id'));
  const title = text(pick(value, 'job_title', 'title'), 500);
  if (!safeUrl || !ALLOWED_ORIGINS.has(origin) || !sourceJobId || !title) return null;
  const fullDescription = pick(value, 'job_description_formatted', 'description_text', 'description', 'job_description', 'description_html');
  const summaryDescription = pick(value, 'job_summary', 'summary');
  const rawDescription = fullDescription ?? summaryDescription;
  const description = plainJobText(typeof rawDescription === 'string' ? rawDescription : '').slice(0, MAX_DESCRIPTION);
  const locations = stringList(pick(value, 'job_location', 'location', 'locations', 'location_name'));
  const company = text(pick(value, 'company_name', 'company', 'employer_name'), 300);
  const publishedAt = dateValue(pick(value, 'job_posted_date', 'job_posted_time', 'date_posted_parsed', 'date_posted', 'posted_date', 'postedAt', 'publishedAt'));
  const updatedAt = dateValue(pick(value, 'updated_at', 'updatedAt', 'date_updated'));
  const discoveredAt = dateValue(pick(value, 'scraped_at', 'scrapedAt', 'collected_at', 'collectedAt'));
  const status = text(pick(value, 'job_state', 'jobState', 'status'), 40).toUpperCase();
  const availability = text(pick(value, 'application_availability', 'applicationAvailability'), 100).toLowerCase().replace(/[_-]+/g, ' ').trim();
  const closed = value.is_closed === true || value.isClosed === true || status === 'CLOSED'
    || ['closed', 'no longer accepting applications', 'not accepting applications'].includes(availability);
  const applyUrl = httpsUrl(pick(value, 'apply_link', 'apply_url', 'applyUrl', 'application_url', 'applicationUrl'));
  const mappedSalary = rowSalary(value);
  const country = text(pick(value, 'country', 'country_code', 'countryCode'), 100);
  const remoteMode = normalizeWorkplaceType(pick(value, 'remote_type', 'remoteType', 'workplace_type', 'workplaceType'));
  return {
    provider: 'brightdata', providerJobId: `${origin}:${sourceJobId}`, sourceJobId, origin,
    title, company, url: safeUrl,
    ...(applyUrl ? { applyUrl } : {}),
    description, ...((typeof rawDescription === 'string' && rawDescription.length > MAX_DESCRIPTION) || (fullDescription === undefined && summaryDescription !== undefined) ? { descriptionTruncated: true } : {}),
    locations, ...(country ? { country } : {}), remoteMode, salary: mappedSalary.salary,
    employmentType: normalizeEmploymentType(pick(value, 'job_type', 'jobType', 'employment_type', 'employmentType')),
    ...(publishedAt ? { publishedAt } : {}), ...(updatedAt ? { updatedAt } : {}), ...(discoveredAt ? { discoveredAt } : {}),
    ...(dateValue(pick(value, 'valid_through', 'validThrough')) ? { validThrough: dateValue(pick(value, 'valid_through', 'validThrough')) } : {}),
    observedAt, inferredFields: mappedSalary.inferred && mappedSalary.salary.currency ? ['salary'] : [], ...(closed ? { closed: true } : {}),
  };
}

function requestLimit(value: number, configured: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), configured, MAX_ITEMS);
}

export function createBrightDataAdapter(env: NodeJS.ProcessEnv = process.env): JobProviderAdapter {
  const enabled = env.BRIGHT_DATA_JOBS_ENABLED === 'true';
  const apiKey = env.BRIGHT_DATA_API_KEY?.trim() || '';
  const datasetId = env.BRIGHT_DATA_JOBS_DATASET_ID?.trim() || '';
  const maxItems = positiveInt(env.JOB_INGEST_MAX_ITEMS, 100, MAX_ITEMS);
  const parsedInputs = parseInputJson(env.BRIGHT_DATA_JOBS_INPUT_JSON, maxItems);
  const configError = enabled && (!apiKey || !datasetId || !/^[A-Za-z0-9_-]{1,100}$/.test(datasetId) || parsedInputs.error)
    ? parsedInputs.error || 'configuration_invalid' : '';
  const configured = enabled && !configError;

  return {
    id: 'brightdata', configured, requestsPerPage: 1,
    async nextPage(request: ProviderPageRequest): Promise<ProviderPage> {
      if (!enabled) return makePage({ status: 'disabled' });
      if (!configured) return makePage({ status: 'malformed', rejectedRows: 1 });
      try {
        const cursor = decodeCursor(request.cursor);
        const wanted = cursor?.limit ?? requestLimit(request.limit, maxItems);
        if (!wanted) return makePage({ status: 'malformed', complete: false, rejectedRows: 1, nextCursor: request.cursor });
        if (!cursor) {
          if (parsedInputs.inputs.length > wanted) return makePage({ status: 'malformed', complete: false, rejectedRows: parsedInputs.inputs.length });
          const url = new URL('/datasets/v3/trigger', BASE_URL);
          url.searchParams.set('dataset_id', datasetId);
          url.searchParams.set('format', 'json');
          url.searchParams.set('uncompressed_webhook', 'true');
          const perInput = Math.floor(wanted / parsedInputs.inputs.length);
          if (perInput < 1) return makePage({ status: 'malformed', complete: false, rejectedRows: parsedInputs.inputs.length });
          const { body } = await providerJson(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: parsedInputs.inputs, limit_per_input: perInput }),
          }, request.fetchImpl);
          const id = snapshotId(body);
          if (!id) throw new SyntaxError('provider_snapshot_id_missing');
          const nextCursor = encodeCursor({ phase: 'poll', snapshotId: id, limit: wanted });
          return makePage({ nextCursor, complete: false, pending: true, status: 'success' });
        }

        if (cursor.phase === 'poll') {
          const url = new URL(`/datasets/v3/progress/${encodeURIComponent(cursor.snapshotId)}`, BASE_URL);
          const { body } = await providerJson(url, { method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } }, request.fetchImpl);
          const status = text(record(body).status, 40).toLowerCase();
          if (status === 'starting' || status === 'running' || status === 'pending' || status === 'processing') {
            return makePage({ nextCursor: request.cursor, complete: false, pending: true, status: 'success' });
          }
          if (status === 'failed' || status === 'canceled' || status === 'cancelled') return makePage({ nextCursor: null, complete: false, status: 'unavailable', remoteRunId: cursor.snapshotId });
          if (status !== 'ready' && status !== 'completed' && status !== 'done') throw new SyntaxError('provider_progress_status_invalid');
          return makePage({ nextCursor: encodeCursor({ ...cursor, phase: 'download' }), complete: false, status: 'success', remoteRunId: cursor.snapshotId });
        }

        const url = new URL(`/datasets/v3/snapshot/${encodeURIComponent(cursor.snapshotId)}`, BASE_URL);
        url.searchParams.set('format', 'json');
        const { body, response } = await providerJson(url, { method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } }, request.fetchImpl);
        if (response.status === 202) return makePage({ nextCursor: request.cursor, complete: false, pending: true, status: 'success', remoteRunId: cursor.snapshotId });
        if (!Array.isArray(body)) throw new SyntaxError('provider_snapshot_payload_malformed');
        const rows = body as unknown[];
        const effectiveLimit = Math.min(wanted, requestLimit(request.limit, maxItems));
        if (!effectiveLimit) return makePage({ nextCursor: request.cursor, complete: false, status: 'malformed', rejectedRows: 1, remoteRunId: cursor.snapshotId });
        const excess = Math.max(0, rows.length - effectiveLimit);
        const bounded = rows.slice(0, effectiveLimit);
        const jobs: ProviderJob[] = [];
        let rejectedRows = excess;
        for (const row of bounded) {
          const mapped = mapBrightDataJob(row, request.now);
          if (mapped) jobs.push(mapped);
          else rejectedRows += 1;
        }
        const status = excess ? 'malformed' : rows.length > 0 && jobs.length === 0 ? 'malformed' : jobs.length ? 'success' : 'empty';
        return makePage({ jobs, rejectedRows, complete: excess === 0, status, remoteRunId: cursor.snapshotId });
      } catch (error) {
        return makePage({ status: classifyProviderFailure(error), nextCursor: request.cursor, complete: false, rejectedRows: error instanceof SyntaxError ? 1 : 0 });
      }
    },
  };
}
