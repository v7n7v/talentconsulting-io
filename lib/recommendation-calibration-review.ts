function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, 50) : [];
}

function numericRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, count]) => typeof count === 'number' && Number.isFinite(count))
    .slice(0, 50));
}

export function beginRecommendationCalibrationRequest(ref: { current: number }) {
  ref.current += 1;
  return ref.current;
}

export function isLatestRecommendationCalibrationRequest(ref: { current: number }, requestId: number) {
  return ref.current === requestId;
}

export function canExportRecommendationCalibration(input: {
  data: any;
  stale: boolean;
  loading: boolean;
}) {
  const safety = input.data?.reviewSafety;
  return Boolean(input.data?.report)
    && !input.stale
    && !input.loading
    && safety?.automaticChangesApplied === false
    && safety?.scoreWeightChangeAuthorized === false
    && safety?.thresholdChangeAuthorized === false
    && safety?.humanReviewRequired === true;
}

export function buildRecommendationCalibrationReviewExport(input: {
  data: any;
  stale: boolean;
  loading: boolean;
  exportedAt?: string;
}) {
  if (!canExportRecommendationCalibration(input)) return null;
  const data = input.data;
  const report = data.report;
  const cohort = report.cohort || {};
  const gate = report.gate || {};
  const safety = data.reviewSafety;

  return {
    reviewPacketVersion: 'recommendation-calibration-review-v1',
    exportedAt: text(input.exportedAt) || new Date().toISOString(),
    generatedAt: text(data.generatedAt),
    windowDays: finiteNumber(data.windowDays),
    trackedRecords: finiteNumber(data.trackedRecords),
    privacy: text(data.privacy),
    limitations: text(data.limitations),
    scoreVersion: text(report.scoreVersion),
    status: report.status === 'ready_for_human_review' ? 'ready_for_human_review' : 'collecting',
    gate: {
      minimumUsers: finiteNumber(gate.minimumUsers),
      minimumOutcomes: finiteNumber(gate.minimumOutcomes),
      minimumPositive: finiteNumber(gate.minimumPositive),
      minimumNegative: finiteNumber(gate.minimumNegative),
      minimumScoreBands: finiteNumber(gate.minimumScoreBands),
      minimumOutcomesPerScoreBand: finiteNumber(gate.minimumOutcomesPerScoreBand),
    },
    cohort: {
      scanned: finiteNumber(cohort.scanned),
      labelled: finiteNumber(cohort.labelled),
      eligible: finiteNumber(cohort.eligible),
      uniqueUsers: finiteNumber(cohort.uniqueUsers),
      positive: finiteNumber(cohort.positive),
      negative: finiteNumber(cohort.negative),
      positiveRate: finiteNumber(cohort.positiveRate),
      outcomeCellsSuppressed: cohort.outcomeCellsSuppressed === true,
      privacyMinCellSize: finiteNumber(cohort.privacyMinCellSize),
      qualifiedScoreBands: finiteNumber(cohort.qualifiedScoreBands),
      truncated: cohort.truncated === true,
      sampleLimit: finiteNumber(cohort.sampleLimit),
    },
    missing: stringList(report.missing),
    exclusionCounts: numericRecord(report.exclusionCounts),
    scoreBuckets: Array.isArray(report.scoreBuckets) ? report.scoreBuckets.slice(0, 10).map((bucket: any) => ({
      key: text(bucket?.key),
      count: finiteNumber(bucket?.count),
      positive: finiteNumber(bucket?.positive),
      negative: finiteNumber(bucket?.negative),
      positiveRate: finiteNumber(bucket?.positiveRate),
      averageScore: finiteNumber(bucket?.averageScore),
      suppressed: bucket?.suppressed === true,
    })) : [],
    orderingCheck: {
      monotonic: typeof report.orderingCheck?.monotonic === 'boolean' ? report.orderingCheck.monotonic : null,
      note: text(report.orderingCheck?.note),
    },
    decision: text(report.decision),
    authorization: {
      automaticChangesApplied: false,
      scoreWeightChangeAuthorized: false,
      thresholdChangeAuthorized: false,
      humanReviewRequired: safety.humanReviewRequired === true,
    },
  };
}
