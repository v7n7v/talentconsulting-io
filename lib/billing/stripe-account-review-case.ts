import {
  STRIPE_CHECKOUT_MAX_ASSOCIATED_CUSTOMERS,
  uniqueStripeCheckoutAssociatedCustomerIds,
} from '@/lib/billing/stripe-checkout-account-policy';

export const STRIPE_ACCOUNT_REVIEW_CLOSE_CONFIRMATION = 'CLOSE BILLING REVIEW';
export const STRIPE_ACCOUNT_REVIEW_EVIDENCE_TTL_MS = 15 * 60 * 1_000;

export type StripeAccountReviewStatus = 'new' | 'reviewing' | 'resolved';

export type StripeAccountReviewTransitionInput = {
  currentStatus: unknown;
  nextStatus: unknown;
  note: unknown;
  accountHistoryReviewed?: unknown;
  checkoutSafetyReviewed?: unknown;
  confirmationText?: unknown;
  checkoutAccountEvidence?: unknown;
  nowMs?: number;
};

export type StripeAccountReviewEvidence = {
  status: 'ready' | 'blocked';
  linkedCustomerCount: number;
  prospectiveCustomerCount: number;
  maxAllowed: number;
  verifiedAt: string;
  source: 'stripe_customer_discovery';
};

export type StripeAccountReviewTransition =
  | { valid: true; nextStatus: 'reviewing' | 'resolved'; note: string }
  | { valid: false; error: string };

export function normalizeStripeAccountReviewStatus(value: unknown): StripeAccountReviewStatus {
  if (value === 'reviewing' || value === 'resolved') return value;
  return 'new';
}

export function buildStripeAccountReviewEvidence(input: {
  uidCustomerIds: string[];
  selectedCustomerId?: string | null;
  localCustomerId?: string | null;
  needsNewCustomer: boolean;
  verifiedAt?: string;
}): StripeAccountReviewEvidence {
  const linkedCustomerCount = uniqueStripeCheckoutAssociatedCustomerIds(input).length;
  const prospectiveCustomerCount = linkedCustomerCount + (input.needsNewCustomer ? 1 : 0);
  return {
    status: prospectiveCustomerCount <= STRIPE_CHECKOUT_MAX_ASSOCIATED_CUSTOMERS ? 'ready' : 'blocked',
    linkedCustomerCount,
    prospectiveCustomerCount,
    maxAllowed: STRIPE_CHECKOUT_MAX_ASSOCIATED_CUSTOMERS,
    verifiedAt: input.verifiedAt || new Date().toISOString(),
    source: 'stripe_customer_discovery',
  };
}

export function normalizeStripeAccountReviewEvidence(value: unknown): StripeAccountReviewEvidence | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const linkedCustomerCount = Number(data.linkedCustomerCount);
  const prospectiveCustomerCount = Number(data.prospectiveCustomerCount);
  if (
    (data.status !== 'ready' && data.status !== 'blocked')
    || data.source !== 'stripe_customer_discovery'
    || data.maxAllowed !== STRIPE_CHECKOUT_MAX_ASSOCIATED_CUSTOMERS
    || !Number.isInteger(linkedCustomerCount)
    || linkedCustomerCount < 0
    || !Number.isInteger(prospectiveCustomerCount)
    || prospectiveCustomerCount < linkedCustomerCount
    || typeof data.verifiedAt !== 'string'
  ) return null;
  return {
    status: data.status,
    linkedCustomerCount,
    prospectiveCustomerCount,
    maxAllowed: STRIPE_CHECKOUT_MAX_ASSOCIATED_CUSTOMERS,
    verifiedAt: data.verifiedAt,
    source: 'stripe_customer_discovery',
  };
}

export function stripeAccountReviewEvidenceIsFreshAndReady(
  value: unknown,
  nowMs = Date.now(),
) {
  const evidence = normalizeStripeAccountReviewEvidence(value);
  if (!evidence || evidence.status !== 'ready') return false;
  const verifiedAt = new Date(evidence.verifiedAt).getTime();
  return Number.isFinite(verifiedAt)
    && verifiedAt <= nowMs
    && nowMs - verifiedAt <= STRIPE_ACCOUNT_REVIEW_EVIDENCE_TTL_MS
    && evidence.prospectiveCustomerCount <= evidence.maxAllowed;
}

export function validateStripeAccountReviewTransition(
  input: StripeAccountReviewTransitionInput,
): StripeAccountReviewTransition {
  const currentStatus = normalizeStripeAccountReviewStatus(input.currentStatus);
  const nextStatus = input.nextStatus;
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 1_000) : '';

  if (currentStatus === 'resolved') {
    return { valid: false, error: 'Resolved billing reviews cannot be changed.' };
  }
  if (nextStatus === 'reviewing') {
    if (currentStatus !== 'new') {
      return { valid: false, error: 'Only a new billing review can be started.' };
    }
    if (note.length < 5) {
      return { valid: false, error: 'Add a short review note before starting.' };
    }
    return { valid: true, nextStatus, note };
  }
  if (nextStatus !== 'resolved') {
    return { valid: false, error: 'Unsupported billing review status.' };
  }
  if (currentStatus !== 'reviewing') {
    return { valid: false, error: 'Start the billing review before resolving it.' };
  }
  if (note.length < 10) {
    return { valid: false, error: 'Add a resolution note with at least 10 characters.' };
  }
  if (input.accountHistoryReviewed !== true || input.checkoutSafetyReviewed !== true) {
    return { valid: false, error: 'Confirm both billing review attestations.' };
  }
  if (!stripeAccountReviewEvidenceIsFreshAndReady(input.checkoutAccountEvidence, input.nowMs)) {
    return { valid: false, error: 'Run a fresh customer evidence check before closing this review.' };
  }
  if (input.confirmationText !== STRIPE_ACCOUNT_REVIEW_CLOSE_CONFIRMATION) {
    return {
      valid: false,
      error: `Type ${STRIPE_ACCOUNT_REVIEW_CLOSE_CONFIRMATION} to close this review.`,
    };
  }
  return { valid: true, nextStatus, note };
}
