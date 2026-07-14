import type Stripe from 'stripe';
import { searchStripeCustomersByFirebaseUid } from '@/lib/stripe-account-selection';
import { resolveStripeCustomerSubscriptionHistory } from '@/lib/billing/stripe-trial-policy';
import { STRIPE_CHECKOUT_MAX_ASSOCIATED_CUSTOMERS } from '@/lib/billing/stripe-checkout-account-policy';

export { STRIPE_CHECKOUT_MAX_ASSOCIATED_CUSTOMERS } from '@/lib/billing/stripe-checkout-account-policy';

export const STRIPE_CHECKOUT_ACCOUNT_READ_TIMEOUT_MS = 5_000;
export const STRIPE_CHECKOUT_ACCOUNT_PHASE_DEADLINE_MS = 6_000;
export const STRIPE_CHECKOUT_ACCOUNT_READ_MAX_NETWORK_RETRIES = 0;

export class StripeCheckoutAccountReviewRequiredError extends Error {
  readonly code = 'associated_customer_limit_exceeded';

  constructor() {
    super('Stripe checkout account history requires manual review.');
    this.name = 'StripeCheckoutAccountReviewRequiredError';
  }
}

type CheckoutAccountReader = {
  customers: {
    list(
      input: { email: string; limit: 100 },
      options: Stripe.RequestOptions,
    ): Promise<{ data: Stripe.Customer[] }>;
    search(
      input: { query: string; limit: 100; page?: string },
      options?: Stripe.RequestOptions,
    ): Promise<{ data: Stripe.Customer[]; next_page?: string | null }>;
  };
  subscriptions: {
    list(
      input: { customer: string; status: 'all'; limit: 100 },
      options?: Stripe.RequestOptions,
    ): Promise<{ data: Array<{ id: string; status: string }> }>;
  };
};

const requestOptions = {
  timeout: STRIPE_CHECKOUT_ACCOUNT_READ_TIMEOUT_MS,
  maxNetworkRetries: STRIPE_CHECKOUT_ACCOUNT_READ_MAX_NETWORK_RETRIES,
} satisfies Stripe.RequestOptions;

async function withAccountReadDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadlineMs = STRIPE_CHECKOUT_ACCOUNT_PHASE_DEADLINE_MS,
) {
  const boundedDeadlineMs = Math.min(Math.max(Math.floor(deadlineMs), 1), 10_000);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Stripe checkout account read deadline exceeded.'));
    }, boundedDeadlineMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function discoverStripeCheckoutCustomers(
  stripe: CheckoutAccountReader,
  input: { email: string; uid: string; deadlineMs?: number },
) {
  return withAccountReadDeadline(async signal => {
    const [emailCustomers, uidCustomers] = await Promise.all([
      stripe.customers.list({ email: input.email, limit: 100 }, requestOptions),
      searchStripeCustomersByFirebaseUid(stripe, input.uid, { requestOptions, signal }),
    ]);
    if (signal.aborted) throw new Error('Stripe customer discovery deadline exceeded.');
    return { emailCustomers: emailCustomers.data, uidCustomers };
  }, input.deadlineMs);
}

export async function readStripeCheckoutSubscriptionHistory(
  stripe: CheckoutAccountReader,
  input: { customerIds: string[]; deadlineMs?: number },
) {
  const uniqueCustomerIds = [...new Set(input.customerIds.filter(Boolean))];
  if (uniqueCustomerIds.length > STRIPE_CHECKOUT_MAX_ASSOCIATED_CUSTOMERS) {
    throw new StripeCheckoutAccountReviewRequiredError();
  }
  return withAccountReadDeadline(
    signal => resolveStripeCustomerSubscriptionHistory(stripe, uniqueCustomerIds, {
      requestOptions,
      signal,
    }),
    input.deadlineMs,
  );
}
