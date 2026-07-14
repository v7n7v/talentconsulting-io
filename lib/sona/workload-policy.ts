import type { PlanTier } from '@/lib/pricing-tiers';

export const SONA_WORKLOAD_POLICY_VERSION = '2026-07-10';

export type SonaWorkloadMode = 'scout' | 'prepare';
export type SonaPublicPlan = 'free' | 'pro' | 'max';

export interface SonaWorkloadEnvelope {
  searchQueriesMax: number;
  rankedRolesMax: number;
  goalInterpretationsMax: number;
  resumeMorphsMax: number;
  coverLettersMax: number;
  emailDigestsMax: number;
  modelCallsMax: number;
}

export interface SonaDailyWorkloadBudget {
  runsMax: number;
  modelCallsMax: number;
  preparedPacketsMax: number;
}

export interface SonaWorkloadEntitlement {
  policyVersion: typeof SONA_WORKLOAD_POLICY_VERSION;
  plan: SonaPublicPlan;
  planLabel: string;
  outcomeLabel: string;
  outcomeDescription: string;
  limitLabel: string;
  requestedMode: SonaWorkloadMode;
  effectiveMode: SonaWorkloadMode;
  downgraded: boolean;
  maxRankedRoles: number;
  maxPreparedPackets: number;
  recurringScouting: boolean;
  paidReason: string;
  upgrade: {
    href: string;
    label: string;
    reason: string;
  } | null;
  costEnvelope: SonaWorkloadEnvelope;
}

function normalizeRequestedCount(requested: number | undefined, fallback: number) {
  const numeric = Number(requested ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.floor(numeric));
}

export function getSonaDailyWorkloadBudget(tier: PlanTier): SonaDailyWorkloadBudget {
  if (tier === 'god') return { runsMax: 100, modelCallsMax: 1_100, preparedPacketsMax: 800 };
  if (tier === 'studio') return { runsMax: 3, modelCallsMax: 33, preparedPacketsMax: 15 };
  if (tier === 'pro') return { runsMax: 10, modelCallsMax: 10, preparedPacketsMax: 0 };
  return { runsMax: 0, modelCallsMax: 0, preparedPacketsMax: 0 };
}

export function resolveSonaWorkloadEntitlement(
  tier: PlanTier,
  requestedMode?: SonaWorkloadMode,
  requestedMaxRankedRoles?: number,
): SonaWorkloadEntitlement {
  const isMax = tier === 'studio' || tier === 'god';
  const plan: SonaPublicPlan = isMax ? 'max' : tier === 'pro' ? 'pro' : 'free';
  const requested: SonaWorkloadMode = requestedMode || (isMax ? 'prepare' : 'scout');
  const effectiveMode: SonaWorkloadMode = isMax && requested !== 'scout' ? 'prepare' : 'scout';
  const planCap = tier === 'god' ? 8 : isMax ? 5 : 3;
  const maxRankedRoles = Math.min(planCap, normalizeRequestedCount(requestedMaxRankedRoles, planCap));
  const maxPreparedPackets = effectiveMode === 'prepare' ? maxRankedRoles : 0;
  const recurringScouting = isMax;

  const planCopy = plan === 'free'
    ? {
        planLabel: 'Free',
        outcomeLabel: 'One Sona scout preview',
        outcomeDescription: 'Rank up to 3 roles once, with fit evidence and no application assets generated.',
        limitLabel: 'Up to 3 ranked roles, once',
        paidReason: 'Free proves the complete resume-to-ranked-picks outcome before payment.',
        upgrade: {
          href: '/suite/upgrade',
          label: 'Compare Pro and Max',
          reason: 'Use Pro for repeatable manual scouting or Max for proactive scouting and prepared packets.',
        },
      }
    : plan === 'pro'
      ? {
          planLabel: 'Talent Pro',
          outcomeLabel: 'On-demand Sona scouting',
          outcomeDescription: 'Run up to 10 on-demand scouts each day and rank up to 3 roles per run.',
          limitLabel: 'Up to 3 ranked roles per run, 10 runs daily',
          paidReason: 'Pro pays for repeatable, user-started scouting with the core career toolkit.',
          upgrade: {
            href: '/suite/upgrade?plan=studio',
            label: 'Unlock prepared packets',
            reason: 'Max adds proactive scouting plus truthful resume and cover-letter preparation for review.',
          },
        }
      : {
          planLabel: 'Talent Max',
          outcomeLabel: 'Sona prepares the review queue',
          outcomeDescription: `Use 3 daily Sona workloads, including proactive scouting, with up to ${planCap} truth-locked packets per run.`,
          limitLabel: `Up to ${planCap} prepared packets per run, 3 workloads daily`,
          paidReason: 'Max pays for recurring agent work and review-ready packets, while every external action stays user-controlled.',
          upgrade: null,
        };

  const costEnvelope: SonaWorkloadEnvelope = {
    searchQueriesMax: 4,
    rankedRolesMax: maxRankedRoles,
    goalInterpretationsMax: 1,
    resumeMorphsMax: maxPreparedPackets,
    coverLettersMax: maxPreparedPackets,
    emailDigestsMax: 1,
    modelCallsMax: 1 + (maxPreparedPackets * 2),
  };

  return {
    policyVersion: SONA_WORKLOAD_POLICY_VERSION,
    plan,
    planLabel: planCopy.planLabel,
    outcomeLabel: planCopy.outcomeLabel,
    outcomeDescription: planCopy.outcomeDescription,
    limitLabel: planCopy.limitLabel,
    requestedMode: requested,
    effectiveMode,
    downgraded: requested !== effectiveMode,
    maxRankedRoles,
    maxPreparedPackets,
    recurringScouting,
    paidReason: planCopy.paidReason,
    upgrade: planCopy.upgrade,
    costEnvelope,
  };
}
