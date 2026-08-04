import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute, incrementUsage } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { monitor } from '@/lib/monitor';

type TranscriptEntry = { role: 'user' | 'ai'; text: string };

function cleanString(value: unknown, max = 6000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanTranscript(value: unknown): TranscriptEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 120).map((entry: any) => ({
    role: (entry?.role === 'ai' ? 'ai' : 'user') as 'ai' | 'user',
    text: cleanString(entry?.text, 6000),
  })).filter(entry => entry.text.length > 0);
}

/*
 * There is deliberately no fallbackGrade().
 *
 * When AI grading was unavailable this route used to synthesise a debrief:
 * a weighted average of `starScore * 0.25 + keywordCoverage * 0.2 + ...`,
 * where the telemetry inputs were read as `Number(telemetry?.starScore || 0)`
 * — so a signal that was never measured entered the average as a real zero and
 * dragged the score down, which is exactly the missing-rendered-as-zero pattern
 * `evidence-states.md` forbids. The rest came from bucketed word counts and a
 * words-per-minute threshold.
 *
 * It then expanded that one number into five per-answer scores (`score - 4 +
 * index`) and three rubric rows whose notes read "Measured through STAR
 * markers", "Measured through pacing and filler-word telemetry" — claiming
 * measurement for values nothing had measured. All of it persisted to
 * `interview_sessions.scores` and rendered in the debrief as an ordinary grade.
 *
 * An interview that was not graded is not a grade. The route now says so and
 * persists nothing.
 */

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 8, rateLimitWindow: 60_000, feature: 'gauntlets' });
  if (guard.error) return guard.error;

  try {
    const body = await req.json();
    const transcript = cleanTranscript(body?.transcript);
    const telemetry = body?.telemetry && typeof body.telemetry === 'object' ? body.telemetry : {};
    const sessionId = cleanString(body?.sessionId, 120);

    if (transcript.length === 0) {
      return NextResponse.json({ error: 'Transcript required for session grading' }, { status: 400 });
    }

    const systemPrompt = `You are Taco, a warm but precise interview coach for Talent Studio. Grade a complete practice interview session.

Return concise, user-visible coaching only. Do not reveal hidden reasoning. Do not pretend this was a real employer interview. Use the transcript, telemetry, job description, role, company, persona, and interview type when present.

Return valid JSON:
{
  "score": number,
  "summary": string,
  "strengths": string[],
  "improvements": string[],
  "answerFeedback": [{ "questionIndex": number, "score": number, "feedback": string, "rewriteTip": string }],
  "rubric": [{ "label": string, "score": number, "note": string }],
  "recommendations": string[],
  "nextDrills": [{ "title": string, "focus": string }],
  "storyCandidates": [{ "title": string, "why": string }],
  "weakCategories": string[]
}`;

    const userPrompt = JSON.stringify({
      role: cleanString(body?.role, 180),
      company: cleanString(body?.company, 180),
      jobDescription: cleanString(body?.jobDescription, 5000),
      persona: cleanString(body?.persona, 80),
      interviewType: cleanString(body?.interviewType, 80),
      telemetry,
      transcript,
    });

    let grade: any;
    try {
      grade = await groqJSONCompletion(systemPrompt, userPrompt, { temperature: 0.35, maxTokens: 2600 });
    } catch (gradeError: any) {
      // Telemetry, because there is no fallback any more: without this a grader
      // outage is invisible in monitoring while being visible to every user who
      // finishes a mock, and "the grader is down" looks exactly like "nobody
      // practised today".
      monitor.critical('Tool: interview/session-grade', `grader unavailable: ${String(gradeError)}`);
      return NextResponse.json({
        error: 'Grading is unavailable right now, so this interview was not scored. No debrief was saved — try again in a moment.',
        code: 'GRADING_UNAVAILABLE',
      }, { status: 503 });
    }

    // No default score either. A debrief without a number is not a zero and it
    // is not a 60 — it is an ungraded session.
    if (typeof grade?.score !== 'number' || !Number.isFinite(grade.score)) {
      monitor.critical('Tool: interview/session-grade', 'grader returned no score for interview session');
      return NextResponse.json({
        error: 'Grading came back without a score, so nothing was recorded. Try again in a moment.',
        code: 'GRADING_INCOMPLETE',
      }, { status: 503 });
    }

    if (sessionId) {
      try {
        await getAdminDb().collection('users').doc(guard.user.uid).collection('interview_sessions').doc(sessionId).set({
          scores: grade,
          recommendations: Array.isArray(grade?.recommendations) ? grade.recommendations : [],
          nextDrills: Array.isArray(grade?.nextDrills) ? grade.nextDrills : [],
          status: 'completed',
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch {
        // Session persistence is best-effort from this endpoint.
      }
    }

    incrementUsage(guard.user.uid, 'gauntlets').catch(() => {});
    return NextResponse.json({ grade, success: true });
  } catch (error: any) {
    monitor.critical('Tool: interview/session-grade', String(error));
    return NextResponse.json({ error: error.message || 'Failed to grade interview session' }, { status: 500 });
  }
}
