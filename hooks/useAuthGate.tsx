'use client';

import { useState, useCallback } from 'react';
import AuthModal from '@/components/modals/AuthModal';
import UsageLimitGate from '@/components/UsageLimitGate';

type AuthModalMode = 'login' | 'signup' | null;
type UsageLimitState = {
  feature?: string | null;
  used?: number | null;
  cap?: number | null;
  upgradeUrl?: string;
} | null;

/**
 * Reusable auth gate hook for suite pages.
 * Checks API error responses for requiresAuth/limitReached flags
 * and automatically opens the AuthModal in the appropriate mode.
 *
 * Usage:
 *   const { handleApiError, renderAuthModal } = useAuthGate();
 *
 *   // In fetch error handling:
 *   if (!res.ok) {
 *     const err = await res.json();
 *     if (handleApiError(err)) return; // modal opened, stop
 *   }
 *
 *   // In JSX:
 *   {renderAuthModal()}
 */
export function useAuthGate() {
  const [authModal, setAuthModal] = useState<AuthModalMode>(null);
  const [usageLimit, setUsageLimit] = useState<UsageLimitState>(null);

  /**
   * Check an API error response for auth/cap signals.
   * Returns true if the modal was opened (caller should stop processing).
   */
  const handleApiError = useCallback((errorBody: Record<string, unknown>): boolean => {
    if (errorBody?.requiresAuth) {
      setAuthModal('signup');
      return true;
    }
    if (errorBody?.limitReached) {
      setUsageLimit({
        feature: typeof errorBody.feature === 'string' ? errorBody.feature : null,
        used: typeof errorBody.used === 'number' ? errorBody.used : null,
        cap: typeof errorBody.cap === 'number' ? errorBody.cap : null,
        upgradeUrl: typeof errorBody.upgradeUrl === 'string' ? errorBody.upgradeUrl : '/suite/upgrade',
      });
      return true;
    }
    if (errorBody?.upgrade) {
      // Free tier exhausted — they're signed in but need Pro
      // Don't open auth modal, let the page handle upgrade CTA
      return false;
    }
    return false;
  }, []);

  /**
   * Render the AuthModal if active. Drop this in your page JSX.
   */
  const renderAuthModal = useCallback(() => {
    if (!authModal && !usageLimit) return null;
    return (
      <>
        {usageLimit && (
          <UsageLimitGate
            feature={usageLimit.feature}
            used={usageLimit.used}
            cap={usageLimit.cap}
            upgradeUrl={usageLimit.upgradeUrl}
            onKeepEditing={() => setUsageLimit(null)}
            className="my-4"
          />
        )}
        {authModal && (
          <AuthModal
            mode={authModal}
            onClose={() => setAuthModal(null)}
            onSwitchMode={() => setAuthModal(authModal === 'login' ? 'signup' : 'login')}
          />
        )}
      </>
    );
  }, [authModal, usageLimit]);

  return {
    authModal,
    usageLimit,
    setAuthModal,
    setUsageLimit,
    handleApiError,
    renderAuthModal,
  };
}
