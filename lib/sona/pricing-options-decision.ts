import type { buildSonaPricingOptionsMemo } from '@/lib/sona/pricing-options-memo';

export const SONA_PRICING_OPTIONS_DECISION_VERSION = 'sona-pricing-options-decision-v1-2026-07-11';
export const SONA_PRICING_OPTIONS_SCENARIOS = [
  'current_offer',
  'protect_workload',
  'protect_price',
  'no_change',
] as const;

export type SonaPricingOptionsScenarioId = typeof SONA_PRICING_OPTIONS_SCENARIOS[number];

export type SonaPricingOptionsDecisionInput = {
  evidenceFingerprint: string;
  selectedScenarioId: SonaPricingOptionsScenarioId;
  rationale: string;
  confirmationText: string;
  acknowledgedNoStripeMutation: true;
  acknowledgedNoPromotionMutation: true;
  acknowledgedNoEntitlementMutation: true;
};

export function pricingOptionsDecisionPhrase(fingerprint: string) {
  return `RECORD ${fingerprint.slice(0, 8).toUpperCase()}`;
}

export function parseSonaPricingOptionsDecisionInput(value: unknown): SonaPricingOptionsDecisionInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const evidenceFingerprint = typeof input.evidenceFingerprint === 'string'
    ? input.evidenceFingerprint.trim().toLowerCase()
    : '';
  const selectedScenarioId = typeof input.selectedScenarioId === 'string'
    ? input.selectedScenarioId
    : '';
  const rationale = typeof input.rationale === 'string' ? input.rationale.trim() : '';
  const confirmationText = typeof input.confirmationText === 'string' ? input.confirmationText.trim() : '';
  if (!/^[a-f0-9]{64}$/.test(evidenceFingerprint)) return null;
  if (!SONA_PRICING_OPTIONS_SCENARIOS.includes(selectedScenarioId as SonaPricingOptionsScenarioId)) return null;
  if (rationale.length < 20 || rationale.length > 1_000) return null;
  if (confirmationText !== pricingOptionsDecisionPhrase(evidenceFingerprint)) return null;
  if (
    input.acknowledgedNoStripeMutation !== true
    || input.acknowledgedNoPromotionMutation !== true
    || input.acknowledgedNoEntitlementMutation !== true
  ) return null;
  return {
    evidenceFingerprint,
    selectedScenarioId: selectedScenarioId as SonaPricingOptionsScenarioId,
    rationale,
    confirmationText,
    acknowledgedNoStripeMutation: true,
    acknowledgedNoPromotionMutation: true,
    acknowledgedNoEntitlementMutation: true,
  };
}

export function buildSonaPricingOptionsDecision(
  input: SonaPricingOptionsDecisionInput,
  memo: ReturnType<typeof buildSonaPricingOptionsMemo>,
  reviewer: string,
  now = new Date().toISOString(),
) {
  if (!memo.readyForHumanReview) {
    return { ok: false as const, code: 'EVIDENCE_BLOCKED' as const, status: 409, error: 'The pricing evidence is not ready for review.' };
  }
  if (memo.evidenceFingerprint !== input.evidenceFingerprint) {
    return { ok: false as const, code: 'EVIDENCE_STALE' as const, status: 409, error: 'Pricing evidence changed. Review the latest memo before recording a decision.' };
  }
  if (
    input.selectedScenarioId !== 'no_change'
    && !memo.scenarios.some(scenario => scenario.id === input.selectedScenarioId)
  ) {
    return { ok: false as const, code: 'SCENARIO_INVALID' as const, status: 400, error: 'Select a scenario from the current memo.' };
  }
  const selectedScenario = input.selectedScenarioId === 'no_change'
    ? null
    : memo.scenarios.find(scenario => scenario.id === input.selectedScenarioId) || null;
  return {
    ok: true as const,
    record: {
      action: 'pricing_options_decision',
      at: now,
      by: reviewer,
      decisionVersion: SONA_PRICING_OPTIONS_DECISION_VERSION,
      evidenceFingerprint: input.evidenceFingerprint,
      memoVersion: memo.version,
      selectedScenarioId: input.selectedScenarioId,
      selectedScenarioSnapshot: selectedScenario,
      rationale: input.rationale,
      requiresHumanApproval: true,
      noStripeMutation: true,
      priceChangeAuthorized: false,
      promotionChangeAuthorized: false,
      entitlementChangeAuthorized: false,
    },
  };
}

export function compareSonaPricingOptionsDecisionReplay(
  existing: Record<string, unknown> | null,
  input: SonaPricingOptionsDecisionInput,
  reviewer: string,
) {
  if (!existing) return { ok: true as const, alreadyRecorded: false as const };
  const exact = existing.action === 'pricing_options_decision'
    && existing.evidenceFingerprint === input.evidenceFingerprint
    && existing.selectedScenarioId === input.selectedScenarioId
    && existing.rationale === input.rationale
    && existing.by === reviewer
    && existing.noStripeMutation === true
    && existing.priceChangeAuthorized === false
    && existing.promotionChangeAuthorized === false
    && existing.entitlementChangeAuthorized === false;
  return exact
    ? { ok: true as const, alreadyRecorded: true as const, record: existing }
    : { ok: false as const, code: 'DECISION_CONFLICT' as const, status: 409, error: 'This evidence already has a different canonical decision.' };
}

export function publicSonaPricingOptionsDecision(record: Record<string, unknown> | null) {
  if (
    !record
    || record.action !== 'pricing_options_decision'
    || typeof record.evidenceFingerprint !== 'string'
    || typeof record.selectedScenarioId !== 'string'
    || !SONA_PRICING_OPTIONS_SCENARIOS.includes(record.selectedScenarioId as SonaPricingOptionsScenarioId)
    || typeof record.rationale !== 'string'
    || typeof record.by !== 'string'
    || typeof record.at !== 'string'
    || record.noStripeMutation !== true
    || record.priceChangeAuthorized !== false
    || record.promotionChangeAuthorized !== false
    || record.entitlementChangeAuthorized !== false
  ) return null;
  return {
    evidenceFingerprint: record.evidenceFingerprint,
    selectedScenarioId: record.selectedScenarioId,
    selectedScenarioLabel: record.selectedScenarioId === 'no_change'
      ? 'No change'
      : (
          record.selectedScenarioSnapshot
          && typeof record.selectedScenarioSnapshot === 'object'
          && typeof (record.selectedScenarioSnapshot as Record<string, unknown>).label === 'string'
        ) ? (record.selectedScenarioSnapshot as Record<string, unknown>).label : record.selectedScenarioId,
    rationale: record.rationale,
    reviewedBy: record.by,
    recordedAt: record.at,
    noStripeMutation: true as const,
    priceChangeAuthorized: false as const,
    promotionChangeAuthorized: false as const,
    entitlementChangeAuthorized: false as const,
  };
}
