const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');

async function load(entry) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-workspace-'));
  const outfile = path.join(dir, 'module.cjs');
  await build({ entryPoints: [path.join(__dirname, '..', 'lib', entry)], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  const result = require(outfile);
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

test('workspace envelope round trips exact source, target and presentation snapshots', async () => {
  const { createWorkspaceMetadata, readWorkspaceVersion } = await load('resume-workspace.ts');
  const source = { sourceVersionId: 'experience-r7', content: { name: 'Amina' }, confirmedAt: '2026-09-28T12:00:00.000Z' };
  const metadata = createWorkspaceMetadata({ kind: 'resume', origin: 'tailored', parentVersionId: 'resume-r1', sourceVersionId: 'experience-r7', sourceSnapshot: source, sourceHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', content: { name: 'Amina', title: 'Engineer' }, target: { jobTitle: 'Staff Engineer', company: 'Northstar', jobDescription: 'Build systems', url: 'https://example.test/job/1' }, presentation: { template: 'editorial', paletteId: 'ink', targetPageCount: 2 } });
  const reopened = readWorkspaceVersion({ id: 'resume-r2', version_name: 'Northstar', content: { name: 'Amina', title: 'Engineer' }, metadata: { workspace: metadata } });
  assert.equal(reopened.origin, 'tailored');
  assert.equal(reopened.sourceVersionId, 'experience-r7');
  assert.equal(reopened.target.company, 'Northstar');
  assert.equal(reopened.presentation.targetPageCount, 2);
  assert.deepEqual(reopened.source, source);
});

test('legacy records reopen as usable documents with unavailable source', async () => {
  const { readWorkspaceVersion } = await load('resume-workspace.ts');
  const reopened = readWorkspaceVersion({ id: 'old', version_name: 'Old', content: { name: 'Legacy' }, is_active: true, metadata: {} });
  assert.equal(reopened.legacy, true);
  assert.equal(reopened.origin, 'legacy');
  assert.equal(reopened.source, null);
  assert.deepEqual(reopened.candidate, { name: 'Legacy' });
});

test('canonical normalization preserves additional sections and stable ids', async () => {
  const { normalizeResume, serializeResumeToText } = await load('resume-normalizer.ts');
  const resume = normalizeResume({ name: 'Amina', experience: [{ id: 'e1', company: 'Northstar', role: 'Engineer', achievements: ['Built it'] }], education: [{ id: 'ed1', degree: 'BS', institution: 'State', year: '2020' }], skills: [{ id: 's1', category: 'Tools', items: ['Linux'] }], projects: [{ title: 'Orbit', items: ['Shipped a platform'] }], publications: [{ title: 'Paper', items: ['Published it'] }] });
  assert.equal(resume.experience[0].id, 'e1');
  assert.equal(resume.education[0].id, 'ed1');
  assert.equal(resume.skills[0].id, 's1');
  assert.deepEqual(resume.additionalSections.map(s => s.title), ['Projects', 'Publications']);
  assert.match(serializeResumeToText(resume), /Orbit/);
  assert.match(serializeResumeToText(resume), /Paper/);
  const edited = normalizeResume({ name: 'Amina', experience: [{ company: 'Northstar', role: 'Engineer', duration: '2020', achievements: ['Changed bullet'] }], education: [{ degree: 'BS', institution: 'State', year: '2020' }], skills: [{ category: 'Tools', items: ['Linux'] }] }, resume);
  assert.equal(edited.experience[0].id, resume.experience[0].id);
  assert.equal(edited.education[0].id, resume.education[0].id);
  assert.equal(edited.skills[0].id, resume.skills[0].id);
  const reordered = normalizeResume({ experience: [{ company: 'Second', role: 'Engineer', duration: '2021', achievements: ['B'] }, { company: 'Northstar', role: 'Engineer', duration: '2020', achievements: ['A'] }] }, normalizeResume({ experience: [{ company: 'Northstar', role: 'Engineer', duration: '2020', achievements: ['A'] }, { company: 'Second', role: 'Engineer', duration: '2021', achievements: ['B'] }] }));
  assert.equal(reordered.experience[1].id, normalizeResume({ experience: [{ company: 'Northstar', role: 'Engineer', duration: '2020', achievements: ['A'] }, { company: 'Second', role: 'Engineer', duration: '2021', achievements: ['B'] }] }).experience[0].id);
  const unknown = normalizeResume({ additionalSections: [{ id: 'research', title: 'Research', items: [{ title: 'Paper', authors: ['A', 'B'], venue: 'Journal', year: 2024, url: 'https://example.test/paper' }] }] });
  assert.match(unknown.additionalSections[0].items[0], /authors: A/);
  assert.match(unknown.additionalSections[0].items[0], /venue: Journal/);
  assert.match(unknown.additionalSections[0].items[0], /url: https:\/\/example\.test\/paper/);
});

test('malformed lineage is unavailable and snapshots are immutable copies', async () => {
  const { createWorkspaceMetadata, readWorkspaceVersion, buildResumeIdempotencyKey, isValidWorkspaceMetadata, stableWorkspaceContentHash } = await load('resume-workspace.ts');
  const source = { sourceVersionId: 'experience-1', nested: { claim: 'original' } };
  const metadata = createWorkspaceMetadata({ kind: 'experience', origin: 'user_authored', sourceVersionId: 'experience-1', sourceConfirmedAt: '2026-09-28T12:00:00.000Z', sourceHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', sourceSnapshot: { ...source, contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } });
  source.nested.claim = 'changed';
  assert.equal(metadata.sourceSnapshot.nested.claim, 'original');
  assert.equal(readWorkspaceVersion({ content: { name: 'x' }, metadata: { workspace: { schemaVersion: 1, kind: 'experience', origin: 'tailored' } } }).legacy, true);
  assert.equal(readWorkspaceVersion({ content: { name: 'x' }, metadata: { workspace: { schemaVersion: 1, kind: 'experience', origin: 'user_authored', sourceHash: 'bad' } } }).legacy, true);
  const first = await buildResumeIdempotencyKey('owner', 'content-a');
  const retry = await buildResumeIdempotencyKey('owner', 'content-a');
  const changed = await buildResumeIdempotencyKey('owner', 'content-b');
  assert.match(first, /^[a-f0-9]{40}$/);
  assert.equal(first, retry);
  assert.notEqual(first, changed);
  assert.equal(isValidWorkspaceMetadata({ schemaVersion: 1, kind: 'experience', origin: 'user_authored', sourceVersionId: 'e1', sourceConfirmedAt: '2026-09-28T12:00:00Z', sourceHash: 'a'.repeat(64), contentHash: 'b'.repeat(64), sourceSnapshot: { content: {}, contentHash: 'a'.repeat(64) } }), false);
  assert.equal(await stableWorkspaceContentHash({ detail: undefined }), await stableWorkspaceContentHash({ detail: null }));
});

test('auto page target survives presentation roundtrip', async () => {
  const { createWorkspaceMetadata, readWorkspaceVersion } = await load('resume-workspace.ts');
  const metadata = createWorkspaceMetadata({ kind: 'resume', origin: 'tailored', contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', presentation: { template: 'plain', targetPageCount: 'auto' } });
  assert.equal(readWorkspaceVersion({ content: {}, metadata: { workspace: metadata } }).presentation.targetPageCount, 'auto');
});

async function loadDatabase({ demo = false, switchOwnerDuringTransaction = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-db-'));
  const outfile = path.join(dir, 'database.cjs');
  const mockState = { docs: new Map(), owner: 'alice', writes: 0, switchOwnerDuringTransaction };
  const demoState = { versions: [] };
  const mockFirebase = `export const auth = { get currentUser() { return { uid: globalThis.__tcOwner }; } }; export const db = {};`;
  const mockDemo = `
    export const DEMO_USER_ID = 'demo-career-operator';
    export const isDemoModeEnabled = () => ${demo ? 'true' : 'false'};
    export const getDemoResumeVersions = () => globalThis.__tcDemo.versions.map(value => JSON.parse(JSON.stringify(value)));
    export const saveDemoResumeVersion = data => { const existing = globalThis.__tcDemo.versions.find(value => value.id === data.id); if (existing) { Object.assign(existing, data, { updated_at: new Date().toISOString() }); return JSON.parse(JSON.stringify(existing)); } const record = { id: data.id || 'demo-created', user_id: 'demo-career-operator', ...data }; globalThis.__tcDemo.versions.unshift(record); return JSON.parse(JSON.stringify(record)); };
    export const updateDemoResumeVersion = (id, updates) => { const found = globalThis.__tcDemo.versions.find(value => value.id === id); if (!found) return null; Object.assign(found, updates, { updated_at: new Date().toISOString() }); return JSON.parse(JSON.stringify(found)); };
    export const createDemoApplicationFromQueue = () => null; export const createDemoJobApplication = () => null; export const deleteDemoCoverLetter = () => null; export const deleteDemoJobApplication = () => null; export const getDemoAgentQueue = () => []; export const getDemoCoverLetters = () => []; export const getDemoJobApplications = () => []; export const getDemoStudyProgress = () => []; export const getDemoUserProfile = () => ({}); export const saveDemoCoverLetter = () => null; export const updateDemoJobApplication = () => null; export const updateDemoQueueItem = () => null; export const updateDemoStudyProgress = () => null;
  `;
  const mockFirestore = `
    export const doc = (collection, id) => ({ path: (collection.path || collection) + '/' + id, id });
    export const collection = (_db, ...parts) => ({ path: parts.join('/') });
    export const setDoc = async (ref, data) => globalThis.__tcDocs.set(ref.path, data);
    export const getDoc = async ref => { const data = globalThis.__tcDocs.get(ref.path); return { id: ref.id, exists: () => Boolean(data), data: () => data }; };
    export const updateDoc = async (ref, data) => globalThis.__tcDocs.set(ref.path, { ...(globalThis.__tcDocs.get(ref.path) || {}), ...data });
    export const deleteDoc = async ref => globalThis.__tcDocs.delete(ref.path);
    export const addDoc = async (collection, data) => { const ref = { id: 'new-doc', path: collection.path + '/new-doc' }; globalThis.__tcDocs.set(ref.path, data); return ref; };
    export const getFirestore = () => ({}); export const getDocs = async () => ({ docs: [] }); export const query = value => value; export const where = () => null; export const limit = () => null; export const orderBy = () => null; export const deleteField = () => null; export const serverTimestamp = () => new Date().toISOString();
    export const runTransaction = async (_db, callback) => { if (globalThis.__tcSwitch) globalThis.__tcOwner = 'bob'; const transaction = { get: async ref => { const data = globalThis.__tcDocs.get(ref.path); return { id: ref.id, exists: () => Boolean(data), data: () => data }; }, set: (ref, data) => { globalThis.__tcWrites++; globalThis.__tcDocs.set(ref.path, data); } }; return callback(transaction); };
  `;
  const mocks = [
    { filter: /^\.\/firebase$/, contents: mockFirebase },
    { filter: /^\.\/demo-mode$/, contents: mockDemo },
    { filter: /^\.\/auth-fetch$/, contents: 'export const authFetch = async () => ({ ok: true, json: async () => ({}) });' },
    { filter: /[\\/]lib[\\/]firebase\\.ts$/, contents: mockFirebase },
    { filter: /[\\/]lib[\\/]demo-mode\.ts$/, contents: mockDemo },
    { filter: /[\\/]lib[\\/]auth-fetch\.ts$/, contents: 'export const authFetch = async () => ({ ok: true, json: async () => ({}) });' },
    { filter: /firebase[\\/]firestore$/, contents: mockFirestore },
    { filter: /[\\/]lib[\\/]application-records\.ts$/, contents: 'export const normalizeApplicationRecord = value => value;' },
  ];
  global.__tcOwner = 'alice'; global.__tcDocs = mockState.docs; global.__tcWrites = 0; global.__tcSwitch = switchOwnerDuringTransaction; global.__tcDemo = demoState;
  await build({ entryPoints: [path.join(__dirname, '..', 'lib', 'database-suite.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', alias: { '@': path.resolve(__dirname, '..') }, plugins: [{ name: 'mocks', setup(buildApi) { for (const mock of mocks) buildApi.onResolve({ filter: mock.filter }, args => ({ path: `mock:${mocks.indexOf(mock)}`, namespace: 'mock' })); buildApi.onLoad({ filter: /^mock:/, namespace: 'mock' }, args => ({ contents: mocks[Number(args.path.slice(5))].contents, loader: 'ts' })); } }] });
  const module = require(outfile);
  module.__testState = { mockState, demoState };
  return module;
}

test('actual demo save retries are idempotent and metadata updates persist', async () => {
  const db = await loadDatabase({ demo: true });
  const { stableWorkspaceContentHash } = await load('resume-workspace.ts');
  const key = 'c'.repeat(40);
  const content = { name: 'Amina', education: [{ degree: 'BS', details: undefined }] };
  const first = await db.saveResumeVersion('Amina resume', content, {}, 'technical', { template: 'plain' }, { idempotencyKey: key, workspace: { kind: 'resume', origin: 'tailored' } });
  const retry = await db.saveResumeVersion('Amina resume', content, {}, 'technical', { template: 'plain' }, { idempotencyKey: key, workspace: { kind: 'resume', origin: 'tailored' } });
  const conflict = await db.saveResumeVersion('Different name', content, {}, 'technical', { template: 'plain' }, { idempotencyKey: key, workspace: { kind: 'resume', origin: 'tailored' } });
  assert.equal(first.success, true); assert.equal(retry.data.id, first.data.id); assert.equal(conflict.success, false);
  const renamed = await db.updateResumeVersion(first.data.id, { version_name: 'Renamed', is_active: false, metadata: { archived: true } });
  assert.equal(renamed.data.version_name, 'Renamed'); assert.equal(renamed.data.is_active, false); assert.equal(renamed.data.metadata.archived, true);
  assert.equal(first.data.metadata.workspace.contentHash.length, 64);
  assert.equal(first.data.metadata.workspace.contentHash, await stableWorkspaceContentHash({ name: 'Amina', education: [{ degree: 'BS', details: null }] }));
});

test('actual cloud save transaction rejects payload conflict and preserves normalized hash', async () => {
  const db = await loadDatabase();
  const key = 'd'.repeat(40);
  const content = { name: 'Amina', education: [{ degree: 'BS', details: undefined }] };
  const first = await db.saveResumeVersion('Amina resume', content, {}, 'technical', { template: 'plain' }, { idempotencyKey: key, workspace: { kind: 'resume', origin: 'tailored' } });
  const retry = await db.saveResumeVersion('Amina resume', { ...content }, {}, 'technical', { template: 'plain' }, { idempotencyKey: key, workspace: { kind: 'resume', origin: 'tailored' } });
  const conflict = await db.saveResumeVersion('Other resume', content, {}, 'technical', { template: 'plain' }, { idempotencyKey: key, workspace: { kind: 'resume', origin: 'tailored' } });
  assert.equal(first.success, true); assert.equal(retry.data.id, first.data.id); assert.equal(conflict.success, false);
  assert.match(first.data.metadata.workspace.contentHash, /^[a-f0-9]{64}$/);
});

test('actual cloud save aborts when owner changes before transaction commit', async () => {
  const db = await loadDatabase({ switchOwnerDuringTransaction: true });
  const result = await db.saveResumeVersion('Amina resume', { name: 'Amina', education: [{ details: undefined }] }, {}, 'technical', {}, { idempotencyKey: 'e'.repeat(40), workspace: { kind: 'resume', origin: 'tailored' } });
  assert.equal(result.success, false);
  assert.equal(db.__testState.mockState.writes, 0);
});
