import type { PlanTier } from '@/lib/pricing-tiers';
import { getSonaDailyWorkloadBudget, type SonaWorkloadEntitlement } from '@/lib/sona/workload-policy';

type Firestore = FirebaseFirestore.Firestore;

export type SonaPaidWorkloadReservation = {
  allowed: boolean;
  reason?: 'concurrent_run' | 'daily_run_cap' | 'daily_model_cap' | 'daily_packet_cap';
  used: number;
  cap: number;
  resetsAt: string;
};

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function nextUtcDay(date = new Date()) {
  const next = new Date(date);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

export async function reserveSonaPaidWorkloadRun(
  db: Firestore,
  ref: FirebaseFirestore.DocumentReference,
  runId: string,
  tier: PlanTier,
  entitlement: SonaWorkloadEntitlement,
): Promise<SonaPaidWorkloadReservation> {
  const now = new Date();
  const day = utcDayKey(now);
  const resetsAt = nextUtcDay(now);
  const budget = getSonaDailyWorkloadBudget(tier);

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const stored = snapshot.exists ? snapshot.data() || {} : {};
    const sameDay = stored.day === day;
    const runsUsed = sameDay ? Math.max(0, Number(stored.runsReserved || 0)) : 0;
    const modelCallsUsed = sameDay ? Math.max(0, Number(stored.modelCallsReserved || 0)) : 0;
    const preparedPacketsUsed = sameDay ? Math.max(0, Number(stored.preparedPacketsReserved || 0)) : 0;
    const runningAt = sameDay ? new Date(stored.runningReservedAt || 0).getTime() : 0;
    const runningFresh = Boolean(stored.runningRunId)
      && Number.isFinite(runningAt)
      && Date.now() - runningAt < 10 * 60 * 1000;

    if (runningFresh) {
      return { allowed: false, reason: 'concurrent_run', used: 1, cap: 1, resetsAt };
    }
    if (runsUsed >= budget.runsMax) {
      return { allowed: false, reason: 'daily_run_cap', used: runsUsed, cap: budget.runsMax, resetsAt };
    }
    if (modelCallsUsed + entitlement.costEnvelope.modelCallsMax > budget.modelCallsMax) {
      return { allowed: false, reason: 'daily_model_cap', used: modelCallsUsed, cap: budget.modelCallsMax, resetsAt };
    }
    if (preparedPacketsUsed + entitlement.maxPreparedPackets > budget.preparedPacketsMax) {
      return { allowed: false, reason: 'daily_packet_cap', used: preparedPacketsUsed, cap: budget.preparedPacketsMax, resetsAt };
    }

    transaction.set(ref, {
      day,
      runsReserved: runsUsed + 1,
      modelCallsReserved: modelCallsUsed + entitlement.costEnvelope.modelCallsMax,
      preparedPacketsReserved: preparedPacketsUsed + entitlement.maxPreparedPackets,
      runningRunId: runId,
      runningReservedAt: now.toISOString(),
      resetsAt,
      policyVersion: entitlement.policyVersion,
      tier,
    }, { merge: true });
    return { allowed: true, used: runsUsed + 1, cap: budget.runsMax, resetsAt };
  });
}

export async function releaseSonaPaidWorkloadRun(
  db: Firestore,
  ref: FirebaseFirestore.DocumentReference,
  runId: string,
) {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const stored = snapshot.exists ? snapshot.data() || {} : {};
    if (stored.runningRunId !== runId) return false;
    transaction.set(ref, {
      runningRunId: null,
      runningReservedAt: null,
      lastCompletedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  });
}

export async function cancelSonaPaidWorkloadRun(
  db: Firestore,
  ref: FirebaseFirestore.DocumentReference,
  runId: string,
  entitlement: SonaWorkloadEntitlement,
  options: { retainRun?: boolean; modelCallsConsumed?: number } = {},
) {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const stored = snapshot.exists ? snapshot.data() || {} : {};
    if (stored.runningRunId !== runId) return false;
    const retainedModelCalls = Math.min(
      entitlement.costEnvelope.modelCallsMax,
      Math.max(0, Math.floor(options.modelCallsConsumed || 0)),
    );
    transaction.set(ref, {
      runsReserved: Math.max(0, Number(stored.runsReserved || 0) - (options.retainRun ? 0 : 1)),
      modelCallsReserved: Math.max(
        0,
        Number(stored.modelCallsReserved || 0) - entitlement.costEnvelope.modelCallsMax + retainedModelCalls,
      ),
      preparedPacketsReserved: Math.max(0, Number(stored.preparedPacketsReserved || 0) - entitlement.maxPreparedPackets),
      runningRunId: null,
      runningReservedAt: null,
      lastCancelledAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  });
}
