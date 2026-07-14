/**
 * Usage API — Returns user's tier + lifetime usage counts
 * Used by the client-side useUserTier hook
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getUsage, FREE_CAPS } from '@/lib/usage-tracker';
import { monitor } from '@/lib/monitor';

export async function GET(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;

    const usage = await getUsage(guard.user.uid);

    return NextResponse.json({
      tier: guard.user.tier,
      usage,
      caps: guard.user.tier === 'free' ? FREE_CAPS : null,
    });
  } catch (error: any) {
    console.error('Usage API error:', error);
    monitor.critical('Tool: usage', String(error));
    return NextResponse.json({ error: 'Failed to get usage' }, { status: 500 });
  }
}
