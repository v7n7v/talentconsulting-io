'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { authHelpers } from '@/lib/firebase';
import { useStore } from '@/lib/store';
import LogoutModal from './modals/LogoutModal';
import AuthModal from './modals/AuthModal';
import { useUserTier, type PlanTier } from '@/hooks/use-user-tier';
import { AssistantMark } from '@/components/assistant';
import { TalentConsultingMark, TalentConsultingWordmark } from '@/components/BrandLogo';
import { authFetch } from '@/lib/auth-fetch';
import { getPlanIdentity } from '@/lib/plan-identity';
import { PlanBadge } from '@/components/plan/PlanIdentity';
import { UPGRADE_COPY } from '@/lib/product-copy';
import { useTheme } from '@/components/ThemeProvider';
import { NavigationRailRow } from '@/components/navigation/NavigationRailRow';
import { getSidebarPresentation, getSidebarUpgradeRouteOwner } from '@/lib/sidebar-navigation';

// Dynamic job count hook for the sidebar badge. Only the count is stored locally,
// scoped to the signed-in user; tailored job payloads stay server-side.
const LEGACY_JOB_CACHE_KEY = 'talent-job-widget-cache';
const LEGACY_JOB_COUNT_KEY = 'talent-job-curated-count';

function jobCountKey(uid: string) {
  return `talent-job-curated-count:${uid}`;
}

function useJobCount(enabled = true) {
  const [count, setCount] = useState<number>(0);
  const user = useStore((s) => s.user);
  const fetchedUidRef = useRef('');

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return undefined;
    }
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
  }, [enabled, user]);
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
  // ─── Pinned: Ask Taco ───
  {
    label: '',
    icon: '',
    items: [
      {
        id: 'agent',
        label: 'Ask Taco',
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
        description: 'Taco Mock + Avatar + Debrief',
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

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 1024;
}

interface SidebarUtilityRowsProps {
  user: any;
  tier: PlanTier;
  isPro: boolean;
  isCollapsed: boolean;
  loading: boolean;
  billingLoading: boolean;
  usageUsed: number;
  usageCap: number;
  isAdmin: boolean;
  isActive: (path: string) => boolean;
  handleNav: (path: string) => void;
  onUpgrade: (path?: string) => void;
  onManageBilling: () => void;
  onLogout: () => void;
  onSignIn: () => void;
}

function SidebarUtilityRows({
  user,
  tier,
  isPro,
  isCollapsed,
  loading,
  billingLoading,
  usageUsed,
  usageCap,
  isAdmin,
  isActive,
  handleNav,
  onUpgrade,
  onManageBilling,
  onLogout,
  onSignIn,
}: SidebarUtilityRowsProps) {
  const { theme, toggleTheme } = useTheme();
  const plan = getPlanIdentity(tier);
  const isMax = plan.id === 'studio';
  const upgradeRouteOwner = getSidebarUpgradeRouteOwner(tier, '/suite/upgrade');
  const upgradeRouteActive = isActive('/suite/upgrade');
  const remainingUsage = Math.max(0, usageCap - usageUsed);
  const usageExhausted = usageCap > 0 && usageUsed >= usageCap;
  const utilityRows = [
    <NavigationRailRow
      key="billing"
      icon={loading && user ? 'hourglass_top' : isPro ? plan.icon : 'diamond'}
      /* Paid: the plan name is the label, so it can't truncate the way
         "Talent Max · Manage billing" did on one line. Free keeps the second
         line - that copy is the offer, not a restatement of the label. */
      label={loading && user ? 'Loading plan' : isPro ? plan.displayName : 'Upgrade'}
      description={isPro ? undefined : 'Plans, billing & limits'}
      density={isPro ? 'compact' : 'default'}
      trailing={!isCollapsed ? <PlanBadge tier={isPro ? plan.id : 'free'} size="xs" active={isPro} /> : undefined}
      active={upgradeRouteOwner === 'upgrade' && upgradeRouteActive}
      compact={isCollapsed}
      disabled={loading || billingLoading}
      onClick={isPro ? onManageBilling : () => onUpgrade()}
      ariaCurrent={upgradeRouteOwner === 'upgrade' && upgradeRouteActive ? 'page' : undefined}
      ariaLabel={isPro ? `${plan.displayName} active. Manage billing.` : 'Upgrade. Plans, billing and limits.'}
      markerLayoutId={upgradeRouteOwner === 'upgrade' ? 'suiteSidebarActiveIndicator' : undefined}
      title={isPro ? `${plan.displayName} active - manage billing` : UPGRADE_COPY.sidebarPlanChoice}
    />,
    ...(isPro && !isMax
      ? [
          <NavigationRailRow
            key="explore-max"
            icon="auto_awesome"
            label="Explore Max"
            density="compact"
            active={upgradeRouteOwner === 'explore-max' && upgradeRouteActive}
            compact={isCollapsed}
            onClick={() => onUpgrade('/suite/upgrade?plan=studio')}
            ariaCurrent={upgradeRouteOwner === 'explore-max' && upgradeRouteActive ? 'page' : undefined}
            markerLayoutId="suiteSidebarActiveIndicator"
            title="Explore Talent Max"
          />,
        ]
      : []),
    ...(!isPro
      ? [
          <NavigationRailRow
            key="usage"
            icon={usageExhausted ? 'lock_clock' : 'timelapse'}
            label="Free usage"
            description={loading
              ? 'Loading free credits'
              : usageExhausted
                ? UPGRADE_COPY.freeLimitTitle
                : `${remainingUsage} of ${usageCap} credits remaining`}
            trailing={!isCollapsed && !loading
              ? <span className="text-xs font-semibold tabular-nums text-[var(--text-secondary)]">{usageUsed}/{usageCap}</span>
              : undefined}
            compact={isCollapsed}
            interactive={usageExhausted}
            onClick={usageExhausted ? () => onUpgrade() : undefined}
            role={usageExhausted ? undefined : 'status'}
            ariaLabel={loading
              ? 'Free usage. Loading free credits.'
              : usageExhausted
                ? `${UPGRADE_COPY.freeLimitTitle}. ${UPGRADE_COPY.primaryCta}.`
                : `Free usage. ${remainingUsage} of ${usageCap} credits remaining.`}
            title={loading
              ? 'Loading free credits'
              : usageExhausted
                ? UPGRADE_COPY.primaryCta
                : `${remainingUsage} of ${usageCap} credits remaining`}
          />,
        ]
      : []),
    ...(isAdmin
      ? [
          <NavigationRailRow
            key="admin"
            icon="shield"
            label="Admin"
            density="compact"
            active={isActive('/suite/admin')}
            compact={isCollapsed}
            onClick={() => handleNav('/suite/admin')}
            ariaCurrent={isActive('/suite/admin') ? 'page' : undefined}
            markerLayoutId="suiteSidebarActiveIndicator"
            title="Admin"
          />,
        ]
      : []),
    <NavigationRailRow
      key="appearance"
      icon={theme === 'light' ? 'light_mode' : 'dark_mode'}
      label="Appearance"
      density="compact"
      /* The mode moves to the trailing slot so the row stays one line and the
         current state is still readable without relying on the icon alone. */
      /* Inherit the row's ink - the sidebar is a theme-invariant dark surface,
         so re-specifying var(--text-secondary) here resolves to the light-theme
         value and lands at 1.69:1 on the navy. Opacity keeps the hierarchy. */
      trailing={!isCollapsed
        ? <span className="text-xs opacity-70">{theme === 'light' ? 'Light' : 'Dark'}</span>
        : undefined}
      compact={isCollapsed}
      onClick={toggleTheme}
      ariaPressed={theme === 'light'}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    />,
    <NavigationRailRow
      key="settings"
      icon="settings"
      label="Settings"
      density="compact"
      active={isActive('/suite/settings')}
      compact={isCollapsed}
      onClick={() => handleNav('/suite/settings')}
      ariaCurrent={isActive('/suite/settings') ? 'page' : undefined}
      markerLayoutId="suiteSidebarActiveIndicator"
      title="Settings"
    />,
    <NavigationRailRow
      key="account"
      icon={user ? 'logout' : 'login'}
      label={user ? 'Sign out' : 'Sign in'}
      description={user?.email || 'Access your workspace'}
      compact={isCollapsed}
      onClick={user ? onLogout : onSignIn}
      title={user ? `Sign out ${user.email || ''}`.trim() : 'Sign in'}
    />,
  ];

  return (
    <div className="shrink-0 space-y-1.5 px-2 pb-2">
      {utilityRows}
    </div>
  );
}

interface SuiteSidebarProps {
  onNavigate?: () => void;
  suppressDynamicBadges?: boolean;
}

export default function SuiteSidebar({ onNavigate, suppressDynamicBadges = false }: SuiteSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const { user, setUser } = useStore();
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const resumeStudioCollapseRef = useRef<{ wasCollapsed: boolean } | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { tier, isPro, usage, caps, loading: tierLoading } = useUserTier();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState<'login' | 'signup' | null>(null);
  const [postAuthRedirect, setPostAuthRedirect] = useState<string | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const jobCount = useJobCount(!suppressDynamicBadges);
  const usageKeys = Object.keys(caps || {});
  const usageUsed = usageKeys.reduce((sum, key) => sum + (usage[key as keyof typeof usage] || 0), 0);
  const usageCap = usageKeys.reduce((sum, key) => sum + (caps?.[key] || 0), 0);
  const sidebarPresentation = getSidebarPresentation(isMobile, isCollapsed, suppressDynamicBadges);
  const isCompactRail = sidebarPresentation.compact;
  const activeRootTool = searchParams.get('tool') || '';
  const hasMappedRootTool = Object.values(ROOT_TOOL_BY_ITEM_ID).some(tools => tools.includes(activeRootTool));
  const isDashboardActive = pathname === '/suite' || (pathname === '/' && !hasMappedRootTool);

  useEffect(() => {
    let cancelled = false;
    if (suppressDynamicBadges) {
      setHasAdminAccess(true);
      return () => { cancelled = true; };
    }
    setHasAdminAccess(false);
    if (!user) return () => { cancelled = true; };

    authFetch('/api/admin/session', { cache: 'no-store' })
      .then(response => {
        if (!cancelled) setHasAdminAccess(response.ok);
      })
      .catch(() => {
        if (!cancelled) setHasAdminAccess(false);
      });

    return () => {
      cancelled = true;
    };
  }, [suppressDynamicBadges, user]);

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
    if (isMobile) return;
    if (pathname === '/suite/resume') {
      if (!resumeStudioCollapseRef.current) {
        resumeStudioCollapseRef.current = { wasCollapsed: isCollapsed };
        setIsCollapsed(true);
      }
      return;
    }
    if (resumeStudioCollapseRef.current) {
      setIsCollapsed(resumeStudioCollapseRef.current.wasCollapsed);
      resumeStudioCollapseRef.current = null;
    }
  }, [isMobile, pathname]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('tc-sidebar-collapsed-groups');
      if (stored) setCollapsedGroups(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--suite-sidebar-content-offset', sidebarPresentation.contentOffset);
    return () => {
      document.documentElement.style.removeProperty('--suite-sidebar-content-offset');
    };
  }, [sidebarPresentation.contentOffset]);

  useEffect(() => {
    if (!isMobile || !isMobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getDrawerFocusable = () => Array.from(
      asideRef.current?.querySelectorAll<HTMLElement>(focusableSelector) || [],
    ).filter(element => element.offsetParent !== null);
    window.setTimeout(() => getDrawerFocusable()[0]?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileOpen(false);
        window.setTimeout(() => mobileToggleRef.current?.focus(), 0);
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = getDrawerFocusable();
      if (!focusable.length) return;

      event.preventDefault();
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
        : (currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
      focusable[nextIndex].focus();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isMobile, isMobileOpen]);

  const closeMobileMenu = (restoreFocus: boolean) => {
    if (!isMobile) return;
    setIsMobileOpen(false);
    if (restoreFocus) window.setTimeout(() => mobileToggleRef.current?.focus(), 0);
  };

  const handleNav = (path: string) => {
    closeMobileMenu(true);
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
      closeMobileMenu(false);
      setPostAuthRedirect(path);
      setShowAuthModal('signup');
      return;
    }
    handleNav(path);
  };

  const handleManageBilling = async () => {
    if (!user) {
      closeMobileMenu(false);
      setPostAuthRedirect('/suite/settings?tab=subscription');
      setShowAuthModal('login');
      return;
    }

    closeMobileMenu(true);
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

  const isActive = (path: string) => {
    if (path === '/suite') return isDashboardActive;
    if (path === '/suite/agent') return pathname === path || pathname === '/suite/agent/quality';
    return pathname?.startsWith(path) || false;
  };
  const isItemActive = (item: NavigationItem) => {
    const rootTools = ROOT_TOOL_BY_ITEM_ID[item.id];
    if (pathname === '/' && rootTools?.includes(activeRootTool)) return true;
    if (item.id === 'writing-toolkit') {
      return ['/suite/gallery', '/suite/cover-letter', '/suite/linkedin', '/suite/writing-tools'].some(path => pathname?.startsWith(path));
    }
    return isActive(item.path);
  };
  const shellWidth = sidebarPresentation.width;
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

  return (
    <>
      {/* Mobile toggle */}
      {isMobile && !isMobileOpen && (
        <button
          ref={mobileToggleRef}
          data-suite-menu-toggle="true"
          type="button"
          onClick={() => setIsMobileOpen(true)}
          aria-label="Open main menu"
          aria-expanded={false}
          aria-controls="suite-sidebar"
          className="fixed left-3 top-3 z-[60] flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-card)] text-[var(--text-secondary)] shadow-lg transition-[background-color,color] duration-200 hover:bg-[var(--theme-surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
        >
          <span className="material-symbols-rounded text-2xl" aria-hidden="true">menu</span>
        </button>
      )}

      {/* Mobile overlay */}
      {isMobile && isMobileOpen && (
        <button
          type="button"
          aria-label="Close main menu"
          onClick={() => closeMobileMenu(true)}
          className="fixed inset-0 z-40 bg-black/50"
        />
      )}

      {/* Sidebar */}
      <aside
        ref={asideRef}
        id="suite-sidebar"
        role={isMobile && isMobileOpen ? 'dialog' : undefined}
        aria-modal={isMobile && isMobileOpen ? true : undefined}
        aria-label="Main menu"
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
        className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg-card)] shadow-[var(--theme-shadow)] transition-all duration-200 ease-out"
      >
        {/* Header */}
        <div className={`flex shrink-0 p-2 ${isCompactRail ? 'flex-col items-center gap-1.5' : 'items-center justify-between'}`}>
          {isCompactRail ? (
            <TalentConsultingMark className="h-8 w-8 rounded-[10px]" />
          ) : (
            <div className="flex min-w-0 items-center gap-2.5">
              <TalentConsultingMark className="h-8 w-8 rounded-[10px]" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <TalentConsultingWordmark
                  className="w-[132px] max-w-full"
                  transparent={theme === 'light'}
                  darkSurface={theme === 'dark'}
                />
                <span className="block truncate text-[11px] leading-tight text-[var(--text-tertiary)]">Career command</span>
              </div>
            </div>
          )}
          {!isMobile && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--theme-surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span className="material-symbols-rounded text-[22px]" aria-hidden="true">
                {isCollapsed ? 'left_panel_open' : 'left_panel_close'}
              </span>
            </button>
          )}
          {isMobile && (
            <button
              type="button"
              onClick={() => closeMobileMenu(true)}
              aria-label="Close main menu"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-card)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--theme-surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
            >
              <span className="material-symbols-rounded text-2xl" aria-hidden="true">close</span>
            </button>
          )}
        </div>

        {/* Primary navigation */}
        <nav
          id="suite-primary-navigation"
          aria-label="TalentConsulting tools"
          className="scrollbar-hide min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden p-2"
        >
          <NavigationRailRow
            icon="home"
            label="Dashboard"
            description="Career command center"
            active={isDashboardActive}
            compact={isCompactRail}
            onClick={() => handleNav('/')}
            ariaCurrent={isDashboardActive ? 'page' : undefined}
            markerLayoutId="suiteSidebarActiveIndicator"
            title="Dashboard"
          />

        {/* Navigation — full tool directory in expanded mode, compact icon rail when collapsed */}
          {navGroups.map((group, groupIndex) => {
            const isExpanded = !group.label || !collapsedGroups[group.label];
            const hasActiveChild = group.items.some(item => isItemActive(item));
            const groupId = `suite-sidebar-group-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || groupIndex}`;

            return (
              <div key={group.label || `pinned-${groupIndex}`} className="space-y-1.5">
                {group.label && !isCompactRail && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={isExpanded}
                    aria-controls={groupId}
                    className="mt-2 flex min-h-7 w-full items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)] transition-colors duration-150 hover:bg-[var(--theme-surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
                  >
                    <span
                      className="material-symbols-rounded text-base transition-transform duration-150"
                      style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                      aria-hidden="true"
                    >
                      chevron_right
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">{group.label}</span>
                    {hasActiveChild && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    )}
                  </button>
                )}

                {group.label && isCompactRail && (
                  <div className="mx-auto my-1.5 h-px w-8 bg-[var(--theme-border)]" aria-hidden="true" />
                )}

                {(isExpanded || isCompactRail) && (
                  <div id={groupId} className="space-y-1.5">
                    {group.items.map((item) => {
                      const active = isItemActive(item);
                      const trailing = item.id === 'job-search' && jobCount > 0
                        ? (
                            <span className="text-xs font-semibold tabular-nums text-[var(--text-secondary)]">
                              {jobCount}
                            </span>
                          )
                        : item.badge === 'STANDARD' || item.badge === 'MAX'
                          ? <PlanBadge tier={item.badge === 'MAX' ? 'studio' : 'pro'} size="xs" active={active} />
                          : item.badge
                            ? <span className="text-xs font-semibold text-[var(--text-secondary)]">{item.badge}</span>
                            : undefined;

                      return (
                        <NavigationRailRow
                          key={item.id}
                          icon={item.id === 'agent'
                            ? (
                                <AssistantMark
                                  size="xs"
                                  state={active ? 'responding' : 'idle'}
                                  className="!h-6 !w-6 !rounded-lg"
                                />
                              )
                            : item.iconName}
                          label={item.label}
                          description={item.description}
                          active={active}
                          trailing={trailing}
                          compact={isCompactRail}
                          onClick={() => handleNav(item.path)}
                          ariaCurrent={active ? 'page' : undefined}
                          markerLayoutId="suiteSidebarActiveIndicator"
                          title={isCompactRail ? item.label : item.description}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

        </nav>

        <SidebarUtilityRows
          user={user}
          tier={tier}
          isPro={isPro}
          isCollapsed={isCompactRail}
          loading={tierLoading}
          billingLoading={billingLoading}
          usageUsed={usageUsed}
          usageCap={usageCap}
          isAdmin={hasAdminAccess}
          isActive={isActive}
          handleNav={handleNav}
          onUpgrade={handleUpgrade}
          onManageBilling={handleManageBilling}
          onLogout={() => {
            closeMobileMenu(false);
            setShowLogoutModal(true);
          }}
          onSignIn={() => {
            closeMobileMenu(false);
            setShowAuthModal('login');
          }}
        />
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
          returnFocusSelector={isMobile ? '[data-suite-menu-toggle="true"]' : undefined}
        />
      )}
    </>
  );
}
