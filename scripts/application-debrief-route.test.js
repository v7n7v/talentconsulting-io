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
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-application-debrief-route-'));
  const outfile = path.join(outdir, 'route.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'app/api/agent/debriefs/route.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'application-debrief-route-mocks',
      setup(buildApi) {
        const modules = new Map([
          ['next/server', 'export class NextRequest {}'],
          ['@/lib/api-auth', `
            export async function guardApiRoute() {
              globalThis.__applicationDebriefMocks.guardCalls += 1;
              return globalThis.__applicationDebriefMocks.guard;
            }
          `],
          ['@/lib/firebase-admin', `
            export function getAdminDb() {
              globalThis.__applicationDebriefMocks.dbCalls += 1;
              return globalThis.__applicationDebriefMocks.db;
            }
          `],
          ['@/lib/career-twin', `
            export async function invalidateTwin() {
              globalThis.__applicationDebriefMocks.invalidateCalls += 1;
            }
          `],
          ['@/lib/story-bank', `
            export async function createStoryBankStory() {
              globalThis.__applicationDebriefMocks.storyCalls += 1;
            }
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

function request(body) {
  return { json: async () => body };
}

function database(application) {
  return {
    collection(name) {
      assert.equal(name, 'users');
      return {
        doc(uid) {
          assert.equal(uid, 'user-1');
          return {
            collection(child) {
              if (child === 'applications') {
                return {
                  doc(id) {
                    globalThis.__applicationDebriefMocks.applicationReads.push(id);
                    return {
                      async get() {
                        return {
                          exists: Boolean(application),
                          data: () => application,
                        };
                      },
                    };
                  },
                };
              }
              assert.equal(child, 'debriefs');
              return {
                doc(id) {
                  return {
                    id,
                    async get() {
                      const payload = globalThis.__applicationDebriefMocks.createdDocs.get(id);
                      return {
                        exists: Boolean(payload),
                        data: () => payload,
                      };
                    },
                    async create(payload) {
                      if (globalThis.__applicationDebriefMocks.createdDocs.has(id)) {
                        const error = new Error('Already exists');
                        error.code = 6;
                        throw error;
                      }
                      globalThis.__applicationDebriefMocks.createdDocs.set(id, payload);
                      globalThis.__applicationDebriefMocks.writes.push(payload);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

function reset(overrides = {}) {
  globalThis.__applicationDebriefMocks = {
    guardCalls: 0,
    dbCalls: 0,
    invalidateCalls: 0,
    storyCalls: 0,
    applicationReads: [],
    writes: [],
    createdDocs: new Map(),
    guard: { error: null, user: { uid: 'user-1' } },
    db: database({ company_name: 'Verified Co', job_title: 'Verified Role' }),
    ...overrides,
  };
}

function baseBody(overrides = {}) {
  return {
    company: 'Client supplied company',
    role: 'Client supplied role',
    overallFeeling: 4,
    strengths: 'A grounded answer',
    questions: [],
    idempotencyKey: 'request-key-123',
    ...overrides,
  };
}

test('debrief POST stops before Firestore when authentication fails', async () => {
  const route = await routeModule;
  const authError = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  reset({ guard: { error: authError } });

  const response = await route.POST(request(baseBody()));

  assert.equal(response, authError);
  assert.equal(globalThis.__applicationDebriefMocks.dbCalls, 0);
});

test('invalid application identities fail before a document lookup or write', async () => {
  const route = await routeModule;
  reset();

  const response = await route.POST(request(baseBody({ applicationId: 'folder/app-1' })));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'Application context is invalid');
  assert.deepEqual(globalThis.__applicationDebriefMocks.applicationReads, []);
  assert.deepEqual(globalThis.__applicationDebriefMocks.writes, []);
});

test('a missing application fails closed without saving a debrief', async () => {
  const route = await routeModule;
  reset({ db: database(null) });

  const response = await route.POST(request(baseBody({ applicationId: 'missing-app' })));

  assert.equal(response.status, 404);
  assert.deepEqual(globalThis.__applicationDebriefMocks.applicationReads, ['missing-app']);
  assert.deepEqual(globalThis.__applicationDebriefMocks.writes, []);
});

test('a linked debrief uses server-authoritative application identity', async () => {
  const route = await routeModule;
  reset();

  const response = await route.POST(request(baseBody({ applicationId: ' app-1 ' })));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.deepEqual(globalThis.__applicationDebriefMocks.applicationReads, ['app-1']);
  assert.equal(globalThis.__applicationDebriefMocks.writes.length, 1);
  assert.equal(globalThis.__applicationDebriefMocks.writes[0].applicationId, 'app-1');
  assert.equal(globalThis.__applicationDebriefMocks.writes[0].company, 'Verified Co');
  assert.equal(globalThis.__applicationDebriefMocks.writes[0].role, 'Verified Role');
  assert.equal(globalThis.__applicationDebriefMocks.invalidateCalls, 1);
});

test('ordinary unlinked debriefs remain backward compatible', async () => {
  const route = await routeModule;
  reset();

  const response = await route.POST(request(baseBody()));

  assert.equal(response.status, 200);
  assert.deepEqual(globalThis.__applicationDebriefMocks.applicationReads, []);
  assert.equal(globalThis.__applicationDebriefMocks.writes[0].company, 'Client supplied company');
  assert.equal(globalThis.__applicationDebriefMocks.writes[0].role, 'Client supplied role');
  assert.equal('applicationId' in globalThis.__applicationDebriefMocks.writes[0], false);
});

test('duplicate retries return the original write without duplicating data or stories', async () => {
  const route = await routeModule;
  reset();
  const body = baseBody({
    applicationId: 'app-1',
    questions: [{ text: 'How did you prioritize?', confidence: 80, category: 'Behavioral' }],
  });

  const first = await route.POST(request(body));
  const second = await route.POST(request(body));
  const duplicatePayload = await second.json();

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(duplicatePayload.duplicate, true);
  assert.equal(globalThis.__applicationDebriefMocks.writes.length, 1);
  assert.equal(globalThis.__applicationDebriefMocks.storyCalls, 1);
});

test('a reused idempotency key rejects changed content instead of confirming stale data', async () => {
  const route = await routeModule;
  reset();

  const first = await route.POST(request(baseBody({ strengths: 'Original evidence' })));
  const changed = await route.POST(request(baseBody({ strengths: 'Changed after an uncertain response' })));
  const payload = await changed.json();

  assert.equal(first.status, 200);
  assert.equal(changed.status, 409);
  assert.equal(payload.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(globalThis.__applicationDebriefMocks.writes.length, 1);
  assert.equal(globalThis.__applicationDebriefMocks.writes[0].strengths, 'Original evidence');
});

test('debrief input is bounded before it reaches Career Twin data', async () => {
  const route = await routeModule;
  reset();

  const response = await route.POST(request(baseBody({
    overallFeeling: 99,
    roundType: 'invented',
    interviewerVibe: 'hostile',
    outcome: 'unknown',
    questions: [{ text: '  Valid question  ', confidence: 900, category: 'X'.repeat(100) }],
    strengths: 'A'.repeat(6000),
  })));

  assert.equal(response.status, 200);
  const saved = globalThis.__applicationDebriefMocks.writes[0];
  assert.equal(saved.overallFeeling, 5);
  assert.equal(saved.roundType, 'behavioral');
  assert.equal(saved.interviewerVibe, 'neutral');
  assert.equal(saved.outcome, 'pending');
  assert.equal(saved.questions[0].confidence, 100);
  assert.equal(saved.questions[0].category.length, 80);
  assert.equal(saved.strengths.length, 5000);
});
