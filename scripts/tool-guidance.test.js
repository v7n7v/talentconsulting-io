const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');

async function loadModules() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-guidance-'));
  const entryPoints = ['lib/tool-guidance.ts', 'lib/tool-guidance-shortcuts.ts', 'lib/tool-guidance-target.ts', 'lib/tool-guidance-geometry.ts', 'lib/tool-guidance-overview.ts', 'lib/suite-tool-registry.ts'];
  await build({ entryPoints, outdir: directory, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  return Object.assign({}, ...entryPoints.map(entry => require(path.join(directory, `${path.basename(entry, '.ts')}.js`))));
}
const modules = loadModules();

function config() {
  return {
    toolId: 'job-search', version: '1', contextKey: 'source-A', preferredChapterId: 'setup',
    chapters: [
      { id: 'setup', title: 'Set your direction', steps: [
        { id: 'target', title: 'Target', description: 'Choose a role.', anchor: 'roles-target' },
        { id: 'search', title: 'Search', description: 'Search when ready.', anchor: 'roles-search' },
      ] },
      { id: 'results', title: 'Review your choices', availability: 'waiting', unavailableReason: 'Run a real search first.', steps: [
        { id: 'evidence', title: 'Evidence', description: 'Inspect real evidence.', anchor: 'roles-evidence' },
        { id: 'choice', title: 'Choose', description: 'Save or keep exploring.', anchor: 'roles-decisions' },
      ] },
    ],
  };
}

test('starts at the preferred chapter, with a safe fallback for unknown or empty chapters', async () => {
  const api = await modules;
  const story = config();
  assert.deepEqual(api.initialGuidancePosition(story), { chapterId: 'setup', stepId: 'target' });
  story.preferredChapterId = 'results';
  assert.deepEqual(api.initialGuidancePosition(story), { chapterId: 'results', stepId: 'evidence' });
  story.preferredChapterId = 'missing';
  story.chapters.unshift({ id: 'empty', title: 'Empty', steps: [] });
  assert.deepEqual(api.initialGuidancePosition(story), { chapterId: 'setup', stepId: 'target' });
  assert.equal(api.initialGuidancePosition({ ...story, chapters: [] }), null);
});

test('Next reaches the real waiting boundary and cannot advance through it', async () => {
  const api = await modules, story = config();
  let position = api.initialGuidancePosition(story);
  position = api.moveGuidancePosition(story, position, 1);
  assert.equal(position.stepId, 'search');
  position = api.moveGuidancePosition(story, position, 1);
  assert.equal(position.stepId, 'evidence');
  assert.deepEqual(api.moveGuidancePosition(story, position, 1), position);
  assert.equal(api.guidanceAvailability(story.chapters[1], story.chapters[1].steps[0]).reason, 'Run a real search first.');
  assert.equal(api.moveGuidancePosition(story, position, -1).stepId, 'search');
});

test('an actual result unlocks explanations without changing its business state', async () => {
  const api = await modules, story = config();
  story.chapters[1].availability = 'available';
  const before = JSON.stringify(story);
  const next = api.moveGuidancePosition(story, { chapterId: 'results', stepId: 'evidence' }, 1);
  assert.equal(next.stepId, 'choice');
  assert.equal(JSON.stringify(story), before);
  assert.deepEqual(api.moveGuidancePosition(story, next, 1), next);
  assert.equal('completed' in story, false);
});

for (const state of ['blocked', 'stale', 'waiting']) {
  test(`${state} runtime step keeps a readable prerequisite and stops Next`, async () => {
    const api = await modules, story = config();
    const step = story.chapters[0].steps[0];
    step.availability = state;
    step.unavailableReason = 'Review the current source.';
    const position = api.initialGuidancePosition(story);
    assert.deepEqual(api.moveGuidancePosition(story, position, 1), position);
    assert.equal(api.guidanceUnavailableText(state, api.guidanceAvailability(story.chapters[0], step).reason), 'Review the current source.');
    assert.ok(api.guidanceUnavailableText(state));
  });
}

test('removed or renamed steps revalidate to an authored step', async () => {
  const api = await modules, story = config();
  const selection = api.resolveGuidancePosition(story, { chapterId: 'setup', stepId: 'obsolete' });
  assert.equal(selection.step.id, 'target');
  assert.equal(api.resolveGuidancePosition({ ...story, chapters: [] }, null), null);
});

test('scope closes on owner, route, source/object or guide-version change, not availability', async () => {
  const api = await modules, story = config();
  const scope = api.guidanceScope('/suite/job-search', 'alice', story);
  assert.notEqual(scope, api.guidanceScope('/suite/job-search', 'bob', story));
  assert.notEqual(scope, api.guidanceScope('/suite/resume', 'alice', story));
  assert.notEqual(scope, api.guidanceScope('/suite/job-search', 'alice', { ...story, contextKey: 'source-B' }));
  assert.notEqual(scope, api.guidanceScope('/suite/job-search', 'alice', { ...story, version: '2' }));
  story.chapters[1].availability = 'available';
  assert.equal(scope, api.guidanceScope('/suite/job-search', 'alice', story));
});

test('invitation preference is scoped to owner/tool/version and contains no source content', async () => {
  const api = await modules, story = config();
  const key = api.guidanceInvitationKey('alice', story);
  assert.notEqual(key, api.guidanceInvitationKey('bob', story));
  assert.notEqual(key, api.guidanceInvitationKey('alice', { ...story, version: '2' }));
  assert.equal(key, api.guidanceInvitationKey('alice', { ...story, contextKey: 'private-text-never-in-the-preference' }));
  assert.ok(!key.includes('private-text'));
});

function shortcutDocument({ guidance = false, modal = false } = {}) {
  return { documentElement: { hasAttribute: () => guidance }, querySelector: () => modal ? {} : null };
}
function eventTarget(doc, interactive = false) { return { ownerDocument: doc, closest: () => interactive ? {} : null }; }

test('tool shortcuts are blocked throughout an open guidance session and a competing modal', async () => {
  const api = await modules;
  assert.equal(api.isGuidanceShortcutBlocked({ target: eventTarget(shortcutDocument({ guidance: true })) }), true);
  assert.equal(api.isGuidanceShortcutBlocked({ target: eventTarget(shortcutDocument({ modal: true })) }), true);
  assert.equal(api.isGuidanceShortcutBlocked({ target: eventTarget(shortcutDocument()) }), false);
});

test('tool shortcuts exclude all interactive targets, modifiers and composing events', async () => {
  const api = await modules, target = eventTarget(shortcutDocument());
  assert.equal(api.isGuidanceShortcutBlocked({ target: eventTarget(shortcutDocument(), true) }), true);
  for (const flag of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'isComposing', 'defaultPrevented']) {
    assert.equal(api.isGuidanceShortcutBlocked({ target, [flag]: true }), true, flag);
  }
  assert.equal(api.isGuidanceShortcutBlocked({ target, keyCode: 229 }), true);
  assert.equal(api.isGuidanceShortcutBlocked({ target: null }), true);
  assert.equal(api.isGuidanceShortcutBlocked({ target }, { contains: () => false }), true);
  assert.equal(api.isGuidanceShortcutBlocked({ target }, { contains: () => true }), false);
});

function makeTarget(anchor, overrides = {}) {
  return Object.assign({
    isConnected: true, parentElement: null, styleState: { display: 'block', visibility: 'visible', opacity: '1' },
    getAttribute: name => name === 'data-guide' ? anchor : null,
    closest: () => null, getBoundingClientRect: () => ({ top: 10, left: 10, right: 110, bottom: 50, width: 100, height: 40 }),
    getClientRects: () => [{}], scrollIntoView: () => {}, click: () => { throw Error('Guidance must not click'); }, focus: () => { throw Error('Guidance must not focus'); },
  }, overrides);
}
function makeDocument(targets, modals = []) {
  return {
    defaultView: { getComputedStyle: element => element.styleState },
    querySelectorAll: selector => selector === '[data-guide]' ? targets : modals,
  };
}

test('semantic resolution ignores disconnected, hidden and zero-sized duplicates', async () => {
  const api = await modules;
  const hidden = makeTarget('roles-target', { styleState: { display: 'none', visibility: 'visible', opacity: '1' } });
  const disconnected = makeTarget('roles-target', { isConnected: false });
  const empty = makeTarget('roles-target', { getClientRects: () => [] });
  const visible = makeTarget('roles-target');
  assert.equal(api.resolveGuidanceTarget(makeDocument([hidden, disconnected, empty, visible]), 'roles-target'), visible);
  assert.equal(api.resolveGuidanceTarget(makeDocument([visible]), 'unknown'), null);
  assert.equal(api.resolveGuidanceTarget(makeDocument([visible]), 'roles-target"] button'), null);
});

test('visibility respects hidden/inert ancestors and parent computed styles', async () => {
  const api = await modules;
  const parent = makeTarget('parent', { styleState: { display: 'block', visibility: 'hidden', opacity: '1' } });
  const child = makeTarget('roles-search', { parentElement: parent });
  assert.equal(api.resolveGuidanceTarget(makeDocument([child]), 'roles-search'), null);
  const inert = makeTarget('roles-search', { closest: () => ({}) });
  assert.equal(api.resolveGuidanceTarget(makeDocument([inert]), 'roles-search'), null);
});

test('Show target scrolls only the authored anchor and never invokes tool actions or focus', async () => {
  const api = await modules;
  const scrolls = [];
  const target = makeTarget('roles-search', { scrollIntoView: options => scrolls.push(options) });
  const doc = makeDocument([target]);
  assert.equal(api.showGuidanceTarget(doc, 'roles-search'), true);
  assert.deepEqual(scrolls, [{ block: 'nearest', inline: 'nearest', behavior: 'auto' }]);
  assert.equal(api.showGuidanceTarget(doc, 'missing'), false);
  assert.equal(scrolls.length, 1);
});

test('Show target is a no-op while another modal owns the page', async () => {
  const api = await modules;
  let scrolls = 0;
  const target = makeTarget('roles-search', { scrollIntoView: () => scrolls++ });
  const modal = makeTarget('modal');
  const doc = makeDocument([target], [modal]);
  assert.equal(api.showGuidanceTarget(doc, 'roles-search'), false);
  assert.equal(scrolls, 0);
  modal.isConnected = false;
  assert.equal(api.showGuidanceTarget(doc, 'roles-search'), true);
});

test('explanation navigation never calls injected action callbacks or mutates source data', async () => {
  const api = await modules, story = config();
  let operations = 0;
  const forbidden = () => operations++;
  Object.assign(story, { onSearch: forbidden, onGenerate: forbidden, onSave: forbidden, onExport: forbidden, onChangeSource: forbidden });
  story.chapters[0].steps[0].onReveal = forbidden;
  const source = { text: 'Unchanged resume draft', selected: 'source-A' };
  const before = structuredClone(source);
  const position = api.moveGuidancePosition(story, api.initialGuidancePosition(story), 1);
  assert.equal(position.stepId, 'search');
  assert.equal(operations, 0);
  assert.deepEqual(source, before);
});

test('all original help IDs and every registry help reference have truthful readable overviews', async () => {
  const api = await modules;
  const original = ['intelligence', 'ats-preview', 'stories', 'quality', 'pulse', 'vault', 'interview-debrief', 'cover-letter', 'linkedin', 'negotiate', 'jd-generator', 'flashcards', 'market-oracle', 'writing-tools', 'job-search', 'resume', 'skill-bridge', 'network', 'analytics', 'gallery', 'agent', 'applications', 'feedback', 'interview-sim', 'agent-queue'];
  const ids = new Set([...original, ...api.suiteToolRegistry.map(tool => tool.pageHelpId).filter(Boolean)]);
  for (const id of ids) {
    const overview = api.getToolHelpOverview(id);
    assert.ok(overview?.title && overview?.subtitle && overview?.steps.length, id);
    assert.ok(overview.steps.every(step => step.title && step.description), id);
  }
  assert.match(api.getToolHelpOverview('ats-analyzer').tips[0], /does not parse an exported file/);
  assert.match(api.getToolHelpOverview('job-search').steps.at(-1).description, /not submission/);
  assert.match(api.getToolHelpOverview('resume').tips[0], /different states/);
  assert.match(api.getToolHelpOverview('interview-sim').steps.at(-1).description, /only after saving succeeds/);
});

test('mobile scrolling puts a lower control above the guidance note', async () => {
  const api = await modules;
  const viewport = { top: 0, left: 0, width: 320, height: 640 };
  const panel = { top: 350, left: 16, width: 288, height: 274 };
  const plan = api.guidanceScrollPlan({ viewport, panel, stickyTop: 80, target: { top: 540, left: 16, width: 288, height: 44 } });
  assert.equal(plan.bottom, 334);
  assert.equal(plan.desiredTop, 290);
  assert.equal(plan.scrollDelta, 250);
  assert.ok(plan.desiredTop + 44 < panel.top);
});

test('scrolling respects a sticky top rail and leaves an already-visible control in place', async () => {
  const api = await modules;
  const viewport = { top: 0, left: 0, width: 390, height: 844 };
  const panel = { top: 460, left: 16, width: 358, height: 368 };
  const above = api.guidanceScrollPlan({ viewport, panel, stickyTop: 100, target: { top: 40, left: 16, width: 200, height: 44 } });
  assert.equal(above.desiredTop, 116);
  assert.equal(above.scrollDelta, -76);
  const visible = api.guidanceScrollPlan({ viewport, panel, stickyTop: 100, target: { top: 200, left: 16, width: 200, height: 44 } });
  assert.equal(visible.scrollDelta, 0);
});

test('tall targets expose their start in the usable area without invented fit', async () => {
  const api = await modules;
  const plan = api.guidanceScrollPlan({ viewport: { top: 0, left: 0, width: 320, height: 640 }, panel: { top: 350, left: 16, width: 288, height: 274 }, stickyTop: 80, target: { top: 500, left: 16, width: 288, height: 600 } });
  assert.equal(plan.desiredTop, 96);
  assert.equal(plan.usableHeight, 238);
  assert.equal(plan.scrollDelta, 404);
});

test('desktop controls beside the note keep the full usable height', async () => {
  const api = await modules;
  const plan = api.guidanceScrollPlan({ viewport: { top: 0, left: 0, width: 1440, height: 900 }, panel: { top: 240, left: 1040, width: 384, height: 644 }, target: { top: 750, left: 300, width: 500, height: 100 } });
  assert.equal(plan.bottom, 884);
  assert.equal(plan.scrollDelta, 0);
});

test('geometry supports a note above the control and a resized visual viewport', async () => {
  const api = await modules;
  const plan = api.guidanceScrollPlan({ viewport: { top: 120, left: 0, width: 390, height: 500 }, panel: { top: 136, left: 16, width: 358, height: 160 }, target: { top: 150, left: 16, width: 200, height: 44 } });
  assert.equal(plan.top, 312);
  assert.equal(plan.desiredTop, 312);
  const placement = api.guidancePanelPlacement({ width: 390, height: 400, offsetTop: 40, layoutWidth: 390, layoutHeight: 844 });
  assert.equal(placement.bottom, 420);
  assert.equal(placement.maxHeight, 184);
  assert.equal(placement.width, 358);
});

test('Show target adjusts nested scroll first, then any remaining viewport collision', async () => {
  const api = await modules;
  let top = 600;
  const calls = [];
  const panel = makeTarget('panel', { getBoundingClientRect: () => ({ top: 400, left: 16, width: 288, height: 224, right: 304, bottom: 624 }) });
  const parent = makeTarget('parent', { scrollHeight: 1500, clientHeight: 500, styleState: { display: 'block', visibility: 'visible', opacity: '1', overflowY: 'auto' }, scrollBy: ({ top: delta }) => { calls.push(['nested', delta]); top -= Math.min(100, delta); } });
  const target = makeTarget('roles-search', { parentElement: parent, getBoundingClientRect: () => ({ top, left: 16, width: 200, height: 44, right: 216, bottom: top + 44 }) });
  const doc = makeDocument([target]);
  doc.querySelector = () => panel;
  doc.defaultView.innerWidth = 320;
  doc.defaultView.innerHeight = 640;
  doc.defaultView.scrollBy = ({ top: delta }) => { calls.push(['viewport', delta]); top -= delta; };
  doc.querySelectorAll = selector => selector === '[data-guide]' ? [target] : [];
  assert.equal(api.showGuidanceTarget(doc, 'roles-search'), true);
  assert.equal(calls[0][0], 'nested');
  assert.equal(calls[1][0], 'viewport');
  assert.ok(top + 44 < 400);
});

test('allowed workflow surface restricts semantic anchors and ignores only its own dialog', async () => {
  const api = await modules;
  const outside = makeTarget('same-anchor');
  const inside = makeTarget('same-anchor');
  const trigger = makeTarget('internal-help');
  const surface = makeTarget('surface', {
    getAttribute: name => name === 'data-guide-surface' ? 'application-detail' : name === 'aria-modal' ? 'true' : null,
    contains: element => [surface, inside, trigger].includes(element),
    querySelectorAll: selector => selector === '[data-guide]' ? [inside] : [],
  });
  const doc = makeDocument([outside, inside], [surface]);
  const list = doc.querySelectorAll;
  doc.querySelectorAll = selector => selector === '[data-guide-surface]' ? [surface] : list(selector);
  assert.equal(api.resolveGuidanceSurface(doc, 'application-detail', trigger), surface);
  assert.equal(api.resolveGuidanceSurface(doc, 'application-detail', outside), null);
  assert.equal(api.resolveGuidanceSurface(doc, 'auth-dialog', trigger), null);
  assert.equal(api.resolveGuidanceTarget(doc, 'same-anchor', surface), inside);
  assert.equal(api.hasCompetingGuidanceModal(doc), true);
  assert.equal(api.hasCompetingGuidanceModal(doc, surface), false);
  inside.getAttribute = () => 'different-anchor';
  assert.equal(api.resolveGuidanceTarget(doc, 'same-anchor', surface), null);
  const approval = makeTarget('approval');
  const extra = makeDocument([], [surface, approval]);
  assert.equal(api.hasCompetingGuidanceModal(extra, surface), true);
});

test('modal Show target scrolls its real target without moving background, focus, or work', async () => {
  const api = await modules;
  let scrolls = 0;
  const inside = makeTarget('modal-action', { scrollIntoView: () => scrolls++ });
  const surface = makeTarget('surface', {
    getAttribute: name => name === 'data-guide-surface' ? 'application-detail' : name === 'aria-modal' ? 'true' : null,
    contains: element => [surface, inside].includes(element),
    querySelectorAll: selector => selector === '[data-guide]' ? [inside] : [], querySelector: () => null,
  });
  inside.parentElement = surface;
  const doc = makeDocument([makeTarget('modal-action')], [surface]);
  doc.defaultView.innerWidth = 390;
  doc.defaultView.innerHeight = 640;
  doc.defaultView.scrollBy = () => { throw Error('Modal guidance must not scroll its inert background'); };
  assert.equal(api.showGuidanceTarget(doc, 'modal-action', surface), true);
  assert.equal(scrolls, 0, 'native scrollIntoView could traverse the inert background');
  const competing = makeTarget('payment');
  doc.querySelectorAll = selector => selector === '[aria-modal="true"], dialog[open]' ? [surface, competing] : [];
  assert.equal(api.showGuidanceTarget(doc, 'modal-action', surface), false);
  assert.equal(scrolls, 0);
});

test('fixed modal footer targets move the note above them at narrow and desktop widths', async () => {
  const api = await modules;
  for (const [width, height, footerTop] of [[320, 640, 470], [390, 480, 320], [1440, 900, 650]]) {
    const surface = { top: 0, left: 0, width: Math.min(width, 430), height };
    const target = { top: footerTop, left: 16, width: surface.width - 32, height: height - footerTop - 16 };
    const note = api.guidanceModalPanelPlacement({ surface, viewport: { top: 0, left: 0, width, height }, target, scrollable: false });
    assert.equal(note.bottom, 'auto');
    assert.equal(note.top, 16);
    assert.ok(note.top + note.maxHeight <= target.top - 16, `${width}px footer must remain exposed`);
  }
});

test('fixed upper modal controls leave the note below and scrollable targets retain the bottom note', async () => {
  const api = await modules;
  const surface = { top: 32, left: 0, width: 390, height: 812 };
  const viewport = { top: 0, left: 0, width: 390, height: 844 };
  const target = { top: 90, left: 16, width: 358, height: 60 };
  const note = api.guidanceModalPanelPlacement({ surface, viewport, target, scrollable: false });
  assert.equal(note.top, 'auto');
  assert.ok(surface.top + surface.height - note.bottom - note.maxHeight >= target.top + target.height + 16);
  const scrollable = api.guidanceModalPanelPlacement({ surface, viewport, target: { ...target, top: 640 }, scrollable: true });
  assert.equal(scrollable.top, 'auto');
  assert.equal(scrollable.bottom, 16);
});

test('a target clipped above its scroll body resolves but has no outline on the modal header', async () => {
  const api = await modules;
  const body = makeTarget('body', {
    styleState: { display: 'block', visibility: 'visible', opacity: '1', overflowY: 'auto', overflowX: 'hidden' },
    getBoundingClientRect: () => ({ top: 160, left: 16, right: 374, bottom: 580, width: 358, height: 420 }),
  });
  const target = makeTarget('contact-log', { parentElement: body, getBoundingClientRect: () => ({ top: 80, left: 20, right: 360, bottom: 140, width: 340, height: 60 }) });
  const doc = makeDocument([target]);
  doc.defaultView.innerWidth = 390; doc.defaultView.innerHeight = 640;
  assert.equal(api.resolveGuidanceTarget(doc, 'contact-log'), target);
  assert.equal(api.guidanceTargetVisibleRect(doc, target), null);
  target.getBoundingClientRect = () => ({ top: 140, left: 20, right: 360, bottom: 200, width: 340, height: 60 });
  assert.deepEqual(api.guidanceTargetVisibleRect(doc, target), { top: 160, left: 20, width: 340, height: 40 });
});

test('outline clips every overflow ancestor and the visual viewport without changing target availability', async () => {
  const api = await modules;
  const outer = makeTarget('outer', {
    styleState: { display: 'block', visibility: 'visible', opacity: '1', overflow: 'hidden' },
    getBoundingClientRect: () => ({ top: 100, left: 40, right: 350, bottom: 600, width: 310, height: 500 }),
  });
  const inner = makeTarget('inner', {
    parentElement: outer, styleState: { display: 'block', visibility: 'visible', opacity: '1', overflowY: 'auto' },
    getBoundingClientRect: () => ({ top: 160, left: 16, right: 374, bottom: 580, width: 358, height: 420 }),
  });
  const target = makeTarget('contact-log', { parentElement: inner, getBoundingClientRect: () => ({ top: 140, left: 20, right: 380, bottom: 620, width: 360, height: 480 }) });
  const doc = makeDocument([target]);
  doc.defaultView.innerWidth = 390; doc.defaultView.innerHeight = 640;
  doc.defaultView.visualViewport = { offsetTop: 180, offsetLeft: 0, width: 390, height: 360 };
  assert.deepEqual(api.guidanceTargetVisibleRect(doc, target), { top: 180, left: 40, width: 310, height: 360 });
  assert.equal(api.resolveGuidanceTarget(doc, 'contact-log'), target);
});
