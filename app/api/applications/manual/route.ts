import { invalidateTwin } from '@/lib/career-twin';
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { manualApplicationSchema } from '@/lib/application-commands';
export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60000 });
  if (guard.error) return guard.error;
  const parsed = manualApplicationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Check the application details.' }, { status: 400 });
  try {
    const input = parsed.data; const db = getAdminDb();
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const ref = db.collection('users').doc(guard.user.uid).collection('applications').doc(`manual_${input.requestId}`);
    const data = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        if (snapshot.data()?.request_fingerprint !== fingerprint) throw new Error('REQUEST_CONFLICT');
        return { id: snapshot.id, ...snapshot.data() };
      }
      const now = new Date().toISOString();
      const record = { request_fingerprint: fingerprint, user_id: guard.user.uid, company_name: input.company, companyName: input.company, job_title: input.role, jobTitle: input.role,
        application_link: input.url || null, source:'manual', status: input.submitted ? 'applied' : 'not_applied',
        applied_at: input.submitted ? `${input.sentDate}T12:00:00.000Z` : null, appliedAt: input.submitted ? `${input.sentDate}T12:00:00.000Z` : null,
        created_at: now, createdAt: now, last_updated: now, updatedAt: now, morphed_resume_name: '', packet_status: 'tracker_draft' };
      transaction.set(ref, record); return { id: ref.id, ...record };
    });
    await invalidateTwin(guard.user.uid).catch(error => console.error('Twin invalidation failed', error));
    return NextResponse.json({ success: true, data });
  } catch (error) { if (error instanceof Error && error.message === 'REQUEST_CONFLICT') return NextResponse.json({ error: 'This save request changed. Start a new application to save different details.' }, { status: 409 }); return NextResponse.json({ error:'Application could not be saved. Your inputs are still here; retry safely.' }, { status:503 }); }
}
