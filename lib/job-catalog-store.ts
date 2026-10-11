/** Admin SDK only. No client SDK, applicant data or raw provider payloads belong here. */
import type { Firestore } from 'firebase-admin/firestore';
import { providerRecordId, type JobProvider, type ProviderJob } from './job-provider-contract';

export interface CatalogControl {
  owner: string;
  leaseUntil: number;
  cursor: string | null;
  runId: string;
  day: string;
  reservedRequests: number;
  reservedRecords: number;
  retryAt: number;
  lastCompletedAt: number;
  triggerPending?: boolean;
}
export interface CatalogStore {
  acquire(provider: JobProvider, owner: string, now: number): Promise<CatalogControl | null>;
  reserve(provider: JobProvider, owner: string, now: number, requests: number, records: number, requestCap: number, recordCap: number, trigger: boolean): Promise<boolean>;
  commit(provider: JobProvider, owner: string, now: number, jobs: ProviderJob[], closedIds: string[], cursor: string | null, complete: boolean): Promise<void>;
  release(provider: JobProvider, owner: string, now: number, retryAt: number, receipt?: { status: string; records: number; closed: number; requests: number; complete: boolean; rejectedRows?: number }): Promise<void>;
  eligible(provider: JobProvider, now: number, limit: number): Promise<ProviderJob[]>;
}

export function createFirestoreCatalogStore(db: Firestore): CatalogStore {
  const control = (provider: JobProvider) => db.collection('job_catalog_state').doc(provider);
  const items = (provider: JobProvider) => db.collection('job_catalog').doc(provider).collection('items');
  const check = (state: CatalogControl | undefined, owner: string, now: number) => {
    if (!state || state.owner !== owner || state.leaseUntil <= now) throw new Error('catalog_lease_lost');
    return state;
  };
  return {
    async acquire(provider, owner, now) {
      return db.runTransaction(async transaction => {
        const ref = control(provider);
        const previous = (await transaction.get(ref)).data() as CatalogControl | undefined;
        if (previous && (previous.leaseUntil > now || previous.retryAt > now)) return null;
        const day = new Date(now).toISOString().slice(0, 10);
        const state: CatalogControl = {
          owner, leaseUntil: now + 110_000, cursor: previous?.cursor || null,
          runId: previous?.cursor || previous?.triggerPending ? previous.runId : owner, day,
          reservedRequests: previous?.day === day ? previous.reservedRequests : 0,
          reservedRecords: previous?.day === day ? previous.reservedRecords : 0,
          retryAt: 0, lastCompletedAt: previous?.lastCompletedAt || 0,
          triggerPending: previous?.triggerPending === true,
        };
        transaction.set(ref, state);
        transaction.set(db.collection('job_catalog_runs').doc(state.runId), { provider, lastAttemptAt: now, status: 'running' }, { merge: true });
        return state;
      });
    },
    async reserve(provider, owner, now, requests, records, requestCap, recordCap, trigger) {
      return db.runTransaction(async transaction => {
        const ref = control(provider);
        const state = check((await transaction.get(ref)).data() as CatalogControl, owner, Date.now());
        if (state.reservedRequests + requests > requestCap || state.reservedRecords + records > recordCap) return false;
        transaction.update(ref, {
          reservedRequests: state.reservedRequests + requests,
          reservedRecords: state.reservedRecords + records,
          ...(trigger ? { triggerPending: true } : {}),
        });
        return true;
      });
    },
    async commit(provider, owner, now, jobs, closedIds, cursor, complete) {
      // At most 20 full descriptions per transaction stays below the 10MiB write ceiling.
      const operations = [
        ...jobs.map(job => ({ id: job.providerJobId, job })),
        ...closedIds.map(id => ({ id, job: null })),
      ];
      const chunks = Math.max(1, Math.ceil(operations.length / 20));
      for (let chunk = 0; chunk < chunks; chunk++) {
        await db.runTransaction(async transaction => {
          const ref = control(provider);
          const state = check((await transaction.get(ref)).data() as CatalogControl, owner, Date.now());
          const entries = operations.slice(chunk * 20, chunk * 20 + 20);
          const rowRefs = entries.map(entry => items(provider).doc(providerRecordId(provider, entry.id)));
          const oldRows = rowRefs.length ? await transaction.getAll(...rowRefs) : [];
          entries.forEach((entry, index) => {
            const previous = oldRows[index]?.data();
            if (!entry.job || entry.job.closed) {
              transaction.set(rowRefs[index], { expiresAt: 0, closedAt: now, deleteAt: new Date(now + 35 * 86_400_000) }, { merge: true });
            } else {
              const validThrough = entry.job.validThrough ? Date.parse(entry.job.validThrough) : Infinity;
              // Closed IDs are not resurrected by a late replay of the active feed.
              const expiresAt = previous?.closedAt ? 0 : Math.min(now + 72 * 60 * 60 * 1000, Number.isFinite(validThrough) ? validThrough : Infinity);
              transaction.set(rowRefs[index], { ...JSON.parse(JSON.stringify({
                job: entry.job, expiresAt, firstSeenAt: previous?.firstSeenAt || entry.job.observedAt,
                runId: state.runId, ...(previous?.closedAt ? { closedAt: previous.closedAt } : {}),
              })), deleteAt: new Date(now + (previous?.closedAt ? 35 : 7) * 86_400_000) });
            }
          });
          if (chunk === chunks - 1) transaction.update(ref, {
            cursor, triggerPending: false, ...(complete ? { lastCompletedAt: now } : {}),
          });
        });
      }
    },
    async release(provider, owner, now, retryAt, receipt) {
      await db.runTransaction(async transaction => {
        const ref = control(provider);
        const current = (await transaction.get(ref)).data() as CatalogControl | undefined;
        if (current?.owner !== owner) return;
        transaction.update(ref, { owner: '', leaseUntil: now, retryAt, ...(receipt ? { lastStatus: receipt.status } : {}) });
        if (receipt) transaction.set(db.collection('job_catalog_runs').doc(current.runId), {
          ...receipt, lastAttemptAt: now, retryAt,
        }, { merge: true });
      });
    },
    async eligible(provider, now, limit) {
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
        const error = new Error('catalog_read_timeout'); error.name = 'TimeoutError'; reject(error);
      }, 4000); });
      const snapshot = await Promise.race([
        items(provider).where('expiresAt', '>', now).orderBy('expiresAt', 'desc').limit(Math.min(500, Math.max(1, limit))).get(), timeout,
      ]).finally(() => clearTimeout(timer));
      return snapshot.docs.map(doc => {
        const row = doc.data(); return row.job ? { ...row.job, firstSeenAt: row.firstSeenAt, runId: row.runId } as ProviderJob : null;
      }).filter((job): job is ProviderJob => Boolean(job));
    },
  };
}
