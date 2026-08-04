'use client';

import { useState, useCallback, useRef } from 'react';
import AuthModal from '@/components/modals/AuthModal';
import UsageLimitGate from '@/components/UsageLimitGate';

type AuthModalMode = 'login' | 'signup' | null;
type UsageLimitState = {
  feature?: string | null;
  used?: number | null;
  cap?: number | null;
  upgradeUrl?: string;
  variant?: 'cap' | 'tier';
  /* Set only by routes whose limit neither variant describes truthfully — see
     the note on UsageLimitGate's `title`/`body`. */
  title?: string | null;
  body?: string | null;
} | null;

function copyOverrides(errorBody: Record<string, unknown>) {
  return {
    title: typeof errorBody.limitTitle === 'string' ? errorBody.limitTitle : null,
    body: typeof errorBody.limitBody === 'string' ? errorBody.limitBody : null,
  };
}

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
  const gateRef = useRef<HTMLElement | null>(null);

  /**
   * Bring the gate into view and move focus to it.
   *
   * Pages render `renderAuthModal()` as their first child, so on a phone the
   * panel is above the fold of whatever the user was actually looking at. A
   * click that only re-sets identical state repaints nothing and `aria-live`
   * has no change to announce, so without this the interaction is silent in
   * both senses. Deferred a frame because the caller usually raises the panel
   * and reveals it in the same tick, before it is in the tree.
   */
  const revealUsageLimit = useCallback(() => {
    requestAnimationFrame(() => {
      const node = gateRef.current;
      if (!node) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.focus({ preventScroll: true });
    });
  }, []);

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
        variant: 'cap',
        ...copyOverrides(errorBody),
      });
      return true;
    }
    if (errorBody?.upgrade) {
      // Signed in, but the free plan never included this tool. This used to
      // return false with the note "let the page handle upgrade CTA" — no page
      // did, so the block surfaced as a red error toast and read as a bug.
      // It is the same panel as a spent cap with a different claim, and it
      // carries no used/cap, so the counter stays hidden.
      // Ordering matters: guardApiRoute's 429 body sets `upgrade` too, but
      // `limitReached` is checked first and returns above.
      setUsageLimit({
        feature: typeof errorBody.feature === 'string' ? errorBody.feature : null,
        used: null,
        cap: null,
        upgradeUrl: typeof errorBody.upgradeUrl === 'string' ? errorBody.upgradeUrl : '/suite/upgrade',
        variant: 'tier',
        ...copyOverrides(errorBody),
      });
      return true;
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
            ref={gateRef}
            feature={usageLimit.feature}
            used={usageLimit.used}
            cap={usageLimit.cap}
            upgradeUrl={usageLimit.upgradeUrl}
            variant={usageLimit.variant}
            title={usageLimit.title}
            body={usageLimit.body}
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
    revealUsageLimit,
    handleApiError,
    renderAuthModal,
  };
}
