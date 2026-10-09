/** Source enablement shared by ingestion and operational readiness. */
export const KNOWN_JOB_SOURCES = [
  'greenhouse', 'lever', 'ashby', 'workday', 'remoteok', 'remotive', 'jobicy',
  'himalayas', 'weworkremotely', 'usajobs', 'adzuna',
  'linkedin', 'indeed', 'glassdoor',
] as const;
const CATALOG_BOARD_SOURCES = ['linkedin', 'indeed', 'glassdoor'];
export const DEFAULT_JOB_SOURCES = KNOWN_JOB_SOURCES.filter(source => source !== 'adzuna' && source !== 'remotive' && !CATALOG_BOARD_SOURCES.includes(source));

export function isJobSourceEnabled(source: string): boolean {
  if (!(KNOWN_JOB_SOURCES as readonly string[]).includes(source)) return false;
  if (source === 'remotive') return false;
  if (source === 'adzuna') return process.env.ADZUNA_LICENSED === 'true';
  if (CATALOG_BOARD_SOURCES.includes(source)) return process.env.JOB_CATALOG_ENABLED === 'true'
    && (process.env.JOB_CATALOG_ORIGINS || '').split(',').map(value => value.trim().toLowerCase()).includes(source);
  return true;
}

export function catalogOriginIds(): string[] {
  if (process.env.JOB_CATALOG_ENABLED !== 'true') return [];
  return enabledJobSources((process.env.JOB_CATALOG_ORIGINS || 'greenhouse,lever,ashby,workday').split(','));
}

export function enabledJobSources(sources: string[]): string[] {
  return Array.from(new Set(sources.map(source => source.trim().toLowerCase()).filter(isJobSourceEnabled)));
}
