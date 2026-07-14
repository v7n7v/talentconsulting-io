import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { monitor } from '@/lib/monitor';
import { SonaAgentHarnessSchema } from '@/lib/schemas';
import { runSonaAgentHarness } from '@/lib/sona/agent-harness';
import {
  buildReceiptBoundHarnessInput,
  consumeSonaActivationReceipt,
  verifySonaActivationReceipt,
} from '@/lib/sona/activation-receipt';
import { activationPreviewConsumedRecovery, sonaServiceUnavailableRecovery } from '@/lib/sona/recovery';
import { isGroqConfigured } from '@/lib/ai/groq-client';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, {
    rateLimit: 3,
    rateLimitWindow: 60_000,
  });
  if (guard.error) return guard.error;

  try {
    const body = await req.json().catch(() => null);
    const parsed = SonaAgentHarnessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Sona harness request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (!isGroqConfigured()) {
      const recovery = sonaServiceUnavailableRecovery();
      return NextResponse.json({
        error: recovery.title,
        code: recovery.code,
        retryable: recovery.retryable,
        requiresFreshPreflight: false,
        recovery,
      }, { status: 503 });
    }

    const receipt = verifySonaActivationReceipt({
      token: parsed.data.activationReceipt,
      uid: guard.user.uid,
    });
    if (!receipt.ok) {
      return NextResponse.json({
        error: receipt.code === 'PREFLIGHT_EXPIRED'
          ? 'The scout preview expired. Run Preview scout again.'
          : 'Run Preview scout before starting Sona.',
        code: receipt.code,
        retryable: false,
      }, { status: receipt.code === 'PREFLIGHT_WRONG_USER' ? 403 : 409 });
    }

    const db = getAdminDb();
    const consumed = await consumeSonaActivationReceipt(db, receipt.payload);
    if (!consumed) {
      return NextResponse.json({
        error: 'This scout preview has already been used. Run Preview scout again.',
        code: 'PREFLIGHT_ALREADY_USED',
        retryable: false,
      }, { status: 409 });
    }

    const result = await runSonaAgentHarness(db, guard.user.uid, {
      ...buildReceiptBoundHarnessInput(receipt.payload),
      tier: guard.user.tier,
      email: guard.user.email || null,
    });

    if (result.code === 'RESUME_LOOKUP_UNAVAILABLE') {
      return NextResponse.json({
        ...result,
        retryable: false,
        requiresFreshPreflight: true,
        recovery: activationPreviewConsumedRecovery(),
      }, {
        status: 503,
        headers: { 'Retry-After': '15' },
      });
    }

    if (result.needsResume) {
      return NextResponse.json({ ...result, requiresFreshPreflight: true }, { status: 409 });
    }

    if (result.needsTargetBrief) {
      return NextResponse.json({ ...result, requiresFreshPreflight: true }, { status: 409 });
    }

    if (result.code === 'PRIMARY_JOB_SUPPLY_UNAVAILABLE') {
      return NextResponse.json({
        ...result,
        retryable: false,
        requiresFreshPreflight: true,
        recovery: activationPreviewConsumedRecovery(),
      }, {
        status: 503,
        headers: { 'Retry-After': '60' },
      });
    }

    if (result.workloadLimit) {
      const retryAfter = result.workloadLimit.reason === 'concurrent_run'
        ? 30
        : Math.max(60, Math.ceil((new Date(result.workloadLimit.resetsAt).getTime() - Date.now()) / 1000));
      return NextResponse.json({
        ...result,
        retryable: false,
        requiresFreshPreflight: true,
        recovery: activationPreviewConsumedRecovery(),
      }, {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[agent/harness] Error:', error);
    monitor.critical('Tool: agent/harness', error?.message || String(error));
    const recovery = activationPreviewConsumedRecovery();
    return NextResponse.json(
      {
        error: recovery.title,
        code: recovery.code,
        retryable: false,
        requiresFreshPreflight: true,
        recovery,
      },
      { status: 500 },
    );
  }
}
