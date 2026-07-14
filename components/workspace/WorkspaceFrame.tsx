'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { authHelpers } from '@/lib/firebase';
import { useStore } from '@/lib/store';
import { getUserProfile } from '@/lib/database-suite';
import SuiteSidebar from '@/components/SuiteSidebar';
import SonaFloatingOrb from '@/components/SonaFloatingOrb';
import SonaContextPanel from '@/components/workspace/SonaContextPanel';
import CommandPalette from '@/components/CommandPalette';
import OnboardingModal from '@/components/modals/OnboardingModal';
import { SonaMark } from '@/components/sona';
import { MobileQuickToolsRail } from '@/components/mobile/MobileWorkbench';

interface WorkspaceFrameProps {
  children: React.ReactNode;
  showWorkspaceChrome?: boolean;
  showOnboardingPrompt?: boolean;
  loadingFallback?: React.ReactNode;
}

export default function WorkspaceFrame({
  children,
  showWorkspaceChrome = true,
  showOnboardingPrompt = true,
  loadingFallback,
}: WorkspaceFrameProps) {
  const pathname = usePathname();
  const { setUser, setUserProfile } = useStore();
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const isSonaReview = pathname === '/suite/gallery/sona';
  const showSonaContextPanel = showWorkspaceChrome && pathname !== '/suite/agent' && !isSonaReview;

  useEffect(() => {
    const unsubscribe = authHelpers.onAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          const { data } = await getUserProfile();
          if (data) {
            setUserProfile(data);
            if (showOnboardingPrompt && !data.onboarding_completed && localStorage.getItem('tc_hide_onboarding') !== 'true') {
              setShowOnboarding(true);
            }
          } else if (showOnboardingPrompt && localStorage.getItem('tc_hide_onboarding') !== 'true') {
            setShowOnboarding(true);
          }
        } catch {
          // Profile loading should never block the workspace shell.
        }
      } else {
        setUserProfile(null);
        setShowOnboarding(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setUserProfile, showOnboardingPrompt]);

  if (loading) {
    if (loadingFallback) {
      return <>{loadingFallback}</>;
    }

    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-deep)]">
        <div className="flex flex-col items-center gap-4">
          <SonaMark size="lg" state="thinking" />
          <div className="text-center">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Sona is opening your workspace</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Getting your tools and context ready.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--bg-deep)]">
      {showWorkspaceChrome && (
        <Suspense fallback={null}>
          <SuiteSidebar />
        </Suspense>
      )}
      <main className={`mobile-app-page min-h-dvh overflow-x-hidden transition-[margin] duration-200 ${showWorkspaceChrome ? 'lg:ml-[var(--suite-sidebar-content-offset,250px)] lg:pt-0' : ''} ${showSonaContextPanel ? '2xl:mr-[328px]' : ''}`}>
        {showWorkspaceChrome && !isSonaReview && <MobileQuickToolsRail />}
        {children}
      </main>
      {showWorkspaceChrome && <CommandPalette />}
      {showSonaContextPanel && <SonaContextPanel />}
      {showWorkspaceChrome && !isSonaReview && <SonaFloatingOrb />}

      {showOnboardingPrompt && showOnboarding && (
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
