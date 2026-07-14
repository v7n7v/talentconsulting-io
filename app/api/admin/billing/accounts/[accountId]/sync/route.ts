import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { requireBillingAdmin } from '@/lib/admin-billing-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { BILLING_COLLECTIONS, syncCustomerAccount, writeBillingAuditLog } from '@/lib/billing-ledger';

const SAFE_ACCOUNT_ID = /^[A-Za-z0-9_-]{1,160}$/;
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(req: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const admin = await requireBillingAdmin(req);
  if (admin.error) return admin.error;
  const { accountId } = await context.params;
  if (!SAFE_ACCOUNT_ID.test(accountId)) {
    return NextResponse.json({ error: 'Invalid billing account.' }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is unavailable.' }, { status: 503, headers: PRIVATE_HEADERS });
  }
  const db = getAdminDb();
  const snapshot = await db.collection(BILLING_COLLECTIONS.accounts).doc(accountId).get();
  if (!snapshot.exists) return NextResponse.json({ error: 'Billing account not found.' }, { status: 404, headers: PRIVATE_HEADERS });
  const storedAccount = snapshot.data()!;
  if (typeof storedAccount.stripeCustomerId !== 'string') {
    return NextResponse.json({ error: 'Billing account has no customer evidence.' }, { status: 409, headers: PRIVATE_HEADERS });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover', timeout: 5_000, maxNetworkRetries: 0 });
  const account = await syncCustomerAccount(stripe, storedAccount.stripeCustomerId, {
    accountId,
    uid: typeof storedAccount.uid === 'string' ? storedAccount.uid : null,
  });
  await db.collection('admin').doc('cache_costs_v8').delete().catch(() => undefined);
  await writeBillingAuditLog('billing_account_evidence_sync', admin.user!.email || admin.user!.uid, { accountId });
  return NextResponse.json({ account }, { headers: PRIVATE_HEADERS });
}
