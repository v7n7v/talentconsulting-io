'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { useTheme } from '@/components/ThemeProvider';
import { authFetch } from '@/lib/auth-fetch';
import { analytics } from '@/lib/analytics';
import { useRouter } from 'next/navigation';
import { useBillingPrices } from '@/hooks/use-billing-prices';
import { type PublicBillingPrice } from '@/lib/billing-price-types';
import { getPlanIdentity } from '@/lib/plan-identity';
import { PlanBadge } from '@/components/plan/PlanIdentity';
/* Plan copy is shared with the public /pricing page so the two cannot drift. */
import { COMPARISON, PRO_FEATURES, STUDIO_EXTRAS } from '@/lib/pricing-content';
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

type BillingInterval = 'month' | 'year';
type PlanOption = 'pro' | 'studio';

function parsePlanParam(value: string | null): PlanOption {
  return value === 'studio' || value === 'pro' ? value : 'pro';
}

function parseIntervalParam(value: string | null): BillingInterval {
  return value === 'year' || value === 'month' ? value : 'month';
}

const PLAN_COPY = {
  pro: {
    month: { label: 'Monthly' },
    year: { label: 'Annual' },
  },
  studio: {
    month: { label: 'Monthly' },
    year: { label: 'Annual' },
  },
} as const;

const PLAN_VALUE_COPY: Record<PlanOption, { description: string; selector: string; summary: string }> = {
  pro: {
    description: 'Move active applications forward with job insight, resume tools, interview practice, and focused skill plans.',
    selector: 'Core active job-search tools',
    summary: 'Practical tools for resumes, applications, interviews, and skill gaps.',
  },
  studio: {
    description: 'Let Taco scout, rank, and prepare opportunities while you control every application and alert.',
    selector: 'Taco-led search workflow',
    summary: 'A trusted Taco-led workflow from job discovery to application review.',
  },
};

function priceIsAvailable(price: PublicBillingPrice) {
  return price.unitAmount != null && price.active && price.sourceInterval === price.interval;
}

function billingLine(plan: PlanOption, price: PublicBillingPrice) {
  if (price.unitAmount != null && !price.active) return 'This plan is not available for checkout yet.';
  if (!priceIsAvailable(price)) return 'Price unavailable. Check again shortly.';
  const foundingOffer = foundingOfferForPrice(plan, price);
  if (foundingOffer) {
    return `${foundingOffer.display} founding price (regular ${price.display}), applied automatically for eligible new subscribers through ${foundingOffer.endLabel}. Keep the rate while your subscription remains active.`;
  }
  if (price.interval === 'year') {
    return `Billed annually. ${price.effectiveMonthlyDisplay}.`;
  }
  return 'Billed monthly. Manage or cancel from Settings.';
}

export default function UpgradePage() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const router = useRouter();
  const { prices, checkout, loading: pricesLoading, error: pricesError, refresh: refreshBilling } = useBillingPrices();
  const [interval, setInterval] = useState<BillingInterval>('month');
  const [selectedPlan, setSelectedPlan] = useState<PlanOption>('pro');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recoveryOperation, setRecoveryOperation] = useState<'checking' | 'resuming' | null>(null);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<StripeCheckoutRecovery | null>(null);
  const checkoutRequestRef = useRef(0);

  const resetCheckoutState = useCallback(() => {
    checkoutRequestRef.current += 1;
    setClientSecret(null);
    setError('');
    setRecovery(null);
    setLoading(false);
    setRecoveryOperation(null);
  }, []);

  const createCheckoutSession = useCallback(async (plan: PlanOption, int: BillingInterval) => {
    const requestId = checkoutRequestRef.current + 1;
    checkoutRequestRef.current = requestId;
    setLoading(true);
    setError('');
    setRecovery(null);
    setClientSecret(null);
    let failureReason = 'network_or_unknown';
    try {
      if (!checkout.options[plan][int]) {
        throw new Error('This billing option is temporarily unavailable. Your current plan remains active.');
      }
      const selectedPrice = prices.plans[plan][int];
      const selectedPriceLookupFailed = Boolean(pricesError) || selectedPrice.sourceStatus === 'retrieval_error';
      if (!priceIsAvailable(selectedPrice) && !selectedPriceLookupFailed) {
        throw new Error('This plan is not available for checkout yet. Please contact support.');
      }

      const res = await authFetch('/api/stripe/subscribe', {
        method: 'POST',
        body: JSON.stringify({ interval: int, plan, source: 'upgrade_page' }),
      });
      const data = await res.json();
      if (checkoutRequestRef.current !== requestId) return;
      if (!res.ok) {
        failureReason = 'server_rejected';
        const nextRecovery = resolveStripeCheckoutRecovery(data);
        analytics.checkoutSessionFailed('upgrade_page', plan, int, failureReason);
        setRecovery(nextRecovery);
        setError(nextRecovery.message);
        return;
      }
      if (!data.clientSecret) throw new Error('Checkout is unavailable right now. Please try again.');
      setClientSecret(data.clientSecret);
      const measuredPriceAvailable = priceIsAvailable(selectedPrice);
      const foundingOffer = foundingOfferForPrice(plan, selectedPrice);
      analytics.beginCheckout(plan, measuredPriceAvailable
        ? (foundingOffer?.unitAmount ?? selectedPrice.unitAmount!) / 100
        : undefined, {
        source: 'upgrade_page',
        interval: int,
        currency: measuredPriceAvailable ? selectedPrice.currency : undefined,
      });
    } catch (err: any) {
      if (checkoutRequestRef.current !== requestId) return;
      analytics.checkoutSessionFailed('upgrade_page', plan, int, failureReason);
      const nextRecovery = resolveStripeCheckoutRecovery({ error: err.message || 'Something went wrong' });
      setRecovery(nextRecovery);
      setError(nextRecovery.message);
    } finally {
      if (checkoutRequestRef.current === requestId) setLoading(false);
    }
  }, [checkout, prices, pricesError]);

  const checkCheckoutStatus = useCallback(async () => {
    const requestId = checkoutRequestRef.current + 1;
    checkoutRequestRef.current = requestId;
    setRecoveryOperation('checking');
    try {
      const response = await authFetch('/api/stripe/checkout/status', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json();
      if (checkoutRequestRef.current !== requestId) return;
      const status = parseStripeCheckoutPublicStatus(payload) || 'pending';
      if (status === 'complete' || status === 'idle' || status === 'expired') {
        await refreshBilling().catch(() => {});
      }
      const nextRecovery = recoveryForStripeCheckoutStatus(status);
      setRecovery(nextRecovery);
      setError(nextRecovery?.message || '');
    } catch {
      if (checkoutRequestRef.current !== requestId) return;
      const nextRecovery = recoveryForStripeCheckoutStatus('pending');
      setRecovery(nextRecovery);
      setError('Checkout status is temporarily unavailable. No new checkout was started.');
    } finally {
      if (checkoutRequestRef.current === requestId) setRecoveryOperation(null);
    }
  }, [refreshBilling]);

  const resumeCheckout = useCallback(async () => {
    const requestId = checkoutRequestRef.current + 1;
    checkoutRequestRef.current = requestId;
    setRecoveryOperation('resuming');
    try {
      const response = await authFetch('/api/stripe/checkout/resume', {
        method: 'POST',
        cache: 'no-store',
      });
      const payload = parseStripeCheckoutResumeResult(await response.json());
      if (checkoutRequestRef.current !== requestId) return;
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
      if (checkoutRequestRef.current !== requestId) return;
      const nextRecovery = recoveryForStripeCheckoutStatus('open');
      setRecovery(nextRecovery);
      setError('Checkout could not be resumed safely. No new checkout was started.');
    } finally {
      if (checkoutRequestRef.current === requestId) setRecoveryOperation(null);
    }
  }, [refreshBilling]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialPlan = parsePlanParam(params.get('plan'));
    const initialInterval = parseIntervalParam(params.get('interval'));

    setSelectedPlan(initialPlan);
    setInterval(initialInterval);
    analytics.upgradeViewed('upgrade_page', initialPlan, initialInterval);
  }, []);

  useEffect(() => () => {
    checkoutRequestRef.current += 1;
  }, []);

  useEffect(() => {
    resetCheckoutState();
  }, [selectedPlan, interval, resetCheckoutState]);

  const handlePlanChange = (plan: PlanOption) => {
    if (plan === selectedPlan) return;
    analytics.upgradePlanSelected('upgrade_page', plan, interval);
    setSelectedPlan(plan);
  };

  const handleIntervalChange = (newInterval: BillingInterval) => {
    if (newInterval === interval) return;
    analytics.upgradeIntervalSelected('upgrade_page', selectedPlan, newInterval);
    setInterval(newInterval);
  };

  const planCfg = prices.plans[selectedPlan][interval];
  const priceLookupFailed = Boolean(pricesError) || planCfg.sourceStatus === 'retrieval_error';
  const checkoutAvailable = checkout.options[selectedPlan][interval]
    && !pricesLoading
    && (priceLookupFailed || priceIsAvailable(planCfg));
  const checkoutUnavailable = !pricesLoading && !checkout.options[selectedPlan][interval];
  const checkoutConfirmationPending = recovery?.code === 'STRIPE_CHECKOUT_CONFIRMATION_PENDING';
  const isStudio = selectedPlan === 'studio';
  const selectedIdentity = getPlanIdentity(selectedPlan);
  const proIdentity = getPlanIdentity('pro');
  const maxIdentity = getPlanIdentity('studio');
  const selectedFoundingOffer = foundingOfferForPrice(selectedPlan, planCfg);

  return (
    <div
      className="mobile-app-content flex min-h-dvh flex-col min-[1360px]:flex-row"
      style={{ background: isLight ? '#F8FAFC' : '#060608' }}
    >

      {/* ───── LEFT PANEL ───── */}
      <div className="flex w-full flex-col overflow-y-auto px-4 py-4 sm:px-10 sm:py-8 min-[1360px]:w-[55%] min-[1360px]:px-14 min-[1360px]:py-14">

        {/* Back */}
        <button
          type="button"
          onClick={() => router.push('/suite')}
          className="mb-8 flex min-h-11 w-fit items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <span className="material-symbols-rounded text-[16px]" aria-hidden="true">arrow_back</span>
          Back to dashboard
        </button>

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <PlanBadge tier={selectedPlan} active size="md" className="mb-4" />
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] mb-3 leading-tight">
            {selectedIdentity.displayName}
          </h1>
          <p className="max-w-md text-base leading-7 text-[var(--text-secondary)]">
            {PLAN_VALUE_COPY[selectedPlan].description}
          </p>
        </motion.div>

        {/* Plan Selector */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="mb-6">
          <div className="grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
            {(['pro', 'studio'] as PlanOption[]).map(plan => {
              const active = selectedPlan === plan;
              const identity = getPlanIdentity(plan);
              const optionPrice = prices.plans[plan][interval];
              const foundingOffer = foundingOfferForPrice(plan, optionPrice);
              return (
                <motion.button
                  key={plan}
                  type="button"
                  aria-pressed={active}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handlePlanChange(plan)}
                  className="relative min-h-11 min-w-0 overflow-hidden rounded-lg p-4 text-left transition-all"
                  style={{
                    background: active ? identity.surface : 'var(--bg-surface)',
                    border: `2px solid ${active ? identity.accent : 'var(--border-subtle)'}`,
                    boxShadow: active ? `0 4px 20px color-mix(in srgb, ${identity.accent} 18%, transparent)` : 'none',
                  }}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <PlanBadge tier={plan} active={active} size="xs" />
                    {active && (
                      <motion.span
                        layoutId="plan-check"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: identity.accent, color: identity.buttonText }}
                      >
                        <span className="material-symbols-rounded text-[13px]" aria-hidden="true">check</span>
                      </motion.span>
                    )}
                  </div>
                  <p className="break-words text-xl font-black leading-tight text-[var(--text-primary)]">
                    {foundingOffer?.display || optionPrice.display}
                  </p>
                  {foundingOffer && (
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      <span className="line-through">{optionPrice.display}</span>
                      <span className="ml-1.5 font-semibold" style={{ color: identity.accent }}>founding</span>
                    </p>
                  )}
                  <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                    {PLAN_VALUE_COPY[plan].selector}
                  </p>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* Billing Toggle */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <div
            className="grid w-full max-w-md grid-cols-2 gap-1 rounded-lg p-1"
            style={{ background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }}
          >
            {(['month', 'year'] as BillingInterval[]).map(int => {
              const optionPrice = prices.plans[selectedPlan][int];
              const foundingOffer = foundingOfferForPrice(selectedPlan, optionPrice);
              return (
                <button
                  key={int}
                  type="button"
                  aria-pressed={interval === int}
                  onClick={() => handleIntervalChange(int)}
                  className={`relative min-h-11 min-w-0 rounded-lg px-2 py-2 text-sm font-semibold transition-all ${
                    interval === int
                      ? 'shadow-lg'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  style={interval === int ? {
                    background: selectedIdentity.surface,
                    color: 'var(--text-primary)',
                    border: `1px solid ${selectedIdentity.border}`,
                    boxShadow: `0 4px 14px color-mix(in srgb, ${selectedIdentity.accent} 22%, transparent)`,
                  } : {}}
                >
                  <span className="block">{PLAN_COPY[selectedPlan][int].label}</span>
                  <span className="mt-0.5 block break-words text-[11px] leading-4 opacity-80">
                    {foundingOffer?.display || optionPrice.display}
                    {foundingOffer ? ` · regular ${optionPrice.display}` : int === 'year' && optionPrice.savingsLabel ? ` - ${optionPrice.savingsLabel}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="ml-1 mt-2 flex min-w-0 items-start gap-1 text-xs leading-5"
            style={{ color: selectedIdentity.accent }}>
            <span className="material-symbols-rounded mt-0.5 shrink-0 text-[13px]" aria-hidden="true">
              {interval === 'year' ? 'trending_down' : 'local_cafe'}
            </span>
            <span className="min-w-0">{billingLine(selectedPlan, planCfg)}</span>
          </p>
        </motion.div>

        {/* Features */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="mb-8">
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">
            {isStudio ? 'Everything in Standard, plus Taco' : 'Core active job-search tools'}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(isStudio ? STUDIO_EXTRAS : PRO_FEATURES).map((f, i) => (
              <motion.li
                key={f.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22 + i * 0.04 }}
                className="flex min-w-0 items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
              >
                <div
                  className="icon-shell-neutral flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border"
                >
                  <span className="material-symbols-rounded text-[18px]" aria-hidden="true">{f.icon}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-0.5">{f.title}</h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{f.desc}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        {/* Comparison Table */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="mb-6">
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Plan comparison</h2>
          <div className="space-y-2 sm:hidden" aria-label="Plan comparison">
            {COMPARISON.map(row => (
              <section key={row.label} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{row.label}</h3>
                <dl className="mt-3 grid grid-cols-3 gap-2">
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Free</dt>
                    <dd className="mt-1 break-words text-[11px] leading-4 text-[var(--text-secondary)]">{row.free}</dd>
                  </div>
                  <div className="min-w-0 border-l border-[var(--border-subtle)] pl-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: proIdentity.accent }}>Standard</dt>
                    <dd className="mt-1 break-words text-[11px] font-semibold leading-4" style={{ color: proIdentity.accent }}>{row.pro}</dd>
                  </div>
                  <div className="min-w-0 border-l border-[var(--border-subtle)] pl-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: maxIdentity.accent }}>Max</dt>
                    <dd className="mt-1 break-words text-[11px] font-semibold leading-4" style={{ color: maxIdentity.accent }}>{row.studio}</dd>
                  </div>
                </dl>
              </section>
            ))}
          </div>
          <div
            role="region"
            aria-label="Plan comparison table"
            tabIndex={0}
            className="hidden max-w-full overflow-x-auto rounded-lg border border-[var(--border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)] sm:block"
          >
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr style={{ background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }}>
                  <th className="w-[34%] px-4 py-2.5 text-left text-xs font-medium text-[var(--text-muted)]">Feature</th>
                  <th className="text-center px-3 py-2.5 text-[var(--text-muted)] text-xs font-medium">Free</th>
                  <th className="text-center px-3 py-2.5 text-xs font-bold" style={{ color: proIdentity.accent }}>Standard</th>
                  <th className="text-center px-3 py-2.5 text-xs font-bold" style={{ color: maxIdentity.accent }}>Max</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(row => (
                  <tr key={row.label} style={{ borderTop: `1px solid ${isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'}` }}>
                    <td className="break-words px-4 py-2.5 text-xs text-[var(--text-primary)]">{row.label}</td>
                    <td className="break-words px-3 py-2.5 text-center text-xs text-[var(--text-muted)]">{row.free}</td>
                    <td className="break-words px-3 py-2.5 text-center text-xs font-semibold" style={{ color: proIdentity.accent }}>{row.pro}</td>
                    <td className="break-words px-3 py-2.5 text-center text-xs font-semibold" style={{ color: maxIdentity.accent }}>{row.studio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

      </div>

      {/* ───── RIGHT PANEL: Stripe Checkout ───── */}
      <div
        className="flex w-full flex-col justify-start px-4 py-4 sm:px-10 sm:py-8 min-[1360px]:sticky min-[1360px]:top-0 min-[1360px]:h-dvh min-[1360px]:w-[45%] min-[1360px]:px-12 min-[1360px]:py-14"
        style={{
          background: isLight ? '#FFFFFF' : '#0A0A0C',
          borderLeft: `1px solid ${isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)'}`,
        }}
      >
        <div className="max-w-sm mx-auto w-full">

          {/* Plan summary card */}
          <div
            className="mb-6 rounded-lg p-5"
            style={{
              background: selectedIdentity.surface,
              border: `1px solid ${selectedIdentity.border}`,
            }}
          >
            <div className="mb-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs text-[var(--text-secondary)] mb-0.5">You're getting</p>
                <p className="text-base font-bold text-[var(--text-primary)]">
                  {selectedIdentity.displayName}
                </p>
              </div>
              <div className="min-w-0 sm:text-right">
                <p className="break-words text-2xl font-black leading-tight" style={{ color: selectedIdentity.accent }}>
                  {selectedFoundingOffer?.display || planCfg.display}
                </p>
                {selectedFoundingOffer && (
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    <span className="line-through">{planCfg.display}</span>
                    <span className="ml-1.5 font-semibold">regular</span>
                  </p>
                )}
              </div>
            </div>
            <p className="text-xs leading-5 text-[var(--text-secondary)]">
              {PLAN_VALUE_COPY[selectedPlan].summary}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-2 border-t pt-2"
              style={{ borderColor: `color-mix(in srgb, ${selectedIdentity.accent} 18%, var(--border-subtle))` }}>
              {billingLine(selectedPlan, planCfg)}
            </p>
          </div>

          {/* Checkout iframe */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-7 h-7 border-2 rounded-full animate-spin mb-4"
                style={{
                  borderColor: `color-mix(in srgb, ${selectedIdentity.accent} 30%, transparent)`,
                  borderTopColor: selectedIdentity.accent,
                }}
              />
              <p className="text-sm text-[var(--text-secondary)]">Opening secure checkout...</p>
            </div>
          )}

          {error && !loading && (
            <div className={`rounded-lg border p-5 ${checkoutConfirmationPending ? 'border-blue-500/20 bg-blue-500/[0.06]' : 'border-rose-500/20 bg-rose-500/[0.06]'}`}>
              <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${checkoutConfirmationPending ? 'bg-blue-500/10' : 'bg-rose-500/10'}`}>
                <span className={`material-symbols-rounded ${checkoutConfirmationPending ? 'text-blue-500' : 'text-rose-500'}`} aria-hidden="true">
                  {checkoutConfirmationPending ? 'schedule' : 'error'}
                </span>
              </div>
              <h2 className="text-center text-base font-bold text-[var(--text-primary)]">{recovery?.title || 'Checkout needs attention'}</h2>
              <p className="mt-2 text-center text-sm leading-6 text-[var(--text-secondary)]">{error}</p>
              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (recovery?.primaryAction === 'manage_billing') {
                      router.push('/suite/settings?tab=subscription');
                    } else if (recovery?.primaryAction === 'contact_support') {
                      router.push('/suite/feedback?context=billing-account-review');
                    } else if (recovery?.primaryAction === 'resume_checkout') {
                      await resumeCheckout();
                    } else if (recovery?.primaryAction === 'check_availability') {
                      await checkCheckoutStatus();
                    } else {
                      createCheckoutSession(selectedPlan, interval);
                    }
                  }}
                  disabled={Boolean(recoveryOperation) || (recovery?.primaryAction === 'retry' && !checkoutAvailable)}
                  aria-busy={Boolean(recoveryOperation)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[13px] px-4 text-sm font-bold transition hover:brightness-105 disabled:cursor-wait disabled:opacity-80 disabled:hover:brightness-100"
                  style={{
                    background: recovery?.primaryAction === 'contact_support' || checkoutAvailable ? selectedIdentity.accent : 'var(--bg-elevated)',
                    color: recovery?.primaryAction === 'contact_support' || checkoutAvailable ? selectedIdentity.buttonText : 'var(--text-muted)',
                    cursor: recovery?.primaryAction === 'contact_support' || checkoutAvailable ? 'pointer' : 'not-allowed',
                  }}
                >
                  <span className={`material-symbols-rounded text-[18px] ${recoveryOperation ? 'animate-spin' : ''}`} aria-hidden="true">
                    {recoveryOperation
                      ? 'progress_activity'
                      : recovery?.primaryAction === 'manage_billing'
                      ? 'account_balance_wallet'
                      : recovery?.primaryAction === 'contact_support'
                        ? 'support_agent'
                        : recovery?.primaryAction === 'resume_checkout'
                          ? 'play_circle'
                        : 'refresh'}
                  </span>
                  {recoveryOperation === 'checking'
                    ? 'Checking status...'
                    : recoveryOperation === 'resuming'
                      ? 'Resuming checkout...'
                      : recovery?.primaryLabel || 'Retry checkout'}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/suite/settings?tab=subscription')}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
                >
                  <span className="material-symbols-rounded text-[18px]" aria-hidden="true">settings</span>
                  Billing settings
                </button>
              </div>
              <p className="mt-4 text-center text-[11px] leading-5 text-[var(--text-muted)]">
                In local development this can happen when Stripe keys or price ids are not configured.
              </p>
            </div>
          )}

          {clientSecret && !loading && (
            <EmbeddedCheckoutProvider key={clientSecret} stripe={stripePromise} options={{ clientSecret }}>
              <div style={{ colorScheme: isStudio ? 'dark' : (theme === 'light' ? 'light' : 'dark') }}>
                <EmbeddedCheckout className="stripe-checkout-embed" />
              </div>
            </EmbeddedCheckoutProvider>
          )}

          {checkoutUnavailable && !clientSecret && !loading && !error && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                <span className="material-symbols-rounded" aria-hidden="true">credit_card_off</span>
              </div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Checkout is temporarily unavailable</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">This billing option is temporarily unavailable. Your current plan remains active.</p>
              <button
                type="button"
                onClick={refreshBilling}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 text-sm font-semibold text-[var(--text-primary)]"
              >
                <span className="material-symbols-rounded text-[18px]" aria-hidden="true">refresh</span>
                Check again
              </button>
            </div>
          )}

          {!checkoutUnavailable && !clientSecret && !loading && !error && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: `color-mix(in srgb, ${selectedIdentity.accent} 12%, transparent)`, color: selectedIdentity.accent }}>
                <span className="material-symbols-rounded">lock</span>
              </div>
              <h2 className="text-center text-base font-bold text-[var(--text-primary)]">Ready when you are</h2>
              <p className="mt-2 text-center text-sm leading-6 text-[var(--text-secondary)]">
                Review the plan and billing interval first. Stripe checkout opens only after you start it.
              </p>
              <button
                type="button"
                onClick={() => createCheckoutSession(selectedPlan, interval)}
                disabled={!checkoutAvailable}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[13px] px-4 text-sm font-bold transition hover:brightness-105 disabled:hover:brightness-100"
                style={{
                  background: checkoutAvailable ? selectedIdentity.accent : 'var(--bg-elevated)',
                  color: checkoutAvailable ? selectedIdentity.buttonText : 'var(--text-muted)',
                  cursor: checkoutAvailable ? 'pointer' : 'not-allowed',
                }}
              >
                <span className="material-symbols-rounded text-[18px]" aria-hidden="true">lock</span>
                {checkoutAvailable ? 'Start secure checkout' : 'Checkout unavailable'}
              </button>
              <p className="mt-3 text-center text-[11px] leading-5 text-[var(--text-muted)]">
                No payment is submitted until you confirm inside Stripe.
              </p>
            </div>
          )}

          <p className="text-[11px] text-center text-[var(--text-muted)] mt-6 flex justify-center items-center gap-1.5">
            <span className="material-symbols-rounded text-[13px]">lock</span>
            Secure checkout by Stripe. Manage billing from Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
