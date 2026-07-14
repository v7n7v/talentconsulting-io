'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { authFetch } from '@/lib/auth-fetch';
import {
  getAgentQueue,
  getJobApplications,
  type AgentQueueItem,
  type JobApplication,
} from '@/lib/database-suite';
import {
  buildDashboardActionInbox,
  type DashboardActionInboxResult,
} from '@/lib/dashboard-action-inbox';
import { SuitePanel, SuiteToolIcon } from '@/components/suite/SuiteToolChrome';

const EMPTY_INBOX = buildDashboardActionInbox({});

export default function DashboardActionInbox() {
  const user = useStore(state => state.user);
  const [inbox, setInbox] = useState<DashboardActionInboxResult>(EMPTY_INBOX);
  const [loading, setLoading] = useState(true);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!user) {
      setInbox(EMPTY_INBOX);
      setLoading(false);
      setFailedSources([]);
      return;
    }

    setLoading(true);
    const [queueResult, applicationResult, debriefResult] = await Promise.allSettled([
      getAgentQueue('pending'),
      getJobApplications(),
      authFetch('/api/agent/debriefs').then(async response => {
        if (!response.ok) throw new Error('Debriefs unavailable');
        return response.json();
      }),
    ]);
    if (requestId !== requestIdRef.current) return;
    const failures: string[] = [];
    let queue: AgentQueueItem[] = [];
    let applications: JobApplication[] = [];
    let debriefedApplicationIds: string[] = [];
    let allowDebriefActions = true;

    if (queueResult.status === 'fulfilled' && queueResult.value.success) {
      queue = queueResult.value.data || [];
    } else {
      failures.push('prepared packets');
    }
    if (applicationResult.status === 'fulfilled' && applicationResult.value.success) {
      applications = applicationResult.value.data || [];
    } else {
      failures.push('applications');
    }
    if (debriefResult.status === 'fulfilled') {
      const rows = Array.isArray(debriefResult.value?.debriefs) ? debriefResult.value.debriefs : [];
      debriefedApplicationIds = rows
        .map((row: { applicationId?: unknown }) => typeof row.applicationId === 'string' ? row.applicationId : '')
        .filter(Boolean);
    } else {
      failures.push('interview debriefs');
      allowDebriefActions = false;
    }

    setInbox(buildDashboardActionInbox({
      queue,
      applications,
      debriefedApplicationIds,
      allowDebriefActions,
      limit: 3,
    }));
    setFailedSources(failures);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SuitePanel className="mb-6 overflow-hidden p-0">
      <div className="flex min-w-0 items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-4 md:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <SuiteToolIcon icon="inbox" size="sm" />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="premium-heading-wrap text-base font-semibold text-[var(--text-primary)]">Today</h2>
              {!loading && inbox.total > 0 && (
                <span className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
                  {inbox.total} action{inbox.total === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              The next decisions across packets, follow-ups, offers, and interviews.
            </p>
          </div>
        </div>
      </div>

      <div aria-live="polite">
      {loading ? (
        <div className="divide-y divide-[var(--border-subtle)]" aria-label="Loading today's actions" aria-busy="true">
          {[0, 1, 2].map(index => (
            <div key={index} className="flex min-h-[88px] items-center gap-3 px-4 py-3 md:px-5">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-[14px] bg-[var(--bg-elevated)]" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-24 animate-pulse rounded bg-[var(--bg-elevated)]" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--bg-elevated)]" />
              </div>
            </div>
          ))}
        </div>
      ) : inbox.items.length > 0 ? (
        <div className="divide-y divide-[var(--border-subtle)]">
          {inbox.items.map(item => (
            <Link
              key={item.id}
              href={item.href}
              className="group grid min-h-[96px] min-w-0 grid-cols-[40px_minmax(0,1fr)] gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center md:px-5"
            >
              <SuiteToolIcon icon={item.icon} size="sm" />
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {item.eyebrow}
                </span>
                <span className="premium-heading-wrap mt-1 block text-sm font-semibold leading-5 text-[var(--text-primary)]">
                  {item.title}
                </span>
                <span className="premium-copy-wrap block text-xs leading-5 text-[var(--text-secondary)]">
                  {item.subject} · {item.detail}
                </span>
                <span className="mt-2 inline-flex min-h-6 items-center gap-1 text-xs font-semibold text-[var(--text-primary)] sm:hidden">
                  {item.actionLabel}
                  <span className="material-symbols-rounded text-[15px]" aria-hidden="true">arrow_forward</span>
                </span>
              </span>
              <span className="hidden min-h-11 shrink-0 items-center gap-1 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--text-primary)] transition-colors group-hover:border-[var(--border)] sm:inline-flex">
                {item.actionLabel}
                <span className="material-symbols-rounded text-[15px]" aria-hidden="true">arrow_forward</span>
              </span>
            </Link>
          ))}
        </div>
      ) : failedSources.length > 0 && inbox.items.length === 0 ? (
        <div className="px-4 py-6 md:px-5">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Today could not be fully checked</p>
          <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            No due action was found in the available data, but {failedSources.join(' and ')} could not be checked. Your workspace is unchanged.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[11px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)]"
          >
            <span className="material-symbols-rounded text-[17px]" aria-hidden="true">refresh</span>
            Retry inbox
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between md:px-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">You are caught up</p>
            <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              No packet review, follow-up, offer, or interview action is due now.
            </p>
          </div>
          <Link
            href="/suite/job-search"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[11px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)]"
          >
            <span className="material-symbols-rounded text-[17px]" aria-hidden="true">radar</span>
            Find roles
          </Link>
        </div>
      )}

      {!loading && inbox.items.length > 0 && failedSources.length > 0 && (
        <div className="flex min-w-0 items-start gap-2 border-t border-[var(--border-subtle)] px-4 py-2.5 text-xs leading-5 text-[var(--text-secondary)] md:px-5" role="status">
          <span className="material-symbols-rounded icon-status-warning mt-0.5 text-[15px]" aria-hidden="true">warning</span>
          <span className="min-w-0">Showing a partial inbox. {failedSources.join(' and ')} could not be checked.</span>
          <button type="button" onClick={() => void load()} className="ml-auto inline-flex min-h-11 shrink-0 items-center rounded-[10px] px-2 font-semibold text-[var(--text-primary)]">Retry</button>
        </div>
      )}

      {!loading && inbox.total > inbox.items.length && (
        <div className="flex min-w-0 flex-col gap-2 border-t border-[var(--border-subtle)] px-4 py-3 sm:flex-row sm:items-center md:px-5">
          <span className="text-xs text-[var(--text-muted)] sm:mr-auto">
            {inbox.total - inbox.items.length} more action{inbox.total - inbox.items.length === 1 ? '' : 's'}
          </span>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto">
            {inbox.counts.packet > 0 && (
              <Link href="/suite/agent/queue" className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[11px] border border-[var(--border-subtle)] px-2 text-center text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] sm:px-3">
                <span className="min-w-0">Packet queue ({inbox.counts.packet})</span>
                <span className="material-symbols-rounded shrink-0 text-[15px]" aria-hidden="true">arrow_forward</span>
              </Link>
            )}
            {inbox.total - inbox.counts.packet > 0 && (
              <Link href="/suite/applications" className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[11px] border border-[var(--border-subtle)] px-2 text-center text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] sm:px-3">
                <span className="min-w-0">Applications ({inbox.total - inbox.counts.packet})</span>
                <span className="material-symbols-rounded shrink-0 text-[15px]" aria-hidden="true">arrow_forward</span>
              </Link>
            )}
          </div>
        </div>
      )}
      </div>
    </SuitePanel>
  );
}
