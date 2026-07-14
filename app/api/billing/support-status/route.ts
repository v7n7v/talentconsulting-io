import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { normalizeStripeAccountReviewReceipt } from '@/lib/billing/stripe-account-review-receipt';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;
  try {
    const snapshot = await getAdminDb()
      .collection('users')
      .doc(guard.user.uid)
      .collection('billingSupport')
      .doc('current')
      .get();
    if (!snapshot.exists) {
      return NextResponse.json({ status: 'none' }, { headers: NO_STORE_HEADERS });
    }
    const receipt = normalizeStripeAccountReviewReceipt(snapshot.data());
    if (!receipt) {
      return NextResponse.json({
        code: 'BILLING_SUPPORT_STATUS_INVALID',
        error: 'Billing support status needs review before it can be displayed.',
      }, { status: 503, headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({
      status: receipt.status,
      createdAt: receipt.createdAt,
      updatedAt: receipt.updatedAt,
      resolvedAt: receipt.resolvedAt,
      retryCheckout: receipt.status === 'resolved',
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('[api/billing/support-status] error:', error);
    return NextResponse.json({
      code: 'BILLING_SUPPORT_STATUS_UNAVAILABLE',
      error: 'Billing support status is temporarily unavailable.',
    }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
