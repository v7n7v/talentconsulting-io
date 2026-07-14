import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { checkRateLimitStrict } from '@/lib/rate-limit';
import { monitor } from '@/lib/monitor';
import { runSonaActivationProof } from '@/lib/sona/activation-proof';
import { createSonaActivationReceipt } from '@/lib/sona/activation-receipt';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
const localAttempts = new Map<string, { count: number; resetAt: number }>();

function passLocalEmergencyLimit(uid: string) {
  const now = Date.now();
  const current = localAttempts.get(uid);
  if (!current || current.resetAt <= now) {
    localAttempts.set(uid, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= 5;
}

export async function POST(req: NextRequest) {
  const authenticated = await authenticateRequest(req);
  if (!authenticated) {
    return NextResponse.json({ code: 'AUTH_REQUIRED', error: 'Authentication required.' }, { status: 401, headers: PRIVATE_HEADERS });
  }

  if (!passLocalEmergencyLimit(authenticated.uid)) {
    return NextResponse.json({ code: 'RATE_LIMITED', error: 'Please wait before retrying.' }, { status: 429, headers: PRIVATE_HEADERS });
  }
  const strict = await checkRateLimitStrict(`sona-preflight:${authenticated.uid}`, 5, 60_000);
  if (!strict.allowed) {
    const code = strict.unavailable ? 'RATE_LIMIT_UNAVAILABLE' : 'RATE_LIMITED';
    return NextResponse.json({ code, error: 'Activation proof is temporarily unavailable.' }, { status: strict.unavailable ? 503 : 429, headers: PRIVATE_HEADERS });
  }

  const guard = await guardApiRoute(req, { rateLimit: 5, rateLimitWindow: 60_000, skipUsageCap: true });
  if (guard.error) return guard.error;

  let input: any;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_TARGET_BRIEF', error: 'A valid target brief is required.' }, { status: 400, headers: PRIVATE_HEADERS });
  }

  try {
    const result = await runSonaActivationProof(getAdminDb(), guard.user.uid, { ...input, tier: guard.user.tier });
    const unavailableSupply = result.code === 'SAFE_SUPPLY_UNAVAILABLE';
    const noSafeResults = result.code === 'INSUFFICIENT_SAFE_RESULTS';
    const status = unavailableSupply ? 503 : noSafeResults ? 422 : 200;
    const activationReceipt = result.generation.preparationReady && result.resume.id
      ? createSonaActivationReceipt({
          uid: guard.user.uid,
          resumeVersionId: result.resume.id,
          targetRole: result.target.role,
          location: result.target.location,
          salaryTarget: result.target.salaryTarget,
          remotePreference: result.target.remotePreference,
        })
      : undefined;
    return NextResponse.json({ ...result, ...(activationReceipt ? { activationReceipt } : {}) }, { status, headers: PRIVATE_HEADERS });
  } catch (error) {
    monitor.critical('Sona activation proof failed', error instanceof Error ? error.message : 'Unknown failure');
    return NextResponse.json({ code: 'ACTIVATION_PROOF_FAILED', error: 'Activation proof could not be completed.' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
