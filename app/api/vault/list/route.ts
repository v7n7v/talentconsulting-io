import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { guardApiRoute } from '@/lib/api-auth';
import { monitor } from '@/lib/monitor';
import { isPrepMemoryType, normalizePrepMemoryItem, prepMemorySearchText } from '@/lib/prep-memory';

export async function GET(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req);
    if (guard.error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const query = (searchParams.get('search') || '').trim().toLowerCase();
    const cursor = Math.max(0, Number(searchParams.get('cursor') || 0) || 0);
    const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') || 20) || 20));

    const db = getAdminDb();
    const snapshot = await db
      .collection('study_vault')
      .where('userId', '==', guard.user?.uid || 'anonymous')
      .limit(200)
      .get();

    const allItems = snapshot.docs
      .map(doc => normalizePrepMemoryItem(doc.id, doc.data(), { includeContent: false }))
      // Sort client-side: newest first (avoids composite index requirement)
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });

    const filtered = allItems.filter(item => {
      const matchesType = !type || type === 'all' || (isPrepMemoryType(type) && item.type === type);
      const matchesSearch = !query || prepMemorySearchText(item).includes(query);
      return matchesType && matchesSearch;
    });

    const items = filtered.slice(cursor, cursor + limit);
    const nextCursor = cursor + limit < filtered.length ? String(cursor + limit) : null;

    return NextResponse.json({
      items,
      notes: items,
      total: filtered.length,
      nextCursor,
      hasMore: Boolean(nextCursor),
    });
  } catch (error: unknown) {
    console.error('[api/vault/list] Error:', error);
    monitor.critical('Tool: vault/list', String(error));
    return NextResponse.json({ error: 'Failed to fetch vault items' }, { status: 500 });
  }
}
