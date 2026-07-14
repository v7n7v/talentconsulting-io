import {
  normalizePublicBillingPrices,
  type BillingInterval,
  type BillingPlan,
} from '@/lib/billing-price-types';
import {
  validateStripeCheckoutPriceContract,
  type StripeCheckoutPriceEvidence,
} from '@/lib/billing/stripe-checkout-price-contract';
import { getStripeRuntimeReadiness } from '@/lib/billing/stripe-runtime-readiness';
import { stripePriceIdentityFingerprint } from '@/lib/billing/stripe-price-identity';
import { auditStripePromotionDiscountCeiling } from '@/lib/billing/stripe-promotion-audit';

type CanaryEnvironment = Parameters<typeof getStripeRuntimeReadiness>[0] & {
  STAGING_HOSTNAME?: string;
  STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT?: string;
};

export { auditStripePromotionDiscountCeiling };

export type StripeStagingCanaryPriceMap = Record<
  BillingPlan,
  Record<BillingInterval, StripeCheckoutPriceEvidence>
>;

export function validateStripeStagingCanaryUrl(baseUrl: string, stagingHostname: string | undefined) {
  try {
    const url = new URL(baseUrl);
    const hostname = stagingHostname?.trim() || '';
    const valid = Boolean(hostname)
      && url.protocol === 'https:'
      && url.hostname === hostname
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && (url.port === '' || url.port === '443')
      && (url.pathname === '/' || url.pathname === '');
    return { valid, origin: valid ? url.origin : null };
  } catch {
    return { valid: false, origin: null };
  }
}

export function assessStripeStagingCanaryConfiguration(env: CanaryEnvironment, baseUrl: string) {
  const runtime = getStripeRuntimeReadiness({
    ...env,
    STRIPE_BUILD_PUBLISHABLE_KEY: env.STRIPE_BUILD_PUBLISHABLE_KEY
      || env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });
  const url = validateStripeStagingCanaryUrl(baseUrl, env.STAGING_HOSTNAME);
  const promotionCeilingValue = env.STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT?.trim() || '';
  const promotionCeiling = promotionCeilingValue ? Number(promotionCeilingValue) : Number.NaN;
  const promotionCeilingValid = Number.isFinite(promotionCeiling)
    && promotionCeiling >= 0
    && promotionCeiling <= 100;
  const errors: string[] = [];
  if (runtime.environment !== 'staging') errors.push('environment:staging_marker_required');
  if (runtime.requiredMode !== 'test' || runtime.secretKeyMode !== 'test') {
    errors.push('stripe:test_mode_required');
  }
  if (!runtime.configurationReady) errors.push('stripe:checkout_configuration_incomplete');
  if (!promotionCeilingValid) errors.push('stripe:promotion_ceiling_invalid');
  if (!url.valid) errors.push('staging_url:invalid_or_mismatched');
  return {
    ready: errors.length === 0,
    errors,
    origin: url.origin,
    runtime,
    reviewedPromotionCeiling: promotionCeilingValid ? promotionCeiling : null,
  };
}

export function buildStripeStagingCanaryAssessment(input: {
  env: CanaryEnvironment;
  baseUrl: string;
  prices: StripeStagingCanaryPriceMap;
  promotionAudit: {
    verified: boolean;
    reason: string;
    activeCodeCount: number;
    maxObservedPercent: number | null;
    pagesRead: number;
  };
  publicPricing: unknown;
  health: unknown;
}) {
  const configuration = assessStripeStagingCanaryConfiguration(input.env, input.baseUrl);
  const errors = [...configuration.errors];
  if (!input.promotionAudit.verified) {
    errors.push(`stripe:promotion_inventory:${input.promotionAudit.reason}`);
  }
  const configuredPriceIds = {
    pro: {
      month: input.env.STRIPE_PRO_PRICE_ID,
      year: input.env.STRIPE_PRO_ANNUAL_PRICE_ID,
    },
    studio: {
      month: input.env.STRIPE_STUDIO_PRICE_ID,
      year: input.env.STRIPE_STUDIO_ANNUAL_PRICE_ID,
    },
  };
  const ids = Object.values(input.prices).flatMap(plan => Object.values(plan).map(price => price.id));
  if (new Set(ids).size !== ids.length) errors.push('stripe:retrieved_price_ids_not_unique');

  for (const interval of ['month', 'year'] as const) {
    const pro = input.prices.pro[interval];
    const studio = input.prices.studio[interval];
    for (const plan of ['pro', 'studio'] as const) {
      if (input.prices[plan][interval].id !== configuredPriceIds[plan][interval]?.trim()) {
        errors.push(`stripe:${interval}:${plan}:configured_id_mismatch`);
      }
      const result = validateStripeCheckoutPriceContract({
        plan,
        interval,
        selectedPriceId: input.prices[plan][interval].id,
        pro,
        studio,
      });
      if (!result.valid) errors.push(`stripe:${interval}:${plan}:${result.reason}`);
    }
  }

  const publicPricing = normalizePublicBillingPrices(input.publicPricing);
  if (!publicPricing.checkout.available) errors.push('deployed_checkout:not_ready');
  for (const plan of ['pro', 'studio'] as const) {
    for (const interval of ['month', 'year'] as const) {
      const actual = input.prices[plan][interval];
      const deployed = publicPricing.plans[plan][interval];
      if (publicPricing.checkout.options[plan][interval] !== true) {
        errors.push(`deployed_checkout:${plan}:${interval}:unavailable`);
      }
      if (
        deployed.sourceStatus !== 'verified'
        || deployed.identityFingerprint !== stripePriceIdentityFingerprint(actual.id)
        || !deployed.active
        || deployed.sourceInterval !== interval
        || deployed.unitAmount !== actual.unitAmount
        || deployed.currency.toLowerCase() !== actual.currency.toLowerCase()
      ) {
        errors.push(`deployed_price:${plan}:${interval}:mismatch`);
      }
    }
  }

  const health = input.health as { status?: unknown } | null;
  if (!health || health.status !== 'ok') errors.push('staging_health:not_ok');

  return {
    ready: errors.length === 0,
    errors: [...new Set(errors)],
    checks: {
      stagingTestConfiguration: configuration.ready,
      stripePromotionInventory: input.promotionAudit.verified,
      stripePriceObjects: errors.every(error => !error.startsWith('stripe:month:') && !error.startsWith('stripe:year:')),
      deployedCheckout: errors.every(error => !error.startsWith('deployed_')),
      stagingHealth: !errors.includes('staging_health:not_ok'),
      writesAttempted: 0 as const,
    },
  };
}
