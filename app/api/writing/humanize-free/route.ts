/**
 * Free AI Humanizer API — Landing Page Widget
 * Anonymous access with IP-based rate limiting:
 *   - 3 requests per 24 hours per IP
 *   - 300-word hard cap
 * Authenticated free users: same 300-word cap, uses existing writingTools quota.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { checkRateLimit } from '@/lib/rate-limit';
import { buildHumanizePrompt } from '@/lib/writing-prompts';
import { detectAI } from '@/lib/ai-detection';
import { authenticateRequest } from '@/lib/api-auth';
import { countWords, reserveWritingWords, settleWritingWords } from '@/lib/usage-tracker';
import { getUserTier } from '@/lib/pricing-tiers';
import { verifyTurnstile } from '@/lib/turnstile';
import { monitor } from '@/lib/monitor';
import { writingJSONCompletion } from '@/lib/ai/writing-model-router';
import { evaluateHumanizationQuality, extractProtectedTerms } from '@/lib/writing-quality';

const FREE_WORD_CAP = 300;
const ANON_DAILY_LIMIT = 3;
const ANON_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  let reservationUid: string | null = null;
  let reservationId: string | null = null;
  let reservationLease: string | undefined;
  try {
    const ip = getClientIp(req);

    // Parse body
    let body: { text?: string; domain?: string; tone?: string; turnstileToken?: string; requestId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({error:'Invalid request body'}, {status:400});
    const text = typeof body.text === 'string' ? body.text : '';
    if (body.requestId !== undefined && (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId))) return NextResponse.json({error:'Invalid requestId'}, {status:400});
    const domain = (body.domain || 'general') as 'general' | 'academic' | 'resume' | 'marketing' | 'creative';
    const tone = (body.tone || 'professional') as 'professional' | 'creative' | 'casual' | 'academic' | 'confident';

    if (text.length > 50_000 || !['general','academic','resume','marketing','creative'].includes(domain) || !['professional','creative','casual','academic','confident'].includes(tone)) return NextResponse.json({error:'Invalid text or writing options'}, {status:400});
    if (!text || text.trim().length < 20) {
      return NextResponse.json({ error: 'Text must be at least 20 characters' }, { status: 400 });
    }

    const wordCount = countWords(text);

    // Enforce 300-word cap
    if (wordCount > FREE_WORD_CAP) {
      return NextResponse.json(
        { error: `Free humanizer is limited to ${FREE_WORD_CAP} words. Your text has ${wordCount} words.`, wordCount, cap: FREE_WORD_CAP },
        { status: 400 }
      );
    }

    // Bot protection: require Turnstile for anonymous production requests.
    const authUser = await authenticateRequest(req);
    if (!authUser && process.env.NODE_ENV === 'production' && !body.turnstileToken) {
      return NextResponse.json(
        { error: 'Bot verification required. Please refresh and try again.' },
        { status: 403 }
      );
    }
    if (!authUser && body.turnstileToken) {
      const isHuman = await verifyTurnstile(body.turnstileToken, ip);
      if (!isHuman) {
        monitor.warn('Turnstile Rejected', `IP: ${ip}`);
        return NextResponse.json(
          { error: 'Bot verification failed. Please try again.' },
          { status: 403 }
        );
      }
    }

    if (authUser) {
      // Authenticated user: use existing writingTools quota
      const tier = await getUserTier(authUser.uid, authUser.email);
      const effectiveRequestId = body.requestId || randomUUID();
      const payloadHash = createHash('sha256').update(JSON.stringify({ text, domain, tone })).digest('hex');
      const reservation = await reserveWritingWords(authUser.uid, tier, wordCount, effectiveRequestId, payloadHash);
      if (reservation.status === 'success') return NextResponse.json(reservation.cachedResponse);
      if (reservation.status === 'pending') return NextResponse.json({ error: 'This request is still processing', requestId: effectiveRequestId }, { status: 409 });
      if (!reservation.allowed) return NextResponse.json({ error: reservation.limitKind === 'runs' ? 'Your free writing runs are used.' : 'This draft exceeds your remaining monthly words.', limitReached: true, limitKind: reservation.limitKind, usedWords: reservation.usedWords, capWords: reservation.capWords, remainingWords: reservation.remainingWords }, { status: 429 });
      reservationUid = authUser.uid;
      reservationId = effectiveRequestId;
      reservationLease = reservation.leaseToken;
    } else {
      // Anonymous user: IP-based daily limit (Upstash Redis — persistent across cold starts)
      const rateLimitKey = `humanize-free:${ip}`;
      const { allowed } = await checkRateLimit(rateLimitKey, ANON_DAILY_LIMIT, ANON_WINDOW_MS);
      if (!allowed) {
        return NextResponse.json(
          {
            error: 'Daily free limit reached. Create a free account to unlock 3 more uses.',
            limitReached: true,
            requiresAuth: true,
          },
          { status: 429 }
        );
      }
    }

    // Run AI detection BEFORE humanization (to show before/after)
    const beforeDetection = detectAI(text);

    // Build prompt and humanize
    const systemPrompt = buildHumanizePrompt(domain, tone);
    const userPrompt = `Humanize this entire text with a ${tone} tone:\n\n${text}`;

    type HumanizeResult = {
      rewritten: string;
      changes: Array<{ original: string; rewritten: string; reason: string }>;
      stats: { sentenceLengthStdDev: number; bannedWordsRemoved: number; burstinessRange: number };
    };

    const aiOptions = {
      temperature: tone === 'creative' ? 0.85 : tone === 'casual' ? 0.8 : 0.7,
      maxTokens: Math.min(4096, Math.max(2048, wordCount * 8)),
    };

    const protectedTerms = extractProtectedTerms(text);
    const completion = await writingJSONCompletion<HumanizeResult>({
      task: 'public_humanize',
      systemPrompt,
      userPrompt,
      temperature: aiOptions.temperature,
      maxTokens: aiOptions.maxTokens,
      userTier: authUser ? await getUserTier(authUser.uid, authUser.email) : 'public',
      title: 'TalentConsulting.io Public Humanizer',
      validateResult: (value): value is HumanizeResult => {
        if (!value || typeof value !== 'object') return false;
        const candidate = value as HumanizeResult;
        return typeof candidate.rewritten === 'string' && candidate.rewritten.trim().length > 0 && Array.isArray(candidate.changes) && candidate.changes.every(change => change && typeof change.original === 'string' && typeof change.rewritten === 'string' && typeof change.reason === 'string') && !!candidate.stats &&
          Number.isFinite(candidate.stats.sentenceLengthStdDev) && Number.isFinite(candidate.stats.bannedWordsRemoved) && Number.isFinite(candidate.stats.burstinessRange) && Object.values(candidate.stats).every(value => typeof value === 'number' && value >= 0);
      },
      qualityPolicy: candidate => {
        const cleaned = candidate.rewritten || '';
        const after = detectAI(cleaned);
        return evaluateHumanizationQuality({
          originalText: text,
          rewrittenText: cleaned,
          protectedTerms,
          lengthMode: 'exact',
          originalDetection: beforeDetection,
          finalDetection: after,
        });
      },
    });
    const result = completion.result;

    const cleanedText = result.rewritten || '';

    // Run AI detection AFTER humanization
    const afterDetection = detectAI(cleanedText);

    // Record usage for authenticated users

    console.log(`[humanize-free] Success via ${completion.model} (${wordCount} words)`);

    const responsePayload = {
      rewritten: cleanedText,
      changes: result.changes?.slice(0, 5) || [],
      before: {
        humanScore: beforeDetection.humanScore,
        verdict: beforeDetection.verdict,
      },
      after: {
        humanScore: afterDetection.humanScore,
        verdict: afterDetection.verdict,
      },
      wordCount,
      isAuthenticated: !!authUser,
      engine: completion.engine,
      model: completion.model,
      fallbackCount: completion.fallbackCount,
      latencyMs: completion.latencyMs,
      qualityDecision: completion.qualityDecision.decision,
      qualityGates: completion.qualityDecision.gates,
      protectedTerms,
      warnings: completion.qualityDecision.warnings,
    };
    if (reservationUid && reservationId) await settleWritingWords(reservationUid, reservationId, 'success', responsePayload, reservationLease);
    return NextResponse.json(responsePayload);
  } catch (error: unknown) {
    if (reservationUid && reservationId) {
      try { await settleWritingWords(reservationUid, reservationId, 'failed', undefined, reservationLease); } catch { /* preserve original failure */ }
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[api/writing/humanize-free] Error:', errMsg);
    monitor.critical('Tool: writing/humanize-free', errMsg);
    if (errMsg === 'WRITING_REQUEST_PAYLOAD_MISMATCH') return NextResponse.json({ error: 'requestId was already used for different input' }, { status: 409 });
    return NextResponse.json(
      { error: 'Our servers are busy right now. Please try again in a moment.' },
      { status: 500 }
    );
  }
}
