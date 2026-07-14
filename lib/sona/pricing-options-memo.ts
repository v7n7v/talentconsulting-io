import { createHash } from 'node:crypto';
import type {
  BillingInterval,
  BillingPlan,
  PublicBillingPrice,
  PublicBillingPrices,
} from '@/lib/billing-price-types';
import {
  assessSonaPlanIntervalEconomics,
  TARGET_SONA_WORKLOAD_MARGIN_PERCENT,
} from '@/lib/sona/plan-economics';
import { DEFAULT_SONA_COST_BASIS } from '@/lib/sona/economics';
import {
  getSonaDailyWorkloadBudget,
  SONA_WORKLOAD_POLICY_VERSION,
} from '@/lib/sona/workload-policy';
import { STRIPE_TRIAL_DAYS } from '@/lib/billing/stripe-trial-policy';

export const SONA_PRICING_OPTIONS_MEMO_VERSION = 'sona-pricing-options-v1-2026-07-11';

type ScenarioConfig = {
  id: 'current_offer' | 'protect_workload' | 'protect_price';
  label: string;
  summary: string;
  promotionDiscountPercent: number;
  prices: Record<BillingPlan, Record<BillingInterval, number | null>>;
  workload: Record<BillingPlan, { runsPerDayMax: number; preparedPacketsPerDayMax: number }>;
  tradeoff: string;
};

function scenarioPrice(
  source: PublicBillingPrice,
  unitAmount: number | null,
): PublicBillingPrice {
  return {
    ...source,
    identityFingerprint: null,
    unitAmount,
    currency: 'usd',
    sourceInterval: source.interval,
    active: unitAmount != null && unitAmount > 0,
    sourceStatus: unitAmount == null ? 'unconfigured' : 'verified',
  };
}

function currentPriceAmounts(prices: PublicBillingPrices) {
  return {
    pro: {
      month: prices.plans.pro.month.unitAmount,
      year: prices.plans.pro.year.unitAmount,
    },
    studio: {
      month: prices.plans.studio.month.unitAmount,
      year: prices.plans.studio.year.unitAmount,
    },
  };
}

function formatPrice(unitAmount: number | null, interval: BillingInterval) {
  if (unitAmount == null) return 'Unavailable';
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(unitAmount / 100);
  return `${amount}/${interval === 'month' ? 'mo' : 'yr'}`;
}

function assessScenario(config: ScenarioConfig, sourcePrices: PublicBillingPrices) {
  const plans = (['pro', 'studio'] as BillingPlan[]).map(plan => {
    const intervals = Object.fromEntries((['month', 'year'] as BillingInterval[]).map(interval => {
      const decision = assessSonaPlanIntervalEconomics(
        plan,
        scenarioPrice(sourcePrices.plans[plan][interval], config.prices[plan][interval]),
        {
          promotionCodesEnabled: true,
          promotionDiscountPercent: config.promotionDiscountPercent,
          runsPerDayMax: config.workload[plan].runsPerDayMax,
          preparedPacketsPerDayMax: config.workload[plan].preparedPacketsPerDayMax,
        },
      );
      return [interval, {
        interval,
        status: decision.intervalEconomics.status,
        displayPrice: formatPrice(config.prices[plan][interval], interval),
        workloadMarginPercent: decision.intervalEconomics.workloadMarginPercent,
        firstCycleMarginPercent: decision.intervalEconomics.firstCycleMarginPercent,
        firstCycleWorkloadCostUsd: decision.intervalEconomics.firstCycleWorkloadCostUsd,
      }];
    })) as Record<BillingInterval, {
      interval: BillingInterval;
      status: 'pass' | 'watch' | 'blocked';
      displayPrice: string;
      workloadMarginPercent: number | null;
      firstCycleMarginPercent: number | null;
      firstCycleWorkloadCostUsd: number;
    }>;
    return {
      plan,
      planLabel: plan === 'studio' ? 'Talent Max' : 'Talent Pro',
      runsPerDayMax: config.workload[plan].runsPerDayMax,
      preparedPacketsPerDayMax: config.workload[plan].preparedPacketsPerDayMax,
      status: intervals.month.status === 'pass' && intervals.year.status === 'pass' ? 'pass' as const : 'watch' as const,
      intervals,
    };
  });

  return {
    id: config.id,
    label: config.label,
    summary: config.summary,
    status: plans.every(plan => plan.status === 'pass') ? 'pass' as const : 'watch' as const,
    promotionDiscountPercent: config.promotionDiscountPercent,
    tradeoff: config.tradeoff,
    plans,
  };
}

export function buildSonaPricingOptionsMemo(
  prices: PublicBillingPrices,
  options: {
    reviewedPromotionDiscountPercent: number | null;
    promotionEvidence: {
      verified: boolean;
      activeCodeCount: number;
      maxObservedPercent: number | null;
    };
  },
) {
  const current = currentPriceAmounts(prices);
  const proBudget = getSonaDailyWorkloadBudget('pro');
  const maxBudget = getSonaDailyWorkloadBudget('studio');
  const currentWorkload = {
    pro: { runsPerDayMax: proBudget.runsMax, preparedPacketsPerDayMax: proBudget.preparedPacketsMax },
    studio: { runsPerDayMax: maxBudget.runsMax, preparedPacketsPerDayMax: maxBudget.preparedPacketsMax },
  };
  const scenarios: ScenarioConfig[] = [
    {
      id: 'current_offer',
      label: 'Current offer',
      summary: 'Keep the verified Stripe catalogue, reviewed promotion ceiling, and current Sona workload.',
      promotionDiscountPercent: options.reviewedPromotionDiscountPercent ?? 100,
      prices: current,
      workload: currentWorkload,
      tradeoff: 'No customer-facing change, but checkout stays paused unless every option clears the gate.',
    },
    {
      id: 'protect_workload',
      label: 'Protect Sona workload',
      summary: 'Keep current daily Sona outcomes, cap promotions at 20%, and review a higher price ladder.',
      promotionDiscountPercent: 20,
      prices: {
        pro: { month: 799, year: 7_999 },
        studio: { month: 2_299, year: 22_999 },
      },
      workload: currentWorkload,
      tradeoff: 'Preserves product capability but requires willingness-to-pay validation and Stripe price review.',
    },
    {
      id: 'protect_price',
      label: 'Protect current price',
      summary: 'Keep the verified Stripe catalogue, remove promotions, and reduce the maximum daily Sona workload.',
      promotionDiscountPercent: 0,
      prices: current,
      workload: {
        pro: { runsPerDayMax: 8, preparedPacketsPerDayMax: 0 },
        studio: { runsPerDayMax: 1, preparedPacketsPerDayMax: 5 },
      },
      tradeoff: 'Preserves affordability but weakens the paid outcome and requires entitlement review.',
    },
  ];
  const assessedScenarios = scenarios.map(scenario => assessScenario(scenario, prices));
  const evidenceReady = options.promotionEvidence.verified
    && options.reviewedPromotionDiscountPercent != null
    && (['pro', 'studio'] as BillingPlan[]).every(plan =>
      (['month', 'year'] as BillingInterval[]).every(interval =>
        prices.plans[plan][interval].sourceStatus === 'verified'
        && prices.plans[plan][interval].unitAmount != null
        && prices.plans[plan][interval].unitAmount! > 0
        && prices.plans[plan][interval].active
        && prices.plans[plan][interval].sourceInterval === interval
        && prices.plans[plan][interval].currency.toLowerCase() === 'usd',
      ),
    );

  const evidenceFingerprint = createHash('sha256').update(JSON.stringify({
    version: SONA_PRICING_OPTIONS_MEMO_VERSION,
    marginTargetPercent: TARGET_SONA_WORKLOAD_MARGIN_PERCENT,
    trialDays: STRIPE_TRIAL_DAYS,
    costBasisVersion: DEFAULT_SONA_COST_BASIS.version,
    workloadPolicyVersion: SONA_WORKLOAD_POLICY_VERSION,
    reviewedPromotionDiscountPercent: options.reviewedPromotionDiscountPercent,
    promotionEvidence: options.promotionEvidence,
    prices: (['pro', 'studio'] as BillingPlan[]).flatMap(plan =>
      (['month', 'year'] as BillingInterval[]).map(interval => {
        const price = prices.plans[plan][interval];
        return {
          plan,
          interval,
          identityFingerprint: price.identityFingerprint,
          unitAmount: price.unitAmount,
          currency: price.currency,
          sourceInterval: price.sourceInterval,
          active: price.active,
          sourceStatus: price.sourceStatus,
        };
      }),
    ),
    scenarios,
  })).digest('hex');

  return {
    version: SONA_PRICING_OPTIONS_MEMO_VERSION,
    generatedAt: new Date().toISOString(),
    evidenceFingerprint,
    status: evidenceReady ? 'ready_for_review' as const : 'blocked' as const,
    readyForHumanReview: evidenceReady,
    currentOfferPasses: assessedScenarios[0].status === 'pass',
    requiresHumanApproval: true,
    noAutomaticPricingChange: true,
    noAutomaticPromotionChange: true,
    noAutomaticEntitlementChange: true,
    scope: 'Directional Sona workload contribution margin only; excludes taxes, support, infrastructure, acquisition spend, refunds and recognized revenue.',
    reason: evidenceReady
      ? 'Compare customer value, willingness to pay, promotion policy and workload promises before approving any change.'
      : 'Verify the complete recurring-price ladder and promotion inventory before reviewing scenarios.',
    scenarios: assessedScenarios,
  };
}
