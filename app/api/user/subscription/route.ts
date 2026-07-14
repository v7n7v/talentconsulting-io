/**
 * User Subscription API — /api/user/subscription
 * GET: Returns the user's current subscription plan
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  try {
    const db = getAdminDb();
    const uid = guard.user.uid;
    const subSnap = await db.collection('users').doc(uid).collection('subscription').doc('current').get();

    if (!subSnap.exists) {
      return NextResponse.json({ plan: 'free', status: 'none' });
    }

    const data = subSnap.data()!;
    return NextResponse.json({
      plan: data.plan || 'free',
      status: data.status || 'none',
      interval: data.interval || null,
    });
  } catch {
    return NextResponse.json({ plan: 'free', status: 'error' });
  }
}
