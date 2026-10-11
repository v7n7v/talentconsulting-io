import { catalogOriginIds } from './job-source-policy';
import { JOB_PROVIDERS, originFromUrl, httpsUrl, text, type ProviderJob } from './job-provider-contract';
import type { CatalogStore } from './job-catalog-store';
import type { ProviderDiagnostic } from './job-ingestion';

/** Revalidate persisted rows: a vendor response or old policy never grants origin trust. */
export function acceptedCatalogJob(job: ProviderJob, origins = catalogOriginIds()): boolean {
  if (!job || !JOB_PROVIDERS.includes(job.provider) || !text(job.providerJobId, 300) || job.providerJobId.length > 300
    || !text(job.title) || job.title.length > 500 || typeof job.company !== 'string' || job.company.length > 300
    || typeof job.description !== 'string' || job.description.length > 100_000
    || typeof job.employmentType !== 'string' || job.employmentType.length > 150
    || typeof job.url !== 'string' || job.url.length > 4000
    || (job.applyUrl !== undefined && (!httpsUrl(job.applyUrl) || job.applyUrl.length > 4000))
    || (job.sourceJobId !== undefined && (typeof job.sourceJobId !== 'string' || job.sourceJobId.length > 300))
    || (job.country !== undefined && (typeof job.country !== 'string' || job.country.length > 100))
    || !Array.isArray(job.locations) || job.locations.length > 20 || !Array.isArray(job.inferredFields)
    || job.locations.some(location => typeof location !== 'string' || location.length > 250)
    || job.inferredFields.length > 50 || job.inferredFields.some(field => typeof field !== 'string' || field.length > 100)
    || !job.salary || typeof job.salary.currency !== 'string' || job.salary.currency.length > 12
    || [job.salary.min, job.salary.max].some(value => value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0))
    || typeof job.observedAt !== 'string' || !Number.isFinite(Date.parse(job.observedAt))
    || !['remote', 'hybrid', 'onsite', 'unknown'].includes(job.remoteMode)) return false;
  return Boolean(origins.includes(job.origin) && job.origin === originFromUrl(job.url));
}

export async function readJobCatalogSupply(options: { store?: CatalogStore; now?: number } = {}): Promise<{ jobs: ProviderJob[]; diagnostic: ProviderDiagnostic }> {
  if (process.env.JOB_CATALOG_ENABLED !== 'true') return { jobs: [], diagnostic: { provider: 'job_catalog', status: 'disabled' } };
  try {
    const store: CatalogStore = options.store || await import('./firebase-admin').then(async ({ getAdminDb }) =>
      (await import('./job-catalog-store')).createFirestoreCatalogStore(getAdminDb()));
    const now = options.now ?? Date.now();
    const origins = catalogOriginIds();
    const results = await Promise.allSettled(JOB_PROVIDERS.map(provider => store.eligible(provider, now, 150)));
    const jobs: ProviderJob[] = [];
    let rejectedRows = 0;
    let succeeded = 0;
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      succeeded++;
      for (const job of result.value) {
        if (acceptedCatalogJob(job, origins) && !job.closed
          && now - Date.parse(job.observedAt) < 72 * 60 * 60 * 1000
          && (!job.validThrough || Date.parse(job.validThrough) > now)) jobs.push(job);
        else rejectedRows++;
      }
    }
    return { jobs, diagnostic: { provider: 'job_catalog', status: jobs.length ? 'success' : succeeded === 0 ? 'unavailable' : rejectedRows ? 'malformed' : 'empty', rejectedRows, partial: succeeded < JOB_PROVIDERS.length } };
  } catch { return { jobs: [], diagnostic: { provider: 'job_catalog', status: 'unavailable' } }; }
}
