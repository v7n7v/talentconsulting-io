/**
 * AI Detector Uniqueness Check API
 * Sends text to low-cost OpenRouter models for originality / plagiarism-pattern analysis.
 * Lighter weight than humanize — still metered under writingTools usage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { validateBody } from '@/lib/validate';
import { UniquenessSchema } from '@/lib/schemas';
import { buildUniquenessPrompt } from '@/lib/writing-prompts';
import { incrementUsage } from '@/lib/usage-tracker';
import { monitor } from '@/lib/monitor';
import { normalizeText, sanitizeForAI } from '@/lib/sanitize';
import { writingJSONCompletion } from '@/lib/ai/writing-model-router';

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, {
      rateLimit: 5,
      rateLimitWindow: 60_000,
      allowAnonymous: false,
      feature: 'writingTools',
    });
    if (guard.error) return guard.error;

    const validated = await validateBody(req, UniquenessSchema);
    if (!validated.success) return validated.error;
    const text = normalizeText(sanitizeForAI(validated.data.text));

    if (text.trim().split(/\s+/).length < 20) {
      return NextResponse.json(
        { error: 'Text must be at least 20 words for uniqueness analysis' },
        { status: 400 }
      );
    }

    const systemPrompt = buildUniquenessPrompt();
    const userPrompt = `Analyze the uniqueness and originality of this text:\n\n${text}`;

    const { result } = await writingJSONCompletion<{
      uniquenessScore: number;
      verdict: 'highly_unique' | 'mostly_unique' | 'some_overlap' | 'needs_revision';
      analysis: Array<{
        paragraphIndex: number;
        score: number;
        concern: string | null;
        suggestion: string | null;
      }>;
      summary: string;
    }>({
      task: 'verify',
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      maxTokens: 2048,
      title: 'TalentConsulting.io Writing Uniqueness',
    });

    await incrementUsage(guard.user.uid, 'writingTools');

    return NextResponse.json(result);

  } catch (error: unknown) {
    console.error('[api/writing/uniqueness] Error:', error);
    monitor.critical('Tool: writing/uniqueness', String(error));
    return NextResponse.json(
      { error: 'Failed to check uniqueness' },
      { status: 500 }
    );
  }
}
