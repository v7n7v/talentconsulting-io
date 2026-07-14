export const STRIPE_TRIAL_POLICY_VERSION = 'first-subscription-v1-2026-07-11';
export const STRIPE_TRIAL_DAYS = 7;
export const STRIPE_TRIAL_POLICY_ENFORCEMENT_EPOCH = 1_783_728_000;

export type StripeTrialOfferReason = 'first_subscription' | 'subscription_history';

export type StripeTrialOffer = {
  policyVersion: typeof STRIPE_TRIAL_POLICY_VERSION;
  eligible: boolean;
  days: number;
  reason: StripeTrialOfferReason;
};

type StripeCustomerSubscriptionHistoryReader = {
  subscriptions: {
    list(input: {
      customer: string;
      status: 'all';
      limit: 100;
    }, options?: {
      timeout: number;
      maxNetworkRetries: number;
    }): Promise<{ data: Array<{ id: string; status: string }> }>;
  };
};

const BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'paused',
  'incomplete',
]);

export function decideStripeTrialOffer(hasSubscriptionHistory: boolean): StripeTrialOffer {
  return {
    policyVersion: STRIPE_TRIAL_POLICY_VERSION,
    eligible: !hasSubscriptionHistory,
    days: hasSubscriptionHistory ? 0 : STRIPE_TRIAL_DAYS,
    reason: hasSubscriptionHistory ? 'subscription_history' : 'first_subscription',
  };
}

export async function resolveStripeCustomerSubscriptionHistory(
  stripe: StripeCustomerSubscriptionHistoryReader,
  customerIds: string[],
  options: {
    requestOptions?: { timeout: number; maxNetworkRetries: number };
    signal?: AbortSignal;
  } = {},
) {
  const uniqueCustomerIds = [...new Set(customerIds.filter(Boolean))];
  if (options.signal?.aborted) throw new Error('Stripe subscription history deadline exceeded.');
  const results = await Promise.all(uniqueCustomerIds.map(customer => stripe.subscriptions.list({
    customer,
    status: 'all',
    limit: 100,
  }, options.requestOptions)));
  if (options.signal?.aborted) throw new Error('Stripe subscription history deadline exceeded.');
  const subscriptions = results.flatMap(result => result.data);
  const blockingSubscription = subscriptions.find(subscription => BLOCKING_SUBSCRIPTION_STATUSES.has(subscription.status));
  return {
    customerCount: uniqueCustomerIds.length,
    hasHistory: subscriptions.length > 0,
    blockingSubscription: blockingSubscription
      ? { id: blockingSubscription.id, status: blockingSubscription.status }
      : null,
  };
}

export function buildStripeTrialMetadata(offer: StripeTrialOffer) {
  return {
    trialPolicyVersion: offer.policyVersion,
    trialEligible: String(offer.eligible),
    trialDays: String(offer.days),
    trialReason: offer.reason,
  };
}

export function buildStripeSubscriptionData(
  metadata: Record<string, string>,
  offer: StripeTrialOffer,
) {
  return {
    ...(offer.eligible ? { trial_period_days: offer.days } : {}),
    metadata,
  };
}

export function parseStripeTrialMetadata(metadata: Record<string, string> | null | undefined) {
  if (!metadata) return null;
  if (metadata.trialPolicyVersion !== STRIPE_TRIAL_POLICY_VERSION) return null;
  if (metadata.trialEligible !== 'true' && metadata.trialEligible !== 'false') return null;
  if (metadata.trialReason !== 'first_subscription' && metadata.trialReason !== 'subscription_history') return null;
  if (!/^\d+$/.test(metadata.trialDays || '')) return null;

  const eligible = metadata.trialEligible === 'true';
  const days = Number(metadata.trialDays);
  const expected = decideStripeTrialOffer(!eligible);
  if (days !== expected.days || metadata.trialReason !== expected.reason) return null;

  return expected;
}

export function resolveStripeTrialEvidence(input: {
  sessionMetadata: Record<string, string> | null | undefined;
  subscriptionMetadata: Record<string, string> | null | undefined;
  subscriptionStatus: string;
  trialStart: number | null | undefined;
  trialEnd: number | null | undefined;
  checkoutCreated: number | null | undefined;
}) {
  const sessionMarked = typeof input.sessionMetadata?.trialPolicyVersion === 'string';
  const subscriptionMarked = typeof input.subscriptionMetadata?.trialPolicyVersion === 'string';
  const trialStarted = input.subscriptionStatus === 'trialing';
  const trialWindowValid = !trialStarted || (
    Number.isInteger(input.trialStart)
    && Number.isInteger(input.trialEnd)
    && Number(input.trialEnd) > Number(input.trialStart)
    && Math.round((Number(input.trialEnd) - Number(input.trialStart)) / 86_400) === STRIPE_TRIAL_DAYS
  );

  if (!sessionMarked && !subscriptionMarked) {
    const isLegacy = Number.isInteger(input.checkoutCreated)
      && Number(input.checkoutCreated) < STRIPE_TRIAL_POLICY_ENFORCEMENT_EPOCH;
    return {
      status: isLegacy ? 'legacy_missing' as const : 'invalid' as const,
      offer: null,
      trialStarted,
      trialWindowValid,
    };
  }
  if (!sessionMarked || !subscriptionMarked) {
    return { status: 'invalid' as const, offer: null, trialStarted, trialWindowValid };
  }

  const sessionOffer = parseStripeTrialMetadata(input.sessionMetadata);
  const subscriptionOffer = parseStripeTrialMetadata(input.subscriptionMetadata);
  if (!sessionOffer || !subscriptionOffer) {
    return { status: 'invalid' as const, offer: null, trialStarted, trialWindowValid };
  }
  if (
    sessionOffer.eligible !== subscriptionOffer.eligible
    || sessionOffer.days !== subscriptionOffer.days
    || sessionOffer.reason !== subscriptionOffer.reason
  ) {
    return { status: 'conflict' as const, offer: null, trialStarted, trialWindowValid };
  }
  if (sessionOffer.eligible !== trialStarted || !trialWindowValid) {
    return { status: 'stripe_mismatch' as const, offer: sessionOffer, trialStarted, trialWindowValid };
  }

  return { status: 'verified' as const, offer: sessionOffer, trialStarted, trialWindowValid };
}

export function preserveStripeTrialQuarantine(
  current: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
) {
  if (current?.trialPolicyQuarantined === true && incoming.status === 'trialing') {
    return { ...incoming, plan: 'free', trialPolicyQuarantined: true };
  }
  if (
    incoming.status === 'trialing'
    && incoming.trialPolicyPendingCheckout === true
    && current?.stripeCheckoutEvidenceVerified !== true
  ) {
    return { ...incoming, plan: 'free', trialPolicyPendingCheckout: true };
  }
  if (incoming.status === 'trialing' && current?.stripeCheckoutEvidenceVerified === true) {
    return { ...incoming, stripeCheckoutEvidenceVerified: true, trialPolicyPendingCheckout: false };
  }
  return incoming;
}

export function resolveStripeSubscriptionTrialState(subscription: {
  metadata: Record<string, string> | null | undefined;
  status: string;
  trial_start: number | null | undefined;
  trial_end: number | null | undefined;
  created: number | null | undefined;
}) {
  const evidence = resolveStripeTrialEvidence({
    sessionMetadata: subscription.metadata,
    subscriptionMetadata: subscription.metadata,
    subscriptionStatus: subscription.status,
    trialStart: subscription.trial_start,
    trialEnd: subscription.trial_end,
    checkoutCreated: subscription.created,
  });
  const quarantined = subscription.status === 'trialing'
    && evidence.status !== 'verified'
    && evidence.status !== 'legacy_missing';
  return { evidence, quarantined };
}
