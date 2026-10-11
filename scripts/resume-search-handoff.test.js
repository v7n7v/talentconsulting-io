const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const fixture = {
  name: 'Amina Rivera', title: 'Platform Engineer', email: 'amina@example.test', phone: '', location: 'Remote',
  summary: 'Builds reliable systems.', experience: [{ company: 'Northstar', role: 'Engineer', duration: '2022–2025', achievements: ['Built a service'] }],
  education: [], skills: [{ category: 'Tools', items: ['TypeScript'] }], certifications: [],
};

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    clear() { map.clear(); },
    entries() { return [...map.entries()]; },
  };
}

function stable(value) {
  if (value === undefined || value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
async function sha(value) {
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function sealedRecord(owner, request) {
  const requestId = request.requestId;
  const content = request.confirmedContent;
  const contentHash = await sha(stable(content));
  const packetHash = await sha(JSON.stringify(content));
  const payloadHash = await sha(stable(request));
  const id = `source_${await sha(requestId.toLowerCase())}`;
  const confirmedAt = '2026-10-10T12:00:00.000Z';
  const receipt = { schemaVersion: 1, ownerId: owner, sourceId: id, requestId, contentHash, packetHash, payloadHash, confirmedAt,
    contentHashEncoding: 'sha256-stable-json-v1', hashEncoding: 'sha256-json-stringify-v1' };
  return { id, user_id: owner, version_name: content.name, content, source: 'user_confirmed_role_search', is_active: true,
    provenance: { verified: true, origin: request.origin, recordedAt: confirmedAt },
    metadata: { workspace: { schemaVersion: 2, kind: 'source', purpose: 'role_search', origin: request.origin,
      sourceVersionId: id, sourceHash: contentHash, contentHash, sourceConfirmedAt: confirmedAt } },
    source_confirmation_receipt: receipt, ...(request.intake ? { intake: request.intake } : {}), created_at: confirmedAt, updated_at: confirmedAt };
}

async function loadAdapter(mock) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-source-client-'));
  const outfile = path.join(dir, 'adapter.cjs');
  globalThis.__resumeSourceMock = mock;
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  globalThis.window = { sessionStorage: mock.sessionStorage, localStorage: mock.localStorage };
  const mocks = new Map([
    ['./firebase', "export const auth = { get currentUser() { return globalThis.__resumeSourceMock.owner ? { uid: globalThis.__resumeSourceMock.owner } : null; } };"],
    ['./auth-fetch', 'export const authFetch = (...args) => globalThis.__resumeSourceMock.authFetch(...args);'],
    ['./demo-mode', "export const DEMO_USER_ID = 'demo-career-operator'; export const isDemoModeEnabled = () => globalThis.__resumeSourceMock.demo;"],
  ]);
  await build({ entryPoints: [path.join(root, 'lib/resume-search-source-client.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
    plugins: [{ name: 'adapter-mocks', setup(api) {
      api.onResolve({ filter: /^\.\/(firebase|auth-fetch|demo-mode)$/ }, args => ({ path: args.path, namespace: 'resume-mock' }));
      api.onLoad({ filter: /.*/, namespace: 'resume-mock' }, args => ({ contents: mocks.get(args.path), loader: 'ts' }));
    } }],
  });
  delete require.cache[require.resolve(outfile)];
  return { adapter: require(outfile), dispose() { fs.rmSync(dir, { recursive: true, force: true }); } };
}

async function loadWorkspaceHelpers() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-workspace-test-'));
  const outfile = path.join(dir, 'workspace.cjs');
  await build({ stdin: { contents: "export { createWorkspaceMetadata, stableWorkspaceContentHash } from './lib/resume-workspace'; export { normalizeResume } from './lib/resume-normalizer'; export { chooseCurrentResumeRoleFacts } from './lib/resume-guidance';", resolveDir: root, loader: 'ts' }, outfile,
    bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  delete require.cache[require.resolve(outfile)];
  return { helpers: require(outfile), dispose() { fs.rmSync(dir, { recursive: true, force: true }); } };
}

function baseMock(overrides = {}) {
  return { owner: 'alice', demo: false, sessionStorage: memoryStorage(), localStorage: memoryStorage(), calls: [], ...overrides };
}

function request() { return { requestId: '', confirmedContent: structuredClone(fixture), origin: 'user_upload' }; }

 test('lost POST response retries the exact captured request then verifies the exact GET readback', async () => {
  const mock = baseMock();
  const saved = new Map();
  let lost = true;
  mock.authFetch = async (url, init) => {
    mock.calls.push({ url, method: init.method, body: init.body });
    if (init.method === 'POST') {
      const body = JSON.parse(init.body);
      const source = await sealedRecord(mock.owner, body);
      saved.set(source.id, source); // Simulate commit before the response disappears.
      if (lost) { lost = false; throw new Error('connection dropped after commit'); }
      return new Response(JSON.stringify({ source, receipt: source.source_confirmation_receipt, replayed: true }), { status: 200 });
    }
    const id = new URL(url, 'https://local.test').searchParams.get('id');
    return new Response(JSON.stringify({ source: saved.get(id), receipt: saved.get(id)?.source_confirmation_receipt }), { status: 200 });
  };
  const firstLoad = await loadAdapter(mock);
  try {
    await assert.rejects(firstLoad.adapter.confirmResumeSearchSource({ ownerId: 'alice', request: request() }), /connection dropped/);
    firstLoad.dispose();
    const { adapter, dispose } = await loadAdapter(mock); // New module instance simulates a page reload.
    try {
      const result = await adapter.confirmResumeSearchSource({ ownerId: 'alice', request: request() });
    assert.equal(result.source.id, result.receipt.sourceId);
    assert.deepEqual(mock.calls.map(call => call.method), ['POST', 'POST', 'GET']);
    assert.equal(mock.calls[0].url, '/api/resume/source');
    assert.equal(mock.calls[2].url, `/api/resume/source?id=${encodeURIComponent(result.source.id)}`);
    const first = JSON.parse(mock.calls[0].body);
    const retry = JSON.parse(mock.calls[1].body);
    assert.equal(first.requestId, retry.requestId);
    assert.deepEqual(first, retry);
    assert.equal(saved.size, 1);
    } finally { dispose(); }
  } finally { firstLoad.dispose(); }
});

test('changed intake intent gets a new request identity for the same confirmed facts', async () => {
  const mock = baseMock();
  const saved = new Map();
  mock.authFetch = async (url, init) => {
    mock.calls.push({ url, method: init.method, body: init.body });
    if (init.method === 'POST') {
      const source = await sealedRecord(mock.owner, JSON.parse(init.body));
      saved.set(source.id, source);
      return new Response(JSON.stringify({ source, receipt: source.source_confirmation_receipt }), { status: 200 });
    }
    const id = new URL(url, 'https://local.test').searchParams.get('id');
    return new Response(JSON.stringify({ source: saved.get(id), receipt: saved.get(id)?.source_confirmation_receipt }), { status: 200 });
  };
  const { adapter, dispose } = await loadAdapter(mock);
  try {
    await adapter.confirmResumeSearchSource({ ownerId: 'alice', request: { ...request(), intake: { rawText: 'First captured text' } } });
    await adapter.confirmResumeSearchSource({ ownerId: 'alice', request: { ...request(), intake: { rawText: 'Revised captured text' } } });
    const posts = mock.calls.filter(call => call.method === 'POST').map(call => JSON.parse(call.body));
    assert.equal(posts.length, 2);
    assert.notEqual(posts[0].requestId, posts[1].requestId);
    assert.notEqual(posts[0].intake.rawText, posts[1].intake.rawText);
  } finally { dispose(); }
});

test('corrupted session retry payload is rejected before another network request', async () => {
  const mock = baseMock();
  mock.authFetch = async (url, init) => {
    mock.calls.push({ url, method: init.method, body: init.body });
    throw new Error('response lost');
  };
  const first = await loadAdapter(mock);
  try { await assert.rejects(first.adapter.confirmResumeSearchSource({ ownerId: 'alice', request: request() }), /response lost/); }
  finally { first.dispose(); }
  const [key, raw] = mock.sessionStorage.entries()[0];
  const stored = JSON.parse(raw);
  stored.request.confirmedContent.name = 'Tampered stored résumé';
  mock.sessionStorage.setItem(key, JSON.stringify(stored));
  const { adapter, dispose } = await loadAdapter(mock);
  try {
    await assert.rejects(adapter.confirmResumeSearchSource({ ownerId: 'alice', request: request() }), error => error.code === 'SOURCE_RETRY_STATE_INVALID');
    assert.equal(mock.calls.length, 1);
  } finally { dispose(); }
});

test('owner changes after POST response stop before readback or navigation-ready result', async () => {
  const mock = baseMock();
  let source;
  mock.authFetch = async (url, init) => {
    mock.calls.push({ url, method: init.method });
    source = await sealedRecord('alice', JSON.parse(init.body));
    mock.owner = 'bob';
    return new Response(JSON.stringify({ source, receipt: source.source_confirmation_receipt }), { status: 200 });
  };
  const { adapter, dispose } = await loadAdapter(mock);
  try {
    await assert.rejects(adapter.confirmResumeSearchSource({ ownerId: 'alice', request: request() }), error => error.code === 'SOURCE_OWNER_CHANGED');
    assert.deepEqual(mock.calls.map(call => call.method), ['POST']);
  } finally { dispose(); }
});

test('role-search adapter rejects a tampered response before making readback request', async () => {
  const mock = baseMock();
  mock.authFetch = async (url, init) => {
    mock.calls.push({ url, method: init.method });
    const source = await sealedRecord(mock.owner, JSON.parse(init.body));
    source.content.summary = 'Changed in transit';
    return new Response(JSON.stringify({ source, receipt: source.source_confirmation_receipt }), { status: 200 });
  };
  const { adapter, dispose } = await loadAdapter(mock);
  try {
    await assert.rejects(adapter.confirmResumeSearchSource({ ownerId: 'alice', request: request() }), error => error.code === 'SOURCE_INTEGRITY_FAILED');
    assert.deepEqual(mock.calls.map(call => call.method), ['POST']);
  } finally { dispose(); }
});

test('demo source is local-only, sealed, persisted and read back under the designated demo owner', async () => {
  const mock = baseMock({ owner: 'demo-career-operator', demo: true });
  mock.authFetch = async (...args) => { mock.calls.push(args); throw new Error('cloud must not be called in demo mode'); };
  const { adapter, dispose } = await loadAdapter(mock);
  try {
    const result = await adapter.confirmResumeSearchSource({ ownerId: mock.owner, request: request() });
    assert.equal(result.source.user_id, mock.owner);
    assert.equal(result.source.metadata.workspace.kind, 'source');
    assert.equal((await adapter.listDemoSearchSources(mock.owner)).length, 1);
    assert.equal(mock.localStorage.entries().length, 1);
    assert.equal(mock.calls.length, 0);
  } finally { dispose(); }
});

test('guarded legacy generated candidate is blocked before source confirmation; retained original facts can be reviewed and confirmed', async () => {
  const workspace = await loadWorkspaceHelpers();
  const mock = baseMock();
  const saved = new Map();
  mock.authFetch = async (url, init) => {
    mock.calls.push({ url, method: init.method, body: init.body });
    if (init.method === 'POST') {
      const source = await sealedRecord(mock.owner, JSON.parse(init.body));
      saved.set(source.id, source);
      return new Response(JSON.stringify({ source, receipt: source.source_confirmation_receipt }), { status: 200 });
    }
    const id = new URL(url, 'https://local.test').searchParams.get('id');
    return new Response(JSON.stringify({ source: saved.get(id), receipt: saved.get(id)?.source_confirmation_receipt }), { status: 200 });
  };
  const { adapter, dispose } = await loadAdapter(mock);
  try {
    const generatedCandidate = { ...structuredClone(fixture), summary: 'Generated optimization claim.' };
    const guardedLegacy = {
      id: 'legacy-guarded', content: generatedCandidate, guardrail_report: { version: 1 },
      metadata: { savedFrom: 'apply_pipeline' },
    };
    const blocked = await adapter.prepareSavedResumeRoleSearchReview(guardedLegacy);
    assert.equal(blocked.status, 'blocked');
    assert.match(blocked.reason, /generated content.*no retained original source/i);
    assert.equal(mock.calls.length, 0, 'blocked guarded legacy candidate never reaches source confirmation');

    const normalizedOriginal = workspace.helpers.normalizeResume(structuredClone(fixture));
    const original = JSON.parse(JSON.stringify(normalizedOriginal));
    const originalHash = await workspace.helpers.stableWorkspaceContentHash(normalizedOriginal);
    const sourceSnapshot = {
      sourceVersionId: 'confirmed-original', content: original, contentHash: originalHash,
      confirmedAt: '2026-10-10T12:00:00.000Z', origin: 'user_upload',
    };
    const normalizedGenerated = workspace.helpers.normalizeResume(generatedCandidate);
    const contentHash = await workspace.helpers.stableWorkspaceContentHash(normalizedGenerated);
    const generatedWithLineage = {
      id: 'tailored-with-source', content: normalizedGenerated,
      metadata: { workspace: workspace.helpers.createWorkspaceMetadata({
        kind: 'resume', origin: 'tailored', contentHash, content: normalizedGenerated,
        sourceHash: originalHash, sourceSnapshot,
      }) },
    };
    const reviewed = await adapter.prepareSavedResumeRoleSearchReview(generatedWithLineage);
    assert.equal(reviewed.status, 'review');
    assert.equal(reviewed.origin, 'user_upload');
    assert.match(reviewed.warning, /retained original source facts/i);
    assert.deepEqual(JSON.parse(JSON.stringify(reviewed.content)), original, 'review selects the retained original snapshot, not the generated candidate');
    const result = await adapter.confirmResumeSearchSource({ ownerId: 'alice', request: { ...request(), confirmedContent: reviewed.content, origin: reviewed.origin } });
    assert.deepEqual(result.source.content, original);
    assert.equal(mock.calls.filter(call => call.method === 'POST').length, 1);
  } finally {
    dispose();
    workspace.dispose();
  }
});

test('tailored current documents always select only their hash-sealed original, even after manual edits', async () => {
  const workspace = await loadWorkspaceHelpers();
  try {
    const { chooseCurrentResumeRoleFacts } = workspace.helpers;
    const original = workspace.helpers.normalizeResume(structuredClone(fixture));
    const originalHash = await workspace.helpers.stableWorkspaceContentHash(original);
    const generatedCandidate = { ...structuredClone(fixture), summary: 'Generated and then manually edited candidate.' };
    const selected = chooseCurrentResumeRoleFacts({
      documentOrigin: 'tailored', documentManualEdits: true, buildResume: generatedCandidate,
      workspaceSource: { content: original, contentHash: originalHash, origin: 'user_upload' },
      originalResume: generatedCandidate,
    });
    assert.deepEqual(selected.content, original);
    assert.equal(selected.origin, 'user_upload');
    assert.equal(selected.expectedHash, originalHash);

    const missingSource = chooseCurrentResumeRoleFacts({
      documentOrigin: 'tailored', documentManualEdits: true, buildResume: generatedCandidate,
      workspaceSource: null, originalResume: null,
    });
    assert.equal(missingSource, null, 'a tailored candidate cannot stand in when retained original facts are missing');
  } finally {
    workspace.dispose();
  }
});
