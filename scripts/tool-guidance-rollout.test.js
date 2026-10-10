const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('@babel/parser');
const { build, transformSync } = require('esbuild');

// Execute the actual authored page observation expressions. This checks wiring
// to workflow state, rather than only passing hand-authored inputs to a helper.
// It does not render the page or establish browser geometry/accessibility.
let helpers;
test.before(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-story-wiring-'));
  const outfile = path.join(directory, 'helpers.cjs');
  await build({ entryPoints: ['lib/tool-story-adapters.ts'], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  helpers = require(outfile);
  fs.rmSync(directory, { recursive: true, force: true });
});
const parsed = new Map();
function source(file) {
  if (!parsed.has(file)) {
    const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    parsed.set(file, { text, ast: parse(text, { sourceType: 'module', plugins: ['typescript', 'jsx'] }) });
  }
  return parsed.get(file);
}
function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) {
    if (!value || typeof value !== 'object') continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
  }
  return null;
}
function evaluate(file, node, state) {
  const { text } = source(file);
  assert.ok(node, `Missing actual observation in ${file}`);
  const code = transformSync(`(${text.slice(node.start, node.end)})`, { loader: 'tsx', format: 'cjs' }).code;
  return vm.runInNewContext(code, { ...helpers, ...state }, { timeout: 1000 });
}
function observation(file, state, variable) {
  const { ast } = source(file);
  const node = findNode(ast, item => item.type === 'VariableDeclarator' && item.id?.name === variable);
  return evaluate(file, node?.init, state);
}
function story(file, state) {
  const { ast } = source(file);
  const node = findNode(ast, item => item.type === 'CallExpression' && item.callee?.name === 'buildToolStory');
  return evaluate(file, node, state);
}
const chapter = (config, id) => config.chapters.find(item => item.id === id);

test('actual JD binding recognises a reopened saved draft and the return to inputs', () => {
  const file = 'app/suite/jd-generator/page.tsx';
  const state = { step: 'result', editableJD: 'Actual saved description', templateId: 'saved-1', isLoading: false, storyFailure: false };
  const saved = story(file, { ...state, documentObservation: observation(file, state, 'documentObservation') });
  assert.equal(saved.preferredChapterId, 'result');
  assert.equal(chapter(saved, 'result').availability, 'available');
  const freshState = { ...state, step: 'input' };
  const fresh = story(file, { ...freshState, documentObservation: observation(file, freshState, 'documentObservation') });
  assert.equal(fresh.preferredChapterId, 'work');
  assert.equal(chapter(fresh, 'result').availability, 'waiting');
  assert.notEqual(saved.contextKey, fresh.contextKey);
});

test('actual Ask Taco binding follows the latest operation, retaining history without stale recovery', () => {
  const file = 'app/suite/agent/page.tsx';
  const state = { conversationId: 'conversation-1', activeResumeId: 'source-1', loading: false, loadingHistory: false, historyFailed: false, gated: false,
    messages: [{ role: 'user' }, { role: 'assistant', recovery: { code: 'failure-A' } }, { role: 'user' }, { role: 'assistant' }] };
  const current = values => story(file, { ...values, conversationObservation: observation(file, values, 'conversationObservation') });
  assert.equal(current(state).preferredChapterId, 'result');
  assert.equal(chapter(current(state), 'recovery'), undefined);
  const next = { ...state, loading: true, messages: [...state.messages, { role: 'user' }] };
  assert.equal(chapter(current(next), 'result').availability, 'waiting');
  const failure = { ...next, loading: false, messages: [...next.messages, { role: 'assistant', recovery: { code: 'failure-B' } }] };
  assert.equal(current(failure).preferredChapterId, 'recovery');
  assert.equal(chapter(current(failure), 'result').availability, 'blocked');
  const greeting = { ...state, messages: [{ role: 'assistant' }] };
  assert.equal(chapter(current(greeting), 'result').availability, 'waiting');
});

test('actual Interview binding separates configuration, active practice, and retained debrief', () => {
  const file = 'app/suite/interview-sim/page.tsx';
  const base = { mode: 'quick_drill', phase: 'setup', activeSessionId: null, applicationId: null, resumeVersionId: null,
    busy: false, loadingContext: false, grade: null, typedTranscript: [], error: null, contextErrors: [] };
  assert.equal(chapter(story(file, base), 'result').availability, 'waiting');
  const room = story(file, { ...base, phase: 'room', activeSessionId: 'session-1' });
  assert.equal(room.chapters[0].steps[0].anchor, 'interview-room');
  assert.equal(chapter(room, 'result').availability, 'waiting');
  const retained = story(file, { ...base, phase: 'debrief', activeSessionId: 'session-1', error: 'Grade not saved' });
  assert.equal(chapter(retained, 'result').availability, 'available');
  assert.ok(chapter(retained, 'recovery'));
  assert.match(chapter(retained, 'result').steps[0].description, /does not prove a grade was saved/);
});

test('actual Applications binding keeps manual capture independent and offer work record-bound', () => {
  const file = 'app/suite/applications/page.tsx';
  const base = { selectedApp: null, viewMode: 'command', isLoading: false, followUpLoading: false, outcomeLoading: false, loadError: null, drawerActionError: null };
  const tracker = story(file, base);
  assert.equal(tracker.modalSurface, undefined);
  assert.equal(chapter(tracker, 'result').availability, 'waiting');
  assert.equal(tracker.chapters[0].steps[0].anchor, 'applications-capture');
  const offer = story(file, { ...base, selectedApp: { id: 'application-A', status: 'offer' } });
  assert.equal(offer.modalSurface, 'application-detail');
  assert.equal(chapter(offer, 'result').steps[0].anchor, 'application-offer');
  const other = story(file, { ...base, selectedApp: { id: 'application-B', status: 'applied' } });
  assert.notEqual(offer.contextKey, other.contextKey);
  assert.equal(chapter(other, 'result').steps.some(step => step.anchor === 'application-offer'), false);
});

test('actual Network add-contact story stays inside its form and does not claim an existing contact', () => {
  const file = 'app/suite/network/page.tsx';
  const state = { selectedContactId: 'contact-1', selectedContact: { id: 'contact-1' }, showAddPanel: false, viewMode: 'list', loading: false, saving: false, error: null, storyFailure: false };
  const contact = story(file, state);
  assert.equal(contact.modalSurface, 'network-contact');
  assert.equal(contact.preferredChapterId, 'result');
  const add = story(file, { ...state, showAddPanel: true });
  assert.equal(add.modalSurface, 'network-add-contact');
  assert.equal(add.preferredChapterId, 'work');
  assert.equal(add.chapters[0].steps[0].anchor, 'network-add-form');
  assert.equal(chapter(add, 'result').availability, 'waiting');
});

test('actual Gallery binding keeps each utility and its pending/locked result context separate', () => {
  const file = 'app/suite/gallery/page.tsx';
  const base = { selectedTool: null, isLoading: false, result: null, storyFailure: false, runLocked: false, guestLocked: false };
  assert.equal(story(file, base).chapters[0].steps[0].anchor, 'gallery-tools');
  const utilities = ['grammar-checker', 'word-counter', 'citation-machine', 'summarizer', 'tone-analyzer', 'paraphraser', 'email-composer', 'thesis-generator'];
  for (const id of utilities) {
    const state = { ...base, selectedTool: { id, label: id, description: 'Utility task', placeholder: 'Bring text' } };
    const config = story(file, state);
    assert.equal(config.contextKey, id);
    assert.equal(chapter(config, 'result').availability, 'waiting');
    assert.equal(chapter(story(file, { ...state, result: 'retained', isLoading: true }), 'result').availability, 'waiting');
    assert.equal(chapter(story(file, { ...state, runLocked: true, guestLocked: true }), 'result').availability, 'blocked');
  }
});

test('actual Cover letter and ATS score bindings preserve stale source and pending observations', () => {
  const kitContext = { scopeId: 'application-A', resumeVersionId: 'source-A', coverLetterResult: { status: 'stale' }, atsResult: { status: 'stale' } };
  const letter = story('app/suite/cover-letter/page.tsx', { kitContext, loading: false, saving: false, result: 'retained draft', hasResumeContext: true });
  assert.equal(chapter(letter, 'result').availability, 'stale');
  const check = story('components/ATSScorePanel.tsx', { kitContext, isLoading: false, result: { score: 50 } });
  assert.equal(chapter(check, 'result').availability, 'stale');
  const pending = story('components/ATSScorePanel.tsx', { kitContext, isLoading: true, result: { score: 50 } });
  assert.equal(chapter(pending, 'result').availability, 'waiting');
  assert.match(chapter(check, 'result').steps[0].description, /not a hiring probability/);
});

test('actual feedback receipt follows confirmed submission and a pending send remains waiting', () => {
  const file = 'app/suite/feedback/page.tsx';
  const base = { issueCode: null, receiptCaseId: null, submitting: false, diagnosticPolicyLoading: false, submitted: false, storyFailure: false, user: { uid: 'owner' } };
  assert.equal(chapter(story(file, base), 'result').availability, 'waiting');
  assert.equal(chapter(story(file, { ...base, submitting: true }), 'result').availability, 'waiting');
  const saved = story(file, { ...base, submitted: true, receiptCaseId: 'case-1' });
  assert.equal(saved.preferredChapterId, 'result');
  assert.equal(chapter(saved, 'result').steps[0].anchor, 'feedback-receipt');
});
