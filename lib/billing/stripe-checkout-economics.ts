import type Stripe from 'stripe';
import type { BillingInterval, BillingPlan, PublicBillingPrice } from '@/lib/billing-price-types';
import {
  auditStripePromotionDiscountCeilingWithTimeout,
  type StripePromotionAuditReason,
} from '@/lib/billing/stripe-promotion-audit';
import { assessSonaPlanIntervalEconomics } from '@/lib/sona/plan-economics';

export const STRIPE_CHECKOUT_ECONOMICS_GATE_VERSION = 'stripe-checkout-economics-v1-2026-07-11';
export const STRIPE_CHECKOUT_PROMOTION_AUDIT_TIMEOUT_MS = 6_000;
export const STRIPE_COMMERCIAL_READINESS_PASS_TTL_MS = 30_000;
export const STRIPE_COMMERCIAL_READINESS_BLOCK_TTL_MS = 10_000;

export type StripeCheckoutEconomicsCode =
  | 'CHECKOUT_ECONOMICS_READY'
  | 'CHECKOUT_PROMOTION_POLICY_INVALID'
  | 'CHECKOUT_PROMOTION_INVENTORY_UNVERIFIED'
  | 'CHECKOUT_ECONOMICS_BLOCKED';

export type StripeCheckoutEconomicsDecision = {
  ready: boolean;
  code: StripeCheckoutEconomicsCode;
  gateVersion: typeof STRIPE_CHECKOUT_ECONOMICS_GATE_VERSION;
  promotionAuditReason: StripePromotionAuditReason | 'reviewed_ceiling_missing_or_invalid';
  economicsStatus: 'pass' | 'watch' | 'blocked';
  reason: string;
};

export type StripeCommercialReadinessSnapshot = {
  verified: boolean;
  code: Exclude<StripeCheckoutEconomicsCode, 'CHECKOUT_ECONOMICS_READY'> | 'CHECKOUT_ECONOMICS_READY';
  options: Record<BillingPlan, Record<BillingInterval, boolean>>;
  checkedAt: string;
};

let commercialReadinessCache: {
  key: string;
  expiresAt: number;
  value: StripeCommercialReadinessSnapshot;
} | null = null;
let commercialReadinessFlight: {
  key: string;
  promise: Promise<StripeCommercialReadinessSnapshot>;
} | null = null;

function reviewedPromotionDiscountPercent(value = process.env.STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT) {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function publicPriceFromVerifiedStripePrice(
  price: Stripe.Price,
  interval: BillingInterval,
): PublicBillingPrice {
  const sourceInterval = price.recurring?.interval === 'month' || price.recurring?.interval === 'year'
    ? price.recurring.interval
    : null;
  return {
    identityFingerprint: null,
    unitAmount: price.unit_amount,
    currency: price.currency,
    interval,
    sourceInterval,
    active: price.active,
    display: '',
    effectiveMonthlyDisplay: '',
    savingsLabel: '',
    sourceStatus: 'verified',
  };
}

function unavailableCommercialOptions(): StripeCommercialReadinessSnapshot['options'] {
  return {
    pro: { month: false, year: false },
    studio: { month: false, year: false },
  };
}

function commercialReadinessKey(
  prices: Record<BillingPlan, Record<BillingInterval, PublicBillingPrice>>,
  reviewedCeiling: number | null,
) {
  return JSON.stringify([
    reviewedCeiling,
    ...(['pro', 'studio'] as BillingPlan[]).flatMap(plan =>
      (['month', 'year'] as BillingInterval[]).map(interval => {
        const price = prices[plan][interval];
        return [
          plan,
          interval,
          price.identityFingerprint,
          price.unitAmount,
          price.currency,
          price.sourceInterval,
          price.active,
          price.sourceStatus,
        ];
      }),
    ),
  ]);
}

async function evaluateStripeCommercialReadiness(
  stripe: Parameters<typeof auditStripePromotionDiscountCeilingWithTimeout>[0],
  prices: Record<BillingPlan, Record<BillingInterval, PublicBillingPrice>>,
  reviewedCeiling: number | null,
  now: number,
): Promise<StripeCommercialReadinessSnapshot> {
  const checkedAt = new Date(now).toISOString();
  if (reviewedCeiling == null) {
    return {
      verified: false,
      code: 'CHECKOUT_PROMOTION_POLICY_INVALID',
      options: unavailableCommercialOptions(),
      checkedAt,
    };
  }

  const promotionAudit = await auditStripePromotionDiscountCeilingWithTimeout(
    stripe,
    reviewedCeiling,
    STRIPE_CHECKOUT_PROMOTION_AUDIT_TIMEOUT_MS,
  );
  if (!promotionAudit.verified) {
    return {
      verified: false,
      code: 'CHECKOUT_PROMOTION_INVENTORY_UNVERIFIED',
      options: unavailableCommercialOptions(),
      checkedAt,
    };
  }

  const options = unavailableCommercialOptions();
  for (const plan of ['pro', 'studio'] as BillingPlan[]) {
    for (const interval of ['month', 'year'] as BillingInterval[]) {
      options[plan][interval] = assessSonaPlanIntervalEconomics(plan, prices[plan][interval], {
        promotionCodesEnabled: true,
        promotionDiscountPercent: reviewedCeiling,
      }).intervalEconomics.status === 'pass';
    }
  }
  const verified = Object.values(options).some(intervals => Object.values(intervals).some(Boolean));
  return {
    verified,
    code: verified ? 'CHECKOUT_ECONOMICS_READY' : 'CHECKOUT_ECONOMICS_BLOCKED',
    options,
    checkedAt,
  };
}

export async function getStripeCommercialReadinessSnapshot(
  stripe: Parameters<typeof auditStripePromotionDiscountCeilingWithTimeout>[0],
  prices: Record<BillingPlan, Record<BillingInterval, PublicBillingPrice>>,
  options: {
    reviewedPromotionDiscountPercent?: string;
    force?: boolean;
    now?: number;
  } = {},
): Promise<StripeCommercialReadinessSnapshot> {
  const now = options.now ?? Date.now();
  const reviewedCeiling = reviewedPromotionDiscountPercent(options.reviewedPromotionDiscountPercent);
  const key = commercialReadinessKey(prices, reviewedCeiling);
  if (!options.force && commercialReadinessCache?.key === key && commercialReadinessCache.expiresAt > now) {
    return commercialReadinessCache.value;
  }
  if (!options.force && commercialReadinessFlight?.key === key) {
    return commercialReadinessFlight.promise;
  }

  const promise = evaluateStripeCommercialReadiness(stripe, prices, reviewedCeiling, now)
    .then(value => {
      commercialReadinessCache = {
        key,
        expiresAt: now + (value.verified
          ? STRIPE_COMMERCIAL_READINESS_PASS_TTL_MS
          : STRIPE_COMMERCIAL_READINESS_BLOCK_TTL_MS),
        value,
      };
      return value;
    })
    .finally(() => {
      if (commercialReadinessFlight?.key === key) commercialReadinessFlight = null;
    });
  commercialReadinessFlight = { key, promise };
  return promise;
}

export async function verifyStripeCheckoutEconomics(
  stripe: Parameters<typeof auditStripePromotionDiscountCeilingWithTimeout>[0],
  input: {
    plan: BillingPlan;
    interval: BillingInterval;
    selectedPrice: Stripe.Price;
    reviewedPromotionDiscountPercent?: string;
  },
): Promise<StripeCheckoutEconomicsDecision> {
  const gateVersion = STRIPE_CHECKOUT_ECONOMICS_GATE_VERSION;
  const reviewedCeiling = reviewedPromotionDiscountPercent(input.reviewedPromotionDiscountPercent);
  if (reviewedCeiling == null) {
    return {
      ready: false,
      code: 'CHECKOUT_PROMOTION_POLICY_INVALID',
      gateVersion,
      promotionAuditReason: 'reviewed_ceiling_missing_or_invalid',
      economicsStatus: 'blocked',
      reason: 'The reviewed promotion ceiling is missing or invalid.',
    };
  }

  const promotionAudit = await auditStripePromotionDiscountCeilingWithTimeout(
    stripe,
    reviewedCeiling,
    STRIPE_CHECKOUT_PROMOTION_AUDIT_TIMEOUT_MS,
  );
  if (!promotionAudit.verified) {
    return {
      ready: false,
      code: 'CHECKOUT_PROMOTION_INVENTORY_UNVERIFIED',
      gateVersion,
      promotionAuditReason: promotionAudit.reason,
      economicsStatus: 'blocked',
      reason: 'Stripe promotion exposure could not be verified within the checkout safety bound.',
    };
  }

  const economics = assessSonaPlanIntervalEconomics(
    input.plan,
    publicPriceFromVerifiedStripePrice(input.selectedPrice, input.interval),
    {
      promotionCodesEnabled: true,
      promotionDiscountPercent: reviewedCeiling,
    },
  ).intervalEconomics;
  if (economics.status !== 'pass') {
    return {
      ready: false,
      code: 'CHECKOUT_ECONOMICS_BLOCKED',
      gateVersion,
      promotionAuditReason: promotionAudit.reason,
      economicsStatus: economics.status,
      reason: economics.reason,
    };
  }

  return {
    ready: true,
    code: 'CHECKOUT_ECONOMICS_READY',
    gateVersion,
    promotionAuditReason: promotionAudit.reason,
    economicsStatus: economics.status,
    reason: economics.reason,
  };
}
