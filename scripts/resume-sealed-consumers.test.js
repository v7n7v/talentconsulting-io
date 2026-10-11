const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { buildSync } = require('esbuild');

const root = path.join(__dirname, '..');
const compiled = buildSync({
  stdin: {
    contents: "export { getVerifiedResumeForUserById, getLatestVerifiedResumeForUser, classifyResumeVerification } from './lib/server-resume'; export { getPacketSourceContent, inspectPacketReview } from './lib/job-packet-review'; export { readWorkspaceVersion, createWorkspaceMetadata } from './lib/resume-workspace'; export { hashConfirmedSource, hashSearchSourcePayload, validateSealedSearchSource } from './lib/resume-source-integrity';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
});
const loaded = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputFiles[0].text)(loaded, loaded.exports, require);
const api = loaded.exports;

const uid = 'alice';
const sourceId = `source_${'a'.repeat(64)}`;
const confirmedAt = '2026-10-10T12:00:00.000Z';
const requestId = '8a0c59b0-72f4-457b-b77b-12892d1ea83c';
function resumeContent() {
  return {
    name: 'Amina', title: 'Engineer', email: '', phone: '', location: '', summary: 'Source facts',
    experience: [{ company: 'Northstar', role: 'Engineer', duration: '2020–2024', achievements: ['Built systems'] }],
    education: [], skills: [{ category: 'Languages', items: ['TypeScript'] }], certifications: [],
  };
}
function sealed(overrides = {}) {
  const hashes = api.hashConfirmedSource(resumeContent());
  const workspace = {
    schemaVersion: 2, kind: 'source', purpose: 'role_search', origin: 'user_authored',
    sourceVersionId: sourceId, sourceHash: hashes.contentHash, contentHash: hashes.contentHash, sourceConfirmedAt: confirmedAt,
  };
  const receipt = {
    schemaVersion: 1, ownerId: uid, sourceId, requestId, contentHash: hashes.contentHash,
    packetHash: hashes.packetHash,
    payloadHash: api.hashSearchSourcePayload({ requestId, confirmedContent: resumeContent(), origin: 'user_authored' }), confirmedAt,
    contentHashEncoding: 'sha256-stable-json-v1', hashEncoding: 'sha256-json-stringify-v1',
  };
  return {
    id: sourceId, user_id: uid, content: hashes.content, is_active: true,
    metadata: { workspace }, source_confirmation_receipt: receipt,
    ...overrides,
  };
}
function snapshot(id, value) {
  return { id, exists: value != null, data: () => value };
}
function fakeDb({ versions = {}, vault = {} } = {}) {
  const rows = { resume_versions: versions, vault };
  const collection = name => ({
    doc: id => ({ get: async () => snapshot(id, rows[name]?.[id] || null) }),
    orderBy: () => ({ limit: () => ({ get: async () => {
      const docs = Object.entries(rows[name] || {}).map(([id, value]) => snapshot(id, value));
      return { empty: docs.length === 0, docs };
    } }) }),
    where: () => ({ get: async () => {
      const docs = Object.entries(rows[name] || {}).map(([id, value]) => snapshot(id, value));
      return { docs };
    } }),
  });
  return { collection: name => ({ doc: () => ({ collection }) }) };
}
function packetHash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

test('workspace reader exposes a valid sealed source snapshot without a presentation and fails malformed v2 closed', () => {
  const valid = api.readWorkspaceVersion(sealed({ version_name: 'Confirmed source' }));
  assert.equal(valid.kind, 'source');
  assert.equal(valid.unavailable, false);
  assert.deepEqual(valid.candidate, resumeContent());
  assert.deepEqual(valid.presentation, { design: null, template: null, palette: null, paletteId: null, targetPageCount: null });
  assert.equal(valid.sourceSnapshot.sourceVersionId, sourceId);
  const malformed = api.readWorkspaceVersion({ id: sourceId, content: resumeContent(), metadata: { workspace: { schemaVersion: 2, kind: 'source' } } });
  assert.equal(malformed.kind, 'source');
  assert.equal(malformed.unavailable, true);
  assert.equal(malformed.candidate, null);
  assert.throws(() => api.createWorkspaceMetadata({ kind: 'source', origin: 'user_authored' }), /only supports experience and resume/);
});

test('search readers return canonical sealed content only after owner, document id and hash verification', async () => {
  const good = sealed();
  const db = fakeDb({ versions: { [sourceId]: good } });
  const byId = await api.getVerifiedResumeForUserById(db, uid, sourceId);
  assert.deepEqual(byId.resume, resumeContent());
  assert.equal(byId.id, sourceId);
  const latest = await api.getLatestVerifiedResumeForUser(db, uid);
  assert.deepEqual(latest.resume, resumeContent());

  const wrongOwner = await api.getVerifiedResumeForUserById(fakeDb({ versions: { [sourceId]: sealed({ user_id: 'bob' }) } }), uid, sourceId);
  assert.equal(wrongOwner.resume, null);
  const changedContent = await api.getVerifiedResumeForUserById(fakeDb({ versions: { [sourceId]: sealed({ content: { ...resumeContent(), summary: 'changed' } }) } }), uid, sourceId);
  assert.equal(changedContent.resume, null);
  const generated = await api.getVerifiedResumeForUserById(fakeDb({ versions: { [sourceId]: sealed({ guardrail_report: { version: 1 } }) } }), uid, sourceId);
  assert.equal(generated.resume, null);
});

test('a malformed resume_versions source cannot fall through to a same-id vault record; vault cannot host v2 sources', async () => {
  const malformedVersion = sealed({ content: { ...resumeContent(), summary: 'mutated' } });
  const sameIdLegacyVault = { user_id: uid, content: resumeContent(), is_active: true };
  const result = await api.getVerifiedResumeForUserById(fakeDb({ versions: { [sourceId]: malformedVersion }, vault: { [sourceId]: sameIdLegacyVault } }), uid, sourceId);
  assert.equal(result.resume, null);
  assert.equal(result.source, null);
  const v2InVault = await api.getVerifiedResumeForUserById(fakeDb({ vault: { [sourceId]: sealed() } }), uid, sourceId);
  assert.equal(v2InVault.resume, null);
  assert.equal(api.getPacketSourceContent(sealed(), 'vault', { uid, id: sourceId }), null);
});

test('packet review requires exact sealed-source context and preserves the legacy JSON hash bytes', () => {
  const source = sealed();
  const canonicalContent = api.hashConfirmedSource(resumeContent()).content;
  assert.deepEqual(api.getPacketSourceContent(source, 'resume_versions', { uid, id: sourceId }), resumeContent());
  assert.equal(api.getPacketSourceContent(source, 'resume_versions'), null);
  assert.equal(api.getPacketSourceContent(source, 'resume_versions', { uid: 'bob', id: sourceId }), null);
  const packet = {
    user_id: uid, morph_source_resume_id: sourceId, morph_source_resume_type: 'resume_versions',
    morph_source_resume_hash: packetHash(canonicalContent), job_description: '',
  };
  const inspection = api.inspectPacketReview({ kind: 'application', id: 'packet-1', uid, packet, artifact: null, source });
  assert.deepEqual(inspection.sourceContent, resumeContent());
  assert.equal(inspection.binding.source.hash, packetHash(canonicalContent));

  const legacyContent = { name: 'Legacy', summary: 'old bytes', education: [{ details: null, degree: 'BS' }] };
  const legacy = { content: legacyContent, provenance: { verified: true, origin: 'user_upload' } };
  const returned = api.getPacketSourceContent(legacy, 'resume_versions');
  assert.equal(returned, legacyContent);
  assert.equal(packetHash(returned), packetHash(legacyContent));
});

test('generated v1 experience records cannot become verified search or packet sources', async () => {
  const content = resumeContent();
  const contentHash = api.hashConfirmedSource(content).contentHash;
  const workspace = api.createWorkspaceMetadata({
    kind: 'experience', origin: 'user_upload', sourceVersionId: 'career',
    sourceHash: contentHash, contentHash, sourceConfirmedAt: confirmedAt,
    sourceSnapshot: { content, contentHash, confirmedAt },
  });
  const generated = {
    id: 'career', user_id: uid, content, is_active: true,
    provenance: { verified: true, origin: 'user_upload' }, metadata: { workspace },
    guardrail_report: { version: 1 },
  };
  assert.equal(api.classifyResumeVerification(generated, 'resume_versions').verified, false);
  assert.equal((await api.getVerifiedResumeForUserById(fakeDb({ versions: { career: generated } }), uid, 'career')).resume, null);
  assert.equal(api.getPacketSourceContent(generated, 'resume_versions', { uid, id: 'career' }), null);
});

test('a misplaced source receipt fails closed rather than using a legacy source fallback', async () => {
  const malformed = {
    id: sourceId, user_id: uid, content: resumeContent(), is_active: true,
    provenance: { verified: true, origin: 'user_upload' },
    metadata: { source_confirmation_receipt: sealed().source_confirmation_receipt },
  };
  assert.equal(api.classifyResumeVerification(malformed, 'resume_versions').verified, false);
  const loaded = api.readWorkspaceVersion(malformed);
  assert.equal(loaded.kind, 'source');
  assert.equal(loaded.unavailable, true);
  assert.equal(loaded.candidate, null);
  assert.equal((await api.getVerifiedResumeForUserById(fakeDb({ versions: { [sourceId]: malformed } }), uid, sourceId)).resume, null);
  assert.equal(api.getPacketSourceContent(malformed, 'resume_versions', { uid, id: sourceId }), null);
});

test('client picker and search-source dependency graph bundles without server crypto or Firebase Admin', () => {
  const browser = buildSync({
    entryPoints: [path.join(root, 'components/ResumeLibraryPicker.tsx'), path.join(root, 'lib/job-search-resume-source.ts')],
    bundle: true, platform: 'browser', format: 'esm', outdir: '/tmp/taco-resume-source-browser-check', write: false, logLevel: 'silent',
  });
  const output = browser.outputFiles.map(file => file.text).join('\n');
  assert.match(output, /classifyResumeVerification/);
  assert.doesNotMatch(output, /node:crypto|firebase-admin/);
});
