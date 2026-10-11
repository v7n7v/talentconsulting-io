const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

function load(file, mocks = {}) {
  const filename = path.join(root, file);
  const code = esbuild.transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  const local = new Module(filename);
  local.filename = filename;
  local.paths = Module._nodeModulePaths(root);
  local.require = id => id in mocks ? mocks[id] : require(require.resolve(id, { paths: [root] }));
  local._compile(code, filename);
  return local.exports;
}

const sourceContract = load('lib/resume-search-source.ts');
const service = load('lib/resume-source-service.ts', {
  './resume-search-source': sourceContract,
  './resume-source-integrity': {
    hashConfirmedSource() { throw new Error('integrity boundary should not be called by route fixture'); },
    hashSearchSourcePayload() { throw new Error('integrity boundary should not be called by route fixture'); },
    validateSealedSearchSource() { throw new Error('integrity boundary should not be called by route fixture'); },
  },
});

const state = {
  guard: null,
  demo: false,
  nextServiceError: null,
  db: { fixture: 'admin-db' },
  guardCalls: 0,
  demoChecks: 0,
  adminDbCalls: 0,
  createCalls: [],
  readCalls: [],
  aiCalls: 0,
};

function reset() {
  Object.assign(state, {
    guard: { user: { uid: 'authenticated-user' } }, demo: false, nextServiceError: null,
    db: { fixture: 'admin-db' }, guardCalls: 0, demoChecks: 0, adminDbCalls: 0,
    createCalls: [], readCalls: [], aiCalls: 0,
  });
}

const route = load('app/api/resume/source/route.ts', {
  'next/server': {
    NextResponse: {
      json(body, options = {}) {
        return { body, status: options.status || 200, headers: options.headers || {} };
      },
    },
  },
  '@/lib/api-auth': {
    guardApiRoute: async () => {
      state.guardCalls++;
      return state.guard;
    },
  },
  '@/lib/firebase-admin': {
    getAdminDb: () => { state.adminDbCalls++; return state.db; },
  },
  '@/lib/demo-mode': {
    isDemoAuthRequest: () => { state.demoChecks++; return state.demo; },
  },
  '@/lib/resume-search-source': sourceContract,
  '@/lib/resume-source-service': {
    readBoundedSourceBody: service.readBoundedSourceBody,
    confirmSearchSource: async (db, uid, input) => {
      const parsed = sourceContract.parseConfirmSearchSourceRequest(input);
      state.createCalls.push({ db, uid, input: parsed });
      if (state.nextServiceError) throw state.nextServiceError;
      // Keep the route fixture at the service boundary while exercising the real request contract.
      return { source: { id: 'source_abc', user_id: uid }, receipt: { ownerId: uid, sourceId: 'source_abc' }, replayed: false };
    },
    readSearchSource: async (db, uid, id) => {
      state.readCalls.push({ db, uid, id });
      if (state.nextServiceError) throw state.nextServiceError;
      return { source: { id, user_id: uid }, receipt: { ownerId: uid, sourceId: id } };
    },
  },
  // The source route has no model/provider dependency. These counters make that invariant explicit.
  '@/lib/ai/groq-client': { groqJSONCompletion: async () => { state.aiCalls++; } },
  '@/lib/ai/providers': { getModel: () => { state.aiCalls++; } },
});

const validBody = {
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  origin: 'user_authored',
  confirmedContent: {
    name: 'Amina Noor', title: 'Engineer', email: '', phone: '', location: '', summary: '',
    experience: [], education: [], skills: [{ category: 'Systems', items: ['Linux'] }], certifications: [],
  },
};

function postRequest(value, raw = false) {
  const body = raw ? value : JSON.stringify(value);
  const bytes = new TextEncoder().encode(body);
  return {
    headers: new Headers({ 'content-length': String(bytes.byteLength) }),
    body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
  };
}

function assertNoStore(response) {
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
}

test('unauthorized GET and POST short-circuit before Admin DB or source service', async () => {
  reset();
  const denial = { status: 401, body: { error: 'unauthorized' } };
  state.guard = { error: denial };
  assert.equal(await route.GET({ nextUrl: new URL('https://example.test/api/resume/source?id=source_abc') }), denial);
  assert.equal(await route.POST(postRequest(validBody)), denial);
  assert.equal(state.guardCalls, 2);
  assert.equal(state.adminDbCalls, 0);
  assert.equal(state.createCalls.length, 0);
  assert.equal(state.readCalls.length, 0);
});

test('demo GET and POST stay local and never touch Admin DB or source service', async () => {
  reset();
  state.demo = true;
  const get = await route.GET({ nextUrl: new URL('https://example.test/api/resume/source?id=source_abc') });
  const post = await route.POST(postRequest(validBody));
  for (const response of [get, post]) {
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'DEMO_LOCAL_SOURCE_ONLY');
    assertNoStore(response);
  }
  assert.equal(state.adminDbCalls, 0);
  assert.equal(state.createCalls.length, 0);
  assert.equal(state.readCalls.length, 0);
});

test('POST validates bounded JSON and the source contract before any create call', async () => {
  reset();
  const oversized = await route.POST({
    headers: new Headers({ 'content-length': '800001' }),
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{}')); controller.close(); } }),
  });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.code, 'SOURCE_TOO_LARGE');
  assert.equal(state.createCalls.length, 0);

  const malformed = await route.POST(postRequest('{broken', true));
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.code, 'INVALID_SEARCH_SOURCE');
  assert.equal(state.createCalls.length, 0);
  assertNoStore(oversized);

  const extraField = await route.POST(postRequest({ ...validBody, callerUid: 'attacker-controlled' }));
  assert.equal(extraField.status, 400);
  assert.equal(extraField.body.code, 'INVALID_SEARCH_SOURCE');
  assert.equal(state.createCalls.length, 0);
  assertNoStore(malformed);
  assertNoStore(extraField);
});

test('authenticated POST uses only the guarded uid and returns a private no-store receipt', async () => {
  reset();
  state.guard = { user: { uid: 'derived-auth-uid', email: 'owner@example.test' } };
  const response = await route.POST(postRequest(validBody));
  assert.equal(response.status, 201);
  assert.deepEqual(state.createCalls, [{ db: state.db, uid: 'derived-auth-uid', input: validBody }]);
  assert.equal(response.body.source.user_id, 'derived-auth-uid');
  assert.equal(response.body.receipt.ownerId, 'derived-auth-uid');
  assertNoStore(response);
  assert.equal(state.aiCalls, 0);
});

test('authenticated GET passes the guarded uid and requested source id to the service', async () => {
  reset();
  state.guard = { user: { uid: 'derived-auth-uid' } };
  const response = await route.GET({ nextUrl: new URL('https://example.test/api/resume/source?id=source_exact-id') });
  assert.equal(response.status, 200);
  assert.deepEqual(state.readCalls, [{ db: state.db, uid: 'derived-auth-uid', id: 'source_exact-id' }]);
  assert.equal(response.body.source.user_id, 'derived-auth-uid');
  assertNoStore(response);
  assert.equal(state.aiCalls, 0);
});

test('owner, unavailable, and rollout-gated failures use canonical status and omit sensitive details', async () => {
  reset();
  const privateSourceText = 'PRIVATE-CONTENT-MUST-NOT-LEAK';
  const gatedBody = { ...validBody, confirmedContent: { ...validBody.confirmedContent, summary: privateSourceText } };
  const cases = [
    ['SOURCE_NOT_FOUND', 'This résumé source is unavailable. Return to your résumé and choose a confirmed revision.', 404, () => route.GET({ nextUrl: new URL('https://example.test/api/resume/source?id=source_missing') })],
    ['SOURCE_ACCOUNT_UNAVAILABLE', 'This account cannot use saved résumé sources.', 403, () => route.GET({ nextUrl: new URL('https://example.test/api/resume/source?id=source_abc') })],
    ['SOURCE_CREATION_UNAVAILABLE', 'Saving a résumé for Find roles is not available yet.', 503, () => route.POST(postRequest(gatedBody))],
  ];
  for (const [code, message, status, invoke] of cases) {
    state.nextServiceError = new sourceContract.SearchSourceValidationError(code, message, status);
    const response = await invoke();
    assert.equal(response.status, status);
    assert.equal(response.body.code, code);
    assert.equal(JSON.stringify(response.body).includes(privateSourceText), false);
    assertNoStore(response);
  }
});

test('unexpected service exceptions return a constant 503 without exception details', async () => {
  reset();
  state.nextServiceError = new Error('Firestore stack trace with PRIVATE-CONTENT-MUST-NOT-LEAK');
  const response = await route.POST(postRequest(validBody));
  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'SOURCE_TEMPORARILY_UNAVAILABLE');
  assert.equal(response.body.error, 'Your résumé source could not be saved or read. Retry when your connection is available.');
  assert.equal(JSON.stringify(response.body).includes('PRIVATE-CONTENT-MUST-NOT-LEAK'), false);
  assertNoStore(response);
  assert.equal(state.aiCalls, 0);
});
