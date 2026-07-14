import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute, incrementUsage } from '@/lib/api-auth';
import { validateBody } from '@/lib/validate';
import { GalleryToolSchema } from '@/lib/schemas';
import { sanitizeForAI } from '@/lib/sanitize';
import { buildGalleryPrompt } from '@/lib/writing-prompts';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { monitor } from '@/lib/monitor';

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function runWordCounter(input: string) {
  const words = countWords(input);
  const characters = input.length;
  const charactersNoSpaces = input.replace(/\s/g, '').length;
  const sentences = input.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  const paragraphs = input.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
  const avgWordsPerSentence = sentences > 0 ? Math.round(words / sentences) : 0;
  const topWords = Object.entries(
    input
      .toLowerCase()
      .replace(/[^\w\s'-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .reduce<Record<string, number>>((acc, word) => {
        acc[word] = (acc[word] || 0) + 1;
        return acc;
      }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }));

  return {
    words,
    characters,
    charactersNoSpaces,
    sentences,
    paragraphs,
    avgWordsPerSentence,
    readingTimeMinutes: Math.max(1, Math.ceil(words / 250)),
    speakingTimeMinutes: Math.max(1, Math.ceil(words / 150)),
    topWords,
  };
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

    const { tool, input, options } = validated.data;
    const safeInput = sanitizeForAI(input);

    let result: unknown;

    if (tool === 'word-counter') {
      result = runWordCounter(safeInput);
    } else {
      const prompt = buildGalleryPrompt(tool, safeInput);
      result = await groqJSONCompletion(prompt.system, prompt.user, {
        temperature: typeof options?.temperature === 'number' ? options.temperature : 0.25,
        maxTokens: typeof options?.maxTokens === 'number' ? options.maxTokens : 1800,
      });
    }

    if (guard.user.tier === 'free' && !guard.user.uid.startsWith('anon:')) {
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
