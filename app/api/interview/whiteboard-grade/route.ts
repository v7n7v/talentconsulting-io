import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute, incrementUsage } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { monitor } from '@/lib/monitor';

const WHITEBOARD_MODES = new Set(['coding', 'system_design', 'case']);

function cleanString(value: unknown, max = 8000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function fallbackGrade(body: any) {
  const prompt = cleanString(body?.prompt, 2000);
  const assumptions = cleanString(body?.assumptions, 3000);
  const approach = cleanString(body?.approach, 4000);
  const solution = cleanString(body?.solution, 8000);
  const complexity = cleanString(body?.complexity, 2000);
  const tradeoffs = cleanString(body?.tradeoffs, 3000);
  const completeness = [prompt, assumptions, approach, solution, complexity, tradeoffs].filter(Boolean).length;
  const score = Math.max(35, Math.min(88, 38 + completeness * 8 + Math.min(18, Math.floor(solution.length / 220))));

  return {
    score,
    summary: 'Sona created a deterministic whiteboard review because AI grading was unavailable.',
    strengths: [
      approach ? 'You captured an explicit approach before jumping into the answer.' : 'You created a starting point for a structured answer.',
      assumptions ? 'You wrote assumptions, which helps interviewers follow your scope.' : 'The workspace makes it easy to add assumptions next time.',
    ],
    improvements: [
      !tradeoffs ? 'Add trade-offs so the interviewer sees judgment, not only implementation.' : 'Make trade-offs sharper by naming what you would choose under constraints.',
      !complexity ? 'Add complexity, scaling, or operational implications.' : 'Tie complexity back to the requirements and expected volume.',
      solution.length < 500 ? 'Expand the solution with edge cases, APIs, data flow, or failure modes.' : 'Trim any generic prose and keep the answer interviewer-readable.',
    ],
    rubric: [
      { label: 'Problem Framing', score: assumptions ? 80 : 55, note: 'Assumptions and scope clarity.' },
      { label: 'Solution Structure', score: approach && solution ? 78 : 50, note: 'Approach, decomposition, and communication.' },
      { label: 'Trade-offs', score: tradeoffs ? 76 : 42, note: 'Decision quality and awareness of constraints.' },
    ],
    nextSteps: [
      'State the constraints before solving.',
      'Narrate trade-offs out loud as you decide.',
      'End with one measurable way to validate the solution.',
    ],
  };
}

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

    const systemPrompt = `You are Sona, an interview whiteboard coach. Grade a structured ${mode} interview answer.

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

    let grade;
    try {
      grade = await groqJSONCompletion(systemPrompt, userPrompt, { temperature: 0.3, maxTokens: 2200 });
    } catch {
      grade = fallbackGrade({ ...body, mode });
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
