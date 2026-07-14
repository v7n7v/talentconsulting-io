import { createHash } from 'node:crypto';

export type CalibrationOutcome = 'callback' | 'interview' | 'offer' | 'rejection' | 'ghosted';

export interface RecommendationCalibrationEvidence {
  snapshotVersion: 1;
  impressionId: string | null;
  jobKey: string | null;
  resumeId: string | null;
  resumeFingerprint: string | null;
  scoreVersion: string | null;
  score: number | null;
  rank: number | null;
  fitConfidence: 'high' | 'medium' | 'low' | null;
  evidenceCoverage: number | null;
  sourceConfidence: 'high' | 'medium' | 'low' | null;
  observedAt: string | null;
  capturedAt: string;
  cohortEligible: boolean;
  exclusionReason: string | null;
}

export interface RecommendationCalibrationSample {
  userKey: string;
  outcome: CalibrationOutcome;
  reportedAt: string;
  evidence: RecommendationCalibrationEvidence | null;
}

function stableResumeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableResumeValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stableResumeValue(item)]));
}

export function fingerprintRecommendationResume(resume: unknown) {
  return createHash('sha256').update(JSON.stringify(stableResumeValue(resume ?? null))).digest('hex');
}

export const RECOMMENDATION_CALIBRATION_GATE = {
  minimumUsers: 20,
  minimumOutcomes: 30,
  minimumPositive: 8,
  minimumNegative: 8,
  minimumScoreBands: 2,
  minimumOutcomesPerScoreBand: 5,
} as const;
export const RECOMMENDATION_CALIBRATION_MIN_CELL_SIZE = 5;

const POSITIVE_OUTCOMES = new Set<CalibrationOutcome>(['callback', 'interview', 'offer']);
const VALID_OUTCOMES = new Set<CalibrationOutcome>(['callback', 'interview', 'offer', 'rejection', 'ghosted']);
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);

function finiteScore(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? Math.round(parsed) : null;
}

function finiteRank(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30 ? parsed : null;
}

function confidence(value: unknown): 'high' | 'medium' | 'low' | null {
  return typeof value === 'string' && VALID_CONFIDENCE.has(value)
    ? value as 'high' | 'medium' | 'low'
    : null;
}

function isoDate(value: unknown) {
  if (typeof value !== 'string') return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function captureRecommendationCalibrationEvidence(
  ledger: Record<string, any> | null | undefined,
  currentScoreVersion: string,
  capturedAt = new Date().toISOString(),
): RecommendationCalibrationEvidence {
  const breakdown = ledger?.scoreBreakdown && typeof ledger.scoreBreakdown === 'object'
    ? ledger.scoreBreakdown as Record<string, unknown>
    : {};
  const scoreVersion = typeof breakdown.scoreVersion === 'string' ? breakdown.scoreVersion : null;
  const score = finiteScore(ledger?.score ?? breakdown.overall);
  const rank = finiteRank(ledger?.latestRank);
  const fitConfidence = confidence(breakdown.confidence);
  const sourceConfidence = confidence(ledger?.sourceMeta?.sourceConfidence);
  const evidenceCoverage = finiteScore(breakdown.evidenceCoverage);
  const observedAt = isoDate(ledger?.lastSeenAt || ledger?.updatedAt);
  const exclusionReason = !ledger
    ? 'ledger_evidence_unavailable'
    : scoreVersion !== currentScoreVersion
      ? 'score_version_mismatch'
      : typeof ledger.impressionId !== 'string' || !ledger.impressionId
        ? 'impression_missing'
        : typeof ledger.resumeId !== 'string' || !ledger.resumeId
          ? 'resume_id_missing'
          : typeof ledger.resumeFingerprint !== 'string' || !ledger.resumeFingerprint
            ? 'resume_fingerprint_missing'
      : score === null
        ? 'score_missing'
        : rank === null
          ? 'rank_missing'
          : rank > 3
            ? 'outside_top_three'
            : !fitConfidence
              ? 'fit_confidence_missing'
              : !sourceConfidence
                ? 'source_confidence_missing'
                : evidenceCoverage === null
                  ? 'evidence_coverage_missing'
                  : null;

  return {
    snapshotVersion: 1,
    impressionId: typeof ledger?.impressionId === 'string' && ledger.impressionId ? ledger.impressionId : null,
    jobKey: typeof ledger?.jobKey === 'string' && ledger.jobKey ? ledger.jobKey : null,
    resumeId: typeof ledger?.resumeId === 'string' && ledger.resumeId ? ledger.resumeId : null,
    resumeFingerprint: typeof ledger?.resumeFingerprint === 'string' && ledger.resumeFingerprint ? ledger.resumeFingerprint : null,
    scoreVersion,
    score,
    rank,
    fitConfidence,
    evidenceCoverage,
    sourceConfidence,
    observedAt,
    capturedAt: isoDate(capturedAt) || new Date().toISOString(),
    cohortEligible: exclusionReason === null,
    exclusionReason,
  };
}

function emptySegment(key: string) {
  return { key, count: 0, positive: 0, negative: 0, positiveRate: null as number | null, averageScore: null as number | null };
}

function summarizeSegment(key: string, samples: Array<RecommendationCalibrationSample & { evidence: RecommendationCalibrationEvidence }>) {
  if (samples.length === 0) return emptySegment(key);
  const positive = samples.filter(sample => POSITIVE_OUTCOMES.has(sample.outcome)).length;
  const scoreTotal = samples.reduce((total, sample) => total + (sample.evidence.score || 0), 0);
  return {
    key,
    count: samples.length,
    positive,
    negative: samples.length - positive,
    positiveRate: Math.round((positive / samples.length) * 100),
    averageScore: Math.round(scoreTotal / samples.length),
  };
}

function redactSmallOutcomeCell(segment: ReturnType<typeof summarizeSegment>) {
  const suppressed = segment.count > 0 && segment.count < RECOMMENDATION_CALIBRATION_MIN_CELL_SIZE;
  return suppressed
    ? {
        key: segment.key,
        count: null,
        positive: null,
        negative: null,
        positiveRate: null,
        averageScore: null,
        suppressed: true,
      }
    : { ...segment, suppressed: false };
}

export function buildRecommendationCalibrationReport(
  samples: RecommendationCalibrationSample[],
  options: { currentScoreVersion: string; sampleLimit?: number; truncated?: boolean },
) {
  const exclusionCounts: Record<string, number> = {};
  const labelled = samples.filter(sample => VALID_OUTCOMES.has(sample.outcome));
  const eligible = labelled.filter((sample): sample is RecommendationCalibrationSample & { evidence: RecommendationCalibrationEvidence } => {
    const evidence = sample.evidence;
    const reason = !evidence
      ? 'evidence_missing'
      : evidence.scoreVersion !== options.currentScoreVersion
        ? 'score_version_mismatch'
        : !evidence.cohortEligible
          ? evidence.exclusionReason || 'evidence_ineligible'
          : null;
    if (reason) exclusionCounts[reason] = (exclusionCounts[reason] || 0) + 1;
    return reason === null;
  });
  const positive = eligible.filter(sample => POSITIVE_OUTCOMES.has(sample.outcome)).length;
  const negative = eligible.length - positive;
  const uniqueUsers = new Set(eligible.map(sample => sample.userKey).filter(Boolean)).size;
  const exactBuckets = [
    summarizeSegment('below_review', eligible.filter(sample => (sample.evidence.score || 0) < 68)),
    summarizeSegment('review', eligible.filter(sample => (sample.evidence.score || 0) >= 68 && (sample.evidence.score || 0) < 80)),
    summarizeSegment('prepare', eligible.filter(sample => (sample.evidence.score || 0) >= 80)),
  ];
  const qualifiedScoreBands = exactBuckets.filter(bucket => bucket.count >= RECOMMENDATION_CALIBRATION_GATE.minimumOutcomesPerScoreBand).length;
  const outcomeCellsSuppressed = eligible.length > 0 && eligible.length < RECOMMENDATION_CALIBRATION_MIN_CELL_SIZE;
  const missing = [
    options.truncated ? 'complete cohort scan required; the bounded sample was truncated' : null,
    uniqueUsers < RECOMMENDATION_CALIBRATION_GATE.minimumUsers
      ? `${RECOMMENDATION_CALIBRATION_GATE.minimumUsers - uniqueUsers} more distinct users`
      : null,
    eligible.length < RECOMMENDATION_CALIBRATION_GATE.minimumOutcomes
      ? `${RECOMMENDATION_CALIBRATION_GATE.minimumOutcomes - eligible.length} more labelled outcomes`
      : null,
    positive < RECOMMENDATION_CALIBRATION_GATE.minimumPositive
      ? outcomeCellsSuppressed
        ? 'positive-outcome minimum not yet met'
        : `${RECOMMENDATION_CALIBRATION_GATE.minimumPositive - positive} more positive outcomes`
      : null,
    negative < RECOMMENDATION_CALIBRATION_GATE.minimumNegative
      ? outcomeCellsSuppressed
        ? 'negative-outcome minimum not yet met'
        : `${RECOMMENDATION_CALIBRATION_GATE.minimumNegative - negative} more negative outcomes`
      : null,
    qualifiedScoreBands < RECOMMENDATION_CALIBRATION_GATE.minimumScoreBands
      ? `${RECOMMENDATION_CALIBRATION_GATE.minimumScoreBands - qualifiedScoreBands} more score bands with at least ${RECOMMENDATION_CALIBRATION_GATE.minimumOutcomesPerScoreBand} outcomes`
      : null,
  ].filter(Boolean) as string[];
  const exactByFitConfidence = ['high', 'medium', 'low'].map(key => (
    summarizeSegment(key, eligible.filter(sample => sample.evidence.fitConfidence === key))
  ));
  const exactBySourceConfidence = ['high', 'medium', 'low'].map(key => (
    summarizeSegment(key, eligible.filter(sample => sample.evidence.sourceConfidence === key))
  ));
  const nonEmptyBuckets = exactBuckets.filter(bucket => bucket.count > 0 && bucket.positiveRate !== null);
  const orderingVisible = nonEmptyBuckets.length >= 2
    && nonEmptyBuckets.every(bucket => bucket.count >= RECOMMENDATION_CALIBRATION_MIN_CELL_SIZE);
  const monotonic = orderingVisible ? nonEmptyBuckets.every((bucket, index) => index === 0 || (
    (bucket.positive / bucket.count) >= (nonEmptyBuckets[index - 1].positive / nonEmptyBuckets[index - 1].count)
  )) : null;

  return {
    scoreVersion: options.currentScoreVersion,
    status: missing.length === 0 ? 'ready_for_human_review' as const : 'collecting' as const,
    automaticChangesApplied: false,
    gate: RECOMMENDATION_CALIBRATION_GATE,
    cohort: {
      scanned: samples.length,
      labelled: labelled.length,
      eligible: eligible.length,
      uniqueUsers,
      positive: outcomeCellsSuppressed ? null : positive,
      negative: outcomeCellsSuppressed ? null : negative,
      positiveRate: eligible.length && !outcomeCellsSuppressed ? Math.round((positive / eligible.length) * 100) : null,
      outcomeCellsSuppressed,
      privacyMinCellSize: RECOMMENDATION_CALIBRATION_MIN_CELL_SIZE,
      topThreeOnly: true,
      qualifiedScoreBands,
      truncated: Boolean(options.truncated),
      sampleLimit: options.sampleLimit || samples.length,
    },
    missing,
    exclusionCounts,
    scoreBuckets: exactBuckets.map(redactSmallOutcomeCell),
    byFitConfidence: exactByFitConfidence.map(redactSmallOutcomeCell),
    bySourceConfidence: exactBySourceConfidence.map(redactSmallOutcomeCell),
    orderingCheck: {
      monotonic,
      note: monotonic === null
        ? `Collect at least ${RECOMMENDATION_CALIBRATION_MIN_CELL_SIZE} outcomes in two score bands before showing ordering.`
        : monotonic
        ? 'Observed positive response does not fall as score bands rise.'
        : 'Observed positive response falls in a higher score band; review evidence and thresholds before any policy change.',
    },
    decision: missing.length === 0
      ? 'Review this cohort with product and data owners before changing weights or thresholds.'
      : 'Keep the current score policy fixed while the labelled cohort grows.',
  };
}
