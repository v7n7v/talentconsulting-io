const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');

// Bundle TypeScript exports so their aliases and transitive pure helpers resolve as in the app.
function loadModule(entryPoint) {
  const bundle = buildSync({ entryPoints: [path.join(__dirname, '..', entryPoint)], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const module = { exports: {} };
  new Function('module', 'exports', bundle.outputFiles[0].text)(module, module.exports);
  return module.exports;
}
const workflow = loadModule('lib/resume-workflow.ts');
const ledger = loadModule('lib/resume-review-ledger.ts');
const { ResumeMorphSchema } = loadModule('lib/schemas.ts');

const makeResume = (overrides = {}) => ({
  name: 'Rae Example', title: 'Designer', email: 'rae@example.com', phone: '555-0100', location: 'Boston',
  summary: 'Source summary', experience: [{ company: 'Studio', role: 'Designer', duration: '2020-2024', achievements: ['Built a design system'] }],
  education: [{ degree: 'BA', institution: 'College', year: '2019' }], skills: [{ category: 'Tools', items: ['Figma'] }], certifications: [],
  ...overrides,
});
const inputs = (overrides = {}) => ({
  source: makeResume(), jobDescription: 'Design role', role: 'Designer', company: 'Acme', postingUrl: 'https://jobs.test/1',
  percentage: 50, targetPageCount: 1, unlocked100: false,
  ...overrides,
});
const generation = (id, input = inputs(), overrides = {}) => ({
  schemaVersion: 2, id, createdAt: `2026-10-07T00:00:0${id.slice(-1)}Z`, inputs: input, effectivePercentage: input.percentage,
  candidate: makeResume({ summary: 'Candidate summary' }), review: { version: 1, decisions: {}, selectedId: null, view: 'comparison', documentTab: 'tailored' },
  score: null, proof: null, guardrailReport: null,
  presentation: { templateId: 'classic', paletteId: 'ocean', pageSize: 'LETTER', pdfExportMode: 'application' },
  ...overrides,
});

test('source, target, percentage, unlock, and AI length changes mark retained output outdated', () => {
  const applied = generation('g1');
  const edits = [
    { source: makeResume({ summary: 'Edited facts' }) },
    { jobDescription: 'Different target' },
    { percentage: 60 },
    { unlocked100: true },
    { targetPageCount: 2 },
  ];
  for (const edit of edits) {
    const next = inputs(edit);
    assert.equal(workflow.generationNeedsRegeneration(applied, next), true);
    assert.equal(applied.candidate.summary, 'Candidate summary', 'prior result remains available');
  }
});

test('presentation choices and navigation/view state do not change generation identity', () => {
  const applied = generation('g1');
  assert.equal(workflow.generationNeedsRegeneration(applied, inputs({ presentation: { templateId: 'modern' }, view: 'ship' })), false);
  assert.equal(workflow.resumeGenerationKey(inputs()), workflow.resumeGenerationKey(inputs({ role: ' Designer ', jobDescription: 'Design role  ' })), 'trimmed equivalent text has the same request identity');
});

test('history deduplicates by id, puts latest first, caps at ten, and retains snapshots', () => {
  const history = Array.from({ length: 10 }, (_, index) => generation(`g${index}`));
  const replacement = generation('g4', inputs({ percentage: 72 }), { candidate: makeResume({ summary: 'New immutable snapshot' }) });
  const next = workflow.retainPreviousGeneration(history, replacement);
  assert.equal(next.length, 10);
  assert.equal(next[0], replacement);
  assert.equal(next.filter(item => item.id === 'g4').length, 1);
  assert.equal(next.some(item => item.id === 'g9'), true, 'a replacement snapshot does not evict a unique history entry');
  assert.equal(next.find(item => item.id === 'g4').inputs.percentage, 72);
  assert.equal(history.find(item => item.id === 'g4').inputs.percentage, 50);
  assert.equal(history.find(item => item.id === 'g4').candidate.summary, 'Candidate summary');
  const newItem = workflow.retainPreviousGeneration(history, generation('g10'));
  assert.equal(newItem.length, 10);
  assert.equal(newItem[0].id, 'g10');
  assert.equal(newItem.some(item => item.id === 'g9'), false, 'new unique snapshots evict the last item at the cap');
  assert.equal(workflow.retainPreviousGeneration(history, null), history);
});

test('restored generation keeps matching source, applied settings, review and layout metadata', () => {
  const snapshot = generation('g2', inputs({ percentage: 75, unlocked100: true, targetPageCount: 2, source: makeResume({ summary: 'Exact source' }) }), {
    review: { version: 1, decisions: { change1: 'accepted' }, selectedId: 'change1', view: 'focused', documentTab: 'source' },
    presentation: { templateId: 'editorial', paletteId: 'forest', pageSize: 'LETTER', pdfExportMode: 'application' },
  });
  const restored = workflow.restoreResumeGeneration(snapshot);
  assert.equal(restored.inputs.source.summary, 'Exact source');
  assert.equal(restored.inputs.percentage, 75);
  assert.equal(restored.inputs.unlocked100, true);
  assert.equal(restored.inputs.targetPageCount, 2);
  assert.deepEqual(restored.review.decisions, { change1: 'accepted' });
  assert.equal(restored.review.view, 'focused');
  assert.deepEqual(restored.presentation, { templateId: 'editorial', paletteId: 'forest', design: null, pageSize: 'LETTER', pdfExportMode: 'application' });
  const legacy = generation('legacy');
  delete legacy.presentation.pdfExportMode;
  assert.equal(workflow.restoreResumeGeneration(legacy).presentation.pdfExportMode, 'designed');
});

test('resume morph schema accepts optional target context and remains compatible with older requests', () => {
  const legacy = ResumeMorphSchema.safeParse({ resume: makeResume(), jobDescription: 'Design role' });
  assert.equal(legacy.success, true);
  const contextual = ResumeMorphSchema.safeParse({ resume: makeResume(), jobDescription: 'Design role', targetRole: 'Senior Product Designer', targetCompany: 'Northstar' });
  assert.equal(contextual.success, true);
  assert.equal(contextual.data.targetRole, 'Senior Product Designer');
  assert.equal(contextual.data.targetCompany, 'Northstar');
  assert.equal(ResumeMorphSchema.safeParse({ resume: makeResume(), jobDescription: 'Design role', targetRole: 'R'.repeat(301) }).success, false);
});

test('generation restoration keeps its own source provenance independent from later sources', () => {
  const snapshot = generation('source-a');
  snapshot.sourceContext = { workspaceSource: { sourceVersionId: 'source-a', rawText: 'Original source A', content: makeResume() }, rawText: 'Original source A', metadata: { fileName: 'a.pdf', sourceType: 'direct', characterCount: 123 } };
  const restored = workflow.restoreResumeGeneration(snapshot);
  snapshot.sourceContext.workspaceSource.sourceVersionId = 'source-b';
  snapshot.sourceContext.metadata.fileName = 'b.pdf';
  assert.equal(restored.sourceContext.workspaceSource.sourceVersionId, 'source-a');
  assert.equal(restored.sourceContext.rawText, 'Original source A');
  assert.equal(restored.sourceContext.metadata.fileName, 'a.pdf');
  assert.equal(workflow.restoreResumeGeneration(generation('older')).sourceContext, undefined, 'unknown original-file provenance is never inferred from the current source');
});

test('malformed or unsupported snapshots are refused', () => {
  assert.equal(workflow.restoreResumeGeneration(null), null);
  assert.equal(workflow.restoreResumeGeneration({ schemaVersion: 1 }), null);
  const invalid = generation('g3');
  invalid.inputs.percentage = NaN;
  assert.equal(workflow.restoreResumeGeneration(invalid), null);
  for (const percentage of [0, 101]) {
    const outOfRange = generation('g4');
    outOfRange.inputs.percentage = percentage;
    assert.equal(workflow.restoreResumeGeneration(outOfRange), null, `percentage ${percentage} is not a restorable AI setting`);
  }
  const malformedRole = generation('g5');
  malformedRole.inputs.role = { title: 'Designer' };
  assert.equal(workflow.restoreResumeGeneration(malformedRole), null);
});

test('section status follows source, generation, review and save data rather than visits', () => {
  const base = { hasSource: true, sourcePending: false, sourceError: false, sourceWarnings: false, hasJob: true, generating: false, hasCandidate: true, outdated: false, needsReview: false, hasTemplateAccess: true, saved: true };
  const ready = workflow.resumeSectionStatuses(base);
  assert.deepEqual(ready, { source: 'ready', target: 'ready', shape: 'ready', design: 'ready', ship: 'ready' });
  assert.equal(workflow.resumeSectionStatuses({ ...base, outdated: true }).shape, 'outdated');
  assert.equal(workflow.resumeSectionStatuses({ ...base, needsReview: true }).ship, 'attention');
  assert.equal(workflow.resumeSectionStatuses({ ...base, hasCandidate: false, saved: false }).ship, 'not-started');
});

test('reverted review decisions restore facts from the generation source snapshot', () => {
  const originalSource = makeResume({ summary: 'Original confirmed source' });
  const candidate = makeResume({ summary: 'Proposed rewrite' });
  const changes = ledger.deriveResumeReviewLedger(originalSource, candidate).changes;
  const summaryChange = changes.find(change => change.path === 'summary');
  assert.ok(summaryChange);
  const editedCurrentSource = makeResume({ summary: 'Newly edited source' });
  const reviewed = ledger.applyResumeReviewDecisions(originalSource, candidate, changes, { [summaryChange.id]: 'reverted' });
  assert.equal(reviewed.summary, originalSource.summary);
  assert.notEqual(reviewed.summary, editedCurrentSource.summary);
});
