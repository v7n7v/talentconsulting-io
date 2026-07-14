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

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function fallbackGrade(transcript: TranscriptEntry[], telemetry: any) {
  const userWords = transcript
    .filter(entry => entry.role === 'user')
    .flatMap(entry => entry.text.split(/\s+/).filter(Boolean)).length;
  const questionCount = transcript.filter(entry => entry.role === 'ai' && entry.text.includes('?')).length;
  const starScore = Number(telemetry?.starScore || 0);
  const keywordCoverage = Number(telemetry?.keywordCoverage || 0);
  const fillerRatio = Number(telemetry?.fillerRatio || 0);
  const wpm = Number(telemetry?.wpm || 0);

  const pacingScore = wpm === 0 ? 55 : wpm < 110 || wpm > 175 ? 68 : 84;
  const fillerScore = fillerRatio > 6 ? 58 : fillerRatio > 3 ? 72 : 86;
  const depthScore = userWords > 500 ? 84 : userWords > 180 ? 72 : 58;
  const score = clampScore((starScore * 0.25) + (keywordCoverage * 0.2) + (pacingScore * 0.2) + (fillerScore * 0.15) + (depthScore * 0.2));

  return {
    score,
    summary: questionCount > 0
      ? 'Sona created a deterministic debrief from your transcript and delivery telemetry because AI grading was unavailable.'
      : 'The session was too short for a full mock debrief. Add more answers to unlock stronger coaching.',
    strengths: [
      userWords > 180 ? 'You gave enough answer volume for meaningful coaching.' : 'You started the practice flow and created a baseline.',
      fillerRatio <= 3 ? 'Your filler-word rate looks controlled.' : 'You have clear filler-word targets to practice next.',
      keywordCoverage > 40 ? 'You referenced several role-relevant keywords.' : 'The transcript gives Sona a starting point for targeted drills.',
    ],
    improvements: [
      starScore < 60 ? 'Use a clearer STAR arc: situation, task, action, result.' : 'Keep tightening STAR structure so every answer lands with impact.',
      keywordCoverage < 55 ? 'Mirror more of the target role language from the job description.' : 'Connect keywords to concrete outcomes, not just mentions.',
      wpm > 175 ? 'Slow down slightly and leave room for emphasis.' : wpm < 110 ? 'Add more energy and detail so answers do not feel underdeveloped.' : 'Preserve your current pacing while adding sharper examples.',
    ],
    answerFeedback: transcript.filter(entry => entry.role === 'user').slice(0, 5).map((entry, index) => ({
      questionIndex: index + 1,
      score: clampScore(score - 4 + index),
      feedback: entry.text.split(/\s+/).length < 45
        ? 'This answer is short. Add context, your direct action, and a measurable result.'
        : 'This answer has enough substance. Tighten the opening and make the result more specific.',
    })),
    rubric: [
      { label: 'Structure', score: clampScore(starScore || 55), note: 'Measured through STAR markers and answer organization.' },
      { label: 'Delivery', score: clampScore((pacingScore + fillerScore) / 2), note: 'Measured through pacing and filler-word telemetry.' },
      { label: 'Role Fit', score: clampScore(keywordCoverage || 50), note: 'Measured through job-description keyword coverage.' },
    ],
    recommendations: [
      'Practice one behavioral answer with a measurable result.',
      'Run a five-minute drill on the weakest category from this debrief.',
      'Save strong answers into Story Bank so Sona can reuse them later.',
    ],
    nextDrills: [
      { title: 'STAR Compression', focus: 'Answer in 90 seconds with one metric.' },
      { title: 'Keyword Bridge', focus: 'Tie one role requirement to a real project.' },
    ],
    weakCategories: [
      starScore < 60 ? 'STAR' : null,
      fillerRatio > 3 ? 'filler_words' : null,
      keywordCoverage < 55 ? 'specificity' : null,
    ].filter(Boolean),
  };
}

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

    const systemPrompt = `You are Sona, a warm but precise interview coach for Talent Studio. Grade a complete practice interview session.

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

    let grade;
    try {
      grade = await groqJSONCompletion(systemPrompt, userPrompt, { temperature: 0.35, maxTokens: 2600 });
    } catch (error) {
      grade = fallbackGrade(transcript, telemetry);
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
