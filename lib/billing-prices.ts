import Stripe from 'stripe';
import {
  type BillingInterval,
  type BillingPlan,
  type PublicBillingPrice,
  type PublicBillingPrices,
  publicBillingIntervalContractReady,
  unavailableBillingPrice,
  unavailableBillingPrices,
} from '@/lib/billing-price-types';
import { getStripeRuntimeReadiness } from '@/lib/billing/stripe-runtime-readiness';
import { stripePriceIdentityFingerprint } from '@/lib/billing/stripe-price-identity';
import { getStripeCommercialReadinessSnapshot } from '@/lib/billing/stripe-checkout-economics';

const CACHE_TTL_MS = 60 * 1000;
const BILLING_PRICE_REQUEST_TIMEOUT_MS = 5_000;
const BILLING_PRICE_MAX_NETWORK_RETRIES = 0;

let cachedPrices: { expiresAt: number; value: PublicBillingPrices } | null = null;
let stripeClient: Stripe | null = null;

const PRICE_ENV: Record<BillingPlan, Record<BillingInterval, string>> = {
  pro: {
    month: 'STRIPE_PRO_PRICE_ID',
    year: 'STRIPE_PRO_ANNUAL_PRICE_ID',
  },
  studio: {
    month: 'STRIPE_STUDIO_PRICE_ID',
    year: 'STRIPE_STUDIO_ANNUAL_PRICE_ID',
  },
};

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
      timeout: BILLING_PRICE_REQUEST_TIMEOUT_MS,
      maxNetworkRetries: BILLING_PRICE_MAX_NETWORK_RETRIES,
    });
  }
  return stripeClient;
}

function formatMoney(unitAmount: number | null | undefined, currency = 'usd') {
  if (unitAmount == null) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: unitAmount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(unitAmount / 100);
}

function formatInterval(interval: BillingInterval) {
  return interval === 'year' ? 'yr' : 'mo';
}

function publicPriceFromStripe(price: Stripe.Price, interval: BillingInterval): PublicBillingPrice {
  const currency = price.currency || 'usd';
  const unitAmount = price.unit_amount ?? null;
  const money = formatMoney(unitAmount, currency);
  const sourceInterval = price.recurring?.interval === 'month' || price.recurring?.interval === 'year'
    ? price.recurring.interval
    : null;
  if (sourceInterval !== interval) {
    return unavailableBillingPrice(interval, 'retrieval_error');
  }

  return {
    identityFingerprint: stripePriceIdentityFingerprint(price.id),
    unitAmount,
    currency,
    interval,
    sourceInterval,
    active: price.active,
    display: money ? `${money}/${formatInterval(interval)}` : unavailableBillingPrice(interval).display,
    effectiveMonthlyDisplay: interval === 'year' && unitAmount != null
      ? `${formatMoney(Math.round(unitAmount / 12), currency)}/mo effective`
      : money ? `${money}/mo` : unavailableBillingPrice(interval).effectiveMonthlyDisplay,
    savingsLabel: '',
    sourceStatus: 'verified',
  };
}

function addSavings(prices: PublicBillingPrices): PublicBillingPrices {
  const next = structuredClone(prices);

  (['pro', 'studio'] as BillingPlan[]).forEach((plan) => {
    const month = next.plans[plan].month.unitAmount;
    const year = next.plans[plan].year.unitAmount;
    if (!month || !year) return;

    const annualFull = month * 12;
    if (year >= annualFull) return;

    const percent = Math.round((1 - year / annualFull) * 100);
    next.plans[plan].year.savingsLabel = `Save ${percent}%`;
  });

  return next;
}

async function withCheckoutReadiness(
  prices: PublicBillingPrices,
  runtime: ReturnType<typeof getStripeRuntimeReadiness>,
  options: { force?: boolean } = {},
) {
  const next = structuredClone(prices);
  const monthContractReady = runtime.configurationReady
    && publicBillingIntervalContractReady(next.plans, 'month');
  const yearContractReady = runtime.configurationReady
    && publicBillingIntervalContractReady(next.plans, 'year');
  const stripe = getStripe();
  let commercialOptions = {
    pro: { month: false, year: false },
    studio: { month: false, year: false },
  };
  if (stripe && (monthContractReady || yearContractReady)) {
    try {
      commercialOptions = (await getStripeCommercialReadinessSnapshot(stripe, next.plans, options)).options;
    } catch {
      console.warn('[billing-prices] Commercial readiness verification unavailable');
    }
  }
  const checkoutOptions = {
    pro: {
      month: monthContractReady && commercialOptions.pro.month,
      year: yearContractReady && commercialOptions.pro.year,
    },
    studio: {
      month: monthContractReady && commercialOptions.studio.month,
      year: yearContractReady && commercialOptions.studio.year,
    },
  };
  const anyOptionReady = Object.values(checkoutOptions)
    .some(intervals => Object.values(intervals).some(Boolean));
  next.checkout = anyOptionReady
    ? {
        available: true,
        status: 'available',
        code: 'CHECKOUT_READY',
        message: 'Secure checkout is available.',
        options: checkoutOptions,
      }
    : {
        available: false,
        status: runtime.status === 'not_configured' ? 'not_configured' : 'blocked',
        code: runtime.status === 'not_configured'
          ? 'CHECKOUT_NOT_CONFIGURED'
          : 'CHECKOUT_CONFIGURATION_BLOCKED',
        message: 'Secure checkout is temporarily unavailable. Your current plan remains active.',
        options: {
          pro: { month: false, year: false },
          studio: { month: false, year: false },
        },
      };
  return next;
}

async function fetchPrice(plan: BillingPlan, interval: BillingInterval): Promise<PublicBillingPrice> {
  const stripe = getStripe();
  const priceId = process.env[PRICE_ENV[plan][interval]];
  if (!stripe || !priceId) return unavailableBillingPrice(interval);

  try {
    const price = await stripe.prices.retrieve(priceId);
    return publicPriceFromStripe(price, interval);
  } catch (error) {
    console.warn(`[billing-prices] Could not retrieve ${plan}/${interval} price:`, error);
    return unavailableBillingPrice(interval, 'retrieval_error');
  }
}

export async function getBillingPrices(opts: { force?: boolean; skipCommercialReadiness?: boolean } = {}): Promise<PublicBillingPrices> {
  if (!opts.force && cachedPrices && cachedPrices.expiresAt > Date.now()) {
    if (opts.skipCommercialReadiness) return structuredClone(cachedPrices.value);
    const checkoutRuntime = getStripeRuntimeReadiness();
    return withCheckoutReadiness(cachedPrices.value, checkoutRuntime);
  }

  const [proMonth, proYear, studioMonth, studioYear] = await Promise.all([
    fetchPrice('pro', 'month'),
    fetchPrice('pro', 'year'),
    fetchPrice('studio', 'month'),
    fetchPrice('studio', 'year'),
  ]);
  const value = addSavings({
    plans: {
      pro: { month: proMonth, year: proYear },
      studio: { month: studioMonth, year: studioYear },
    },
    checkout: unavailableBillingPrices().checkout,
    updatedAt: new Date().toISOString(),
  });

  const hasRetrievalError = [proMonth, proYear, studioMonth, studioYear]
    .some(price => price.sourceStatus === 'retrieval_error');
  if (!hasRetrievalError) {
    cachedPrices = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  }
  if (opts.skipCommercialReadiness) return value;
  return withCheckoutReadiness(value, getStripeRuntimeReadiness(), { force: opts.force });
}

export async function getBillingPrice(plan: BillingPlan, interval: BillingInterval) {
  const prices = await getBillingPrices();
  return prices.plans[plan][interval];
}

export async function getMonthlyPlanRevenue(plan: BillingPlan) {
  const price = await getBillingPrice(plan, 'month');
  return price.unitAmount == null ? 0 : price.unitAmount / 100;
}

export function getDefaultBillingPrices() {
  return unavailableBillingPrices();
}
