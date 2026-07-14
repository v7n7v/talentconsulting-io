import type { StripeCheckoutRecovery } from '@/lib/billing/stripe-checkout-recovery';

export type StripeCheckoutPublicStatus = 'idle' | 'pending' | 'open' | 'complete' | 'expired';

export type StripeCheckoutResumeResult =
  | { status: 'open'; mode: 'hosted'; url: string }
  | { status: 'open'; mode: 'embedded'; clientSecret: string }
  | { status: 'idle' | 'pending' | 'complete' | 'expired' };

export function parseStripeCheckoutPublicStatus(payload: unknown): StripeCheckoutPublicStatus | null {
  if (!payload || typeof payload !== 'object' || !('status' in payload)) return null;
  const status = (payload as { status?: unknown }).status;
  return status === 'idle'
    || status === 'pending'
    || status === 'open'
    || status === 'complete'
    || status === 'expired'
    ? status
    : null;
}

export function parseStripeCheckoutResumeResult(payload: unknown): StripeCheckoutResumeResult | null {
  const status = parseStripeCheckoutPublicStatus(payload);
  if (!status) return null;
  if (status !== 'open') return { status };
  const data = payload as Record<string, unknown>;
  if (data.mode === 'embedded') {
    return typeof data.clientSecret === 'string'
      && data.clientSecret.startsWith('cs_')
      && data.clientSecret.includes('_secret_')
      ? { status: 'open', mode: 'embedded', clientSecret: data.clientSecret }
      : null;
  }
  if (data.mode === 'hosted' && typeof data.url === 'string') {
    try {
      const url = new URL(data.url);
      return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com'
        ? { status: 'open', mode: 'hosted', url: url.toString() }
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function recoveryForStripeCheckoutStatus(
  status: StripeCheckoutPublicStatus,
): StripeCheckoutRecovery | null {
  if (status === 'idle' || status === 'expired') return null;
  if (status === 'complete') {
    return {
      code: 'STRIPE_SUBSCRIPTION_EXISTS',
      title: 'Checkout is complete',
      message: 'Stripe confirmed checkout. Billing settings will show the new plan after the signed confirmation finishes.',
      primaryAction: 'manage_billing',
      primaryLabel: 'View billing',
      retryAllowed: false,
    };
  }
  if (status === 'open') {
    return {
      code: 'STRIPE_CHECKOUT_CONFIRMATION_PENDING',
      title: 'Checkout is still open',
      message: 'Stripe confirmed an active checkout. Return to its Stripe window if available; new attempts remain paused to prevent a duplicate.',
      primaryAction: 'resume_checkout',
      primaryLabel: 'Resume checkout',
      retryAllowed: false,
    };
  }
  return {
    code: 'STRIPE_CHECKOUT_CONFIRMATION_PENDING',
    title: 'Checkout confirmation is pending',
    message: 'Stripe has not confirmed the checkout outcome yet. New attempts remain paused to prevent a duplicate.',
    primaryAction: 'check_availability',
    primaryLabel: 'Check status',
    retryAllowed: false,
  };
}
