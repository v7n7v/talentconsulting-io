import { NextRequest, NextResponse } from 'next/server';
import { requireBillingAdmin } from '@/lib/admin-billing-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { checkRateLimitStrict } from '@/lib/rate-limit';
import { loadLatestPricingMemoReviewStatus } from '@/lib/sona/pricing-memo-review-status-store';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
export async function GET(req: NextRequest) {
  const admin = await requireBillingAdmin(req);
  if (admin.error) return admin.error;
  const strict = await checkRateLimitStrict(`pricing-memo-review:${admin.user!.uid}`, 20, 60_000);
  if (!strict.allowed) return NextResponse.json({ error: 'Review status unavailable.' }, { status: strict.unavailable ? 503 : 429, headers: PRIVATE_HEADERS });
  const result = await loadLatestPricingMemoReviewStatus(getAdminDb());
  return NextResponse.json(result, { status: result.ok ? 200 : result.status, headers: PRIVATE_HEADERS });
}
