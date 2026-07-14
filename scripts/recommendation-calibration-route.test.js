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

async function loadRoute() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-recommendation-calibration-route-'));
  const outfile = path.join(outdir, 'route.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'app', 'api', 'admin', 'ops', 'recommendation-calibration', 'route.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'calibration-route-mocks',
      setup(buildApi) {
        const modules = new Map([
          ['next/server', `
            export class NextResponse {
              static json(body, init = {}) {
                return { body, status: init.status || 200, headers: init.headers || {} };
              }
            }
          `],
          ['@/lib/api-auth', `
            export async function guardApiRoute() {
              globalThis.__calibrationRouteMocks.guardCalls += 1;
              return globalThis.__calibrationRouteMocks.guard;
            }
          `],
          ['@/lib/firebase-admin', `
            export function getAdminDb() {
              globalThis.__calibrationRouteMocks.dbCalls += 1;
              return globalThis.__calibrationRouteMocks.db;
            }
          `],
          ['@/lib/pricing-tiers', `
            export function isMasterAccount() {
              return globalThis.__calibrationRouteMocks.master;
            }
          `],
          ['@/lib/job-recommendation-platform', `
            export const TALENT_FIT_SCORE_VERSION = 'score-v-test';
          `],
        ]);
        for (const [specifier, contents] of modules) {
          const key = specifier.replace(/[^a-z0-9]/gi, '-');
          buildApi.onResolve({ filter: new RegExp('^' + specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }, () => ({ path: key, namespace: 'mock' }));
          buildApi.onLoad({ filter: new RegExp('^' + key + '$'), namespace: 'mock' }, () => ({ contents, loader: 'js' }));
        }
        buildApi.onResolve({ filter: /^@\// }, args => ({ path: resolveRootImport(args.path) }));
      },
    }],
  });
  return require(outfile);
}

const routeModule = loadRoute();

function request() {
  return { nextUrl: { searchParams: new URLSearchParams('windowDays=180') } };
}

function evidence() {
  return {
    snapshotVersion: 1,
    impressionId: 'impression-1',
    jobKey: 'job-1',
    resumeId: 'resume-1',
    resumeFingerprint: 'fingerprint-1',
    scoreVersion: 'score-v-test',
    score: 86,
    rank: 1,
    fitConfidence: 'high',
    evidenceCoverage: 90,
    sourceConfidence: 'high',
    observedAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
    cohortEligible: true,
    exclusionReason: null,
  };
}

function databaseWith(docs) {
  return {
    collectionGroup(name) {
      assert.equal(name, 'recommendation_calibration');
      return {
        where(field, operator) {
          assert.equal(field, 'reportedAt');
          assert.equal(operator, '>=');
          return this;
        },
        orderBy(field, direction) {
          assert.equal(field, 'reportedAt');
          assert.equal(direction, 'desc');
          return this;
        },
        limit(value) {
          assert.equal(value, 2001);
          return this;
        },
        async get() {
          return { size: docs.length, docs };
        },
      };
    },
  };
}

function reset(overrides = {}) {
  globalThis.__calibrationRouteMocks = {
    guardCalls: 0,
    dbCalls: 0,
    guard: { error: null, user: { uid: 'admin-1', email: 'admin@example.com' } },
    master: true,
    db: databaseWith([]),
    ...overrides,
  };
}

test('calibration route stops before Firestore when authentication fails', async () => {
  const route = await routeModule;
  const authError = { body: { error: 'Unauthorized' }, status: 401, headers: {} };
  reset({ guard: { error: authError } });

  const response = await route.GET(request());

  assert.equal(response, authError);
  assert.equal(globalThis.__calibrationRouteMocks.dbCalls, 0);
});

test('calibration route enforces master access before Firestore', async () => {
  const route = await routeModule;
  reset({ master: false });

  const response = await route.GET(request());

  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'Admin only');
  assert.equal(globalThis.__calibrationRouteMocks.dbCalls, 0);
});

test('calibration route returns no-store, suppressed, read-only aggregate evidence', async () => {
  const route = await routeModule;
  const reportedAt = new Date().toISOString();
  const docs = [{
    ref: { path: 'users/user-1/recommendation_calibration/application-1' },
    data: () => ({ outcome: 'offer', reportedAt, evidence: evidence() }),
  }];
  reset({ db: databaseWith(docs) });

  const response = await route.GET(request());

  assert.equal(response.status, 200);
  assert.equal(response.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(globalThis.__calibrationRouteMocks.dbCalls, 1);
  assert.equal(response.body.report.cohort.eligible, 1);
  assert.equal(response.body.report.cohort.positive, null);
  assert.equal(response.body.report.cohort.negative, null);
  assert.equal(response.body.report.scoreBuckets.find(bucket => bucket.key === 'prepare').suppressed, true);
  assert.deepEqual(response.body.reviewSafety, {
    automaticChangesApplied: false,
    scoreWeightChangeAuthorized: false,
    thresholdChangeAuthorized: false,
    humanReviewRequired: true,
  });
  assert.match(response.body.privacy, /No user, company, role, email, or resume data/);
  assert.equal(typeof globalThis.__calibrationRouteMocks.db.collection, 'undefined');
});
