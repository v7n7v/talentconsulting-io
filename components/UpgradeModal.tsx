'use client';

/**
 * UpgradeModal - In-app Stripe Embedded Checkout modal
 * Uses Stripe Embedded Checkout (ui_mode: 'embedded') for PCI-compliant payment.
 * Supports Stripe-sourced monthly and annual billing with plan toggle.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { authFetch } from '@/lib/auth-fetch';
import { useBillingPrices } from '@/hooks/use-billing-prices';
import { getPlanIdentity } from '@/lib/plan-identity';
import { PlanBadge } from '@/components/plan/PlanIdentity';
import { createCheckoutRequestSequencer } from '@/lib/billing/checkout-request-sequencer';
import { analytics } from '@/lib/analytics';
import {
  resolveStripeCheckoutRecovery,
  type StripeCheckoutRecovery,
} from '@/lib/billing/stripe-checkout-recovery';
import {
  parseStripeCheckoutPublicStatus,
  parseStripeCheckoutResumeResult,
  recoveryForStripeCheckoutStatus,
} from '@/lib/billing/stripe-checkout-status';
import { foundingOfferForPrice } from '@/lib/billing/founding-offer';

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : Promise.resolve(null);
const UPGRADE_SOURCE = 'resume_upgrade_modal';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type BillingInterval = 'month' | 'year';
type PlanOption = 'pro' | 'studio';

function priceIsAvailable(
  price: { active: boolean; unitAmount: number | null; sourceInterval?: string | null },
  interval: BillingInterval,
) {
  return price.active && price.unitAmount != null && price.sourceInterval === interval;
}

const PLAN_LABELS = {
  month: 'Monthly',
  year: 'Annual',
} as const;

const PLAN_OUTCOMES: Record<PlanOption, Array<{ icon: string; title: string; text: string }>> = {
  pro: [
    { icon: 'description', title: 'Tailor active applications', text: 'Build role-specific resumes and writing with your real evidence.' },
    { icon: 'mic', title: 'Prepare for interviews', text: 'Practise role-specific questions with focused feedback.' },
    { icon: 'route', title: 'Keep workflows connected', text: 'Reuse job, resume, writing, and preparation context.' },
  ],
  studio: [
    { icon: 'travel_explore', title: 'Let Taco scout', text: 'Receive ranked opportunities with fit reasons and source checks.' },
    { icon: 'verified_user', title: 'Prepare truth-locked packets', text: 'Bring the tailored resume, cover letter, and role proof together.' },
    { icon: 'fact_check', title: 'Review every next move', text: 'Nothing is submitted or sent without your approval.' },
  ],
};

export default function UpgradeModal({ isOpen, onClose, onSuccess }: UpgradeModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanOption>('pro');
  const [interval, setInterval] = useState<BillingInterval>('month');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recoveryOperation, setRecoveryOperation] = useState<'checking' | 'resuming' | null>(null);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<StripeCheckoutRecovery | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const checkoutRequestsRef = useRef<ReturnType<typeof createCheckoutRequestSequencer> | null>(null);
  if (!checkoutRequestsRef.current) checkoutRequestsRef.current = createCheckoutRequestSequencer();
  const checkoutRequests = checkoutRequestsRef.current;
  const upgradeViewTrackedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const { prices, checkout, loading: pricesLoading, error: pricesError, refresh: refreshBilling } = useBillingPrices();
  const selectedIdentity = getPlanIdentity(selectedPlan);
  const selectedPrice = prices.plans[selectedPlan][interval];
  const selectedFoundingOffer = foundingOfferForPrice(selectedPlan, selectedPrice);
  const selectedPriceAvailable = priceIsAvailable(selectedPrice, interval);
  const priceLookupFailed = Boolean(pricesError) || selectedPrice.sourceStatus === 'retrieval_error';
  const priceLookupResolved = !pricesLoading && !priceLookupFailed;
  const selectedCheckoutAvailable = checkout.options[selectedPlan][interval];
  const checkoutDisabled = !selectedCheckoutAvailable
    || loading
    || pricesLoading
    || (priceLookupResolved && !selectedPriceAvailable);

  const createCheckoutSession = useCallback(async (plan: PlanOption, selectedInterval: BillingInterval) => {
    const requestId = checkoutRequests.start();
    const checkoutPrice = prices.plans[plan][selectedInterval];
    let failureReason = 'network_or_unknown';
    let serverRecovery: StripeCheckoutRecovery | null = null;
    setLoading(true);
    setError('');
    setRecovery(null);
    setClientSecret(null);

    try {
      if (!checkout.options[plan][selectedInterval]) {
        throw new Error('This billing option is temporarily unavailable. Your current plan remains active.');
      }
      const res = await authFetch('/api/stripe/subscribe', {
        method: 'POST',
        body: JSON.stringify({ plan, interval: selectedInterval, source: UPGRADE_SOURCE }),
      });

      const data = await res.json();
      if (!checkoutRequests.isCurrent(requestId)) return;

      if (!res.ok) {
        failureReason = 'server_rejected';
        serverRecovery = resolveStripeCheckoutRecovery(data);
        throw new Error(serverRecovery.message);
      }

      if (!data.clientSecret) {
        failureReason = 'missing_client_secret';
        throw new Error('Checkout is unavailable right now. Please try again.');
      }

      setClientSecret(data.clientSecret);
      const measuredPriceAvailable = priceIsAvailable(checkoutPrice, selectedInterval);
      const foundingOffer = foundingOfferForPrice(plan, checkoutPrice);
      analytics.beginCheckout(plan, measuredPriceAvailable
        ? (foundingOffer?.unitAmount ?? checkoutPrice.unitAmount!) / 100
        : undefined, {
        source: UPGRADE_SOURCE,
        interval: selectedInterval,
        currency: measuredPriceAvailable ? checkoutPrice.currency : undefined,
      });
    } catch (err: any) {
      if (!checkoutRequests.isCurrent(requestId)) return;
      analytics.checkoutSessionFailed(UPGRADE_SOURCE, plan, selectedInterval, failureReason);
      const nextRecovery = serverRecovery
        || resolveStripeCheckoutRecovery({ error: err.message || 'Something went wrong' });
      setRecovery(nextRecovery);
      setError(nextRecovery.message);
    } finally {
      if (checkoutRequests.isCurrent(requestId)) setLoading(false);
    }
  }, [checkout, checkoutRequests, prices]);

  const checkCheckoutStatus = useCallback(async () => {
    const requestId = checkoutRequests.start();
    setRecoveryOperation('checking');
    try {
      const response = await authFetch('/api/stripe/checkout/status', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!checkoutRequests.isCurrent(requestId)) return;
      const status = parseStripeCheckoutPublicStatus(payload) || 'pending';
      if (status === 'complete' || status === 'idle' || status === 'expired') {
        await refreshBilling().catch(() => {});
      }
      const nextRecovery = recoveryForStripeCheckoutStatus(status);
      setRecovery(nextRecovery);
      setError(nextRecovery?.message || '');
    } catch {
      if (!checkoutRequests.isCurrent(requestId)) return;
      const nextRecovery = recoveryForStripeCheckoutStatus('pending');
      setRecovery(nextRecovery);
      setError('Checkout status is temporarily unavailable. No new checkout was started.');
    } finally {
      if (checkoutRequests.isCurrent(requestId)) setRecoveryOperation(null);
    }
  }, [checkoutRequests, refreshBilling]);

  const resumeCheckout = useCallback(async () => {
    const requestId = checkoutRequests.start();
    setRecoveryOperation('resuming');
    try {
      const response = await authFetch('/api/stripe/checkout/resume', {
        method: 'POST',
        cache: 'no-store',
      });
      const payload = parseStripeCheckoutResumeResult(await response.json());
      if (!checkoutRequests.isCurrent(requestId)) return;
      if (!payload) throw new Error('Invalid checkout recovery response');
      if (payload.status === 'open' && payload.mode === 'embedded') {
        setRecovery(null);
        setError('');
        setClientSecret(payload.clientSecret);
        return;
      }
      if (payload.status === 'open' && payload.mode === 'hosted') {
        window.location.assign(payload.url);
        return;
      }
      if (payload.status === 'complete' || payload.status === 'idle' || payload.status === 'expired') {
        await refreshBilling().catch(() => {});
      }
      const nextRecovery = recoveryForStripeCheckoutStatus(payload.status);
      setRecovery(nextRecovery);
      setError(nextRecovery?.message || '');
    } catch {
      if (!checkoutRequests.isCurrent(requestId)) return;
      const nextRecovery = recoveryForStripeCheckoutStatus('open');
      setRecovery(nextRecovery);
      setError('Checkout could not be resumed safely. No new checkout was started.');
    } finally {
      if (checkoutRequests.isCurrent(requestId)) setRecoveryOperation(null);
    }
  }, [checkoutRequests, refreshBilling]);

  const requestClose = useCallback(() => {
    checkoutRequests.invalidate();
    onCloseRef.current();
  }, [checkoutRequests]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => () => {
    checkoutRequests.invalidate();
  }, [checkoutRequests]);

  useEffect(() => {
    if (!isOpen) {
      upgradeViewTrackedRef.current = false;
      checkoutRequests.invalidate();
      setClientSecret(null);
      setError('');
      setRecovery(null);
      setLoading(false);
      setRecoveryOperation(null);
    } else if (!upgradeViewTrackedRef.current) {
      upgradeViewTrackedRef.current = true;
      analytics.upgradeViewed(UPGRADE_SOURCE, selectedPlan, interval);
    }
  }, [checkoutRequests, interval, isOpen, selectedPlan]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
      )).filter(element => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (!dialogRef.current || dialogRef.current.contains(event.target as Node)) return;
      closeButtonRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      previouslyFocused?.focus();
    };
  }, [isOpen, requestClose]);

  const resetCheckout = () => {
    checkoutRequests.invalidate();
    setClientSecret(null);
    setError('');
    setLoading(false);
  };

  const handlePlanChange = (plan: PlanOption) => {
    if (plan === selectedPlan) return;
    analytics.upgradePlanSelected(UPGRADE_SOURCE, plan, interval);
    setSelectedPlan(plan);
    resetCheckout();
  };

  const handleIntervalChange = (newInterval: BillingInterval) => {
    if (newInterval === interval) return;
    analytics.upgradeIntervalSelected(UPGRADE_SOURCE, selectedPlan, newInterval);
    setInterval(newInterval);
    resetCheckout();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && requestClose()}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'var(--modal-backdrop)' }} />

          {/* Modal */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-modal-title"
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="elevation-raised relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {/* Close button */}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={requestClose}
              aria-label="Close upgrade options"
              className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-hover)]"
            >
              <span className="material-symbols-rounded icon-current text-[20px]" aria-hidden="true">close</span>
            </button>

            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="icon-shell-neutral flex h-9 w-9 items-center justify-center rounded-[12px] border">
                  <span className="material-symbols-rounded text-lg">bolt</span>
                </span>
                <h2 id="upgrade-modal-title" className="pr-10 text-xl font-bold">Choose your career workflow</h2>
              </div>
              <PlanBadge tier={selectedPlan} active className="mb-3 mt-2" />
              <p className="text-sm text-[var(--theme-text-secondary)]">
                Standard gives you hands-on career tools. Max adds proactive, review-first Taco preparation.
              </p>
            </div>

            {/* Plan choice */}
            <div className="grid grid-cols-2 gap-2 px-6 pb-4" aria-label="Choose a plan">
              {(['pro', 'studio'] as PlanOption[]).map(plan => {
                const identity = getPlanIdentity(plan);
                const active = selectedPlan === plan;
                return (
                  <button
                    key={plan}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handlePlanChange(plan)}
                    className="min-h-16 min-w-0 rounded-xl border p-3 text-left transition"
                    style={{
                      borderColor: active ? identity.accent : 'var(--border-subtle)',
                      background: active ? identity.accentSoft : 'var(--bg-elevated)',
                    }}
                  >
                    <span className="block text-sm font-bold text-[var(--text-primary)]">{identity.displayName}</span>
                    <span className="mt-1 block text-[11px] leading-4 text-[var(--text-secondary)]">
                      {plan === 'pro' ? 'Standard tools for active job searches' : 'Taco scouting and packet prep'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Plan toggle */}
            <div className="px-6 pb-4">
              <div
                className="flex p-1 rounded-xl"
                role="group"
                aria-label="Billing interval"
                style={{
                  background: 'var(--bg-hover)',
                }}
              >
                {(['month', 'year'] as BillingInterval[]).map((int) => (
                  (() => {
                    const optionPrice = prices.plans[selectedPlan][int];
                    const optionAvailable = priceIsAvailable(optionPrice, int);
                    const foundingOffer = foundingOfferForPrice(selectedPlan, optionPrice);
                    return (
                      <button
                        key={int}
                        type="button"
                        aria-pressed={interval === int}
                        onClick={() => handleIntervalChange(int)}
                        className={`relative flex-1 rounded-lg px-2 py-2.5 text-sm font-medium leading-5 transition-all ${
                          interval === int
                            ? ''
                            : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
                        }`}
                        style={interval === int ? { background: selectedIdentity.accent, color: selectedIdentity.buttonText } : undefined}
                      >
                        <span className="block">{PLAN_LABELS[int]}</span>
                        <span className="block text-xs opacity-80">
                          {optionAvailable ? foundingOffer?.display || optionPrice.display : pricesLoading || pricesError || optionPrice.sourceStatus === 'retrieval_error' ? 'Price in secure checkout' : 'Unavailable'}
                        </span>
                        {foundingOffer && (
                          <span className="block text-[11px] opacity-75">
                            regular {optionPrice.display}
                          </span>
                        )}
                        {int === 'year' && optionAvailable && optionPrice.savingsLabel && (
                          <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                            interval === 'year'
                              ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                              : 'text-[var(--text-secondary)]'
                          }`}>
                            {optionPrice.savingsLabel}
                          </span>
                        )}
                      </button>
                    );
                  })()
                ))}
              </div>
              {selectedFoundingOffer && (
                <p className="mt-2 text-center text-[11px] leading-4 text-[var(--text-secondary)]">
                  Founding price applied automatically for eligible new subscribers through {selectedFoundingOffer.endLabel}. Keep it while subscribed.
                </p>
              )}
            </div>

            {/* Features */}
            <div className="px-6 pb-4">
              <div className="space-y-2 rounded-xl bg-[var(--bg-hover)] p-3">
                {PLAN_OUTCOMES[selectedPlan].map((outcome) => (
                  <div key={outcome.title} className="flex min-w-0 items-start gap-3 rounded-lg px-1 py-1.5">
                    <span className="icon-shell-neutral grid h-8 w-8 shrink-0 place-items-center rounded-lg border">
                      <span className="material-symbols-rounded icon-neutral text-[16px]">{outcome.icon}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-[var(--text-primary)]">{outcome.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-[var(--text-secondary)]">{outcome.text}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Checkout form */}
            <div className="px-6 pb-6" aria-live="polite" aria-busy={loading || pricesLoading}>
              {!clientSecret && !loading && !error && (
                <button
                  type="button"
                  disabled={checkoutDisabled}
                  onClick={() => createCheckoutSession(selectedPlan, interval)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: selectedIdentity.accent, color: selectedIdentity.buttonText }}
                >
                  <span className="material-symbols-rounded text-base">lock</span>
                  {selectedCheckoutAvailable ? 'Continue to secure checkout' : 'Checkout unavailable'}
                  {selectedCheckoutAvailable && selectedPriceAvailable && (
                    <span className="font-semibold opacity-90">
                      {selectedFoundingOffer?.display || selectedPrice.display}
                    </span>
                  )}
                </button>
              )}

              {selectedCheckoutAvailable && priceLookupResolved && !selectedPriceAvailable && !loading && !clientSecret && !error && (
                <p className="mt-3 text-center text-xs text-[var(--text-tertiary)]">
                  Checkout is being updated. Please try again shortly.
                </p>
              )}

              {!pricesLoading && !selectedCheckoutAvailable && !loading && !clientSecret && !error && (
                <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-hover)] p-3 text-center">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">Checkout is temporarily unavailable</p>
                  <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">This billing option is temporarily unavailable. Your current plan remains active.</p>
                  <button
                    type="button"
                    onClick={refreshBilling}
                    className="mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-xs font-semibold text-[var(--text-primary)]"
                  >
                    <span className="material-symbols-rounded text-[16px]" aria-hidden="true">refresh</span>
                    Check again
                  </button>
                </div>
              )}

              {loading && (
                <div className="flex items-center justify-center py-12" role="status" aria-label="Opening secure checkout">
                  <div
                    className="w-6 h-6 border-2 rounded-full animate-spin"
                    style={{ borderColor: `color-mix(in srgb, ${selectedIdentity.accent} 30%, transparent)`, borderTopColor: selectedIdentity.accent }}
                  />
                </div>
              )}

              {error && !loading && (
                <div className="text-center py-8" role="alert">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{recovery?.title || 'Checkout needs attention'}</p>
                  <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[var(--text-secondary)]">{error}</p>
                  <button
                    onClick={async () => {
                      if (recovery?.primaryAction === 'manage_billing') {
                        window.location.assign('/suite/settings?tab=subscription');
                      } else if (recovery?.primaryAction === 'contact_support') {
                        window.location.assign('/suite/feedback?context=billing-account-review');
                      } else if (recovery?.primaryAction === 'resume_checkout') {
                        await resumeCheckout();
                      } else if (recovery?.primaryAction === 'check_availability') {
                        await checkCheckoutStatus();
                      } else {
                        createCheckoutSession(selectedPlan, interval);
                      }
                    }}
                    disabled={Boolean(recoveryOperation)}
                    aria-busy={Boolean(recoveryOperation)}
                    className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-80"
                    style={{ background: selectedIdentity.accent, color: selectedIdentity.buttonText }}
                  >
                    {recoveryOperation && (
                      <span className="material-symbols-rounded animate-spin text-[17px]" aria-hidden="true">progress_activity</span>
                    )}
                    {recoveryOperation === 'checking'
                      ? 'Checking status...'
                      : recoveryOperation === 'resuming'
                        ? 'Resuming checkout...'
                        : recovery?.primaryLabel || 'Retry checkout'}
                  </button>
                </div>
              )}

              {clientSecret && !loading && (
                <EmbeddedCheckoutProvider
                  stripe={stripePromise}
                  options={{ clientSecret }}
                >
                  <div>
                    <EmbeddedCheckout />
                  </div>
                </EmbeddedCheckoutProvider>
              )}
            </div>

            <p className="text-[11px] text-center text-[var(--text-tertiary)] pb-4">
              Secure checkout by Stripe. Manage billing from Settings.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
