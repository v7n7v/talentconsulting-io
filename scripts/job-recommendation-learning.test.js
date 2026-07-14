const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

function resolveRootImport(importPath) {
  const base = path.join(repoRoot, importPath.slice(2));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts')];
  return candidates.find(candidate => fs.existsSync(candidate)) || base;
}

async function loadRecommendationModule() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-job-learning-'));
  const outfile = path.join(outdir, 'job-learning.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'job-recommendation-platform.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    external: ['firebase-admin', 'next', 'next/*', 'react', 'react-dom'],
    plugins: [{
      name: 'alias-root',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^@\// }, args => ({ path: resolveRootImport(args.path) }));
      },
    }],
  });
  return require(outfile);
}

const recommendationModule = loadRecommendationModule();

function makeJob(overrides = {}) {
  const job = {
    id: 'job-1',
    title: 'Security Engineer',
    company: 'Verified Systems',
    location: 'Newark, NJ',
    salary: { min: 120000, max: 145000, currency: 'USD' },
    description: 'NIST incident response and cloud security.',
    skills: ['NIST', 'Incident Response', 'Cloud Security'],
    url: 'https://jobs.example.com/security-engineer',
    postedDate: '2026-07-09T00:00:00.000Z',
    employmentType: 'Full-time',
    source: 'Greenhouse',
    remoteMode: 'hybrid',
    sourceMeta: {
      sourceType: 'direct_ats',
      sourceName: 'Greenhouse',
      sourceConfidence: 'high',
      directApplyUrl: 'https://jobs.example.com/security-engineer',
      canonicalUrl: 'https://jobs.example.com/security-engineer',
      firstSeenAt: '2026-07-09T00:00:00.000Z',
      lastSeenAt: '2026-07-09T00:00:00.000Z',
    },
    dedupeKey: 'verified-systems|security-engineer|newark-nj|url-a',
    identityKey: 'verified-systems|security-engineer|newark-nj',
    matchScore: 82,
  };
  return { ...job, ...overrides };
}

function entry(jobKey, status, title, feedbackTags = []) {
  return {
    jobKey,
    status,
    title,
    company: 'Other Company',
    location: 'Newark, NJ',
    feedbackTags,
  };
}

test('preference learning is neutral before the user gives feedback', async () => {
  const { buildPreferenceLearningScore } = await recommendationModule;
  assert.deepEqual(buildPreferenceLearningScore(makeJob(), new Map()), { score: 70, evidenceCount: 0 });
});

test('save and interview signals lift similar roles while skips lower them', async () => {
  const { buildPreferenceLearningScore } = await recommendationModule;
  const positiveLedger = new Map([
    ['saved', entry('saved', 'saved', 'Cloud Security Engineer', ['more_like_this'])],
    ['interview', entry('interview', 'interview', 'Product Security Engineer')],
  ]);
  const negativeLedger = new Map([
    ['dismissed', entry('dismissed', 'dismissed', 'Senior Security Engineer', ['wrong_role'])],
  ]);

  const positive = buildPreferenceLearningScore(makeJob(), positiveLedger);
  const negative = buildPreferenceLearningScore(makeJob(), negativeLedger);
  assert.ok(positive.score > 70);
  assert.ok(negative.score < 70);
  assert.equal(positive.evidenceCount, 2);
  assert.equal(negative.evidenceCount, 1);
});

test('cross-provider suppression uses stable title, company and location identity', async () => {
  const { normalizeJobIdentity, suppressLedgerMatches } = await recommendationModule;
  const job = makeJob({ dedupeKey: 'url-specific-new-key', url: 'https://aggregator.example/new-url' });
  const ledger = new Map([[normalizeJobIdentity(job), entry(normalizeJobIdentity(job), 'dismissed', job.title)]]);

  assert.equal(suppressLedgerMatches([job], ledger).length, 0);
});

function createLedgerReadDb(recentCount, signalCount) {
  function docs(count, prefix) {
    return Array.from({ length: count }, (_, index) => ({
      id: `${prefix}-${index}`,
      data: () => ({
        jobKey: `${prefix}-${index}`,
        status: prefix === 'signal' ? 'dismissed' : 'shown',
        feedbackTags: [],
      }),
    }));
  }
  return {
    collection() {
      return {
        doc() {
          return {
            collection() {
              let mode = 'recent';
              return {
                orderBy() { mode = 'recent'; return this; },
                where() { mode = 'signal'; return this; },
                limit() { return this; },
                async get() { return { docs: docs(mode === 'recent' ? recentCount : signalCount, mode) }; },
              };
            },
          };
        },
      };
    },
  };
}

test('ledger status fails closed when a bounded query may be truncated', async () => {
  const { loadRecommendationLedgerWithStatus } = await recommendationModule;
  const complete = await loadRecommendationLedgerWithStatus(createLedgerReadDb(10, 10), 'user-123');
  const truncated = await loadRecommendationLedgerWithStatus(createLedgerReadDb(300, 12), 'user-123');

  assert.equal(complete.complete, true);
  assert.equal(complete.truncated, false);
  assert.equal(truncated.complete, false);
  assert.equal(truncated.truncated, true);
});

function createLedgerDb() {
  const docs = new Map();
  const db = {
    collection() {
      return {
        doc() {
          return {
            collection() {
              return {
                doc(id) {
                  return {
                    id,
                    async get() {
                      const data = docs.get(id);
                      return { exists: Boolean(data), data: () => data || {} };
                    },
                    async create(data) {
                      if (docs.has(id)) throw new Error('already exists');
                      docs.set(id, JSON.parse(JSON.stringify(data)));
                    },
                    async set(data, options) {
                      const current = options?.merge ? docs.get(id) || {} : {};
                      docs.set(id, { ...current, ...JSON.parse(JSON.stringify(data)) });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    async runTransaction(callback) {
      const transaction = {
        async get(ref) {
          const data = docs.get(ref.id);
          return { exists: Boolean(data), data: () => data || {} };
        },
        set(ref, data, options) {
          const current = options?.merge ? docs.get(ref.id) || {} : {};
          docs.set(ref.id, { ...current, ...JSON.parse(JSON.stringify(data)) });
        },
      };
      return callback(transaction);
    },
  };
  return { db, docs };
}

test('a later impression cannot downgrade saved status or erase feedback', async () => {
  const { upsertRecommendationLedger } = await recommendationModule;
  const { db, docs } = createLedgerDb();
  const job = makeJob();

  await upsertRecommendationLedger(db, 'user-123', job, 'saved', { feedbackTags: ['more_like_this'] });
  await upsertRecommendationLedger(db, 'user-123', job, 'shown');

  const saved = [...docs.values()][0];
  assert.equal(saved.status, 'saved');
  assert.deepEqual(saved.feedbackTags, ['more_like_this']);
  assert.deepEqual(saved.statusHistory.map(item => item.status), ['saved']);
});

test('background impression refresh preserves an existing user decision', async () => {
  const { recordRecommendationImpressions, upsertRecommendationLedger } = await recommendationModule;
  const { db, docs } = createLedgerDb();
  const job = makeJob();

  await upsertRecommendationLedger(db, 'user-123', job, 'dismissed', { feedbackTags: ['wrong_role'] });
  await recordRecommendationImpressions(db, 'user-123', [job]);

  const saved = [...docs.values()][0];
  assert.equal(saved.status, 'dismissed');
  assert.deepEqual(saved.feedbackTags, ['wrong_role']);
  assert.equal(saved.statusHistory.length, 1);
  assert.equal(typeof saved.lastSeenAt, 'string');
  assert.equal(saved.latestRank, 1);
});

test('impressions persist the server-ranked position used by calibration', async () => {
  const { recordRecommendationImpressions } = await recommendationModule;
  const { db, docs } = createLedgerDb();
  await recordRecommendationImpressions(db, 'user-123', [
    makeJob({ id: 'job-1', title: 'Security Engineer', identityKey: undefined }),
    makeJob({ id: 'job-2', title: 'Cloud Security Engineer', identityKey: undefined, dedupeKey: 'job-2' }),
  ]);
  const ranked = [...docs.values()].sort((a, b) => a.latestRank - b.latestRank);
  assert.deepEqual(ranked.map(item => item.latestRank), [1, 2]);
});

test('server impression binds score evidence to user, job, rank and resume', async () => {
  const {
    createRecommendationImpressionSession,
    loadRecommendationCalibrationEvidenceFromImpression,
    TALENT_FIT_SCORE_VERSION,
  } = await recommendationModule;
  const { db } = createLedgerDb();
  const resume = { name: 'Candidate', skills: ['Security', 'NIST'] };
  const job = makeJob({ identityKey: undefined });
  job.fitScore = {
    scoreVersion: TALENT_FIT_SCORE_VERSION,
    confidence: 'high',
    evidenceCoverage: 88,
    overall: 84,
  };
  job.matchScore = 84;
  const impressionId = await createRecommendationImpressionSession(db, 'user-123', [job], {
    resumeId: 'resume-1',
    resume,
    sortBy: 'relevance',
  });
  const evidence = await loadRecommendationCalibrationEvidenceFromImpression(db, 'user-123', {
    impressionId,
    resumeId: 'resume-1',
    resume,
    job,
  });
  assert.equal(evidence.cohortEligible, true);
  assert.equal(evidence.rank, 1);
  assert.equal(evidence.resumeId, 'resume-1');
  assert.equal(evidence.impressionId, impressionId);

  const changedResume = await loadRecommendationCalibrationEvidenceFromImpression(db, 'user-123', {
    impressionId,
    resumeId: 'resume-1',
    resume: { ...resume, skills: ['Different skill'] },
    job,
  });
  assert.equal(changedResume.cohortEligible, false);
  assert.equal(changedResume.exclusionReason, 'resume_mismatch');
});

test('an outcome-only ledger update preserves the original score evidence', async () => {
  const { recordRecommendationImpressions, upsertRecommendationLedger } = await recommendationModule;
  const { db, docs } = createLedgerDb();
  const job = makeJob({ identityKey: undefined });
  job.fitScore = {
    scoreVersion: 'talent-fit-v2-2026-07-10',
    confidence: 'high',
    evidenceCoverage: 88,
    overall: 84,
  };
  job.matchScore = 84;
  await recordRecommendationImpressions(db, 'user-123', [job]);
  const original = [...docs.values()][0];
  await upsertRecommendationLedger(db, 'user-123', { identityKey: original.jobKey }, 'interview', {
    feedbackTags: ['outcome_interview'],
    score: 84,
  });
  const updated = [...docs.values()][0];
  assert.equal(updated.status, 'interview');
  assert.deepEqual(updated.scoreBreakdown, original.scoreBreakdown);
  assert.deepEqual(updated.sourceMeta, original.sourceMeta);
  assert.equal(updated.title, original.title);
  assert.equal(updated.url, original.url);
});

test('browser feedback keeps the server requisition identity used by impressions', async () => {
  const { normalizeJobIdentity, recordRecommendationImpressions, upsertRecommendationLedger } = await recommendationModule;
  const { db, docs } = createLedgerDb();
  const fullJob = makeJob({
    category: 'Platform Security',
    sourceJobId: 'req-100',
  });
  fullJob.identityKey = normalizeJobIdentity(fullJob);

  await recordRecommendationImpressions(db, 'user-123', [fullJob]);
  await upsertRecommendationLedger(db, 'user-123', {
    ...fullJob,
    category: undefined,
    sourceJobId: undefined,
    identityKey: fullJob.identityKey,
  }, 'dismissed', { feedbackTags: ['wrong_role'] });

  assert.equal(docs.size, 1);
  const saved = [...docs.values()][0];
  assert.equal(saved.jobKey, fullJob.identityKey);
  assert.equal(saved.status, 'dismissed');
  assert.deepEqual(saved.feedbackTags, ['wrong_role']);
});

test('status and feedback updates never renew server observation freshness', async () => {
  const { recordRecommendationImpressions, upsertRecommendationLedger } = await recommendationModule;
  const { db, docs } = createLedgerDb();
  const job = makeJob({ identityKey: undefined });
  await recordRecommendationImpressions(db, 'user-123', [job]);
  const original = [...docs.values()][0];
  original.lastSeenAt = '2026-07-01T00:00:00.000Z';

  await upsertRecommendationLedger(db, 'user-123', {
    identityKey: original.jobKey,
  }, 'dismissed', { feedbackTags: ['wrong_role'], preserveEvidence: true });

  assert.equal([...docs.values()][0].lastSeenAt, '2026-07-01T00:00:00.000Z');
});

test('a new preference choice replaces contradictory preference tags', async () => {
  const { upsertRecommendationLedger } = await recommendationModule;
  const { db, docs } = createLedgerDb();
  const job = makeJob();

  await upsertRecommendationLedger(db, 'user-123', job, 'dismissed', { feedbackTags: ['wrong_role'] });
  await upsertRecommendationLedger(db, 'user-123', job, 'saved', { feedbackTags: ['more_like_this'] });

  const saved = [...docs.values()][0];
  assert.equal(saved.status, 'saved');
  assert.deepEqual(saved.feedbackTags, ['more_like_this']);
  assert.deepEqual(saved.statusHistory.map(item => item.status), ['dismissed', 'saved']);
});
