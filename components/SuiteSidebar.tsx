'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { authHelpers } from '@/lib/firebase';
import { useStore } from '@/lib/store';
import LogoutModal from './modals/LogoutModal';
import AuthModal from './modals/AuthModal';
import { useUserTier, type PlanTier } from '@/hooks/use-user-tier';
import UsageCounter from '@/components/UsageCounter';
import ThemeToggle from '@/components/ThemeToggle';
import { SonaMark } from '@/components/sona';
import { TalentConsultingMark, TalentConsultingWordmark } from '@/components/BrandLogo';
import { authFetch } from '@/lib/auth-fetch';
import { getPlanIdentity } from '@/lib/plan-identity';
import { PlanBadge, PlanStatusStrip } from '@/components/plan/PlanIdentity';
import { UPGRADE_COPY } from '@/lib/product-copy';

// Dynamic job count hook for the sidebar badge. Only the count is stored locally,
// scoped to the signed-in user; tailored job payloads stay server-side.
const LEGACY_JOB_CACHE_KEY = 'talent-job-widget-cache';
const LEGACY_JOB_COUNT_KEY = 'talent-job-curated-count';

function jobCountKey(uid: string) {
  return `talent-job-curated-count:${uid}`;
}

function useJobCount() {
  const [count, setCount] = useState<number>(0);
  const user = useStore((s) => s.user);
  const fetchedUidRef = useRef('');

  useEffect(() => {
    const uid = String((user as any)?.uid || '');
    localStorage.removeItem(LEGACY_JOB_CACHE_KEY);
    localStorage.removeItem(LEGACY_JOB_COUNT_KEY);
    if (!uid) fetchedUidRef.current = '';

    const read = () => {
      if (!uid) {
        setCount(0);
        return;
      }
      const cachedCount = localStorage.getItem(jobCountKey(uid));
      setCount(cachedCount ? parseInt(cachedCount, 10) || 0 : 0);
    };
    read();
    window.addEventListener('job-count-updated', read);
    window.addEventListener('storage', read);

    const token = (user as any)?.accessToken || (user as any)?.stsTokenManager?.accessToken;
    if (user && uid && token && fetchedUidRef.current !== uid) {
      fetchedUidRef.current = uid;
      // Fire a lightweight fetch to get count
      fetch('/api/jobs/suggestions', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
          if (fetchedUidRef.current !== uid) return;
          if (data.needsSetup) {
            setCount(0);
            localStorage.setItem(jobCountKey(uid), '0');
          } else if (data.success && Array.isArray(data.jobs)) {
            const nextCount = data.jobs.length;
            setCount(nextCount);
            localStorage.setItem(jobCountKey(uid), nextCount.toString());
          }
        })
        .catch(() => {
          if (fetchedUidRef.current === uid) fetchedUidRef.current = '';
        });
    }

    return () => {
      window.removeEventListener('job-count-updated', read);
      window.removeEventListener('storage', read);
    };
  }, [user]);
  return count;
}

interface NavigationItem {
  id: string;
  label: string;
  description: string;
  path: string;
  badge?: string;
  iconName: string;
  color: { iconColor: string };
}

interface NavigationGroup {
  label: string;
  icon: string;
  items: NavigationItem[];
}

const navGroups: NavigationGroup[] = [
  // ─── Pinned: Sona Agent ───
  {
    label: '',
    icon: '',
    items: [
      {
        id: 'agent',
        label: 'Sona Agent',
        description: 'Career Intelligence AI',
        path: '/suite/agent',
        badge: 'MAX',
        iconName: 'auto_awesome',
        color: { iconColor: '#f43f5e' },
      },
    ],
  },
  // ─── Phase 1: Build your materials ───
  {
    label: 'Build',
    icon: 'construction',
    items: [
      {
        id: 'resume',
        label: 'Resume Studio',
        description: 'Resume Builder + AI Morph',
        path: '/suite/resume',
        iconName: 'description',
        color: { iconColor: '#f59e0b' },
      },
      {
        id: 'ats-analyzer',
        label: 'ATS Analyzer',
        description: 'Preview + Match Score',
        path: '/suite/ats-analyzer',
        iconName: 'scanner',
        color: { iconColor: '#06b6d4' },
      },
      {
        id: 'writing-toolkit',
        label: 'Writing Toolkit',
        description: 'Cover letters, LinkedIn, humanizer, and messages',
        path: '/suite/gallery',
        iconName: 'widgets',
        color: { iconColor: '#8b5cf6' },
      },
    ],
  },
  // ─── Phase 2: Find & track jobs ───
  {
    label: 'Search and Apply',
    icon: 'work',
    items: [
      {
        id: 'job-search',
        label: 'Job Search',
        description: 'AI Opportunity Radar',
        path: '/suite/job-search',
        iconName: 'radar',
        color: { iconColor: '#06b6d4' },
      },
      {
        id: 'oracle',
        label: 'Market Oracle',
        description: 'JD Decoder + Fit Score',
        path: '/suite/market-oracle',
        iconName: 'troubleshoot',
        color: { iconColor: '#a855f7' },
      },
      {
        id: 'applications',
        label: 'Applications',
        description: 'Pipeline Tracker',
        path: '/suite/applications',
        iconName: 'work',
        color: { iconColor: '#1a73e8' },
      },
      {
        id: 'network',
        label: 'Network CRM',
        description: 'Contact Tracker',
        path: '/suite/network',
        iconName: 'contacts',
        color: { iconColor: '#8b5cf6' },
      },
      {
        id: 'agent-queue',
        label: 'Agent Queue',
        description: 'AI-Prepared Applications',
        path: '/suite/agent/queue',
        iconName: 'smart_toy',
        color: { iconColor: '#06b6d4' },
      },
    ],
  },
  // ─── Phase 3: Prepare for interviews ───
  {
    label: 'Prepare',
    icon: 'school',
    items: [
      {
        id: 'interview-sim',
        label: 'Interview Studio',
        description: 'Sona Mock + Avatar + Debrief',
        path: '/suite/interview-sim',
        iconName: 'interpreter_mode',
        color: { iconColor: '#06b6d4' },
      },
      {
        id: 'stories',
        label: 'Story Bank',
        description: 'STAR Stories + Answer RAG',
        path: '/suite/agent/stories',
        iconName: 'auto_stories',
        color: { iconColor: '#2563eb' },
      },
      {
        id: 'skill-bridge',
        label: 'Skill Bridge',
        description: 'Gap-to-Ready Paths',
        path: '/suite/skill-bridge',
        iconName: 'route',
        color: { iconColor: '#64748b' },
      },
    ],
  },
  // ─── Phase 4: Close & grow ───
  {
    label: 'Grow',
    icon: 'trending_up',
    items: [
      {
        id: 'intelligence',
        label: 'Career Intelligence',
        description: 'Health Score + Pulse + Insights',
        path: '/suite/intelligence',
        iconName: 'neurology',
        color: { iconColor: '#8b5cf6' },
      },
    ],
  },
];

const GUEST_PREVIEW_BY_SUITE_PATH: Record<string, string> = {
  '/suite/resume': '/?tool=resume-check',
  '/suite/ats-analyzer': '/?tool=ats-analyzer',
  '/suite/gallery': '/?tool=quick-polish',
  '/suite/writing-tools': '/?tool=writing-trust',
};

const ROOT_TOOL_BY_ITEM_ID: Record<string, string[]> = {
  resume: ['resume-check'],
  'ats-analyzer': ['ats-analyzer'],
  'writing-toolkit': ['quick-polish', 'writing-trust'],
};

interface SidebarDensity {
  itemHeight: number;
  itemFont: number;
  iconSize: number;
  iconFont: number;
  groupHeight: number;
  groupIcon: number;
  groupFont: number;
}

const DEFAULT_SIDEBAR_DENSITY: SidebarDensity = {
  itemHeight: 34,
  itemFont: 14,
  iconSize: 26,
  iconFont: 21,
  groupHeight: 22,
  groupIcon: 16,
  groupFont: 10,
};

const SIDEBAR_TOOL_ROW_GAP = 6;
const SIDEBAR_GROUP_TOP_MARGIN = 4;

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 1024;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function shouldUpdateDensity(current: SidebarDensity, next: SidebarDensity) {
  return (Object.keys(next) as (keyof SidebarDensity)[]).some((key) => Math.abs(current[key] - next[key]) > 0.5);
}

interface SidebarIconActionProps {
  label: string;
  iconName: string;
  color: string;
  isCollapsed: boolean;
  active?: boolean;
  pressed?: boolean;
  compact?: boolean;
  onClick: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement>;
  ariaHaspopup?: 'dialog';
  ariaExpanded?: boolean;
}

function SidebarIconAction({
  label,
  iconName,
  color,
  isCollapsed,
  active = false,
  pressed = false,
  compact = false,
  onClick,
  buttonRef,
  ariaHaspopup,
  ariaExpanded,
}: SidebarIconActionProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-haspopup={ariaHaspopup}
      aria-expanded={ariaExpanded}
      className={`group relative min-w-0 rounded-[12px] border text-[var(--sidebar-text)] transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)] ${
        isCollapsed
          ? 'flex h-9 w-full items-center justify-center px-0'
          : compact
            ? 'flex h-10 w-full items-center justify-center px-0'
          : 'flex h-[52px] flex-col items-center justify-center gap-1 px-1.5 py-2'
      } ${
        active || pressed
          ? 'border-[var(--border-subtle)] bg-[var(--sidebar-active)] text-[var(--text-primary)]'
          : 'border-transparent hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      <span
        className={`material-symbols-rounded flex items-center justify-center rounded-[11px] transition-transform duration-150 group-hover:scale-[1.04] ${
          isCollapsed
            ? 'h-8 w-8 text-[22px]'
            : compact
              ? 'h-8 w-8 text-[22px]'
              : 'h-8 w-8 text-[22px]'
        }`}
        style={{ color: active || pressed ? color : 'var(--sidebar-text)' }}
      >
        {iconName}
      </span>
      {!isCollapsed && !compact && (
        <span className="max-w-full truncate text-[11px] font-medium leading-none">
          {label}
        </span>
      )}
    </button>
  );
}

interface SidebarCommandDockProps {
  user: any;
  isCollapsed: boolean;
  routeKey: string;
  handleNav: (path: string) => void;
  isActive: (path: string) => boolean;
  onLogout: () => void;
  onSignIn: () => void;
}

function SidebarCommandDock({ user, isCollapsed, routeKey, handleNav, isActive, onLogout, onSignIn }: SidebarCommandDockProps) {
  const isAdmin = !!user?.email && ['alula2006@gmail.com'].includes(user.email.toLowerCase());
  const compactDock = !isCollapsed;
  const accountLabel = user
    ? `${user.displayName || user.email?.split('@')[0] || 'Account'} - sign out`
    : 'Sign in';
  const accountAction = (
    <button
      key="account"
      type="button"
      onClick={user ? onLogout : onSignIn}
      title={accountLabel}
      aria-label={accountLabel}
      className="group relative flex h-10 w-full min-w-0 items-center justify-center rounded-[12px] border border-transparent text-[var(--sidebar-text)] outline-none transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]"
    >
      {user ? (
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[13px] font-semibold text-[var(--text-secondary)] transition-transform duration-150 group-hover:scale-[1.04]">
          {user.email?.[0].toUpperCase() || '?'}
        </span>
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--sidebar-text)] transition-transform duration-150 group-hover:scale-[1.04]">
          <span className="material-symbols-rounded text-[21px]">login</span>
        </span>
      )}
    </button>
  );
  const themeAction = (
    <div
      key="theme"
      className={`flex w-full min-w-0 items-center justify-center rounded-[12px] border border-transparent text-[var(--sidebar-text)] ${
        isCollapsed ? 'h-9' : 'h-10'
      }`}
      title="Toggle light and dark mode"
    >
      <ThemeToggle size="sm" />
    </div>
  );
  const actionMap = {
    admin: (
      <SidebarIconAction
        key="admin"
        label="Admin"
        iconName="shield"
        color="#f59e0b"
        isCollapsed={isCollapsed}
        compact={compactDock}
        active={isActive('/suite/admin')}
        onClick={() => handleNav('/suite/admin')}
      />
    ),
    settings: (
      <SidebarIconAction
        key="settings"
        label="Settings"
        iconName="settings"
        color="#94a3b8"
        isCollapsed={isCollapsed}
        compact={compactDock}
        active={isActive('/suite/settings')}
        onClick={() => handleNav('/suite/settings')}
      />
    ),
  };

  if (isCollapsed) {
    return (
      <div className="mx-1.5 mb-1.5 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1">
        <div className="flex flex-col gap-1">
          {isAdmin && actionMap.admin}
          {themeAction}
          {actionMap.settings}
        </div>
      </div>
    );
  }

  const actions = isAdmin
    ? [accountAction, themeAction, actionMap.admin, actionMap.settings]
    : [accountAction, themeAction, actionMap.settings];

  return (
    <div className="mx-1.5 mb-1.5 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className={`grid gap-1 ${actions.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {actions}
      </div>
    </div>
  );
}

interface SidebarUpgradeCTAProps {
  user: any;
  tier: PlanTier;
  isPro: boolean;
  isCollapsed: boolean;
  loading: boolean;
  billingLoading: boolean;
  onUpgrade: (path?: string) => void;
  onManageBilling: () => void;
}

function SidebarUpgradeCTA({
  user,
  tier,
  isPro,
  isCollapsed,
  loading,
  billingLoading,
  onUpgrade,
  onManageBilling,
}: SidebarUpgradeCTAProps) {
  const plan = getPlanIdentity(tier);
  const isMax = plan.id === 'studio';

  if (loading && user) {
    return (
      <div className="mx-1.5 mb-1.5 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1">
        <div className={isCollapsed ? 'flex h-9 items-center justify-center' : 'space-y-2 rounded-[14px] px-2.5 py-2.5'}>
          {isCollapsed ? (
            <span className="material-symbols-rounded animate-pulse text-[18px] text-[var(--text-muted)]">hourglass_top</span>
          ) : (
            <>
              <div className="h-2 w-20 rounded-full bg-[var(--bg-hover)]" />
              <div className="h-2 w-28 rounded-full bg-[var(--bg-hover)]" />
            </>
          )}
        </div>
      </div>
    );
  }

  if (isCollapsed) {
    return (
      <div className="mx-1.5 mb-1.5 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1">
        <button
          type="button"
          onClick={isPro ? onManageBilling : () => onUpgrade()}
          title={isPro ? `${plan.displayName} active - manage billing` : 'Upgrade to Talent Pro or Max'}
          aria-label={isPro ? `${plan.displayName} active. Manage billing.` : 'Upgrade to Talent Pro or Max'}
          className="group flex h-9 w-full items-center justify-center rounded-[13px] text-[var(--sidebar-text)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-blue-500/30"
        >
          <span className="material-symbols-rounded text-[19px] transition-transform group-hover:scale-105">
            {isPro ? plan.icon : 'rocket_launch'}
          </span>
        </button>
      </div>
    );
  }

  if (isPro) {
    return (
      <div className="mx-1.5 mb-1.5 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1">
        <div className="space-y-2 rounded-[14px] px-2.5 py-2.5">
          <PlanStatusStrip
            tier={tier}
            title={`${plan.displayName} active`}
            caption="Stripe billing controls"
            compact
          />
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={onManageBilling}
              disabled={billingLoading}
              className="flex min-h-8 flex-1 items-center justify-center rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-2 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 disabled:opacity-60"
            >
              {billingLoading ? 'Opening...' : 'Manage'}
            </button>
            {!isMax && (
              <button
                type="button"
                onClick={() => onUpgrade('/suite/upgrade?plan=studio')}
                className="flex min-h-8 items-center justify-center rounded-[11px] px-2 text-[11px] font-semibold text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
              >
                Explore Max
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-1.5 mb-1.5 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1">
      <div className="rounded-[14px] px-2.5 py-2.5">
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
            <span className="material-symbols-rounded text-[18px]">rocket_launch</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold leading-tight text-[var(--text-primary)]">
              Upgrade
              <PlanBadge tier="free" size="xs" />
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-[var(--text-muted)]">
              {UPGRADE_COPY.sidebarPlanChoice}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onUpgrade()}
          className="mt-2 flex min-h-8 w-full items-center justify-center gap-1 rounded-[11px] px-3 text-[11px] font-semibold transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35"
          style={{ background: getPlanIdentity('pro').accent, color: getPlanIdentity('pro').buttonText }}
        >
          <span className="material-symbols-rounded text-[14px]">bolt</span>
          View Pro / Max
        </button>
      </div>
    </div>
  );
}

interface AccountCapsuleProps {
  user: any;
  tier: string;
  isPro: boolean;
  isCollapsed: boolean;
  onLogout: () => void;
  onSignIn: () => void;
}

function AccountCapsule({ user, tier, isPro, isCollapsed, onLogout, onSignIn }: AccountCapsuleProps) {
  if (!user) {
    return (
      <div className="mx-1.5 mb-1.5 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1">
        <button
          type="button"
          onClick={onSignIn}
          title="Sign in"
          aria-label="Sign in"
          className={`w-full rounded-[13px] text-[var(--sidebar-text)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-cyan-500/30 ${isCollapsed ? 'flex h-9 items-center justify-center' : 'flex items-center gap-2 px-2 py-2 text-left'}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-500">
            <span className="material-symbols-rounded text-[18px]">login</span>
          </span>
          {!isCollapsed && (
            <span className="min-w-0">
              <span className="block text-xs font-semibold leading-tight text-[var(--text-primary)]">Sign in</span>
              <span className="block truncate text-[10px] leading-tight text-[var(--text-muted)]">Create a free account</span>
            </span>
          )}
        </button>
      </div>
    );
  }

  const displayName = user.displayName || user.email?.split('@')[0] || 'User';
  const plan = getPlanIdentity(tier);

  if (isCollapsed) {
    return (
      <div className="mx-1.5 mb-1.5 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1">
        <div
          title={`${displayName}${user.email ? `, ${user.email}` : ''}`}
          className="flex h-9 w-full items-center justify-center rounded-[13px]"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-hover)] text-[12px] font-semibold text-[var(--text-secondary)]">
            {user.email?.[0].toUpperCase() || '?'}
          </span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="Sign out"
          aria-label="Sign out"
          className="mt-1 flex h-8 w-full items-center justify-center rounded-[12px] text-red-500 outline-none transition-colors hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-500/25"
        >
          <span className="material-symbols-rounded text-[18px]">logout</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mx-1.5 mb-1.5 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1">
      <div className="flex min-w-0 items-center gap-2 rounded-[14px] px-2 py-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-hover)] text-[12px] font-semibold text-[var(--text-secondary)]">
          {user.email?.[0].toUpperCase() || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold leading-tight text-[var(--text-primary)]">
            <span className="min-w-0 truncate" title={displayName}>{displayName}</span>
            {isPro && <PlanBadge tier={plan.id} size="xs" active className="shrink-0" />}
          </p>
          <p className="mt-0.5 truncate text-[10px] leading-tight text-[var(--text-muted)]" title={user.email || ''}>
            {user.email}
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="Sign out"
          aria-label="Sign out"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] text-red-500 outline-none transition-colors hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-500/25"
        >
          <span className="material-symbols-rounded text-[18px]">logout</span>
        </button>
      </div>
    </div>
  );
}

interface SuiteSidebarProps {
  onNavigate?: () => void;
}

export default function SuiteSidebar({ onNavigate }: SuiteSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, setUser } = useStore();
  const navRef = useRef<HTMLElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(isMobileViewport);
  const { tier, isPro, loading: tierLoading } = useUserTier();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState<'login' | 'signup' | null>(null);
  const [postAuthRedirect, setPostAuthRedirect] = useState<string | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [density, setDensity] = useState<SidebarDensity>(DEFAULT_SIDEBAR_DENSITY);
  const jobCount = useJobCount();
  const activeRootTool = searchParams.get('tool') || '';
  const isDashboardActive = pathname === '/' || pathname === '/suite';

  useEffect(() => {
    const check = () => setIsMobile(isMobileViewport());
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const openMobileMenu = () => {
      if (window.innerWidth < 1024) setIsMobileOpen(true);
    };
    window.addEventListener('talent:open-mobile-menu', openMobileMenu);
    return () => window.removeEventListener('talent:open-mobile-menu', openMobileMenu);
  }, []);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('tc-sidebar-collapsed-groups');
      if (stored) setCollapsedGroups(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--suite-sidebar-content-offset', isCollapsed ? '86px' : '260px');
    return () => {
      document.documentElement.style.removeProperty('--suite-sidebar-content-offset');
    };
  }, [isCollapsed]);

  useEffect(() => {
    if (isCollapsed) return;

    const updateDensity = () => {
      const nav = navRef.current;
      if (!nav) return;

      const visibleItemCount = navGroups.reduce((count, group) => {
        if (group.label && collapsedGroups[group.label]) return count;
        return count + group.items.length;
      }, 0);
      const visibleGroupCount = navGroups.filter(group => group.label).length;
      const visibleItemGapCount = navGroups.reduce((count, group) => {
        if (group.label && collapsedGroups[group.label]) return count;
        return count + Math.max(group.items.length - 1, 0);
      }, 0);
      const navHeight = nav.clientHeight;
      if (!navHeight || !visibleItemCount) return;

      const groupHeight = clamp(navHeight * 0.03, 18, 22);
      const reservedSpacing = visibleItemGapCount * SIDEBAR_TOOL_ROW_GAP + visibleGroupCount * SIDEBAR_GROUP_TOP_MARGIN;
      const availableForItems = navHeight - visibleGroupCount * groupHeight - reservedSpacing;
      const itemHeight = clamp(availableForItems / visibleItemCount, 28, 40);
      const next: SidebarDensity = {
        itemHeight,
        itemFont: clamp(itemHeight * 0.38, 12.5, 14.5),
        iconSize: clamp(itemHeight * 0.74, 22, 29),
        iconFont: clamp(itemHeight * 0.58, 17, 23),
        groupHeight,
        groupIcon: clamp(groupHeight * 0.68, 14, 17),
        groupFont: clamp(groupHeight * 0.42, 9, 10.5),
      };

      setDensity(current => shouldUpdateDensity(current, next) ? next : current);
    };

    updateDensity();
    const resizeObserver = new ResizeObserver(updateDensity);
    if (navRef.current) resizeObserver.observe(navRef.current);
    window.addEventListener('resize', updateDensity);
    const timer = window.setTimeout(updateDensity, 80);

    return () => {
      window.clearTimeout(timer);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDensity);
    };
  }, [collapsedGroups, isCollapsed, isMobile, isPro]);

  const handleNav = (path: string) => {
    const guestPreview = GUEST_PREVIEW_BY_SUITE_PATH[path];
    if (!user && guestPreview) {
      router.push(guestPreview);
      onNavigate?.();
      return;
    }

    if (!user && path.startsWith('/suite')) {
      setPostAuthRedirect(path);
      setShowAuthModal('signup');
      onNavigate?.();
      return;
    }

    router.push(path);
    onNavigate?.();
  };

  const handleUpgrade = (path = '/suite/upgrade') => {
    if (!user) {
      setPostAuthRedirect(path);
      setShowAuthModal('signup');
      return;
    }
    handleNav(path);
  };

  const handleManageBilling = async () => {
    if (!user) {
      setPostAuthRedirect('/suite/settings?tab=subscription');
      setShowAuthModal('login');
      return;
    }

    setBillingLoading(true);
    try {
      const res = await authFetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
    } catch {
      // Fall through to the in-app billing settings fallback.
    }

    setBillingLoading(false);
    handleNav('/suite/settings?tab=subscription');
  };

  useEffect(() => {
    if (!user || !postAuthRedirect) return;
    const target = postAuthRedirect;
    setPostAuthRedirect(null);
    setShowAuthModal(null);
    handleNav(target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, postAuthRedirect]);

  const confirmLogout = async () => {
    const uid = String((user as any)?.uid || '');
    if (uid) localStorage.removeItem(jobCountKey(uid));
    localStorage.removeItem(LEGACY_JOB_CACHE_KEY);
    localStorage.removeItem(LEGACY_JOB_COUNT_KEY);
    await authHelpers.signOut();
    setUser(null);
    router.push('/');
    setShowLogoutModal(false);
  };

  const isActive = (path: string) => path === '/suite' ? isDashboardActive : pathname?.startsWith(path);
  const isItemActive = (item: NavigationItem) => {
    const rootTools = ROOT_TOOL_BY_ITEM_ID[item.id];
    if (pathname === '/' && rootTools?.includes(activeRootTool)) return true;
    if (item.id === 'writing-toolkit') {
      return ['/suite/gallery', '/suite/cover-letter', '/suite/linkedin', '/suite/writing-tools'].some(path => pathname?.startsWith(path));
    }
    return isActive(item.path);
  };
  const shellWidth = isMobile ? 286 : isCollapsed ? 62 : 240;
  const shellOffset = isMobile ? 10 : 10;
  const shellVerticalOffset = isMobile ? 10 : 6;
  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        localStorage.setItem('tc-sidebar-collapsed-groups', JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const sidebarItemClass = (active = false) => `relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl leading-4 transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 ${
    active
      ? 'bg-[var(--theme-surface-active)] text-[var(--sidebar-text-active)] border border-[var(--theme-border,var(--border-subtle))] shadow-[0_2px_8px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.08)]'
      : 'bg-transparent text-[var(--sidebar-text)] hover:bg-[var(--theme-surface-hover)] hover:text-[var(--sidebar-text-active)] border border-transparent'
  } ${isCollapsed ? 'justify-center gap-0 px-2' : ''}`;
  const iconShell = (active: boolean, color: string) => ({
    backgroundColor: active ? `${color}18` : 'var(--bg-elevated)',
    boxShadow: active
      ? `inset 0 0 0 1px ${color}28, 0 1px 3px rgba(0,0,0,0.10)`
      : 'inset 0 0 0 1px var(--border-subtle), inset 0 1px 0 rgba(255,255,255,0.03)',
    color: active ? color : 'var(--sidebar-text)',
  });

  return (
    <>
      {/* Mobile toggle */}
      {isMobile && (
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="fixed top-3 left-3 z-[60] p-2 rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--sidebar-text)] shadow-[0_10px_30px_rgba(15,23,42,0.14)] hover:text-[var(--sidebar-text-active)] transition-colors duration-100"
        >
          {isMobileOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          )}
        </button>
      )}

      {/* Mobile overlay */}
      {isMobile && isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 bg-black/50 z-40"
        />
      )}

      {/* Sidebar */}
      <aside
        aria-hidden={isMobile && !isMobileOpen ? true : undefined}
        inert={isMobile && !isMobileOpen ? true : undefined}
        style={{
          width: shellWidth,
          left: shellOffset,
          top: shellVerticalOffset,
          bottom: shellVerticalOffset,
          height: `calc(100dvh - ${shellVerticalOffset * 2}px)`,
          transform: isMobile ? (isMobileOpen ? 'translateX(0)' : 'translateX(calc(-100% - 16px))') : 'translateX(0)',
        }}
        className="fixed z-50 flex flex-col overflow-hidden rounded-[22px] border border-[var(--border-subtle)] bg-[var(--sidebar-bg)] shadow-[0_18px_60px_rgba(15,23,42,0.12)] transition-all duration-200 ease-out"
      >
        {/* Header */}
        <div className="p-1 pb-0.5">
          <div className={`flex items-center justify-between rounded-[15px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2 py-1 ${isCollapsed ? 'justify-center px-1.5' : ''}`}>
          {!isCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <TalentConsultingMark className="h-8 w-8 rounded-[13px] border border-[var(--border-subtle)]" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <TalentConsultingWordmark className="w-[132px] max-w-full" />
                <span className="block text-[11px] leading-tight text-[var(--text-muted)] truncate">Career command</span>
              </div>
            </div>
          )}
          {!isMobile && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded-[11px] hover:bg-[var(--bg-hover)] text-[var(--sidebar-text)] hover:text-[var(--sidebar-text-active)] transition-colors duration-100 flex-shrink-0"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ transform: isCollapsed ? 'rotate(180deg)' : 'none' }}>
                <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          )}
          </div>
        </div>

        {/* Dashboard link */}
        <div className="px-1.5 pb-0.5">
          <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <button
            onClick={() => handleNav('/')}
            className={sidebarItemClass(isDashboardActive)}
            style={{ minHeight: density.itemHeight, fontSize: density.itemFont }}
            title="Dashboard"
          >
            {isDashboardActive && !isCollapsed && (
              <div className="absolute inset-y-0 right-2 flex items-center justify-center">
                <motion.div
                  layoutId="sidebarActiveIndicator"
                  className="h-6 w-1.5 rounded-full"
                  style={{ backgroundColor: '#1a73e8' }}
                />
              </div>
            )}
            <span
              className="material-symbols-rounded flex flex-shrink-0 items-center justify-center rounded-[8px] transition-colors"
              style={{
                ...iconShell(isDashboardActive, '#1a73e8'),
                height: density.iconSize,
                width: density.iconSize,
                fontSize: density.iconFont,
              }}
            >home</span>
            {!isCollapsed && <span className="min-w-0 flex-1 truncate text-left font-[500]">Dashboard</span>}
          </button>
          </div>
        </div>

        {/* Navigation — full tool directory in expanded mode, compact icon rail when collapsed */}
        <nav ref={navRef} className="scrollbar-hide min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 pb-0.5">
          {navGroups.map((group, gi) => {
            const isExpanded = !group.label || !collapsedGroups[group.label];
            const hasActiveChild = group.items.some(item => isItemActive(item));

            return (
              <div key={gi}>
                {/* Section header */}
                {group.label && !isCollapsed && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={isExpanded}
                    className={`mt-1 flex w-full items-center gap-1 rounded-[10px] px-2 py-0 transition-colors ${
                      hasActiveChild
                        ? 'text-[var(--sidebar-text-active)]'
                        : 'text-[var(--sidebar-text)] hover:bg-[var(--bg-hover)] hover:text-[var(--sidebar-text-active)]'
                    }`}
                    style={{ minHeight: density.groupHeight }}
                  >
                    <span
                      className="material-symbols-rounded text-current transition-transform duration-150"
                      style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: density.groupIcon }}
                    >
                      chevron_right
                    </span>
                    <span
                      className="flex-1 text-left font-semibold uppercase tracking-[0.16em] text-current"
                      style={{ fontSize: density.groupFont }}
                    >
                      {group.label}
                    </span>
                    {!isExpanded && hasActiveChild && (
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                    )}
                    <span className="rounded-full px-1.5 py-0 text-[9px] font-semibold leading-4 tabular-nums text-current opacity-70">
                      {group.items.length}
                    </span>
                  </button>
                )}
                {group.label && isCollapsed && (
                  <div className="mx-auto my-1.5 h-px w-8 bg-[var(--border-subtle)]" />
                )}

                {/* Items */}
                {(isExpanded || isCollapsed) && (
                  <div className={`rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1 shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${!isCollapsed ? '' : ''}`}>
                  <div style={{ display: 'grid', rowGap: 3 }}>
                    {group.items.map((item) => {
                      const active = isItemActive(item);
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleNav(item.path)}
                          className={sidebarItemClass(active)}
                          style={{ minHeight: density.itemHeight, fontSize: density.itemFont }}
                          title={isCollapsed ? item.label : item.description}
                        >
                          {active && !isCollapsed && (
                            <div className="absolute inset-y-0 right-2 flex items-center justify-center z-10">
                              <motion.div
                                layoutId="sidebarActiveIndicator"
                                className="h-6 w-1.5 rounded-full"
                                style={{ backgroundColor: item.color.iconColor }}
                              />
                            </div>
                          )}
                          {item.id === 'agent' ? (
                            <span
                              className="sona-sidebar-presence flex flex-none flex-shrink-0 items-center justify-center"
                              style={{ height: density.iconSize, width: density.iconSize }}
                            >
                              <SonaMark size="xs" state={active ? 'responding' : 'idle'} />
                            </span>
                          ) : (
                            <span
                              className="material-symbols-rounded flex flex-none flex-shrink-0 items-center justify-center rounded-[8px]"
                              style={{
                                ...iconShell(active, item.color.iconColor),
                                height: density.iconSize,
                                width: density.iconSize,
                                fontSize: density.iconFont,
                              }}
                            >
                              {item.iconName}
                            </span>
                          )}

                          {!isCollapsed && (
                            <span className="min-w-0 flex-1 truncate text-left font-[500]">{item.label}</span>
                          )}

                          {!isCollapsed && item.badge && !(item.id === 'job-search' && jobCount > 0) && (
                            item.badge === 'PRO' || item.badge === 'MAX'
                              ? <PlanBadge tier={item.badge === 'MAX' ? 'studio' : 'pro'} size="xs" active={item.badge === 'MAX'} />
                              : (
                                <span className="rounded-full bg-[var(--bg-hover)] px-1.5 py-0 text-[10px] font-semibold leading-4 text-[var(--text-muted)]">
                                  {item.badge}
                                </span>
                              )
                          )}
                          {!isCollapsed && item.id === 'job-search' && jobCount > 0 && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-cyan-500/15 text-cyan-500 border border-cyan-500/20 tabular-nums leading-4">
                              {jobCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  </div>
                )}
              </div>
            );
          })}

        </nav>

        <SidebarUpgradeCTA
          user={user}
          tier={tier}
          isPro={isPro}
          isCollapsed={isCollapsed}
          loading={tierLoading}
          billingLoading={billingLoading}
          onUpgrade={handleUpgrade}
          onManageBilling={handleManageBilling}
        />

        {/* Free usage */}
        {!isPro && (
          <div className="mx-1.5 mb-1.5 hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1 [@media(min-height:760px)]:block">
            {!isCollapsed && (
              <div className="hidden [@media(min-height:860px)]:block">
                <UsageCounter compact showUpgradeWhenExhausted />
              </div>
            )}
            {isCollapsed && (
              <div className="px-1 py-1.5 text-center text-[10px] font-semibold text-[var(--text-muted)]" title="Free usage">
                <span className="material-symbols-rounded text-[18px]">timelapse</span>
              </div>
            )}
          </div>
        )}

        <SidebarCommandDock
          user={user}
          isCollapsed={isCollapsed}
          routeKey={pathname || ''}
          handleNav={handleNav}
          isActive={isActive}
          onLogout={() => setShowLogoutModal(true)}
          onSignIn={() => setShowAuthModal('login')}
        />

        {isCollapsed && (
          <AccountCapsule
            user={user}
            tier={tier}
            isPro={isPro}
            isCollapsed={isCollapsed}
            onLogout={() => setShowLogoutModal(true)}
            onSignIn={() => setShowAuthModal('login')}
          />
        )}
      </aside>

      <LogoutModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={confirmLogout}
      />

      {showAuthModal && (
        <AuthModal
          mode={showAuthModal}
          onClose={() => setShowAuthModal(null)}
          onSwitchMode={() => setShowAuthModal(showAuthModal === 'login' ? 'signup' : 'login')}
          postAuthRedirect={postAuthRedirect}
        />
      )}
    </>
  );
}
