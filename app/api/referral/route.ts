/**
 * Referral API
 * GET  /api/referral — Get user's referral code & stats
 * POST /api/referral — Apply a referral code (during/after signup)
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getReferralCode, applyReferralCode } from '@/lib/referral';
import { monitor } from '@/lib/monitor';

/** GET — retrieve user's referral code and stats */
export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 20, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const { uid, email } = guard.user;

  try {
    const data = await getReferralCode(uid, email);
    const shareUrl = `https://talentconsulting.io?ref=${data.code}`;

    return NextResponse.json({
      ...data,
      shareUrl,
      shareText: `Get 50% off 3 months of TalentConsulting.io Pro! Use my referral code: ${data.code} — ${shareUrl}`,
    });
  } catch (err) {
    console.error('[referral] GET error:', err);
    monitor.critical('Tool: referral', String(err));
    return NextResponse.json({ error: 'Failed to get referral info' }, { status: 500 });
  }
}

/** POST — apply a referral code */
export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 5, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const { uid, email } = guard.user;

  try {
    const { code } = await req.json();
    if (!code) {
      return NextResponse.json({ error: 'Referral code is required.' }, { status: 400 });
    }

    const result = await applyReferralCode(uid, email || '', code.toUpperCase().trim());

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Referral code applied! You\'ll both get 50% off for 3 months when you upgrade.',
    });
  } catch (err) {
    console.error('[referral] POST error:', err);
    monitor.critical('Tool: referral', String(err));
    return NextResponse.json({ error: 'Failed to apply referral code' }, { status: 500 });
  }
}
