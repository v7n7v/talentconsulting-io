import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { invalidateTwin } from '@/lib/career-twin';
import { createStoryBankStory } from '@/lib/story-bank';

const ROUND_TYPES = new Set(['phone', 'technical', 'behavioral', 'system_design', 'hiring_manager', 'panel', 'final', 'culture']);
const INTERVIEWER_VIBES = new Set(['warm', 'neutral', 'tough']);
const OUTCOMES = new Set(['passed', 'rejected', 'pending', 'ghosted']);

function boundedText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function isAlreadyCreated(error: any) {
  return error?.code === 6 || error?.code === 'already-exists' || error?.code === 'ALREADY_EXISTS';
}

function payloadFingerprint(payload: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;
  const db = getAdminDb();

  try {
    const snap = await db.collection('users').doc(uid).collection('debriefs')
      .orderBy('createdAt', 'desc').limit(50).get();

    const debriefs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return new Response(JSON.stringify({ debriefs }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, debriefs: [] }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;
  const db = getAdminDb();

  try {
    const body = await req.json();
    const {
      company, role, roundType, date,
      questions, overallFeeling, strengths, weaknesses,
      surprises, wouldChange, interviewerVibe,
      followUpSent, outcome, applicationId, idempotencyKey,
    } = body;

    const normalizedCompany = boundedText(company, 160);
    const normalizedRole = boundedText(role, 160);
    const normalizedIdempotencyKey = boundedText(idempotencyKey, 100);
    if (!normalizedCompany || !normalizedRole) {
      return new Response(JSON.stringify({ error: 'Company and role are required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(normalizedIdempotencyKey)) {
      return new Response(JSON.stringify({ error: 'A valid idempotency key is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    let verifiedApplicationId: string | null = null;
    let verifiedApplication: Record<string, any> | null = null;
    if (applicationId !== undefined && applicationId !== null && applicationId !== '') {
      const normalizedApplicationId = typeof applicationId === 'string' ? applicationId.trim() : '';
      if (!normalizedApplicationId || normalizedApplicationId.length > 200 || normalizedApplicationId.includes('/')) {
        return new Response(JSON.stringify({ error: 'Application context is invalid' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }
      const application = await db.collection('users').doc(uid).collection('applications').doc(normalizedApplicationId).get();
      if (!application.exists) {
        return new Response(JSON.stringify({ error: 'Application context was not found' }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        });
      }
      verifiedApplicationId = normalizedApplicationId;
      verifiedApplication = application.data() || null;
    }

    const resolvedCompany = verifiedApplication
      ? boundedText(verifiedApplication.company_name || verifiedApplication.companyName || verifiedApplication.company || normalizedCompany, 160)
      : normalizedCompany;
    const resolvedRole = verifiedApplication
      ? boundedText(verifiedApplication.job_title || verifiedApplication.jobTitle || normalizedRole, 160)
      : normalizedRole;
    const normalizedRoundType = ROUND_TYPES.has(roundType) ? roundType : 'behavioral';
    const normalizedVibe = INTERVIEWER_VIBES.has(interviewerVibe) ? interviewerVibe : 'neutral';
    const normalizedOutcome = OUTCOMES.has(outcome) ? outcome : 'pending';
    const normalizedDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toISOString().split('T')[0];
    const normalizedFeeling = boundedNumber(overallFeeling, 1, 5, 3);
    const normalizedQuestions = (Array.isArray(questions) ? questions : [])
      .slice(0, 20)
      .map((question: any) => ({
        text: boundedText(question?.text, 1000),
        confidence: boundedNumber(question?.confidence, 0, 100, normalizedFeeling * 20),
        category: boundedText(question?.category, 80) || 'Interview',
      }))
      .filter(question => question.text.length > 0);
    const normalizedStrengths = boundedText(strengths, 5000);
    const normalizedWeaknesses = boundedText(weaknesses, 5000);
    const fingerprintSource = {
      company: resolvedCompany, role: resolvedRole, roundType: normalizedRoundType,
      date: normalizedDate,
      questions: normalizedQuestions,
      overallFeeling: normalizedFeeling,
      strengths: normalizedStrengths, weaknesses: normalizedWeaknesses,
      surprises: boundedText(surprises, 5000), wouldChange: boundedText(wouldChange, 5000),
      interviewerVibe: normalizedVibe,
      followUpSent: followUpSent === true,
      outcome: normalizedOutcome,
      ...(verifiedApplicationId ? { applicationId: verifiedApplicationId } : {}),
      idempotencyKey: normalizedIdempotencyKey,
    };
    const fingerprint = payloadFingerprint(fingerprintSource);
    const payload = {
      ...fingerprintSource,
      payloadFingerprint: fingerprint,
      createdAt: new Date().toISOString(),
    };
    const docRef = db.collection('users').doc(uid).collection('debriefs').doc(`request_${normalizedIdempotencyKey}`);
    try {
      await docRef.create(payload);
    } catch (writeError) {
      if (isAlreadyCreated(writeError)) {
        const existing = await docRef.get();
        const existingFingerprint = existing.exists ? existing.data()?.payloadFingerprint : null;
        if (existingFingerprint !== fingerprint) {
          return new Response(JSON.stringify({
            error: 'This debrief changed after its first save attempt. Refresh before saving a new version.',
            code: 'IDEMPOTENCY_CONFLICT',
          }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ id: docRef.id, success: true, duplicate: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw writeError;
    }

    // Auto-generate STAR story from debrief questions with high confidence
    const goodQuestions = normalizedQuestions.filter(question => question.confidence >= 60);
    if (goodQuestions.length > 0) {
      try {
        const topQ = goodQuestions[0];
        await createStoryBankStory(uid, {
          title: `${resolvedRole} @ ${resolvedCompany} — ${topQ.category || 'Interview'} Question`,
          situation: `During a ${normalizedRoundType.replace('_', ' ')} interview at ${resolvedCompany} for the ${resolvedRole} position.`,
          task: `Was asked: "${topQ.text}"`,
          action: normalizedStrengths || '(Fill in your answer approach)',
          result: `Self-assessed confidence: ${topQ.confidence}%. ${normalizedFeeling >= 4 ? 'Strong performance overall.' : 'Room for improvement.'}`,
          reflection: normalizedWeaknesses ? `Area to improve: ${normalizedWeaknesses}` : 'Review and refine this story for next time.',
          tags: [resolvedCompany, normalizedRoundType.replace('_', ' '), topQ.category || 'General'].filter(Boolean),
          source: 'interview_debrief',
          sourceTool: 'interview_debrief',
          company: resolvedCompany,
          role: resolvedRole,
        });
      } catch { /* story save is best-effort */ }
    }

    // Invalidate the Digital Twin so it recomputes on next read
    invalidateTwin(uid).catch(() => {});

    return new Response(JSON.stringify({ id: docRef.id, success: true, duplicate: false }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 20, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;
  const db = getAdminDb();

  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: 'Debrief ID required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const allowed = ['outcome', 'followUpSent', 'strengths', 'weaknesses'];
    const safeUpdates: Record<string, any> = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }
    safeUpdates.updatedAt = new Date().toISOString();

    await db.collection('users').doc(uid).collection('debriefs').doc(id).update(safeUpdates);

    invalidateTwin(uid).catch(() => {});

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;
  const db = getAdminDb();

  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: 'Debrief ID required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    await db.collection('users').doc(uid).collection('debriefs').doc(id).delete();
    invalidateTwin(uid).catch(() => {});

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
