import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import {
  commitRateLimitReservation,
  releaseRateLimitReservation,
  reserveRateLimit,
} from '@/lib/rate-limit';
import { ANON_CAPS, FREE_CAPS, checkUsageAllowed, incrementUsage } from '@/lib/usage-tracker';
import { validateBody } from '@/lib/validate';
import { ResumeMorphSchema } from '@/lib/schemas';
import { sanitizeForAI } from '@/lib/sanitize';
import { monitor } from '@/lib/monitor';
import { proveResumeDelta, flattenResume } from '@/lib/tfidf-proof';
import type { PlanTier } from '@/lib/pricing-tiers';
import {
  resolveResumeMorphAccess,
} from '@/lib/resume-morph-guardrails';
import { getResumeMorphConsentForUser } from '@/lib/resume-morph-consent-server';
import { generateGuardedMorphDraft } from '@/lib/sona/morph-draft-generation';

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

async function enforceResumeMorphUsage(req: NextRequest, uid: string, tier: PlanTier) {
  if (uid.startsWith('anon:')) {
    const cap = ANON_CAPS.morphs ?? 1;
    const capKey = `anon-cap:${getClientIp(req)}:morphs`;
    const reservation = await reserveRateLimit(capKey, cap);

    if (!reservation.allowed) {
      if (reservation.reason === 'unavailable') {
        return {
          error: NextResponse.json(
            { error: 'The free preview is temporarily unavailable. Your trial was not used.' },
            { status: 503, headers: { 'Retry-After': '30' } },
          ),
          anonymousCommitKey: null,
          anonymousReservationToken: null,
        };
      }
      if (reservation.reason === 'busy') {
        return {
          error: NextResponse.json(
            { error: 'Another free preview is still running. Wait a moment and try again.' },
            { status: 429, headers: { 'Retry-After': '30' } },
          ),
          anonymousCommitKey: null,
          anonymousReservationToken: null,
        };
      }
      return {
        error: NextResponse.json(
          {
            error: `You've used your free trial. Create an account to unlock ${FREE_CAPS.morphs} free uses and keep your progress.`,
            requiresAuth: true,
            limitReached: true,
            feature: 'morphs',
            used: cap,
            cap,
            remaining: 0,
          },
          { status: 429, headers: { 'X-Usage-Cap': String(cap), 'X-RateLimit-Tier': 'anonymous' } }
        ),
        anonymousCommitKey: null,
        anonymousReservationToken: null,
      };
    }

    return {
      error: null,
      anonymousCommitKey: capKey,
      anonymousReservationToken: reservation.token,
    };
  }

  const usageCheck = await checkUsageAllowed(uid, 'morphs', tier);
  if (!usageCheck.allowed) {
    return {
      error: NextResponse.json(
        {
          error: 'You used your free resume morph runs. Your work is saved.',
          upgrade: true,
          limitReached: true,
          feature: 'morphs',
          used: usageCheck.used,
          cap: usageCheck.cap,
          upgradeUrl: '/suite/upgrade',
        },
        { status: 403 }
      ),
      anonymousCommitKey: null,
      anonymousReservationToken: null,
    };
  }

  return { error: null, anonymousCommitKey: null, anonymousReservationToken: null };
}

export async function POST(req: NextRequest) {
  let anonymousCommitKey: string | null = null;
  let anonymousReservationToken: string | null = null;
  try {
    const guard = await guardApiRoute(req, { rateLimit: 1, rateLimitWindow: 60_000, allowAnonymous: true, skipUsageCap: true });
    if (guard.error) return guard.error;
    const isAnon = guard.user.uid.startsWith('anon:');

    const validated = await validateBody(req, ResumeMorphSchema);
    if (!validated.success) return validated.error;
    const { resume, jobDescription, morphPercentage } = validated.data;

    const safeJD = sanitizeForAI(jobDescription);
    const consentStatus = await getResumeMorphConsentForUser(guard.user.uid);
    const morphAccess = resolveResumeMorphAccess({
      requestedMorphPercentage: morphPercentage || 50,
      hasFullConsent: consentStatus.unlocked100,
      mode: 'manual',
    });

    if (morphAccess.requiresMorphConsent) {
      return NextResponse.json(
        {
          error: '100% Morph must be unlocked in Settings > AI Safety before use.',
          requiresMorphConsent: true,
          effectiveMorphPercentage: morphAccess.effectiveMorphPercentage,
          maxAllowedMorphPercentage: morphAccess.maxAllowedMorphPercentage,
          consentVersion: consentStatus.consentVersion,
        },
        { status: 403 }
      );
    }

    const usage = await enforceResumeMorphUsage(req, guard.user.uid, guard.user.tier);
    if (usage.error) return usage.error;
    anonymousCommitKey = usage.anonymousCommitKey;
    anonymousReservationToken = usage.anonymousReservationToken;

    const guarded = await generateGuardedMorphDraft({
      resume,
      jobTitle: 'Target role',
      jobDescription: safeJD,
      access: morphAccess,
    });
    const morphedData = guarded.resume;

    if (isAnon) {
      if (anonymousCommitKey && anonymousReservationToken) {
        const committed = await commitRateLimitReservation(
          anonymousCommitKey,
          anonymousReservationToken,
          30 * 24 * 60 * 60 * 1000,
        );
        if (!committed) {
          await releaseRateLimitReservation(anonymousCommitKey, anonymousReservationToken);
          return NextResponse.json(
            { error: 'The free preview could not be verified. Your trial was not used. Please try again.' },
            { status: 503, headers: { 'Retry-After': '30' } },
          );
        }
        anonymousReservationToken = null;
      }
    } else {
      await incrementUsage(guard.user.uid, 'morphs');
    }

    // ── Deterministic TF-IDF Proof ──
    let proof = null;
    try {
      const originalText = flattenResume(resume);
      const morphedText = flattenResume(morphedData);
      if (originalText.length > 20 && morphedText.length > 20 && safeJD.length > 20) {
        proof = proveResumeDelta(originalText, morphedText, safeJD);
      }
    } catch (e) {
      console.warn('[api/resume/morph] Proof engine error (non-fatal):', e);
    }

    return NextResponse.json({
      morphedResume: morphedData,
      matchScore: proof?.optimizedScore ?? proof?.baselineScore ?? 0,
      proof,
      effectiveMorphPercentage: morphAccess.effectiveMorphPercentage,
      maxAllowedMorphPercentage: morphAccess.maxAllowedMorphPercentage,
      requiresMorphConsent: false,
      guardrailReport: guarded.report,
    });
  } catch (error: unknown) {
    if (anonymousCommitKey && anonymousReservationToken) {
      await releaseRateLimitReservation(anonymousCommitKey, anonymousReservationToken);
    }
    console.error('[api/resume/morph] Error:', error);
    monitor.critical('Tool: resume/morph', String(error));
    return NextResponse.json(
      { error: 'Failed to morph resume' },
      { status: 500 }
    );
  }
}
