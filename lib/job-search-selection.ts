import type { JobSearchParams } from './job-search-api';
import type { JobSalary, JobWorkplaceType } from './job-ingestion';
import { comparableAnnualSalary, normalizeEmploymentType, normalizeJobDate } from './job-ingestion';

interface SelectableJob {
  id: string;
  title: string;
  company: string;
  location: string;
  locations?: string[];
  country?: string;
  remoteMode?: JobWorkplaceType;
  employmentType: string;
  salary: JobSalary;
  postedDate: string;
  identityKey?: string;
  url: string;
  matchScore?: number | null;
}

export function normalizeJobSearchParams(params: JobSearchParams): JobSearchParams {
  const integer = (value: unknown, fallback: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(1, Math.floor(value))) : fallback;
  return {
    ...params,
    query: typeof params.query === 'string' ? params.query.trim().slice(0, 200) : '',
    location: typeof params.location === 'string' ? params.location.trim().slice(0, 200) : '',
    country: typeof params.country === 'string' ? params.country.trim().toLowerCase().slice(0, 60) : '',
    page: integer(params.page, 1, 1000),
    resultsPerPage: integer(params.resultsPerPage, 20, 50),
    sortBy: ['relevance', 'salary', 'date'].includes(params.sortBy || '') ? params.sortBy : 'relevance',
    salaryMin: typeof params.salaryMin === 'number' && Number.isFinite(params.salaryMin) && params.salaryMin >= 0
      ? Math.min(params.salaryMin, 10_000_000) : undefined,
  };
}

export function parseJobSearchQuery(query: URLSearchParams): JobSearchParams {
  const number = (name: string, fallback: number, max: number, allowZero = false) => {
    const raw = query.get(name);
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < (allowZero ? 0 : 1)) {
      throw new RangeError(`Invalid ${name} parameter`);
    }
    return Math.min(Number(raw), max);
  };
  const boolean = (name: string) => {
    const raw = query.get(name);
    if (raw !== null && raw !== 'true' && raw !== 'false') throw new RangeError(`Invalid ${name} parameter`);
    return raw === 'true';
  };
  const sort = query.get('sortBy') || 'relevance';
  if (!['relevance', 'salary', 'date'].includes(sort)) throw new RangeError('Invalid sortBy parameter');
  return normalizeJobSearchParams({
    query: query.get('query') || 'software engineer', location: query.get('location') || '',
    country: query.get('country') || 'us', page: number('page', 1, 1000),
    resultsPerPage: number('limit', 20, 50), salaryMin: number('salaryMin', 0, 10_000_000, true),
    remote: boolean('remote'), fullTime: boolean('fullTime'), sortBy: sort as JobSearchParams['sortBy'],
  });
}

const COUNTRY_ALIASES: Record<string, string> = {
  us: 'us', usa: 'us', 'united states': 'us', 'united states of america': 'us',
  uk: 'gb', gb: 'gb', gbr: 'gb', 'united kingdom': 'gb',
  ca: 'ca', can: 'ca', canada: 'ca', de: 'de', deu: 'de', germany: 'de',
  au: 'au', aus: 'au', australia: 'au', ie: 'ie', irl: 'ie', ireland: 'ie',
  fr: 'fr', fra: 'fr', france: 'fr', in: 'in', ind: 'in', india: 'in',
};
const STATE_ABBREVIATIONS: Record<string, string> = Object.fromEntries([
  'alabama:al', 'alaska:ak', 'arizona:az', 'arkansas:ar', 'california:ca', 'colorado:co', 'connecticut:ct',
  'delaware:de', 'florida:fl', 'georgia:ga', 'hawaii:hi', 'idaho:id', 'illinois:il', 'indiana:in', 'iowa:ia',
  'kansas:ks', 'kentucky:ky', 'louisiana:la', 'maine:me', 'maryland:md', 'massachusetts:ma', 'michigan:mi',
  'minnesota:mn', 'mississippi:ms', 'missouri:mo', 'montana:mt', 'nebraska:ne', 'nevada:nv',
  'new hampshire:nh', 'new jersey:nj', 'new mexico:nm', 'new york:ny', 'north carolina:nc', 'north dakota:nd',
  'ohio:oh', 'oklahoma:ok', 'oregon:or', 'pennsylvania:pa', 'rhode island:ri', 'south carolina:sc',
  'south dakota:sd', 'tennessee:tn', 'texas:tx', 'utah:ut', 'vermont:vt', 'virginia:va', 'washington:wa',
  'west virginia:wv', 'wisconsin:wi', 'wyoming:wy',
].map(entry => entry.split(':')));

export function normalizeCountry(value: unknown): string {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  // Recognize ISO region codes; ZZ / unknown provider placeholders stay unknown.
  const regionCodes = 'ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug um us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw'.split(' ');
  return COUNTRY_ALIASES[key] || (regionCodes.includes(key) ? key : '');
}

function geographyTokens(value: string): string[] {
  let key = value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [name, abbreviation] of Object.entries(STATE_ABBREVIATIONS)) {
    key = key.replace(new RegExp(`\\b${name}\\b`, 'g'), abbreviation);
  }
  key = key.replace(/\bunited states(?: of america)?\b|\busa\b/g, 'us').replace(/\bunited kingdom\b/g, 'gb');
  return key.split(' ').filter(Boolean);
}

function knownLocationCountry(job: SelectableJob): string {
  if (job.country) return normalizeCountry(job.country);
  // Only unambiguous country names / trailing country codes, never a city guess.
  const segments = job.location.split(/[,;]/).map(value => value.trim().toLowerCase());
  const last = segments[segments.length - 1];
  if (['us', 'usa', 'uk', 'gb'].includes(last)) return normalizeCountry(last);
  if (last.length > 2 && COUNTRY_ALIASES[last]) return COUNTRY_ALIASES[last];
  return '';
}

export function filterJobSearchCandidates<T extends SelectableJob>(jobs: T[], input: JobSearchParams): T[] {
  const params = normalizeJobSearchParams(input);
  const remoteOnly = params.remote === true || params.location?.toLowerCase() === 'remote';
  const preferredLocation = remoteOnly ? [] : geographyTokens(params.location || '');
  const country = normalizeCountry(params.country);
  return jobs.filter(job => {
    if (remoteOnly && job.remoteMode !== 'remote') return false;
    if (params.fullTime && normalizeEmploymentType(job.employmentType) !== 'Full-time') return false;
    const jobCountry = knownLocationCountry(job);
    if (country && jobCountry && country !== jobCountry) return false;
    if (preferredLocation.length) {
      const locations = [...(job.locations || []), job.location];
      if (!locations.some(location => {
        const tokens = new Set(geographyTokens(location));
        return preferredLocation.every(token => tokens.has(token));
      })) return false;
    }
    const pay = comparableAnnualSalary(job.salary);
    if (params.salaryMin && pay !== null && pay < params.salaryMin) return false;
    return true;
  });
}

function stableKey(job: SelectableJob): string {
  return job.identityKey || `${job.company}|${job.title}|${job.location}|${job.id}|${job.url}`;
}

export function sortJobSearchCandidates<T extends SelectableJob>(jobs: T[], sort: JobSearchParams['sortBy'] = 'relevance'): T[] {
  return [...jobs].sort((left, right) => {
    let delta = 0;
    if (sort === 'salary') {
      delta = (comparableAnnualSalary(right.salary) ?? -1) - (comparableAnnualSalary(left.salary) ?? -1);
    } else if (sort === 'date') {
      delta = (Date.parse(normalizeJobDate(right.postedDate)) || 0) - (Date.parse(normalizeJobDate(left.postedDate)) || 0);
    } else {
      delta = (right.matchScore ?? -1) - (left.matchScore ?? -1);
    }
    return delta || stableKey(left).localeCompare(stableKey(right));
  });
}

export function selectJobSearchPage<T extends SelectableJob>(jobs: T[], input: JobSearchParams) {
  const params = normalizeJobSearchParams(input);
  const ordered = sortJobSearchCandidates(filterJobSearchCandidates(jobs, params), params.sortBy);
  const page = params.page || 1;
  const pageSize = params.resultsPerPage || 20;
  const start = (page - 1) * pageSize;
  return { jobs: ordered.slice(start, start + pageSize), totalCount: ordered.length, page, pageSize, hasMore: start + pageSize < ordered.length };
}
