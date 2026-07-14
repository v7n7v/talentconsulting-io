import type {
  BillingInterval,
  BillingPlan,
  PublicBillingPrice,
  PublicBillingPrices,
} from '@/lib/billing-price-types';
import {
  DEFAULT_SONA_COST_BASIS,
  type SonaCostBasis,
} from '@/lib/sona/economics';
import {
  getSonaDailyWorkloadBudget,
  resolveSonaWorkloadEntitlement,
  type SonaWorkloadEnvelope,
} from '@/lib/sona/workload-policy';
import { STRIPE_TRIAL_DAYS } from '@/lib/billing/stripe-trial-policy';

export const SONA_PLAN_ECONOMICS_GATE_VERSION = 'sona-plan-economics-v3-2026-07-11';
export const TARGET_SONA_WORKLOAD_MARGIN_PERCENT = 70;
const MODEL_DAYS_PER_MONTH = 31;

export type SonaPlanEconomicsStatus = 'pass' | 'watch' | 'blocked';

export interface SonaPlanIntervalEconomics {
  interval: BillingInterval;
  status: SonaPlanEconomicsStatus;
  currency: string;
  sourceInterval: BillingInterval | null;
  priceActive: boolean;
  priceAvailable: boolean;
  billingAmountUsd: number | null;
  monthlyRevenueEquivalentUsd: number | null;
  maxMonthlyWorkloadCostUsd: number;
  workloadMarginPercent: number | null;
  firstCycleRevenueUsd: number | null;
  firstCycleWorkloadCostUsd: number;
  firstCycleMarginPercent: number | null;
  promotionDiscountPercent: number | null;
  reason: string;
}

type AcquisitionEconomicsOptions = {
  trialDays: number;
  promotionCodesEnabled: boolean;
  promotionDiscountPercent: number | null;
};

export interface SonaPlanEconomics {
  plan: BillingPlan;
  planLabel: string;
  status: SonaPlanEconomicsStatus;
  outcomeLabel: string;
  runsPerDayMax: number;
  preparedPacketsPerDayMax: number;
  maxRunCostUsd: number;
  maxMonthlyWorkloadCostUsd: number;
  intervals: Record<BillingInterval, SonaPlanIntervalEconomics>;
}

function roundMoney(value: number) {
  return Number(value.toFixed(4));
}

function statusPriority(status: SonaPlanEconomicsStatus) {
  if (status === 'blocked') return 2;
  if (status === 'watch') return 1;
  return 0;
}

function weakestStatus(statuses: SonaPlanEconomicsStatus[]) {
  return statuses.reduce<SonaPlanEconomicsStatus>(
    (weakest, status) => statusPriority(status) > statusPriority(weakest) ? status : weakest,
    'pass',
  );
}

export function estimateSonaEnvelopeCostMicros(
  envelope: SonaWorkloadEnvelope,
  basis: SonaCostBasis = DEFAULT_SONA_COST_BASIS,
) {
  return (
    envelope.goalInterpretationsMax * basis.goalInterpretationMicros
    + envelope.searchQueriesMax * basis.searchQueryMicros
    + envelope.resumeMorphsMax * basis.resumeMorphMicros
    + envelope.coverLettersMax * basis.coverLetterMicros
    + envelope.emailDigestsMax * basis.emailDigestMicros
  );
}

function assessInterval(
  price: PublicBillingPrice,
  maxMonthlyWorkloadCostUsd: number,
  targetMarginPercent: number,
  acquisition: AcquisitionEconomicsOptions,
): SonaPlanIntervalEconomics {
  const trialCostUsd = roundMoney((maxMonthlyWorkloadCostUsd / MODEL_DAYS_PER_MONTH) * acquisition.trialDays);
  const firstCycleWorkloadCostUsd = roundMoney(
    (price.interval === 'year' ? maxMonthlyWorkloadCostUsd * 12 : maxMonthlyWorkloadCostUsd) + trialCostUsd,
  );
  const acquisitionDefaults = {
    firstCycleRevenueUsd: null,
    firstCycleWorkloadCostUsd,
    firstCycleMarginPercent: null,
    promotionDiscountPercent: acquisition.promotionDiscountPercent,
  };
  const priceAvailable = price.unitAmount != null && price.unitAmount > 0;
  if (!priceAvailable) {
    return {
      interval: price.interval,
      status: 'blocked',
      currency: price.currency,
      sourceInterval: price.sourceInterval,
      priceActive: price.active,
      priceAvailable: false,
      billingAmountUsd: null,
      monthlyRevenueEquivalentUsd: null,
      maxMonthlyWorkloadCostUsd,
      workloadMarginPercent: null,
      ...acquisitionDefaults,
      reason: 'Stripe price is unavailable. Verify the configured price ID before scaling this plan.',
    };
  }

  const billingAmountUsd = price.unitAmount! / 100;
  if (price.sourceInterval !== price.interval) {
    return {
      interval: price.interval,
      status: 'blocked',
      currency: price.currency,
      sourceInterval: price.sourceInterval,
      priceActive: price.active,
      priceAvailable: true,
      billingAmountUsd: roundMoney(billingAmountUsd),
      monthlyRevenueEquivalentUsd: null,
      maxMonthlyWorkloadCostUsd,
      workloadMarginPercent: null,
      ...acquisitionDefaults,
      reason: `Stripe price recurrence is ${price.sourceInterval || 'not recurring'}, but this option is configured as ${price.interval}. Fix the price ID before evaluating margin.`,
    };
  }

  if (price.currency.toLowerCase() !== 'usd') {
    return {
      interval: price.interval,
      status: 'blocked',
      currency: price.currency,
      sourceInterval: price.sourceInterval,
      priceActive: price.active,
      priceAvailable: true,
      billingAmountUsd: roundMoney(billingAmountUsd),
      monthlyRevenueEquivalentUsd: null,
      maxMonthlyWorkloadCostUsd,
      workloadMarginPercent: null,
      ...acquisitionDefaults,
      reason: `Stripe price uses ${price.currency.toUpperCase()}, but the provider cost basis is USD. Convert currencies before evaluating margin.`,
    };
  }

  const monthlyRevenueEquivalentUsd = price.interval === 'year'
    ? billingAmountUsd / 12
    : billingAmountUsd;
  const workloadMarginPercent = Number((
    ((monthlyRevenueEquivalentUsd - maxMonthlyWorkloadCostUsd) / monthlyRevenueEquivalentUsd) * 100
  ).toFixed(1));
  const promotionDiscountPercent = acquisition.promotionCodesEnabled
    ? acquisition.promotionDiscountPercent
    : 0;
  const validPromotionDiscount = promotionDiscountPercent == null
    || (Number.isFinite(promotionDiscountPercent) && promotionDiscountPercent >= 0 && promotionDiscountPercent <= 100);
  const firstCycleRevenueUsd = promotionDiscountPercent == null || !validPromotionDiscount
    ? null
    : roundMoney(billingAmountUsd * (1 - promotionDiscountPercent / 100));
  const firstCycleMarginPercent = firstCycleRevenueUsd && firstCycleRevenueUsd > 0
    ? Number((((firstCycleRevenueUsd - firstCycleWorkloadCostUsd) / firstCycleRevenueUsd) * 100).toFixed(1))
    : null;

  if (!price.active) {
    return {
      interval: price.interval,
      status: 'blocked',
      currency: price.currency,
      sourceInterval: price.sourceInterval,
      priceActive: false,
      priceAvailable: true,
      billingAmountUsd: roundMoney(billingAmountUsd),
      monthlyRevenueEquivalentUsd: roundMoney(monthlyRevenueEquivalentUsd),
      maxMonthlyWorkloadCostUsd,
      workloadMarginPercent: null,
      ...acquisitionDefaults,
      reason: 'Stripe price is inactive. Do not promote this billing option until it is active.',
    };
  }

  if (acquisition.promotionCodesEnabled && promotionDiscountPercent == null) {
    return {
      interval: price.interval,
      status: 'blocked',
      currency: price.currency,
      sourceInterval: price.sourceInterval,
      priceActive: true,
      priceAvailable: true,
      billingAmountUsd: roundMoney(billingAmountUsd),
      monthlyRevenueEquivalentUsd: roundMoney(monthlyRevenueEquivalentUsd),
      maxMonthlyWorkloadCostUsd,
      workloadMarginPercent,
      firstCycleRevenueUsd: null,
      firstCycleWorkloadCostUsd,
      firstCycleMarginPercent: null,
      promotionDiscountPercent: null,
      reason: 'Promotion codes are enabled, but their maximum discount is not reviewed. Set a bounded discount ceiling before scaling.',
    };
  }

  if (!validPromotionDiscount) {
    return {
      interval: price.interval,
      status: 'blocked',
      currency: price.currency,
      sourceInterval: price.sourceInterval,
      priceActive: true,
      priceAvailable: true,
      billingAmountUsd: roundMoney(billingAmountUsd),
      monthlyRevenueEquivalentUsd: roundMoney(monthlyRevenueEquivalentUsd),
      maxMonthlyWorkloadCostUsd,
      workloadMarginPercent,
      firstCycleRevenueUsd: null,
      firstCycleWorkloadCostUsd,
      firstCycleMarginPercent: null,
      promotionDiscountPercent: null,
      reason: 'Promotion discount evidence is outside the supported 0% to 100% range. Correct the reviewed ceiling before scaling.',
    };
  }

  if (firstCycleRevenueUsd == null || firstCycleRevenueUsd <= 0) {
    return {
      interval: price.interval,
      status: 'blocked',
      currency: price.currency,
      sourceInterval: price.sourceInterval,
      priceActive: true,
      priceAvailable: true,
      billingAmountUsd: roundMoney(billingAmountUsd),
      monthlyRevenueEquivalentUsd: roundMoney(monthlyRevenueEquivalentUsd),
      maxMonthlyWorkloadCostUsd,
      workloadMarginPercent,
      firstCycleRevenueUsd,
      firstCycleWorkloadCostUsd,
      firstCycleMarginPercent: null,
      promotionDiscountPercent,
      reason: 'The reviewed promotion can reduce first-cycle cash to zero while included workload remains available. Do not scale this offer.',
    };
  }

  const passesTarget = workloadMarginPercent >= targetMarginPercent
    && firstCycleMarginPercent != null
    && firstCycleMarginPercent >= targetMarginPercent;
  return {
    interval: price.interval,
    status: passesTarget ? 'pass' : 'watch',
    currency: price.currency,
    sourceInterval: price.sourceInterval,
    priceActive: true,
    priceAvailable: true,
    billingAmountUsd: roundMoney(billingAmountUsd),
    monthlyRevenueEquivalentUsd: roundMoney(monthlyRevenueEquivalentUsd),
    maxMonthlyWorkloadCostUsd,
    workloadMarginPercent,
    firstCycleRevenueUsd,
    firstCycleWorkloadCostUsd,
    firstCycleMarginPercent,
    promotionDiscountPercent,
    reason: passesTarget
      ? `Maximum included Sona workload and first-cycle acquisition cost clear the ${targetMarginPercent}% contribution-margin target.`
      : `Steady-state or first-cycle workload falls below the ${targetMarginPercent}% contribution-margin target. Review price, promotion ceiling, or entitlement before scaling.`,
  };
}

function assessPlan(
  plan: BillingPlan,
  prices: PublicBillingPrices,
  targetMarginPercent: number,
  basis: SonaCostBasis,
  acquisition: AcquisitionEconomicsOptions,
): SonaPlanEconomics {
  const monthDecision = assessSonaPlanIntervalEconomics(plan, prices.plans[plan].month, {
    targetMarginPercent,
    costBasis: basis,
    ...acquisition,
  });
  const yearDecision = assessSonaPlanIntervalEconomics(plan, prices.plans[plan].year, {
    targetMarginPercent,
    costBasis: basis,
    ...acquisition,
  });
  const month = monthDecision.intervalEconomics;
  const year = yearDecision.intervalEconomics;

  return {
    plan,
    planLabel: monthDecision.planLabel,
    status: weakestStatus([month.status, year.status]),
    outcomeLabel: monthDecision.outcomeLabel,
    runsPerDayMax: monthDecision.runsPerDayMax,
    preparedPacketsPerDayMax: monthDecision.preparedPacketsPerDayMax,
    maxRunCostUsd: monthDecision.maxRunCostUsd,
    maxMonthlyWorkloadCostUsd: monthDecision.maxMonthlyWorkloadCostUsd,
    intervals: { month, year },
  };
}

export function assessSonaPlanIntervalEconomics(
  plan: BillingPlan,
  price: PublicBillingPrice,
  options: {
    targetMarginPercent?: number;
    costBasis?: SonaCostBasis;
    trialDays?: number;
    promotionCodesEnabled?: boolean;
    promotionDiscountPercent?: number | null;
    runsPerDayMax?: number;
    preparedPacketsPerDayMax?: number;
  } = {},
) {
  const tier = plan === 'studio' ? 'studio' : 'pro';
  const entitlement = resolveSonaWorkloadEntitlement(
    tier,
    plan === 'studio' ? 'prepare' : 'scout',
  );
  const policyBudget = getSonaDailyWorkloadBudget(tier);
  const runsPerDayMax = options.runsPerDayMax == null
    ? policyBudget.runsMax
    : Math.max(1, Math.floor(options.runsPerDayMax));
  const preparedPacketsPerDayMax = options.preparedPacketsPerDayMax == null
    ? policyBudget.preparedPacketsMax
    : Math.max(0, Math.floor(options.preparedPacketsPerDayMax));
  const basis = options.costBasis || DEFAULT_SONA_COST_BASIS;
  const maxRunCostUsd = estimateSonaEnvelopeCostMicros(entitlement.costEnvelope, basis) / 1_000_000;
  const maxMonthlyWorkloadCostUsd = roundMoney(maxRunCostUsd * runsPerDayMax * MODEL_DAYS_PER_MONTH);
  const acquisition = {
    trialDays: options.trialDays ?? STRIPE_TRIAL_DAYS,
    promotionCodesEnabled: options.promotionCodesEnabled ?? false,
    promotionDiscountPercent: options.promotionDiscountPercent ?? null,
  };

  return {
    plan,
    planLabel: entitlement.planLabel,
    outcomeLabel: entitlement.outcomeLabel,
    runsPerDayMax,
    preparedPacketsPerDayMax,
    maxRunCostUsd: roundMoney(maxRunCostUsd),
    maxMonthlyWorkloadCostUsd,
    intervalEconomics: assessInterval(
      price,
      maxMonthlyWorkloadCostUsd,
      options.targetMarginPercent ?? TARGET_SONA_WORKLOAD_MARGIN_PERCENT,
      acquisition,
    ),
  };
}

export function buildSonaPlanEconomicsGate(
  prices: PublicBillingPrices,
  options: {
    targetMarginPercent?: number;
    costBasis?: SonaCostBasis;
    trialDays?: number;
    promotionCodesEnabled?: boolean;
    promotionDiscountPercent?: number | null;
  } = {},
) {
  const targetMarginPercent = options.targetMarginPercent ?? TARGET_SONA_WORKLOAD_MARGIN_PERCENT;
  const costBasis = options.costBasis || DEFAULT_SONA_COST_BASIS;
  const acquisition = {
    trialDays: options.trialDays ?? STRIPE_TRIAL_DAYS,
    promotionCodesEnabled: options.promotionCodesEnabled ?? false,
    promotionDiscountPercent: options.promotionDiscountPercent ?? null,
  };
  const plans = [
    assessPlan('pro', prices, targetMarginPercent, costBasis, acquisition),
    assessPlan('studio', prices, targetMarginPercent, costBasis, acquisition),
  ];
  const status = weakestStatus(plans.map(plan => plan.status));

  return {
    gateVersion: SONA_PLAN_ECONOMICS_GATE_VERSION,
    costBasisVersion: costBasis.version,
    generatedAt: new Date().toISOString(),
    priceSnapshotAt: prices.updatedAt,
    targetMarginPercent,
    modelDaysPerMonth: MODEL_DAYS_PER_MONTH,
    trialDays: acquisition.trialDays,
    promotionCodesEnabled: acquisition.promotionCodesEnabled,
    promotionDiscountPercent: acquisition.promotionDiscountPercent,
    status,
    readyToScale: status === 'pass',
    scope: 'Sona provider workload plus trial and reviewed promotion exposure. This is a contribution-margin gate, not recognized revenue or total company gross margin.',
    plans,
  };
}
