'use client';

import { TacoName, TacoText } from '@/components/BrandLogo';
import type { SonaActivationProofResult } from '@/lib/assistant/activation-proof';

export type SonaActivationProofViewState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'result'; result: SonaActivationProofResult }
  | {
      phase: 'error';
      error: {
        code: string;
        title: string;
        message: string;
        retryable: boolean;
      };
    };

interface SonaActivationProofPanelProps {
  state: SonaActivationProofViewState;
  launching?: boolean;
  onLaunch: () => void;
  onRetry: () => void;
  onEditTarget: () => void;
  onUploadResume: () => void;
}

const statusStyles = {
  ready: {
    icon: 'verified',
    label: 'Ready to scout',
    className: 'border-[var(--taco-coral)] bg-[var(--accent-dim)] text-[var(--accent)] dark:text-[var(--accent)]',
  },
  degraded: {
    icon: 'warning',
    label: 'Scout preview only',
    className: 'border-[var(--taco-coral)] bg-[var(--accent-dim)] text-[var(--accent)] dark:text-[var(--accent)]',
  },
  blocked: {
    icon: 'block',
    label: 'Action needed',
    className: 'border-[var(--taco-coral)] bg-[var(--accent-dim)] text-[var(--accent)] dark:text-[var(--accent)]',
  },
} as const;

function formatSourceConfidence(value: string) {
  if (value === 'high') return 'High-confidence source';
  if (value === 'medium') return 'Medium-confidence source';
  return 'Source needs review';
}

function ProofLoadingState() {
  return (
    <div className="mt-4 border-t border-[var(--border-subtle)] pt-4" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="icon-shell-neutral grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border">
          <span className="material-symbols-rounded icon-neutral animate-spin text-[18px]" aria-hidden="true">progress_activity</span>
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Checking the path before <TacoName /> scouts</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            Verifying the selected resume, target brief, safe sources, and duplicate history. No scout quota is used.
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        {['Resume evidence', 'Target brief', 'Safe job supply', 'Packet generation'].map((label) => (
          <div key={label} className="flex min-h-10 items-center gap-2 border-t border-[var(--border-subtle)] py-2 text-[var(--text-secondary)]">
            <span className="material-symbols-rounded icon-neutral text-[16px]" aria-hidden="true">pending</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SonaActivationProofPanel({
  state,
  launching = false,
  onLaunch,
  onRetry,
  onEditTarget,
  onUploadResume,
}: SonaActivationProofPanelProps) {
  if (state.phase === 'idle') return null;
  if (state.phase === 'checking') return <ProofLoadingState />;

  if (state.phase === 'error') {
    return (
      <div className="mt-4 border-t border-[var(--border-subtle)] pt-4" role="alert" aria-live="assertive">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-[var(--taco-coral)] bg-[var(--accent-dim)] text-[var(--accent)] dark:text-[var(--accent)]">
            <span className="material-symbols-rounded text-[18px]" aria-hidden="true">error</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{state.error.title}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{state.error.message}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {state.error.retryable && (
            <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90">
              <span className="material-symbols-rounded text-[18px]" aria-hidden="true">refresh</span>
              Retry preview
            </button>
          )}
          <button type="button" onClick={onEditTarget} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]">
            <span className="material-symbols-rounded icon-current text-[18px]" aria-hidden="true">edit</span>
            Edit target
          </button>
        </div>
      </div>
    );
  }

  const { result } = state;
  const status = statusStyles[result.status];
  const needsResume = result.code === 'MISSING_VERIFIED_RESUME';
  const needsTarget = result.code === 'MISSING_TARGET_BRIEF';
  const generationUnavailable = result.generation?.preparationReady === false;
  const canLaunch = result.canScout && result.topPicks.length > 0 && Boolean(result.activationReceipt?.token);
  const launchBlockedByGeneration = generationUnavailable && result.topPicks.length > 0;

  return (
    <section className="mt-4 border-t border-[var(--border-subtle)] pt-4" aria-labelledby="sona-proof-title" aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="icon-shell-neutral grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border">
            <span className="material-symbols-rounded icon-neutral text-[18px]" aria-hidden="true">fact_check</span>
          </span>
          <div className="min-w-0">
            <p id="sona-proof-title" className="text-sm font-semibold text-[var(--text-primary)]">Scout preview</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{result.message}</p>
          </div>
        </div>
        <span className={`inline-flex min-h-8 w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>
          <span className="material-symbols-rounded text-[15px]" aria-hidden="true">{status.icon}</span>
          {status.label}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex min-h-10 min-w-0 items-center gap-2 border-t border-[var(--border-subtle)] py-2 text-[var(--text-secondary)] sm:border-t-0 sm:border-l-0 sm:pr-3">
          <span className={`material-symbols-rounded text-[16px] ${result.resume.verified ? 'text-[var(--accent)] dark:text-[var(--accent)]' : 'icon-status-danger'}`} aria-hidden="true">
            {result.resume.verified ? 'verified' : 'error'}
          </span>
          <span className="min-w-0 wrap-natural">{result.resume.verified ? 'Verified resume bound' : 'Verified resume needed'}</span>
        </div>
        <div className="flex min-h-10 min-w-0 items-center gap-2 border-t border-[var(--border-subtle)] py-2 text-[var(--text-secondary)] sm:border-l sm:border-t-0 sm:px-3">
          <span className={`material-symbols-rounded text-[16px] ${result.target.missingFields.length === 0 ? 'text-[var(--accent)] dark:text-[var(--accent)]' : 'icon-status-warning'}`} aria-hidden="true">
            {result.target.missingFields.length === 0 ? 'check_circle' : 'edit_note'}
          </span>
          <span className="min-w-0 wrap-natural">{result.target.role || 'Target role needed'} · {result.target.location || 'Location needed'}</span>
        </div>
        <div className="flex min-h-10 min-w-0 items-center gap-2 border-t border-[var(--border-subtle)] py-2 text-[var(--text-secondary)] lg:border-l lg:border-t-0 lg:pl-3">
          <span className="material-symbols-rounded icon-neutral text-[16px]" aria-hidden="true">shield</span>
          <span className="min-w-0 wrap-natural">{result.supply.jobsReceived} checked · {result.supply.historySuppressed + result.supply.duplicatesSuppressed} suppressed</span>
        </div>
        <div className="flex min-h-10 min-w-0 items-center gap-2 border-t border-[var(--border-subtle)] py-2 text-[var(--text-secondary)] sm:border-l sm:pl-3 lg:border-t-0">
          <span className={`material-symbols-rounded text-[16px] ${result.generation?.preparationReady ? 'text-[var(--accent)] dark:text-[var(--accent)]' : 'icon-status-warning'}`} aria-hidden="true">
            {result.generation?.preparationReady ? 'verified' : 'manufacturing'}
          </span>
          <span className="min-w-0 wrap-natural">{result.generation?.preparationReady ? 'Packet generation configured' : 'Scout only · packet AI offline'}</span>
        </div>
      </div>

      {result.topPicks.length > 0 && (
        <div className="mt-3 border-t border-[var(--border-subtle)]" aria-label="Previewed job picks">
          {result.topPicks.slice(0, 3).map((pick, index) => (
            <details key={pick.jobKey} className="group border-b border-[var(--border-subtle)] last:border-b-0" open={index === 0}>
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--taco-coral)] [&::-webkit-details-marker]:hidden">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-xs font-bold tabular-nums text-[var(--text-primary)]">
                  {pick.rank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold leading-4 text-[var(--text-primary)] wrap-natural">{pick.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-[var(--text-muted)] wrap-natural">{pick.company} · {pick.location}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--accent)] dark:text-[var(--accent)]">{Math.round(pick.fitScore)}%</span>
                <span className="material-symbols-rounded icon-neutral shrink-0 text-[16px] transition-transform group-open:rotate-180" aria-hidden="true">expand_more</span>
              </summary>
              <div className="grid gap-3 pb-3 pl-11 text-xs leading-5 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--text-primary)]">Why it ranks</p>
                  <p className="mt-1 text-[var(--text-secondary)] wrap-natural">{pick.fitReasons[0] || 'Review the role against the verified resume evidence.'}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--text-primary)]">Source and risk</p>
                  <p className="mt-1 text-[var(--text-secondary)] wrap-natural">{formatSourceConfidence(pick.source.confidence)} · {pick.riskNotes[0] || 'No high-risk posting signal detected.'}</p>
                </div>
                <p className="min-w-0 text-[var(--text-secondary)] wrap-natural sm:col-span-2"><span className="font-semibold text-[var(--text-primary)]">Next:</span> {pick.nextAction}</p>
              </div>
            </details>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-[var(--text-muted)]">
        <span className="material-symbols-rounded icon-neutral mt-0.5 text-[15px]" aria-hidden="true">lock</span>
        <span>Preview only. No quota used, packet created, notification sent, or application submitted.</span>
      </div>

      {launchBlockedByGeneration && (
        <div className="mt-3 flex items-start gap-2 border-t border-[var(--border-subtle)] pt-3 text-xs leading-5" role="status">
          <span className="material-symbols-rounded icon-status-warning mt-0.5 text-[16px]" aria-hidden="true">cloud_off</span>
          <span className="min-w-0 text-[var(--text-secondary)]">
            <strong className="font-semibold text-[var(--text-primary)]"><TacoName /> launch unavailable.</strong>{' '}
            Review these picks or edit the target. This environment cannot start the agent until packet AI access is restored.
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {canLaunch && (
          <button type="button" onClick={onLaunch} disabled={launching} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            <span className={`material-symbols-rounded text-[18px] ${launching ? 'animate-spin' : ''}`} aria-hidden="true">{launching ? 'progress_activity' : 'radar'}</span>
            <TacoText text={launching ? 'Starting scout...' : 'Start Taco scout'} />
          </button>
        )}
        {needsResume && (
          <button type="button" onClick={onUploadResume} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90">
            <span className="material-symbols-rounded text-[18px]" aria-hidden="true">upload_file</span>
            Upload resume
          </button>
        )}
        <button type="button" onClick={needsTarget || canLaunch || launchBlockedByGeneration ? onEditTarget : onRetry} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]">
          <span className="material-symbols-rounded icon-current text-[18px]" aria-hidden="true">{needsTarget || canLaunch || launchBlockedByGeneration ? 'edit' : 'refresh'}</span>
          {needsTarget || canLaunch || launchBlockedByGeneration ? 'Edit target' : 'Retry preview'}
        </button>
      </div>
    </section>
  );
}
