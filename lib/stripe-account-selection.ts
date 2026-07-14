export interface StripeCustomerCandidate {
  id: string;
  firebaseUid?: string | null;
}

export interface StripeSubscriptionCandidate {
  id: string;
  status: string;
  created: number;
}

type StripeCustomerSearchReader<T> = {
  customers: {
    search(input: { query: string; limit: 100; page?: string }, options?: {
      timeout: number;
      maxNetworkRetries: number;
    }): Promise<{
      data: T[];
      next_page?: string | null;
    }>;
  };
};

function escapeStripeSearchValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function searchStripeCustomersByFirebaseUid<T>(
  stripe: StripeCustomerSearchReader<T>,
  uid: string,
  options: {
    requestOptions?: { timeout: number; maxNetworkRetries: number };
    signal?: AbortSignal;
  } = {},
) {
  const query = `metadata['firebaseUid']:'${escapeStripeSearchValue(uid)}'`;
  const customers: T[] = [];
  let page: string | undefined;
  for (let pageCount = 0; pageCount < 10; pageCount += 1) {
    if (options.signal?.aborted) throw new Error('Stripe customer discovery deadline exceeded.');
    const result = await stripe.customers.search(
      { query, limit: 100, ...(page ? { page } : {}) },
      options.requestOptions,
    );
    if (options.signal?.aborted) throw new Error('Stripe customer discovery deadline exceeded.');
    customers.push(...result.data);
    if (!result.next_page) return customers;
    page = result.next_page;
  }
  throw new Error('Stripe customer search exceeded the supported page limit.');
}

export function selectStripeCustomerForUser(
  customers: StripeCustomerCandidate[],
  uid: string,
  options: { allowUnclaimed?: boolean } = {},
) {
  const exact = customers.find(customer => customer.firebaseUid === uid);
  if (exact) return { customerId: exact.id, claimRequired: false };
  if (!options.allowUnclaimed) return null;
  const unclaimed = customers.find(customer => !customer.firebaseUid);
  return unclaimed ? { customerId: unclaimed.id, claimRequired: true } : null;
}

const SUBSCRIPTION_STATUS_PRIORITY: Record<string, number> = {
  active: 6,
  trialing: 5,
  past_due: 4,
  unpaid: 3,
  incomplete: 2,
  paused: 1,
  canceled: 0,
  incomplete_expired: 0,
};

export function selectAuthoritativeStripeSubscription<T extends StripeSubscriptionCandidate>(
  subscriptions: T[],
): T | null {
  return [...subscriptions].sort((left, right) => {
    const priority = (SUBSCRIPTION_STATUS_PRIORITY[right.status] ?? -1)
      - (SUBSCRIPTION_STATUS_PRIORITY[left.status] ?? -1);
    return priority || right.created - left.created || right.id.localeCompare(left.id);
  })[0] || null;
}

export function resolveStripeFirebaseUid(input: {
  customerUid?: string | null;
  subscriptionUid?: string | null;
}) {
  const customerUid = input.customerUid || null;
  const subscriptionUid = input.subscriptionUid || null;
  if (customerUid && subscriptionUid && customerUid !== subscriptionUid) {
    return { uid: null, conflict: true };
  }
  return { uid: subscriptionUid || customerUid, conflict: false };
}
