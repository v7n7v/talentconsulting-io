'use client';

import { ReactNode, useEffect } from 'react';
import { ThemeProvider } from './ThemeProvider';
import Toast, { showToast } from './Toast';
import AttributionCapture from './AttributionCapture';
import { analytics } from '@/lib/analytics';
import { clearPendingAuthRedirect, consumePendingAuthRedirect } from '@/lib/auth-redirect';
import { authHelpers } from '@/lib/firebase';
import { useStore } from '@/lib/store';
import { armPendingSonaResumeExpiry } from '@/lib/sona/pending-resume-handoff';

interface ClientProvidersProps {
    children: ReactNode;
}

let googleRedirectCompletion: ReturnType<typeof authHelpers.completeGoogleRedirect> | null = null;
let googleRedirectHandled = false;

function completeGoogleRedirectOnce() {
    googleRedirectCompletion ??= authHelpers.completeGoogleRedirect();
    return googleRedirectCompletion;
}

function AuthRedirectHandler() {
    const setUser = useStore((state) => state.setUser);

    useEffect(() => {
        let cancelled = false;
        armPendingSonaResumeExpiry();

        completeGoogleRedirectOnce().then(({ data, error }) => {
            if (cancelled || googleRedirectHandled) return;
            googleRedirectHandled = true;

            if (data?.user) {
                setUser(data.user);
                analytics.login('google');
                showToast('Signed in with Google!', 'check_circle');

                const redirectTarget = consumePendingAuthRedirect();
                if (redirectTarget) {
                    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                    if (currentPath !== redirectTarget) window.location.assign(redirectTarget);
                }
            } else if (error) {
                console.error('Google redirect sign-in failed:', error);
                clearPendingAuthRedirect();
                showToast('Google sign-in could not finish. Please try again.', 'error');
            }
        }).catch((error) => {
            if (cancelled || googleRedirectHandled) return;
            googleRedirectHandled = true;

            console.error('Google redirect handler crashed:', error);
            clearPendingAuthRedirect();
            showToast('Google sign-in could not finish. Please try again.', 'error');
        });

        return () => {
            cancelled = true;
        };
    }, [setUser]);

    return null;
}

export default function ClientProviders({ children }: ClientProvidersProps) {
    return (
        <ThemeProvider>
            <AttributionCapture />
            <AuthRedirectHandler />
            {children}
            <Toast />
        </ThemeProvider>
    );
}
