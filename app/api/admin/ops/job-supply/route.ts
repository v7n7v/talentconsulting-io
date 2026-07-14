import { NextRequest, NextResponse } from 'next/server';
import { requireBillingAdmin } from '@/lib/admin-billing-auth';
import { checkRateLimitStrict } from '@/lib/rate-limit';
import { probeJobSupplyHealth } from '@/lib/job-supply-health';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(req: NextRequest) {
  const admin = await requireBillingAdmin(req);
  if (admin.error) return admin.error;
  const strictLimit = await checkRateLimitStrict(`admin-job-supply:${admin.user!.uid}`, 6, 60_000);
  if (!strictLimit.allowed) {
    return NextResponse.json({ error: 'Health verification is temporarily unavailable.' }, { status: strictLimit.unavailable ? 503 : 429, headers: PRIVATE_HEADERS });
  }
  const result = await probeJobSupplyHealth({ force: true });
  return NextResponse.json(result, { status: result.preparationReady ? 200 : 503, headers: PRIVATE_HEADERS });
}
