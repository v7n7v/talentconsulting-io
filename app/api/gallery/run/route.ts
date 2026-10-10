import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute, incrementUsage } from '@/lib/api-auth';
import { validateBody } from '@/lib/validate';
import { GalleryToolSchema } from '@/lib/schemas';
import { sanitizeForAI } from '@/lib/sanitize';
import { buildGalleryPrompt } from '@/lib/writing-prompts';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { galleryOutputs, paidGalleryTools, runWordCounter } from '@/lib/gallery-contracts';
import { monitor } from '@/lib/monitor';

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(request: NextRequest) {
  try {
    const guard = await guardApiRoute(request, {
      allowAnonymous: true,
      feature: 'galleryTools',
      rateLimit: 12,
      rateLimitWindow: 60_000,
    });
    if (guard.error) return guard.error;

    const validated = await validateBody(request, GalleryToolSchema);
    if (!validated.success) return validated.error;

    const { tool, input } = validated.data;
    const paidTools = paidGalleryTools;
    if (paidTools.has(tool) && (guard.user.uid.startsWith('anon:') || !['pro', 'studio', 'god'].includes(guard.user.tier))) {
      return NextResponse.json({ error: 'This writing tool requires a Pro plan.' }, { status: 403 });
    }
    const safeInput = sanitizeForAI(input);

    let result: unknown;

    if (tool === 'word-counter') {
      result = runWordCounter(input);
    } else {
      const prompt = buildGalleryPrompt(tool, safeInput);
      result = await groqJSONCompletion(prompt.system, prompt.user, {
        temperature: 0.25,
        maxTokens: 1800,
      });
    }

    if (tool !== 'word-counter') {
      const parsed = galleryOutputs[tool]?.safeParse(result);
      if (!parsed?.success) return NextResponse.json({ error: 'The writing tool returned an invalid result. Your draft was preserved; please retry.' }, { status: 502 });
      result = parsed.data;
      if (tool === 'summarizer') { const summary = result as { brief: string; detailed: string; wordCount: unknown }; summary.wordCount = { original: countWords(input), brief: countWords(summary.brief), detailed: countWords(summary.detailed) }; }
    }

    if (tool !== 'word-counter' && guard.user.tier === 'free' && !guard.user.uid.startsWith('anon:')) {
      await incrementUsage(guard.user.uid, 'galleryTools');
    }

    return NextResponse.json({
      result,
      metadata: {
        tool,
        source: 'writing-toolkit',
        wordCount: countWords(safeInput),
      },
    });
  } catch (error) {
    console.error('[api/gallery/run] failed');
    monitor.critical('Tool: gallery/run', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Writing Toolkit could not complete this request.' }, { status: 500 });
  }
}
