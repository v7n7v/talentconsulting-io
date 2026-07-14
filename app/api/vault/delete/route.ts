import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { guardApiRoute } from '@/lib/api-auth';
import { monitor } from '@/lib/monitor';

export async function DELETE(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req);
    if (guard.error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await req.json();
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Invalid note ID' }, { status: 400 });
    }

    const db = getAdminDb();
    const docRef = db.collection('study_vault').doc(id);
    const doc = await docRef.get();

    // Guard: ensure user owns this note
    if (!doc.exists || doc.data()?.userId !== guard.user?.uid) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await docRef.delete();
    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    console.error('[api/vault/delete] Error:', error);
    monitor.critical('Tool: vault/delete', String(error));
    return NextResponse.json({ error: 'Failed to delete memory item' }, { status: 500 });
  }
}
