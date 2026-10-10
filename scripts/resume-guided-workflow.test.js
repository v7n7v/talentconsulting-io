const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { buildSync } = require('esbuild');
const path = require('node:path');
const bundle = buildSync({ entryPoints: [path.join(__dirname, '../components/resume-studio/ResumeStudioHeader.tsx')], bundle: true, platform: 'node', format: 'cjs', write: false, external: ['react', 'react/jsx-runtime'], jsx: 'automatic', logLevel: 'silent' });
const mod = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(mod, mod.exports, require);
const { ResumeStudioHeader } = mod.exports;
const progressBundle = buildSync({ entryPoints: [path.join(__dirname, '../components/resume-studio/ResumeStudioProgress.tsx')], bundle: true, platform: 'node', format: 'cjs', write: false, external: ['react', 'react/jsx-runtime'], jsx: 'automatic', logLevel: 'silent' });
const progressModule = { exports: {} };
new Function('module', 'exports', 'require', progressBundle.outputFiles[0].text)(progressModule, progressModule.exports, require);
const { ResumeStudioProgress } = progressModule.exports;
for (const [stage, label] of [['source','Upload &amp; Diagnose'], ['target','Job Description'], ['shape','AI Morph'], ['review','AI Morph'], ['design','Template'], ['ship','Export &amp; Save']]) {
  test(`${stage} renders five sections with the correct current section`, () => {
    const html = renderToStaticMarkup(React.createElement(ResumeStudioHeader, { current: stage, stageDescription: 'Your work is retained.' }));
    assert.equal((html.match(/<li\b/g) || []).length, 5);
    assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
    const items = [...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].map(match => match[0]);
    assert.match(items.find(item => item.includes(label)), /aria-current="step"/);
    for (const itemLabel of ['Upload &amp; Diagnose', 'Job Description', 'AI Morph', 'Template', 'Export &amp; Save']) assert.ok(html.includes(itemLabel));
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /Not started/);
    assert.doesNotMatch(html, /Completed|is-complete/);
  });
}

test('explicit statuses are announced for each canonical section', () => {
  const statuses = { source: 'ready', target: 'attention', shape: 'outdated', design: 'in-progress', ship: 'not-started' };
  const html = renderToStaticMarkup(React.createElement(ResumeStudioProgress, { current: 'review', statuses }));
  for (const status of ['Ready', 'Needs attention', 'Needs regeneration', 'In progress', 'Not started']) assert.ok(html.includes(status));
  assert.match(html, /AI Morph: Needs regeneration, current section/);
});

test('all five section buttons navigate to canonical stages, including review mapped to AI Morph', () => {
  const visited = [];
  const tree = ResumeStudioProgress({ current: 'review', onNavigate: stage => visited.push(stage) });
  const listItems = tree.props.children.props.children;
  const buttons = listItems.map(item => item.props.children);
  assert.equal(buttons.length, 5);
  buttons.forEach(button => button.props.onClick());
  assert.deepEqual(visited, ['source', 'target', 'shape', 'design', 'ship']);
  assert.equal(buttons[2].props['aria-current'], 'step');
});

const handoffBundle = buildSync({ entryPoints: [path.join(__dirname, '../lib/resume-auth-handoff.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
const handoffModule = { exports: {} };
new Function('module', 'exports', handoffBundle.outputFiles[0].text)(handoffModule, handoffModule.exports);
const { handoffGuestResumeDraft, previousResumeDraftKey, restorePreviousResumeDraft } = handoffModule.exports;
function storageFixture(entries = []) {
  const data = new Map(entries);
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
test('successful guest sign-in keeps exact source, target, review and presentation for that owner', () => {
  const store = storageFixture([['talent-resume-draft:alice', JSON.stringify({ name: 'Earlier account draft' })], ['talent-resume-draft:bob', 'Bob only']]);
  const draft = { originalResume: { name: 'Fictional source' }, morphedResume: { name: 'Fictional candidate' }, jobDescription: 'Fictional target', selectedTemplateId: 'technical-signal', resumeReview: { decisions: { a: 'accepted' } }, mode: 'morph', step: 'preview' };
  handoffGuestResumeDraft(store, 'alice', draft);
  assert.deepEqual(JSON.parse(store.getItem('talent-resume-draft:alice')), draft);
  assert.deepEqual(JSON.parse(store.getItem(previousResumeDraftKey('alice'))), { name: 'Earlier account draft' });
  assert.equal(store.getItem('talent-resume-draft:bob'), 'Bob only');
  assert.equal(restorePreviousResumeDraft(store, 'bob'), false);
  assert.equal(restorePreviousResumeDraft(store, 'alice'), true);
  assert.deepEqual(JSON.parse(store.getItem('talent-resume-draft:alice')), { name: 'Earlier account draft' });
  assert.deepEqual(JSON.parse(store.getItem(previousResumeDraftKey('alice'))), draft);
});
test('storage failure and corrupt recovery do not replace a usable account draft', () => {
  const store = storageFixture([['talent-resume-draft:alice', '{"name":"Retained"}']]);
  const originalSet = store.setItem;
  store.setItem = (key, value) => { if (key === 'talent-resume-draft:alice') throw new Error('Storage full'); originalSet(key, value); };
  assert.throws(() => handoffGuestResumeDraft(store, 'alice', { name: 'Incoming' }), /Storage full/);
  assert.equal(store.getItem('talent-resume-draft:alice'), '{"name":"Retained"}');
  store.setItem = originalSet;
  store.setItem(previousResumeDraftKey('alice'), '{broken');
  assert.throws(() => restorePreviousResumeDraft(store, 'alice'));
  assert.equal(store.getItem('talent-resume-draft:alice'), '{"name":"Retained"}');
  assert.throws(() => handoffGuestResumeDraft(store, '', {}), /Sign in/);
});
