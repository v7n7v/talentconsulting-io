import { NextRequest } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getLatestResumeForUser } from '@/lib/server-resume';

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;
  const db = getAdminDb();

  try {
    const latest = await getLatestResumeForUser(db, uid);
    return new Response(JSON.stringify({
      resume: latest.resume,
      source: latest.source,
      resumeId: latest.id,
      updatedAt: latest.updatedAt,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, resume: null }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
