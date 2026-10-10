'use client';

import { useRouter } from 'next/navigation';
import { featureLockedBody, limitReachedBody, UPGRADE_COPY } from '@/lib/product-copy';

interface UsageLimitGateProps {
  feature?: string | null;
  used?: number | null;
  cap?: number | null;
  upgradeUrl?: string;
  onKeepEditing?: () => void;
  className?: string;
  /**
   * 'cap'  — the free runs for this tool are spent (the default, unchanged).
   * 'tier' — the free plan never included this tool. Same panel, different
   *          claim: it must not tell someone who has run it zero times that
   *          they used something up. The usage counter is suppressed by
   *          `hasUsage` on its own, because a tier lock carries no used/cap.
   */
  variant?: 'cap' | 'tier';
  /**
   * Copy overrides for a limit neither variant can describe honestly — the
   * humanizer meters words per month on every tier, so "your free … runs" is
   * wrong about both the unit and, on a paid plan, the plan. The route supplies
   * the sentence; when it does not, the variant copy stands.
   */
  title?: string | null;
  body?: string | null;
  /**
   * Held by useAuthGate so a page can scroll this into view and move focus to
   * it. `aria-live` only announces a change *inside* a region already in the
   * tree; a second click that re-raises an identical panel changes nothing, so
   * a focus move is the only thing left that can speak.
   */
  ref?: React.Ref<HTMLElement>;
}

export default function UsageLimitGate({
  feature,
  used,
  cap,
  upgradeUrl = '/suite/upgrade',
  onKeepEditing,
  className = '',
  variant = 'cap',
  title,
  body,
  ref,
}: UsageLimitGateProps) {
  const router = useRouter();
  const hasUsage = typeof used === 'number' && typeof cap === 'number' && Number.isFinite(cap);
  const isTierLocked = variant === 'tier';

  return (
    <section
      ref={ref}
      // -1, so focus() can land here without adding a tab stop to the page.
      tabIndex={-1}
      aria-live="polite"
      className={`rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 text-[var(--text-primary)] focus:outline-none ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="material-symbols-rounded icon-status-warning mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--bg-hover)] text-[20px]">
          {isTierLocked ? 'lock' : 'lock_clock'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="min-w-0 text-sm font-semibold">
              {title || (isTierLocked ? UPGRADE_COPY.tierLockedTitle : UPGRADE_COPY.freeLimitTitle)}
            </h3>
            {hasUsage && (
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--warning)]">
                {used}/{cap}
              </span>
            )}
          </div>
          <p className="mt-1 min-w-0 text-sm leading-6 text-[var(--text-secondary)]">
            {body || (isTierLocked ? featureLockedBody(feature) : limitReachedBody(feature))}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push(upgradeUrl)}
              className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <span className="material-symbols-rounded text-[17px]">bolt</span>
              {UPGRADE_COPY.primaryCta}
            </button>
            {onKeepEditing && (
              <button
                type="button"
                onClick={onKeepEditing}
                className="btn-secondary inline-flex min-h-11 items-center justify-center px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                {UPGRADE_COPY.keepEditingCta}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
