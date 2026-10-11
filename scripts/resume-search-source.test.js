import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { buildSync } = require('esbuild');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'search-source-')), 'module.cjs');
const built = buildSync({
  stdin: { contents: "export * from './lib/resume-search-source'; export * from './lib/resume-source-integrity'; export { stableWorkspaceContentHash } from './lib/resume-workspace';", resolveDir: root, loader: 'ts' },
  outfile: outputPath, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
});
const api = require(outputPath);

const uid = 'user-123';
const sourceId = `source_${'a'.repeat(64)}`;
const requestId = '8a0c59b0-72f4-457b-b77b-12892d1ea83c';
const confirmedAt = '2026-10-10T14:22:03.123Z';
function source() {
  return {
    name: 'Zoë 李', title: '', email: 'zoe@example.test', phone: '', location: '東京',
    summary: '  Product engineer — café systems  ',
    experience: [{ id: 'exp-1', company: 'A&B', role: 'Engineer', duration: '2020–2024', achievements: ['Built 🧪 tools', ''] }],
    education: [{ degree: 'BS', institution: 'State', year: '', details: '' }],
    skills: [{ category: 'Languages', items: ['TypeScript', ''] }], certifications: [],
    links: [], additionalSections: [{ id: 'volunteering', title: 'Volunteer work', items: ['Food bank'] }],
  };
}
function sealedRecord(overrides = {}) {
  const content = api.normalizeConfirmedSource(source());
  const hashes = api.hashConfirmedSource(content);
  const workspace = api.createSearchSourceWorkspace({ sourceId, origin: 'user_upload', contentHash: hashes.contentHash, confirmedAt });
  const receipt = {
    schemaVersion: 1, ownerId: uid, sourceId, requestId, contentHash: hashes.contentHash,
    packetHash: hashes.packetHash, payloadHash: api.hashSearchSourcePayload({ requestId, confirmedContent: content, origin: 'user_upload' }), confirmedAt,
    contentHashEncoding: 'sha256-stable-json-v1', hashEncoding: 'sha256-json-stringify-v1',
  };
  return {
    id: sourceId, user_id: uid, content, is_active: true,
    metadata: { workspace }, source_confirmation_receipt: receipt,
    ...overrides,
  };
}
function validRequest() {
  return { requestId, confirmedContent: source(), origin: 'user_upload', intake: { rawText: 'resume text', warnings: ['parser note'], acknowledgedWarnings: true } };
}

test('source normalization preserves user fields and sorts object keys without normalizing facts', () => {
  const input = source();
  const normalized = api.normalizeConfirmedSource(input);
  assert.equal(normalized.summary, input.summary);
  assert.equal(normalized.title, '');
  assert.equal(normalized.education[0].details, '');
  assert.equal(normalized.experience[0].achievements[1], '');
  assert.deepEqual(normalized.additionalSections, input.additionalSections);
  assert.deepEqual(normalized.links, []);
  assert.equal(Object.hasOwn(normalized.education[0], 'id'), false);
  assert.deepEqual(Object.keys(normalized), [...Object.keys(normalized)].sort());
  const reordered = { certifications: [], skills: input.skills, education: input.education, experience: input.experience, summary: input.summary, location: input.location, phone: input.phone, email: input.email, title: input.title, name: input.name, additionalSections: input.additionalSections, links: [] };
  assert.equal(api.hashConfirmedSource(input).contentHash, api.hashConfirmedSource(reordered).contentHash);
  assert.equal(api.hashConfirmedSource(input).packetHash, api.hashConfirmedSource(reordered).packetHash);
});

test('request validation rejects hostile keys, unknown authority fields, invalid facts, and oversize content', () => {
  const hostile = JSON.parse(JSON.stringify(validRequest()));
  Object.defineProperty(hostile.confirmedContent, '__proto__', { value: { admin: true }, enumerable: true });
  assert.throws(() => api.parseConfirmSearchSourceRequest(hostile), /Hostile|plain object/);
  assert.throws(() => api.parseConfirmSearchSourceRequest({ ...validRequest(), uid }), /Unknown field/);
  const invalid = validRequest(); invalid.confirmedContent.experience = [{ company: 5, role: '', duration: '', achievements: [] }];
  assert.throws(() => api.parseConfirmSearchSourceRequest(invalid), /must be a string/);
  const empty = { name: '', title: '', email: '', phone: '', location: '', summary: '  ', experience: [], education: [], skills: [], certifications: [] };
  assert.throws(() => api.normalizeConfirmedSource(empty), /non-empty/);
  assert.throws(() => api.normalizeConfirmedSource({ ...empty, skills: [{category:'Skills',items:[]}], additionalSections:[{id:'projects',title:'Projects',items:[]}] }), /non-empty/);
  const privateKey = {...validRequest(), ['Synthetic private resume text']:true};
  assert.throws(() => api.parseConfirmSearchSourceRequest(privateKey), error => !error.message.includes('Synthetic private resume text'));
  assert.equal(api.hashSearchSourcePayload({...validRequest(),requestId:requestId.toUpperCase()}),api.hashSearchSourcePayload(validRequest()));
  for (const lone of [String.fromCharCode(0xd800), String.fromCharCode(0xdc00)]) {
    assert.throws(() => api.normalizeConfirmedSource({...source(),summary:lone}), /unsupported character/);
  }
  const large = source(); large.summary = 'x'.repeat(100001);
  assert.throws(() => api.normalizeConfirmedSource(large), /100000 character limit/);
  const huge = source(); huge.experience[0].achievements = Array(1000).fill('界'.repeat(10000));
  assert.throws(() => api.normalizeConfirmedSource(huge), /500000 byte limit/);
  const oversizedRequest = validRequest(); oversizedRequest.intake.rawText = 'x'.repeat(100001);
  assert.throws(() => api.parseConfirmSearchSourceRequest(oversizedRequest), /100000 character limit/);
  const unacknowledged = validRequest(); unacknowledged.intake.acknowledgedWarnings = false;
  assert.throws(() => api.parseConfirmSearchSourceRequest(unacknowledged), /warnings require acknowledgedWarnings=true/);
  const missingAcknowledgment = validRequest(); delete missingAcknowledgment.intake.acknowledgedWarnings;
  assert.throws(() => api.parseConfirmSearchSourceRequest(missingAcknowledgment), /warnings require acknowledgedWarnings=true/);
  assert.throws(() => api.createSearchSourceWorkspace({ sourceId, origin: 'generated', contentHash: 'a'.repeat(64), confirmedAt }), /Invalid source workspace/);
  assert.throws(() => api.createSearchSourceWorkspace({ sourceId: 'x'.repeat(181), origin: 'user_upload', contentHash: 'a'.repeat(64), confirmedAt }), /Invalid source workspace/);
});

test('request payload hashes are repeatable and change when confirmed content changes', () => {
  const first = api.hashSearchSourcePayload(validRequest());
  assert.equal(first, api.hashSearchSourcePayload(validRequest()));
  const changed = validRequest(); changed.confirmedContent.summary += '!';
  assert.notEqual(first, api.hashSearchSourcePayload(changed));
});

test('sealed source validation rehashes normalized content and matches the workspace hash algorithm', async () => {
  const record = sealedRecord();
  const result = api.validateSealedSearchSource(record, { uid, id: sourceId, collection: 'resume_versions' });
  assert.ok(result);
  assert.equal(result.contentHash, await api.stableWorkspaceContentHash(record.content));
  assert.deepEqual(result.content, record.content);
  assert.equal(api.isSearchSourceRecord(record), true);
  assert.equal(api.validateSealedSearchSource(record, { uid, id: sourceId, collection: 'applications' }), null);
});

test('sealed source rejects owner, id, receipt, content, algorithm, marker, and archive mismatches', () => {
  const base = sealedRecord();
  const cases = [
    [{ user_id: 'other' }, { uid, id: sourceId }],
    [{}, { uid, id: '11111111-1111-4111-8111-111111111111' }],
    [{ source_confirmation_receipt: { ...base.source_confirmation_receipt, ownerId: 'other' } }, { uid, id: sourceId }],
    [{ content: { ...base.content, summary: 'tampered' } }, { uid, id: sourceId }],
    [{ source_confirmation_receipt: { ...base.source_confirmation_receipt, hashEncoding: 'sha1' } }, { uid, id: sourceId }],
    [{ guardrail_report: { version: 1 } }, { uid, id: sourceId }],
    [{ metadata: { ...base.metadata, workspace: { ...base.metadata.workspace, origin: 'tailored' } } }, { uid, id: sourceId }],
    [{ archived: true }, { uid, id: sourceId }],
    [{ metadata: { ...base.metadata, archived: true } }, { uid, id: sourceId }],
    [{ is_active: false }, { uid, id: sourceId }],
    [{ source_confirmation_receipt: { ...base.source_confirmation_receipt, payloadHash: 'c'.repeat(64) } }, { uid, id: sourceId }],
    [{ intake: {rawText:'changed'} }, { uid, id: sourceId }],
    [{ source_confirmation_receipt: undefined, metadata: { ...base.metadata, source_confirmation_receipt: base.source_confirmation_receipt } }, { uid, id: sourceId }],
  ];
  for (const [patch, options] of cases) {
    assert.equal(api.validateSealedSearchSource({ ...base, ...patch }, options), null);
  }
});
