import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { geminiJSONCompletion } from '@/lib/ai/gemini-client';
import { monitor } from '@/lib/monitor';

const VerifySchema = z.object({
  mode: z.enum(['generate', 'grade']).default('generate'),
  challengeType: z.enum(['quick_check', 'applied_challenge']).default('quick_check'),
  skill: z.string().trim().min(1).max(200),
  category: z.enum(['technical', 'soft', 'domain']).default('technical'),
  prompt: z.string().trim().max(5000).optional(),
  response: z.string().trim().max(20000).optional(),
  applicationId: z.string().trim().max(120).optional().nullable(),
  sourceContext: z.enum(['resume', 'application', 'pasted_jd', 'manual']).default('manual'),
  role: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  jobDescription: z.string().trim().max(15000).optional(),
});

function toSkillId(skill: string): string {
  return skill.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function clampScore(score: unknown, fallback: number): number {
  const n = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function verdictFor(score: number, challengeType: 'quick_check' | 'applied_challenge') {
  if (challengeType === 'applied_challenge' && score >= 80) return 'verified';
  if (score >= 75) return 'ready';
  if (score >= 55) return 'building';
  return 'needs_work';
}

function nextReviewDate() {
  const next = new Date();
  next.setDate(next.getDate() + 7);
  return next.toISOString();
}

function fallbackChallenge(body: z.infer<typeof VerifySchema>) {
  const roleContext = body.role ? ` for a ${body.role} role` : '';
  if (body.challengeType === 'applied_challenge') {
    return {
      prompt: `Show practical readiness in ${body.skill}${roleContext}. Describe a realistic situation where you would use it, the steps you would take, the trade-offs you would consider, and how you would explain the result to an interviewer.`,
      rubric: [
        { label: 'Practical accuracy', weight: 35 },
        { label: 'Role relevance', weight: 25 },
        { label: 'Trade-offs', weight: 20 },
        { label: 'Interview clarity', weight: 20 },
      ],
      timeBox: '12 minutes',
      expectedDepth: 'A concise applied answer with steps, trade-offs, and interviewer-ready language.',
    };
  }

  return {
    prompt: `Explain ${body.skill}${roleContext} in plain English, then give one example of how you would use it on the job and one mistake you would avoid.`,
    rubric: [
      { label: 'Core concept', weight: 40 },
      { label: 'Job example', weight: 30 },
      { label: 'Risk awareness', weight: 20 },
      { label: 'Clarity', weight: 10 },
    ],
    timeBox: '6 minutes',
    expectedDepth: 'A short answer that proves fundamentals and avoids vague buzzwords.',
  };
}

/*
 * There is deliberately no fallbackGrade().
 *
 * When AI grading was unavailable this route used to synthesise a score:
 * `clampScore(42 + min(28, length/90) + (hasExample ? 12 : 0) + ...)` — 42
 * points for the answer existing, the rest from three keyword regexes and the
 * character count. It then persisted that number as `readiness_score`, which
 * Skill Bridge renders as "Readiness N%" with no indication it was never
 * graded, and expanded the single number into a three-line rubric
 * (`score + 4`, `score + 8`, `score + 6`) — the same one-number-rescaled-into-
 * several pattern the health widget was cleaned of.
 *
 * A proof that was not graded is not a proof. The route now says so and
 * persists nothing.
 */

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 8, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  if (guard.user.tier === 'free') {
    return NextResponse.json({
      error: 'Skill Bridge verification is a Standard feature.',
      upgradeUrl: '/suite/upgrade',
    }, { status: 403 });
  }

  try {
    const parsed = VerifySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid verification request', details: parsed.error.flatten() }, { status: 400 });
    }

    const body = parsed.data;
    const skillId = toSkillId(body.skill);

    if (body.mode === 'generate') {
      const systemPrompt = `You are Taco, a career readiness coach inside Skill Bridge.

Generate one ${body.challengeType === 'quick_check' ? 'quick concept check' : 'applied proof challenge'} that verifies whether the user can honestly discuss the skill in an interview.
Do not create credentials or claim mastery. Keep the challenge practical, role-aware, and concise.

Return JSON:
{
  "prompt": string,
  "rubric": [{ "label": string, "weight": number }],
  "timeBox": string,
  "expectedDepth": string
}`;

      const userPrompt = JSON.stringify({
        skill: body.skill,
        category: body.category,
        challengeType: body.challengeType,
        role: body.role || '',
        company: body.company || '',
        sourceContext: body.sourceContext,
        jobDescription: body.jobDescription || '',
      });

      let challenge;
      try {
        challenge = await geminiJSONCompletion(systemPrompt, userPrompt, { temperature: 0.35, maxTokens: 900 });
      } catch {
        challenge = fallbackChallenge(body);
      }

      return NextResponse.json({ success: true, challenge });
    }

    if (!body.prompt || !body.response) {
      return NextResponse.json({ error: 'Prompt and response are required for grading.' }, { status: 400 });
    }

    const gradeSystemPrompt = `You are Taco, grading a Skill Bridge verification attempt.

Grade only what the user demonstrated. Do not reveal hidden reasoning. Do not invent certifications, job experience, or achievements.

Verdict rules:
- "verified" only for applied_challenge answers scoring 80+.
- "ready" for strong quick checks or near-verified applied answers.
- "building" for partial readiness.
- "needs_work" for shallow or incorrect answers.

Return JSON:
{
  "score": number,
  "verdict": "needs_work" | "building" | "ready" | "verified",
  "summary": string,
  "strengths": string[],
  "gaps": string[],
  "recommendations": string[],
  "rubric": [{ "label": string, "score": number, "note": string }]
}`;

    const gradePrompt = JSON.stringify({
      skill: body.skill,
      category: body.category,
      challengeType: body.challengeType,
      prompt: body.prompt,
      response: body.response,
      role: body.role || '',
      company: body.company || '',
      jobDescription: body.jobDescription || '',
    });

    let grade: any;
    try {
      grade = await geminiJSONCompletion(gradeSystemPrompt, gradePrompt, { temperature: 0.25, maxTokens: 1400 });
    } catch (gradeError: any) {
      // Telemetry, because there is no fallback any more: without this a
      // grader outage is invisible in monitoring while being visible to every
      // paying user, and "the grader is down" looks exactly like "nobody used
      // Skill Bridge today".
      monitor.critical('Tool: skill-bridge/verify', `grader unavailable: ${String(gradeError)}`);
      return NextResponse.json({
        error: 'Grading is unavailable right now, so this answer was not scored. Your response was not saved — try again in a moment.',
        code: 'GRADING_UNAVAILABLE',
      }, { status: 503 });
    }

    // No default score either. `clampScore(grade?.score, 60)` invented a 60 for
    // any response the grader came back without a number for.
    if (typeof grade?.score !== 'number' || !Number.isFinite(grade.score)) {
      monitor.critical('Tool: skill-bridge/verify', `grader returned no score for skill "${body.skill}"`);
      return NextResponse.json({
        error: 'Grading came back without a score, so nothing was recorded. Try again in a moment.',
        code: 'GRADING_INCOMPLETE',
      }, { status: 503 });
    }

    const score = clampScore(grade.score, 60);
    const verdict = ['needs_work', 'building', 'ready', 'verified'].includes(grade?.verdict)
      ? grade.verdict
      : verdictFor(score, body.challengeType);
    const now = new Date().toISOString();

    const verification = {
      user_id: guard.user.uid,
      skill: body.skill,
      skill_id: skillId,
      category: body.category,
      applicationId: body.applicationId || null,
      sourceContext: body.sourceContext,
      challengeType: body.challengeType,
      prompt: body.prompt,
      response: body.response,
      score,
      verdict,
      summary: String(grade?.summary || ''),
      rubric: Array.isArray(grade?.rubric) ? grade.rubric.slice(0, 6) : [],
      strengths: Array.isArray(grade?.strengths) ? grade.strengths.slice(0, 6) : [],
      gaps: Array.isArray(grade?.gaps) ? grade.gaps.slice(0, 6) : [],
      recommendations: Array.isArray(grade?.recommendations) ? grade.recommendations.slice(0, 6) : [],
      createdAt: now,
    };

    const db = getAdminDb();
    const verificationRef = await db
      .collection('users')
      .doc(guard.user.uid)
      .collection('skill_verifications')
      .add(verification);

    const progressRef = db
      .collection('users')
      .doc(guard.user.uid)
      .collection('study_progress')
      .doc(skillId);
    const existingProgress = await progressRef.get();
    const existingData = existingProgress.exists ? existingProgress.data() : null;

    const newReadinessStatus = verdict === 'verified'
      ? 'verified'
      : verdict === 'ready'
        ? 'ready_to_verify'
        : 'learning';
    const readinessStatus = existingData?.readiness_status === 'verified' ? 'verified' : newReadinessStatus;
    const nextProofLevel = verdict === 'verified'
      ? body.challengeType
      : body.challengeType === 'quick_check' && score >= 75
        ? 'quick_check'
        : 'none';
    const proofLevel = ['applied_challenge', 'interview_drill'].includes(existingData?.proof_level)
      ? existingData?.proof_level
      : nextProofLevel;

    const progressUpdate: Record<string, any> = {
      user_id: guard.user.uid,
      skill: body.skill,
      skill_id: skillId,
      category: body.category,
      readiness_status: readinessStatus,
      readiness_score: Math.max(Number(existingData?.readiness_score || 0), score),
      proof_level: proofLevel,
      last_verified_at: now,
      next_review_at: nextReviewDate(),
      verification_attempt_ids: FieldValue.arrayUnion(verificationRef.id),
      source_context: body.sourceContext,
      last_activity_at: now,
    };

    if (!existingProgress.exists) {
      progressUpdate.total_days = 4;
      progressUpdate.completed_days = [];
      progressUpdate.email_reminders = false;
      progressUpdate.started_at = now;
    }

    if (body.applicationId) {
      progressUpdate.application_ids = FieldValue.arrayUnion(body.applicationId);
    }

    await progressRef.set(progressUpdate, { merge: true });

    return NextResponse.json({
      success: true,
      verification: { id: verificationRef.id, ...verification },
      grade: { ...grade, score, verdict },
    });
  } catch (error: any) {
    monitor.critical('Tool: skill-bridge/verify', String(error));
    return NextResponse.json({ error: error.message || 'Failed to verify skill' }, { status: 500 });
  }
}
