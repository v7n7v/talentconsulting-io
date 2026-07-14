export type BillingPlan = 'pro' | 'studio';
export type BillingInterval = 'month' | 'year';
export type BillingPriceSourceStatus = 'verified' | 'unconfigured' | 'retrieval_error';
export type BillingCheckoutStatus = 'available' | 'not_configured' | 'blocked';

export interface PublicBillingCheckoutReadiness {
  available: boolean;
  status: BillingCheckoutStatus;
  code: 'CHECKOUT_READY' | 'CHECKOUT_NOT_CONFIGURED' | 'CHECKOUT_CONFIGURATION_BLOCKED';
  message: string;
  options: Record<BillingPlan, Record<BillingInterval, boolean>>;
}

export interface PublicBillingPrice {
  identityFingerprint: string | null;
  unitAmount: number | null;
  currency: string;
  interval: BillingInterval;
  sourceInterval: BillingInterval | null;
  active: boolean;
  display: string;
  effectiveMonthlyDisplay: string;
  savingsLabel: string;
  sourceStatus: BillingPriceSourceStatus;
}

export interface PublicBillingPlanPrices {
  month: PublicBillingPrice;
  year: PublicBillingPrice;
}

export interface PublicBillingPrices {
  plans: Record<BillingPlan, PublicBillingPlanPrices>;
  checkout: PublicBillingCheckoutReadiness;
  updatedAt: string;
}

export const PRICE_UNAVAILABLE_LABEL = 'Price unavailable';

export function unavailableBillingCheckout(): PublicBillingCheckoutReadiness {
  return {
    available: false,
    status: 'not_configured',
    code: 'CHECKOUT_NOT_CONFIGURED',
    message: 'Secure checkout is temporarily unavailable. Your current plan remains active.',
    options: {
      pro: { month: false, year: false },
      studio: { month: false, year: false },
    },
  };
}

export function unavailableBillingPrice(
  interval: BillingInterval,
  sourceStatus: Extract<BillingPriceSourceStatus, 'unconfigured' | 'retrieval_error'> = 'unconfigured',
): PublicBillingPrice {
  return {
    identityFingerprint: null,
    unitAmount: null,
    currency: 'usd',
    interval,
    sourceInterval: null,
    active: false,
    display: PRICE_UNAVAILABLE_LABEL,
    effectiveMonthlyDisplay: PRICE_UNAVAILABLE_LABEL,
    savingsLabel: '',
    sourceStatus,
  };
}

export function unavailableBillingPrices(): PublicBillingPrices {
  return {
    plans: {
      pro: {
        month: unavailableBillingPrice('month'),
        year: unavailableBillingPrice('year'),
      },
      studio: {
        month: unavailableBillingPrice('month'),
        year: unavailableBillingPrice('year'),
      },
    },
    checkout: unavailableBillingCheckout(),
    updatedAt: new Date(0).toISOString(),
  };
}

function isBillingPrice(value: unknown, interval: BillingInterval): value is PublicBillingPrice {
  if (!value || typeof value !== 'object') return false;
  const price = value as Partial<PublicBillingPrice>;
  return price.interval === interval
    && (price.identityFingerprint === null || /^sha256:[a-f0-9]{24}$/.test(price.identityFingerprint || ''))
    && (price.sourceInterval === interval || price.sourceInterval === null)
    && typeof price.active === 'boolean'
    && typeof price.currency === 'string'
    && typeof price.display === 'string'
    && typeof price.effectiveMonthlyDisplay === 'string'
    && typeof price.savingsLabel === 'string'
    && ['verified', 'unconfigured', 'retrieval_error'].includes(price.sourceStatus || '')
    && (price.unitAmount === null || (typeof price.unitAmount === 'number' && Number.isFinite(price.unitAmount)));
}

export function publicBillingIntervalContractReady(
  plans: PublicBillingPrices['plans'],
  interval: BillingInterval,
) {
  const pro = plans.pro[interval];
  const studio = plans.studio[interval];
  if (!isBillingPrice(pro, interval) || !isBillingPrice(studio, interval)) return false;
  if (pro.sourceStatus !== 'verified' || studio.sourceStatus !== 'verified') return false;
  if (!pro.identityFingerprint || !studio.identityFingerprint) return false;
  if (pro.identityFingerprint === studio.identityFingerprint) return false;
  if (!pro.active || !studio.active) return false;
  if (pro.sourceInterval !== interval || studio.sourceInterval !== interval) return false;
  if (pro.unitAmount == null || studio.unitAmount == null || pro.unitAmount <= 0) return false;
  if (studio.unitAmount <= pro.unitAmount) return false;
  return pro.currency.toLowerCase() === studio.currency.toLowerCase();
}

export function publicBillingPriceContractReady(plans: PublicBillingPrices['plans']) {
  const identities = [
    plans.pro.month.identityFingerprint,
    plans.pro.year.identityFingerprint,
    plans.studio.month.identityFingerprint,
    plans.studio.year.identityFingerprint,
  ];
  return identities.every((value): value is string => Boolean(value))
    && new Set(identities).size === identities.length
    && publicBillingIntervalContractReady(plans, 'month')
    && publicBillingIntervalContractReady(plans, 'year');
}

export function normalizePublicBillingPrices(value: unknown): PublicBillingPrices {
  const fallback = unavailableBillingPrices();
  if (!value || typeof value !== 'object') return fallback;
  const input = value as Partial<PublicBillingPrices>;
  const plans = input.plans;
  if (!plans?.pro || !plans?.studio) return fallback;

  const normalizedPlans = structuredClone(fallback.plans);
  for (const plan of ['pro', 'studio'] as BillingPlan[]) {
    for (const interval of ['month', 'year'] as BillingInterval[]) {
      const candidate = plans[plan]?.[interval];
      normalizedPlans[plan][interval] = isBillingPrice(candidate, interval)
        ? candidate
        : unavailableBillingPrice(interval, 'retrieval_error');
    }
  }

  const checkout = input.checkout;
  const serverCheckoutReady = checkout?.available === true
    && checkout.status === 'available'
    && checkout.code === 'CHECKOUT_READY';
  const identities = [
    normalizedPlans.pro.month.identityFingerprint,
    normalizedPlans.pro.year.identityFingerprint,
    normalizedPlans.studio.month.identityFingerprint,
    normalizedPlans.studio.year.identityFingerprint,
  ];
  const identitiesUnique = identities.every(Boolean)
    && new Set(identities).size === identities.length;
  const monthContractReady = serverCheckoutReady
    && identitiesUnique
    && publicBillingIntervalContractReady(normalizedPlans, 'month');
  const yearContractReady = serverCheckoutReady
    && identitiesUnique
    && publicBillingIntervalContractReady(normalizedPlans, 'year');
  const options = {
    pro: {
      month: monthContractReady && checkout.options?.pro?.month === true,
      year: yearContractReady && checkout.options?.pro?.year === true,
    },
    studio: {
      month: monthContractReady && checkout.options?.studio?.month === true,
      year: yearContractReady && checkout.options?.studio?.year === true,
    },
  };
  const checkoutReady = Object.values(options).some(intervals => Object.values(intervals).some(Boolean));

  return {
    plans: normalizedPlans,
    checkout: checkoutReady
      ? {
          available: true,
          status: 'available',
          code: 'CHECKOUT_READY',
          message: 'Secure checkout is available.',
          options,
        }
      : unavailableBillingCheckout(),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : fallback.updatedAt,
  };
}
