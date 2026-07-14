export const STRIPE_WEBHOOK_HANDLED_EVENTS = [
  'checkout.session.completed',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.finalized',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'refund.created',
  'refund.updated',
  'refund.failed',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'customer.subscription.trial_will_end',
] as const;

export type StripeWebhookHandledEvent = typeof STRIPE_WEBHOOK_HANDLED_EVENTS[number];

export function isHandledStripeWebhookEvent(value: string): value is StripeWebhookHandledEvent {
  return (STRIPE_WEBHOOK_HANDLED_EVENTS as readonly string[]).includes(value);
}
