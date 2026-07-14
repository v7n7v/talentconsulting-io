import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { requireBillingAdmin } from '@/lib/admin-billing-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { SONA_ECONOMICS_PAYMENTS_COLLECTION, hasVerifiedSonaPaymentEvidence } from '@/lib/sona/economics';
import { inspectSonaPaymentEvidence, type LegacySonaPaymentRecord } from '@/lib/sona/payment-evidence-server';

const MAX_PREVIEW_PAYMENTS = 20;
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(req: NextRequest) {
  const admin = await requireBillingAdmin(req);
  if (admin.error) return admin.error;
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Provider evidence unavailable.', writePerformed: false }, { status: 503, headers: PRIVATE_HEADERS });
  const requested = Number(req.nextUrl.searchParams.get('limit') || MAX_PREVIEW_PAYMENTS);
  const limit = Math.min(Math.max(Number.isFinite(requested) ? Math.floor(requested) : MAX_PREVIEW_PAYMENTS, 1), MAX_PREVIEW_PAYMENTS);
  const snapshot = await getAdminDb().collection(SONA_ECONOMICS_PAYMENTS_COLLECTION).orderBy('occurredAt', 'desc').limit(limit + 1).get();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover', timeout: 5_000, maxNetworkRetries: 0 });
  const previews = [];
  for (const document of snapshot.docs.slice(0, limit)) {
    const payment: LegacySonaPaymentRecord = { ...document.data(), paymentReferenceId: document.id };
    if (hasVerifiedSonaPaymentEvidence(payment)) continue;
    const inspected = await inspectSonaPaymentEvidence(stripe, payment);
    previews.push({ paymentReferenceId: document.id, billingInterval: payment.billingInterval || null, billingReason: payment.billingReason || null, ...inspected });
  }
  return NextResponse.json({ previews, truncated: snapshot.size > limit, writePerformed: false }, { headers: PRIVATE_HEADERS });
}
