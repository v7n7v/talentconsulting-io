import type Stripe from 'stripe';
import type { BillingInterval, BillingPlan } from '@/lib/billing-price-types';
import { resolveStripeCheckoutWebhookEvidence } from '@/lib/billing/stripe-checkout-webhook-evidence';
import type { SonaPurchaseContract } from '@/lib/sona/purchase-contract';

type StoredRecord = Record<string, unknown> | null | undefined;

export const STRIPE_CHECKOUT_CANARY_RECEIPT_MAX_AGE_MS = 30 * 60 * 1_000;
const CLOCK_SKEW_MS = 5 * 60 * 1_000;

export type StripeCheckoutCanaryReceiptInput = {
  expected: {
    uid: string;
    plan: BillingPlan;
    interval: BillingInterval;
  };
  configuredPrices: {
    pro: Array<string | undefined>;
    studio: Array<string | undefined>;
  };
  session: Stripe.Checkout.Session;
  customer: Stripe.Customer | Stripe.DeletedCustomer;
  subscription: Stripe.Subscription;
  userSubscription: StoredRecord;
  billingAccount: StoredRecord;
  checkoutLedger: StoredRecord;
  observedAtMs?: number;
};

export type StripeCheckoutCanaryReceipt = {
  ready: boolean;
  status: 'verified' | 'blocked';
  errors: string[];
  evidence: {
    plan: BillingPlan;
    interval: BillingInterval;
    checkoutComplete: boolean;
    stripeOwnershipAligned: boolean;
    subscriptionAligned: boolean;
    userEntitlementAligned: boolean;
    billingAccountAligned: boolean;
    checkoutLedgerAligned: boolean;
    purchaseContractAligned: boolean;
    reviewRequired: boolean;
    externalAutoApply: false | null;
  };
};

function objectId(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

function isEntitledStatus(value: unknown) {
  return value === 'active' || value === 'trialing';
}

function matchesStoredContract(record: StoredRecord, expected: SonaPurchaseContract) {
  const contract = record?.sonaPurchaseContract;
  return record?.sonaPurchaseContractStatus === 'verified'
    && record?.sonaPurchaseContractFingerprint === expected.fingerprint
    && Boolean(contract && typeof contract === 'object')
    && Object.entries(expected).every(([key, value]) => (
      (contract as Record<string, unknown>)[key] === value
    ));
}

function every(checks: boolean[]) {
  return checks.every(Boolean);
}

function timestampMs(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function assessStripeCheckoutCanaryReceipt(
  input: StripeCheckoutCanaryReceiptInput,
): StripeCheckoutCanaryReceipt {
  const errors = new Set<string>();
  const expected = input.expected;
  const observedAtMs = Number.isFinite(input.observedAtMs) ? Number(input.observedAtMs) : Date.now();
  const sessionCustomerId = objectId(input.session.customer);
  const sessionSubscriptionId = objectId(input.session.subscription);
  const subscriptionCustomerId = objectId(input.subscription.customer);
  const customerDeleted = 'deleted' in input.customer && input.customer.deleted === true;
  const customerId = input.customer.id;
  const customerUid = 'metadata' in input.customer
    ? input.customer.metadata?.firebaseUid || null
    : null;
  const price = input.subscription.items?.data?.[0]?.price;
  const subscriptionItem = input.subscription.items?.data?.[0];
  const sessionCreatedMs = timestampMs(Number(input.session.created) * 1_000);
  const ledgerOccurredAtMs = timestampMs(input.checkoutLedger?.occurredAt);
  const ledgerPostedAtMs = timestampMs(input.checkoutLedger?.postedAt);

  const evidenceFresh = every([
    sessionCreatedMs !== null,
    ledgerOccurredAtMs !== null,
    ledgerPostedAtMs !== null,
    Boolean(sessionCreatedMs !== null && sessionCreatedMs >= observedAtMs - STRIPE_CHECKOUT_CANARY_RECEIPT_MAX_AGE_MS),
    Boolean(sessionCreatedMs !== null && sessionCreatedMs <= observedAtMs + CLOCK_SKEW_MS),
    Boolean(ledgerOccurredAtMs !== null && sessionCreatedMs !== null && ledgerOccurredAtMs >= sessionCreatedMs - CLOCK_SKEW_MS),
    Boolean(ledgerOccurredAtMs !== null && ledgerOccurredAtMs <= observedAtMs + CLOCK_SKEW_MS),
    Boolean(ledgerPostedAtMs !== null && ledgerOccurredAtMs !== null && ledgerPostedAtMs >= ledgerOccurredAtMs - CLOCK_SKEW_MS),
    Boolean(ledgerPostedAtMs !== null && ledgerPostedAtMs <= observedAtMs + CLOCK_SKEW_MS),
  ]);
  if (!evidenceFresh) errors.add('checkout:evidence_stale_or_invalid');

  const checkoutComplete = every([
    input.session.livemode === false,
    input.session.mode === 'subscription',
    input.session.status === 'complete',
    input.session.payment_status === 'paid' || input.session.payment_status === 'no_payment_required',
  ]);
  if (!checkoutComplete) errors.add('checkout:not_complete_test_subscription');

  const stripeOwnershipAligned = every([
    !customerDeleted,
    'livemode' in input.customer && input.customer.livemode === false,
    input.subscription.livemode === false,
    input.session.client_reference_id === expected.uid,
    input.session.metadata?.firebaseUid === expected.uid,
    customerUid === expected.uid,
    input.subscription.metadata?.firebaseUid === expected.uid,
    Boolean(sessionCustomerId && sessionCustomerId === customerId),
    Boolean(subscriptionCustomerId && subscriptionCustomerId === customerId),
  ]);
  if (!stripeOwnershipAligned) errors.add('stripe:owner_mismatch');

  const subscriptionReferencesAligned = Boolean(
    sessionSubscriptionId && sessionSubscriptionId === input.subscription.id,
  );
  if (!subscriptionReferencesAligned) errors.add('stripe:subscription_mismatch');

  const checkoutEvidence = resolveStripeCheckoutWebhookEvidence({
    sessionMetadata: input.session.metadata,
    subscription: input.subscription,
    proPriceIds: input.configuredPrices.pro,
    studioPriceIds: input.configuredPrices.studio,
  });
  if (!checkoutEvidence.valid) errors.add(`stripe:price_evidence_${checkoutEvidence.status}`);

  const purchaseContract = checkoutEvidence.valid ? checkoutEvidence.purchaseContract.contract : null;
  const purchaseContractAligned = Boolean(
    checkoutEvidence.valid
    && checkoutEvidence.plan === expected.plan
    && checkoutEvidence.billingInterval === expected.interval
    && checkoutEvidence.purchaseContract.status === 'verified'
    && purchaseContract
    && purchaseContract.reviewRequired === true
    && purchaseContract.externalAutoApply === false,
  );
  if (!purchaseContractAligned) errors.add('contract:not_verified');

  const subscriptionAligned = every([
    subscriptionReferencesAligned,
    isEntitledStatus(input.subscription.status),
    input.subscription.items?.data?.length === 1,
    subscriptionItem?.quantity === 1,
    price?.active === true,
    price?.type === 'recurring',
    price?.recurring?.interval === expected.interval,
    price?.currency === 'usd',
    typeof price?.unit_amount === 'number' && price.unit_amount > 0,
    checkoutEvidence.valid && checkoutEvidence.plan === expected.plan,
    checkoutEvidence.valid && checkoutEvidence.planResolution.status === 'price_verified',
    input.session.metadata?.plan === expected.plan,
    input.session.metadata?.interval === expected.interval,
    input.subscription.metadata?.plan === expected.plan,
    input.subscription.metadata?.interval === expected.interval,
  ]);
  if (!subscriptionAligned) errors.add('stripe:subscription_evidence_mismatch');

  const fingerprint = purchaseContract?.fingerprint || '';
  const userEntitlementAligned = every([
    Boolean(input.userSubscription),
    input.userSubscription?.plan === expected.plan,
    input.userSubscription?.status === input.subscription.status,
    input.userSubscription?.stripeCustomerId === customerId,
    input.userSubscription?.stripeSubscriptionId === input.subscription.id,
    input.userSubscription?.stripePriceId === price?.id,
    input.userSubscription?.billingInterval === expected.interval,
    input.userSubscription?.amount === price?.unit_amount,
    input.userSubscription?.currency === price?.currency,
    input.userSubscription?.recurringAmountCents === price?.unit_amount,
    input.userSubscription?.recurringCurrency === price?.currency,
    input.userSubscription?.stripeStateEntitled === true,
    input.userSubscription?.stripeStateEventType === 'checkout.session.completed',
    input.userSubscription?.stripeStateSubscriptionId === input.subscription.id,
    typeof input.userSubscription?.stripeStateEventId === 'string',
    Boolean(purchaseContract && matchesStoredContract(input.userSubscription, purchaseContract)),
  ]);
  if (!userEntitlementAligned) errors.add('firestore:user_entitlement_mismatch');

  const billingAccountAligned = every([
    Boolean(input.billingAccount),
    input.billingAccount?.uid === expected.uid,
    input.billingAccount?.accountId === customerId,
    input.billingAccount?.stripeCustomerId === customerId,
    input.billingAccount?.stripeSubscriptionId === input.subscription.id,
    input.billingAccount?.stripePriceId === price?.id,
    input.billingAccount?.plan === expected.plan,
    input.billingAccount?.status === input.subscription.status,
    input.billingAccount?.billingInterval === expected.interval,
    input.billingAccount?.recurringAmountCents === price?.unit_amount,
    input.billingAccount?.recurringCurrency === price?.currency,
  ]);
  if (!billingAccountAligned) errors.add('firestore:billing_account_mismatch');

  const ledgerMetadata = input.checkoutLedger?.metadata;
  const checkoutLedgerAligned = every([
    Boolean(input.checkoutLedger),
    input.checkoutLedger?.uid === expected.uid,
    input.checkoutLedger?.accountId === customerId,
    input.checkoutLedger?.stripeCustomerId === customerId,
    input.checkoutLedger?.stripeObjectId === input.session.id,
    input.checkoutLedger?.type === 'checkout',
    input.checkoutLedger?.source === 'stripe_webhook',
    input.checkoutLedger?.status === input.subscription.status,
    input.checkoutLedger?.amount === price?.unit_amount,
    input.checkoutLedger?.currency === price?.currency,
    typeof input.checkoutLedger?.stripeEventId === 'string',
    input.checkoutLedger?.stripeEventId === input.userSubscription?.stripeStateEventId,
    Boolean(ledgerMetadata && typeof ledgerMetadata === 'object'),
    (ledgerMetadata as Record<string, unknown> | null)?.plan === expected.plan,
    (ledgerMetadata as Record<string, unknown> | null)?.interval === expected.interval,
    (ledgerMetadata as Record<string, unknown> | null)?.sonaPurchaseContractStatus === 'verified',
    (ledgerMetadata as Record<string, unknown> | null)?.stripePlanEvidenceStatus === 'price_verified',
    Boolean(fingerprint && (ledgerMetadata as Record<string, unknown> | null)?.sonaPurchaseContractFingerprint === fingerprint),
  ]);
  if (!checkoutLedgerAligned) errors.add('firestore:checkout_ledger_mismatch');

  const errorList = [...errors];
  return {
    ready: errorList.length === 0,
    status: errorList.length === 0 ? 'verified' : 'blocked',
    errors: errorList,
    evidence: {
      plan: expected.plan,
      interval: expected.interval,
      checkoutComplete,
      stripeOwnershipAligned,
      subscriptionAligned,
      userEntitlementAligned,
      billingAccountAligned,
      checkoutLedgerAligned,
      purchaseContractAligned,
      reviewRequired: purchaseContract?.reviewRequired === true,
      externalAutoApply: purchaseContract?.externalAutoApply ?? null,
    },
  };
}
