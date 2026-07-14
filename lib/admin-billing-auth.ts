import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { isMasterAccount } from '@/lib/pricing-tiers';

export async function requireBillingAdmin(req: NextRequest) {
  const guard = await guardApiRoute(req);
  if (guard.error) return { error: guard.error };
  if (!isMasterAccount(guard.user.email)) {
    return { error: NextResponse.json({ error: 'Access denied. Master admin only.' }, { status: 403 }) };
  }
  return { user: guard.user };
}

