import { NextRequest, NextResponse } from 'next/server';
import { requireBillingAdmin } from '@/lib/admin-billing-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { STRIPE_ACCOUNT_REVIEW_ISSUE_CODE } from '@/lib/billing/stripe-account-review-support';
import { normalizeStripeAccountReviewStatus } from '@/lib/billing/stripe-account-review-case';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(req: NextRequest) {
  const admin = await requireBillingAdmin(req);
  if (admin.error) return admin.error;
  const requested = Number(req.nextUrl.searchParams.get('limit') || 50);
  const limit = Math.min(Math.max(Number.isFinite(requested) ? Math.floor(requested) : 50, 1), 100);
  const snapshot = await getAdminDb().collection('admin_feedback')
    .where('issueCode', '==', STRIPE_ACCOUNT_REVIEW_ISSUE_CODE)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  const cases = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      uid: typeof data.uid === 'string' ? data.uid : null,
      status: normalizeStripeAccountReviewStatus(data.status),
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || data.createdAt || null,
      resolvedAt: data.resolvedAt || null,
      history: Array.isArray(data.history) ? data.history.slice(-20) : [],
      checkoutAccountEvidence: data.checkoutAccountEvidence || null,
    };
  });
  return NextResponse.json({ cases, bounded: true, limit }, { headers: PRIVATE_HEADERS });
}
