const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const ts = require('typescript');

const api = (async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-story-adapters-'));
  const outfile = path.join(directory, 'adapters.cjs');
  await build({ entryPoints: ['lib/tool-story-adapters.ts'], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  return require(outfile);
})();

function observation(overrides = {}) {
  return { toolId: 'test-tool', title: 'Real work', contextKey: 'record-A', purpose: 'Inspect actual work.',
    work: [{ id: 'input', title: 'Input', description: 'Edit your source.', anchor: 'real-input' }],
    result: [{ id: 'review', title: 'Review', description: 'Inspect the actual result.', anchor: 'real-result' }],
    recovery: [{ id: 'retry', title: 'Retry', description: 'Choose a retry yourself.', anchor: 'real-retry' }], ...overrides };
}

test('empty, pending and failed observations never invent a successful result', async () => {
  const { buildToolStory } = await api;
  for (const [state, expected] of [[{}, 'waiting'], [{ pending: true }, 'waiting'], [{ failed: true }, 'blocked']]) {
    const config = buildToolStory(observation(state));
    assert.equal(config.chapters.find(chapter => chapter.id === 'result').availability, expected);
    assert.ok(config.chapters.every(chapter => chapter.availability !== 'complete'));
    assert.equal('onNext' in config, false);
    assert.equal('completed' in config, false);
  }
});

test('a retained result remains pending during another operation without mutating source or outcome', async () => {
  const { buildToolStory } = await api;
  const state = observation({ hasResult: true, pending: true });
  const snapshot = JSON.stringify(state);
  const config = buildToolStory(state);
  assert.equal(config.preferredChapterId, 'work');
  assert.equal(config.chapters[1].availability, 'waiting');
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(buildToolStory({ ...state, pending: false }).chapters[1].availability, 'available');
});

test('stale source remains stale even when the old output is hidden by the tool', async () => {
  const { buildToolStory } = await api;
  for (const hasResult of [false, true]) {
    const config = buildToolStory(observation({ stale: true, hasResult }));
    assert.equal(config.chapters[1].availability, 'stale');
    assert.match(config.chapters[1].unavailableReason, /current source/);
  }
});

test('account or plan prerequisites stay blocked and contain no checkout/action callbacks', async () => {
  const { buildToolStory } = await api;
  const config = buildToolStory(observation({ blockedReason: 'Sign in to use this utility.' }));
  assert.equal(config.chapters[1].availability, 'blocked');
  assert.equal(config.chapters[1].unavailableReason, 'Sign in to use this utility.');
  assert.ok(config.chapters.flatMap(chapter => chapter.steps).every(step => Object.values(step).every(value => typeof value !== 'function')));
});

test('workflow modal identity is explicit and switching records retains a new scope', async () => {
  const { buildToolStory } = await api;
  const first = buildToolStory(observation({ modalSurface: 'application-detail', hasResult: true }));
  const second = buildToolStory(observation({ modalSurface: 'application-detail', hasResult: true, contextKey: 'record-B' }));
  assert.equal(first.modalSurface, 'application-detail');
  assert.notEqual(first.contextKey, second.contextKey);
});

test('chat failure A followed by success B uses B and releases historical recovery', async () => {
  const { observeLatestConversation } = await api;
  const messages = [{ role: 'assistant', recovery: { title: 'Failure A' } }, { role: 'user' }, { role: 'assistant' }];
  assert.deepEqual(observeLatestConversation(messages), { index: 2, failed: false, hasResult: true });
  assert.deepEqual(observeLatestConversation(messages.slice(0, 2)), { index: 1, failed: false, hasResult: false });
});

test('chat failure A followed by failure B anchors only the latest operation B', async () => {
  const { observeLatestConversation } = await api;
  const messages = [{ role: 'assistant', recovery: { title: 'Failure A' } }, { role: 'user' }, { role: 'assistant', recovery: { title: 'Failure B' } }];
  assert.deepEqual(observeLatestConversation(messages), { index: 2, failed: true, hasResult: false });
  assert.equal(messages[0].recovery.title, 'Failure A');
});

test('a greeting or history-load notice alone is not a performed conversation result', async () => {
  const { observeLatestConversation } = await api;
  assert.deepEqual(observeLatestConversation([{ role: 'assistant' }]), { index: 0, failed: false, hasResult: false });
  assert.deepEqual(observeLatestConversation([]), { index: -1, failed: false, hasResult: false });
});

test('a saved editable draft is reviewable without a generated response object', async () => {
  const { observeEditableDocument } = await api;
  assert.equal(observeEditableDocument('result', 'Actual saved draft', 'template-A').hasResult, true);
  assert.equal(observeEditableDocument('result', 'Actual saved draft', 'template-A').preferredChapterId, 'result');
  assert.equal(observeEditableDocument('input', 'Retained earlier output', 'template-A').hasResult, false);
  assert.equal(observeEditableDocument('input', 'Retained earlier output', 'template-A').preferredChapterId, 'work');
  assert.equal(observeEditableDocument('result', 'Edited words', 'template-A').contextKey, observeEditableDocument('result', 'Actual saved draft', 'template-A').contextKey);
});

test('native workflow Tab handling wraps DOM descendants including a portaled last control', async () => {
  const { trapWorkflowTab } = await api;
  let focused = null, prevented = false;
  const first = { getClientRects: () => [1], focus: () => { focused = 'first'; } };
  const portaledLast = { getClientRects: () => [1], focus: () => { focused = 'guide-last'; } };
  const document = { activeElement: portaledLast, querySelector: () => null };
  const surface = { ownerDocument: document, querySelectorAll: () => [first, portaledLast] };
  const event = { key: 'Tab', defaultPrevented: false, shiftKey: false, preventDefault: () => { prevented = true; } };
  trapWorkflowTab(event, surface);
  assert.equal(prevented, true);
  assert.equal(focused, 'first');
  document.activeElement = first; focused = null; prevented = false;
  trapWorkflowTab({ ...event, shiftKey: true }, surface);
  assert.equal(focused, 'guide-last');
  document.querySelector = () => ({ open: true }); focused = null; prevented = false;
  trapWorkflowTab(event, surface);
  assert.equal(prevented, false);
  assert.equal(focused, null);
});

test('Applications installs the native handler on the open workflow drawer and cleans it up', () => {
  const source = fs.readFileSync('app/suite/applications/page.tsx', 'utf8');
  assert.match(source, /if \(!app \|\| !surface\) return/);
  assert.match(source, /surface\.addEventListener\('keydown', keydown\)/);
  assert.match(source, /surface\.removeEventListener\('keydown', keydown\)/);
  assert.match(source, /ref=\{workflowDrawerRef\}/);
  assert.match(source, /data-guide-surface="application-detail"/);
});

// Execute the actual page callbacks with their UI setters replaced by observable state.
// This catches missing reset calls, which adapter-only state tests cannot exercise.
function actualCallback(file, name) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      const initializer = node.initializer;
      callback = ts.isCallExpression(initializer) ? initializer.arguments[0] : initializer;
    } else if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      callback = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(callback, `Actual callback ${name} exists in ${file}`);
  return callback.getText(source).replace(/^export\s+/, '');
}

function actualJsxCallback(file, element, attribute, marker) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = node => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === element) {
      for (const prop of node.attributes.properties) {
        if (!ts.isJsxAttribute(prop) || prop.name.getText(source) !== attribute) continue;
        const expression = prop.initializer?.expression;
        if (expression?.getText(source).includes(marker)) callback = expression;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(callback, `Actual ${element}.${attribute} callback exists in ${file}`);
  return callback.getText(source);
}

function pageState(initial = {}) {
  const values = { ...initial }, calls = [];
  return {
    values, calls,
    bind(callback, dependencies = {}) {
      const setters = {};
      for (const setter of new Set(callback.match(/\bset[A-Z]\w*/g) || [])) {
        const key = setter[3].toLowerCase() + setter.slice(4);
        setters[setter] = value => {
          values[key] = typeof value === 'function' ? value(values[key]) : value;
          calls.push([key, values[key]]);
        };
      }
      const bindings = { ...setters, ...dependencies };
      const compiled = ts.transpileModule(`const actual = (${callback});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
      return Function(...Object.keys(bindings), `${compiled}\nreturn actual;`)(...Object.values(bindings));
    },
  };
}

function writingState() {
  const file = 'app/suite/writing-tools/page.tsx';
  const state = pageState({ storyFailure: true });
  const revisionRef = { current: 0 }, ownerRef = { current: 'owner-A' };
  const resetAnalysis = state.bind(actualCallback(file, 'resetAnalysis'), { rewriteRequestRef: { current: 'old request' } });
  return { ...state, file, revisionRef, ownerRef, resetAnalysis };
}

test('writing resetAnalysis clears the previous attempt failure', () => {
  const state = writingState();
  state.resetAnalysis();
  assert.equal(state.values.storyFailure, false);
  assert.equal(state.values.step, 'scan');
  assert.equal(state.values.humanizeResult, null);
});

test('opening actual saved writing session B clears failure A and preserves B text', async () => {
  const state = writingState();
  const saved = { id: 'session-B', input_text: 'Real saved words from B', final_text: 'Reviewed B output', step: 'humanize' };
  const open = state.bind(actualCallback(state.file, 'openLibrarySession'), {
    revisionRef: state.revisionRef, ownerRef: state.ownerRef, resetAnalysis: state.resetAnalysis,
    current: (revision, owner) => revision === state.revisionRef.current && owner === state.ownerRef.current,
    authFetch: async () => ({ ok: true, json: async () => ({ sessions: saved }) }),
    buildWritingReview: (input, output) => [{ input, output }], detectAI: text => ({ text }),
    showToast: () => assert.fail('Opening the real saved session should succeed'),
  });
  await open('session-B');
  assert.equal(state.values.storyFailure, false);
  assert.equal(state.values.sessionId, 'session-B');
  assert.equal(state.values.inputText, saved.input_text);
  assert.equal(state.values.humanizeResult.rewritten, saved.final_text);
});

test('writing clearAll clears failure A when starting a new actual draft', () => {
  const state = writingState();
  const clear = state.bind(actualCallback(state.file, 'clearAll'), {
    revisionRef: state.revisionRef, resetAnalysis: state.resetAnalysis, crypto: { randomUUID: () => 'new-draft' },
  });
  clear();
  assert.equal(state.values.storyFailure, false);
  assert.equal(state.values.sessionId, null);
  assert.equal(state.values.inputText, '');
  assert.equal(state.values.draftIdentity, 'new-draft');
});

test('closing a failed gallery utility returns to selection while retaining its actual draft', () => {
  const state = pageState({ storyFailure: true, drafts: { B: { input: 'B text', result: null } } });
  const close = state.bind(actualCallback('app/suite/gallery/page.tsx', 'closeTool'), {
    requestRevision: { current: 0 }, selectedTool: { id: 'A' }, input: 'Retained A text', result: null,
  });
  close();
  assert.equal(state.values.storyFailure, false);
  assert.equal(state.values.selectedTool, null);
  assert.deepEqual(state.values.drafts, { A: { input: 'Retained A text', result: null }, B: { input: 'B text', result: null } });
});

test('opening actual saved JD B clears failure A and shows B as the visible result', () => {
  const state = pageState({ storyFailure: true });
  const t = { id: 'saved-B', title: 'B role', content: 'Actual saved B description', talent_density_score: 0 };
  const open = state.bind(actualJsxCallback('app/suite/jd-generator/page.tsx', 'button', 'onClick', 'setTemplateId(t.id)'), {
    revision: { current: 0 }, t,
  });
  open();
  assert.equal(state.values.storyFailure, false);
  assert.equal(state.values.templateId, t.id);
  assert.equal(state.values.editableJD, t.content);
  assert.equal(state.values.talentDensityScore, 0);
  assert.equal(state.values.generatedJD, null);
  assert.equal(state.values.step, 'result');
});

function pendingContactCreate() {
  const file = 'app/suite/network/page.tsx';
  const state = pageState({ storyFailure: false, showAddPanel: true });
  const addStoryOperation = { current: 0 }, lifecycle = { current: { owner: 'owner-A', selection: null } }, toasts = [];
  let rejectRequest;
  const request = new Promise((resolve, reject) => { rejectRequest = reject; });
  const create = state.bind(actualCallback(file, 'createContact'), {
    lifecycle, addStoryOperation, addForm: { name: 'A contact', linkedin: '', applicationId: '', followUpDate: '' }, token: 'local-test-token',
    fetch: () => request, normalizeLinkedIn: value => value, EMPTY_FORM: {}, loadData: async () => {},
    networkRequestIsCurrent: (started, current) => started.owner === current.owner && started.selection === current.selection,
    showToast: (...args) => toasts.push(args),
  });
  const close = state.bind(actualJsxCallback(file, 'AddContactPanel', 'onClose', 'setShowAddPanel(false)'), { addStoryOperation });
  return { ...state, create, close, rejectRequest, toasts };
}

test('contact create failure within its still-open Add panel offers current recovery', async () => {
  const state = pendingContactCreate();
  const pending = state.create();
  state.rejectRequest(new Error('A failed'));
  await pending;
  assert.equal(state.values.storyFailure, true);
  assert.equal(state.values.saving, false);
  assert.deepEqual(state.toasts, [['A failed', 'cancel']]);
});

test('late contact failure after actual Close Add preserves its toast without polluting tracker guidance', async () => {
  const state = pendingContactCreate();
  const pending = state.create();
  state.close();
  state.rejectRequest(new Error('A failed after close'));
  await pending;
  assert.equal(state.values.showAddPanel, false);
  assert.equal(state.values.storyFailure, false);
  assert.equal(state.values.saving, false);
  assert.deepEqual(state.toasts, [['A failed after close', 'cancel']]);
});

test('reopening Add after actual Close cannot receive the earlier operation failure', async () => {
  const state = pendingContactCreate();
  const pending = state.create();
  state.close();
  state.values.showAddPanel = true;
  state.rejectRequest(new Error('Closed operation A failed'));
  await pending;
  assert.equal(state.values.storyFailure, false);
  assert.deepEqual(state.toasts, [['Closed operation A failed', 'cancel']]);
});
