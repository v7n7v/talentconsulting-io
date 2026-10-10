import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { z } from 'zod';
import { requirePractice, resolvePracticeEvidence, practiceError } from '@/lib/practice-session-server';
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

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function POST(req: NextRequest) {
  // Grading and retries use the reservation made when the practice was
  // generated. Rechecking/incrementing the lifetime meter here used to deny a
  // Free user's final debrief after their last permitted practice.
  const guard = await guardApiRoute(req, { rateLimit: 8, rateLimitWindow: 60_000, skipUsageCap: true });
  if (guard.error) return guard.error;

  try {
    const body = await req.json();
    const transcript = cleanTranscript(body?.transcript);
    const telemetry = body?.telemetry && typeof body.telemetry === 'object' ? body.telemetry : {};
    const sessionId = cleanString(body?.sessionId, 120);

    const practice = await requirePractice(guard.user.uid, sessionId);
    const persistedContext = practice.data;
    const evidence = persistedContext.evidenceSnapshot || await resolvePracticeEvidence(guard.user.uid, persistedContext);
    let persisted = true;
    if (persistedContext.scores?.summary) return NextResponse.json({ grade: persistedContext.scores, success: true, persisted: true });

    if (!transcript.some(entry => entry.role === 'user')) {
      return NextResponse.json({ error: 'Transcript required for session grading' }, { status: 400 });
    }

    await practice.session.set({ transcript, updatedAt: new Date().toISOString() }, { merge: true });

    const systemPrompt = `You are Taco, a warm but precise interview coach for Talent Studio. Grade a complete practice interview session.

Return concise, user-visible coaching only. Do not reveal hidden reasoning. Do not pretend this was a real employer interview. Assess answer content only. Do not infer speaking pace, delivery, or factual verification from text or elapsed time. Use the transcript, job description, role, company, persona, and interview type when present.

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
      role: cleanString(persistedContext.role || body?.role, 180),
      company: cleanString(persistedContext.company || body?.company, 180),
      jobDescription: cleanString(persistedContext.jobDescription || body?.jobDescription, 5000),
      persona: cleanString(persistedContext.persona || body?.persona, 80),
      interviewType: cleanString(persistedContext.interviewType || body?.interviewType, 80),
      resumeVersionId: cleanString(persistedContext.resumeVersionId, 120),
      selectedStoryIds: Array.isArray(persistedContext.selectedStoryIds) ? persistedContext.selectedStoryIds : [],
      evidence,
      transcript,
    });

    let grade;
    try {
      grade = await groqJSONCompletion(systemPrompt, userPrompt, { temperature: 0.35, maxTokens: 2600 });
    } catch (error) {
      monitor.warn('Interview grading unavailable', String(error));
      return NextResponse.json({ error: 'Feedback is unavailable right now. Your saved transcript is still available for retry.', code: 'GRADING_UNAVAILABLE' }, { status: 503 });
    }

    const str = z.string().min(1).max(6000);
    const score = z.number().min(0).max(100);
    grade = z.object({
      score, summary: str, strengths: z.array(str).max(8), improvements: z.array(str).max(8),
      answerFeedback: z.array(z.object({ questionIndex: z.number().int().positive(), score, feedback: str, rewriteTip: str })).max(120),
      rubric: z.array(z.object({ label: str, score, note: str })).min(1).max(8),
      recommendations: z.array(str).max(8), nextDrills: z.array(z.object({ title: str, focus: str })).max(8),
      storyCandidates: z.array(z.object({ title: str, why: str })).max(8), weakCategories: z.array(str).max(8),
    }).parse((grade as any)?.result || grade);
    grade = { ...grade, provenance: 'AI assessment of practice answer content; not factual verification' };

    if (sessionId) {
      try {
        await getAdminDb().collection('users').doc(guard.user.uid).collection('interview_sessions').doc(sessionId).set({
          scores: grade,
          recommendations: Array.isArray((grade as any)?.recommendations) ? (grade as any).recommendations : [],
          nextDrills: Array.isArray((grade as any)?.nextDrills) ? (grade as any).nextDrills : [],
          status: 'completed',
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (persistError) {
        persisted = false;
        monitor.critical('Tool: interview/session-grade persistence', String(persistError));
      }
    }

    if (!persisted) {
      return NextResponse.json({ error: 'Feedback was generated but could not be saved. Retry this session to save it.', code: 'PERSISTENCE_UNAVAILABLE', grade }, { status: 503 });
    }
    return NextResponse.json({ grade, success: true, persisted: true });
  } catch (error: any) {
    monitor.critical('Tool: interview/session-grade', String(error));
    return NextResponse.json({ error: 'Feedback could not be saved. Retry this session.', code: practiceError(error).code }, { status: practiceError(error).status });
  }
}
