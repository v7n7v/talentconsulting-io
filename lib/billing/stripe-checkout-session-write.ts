import Stripe from 'stripe';

export const STRIPE_CHECKOUT_SESSION_WRITE_TIMEOUT_MS = 8_000;
export const STRIPE_CHECKOUT_SESSION_WRITE_DEADLINE_MS = 9_000;
export const STRIPE_CHECKOUT_SESSION_WRITE_MAX_NETWORK_RETRIES = 0;

export type StripeCheckoutSessionWriteOutcome = 'rejected' | 'ambiguous';

type StripeCheckoutSessionClient = {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
        options: Stripe.RequestOptions,
      ): Promise<Stripe.Checkout.Session>;
    };
  };
};

const DEFINITIVE_REJECTION_TYPES = new Set([
  'StripeAuthenticationError',
  'StripeCardError',
  'StripeIdempotencyError',
  'StripeInvalidRequestError',
  'StripePermissionError',
]);

function stripeErrorType(error: unknown) {
  if (!error || typeof error !== 'object' || !('type' in error)) return '';
  return String((error as { type?: unknown }).type || '');
}

export class StripeCheckoutSessionWriteError extends Error {
  readonly checkoutSessionOutcome: StripeCheckoutSessionWriteOutcome;

  constructor(outcome: StripeCheckoutSessionWriteOutcome, cause?: unknown) {
    super(
      outcome === 'ambiguous'
        ? 'Stripe checkout session outcome is unknown'
        : 'Stripe checkout session creation was rejected',
      { cause },
    );
    this.name = 'StripeCheckoutSessionWriteError';
    this.checkoutSessionOutcome = outcome;
  }
}

export function classifyStripeCheckoutSessionWriteError(
  error: unknown,
): StripeCheckoutSessionWriteOutcome {
  return DEFINITIVE_REJECTION_TYPES.has(stripeErrorType(error))
    ? 'rejected'
    : 'ambiguous';
}

export async function createStripeCheckoutSession(
  stripe: StripeCheckoutSessionClient,
  params: Stripe.Checkout.SessionCreateParams,
  input: {
    idempotencyKey: string;
    deadlineMs?: number;
  },
) {
  const deadlineMs = input.deadlineMs ?? STRIPE_CHECKOUT_SESSION_WRITE_DEADLINE_MS;
  const requestOptions = {
    idempotencyKey: input.idempotencyKey,
    timeout: STRIPE_CHECKOUT_SESSION_WRITE_TIMEOUT_MS,
    maxNetworkRetries: STRIPE_CHECKOUT_SESSION_WRITE_MAX_NETWORK_RETRIES,
  } satisfies Stripe.RequestOptions;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new StripeCheckoutSessionWriteError('ambiguous'));
    }, deadlineMs);
  });

  try {
    return await Promise.race([
      stripe.checkout.sessions.create(params, requestOptions),
      deadline,
    ]);
  } catch (error) {
    if (error instanceof StripeCheckoutSessionWriteError) throw error;
    throw new StripeCheckoutSessionWriteError(
      classifyStripeCheckoutSessionWriteError(error),
      error,
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
