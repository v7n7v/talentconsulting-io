const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSync } = require('esbuild');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..');

function loadSourceChooser() {
  const result = buildSync({ stdin: { contents: "export * from './lib/job-search-resume-source'; export { classifyResumeVerification } from './lib/server-resume'; export { createWorkspaceMetadata } from './lib/resume-workspace';", resolveDir: repoRoot, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const module = { exports: {} };
  new Function('module', 'exports', result.outputFiles[0].text)(module, module.exports);
  return module.exports;
}

const { chooseJobSearchResumeSource, resolveExplicitJobSearchResumeSource, isEligibleJobSearchResume, classifyResumeVerification, createWorkspaceMetadata } = loadSourceChooser();

function resume(id, overrides = {}) {
  return {
    id,
    version_name: id,
    content: {},
    mode: 'technical',
    is_active: false,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    metadata: {},
    ...overrides,
  };
}

test('source chooser follows server source verification for legacy, confirmed, invalid, and guarded records', () => {
  const guarded = resume('guarded', {
    is_active: true,
    guardrail_report: { version: 1 },
  });
  const activeSource = resume('main', { version_name: 'Main resume', is_active: true });
  const confirmedUpload = resume('upload', {
    // saveResumeVersion normalizes this into the top-level provenance field.
    provenance: { verified: true, origin: 'user_upload' },
    metadata: { resumeProvenance: { verified: true, origin: 'user_upload' } },
  });
  const invalidProvenance = resume('invalid', {
    metadata: { resumeProvenance: { verified: true, origin: 'agent' } },
  });

  assert.equal(isEligibleJobSearchResume(guarded), false);
  assert.equal(isEligibleJobSearchResume(activeSource), true);
  assert.equal(isEligibleJobSearchResume(confirmedUpload), true);
  assert.equal(isEligibleJobSearchResume(invalidProvenance), false);
  assert.equal(chooseJobSearchResumeSource([guarded, activeSource], guarded.id).resume.id, 'main');
});

test('active packet-named legacy versions remain eligible without generated markers', () => {
  const legacyPacket = resume('legacy-packet', {
    version_name: 'Founding AI Product Engineer packet',
    is_active: true,
    metadata: { targetRole: 'Founding AI Product Engineer', proofScore: 88 },
  });
  assert.equal(isEligibleJobSearchResume(legacyPacket), true);
});

test('source chooser preserves an eligible saved version and recovers an invalid deep link', () => {
  const saved = resume('saved', { is_active: true });
  const other = resume('other', { is_active: true, created_at: '2026-09-02T00:00:00.000Z' });
  const preserved = chooseJobSearchResumeSource([other, saved], saved.id);
  assert.equal(preserved.resume?.id, saved.id);
  assert.equal(preserved.recoveredFromId, false);
  const recovered = chooseJobSearchResumeSource([other, saved], 'missing');
  assert.equal(recovered.resume?.id, other.id);
  assert.equal(recovered.recoveredFromId, true);
});

test('explicit source handoff resolves only its exact eligible ID and never falls back', () => {
  const requested = resume('source_requested', { is_active: true });
  const saved = resume('saved', { is_active: true });
  const generated = resume('source_generated', { is_active: true, guardrail_report: { version: 1 } });
  const choices = [requested, saved, generated];
  assert.equal(resolveExplicitJobSearchResumeSource(choices, requested.id), requested);
  assert.equal(resolveExplicitJobSearchResumeSource(choices, 'missing'), null);
  assert.equal(resolveExplicitJobSearchResumeSource(choices, generated.id), null);
  assert.equal(resolveExplicitJobSearchResumeSource(choices, ''), null);
});

const hash = 'a'.repeat(64);
function workspaceRecord(kind, overrides = {}) {
  const content = { name: 'Fictional candidate', skills: ['TypeScript'] };
  const source = { sourceVersionId: 'confirmed-source', content, contentHash: hash, confirmedAt: '2026-10-09T12:00:00.000Z' };
  return resume(kind, { is_active: true, provenance: { verified: true, origin: 'user_upload' }, metadata: {
    workspace: createWorkspaceMetadata({ kind, origin: 'user_upload', contentHash: hash, content, sourceSnapshot: source, sourceVersionId: source.sourceVersionId, sourceConfirmedAt: source.confirmedAt }),
  }, ...overrides });
}

test('saved resume documents are never offered as factual sources, even when active and explicitly marked', () => {
  const document = workspaceRecord('resume');
  assert.equal(classifyResumeVerification(document, 'resume_versions').verified, false);
  assert.equal(isEligibleJobSearchResume(document), false);
  assert.equal(chooseJobSearchResumeSource([document]).resume, null);
});

test('confirmed experience lineage remains eligible and wins over a newer document', () => {
  const document = workspaceRecord('resume');
  const source = workspaceRecord('experience', { id: 'confirmed-source', is_active: false });
  assert.equal(classifyResumeVerification(source, 'resume_versions').verified, true);
  assert.equal(isEligibleJobSearchResume(source), true);
  assert.equal(chooseJobSearchResumeSource([document, source]).resume.id, source.id);
  const recovered = chooseJobSearchResumeSource([document, source], document.id);
  assert.equal(recovered.resume.id, source.id);
  assert.equal(recovered.recoveredFromId, true);
});

test('malformed workspace envelopes cannot fall back to active or provenance flags', () => {
  for (const workspace of [{ schemaVersion: 1, kind: 'experience', origin: 'user_upload' },
    { ...workspaceRecord('experience').metadata.workspace, contentHash: 'invalid' },
    { ...workspaceRecord('experience').metadata.workspace, sourceVersionId: null }]) {
    const record = resume('malformed', { is_active: true, provenance: { verified: true, origin: 'user_upload' }, metadata: { workspace } });
    assert.equal(classifyResumeVerification(record, 'resume_versions').verified, false);
    assert.equal(isEligibleJobSearchResume(record), false);
  }
});

test('legacy eligibility follows actual server verification rather than metadata aliases or generated markers', () => {
  const cases = [
    resume('active', { is_active: true }), resume('inactive'),
    resume('explicit', { provenance: { verified: true, origin: 'user_authored' } }),
    resume('metadata-only', { metadata: { resumeProvenance: { verified: true, origin: 'user_upload' } } }),
    resume('optimized', { is_active: true, metadata: { savedFrom: 'resume_studio_optimize' } }),
    resume('guarded-skill-graph', { is_active: true, skill_graph: { guardrailReport: {} } }),
    resume('agent-mode', { is_active: true, mode: 'agent' }),
  ];
  for (const record of cases) assert.equal(isEligibleJobSearchResume(record), classifyResumeVerification(record, 'resume_versions').verified, record.id);
});
