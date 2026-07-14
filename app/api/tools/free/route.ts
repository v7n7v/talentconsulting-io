import { NextRequest, NextResponse } from 'next/server';
import { detectAI } from '@/lib/ai-detection';
import { checkRateLimit } from '@/lib/rate-limit';
import { buildGalleryPrompt } from '@/lib/writing-prompts';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { monitor } from '@/lib/monitor';

/**
 * Unified Free Tools API
 * Handles: detect, grammar, paraphrase, ats-score
 * Word counter is client-side only — no API call needed.
 *
 * Rate limits per IP per 24h window:
 *  - detect:     5/hour (heuristic, $0 cost)
 *  - grammar:    2/day  (Gemini, $$ cost)
 *  - paraphrase: 2/day  (Gemini, $$ cost)
 *  - ats-score:  2/day  (heuristic + light AI)
 */

const TOOL_CONFIG: Record<string, { wordLimit: number; rateLimit: number; windowMs: number }> = {
  detect:     { wordLimit: 1500, rateLimit: 5,  windowMs: 60 * 60 * 1000 },       // 5/hour
  grammar:    { wordLimit: 300,  rateLimit: 3,  windowMs: 24 * 60 * 60 * 1000 },   // 3/day
  paraphrase: { wordLimit: 200,  rateLimit: 3,  windowMs: 24 * 60 * 60 * 1000 },   // 3/day
  'ats-score': { wordLimit: 500, rateLimit: 3,  windowMs: 24 * 60 * 60 * 1000 },   // 3/day
};

function getIP(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || '127.0.0.1';
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(req: NextRequest) {
  try {
    const { tool, text } = await req.json();

    if (!tool || !text?.trim()) {
      return NextResponse.json({ error: 'Missing tool or text.' }, { status: 400 });
    }

    const config = TOOL_CONFIG[tool];
    if (!config) {
      return NextResponse.json({ error: `Unknown tool: ${tool}` }, { status: 400 });
    }

    // Word cap check
    const wc = countWords(text);
    if (wc > config.wordLimit) {
      return NextResponse.json({
        error: `Text exceeds the ${config.wordLimit}-word free preview for ${tool}. You used ${wc} words.`,
        limitType: 'words',
        limit: config.wordLimit,
        used: wc,
      }, { status: 400 });
    }

    // Rate limit check (per tool per IP)
    const ip = getIP(req);
    const rateLimitKey = `free-${tool}:${ip}`;
    const { allowed, remaining } = await checkRateLimit(rateLimitKey, config.rateLimit, config.windowMs);

    if (!allowed) {
      return NextResponse.json({
        error: `Daily free limit reached for ${tool}. Create a free account to keep working.`,
        limitType: 'rate',
        limit: config.rateLimit,
      }, { status: 429 });
    }

    // ── Dispatch to handler ──
    let result: unknown;

    switch (tool) {
      case 'detect':
        result = handleDetect(text);
        break;
      case 'grammar':
        result = await handleGrammar(text);
        break;
      case 'paraphrase':
        result = await handleParaphrase(text);
        break;
      case 'ats-score':
        result = await handleATSScore(text);
        break;
    }

    return NextResponse.json({
      ...result as object,
      remaining,
      wordCount: wc,
      tool,
    });
  } catch (err) {
    console.error('[free-tools]', err);
    monitor.critical('Tool: tools/free', String(err));
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 });
  }
}

// ═══════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════

/** AI Detector — pure heuristic, $0 cost */
function handleDetect(text: string) {
  const detection = detectAI(text);
  return {
    humanScore: detection.humanScore,
    verdict: detection.verdict,
    breakdown: detection.breakdown,
    flags: detection.flags.slice(0, 8), // Limit flags to avoid huge payloads
    paragraphCount: detection.paragraphScores.length,
    topIssues: detection.flags
      .filter(f => f.type === 'critical' || f.type === 'high')
      .slice(0, 5)
      .map(f => f.message),
  };
}

/** Grammar Checker — limited server-side AI call */
async function handleGrammar(text: string) {
  const prompt = buildGalleryPrompt('grammar-checker', text);
  const data = await groqJSONCompletion<{
    corrections: { original: string; corrected: string; rule: string; explanation: string }[];
    overallScore: number;
    summary: string;
  }>(prompt.system, prompt.user, { temperature: 0.25, maxTokens: 1600 });

  if (!data) throw new Error('Grammar response failed');

  return {
    corrections: (data.corrections || []).slice(0, 10),
    overallScore: data.overallScore ?? 80,
    summary: data.summary || 'Analysis complete.',
  };
}

/** Paraphraser — limited server-side AI call */
async function handleParaphrase(text: string) {
  const prompt = buildGalleryPrompt('paraphraser', text);
  const data = await groqJSONCompletion<{
    variations: { style: string; text: string }[];
  }>(prompt.system, prompt.user, { temperature: 0.35, maxTokens: 1600 });

  if (!data) throw new Error('Paraphrase response failed');

  return {
    variations: (data.variations || []).slice(0, 3),
  };
}

/** ATS Resume Score — heuristic + light Gemini */
async function handleATSScore(text: string) {
  // Heuristic checks
  const sections = ['experience', 'education', 'skills', 'summary', 'projects', 'certifications'];
  const lower = text.toLowerCase();
  const foundSections = sections.filter(s => lower.includes(s));
  const sectionScore = Math.min(100, (foundSections.length / 4) * 100);

  // Contact info detection
  const hasEmail = /[\w.-]+@[\w.-]+\.\w+/.test(text);
  const hasPhone = /(\+?\d[\d\s\-().]{7,}\d)/.test(text);
  const contactScore = (hasEmail ? 50 : 0) + (hasPhone ? 50 : 0);

  // Formatting red flags
  const hasSpecialChars = /[★●◆■▪•]/.test(text);
  const hasTables = /\t.*\t/.test(text);
  const formatPenalty = (hasSpecialChars ? 15 : 0) + (hasTables ? 15 : 0);

  // Word count check
  const wc = countWords(text);
  const lengthScore = wc < 100 ? 30 : wc < 200 ? 60 : wc < 400 ? 85 : wc < 800 ? 95 : 80;

  // Action verbs detection
  const actionVerbs = ['managed', 'developed', 'created', 'led', 'designed', 'implemented', 'improved', 'increased', 'reduced', 'achieved', 'built', 'launched', 'delivered', 'drove', 'established'];
  const foundVerbs = actionVerbs.filter(v => lower.includes(v));
  const verbScore = Math.min(100, (foundVerbs.length / 5) * 100);

  // Quantified results
  const hasNumbers = (text.match(/\d+%|\$[\d,]+|\d+\+?\s*(years?|months?|projects?|clients?|users?|team)/gi) || []).length;
  const quantScore = Math.min(100, hasNumbers * 25);

  // Composite score
  const atsScore = Math.round(
    sectionScore * 0.25 +
    contactScore * 0.15 +
    lengthScore * 0.10 +
    verbScore * 0.20 +
    quantScore * 0.15 +
    Math.max(0, 100 - formatPenalty) * 0.15
  );

  const issues: string[] = [];
  if (!hasEmail) issues.push('Missing email address');
  if (!hasPhone) issues.push('Missing phone number');
  if (foundSections.length < 3) issues.push(`Only ${foundSections.length}/4 key sections found (experience, education, skills, summary)`);
  if (foundVerbs.length < 3) issues.push('Few action verbs — use "managed", "developed", "increased" etc.');
  if (hasNumbers < 2) issues.push('Add quantified achievements (%, $, numbers)');
  if (hasSpecialChars) issues.push('Special characters (★●◆) may break ATS parsers');
  if (wc < 150) issues.push('Resume seems too short — aim for 300-600 words');

  const strengths: string[] = [];
  if (hasEmail && hasPhone) strengths.push('Contact information present');
  if (foundSections.length >= 3) strengths.push(`${foundSections.length} key resume sections detected`);
  if (foundVerbs.length >= 3) strengths.push(`Strong action verbs: ${foundVerbs.slice(0, 4).join(', ')}`);
  if (hasNumbers >= 2) strengths.push('Good use of quantified results');

  return {
    atsScore,
    sections: foundSections,
    missingSections: sections.filter(s => !foundSections.includes(s)),
    issues,
    strengths,
    metrics: { sectionScore, contactScore, verbScore, quantScore, lengthScore },
  };
}
