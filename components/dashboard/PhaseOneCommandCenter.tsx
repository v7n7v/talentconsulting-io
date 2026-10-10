'use client';

import { useRouter } from 'next/navigation';
import { SuitePanel, SuiteToolIcon } from '@/components/suite/SuiteToolChrome';
import { compactList, normalizeCareerTwinSummary, type CareerTwinSummary } from '@/lib/career-twin-client';

type ContextState = 'loading' | 'ready' | 'error';

export default function PhaseOneCommandCenter({ twin, state = 'ready', onRetry, className = '' }: {
  twin?: CareerTwinSummary | null;
  state?: ContextState;
  onRetry?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const normalized = normalizeCareerTwinSummary(twin);
  const memory = normalized?.memory;
  const hasResume = Boolean(memory?.confirmedFacts?.hasResume);
  const queued = memory?.activeSearch?.queuedApplications || 0;
  const action = memory?.nextBestActions?.[0];
  const target = compactList(memory?.goals?.targetRoles?.length ? memory.goals.targetRoles : normalized?.background?.targetRoles, 'Choose a target role', 1);
  const safeActionPath = action?.path && /^\/suite(?:\/|$|\?)/.test(action.path) && !action.path.includes('\\') ? action.path : null;
  const title = state === 'loading' ? 'Finding your next step…'
    : state === 'error' ? 'Your career context is temporarily unavailable.'
    : !hasResume ? 'Start with your resume.'
    : action?.label || (queued ? 'Review your prepared applications.' : 'Choose a role worth pursuing.');
  const description = state === 'loading' ? 'Your saved experience and current search guide this suggestion.'
    : state === 'error' ? 'Your work is still available below. Retry this check without uploading your resume again.'
    : !hasResume ? 'Add your experience, review the extracted facts, then set your target.'
    : action?.reason || (queued ? `${queued} packet${queued === 1 ? '' : 's'} waiting for your review.` : 'Use your confirmed experience to find and compare relevant roles.');
  const href = !hasResume ? '/suite/agent?intent=resume-upload' : safeActionPath || (queued ? '/suite/agent/queue' : '/suite/job-search');

  return <section className={`taco-home-next-action mb-5 min-w-0 ${className}`} aria-busy={state === 'loading'}>
    <SuitePanel className="p-5 md:p-6">
      <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <SuiteToolIcon icon={state === 'error' ? 'refresh' : hasResume ? 'arrow_forward' : 'description'} size="sm" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Next action</p>
            <h2 className="mt-1 text-xl font-bold leading-tight text-[var(--text-primary)]">{title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
            {state === 'ready' && hasResume && <p className="mt-2 text-xs text-[var(--text-muted)]">Target: {target}</p>}
          </div>
        </div>
        {state !== 'loading' && <button type="button" onClick={() => state === 'error' ? onRetry?.() : router.push(href)} className="taco-primary-action inline-flex min-h-11 shrink-0 items-center justify-center gap-2 px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          {state === 'error' ? 'Retry context' : !hasResume ? 'Start with my resume' : queued ? 'Open review' : 'Continue'}
          <span aria-hidden="true">↗</span>
        </button>}
      </div>
    </SuitePanel>
  </section>;
}
