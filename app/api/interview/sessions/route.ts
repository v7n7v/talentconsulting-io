import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { monitor } from '@/lib/monitor';

const MODES = new Set(['quick_drill', 'study_cards', 'full_mock', 'sona_live', 'avatar_live', 'technical_whiteboard']);
const SOURCES = new Set(['application', 'agent_queue', 'pasted_jd', 'resume', 'manual']);
const STATUSES = new Set(['draft', 'active', 'completed', 'abandoned']);

function cleanString(value: unknown, max = 5000): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function cleanNullableString(value: unknown, max = 5000): string | null {
  const cleaned = cleanString(value, max);
  return cleaned || null;
}

function cleanArray<T = any>(value: unknown, max = 80): T[] {
  return Array.isArray(value) ? value.slice(0, max) as T[] : [];
}

function cleanRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function toSession(body: Record<string, any>, uid: string) {
  const now = new Date().toISOString();
  const mode = MODES.has(body.mode) ? body.mode : 'sona_live';
  const source = SOURCES.has(body.source) ? body.source : 'manual';
  const status = STATUSES.has(body.status) ? body.status : 'draft';

  return {
    userId: uid,
    mode,
    source,
    status,
    persona: cleanString(body.persona, 80) || 'friendly-hr',
    interviewType: cleanString(body.interviewType, 80) || 'mixed',
    intensity: cleanString(body.intensity, 40) || 'balanced',
    durationTarget: Number.isFinite(Number(body.durationTarget)) ? Math.max(5, Math.min(90, Number(body.durationTarget))) : 30,
    company: cleanNullableString(body.company, 180),
    role: cleanNullableString(body.role, 180),
    jobDescription: cleanNullableString(body.jobDescription, 12000),
    resumeVersionId: cleanNullableString(body.resumeVersionId, 120),
    applicationId: cleanNullableString(body.applicationId, 120),
    transcript: cleanArray(body.transcript, 200),
    telemetry: cleanRecord(body.telemetry),
    scores: cleanRecord(body.scores),
    rubric: cleanArray(body.rubric, 20),
    recommendations: cleanArray(body.recommendations, 20),
    nextDrills: cleanArray(body.nextDrills, 20),
    storyMatches: cleanArray(body.storyMatches, 20),
    createdStoryIds: cleanArray<string>(body.createdStoryIds, 20),
    skillGapIds: cleanArray<string>(body.skillGapIds, 20),
    notes: cleanNullableString(body.notes, 6000),
    whiteboard: cleanRecord(body.whiteboard),
    createdAt: now,
    updatedAt: now,
    startedAt: status === 'active' ? now : null,
    completedAt: status === 'completed' ? now : null,
  };
}

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const db = getAdminDb();
  const uid = guard.user.uid;
  const id = req.nextUrl.searchParams.get('id');

  try {
    if (id) {
      const doc = await db.collection('users').doc(uid).collection('interview_sessions').doc(id).get();
      if (!doc.exists) {
        return NextResponse.json({ error: 'Interview session not found' }, { status: 404 });
      }
      return NextResponse.json({ session: { id: doc.id, ...doc.data() } });
    }

    const snap = await db.collection('users').doc(uid).collection('interview_sessions')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const sessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ sessions });
  } catch (error: any) {
    monitor.critical('Tool: interview/sessions GET', String(error));
    return NextResponse.json({ error: error.message || 'Failed to load interview sessions', sessions: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 12, rateLimitWindow: 60_000, feature: 'gauntlets' });
  if (guard.error) return guard.error;

  const db = getAdminDb();
  const uid = guard.user.uid;

  try {
    const body = await req.json();
    const session = toSession(body || {}, uid);
    const docRef = await db.collection('users').doc(uid).collection('interview_sessions').add(session);
    return NextResponse.json({ id: docRef.id, session: { id: docRef.id, ...session }, success: true });
  } catch (error: any) {
    monitor.critical('Tool: interview/sessions POST', String(error));
    return NextResponse.json({ error: error.message || 'Failed to create interview session' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 24, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const db = getAdminDb();
  const uid = guard.user.uid;

  try {
    const body = await req.json();
    const id = cleanString(body?.id, 120);
    if (!id) return NextResponse.json({ error: 'Interview session id required' }, { status: 400 });

    const now = new Date().toISOString();
    const updates: Record<string, any> = { updatedAt: now };
    const allowedScalars = ['persona', 'interviewType', 'intensity', 'company', 'role', 'jobDescription', 'resumeVersionId', 'applicationId', 'notes'];
    const allowedRecords = ['telemetry', 'scores', 'whiteboard'];
    const allowedArrays = ['transcript', 'rubric', 'recommendations', 'nextDrills', 'storyMatches', 'createdStoryIds', 'skillGapIds'];

    if (MODES.has(body.mode)) updates.mode = body.mode;
    if (SOURCES.has(body.source)) updates.source = body.source;
    if (STATUSES.has(body.status)) {
      updates.status = body.status;
      if (body.status === 'active') updates.startedAt = body.startedAt || now;
      if (body.status === 'completed') updates.completedAt = body.completedAt || now;
    }
    if (Number.isFinite(Number(body.durationTarget))) updates.durationTarget = Math.max(5, Math.min(90, Number(body.durationTarget)));

    for (const key of allowedScalars) {
      if (body[key] !== undefined) updates[key] = cleanNullableString(body[key], key === 'jobDescription' ? 12000 : 6000);
    }
    for (const key of allowedRecords) {
      if (body[key] !== undefined) updates[key] = cleanRecord(body[key]);
    }
    for (const key of allowedArrays) {
      if (body[key] !== undefined) updates[key] = cleanArray(body[key], key === 'transcript' ? 200 : 40);
    }

    await db.collection('users').doc(uid).collection('interview_sessions').doc(id).set(updates, { merge: true });

    if (body.createDebrief && updates.status === 'completed') {
      try {
        await db.collection('users').doc(uid).collection('debriefs').add({
          company: updates.company || cleanNullableString(body.company, 180) || 'Practice session',
          role: updates.role || cleanNullableString(body.role, 180) || 'Interview practice',
          roundType: updates.interviewType || cleanString(body.interviewType, 80) || 'mixed',
          date: now.slice(0, 10),
          questions: cleanArray(body.questions, 20),
          overallFeeling: 4,
          strengths: cleanArray<string>(updates.scores?.strengths || body.scores?.strengths, 4).join('\n'),
          weaknesses: cleanArray<string>(updates.scores?.improvements || body.scores?.improvements, 4).join('\n'),
          surprises: 'Generated from an Interview Studio practice session.',
          wouldChange: cleanArray<string>(updates.nextDrills || body.nextDrills, 4).join('\n'),
          interviewerVibe: 'neutral',
          followUpSent: false,
          outcome: 'practice',
          interviewSessionId: id,
          createdAt: now,
        });
      } catch {
        // Debrief creation is best-effort; the session save is the source of truth.
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    monitor.critical('Tool: interview/sessions PATCH', String(error));
    return NextResponse.json({ error: error.message || 'Failed to update interview session' }, { status: 500 });
  }
}
