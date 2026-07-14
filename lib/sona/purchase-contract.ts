import { createHash } from 'node:crypto';
import type { BillingInterval, BillingPlan } from '@/lib/billing-price-types';
import {
  getSonaDailyWorkloadBudget,
  resolveSonaWorkloadEntitlement,
  SONA_WORKLOAD_POLICY_VERSION,
  type SonaWorkloadMode,
} from '@/lib/sona/workload-policy';

export const SONA_PURCHASE_CONTRACT_VERSION = 'sona-purchase-v1-2026-07-11';

export type SonaPurchaseContract = {
  contractVersion: typeof SONA_PURCHASE_CONTRACT_VERSION;
  workloadPolicyVersion: typeof SONA_WORKLOAD_POLICY_VERSION;
  plan: BillingPlan;
  billingInterval: BillingInterval;
  effectiveMode: SonaWorkloadMode;
  rankedRolesPerRunMax: number;
  preparedPacketsPerRunMax: number;
  dailyRunsMax: number;
  dailyModelCallsMax: number;
  dailyPreparedPacketsMax: number;
  recurringScouting: boolean;
  reviewRequired: true;
  externalAutoApply: false;
  fingerprint: string;
};

type ContractPayload = Omit<SonaPurchaseContract, 'fingerprint'>;

function canonicalPayload(payload: ContractPayload) {
  return JSON.stringify({
    contractVersion: payload.contractVersion,
    workloadPolicyVersion: payload.workloadPolicyVersion,
    plan: payload.plan,
    billingInterval: payload.billingInterval,
    effectiveMode: payload.effectiveMode,
    rankedRolesPerRunMax: payload.rankedRolesPerRunMax,
    preparedPacketsPerRunMax: payload.preparedPacketsPerRunMax,
    dailyRunsMax: payload.dailyRunsMax,
    dailyModelCallsMax: payload.dailyModelCallsMax,
    dailyPreparedPacketsMax: payload.dailyPreparedPacketsMax,
    recurringScouting: payload.recurringScouting,
    reviewRequired: payload.reviewRequired,
    externalAutoApply: payload.externalAutoApply,
  });
}

function fingerprintPayload(payload: ContractPayload) {
  return createHash('sha256').update(canonicalPayload(payload)).digest('hex');
}

export function buildSonaPurchaseContract(
  plan: BillingPlan,
  billingInterval: BillingInterval,
): SonaPurchaseContract {
  const tier = plan === 'studio' ? 'studio' : 'pro';
  const entitlement = resolveSonaWorkloadEntitlement(
    tier,
    plan === 'studio' ? 'prepare' : 'scout',
  );
  const daily = getSonaDailyWorkloadBudget(tier);
  const payload: ContractPayload = {
    contractVersion: SONA_PURCHASE_CONTRACT_VERSION,
    workloadPolicyVersion: SONA_WORKLOAD_POLICY_VERSION,
    plan,
    billingInterval,
    effectiveMode: entitlement.effectiveMode,
    rankedRolesPerRunMax: entitlement.maxRankedRoles,
    preparedPacketsPerRunMax: entitlement.maxPreparedPackets,
    dailyRunsMax: daily.runsMax,
    dailyModelCallsMax: daily.modelCallsMax,
    dailyPreparedPacketsMax: daily.preparedPacketsMax,
    recurringScouting: entitlement.recurringScouting,
    reviewRequired: true,
    externalAutoApply: false,
  };
  return { ...payload, fingerprint: fingerprintPayload(payload) };
}

export function buildSonaPurchaseContractMetadata(
  plan: BillingPlan,
  billingInterval: BillingInterval,
) {
  const contract = buildSonaPurchaseContract(plan, billingInterval);
  return {
    sonaContractVersion: contract.contractVersion,
    sonaPolicyVersion: contract.workloadPolicyVersion,
    sonaMode: contract.effectiveMode,
    sonaRankedRolesMax: String(contract.rankedRolesPerRunMax),
    sonaPreparedPacketsMax: String(contract.preparedPacketsPerRunMax),
    sonaDailyRunsMax: String(contract.dailyRunsMax),
    sonaDailyModelCallsMax: String(contract.dailyModelCallsMax),
    sonaDailyPacketsMax: String(contract.dailyPreparedPacketsMax),
    sonaRecurringScouting: String(contract.recurringScouting),
    sonaReviewRequired: 'true',
    sonaExternalAutoApply: 'false',
    sonaContractFingerprint: contract.fingerprint,
  };
}

function boundedInteger(value: unknown, max: number) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
}

export function parseSonaPurchaseContractMetadata(
  metadata: Record<string, string> | null | undefined,
  plan: BillingPlan,
  billingInterval: BillingInterval,
): SonaPurchaseContract | null {
  if (!metadata) return null;
  if (metadata.sonaContractVersion !== SONA_PURCHASE_CONTRACT_VERSION) return null;
  if (metadata.sonaPolicyVersion !== SONA_WORKLOAD_POLICY_VERSION) return null;
  if (metadata.sonaMode !== 'scout' && metadata.sonaMode !== 'prepare') return null;
  if (metadata.sonaReviewRequired !== 'true' || metadata.sonaExternalAutoApply !== 'false') return null;

  const rankedRolesPerRunMax = boundedInteger(metadata.sonaRankedRolesMax, 50);
  const preparedPacketsPerRunMax = boundedInteger(metadata.sonaPreparedPacketsMax, 50);
  const dailyRunsMax = boundedInteger(metadata.sonaDailyRunsMax, 100);
  const dailyModelCallsMax = boundedInteger(metadata.sonaDailyModelCallsMax, 2_000);
  const dailyPreparedPacketsMax = boundedInteger(metadata.sonaDailyPacketsMax, 1_000);
  if (
    rankedRolesPerRunMax === null
    || preparedPacketsPerRunMax === null
    || dailyRunsMax === null
    || dailyModelCallsMax === null
    || dailyPreparedPacketsMax === null
  ) return null;

  const payload: ContractPayload = {
    contractVersion: SONA_PURCHASE_CONTRACT_VERSION,
    workloadPolicyVersion: SONA_WORKLOAD_POLICY_VERSION,
    plan,
    billingInterval,
    effectiveMode: metadata.sonaMode,
    rankedRolesPerRunMax,
    preparedPacketsPerRunMax,
    dailyRunsMax,
    dailyModelCallsMax,
    dailyPreparedPacketsMax,
    recurringScouting: metadata.sonaRecurringScouting === 'true',
    reviewRequired: true,
    externalAutoApply: false,
  };
  const fingerprint = fingerprintPayload(payload);
  if (metadata.sonaContractFingerprint !== fingerprint) return null;
  const expected = buildSonaPurchaseContract(plan, billingInterval);
  return fingerprint === expected.fingerprint ? expected : null;
}

export function resolveSonaPurchaseContractEvidence(
  sessionMetadata: Record<string, string> | null | undefined,
  subscriptionMetadata: Record<string, string> | null | undefined,
  plan: BillingPlan,
  billingInterval: BillingInterval,
) {
  const sessionMarked = typeof sessionMetadata?.sonaContractVersion === 'string';
  const subscriptionMarked = typeof subscriptionMetadata?.sonaContractVersion === 'string';
  if (!sessionMarked && !subscriptionMarked) {
    return { status: 'legacy_missing' as const, contract: null };
  }
  if (!sessionMarked || !subscriptionMarked) {
    return { status: 'invalid' as const, contract: null };
  }
  const sessionContract = parseSonaPurchaseContractMetadata(sessionMetadata, plan, billingInterval);
  const subscriptionContract = parseSonaPurchaseContractMetadata(subscriptionMetadata, plan, billingInterval);

  if ((sessionMarked && !sessionContract) || (subscriptionMarked && !subscriptionContract)) {
    return { status: 'invalid' as const, contract: null };
  }
  if (
    sessionContract
    && subscriptionContract
    && sessionContract.fingerprint !== subscriptionContract.fingerprint
  ) {
    return { status: 'conflict' as const, contract: null };
  }
  const contract = sessionContract || subscriptionContract;
  return contract
    ? { status: 'verified' as const, contract }
    : { status: 'invalid' as const, contract: null };
}
