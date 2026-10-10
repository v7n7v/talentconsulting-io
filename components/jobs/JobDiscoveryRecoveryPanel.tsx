'use client';

import type { JobDiscoveryRecovery } from '@/lib/job-discovery-recovery';

interface JobDiscoveryRecoveryPanelProps {
  recovery: JobDiscoveryRecovery;
  onAction: () => void;
  compact?: boolean;
}

function recoveryTone(recovery: JobDiscoveryRecovery) {
  if (recovery.code === 'suggestions_setup_required') {
    return {
      panel: 'border-[var(--taco-coral)] bg-[var(--accent-dim)]',
      icon: 'tune',
      iconClass: 'text-[var(--accent)] dark:text-[var(--accent)]',
    };
  }
  if (recovery.code.endsWith('_failed')) {
    return {
      panel: 'border-[var(--taco-coral)] bg-[var(--accent-dim)]',
      icon: 'sync_problem',
      iconClass: 'text-[var(--accent)] dark:text-[var(--accent)]',
    };
  }
  return {
    panel: 'border-[var(--taco-coral)] bg-[var(--accent-dim)]',
    icon: recovery.code.endsWith('_busy')
      ? 'hourglass_top'
      : recovery.action === 'create_account' || recovery.action === 'sign_in'
        ? 'person'
        : recovery.action === 'upgrade'
          ? 'upgrade'
          : recovery.code === 'suggestions_partial_results'
            ? 'rule_settings'
            : 'cloud_off',
    iconClass: 'text-[var(--accent)] dark:text-[var(--accent)]',
  };
}

export default function JobDiscoveryRecoveryPanel({
  recovery,
  onAction,
  compact = false,
}: JobDiscoveryRecoveryPanelProps) {
  const tone = recoveryTone(recovery);

  return (
    <div
      className={`min-w-0 rounded-[14px] border ${compact ? 'p-3' : 'p-4'} ${tone.panel}`}
      role="status"
      aria-live="polite"
    >
      <div className={`flex min-w-0 gap-3 ${compact ? 'items-center' : 'items-start'}`}>
        <span
          className={`material-symbols-rounded shrink-0 ${compact ? 'text-[18px]' : 'mt-0.5 text-[20px]'} ${tone.iconClass}`}
          aria-hidden="true"
        >
          {tone.icon}
        </span>
        <div className={`min-w-0 flex-1 ${compact ? 'sm:flex sm:items-center sm:justify-between sm:gap-4' : ''}`}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{recovery.title}</p>
            <p className="mt-1 text-pretty text-xs leading-5 text-[var(--text-secondary)]">{recovery.message}</p>
          </div>
          <button
            type="button"
            onClick={onAction}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[11px] bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--taco-coral)] ${compact ? 'mt-3 w-full sm:mt-0 sm:w-auto' : 'mt-4 w-full sm:w-auto'}`}
          >
            <span className="material-symbols-rounded text-[16px]" aria-hidden="true">
              {recovery.action === 'open_preferences'
                ? 'tune'
                : recovery.action === 'create_account'
                  ? 'person_add'
                  : recovery.action === 'sign_in'
                    ? 'login'
                    : recovery.action === 'upgrade'
                      ? 'upgrade'
                      : 'refresh'}
            </span>
            {recovery.nextAction}
          </button>
        </div>
      </div>
    </div>
  );
}
