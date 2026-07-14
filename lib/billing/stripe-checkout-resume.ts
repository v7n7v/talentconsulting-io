import Stripe from 'stripe';

export const STRIPE_CHECKOUT_RESUME_MIN_LIFETIME_MS = 15_000;

export type StripeCheckoutResumePayload =
  | { status: 'open'; mode: 'hosted'; url: string }
  | { status: 'open'; mode: 'embedded'; clientSecret: string };

function hostedCheckoutUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function buildStripeCheckoutResumePayload(
  session: Stripe.Checkout.Session,
  nowMs = Date.now(),
): StripeCheckoutResumePayload | null {
  if (
    session.status !== 'open'
    || !Number.isFinite(session.expires_at)
    || session.expires_at * 1_000 - nowMs < STRIPE_CHECKOUT_RESUME_MIN_LIFETIME_MS
    || (session.metadata?.plan !== 'pro' && session.metadata?.plan !== 'studio')
    || (session.metadata?.interval !== 'month' && session.metadata?.interval !== 'year')
  ) {
    return null;
  }
  const mode = session.ui_mode || 'hosted';
  if (mode === 'hosted') {
    const url = hostedCheckoutUrl(session.url);
    return url ? { status: 'open', mode: 'hosted', url } : null;
  }
  if (mode === 'embedded') {
    return typeof session.client_secret === 'string'
      && session.client_secret.startsWith('cs_')
      && session.client_secret.includes('_secret_')
      ? { status: 'open', mode: 'embedded', clientSecret: session.client_secret }
      : null;
  }
  return null;
}
