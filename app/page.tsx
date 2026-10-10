'use client';

import { useCallback, useEffect, useState } from 'react';
import { TalentLanding } from '@/components/landing/TalentLanding';
import AuthModal from '@/components/modals/AuthModal';
import { authHelpers } from '@/lib/firebase';
import { useStore } from '@/lib/store';

type AuthMode = 'login' | 'signup';

export default function Home() {
  const user = useStore((state) => state.user);
  const setUser = useStore((state) => state.setUser);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [postAuthRedirect, setPostAuthRedirect] = useState('/suite/agent?intent=resume-upload');

  useEffect(() => {
    const unsubscribe = authHelpers.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
    });

    return unsubscribe;
  }, [setUser]);

  const openAuth = (mode: AuthMode, redirect: string) => {
    setAuthMode(mode);
    setPostAuthRedirect(redirect);
    setShowAuthModal(true);
  };

  const closeAuth = useCallback(() => {
    setShowAuthModal(false);
  }, []);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Taco by TalentConsulting',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://talentconsulting.io',
            description: 'AI job search grounded in your experience. Find suitable roles, prepare application materials, and review every next step with Taco.',
            featureList: [
              'Resume Studio and ATS analysis',
              'Evidence-aware job discovery',
              'Application and relationship tracking',
              'Interview practice and story preparation',
              'Taco AI career guidance',
              'Career intelligence and progress analytics',
            ],
            offers: {
              '@type': 'AggregateOffer',
              lowPrice: '0',
              priceCurrency: 'USD',
              offerCount: '3',
            },
          }),
        }}
      />

      <TalentLanding isAuthenticated={Boolean(user)} onOpenAuth={openAuth} />

      {showAuthModal && (
        <AuthModal
          mode={authMode}
          onClose={closeAuth}
          onSwitchMode={() => setAuthMode((mode) => mode === 'login' ? 'signup' : 'login')}
          postAuthRedirect={postAuthRedirect}
        />
      )}
    </>
  );
}
