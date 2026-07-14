import Stripe from 'stripe';
import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { requireBillingAdmin } from '@/lib/admin-billing-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { checkRateLimitStrict } from '@/lib/rate-limit';
import {
  SONA_ECONOMICS_ACCOUNTS_COLLECTION,
  SONA_ECONOMICS_PAYMENTS_COLLECTION,
  buildSonaAccountRenewalSummaryRepairDecision,
  buildSonaPaymentEvidenceRepairDecision,
} from '@/lib/sona/economics';
import { inspectSonaPaymentEvidence } from '@/lib/sona/payment-evidence-server';

const SAFE_REFERENCE = /^[A-Za-z0-9_-]{1,180}$/;
const MAX_ACCOUNT_PAYMENT_HISTORY = 200;
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(req: NextRequest, context: { params: Promise<{ paymentReferenceId: string }> }) {
  const admin = await requireBillingAdmin(req);
  if (admin.error) return admin.error;
  const { paymentReferenceId } = await context.params;
  if (!SAFE_REFERENCE.test(paymentReferenceId)) return NextResponse.json({ error: 'Invalid payment reference.' }, { status: 400, headers: PRIVATE_HEADERS });
  const strict = await checkRateLimitStrict(`payment-evidence-repair:${admin.user!.uid}`, 6, 60_000);
  if (!strict.allowed) return NextResponse.json({ error: 'Repair verification unavailable.' }, { status: strict.unavailable ? 503 : 429, headers: PRIVATE_HEADERS });
  const input = await req.json().catch(() => null);
  if (!input || typeof input !== 'object') return NextResponse.json({ error: 'Repair attestation is required.' }, { status: 400, headers: PRIVATE_HEADERS });
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Provider evidence unavailable.' }, { status: 503, headers: PRIVATE_HEADERS });
  const db = getAdminDb();
  const paymentRef = db.collection(SONA_ECONOMICS_PAYMENTS_COLLECTION).doc(paymentReferenceId);
  const paymentSnapshot = await paymentRef.get();
  if (!paymentSnapshot.exists) return NextResponse.json({ error: 'Payment not found.' }, { status: 404, headers: PRIVATE_HEADERS });
  const payment = { ...paymentSnapshot.data(), paymentReferenceId };
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover', timeout: 5_000, maxNetworkRetries: 0 });
  const inspected = await inspectSonaPaymentEvidence(stripe, payment);
  const preview = inspected.preview;
  if (!preview || preview.status !== 'ready' || !preview.verifiedOwnerUid || !preview.invoiceId || !preview.proposed.plan || preview.proposed.currency !== 'usd' || !preview.proposed.planSource || !preview.proposed.billingInterval || !preview.proposed.billingReason || inspected.lookupErrors.length) return NextResponse.json({ error: 'Verified repair evidence is incomplete.' }, { status: 409, headers: PRIVATE_HEADERS });
  const expected = {
    invoiceId: preview.invoiceId, plan: preview.proposed.plan, currency: 'usd' as const,
    planSource: preview.proposed.planSource, stripePriceId: preview.proposed.stripePriceId,
    billingInterval: preview.proposed.billingInterval, billingReason: preview.proposed.billingReason,
  };
  const verifiedUid = preview.verifiedOwnerUid;
  const accountRef = db.collection(SONA_ECONOMICS_ACCOUNTS_COLLECTION).doc(verifiedUid);
  const accountPaymentsQuery = db.collection(SONA_ECONOMICS_PAYMENTS_COLLECTION).where('uid', '==', verifiedUid).orderBy('occurredAt', 'asc').limit(MAX_ACCOUNT_PAYMENT_HISTORY + 1);
  const repairedAt = new Date().toISOString();
  await db.runTransaction(async transaction => {
    const [latestPayment, account, accountPayments] = await Promise.all([transaction.get(paymentRef), transaction.get(accountRef), transaction.get(accountPaymentsQuery)]);
    if (!latestPayment.exists || latestPayment.data()?.invoiceId !== expected.invoiceId) throw new Error('PAYMENT_CHANGED');
    const paymentDecision = buildSonaPaymentEvidenceRepairDecision({
      current: { ...latestPayment.data(), paymentReferenceId }, preview, expected, linkedEvents: [],
      confirmationText: input.confirmationText, acknowledged: input.acknowledged === true,
      reason: typeof input.reason === 'string' ? input.reason : '', actor: admin.user!.email || admin.user!.uid, repairedAt,
    });
    if (paymentDecision.status !== 'ready') throw new Error(paymentDecision.code);
    const decision = buildSonaAccountRenewalSummaryRepairDecision({
      currentSummary: account.exists ? account.data() || null : null,
      paymentRecords: accountPayments.docs.slice(0, MAX_ACCOUNT_PAYMENT_HISTORY).map(doc => ({ ...doc.data(), paymentReferenceId: doc.id })),
      paymentHistoryTruncated: accountPayments.size > MAX_ACCOUNT_PAYMENT_HISTORY,
      verifiedPayment: {
        uid: verifiedUid, invoiceId: expected.invoiceId, paymentReferenceId,
        plan: expected.plan, currency: 'usd',
        billingInterval: expected.billingInterval, billingReason: expected.billingReason,
      },
      repairedAt,
    });
    if (decision.status === 'blocked') throw new Error(decision.code);
    const accountRenewalEvidenceStatus = decision.summaryPatch.renewalEvidenceStatus;
    transaction.update(paymentRef, paymentDecision.paymentPatch);
    transaction.set(accountRef, {
      ...decision.summaryPatch,
      ...(decision.status === 'incomplete' && decision.clearPaidEvidence ? {
        firstPaidInterval: FieldValue.delete(), latestPaidInterval: FieldValue.delete(),
        renewalInvoiceCount: FieldValue.delete(), billingInterval: FieldValue.delete(), billingReason: FieldValue.delete(),
      } : {}),
    }, { merge: true });
    transaction.set(db.collection('settings').doc('admin_log').collection('entries').doc(), {
      action: 'sona_payment_evidence_repaired', by: admin.user!.email || admin.user!.uid,
      at: repairedAt, changes: { ...paymentDecision.auditChanges, accountRenewalEvidenceStatus },
    });
  });
  await db.collection('admin').doc('cache_costs_v8').delete().catch(() => undefined);
  return NextResponse.json({ repaired: true, paymentReferenceId, noStripeMutation: true }, { headers: PRIVATE_HEADERS });
}
