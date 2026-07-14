import type { BillingPlan } from '@/lib/billing-price-types';

export type StripePlanResolutionStatus = 'price_verified' | 'metadata_conflict' | 'configuration_conflict' | 'unknown_price';

export function resolveStripePlanFromConfiguredPrice(input: {
  priceId: string | null | undefined;
  metadataPlan?: string | null;
  proPriceIds: Array<string | undefined>;
  studioPriceIds: Array<string | undefined>;
}) {
  const priceId = input.priceId || '';
  const pro = new Set(input.proPriceIds.filter((value): value is string => Boolean(value)));
  const studio = new Set(input.studioPriceIds.filter((value): value is string => Boolean(value)));
  const inPro = Boolean(priceId && pro.has(priceId));
  const inStudio = Boolean(priceId && studio.has(priceId));
  if (inPro && inStudio) {
    return { plan: null, status: 'configuration_conflict' as const };
  }
  if (!inPro && !inStudio) {
    return { plan: null, status: 'unknown_price' as const };
  }
  const plan: BillingPlan = inStudio ? 'studio' : 'pro';
  const metadataPlan = input.metadataPlan === 'pro' || input.metadataPlan === 'studio'
    ? input.metadataPlan
    : null;
  return {
    plan,
    status: metadataPlan && metadataPlan !== plan
      ? 'metadata_conflict' as const
      : 'price_verified' as const,
  };
}

export const STRIPE_SUBSCRIPTION_EVENT_PRIORITY: Record<string, number> = {
  'checkout.session.completed': 10,
  'invoice.payment_succeeded': 20,
  'customer.subscription.updated': 30,
  'invoice.payment_failed': 40,
  'customer.subscription.deleted': 50,
};

export function decideStripeSubscriptionStateWrite(
  current: Record<string, unknown> | null | undefined,
  incoming: {
    eventId: string;
    eventType: string;
    eventCreated: number;
    subscriptionId?: string | null;
    subscriptionCreated?: number | null;
    entitled?: boolean;
  },
) {
  const currentCreated = Number(current?.stripeStateEventCreated);
  const currentPriority = Number(current?.stripeStateEventPriority);
  const incomingPriority = STRIPE_SUBSCRIPTION_EVENT_PRIORITY[incoming.eventType] || 0;
  if (current?.stripeStateEventId === incoming.eventId) {
    return { apply: false, resumeSideEffects: true, reason: 'duplicate' as const, priority: incomingPriority };
  }
  const currentSubscriptionId = typeof current?.stripeStateSubscriptionId === 'string'
    ? current.stripeStateSubscriptionId
    : null;
  const differentSubscription = Boolean(
    currentSubscriptionId
    && incoming.subscriptionId
    && currentSubscriptionId !== incoming.subscriptionId,
  );
  if (
    differentSubscription
    && incoming.eventType !== 'checkout.session.completed'
  ) {
    return { apply: false, resumeSideEffects: false, reason: 'different_subscription' as const, priority: incomingPriority };
  }
  if (differentSubscription && incoming.eventType === 'checkout.session.completed') {
    const currentSubscriptionCreated = Number(current?.stripeStateSubscriptionCreated);
    const currentEntitled = current?.stripeStateEntitled === true;
    if (
      Number.isFinite(currentSubscriptionCreated)
      && Number.isFinite(incoming.subscriptionCreated)
      && Number(incoming.subscriptionCreated) < currentSubscriptionCreated
    ) {
      return { apply: false, resumeSideEffects: false, reason: 'older_subscription' as const, priority: incomingPriority };
    }
    if (
      Number.isFinite(currentSubscriptionCreated)
      && Number(incoming.subscriptionCreated) === currentSubscriptionCreated
    ) {
      if (currentEntitled !== Boolean(incoming.entitled)) {
        return incoming.entitled
          ? { apply: true, resumeSideEffects: true, reason: 'active_subscription' as const, priority: incomingPriority }
          : { apply: false, resumeSideEffects: false, reason: 'inactive_subscription' as const, priority: incomingPriority };
      }
      if (String(incoming.subscriptionId) <= String(currentSubscriptionId)) {
        return { apply: false, resumeSideEffects: false, reason: 'subscription_tiebreak' as const, priority: incomingPriority };
      }
    }
    return { apply: true, resumeSideEffects: true, reason: 'new_subscription' as const, priority: incomingPriority };
  }
  if (Number.isFinite(currentCreated)) {
    if (incoming.eventCreated < currentCreated) {
      return { apply: false, resumeSideEffects: false, reason: 'stale' as const, priority: incomingPriority };
    }
    if (
      incoming.eventCreated === currentCreated
      && Number.isFinite(currentPriority)
      && incomingPriority < currentPriority
    ) {
      return { apply: false, resumeSideEffects: false, reason: 'lower_priority' as const, priority: incomingPriority };
    }
  }
  return { apply: true, resumeSideEffects: true, reason: 'current' as const, priority: incomingPriority };
}

export function decideStripeEventProcessingClaim(
  current: Record<string, unknown> | null | undefined,
  now = Date.now(),
) {
  const status = typeof current?.processingStatus === 'string' ? current.processingStatus : null;
  if (status === 'processed' || status === 'ignored') {
    return { acquire: false, reason: 'terminal' as const };
  }
  const leaseUntil = typeof current?.processingLeaseUntil === 'string'
    ? Date.parse(current.processingLeaseUntil)
    : Number.NaN;
  if (status === 'processing' && Number.isFinite(leaseUntil) && leaseUntil > now) {
    return { acquire: false, reason: 'in_progress' as const };
  }
  return {
    acquire: true,
    reason: status === 'failed' ? 'retry' as const : status === 'processing' ? 'lease_expired' as const : 'new' as const,
  };
}
