import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { WritingSessionSchema, WritingConflict, deleteWritingSession, listWritingSessions, openWritingSession, writeWritingSession } from '@/lib/writing-session-server';

export async function GET(request: NextRequest) {
  const guard = await guardApiRoute(request, { rateLimit: 30, rateLimitWindow: 60000 });
  if (guard.error) return guard.error;
  const id = new URL(request.url).searchParams.get('id');
  if (id && !/^[A-Za-z0-9_-]{1,150}$/.test(id)) return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
  try {
    const result = id ? await openWritingSession(guard.user.uid, id) : await listWritingSessions(guard.user.uid);
    if (id && !result) return NextResponse.json({ error: 'Writing session not found' }, { status: 404 });
    return NextResponse.json({ sessions: result });
  } catch { return NextResponse.json({ error: 'Writing sessions are temporarily unavailable.' }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  const guard = await guardApiRoute(request, { rateLimit: 20, rateLimitWindow: 60000 });
  if (guard.error) return guard.error;
  try {
    const parsed = WritingSessionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Writing session fields are invalid or too long.' }, { status: 400 });
    const session = await writeWritingSession(guard.user.uid, parsed.data);
    return NextResponse.json({ session });
  } catch (error) { return NextResponse.json({ error: error instanceof WritingConflict ? error.message : 'Writing session could not be saved.' }, { status: error instanceof WritingConflict ? 409 : 503 }); }
}

export async function DELETE(request: NextRequest) {
  const guard = await guardApiRoute(request, { rateLimit: 20, rateLimitWindow: 60000 });
  if (guard.error) return guard.error;
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[A-Za-z0-9_-]{1,150}$/.test(id)) return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
  try { await deleteWritingSession(guard.user.uid, id); return NextResponse.json({ deleted: true }); }
  catch { return NextResponse.json({ error: 'Session could not be deleted.' }, { status: 503 }); }
}
