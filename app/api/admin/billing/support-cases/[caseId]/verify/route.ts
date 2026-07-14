import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { requireBillingAdmin } from '@/lib/admin-billing-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { discoverStripeCheckoutCustomers } from '@/lib/billing/stripe-checkout-account-read';
import { buildStripeAccountReviewEvidence } from '@/lib/billing/stripe-account-review-case';

const SAFE_CASE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(req: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const admin = await requireBillingAdmin(req);
  if (admin.error) return admin.error;
  const { caseId } = await context.params;
  if (!SAFE_CASE_ID.test(caseId)) {
    return NextResponse.json({ error: 'Invalid case.' }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ code: 'STRIPE_ACCOUNT_EVIDENCE_UNAVAILABLE', error: 'Stripe evidence is unavailable.' }, { status: 503, headers: PRIVATE_HEADERS });
  }
  const db = getAdminDb();
  const caseRef = db.collection('admin_feedback').doc(caseId);
  const snapshot = await caseRef.get();
  const data = snapshot.data();
  if (!snapshot.exists || !data || typeof data.uid !== 'string' || typeof data.email !== 'string') {
    return NextResponse.json({ error: 'Case evidence is incomplete.' }, { status: 409, headers: PRIVATE_HEADERS });
  }
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover', timeout: 5_000, maxNetworkRetries: 0 });
    const discovery = await discoverStripeCheckoutCustomers(stripe, { email: data.email, uid: data.uid });
    const evidence = buildStripeAccountReviewEvidence({
      uidCustomerIds: discovery.uidCustomers.map(customer => customer.id),
      localCustomerId: typeof data.stripeCustomerId === 'string' ? data.stripeCustomerId : null,
      selectedCustomerId: discovery.emailCustomers.length === 1 ? discovery.emailCustomers[0].id : null,
      needsNewCustomer: discovery.emailCustomers.length === 0 && discovery.uidCustomers.length === 0,
    });
    await db.runTransaction(async transaction => {
      const latest = await transaction.get(caseRef);
      if (!latest.exists || latest.data()?.status === 'resolved') throw new Error('CASE_IMMUTABLE');
      transaction.update(caseRef, { checkoutAccountEvidence: evidence, evidenceUpdatedAt: evidence.verifiedAt });
    });
    return NextResponse.json({ evidence }, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ code: 'STRIPE_ACCOUNT_EVIDENCE_UNAVAILABLE', error: 'Stripe evidence could not be verified.' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
