import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';

const fields = ['phone', 'bio'] as const;
export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req); if (guard.error) return guard.error;
  try {
    const data = (await getAdminDb().collection('users').doc(guard.user.uid).get()).data() || {};
    return NextResponse.json({ profile: Object.fromEntries(fields.map((f) => [f, typeof data[f] === 'string' ? data[f] : ''])) });
  } catch {
    return NextResponse.json({ error: 'Profile could not be loaded' }, { status: 503 });
  }
}
export async function PATCH(req: NextRequest) {
  const guard = await guardApiRoute(req); if (guard.error) return guard.error;
  const body = await req.json().catch(() => null); if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid profile' }, { status: 400 });
  const update: Record<string, string> = {};
  for (const field of fields) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string' || body[field].length > (field === 'bio' ? 2000 : 100)) return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
      update[field] = body[field];
    }
  }
  try {
    await getAdminDb().collection('users').doc(guard.user.uid).set(update, { merge: true });
    return NextResponse.json({ profile: update });
  } catch {
    return NextResponse.json({ error: 'Profile could not be saved' }, { status: 503 });
  }
}
