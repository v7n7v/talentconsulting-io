const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { loadBodies, runtime } = require('./test-ui-hooks.cjs');

const page = loadBodies('app/suite/job-search/page.tsx', 'export { JobSearchWorkspace, findRolesWorkState, findRolesGuidance, FindRolesGuidance, FIND_ROLES_GUIDE_ANCHORS, OpportunityCard, OpportunityIntelligencePanel, JobSearchHeader, JobSearchCommandStrip };');
const oracle = loadBodies('app/suite/market-oracle/OracleContent.tsx', 'export { roleAnalysisGuidance, ROLE_ANALYSIS_GUIDE_ANCHORS };');
const helpers = (async () => {
  const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'find-roles-guidance-')), 'helpers.cjs');
  await build({ stdin: { contents: "export * from './lib/job-search-context'; export * from './lib/tool-guidance'; export * from './lib/tool-guidance-shortcuts'; export * from './lib/job-packet-recovery'; export * from './lib/job-discovery-recovery';", resolveDir: process.cwd(), loader: 'ts' }, outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  return require(outfile);
})();

const response = body => ({ ok: true, status: 200, json: async () => body });
const makeJob = (id = 'role-a') => ({
  id, identityKey: id, title: `Engineer ${id}`, company: 'Example company', location: 'Remote',
  salary: { min: null, max: null, currency: 'USD' }, description: 'A real source posting for this test fixture.',
  skills: [], url: `https://jobs.example/${id}`, postedDate: '2026-10-01', employmentType: 'Full time', source: 'Greenhouse',
  matchScore: null, fitScore: null, sourceMeta: { sourceType: 'direct_ats', sourceName: 'Greenhouse' },
  freshness: { isFresh: false, ghostRisk: 'unknown', reasons: [] }, recommendationReason: 'Source returned this role.',
  preparationEligible: true, outboundLinkVerified: true,
});
const facts = extra => ({
  owner: 'alice', sourceKey: null, hasSource: false, query: 'Engineer', loading: false, resumeLoading: false,
  hasSearched: false, inputsChanged: false, totalResults: 0, visibleResults: 0, recovery: null, selectedJob: null,
  ...extra,
});
const resultChapter = config => config.chapters.find(chapter => chapter.id === 'review-choices');
const step = (config, id) => config.chapters.flatMap(chapter => chapter.steps).find(item => item.id === id);

for (const [state, changes, availability, text] of [
  ['setup', {}, 'waiting', /Run Search yourself/],
  ['waiting', { resumeLoading: true }, 'waiting', /sources are loading/],
  ['pending', { loading: true, totalResults: 2, visibleResults: 2 }, 'waiting', /current request/],
  ['empty', { hasSearched: true }, 'waiting', /No roles found for this search/],
  ['filtered-empty', { hasSearched: true, totalResults: 2 }, 'waiting', /none match these filters/],
  ['failure', { hasSearched: true, recovery: { message: 'Provider unavailable' } }, 'blocked', /Provider unavailable/],
  ['partial', { hasSearched: true, totalResults: 2, visibleResults: 2, recovery: { message: 'Provider unavailable' } }, 'available', /earlier roles remain available/],
  ['stale', { hasSearched: true, totalResults: 2, visibleResults: 2, inputsChanged: true }, 'stale', /earlier search settings/],
  ['results', { hasSearched: true, totalResults: 2, visibleResults: 2 }, 'available', /Inspect real role facts/],
]) {
  test(`Find roles observes ${state} without treating explanations as work`, async () => {
    Object.assign(globalThis, await helpers);
    const { findRolesWorkState, findRolesGuidance } = await page;
    const current = facts(changes);
    const config = findRolesGuidance(current);
    assert.equal(findRolesWorkState(current), state);
    assert.equal(resultChapter(config).availability, availability);
    assert.match(resultChapter(config).description, text);
    assert.equal(config.preferredChapterId, availability === 'available' ? 'review-choices' : 'set-direction');
    assert.ok(config.chapters.every(chapter => chapter.availability !== 'complete'));
  });
}

test('browsing needs no resume; fit and preparation explain the real source prerequisite', async () => {
  Object.assign(globalThis, await helpers);
  const { findRolesGuidance } = await page;
  const config = findRolesGuidance(facts());
  assert.equal(step(config, 'source').availability, 'available');
  assert.equal(step(config, 'search').availability, 'available');
  assert.match(step(config, 'source').description, /still browse without one/);
  assert.match(step(config, 'source').description, /fit stays unmeasured/);
  assert.equal(step(findRolesGuidance(facts({ query: '  ' })), 'search').availability, 'blocked');
});

test('draft edits and search outcomes preserve assistance; owner and source revisions invalidate it', async () => {
  Object.assign(globalThis, await helpers);
  const { findRolesGuidance } = await page;
  const original = findRolesGuidance(facts({ sourceKey: 'resume-a:revision-1', hasSource: true }));
  for (const changes of [{ query: 'Designer' }, { loading: true }, { hasSearched: true, totalResults: 2, visibleResults: 2 }, { totalResults: 2, visibleResults: 2, inputsChanged: true }, { selectedJob: makeJob('role-b') }]) {
    assert.equal(findRolesGuidance(facts({ sourceKey: 'resume-a:revision-1', hasSource: true, ...changes })).contextKey, original.contextKey);
  }
  assert.notEqual(findRolesGuidance(facts({ owner: 'bob', sourceKey: 'resume-a:revision-1' })).contextKey, original.contextKey);
  assert.notEqual(findRolesGuidance(facts({ sourceKey: 'resume-a:revision-2' })).contextKey, original.contextKey);
  assert.ok(!original.contextKey.includes('Engineer'), 'draft target is absent from persisted guidance identity');
});

test('result guidance waits for real selection and preserves hidden-tab fallback instructions', async () => {
  Object.assign(globalThis, await helpers);
  const { findRolesGuidance } = await page;
  const current = facts({ totalResults: 2, visibleResults: 2, hasSearched: true });
  const config = findRolesGuidance(current);
  assert.equal(step(config, 'role').availability, 'available');
  assert.equal(step(config, 'evidence').availability, 'waiting');
  assert.equal(step(config, 'decisions').availability, 'waiting');
  const selected = findRolesGuidance({ ...current, selectedJob: makeJob() });
  assert.equal(step(selected, 'evidence').availability, 'available');
  assert.match(step(selected, 'evidence').targetUnavailableReason, /Fit tab yourself/);
  assert.match(step(selected, 'decisions').targetUnavailableReason, /Packet tab yourself/);
});

test('Help reads actual saved and prepared outcomes and pauses pending packet work', async () => {
  Object.assign(globalThis, await helpers);
  const { findRolesGuidance } = await page;
  const current = facts({ hasSource: true, totalResults: 1, visibleResults: 1, selectedJob: makeJob() });
  assert.doesNotMatch(step(findRolesGuidance(current), 'decisions').description, /successfully saved|prepared draft is available/);
  const saved = findRolesGuidance({ ...current, selectedJob: { ...current.selectedJob, ledgerStatus: 'saved' } });
  assert.match(step(saved, 'decisions').description, /successfully saved for later/);
  const pending = findRolesGuidance({ ...current, packet: { status: 'preparing' } });
  assert.equal(step(pending, 'decisions').availability, 'waiting');
  const unconfirmed = findRolesGuidance({ ...current, packet: { status: 'ready' } });
  assert.doesNotMatch(step(unconfirmed, 'decisions').description, /prepared draft is available/);
  const ready = findRolesGuidance({ ...current, packet: { status: 'ready', applicationId: 'app-a', morphedVersionId: 'draft-a' } });
  assert.match(step(ready, 'decisions').description, /available in Applications for your review; it has not been submitted/);
  const applied = findRolesGuidance({ ...current, packet: { status: 'applied', applicationId: 'app-a', morphedVersionId: 'draft-a' } });
  assert.doesNotMatch(step(applied, 'decisions').description, /has not been submitted/);
});

test('all guide moves are explanation-only, and waiting or stale results cannot be advanced as complete', async () => {
  Object.assign(globalThis, await helpers);
  const { findRolesGuidance, FindRolesGuidance } = await page;
  const { moveGuidancePosition } = await helpers;
  const current = facts({ totalResults: 1, visibleResults: 1, selectedJob: makeJob() });
  const config = findRolesGuidance(current);
  const serialized = JSON.stringify(config);
  const positions = config.chapters.flatMap(chapter => chapter.steps.map(item => ({ chapterId: chapter.id, stepId: item.id })));
  for (let index = 0; index < positions.length - 1; index += 1) {
    assert.deepEqual(moveGuidancePosition(config, positions[index], 1), positions[index + 1]);
  }
  for (const extra of [{ loading: true }, { inputsChanged: true }, { visibleResults: 0 }]) {
    const paused = findRolesGuidance({ ...current, ...extra });
    assert.deepEqual(moveGuidancePosition(paused, positions[4], 1), positions[4]);
  }
  assert.equal(JSON.stringify(config), serialized);
  const callbacks = [];
  globalThis.useToolGuidance = value => { callbacks.push(value); return {}; };
  const ui = runtime(FindRolesGuidance, { config });
  ui.flush();
  assert.deepEqual(callbacks, [config]);
  assert.equal(typeof config.chapters[0].steps[0].onNext, 'undefined');
  ui.unmount();
});

test('semantic anchors belong to a real role and only to the actual evidence/decision tab', async () => {
  globalThis.getJobResultIdentity = job => job.identityKey || job.id;
  const { OpportunityCard, OpportunityIntelligencePanel, FIND_ROLES_GUIDE_ANCHORS: anchors } = await page;
  const job = makeJob();
  const card = runtime(OpportunityCard, { job, selected: true, guideTarget: true, onSelect() {}, onDetails() {}, onPrepare() {} });
  card.flush();
  assert.equal(card.find(node => node.props['data-guide'] === anchors.role).type, 'button');
  assert.match(card.text(), /Posted/);
  card.props.guideTarget = false;
  card.flush();
  assert.ok(!card.nodes().some(node => node.props['data-guide'] === anchors.role));
  card.unmount();
  const panel = runtime(OpportunityIntelligencePanel, { job, userSkills: [], hasSource: false, onClose() {}, onPrepare() {}, onMarkApplied() {}, onSaveLater() {}, onSkip() {}, onFeedback: async () => true });
  globalThis.SuiteUnmeasured = 'SuiteUnmeasured';
  panel.flush();
  assert.ok(panel.nodes().some(node => node.props['data-guide'] === anchors.evidence));
  assert.ok(!panel.nodes().some(node => node.props['data-guide'] === anchors.decisions));
  panel.find(node => node.type === 'button' && node.props.children === 'packet').props.onClick();
  panel.flush();
  assert.ok(panel.nodes().some(node => node.props['data-guide'] === anchors.decisions));
  assert.ok(!panel.nodes().some(node => node.props['data-guide'] === anchors.evidence));
  panel.unmount();
});

test('working brief removes header tiles and keeps search controls and source prerequisites', async () => {
  const { JobSearchHeader, JobSearchCommandStrip, FIND_ROLES_GUIDE_ANCHORS: anchors } = await page;
  const header = runtime(JobSearchHeader);
  header.flush();
  const rendered = header.find(node => node.type === 'SuiteToolHeader');
  assert.equal(rendered.props.title, 'Find roles worth your time');
  assert.equal(rendered.props.actions, undefined);
  header.unmount();
  const strip = runtime(JobSearchCommandStrip, { query: 'Engineer', location: 'Remote', loading: false, resumeLoading: false, resultContext: null, inputsChanged: false, resumes: [], selectedResumeId: null, selectedResumeName: '', onQueryChange() {}, onLocationChange() {}, onSearch() {}, onResumeSelect() {} });
  strip.flush();
  for (const anchor of [anchors.target, anchors.location, anchors.search]) assert.ok(strip.nodes().some(node => node.props['data-guide'] === anchor));
  assert.equal(strip.find(node => node.props['data-guide'] === anchors.search).props.disabled, false);
  assert.match(strip.text(), /Browse without a resume/);
  strip.unmount();
});

const analysisFacts = extra => ({ owner: 'alice', sourceId: null, sourceSnapshot: null, canAnalyze: false, pending: false, hasReport: false, freshReport: false, error: '', canPrepare: false, packetStatus: 'idle', ...extra });
test('Role analysis observes pending, failure, stale report, and confirmed-source prerequisites', async () => {
  Object.assign(globalThis, await helpers);
  const { roleAnalysisGuidance } = await oracle;
  const chapter = extra => roleAnalysisGuidance(analysisFacts(extra)).chapters[1];
  assert.equal(chapter({}).availability, 'waiting');
  assert.equal(chapter({ pending: true }).availability, 'waiting');
  assert.equal(chapter({ error: 'Analysis unavailable' }).availability, 'blocked');
  assert.equal(chapter({ hasReport: true }).availability, 'stale');
  assert.equal(chapter({ hasReport: true, freshReport: true }).availability, 'available');
  assert.match(chapter({ hasReport: true, freshReport: true }).steps[1].description, /same confirmed library source/);
  assert.equal(chapter({ hasReport: true, freshReport: true, packetStatus: 'preparing' }).steps[1].availability, 'waiting');
  assert.match(chapter({ hasReport: true, freshReport: true, packetStatus: 'tracked' }).steps[1].description, /tracker draft was saved/);
  assert.match(chapter({ hasReport: true, freshReport: true }).steps[0].targetUnavailableReason, /JD tab yourself/);
});

test('Role analysis source revision identity excludes manual draft text and changes for real source revision', async () => {
  Object.assign(globalThis, await helpers);
  const { roleAnalysisGuidance } = await oracle;
  const draft = roleAnalysisGuidance(analysisFacts({ sourceSnapshot: 'draft text' }));
  assert.equal(draft.contextKey, roleAnalysisGuidance(analysisFacts({ sourceSnapshot: 'edited draft text' })).contextKey);
  assert.notEqual(roleAnalysisGuidance(analysisFacts({ sourceId: 'resume-a', sourceSnapshot: { skills: ['TypeScript'] } })).contextKey, roleAnalysisGuidance(analysisFacts({ sourceId: 'resume-a', sourceSnapshot: { skills: ['Python'] } })).contextKey);
  assert.notEqual(draft.contextKey, roleAnalysisGuidance(analysisFacts({ owner: 'bob' })).contextKey);
});

async function shortcutWorkspace() {
  Object.assign(globalThis, await helpers);
  globalThis.useSearchParams = () => ({ get: () => null, entries: () => [] });
  globalThis.useAuthGate = () => ({ setAuthModal() {}, renderAuthModal: () => null });
  globalThis.getResumeVersions = async () => ({ success: true, data: [{ id: 'resume-a', version_name: 'Confirmed source', created_at: '2026-10-01', updated_at: '2026-10-01', status: 'confirmed', content: { skills: ['TypeScript'] } }] });
  globalThis.getUserProfile = async () => ({ data: null });
  globalThis.resumeSnapshotToText = source => (source?.skills || []).join(' ');
  globalThis.resumeVersionToApplicationKitContext = resume => ({ resumeVersionId: resume.id });
  globalThis.mergeApplicationKitContext = () => {};
  globalThis.chooseJobSearchResumeSource = resumes => ({ resume: resumes[0] || null });
  globalThis.isEligibleJobSearchResume = resume => resume?.status === 'confirmed';
  globalThis.getJobResultIdentity = job => job.identityKey || job.id;
  const session = new Map();
  globalThis.sessionStorage = { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, String(value)), removeItem: key => session.delete(key) };
  const { JobSearchWorkspace } = await page;
  const ui = runtime(JobSearchWorkspace);
  const requests = [];
  const listeners = new Map();
  ui.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).startsWith('/api/jobs/preferences')) return response({ success: false, isNew: true });
    if (String(url).startsWith('/api/jobs/search')) return response({ success: true, query: 'Engineer', location: 'Remote', scoreResumeId: 'resume-a', jobs: [makeJob('role-a'), makeJob('role-b')] });
    if (String(url) === '/api/agent/apply-pipeline') return response({ success: true, packetStatus: 'ready_for_review', applicationId: 'app-a', morphedVersionId: 'draft-a', coverLetter: 'Review this real test draft.', atsResult: { overallScore: 82 } });
    return response({ success: true });
  };
  window.addEventListener = (name, fn) => listeners.set(name, fn);
  window.removeEventListener = (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); };
  window.dispatchEvent = () => true;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  ui.flush();
  await ui.settle();
  const command = () => ui.find(node => node.type?.name === 'JobSearchCommandStrip');
  command().props.onQueryChange('Engineer');
  command().props.onLocationChange('Remote');
  ui.flush();
  await command().props.onSearch();
  await ui.settle();
  const focus = { guidance: false, modal: false };
  const doc = { documentElement: { hasAttribute: () => focus.guidance }, querySelector: () => focus.modal ? {} : null };
  const region = { ownerDocument: doc, closest: () => null, contains: target => target === region || target?.region === region };
  ui.find(node => node.props['aria-label'] === 'Role results and decisions').props.ref.current = region;
  const target = { ownerDocument: doc, region, closest: () => null };
  const fire = (key, extra = {}) => {
    const event = { key, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    listeners.get('keydown')(event);
    return event;
  };
  const feed = () => ui.find(node => node.type?.name === 'OpportunityFeed');
  return { ui, requests, focus, target, doc, region, fire, feed };
}

test('real P/S and arrow handlers make no action for overlays, inputs, modifiers, IME, or outside scope', async () => {
  const h = await shortcutWorkspace();
  try {
    const before = h.requests.length;
    const selected = h.feed().props.selectedId;
    const protectedEvents = [
      { defaultPrevented: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }, { keyCode: 229 },
      { target: { ...h.target, closest: () => ({ tagName: 'SELECT' }) } },
      { target: { ...h.target, closest: () => ({ tagName: 'BUTTON' }) } },
      { target: { ...h.target, closest: () => ({ contentEditable: 'true' }) } },
      { target: { ...h.target, region: null } },
    ];
    for (const extra of protectedEvents) for (const key of ['p', 's', 'ArrowUp', 'ArrowDown']) h.fire(key, extra);
    for (const surface of ['guidance', 'modal']) {
      h.focus[surface] = true;
      for (const key of ['p', 's', 'ArrowUp', 'ArrowDown']) h.fire(key);
      h.focus[surface] = false;
    }
    await h.ui.settle();
    assert.equal(h.requests.length, before);
    assert.equal(h.feed().props.selectedId, selected);
  } finally { h.ui.unmount(); }
});

test('real scoped shortcuts retain explicit selection, save, and preparation behavior with Help closed', async () => {
  const h = await shortcutWorkspace();
  try {
    const down = h.fire('ArrowDown');
    h.ui.flush();
    assert.equal(down.defaultPrevented, true);
    assert.equal(h.feed().props.selectedId, 'role-b');
    h.fire('ArrowUp');
    h.ui.flush();
    assert.equal(h.feed().props.selectedId, 'role-a');
    h.fire('s');
    await h.ui.settle();
    assert.equal(h.feed().props.jobs[0].ledgerStatus, 'saved');
    assert.equal(h.requests.filter(request => request.url === '/api/jobs/ledger').length, 1);
    h.fire('p');
    for (let pass = 0; pass < 6; pass += 1) await h.ui.settle();
    assert.equal(h.requests.filter(request => request.url === '/api/agent/apply-pipeline').length, 1);
    assert.equal(h.feed().props.packets['role-a']?.status, 'ready');
  } finally { h.ui.unmount(); }
});

const liveGuide = ui => ui.find(node => node.type?.name === 'FindRolesGuidance').props.config;
test('the actual workspace pauses result guidance when inputs change and retains the original search context', async () => {
  const h = await shortcutWorkspace();
  try {
    const original = liveGuide(h.ui);
    h.ui.find(node => node.type?.name === 'JobSearchCommandStrip').props.onQueryChange('Designer');
    h.ui.flush();
    assert.equal(resultChapter(liveGuide(h.ui)).availability, 'stale');
    assert.equal(liveGuide(h.ui).contextKey, original.contextKey);
    assert.equal(h.ui.find(node => node.type?.name === 'JobSearchCommandStrip').props.resultContext.query, 'Engineer');
    assert.equal(h.feed().props.jobs.length, 2);
  } finally { h.ui.unmount(); }
});

test('the actual workspace distinguishes filtered-empty and successful-empty from a failure', async () => {
  const h = await shortcutWorkspace();
  try {
    h.ui.find(node => node.type?.name === 'OpportunityIntelligenceBar').props.onFilterChange('ready');
    h.ui.flush();
    assert.equal(h.feed().props.totalJobs, 2);
    assert.equal(h.feed().props.jobs.length, 0);
    assert.match(resultChapter(liveGuide(h.ui)).description, /none match these filters/);
    h.feed().props.onResetFilters();
    h.ui.flush();
    h.ui.fetch = async () => response({ success: true, query: 'Engineer', location: 'Remote', scoreResumeId: 'resume-a', jobs: [] });
    await h.ui.find(node => node.type?.name === 'JobSearchCommandStrip').props.onSearch();
    await h.ui.settle();
    assert.equal(h.feed().props.totalJobs, 0);
    assert.equal(h.feed().props.recovery, null);
    assert.match(resultChapter(liveGuide(h.ui)).description, /No roles found for this search/);
  } finally { h.ui.unmount(); }
});

test('the actual current request pauses Help, then a failed refresh retains real roles with a partial message', async () => {
  const h = await shortcutWorkspace();
  try {
    let resolve;
    h.ui.fetch = () => new Promise(yes => { resolve = yes; });
    const work = h.ui.find(node => node.type?.name === 'JobSearchCommandStrip').props.onSearch();
    h.ui.flush();
    assert.equal(resultChapter(liveGuide(h.ui)).availability, 'waiting');
    assert.match(resultChapter(liveGuide(h.ui)).description, /current request/);
    resolve(response({ success: false, error: 'Provider unavailable' }));
    await work;
    await h.ui.settle();
    assert.equal(h.feed().props.jobs.length, 2);
    assert.ok(h.feed().props.recovery);
    assert.equal(resultChapter(liveGuide(h.ui)).availability, 'available');
    assert.match(resultChapter(liveGuide(h.ui)).description, /latest search failed/);
  } finally { h.ui.unmount(); }
});
