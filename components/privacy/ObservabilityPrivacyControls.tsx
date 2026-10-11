'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { authFetch } from '@/lib/auth-fetch';
import {
  applyVerifiedProductAnalyticsConsent,
  clearProductAnalyticsRevocationPending,
  clearVerifiedProductAnalyticsConsent,
  markProductAnalyticsRevocationPending,
  readProductAnalyticsConsent,
} from '@/lib/analytics/ga4-privacy';
import { auth, authHelpers } from '@/lib/firebase';

type ResourceState = 'loading' | 'ready' | 'saving' | 'disabled' | 'error';

interface ConsentEvidence {
  productAnalytics: 'granted' | 'denied';
  noticeVersion: string;
  decidedAt: string | null;
  withdrawnAt: string | null;
  revision: number;
}

interface ConsentResponse {
  enabled?: boolean;
  consent?: Partial<ConsentEvidence> | null;
  policy?: {
    noticeVersion?: string;
    retentionApproved?: boolean;
    collectionEnabled?: boolean;
  };
}

const DEFAULT_EVIDENCE: ConsentEvidence = {
  productAnalytics: 'denied',
  noticeVersion: 'observability-v1',
  decidedAt: null,
  withdrawnAt: null,
  revision: 0,
};

function normalizeConsent(payload: ConsentResponse): ConsentEvidence {
  const consent = payload.consent;
  return {
    productAnalytics: consent?.productAnalytics === 'granted' ? 'granted' : 'denied',
    noticeVersion: typeof payload.policy?.noticeVersion === 'string'
      ? payload.policy.noticeVersion
      : typeof consent?.noticeVersion === 'string'
        ? consent.noticeVersion
        : DEFAULT_EVIDENCE.noticeVersion,
    decidedAt: typeof consent?.decidedAt === 'string' ? consent.decidedAt : null,
    withdrawnAt: typeof consent?.withdrawnAt === 'string' ? consent.withdrawnAt : null,
    revision: Number.isInteger(consent?.revision) && Number(consent?.revision) >= 0
      ? Number(consent?.revision)
      : 0,
  };
}

function formattedDecision(value: string | null): string {
  if (!value) return 'No analytics decision recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Decision time unavailable';
  return `Updated ${date.toLocaleString()}`;
}

function syncVerifiedAnalyticsConsent(
  evidence: ConsentEvidence,
  collectionEnabled: boolean,
  uid: string | null,
) {
  if (!uid) {
    clearVerifiedProductAnalyticsConsent();
    return;
  }
  applyVerifiedProductAnalyticsConsent({
    consent: evidence.productAnalytics,
    uid,
    noticeVersion: evidence.noticeVersion,
    collectionEnabled,
  });
}

interface DiagnosticCaseView {
  caseId: string;
  category: string;
  status: 'open' | 'resolved';
  grantState: 'active' | 'revoked' | 'not_granted' | 'expired';
  grantExpiresAt: string | null;
  createdAt: string;
}

function DiagnosticGrantList({ noticeVersion, uid }: { noticeVersion: string; uid: string }) {
  const [cases, setCases] = useState<DiagnosticCaseView[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [revoking, setRevoking] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  const loadCases = useCallback(async () => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    if (auth.currentUser?.uid !== uid) return;
    setStatus('loading');
    try {
      const response = await authFetch('/api/observability/diagnostic-cases', {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({})) as {
        cases?: DiagnosticCaseView[];
        error?: string;
      };
      if (
        generation !== requestGeneration.current
        || auth.currentUser?.uid !== uid
      ) return;
      if (!response.ok) throw new Error(payload.error || 'Diagnostic grants are unavailable.');
      setCases(Array.isArray(payload.cases) ? payload.cases : []);
      setStatus('ready');
    } catch {
      if (
        generation !== requestGeneration.current
        || auth.currentUser?.uid !== uid
      ) return;
      setCases([]);
      setStatus('error');
    }
  }, [uid]);

  useEffect(() => {
    setCases([]);
    setStatus('loading');
    setRevoking(null);
    void loadCases();
    return () => {
      requestGeneration.current += 1;
    };
  }, [loadCases]);

  const revoke = async (caseId: string) => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    if (auth.currentUser?.uid !== uid) return;
    setRevoking(caseId);
    try {
      const response = await authFetch(
        `/api/observability/diagnostic-cases/${encodeURIComponent(caseId)}/grant`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'revoke', noticeVersion }),
        },
      );
      if (
        generation !== requestGeneration.current
        || auth.currentUser?.uid !== uid
      ) return;
      if (!response.ok) throw new Error('Revoke failed');
      setRevoking(null);
      await loadCases();
    } catch {
      if (
        generation !== requestGeneration.current
        || auth.currentUser?.uid !== uid
      ) return;
      setStatus('error');
      setRevoking(null);
    }
  };

  const visibleCases = cases.filter(item => item.grantState !== 'not_granted');

  return (
    <div className="mt-5 border-t border-[var(--border-subtle)] pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-[var(--text-primary)]">Diagnostic-sharing grants</h4>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            Each grant is tied to one support case and can be revoked immediately.
          </p>
        </div>
        {status === 'error' ? (
          <button
            type="button"
            onClick={() => void loadCases()}
            className="min-h-12 rounded-xl border border-[var(--border-subtle)] px-3 text-sm font-semibold text-[var(--text-primary)]"
          >
            Retry
          </button>
        ) : null}
      </div>

      {status === 'loading' ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]" aria-live="polite">Loading diagnostic grants…</p>
      ) : status === 'error' ? (
        <p className="mt-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-4 py-3 text-xs text-[var(--danger)]">
          Sign in again or retry when diagnostic-sharing grants are available.
        </p>
      ) : visibleCases.length === 0 ? (
        <p className="mt-3 rounded-xl bg-[var(--bg-hover)] px-4 py-3 text-xs text-[var(--text-secondary)]">
          No diagnostic-sharing grants are recorded.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visibleCases.map(item => {
            const active = item.grantState === 'active';
            const expiry = item.grantExpiresAt ? new Date(item.grantExpiresAt) : null;
            return (
              <li
                key={item.caseId}
                className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-hover)] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    Case {item.caseId}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {active && expiry && !Number.isNaN(expiry.getTime())
                      ? `Active until ${expiry.toLocaleString()}`
                      : item.grantState === 'revoked'
                        ? 'Revoked'
                        : 'Expired'}
                  </p>
                </div>
                {active ? (
                  <button
                    type="button"
                    disabled={revoking === item.caseId}
                    onClick={() => void revoke(item.caseId)}
                    className="min-h-12 rounded-xl border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 text-sm font-bold text-[var(--danger)] transition hover:bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] disabled:opacity-50"
                  >
                    {revoking === item.caseId ? 'Revoking…' : 'Revoke access'}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ObservabilityDataControls({ disabled, uid }: { disabled: boolean; uid: string }) {
  const [action, setAction] = useState<'idle' | 'exporting' | 'resetting'>('idle');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const resetRequestKey = useRef<string | null>(null);
  const [resetJob, setResetJob] = useState<{
    jobId: string;
    status: 'queued' | 'running' | 'complete';
  } | null>(null);
  const lifecycleGeneration = useRef(0);

  useEffect(() => {
    lifecycleGeneration.current += 1;
    setAction('idle');
    setConfirmation('');
    setMessage('');
    setIsError(false);
    setResetJob(null);
    resetRequestKey.current = null;
    return () => {
      lifecycleGeneration.current += 1;
    };
  }, [uid]);

  useEffect(() => {
    if (!resetJob || resetJob.status === 'complete' || disabled) return undefined;
    const generation = lifecycleGeneration.current;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await authFetch(
          `/api/privacy/observability/reset?jobId=${encodeURIComponent(resetJob.jobId)}`,
          { cache: 'no-store' },
        );
        const payload = await response.json().catch(() => ({})) as {
          status?: 'queued' | 'running' | 'complete';
        };
        if (
          !cancelled
          && generation === lifecycleGeneration.current
          && auth.currentUser?.uid === uid
          && response.ok
          && payload.status
        ) {
          setResetJob(current => current ? { ...current, status: payload.status! } : current);
          setMessage(
            payload.status === 'complete'
              ? `Personal observability events and pre-reset grants are removed. Reference ${resetJob.jobId}. Retention-bound audit/case evidence and de-identified rounded aggregates remain.`
              : `Observability-only reset ${payload.status}. Reference ${resetJob.jobId}.`,
          );
        }
      } catch {
        // Keep the durable job reference visible and retry on the next bounded poll.
      }
    };
    void poll();
    const timer = window.setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [disabled, resetJob?.jobId, resetJob?.status, uid]);

  const exportMetadata = async () => {
    const generation = lifecycleGeneration.current;
    if (auth.currentUser?.uid !== uid) return;
    setAction('exporting');
    setMessage('');
    setIsError(false);
    try {
      const events: unknown[] = [];
      let cursor: string | null = null;
      let payload: Record<string, any> = {};
      let page = 0;
      do {
        const params = new URLSearchParams({ limit: '50' });
        if (cursor) params.set('cursor', cursor);
        const response = await authFetch(`/api/privacy/observability/export?${params.toString()}`, {
          cache: 'no-store',
        });
        payload = await response.json().catch(() => ({}));
        if (
          generation !== lifecycleGeneration.current
          || auth.currentUser?.uid !== uid
        ) return;
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === 'string'
              ? payload.error
              : 'Your observability export is temporarily unavailable.',
          );
        }
        if (Array.isArray(payload.events)) events.push(...payload.events);
        cursor = typeof payload.nextCursor === 'string' ? payload.nextCursor : null;
        page += 1;
      } while (cursor && page < 20);
      if (
        generation !== lifecycleGeneration.current
        || auth.currentUser?.uid !== uid
      ) return;
      if (events.length > 1_000) {
        throw new Error('The bounded observability export exceeded its safety limit.');
      }
      const exportPayload = {
        ...payload,
        events,
        pagesIncluded: page,
        nextCursor: cursor,
        truncated: Boolean(cursor),
        maximumEventsPerDownload: 1_000,
      };
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `talent-consulting-observability-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(
        cursor
          ? 'Downloaded 1,000 bounded metadata events. The file includes a private cursor for remaining retained pages.'
          : 'Your privacy-safe observability metadata was downloaded.',
      );
    } catch (error) {
      if (
        generation !== lifecycleGeneration.current
        || auth.currentUser?.uid !== uid
      ) return;
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'Your export could not be created.');
    } finally {
      if (
        generation === lifecycleGeneration.current
        && auth.currentUser?.uid === uid
      ) setAction('idle');
    }
  };

  const resetMetadata = async () => {
    const generation = lifecycleGeneration.current;
    if (auth.currentUser?.uid !== uid) return;
    setAction('resetting');
    setMessage('');
    setIsError(false);
    markProductAnalyticsRevocationPending({ broadcast: true });
    try {
      if (!resetRequestKey.current) {
        resetRequestKey.current = typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      const response = await authFetch('/api/privacy/observability/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmationText: confirmation,
          idempotencyKey: resetRequestKey.current,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (
        generation !== lifecycleGeneration.current
        || auth.currentUser?.uid !== uid
      ) return;
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : 'Your observability reset could not be queued.',
        );
      }
      setConfirmation('');
      resetRequestKey.current = null;
      markProductAnalyticsRevocationPending({ broadcast: true });
      const jobId = String(payload?.jobId || '');
      setResetJob({
        jobId,
        status: payload?.status === 'running' || payload?.status === 'complete'
          ? payload.status
          : 'queued',
      });
      setMessage(
        `Observability-only reset queued. Reference ${jobId}. `
        + 'This does not delete your Talent Consulting account or documents.',
      );
    } catch (error) {
      if (
        generation !== lifecycleGeneration.current
        || auth.currentUser?.uid !== uid
      ) return;
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'Your reset could not be queued.');
    } finally {
      if (
        generation === lifecycleGeneration.current
        && auth.currentUser?.uid === uid
      ) setAction('idle');
    }
  };

  const resetReady = confirmation === 'RESET OBSERVABILITY DATA';

  return (
    <div className="mt-5 border-t border-[var(--border-subtle)] pt-5">
      <h4 className="text-sm font-bold text-[var(--text-primary)]">Your observability data</h4>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--text-secondary)]">
        Download the bounded metadata we retain or queue an observability-only reset. These controls
        do not export or delete your account, prompts, documents, or application history.
      </p>
      <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--text-secondary)]">
        A reset removes retained personal observability events and pre-reset diagnostic grants.
        De-identified rounded daily aggregates are not subtracted, and mandatory access receipts
        and support-case evidence remain only until their stated retention expiry.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <button
          type="button"
          onClick={() => void exportMetadata()}
          disabled={disabled || action !== 'idle'}
          className="min-h-12 rounded-xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-4 text-sm font-bold text-[var(--accent)] outline-none transition hover:-translate-y-0.5 hover:bg-[var(--accent-dim)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {action === 'exporting' ? 'Preparing download...' : 'Download metadata'}
        </button>

        <div className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-3">
          <label
            htmlFor="observability-reset-confirmation"
            className="block text-xs font-semibold text-[var(--text-primary)]"
          >
            Type <span className="font-mono text-[var(--danger)]">RESET OBSERVABILITY DATA</span>
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="observability-reset-confirmation"
              value={confirmation}
              onChange={event => setConfirmation(event.target.value)}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 text-base text-[var(--text-primary)] outline-none transition focus-visible:border-[var(--danger)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--danger)_30%,transparent)] disabled:opacity-50"
              aria-describedby="observability-data-action-status"
            />
            <button
              type="button"
              onClick={() => void resetMetadata()}
              disabled={disabled || !resetReady || action !== 'idle'}
              className="min-h-12 rounded-xl border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 text-sm font-bold text-[var(--danger)] outline-none transition hover:bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--danger)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action === 'resetting' ? 'Queuing reset...' : 'Reset metadata'}
            </button>
          </div>
        </div>
      </div>

      <p
        id="observability-data-action-status"
        className={`mt-3 text-xs leading-5 ${isError ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`}
        aria-live="polite"
      >
        {message}
      </p>
    </div>
  );
}

export default function ObservabilityPrivacyControls() {
  const [state, setState] = useState<ResourceState>('loading');
  const [evidence, setEvidence] = useState<ConsentEvidence>(DEFAULT_EVIDENCE);
  const [collectionEnabled, setCollectionEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [activeUserUid, setActiveUserUid] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const activeUid = useRef<string | null>(null);

  const load = useCallback(async (uid: string) => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    setState('loading');
    setMessage('');
    try {
      const response = await authFetch('/api/observability/consent', {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({})) as ConsentResponse & {
        error?: string;
      };
      if (
        generation !== requestGeneration.current
        || activeUid.current !== uid
        || auth.currentUser?.uid !== uid
      ) return;
      if (response.status === 404 || response.status === 409 || payload.enabled === false) {
        clearVerifiedProductAnalyticsConsent();
        setCollectionEnabled(false);
        setEvidence(DEFAULT_EVIDENCE);
        setState('disabled');
        return;
      }
      if (!response.ok) throw new Error(payload.error || 'Privacy controls are temporarily unavailable.');
      const next = normalizeConsent(payload);
      const collectionAvailable = payload.policy?.collectionEnabled === true;
      setCollectionEnabled(collectionAvailable);
      syncVerifiedAnalyticsConsent(next, collectionAvailable, uid);
      setEvidence(next);
      setState('ready');
    } catch (error) {
      if (
        generation !== requestGeneration.current
        || activeUid.current !== uid
        || auth.currentUser?.uid !== uid
      ) return;
      clearVerifiedProductAnalyticsConsent();
      setEvidence(current => ({
        ...current,
        productAnalytics: readProductAnalyticsConsent(),
      }));
      setMessage(error instanceof Error ? error.message : 'Privacy controls are temporarily unavailable.');
      setState('error');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = authHelpers.onAuthStateChanged(user => {
      const uid = user?.uid || null;
      requestGeneration.current += 1;
      activeUid.current = uid;
      setActiveUserUid(uid);
      clearVerifiedProductAnalyticsConsent();
      setEvidence(DEFAULT_EVIDENCE);
      setCollectionEnabled(false);
      setMessage('');
      if (!uid) {
        setState('error');
        setMessage('Sign in to review your privacy choices.');
        return;
      }
      void load(uid);
    });
    return () => {
      requestGeneration.current += 1;
      activeUid.current = null;
      setActiveUserUid(null);
      clearVerifiedProductAnalyticsConsent();
      unsubscribe();
    };
  }, [load]);

  const update = async (nextGranted: boolean) => {
    const uid = activeUid.current;
    if (!uid || auth.currentUser?.uid !== uid) {
      clearVerifiedProductAnalyticsConsent();
      setState('error');
      setMessage('Sign in again before changing your privacy choice.');
      return;
    }
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    const previous = evidence;
    setState('saving');
    setMessage('');
    if (!nextGranted) {
      markProductAnalyticsRevocationPending({ broadcast: true });
    }
    try {
      const response = await authFetch('/api/observability/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productAnalytics: nextGranted,
          noticeVersion: evidence.noticeVersion,
          expectedRevision: evidence.revision,
        }),
      });
      const payload = await response.json().catch(() => ({})) as ConsentResponse & {
        error?: string;
      };
      if (
        generation !== requestGeneration.current
        || activeUid.current !== uid
        || auth.currentUser?.uid !== uid
      ) return;
      if (!response.ok) throw new Error(payload.error || 'Your privacy choice could not be saved.');
      const next = normalizeConsent(payload);
      const collectionAvailable = payload.policy?.collectionEnabled === true;
      setCollectionEnabled(collectionAvailable);
      if (nextGranted && next.productAnalytics === 'granted') {
        clearProductAnalyticsRevocationPending();
      }
      syncVerifiedAnalyticsConsent(next, collectionAvailable, uid);
      if (next.productAnalytics === 'denied') {
        markProductAnalyticsRevocationPending({ broadcast: true });
      }
      setEvidence(next);
      setState('ready');
      setMessage(next.productAnalytics === 'granted' && collectionAvailable
        ? 'Optional product analytics are on. Prompts and documents are never included.'
        : next.productAnalytics === 'granted'
          ? 'Your opt-in is saved, but collection remains paused while the observability foundation is disabled.'
        : 'Optional product analytics are off. Future optional events will not be sent.');
    } catch (error) {
      if (
        generation !== requestGeneration.current
        || activeUid.current !== uid
        || auth.currentUser?.uid !== uid
      ) return;
      if (nextGranted) {
        setEvidence(previous);
        syncVerifiedAnalyticsConsent(previous, collectionEnabled, uid);
      } else {
        setEvidence({ ...previous, productAnalytics: 'denied' });
        markProductAnalyticsRevocationPending({ broadcast: true });
      }
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Your privacy choice could not be saved.');
    }
  };

  const granted = evidence.productAnalytics === 'granted';
  const unavailable = state === 'disabled';
  const busy = state === 'loading' || state === 'saving';
  const actionable = state === 'ready';

  return (
    <section
      className="elevation-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 sm:p-6"
      aria-labelledby="product-analytics-heading"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="material-symbols-rounded text-[var(--accent)]" aria-hidden="true">privacy_tip</span>
            <h3 id="product-analytics-heading" className="text-lg font-semibold text-[var(--text-primary)]">
              Privacy-safe product analytics
            </h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Share coarse tool outcomes so we can improve reliability and understand which workflows help.
            This never includes prompts, Taco replies, resumes, cover letters, filenames, search terms,
            companies, job titles, email addresses, or other document content.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="rounded-full border border-[color-mix(in_srgb,var(--success)_20%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-2.5 py-1 text-[var(--success)]">Content excluded</span>
            <span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[var(--accent-dim)] px-2.5 py-1 text-[var(--accent)]">Optional</span>
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-2.5 py-1 text-[var(--text-secondary)]">Revocable</span>
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {unavailable
              ? 'The observability foundation is currently disabled.'
              : `${formattedDecision(evidence.decidedAt)} · Notice ${evidence.noticeVersion}${
                collectionEnabled ? '' : ' · Collection paused'
              }`}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={granted}
          aria-describedby="product-analytics-status"
          disabled={busy || unavailable || !actionable}
          onClick={() => void update(!granted)}
          className={`relative inline-flex min-h-12 w-full shrink-0 items-center justify-between rounded-xl border px-3.5 py-2 text-sm font-semibold transition sm:w-44 ${
            granted
              ? 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--text-secondary)]'
          } disabled:cursor-not-allowed disabled:opacity-55`}
        >
          <span>{state === 'saving' ? 'Saving…' : granted ? 'Analytics on' : 'Analytics off'}</span>
          <span
            aria-hidden="true"
            className={`relative h-6 w-11 rounded-full transition ${
              granted ? 'bg-[var(--success)]' : 'bg-[var(--border-subtle)]'
            }`}
          >
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-[var(--paper)] transition-transform ${
              granted ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </span>
        </button>
      </div>

      <p
        id="product-analytics-status"
        className={`mt-4 text-xs leading-5 ${
          state === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'
        }`}
        aria-live="polite"
      >
        {state === 'loading'
          ? 'Loading your privacy choice…'
          : message || (granted && collectionEnabled
            ? 'Only allowlisted, coarse product events may be sent.'
            : granted
              ? 'Your preference is saved; no events are sent while collection is paused.'
            : 'Optional product analytics are not being sent.')}
      </p>

      {state === 'error' ? (
        <button
          type="button"
          onClick={() => {
            const uid = activeUid.current;
            if (uid) void load(uid);
          }}
          className="mt-3 min-h-12 rounded-xl border border-[var(--border-subtle)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
        >
          Retry
        </button>
      ) : null}

      {activeUserUid ? (
        <>
          <DiagnosticGrantList
            key={`diagnostic-grants:${activeUserUid}`}
            uid={activeUserUid}
            noticeVersion={evidence.noticeVersion}
          />
          <ObservabilityDataControls
            key={`observability-data:${activeUserUid}`}
            uid={activeUserUid}
            disabled={!actionable}
          />
        </>
      ) : null}
    </section>
  );
}
