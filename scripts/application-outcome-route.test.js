const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

async function loadRoute() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-application-outcome-route-'));
  const outfile = path.join(outdir, 'route.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'app/api/applications/outcome/route.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'application-outcome-route-mocks',
      setup(buildApi) {
        const modules = new Map([
          ['next/server', `
            export class NextRequest {}
            export class NextResponse extends Response {
              static json(value, init = {}) {
                return new Response(JSON.stringify(value), {
                  ...init,
                  headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
                });
              }
            }
          `],
          ['@/lib/api-auth', `
            export async function guardApiRoute() {
              globalThis.__outcomeMocks.guardCalls += 1;
              return globalThis.__outcomeMocks.guard;
            }
          `],
          ['@/lib/firebase-admin', `
            export function getAdminDb() {
              globalThis.__outcomeMocks.dbCalls += 1;
              return globalThis.__outcomeMocks.db;
            }
          `],
          ['@/lib/monitor', `
            export const monitor = { info() {}, critical() {} };
          `],
          ['@/lib/job-recommendation-platform', `
            export async function upsertRecommendationLedgerInTransaction(db, transaction, uid, job, status, opts) {
              globalThis.__outcomeMocks.ledgerCalls.push({ uid, job, status, opts });
              const ref = db.collection('users').doc(uid).collection('job_recommendations').doc('linked-job');
              const snapshot = await transaction.get(ref);
              const existing = snapshot.exists ? snapshot.data() : {};
              transaction.set(ref, {
                status,
                feedbackTags: [...new Set([...(existing.feedbackTags || []), ...(opts.feedbackTags || [])])],
              }, { merge: true });
            }
          `],
        ]);
        for (const [specifier, contents] of modules) {
          const key = specifier.replace(/[^a-z0-9]/gi, '-');
          const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          buildApi.onResolve({ filter: new RegExp(`^${escaped}$`) }, () => ({ path: key, namespace: 'mock' }));
          buildApi.onLoad({ filter: new RegExp(`^${key}$`), namespace: 'mock' }, () => ({ contents, loader: 'js' }));
        }
      },
    }],
  });
  return require(outfile);
}

const routeModule = loadRoute();
const appPath = 'users/user-1/applications/app-1';
const calibrationPath = 'users/user-1/recommendation_calibration/app-1';
const outcomePath = 'users/user-1/outcomes/app-1';
const ledgerPath = 'users/user-1/job_recommendations/linked-job';

function ref(pathname) {
  return { path: pathname };
}

function collectionRef(pathname) {
  return {
    doc(id) {
      return documentRef(`${pathname}/${id}`);
    },
  };
}

function documentRef(pathname) {
  return {
    path: pathname,
    collection(name) {
      return collectionRef(`${pathname}/${name}`);
    },
  };
}

function snapshot(data) {
  return { exists: data !== undefined, data: () => data };
}

function database(initial = {}, options = {}) {
  let docs = new Map(Object.entries(initial).map(([key, value]) => [key, structuredClone(value)]));
  return {
    get docs() { return docs; },
    collection(name) { return collectionRef(name); },
    async runTransaction(callback) {
      globalThis.__outcomeMocks.transactionCalls += 1;
      const draft = new Map([...docs].map(([key, value]) => [key, structuredClone(value)]));
      let writes = 0;
      const transaction = {
        async get(docRef) { return snapshot(draft.get(docRef.path)); },
        update(docRef, value) {
          writes += 1;
          if (options.failAtWrite === writes) throw new Error('transaction write failed');
          const current = draft.get(docRef.path) || {};
          draft.set(docRef.path, { ...current, ...structuredClone(value) });
        },
        set(docRef, value, config = {}) {
          writes += 1;
          if (options.failAtWrite === writes) throw new Error('transaction write failed');
          const current = config.merge ? draft.get(docRef.path) || {} : {};
          draft.set(docRef.path, { ...current, ...structuredClone(value) });
        },
      };
      const result = await callback(transaction);
      docs = draft;
      return result;
    },
  };
}

function request(body) {
  return { json: async () => body };
}

function initialApplication(overrides = {}) {
  return {
    status: 'applied',
    company_name: 'Verified Company',
    job_title: 'Security Engineer',
    applied_at: '2026-06-20T12:00:00.000Z',
    created_at: '2026-06-19T12:00:00.000Z',
    talent_density_score: 84,
    ...overrides,
  };
}

function reset({ application = initialApplication(), calibration, outcome, dbOptions } = {}) {
  const initial = {
    [appPath]: application,
    ...(calibration === null ? {} : {
      [calibrationPath]: calibration || { evidence: { jobKey: 'job-key-1', score: 84 } },
    }),
    ...(outcome ? { [outcomePath]: outcome } : {}),
  };
  globalThis.__outcomeMocks = {
    guardCalls: 0,
    dbCalls: 0,
    transactionCalls: 0,
    ledgerCalls: [],
    guard: { error: null, user: { uid: 'user-1' } },
    db: database(initial, dbOptions),
  };
}

async function post(body) {
  const route = await routeModule;
  return route.POST(request({ applicationId: 'app-1', source: 'manual', ...body }));
}

test('authentication failure stops before Firestore', async () => {
  const route = await routeModule;
  reset();
  const authError = Response.json({ error: 'Unauthorized' }, { status: 401 });
  globalThis.__outcomeMocks.guard = { error: authError };

  const response = await route.POST(request({ applicationId: 'app-1', outcome: 'interview' }));

  assert.equal(response, authError);
  assert.equal(globalThis.__outcomeMocks.dbCalls, 0);
});

test('one transaction updates application, calibration, analytics and recommendation learning', async () => {
  reset();

  const response = await post({ outcome: 'callback' });
  const payload = await response.json();
  const docs = globalThis.__outcomeMocks.db.docs;

  assert.equal(response.status, 200);
  assert.equal(payload.duplicate, false);
  assert.equal(payload.learningLinked, true);
  assert.equal(globalThis.__outcomeMocks.transactionCalls, 1);
  assert.equal(docs.get(appPath).outcome_response, 'callback');
  assert.equal(docs.get(appPath).status, 'screening');
  assert.equal(docs.get(calibrationPath).outcome, 'callback');
  assert.equal(docs.get(outcomePath).history.length, 1);
  assert.equal(docs.get(ledgerPath).status, 'interview');
});

test('forward progress keeps response history and advances calibration', async () => {
  reset({
    application: initialApplication({
      status: 'screening',
      outcome_response: 'callback',
      outcome_reported_at: '2026-07-01T12:00:00.000Z',
      outcome_days_to_response: 11,
    }),
    calibration: { outcome: 'callback', evidence: { jobKey: 'job-key-1', score: 84 } },
    outcome: { history: [{ outcome: 'callback', reportedAt: '2026-07-01T12:00:00.000Z', daysToResponse: 11, source: 'manual' }] },
  });

  const response = await post({ outcome: 'interview', interviewRounds: 2 });
  const docs = globalThis.__outcomeMocks.db.docs;

  assert.equal(response.status, 200);
  assert.equal(docs.get(appPath).status, 'interview_scheduled');
  assert.equal(docs.get(appPath).outcome_history.length, 2);
  assert.equal(docs.get(calibrationPath).outcome, 'interview');
  assert.equal(docs.get(calibrationPath).latestOutcome, 'interview');
});

test('a later rejection preserves the strongest positive calibration signal', async () => {
  reset({
    application: initialApplication({ status: 'interviewed', outcome_response: 'interview' }),
    calibration: { outcome: 'interview', evidence: { jobKey: 'job-key-1', score: 84 } },
  });

  const response = await post({ outcome: 'rejection' });
  const docs = globalThis.__outcomeMocks.db.docs;

  assert.equal(response.status, 200);
  assert.equal(docs.get(appPath).status, 'rejected');
  assert.equal(docs.get(appPath).outcome_response, 'rejection');
  assert.equal(docs.get(calibrationPath).outcome, 'interview');
  assert.equal(docs.get(calibrationPath).latestOutcome, 'rejection');
  assert.deepEqual(docs.get(ledgerPath).feedbackTags, ['outcome_rejection']);
});

test('legacy application history preserves positive evidence without companion documents', async () => {
  reset({
    application: initialApplication({
      status: 'interviewed',
      outcome_response: 'interview',
      outcome_reported_at: '2026-07-05T12:00:00.000Z',
      outcome_days_to_response: 15,
      outcome_history: [{ outcome: 'callback', reportedAt: '2026-07-01T12:00:00.000Z', daysToResponse: 11, source: 'manual' }, { outcome: 'interview', reportedAt: '2026-07-05T12:00:00.000Z', daysToResponse: 15, source: 'manual' }],
    }),
    calibration: null,
  });

  const response = await post({ outcome: 'rejection' });
  const docs = globalThis.__outcomeMocks.db.docs;

  assert.equal(response.status, 200);
  assert.equal(docs.get(appPath).outcome_history.length, 3);
  assert.equal(docs.get(outcomePath).history.length, 3);
  assert.equal(docs.get(calibrationPath).outcome, 'interview');
  assert.equal(docs.get(calibrationPath).latestOutcome, 'rejection');
});

test('an identical retry is idempotent and creates no second history item', async () => {
  reset({
    application: initialApplication({
      status: 'screening',
      outcome_response: 'callback',
      outcome_reported_at: '2026-07-01T12:00:00.000Z',
      outcome_days_to_response: 11,
    }),
    outcome: { history: [{ outcome: 'callback', reportedAt: '2026-07-01T12:00:00.000Z', daysToResponse: 11, source: 'manual' }] },
  });

  const response = await post({ outcome: 'callback' });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.duplicate, true);
  assert.equal(globalThis.__outcomeMocks.db.docs.get(outcomePath).history.length, 1);
  assert.equal(globalThis.__outcomeMocks.ledgerCalls.length, 0);
});

test('backwards and terminal transitions fail without a write', async () => {
  reset({ application: initialApplication({ status: 'interviewed', outcome_response: 'interview' }) });
  const before = structuredClone(globalThis.__outcomeMocks.db.docs.get(appPath));

  const response = await post({ outcome: 'callback' });
  const payload = await response.json();

  assert.equal(response.status, 409);
  assert.equal(payload.code, 'OUTCOME_TRANSITION_INVALID');
  assert.deepEqual(globalThis.__outcomeMocks.db.docs.get(appPath), before);
});

test('terminal application status blocks contradictory legacy outcomes', async () => {
  reset({ application: initialApplication({ status: 'rejected', outcome_response: null }) });
  const rejectedOffer = await post({ outcome: 'offer' });
  assert.equal(rejectedOffer.status, 409);
  assert.equal((await rejectedOffer.json()).code, 'OUTCOME_TRANSITION_INVALID');

  reset({ application: initialApplication({ status: 'accepted', outcome_response: null }) });
  const acceptedRejection = await post({ outcome: 'rejection' });
  assert.equal(acceptedRejection.status, 409);
  assert.equal((await acceptedRejection.json()).code, 'OUTCOME_TRANSITION_INVALID');
});

test('a transaction failure rolls every outcome surface back', async () => {
  reset({ dbOptions: { failAtWrite: 3 } });
  const before = structuredClone(globalThis.__outcomeMocks.db.docs.get(appPath));

  const response = await post({ outcome: 'interview' });

  assert.equal(response.status, 500);
  assert.deepEqual(globalThis.__outcomeMocks.db.docs.get(appPath), before);
  assert.equal(globalThis.__outcomeMocks.db.docs.has(outcomePath), false);
  assert.equal(globalThis.__outcomeMocks.db.docs.has(ledgerPath), false);
});

test('ghosting and numeric metadata use bounded validation', async () => {
  reset({ application: initialApplication({ applied_at: new Date().toISOString() }) });
  const early = await post({ outcome: 'ghosted' });
  assert.equal(early.status, 409);
  assert.equal((await early.json()).code, 'GHOST_WINDOW_NOT_REACHED');

  reset();
  const invalid = await post({ outcome: 'offer', offerAmount: -50 });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, 'INVALID_OUTCOME_METADATA');
});

test('applications UI exposes named forward outcome updates on mobile', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'app/suite/applications/page.tsx'), 'utf8');
  assert.match(page, /availableOutcomeUpdates/);
  assert.match(page, /Update this when the application advances/);
  assert.match(page, /Earlier responses stay in the outcome history/);
  assert.match(page, /grid grid-cols-2 gap-2/);
  assert.match(page, /disabled=\{outcomeLoading\}/);
  assert.match(page, /setDrawerActionError\(message\)/);
  assert.match(page, /Confirm \{OUTCOME_CONFIG\[confirmOutcome\]\.label\.toLowerCase\(\)\}/);
  assert.match(page, /<dialog/);
  assert.match(page, /dialog\.showModal\(\)/);
  assert.match(page, /onCancel=\{event =>/);
  assert.match(page, /if \(event\.key === 'Escape'\) event\.stopPropagation\(\)/);
  assert.match(page, /document\.activeElement === first/);
  assert.match(page, /document\.activeElement === last/);
  assert.match(page, /autoFocus/);
  assert.match(page, /onClose=\{restoreOutcomeFocus\}/);
  assert.match(page, /cancelOutcomeConfirmation\(\);\s*void onOutcome\(outcome\)/);
  assert.match(page, /document\.getElementById\('application-action-outcome'\)\?\.focus/);
  assert.match(page, /disabled=\{outcomeLoading \|\| Boolean\(confirmOutcome\)\}/);
  assert.match(page, /Review and confirm:/);
  assert.match(page, /setRequestedOutcomeConfirmation\(outcome\)/);
});
