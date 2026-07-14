/**
 * AI Detector Humanize API
 * Takes flagged text + domain + tone → Returns humanized version via quality-routed writing models.
 * Enforces word caps per tier (Pro: 4K/mo, Studio: 50K/mo).
 * Post-processes to strip AI punctuation artifacts (em-dashes, semicolons, etc).
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { validateBody } from '@/lib/validate';
import { HumanizeSchema } from '@/lib/schemas';
import { buildHumanizePrompt } from '@/lib/writing-prompts';
import { countWords, checkWritingWordsAllowed, recordWritingWords, incrementUsage } from '@/lib/usage-tracker';
import { detectAI } from '@/lib/ai-detection';
import { normalizeText, sanitizeForAI } from '@/lib/sanitize';
import { monitor } from '@/lib/monitor';
import { buildTrustReport } from '@/lib/writing-pipeline';
import { writingJSONCompletion } from '@/lib/ai/writing-model-router';
import {
  buildFallbackPatches,
  evaluateHumanizationQuality,
  extractProtectedTerms,
  mergeParagraphPatches,
  splitParagraphs,
  type HumanizePatch,
  type QualityDecision,
} from '@/lib/writing-quality';

/** Strip AI-telltale punctuation from humanized text */
function cleanAIPunctuation(text: string): string {
  let cleaned = text;

  // Replace em-dashes with comma or period
  cleaned = cleaned.replace(/\s*—\s*/g, ', ');
  cleaned = cleaned.replace(/\s*--\s*/g, ', ');

  // Replace en-dashes that aren't in number ranges (e.g. "2020–2023")
  cleaned = cleaned.replace(/(?<!\d)\s*–\s*(?!\d)/g, ', ');

  // Remove excessive semicolons (replace with period + capitalize)
  let semicolonCount = 0;
  cleaned = cleaned.replace(/;\s*/g, () => {
    semicolonCount++;
    if (semicolonCount > 1) return '. ';
    return '; ';
  });

  // Remove AI transition starters
  const aiStarters = [
    /^Moreover,\s*/gim,
    /^Furthermore,\s*/gim,
    /^Additionally,\s*/gim,
    /^In conclusion,\s*/gim,
    /^It is worth noting that\s*/gim,
    /^It is important to note that\s*/gim,
  ];
  for (const pattern of aiStarters) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Fix double commas from replacements
  cleaned = cleaned.replace(/,\s*,/g, ',');

  // Fix sentence starts after period replacements
  cleaned = cleaned.replace(/\.\s+([a-z])/g, (_, letter) => `. ${letter.toUpperCase()}`);

  return cleaned;
}

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, {
      rateLimit: 5,
      rateLimitWindow: 60_000,
      allowAnonymous: false,
      feature: 'writingTools',
    });
    if (guard.error) return guard.error;

    const validated = await validateBody(req, HumanizeSchema);
    if (!validated.success) return validated.error;
    const { text: rawText, domain, tone, lengthMode, mode, intensity, qualityMode, protectedTerms: manualProtectedTerms, rewriteScope, paragraphIndices } = validated.data;

    // Sanitize + normalize input — prompt injection defense + homoglyph stripping
    const text = normalizeText(sanitizeForAI(rawText));

    const wordCount = countWords(text);
    if (wordCount < 10) {
      return NextResponse.json(
        { error: 'Text must be at least 10 words' },
        { status: 400 }
      );
    }

    // Enforce word cap (handles free/pro/studio limits naturally)
    const tier = guard.user.tier || 'free';

    const wordCheck = await checkWritingWordsAllowed(guard.user.uid, tier, wordCount);
    if (!wordCheck.allowed) {
      return NextResponse.json(
        {
          error: `Monthly word limit reached (${wordCheck.usedWords}/${wordCheck.capWords} words used)`,
          usedWords: wordCheck.usedWords,
          capWords: wordCheck.capWords,
          remainingWords: wordCheck.remainingWords,
          upgrade: tier === 'pro',
        },
        { status: 429 }
      );
    }

    const originalDetection = detectAI(text);
    const protectedTerms = extractProtectedTerms(text, manualProtectedTerms || []);
    const paragraphs = splitParagraphs(text);
    const requestedParagraphs = paragraphIndices?.filter(i => i >= 0 && i < paragraphs.length) || [];
    const targetParagraphs = rewriteScope === 'full' ? [] : requestedParagraphs;

    // Build targeted rewrite prompt with tone
    const systemPrompt = buildHumanizePrompt(domain, tone, lengthMode);

    let userPrompt: string;
    const modeInstruction = mode
      ? `Rewrite mode: ${mode.replace(/_/g, ' ')}. Preserve meaning and authorship cues; improve trust signals without making guarantees about detector outcomes.`
      : 'Rewrite mode: standard humanization. Preserve meaning and authorship cues.';

    const protectedTermInstruction = protectedTerms.length
      ? `Protected terms that must remain exactly present where relevant: ${protectedTerms.slice(0, 80).join('; ')}`
      : 'No explicit protected terms were supplied, but preserve all facts, names, numbers, dates, URLs, citations, tools, and company names.';

    if (targetParagraphs.length > 0) {
      const flaggedParagraphs = targetParagraphs
        .map(i => `[Paragraph ${i}]: ${paragraphs[i]}`)
        .join('\n\n');

      userPrompt = `Create a paragraph-level rewrite plan, then rewrite ONLY the flagged paragraphs. Do not rewrite clean paragraphs.

${modeInstruction}
Intensity: ${intensity}. Light means minimal edits, balanced means natural clarity/rhythm improvements, deep means stronger restructuring while preserving facts.
${protectedTermInstruction}

FLAGGED PARAGRAPHS (rewrite these specifically):
${flaggedParagraphs}

FULL CONTEXT:
${text}

Respond with JSON:
{
  "patches": [
    { "paragraphIndex": number, "rewritten": "replacement paragraph", "reason": "why this paragraph changed", "riskReduced": number }
  ],
  "changes": [{ "original": "exact snippet", "rewritten": "replacement", "reason": "why" }],
  "stats": { "sentenceLengthStdDev": number, "bannedWordsRemoved": number, "burstinessRange": number }
}

Use zero-based paragraphIndex values from the flagged paragraph labels. Tone: ${tone}. Length mode: ${lengthMode}.`;
    } else {
      userPrompt = `${modeInstruction}
Intensity: ${intensity}. Light means minimal edits, balanced means natural clarity/rhythm improvements, deep means stronger restructuring while preserving facts.
${protectedTermInstruction}

Create a short rewrite plan internally, then humanize the full text with a ${tone} tone. Length mode: ${lengthMode} (original word count: ${wordCount}).

Respond with JSON:
{
  "rewritten": "full rewritten text preserving paragraph breaks",
  "changes": [{ "original": "exact snippet", "rewritten": "replacement", "reason": "why" }],
  "stats": { "sentenceLengthStdDev": number, "bannedWordsRemoved": number, "burstinessRange": number }
}

TEXT:
${text}`;
    }


    type HumanizeModelResult = {
      rewritten?: string;
      patches?: HumanizePatch[];
      changes: Array<{ original: string; rewritten: string; reason: string }>;
      stats: { sentenceLengthStdDev: number; bannedWordsRemoved: number; burstinessRange: number };
    };

    const maxTokens = Math.min(16384, Math.max(8192, wordCount * 8));
    const temp = intensity === 'deep' ? 0.82 : tone === 'creative' ? 0.85 : tone === 'casual' ? 0.78 : intensity === 'light' ? 0.55 : 0.7;
    let latestQualityDecision: QualityDecision | null = null;

    const materialize = (candidate: HumanizeModelResult) => {
      const patches = targetParagraphs.length > 0
        ? (candidate.patches?.length ? candidate.patches : buildFallbackPatches(text, candidate.rewritten || '', targetParagraphs))
        : buildFallbackPatches(text, candidate.rewritten || '', []);
      const merged = targetParagraphs.length > 0
        ? mergeParagraphPatches(text, patches)
        : (candidate.rewritten || text);
      const cleaned = cleanAIPunctuation(merged);
      return { cleaned, patches };
    };

    const completion = await writingJSONCompletion<HumanizeModelResult>({
      task: 'humanize',
      systemPrompt,
      userPrompt,
      temperature: temp,
      maxTokens,
      userTier: tier,
      qualityMode,
      title: 'TalentConsulting.io Suite Humanizer',
      qualityPolicy: candidate => {
        const { cleaned } = materialize(candidate);
        const finalDetection = detectAI(cleaned);
        const decision = evaluateHumanizationQuality({
          originalText: text,
          rewrittenText: cleaned,
          protectedTerms,
          lengthMode,
          originalDetection,
          finalDetection,
        });
        latestQualityDecision = decision;
        return decision;
      },
    });
    const result = completion.result;
    const { cleaned: cleanedText, patches } = materialize(result);
    const recheckResult = detectAI(cleanedText);
    const qualityDecision = latestQualityDecision || completion.qualityDecision;
    const retryCount = 0;

    // Record usage after successful humanization (only count final output)
    const outputWords = countWords(cleanedText);
    await recordWritingWords(guard.user.uid, outputWords);
    await incrementUsage(guard.user.uid, 'writingTools');

    return NextResponse.json({
      ...result,
      rewritten: cleanedText,
      recheck: {
        humanScore: recheckResult.humanScore,
        verdict: recheckResult.verdict,
        flaggedCount: recheckResult.paragraphScores.filter(p => p.score < 60).length,
      },
      retries: retryCount,
      retryCount,
      engine: completion.engine,
      model: completion.model,
      fallbackCount: completion.fallbackCount,
      modelFallbacks: completion.fallbackCount,
      latencyMs: completion.latencyMs,
      qualityDecision: qualityDecision.decision,
      qualityGates: qualityDecision.gates,
      protectedTerms,
      patches,
      warnings: qualityDecision.warnings,
      mode: mode || null,
      intensity,
      qualityMode,
      rewriteScope,
      targetedParagraphs: targetParagraphs,
      trustReportAfter: buildTrustReport(cleanedText, recheckResult),
      wordUsage: {
        inputWords: wordCount,
        outputWords,
        remaining: wordCheck.remainingWords - outputWords,
        cap: wordCheck.capWords,
      },
    });

  } catch (error: unknown) {
    console.error('[api/writing/humanize] Error:', error);
    monitor.critical('Tool: writing/humanize', String(error));
    return NextResponse.json(
      { error: 'Failed to humanize text' },
      { status: 500 }
    );
  }
}
