import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute, incrementUsage } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { monitor } from '@/lib/monitor';

const WHITEBOARD_MODES = new Set(['coding', 'system_design', 'case']);

function cleanString(value: unknown, max = 8000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/*
 * There is deliberately no fallbackGrade().
 *
 * When AI grading was unavailable this route used to synthesise a score:
 * `38 + (number of non-empty fields) * 8 + min(18, solution.length / 220)`,
 * clamped to 35-88. That is 38 points for showing up, eight points per textarea
 * the user typed anything into, and the rest from the character count of the
 * solution box — nothing in it looked at whether the answer was correct.
 *
 * The rubric was worse: `assumptions ? 80 : 55`, `tradeoffs ? 76 : 42`. An
 * empty trade-offs box scored 42 out of 100 for "Decision quality" — a measured-
 * looking verdict on something never measured, which is the missing-as-zero
 * pattern `evidence-states.md` forbids wearing a friendlier number. All of it
 * persisted to `interview_sessions.scores` and rendered as an ordinary grade.
 *
 * An answer that was not graded is not a grade. The route now says so and
 * persists nothing.
 */

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 8, rateLimitWindow: 60_000, feature: 'gauntlets' });
  if (guard.error) return guard.error;

  try {
    const body = await req.json();
    const mode = WHITEBOARD_MODES.has(body?.mode) ? body.mode : 'system_design';
    const sessionId = cleanString(body?.sessionId, 120);
    const prompt = cleanString(body?.prompt, 3000);

    if (!prompt) {
      return NextResponse.json({ error: 'Whiteboard prompt required' }, { status: 400 });
    }

    const systemPrompt = `You are Taco, an interview whiteboard coach. Grade a structured ${mode} interview answer.

Evaluate approach, assumptions, communication, correctness, trade-offs, edge cases, and interviewer-readiness. Do not reveal hidden reasoning. Do not run code or claim execution.

Return valid JSON:
{
  "score": number,
  "summary": string,
  "strengths": string[],
  "improvements": string[],
  "rubric": [{ "label": string, "score": number, "note": string }],
  "missedConsiderations": string[],
  "nextSteps": string[],
  "followUpQuestion": string
}`;

    const userPrompt = JSON.stringify({
      mode,
      role: cleanString(body?.role, 180),
      company: cleanString(body?.company, 180),
      prompt,
      assumptions: cleanString(body?.assumptions, 4000),
      approach: cleanString(body?.approach, 5000),
      solution: cleanString(body?.solution, 10000),
      complexity: cleanString(body?.complexity, 3000),
      tradeoffs: cleanString(body?.tradeoffs, 4000),
    });

    let grade: any;
    try {
      grade = await groqJSONCompletion(systemPrompt, userPrompt, { temperature: 0.3, maxTokens: 2200 });
    } catch (gradeError: any) {
      // Telemetry, because there is no fallback any more: without this a grader
      // outage is invisible in monitoring while being visible to every user who
      // finishes a whiteboard, and "the grader is down" looks exactly like
      // "nobody used the whiteboard today".
      monitor.critical('Tool: interview/whiteboard-grade', `grader unavailable: ${String(gradeError)}`);
      return NextResponse.json({
        error: 'Grading is unavailable right now, so this whiteboard answer was not scored. No review was saved — try again in a moment.',
        code: 'GRADING_UNAVAILABLE',
      }, { status: 503 });
    }

    // No default score either. An ungraded answer has no number, not a low one.
    if (typeof grade?.score !== 'number' || !Number.isFinite(grade.score)) {
      monitor.critical('Tool: interview/whiteboard-grade', `grader returned no score for ${mode} whiteboard answer`);
      return NextResponse.json({
        error: 'Grading came back without a score, so nothing was recorded. Try again in a moment.',
        code: 'GRADING_INCOMPLETE',
      }, { status: 503 });
    }

    if (sessionId) {
      try {
        await getAdminDb().collection('users').doc(guard.user.uid).collection('interview_sessions').doc(sessionId).set({
          whiteboard: {
            mode,
            prompt,
            assumptions: cleanString(body?.assumptions, 4000),
            approach: cleanString(body?.approach, 5000),
            solution: cleanString(body?.solution, 10000),
            complexity: cleanString(body?.complexity, 3000),
            tradeoffs: cleanString(body?.tradeoffs, 4000),
          },
          scores: grade,
          recommendations: Array.isArray(grade?.nextSteps) ? grade.nextSteps : [],
          status: 'completed',
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch {
        // Best-effort persistence.
      }
    }

    incrementUsage(guard.user.uid, 'gauntlets').catch(() => {});
    return NextResponse.json({ grade, success: true });
  } catch (error: any) {
    monitor.critical('Tool: interview/whiteboard-grade', String(error));
    return NextResponse.json({ error: error.message || 'Failed to grade whiteboard answer' }, { status: 500 });
  }
}
