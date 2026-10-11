import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { classifyProviderFailure } from './job-ingestion';
import { acceptedCatalogJob } from './job-catalog';
import { catalogOriginIds } from './job-source-policy';
import { createFirestoreCatalogStore, type CatalogStore } from './job-catalog-store';
import { type JobProvider, type JobProviderAdapter, type ProviderPage } from './job-provider-contract';
import { createFantasticAdapter } from './job-providers/fantastic';
import { createBrightDataAdapter } from './job-providers/brightdata';
import { createApifyAdapter } from './job-providers/apify';

function bounded(value: string | undefined, fallback: number, ceiling: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.min(ceiling, Math.floor(number)) : fallback;
}
export interface CatalogIngestionResult {
  enabled: boolean; provider: JobProvider; status: string; records: number; closed: number;
  requests: number; complete: boolean; retryAfterSeconds?: number; rejectedRows?: number;
}

export async function runJobCatalogIngestion(options: {
  provider: JobProvider; db?: Firestore; store?: CatalogStore; adapter?: JobProviderAdapter; fetchImpl?: typeof fetch;
}): Promise<CatalogIngestionResult> {
  const { provider } = options;
  const base: CatalogIngestionResult = { enabled: false, provider, status: 'disabled', records: 0, closed: 0, requests: 0, complete: false, rejectedRows: 0 };
  if (process.env.JOB_CATALOG_ENABLED !== 'true') return base;
  const adapter = options.adapter || ({ fantastic: createFantasticAdapter, brightdata: createBrightDataAdapter, apify: createApifyAdapter }[provider])();
  if (!adapter.configured) return base;
  base.enabled = true;
  if (adapter.id !== provider || !catalogOriginIds().length || !Number.isInteger(adapter.requestsPerPage)
    || adapter.requestsPerPage < 1 || adapter.requestsPerPage > 3) return { ...base, status: 'malformed' };
  const store = options.store || createFirestoreCatalogStore(options.db || (await import('./firebase-admin')).getAdminDb());
  const owner = randomUUID();
  const started = Date.now();
  const state = await store.acquire(provider, owner, started);
  if (!state) return { ...base, status: 'busy', retryAfterSeconds: 60 };
  const maxRecords = bounded(process.env.JOB_INGEST_MAX_ITEMS, 100, 500);
  const maxRequests = bounded(process.env.JOB_INGEST_MAX_REQUESTS, 4, 6);
  const dailyRequests = bounded(process.env.JOB_INGEST_DAILY_MAX_REQUESTS, 100, 1000);
  const dailyRecords = bounded(process.env.JOB_INGEST_DAILY_MAX_RECORDS, 1000, 10_000);
  const interval = bounded(process.env.JOB_INGEST_INTERVAL_SECONDS, 3600, 86_400);
  let retryAt = started + 60_000;
  let cursor = state.cursor;
  const finish = (status: string, extras: Partial<CatalogIngestionResult> = {}) => Object.assign(base, extras, { status });
  try {
    if (state.triggerPending && !cursor) {
      retryAt = Date.now() + 3600_000;
      return finish('unavailable', { retryAfterSeconds: 3600 });
    }
    if (!cursor && state.lastCompletedAt && started - state.lastCompletedAt < interval * 1000)
      return finish('pending', { retryAfterSeconds: Math.ceil((state.lastCompletedAt + interval * 1000 - started) / 1000) });
    const knownIds = (await store.eligible(provider, started, 500)).map(job => job.providerJobId);
    let steps = 0;
    while (base.requests + adapter.requestsPerPage <= maxRequests && steps++ < 30 && Date.now() - started < 75_000) {
      const remaining = maxRecords - base.records - base.closed - (base.rejectedRows || 0);
      if (remaining <= 0) return finish('partial', { retryAfterSeconds: 60 });
      const reserveRecords = provider === 'fantastic' ? Math.min(20, remaining) : cursor ? 0 : maxRecords;
      if (!await store.reserve(provider, owner, Date.now(), adapter.requestsPerPage, reserveRecords, dailyRequests, dailyRecords, provider !== 'fantastic' && !cursor)) {
        retryAt = new Date(new Date(started).toISOString().slice(0, 10) + 'T00:00:00Z').getTime() + 86_400_000;
        return finish('budget', { retryAfterSeconds: Math.max(60, Math.ceil((retryAt - Date.now()) / 1000)) });
      }
      base.requests += adapter.requestsPerPage;
      const page: ProviderPage = await adapter.nextPage({ cursor, limit: remaining, now: new Date().toISOString(), fetchImpl: options.fetchImpl || fetch, knownIds });
      if (!Array.isArray(page.jobs) || !Array.isArray(page.closedIds) || page.jobs.length + page.closedIds.length > remaining
        || typeof page.complete !== 'boolean' || !Number.isSafeInteger(page.rejectedRows) || page.rejectedRows < 0
        || (page.nextCursor !== null && (typeof page.nextCursor !== 'string' || page.nextCursor.length > 32_000))
        || (page.complete && page.nextCursor !== null)
        || (!page.complete && ['success', 'empty'].includes(page.status) && (!page.nextCursor || (!page.pending && page.nextCursor === cursor)))) throw new SyntaxError('catalog_page_invalid');
      base.rejectedRows! += page.rejectedRows;
      if (!['success', 'empty'].includes(page.status)) {
        retryAt = Date.now() + (page.status === 'rate_limited' ? 15 * 60_000 : 5 * 60_000);
        return finish(page.status, { retryAfterSeconds: Math.ceil((retryAt - Date.now()) / 1000) });
      }
      const accepted = page.jobs.filter(job => job.provider === provider && acceptedCatalogJob(job));
      const known = new Set([...knownIds, ...accepted.map(job => job.providerJobId)]);
      const closedIds = [...new Set(page.closedIds.filter(id => typeof id === 'string' && known.has(id)))];
      base.rejectedRows! += page.jobs.length - accepted.length;
      if (page.jobs.length && !accepted.length) return finish('malformed');
      await store.commit(provider, owner, Date.now(), accepted, closedIds, page.nextCursor, page.complete);
      base.records += accepted.filter(job => !job.closed).length;
      base.closed += new Set([...closedIds, ...accepted.filter(job => job.closed).map(job => job.providerJobId)]).size;
      cursor = page.nextCursor;
      knownIds.push(...accepted.map(job => job.providerJobId).filter(id => !knownIds.includes(id)));
      if (knownIds.length > 500) knownIds.splice(0, knownIds.length - 500);
      if (page.complete) {
        base.complete = true; base.status = base.records || base.closed ? 'success' : 'empty';
        retryAt = Date.now() + interval * 1000;
        return base;
      }
      if (page.pending) return finish('pending', { retryAfterSeconds: 60 });
    }
    return finish('partial', { retryAfterSeconds: 60 });
  } catch (error) {
    const status = classifyProviderFailure(error);
    retryAt = Date.now() + (status === 'rate_limited' ? 15 * 60_000 : 5 * 60_000);
    return finish(status, { retryAfterSeconds: Math.ceil((retryAt - Date.now()) / 1000) });
  } finally {
    await store.release(provider, owner, Date.now(), retryAt, base);
  }
}
