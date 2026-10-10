import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute, incrementUsage } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { z } from 'zod';
import { claimPractice, releasePractice, finishPractice, practiceError } from '@/lib/practice-session-server';
import { monitor } from '@/lib/monitor';

const WHITEBOARD_MODES = new Set(['coding', 'system_design', 'case']);

function cleanString(value: unknown, max = 8000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 8, rateLimitWindow: 60_000, skipUsageCap: true });
  if (guard.error) return guard.error;

  let claim: Awaited<ReturnType<typeof claimPractice>> | undefined;
  try {
    const body = await req.json();
    const mode = WHITEBOARD_MODES.has(body?.mode) ? body.mode : 'system_design';
    const sessionId = cleanString(body?.sessionId, 120);
    const prompt = cleanString(body?.prompt, 3000);

    if (!prompt || !cleanString(body?.solution)) {
      return NextResponse.json({ error: 'Whiteboard prompt required' }, { status: 400 });
    }

    claim = await claimPractice(guard.user.uid, sessionId, guard.user.tier, 'whiteboardGrade');
    if (claim.data.mode !== 'technical_whiteboard') throw new Error('SESSION_MODE_MISMATCH');
    if (claim.cached) return NextResponse.json({ grade: claim.cached, success: true, persisted: true });
    await claim.session.set({ whiteboard: { mode, prompt, solution: cleanString(body.solution), approach: cleanString(body.approach), assumptions: cleanString(body.assumptions), complexity: cleanString(body.complexity), tradeoffs: cleanString(body.tradeoffs) } }, { merge: true });
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

    let grade;
    try {
      grade = await groqJSONCompletion(systemPrompt, userPrompt, { temperature: 0.3, maxTokens: 2200 });
    } catch {
      throw new Error('GRADING_UNAVAILABLE');
    }
    const str = z.string().min(1); const score = z.number().min(0).max(100);
    grade = z.object({ score, summary: str, strengths: z.array(str), improvements: z.array(str), rubric: z.array(z.object({ label: str, score, note: str })).min(1), missedConsiderations: z.array(str), nextSteps: z.array(str), followUpQuestion: str }).parse((grade as any)?.result || grade);

    await finishPractice(claim, 'whiteboardGrade', grade, { scores: grade, status: 'completed', completedAt: new Date().toISOString() });
    return NextResponse.json({ grade, success: true, persisted: true });
  } catch (error: any) {
    await releasePractice(claim, 'whiteboardGrade').catch(() => {});
    monitor.critical('Tool: interview/whiteboard-grade', String(error));
    return NextResponse.json({ error: error.message || 'Failed to grade whiteboard answer' }, { status: practiceError(error).status });
  }
}
