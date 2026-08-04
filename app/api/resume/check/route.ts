/**
 * Resume Checker API
 * Gemini-only fast analysis — designed as free-tier funnel tool
 * Scores ATS compliance, keyword match, formatting, and provides suggestions
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { incrementUsage } from '@/lib/usage-tracker';
import { geminiQuickCheck } from '@/lib/ai/dual-ai';
import { validateBody } from '@/lib/validate';
import { ResumeCheckSchema } from '@/lib/schemas';
import { sanitizeForAI } from '@/lib/sanitize';
import { monitor } from '@/lib/monitor';

interface ResumeCheckResult {
  atsScore: number;
  keywordMatch: number;
  formattingScore: number;
  overallGrade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';
  strengths: string[];
  issues: string[];
  suggestions: string[];
  sectionScores: {
    summary: number;
    experience: number;
    skills: number;
    education: number;
    formatting: number;
  };
}

export async function POST(req: NextRequest) {
  try {
    // Free-tier funnel tool: FREE_CAPS.resumeChecks (3 lifetime) is enforced by
    // guardApiRoute, which returns a 429 carrying used/cap/upgradeUrl. The route
    // path is not in ROUTE_FEATURE_MAP, so the feature must be passed explicitly.
    const guard = await guardApiRoute(req, {
      rateLimit: 5,
      rateLimitWindow: 60_000,
      feature: 'resumeChecks',
    });
    if (guard.error) return guard.error;

    const validated = await validateBody(req, ResumeCheckSchema);
    if (!validated.success) return validated.error;
    const { resumeText, targetJD } = validated.data;

    const safeResume = sanitizeForAI(resumeText);
    const safeJD = targetJD ? sanitizeForAI(targetJD) : undefined;

    const systemPrompt = `You are an expert ATS (Applicant Tracking System) analyst and resume reviewer.
Analyze the resume thoroughly and provide a detailed quality assessment.

You MUST respond with a JSON object containing:
- "atsScore": number 0-100 (how well it passes ATS parsing)
- "keywordMatch": number 0-100 (keyword density and relevance${targetJD ? ' against the provided job description' : ''})
- "formattingScore": number 0-100 (structure, readability, length)
- "overallGrade": "A+" | "A" | "B+" | "B" | "C" | "D" | "F"
- "strengths": string[] (3-5 things done well)
- "issues": string[] (3-5 specific problems found)
- "suggestions": string[] (3-5 actionable improvements)
- "sectionScores": { "summary": number, "experience": number, "skills": number, "education": number, "formatting": number } (each 0-100)

Be specific and actionable. Reference exact text from the resume when pointing out issues.
${targetJD ? 'Score keyword match against the provided job description.' : 'Score keyword match based on general industry standards.'}`;

    const userPrompt = `Analyze this resume:

${safeResume}
${safeJD ? `\n\nTARGET JOB DESCRIPTION:\n${safeJD}` : ''}

Provide your complete analysis as a JSON object.`;

    const result = await geminiQuickCheck<ResumeCheckResult>(systemPrompt, userPrompt);

    await incrementUsage(guard.user.uid, 'resumeChecks');

    return NextResponse.json({
      ...result,
      poweredBy: 'gemini-flash',
    });
  } catch (error: unknown) {
    console.error('[api/resume/check] Error:', error);
    monitor.critical('Tool: resume/check', String(error));
    return NextResponse.json(
      { error: 'Failed to check resume' },
      { status: 500 }
    );
  }
}
