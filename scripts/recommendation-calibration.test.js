const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-recommendation-calibration-'));
const outfile = path.join(outdir, 'recommendation-calibration.cjs');
buildSync({
  entryPoints: [path.join(repoRoot, 'lib', 'recommendation-calibration.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});

const {
  buildRecommendationCalibrationReport,
  captureRecommendationCalibrationEvidence,
  fingerprintRecommendationResume,
} = require(outfile);
const reviewOutfile = path.join(outdir, 'recommendation-calibration-review.cjs');
buildSync({
  entryPoints: [path.join(repoRoot, 'lib', 'recommendation-calibration-review.ts')],
  outfile: reviewOutfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});
const {
  beginRecommendationCalibrationRequest,
  buildRecommendationCalibrationReviewExport,
  canExportRecommendationCalibration,
  isLatestRecommendationCalibrationRequest,
} = require(reviewOutfile);
const SCORE_VERSION = 'talent-fit-v2-2026-07-10';

function ledger(overrides = {}) {
  return {
    jobKey: 'company|role|location',
    impressionId: 'impression_1',
    resumeId: 'resume_1',
    resumeFingerprint: fingerprintRecommendationResume({ name: 'Candidate', skills: ['Security'] }),
    score: 84,
    latestRank: 2,
    scoreBreakdown: {
      scoreVersion: SCORE_VERSION,
      confidence: 'high',
      evidenceCoverage: 86,
      overall: 84,
    },
    sourceMeta: { sourceConfidence: 'high' },
    lastSeenAt: '2026-07-10T09:00:00.000Z',
    ...overrides,
  };
}

function sample(index, outcome, score, rank = 1) {
  return {
    userKey: `user_${index}`,
    outcome,
    reportedAt: '2026-07-10T10:00:00.000Z',
    evidence: captureRecommendationCalibrationEvidence(ledger({
      score,
      latestRank: rank,
      scoreBreakdown: {
        scoreVersion: SCORE_VERSION,
        confidence: score >= 80 ? 'high' : 'medium',
        evidenceCoverage: 80,
        overall: score,
      },
    }), SCORE_VERSION),
  };
}

test('evidence is eligible only for the current score contract and top three', () => {
  assert.equal(captureRecommendationCalibrationEvidence(ledger(), SCORE_VERSION).cohortEligible, true);
  assert.equal(captureRecommendationCalibrationEvidence(ledger({ latestRank: 4 }), SCORE_VERSION).exclusionReason, 'outside_top_three');
  assert.equal(captureRecommendationCalibrationEvidence(ledger({
    scoreBreakdown: { scoreVersion: 'old-score', confidence: 'high', evidenceCoverage: 90, overall: 90 },
  }), SCORE_VERSION).exclusionReason, 'score_version_mismatch');
  assert.equal(captureRecommendationCalibrationEvidence(null, SCORE_VERSION).exclusionReason, 'ledger_evidence_unavailable');
});

test('resume fingerprints are stable across object key ordering', () => {
  const first = fingerprintRecommendationResume({ name: 'Candidate', skills: ['Security'], profile: { city: 'Newark', level: 'Senior' } });
  const reordered = fingerprintRecommendationResume({ profile: { level: 'Senior', city: 'Newark' }, skills: ['Security'], name: 'Candidate' });
  const changed = fingerprintRecommendationResume({ name: 'Candidate', skills: ['Cloud Security'] });
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});

test('small cohorts remain collecting and never auto-change policy', () => {
  const report = buildRecommendationCalibrationReport([
    sample(1, 'interview', 86),
    sample(2, 'rejection', 74),
  ], { currentScoreVersion: SCORE_VERSION });
  assert.equal(report.status, 'collecting');
  assert.equal(report.automaticChangesApplied, false);
  assert.ok(report.missing.some(item => item.includes('distinct users')));
});

test('small outcome cells are suppressed before leaving the report boundary', () => {
  const report = buildRecommendationCalibrationReport([
    sample(1, 'offer', 86),
  ], { currentScoreVersion: SCORE_VERSION });

  assert.equal(report.cohort.eligible, 1);
  assert.equal(report.cohort.positive, null);
  assert.equal(report.cohort.negative, null);
  assert.equal(report.cohort.outcomeCellsSuppressed, true);
  assert.equal(report.scoreBuckets.find(bucket => bucket.key === 'prepare').suppressed, true);
  assert.equal(report.scoreBuckets.find(bucket => bucket.key === 'prepare').count, null);
  assert.equal(report.orderingCheck.monotonic, null);
  assert.doesNotMatch(report.missing.join(' '), /7 more positive outcomes/);
});

test('review export is stale-safe and allowlists its schema', () => {
  const report = buildRecommendationCalibrationReport([
    sample(1, 'offer', 86),
  ], { currentScoreVersion: SCORE_VERSION });
  const data = {
    generatedAt: '2026-07-10T10:00:00.000Z',
    windowDays: 180,
    trackedRecords: 1,
    privacy: 'Aggregate only',
    limitations: 'User-reported',
    report,
    reviewSafety: {
      automaticChangesApplied: false,
      scoreWeightChangeAuthorized: false,
      thresholdChangeAuthorized: false,
      humanReviewRequired: true,
    },
    futureSensitiveField: 'must not be exported',
  };

  assert.equal(canExportRecommendationCalibration({ data, stale: true, loading: false }), false);
  assert.equal(buildRecommendationCalibrationReviewExport({ data, stale: true, loading: false }), null);
  const exported = buildRecommendationCalibrationReviewExport({
    data,
    stale: false,
    loading: false,
    exportedAt: '2026-07-10T11:00:00.000Z',
  });
  assert.ok(exported);
  assert.equal(exported.scoreBuckets.find(bucket => bucket.key === 'prepare').suppressed, true);
  assert.equal(exported.scoreBuckets.find(bucket => bucket.key === 'prepare').positive, null);
  assert.equal('futureSensitiveField' in exported, false);
  assert.deepEqual(exported.authorization, data.reviewSafety);
});

test('only the latest calibration refresh may apply state', () => {
  const ref = { current: 0 };
  const first = beginRecommendationCalibrationRequest(ref);
  const second = beginRecommendationCalibrationRequest(ref);

  assert.equal(isLatestRecommendationCalibrationRequest(ref, first), false);
  assert.equal(isLatestRecommendationCalibrationRequest(ref, second), true);
});

test('a diverse 20-user cohort can reach human-review readiness', () => {
  const samples = Array.from({ length: 30 }, (_, index) => (
    sample(index, index < 18 ? (index % 3 === 0 ? 'offer' : 'interview') : (index % 2 === 0 ? 'rejection' : 'ghosted'), index < 18 ? 84 : 64)
  ));
  const report = buildRecommendationCalibrationReport(samples, {
    currentScoreVersion: SCORE_VERSION,
    sampleLimit: 2_000,
  });
  assert.equal(report.status, 'ready_for_human_review');
  assert.equal(report.cohort.uniqueUsers, 30);
  assert.equal(report.cohort.positive, 18);
  assert.equal(report.cohort.negative, 12);
  assert.equal(report.scoreBuckets.find(bucket => bucket.key === 'prepare').positiveRate, 100);
  assert.equal(report.scoreBuckets.find(bucket => bucket.key === 'below_review').positiveRate, 0);
  assert.equal(report.orderingCheck.monotonic, true);
  assert.equal(report.automaticChangesApplied, false);
});

test('ineligible and stale evidence is excluded with an auditable reason', () => {
  const outsideTopThree = sample(1, 'interview', 90, 4);
  const missingEvidence = { userKey: 'user_2', outcome: 'offer', reportedAt: '2026-07-10T10:00:00.000Z', evidence: null };
  const report = buildRecommendationCalibrationReport([outsideTopThree, missingEvidence], { currentScoreVersion: SCORE_VERSION });
  assert.equal(report.cohort.eligible, 0);
  assert.equal(report.exclusionCounts.outside_top_three, 1);
  assert.equal(report.exclusionCounts.evidence_missing, 1);
});

test('a truncated cohort fails closed even when its observed sample is large', () => {
  const samples = Array.from({ length: 30 }, (_, index) => (
    sample(index, index < 18 ? 'interview' : 'rejection', index < 18 ? 84 : 64)
  ));
  const report = buildRecommendationCalibrationReport(samples, {
    currentScoreVersion: SCORE_VERSION,
    sampleLimit: 30,
    truncated: true,
  });
  assert.equal(report.status, 'collecting');
  assert.ok(report.missing.some(item => item.includes('truncated')));
  assert.equal(report.automaticChangesApplied, false);
});

test('a single score band cannot become review-ready', () => {
  const samples = Array.from({ length: 30 }, (_, index) => (
    sample(index, index < 18 ? 'interview' : 'rejection', 84)
  ));
  const report = buildRecommendationCalibrationReport(samples, { currentScoreVersion: SCORE_VERSION });
  assert.equal(report.status, 'collecting');
  assert.equal(report.cohort.qualifiedScoreBands, 1);
  assert.ok(report.missing.some(item => item.includes('score bands')));
});

test('admin endpoint is aggregate-only and requires master access', () => {
  const route = fs.readFileSync(path.join(repoRoot, 'app/api/admin/ops/recommendation-calibration/route.ts'), 'utf8');
  const platform = fs.readFileSync(path.join(repoRoot, 'lib/job-recommendation-platform.ts'), 'utf8');
  const outcome = fs.readFileSync(path.join(repoRoot, 'app/api/applications/outcome/route.ts'), 'utf8');
  const pipeline = fs.readFileSync(path.join(repoRoot, 'app/api/agent/apply-pipeline/route.ts'), 'utf8');
  const database = fs.readFileSync(path.join(repoRoot, 'lib/database-suite.ts'), 'utf8');
  const searchRoute = fs.readFileSync(path.join(repoRoot, 'app/api/jobs/search/route.ts'), 'utf8');
  const searchPage = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/page.tsx'), 'utf8');
  const adminPage = fs.readFileSync(path.join(repoRoot, 'app/suite/admin/page.tsx'), 'utf8');
  const firestoreRules = fs.readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf8');
  const firebaseConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8'));
  assert.match(route, /isMasterAccount/);
  assert.match(route, /collectionGroup\('recommendation_calibration'\)/);
  assert.match(route, /Aggregate response only/);
  assert.match(route, /user-reported response signals/);
  assert.match(route, /'Cache-Control': 'private, no-store, max-age=0'/);
  assert.match(route, /scoreWeightChangeAuthorized: false/);
  assert.match(route, /thresholdChangeAuthorized: false/);
  assert.match(route, /pathParts\.length !== 4/);
  assert.doesNotMatch(route, /displayName|resumeText|company_name/);
  assert.match(platform, /latestRank/);
  assert.match(outcome, /collection\('recommendation_calibration'\)/);
  assert.match(pipeline, /collection\('recommendation_calibration'\)/);
  assert.match(database, /authFetch\('\/api\/applications\/outcome'/);
  assert.doesNotMatch(database.slice(database.indexOf('export async function reportApplicationOutcome'), database.indexOf('export async function getPendingOutcomeChecks')), /setDoc\(doc\(db, 'users', userId, 'outcomes'/);
  assert.doesNotMatch(searchRoute, /searchParams\.get\('userSkills'\)/);
  assert.doesNotMatch(searchPage, /params\.set\('userSkills'/);
  assert.match(searchRoute, /getVerifiedResumeForUserById/);
  assert.match(searchPage, /sourceJobId: job\.sourceJobId/);
  assert.match(searchPage, /impressionId: searchImpressionId/);
  assert.match(searchPage, /setSearchImpressionId\(null\)/);
  assert.match(searchPage, /searchRequestIdRef\.current \+= 1/);
  assert.match(adminPage, /Top-three Calibration/);
  assert.match(adminPage, /\/api\/admin\/ops\/recommendation-calibration\?windowDays=180/);
  assert.match(adminPage, /Export review packet/);
  assert.match(adminPage, /No automatic score change/);
  assert.match(adminPage, /recommendationCalibration\.report\.missing/);
  assert.match(adminPage, /recommendationCalibrationStale/);
  assert.match(adminPage, /Existing evidence is marked stale and cannot be exported/);
  assert.match(adminPage, /canExportRecommendationCalibration/);
  assert.match(adminPage, /isLatestRecommendationCalibrationRequest/);
  assert.doesNotMatch(adminPage, /setRecommendationWeights|updateRecommendationThresholds/);
  assert.doesNotMatch(searchPage, /onSortChange=\{setSortBy\}/);
  assert.match(searchPage, /onSortChange=\{value => \{ setSortBy\(value\); setSearchImpressionId\(null\); \}\}/);
  assert.match(pipeline, /loadRecommendationCalibrationEvidenceFromImpression/);
  assert.match(outcome, /GHOST_WINDOW_NOT_REACHED/);
  assert.match(outcome, /identityKey: calibrationEvidence\.jobKey/);
  assert.doesNotMatch(firestoreRules, /'recommendation_calibration'/);
  assert.equal(firebaseConfig.firestore.rules, 'firestore.rules');
  assert.equal(firebaseConfig.firestore.indexes, 'firestore.indexes.json');
  const indexes = JSON.parse(fs.readFileSync(path.join(repoRoot, 'firestore.indexes.json'), 'utf8'));
  const ttl = indexes.fieldOverrides.find(item => item.collectionGroup === 'recommendation_impressions' && item.fieldPath === 'expiresAt');
  assert.equal(ttl.ttl, true);
});
