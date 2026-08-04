'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { suiteToolRegistry, type SuiteToolDefinition } from '@/lib/suite-tool-registry';
import { useStore } from '@/lib/store';

export interface MobileAction {
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface MobileSegmentItem {
  value: string;
  label: string;
  icon?: string;
  meta?: string;
}

function MobileIcon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} aria-hidden="true">{name}</span>;
}

const QUICK_TOOL_ITEMS = [
  { id: 'sona', label: 'Ask Taco', icon: 'auto_awesome', href: '/suite/agent' },
  /* "Job Search", not "Job Match": /suite/job-search is the opportunity radar,
     while "Job Match" on the landing page and in the sidebar dropdown means
     comparing a resume against one role. One label pointing at two unrelated
     tools is what made this tile read as broken. The sidebar already calls this
     route Job Search (components/SuiteSidebar.tsx:157). */
  { id: 'job-search', label: 'Job Search', icon: 'work_history', href: '/suite/job-search' },
  { id: 'resume', label: 'Resume Check', icon: 'description', href: '/suite/resume?mobileAction=check' },
  { id: 'humanize', label: 'Humanize', icon: 'edit_note', href: '/suite/writing-tools' },
  { id: 'ats', label: 'ATS Score', icon: 'scanner', href: '/suite/ats-analyzer?mobileTab=score' },
  { id: 'applications', label: 'Applications', icon: 'work', href: '/suite/applications' },
  { id: 'follow-up', label: 'Follow-up', icon: 'forward_to_inbox', href: '/suite/applications?mobileView=followups' },
  { id: 'interview', label: 'Interview Prep', icon: 'interpreter_mode', href: '/suite/interview-sim?mode=quick_drill' },
] as const;

/* Signed-out equivalents. Previously `/?tool=…`, which no code reads - see the
   note on GUEST_PREVIEW_BY_SUITE_PATH in components/SuiteSidebar.tsx. A guest
   tapping any of these was dropped on the marketing homepage.

   Job Search has no public equivalent - /tools has five pages and none of them
   is a job board - so it is left out of the guest rail rather than aliased to
   /tools/ats-analyzer, which is already what "ATS Score" points at. Two tiles
   with different names and one destination is the same lie as a dead link. */
const GUEST_QUICK_TOOL_HREFS: Record<string, string> = {
  sona: '/suite/agent?intent=resume-upload',
  /* Resume and ATS resolve to the suite route, matching the landing page's
     mode cards and components/SuiteSidebar.tsx. Both work signed out -
     /api/resume/parse and /api/resume/ats-score are allowAnonymous with their
     own ANON_CAPS - so overriding them to a marketing page took a guest off a
     working tool. The `?tab=score` is load-bearing: ATS Preview reads a saved
     resume, and a guest has none.
     Humanize keeps its override. /suite/writing-tools calls
     /api/writing/humanize, which is allowAnonymous:false and not in
     FREEMIUM_API_PATHS, so there is nothing there for a guest to finish. */
  resume: '/suite/resume',
  humanize: '/tools/ai-humanizer',
  ats: '/suite/ats-analyzer?tab=score',
};

const GUEST_TOP_QUICK_TOOLS = new Set(['sona', 'resume', 'ats', 'humanize']);

const GROUP_ORDER = ['Build', 'Search and Apply', 'Prepare', 'Grow', 'Taco', 'Home'];

function priorityLabel(tool: SuiteToolDefinition) {
  if (tool.mobilePriority === 'desktopEnhanced') return 'Best on desktop';
  if (tool.mobilePriority === 'advanced') return 'Advanced';
  if (tool.mobilePriority === 'quick') return 'Quick';
  return undefined;
}

export function MobileQuickToolsRail({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const railRef = useRef<HTMLElement | null>(null);
  const user = useStore((state) => state.user);
  const quickTools = user ? QUICK_TOOL_ITEMS : QUICK_TOOL_ITEMS.filter((item) => GUEST_TOP_QUICK_TOOLS.has(item.id));

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const updateHint = () => {
      const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft;
      setShowSwipeHint(remaining > 28);
    };

    updateHint();
    rail.addEventListener('scroll', updateHint, { passive: true });
    window.addEventListener('resize', updateHint);
    return () => {
      rail.removeEventListener('scroll', updateHint);
      window.removeEventListener('resize', updateHint);
    };
  }, [quickTools.length]);

  return (
    <>
      <section className={`mobile-quick-tools lg:hidden ${className}`} aria-label="Quick tools">
        <nav ref={railRef} className="mobile-quick-tools__rail" aria-label="Frequent mobile tools">
          {quickTools.map((item) => {
            const content = (
              <>
                <MobileIcon name={item.icon} className="text-[19px]" />
                <span>{item.label}</span>
              </>
            );

            const href = !user ? GUEST_QUICK_TOOL_HREFS[item.id] || item.href : item.href;
            return (
              <Link key={item.id} href={href} className="mobile-quick-tools__item">
                {content}
              </Link>
            );
          })}
          <button type="button" onClick={() => setOpen(true)} className="mobile-quick-tools__item mobile-quick-tools__item--more">
            <MobileIcon name="apps" className="text-[19px]" />
            <span>More tools</span>
          </button>
        </nav>
        {showSwipeHint && (
          <div className="mobile-quick-tools__swipe-hint" aria-hidden="true">
            <span>Swipe</span>
            <MobileIcon name="arrow_forward" className="text-[15px]" />
          </div>
        )}
      </section>
      <MobileQuickToolsSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function MobileQuickToolsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const groupedTools = useMemo(() => {
    return suiteToolRegistry.reduce<Record<string, SuiteToolDefinition[]>>((groups, tool) => {
      if (tool.id === 'dashboard') return groups;
      const group = tool.group || 'Tools';
      groups[group] = groups[group] || [];
      groups[group].push(tool);
      return groups;
    }, {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="mobile-quick-tools-sheet lg:hidden" role="dialog" aria-modal="true" aria-label="All mobile tools">
      <button type="button" className="mobile-quick-tools-sheet__backdrop" onClick={onClose} aria-label="Dismiss quick tools overlay" />
      <section className="mobile-quick-tools-sheet__panel">
        <div className="mobile-quick-tools-sheet__header">
          <div className="min-w-0">
            <p>Mobile quick tools</p>
            <h2>Choose the fastest path</h2>
          </div>
          <button type="button" onClick={onClose} className="mobile-quick-tools-sheet__close" aria-label="Close quick tools" autoFocus>
            <MobileIcon name="close" className="text-[20px]" />
          </button>
        </div>

        <div className="mobile-quick-tools-sheet__groups">
          {GROUP_ORDER.filter(group => groupedTools[group]?.length).map(group => (
            <section key={group} className="mobile-quick-tools-sheet__group">
              <h3>{group}</h3>
              <div className="mobile-quick-tools-sheet__grid">
                {groupedTools[group].map(tool => {
                  const label = tool.mobileLabel || tool.title;
                  const description = tool.mobileDescription || tool.subtitle;
                  const href = tool.mobileHref || tool.path;
                  const badge = priorityLabel(tool);

                  return (
                    <Link
                      key={tool.id}
                      href={href}
                      onClick={onClose}
                      className="mobile-quick-tools-sheet__card"
                    >
                      <span className="mobile-quick-tools-sheet__icon" aria-hidden="true">
                        <MobileIcon name={tool.icon} className="text-[21px]" />
                      </span>
                      <span className="min-w-0">
                        <strong>{label}</strong>
                        <small>{description}</small>
                        {badge ? <em>{badge}</em> : null}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

export function MobileStickyActionBar({
  primaryLabel,
  primaryIcon,
  onPrimary,
  secondaryActions = [],
  disabled = false,
  loading = false,
  className = '',
}: {
  primaryLabel: string;
  primaryIcon?: string;
  onPrimary: () => void;
  secondaryActions?: MobileAction[];
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={`mobile-sticky-actionbar lg:hidden ${className}`}>
      <button
        type="button"
        onClick={onPrimary}
        disabled={disabled || loading}
        className="mobile-sticky-actionbar__primary"
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : primaryIcon ? (
          <MobileIcon name={primaryIcon} className="text-[19px]" />
        ) : null}
        <span>{loading ? 'Working' : primaryLabel}</span>
      </button>

      {secondaryActions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className="mobile-sticky-actionbar__secondary"
          aria-label={action.label}
        >
          {action.icon ? <MobileIcon name={action.icon} className="text-[19px]" /> : null}
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}

export function MobileSegmentedControl({
  items,
  value,
  onChange,
  ariaLabel,
  className = '',
}: {
  items: MobileSegmentItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={`mobile-segmented-control ${className}`} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`mobile-segmented-control__item ${active ? 'is-active' : ''}`}
          >
            {item.icon ? <MobileIcon name={item.icon} className="text-[18px]" /> : null}
            <span>{item.label}</span>
            {item.meta ? <small>{item.meta}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

export function MobileToolCard({
  icon,
  title,
  description,
  meta,
  status,
  action,
  children,
  className = '',
}: {
  icon: string;
  title: string;
  description?: string;
  meta?: string;
  status?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mobile-tool-card ${className}`}>
      <div className="mobile-tool-card__header">
        <span className="mobile-tool-card__icon" aria-hidden="true">
          <MobileIcon name={icon} className="text-[22px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
          {meta ? <span className="mobile-tool-card__meta">{meta}</span> : null}
        </div>
        {status ? <div className="mobile-tool-card__status">{status}</div> : null}
      </div>
      {children ? <div className="mobile-tool-card__body">{children}</div> : null}
      {action ? <div className="mobile-tool-card__action">{action}</div> : null}
    </section>
  );
}

export function MobileResultPanel({
  score,
  scoreLabel,
  verdict,
  body,
  warnings = [],
  actions,
  className = '',
}: {
  score?: number | string;
  scoreLabel: string;
  verdict?: string;
  body?: ReactNode;
  warnings?: string[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mobile-result-panel ${className}`}>
      <div className="mobile-result-panel__summary">
        <div>
          <p>{scoreLabel}</p>
          {verdict ? <span>{verdict}</span> : null}
        </div>
        {score !== undefined ? <strong>{score}</strong> : null}
      </div>
      {body ? <div className="mobile-result-panel__body">{body}</div> : null}
      {warnings.length > 0 ? (
        <div className="mobile-result-panel__warnings">
          <MobileIcon name="warning" className="text-[17px]" />
          <span>{warnings.slice(0, 2).join(' ')}</span>
        </div>
      ) : null}
      {actions ? <div className="mobile-result-panel__actions">{actions}</div> : null}
    </section>
  );
}
