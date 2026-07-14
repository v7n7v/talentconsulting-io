import type { PlanTier } from '@/lib/pricing-tiers';
import { resolveStripeFirebaseUid } from '@/lib/stripe-account-selection';
import {
  normalizeCheckoutAttributionSource,
  type CheckoutAttributionSource,
} from '@/lib/billing/checkout-attribution';

type Firestore = FirebaseFirestore.Firestore;

export const SONA_ECONOMICS_COLLECTION = 'sona_economics_events';
export const SONA_ECONOMICS_ACCOUNTS_COLLECTION = 'sona_economics_accounts';
export const SONA_ECONOMICS_OUTBOX_COLLECTION = 'sona_economics_outbox';
export const SONA_ECONOMICS_PAYMENTS_COLLECTION = 'sona_economics_payments';
export const SONA_ECONOMICS_VERSION = 'sona-economics-v2-2026-07-10';
export const SONA_PLAN_OBSERVED_ECONOMICS_VERSION = 'sona-plan-observed-v1-2026-07-10';
export const SONA_PAYMENT_EVIDENCE_REPAIR_VERSION = 'sona-payment-evidence-repair-v2-2026-07-10';
export const SONA_ACCOUNT_RENEWAL_EVIDENCE_VERSION = 'sona-account-renewal-evidence-v1-2026-07-10';
export const SONA_PAID_RETENTION_VERSION = 'sona-paid-retention-v1-2026-07-10';
export const SONA_PAID_RENEWAL_COHORT_VERSION = 'sona-paid-renewal-cohort-v1-2026-07-10';
export const SONA_PRICING_DECISION_VERSION = 'sona-pricing-decision-v1-2026-07-10';
const SONA_RENEWAL_COHORT_LOOKBACK_DAYS = 400;
const SONA_ECONOMICS_OUTBOX_MAX_ATTEMPTS = 5;
const SONA_ECONOMICS_OUTBOX_LEASE_MS = 10 * 60 * 1000;
const SONA_ECONOMICS_OUTBOX_COMPLETE_AT = '9999-12-31T23:59:59.999Z';

export type SonaUsefulOutcome = 'ranked_picks' | 'prepared_packet' | null;

export interface SonaRunActualWork {
  searchQueries: number;
  rankedRoles: number;
  resumeMorphAttempts: number;
  coverLetterAttempts: number;
  emailDigestChecks: number;
  emailDigestsSent: number;
}

export interface SonaCostBasis {
  version: string;
  goalInterpretationMicros: number;
  searchQueryMicros: number;
  resumeMorphMicros: number;
  coverLetterMicros: number;
  emailDigestMicros: number;
}

export const DEFAULT_SONA_COST_BASIS: SonaCostBasis = {
  version: 'sona-directional-cost-v1-2026-07-10',
  goalInterpretationMicros: 700,
  searchQueryMicros: 800,
  resumeMorphMicros: 6_000,
  coverLetterMicros: 2_500,
  emailDigestMicros: 900,
};

export interface SonaEconomicsEvent {
  eventId: string;
  eventType: 'sona_run_completed' | 'checkout_completed' | 'invoice_paid' | 'refund_succeeded';
  uid: string;
  occurredAt: string;
  economicsVersion: string;
  [key: string]: unknown;
}

export interface SonaRunEconomicsInput {
  uid: string;
  runId: string;
  tier: PlanTier;
  startedAt: string;
  completedAt: string;
  terminalStatus: 'completed' | 'failed';
  queuedCount: number;
  preparedCount: number;
  actual: SonaRunActualWork;
}

export interface SonaEconomicsAccountSummary {
  uid: string;
  firstUsefulAt?: string | null;
  convertedAfterUsefulOutcome?: boolean;
  paidAfterUsefulOutcome?: boolean;
  [key: string]: unknown;
}

function boundedCount(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function paidPlan(value: unknown): 'pro' | 'studio' | null {
  if (value === 'pro') return 'pro';
  if (value === 'studio' || value === 'god') return 'studio';
  return null;
}

function billingInterval(value: unknown): 'month' | 'year' | null {
  return value === 'month' || value === 'year' ? value : null;
}

function billingReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 80 ? normalized : null;
}

export function hasVerifiedSonaPaymentEvidence(record: {
  evidenceStatus?: unknown;
  evidenceVersion?: unknown;
  evidenceSource?: unknown;
  evidenceRepair?: unknown;
}) {
  const evidenceRepair = record.evidenceRepair && typeof record.evidenceRepair === 'object'
    ? record.evidenceRepair as Record<string, unknown>
    : {};
  if (record.evidenceStatus !== 'verified') return false;
  const webhookVerified = record.evidenceVersion === SONA_ECONOMICS_VERSION
    && record.evidenceSource === 'stripe_webhook';
  const repairVerified = (
    record.evidenceVersion === SONA_PAYMENT_EVIDENCE_REPAIR_VERSION
    || evidenceRepair.version === SONA_PAYMENT_EVIDENCE_REPAIR_VERSION
  ) && record.evidenceSource === 'reviewed_stripe_repair';
  return webhookVerified || repairVerified;
}

export interface SonaPaymentEvidencePreviewInput {
  paymentReferenceId: string;
  uid?: string | null;
  invoiceId?: string | null;
  existingPlan?: unknown;
  existingCurrency?: unknown;
  existingBillingInterval?: unknown;
  existingBillingReason?: unknown;
  existingEvidenceVerified?: boolean;
  invoiceFound?: boolean;
  invoicePaid?: boolean;
  paymentReferenceVerified?: boolean;
  invoicePriceEvidenceConflict?: boolean;
  invoiceLinesComplete?: boolean;
  customerDeleted?: boolean;
  customerLookupFailed?: boolean;
  customerUid?: string | null;
  subscriptionLookupFailed?: boolean;
  subscriptionUid?: string | null;
  stripePriceId?: string | null;
  invoiceCurrency?: unknown;
  invoiceBillingReason?: unknown;
  subscriptionBillingInterval?: unknown;
  configuredPriceIds: {
    pro: string[];
    studio: string[];
  };
}

export interface SonaPaymentEvidencePreview {
  paymentReferenceId: string;
  invoiceId: string | null;
  confirmationPhrase: string;
  verifiedOwnerUid: string | null;
  invoiceStatus: 'paid' | 'not_paid' | 'unknown';
  paymentReferenceVerified: boolean;
  status: 'ready' | 'blocked' | 'verified';
  missing: string[];
  proposed: {
    plan: 'pro' | 'studio' | null;
    currency: string | null;
    planSource: 'existing' | 'subscription_metadata' | 'price_id' | null;
    stripePriceId: string | null;
    billingInterval: 'month' | 'year' | null;
    billingReason: string | null;
  };
}

export function sonaPaymentEvidenceConfirmationPhrase(paymentReferenceId: string) {
  return `REPAIR ${paymentReferenceId.slice(-8)}`;
}

export function buildSonaPaymentEvidencePreview(
  input: SonaPaymentEvidencePreviewInput,
): SonaPaymentEvidencePreview {
  const missing: string[] = [];
  const identity = resolveStripeFirebaseUid({
    customerUid: input.customerUid || null,
    subscriptionUid: input.subscriptionUid || null,
  });
  if (!input.uid) missing.push('owner_uid');
  if (input.customerLookupFailed) missing.push('stripe_customer_lookup_failed');
  if (input.subscriptionLookupFailed) missing.push('stripe_subscription_lookup_failed');
  if (identity.conflict || (input.uid && identity.uid && input.uid !== identity.uid)) {
    missing.push('ownership_conflict');
  }
  if (
    input.invoiceFound
    && !input.customerDeleted
    && !input.customerLookupFailed
    && !input.subscriptionLookupFailed
    && !identity.uid
    && !identity.conflict
  ) {
    missing.push('owner_verification');
  }
  if (!input.invoiceId) missing.push('invoice_id');
  else if (input.invoiceFound === false) missing.push('invoice_not_found');
  if (input.invoiceFound && input.invoicePaid !== true) missing.push('invoice_not_paid');
  if (input.invoiceFound && input.paymentReferenceVerified !== true) {
    missing.push('payment_reference_mismatch');
  }
  if (input.customerDeleted) missing.push('stripe_customer_deleted');

  const existingPlan = paidPlan(input.existingPlan);
  const proPriceMatch = Boolean(input.stripePriceId && input.configuredPriceIds.pro.includes(input.stripePriceId));
  const studioPriceMatch = Boolean(input.stripePriceId && input.configuredPriceIds.studio.includes(input.stripePriceId));
  const priceConfigurationConflict = proPriceMatch && studioPriceMatch;
  const pricePlan = priceConfigurationConflict ? null
    : proPriceMatch ? 'pro' as const
      : studioPriceMatch ? 'studio' as const : null;
  const planSignals = [existingPlan, pricePlan].filter(Boolean);
  const planConflict = input.invoicePriceEvidenceConflict === true
    || priceConfigurationConflict
    || new Set(planSignals).size > 1;
  if (input.invoicePriceEvidenceConflict) missing.push('invoice_price_conflict');
  if (input.invoiceFound && input.invoiceLinesComplete === false) missing.push('invoice_lines_incomplete');
  if (planConflict) missing.push('plan_conflict');
  const plan = planConflict ? null : pricePlan;
  if (!plan && !planConflict) missing.push('plan');

  const existingCurrency = typeof input.existingCurrency === 'string' && input.existingCurrency
    ? input.existingCurrency.toLowerCase()
    : null;
  const invoiceCurrency = typeof input.invoiceCurrency === 'string' && input.invoiceCurrency
    ? input.invoiceCurrency.toLowerCase()
    : null;
  if (existingCurrency && invoiceCurrency && existingCurrency !== invoiceCurrency) {
    missing.push('currency_conflict');
  }
  const currency = invoiceCurrency;
  if (!currency) missing.push('currency');
  else if (currency !== 'usd') missing.push('currency_conversion');

  const existingInterval = billingInterval(input.existingBillingInterval);
  const stripeInterval = billingInterval(input.subscriptionBillingInterval);
  if (existingInterval && stripeInterval && existingInterval !== stripeInterval) {
    missing.push('billing_interval_conflict');
  }
  const resolvedBillingInterval = stripeInterval;
  if (!resolvedBillingInterval) missing.push('billing_interval');

  const existingReason = billingReason(input.existingBillingReason);
  const stripeReason = billingReason(input.invoiceBillingReason);
  if (existingReason && stripeReason && existingReason !== stripeReason) {
    missing.push('billing_reason_conflict');
  }
  const resolvedBillingReason = stripeReason;
  if (!resolvedBillingReason) missing.push('billing_reason');

  const evidenceChanged = plan !== existingPlan
    || currency !== existingCurrency
    || resolvedBillingInterval !== existingInterval
    || resolvedBillingReason !== existingReason
    || input.existingEvidenceVerified !== true;
  const status = missing.length
    ? 'blocked' as const
    : evidenceChanged ? 'ready' as const : 'verified' as const;
  const planSource = pricePlan ? 'price_id' as const : null;

  return {
    paymentReferenceId: input.paymentReferenceId,
    invoiceId: input.invoiceId || null,
    confirmationPhrase: sonaPaymentEvidenceConfirmationPhrase(input.paymentReferenceId),
    verifiedOwnerUid: identity.uid,
    invoiceStatus: input.invoiceFound
      ? input.invoicePaid === true ? 'paid' : 'not_paid'
      : 'unknown',
    paymentReferenceVerified: input.paymentReferenceVerified === true,
    status,
    missing: [...new Set(missing)],
    proposed: {
      plan,
      currency,
      planSource,
      stripePriceId: input.stripePriceId || null,
      billingInterval: resolvedBillingInterval,
      billingReason: resolvedBillingReason,
    },
  };
}

export interface SonaPaymentEvidenceRepairExpected {
  invoiceId: string | null;
  plan: 'pro' | 'studio';
  currency: 'usd';
  planSource: 'existing' | 'subscription_metadata' | 'price_id';
  stripePriceId: string | null;
  billingInterval: 'month' | 'year';
  billingReason: string;
}

export interface SonaPaymentEvidenceLinkedEvent {
  eventId: string;
  eventType: 'invoice_paid' | 'refund_succeeded';
  uid?: unknown;
  invoiceId?: unknown;
  paymentReferenceId?: unknown;
  plan?: unknown;
  currency?: unknown;
  billingInterval?: unknown;
  billingReason?: unknown;
  isRenewal?: unknown;
}

export function buildSonaPaymentEvidenceRepairDecision(input: {
  current: {
    paymentReferenceId: string;
    uid?: unknown;
    invoiceId?: unknown;
    plan?: unknown;
    currency?: unknown;
    billingInterval?: unknown;
    billingReason?: unknown;
    evidenceStatus?: unknown;
    evidenceVersion?: unknown;
    evidenceSource?: unknown;
    evidenceRepair?: unknown;
  };
  preview: SonaPaymentEvidencePreview;
  expected: SonaPaymentEvidenceRepairExpected;
  linkedEvents: SonaPaymentEvidenceLinkedEvent[];
  confirmationText: string;
  acknowledged: boolean;
  reason: string;
  actor: string;
  repairedAt: string;
}) {
  const blocked = (code: string, missing: string[] = []) => ({
    status: 'blocked' as const,
    code,
    missing,
  });
  const currentPlan = paidPlan(input.current.plan);
  const currentCurrency = typeof input.current.currency === 'string'
    ? input.current.currency.toLowerCase()
    : null;
  const currentBillingInterval = billingInterval(input.current.billingInterval);
  const currentBillingReason = billingReason(input.current.billingReason);
  if (
    currentPlan
    && currentCurrency === 'usd'
    && currentBillingInterval
    && currentBillingReason
    && hasVerifiedSonaPaymentEvidence(input.current)
  ) {
    return blocked('already_verified');
  }
  if (
    input.preview.status !== 'ready'
    || !input.preview.proposed.plan
    || input.preview.proposed.currency !== 'usd'
    || !input.preview.proposed.billingInterval
    || !input.preview.proposed.billingReason
  ) {
    return blocked('evidence_not_repairable', input.preview.missing);
  }
  if (!input.acknowledged) return blocked('attestation_required');
  if (input.confirmationText !== input.preview.confirmationPhrase) {
    return blocked('confirmation_mismatch');
  }
  const reason = input.reason.trim();
  if (reason.length < 12 || reason.length > 500) return blocked('reason_invalid');

  const expectedMatches = input.expected.invoiceId === input.preview.invoiceId
    && input.expected.plan === input.preview.proposed.plan
    && input.expected.currency === input.preview.proposed.currency
    && input.expected.planSource === input.preview.proposed.planSource
    && input.expected.stripePriceId === input.preview.proposed.stripePriceId
    && input.expected.billingInterval === input.preview.proposed.billingInterval
    && input.expected.billingReason === input.preview.proposed.billingReason;
  if (!expectedMatches) return blocked('evidence_changed');

  const currentUid = typeof input.current.uid === 'string' ? input.current.uid : null;
  const currentInvoiceId = typeof input.current.invoiceId === 'string' ? input.current.invoiceId : null;
  const conflictingEvent = input.linkedEvents.find(event => {
    const eventPlan = paidPlan(event.plan);
    const eventCurrency = typeof event.currency === 'string' && event.currency
      ? event.currency.toLowerCase()
      : null;
    const eventBillingInterval = billingInterval(event.billingInterval);
    const eventBillingReason = billingReason(event.billingReason);
    const eventUid = typeof event.uid === 'string' ? event.uid : null;
    const eventPaymentReferenceId = typeof event.paymentReferenceId === 'string'
      ? event.paymentReferenceId
      : null;
    const eventInvoiceId = typeof event.invoiceId === 'string' ? event.invoiceId : null;
    return Boolean(
      (eventPlan && eventPlan !== input.expected.plan)
      || (eventCurrency && eventCurrency !== input.expected.currency)
      || (event.eventType === 'invoice_paid'
        && eventBillingInterval
        && eventBillingInterval !== input.expected.billingInterval)
      || (event.eventType === 'invoice_paid'
        && eventBillingReason
        && eventBillingReason !== input.expected.billingReason)
      || (currentUid && eventUid && currentUid !== eventUid)
      || (eventPaymentReferenceId && eventPaymentReferenceId !== input.current.paymentReferenceId)
      || (event.eventType === 'invoice_paid' && currentInvoiceId && eventInvoiceId && currentInvoiceId !== eventInvoiceId),
    );
  });
  if (conflictingEvent) return blocked('linked_event_conflict', [conflictingEvent.eventId]);

  const evidenceRepair = {
    version: SONA_PAYMENT_EVIDENCE_REPAIR_VERSION,
    repairedAt: input.repairedAt,
    repairedBy: input.actor,
    reason,
    planSource: input.expected.planSource,
    stripePriceId: input.expected.stripePriceId,
    invoiceId: input.expected.invoiceId,
    billingInterval: input.expected.billingInterval,
    billingReason: input.expected.billingReason,
    noStripeMutation: true,
  };
  const eventPatches: Array<{
    eventId: string;
    eventType: 'invoice_paid' | 'refund_succeeded';
    patch: Record<string, unknown>;
  }> = [];
  input.linkedEvents.forEach(event => {
    const attributionChanged = paidPlan(event.plan) !== input.expected.plan
      || String(event.currency || '').toLowerCase() !== input.expected.currency;
    if (event.eventType === 'refund_succeeded') {
      const hasInvoiceOnlyEvidence = Object.prototype.hasOwnProperty.call(event, 'billingInterval')
        || Object.prototype.hasOwnProperty.call(event, 'billingReason');
      if (!attributionChanged && event.isRenewal !== true && !hasInvoiceOnlyEvidence) return;
      eventPatches.push({
        eventId: event.eventId,
        eventType: event.eventType,
        patch: {
          plan: input.expected.plan,
          currency: input.expected.currency,
          isRenewal: false,
          evidenceStatus: 'verified',
          evidenceVersion: SONA_PAYMENT_EVIDENCE_REPAIR_VERSION,
          evidenceSource: 'reviewed_stripe_repair',
          evidenceRepair,
        },
      });
      return;
    }
    const invoiceEvidenceChanged = attributionChanged
      || billingInterval(event.billingInterval) !== input.expected.billingInterval
      || billingReason(event.billingReason) !== input.expected.billingReason
      || event.isRenewal !== (input.expected.billingReason === 'subscription_cycle');
    if (!invoiceEvidenceChanged) return;
    eventPatches.push({
      eventId: event.eventId,
      eventType: event.eventType,
      patch: {
        plan: input.expected.plan,
        currency: input.expected.currency,
        billingInterval: input.expected.billingInterval,
        billingReason: input.expected.billingReason,
        isRenewal: input.expected.billingReason === 'subscription_cycle',
        evidenceStatus: 'verified',
        evidenceVersion: SONA_PAYMENT_EVIDENCE_REPAIR_VERSION,
        evidenceSource: 'reviewed_stripe_repair',
        evidenceRepair,
      },
    });
  });
  const changedEventIds = eventPatches.map(event => event.eventId);

  return {
    status: 'ready' as const,
    code: 'repair_ready',
    paymentPatch: {
      plan: input.expected.plan,
      currency: input.expected.currency,
      billingInterval: input.expected.billingInterval,
      billingReason: input.expected.billingReason,
      isRenewal: input.expected.billingReason === 'subscription_cycle',
      evidenceStatus: 'verified',
      evidenceVersion: SONA_PAYMENT_EVIDENCE_REPAIR_VERSION,
      evidenceSource: 'reviewed_stripe_repair',
      evidenceRepair,
    },
    eventPatches,
    changedEventIds,
    auditChanges: {
      paymentReferenceId: input.current.paymentReferenceId,
      uid: currentUid,
      invoiceId: input.expected.invoiceId,
      plan: input.expected.plan,
      currency: input.expected.currency,
      billingInterval: input.expected.billingInterval,
      billingReason: input.expected.billingReason,
      planSource: input.expected.planSource,
      stripePriceId: input.expected.stripePriceId,
      linkedEventIds: changedEventIds,
      reason,
      attestationVersion: SONA_PAYMENT_EVIDENCE_REPAIR_VERSION,
      noStripeMutation: true,
    },
  };
}

function validIso(value: unknown) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

type SonaInvoiceAttribution = {
  invoiceId: string;
  paymentReferenceId: string | null;
  plan?: 'pro' | 'studio' | null;
  currency?: string | null;
  billingInterval?: 'month' | 'year' | null;
  billingReason?: string | null;
  amountPaidCents: number;
  occurredAt: string;
  paidAfterUsefulOutcome: boolean;
  evidenceStatus?: 'verified' | 'unverified';
  evidenceVersion?: string | null;
  evidenceSource?: string | null;
};

type SonaRefundAttribution = {
  refundId: string;
  paymentReferenceId: string | null;
  plan?: 'pro' | 'studio' | null;
  currency?: string | null;
  amountRefundedCents: number;
  occurredAt: string;
  attributionStatus: 'linked' | 'unlinked';
  afterUsefulOutcome: boolean;
};

function recordList<T>(value: unknown, limit = 200): T[] {
  return Array.isArray(value) ? value.filter(Boolean).slice(-limit) as T[] : [];
}

function upsertBoundedRecord<T extends Record<string, unknown>>(
  records: T[],
  next: T,
  key: keyof T,
  limit = 200,
) {
  return [...records.filter(record => record[key] !== next[key]), next].slice(-limit);
}

function reconcileCashAttribution(
  firstUsefulAtValue: unknown,
  invoicePaymentsValue: unknown,
  refundsValue: unknown,
) {
  const firstUsefulAt = validIso(firstUsefulAtValue);
  const invoicePayments = recordList<SonaInvoiceAttribution>(invoicePaymentsValue).map(payment => ({
    ...payment,
    paidAfterUsefulOutcome: Boolean(
      firstUsefulAt
      && boundedCount(payment.amountPaidCents) > 0
      && Date.parse(payment.occurredAt) >= Date.parse(firstUsefulAt),
    ),
  }));
  const paymentByReference = new Map(
    invoicePayments
      .filter(payment => payment.paymentReferenceId)
      .map(payment => [payment.paymentReferenceId, payment]),
  );
  const refunds = recordList<SonaRefundAttribution>(refundsValue).map(refund => {
    const payment = refund.paymentReferenceId ? paymentByReference.get(refund.paymentReferenceId) : null;
    return {
      ...refund,
      plan: paidPlan(refund.plan) || paidPlan(payment?.plan),
      currency: String(refund.currency || payment?.currency || '').toLowerCase() || null,
      attributionStatus: payment ? 'linked' as const : 'unlinked' as const,
      afterUsefulOutcome: payment?.paidAfterUsefulOutcome === true,
    };
  });
  const grossCashAfterUsefulCents = invoicePayments.reduce(
    (sum, payment) => sum + (
      payment.paidAfterUsefulOutcome && String(payment.currency || '').toLowerCase() === 'usd'
        ? boundedCount(payment.amountPaidCents)
        : 0
    ),
    0,
  );
  const refundsAfterUsefulCents = refunds.reduce(
    (sum, refund) => sum + (
      refund.attributionStatus === 'linked'
      && refund.afterUsefulOutcome
      && String(refund.currency || '').toLowerCase() === 'usd'
        ? boundedCount(refund.amountRefundedCents)
        : 0
    ),
    0,
  );
  const unsupportedCurrencyEvents = invoicePayments.filter(payment => (
    payment.paidAfterUsefulOutcome && String(payment.currency || '').toLowerCase() !== 'usd'
  )).length + refunds.filter(refund => (
    refund.attributionStatus === 'linked'
    && refund.afterUsefulOutcome
    && String(refund.currency || '').toLowerCase() !== 'usd'
  )).length;
  return {
    invoicePayments,
    refunds,
    grossCashAfterUsefulCents,
    refundsAfterUsefulCents,
    netCashAfterUsefulCents: grossCashAfterUsefulCents - refundsAfterUsefulCents,
    unlinkedRefunds: refunds.filter(refund => refund.attributionStatus === 'unlinked').length,
    unsupportedCurrencyEvents,
  };
}

function buildSonaAccountRenewalEvidenceState(
  paymentRecords: SonaInvoiceAttribution[],
  expectedPaidInvoiceCount: number,
  updatedAt: string,
) {
  const paidRecords = paymentRecords.filter(payment => boundedCount(payment.amountPaidCents) > 0);
  const seenInvoiceIds = new Set<string>();
  const seenPaymentReferences = new Set<string>();
  const unresolved: string[] = [];
  paidRecords.forEach((payment, index) => {
    const recordKey = payment.invoiceId || payment.paymentReferenceId || `record_${index + 1}`;
    if (
      !payment.invoiceId
      || !payment.paymentReferenceId
      || !paidPlan(payment.plan)
      || String(payment.currency || '').toLowerCase() !== 'usd'
      || !billingInterval(payment.billingInterval)
      || !billingReason(payment.billingReason)
      || !validIso(payment.occurredAt)
      || !hasVerifiedSonaPaymentEvidence(payment)
    ) {
      unresolved.push(String(recordKey));
    }
    if (payment.invoiceId) {
      if (seenInvoiceIds.has(payment.invoiceId)) unresolved.push(`invoice:${payment.invoiceId}`);
      seenInvoiceIds.add(payment.invoiceId);
    }
    if (payment.paymentReferenceId) {
      if (seenPaymentReferences.has(payment.paymentReferenceId)) {
        unresolved.push(`payment:${payment.paymentReferenceId}`);
      }
      seenPaymentReferences.add(payment.paymentReferenceId);
    }
  });
  const historyTruncated = expectedPaidInvoiceCount !== paidRecords.length || expectedPaidInvoiceCount > 200;
  const missingInvoiceIds = [...new Set(unresolved)];
  const evidenceComplete = !historyTruncated && missingInvoiceIds.length === 0;
  const chronologicalPaidRecords = evidenceComplete
    ? [...paidRecords].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt))
    : [];
  const firstPaid = chronologicalPaidRecords[0] || null;
  const latestPaid = chronologicalPaidRecords[chronologicalPaidRecords.length - 1] || null;
  const firstPaidMs = firstPaid ? Date.parse(firstPaid.occurredAt) : Number.NaN;
  const renewalRecords = chronologicalPaidRecords.filter(payment => (
    payment.billingReason === 'subscription_cycle'
    && Date.parse(payment.occurredAt) > firstPaidMs
  ));
  const firstRenewal = renewalRecords[0] || null;
  const latestRenewal = renewalRecords[renewalRecords.length - 1] || null;
  return {
    renewalEvidenceVersion: SONA_ACCOUNT_RENEWAL_EVIDENCE_VERSION,
    renewalEvidenceStatus: evidenceComplete ? 'complete' as const : 'incomplete' as const,
    renewalEvidenceMissingInvoiceCount: missingInvoiceIds.length,
    renewalEvidenceMissingInvoiceIds: missingInvoiceIds.slice(0, 20),
    renewalEvidenceHistoryTruncated: historyTruncated,
    renewalEvidenceUpdatedAt: updatedAt,
    ...(evidenceComplete ? {
      paidInvoiceCount: chronologicalPaidRecords.length,
      firstPaidAt: firstPaid?.occurredAt || null,
      firstPaidPlan: paidPlan(firstPaid?.plan),
      firstPaidInterval: billingInterval(firstPaid?.billingInterval),
      latestPaidAt: latestPaid?.occurredAt || null,
      latestPaidPlan: paidPlan(latestPaid?.plan),
      latestPaidInterval: billingInterval(latestPaid?.billingInterval),
      renewalInvoiceCount: renewalRecords.length,
      firstRenewalAt: firstRenewal?.occurredAt || null,
      latestRenewalAt: latestRenewal?.occurredAt || null,
    } : {}),
  };
}

export function buildSonaAccountRenewalSummaryRepairDecision(input: {
  currentSummary: Record<string, unknown> | null;
  paymentRecords: Array<Record<string, unknown>>;
  paymentHistoryTruncated: boolean;
  verifiedPayment: {
    uid: string;
    invoiceId: string;
    paymentReferenceId: string;
    plan: 'pro' | 'studio';
    currency: 'usd';
    billingInterval: 'month' | 'year';
    billingReason: string;
  };
  repairedAt: string;
}) {
  const blocked = (code: string) => ({ status: 'blocked' as const, code });
  const summary = input.currentSummary;
  if (!summary) return blocked('account_summary_missing');
  if (typeof summary.uid === 'string' && summary.uid !== input.verifiedPayment.uid) {
    return blocked('account_summary_owner_conflict');
  }

  const targetMatches = input.paymentRecords.filter(payment => (
    payment.invoiceId === input.verifiedPayment.invoiceId
    || payment.paymentReferenceId === input.verifiedPayment.paymentReferenceId
  ));
  if (targetMatches.length !== 1) return blocked('account_payment_ledger_conflict');
  const target = targetMatches[0];
  if (
    target.invoiceId !== input.verifiedPayment.invoiceId
    || (target.paymentReferenceId && target.paymentReferenceId !== input.verifiedPayment.paymentReferenceId)
  ) {
    return blocked('account_payment_ledger_conflict');
  }

  const ledgerInvoices = input.paymentRecords.map((payment, index) => {
    const isTarget = payment.invoiceId === input.verifiedPayment.invoiceId
      && payment.paymentReferenceId === input.verifiedPayment.paymentReferenceId;
    const hasVerifiedProvenance = isTarget || hasVerifiedSonaPaymentEvidence(payment);
    const normalized = isTarget
      ? {
        ...payment,
        paymentReferenceId: input.verifiedPayment.paymentReferenceId,
        plan: input.verifiedPayment.plan,
        currency: input.verifiedPayment.currency,
        billingInterval: input.verifiedPayment.billingInterval,
        billingReason: input.verifiedPayment.billingReason,
        evidenceStatus: 'verified',
        evidenceVersion: SONA_PAYMENT_EVIDENCE_REPAIR_VERSION,
        evidenceSource: 'reviewed_stripe_repair',
      }
      : payment;
    return {
      invoiceId: typeof normalized.invoiceId === 'string' ? normalized.invoiceId : '',
      paymentReferenceId: typeof normalized.paymentReferenceId === 'string'
        ? normalized.paymentReferenceId
        : null,
      plan: paidPlan(normalized.plan),
      currency: String(normalized.currency || '').toLowerCase() || null,
      billingInterval: billingInterval(normalized.billingInterval),
      billingReason: billingReason(normalized.billingReason),
      amountPaidCents: boundedCount(normalized.amountPaidCents),
      occurredAt: validIso(normalized.occurredAt) || '',
      paidAfterUsefulOutcome: Boolean(normalized.paidAfterUsefulOutcome),
      evidenceStatus: hasVerifiedProvenance ? 'verified' as const : 'unverified' as const,
      evidenceVersion: isTarget
        ? SONA_PAYMENT_EVIDENCE_REPAIR_VERSION
        : typeof normalized.evidenceVersion === 'string'
          ? normalized.evidenceVersion
          : typeof normalized.economicsVersion === 'string' ? normalized.economicsVersion : null,
      evidenceSource: isTarget
        ? 'reviewed_stripe_repair'
        : typeof normalized.evidenceSource === 'string' ? normalized.evidenceSource : 'server_ledger',
      recordKey: normalized.invoiceId || normalized.paymentReferenceId || `record_${index + 1}`,
    };
  });
  const paidLedgerInvoices = ledgerInvoices.filter(payment => payment.amountPaidCents > 0);
  const seenInvoiceIds = new Set<string>();
  const seenPaymentReferences = new Set<string>();
  const duplicateKeys: string[] = [];
  paidLedgerInvoices.forEach(payment => {
    if (payment.invoiceId) {
      if (seenInvoiceIds.has(payment.invoiceId)) duplicateKeys.push(`invoice:${payment.invoiceId}`);
      seenInvoiceIds.add(payment.invoiceId);
    }
    if (payment.paymentReferenceId) {
      if (seenPaymentReferences.has(payment.paymentReferenceId)) {
        duplicateKeys.push(`payment:${payment.paymentReferenceId}`);
      }
      seenPaymentReferences.add(payment.paymentReferenceId);
    }
  });
  const missingInvoiceIds = paidLedgerInvoices.flatMap(payment => {
    const complete = Boolean(
      payment.invoiceId
      && payment.paymentReferenceId
      && payment.plan
      && payment.currency === 'usd'
      && payment.billingInterval
      && payment.billingReason
      && payment.occurredAt
      && payment.evidenceStatus === 'verified',
    );
    return complete ? [] : [String(payment.recordKey)];
  });
  const unresolvedEvidence = [...new Set([...missingInvoiceIds, ...duplicateKeys])];
  const historyReliable = !input.paymentHistoryTruncated && duplicateKeys.length === 0;
  const reconstructableInvoices = historyReliable
    ? ledgerInvoices
      .filter(payment => payment.invoiceId)
      .map(({ recordKey: _recordKey, ...payment }) => payment)
    : null;
  const cashAttribution = reconstructableInvoices
    ? reconcileCashAttribution(summary.firstUsefulAt, reconstructableInvoices, summary.refunds)
    : null;
  const paidInvoices = cashAttribution
    ? cashAttribution.invoicePayments
      .filter(payment => boundedCount(payment.amountPaidCents) > 0)
      .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt))
    : [];
  const evidenceComplete = historyReliable
    && unresolvedEvidence.length === 0
    && Boolean(cashAttribution);
  const commonPatch = {
    uid: input.verifiedPayment.uid,
    ...(cashAttribution ? {
      invoicePayments: cashAttribution.invoicePayments,
      refunds: cashAttribution.refunds,
      grossCashAfterUsefulCents: cashAttribution.grossCashAfterUsefulCents,
      refundsAfterUsefulCents: cashAttribution.refundsAfterUsefulCents,
      netCashAfterUsefulCents: cashAttribution.netCashAfterUsefulCents,
      unlinkedRefunds: cashAttribution.unlinkedRefunds,
      unsupportedCurrencyEvents: cashAttribution.unsupportedCurrencyEvents,
    } : {}),
    renewalEvidenceVersion: SONA_ACCOUNT_RENEWAL_EVIDENCE_VERSION,
    renewalEvidenceStatus: evidenceComplete ? 'complete' as const : 'incomplete' as const,
    renewalEvidenceMissingInvoiceCount: unresolvedEvidence.length,
    renewalEvidenceMissingInvoiceIds: unresolvedEvidence.slice(0, 20),
    renewalEvidenceHistoryTruncated: input.paymentHistoryTruncated,
    renewalEvidenceUpdatedAt: input.repairedAt,
    updatedAt: input.repairedAt,
  };
  if (!evidenceComplete) {
    return {
      status: 'incomplete' as const,
      code: input.paymentHistoryTruncated
        ? 'account_payment_history_truncated'
        : duplicateKeys.length ? 'account_payment_ledger_duplicate' : 'account_payment_evidence_incomplete',
      summaryPatch: commonPatch,
      clearPaidEvidence: true,
      missingInvoiceIds: unresolvedEvidence,
    };
  }

  const firstPaid = paidInvoices[0] || null;
  const latestPaid = paidInvoices[paidInvoices.length - 1] || null;
  const renewalInvoices = paidInvoices.filter(payment => payment.billingReason === 'subscription_cycle');
  const firstRenewal = renewalInvoices[0] || null;
  const latestRenewal = renewalInvoices[renewalInvoices.length - 1] || null;
  return {
    status: 'ready' as const,
    code: 'account_summary_repair_ready',
    summaryPatch: {
      ...commonPatch,
      paidInvoiceCount: paidInvoices.length,
      firstPaidAt: firstPaid?.occurredAt || null,
      firstPaidPlan: paidPlan(firstPaid?.plan),
      firstPaidInterval: billingInterval(firstPaid?.billingInterval),
      latestPaidAt: latestPaid?.occurredAt || null,
      latestPaidPlan: paidPlan(latestPaid?.plan),
      latestPaidInterval: billingInterval(latestPaid?.billingInterval),
      renewalInvoiceCount: renewalInvoices.length,
      firstRenewalAt: firstRenewal?.occurredAt || null,
      latestRenewalAt: latestRenewal?.occurredAt || null,
    },
    clearPaidEvidence: false,
    missingInvoiceIds: [] as string[],
  };
}

export function classifySonaUsefulOutcome(input: {
  queuedCount: number;
  preparedCount: number;
}): SonaUsefulOutcome {
  if (boundedCount(input.preparedCount) > 0) return 'prepared_packet';
  if (boundedCount(input.queuedCount) > 0) return 'ranked_picks';
  return null;
}

export function estimateSonaRunCost(
  actual: SonaRunActualWork,
  basis: SonaCostBasis = DEFAULT_SONA_COST_BASIS,
) {
  const breakdownMicros = {
    goalInterpretation: basis.goalInterpretationMicros,
    jobSupply: boundedCount(actual.searchQueries) * basis.searchQueryMicros,
    resumeMorphs: boundedCount(actual.resumeMorphAttempts) * basis.resumeMorphMicros,
    coverLetters: boundedCount(actual.coverLetterAttempts) * basis.coverLetterMicros,
    emailDelivery: boundedCount(actual.emailDigestsSent) * basis.emailDigestMicros,
  };
  const estimatedCostMicros = Object.values(breakdownMicros).reduce((sum, value) => sum + value, 0);
  return {
    basisVersion: basis.version,
    estimatedCostMicros,
    estimatedCostUsd: Number((estimatedCostMicros / 1_000_000).toFixed(6)),
    breakdownMicros,
  };
}

export async function recordSonaRunEconomics(
  db: Firestore,
  input: SonaRunEconomicsInput,
) {
  const outcome = input.terminalStatus === 'completed' ? classifySonaUsefulOutcome(input) : null;
  const estimate = estimateSonaRunCost(input.actual);
  const eventRef = db.collection(SONA_ECONOMICS_COLLECTION).doc(input.runId);
  const accountSummaryRef = db.collection(SONA_ECONOMICS_ACCOUNTS_COLLECTION).doc(input.uid);
  const userSummaryRef = db.collection('users').doc(input.uid).collection('metrics').doc('sona_economics');
  let recorded = false;
  let firstUsefulOutcome = false;

  await db.runTransaction(async transaction => {
    const eventSnap = await transaction.get(eventRef);
    if (eventSnap.exists) return;
    const summarySnap = await transaction.get(accountSummaryRef);
    const summary = summarySnap.exists ? summarySnap.data() || {} : {};
    const completedAt = validIso(input.completedAt) || new Date().toISOString();
    const priorFirstUsefulAt = validIso(summary.firstUsefulAt);
    firstUsefulOutcome = Boolean(outcome && !priorFirstUsefulAt);
    const effectiveFirstUsefulAt = priorFirstUsefulAt || (outcome ? completedAt : null);
    const firstCheckoutAt = validIso(summary.firstCheckoutAt);
    const firstPaidAt = validIso(summary.firstPaidAt);
    const convertedAfterUsefulOutcome = Boolean(
      summary.convertedAfterUsefulOutcome
      || (effectiveFirstUsefulAt && firstCheckoutAt && Date.parse(firstCheckoutAt) >= Date.parse(effectiveFirstUsefulAt)),
    );
    const paidAfterUsefulOutcome = Boolean(
      summary.paidAfterUsefulOutcome
      || (effectiveFirstUsefulAt && firstPaidAt && Date.parse(firstPaidAt) >= Date.parse(effectiveFirstUsefulAt)),
    );
    const cashAttribution = reconcileCashAttribution(
      effectiveFirstUsefulAt,
      summary.invoicePayments,
      summary.refunds,
    );
    const paymentReferenceIds = Array.from(new Set(
      cashAttribution.invoicePayments
        .map(payment => payment.paymentReferenceId)
        .filter((paymentReferenceId): paymentReferenceId is string => Boolean(paymentReferenceId)),
    ));
    const paymentRefs = paymentReferenceIds.map(paymentReferenceId => (
      db.collection(SONA_ECONOMICS_PAYMENTS_COLLECTION).doc(paymentReferenceId)
    ));
    const paymentSnapshots = paymentRefs.length > 0
      ? await transaction.getAll(...paymentRefs)
      : [];
    const verifiedPaymentOutcomeUpdates = new Set<string>();
    if (effectiveFirstUsefulAt) {
      for (const [index, paymentSnapshot] of paymentSnapshots.entries()) {
        if (!paymentSnapshot.exists) continue;
        const payment = paymentSnapshot.data() || {};
        const durablePaidAt = validIso(payment.occurredAt);
        if (
          payment.uid === input.uid
          && hasVerifiedSonaPaymentEvidence(payment)
          && payment.paidAfterUsefulOutcome !== true
          && boundedCount(payment.amountPaidCents) > 0
          && durablePaidAt
          && Date.parse(durablePaidAt) >= Date.parse(effectiveFirstUsefulAt)
        ) {
          verifiedPaymentOutcomeUpdates.add(paymentReferenceIds[index]);
        }
      }
    }
    recorded = true;

    transaction.set(eventRef, {
      eventId: input.runId,
      eventType: 'sona_run_completed',
      uid: input.uid,
      tier: input.tier,
      terminalStatus: input.terminalStatus,
      occurredAt: completedAt,
      startedAt: validIso(input.startedAt) || completedAt,
      economicsVersion: SONA_ECONOMICS_VERSION,
      costBasisVersion: estimate.basisVersion,
      estimatedCostMicros: estimate.estimatedCostMicros,
      estimatedCostBreakdownMicros: estimate.breakdownMicros,
      actual: {
        searchQueries: boundedCount(input.actual.searchQueries),
        rankedRoles: boundedCount(input.actual.rankedRoles),
        resumeMorphAttempts: boundedCount(input.actual.resumeMorphAttempts),
        coverLetterAttempts: boundedCount(input.actual.coverLetterAttempts),
        emailDigestChecks: boundedCount(input.actual.emailDigestChecks),
        emailDigestsSent: boundedCount(input.actual.emailDigestsSent),
      },
      queuedCount: boundedCount(input.queuedCount),
      preparedCount: boundedCount(input.preparedCount),
      usefulOutcome: outcome,
      isFirstUsefulOutcome: firstUsefulOutcome,
    });

    const nextSummary = {
      uid: input.uid,
      economicsVersion: SONA_ECONOMICS_VERSION,
      costBasisVersion: estimate.basisVersion,
      runsObserved: boundedCount(summary.runsObserved) + 1,
      usefulRunsObserved: boundedCount(summary.usefulRunsObserved) + (outcome ? 1 : 0),
      rankedRolesObserved: boundedCount(summary.rankedRolesObserved) + boundedCount(input.actual.rankedRoles),
      preparedPacketsObserved: boundedCount(summary.preparedPacketsObserved) + boundedCount(input.preparedCount),
      estimatedCostMicros: boundedCount(summary.estimatedCostMicros) + estimate.estimatedCostMicros,
      firstUsefulAt: effectiveFirstUsefulAt,
      firstUsefulOutcome: summary.firstUsefulOutcome || outcome,
      firstUsefulRunId: summary.firstUsefulRunId || (outcome ? input.runId : null),
      lastRunId: input.runId,
      lastRunAt: completedAt,
      lastRunStatus: input.terminalStatus,
      lastOutcome: outcome,
      convertedAfterUsefulOutcome,
      paidAfterUsefulOutcome: Boolean(
        paidAfterUsefulOutcome
        || cashAttribution.invoicePayments.some(payment => payment.paidAfterUsefulOutcome),
      ),
      invoicePayments: cashAttribution.invoicePayments,
      refunds: cashAttribution.refunds,
      grossCashAfterUsefulCents: cashAttribution.grossCashAfterUsefulCents,
      refundsAfterUsefulCents: cashAttribution.refundsAfterUsefulCents,
      netCashAfterUsefulCents: cashAttribution.netCashAfterUsefulCents,
      unlinkedRefunds: cashAttribution.unlinkedRefunds,
      unsupportedCurrencyEvents: cashAttribution.unsupportedCurrencyEvents,
      updatedAt: completedAt,
    };
    transaction.set(accountSummaryRef, nextSummary, { merge: true });
    transaction.set(userSummaryRef, nextSummary, { merge: true });
    paymentSnapshots.forEach((paymentSnapshot, index) => {
      if (!paymentSnapshot.exists || !verifiedPaymentOutcomeUpdates.has(paymentReferenceIds[index])) return;
      transaction.set(paymentRefs[index], {
        paidAfterUsefulOutcome: true,
      }, { merge: true });
    });
  });

  return { recorded, firstUsefulOutcome, usefulOutcome: outcome, estimate };
}

export async function queueSonaRunEconomicsRetry(
  db: Firestore,
  input: SonaRunEconomicsInput,
) {
  const now = new Date().toISOString();
  await db.collection(SONA_ECONOMICS_OUTBOX_COLLECTION).doc(input.runId).set({
    runId: input.runId,
    uid: input.uid,
    eventType: 'sona_run_completed',
    status: 'pending',
    attempts: 0,
    payload: input,
    economicsVersion: SONA_ECONOMICS_VERSION,
    createdAt: now,
    nextAttemptAt: now,
    updatedAt: now,
  }, { merge: true });
}

export async function recordOrQueueSonaRunEconomics(
  db: Firestore,
  input: SonaRunEconomicsInput,
) {
  try {
    const result = await recordSonaRunEconomics(db, input);
    return { ...result, status: result.recorded ? 'recorded' as const : 'duplicate' as const };
  } catch {
    await queueSonaRunEconomicsRetry(db, input);
    const outcome = input.terminalStatus === 'completed' ? classifySonaUsefulOutcome(input) : null;
    return {
      recorded: false,
      firstUsefulOutcome: false,
      usefulOutcome: outcome,
      estimate: estimateSonaRunCost(input.actual),
      status: 'pending_retry' as const,
    };
  }
}

async function claimSonaEconomicsOutboxEntry(
  db: Firestore,
  ref: FirebaseFirestore.DocumentReference,
  now: Date,
) {
  const leaseId = `lease_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const data = snapshot.data() || {};
    if (['completed', 'dead_letter', 'invalid'].includes(String(data.status || ''))) return null;
    const nextAttemptAt = validIso(data.nextAttemptAt) || now.toISOString();
    if (Date.parse(nextAttemptAt) > now.getTime()) return null;
    const leaseAt = validIso(data.leaseAt);
    const leaseFresh = data.status === 'processing'
      && leaseAt
      && now.getTime() - Date.parse(leaseAt) < SONA_ECONOMICS_OUTBOX_LEASE_MS;
    if (leaseFresh) return null;
    transaction.set(ref, {
      status: 'processing',
      leaseId,
      leaseAt: now.toISOString(),
      nextAttemptAt: new Date(now.getTime() + SONA_ECONOMICS_OUTBOX_LEASE_MS).toISOString(),
      updatedAt: now.toISOString(),
    }, { merge: true });
    return { data, leaseId };
  });
}

async function finishSonaEconomicsOutboxEntry(
  db: Firestore,
  ref: FirebaseFirestore.DocumentReference,
  leaseId: string,
  update: Record<string, unknown>,
) {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.data()?.leaseId !== leaseId) return false;
    transaction.set(ref, { ...update, leaseId: null, leaseAt: null }, { merge: true });
    return true;
  });
}

export async function processSonaEconomicsOutbox(
  db: Firestore,
  limit = 25,
  deps: { recordRunEconomics?: typeof recordSonaRunEconomics } = {},
) {
  const batchLimit = Math.max(1, Math.min(100, boundedCount(limit)));
  const recordRunEconomics = deps.recordRunEconomics || recordSonaRunEconomics;
  const snapshot = await db.collection(SONA_ECONOMICS_OUTBOX_COLLECTION)
    .orderBy('nextAttemptAt', 'asc')
    .limit(batchLimit * 3)
    .get();
  let completed = 0;
  let failed = 0;
  let processed = 0;
  for (const doc of snapshot.docs) {
    if (processed >= batchLimit) break;
    const now = new Date();
    const claim = await claimSonaEconomicsOutboxEntry(db, doc.ref, now).catch(() => null);
    if (!claim) continue;
    processed += 1;
    const { data, leaseId } = claim;
    const payload = data.payload as SonaRunEconomicsInput | undefined;
    if (!payload?.uid || !payload?.runId) {
      await finishSonaEconomicsOutboxEntry(db, doc.ref, leaseId, {
        status: 'invalid',
        nextAttemptAt: SONA_ECONOMICS_OUTBOX_COMPLETE_AT,
        updatedAt: now.toISOString(),
      });
      failed += 1;
      continue;
    }
    try {
      await recordRunEconomics(db, payload);
      await finishSonaEconomicsOutboxEntry(db, doc.ref, leaseId, {
        status: 'completed',
        attempts: boundedCount(data.attempts) + 1,
        completedAt: now.toISOString(),
        nextAttemptAt: SONA_ECONOMICS_OUTBOX_COMPLETE_AT,
        updatedAt: now.toISOString(),
      });
      completed += 1;
    } catch {
      const attempts = boundedCount(data.attempts) + 1;
      const deadLetter = attempts >= SONA_ECONOMICS_OUTBOX_MAX_ATTEMPTS;
      const backoffMs = Math.min(6 * 60 * 60 * 1000, 5 * 60 * 1000 * (2 ** Math.max(0, attempts - 1)));
      await finishSonaEconomicsOutboxEntry(db, doc.ref, leaseId, {
        status: deadLetter ? 'dead_letter' : 'pending',
        attempts,
        lastAttemptAt: now.toISOString(),
        nextAttemptAt: deadLetter
          ? SONA_ECONOMICS_OUTBOX_COMPLETE_AT
          : new Date(now.getTime() + backoffMs).toISOString(),
        updatedAt: now.toISOString(),
      }).catch(() => false);
      failed += 1;
    }
  }
  return { processed, completed, failed };
}

export async function recordSonaCheckoutConversion(
  db: Firestore,
  input: {
    uid: string;
    stripeEventId: string;
    checkoutSessionId: string;
    plan: string;
    interval: string;
    checkoutValueCents: number;
    currency: string;
    occurredAt: string;
    checkoutSource?: CheckoutAttributionSource;
  },
) {
  const eventId = `checkout_${input.checkoutSessionId}`;
  const eventRef = db.collection(SONA_ECONOMICS_COLLECTION).doc(eventId);
  const accountSummaryRef = db.collection(SONA_ECONOMICS_ACCOUNTS_COLLECTION).doc(input.uid);
  const userSummaryRef = db.collection('users').doc(input.uid).collection('metrics').doc('sona_economics');
  let recorded = false;
  let afterUsefulOutcome = false;
  const normalizedInterval = input.interval === 'year' ? 'year' : input.interval === 'month' ? 'month' : null;
  const checkoutSource = normalizeCheckoutAttributionSource(input.checkoutSource);

  await db.runTransaction(async transaction => {
    const eventSnap = await transaction.get(eventRef);
    if (eventSnap.exists) return;
    const summarySnap = await transaction.get(accountSummaryRef);
    const summary = summarySnap.exists ? summarySnap.data() || {} : {};
    const occurredAt = validIso(input.occurredAt) || new Date().toISOString();
    const priorFirstCheckoutAt = validIso(summary.firstCheckoutAt);
    const priorLatestCheckoutAt = validIso(summary.latestCheckoutAt);
    const replacesFirstCheckout = !priorFirstCheckoutAt
      || Date.parse(occurredAt) < Date.parse(priorFirstCheckoutAt);
    const replacesLatestCheckout = !priorLatestCheckoutAt
      || Date.parse(occurredAt) >= Date.parse(priorLatestCheckoutAt);
    const firstUsefulAt = validIso(summary.firstUsefulAt);
    const checkoutMs = Date.parse(occurredAt);
    const firstUsefulMs = firstUsefulAt ? Date.parse(firstUsefulAt) : Number.NaN;
    afterUsefulOutcome = Boolean(firstUsefulAt && firstUsefulMs <= checkoutMs);
    const hoursFromFirstUseful = afterUsefulOutcome
      ? Number(((checkoutMs - firstUsefulMs) / 3_600_000).toFixed(2))
      : null;
    recorded = true;

    transaction.set(eventRef, {
      eventId,
      eventType: 'checkout_completed',
      uid: input.uid,
      occurredAt,
      economicsVersion: SONA_ECONOMICS_VERSION,
      stripeEventId: input.stripeEventId,
      checkoutSessionId: input.checkoutSessionId,
      plan: input.plan,
      interval: normalizedInterval,
      checkoutValueCents: boundedCount(input.checkoutValueCents),
      currency: String(input.currency || 'usd').toLowerCase(),
      checkoutSource,
      afterUsefulOutcome,
      firstUsefulAt,
      firstUsefulOutcome: summary.firstUsefulOutcome || null,
      firstUsefulRunId: summary.firstUsefulRunId || null,
      hoursFromFirstUseful,
      runsBeforeConversion: boundedCount(summary.runsObserved),
      usefulRunsBeforeConversion: boundedCount(summary.usefulRunsObserved),
      estimatedCostBeforeConversionMicros: boundedCount(summary.estimatedCostMicros),
    });

    const nextSummary = {
      uid: input.uid,
      checkoutCount: boundedCount(summary.checkoutCount) + 1,
      firstCheckoutAt: replacesFirstCheckout ? occurredAt : priorFirstCheckoutAt,
      firstCheckoutPlan: replacesFirstCheckout ? input.plan : summary.firstCheckoutPlan || null,
      firstCheckoutInterval: replacesFirstCheckout ? normalizedInterval : summary.firstCheckoutInterval || null,
      firstCheckoutSource: replacesFirstCheckout
        ? checkoutSource
        : normalizeCheckoutAttributionSource(summary.firstCheckoutSource),
      latestCheckoutAt: replacesLatestCheckout ? occurredAt : priorLatestCheckoutAt,
      latestCheckoutPlan: replacesLatestCheckout ? input.plan : summary.latestCheckoutPlan || null,
      latestCheckoutInterval: replacesLatestCheckout ? normalizedInterval : summary.latestCheckoutInterval || null,
      latestCheckoutSource: replacesLatestCheckout
        ? checkoutSource
        : normalizeCheckoutAttributionSource(summary.latestCheckoutSource),
      convertedAfterUsefulOutcome: Boolean(summary.convertedAfterUsefulOutcome || afterUsefulOutcome),
      updatedAt: priorLatestCheckoutAt && Date.parse(priorLatestCheckoutAt) > Date.parse(occurredAt)
        ? priorLatestCheckoutAt
        : occurredAt,
    };
    transaction.set(accountSummaryRef, nextSummary, { merge: true });
    transaction.set(userSummaryRef, nextSummary, { merge: true });
  });

  return { recorded, afterUsefulOutcome };
}

export async function recordSonaPaidInvoice(
  db: Firestore,
  input: {
    uid: string;
    stripeEventId: string;
    invoiceId: string;
    paymentReferenceId?: string | null;
    plan: string;
    billingInterval?: string | null;
    billingReason?: string | null;
    amountPaidCents: number;
    currency: string;
    occurredAt: string;
  },
) {
  const eventId = `invoice_${input.invoiceId}`;
  const eventRef = db.collection(SONA_ECONOMICS_COLLECTION).doc(eventId);
  const accountSummaryRef = db.collection(SONA_ECONOMICS_ACCOUNTS_COLLECTION).doc(input.uid);
  const userSummaryRef = db.collection('users').doc(input.uid).collection('metrics').doc('sona_economics');
  const paymentRef = input.paymentReferenceId
    ? db.collection(SONA_ECONOMICS_PAYMENTS_COLLECTION).doc(input.paymentReferenceId)
    : null;
  let recorded = false;
  let paidAfterUsefulOutcome = false;
  const normalizedPlan = paidPlan(input.plan);
  const normalizedCurrency = String(input.currency || '').toLowerCase() || null;
  const normalizedInterval = input.billingInterval === 'year'
    ? 'year' as const
    : input.billingInterval === 'month' ? 'month' as const : null;
  const billingReason = typeof input.billingReason === 'string' && input.billingReason
    ? input.billingReason.slice(0, 80)
    : null;

  await db.runTransaction(async transaction => {
    const eventSnap = await transaction.get(eventRef);
    if (eventSnap.exists) return;
    const summarySnap = await transaction.get(accountSummaryRef);
    const summary = summarySnap.exists ? summarySnap.data() || {} : {};
    const occurredAt = validIso(input.occurredAt) || new Date().toISOString();
    const firstUsefulAt = validIso(summary.firstUsefulAt);
    const amountPaidCents = boundedCount(input.amountPaidCents);
    const invoicePayments = upsertBoundedRecord(
      recordList<SonaInvoiceAttribution>(summary.invoicePayments),
      {
        invoiceId: input.invoiceId,
        paymentReferenceId: input.paymentReferenceId || null,
        plan: normalizedPlan,
        currency: normalizedCurrency,
        billingInterval: normalizedInterval,
        billingReason,
        amountPaidCents,
        occurredAt,
        paidAfterUsefulOutcome: false,
        evidenceStatus: 'verified',
        evidenceVersion: SONA_ECONOMICS_VERSION,
        evidenceSource: 'stripe_webhook',
      },
      'invoiceId',
    );
    const cashAttribution = reconcileCashAttribution(firstUsefulAt, invoicePayments, summary.refunds);
    paidAfterUsefulOutcome = cashAttribution.invoicePayments
      .find(payment => payment.invoiceId === input.invoiceId)?.paidAfterUsefulOutcome === true;
    const nextPaidInvoiceCount = boundedCount(summary.paidInvoiceCount) + (amountPaidCents > 0 ? 1 : 0);
    const renewalEvidenceState = buildSonaAccountRenewalEvidenceState(
      cashAttribution.invoicePayments,
      nextPaidInvoiceCount,
      occurredAt,
    );
    recorded = true;

    transaction.set(eventRef, {
      eventId,
      eventType: 'invoice_paid',
      uid: input.uid,
      occurredAt,
      economicsVersion: SONA_ECONOMICS_VERSION,
      stripeEventId: input.stripeEventId,
      invoiceId: input.invoiceId,
      paymentReferenceId: input.paymentReferenceId || null,
      plan: normalizedPlan,
      billingInterval: normalizedInterval,
      billingReason,
      isRenewal: billingReason === 'subscription_cycle',
      amountPaidCents,
      currency: normalizedCurrency,
      paidAfterUsefulOutcome,
      firstUsefulAt,
      firstUsefulOutcome: summary.firstUsefulOutcome || null,
      firstUsefulRunId: summary.firstUsefulRunId || null,
      estimatedCostBeforePaymentMicros: boundedCount(summary.estimatedCostMicros),
      evidenceStatus: 'verified',
      evidenceVersion: SONA_ECONOMICS_VERSION,
      evidenceSource: 'stripe_webhook',
    });

    const nextSummary = {
      uid: input.uid,
      paidInvoiceCount: nextPaidInvoiceCount,
      grossCashCollectedCents: boundedCount(summary.grossCashCollectedCents) + amountPaidCents,
      firstPaidAt: summary.firstPaidAt || (amountPaidCents > 0 ? occurredAt : null),
      firstPaidPlan: summary.firstPaidPlan || (amountPaidCents > 0 ? normalizedPlan : null),
      firstPaidInterval: summary.firstPaidInterval || (amountPaidCents > 0 ? normalizedInterval : null),
      latestPaidAt: amountPaidCents > 0 ? occurredAt : summary.latestPaidAt || null,
      latestPaidPlan: amountPaidCents > 0 ? normalizedPlan : summary.latestPaidPlan || null,
      latestPaidInterval: amountPaidCents > 0 ? normalizedInterval : summary.latestPaidInterval || null,
      renewalInvoiceCount: boundedCount(summary.renewalInvoiceCount)
        + (amountPaidCents > 0 && billingReason === 'subscription_cycle' ? 1 : 0),
      firstRenewalAt: summary.firstRenewalAt
        || (amountPaidCents > 0 && billingReason === 'subscription_cycle' ? occurredAt : null),
      latestRenewalAt: amountPaidCents > 0 && billingReason === 'subscription_cycle'
        ? occurredAt
        : summary.latestRenewalAt || null,
      paidAfterUsefulOutcome: Boolean(
        summary.paidAfterUsefulOutcome
        || cashAttribution.invoicePayments.some(payment => payment.paidAfterUsefulOutcome),
      ),
      invoicePayments: cashAttribution.invoicePayments,
      refunds: cashAttribution.refunds,
      grossCashAfterUsefulCents: cashAttribution.grossCashAfterUsefulCents,
      refundsAfterUsefulCents: cashAttribution.refundsAfterUsefulCents,
      netCashAfterUsefulCents: cashAttribution.netCashAfterUsefulCents,
      unlinkedRefunds: cashAttribution.unlinkedRefunds,
      unsupportedCurrencyEvents: cashAttribution.unsupportedCurrencyEvents,
      ...renewalEvidenceState,
      updatedAt: occurredAt,
    };
    transaction.set(accountSummaryRef, nextSummary, { merge: true });
    transaction.set(userSummaryRef, nextSummary, { merge: true });
    if (paymentRef) {
      transaction.set(paymentRef, {
        paymentReferenceId: input.paymentReferenceId,
        uid: input.uid,
        invoiceId: input.invoiceId,
        ...(normalizedPlan ? { plan: normalizedPlan } : {}),
        ...(normalizedCurrency ? { currency: normalizedCurrency } : {}),
        ...(normalizedInterval ? { billingInterval: normalizedInterval } : {}),
        ...(billingReason ? { billingReason } : {}),
        paidAfterUsefulOutcome,
        amountPaidCents,
        occurredAt,
        economicsVersion: SONA_ECONOMICS_VERSION,
        evidenceStatus: 'verified',
        evidenceVersion: SONA_ECONOMICS_VERSION,
        evidenceSource: 'stripe_webhook',
      }, { merge: true });
    }
  });

  return { recorded, paidAfterUsefulOutcome };
}

export async function recordSonaRefund(
  db: Firestore,
  input: {
    uid: string;
    stripeEventId: string;
    refundId: string;
    paymentReferenceId?: string | null;
    amountRefundedCents: number;
    currency: string;
    occurredAt: string;
  },
) {
  const eventId = `refund_${input.refundId}`;
  const eventRef = db.collection(SONA_ECONOMICS_COLLECTION).doc(eventId);
  const accountSummaryRef = db.collection(SONA_ECONOMICS_ACCOUNTS_COLLECTION).doc(input.uid);
  const userSummaryRef = db.collection('users').doc(input.uid).collection('metrics').doc('sona_economics');
  const paymentRef = input.paymentReferenceId
    ? db.collection(SONA_ECONOMICS_PAYMENTS_COLLECTION).doc(input.paymentReferenceId)
    : null;
  let recorded = false;
  let afterUsefulOutcome = false;

  await db.runTransaction(async transaction => {
    const eventSnap = await transaction.get(eventRef);
    if (eventSnap.exists) return;
    const summarySnap = await transaction.get(accountSummaryRef);
    const summary = summarySnap.exists ? summarySnap.data() || {} : {};
    const paymentSnap = paymentRef ? await transaction.get(paymentRef) : null;
    const payment = paymentSnap?.exists ? paymentSnap.data() || {} : {};
    const occurredAt = validIso(input.occurredAt) || new Date().toISOString();
    const amountRefundedCents = boundedCount(input.amountRefundedCents);
    let invoicePayments = recordList<SonaInvoiceAttribution>(summary.invoicePayments);
    if (paymentSnap?.exists && input.paymentReferenceId) {
      const existingPayment = invoicePayments.find(item => item.paymentReferenceId === input.paymentReferenceId);
      invoicePayments = upsertBoundedRecord(invoicePayments, {
        invoiceId: String(payment.invoiceId || existingPayment?.invoiceId || ''),
        paymentReferenceId: input.paymentReferenceId,
        plan: paidPlan(payment.plan) || paidPlan(existingPayment?.plan),
        currency: String(payment.currency || existingPayment?.currency || '').toLowerCase() || null,
        billingInterval: payment.billingInterval === 'year' || payment.billingInterval === 'month'
          ? payment.billingInterval
          : existingPayment?.billingInterval || null,
        billingReason: typeof payment.billingReason === 'string'
          ? payment.billingReason
          : existingPayment?.billingReason || null,
        amountPaidCents: boundedCount(payment.amountPaidCents || existingPayment?.amountPaidCents),
        occurredAt: validIso(payment.occurredAt) || existingPayment?.occurredAt || occurredAt,
        paidAfterUsefulOutcome: payment.paidAfterUsefulOutcome === true || existingPayment?.paidAfterUsefulOutcome === true,
      }, 'invoiceId');
    }
    const linkedPayment = input.paymentReferenceId
      ? invoicePayments.find(item => item.paymentReferenceId === input.paymentReferenceId)
      : null;
    const refundCurrency = String(input.currency || '').toLowerCase() || null;
    const refundRecords = upsertBoundedRecord(
      recordList<SonaRefundAttribution>(summary.refunds),
      {
        refundId: input.refundId,
        paymentReferenceId: input.paymentReferenceId || null,
        plan: paidPlan(linkedPayment?.plan) || paidPlan(payment.plan),
        currency: refundCurrency,
        amountRefundedCents,
        occurredAt,
        attributionStatus: 'unlinked',
        afterUsefulOutcome: false,
      },
      'refundId',
    );
    const cashAttribution = reconcileCashAttribution(summary.firstUsefulAt, invoicePayments, refundRecords);
    const currentRefund = cashAttribution.refunds.find(refund => refund.refundId === input.refundId);
    const attributionStatus = currentRefund?.attributionStatus || 'unlinked';
    afterUsefulOutcome = currentRefund?.afterUsefulOutcome === true;
    recorded = true;

    transaction.set(eventRef, {
      eventId,
      eventType: 'refund_succeeded',
      uid: input.uid,
      occurredAt,
      economicsVersion: SONA_ECONOMICS_VERSION,
      stripeEventId: input.stripeEventId,
      refundId: input.refundId,
      paymentReferenceId: input.paymentReferenceId || null,
      linkedInvoiceId: linkedPayment?.invoiceId || payment.invoiceId || null,
      plan: paidPlan(currentRefund?.plan),
      amountRefundedCents,
      currency: refundCurrency,
      attributionStatus,
      afterUsefulOutcome,
    });

    const nextSummary = {
      uid: input.uid,
      refundCount: boundedCount(summary.refundCount) + 1,
      refundedCents: boundedCount(summary.refundedCents) + amountRefundedCents,
      invoicePayments: cashAttribution.invoicePayments,
      refunds: cashAttribution.refunds,
      grossCashAfterUsefulCents: cashAttribution.grossCashAfterUsefulCents,
      refundsAfterUsefulCents: cashAttribution.refundsAfterUsefulCents,
      netCashAfterUsefulCents: cashAttribution.netCashAfterUsefulCents,
      unlinkedRefunds: cashAttribution.unlinkedRefunds,
      unsupportedCurrencyEvents: cashAttribution.unsupportedCurrencyEvents,
      latestRefundAt: occurredAt,
      updatedAt: occurredAt,
    };
    transaction.set(accountSummaryRef, nextSummary, { merge: true });
    transaction.set(userSummaryRef, nextSummary, { merge: true });
  });

  return { recorded, afterUsefulOutcome };
}

export function summarizeSonaPaidCohortRetention(
  events: SonaEconomicsEvent[],
  accountSummaries: SonaEconomicsAccountSummary[],
  options: {
    now?: string;
    cohortWindowDays?: number;
    maturityDays?: number;
    returnWindowStartDay?: number;
    returnWindowEndDay?: number;
    minMatureAccountsPerPlan?: number;
    targetReturnRatePercent?: number;
    sampleCapped?: boolean;
  } = {},
) {
  const now = validIso(options.now) || new Date().toISOString();
  const nowMs = Date.parse(now);
  const cohortWindowDays = Math.max(21, Math.min(90, boundedCount(options.cohortWindowDays ?? 30)));
  const maturityDays = Math.max(7, Math.min(30, boundedCount(options.maturityDays ?? 14)));
  const returnWindowStartDay = Math.max(1, Math.min(maturityDays, boundedCount(options.returnWindowStartDay ?? 7)));
  const returnWindowEndDay = Math.max(
    returnWindowStartDay,
    Math.min(maturityDays, boundedCount(options.returnWindowEndDay ?? 14)),
  );
  const minMatureAccountsPerPlan = Math.max(1, boundedCount(options.minMatureAccountsPerPlan ?? 10));
  const targetReturnRatePercent = Math.max(0, Math.min(100, Number(options.targetReturnRatePercent ?? 20)));
  const dayMs = 24 * 60 * 60 * 1000;
  const cohortStartMs = nowMs - (cohortWindowDays * dayMs);
  const matureCutoffMs = nowMs - (maturityDays * dayMs);
  const firstPaidPlanByUid = new Map<string, 'pro' | 'studio'>();
  events
    .filter(event => (
      event.eventType === 'invoice_paid'
      && boundedCount(event.amountPaidCents) > 0
      && Boolean(paidPlan(event.plan))
    ))
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    .forEach(event => {
      const plan = paidPlan(event.plan);
      if (plan && event.uid && !firstPaidPlanByUid.has(event.uid)) firstPaidPlanByUid.set(event.uid, plan);
    });
  const usefulReturnTimesByUid = new Map<string, number[]>();
  events.forEach(event => {
    if (event.eventType !== 'sona_run_completed' || event.terminalStatus !== 'completed' || !event.usefulOutcome) return;
    const occurredAt = Date.parse(event.occurredAt);
    if (!event.uid || !Number.isFinite(occurredAt)) return;
    const times = usefulReturnTimesByUid.get(event.uid) || [];
    times.push(occurredAt);
    usefulReturnTimesByUid.set(event.uid, times);
  });
  const plans = {
    pro: { plan: 'pro' as const, planLabel: 'Talent Pro', eligibleAccounts: 0, returnedAccounts: 0 },
    studio: { plan: 'studio' as const, planLabel: 'Talent Max', eligibleAccounts: 0, returnedAccounts: 0 },
  };
  const unresolved = { planAccounts: 0, dateAccounts: 0 };
  const seenUids = new Set<string>();

  accountSummaries.forEach(account => {
    if (!account.uid || seenUids.has(account.uid)) return;
    seenUids.add(account.uid);
    const firstPaidAt = validIso(account.firstPaidAt);
    if (!firstPaidAt) {
      unresolved.dateAccounts += 1;
      return;
    }
    const firstPaidMs = Date.parse(firstPaidAt);
    if (firstPaidMs < cohortStartMs || firstPaidMs > matureCutoffMs) return;
    const plan = paidPlan(account.firstPaidPlan) || firstPaidPlanByUid.get(account.uid) || null;
    if (!plan) {
      unresolved.planAccounts += 1;
      return;
    }
    plans[plan].eligibleAccounts += 1;
    const returnStartMs = firstPaidMs + (returnWindowStartDay * dayMs);
    const returnEndMs = firstPaidMs + (returnWindowEndDay * dayMs);
    const returned = (usefulReturnTimesByUid.get(account.uid) || [])
      .some(occurredAt => occurredAt >= returnStartMs && occurredAt <= returnEndMs);
    if (returned) plans[plan].returnedAccounts += 1;
  });

  const evidenceComplete = !options.sampleCapped
    && unresolved.planAccounts === 0
    && unresolved.dateAccounts === 0;
  const byPlan = (['pro', 'studio'] as const).map(planId => {
    const plan = plans[planId];
    const returnRatePercent = plan.eligibleAccounts
      ? Number(((plan.returnedAccounts / plan.eligibleAccounts) * 100).toFixed(1))
      : 0;
    const status = !evidenceComplete
      ? 'blocked' as const
      : plan.eligibleAccounts < minMatureAccountsPerPlan
        ? 'collecting' as const
        : returnRatePercent >= targetReturnRatePercent ? 'pass' as const : 'watch' as const;
    const reason = !evidenceComplete
      ? 'Resolve capped, missing-plan or invalid-date cohort evidence.'
      : plan.eligibleAccounts < minMatureAccountsPerPlan
        ? `Collect ${minMatureAccountsPerPlan - plan.eligibleAccounts} more mature paid account${minMatureAccountsPerPlan - plan.eligibleAccounts === 1 ? '' : 's'}.`
        : returnRatePercent >= targetReturnRatePercent
          ? `Useful week-2 Sona return clears the ${targetReturnRatePercent}% target.`
          : `Useful week-2 Sona return is below the ${targetReturnRatePercent}% target.`;
    return { ...plan, returnRatePercent, status, reason };
  });
  const statuses = byPlan.map(plan => plan.status);
  const status = !evidenceComplete
    ? 'blocked' as const
    : statuses.includes('collecting')
      ? 'collecting' as const
      : statuses.includes('watch') ? 'watch' as const : 'pass' as const;

  return {
    version: SONA_PAID_RETENTION_VERSION,
    scope: 'Useful Sona return during days 7-14 after first payment; not subscription renewal or product-wide retention.',
    generatedAt: now,
    status,
    readyForPricingDecision: status === 'pass' || status === 'watch',
    evidenceComplete,
    sampleCapped: Boolean(options.sampleCapped),
    cohortWindowDays,
    maturityDays,
    returnWindowStartDay,
    returnWindowEndDay,
    minMatureAccountsPerPlan,
    targetReturnRatePercent,
    unresolved,
    matureAccountsObserved: byPlan.reduce((sum, plan) => sum + plan.eligibleAccounts, 0),
    returnedAccountsObserved: byPlan.reduce((sum, plan) => sum + plan.returnedAccounts, 0),
    plans: byPlan,
  };
}

export function summarizeSonaPaidRenewalCohorts(
  accountSummaries: SonaEconomicsAccountSummary[],
  options: {
    now?: string;
    monthlyCohortWindowDays?: number;
    annualCohortWindowDays?: number;
    monthlyMaturityDays?: number;
    annualMaturityDays?: number;
    minMatureAccountsPerSegment?: number;
    targetRenewalRatePercent?: number;
    sampleCapped?: boolean;
    paymentRecords?: Array<Record<string, unknown>>;
    paymentSampleCapped?: boolean;
    invoiceRecords?: Array<Record<string, unknown>>;
    invoiceSampleCapped?: boolean;
    includeAccountEvidenceRows?: boolean;
  } = {},
) {
  const now = validIso(options.now) || new Date().toISOString();
  const nowMs = Date.parse(now);
  const dayMs = 24 * 60 * 60 * 1000;
  const monthlyCohortWindowDays = Math.max(60, Math.min(365, boundedCount(options.monthlyCohortWindowDays ?? 120)));
  const annualCohortWindowDays = Math.max(370, Math.min(730, boundedCount(options.annualCohortWindowDays ?? SONA_RENEWAL_COHORT_LOOKBACK_DAYS)));
  const monthlyMaturityDays = Math.max(28, Math.min(60, boundedCount(options.monthlyMaturityDays ?? 35)));
  const annualMaturityDays = Math.max(365, Math.min(450, boundedCount(options.annualMaturityDays ?? 370)));
  const minMatureAccountsPerSegment = Math.max(1, boundedCount(options.minMatureAccountsPerSegment ?? 10));
  const targetRenewalRatePercent = Math.max(0, Math.min(100, Number(options.targetRenewalRatePercent ?? 60)));
  const segments = {
    pro_month: {
      plan: 'pro' as const,
      planLabel: 'Talent Pro',
      interval: 'month' as const,
      intervalLabel: 'Monthly',
      cohortAccountsObserved: 0,
      eligibleAccounts: 0,
      renewedAccounts: 0,
    },
    pro_year: {
      plan: 'pro' as const,
      planLabel: 'Talent Pro',
      interval: 'year' as const,
      intervalLabel: 'Annual',
      cohortAccountsObserved: 0,
      eligibleAccounts: 0,
      renewedAccounts: 0,
    },
    studio_month: {
      plan: 'studio' as const,
      planLabel: 'Talent Max',
      interval: 'month' as const,
      intervalLabel: 'Monthly',
      cohortAccountsObserved: 0,
      eligibleAccounts: 0,
      renewedAccounts: 0,
    },
    studio_year: {
      plan: 'studio' as const,
      planLabel: 'Talent Max',
      interval: 'year' as const,
      intervalLabel: 'Annual',
      cohortAccountsObserved: 0,
      eligibleAccounts: 0,
      renewedAccounts: 0,
    },
  };
  const unresolved = {
    identityAccounts: 0,
    duplicateAccounts: 0,
    evidenceAccounts: 0,
    planAccounts: 0,
    intervalAccounts: 0,
    dateAccounts: 0,
    renewalDateAccounts: 0,
    paymentRecords: 0,
    invoiceRecords: 0,
    populationAccounts: 0,
  };
  type RenewalUnresolvedKey = keyof typeof unresolved;
  const unresolvedIssues: Array<{ key: RenewalUnresolvedKey; uid: string | null }> = [];
  const addUnresolved = (key: RenewalUnresolvedKey, uid: string | null = null) => {
    unresolvedIssues.push({ key, uid });
  };
  const maximumCohortStartMs = nowMs - (annualCohortWindowDays * dayMs);
  const paymentPopulationUids = new Set<string>();
  const coveragePopulationUids = new Set<string>();
  const reconciledCoverageUids = new Set<string>();
  const paymentSourceCountsByUid = new Map<string, number>();
  const invoiceSourceCountsByUid = new Map<string, number>();
  const paymentsByUid = new Map<string, Array<{
    uid: string;
    invoiceId: string;
    paymentReferenceId: string;
    plan: 'pro' | 'studio';
    billingInterval: 'month' | 'year';
    billingReason: string;
    amountPaidCents: number;
    occurredAt: string;
  }>>();
  const paymentsByInvoiceId = new Map<string, string>();
  const paymentsByReference = new Map<string, string>();
  const paymentOwnerByInvoiceId = new Map<string, string>();
  const paymentOwnerByReference = new Map<string, string>();
  const paymentRecordByInvoiceId = new Map<string, {
    uid: string;
    paymentReferenceId: string;
    plan: 'pro' | 'studio';
    billingInterval: 'month' | 'year';
    billingReason: string;
    amountPaidCents: number;
    occurredAt: string;
  }>();
  (options.paymentRecords || []).forEach(payment => {
    const uid = typeof payment.uid === 'string' && payment.uid ? payment.uid : null;
    if (uid) paymentSourceCountsByUid.set(uid, (paymentSourceCountsByUid.get(uid) || 0) + 1);
    const amountPaidCents = Number(payment.amountPaidCents);
    const occurredAt = validIso(payment.occurredAt);
    if (!Number.isFinite(amountPaidCents) || amountPaidCents < 0) {
      if (uid) {
        paymentPopulationUids.add(uid);
        if (!occurredAt || Date.parse(occurredAt) >= maximumCohortStartMs) {
          coveragePopulationUids.add(uid);
        }
      }
      addUnresolved('paymentRecords', uid);
      return;
    }
    if (amountPaidCents === 0) return;
    if (!uid) {
      if (!occurredAt || Date.parse(occurredAt) >= maximumCohortStartMs) {
        addUnresolved('paymentRecords');
      }
      return;
    }
    paymentPopulationUids.add(uid);
    if (!occurredAt || Date.parse(occurredAt) >= maximumCohortStartMs) {
      coveragePopulationUids.add(uid);
    }
    const plan = paidPlan(payment.plan);
    const interval = billingInterval(payment.billingInterval);
    const reason = billingReason(payment.billingReason);
    const invoiceId = typeof payment.invoiceId === 'string' ? payment.invoiceId : '';
    const paymentReferenceId = typeof payment.paymentReferenceId === 'string'
      ? payment.paymentReferenceId
      : '';
    if (
      !occurredAt
      || !plan
      || String(payment.currency || '').toLowerCase() !== 'usd'
      || !interval
      || !reason
      || !invoiceId
      || !paymentReferenceId
      || !hasVerifiedSonaPaymentEvidence(payment)
    ) {
      addUnresolved('paymentRecords', uid);
      return;
    }
    const duplicatePaymentOwners = new Set<string>();
    if (paymentOwnerByInvoiceId.has(invoiceId)) {
      duplicatePaymentOwners.add(paymentOwnerByInvoiceId.get(invoiceId)!);
    }
    if (paymentOwnerByReference.has(paymentReferenceId)) {
      duplicatePaymentOwners.add(paymentOwnerByReference.get(paymentReferenceId)!);
    }
    if (duplicatePaymentOwners.size > 0) {
      duplicatePaymentOwners.add(uid);
      duplicatePaymentOwners.forEach(ownerUid => addUnresolved('paymentRecords', ownerUid));
      return;
    }
    paymentsByInvoiceId.set(invoiceId, paymentReferenceId);
    paymentsByReference.set(paymentReferenceId, invoiceId);
    paymentOwnerByInvoiceId.set(invoiceId, uid);
    paymentOwnerByReference.set(paymentReferenceId, uid);
    paymentRecordByInvoiceId.set(invoiceId, {
      uid,
      paymentReferenceId,
      plan,
      billingInterval: interval,
      billingReason: reason,
      amountPaidCents,
      occurredAt,
    });
    const history = paymentsByUid.get(uid) || [];
    history.push({
      uid,
      invoiceId,
      paymentReferenceId,
      plan,
      billingInterval: interval,
      billingReason: reason,
      amountPaidCents,
      occurredAt,
    });
    paymentsByUid.set(uid, history);
  });
  const validInvoiceEventInvoiceIds = new Set<string>();
  const invoiceEventOwnerByInvoiceId = new Map<string, string>();
  const invoiceEventOwnerByPaymentReference = new Map<string, string>();
  (options.invoiceRecords || []).forEach(invoice => {
    const uid = typeof invoice.uid === 'string' && invoice.uid ? invoice.uid : null;
    if (uid) invoiceSourceCountsByUid.set(uid, (invoiceSourceCountsByUid.get(uid) || 0) + 1);
    const amountPaidCents = Number(invoice.amountPaidCents);
    const invoiceOccurredAt = validIso(invoice.occurredAt);
    if (!Number.isFinite(amountPaidCents) || amountPaidCents < 0) {
      if (uid) {
        paymentPopulationUids.add(uid);
        if (!invoiceOccurredAt || Date.parse(invoiceOccurredAt) >= maximumCohortStartMs) {
          coveragePopulationUids.add(uid);
        }
      }
      addUnresolved('invoiceRecords', uid);
      return;
    }
    if (amountPaidCents === 0) return;
    if (!uid) {
      if (!invoiceOccurredAt || Date.parse(invoiceOccurredAt) >= maximumCohortStartMs) {
        addUnresolved('invoiceRecords');
      }
      return;
    }
    paymentPopulationUids.add(uid);
    const invoiceId = typeof invoice.invoiceId === 'string' ? invoice.invoiceId : '';
    const paymentReferenceId = typeof invoice.paymentReferenceId === 'string'
      ? invoice.paymentReferenceId
      : '';
    if (!invoiceOccurredAt || Date.parse(invoiceOccurredAt) >= maximumCohortStartMs) {
      coveragePopulationUids.add(uid);
    }
    const duplicateOwners = new Set<string>();
    if (invoiceId && invoiceEventOwnerByInvoiceId.has(invoiceId)) {
      duplicateOwners.add(invoiceEventOwnerByInvoiceId.get(invoiceId)!);
    }
    if (paymentReferenceId && invoiceEventOwnerByPaymentReference.has(paymentReferenceId)) {
      duplicateOwners.add(invoiceEventOwnerByPaymentReference.get(paymentReferenceId)!);
    }
    const duplicateIdentity = duplicateOwners.size > 0;
    if (duplicateIdentity) duplicateOwners.add(uid);
    duplicateOwners.forEach(ownerUid => addUnresolved('invoiceRecords', ownerUid));
    if (invoiceId && !invoiceEventOwnerByInvoiceId.has(invoiceId)) {
      invoiceEventOwnerByInvoiceId.set(invoiceId, uid);
    }
    if (paymentReferenceId && !invoiceEventOwnerByPaymentReference.has(paymentReferenceId)) {
      invoiceEventOwnerByPaymentReference.set(paymentReferenceId, uid);
    }
    const durablePayment = paymentRecordByInvoiceId.get(invoiceId);
    const validInvoiceCrossLink = Boolean(
      invoiceId
      && paymentReferenceId
      && validIso(invoice.occurredAt)
      && hasVerifiedSonaPaymentEvidence(invoice)
      && paymentsByInvoiceId.get(invoiceId) === paymentReferenceId
      && paymentsByReference.get(paymentReferenceId) === invoiceId
      && paymentOwnerByInvoiceId.get(invoiceId) === uid
      && paymentOwnerByReference.get(paymentReferenceId) === uid
      && durablePayment
      && paidPlan(invoice.plan) === durablePayment.plan
      && String(invoice.currency || '').toLowerCase() === 'usd'
      && billingInterval(invoice.billingInterval) === durablePayment.billingInterval
      && billingReason(invoice.billingReason) === durablePayment.billingReason
      && amountPaidCents === durablePayment.amountPaidCents
      && validIso(invoice.occurredAt) === durablePayment.occurredAt
    );
    if (!validInvoiceCrossLink) {
      if (!duplicateIdentity) addUnresolved('invoiceRecords', uid);
    } else {
      validInvoiceEventInvoiceIds.add(invoiceId);
    }
  });
  paymentRecordByInvoiceId.forEach((payment, invoiceId) => {
    if (!validInvoiceEventInvoiceIds.has(invoiceId)) addUnresolved('invoiceRecords', payment.uid);
  });
  const accountsByUid = new Map<string, SonaEconomicsAccountSummary>();
  accountSummaries.forEach(account => {
    if (!account.uid) {
      addUnresolved('identityAccounts');
      return;
    }
    if (accountsByUid.has(account.uid)) {
      addUnresolved('duplicateAccounts', account.uid);
      return;
    }
    accountsByUid.set(account.uid, account);
  });
  accountsByUid.forEach((account, uid) => {
    const accountActivityDates = [
      account.firstPaidAt,
      account.latestPaidAt,
      account.latestRenewalAt,
      account.renewalEvidenceUpdatedAt,
    ].flatMap(value => {
      const normalized = validIso(value);
      return normalized ? [Date.parse(normalized)] : [];
    });
    const inCoverageHorizon = boundedCount(account.paidInvoiceCount) > 0
      && (
        accountActivityDates.length === 0
        || Math.max(...accountActivityDates) >= maximumCohortStartMs
      );
    if (inCoverageHorizon) coveragePopulationUids.add(uid);
    if (inCoverageHorizon && !paymentPopulationUids.has(uid)) {
      addUnresolved('populationAccounts', uid);
    }
  });

  paymentPopulationUids.forEach(uid => {
    const account = accountsByUid.get(uid);
    if (!account) {
      addUnresolved('populationAccounts', uid);
      return;
    }
    const paymentHistory = [...(paymentsByUid.get(uid) || [])]
      .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
    if (paymentHistory.length === 0) {
      addUnresolved('populationAccounts', uid);
      return;
    }
    const firstPayment = paymentHistory[0];
    const latestPayment = paymentHistory[paymentHistory.length - 1];
    const firstPaidAt = validIso(account.firstPaidAt);
    if (!firstPaidAt) {
      addUnresolved('dateAccounts', uid);
      return;
    }
    const firstPaidMs = Date.parse(firstPaidAt);
    if (firstPaidAt !== firstPayment.occurredAt) {
      addUnresolved('dateAccounts', uid);
      return;
    }
    if (firstPaidMs > nowMs) {
      addUnresolved('dateAccounts', uid);
      return;
    }
    const plan = paidPlan(account.firstPaidPlan);
    if (!plan || plan !== firstPayment.plan) {
      addUnresolved('planAccounts', uid);
      return;
    }
    const interval = billingInterval(account.firstPaidInterval);
    if (!interval || interval !== firstPayment.billingInterval) {
      addUnresolved('intervalAccounts', uid);
      return;
    }
    const cohortWindowDays = interval === 'year' ? annualCohortWindowDays : monthlyCohortWindowDays;
    if (
      account.renewalEvidenceStatus !== 'complete'
      || account.renewalEvidenceVersion !== SONA_ACCOUNT_RENEWAL_EVIDENCE_VERSION
      || account.renewalEvidenceHistoryTruncated !== false
      || account.renewalEvidenceMissingInvoiceCount !== 0
      || !Array.isArray(account.renewalEvidenceMissingInvoiceIds)
      || account.renewalEvidenceMissingInvoiceIds.length > 0
      || !validIso(account.renewalEvidenceUpdatedAt)
      || Date.parse(validIso(account.renewalEvidenceUpdatedAt) || '') > nowMs
    ) {
      addUnresolved('evidenceAccounts', uid);
      return;
    }
    const renewalHistory = paymentHistory.filter(payment => (
      payment.billingReason === 'subscription_cycle'
      && Date.parse(payment.occurredAt) > firstPaidMs
    ));
    const expectedFirstRenewalAt = renewalHistory[0]?.occurredAt || null;
    const expectedLatestRenewalAt = renewalHistory[renewalHistory.length - 1]?.occurredAt || null;
    const accountFirstRenewalAt = validIso(account.firstRenewalAt);
    const accountLatestRenewalAt = validIso(account.latestRenewalAt);
    const accountLatestPaidAt = validIso(account.latestPaidAt);
    if (
      boundedCount(account.paidInvoiceCount) !== paymentHistory.length
      || boundedCount(account.renewalInvoiceCount) !== renewalHistory.length
      || accountLatestPaidAt !== latestPayment.occurredAt
      || paidPlan(account.latestPaidPlan) !== latestPayment.plan
      || billingInterval(account.latestPaidInterval) !== latestPayment.billingInterval
      || accountFirstRenewalAt !== expectedFirstRenewalAt
      || accountLatestRenewalAt !== expectedLatestRenewalAt
    ) {
      addUnresolved('evidenceAccounts', uid);
      return;
    }
    if (coveragePopulationUids.has(uid)) reconciledCoverageUids.add(uid);
    if (firstPaidMs < maximumCohortStartMs) return;
    if (firstPaidMs < nowMs - (cohortWindowDays * dayMs)) return;
    const segmentKey = `${plan}_${interval}` as keyof typeof segments;
    const segment = segments[segmentKey];
    segment.cohortAccountsObserved += 1;
    const maturityDays = interval === 'year' ? annualMaturityDays : monthlyMaturityDays;
    if (firstPaidMs > nowMs - (maturityDays * dayMs)) return;
    segment.eligibleAccounts += 1;
    if (renewalHistory.length === 0) return;
    const firstRenewalMs = Date.parse(renewalHistory[0].occurredAt);
    const minimumRenewalAgeDays = interval === 'year' ? 300 : 20;
    if (
      firstRenewalMs < firstPaidMs + (minimumRenewalAgeDays * dayMs)
      || firstRenewalMs > nowMs
    ) {
      addUnresolved('renewalDateAccounts', uid);
      return;
    }
    segment.renewedAccounts += 1;
  });

  unresolvedIssues.forEach(issue => {
    if (issue.uid == null || coveragePopulationUids.has(issue.uid)) {
      unresolved[issue.key] += 1;
      if (issue.uid) reconciledCoverageUids.delete(issue.uid);
    }
  });
  const unresolvedCount = Object.values(unresolved).reduce((sum, value) => sum + value, 0);
  const unassignedSignalCount = unresolvedIssues.filter(issue => issue.uid == null).length;
  const sampleCapped = Boolean(
    options.sampleCapped
    || options.paymentSampleCapped
    || options.invoiceSampleCapped,
  );
  const evidenceComplete = !sampleCapped && unresolvedCount === 0;
  const coverageWithheldReason = sampleCapped
    ? 'sample_cap' as const
    : unassignedSignalCount > 0
      ? 'unassigned_evidence' as const
      : null;
  const coverageMetricsPartial = coverageWithheldReason != null;
  const populationAccountsObserved = coveragePopulationUids.size;
  const reconciledAccountsObserved = [...reconciledCoverageUids]
    .filter(uid => coveragePopulationUids.has(uid)).length;
  const evidenceCoveragePercent = populationAccountsObserved
    ? Number(((reconciledAccountsObserved / populationAccountsObserved) * 100).toFixed(1))
    : 0;
  const blockerCodeByKey: Record<RenewalUnresolvedKey, string> = {
    identityAccounts: 'account_identity',
    duplicateAccounts: 'duplicate_account',
    evidenceAccounts: 'account_evidence',
    planAccounts: 'plan_evidence',
    intervalAccounts: 'interval_evidence',
    dateAccounts: 'payment_date',
    renewalDateAccounts: 'renewal_date',
    paymentRecords: 'payment_ledger',
    invoiceRecords: 'invoice_cross_link',
    populationAccounts: 'population_gap',
  };
  const blockerDefinitions = [
    {
      code: blockerCodeByKey.identityAccounts,
      label: 'Missing account owner',
      count: unresolved.identityAccounts,
      nextAction: 'Restore the server-owned account UID before reconciliation.',
    },
    {
      code: blockerCodeByKey.duplicateAccounts,
      label: 'Duplicate account summaries',
      count: unresolved.duplicateAccounts,
      nextAction: 'Resolve duplicate summaries before choosing a canonical account history.',
    },
    {
      code: blockerCodeByKey.evidenceAccounts,
      label: 'Incomplete account evidence',
      count: unresolved.evidenceAccounts,
      nextAction: 'Run reviewed payment-evidence reconciliation for the affected account.',
    },
    {
      code: blockerCodeByKey.planAccounts,
      label: 'Missing plan evidence',
      count: unresolved.planAccounts,
      nextAction: 'Restore the original verified Pro or Max plan from Stripe evidence.',
    },
    {
      code: blockerCodeByKey.intervalAccounts,
      label: 'Missing billing interval',
      count: unresolved.intervalAccounts,
      nextAction: 'Restore the original monthly or annual interval from the paid invoice.',
    },
    {
      code: blockerCodeByKey.dateAccounts,
      label: 'Invalid paid date',
      count: unresolved.dateAccounts,
      nextAction: 'Reconcile the first paid timestamp against the durable payment ledger.',
    },
    {
      code: blockerCodeByKey.renewalDateAccounts,
      label: 'Invalid renewal timing',
      count: unresolved.renewalDateAccounts,
      nextAction: 'Review cycle timing before classifying the payment as a renewal.',
    },
    {
      code: blockerCodeByKey.paymentRecords,
      label: 'Payment ledger conflicts',
      count: unresolved.paymentRecords,
      nextAction: 'Restore complete, owner-bound durable payment evidence.',
    },
    {
      code: blockerCodeByKey.invoiceRecords,
      label: 'Invoice cross-link conflicts',
      count: unresolved.invoiceRecords,
      nextAction: 'Reconcile invoice events with their matching durable payments.',
    },
    {
      code: blockerCodeByKey.populationAccounts,
      label: 'Paid population gaps',
      count: unresolved.populationAccounts,
      nextAction: 'Restore the missing summary, invoice event, or payment record.',
    },
  ].filter(blocker => blocker.count > 0).sort((left, right) => right.count - left.count);
  const blockers = sampleCapped
    ? [{
      code: 'sample_cap',
      label: 'Evidence source capped',
      count: null,
      nextAction: 'Run an offline full-population reconciliation before using renewal rates.',
    }]
    : blockerDefinitions;
  const bySegment = Object.values(segments).map(segment => {
    const renewalRatePercent = segment.eligibleAccounts
      ? Number(((segment.renewedAccounts / segment.eligibleAccounts) * 100).toFixed(1))
      : 0;
    const status = !evidenceComplete
      ? 'blocked' as const
      : segment.eligibleAccounts < minMatureAccountsPerSegment
        ? 'collecting' as const
        : renewalRatePercent >= targetRenewalRatePercent ? 'pass' as const : 'watch' as const;
    const reason = !evidenceComplete
      ? 'Resolve incomplete, duplicate, invalid or capped renewal evidence.'
      : segment.eligibleAccounts < minMatureAccountsPerSegment
        ? `Collect ${minMatureAccountsPerSegment - segment.eligibleAccounts} more mature paid account${minMatureAccountsPerSegment - segment.eligibleAccounts === 1 ? '' : 's'}.`
        : renewalRatePercent >= targetRenewalRatePercent
          ? `Observed paid renewal clears the ${targetRenewalRatePercent}% review threshold.`
          : `Observed paid renewal is below the ${targetRenewalRatePercent}% review threshold.`;
    return { ...segment, renewalRatePercent, status, reason };
  });
  const statuses = bySegment.map(segment => segment.status);
  const status = !evidenceComplete
    ? 'blocked' as const
    : statuses.includes('collecting')
      ? 'collecting' as const
      : statuses.includes('watch') ? 'watch' as const : 'pass' as const;
  const issueCodesByUid = new Map<string, Set<string>>();
  unresolvedIssues.forEach(issue => {
    if (!issue.uid || !coveragePopulationUids.has(issue.uid)) return;
    const codes = issueCodesByUid.get(issue.uid) || new Set<string>();
    codes.add(blockerCodeByKey[issue.key]);
    issueCodesByUid.set(issue.uid, codes);
  });
  const accountEvidenceRows = options.includeAccountEvidenceRows
    ? [...coveragePopulationUids].sort().map(uid => {
      const account = accountsByUid.get(uid);
      const blockerCodes = [...(issueCodesByUid.get(uid) || [])].sort();
      if (!reconciledCoverageUids.has(uid) && blockerCodes.length === 0) {
        blockerCodes.push(blockerCodeByKey.populationAccounts);
      }
      return {
        uid,
        status: reconciledCoverageUids.has(uid) ? 'reconciled' as const : 'blocked' as const,
        blockerCodes,
        accountSummaryPresent: Boolean(account),
        paymentRecordsObserved: paymentSourceCountsByUid.get(uid) || 0,
        invoiceEventsObserved: invoiceSourceCountsByUid.get(uid) || 0,
        firstPaidAt: validIso(account?.firstPaidAt),
        latestPaidAt: validIso(account?.latestPaidAt),
        firstPaidPlan: paidPlan(account?.firstPaidPlan),
        firstPaidInterval: billingInterval(account?.firstPaidInterval),
      };
    })
    : undefined;

  return {
    version: SONA_PAID_RENEWAL_COHORT_VERSION,
    scope: 'First observed paid renewal by original plan and billing interval; not recognized revenue, cancellation retention or an automatic pricing decision.',
    generatedAt: now,
    status,
    readyForHumanReview: status === 'pass' || status === 'watch',
    evidenceComplete,
    sampleCapped,
    monthlyCohortWindowDays,
    annualCohortWindowDays,
    monthlyMaturityDays,
    annualMaturityDays,
    minMatureAccountsPerSegment,
    targetRenewalRatePercent,
    unresolved,
    populationAccountsObserved: coverageMetricsPartial ? null : populationAccountsObserved,
    reconciledAccountsObserved: coverageMetricsPartial ? null : reconciledAccountsObserved,
    unreconciledPopulationAccounts: coverageMetricsPartial
      ? null
      : Math.max(0, populationAccountsObserved - reconciledAccountsObserved),
    evidenceCoveragePercent: coverageMetricsPartial ? null : evidenceCoveragePercent,
    unresolvedSignalCount: coverageMetricsPartial ? null : unresolvedCount,
    coverageMetricsPartial,
    coverageWithheldReason,
    unassignedSignalCount: sampleCapped ? null : unassignedSignalCount,
    blockers,
    accountEvidenceRows,
    matureAccountsObserved: bySegment.reduce((sum, segment) => sum + segment.eligibleAccounts, 0),
    renewedAccountsObserved: bySegment.reduce((sum, segment) => sum + segment.renewedAccounts, 0),
    segments: bySegment,
    noAutomaticPricingChange: true,
  };
}

export function buildSonaPricingDecisionGate(
  margin: { status: 'pass' | 'watch' | 'collecting' | 'blocked' },
  retention: { status: 'pass' | 'watch' | 'collecting' | 'blocked' },
) {
  const status = margin.status === 'blocked' || retention.status === 'blocked'
    ? 'blocked' as const
    : margin.status === 'collecting' || retention.status === 'collecting'
      ? 'collecting' as const
      : margin.status === 'watch' || retention.status === 'watch' ? 'watch' as const : 'pass' as const;
  const blockers = [
    ...(margin.status === 'blocked' ? ['margin_evidence'] : []),
    ...(retention.status === 'blocked' ? ['retention_evidence'] : []),
    ...(margin.status === 'collecting' ? ['margin_cohort'] : []),
    ...(retention.status === 'collecting' ? ['retention_cohort'] : []),
  ];
  const reason = status === 'blocked'
    ? 'Resolve incomplete margin or retention evidence before a pricing decision.'
    : status === 'collecting'
      ? 'Collect the minimum paid usage and mature return cohort before a pricing decision.'
      : status === 'watch'
        ? 'The cohort is ready for human review, but margin or return is below target.'
        : 'Margin and useful week-2 return clear the current human-review targets.';
  return {
    version: SONA_PRICING_DECISION_VERSION,
    status,
    readyForHumanReview: status === 'pass' || status === 'watch',
    blockers,
    reason,
    noAutomaticPricingChange: true,
  };
}

export function summarizeSonaEconomicsEvents(
  events: SonaEconomicsEvent[],
  options: {
    windowDays?: number;
    sampleLimit?: number;
    accountSummaries?: SonaEconomicsAccountSummary[];
    accountSampleCapped?: boolean;
    paidAccountSummaries?: SonaEconomicsAccountSummary[];
    paidAccountSampleCapped?: boolean;
    renewalAccountSummaries?: SonaEconomicsAccountSummary[];
    renewalPaymentRecords?: Array<Record<string, unknown>>;
    renewalPaymentSampleCapped?: boolean;
    renewalInvoiceRecords?: Array<Record<string, unknown>>;
    renewalInvoiceSampleCapped?: boolean;
    now?: string;
  } = {},
) {
  const runEvents = events.filter(event => event.eventType === 'sona_run_completed');
  const checkoutEvents = events.filter(event => event.eventType === 'checkout_completed');
  const usefulRunEvents = runEvents.filter(event => Boolean(event.usefulOutcome));
  const accountSummaries = options.accountSummaries || [];
  const activatedAccounts = accountSummaries.length;
  const checkoutAccounts = accountSummaries.filter(account => account.convertedAfterUsefulOutcome).length;
  const paidAccounts = accountSummaries.filter(account => account.paidAfterUsefulOutcome).length;
  const estimatedCostMicros = runEvents.reduce(
    (sum, event) => sum + boundedCount(event.estimatedCostMicros),
    0,
  );
  const checkoutValueCents = checkoutEvents.reduce(
    (sum, event) => sum + (event.afterUsefulOutcome ? boundedCount(event.checkoutValueCents) : 0),
    0,
  );
  const grossCashCollectedCents = accountSummaries.reduce(
    (sum, account) => sum + boundedCount(account.grossCashAfterUsefulCents),
    0,
  );
  const refundedCents = accountSummaries.reduce(
    (sum, account) => sum + boundedCount(account.refundsAfterUsefulCents),
    0,
  );
  const unlinkedRefundsObserved = accountSummaries.reduce(
    (sum, account) => sum + boundedCount(account.unlinkedRefunds),
    0,
  );
  const unsupportedCurrencyEventsObserved = accountSummaries.reduce(
    (sum, account) => sum + boundedCount(account.unsupportedCurrencyEvents),
    0,
  );
  const preparedPackets = runEvents.reduce(
    (sum, event) => sum + boundedCount(event.preparedCount),
    0,
  );
  const rankedRoles = runEvents.reduce((sum, event) => {
    const actual = event.actual && typeof event.actual === 'object'
      ? event.actual as Record<string, unknown>
      : {};
    return sum + boundedCount(actual.rankedRoles);
  }, 0);
  const failedRunsObserved = runEvents.filter(event => event.terminalStatus === 'failed').length;
  const sampleCapped = Boolean(
    options.accountSampleCapped
    || options.paidAccountSampleCapped
    || (options.sampleLimit && events.length >= options.sampleLimit),
  );
  const observedPlanEconomics = summarizeSonaPlanObservedEconomics(events, { sampleCapped });
  const paidRetention = summarizeSonaPaidCohortRetention(events, options.paidAccountSummaries || [], {
    now: options.now,
    cohortWindowDays: options.windowDays || 30,
    sampleCapped,
  });
  const paidRenewalCohorts = summarizeSonaPaidRenewalCohorts(options.renewalAccountSummaries || [], {
    now: options.now,
    paymentRecords: options.renewalPaymentRecords || [],
    paymentSampleCapped: Boolean(options.renewalPaymentSampleCapped),
    invoiceRecords: options.renewalInvoiceRecords || [],
    invoiceSampleCapped: Boolean(options.renewalInvoiceSampleCapped),
  });
  const pricingDecision = buildSonaPricingDecisionGate(observedPlanEconomics, paidRetention);

  return {
    economicsVersion: SONA_ECONOMICS_VERSION,
    costBasisVersion: DEFAULT_SONA_COST_BASIS.version,
    generatedAt: new Date().toISOString(),
    windowDays: options.windowDays || 30,
    sampleLimit: options.sampleLimit || events.length,
    sampleCapped,
    runsObserved: runEvents.length,
    failedRunsObserved,
    usefulRunsObserved: usefulRunEvents.length,
    usefulRunRate: runEvents.length ? Number(((usefulRunEvents.length / runEvents.length) * 100).toFixed(1)) : 0,
    activatedAccounts,
    checkoutConversionsObserved: checkoutEvents.length,
    conversionsAfterUsefulOutcome: checkoutAccounts,
    activationToCheckoutRate: activatedAccounts
      ? Number(((checkoutAccounts / activatedAccounts) * 100).toFixed(1))
      : 0,
    paidAccountsAfterUsefulOutcome: paidAccounts,
    activationToPaidRate: activatedAccounts
      ? Number(((paidAccounts / activatedAccounts) * 100).toFixed(1))
      : 0,
    rankedRoles,
    preparedPackets,
    estimatedCostUsd: Number((estimatedCostMicros / 1_000_000).toFixed(4)),
    estimatedCostPerUsefulOutputUsd: usefulRunEvents.length
      ? Number((estimatedCostMicros / 1_000_000 / usefulRunEvents.length).toFixed(4))
      : 0,
    checkoutValueUsd: Number((checkoutValueCents / 100).toFixed(2)),
    grossCashCollectedUsd: Number((grossCashCollectedCents / 100).toFixed(2)),
    refundedUsd: Number((refundedCents / 100).toFixed(2)),
    netCashObservedUsd: Number(((grossCashCollectedCents - refundedCents) / 100).toFixed(2)),
    unlinkedRefundsObserved,
    unsupportedCurrencyEventsObserved,
    observedPlanEconomics,
    paidRetention,
    paidRenewalCohorts,
    pricingDecision,
  };
}

export function summarizeSonaPlanObservedEconomics(
  events: SonaEconomicsEvent[],
  options: {
    sampleCapped?: boolean;
    minPaidAccounts?: number;
    minRuns?: number;
    targetMarginPercent?: number;
  } = {},
) {
  const minPaidAccounts = Math.max(1, boundedCount(options.minPaidAccounts ?? 5));
  const minRuns = Math.max(1, boundedCount(options.minRuns ?? 20));
  const targetMarginPercent = Math.max(0, Math.min(100, Number(options.targetMarginPercent ?? 70)));
  const plans = {
    pro: {
      plan: 'pro' as const,
      planLabel: 'Talent Pro',
      runsObserved: 0,
      usefulRunsObserved: 0,
      estimatedCostMicros: 0,
      paidUids: new Set<string>(),
      grossCashCents: 0,
      refundedCents: 0,
    },
    studio: {
      plan: 'studio' as const,
      planLabel: 'Talent Max',
      runsObserved: 0,
      usefulRunsObserved: 0,
      estimatedCostMicros: 0,
      paidUids: new Set<string>(),
      grossCashCents: 0,
      refundedCents: 0,
    },
  };
  const invoicePlanByPayment = new Map<string, 'pro' | 'studio'>();
  const unresolved = {
    planEvents: 0,
    currencyEvents: 0,
    refundAttributionEvents: 0,
  };
  let freeRunsObserved = 0;
  let freeEstimatedCostMicros = 0;

  events.forEach(event => {
    if (event.eventType === 'sona_run_completed') {
      if (event.tier === 'free') {
        freeRunsObserved += 1;
        freeEstimatedCostMicros += boundedCount(event.estimatedCostMicros);
        return;
      }
      const plan = paidPlan(event.tier);
      if (!plan) {
        unresolved.planEvents += 1;
        return;
      }
      plans[plan].runsObserved += 1;
      plans[plan].usefulRunsObserved += event.usefulOutcome ? 1 : 0;
      plans[plan].estimatedCostMicros += boundedCount(event.estimatedCostMicros);
      return;
    }

    if (event.eventType !== 'invoice_paid' || event.paidAfterUsefulOutcome !== true) return;
    if (String(event.currency || '').toLowerCase() !== 'usd') {
      unresolved.currencyEvents += 1;
      return;
    }
    const plan = paidPlan(event.plan);
    if (!plan) {
      unresolved.planEvents += 1;
      return;
    }
    const amountPaidCents = boundedCount(event.amountPaidCents);
    if (amountPaidCents <= 0) return;
    plans[plan].grossCashCents += amountPaidCents;
    plans[plan].paidUids.add(event.uid);
    if (typeof event.paymentReferenceId === 'string' && event.paymentReferenceId) {
      invoicePlanByPayment.set(event.paymentReferenceId, plan);
    }
  });

  events.forEach(event => {
    if (
      event.eventType !== 'refund_succeeded'
      || event.afterUsefulOutcome !== true
      || event.attributionStatus !== 'linked'
    ) return;
    if (String(event.currency || '').toLowerCase() !== 'usd') {
      unresolved.currencyEvents += 1;
      return;
    }
    const plan = paidPlan(event.plan)
      || (typeof event.paymentReferenceId === 'string'
        ? invoicePlanByPayment.get(event.paymentReferenceId) || null
        : null);
    if (!plan) {
      unresolved.refundAttributionEvents += 1;
      return;
    }
    plans[plan].refundedCents += boundedCount(event.amountRefundedCents);
  });

  const evidenceComplete = !options.sampleCapped
    && unresolved.planEvents === 0
    && unresolved.currencyEvents === 0
    && unresolved.refundAttributionEvents === 0;
  const byPlan = (['pro', 'studio'] as const).map(planId => {
    const plan = plans[planId];
    const estimatedCostUsd = plan.estimatedCostMicros / 1_000_000;
    const netCashCents = plan.grossCashCents - plan.refundedCents;
    const netCashUsd = netCashCents / 100;
    const contributionMarginPercent = netCashUsd > 0
      ? Number((((netCashUsd - estimatedCostUsd) / netCashUsd) * 100).toFixed(1))
      : null;
    const paidAccountsObserved = plan.paidUids.size;
    const collecting = paidAccountsObserved < minPaidAccounts || plan.runsObserved < minRuns;
    const status = !evidenceComplete
      ? 'blocked' as const
      : collecting
        ? 'collecting' as const
        : contributionMarginPercent != null && contributionMarginPercent >= targetMarginPercent
          ? 'pass' as const
          : 'watch' as const;
    const reason = !evidenceComplete
      ? 'Resolve capped or unattributed plan evidence before using this margin.'
      : collecting
        ? `Collect ${Math.max(0, minRuns - plan.runsObserved)} more runs and ${Math.max(0, minPaidAccounts - paidAccountsObserved)} more paid accounts.`
        : contributionMarginPercent == null
          ? 'No attributed net cash is available for a margin calculation.'
          : contributionMarginPercent >= targetMarginPercent
            ? `Observed provider-cost margin clears the ${targetMarginPercent}% target.`
            : `Observed provider-cost margin is below the ${targetMarginPercent}% target.`;

    return {
      plan: plan.plan,
      planLabel: plan.planLabel,
      status,
      runsObserved: plan.runsObserved,
      usefulRunsObserved: plan.usefulRunsObserved,
      paidAccountsObserved,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)),
      grossCashObservedUsd: Number((plan.grossCashCents / 100).toFixed(2)),
      refundedUsd: Number((plan.refundedCents / 100).toFixed(2)),
      netCashObservedUsd: Number(netCashUsd.toFixed(2)),
      contributionMarginPercent,
      reason,
    };
  });
  const statuses = byPlan.map(plan => plan.status);
  const status = !evidenceComplete
    ? 'blocked' as const
    : statuses.includes('collecting')
      ? 'collecting' as const
      : statuses.includes('watch')
        ? 'watch' as const
        : 'pass' as const;

  return {
    version: SONA_PLAN_OBSERVED_ECONOMICS_VERSION,
    scope: 'Same-period attributed Stripe cash and estimated Sona provider cost; not recognized revenue or total gross margin.',
    status,
    readyForPricingDecision: status === 'pass' || status === 'watch',
    evidenceComplete,
    targetMarginPercent,
    minPaidAccounts,
    minRuns,
    sampleCapped: Boolean(options.sampleCapped),
    unresolved,
    freeRunsObserved,
    freeEstimatedCostUsd: Number((freeEstimatedCostMicros / 1_000_000).toFixed(4)),
    plans: byPlan,
  };
}

export async function getSonaEconomicsSnapshot(
  db: Firestore,
  options: { windowDays?: number; sampleLimit?: number } = {},
) {
  const windowDays = Math.max(1, Math.min(90, boundedCount(options.windowDays || 30)));
  const sampleLimit = Math.max(50, Math.min(2_000, boundedCount(options.sampleLimit || 1_000)));
  const now = Date.now();
  const since = new Date(now - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const [
    eventSnapshot,
    accountSnapshot,
    paidAccountSnapshot,
    renewalPaymentSnapshot,
    renewalInvoiceSnapshot,
    renewalPaidAccountSnapshot,
  ] = await Promise.all([
    db.collection(SONA_ECONOMICS_COLLECTION)
      .where('occurredAt', '>=', since)
      .orderBy('occurredAt', 'desc')
      .limit(sampleLimit)
      .get(),
    db.collection(SONA_ECONOMICS_ACCOUNTS_COLLECTION)
      .where('firstUsefulAt', '>=', since)
      .orderBy('firstUsefulAt', 'desc')
      .limit(sampleLimit)
      .get(),
    db.collection(SONA_ECONOMICS_ACCOUNTS_COLLECTION)
      .where('firstPaidAt', '>=', since)
      .orderBy('firstPaidAt', 'desc')
      .limit(sampleLimit)
      .get(),
    db.collection(SONA_ECONOMICS_PAYMENTS_COLLECTION)
      .limit(sampleLimit + 1)
      .get(),
    db.collection(SONA_ECONOMICS_COLLECTION)
      .where('eventType', '==', 'invoice_paid')
      .limit(sampleLimit + 1)
      .get(),
    db.collection(SONA_ECONOMICS_ACCOUNTS_COLLECTION)
      .where('paidInvoiceCount', '>', 0)
      .limit(sampleLimit + 1)
      .get(),
  ]);
  const events = eventSnapshot.docs.map(doc => doc.data() as SonaEconomicsEvent);
  const accountSummaries = accountSnapshot.docs.map(doc => doc.data() as SonaEconomicsAccountSummary);
  const paidAccountSummaries = paidAccountSnapshot.docs.map(doc => doc.data() as SonaEconomicsAccountSummary);
  const renewalPaymentSampleCapped = renewalPaymentSnapshot.docs.length > sampleLimit;
  const renewalPaymentRecords: Array<Record<string, unknown>> = renewalPaymentSnapshot.docs.slice(0, sampleLimit).map(doc => ({
    ...doc.data(),
    paymentReferenceId: doc.id,
  }));
  const renewalInvoiceSampleCapped = renewalInvoiceSnapshot.docs.length > sampleLimit;
  const renewalInvoiceRecords: Array<Record<string, unknown>> = renewalInvoiceSnapshot.docs
    .slice(0, sampleLimit)
    .map(doc => doc.data());
  const renewalPaidAccountSampleCapped = renewalPaidAccountSnapshot.docs.length > sampleLimit;
  const renewalPaidAccountSummaries = renewalPaidAccountSnapshot.docs
    .slice(0, sampleLimit)
    .map(doc => ({ ...doc.data(), uid: doc.data().uid || doc.id } as SonaEconomicsAccountSummary));
  const renewalAccountUids = [...new Set([
    ...renewalPaymentRecords.flatMap(payment => (
      typeof payment.uid === 'string' && payment.uid ? [payment.uid] : []
    )),
    ...renewalInvoiceRecords.flatMap(invoice => (
      typeof invoice.uid === 'string' && invoice.uid ? [invoice.uid] : []
    )),
    ...renewalPaidAccountSummaries.map(account => account.uid),
  ])];
  const renewalAccountRefs = renewalAccountUids.map(uid => (
    db.collection(SONA_ECONOMICS_ACCOUNTS_COLLECTION).doc(uid)
  ));
  const renewalAccountSnapshots = renewalAccountRefs.length > 0
    ? await db.getAll(...renewalAccountRefs)
    : [];
  const renewalAccountSummaries = renewalAccountSnapshots.map((doc, index) => ({
    ...(doc.exists ? doc.data() : {}),
    uid: typeof doc.data()?.uid === 'string' ? doc.data()!.uid : renewalAccountUids[index],
  } as SonaEconomicsAccountSummary));
  return summarizeSonaEconomicsEvents(events, {
    windowDays,
    sampleLimit,
    accountSummaries,
    accountSampleCapped: accountSummaries.length >= sampleLimit,
    paidAccountSummaries,
    paidAccountSampleCapped: paidAccountSummaries.length >= sampleLimit,
    renewalAccountSummaries,
    renewalPaymentRecords,
    renewalPaymentSampleCapped,
    renewalInvoiceRecords,
    renewalInvoiceSampleCapped: renewalInvoiceSampleCapped || renewalPaidAccountSampleCapped,
  });
}
