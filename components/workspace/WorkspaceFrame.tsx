'use client';

import { TacoName } from '@/components/BrandLogo';
import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import { authHelpers } from '@/lib/firebase';
import { useStore } from '@/lib/store';
import { getUserProfile } from '@/lib/database-suite';
import { AssistantMark } from '@/components/assistant';
import { createWorkspaceBootstrapWatchdog } from '@/lib/workspace-auth-bootstrap';
import WorkspacePreviewBar from '@/components/workspace/WorkspacePreviewBar';
import './workspace-frame.css';

const SuiteSidebar = dynamic(() => import('@/components/SuiteSidebar'));
const AdminWorkspaceRail = dynamic(
  () => import('@/components/admin/shell/AdminWorkspaceRail').then(module => module.AdminWorkspaceRail),
);
const AssistantFloatingOrb = dynamic(() => import('@/components/assistant/AssistantFloatingOrb'));
const AssistantContextPanel = dynamic(() => import('@/components/assistant/AssistantContextPanel'));
const CommandPalette = dynamic(() => import('@/components/CommandPalette'));
const OnboardingModal = dynamic(() => import('@/components/modals/OnboardingModal'));
const MobileQuickToolsRail = dynamic(
  () => import('@/components/mobile/MobileWorkbench').then(module => module.MobileQuickToolsRail),
);

interface WorkspaceFrameProps {
  children: React.ReactNode;
  showWorkspaceChrome?: boolean;
  showOnboardingPrompt?: boolean;
  loadingFallback?: React.ReactNode;
}

export default function WorkspaceFrame(props: WorkspaceFrameProps) {
  return (
    <Suspense fallback={props.loadingFallback ?? <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-deep)]" role="status">Opening your workspace…</div>}>
      <WorkspaceFrameContent {...props} />
    </Suspense>
  );
}

function WorkspaceFrameContent({
  children,
  showWorkspaceChrome = true,
  showOnboardingPrompt = true,
  loadingFallback,
}: WorkspaceFrameProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setUser, setUserProfile } = useStore();
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const isAdminWorkspace = pathname === '/suite/admin'
    || pathname.startsWith('/suite/admin/')
    || (process.env.NODE_ENV !== 'production' && pathname === '/suite/admin-preview');
  const isAssistantReview = pathname === '/suite/gallery/taco' || pathname === '/suite/gallery/sona';
  const isResumeIntake = pathname === '/suite/agent'
    && (searchParams.get('intent') === 'resume-upload' || searchParams.get('pendingResume') === '1');
  const showAssistantContextPanel = showWorkspaceChrome
    && pathname !== '/suite/agent'
    && pathname !== '/suite/resume'
    && !isAssistantReview
    && !isAdminWorkspace;

  useEffect(() => {
    let active = true;
    let authSequence = 0;

    const finishLoading = () => {
      if (active) setLoading(false);
    };

    const watchdog = createWorkspaceBootstrapWatchdog({
      onTimeout: () => {
        void authHelpers.getUser()
          .then(({ user }) => {
            if (!active) return;
            setUser(user);
            if (!user) {
              setUserProfile(null);
              setShowOnboarding(false);
            }
          })
          .catch(() => {
            // Auth recovery is best-effort; the workspace shell still becomes available.
          })
          .finally(finishLoading);
      },
    });

    let unsubscribe = () => {};

    try {
      unsubscribe = authHelpers.onAuthStateChanged(async (firebaseUser) => {
        const sequence = ++authSequence;
        if (!active) return;
        setUser(firebaseUser);

        if (firebaseUser) {
          try {
            const { success, data } = await getUserProfile();
            if (!active || sequence !== authSequence) return;
            if (data) {
              setUserProfile(data);
              if (showOnboardingPrompt && !data.onboarding_completed && localStorage.getItem('tc_hide_onboarding') !== 'true') {
                setShowOnboarding(true);
              }
            } else if (success && showOnboardingPrompt && localStorage.getItem('tc_hide_onboarding') !== 'true') {
              setShowOnboarding(true);
            }
          } catch {
            // Profile loading should never block the workspace shell.
          }
        } else {
          setUserProfile(null);
          setShowOnboarding(false);
        }

        if (!active || sequence !== authSequence) return;
        watchdog.complete();
        finishLoading();
      });
    } catch {
      watchdog.complete();
      finishLoading();
    }

    return () => {
      active = false;
      watchdog.dispose();
      unsubscribe();
    };
  }, [setUser, setUserProfile, showOnboardingPrompt]);

  if (loading) {
    if (loadingFallback) {
      return <>{loadingFallback}</>;
    }

    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-deep)]">
        <div className="flex flex-col items-center gap-4">
          <AssistantMark size="lg" state="thinking" />
          <div className="text-center">
            <p className="text-sm font-semibold text-[var(--text-primary)]"><TacoName /> is opening your workspace</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Getting your tools and context ready.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={isAdminWorkspace ? 'min-h-dvh bg-[var(--bg-deep)]' : `${process.env.NEXT_PUBLIC_TACO_WORKSPACE_DESIGN === 'legacy' ? 'taco-workspace-legacy' : 'taco-workspace'} min-h-dvh bg-[var(--bg-deep)]`}>
      {showWorkspaceChrome && (
        <Suspense fallback={null}>
          {isAdminWorkspace
            ? <AdminWorkspaceRail />
            : <SuiteSidebar />}
        </Suspense>
      )}
      {/* No right margin is reserved for the context panel any more. It minimises to a
          launcher and expands as an OVERLAY, so content keeps the full width in both
          states - which was most of the point: with SuiteToolShell capping at 1120px, a
          1536px viewport minus the 276px sidebar minus the old 328px reservation left
          about 932px. */}
      <main
        className={`mobile-app-page min-h-dvh ${isAdminWorkspace ? 'overflow-x-clip' : 'overflow-x-hidden'} transition-[margin] duration-200 ${showWorkspaceChrome ? 'lg:ml-[var(--suite-sidebar-content-offset,276px)] lg:pt-0' : ''} ${isAdminWorkspace ? 'workspace-admin-canvas' : ''}`}
      >
        {!isAdminWorkspace && <WorkspacePreviewBar />}
        {showWorkspaceChrome && !isAssistantReview && !isAdminWorkspace && <MobileQuickToolsRail />}
        {children}
      </main>
      {showWorkspaceChrome && !isAdminWorkspace && <CommandPalette />}
      {showAssistantContextPanel && <AssistantContextPanel />}
      {showWorkspaceChrome && !isAssistantReview && !isAdminWorkspace && <AssistantFloatingOrb />}

      {showOnboardingPrompt && showOnboarding && !isAdminWorkspace && !isResumeIntake && (
        <OnboardingModal
          userName={useStore.getState().user?.displayName || ''}
          onComplete={() => setShowOnboarding(false)}
          onClose={() => setShowOnboarding(false)}
          onDismissPermanently={() => {
            try {
              localStorage.setItem('tc_hide_onboarding', 'true');
            } catch {
              // Onboarding dismissal is best-effort when storage is unavailable.
            }
            setShowOnboarding(false);
          }}
        />
      )}
    </div>
  );
}
