import type Stripe from 'stripe';
import { resolveSonaPurchaseContractEvidence } from '@/lib/sona/purchase-contract';
import { resolveStripePlanFromConfiguredPrice } from '@/lib/billing/stripe-subscription-contract';

type CheckoutMetadata = Record<string, string> | null | undefined;

export function resolveStripeCheckoutWebhookEvidence(input: {
  sessionMetadata: CheckoutMetadata;
  subscription: Stripe.Subscription | null;
  proPriceIds: Array<string | undefined>;
  studioPriceIds: Array<string | undefined>;
}) {
  const price = input.subscription?.items?.data?.[0]?.price;
  const priceId = price?.id || null;
  const planResolution = resolveStripePlanFromConfiguredPrice({
    priceId,
    metadataPlan: input.sessionMetadata?.plan,
    proPriceIds: input.proPriceIds,
    studioPriceIds: input.studioPriceIds,
  });
  if (!planResolution.plan) {
    return {
      valid: false as const,
      status: planResolution.status,
      priceId,
      planResolution,
    };
  }

  const billingInterval = price?.recurring?.interval;
  if (billingInterval !== 'month' && billingInterval !== 'year') {
    return {
      valid: false as const,
      status: 'invalid_interval' as const,
      priceId,
      planResolution,
    };
  }

  return {
    valid: true as const,
    status: 'verified' as const,
    priceId,
    billingInterval,
    plan: planResolution.plan,
    planResolution,
    purchaseContract: resolveSonaPurchaseContractEvidence(
      input.sessionMetadata,
      input.subscription?.metadata,
      planResolution.plan,
      billingInterval,
    ),
  };
}
