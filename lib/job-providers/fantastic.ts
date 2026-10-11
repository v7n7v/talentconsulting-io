import { classifyProviderFailure, finiteSalary, normalizeEmploymentType, normalizeJobDate, normalizeSalaryInterval } from '../job-ingestion';
import {
  JobProviderError, originFromUrl, plainJobText, providerJson, record, text,
  type JobProviderAdapter, type ProviderJob, type ProviderPage, type ProviderPageRequest,
} from '../job-provider-contract';

const BASE_URL = 'https://data.fantastic.jobs';
const PAGE_SIZE = 20;
const MAX_DESCRIPTION = 100_000;
const MAX_KNOWN_IDS = 500;
const DEFAULT_SOURCES = ['greenhouse', 'lever.co', 'ashby', 'workday'];
const SOURCE_ORIGIN: Record<string, string> = {
  greenhouse: 'greenhouse', lever: 'lever', 'lever.co': 'lever', ashby: 'ashby', workday: 'workday',
};

function pageLimit(limit: number): number {
  return Number.isFinite(limit) ? Math.min(PAGE_SIZE, Math.max(1, Math.floor(limit))) : PAGE_SIZE;
}

type Cursor =
  | { phase: 'active'; since: string; until: string; lastId: string; title: string; location: string }
  | { phase: 'expired'; since: string; until: string; ids?: string[]; title: string; location: string };

function isoDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.trim())) return undefined;
  return normalizeJobDate(value) || undefined;
}

function sourceName(value: unknown): string {
  const key = text(value, 80).toLowerCase();
  return SOURCE_ORIGIN[key] ? key : '';
}

function numericId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return typeof value === 'string' && /^\d+$/.test(value) ? value : undefined;
}

function sourceIdFromUrl(value: string, origin: string): string | undefined {
  const url = new URL(value);
  const path = url.pathname.split('/').filter(Boolean);
  if (origin === 'greenhouse') {
    const jobsAt = path.lastIndexOf('jobs');
    const id = jobsAt >= 0 ? path[jobsAt + 1] : '';
    return /^\d+$/.test(id) ? id : undefined;
  }
  if (origin === 'lever') {
    const id = path.at(-1) || '';
    return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id) ? id : undefined;
  }
  if (origin === 'ashby') {
    const id = path.at(-1) || '';
    return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id) ? id : undefined;
  }
  if (origin === 'workday') {
    const id = path.at(-1) || '';
    return /^(?:R\d+|\d{5,})$/i.test(id) ? id : undefined;
  }
  return undefined;
}

function locationEntries(value: unknown): { locations: string[]; country?: string } {
  if (!Array.isArray(value)) return { locations: [] };
  const locations: string[] = [];
  let country: string | undefined;
  for (const item of value) {
    const address = record(record(item).address);
    const parts = [address.addressLocality, address.addressRegion, address.addressCountry, address.postalCode]
      .map(part => text(typeof part === 'object' && part ? record(part).name : part, 160))
      .filter(Boolean);
    if (parts.length) locations.push([...new Set(parts)].join(', '));
    if (!country && address.addressCountry) {
      country = text(typeof address.addressCountry === 'object' ? record(address.addressCountry).name : address.addressCountry, 100) || undefined;
    }
  }
  return { locations: [...new Set(locations)].slice(0, 20), country };
}

function sourceSalary(value: unknown): ProviderJob['salary'] {
  const salary = record(value);
  const salaryValue = record(salary.value);
  const min = finiteSalary(salaryValue.minValue ?? salary.minValue ?? (typeof salary.value === 'number' ? salary.value : null));
  const max = finiteSalary(salaryValue.maxValue ?? salary.maxValue ?? (typeof salary.value === 'number' ? salary.value : null));
  return {
    min,
    max,
    currency: text(salary.currency, 12).toUpperCase(),
    interval: normalizeSalaryInterval(salaryValue.unitText ?? salary.unitText),
  };
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    const phase = parsed.phase;
    const since = isoDate(parsed.since);
    const until = isoDate(parsed.until);
    const title = typeof parsed.title === 'string' && parsed.title.length <= 200 ? parsed.title : '';
    const location = typeof parsed.location === 'string' && parsed.location.length <= 200 ? parsed.location : '';
    if (!since || !until || (phase !== 'active' && phase !== 'expired')) throw new Error('invalid cursor');
    if (phase === 'active') {
      const lastId = parsed.lastId === undefined ? '0' : String(parsed.lastId);
      if (!/^\d+$/.test(lastId)) throw new Error('invalid cursor');
      return { phase, since, until, lastId, title, location };
    }
    if (parsed.ids !== undefined && (!Array.isArray(parsed.ids) || parsed.ids.length > MAX_KNOWN_IDS
      || parsed.ids.some(id => typeof id !== 'string' || !/^\d+$/.test(id)))) throw new Error('invalid cursor');
    return { phase, since, until, ...(Array.isArray(parsed.ids) ? { ids: parsed.ids as string[] } : {}), title, location };
  } catch {
    throw new SyntaxError('provider_cursor_malformed');
  }
}

function makePage(overrides: Partial<ProviderPage> = {}): ProviderPage {
  return {
    jobs: [], closedIds: [], nextCursor: null, complete: true, rejectedRows: 0, status: 'empty', ...overrides,
  };
}

/** Map only source-backed ATS facts. AI-enriched fields are recorded as inferred, never used as facts. */
export function mapFantasticJob(row: unknown, observedAt: string): ProviderJob | null {
  const value = record(row);
  const id = numericId(value.id) || '';
  const title = text(value.title, 500);
  const url = text(value.url, 4000);
  const origin = originFromUrl(url);
  const source = sourceName(value.source);
  if (!id || !title || !url || !origin || !source || SOURCE_ORIGIN[source] !== origin) return null;

  const safeUrl = new URL(url);
  if (safeUrl.protocol !== 'https:' || safeUrl.username || safeUrl.password || safeUrl.port) return null;
  const rawDescription = typeof value.description_text === 'string'
    ? value.description_text.trim()
    : typeof value.description_html === 'string' ? plainJobText(value.description_html) : '';
  const description = rawDescription.slice(0, MAX_DESCRIPTION);
  const locs = locationEntries(value.locations);
  const remoteMode = text(value.location_type, 80).toUpperCase() === 'TELECOMMUTE' ? 'remote' : 'unknown';
  const inferredFields = Object.keys(value).filter(key => key.startsWith('ai_') || key.endsWith('_derived')).sort().slice(0, 50);
  const applyUrl = typeof value.apply_url === 'string' ? text(value.apply_url, 4000) : '';
  const validApplyUrl = applyUrl && originFromUrl(applyUrl) ? applyUrl : undefined;
  const publishedAt = isoDate(value.date_posted);
  const updatedAt = isoDate(value.date_modified);
  const discoveredAt = isoDate(value.date_created);

  return {
    provider: 'fantastic',
    providerJobId: id,
    origin,
    sourceJobId: sourceIdFromUrl(safeUrl.href, origin),
    title,
    company: text(value.organization, 300) || 'Unknown company',
    url: safeUrl.href,
    ...(validApplyUrl ? { applyUrl: validApplyUrl } : {}),
    description,
    ...(rawDescription.length > MAX_DESCRIPTION ? { descriptionTruncated: true } : {}),
    locations: locs.locations,
    ...(locs.country ? { country: locs.country } : {}),
    remoteMode,
    salary: sourceSalary(value.salary),
    employmentType: normalizeEmploymentType(value.employment_type),
    ...(publishedAt ? { publishedAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(discoveredAt ? { discoveredAt } : {}),
    ...(isoDate(value.date_valid_through) ? { validThrough: isoDate(value.date_valid_through) } : {}),
    observedAt,
    inferredFields,
  };
}

function knownProviderIds(request: ProviderPageRequest & { knownIds?: string[] }): Set<string> {
  const ids = request.knownIds ?? [];
  if (!Array.isArray(ids) || ids.length > MAX_KNOWN_IDS || ids.some(id => typeof id !== 'string' || !/^\d+$/.test(id))) {
    throw new SyntaxError('provider_known_ids_malformed');
  }
  return new Set(ids);
}

function configuredSources(env: NodeJS.ProcessEnv): string[] {
  const raw = env.FANTASTIC_JOBS_SOURCES || '';
  const configured = raw.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const sources = configured.length ? configured : DEFAULT_SOURCES;
  return [...new Set(sources.filter(source => SOURCE_ORIGIN[source]))];
}

export function createFantasticAdapter(env: NodeJS.ProcessEnv = process.env): JobProviderAdapter {
  const apiKey = env.FANTASTIC_JOBS_API_KEY?.trim() || '';
  const sources = configuredSources(env);
  const configured = env.FANTASTIC_JOBS_ENABLED === 'true' && Boolean(apiKey) && sources.length > 0;

  return {
    id: 'fantastic', configured,
    requestsPerPage: 1,
    async nextPage(request: ProviderPageRequest): Promise<ProviderPage> {
      if (!configured) return makePage({ status: 'disabled' });
      try {
        const cursor = decodeCursor(request.cursor);
        const window: Cursor = cursor || (() => {
          const untilTime = new Date(request.now);
          if (!Number.isFinite(untilTime.getTime())) throw new SyntaxError('provider_request_time_malformed');
          return {
            phase: 'active' as const,
            until: untilTime.toISOString(),
            since: new Date(untilTime.getTime() - 24 * 60 * 60 * 1000).toISOString(),
            lastId: '0',
            title: text(env.JOB_INGEST_QUERY, 200),
            location: text(env.JOB_INGEST_LOCATION, 200),
          };
        })();

        if (window.phase === 'expired' && window.ids !== undefined) {
          const batch = window.ids.slice(0, pageLimit(request.limit));
          const remaining = window.ids.slice(batch.length);
          const nextCursor = remaining.length ? encodeCursor({ ...window, ids: remaining }) : null;
          return makePage({
            closedIds: batch, nextCursor, complete: !nextCursor,
            status: batch.length ? 'success' : 'empty',
          });
        }

        const known = window.phase === 'expired' ? knownProviderIds(request) : null;

        const url = new URL(window.phase === 'active' ? '/v1/active-ats' : '/v1/expired-ats', BASE_URL);
        url.searchParams.set('time_frame', window.phase === 'active' ? '7d' : '1m');
        if (window.phase === 'active') {
          url.searchParams.set('description_format', 'text');
          url.searchParams.set('limit', String(pageLimit(request.limit)));
          url.searchParams.set('date_created_gte', window.since);
          url.searchParams.set('date_created_lt', window.until);
          if (window.title) url.searchParams.set('title', window.title);
          if (window.location) url.searchParams.set('location', window.location);
          if (sources.length) url.searchParams.set('source', sources.map(source => source === 'lever' ? 'lever.co' : source).join(','));
          url.searchParams.set('cursor', window.lastId || '0');
        }
        const { body } = await providerJson(url, {
          method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        }, request.fetchImpl);

        if (window.phase === 'expired') {
          if (!Array.isArray(body) || body.some(id => !(typeof id === 'number' && Number.isSafeInteger(id) && id >= 0)
            && !(typeof id === 'string' && /^\d+$/.test(id)))) throw new SyntaxError('provider_payload_malformed');
          const matches = [...new Set((body as Array<string | number>).map(String).filter(id => known!.has(id)))].slice(0, MAX_KNOWN_IDS);
          const batch = matches.slice(0, pageLimit(request.limit));
          const remaining = matches.slice(batch.length);
          const nextCursor = remaining.length ? encodeCursor({ ...window, ids: remaining }) : null;
          return makePage({
            closedIds: batch, nextCursor, complete: !nextCursor,
            status: batch.length ? 'success' : 'empty',
          });
        }

        if (!Array.isArray(body)) throw new SyntaxError('provider_payload_malformed');
        const rows = body as unknown[];
        const limit = pageLimit(request.limit);
        if (rows.length > limit) throw new SyntaxError('provider_payload_malformed');
        let lastNumericId = BigInt(window.lastId);
        for (const row of rows) {
          const id = numericId(record(row).id);
          if (!id || BigInt(id) <= lastNumericId) throw new SyntaxError('provider_pagination_malformed');
          lastNumericId = BigInt(id);
        }
        if (rows.length && lastNumericId <= BigInt(window.lastId)) throw new SyntaxError('provider_pagination_malformed');
        const jobs: ProviderJob[] = [];
        let rejectedRows = 0;
        for (const row of rows) {
          const mapped = mapFantasticJob(row, request.now);
          if (mapped) jobs.push(mapped);
          else rejectedRows += 1;
        }
        const lastId = rows.length ? numericId(record(rows[rows.length - 1]).id) : undefined;
        const fullPage = rows.length >= limit;
        let nextCursor: string | null;
        let complete: boolean;
        if (fullPage && lastId) {
          nextCursor = encodeCursor({ ...window, lastId });
          complete = false;
        } else {
          nextCursor = encodeCursor({ phase: 'expired', since: window.since, until: window.until, title: window.title, location: window.location });
          complete = false;
        }
        const status = rows.length > 0 && jobs.length === 0 ? 'malformed' : jobs.length ? 'success' : 'empty';
        return makePage({ jobs, rejectedRows, nextCursor, complete, status });
      } catch (error) {
        return makePage({
          status: classifyProviderFailure(error),
          nextCursor: request.cursor,
          complete: false,
          rejectedRows: error instanceof SyntaxError ? 1 : 0,
        });
      }
    },
  };
}
