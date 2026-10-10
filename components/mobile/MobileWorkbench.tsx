'use client';

import { TacoBrandSymbol } from '@/components/BrandLogo';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { assistantWorkspaceDestination, getGuestWorkspaceHref, isWorkspaceDestinationActive, primaryWorkspaceDestinations, workspaceDestinations, workspaceQuickActions } from '@/lib/workspace-navigation';
import AuthModal from '@/components/modals/AuthModal';
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

const MOBILE_DESTINATIONS = [...primaryWorkspaceDestinations, assistantWorkspaceDestination];
const TOOL_GROUPS = [
  { label: 'Your workspace', items: MOBILE_DESTINATIONS },
  { label: 'More tools', items: workspaceDestinations.filter(item => item.placement === 'tool') },
  { label: 'Writing tools', items: workspaceDestinations.filter(item => item.placement === 'writing') },
  { label: 'Quick actions', items: workspaceQuickActions },
  { label: 'Account and help', items: workspaceDestinations.filter(item => item.placement === 'utility') },
];

function useMobileWorkspaceNavigation() {
  const router = useRouter();
  const user = useStore(state => state.user);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);


  const hrefFor = (path: string) => !user ? getGuestWorkspaceHref(path) || path : path;
  const navigate = (path: string) => {
    const guestHref = getGuestWorkspaceHref(path);
    if (!user && !guestHref) {
      setPendingPath(path);
      setAuthMode('signup');
    } else router.push(!user ? guestHref! : path);
  };

  return {
    hrefFor,
    navigate,
    authModal: authMode ? (
      <AuthModal
        mode={authMode}
        onClose={() => { setAuthMode(null); setPendingPath(null); }}
        onSwitchMode={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
        postAuthRedirect={pendingPath}
        returnFocusSelector='[data-mobile-tools-launcher="true"]'
      />
    ) : null,
  };
}

export function MobileQuickToolsRail({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const railRef = useRef<HTMLElement | null>(null);
  const pathname = usePathname();
  const { hrefFor, navigate, authModal } = useMobileWorkspaceNavigation();

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const updateHint = () => setShowSwipeHint(rail.scrollWidth - rail.clientWidth - rail.scrollLeft > 28);
    updateHint();
    rail.addEventListener('scroll', updateHint, { passive: true });
    window.addEventListener('resize', updateHint);
    return () => {
      rail.removeEventListener('scroll', updateHint);
      window.removeEventListener('resize', updateHint);
    };
  }, []);

  return (
    <>
      <section className={`mobile-quick-tools lg:hidden ${className}`} aria-label="Your workspace">
        <nav ref={railRef} className="mobile-quick-tools__rail" aria-label="Workspace destinations">
          {MOBILE_DESTINATIONS.map(item => (
            <Link
              key={item.id}
              href={hrefFor(item.path)}
              onClick={event => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                navigate(item.path);
              }}
              aria-current={isWorkspaceDestinationActive(item.id, pathname || '') ? 'location' : undefined}
              className="mobile-quick-tools__item"
            >
              {item.id === 'assistant' ? <TacoBrandSymbol className="h-5 w-6" decorative /> : <MobileIcon name={item.icon} className="text-[19px]" />}
              <span>{item.label}</span>
            </Link>
          ))}
          <button data-mobile-tools-launcher="true" type="button" onClick={() => setOpen(true)} className="mobile-quick-tools__item mobile-quick-tools__item--more" aria-expanded={open} aria-controls="mobile-workspace-tools">
            <MobileIcon name="apps" className="text-[19px]" />
            <span>More tools</span>
          </button>
        </nav>
        {showSwipeHint && <div className="mobile-quick-tools__swipe-hint" aria-hidden="true"><span>Swipe</span><MobileIcon name="arrow_forward" className="text-[15px]" /></div>}
      </section>
      <MobileQuickToolsSheet open={open} onClose={() => setOpen(false)} />
      {authModal}
    </>
  );
}

export function MobileQuickToolsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const { hrefFor, navigate, authModal } = useMobileWorkspaceNavigation();

  useEffect(() => {
    if (!open) return;
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]') || []).filter(element => element.offsetParent !== null);
    focusable()[0]?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === 'Tab') {
        const elements = focusable();
        if (!elements.length) return;
        const index = elements.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && index <= 0) {
          event.preventDefault();
          elements[elements.length - 1].focus();
        } else if (!event.shiftKey && (index < 0 || index === elements.length - 1)) {
          event.preventDefault();
          elements[0].focus();
        }
      }
    };
    const onResize = () => { if (window.innerWidth >= 1024) closeRef.current(); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <>
      {open && (
        <div id="mobile-workspace-tools" className="mobile-quick-tools-sheet lg:hidden" role="dialog" aria-modal="true" aria-label="More tools">
          <button type="button" tabIndex={-1} className="mobile-quick-tools-sheet__backdrop" onClick={onClose} aria-label="Dismiss tools overlay" />
          <section ref={panelRef} className="mobile-quick-tools-sheet__panel">
            <div className="mobile-quick-tools-sheet__header">
              <div className="min-w-0"><p>Your workspace</p><h2>Tools for the task at hand</h2></div>
              <button type="button" onClick={onClose} className="mobile-quick-tools-sheet__close" aria-label="Close tools"><MobileIcon name="close" className="text-[20px]" /></button>
            </div>
            <div className="mobile-quick-tools-sheet__groups">
              {TOOL_GROUPS.map(group => (
                <section key={group.label} className="mobile-quick-tools-sheet__group">
                  <h3>{group.label}</h3>
                  <div className="mobile-quick-tools-sheet__grid">
                    {group.items.map(item => (
                      <Link key={item.id} href={hrefFor(item.path)} onClick={event => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                        event.preventDefault();
                        navigate(item.path);
                        onClose();
                      }} className="mobile-quick-tools-sheet__card">
                        <span className="mobile-quick-tools-sheet__icon" aria-hidden="true">{item.id === 'assistant' ? <TacoBrandSymbol className="h-6 w-8" decorative /> : <MobileIcon name={item.icon} className="text-[21px]" />}</span>
                        <span className="min-w-0"><strong>{item.label}</strong><small>{item.description}</small></span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </div>
      )}
      {authModal}
    </>
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
