const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { loadBodies, runtime } = require('./test-ui-hooks.cjs');

// Execute the actual page body, handlers and effects. Dynamic child tools are
// boundaries; their callback props are exercised rather than importing their UI.
const component = (async () => {
  const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'career-insights-ui-')), 'client.cjs');
  await build({ entryPoints: ['lib/career-twin-client.ts'], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  Object.assign(globalThis, require(outfile));
  let dynamicIndex = 0;
  globalThis.dynamic = () => ['PulseTab', 'ResultsTab'][dynamicIndex++];
  const page = fs.readFileSync('app/suite/intelligence/page.tsx', 'utf8')
    .replace("import('@/app/suite/pulse/PulseContent')", "Promise.resolve({ PulseContent: 'PulseTab' })")
    .replace("import('@/app/suite/agent/quality/QualityContent')", "Promise.resolve({ default: 'ResultsTab' })");
  const isolated = path.join(path.dirname(outfile), 'page.tsx');
  fs.writeFileSync(isolated, page);
  return loadBodies(isolated);
})();
const response = value => ({ ok: true, json: async () => value });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function sparseProfile() {
  return {
    healthScore: null, healthBands: [], daysActive: 0, hasResume: false, resumeVersionCount: 0,
    skills: { confirmed: [], growing: [], weak: [], marketHot: [], gap: [], fitAnalysisCount: 0 },
    pipeline: { totalApps: 0, appliedApps: 0, thisWeekApps: 0, velocity: 0, responded: 0, interviews: 0, offers: 0, responseRate: null, interviewConversion: null, offerConversion: null, ghostRate: null, topCompanies: [] },
    interviews: { totalDebriefs: 0, passRate: null, avgConfidence: null, avgFeeling: null, confidenceTrend: null, weakCategories: [], strongCategories: [], roundTypeBreakdown: [], companiesInterviewed: [] },
    stories: { totalStories: 0, tagDistribution: [], coverageGaps: [] },
    morale: { current: null, trend: null, burnoutRisk: null, history: [] },
  };
}
async function setup(tab = 'overview', data = { profile: sparseProfile(), recommendations: [], twin: null }) {
  const ui = runtime((await component).default);
  ui.params = new URLSearchParams({ tab, preserve: 'yes' }); ui.pushes = []; ui.requests = [];
  globalThis.useSearchParams = () => ui.params;
  globalThis.useRouter = () => ({ push: (...args) => { ui.pushes.push(args); ui.params = new URLSearchParams(args[0].split('?')[1] || ''); } });
  for (const name of ['SuiteEmptyState', 'SuiteMetricCard', 'SuiteUnmeasured', 'SuiteSignedOut']) globalThis[name] = name;
  ui.fetch = async (url, options = {}) => { ui.requests.push([url, options.method || 'GET']); return response(data); };
  ui.flush(); await ui.settle(); return ui;
}
const button = (ui, label) => ui.find(node => node.type === 'button' && JSON.stringify(node.props.children).includes(label));
const active = ui => ui.find(node => node.type === 'button' && node.props['aria-pressed'] === true);
const child = (ui, name) => ui.find(node => node.type === name);

test('legacy analytics and outcomes aliases mount the single results tool; URL changes and navigation preserve context', async () => {
  for (const alias of ['analytics', 'outcomes', 'results']) {
    const ui = await setup(alias);
    assert.match(JSON.stringify(active(ui).props.children), /Application results/);
    assert.equal(child(ui, 'ResultsTab').props.embedded, true);
    assert.equal(ui.nodes().filter(node => node.type === 'ResultsTab').length, 1);
    assert.equal(ui.nodes().some(node => node.type === 'PulseTab'), false);
    button(ui, 'Weekly review').props.onClick(); ui.flush();
    assert.match(ui.pushes.at(-1)[0], /tab=weekly/); assert.match(ui.pushes.at(-1)[0], /preserve=yes/);
    ui.params = new URLSearchParams('tab=analytics'); ui.flush();
    assert.match(JSON.stringify(active(ui).props.children), /Application results/);
    ui.unmount();
  }
});

test('Overview refresh waits for invalidation before GET and failed invalidation preserves the prior view', async () => {
  const ui = await setup(); ui.requests = []; const invalidation = deferred();
  ui.fetch = async (url, options = {}) => { ui.requests.push([url, options.method || 'GET']); return options.method === 'POST' ? invalidation.promise : response({ profile: { ...sparseProfile(), daysActive: 7 } }); };
  button(ui, 'Refresh insights').props.onClick(); ui.flush();
  assert.deepEqual(ui.requests, [['/api/agent/intelligence', 'POST']]); assert.equal(button(ui, 'Refresh insights').props.disabled, true);
  invalidation.resolve(response({ success: true })); await ui.settle();
  assert.deepEqual(ui.requests.map(item => item[1]), ['POST', 'GET']); assert.equal(ui.find(node => Array.isArray(node.props?.children) && node.props.children[1] === 'd active').props.children[0], 7);
  ui.requests = []; ui.fetch = async (url, options = {}) => { ui.requests.push([url, options.method || 'GET']); return { ok: false }; };
  button(ui, 'Refresh insights').props.onClick(); await ui.settle();
  assert.deepEqual(ui.requests.map(item => item[1]), ['POST']); assert.match(ui.text(), /previous overview is preserved/); assert.match(ui.text(), /Showing the last loaded overview/);
});

test('Pulse successful-check-in callback refreshes the overview through invalidation and GET', async () => {
  const ui = await setup('weekly'); ui.requests = [];
  child(ui, 'PulseTab').props.onCheckIn(); await ui.settle();
  assert.deepEqual(ui.requests.map(item => item[1]), ['POST', 'GET']);
  button(ui, 'Overview').props.onClick(); ui.flush(); await ui.settle();
  assert.equal(ui.requests.at(-1)[1], 'GET'); assert.match(JSON.stringify(active(ui).props.children), /Overview/);
});

test('sparse overview preserves null denominators and absent role/morale evidence', async () => {
  const ui = await setup(); const text = ui.text();
  assert.match(text, /Not scored/); assert.match(text, /Not measurable — no applications sent yet/);
  assert.match(text, /Not measurable — no responses yet/); assert.match(text, /Not measurable — no interviews yet/);
  assert.doesNotMatch(text, /0% of applications sent|0% of responses|No gaps found across|Burnout risk: low|Excellent/);
  const unknown = ui.nodes().filter(node => node.type === 'SuiteUnmeasured');
  assert.ok(unknown.some(node => /analy|role/i.test(JSON.stringify(node.props))));
  assert.ok(unknown.some(node => /morale|check.in/i.test(JSON.stringify(node.props))));
  const metrics = ui.nodes().filter(node => node.type === 'SuiteMetricCard');
  assert.equal(metrics.find(node => node.props.label === 'Submitted').props.value, '0');
});

test('late prior-owner load cannot replace the new owner overview', async () => {
  const ui = await setup(); const old = deferred();
  ui.fetch = async (url, options = {}) => options.method === 'POST' ? response({ success: true }) : old.promise;
  button(ui, 'Refresh insights').props.onClick(); await ui.settle();
  ui.user = { uid: 'bob' }; ui.fetch = async () => response({ profile: { ...sparseProfile(), daysActive: 12 } }); ui.flush(); await ui.settle();
  old.resolve(response({ profile: { ...sparseProfile(), daysActive: 999 } })); await ui.settle();
  const badge = ui.find(node => Array.isArray(node.props?.children) && node.props.children[1] === 'd active');
  assert.equal(badge.props.children[0], 12);
  assert.doesNotMatch(ui.text(), /Showing the last loaded overview|could not be loaded/);
});

test('refresh interrupted by account change never starts a follow-on GET for the previous owner', async () => {
  const ui = await setup(); const pending = deferred(); let oldReads = 0;
  ui.fetch = async (url, options = {}) => options.method === 'POST' ? pending.promise : (oldReads++, response({ profile: sparseProfile() }));
  button(ui, 'Refresh insights').props.onClick(); ui.flush();
  ui.user = { uid: 'bob' }; let newReads = 0;
  ui.fetch = async () => { newReads++; return response({ profile: { ...sparseProfile(), daysActive: 8 } }); };
  ui.flush(); await ui.settle(); assert.equal(newReads, 1);
  pending.resolve(response({ success: true })); await ui.settle();
  assert.equal(oldReads, 0); assert.equal(newReads, 1);
});

test('unmount cancels pending refresh before follow-on GET', async () => {
  const ui = await setup(); const pending = deferred(); const calls = [];
  ui.fetch = async (url, options = {}) => { calls.push(options.method || 'GET'); return options.method === 'POST' ? pending.promise : response({ profile: sparseProfile() }); };
  button(ui, 'Refresh insights').props.onClick(); ui.flush(); ui.unmount();
  pending.resolve(response({ success: true })); for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.deepEqual(calls, ['POST']);
});
