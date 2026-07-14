import { createHash } from 'node:crypto';
import type Stripe from 'stripe';

export const STRIPE_CHECKOUT_CUSTOMER_WRITE_TIMEOUT_MS = 5_000;
export const STRIPE_CHECKOUT_CUSTOMER_WRITE_DEADLINE_MS = 6_000;
export const STRIPE_CHECKOUT_CUSTOMER_WRITE_MAX_NETWORK_RETRIES = 0;

type CheckoutCustomerWriter = {
  customers: {
    update(
      customerId: string,
      input: { metadata: Record<string, string> },
      options: Stripe.RequestOptions,
    ): Promise<{ id: string }>;
    create(
      input: { email: string; metadata: Record<string, string> },
      options: Stripe.RequestOptions,
    ): Promise<{ id: string }>;
  };
};

function customerWriteIdempotencyKey(input: {
  operation: 'claim' | 'create';
  uid: string;
  identity: string;
  payloadFingerprint: string;
}) {
  const digest = createHash('sha256')
    .update([input.operation, input.uid, input.identity, input.payloadFingerprint].join(':'))
    .digest('hex')
    .slice(0, 40);
  return `talent-checkout-customer-${input.operation}-${digest}`;
}

async function withCustomerWriteDeadline<T>(
  operation: () => Promise<T>,
  deadlineMs = STRIPE_CHECKOUT_CUSTOMER_WRITE_DEADLINE_MS,
) {
  const boundedDeadlineMs = Math.min(Math.max(Math.floor(deadlineMs), 1), 10_000);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('Stripe checkout customer write deadline exceeded.')),
      boundedDeadlineMs,
    );
  });
  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function prepareStripeCheckoutCustomer(
  stripe: CheckoutCustomerWriter,
  input: {
    uid: string;
    email: string;
    selectedCustomer: { customerId: string; claimRequired: boolean } | null;
    selectedCustomerMetadata?: Record<string, string> | null;
    deadlineMs?: number;
  },
) {
  if (input.selectedCustomer && !input.selectedCustomer.claimRequired) {
    return { customerId: input.selectedCustomer.customerId, operation: 'reused' as const };
  }

  const requestOptions = (
    operation: 'claim' | 'create',
    identity: string,
    payloadFingerprint: string,
  ) => ({
    timeout: STRIPE_CHECKOUT_CUSTOMER_WRITE_TIMEOUT_MS,
    maxNetworkRetries: STRIPE_CHECKOUT_CUSTOMER_WRITE_MAX_NETWORK_RETRIES,
    idempotencyKey: customerWriteIdempotencyKey({
      operation,
      uid: input.uid,
      identity,
      payloadFingerprint,
    }),
  }) satisfies Stripe.RequestOptions;

  if (input.selectedCustomer) {
    const customerId = input.selectedCustomer.customerId;
    const metadata = { ...(input.selectedCustomerMetadata || {}), firebaseUid: input.uid };
    const metadataFingerprint = JSON.stringify(Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right)));
    await withCustomerWriteDeadline(
      () => stripe.customers.update(customerId, {
        metadata,
      }, requestOptions('claim', customerId, metadataFingerprint)),
      input.deadlineMs,
    );
    return { customerId, operation: 'claimed' as const };
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const customer = await withCustomerWriteDeadline(
    () => stripe.customers.create({
      email: normalizedEmail,
      metadata: { firebaseUid: input.uid },
    }, requestOptions('create', normalizedEmail, input.uid)),
    input.deadlineMs,
  );
  if (!customer?.id) throw new Error('Stripe customer creation returned no customer id.');
  return { customerId: customer.id, operation: 'created' as const };
}
