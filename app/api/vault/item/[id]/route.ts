import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { guardApiRoute } from '@/lib/api-auth';
import { normalizePrepMemoryItem } from '@/lib/prep-memory';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;
  const { id } = await params;
  if (!id || !/^[\w-]{1,160}$/.test(id)) return NextResponse.json({ error: 'Invalid memory item id' }, { status: 400 });
  const doc = await getAdminDb().collection('study_vault').doc(id).get();
  if (!doc.exists || doc.data()?.userId !== guard.user.uid) return NextResponse.json({ error: 'Memory item not found' }, { status: 404 });
  return NextResponse.json({ item: normalizePrepMemoryItem(doc.id, doc.data() || {}, { includeContent: true }) });
}
