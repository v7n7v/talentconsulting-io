import 'server-only';
import Stripe from 'stripe';
import type { getBillingPrices } from '@/lib/billing-prices';
import { buildSonaPlanEconomicsGate } from '@/lib/sona/plan-economics';
import { buildSonaPricingOptionsMemo } from '@/lib/sona/pricing-options-memo';
import {
  auditStripePromotionDiscountCeilingWithTimeout,
  type StripePromotionAuditReason,
} from '@/lib/billing/stripe-promotion-audit';

const ADMIN_PROMOTION_AUDIT_DEADLINE_MS = 6_000;
const ADMIN_STRIPE_REQUEST_TIMEOUT_MS = 5_000;

export type AdminPromotionAuditReason = StripePromotionAuditReason
  | 'reviewed_ceiling_missing_or_invalid'
  | 'stripe_not_configured'
  | 'provider_unavailable';

function reviewedPromotionDiscountPercent() {
  const value = process.env.STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT;
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

export async function buildAdminPlanEconomics(
  prices: Awaited<ReturnType<typeof getBillingPrices>>,
) {
  const reviewedCeiling = reviewedPromotionDiscountPercent();
  let verifiedCeiling: number | null = null;
  let promotionAudit: {
    status: 'verified' | 'blocked';
    reason: AdminPromotionAuditReason;
    activeCodeCount: number;
    maxObservedPercent: number | null;
  } = reviewedCeiling == null
    ? { status: 'blocked', reason: 'reviewed_ceiling_missing_or_invalid', activeCodeCount: 0, maxObservedPercent: null }
    : !process.env.STRIPE_SECRET_KEY
      ? { status: 'blocked', reason: 'stripe_not_configured', activeCodeCount: 0, maxObservedPercent: null }
      : { status: 'blocked', reason: 'provider_unavailable', activeCodeCount: 0, maxObservedPercent: null };
  if (reviewedCeiling != null && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2026-02-25.clover',
        timeout: ADMIN_STRIPE_REQUEST_TIMEOUT_MS,
        maxNetworkRetries: 0,
      });
      const audit = await auditStripePromotionDiscountCeilingWithTimeout(
        stripe,
        reviewedCeiling,
        ADMIN_PROMOTION_AUDIT_DEADLINE_MS,
      );
      promotionAudit = {
        status: audit.verified ? 'verified' : 'blocked',
        reason: audit.reason,
        activeCodeCount: audit.activeCodeCount,
        maxObservedPercent: audit.maxObservedPercent,
      };
      if (audit.verified) verifiedCeiling = reviewedCeiling;
    } catch {
      promotionAudit = {
        status: 'blocked',
        reason: 'provider_unavailable',
        activeCodeCount: 0,
        maxObservedPercent: null,
      };
    }
  }
  return {
    ...buildSonaPlanEconomicsGate(prices, {
      promotionCodesEnabled: true,
      promotionDiscountPercent: verifiedCeiling,
    }),
    promotionAudit,
    pricingOptionsMemo: buildSonaPricingOptionsMemo(prices, {
      reviewedPromotionDiscountPercent: verifiedCeiling,
      promotionEvidence: {
        verified: promotionAudit.status === 'verified',
        activeCodeCount: promotionAudit.activeCodeCount,
        maxObservedPercent: promotionAudit.maxObservedPercent,
      },
    }),
  };
}
