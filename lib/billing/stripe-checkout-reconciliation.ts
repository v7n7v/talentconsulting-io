import Stripe from 'stripe';

export const STRIPE_CHECKOUT_RECONCILIATION_TIMEOUT_MS = 5_000;
export const STRIPE_CHECKOUT_RECONCILIATION_DEADLINE_MS = 6_000;
export const STRIPE_CHECKOUT_RECONCILIATION_MAX_NETWORK_RETRIES = 0;

export type StripeCheckoutReconciliationStatus =
  | 'open'
  | 'complete'
  | 'expired'
  | 'not_found'
  | 'ambiguous';

type StripeCheckoutReconciliationClient = {
  checkout: {
    sessions: {
      retrieve(
        id: string,
        options: Stripe.RequestOptions,
      ): Promise<Stripe.Checkout.Session>;
      list(
        params: Stripe.Checkout.SessionListParams,
        options: Stripe.RequestOptions,
      ): Promise<{ data: Stripe.Checkout.Session[]; has_more?: boolean }>;
    };
  };
};

export type PendingCheckoutReceipt = {
  checkoutSessionId: string;
  mode: 'hosted' | 'embedded';
  plan: 'pro' | 'studio';
  interval: 'month' | 'year';
};

function requestOptions() {
  return {
    timeout: STRIPE_CHECKOUT_RECONCILIATION_TIMEOUT_MS,
    maxNetworkRetries: STRIPE_CHECKOUT_RECONCILIATION_MAX_NETWORK_RETRIES,
  } satisfies Stripe.RequestOptions;
}

function isMissingStripeResource(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const data = error as { type?: unknown; code?: unknown };
  return data.type === 'StripeInvalidRequestError' && data.code === 'resource_missing';
}

function sessionMatchesReservation(
  session: Stripe.Checkout.Session,
  input: {
    uid: string;
    reservationId: string;
    receipt?: PendingCheckoutReceipt | null;
  },
) {
  if (
    session.metadata?.firebaseUid !== input.uid
    || session.metadata?.checkoutReservationId !== input.reservationId
  ) {
    return false;
  }
  if (!input.receipt) return true;
  const mode = session.ui_mode || 'hosted';
  return session.id === input.receipt.checkoutSessionId
    && mode === input.receipt.mode
    && session.metadata?.plan === input.receipt.plan
    && session.metadata?.interval === input.receipt.interval;
}

function normalizedSessionStatus(
  session: Stripe.Checkout.Session,
): StripeCheckoutReconciliationStatus {
  return session.status === 'open'
    || session.status === 'complete'
    || session.status === 'expired'
    ? session.status
    : 'ambiguous';
}

async function withDeadline<T>(operation: Promise<T>, deadlineMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Stripe checkout reconciliation deadline exceeded.')), deadlineMs);
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function findStripeCheckoutSession(
  stripe: StripeCheckoutReconciliationClient,
  input: {
    uid: string;
    email: string;
    reservationId: string;
    reservationStartedAtMs: number;
    receipt?: PendingCheckoutReceipt | null;
    deadlineMs?: number;
  },
): Promise<{ status: StripeCheckoutReconciliationStatus; session?: Stripe.Checkout.Session }> {
  const deadlineMs = input.deadlineMs ?? STRIPE_CHECKOUT_RECONCILIATION_DEADLINE_MS;
  if (input.receipt) {
    try {
      const session = await withDeadline(
        stripe.checkout.sessions.retrieve(input.receipt.checkoutSessionId, requestOptions()),
        deadlineMs,
      );
      if (!sessionMatchesReservation(session, input)) return { status: 'ambiguous' };
      return { status: normalizedSessionStatus(session), session };
    } catch (error) {
      if (isMissingStripeResource(error)) return { status: 'not_found' };
      throw error;
    }
  }

  const result = await withDeadline(
    stripe.checkout.sessions.list({
      customer_details: { email: input.email.trim().toLowerCase() },
      created: { gte: Math.max(0, Math.floor(input.reservationStartedAtMs / 1_000) - 60) },
      limit: 100,
    }, requestOptions()),
    deadlineMs,
  );
  if (result.has_more) return { status: 'ambiguous' };
  const matches = result.data.filter(session => sessionMatchesReservation(session, input));
  if (matches.length === 0) return { status: 'not_found' };
  if (matches.length > 1) return { status: 'ambiguous' };
  return { status: normalizedSessionStatus(matches[0]), session: matches[0] };
}

export async function reconcileStripeCheckoutSession(
  stripe: StripeCheckoutReconciliationClient,
  input: {
    uid: string;
    email: string;
    reservationId: string;
    reservationStartedAtMs: number;
    receipt?: PendingCheckoutReceipt | null;
    deadlineMs?: number;
  },
): Promise<{ status: StripeCheckoutReconciliationStatus }> {
  const result = await findStripeCheckoutSession(stripe, input);
  return { status: result.status };
}
