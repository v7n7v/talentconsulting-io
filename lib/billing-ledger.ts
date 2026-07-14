import Stripe from 'stripe';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  resolveStripeFirebaseUid,
  selectAuthoritativeStripeSubscription,
} from '@/lib/stripe-account-selection';
import {
  BILLING_EVIDENCE_VERSION,
  buildSubscriptionBillingEvidence,
} from '@/lib/billing-metrics';
import { decideStripeEventProcessingClaim } from '@/lib/billing/stripe-subscription-contract';
import { resolveStripePlanFromConfiguredPrice } from '@/lib/billing/stripe-subscription-contract';

export type LedgerType =
  | 'checkout'
  | 'invoice_paid'
  | 'invoice_failed'
  | 'invoice_finalized'
  | 'subscription_updated'
  | 'subscription_canceled'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'tax_collected'
  | 'tax_refunded'
  | 'refund'
  | 'refund_failed'
  | 'dispute'
  | 'fee'
  | 'adjustment'
  | 'manual_correction';

export interface BillingLedgerEntry {
  entryId: string;
  accountId: string;
  uid?: string | null;
  stripeCustomerId?: string | null;
  stripeObjectId?: string | null;
  stripeEventId?: string | null;
  type: LedgerType;
  status: string;
  amount: number;
  currency: string;
  taxAmount?: number;
  feeAmount?: number | null;
  netAmount?: number | null;
  occurredAt: string;
  postedAt: string;
  source: 'stripe_webhook' | 'admin_action' | 'reconciliation' | 'system';
  description: string;
  links?: Record<string, string>;
  metadata?: Record<string, unknown>;
  reversalOf?: string | null;
  adjustsEntryId?: string | null;
}

export interface BillingAccountRecord {
  accountId: string;
  uid?: string | null;
  email?: string | null;
  name?: string | null;
  stripeCustomerId: string;
  stripeSubscriptionId?: string | null;
  stripeLatestInvoiceId?: string | null;
  plan?: string | null;
  status?: string | null;
  billingInterval?: 'month' | 'year' | null;
  recurringAmountCents?: number | null;
  recurringCurrency?: string | null;
  stripePriceId?: string | null;
  billingEvidenceStatus?: 'complete' | 'incomplete' | null;
  billingEvidenceMissing?: string[];
  billingEvidenceSyncedAt?: string | null;
  currentPeriodEnd?: string | null;
  taxStatus?: string | null;
  riskFlags: string[];
  notes?: string | null;
  stripeLinks: Record<string, string>;
  updatedAt: string;
  createdAt?: string;
}

export interface BillingReconciliationPreview {
  accountId: string;
  stripeCustomerId: string;
  status: 'ready' | 'blocked' | 'verified';
  evidenceStatus: 'complete' | 'incomplete';
  missing: string[];
  proposed: {
    stripeSubscriptionId?: string;
    plan?: string;
    billingInterval?: 'month' | 'year';
    recurringAmountCents?: number;
    recurringCurrency?: string;
    stripePriceId?: string;
  };
}

export interface RefundCaseRecord {
  caseId: string;
  accountId: string;
  uid?: string | null;
  email?: string | null;
  stripeCustomerId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  stripeInvoiceId?: string | null;
  stripeRefundId?: string | null;
  amount: number;
  currency: string;
  reason: string;
  internalNote: string;
  customerMessage: string;
  status: 'requested' | 'reviewed' | 'approved' | 'submitted_to_stripe' | 'succeeded' | 'failed' | 'denied';
  riskFlags: string[];
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  error?: string | null;
  postSubmitWarnings?: string[];
  history: Array<{ at: string; by: string; action: string; note?: string }>;
  stripeLinks?: Record<string, string>;
}

export interface DisputeCaseRecord {
  caseId: string;
  accountId: string;
  uid?: string | null;
  email?: string | null;
  stripeCustomerId?: string | null;
  stripeDisputeId: string;
  stripeChargeId?: string | null;
  amount: number;
  currency: string;
  reason?: string | null;
  status: string;
  dueBy?: string | null;
  evidenceChecklist: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  stripeLinks: Record<string, string>;
}

export const BILLING_COLLECTIONS = {
  accounts: 'billing_accounts',
  ledger: 'finance_ledger',
  stripeEvents: 'stripe_events',
  refunds: 'refund_cases',
  disputes: 'dispute_cases',
  communications: 'billing_communications',
} as const;

export function stripeDashboardUrl(kind: 'customers' | 'subscriptions' | 'invoices' | 'payments' | 'refunds' | 'disputes' | 'balance' | 'tax', id?: string | null) {
  const base = process.env.STRIPE_LIVE_MODE === 'true' ? 'https://dashboard.stripe.com' : 'https://dashboard.stripe.com/test';
  if (kind === 'tax') return `${base}/tax/reports`;
  if (!id) return base;
  if (kind === 'balance') return `${base}/balance/transactions/${id}`;
  return `${base}/${kind}/${id}`;
}

export function toIso(seconds?: number | null) {
  return seconds ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

function accountIdFor(customerId?: string | null, uid?: string | null) {
  return customerId || (uid ? `uid_${uid}` : 'unknown_customer');
}

function asStringId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'id' in value) return String((value as { id?: string }).id || '');
  return null;
}

async function findLedgerAccountByStripeObject(paymentIntentId?: string | null, chargeId?: string | null) {
  const db = getAdminDb();
  if (paymentIntentId) {
    const snap = await db.collection(BILLING_COLLECTIONS.ledger).where('stripeObjectId', '==', paymentIntentId).limit(1).get();
    if (!snap.empty) {
      const entry = snap.docs[0].data() as BillingLedgerEntry;
      return {
        accountId: entry.accountId,
        uid: entry.uid || null,
        stripeCustomerId: entry.stripeCustomerId || null,
      };
    }
  }

  if (chargeId) {
    const snap = await db.collection(BILLING_COLLECTIONS.ledger).where('metadata.chargeId', '==', chargeId).limit(1).get();
    if (!snap.empty) {
      const entry = snap.docs[0].data() as BillingLedgerEntry;
      return {
        accountId: entry.accountId,
        uid: entry.uid || null,
        stripeCustomerId: entry.stripeCustomerId || null,
      };
    }
  }

  return null;
}

function firstLinePrice(subscription?: Stripe.Subscription | null) {
  return subscription?.items?.data?.[0]?.price;
}

export function extractInvoiceTaxAmount(invoice: Stripe.Invoice) {
  const totalTaxAmounts = (invoice as any).total_tax_amounts as Array<{ amount?: number }> | undefined;
  if (Array.isArray(totalTaxAmounts)) {
    return totalTaxAmounts.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }
  return Number((invoice as any).tax || 0);
}

export async function recordStripeEvent(event: Stripe.Event) {
  const db = getAdminDb();
  const ref = db.collection(BILLING_COLLECTIONS.stripeEvents).doc(event.id);
  let created = false;
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists) return;
    created = true;
    tx.set(ref, {
      eventId: event.id,
      type: event.type,
      livemode: event.livemode,
      apiVersion: event.api_version || null,
      createdAt: toIso(event.created),
      receivedAt: new Date().toISOString(),
      processedAt: null,
      processingStatus: 'received',
      raw: JSON.parse(JSON.stringify(event)),
    });
  });
  return created;
}

export async function claimStripeEventProcessing(event: Stripe.Event) {
  const db = getAdminDb();
  const ref = db.collection(BILLING_COLLECTIONS.stripeEvents).doc(event.id);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const current = snap.data() || {};
    const decision = decideStripeEventProcessingClaim(snap.exists ? current : null);
    if (!decision.acquire) return decision;
    const now = new Date();
    tx.set(ref, {
      eventId: event.id,
      type: event.type,
      livemode: event.livemode,
      apiVersion: event.api_version || null,
      createdAt: toIso(event.created),
      receivedAt: current.receivedAt || now.toISOString(),
      processingStatus: 'processing',
      processingLeaseUntil: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
      processingAttemptCount: Number(current.processingAttemptCount || 0) + 1,
      processedAt: null,
      error: null,
      raw: current.raw || JSON.parse(JSON.stringify(event)),
    }, { merge: true });
    return decision;
  });
}

export async function markStripeEventProcessed(eventId: string, status: 'processed' | 'ignored' | 'failed', error?: string) {
  await getAdminDb().collection(BILLING_COLLECTIONS.stripeEvents).doc(eventId).set({
    processingStatus: status,
    processingLeaseUntil: null,
    processedAt: new Date().toISOString(),
    error: error || null,
  }, { merge: true });
}

export function buildBillingAccountRecord(
  input: Partial<BillingAccountRecord> & { stripeCustomerId?: string | null; uid?: string | null },
  existing: Record<string, unknown> = {},
  now = new Date().toISOString(),
) {
  const accountId = input.accountId || accountIdFor(input.stripeCustomerId, input.uid);
  const stripeLinks: Record<string, string> = {
    ...((existing.stripeLinks as Record<string, string> | undefined) || {}),
    ...(input.stripeLinks || {}),
    ...(input.stripeCustomerId ? { customer: stripeDashboardUrl('customers', input.stripeCustomerId) } : {}),
    ...(input.stripeSubscriptionId ? { subscription: stripeDashboardUrl('subscriptions', input.stripeSubscriptionId) } : {}),
    ...(input.stripeLatestInvoiceId ? { latestInvoice: stripeDashboardUrl('invoices', input.stripeLatestInvoiceId) } : {}),
  };
  const record: BillingAccountRecord = {
    ...(existing as Partial<BillingAccountRecord>),
    accountId,
    stripeCustomerId: input.stripeCustomerId || String(existing.stripeCustomerId || accountId),
    riskFlags: input.riskFlags || (Array.isArray(existing.riskFlags) ? existing.riskFlags as string[] : []),
    stripeLinks,
    updatedAt: now,
    createdAt: typeof existing.createdAt === 'string' ? existing.createdAt : input.createdAt || now,
    ...(input.uid !== undefined ? { uid: input.uid } : {}),
    ...(input.email !== undefined ? { email: input.email ? input.email.toLowerCase() : null } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.stripeSubscriptionId !== undefined ? { stripeSubscriptionId: input.stripeSubscriptionId } : {}),
    ...(input.stripeLatestInvoiceId !== undefined ? { stripeLatestInvoiceId: input.stripeLatestInvoiceId } : {}),
    ...(input.plan !== undefined ? { plan: input.plan } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.billingInterval !== undefined ? { billingInterval: input.billingInterval } : {}),
    ...(input.recurringAmountCents !== undefined ? { recurringAmountCents: input.recurringAmountCents } : {}),
    ...(input.recurringCurrency !== undefined ? { recurringCurrency: input.recurringCurrency } : {}),
    ...(input.stripePriceId !== undefined ? { stripePriceId: input.stripePriceId } : {}),
    ...(input.billingEvidenceStatus !== undefined ? { billingEvidenceStatus: input.billingEvidenceStatus } : {}),
    ...(input.billingEvidenceMissing !== undefined ? { billingEvidenceMissing: input.billingEvidenceMissing } : {}),
    ...(input.billingEvidenceSyncedAt !== undefined ? { billingEvidenceSyncedAt: input.billingEvidenceSyncedAt } : {}),
    ...(input.currentPeriodEnd !== undefined ? { currentPeriodEnd: input.currentPeriodEnd } : {}),
    ...(input.taxStatus !== undefined ? { taxStatus: input.taxStatus } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };

  return record;
}

export function buildBillingReconciliationPreview(
  account: BillingAccountRecord,
  customer: Stripe.Customer | Stripe.DeletedCustomer,
  subscriptions: Stripe.Subscription[] = [],
  previewedAt = new Date().toISOString(),
): BillingReconciliationPreview {
  if (customer.deleted) {
    return {
      accountId: account.accountId,
      stripeCustomerId: customer.id,
      status: 'blocked',
      evidenceStatus: 'incomplete',
      missing: ['stripe_customer_deleted'],
      proposed: {},
    };
  }

  const subscription = selectAuthoritativeStripeSubscription(subscriptions);
  const identity = resolveStripeFirebaseUid({
    customerUid: customer.metadata?.firebaseUid || null,
    subscriptionUid: subscription?.metadata?.firebaseUid || null,
  });
  if (identity.conflict || (account.uid && identity.uid && account.uid !== identity.uid)) {
    return {
      accountId: account.accountId,
      stripeCustomerId: customer.id,
      status: 'blocked',
      evidenceStatus: 'incomplete',
      missing: ['ownership_conflict'],
      proposed: {},
    };
  }
  if (!subscription) {
    return {
      accountId: account.accountId,
      stripeCustomerId: customer.id,
      status: 'blocked',
      evidenceStatus: 'incomplete',
      missing: ['subscription'],
      proposed: {},
    };
  }

  const price = firstLinePrice(subscription);
  const plan = subscription.metadata?.plan || price?.nickname || price?.lookup_key || null;
  const resolvedUid = account.uid ?? identity.uid;
  const evidence = buildSubscriptionBillingEvidence({
    ownerUid: resolvedUid,
    stripeCustomerId: customer.id,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    plan,
    interval: price?.recurring?.interval,
    amountCents: price?.unit_amount,
    currency: price?.currency,
    stripePriceId: price?.id,
    currentPeriodEnd: (subscription as any).current_period_end
      ? toIso((subscription as any).current_period_end)
      : null,
    syncedAt: previewedAt,
  });
  const proposed: BillingReconciliationPreview['proposed'] = {
    stripeSubscriptionId: subscription.id,
    ...(evidence.patch.plan ? { plan: String(evidence.patch.plan) } : {}),
    ...(evidence.patch.billingInterval === 'month' || evidence.patch.billingInterval === 'year'
      ? { billingInterval: evidence.patch.billingInterval }
      : {}),
    ...(typeof evidence.patch.recurringAmountCents === 'number'
      ? { recurringAmountCents: evidence.patch.recurringAmountCents }
      : {}),
    ...(typeof evidence.patch.recurringCurrency === 'string'
      ? { recurringCurrency: evidence.patch.recurringCurrency }
      : {}),
    ...(typeof evidence.patch.stripePriceId === 'string'
      ? { stripePriceId: evidence.patch.stripePriceId }
      : {}),
  };

  return {
    accountId: account.accountId,
    stripeCustomerId: customer.id,
    status: evidence.complete
      ? account.billingEvidenceStatus === 'complete' ? 'verified' : 'ready'
      : 'blocked',
    evidenceStatus: evidence.complete ? 'complete' : 'incomplete',
    missing: evidence.missing,
    proposed,
  };
}

export async function previewCustomerBillingEvidence(
  stripe: Stripe,
  account: BillingAccountRecord,
  previewedAt = new Date().toISOString(),
) {
  const customer = await stripe.customers.retrieve(account.stripeCustomerId);
  if (customer.deleted) {
    return buildBillingReconciliationPreview(account, customer, [], previewedAt);
  }
  const subscriptions = await stripe.subscriptions.list({
    customer: customer.id,
    limit: 10,
    status: 'all',
  });
  return buildBillingReconciliationPreview(account, customer, subscriptions.data, previewedAt);
}

export async function upsertBillingAccount(input: Partial<BillingAccountRecord> & { stripeCustomerId?: string | null; uid?: string | null }) {
  const accountId = input.accountId || accountIdFor(input.stripeCustomerId, input.uid);
  const ref = getAdminDb().collection(BILLING_COLLECTIONS.accounts).doc(accountId);
  const existingSnap = await ref.get();
  const existing = existingSnap.exists ? existingSnap.data() || {} : {};
  const record = buildBillingAccountRecord(input, existing);

  await ref.set(record, { merge: true });
  return record;
}

export async function appendLedgerEntry(input: Omit<BillingLedgerEntry, 'entryId' | 'postedAt'> & { entryId?: string; postedAt?: string }) {
  const db = getAdminDb();
  const postedAt = input.postedAt || new Date().toISOString();
  const baseId = [
    input.stripeEventId || input.source,
    input.type,
    input.stripeObjectId || input.accountId,
    input.status,
  ].filter(Boolean).join('_').replace(/[^a-zA-Z0-9_:-]/g, '_');
  const entryId = input.entryId || baseId || db.collection(BILLING_COLLECTIONS.ledger).doc().id;
  const record: BillingLedgerEntry = {
    ...input,
    entryId,
    postedAt,
    currency: (input.currency || 'usd').toLowerCase(),
    amount: Number(input.amount || 0),
    taxAmount: Number(input.taxAmount || 0),
  };
  await db.collection(BILLING_COLLECTIONS.ledger).doc(entryId).set(record, { merge: false }).catch(async error => {
    if (String(error?.message || '').includes('ALREADY_EXISTS') || Number(error?.code) === 6) return;
    const existing = await db.collection(BILLING_COLLECTIONS.ledger).doc(entryId).get();
    if (!existing.exists) throw error;
  });
  return record;
}

export async function writeBillingAuditLog(action: string, by: string, changes: Record<string, unknown>) {
  await getAdminDb().collection('settings').doc('admin_log').collection('entries').add({
    action,
    changes,
    by,
    at: new Date().toISOString(),
  });
}

export async function logBillingCommunication(input: {
  accountId: string;
  uid?: string | null;
  email?: string | null;
  subject: string;
  bodyPreview: string;
  status?: string;
  template: string;
  sentBy: string;
  providerMessageId?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}) {
  const record = {
    type: 'billing_communication',
    direction: 'outbound',
    accountId: input.accountId,
    uid: input.uid || null,
    email: input.email?.toLowerCase() || null,
    subject: input.subject,
    bodyPreview: input.bodyPreview.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 700),
    status: input.status || 'sent',
    template: input.template,
    sentBy: input.sentBy,
    providerMessageId: input.providerMessageId || null,
    error: input.error || null,
    metadata: input.metadata || {},
    createdAt: new Date().toISOString(),
  };
  const db = getAdminDb();
  const communicationId = input.idempotencyKey
    ? createHash('sha256').update(input.idempotencyKey).digest('hex')
    : null;
  await Promise.allSettled([
    communicationId
      ? db.collection(BILLING_COLLECTIONS.communications).doc(communicationId).set(record, { merge: true })
      : db.collection(BILLING_COLLECTIONS.communications).add(record),
    input.uid
      ? communicationId
        ? db.collection('users').doc(input.uid).collection('communications').doc(communicationId).set(record, { merge: true })
        : db.collection('users').doc(input.uid).collection('communications').add(record)
      : Promise.resolve(),
  ]);
  return record;
}

export async function syncCustomerAccount(stripe: Stripe, customerId: string, extras: Partial<BillingAccountRecord> = {}) {
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  if (customer.deleted) return null;
  const subscriptions = await stripe.subscriptions.list({ customer: customerId, limit: 10, status: 'all' });
  const subscription = selectAuthoritativeStripeSubscription(subscriptions.data);
  const price = firstLinePrice(subscription);
  const plan = subscription ? resolveStripePlanFromConfiguredPrice({
    priceId: price?.id,
    metadataPlan: subscription.metadata?.plan,
    proPriceIds: [process.env.STRIPE_PRO_PRICE_ID, process.env.STRIPE_PRO_ANNUAL_PRICE_ID],
    studioPriceIds: [process.env.STRIPE_STUDIO_PRICE_ID, process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID],
  }).plan : null;
  const billingInterval = price?.recurring?.interval === 'month' || price?.recurring?.interval === 'year'
    ? price.recurring.interval
    : null;
  const identity = resolveStripeFirebaseUid({
    customerUid: customer.metadata?.firebaseUid || null,
    subscriptionUid: subscription?.metadata?.firebaseUid || null,
  });
  if (identity.conflict || (extras.uid && identity.uid && extras.uid !== identity.uid)) {
    throw new Error(`Stripe customer ${customer.id} has conflicting Firebase ownership metadata.`);
  }
  const resolvedUid = extras.uid ?? identity.uid;
  const evidence = subscription ? buildSubscriptionBillingEvidence({
    ownerUid: resolvedUid,
    stripeCustomerId: customer.id,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    plan,
    interval: price?.recurring?.interval,
    amountCents: price?.unit_amount,
    currency: price?.currency,
    stripePriceId: price?.id,
    currentPeriodEnd: (subscription as any).current_period_end ? toIso((subscription as any).current_period_end) : null,
  }) : null;
  const evidenceSyncedAt = evidence
    ? String(evidence.patch.billingEvidenceSyncedAt)
    : new Date().toISOString();
  const evidenceMissing = evidence?.missing || ['subscription'];
  const account = await upsertBillingAccount({
    ...extras,
    ...(resolvedUid ? { uid: resolvedUid } : {}),
    email: extras.email ?? customer.email ?? null,
    name: extras.name ?? customer.name ?? null,
    stripeCustomerId: customer.id,
    ...(subscription ? {
      stripeSubscriptionId: subscription.id,
      stripeLatestInvoiceId: asStringId(subscription.latest_invoice) || extras.stripeLatestInvoiceId || null,
      ...(plan ? { plan } : {}),
      status: subscription.status,
      currentPeriodEnd: (subscription as any).current_period_end ? toIso((subscription as any).current_period_end) : null,
    } : {}),
    ...(price ? {
      billingInterval,
      recurringAmountCents: price.unit_amount,
      recurringCurrency: price.currency,
      stripePriceId: price.id,
    } : {}),
    billingEvidenceStatus: evidence?.complete ? 'complete' : 'incomplete',
    billingEvidenceMissing: evidenceMissing,
    billingEvidenceSyncedAt: evidenceSyncedAt,
    taxStatus: (customer as any).tax_exempt || null,
  });
  if (resolvedUid) {
    const userEvidencePatch = subscription && evidence ? evidence.patch : {
      billingEvidenceVersion: BILLING_EVIDENCE_VERSION,
      billingEvidenceStatus: 'incomplete',
      billingEvidenceMissing: evidenceMissing,
      billingEvidenceSyncedAt: evidenceSyncedAt,
      billingEvidenceSource: 'stripe_sync',
      updatedAt: evidenceSyncedAt,
    };
    await getAdminDb()
      .collection('users')
      .doc(resolvedUid)
      .collection('subscription')
      .doc('current')
      .set(userEvidencePatch, { merge: true });
  }
  return account;
}

export async function postInvoiceToLedger(
  invoice: Stripe.Invoice,
  eventId?: string,
  source: BillingLedgerEntry['source'] = 'stripe_webhook',
  typeOverride?: Extract<LedgerType, 'invoice_paid' | 'invoice_failed' | 'invoice_finalized'>,
) {
  const customerId = asStringId(invoice.customer);
  const account = customerId ? await upsertBillingAccount({
    stripeCustomerId: customerId,
    email: (invoice as any).customer_email || null,
    stripeSubscriptionId: asStringId((invoice as any).subscription),
    stripeLatestInvoiceId: invoice.id,
  }) : null;
  const accountId = account?.accountId || accountIdFor(customerId);
  const paid = invoice.status === 'paid' || invoice.amount_paid > 0;
  const type: LedgerType = typeOverride || (paid ? 'invoice_paid' : invoice.status === 'open' ? 'invoice_finalized' : 'invoice_failed');
  const taxAmount = extractInvoiceTaxAmount(invoice);
  const invoiceLink = stripeDashboardUrl('invoices', invoice.id);
  const chargeId = asStringId((invoice as any).charge);
  const common = {
    accountId,
    uid: account?.uid || null,
    stripeCustomerId: customerId,
    stripeObjectId: invoice.id,
    stripeEventId: eventId || null,
    status: invoice.status || (paid ? 'paid' : 'failed'),
    amount: paid ? invoice.amount_paid : invoice.amount_due,
    currency: invoice.currency,
    occurredAt: toIso(invoice.created),
    source,
    links: {
      invoice: invoiceLink,
      ...(chargeId ? { payment: stripeDashboardUrl('payments', chargeId) } : {}),
    },
    metadata: { hostedInvoiceUrl: invoice.hosted_invoice_url || null, invoiceNumber: invoice.number || null },
  };
  await appendLedgerEntry({ ...common, type, taxAmount, description: paid ? 'Invoice paid in Stripe' : 'Invoice event from Stripe' });
  if (taxAmount > 0) {
    await appendLedgerEntry({
      ...common,
      type: 'tax_collected',
      amount: taxAmount,
      taxAmount,
      description: 'Tax collected by Stripe Tax',
    });
  }
}

export async function postRefundToLedger(refund: Stripe.Refund, eventId?: string, source: BillingLedgerEntry['source'] = 'stripe_webhook') {
  const chargeId = asStringId(refund.charge);
  const paymentIntentId = asStringId((refund as any).payment_intent);
  const metadata = (refund.metadata || {}) as Record<string, string | undefined>;
  const customerId = asStringId((refund as any).customer) || metadata.stripeCustomerId || null;
  const ledgerAccount = await findLedgerAccountByStripeObject(paymentIntentId, chargeId);
  const account = await upsertBillingAccount({
    accountId: metadata.accountId || ledgerAccount?.accountId,
    stripeCustomerId: customerId || ledgerAccount?.stripeCustomerId || undefined,
    uid: metadata.firebaseUid || ledgerAccount?.uid || null,
  });
  const type: LedgerType = refund.status === 'failed' || refund.status === 'canceled' ? 'refund_failed' : 'refund';
  await appendLedgerEntry({
    accountId: account.accountId,
    uid: account.uid || null,
    stripeCustomerId: customerId,
    stripeObjectId: refund.id,
    stripeEventId: eventId || null,
    type,
    status: refund.status || 'pending',
    amount: -Math.abs(refund.amount || 0),
    currency: refund.currency || 'usd',
    taxAmount: 0,
    occurredAt: toIso(refund.created),
    source,
    description: refund.status === 'succeeded' ? 'Refund processed by Stripe' : 'Refund update from Stripe',
    links: {
      refund: stripeDashboardUrl('refunds', refund.id),
      ...(chargeId ? { payment: stripeDashboardUrl('payments', chargeId) } : {}),
    },
    metadata: { reason: refund.reason || null, chargeId, paymentIntentId },
  });
  await updateRefundCaseFromStripe(refund);
  return { account, ledgerType: type };
}

export async function updateRefundCaseFromStripe(refund: Stripe.Refund) {
  const db = getAdminDb();
  const snap = await db.collection(BILLING_COLLECTIONS.refunds).where('stripeRefundId', '==', refund.id).limit(1).get();
  if (snap.empty) return;
  const status = refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' ? 'failed' : 'submitted_to_stripe';
  await snap.docs[0].ref.set({
    status,
    updatedAt: new Date().toISOString(),
    history: FieldValue.arrayUnion({ at: new Date().toISOString(), by: 'stripe', action: `refund_${refund.status || 'updated'}` }),
    stripeLinks: {
      refund: stripeDashboardUrl('refunds', refund.id),
      ...(asStringId(refund.charge) ? { payment: stripeDashboardUrl('payments', asStringId(refund.charge)) } : {}),
    },
  }, { merge: true });
}

export async function postDisputeToLedger(dispute: Stripe.Dispute, eventId?: string, source: BillingLedgerEntry['source'] = 'stripe_webhook') {
  const chargeId = asStringId(dispute.charge);
  const paymentIntentId = asStringId((dispute as any).payment_intent);
  const customerId = asStringId((dispute as any).customer);
  const ledgerAccount = await findLedgerAccountByStripeObject(paymentIntentId, chargeId);
  const account = await upsertBillingAccount({
    accountId: ledgerAccount?.accountId,
    stripeCustomerId: customerId || ledgerAccount?.stripeCustomerId || undefined,
    uid: ledgerAccount?.uid || null,
  });
  await appendLedgerEntry({
    accountId: account.accountId,
    uid: account.uid || null,
    stripeCustomerId: customerId,
    stripeObjectId: dispute.id,
    stripeEventId: eventId || null,
    type: 'dispute',
    status: dispute.status,
    amount: -Math.abs(dispute.amount || 0),
    currency: dispute.currency || 'usd',
    taxAmount: 0,
    occurredAt: toIso(dispute.created),
    source,
    description: `Stripe dispute ${dispute.status}`,
    links: {
      dispute: stripeDashboardUrl('disputes', dispute.id),
      ...(chargeId ? { payment: stripeDashboardUrl('payments', chargeId) } : {}),
    },
    metadata: { reason: dispute.reason || null, chargeId, paymentIntentId },
  });
  await upsertDisputeCase(dispute, account);
}

export async function upsertDisputeCase(dispute: Stripe.Dispute, account?: BillingAccountRecord) {
  const customerId = asStringId((dispute as any).customer) || account?.stripeCustomerId || null;
  const accountRecord = account || await upsertBillingAccount({ stripeCustomerId: customerId || undefined });
  const dueBy = (dispute as any).evidence_details?.due_by ? toIso((dispute as any).evidence_details.due_by) : null;
  const record: Partial<DisputeCaseRecord> = {
    caseId: dispute.id,
    accountId: accountRecord.accountId,
    uid: accountRecord.uid || null,
    email: accountRecord.email || null,
    stripeCustomerId: customerId,
    stripeDisputeId: dispute.id,
    stripeChargeId: asStringId(dispute.charge),
    amount: dispute.amount || 0,
    currency: dispute.currency || 'usd',
    reason: dispute.reason || null,
    status: dispute.status,
    dueBy,
    evidenceChecklist: [
      'Customer identity and subscription timeline',
      'Invoice and payment receipt',
      'Usage or account activity context',
      'Refund and cancellation history',
      'Customer communication history',
    ],
    updatedAt: new Date().toISOString(),
    createdAt: toIso(dispute.created),
    stripeLinks: {
      dispute: stripeDashboardUrl('disputes', dispute.id),
      ...(asStringId(dispute.charge) ? { payment: stripeDashboardUrl('payments', asStringId(dispute.charge)) } : {}),
    },
  };
  await getAdminDb().collection(BILLING_COLLECTIONS.disputes).doc(dispute.id).set(record, { merge: true });
}

export async function listBillingAccounts(limit = 50) {
  const snap = await getAdminDb().collection(BILLING_COLLECTIONS.accounts).orderBy('updatedAt', 'desc').limit(limit).get();
  return snap.docs.map(doc => doc.data());
}

export async function listLedger(params: { limit?: number; accountId?: string; type?: string } = {}) {
  let query: FirebaseFirestore.Query = getAdminDb().collection(BILLING_COLLECTIONS.ledger);
  if (params.accountId) query = query.where('accountId', '==', params.accountId);
  if (params.type) query = query.where('type', '==', params.type);
  const snap = await query.orderBy('occurredAt', 'desc').limit(params.limit || 100).get();
  return snap.docs.map(doc => doc.data());
}

export async function listRefundCases(limit = 50) {
  const snap = await getAdminDb().collection(BILLING_COLLECTIONS.refunds).orderBy('updatedAt', 'desc').limit(limit).get();
  return snap.docs.map(doc => doc.data());
}

export async function listDisputeCases(limit = 50) {
  const snap = await getAdminDb().collection(BILLING_COLLECTIONS.disputes).orderBy('updatedAt', 'desc').limit(limit).get();
  return snap.docs.map(doc => doc.data());
}

export async function getBillingSummary() {
  const [ledgerSnap, refundSnap, disputeSnap, commSnap] = await Promise.all([
    getAdminDb().collection(BILLING_COLLECTIONS.ledger).orderBy('occurredAt', 'desc').limit(250).get(),
    getAdminDb().collection(BILLING_COLLECTIONS.refunds).orderBy('updatedAt', 'desc').limit(50).get(),
    getAdminDb().collection(BILLING_COLLECTIONS.disputes).orderBy('updatedAt', 'desc').limit(50).get(),
    getAdminDb().collection(BILLING_COLLECTIONS.communications).orderBy('createdAt', 'desc').limit(20).get(),
  ]);
  const ledger = ledgerSnap.docs.map(doc => doc.data() as BillingLedgerEntry);
  const invoiceRevenue = ledger
    .filter(e => e.type === 'invoice_paid')
    .reduce((sum, e) => sum + Math.max(0, e.amount), 0);
  const mirroredPaymentEvents = ledger.filter(e => e.type === 'checkout' || e.type === 'payment_succeeded').length;
  const refunds = Math.abs(ledger.filter(e => e.type === 'refund').reduce((sum, e) => sum + Math.min(0, e.amount), 0));
  const disputes = Math.abs(ledger.filter(e => e.type === 'dispute').reduce((sum, e) => sum + Math.min(0, e.amount), 0));
  const taxCollected = ledger.filter(e => e.type === 'tax_collected').reduce((sum, e) => sum + Math.max(0, e.amount || e.taxAmount || 0), 0);
  const taxRefunded = Math.abs(ledger.filter(e => e.type === 'tax_refunded').reduce((sum, e) => sum + Math.min(0, e.amount), 0));
  const failedPayments = ledger.filter(e => ['invoice_failed', 'payment_failed'].includes(e.type)).length;
  return {
    generatedAt: new Date().toISOString(),
    grossRevenue: invoiceRevenue,
    netRevenue: invoiceRevenue - refunds - disputes,
    refunds,
    disputes,
    taxCollected,
    taxRefunded,
    estimatedFees: 0,
    failedPayments,
    reconciliationHealth: mirroredPaymentEvents
      ? `Recognized revenue uses paid invoices only; ${mirroredPaymentEvents} checkout/payment-intent mirror events are excluded to prevent duplicate counting.`
      : 'Operational ledger mirrors received Stripe invoice events; run account sync for spot checks.',
    openRefunds: refundSnap.docs.filter(doc => !['succeeded', 'failed', 'denied'].includes(String(doc.data().status))).length,
    openDisputes: disputeSnap.docs.filter(doc => !['won', 'lost'].includes(String(doc.data().status))).length,
    recentLedger: ledger.slice(0, 12),
    recentCommunications: commSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
  };
}
