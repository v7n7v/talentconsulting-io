import type Stripe from 'stripe';

export type StripeWebhookEnvelopeResult =
  | { accepted: true; event: Stripe.Event }
  | { accepted: false; event: Stripe.Event; reason: 'mode_mismatch' };

export function resolveExpectedStripeLiveMode(secretKey: string | null | undefined) {
  const normalized = secretKey?.trim() || '';
  if (normalized.startsWith('sk_live_')) return true;
  if (normalized.startsWith('sk_test_')) return false;
  throw new Error('Stripe key mode could not be resolved');
}

export function verifyStripeWebhookEnvelope(input: {
  stripe: Stripe;
  body: string;
  signature: string;
  webhookSecret: string;
  expectedLiveMode: boolean;
}): StripeWebhookEnvelopeResult {
  const event = input.stripe.webhooks.constructEvent(
    input.body,
    input.signature,
    input.webhookSecret,
  );

  if (event.livemode !== input.expectedLiveMode) {
    return { accepted: false, event, reason: 'mode_mismatch' };
  }

  return { accepted: true, event };
}
