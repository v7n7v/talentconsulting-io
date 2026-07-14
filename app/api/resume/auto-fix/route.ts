/**
 * Resume Auto-Fix API
 * Takes resume text + suggestions from resume check → GPT rewrites → Gemini rechecks
 * Pro-only feature — the core of the dual-AI "check and balance" system
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { dualAIGenerate } from '@/lib/ai/dual-ai';
import { validateBody } from '@/lib/validate';
import { AutoFixSchema } from '@/lib/schemas';
import { sanitizeForAI } from '@/lib/sanitize';
import { monitor } from '@/lib/monitor';
import { applyResumeMorphGuardrails, resolveResumeMorphAccess } from '@/lib/resume-morph-guardrails';

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 3, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;

    // Pro-only feature
    if (guard.user.tier === 'free') {
      return NextResponse.json(
        { error: 'Auto-Fix is a Pro feature. Upgrade to access dual-AI resume enhancement.', upgrade: true },
        { status: 403 }
      );
    }

    const validated = await validateBody(req, AutoFixSchema);
    if (!validated.success) return validated.error;
    const { resumeText, resume, suggestions, targetJD } = validated.data;

    const writerPrompt = `You are a veteran resume writer and career strategist. Write like a real human — never like an AI.
Apply the given improvement suggestions while sounding natural and authentic.

RULES:
1. Apply ALL suggested improvements to the resume content
2. Maintain the person's authentic voice — keep their quirks, their tone, their way of saying things
3. Strengthen weak bullet points using only facts and numbers already present in the source. Never create, estimate, improve, round, or infer a metric. If the source has no metric, keep the statement qualitative and explain what evidence the user could add.
4. Improve keyword density for ATS — but bury keywords naturally in achievements, never list-dump them
5. Keep the same structure (sections, ordering) — only improve content quality

ANTI-AI-DETECTION — WRITE LIKE A HUMAN:
6. BANNED WORDS — never use: "utilized", "leveraged", "spearheaded", "synergized", "facilitated", "orchestrated", "endeavored", "passionate about", "results-driven", "detail-oriented", "proven track record"
7. Use natural verbs: "built", "ran", "led", "fixed", "grew", "cut", "shipped", "owned", "drove", "handled"
8. Vary sentence length wildly. Mix short punches with longer story-driven bullets
9. Each bullet should tell a micro-story: WHAT → HOW → IMPACT
10. Real humans write "Helped the team hit Q3 targets" not "Facilitated achievement of quarterly objectives"

CRITICAL: Return the improved resume in valid JSON format as a resume data object with these fields:
{
  "name": "string",
  "title": "string",
  "email": "string",
  "phone": "string",
  "location": "string",
  "summary": "string (improved)",
  "experience": [{"company": "string", "title": "string", "duration": "string", "achievements": ["string"]}],
  "education": [{"school": "string", "degree": "string", "year": "string", "details": "string"}],
  "skills": ["string"],
  "certifications": ["string"]
}`;

    const userPrompt = `Here is the resume to improve:

${sanitizeForAI(resumeText)}

${targetJD ? `TARGET JOB DESCRIPTION:\n${sanitizeForAI(targetJD)}\n` : ''}
EXPERT SUGGESTIONS TO APPLY:
${suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}

Apply all suggestions and return the improved resume as a JSON object.`;

    const result = await dualAIGenerate(
      writerPrompt,
      userPrompt,
      'Resume quality after applying improvement suggestions',
      [
        'All suggestions have been addressed',
        'Existing metrics are preserved and no new metric is introduced',
        'Keywords match the target role',
        'Professional tone maintained',
        'ATS-friendly formatting preserved',
      ],
      { writerTemp: 0.5, refineThreshold: 70, maxTokens: 4096 }
    );

    // Parse the improved resume from the content
    let improvedResume;
    try {
      improvedResume = JSON.parse(result.content);
    } catch {
      const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        improvedResume = JSON.parse(jsonMatch[1]);
      } else {
        const objMatch = result.content.match(/\{[\s\S]*\}/);
        if (objMatch) improvedResume = JSON.parse(objMatch[0]);
        else throw new Error('Could not parse improved resume from AI response');
      }
    }

    const guardedResult = applyResumeMorphGuardrails(
      resume,
      improvedResume,
      resolveResumeMorphAccess({ requestedMorphPercentage: 80, hasFullConsent: false, mode: 'automated' }),
    );

    return NextResponse.json({
      improvedResume: guardedResult.resume,
      guardrailReport: guardedResult.report,
      score: result.score,
      refined: result.refined,
      modelAgreement: result.modelAgreement,
      validationNotes: result.validationNotes,
      poweredBy: 'dual-ai',
    });
  } catch (error: unknown) {
    console.error('[api/resume/auto-fix] Error:', error);
    monitor.critical('Tool: resume/auto-fix', String(error));
    return NextResponse.json(
      { error: 'Failed to auto-fix resume' },
      { status: 500 }
    );
  }
}
