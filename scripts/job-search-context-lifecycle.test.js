const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { build } = require('esbuild');
const { loadBodies, runtime } = require('./test-ui-hooks.cjs');

const page = loadBodies('app/suite/job-search/page.tsx', 'export { JobSearchWorkspace, readStoredPackets };');
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const response = (body, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body });
const identity = job => job.identityKey || job.id;

async function loadSearchContextHelpers() {
  const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'job-search-context-')), 'context.cjs');
  await build({ entryPoints: ['lib/job-search-context.ts'], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  return require(outfile);
}

function makeResume(id, skills) {
  return {
    id,
    version_name: `Resume ${id}`,
    mode: 'technical',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: `2026-10-0${id === 'A' ? '1' : '2'}T00:00:00.000Z`,
    content: { skills },
    status: 'confirmed',
  };
}

function makeJob(id, title = `Role ${id}`, description = 'Verified job description') {
  return {
    id, identityKey: id, title, company: 'Example Co', location: 'Remote',
    salary: { min: null, max: null, currency: 'USD' }, description,
    skills: [], url: `https://jobs.example/${id}`, postedDate: '2026-10-01',
    employmentType: 'Full time', source: 'Greenhouse', matchScore: 82,
    fitScore: { overall: 82, skills: null, titleSeniority: null, domain: null, location: null, salary: null, freshness: null, resumeCoverage: null, risk: null, preference: null },
    freshness: { isFresh: true, ghostRisk: 'low', reasons: [] },
    recommendationReason: 'Current evidence', preparationEligible: true, outboundLinkVerified: true,
  };
}

async function loadPacketRecovery() {
  const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'job-packet-recovery-')), 'recovery.cjs');
  await build({ entryPoints: ['lib/job-packet-recovery.ts'], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  return require(outfile);
}

async function setup({ resumes = [makeResume('A', ['TypeScript']), makeResume('B', [])], resumeResults, searches, user = { uid: 'alice', accessToken: 'token-a' }, profileResult, preferencesResult, initialDraft } = {}) {
  const contexts = await loadSearchContextHelpers();
  const recovery = await loadPacketRecovery();
  Object.assign(globalThis, contexts, recovery);
  const resumeQueue = resumeResults || [{ success: true, data: resumes }];
  let resumeCalls = 0;
  const requests = [];
  const pipelineResults = [];
  const preparedWrites = [];
  const mergeCalls = [];
  globalThis.useSearchParams = () => ({ get: () => null, entries: () => [] });
  globalThis.useAuthGate = () => ({ setAuthModal() {}, renderAuthModal: () => null });
  globalThis.getResumeVersions = async () => {
    const result = resumeQueue[Math.min(resumeCalls++, resumeQueue.length - 1)];
    if (result instanceof Error) throw result;
    if (result && typeof result.then === 'function') return result;
    return result;
  };
  globalThis.getUserProfile = async () => profileResult || ({ data: null });
  globalThis.updateApplicationStatus = async () => ({ success: true });
  globalThis.resumeSnapshotToText = resume => (resume?.skills || []).join(' ');
  globalThis.resumeVersionToApplicationKitContext = resume => ({
    resumeVersionId: resume.id, resumeVersionName: resume.version_name,
    resumeSnapshot: resume.content, resumeText: globalThis.resumeSnapshotToText(resume.content), resumeSource: 'library',
  });
  globalThis.mergeApplicationKitContext = value => mergeCalls.push(value);
  globalThis.chooseJobSearchResumeSource = items => ({ resume: items[0] || null, recoveredFromId: false });
  globalThis.isEligibleJobSearchResume = resume => resume?.status === 'confirmed';
  globalThis.getJobResultIdentity = identity;
  globalThis.classifyJobDiscoveryResponse = data => data?.recovery || ({ action: 'retry', title: 'Retry', message: 'Try again' });
  globalThis.classifyJobDiscoveryFailure = () => ({ action: 'retry', title: 'Retry', message: 'Try again' });
  globalThis.readPreparedPacketResponse = recovery.readPreparedPacketResponse;
  globalThis.classifyJobPacketFailure = () => ({ title: 'Could not prepare', message: 'Could not prepare this packet.' });
  globalThis.packetIncompleteRecovery = () => ({ title: 'Incomplete', message: 'Packet incomplete.' });
  globalThis.readJobPacketRecovery = () => null;
  const mockFetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).startsWith('/api/jobs/preferences')) return preferencesResult || response({ success: false, isNew: true });
    if (String(url).startsWith('/api/jobs/search')) {
      const call = searches?.shift();
      if (call) return typeof call === 'function' ? call(url, options) : call;
      const scoreResumeId = options.headers?.['x-talent-resume-id'] || 'A';
      return response({ success: true, query: new URLSearchParams(String(url).split('?')[1]).get('query'), location: '', scoreResumeId, jobs: [makeJob('job-a'), makeJob('job-b')] });
    }
    if (String(url) === '/api/jobs/ledger') return response({ success: true });
    if (String(url) === '/api/agent/apply-pipeline') {
      const result = pipelineResults.shift();
      return result || response({ success: true, packetStatus: 'ready_for_review', applicationId: 'app-1', morphedVersionId: 'resume-morphed', coverLetter: 'Draft', atsResult: { overallScore: 84 } });
    }
    return response({ success: true });
  };
  const session = new Map();
  globalThis.sessionStorage = {
    getItem: key => session.get(key) ?? null,
    setItem: (key, value) => session.set(key, String(value)),
    removeItem: key => session.delete(key),
  };
  const ui = runtime((await page).JobSearchWorkspace);
  globalThis.window.dispatchEvent = () => true;
  globalThis.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  ui.fetch = mockFetch;
  ui.user = user;
  if (initialDraft && user?.uid) ui.storage.set(`talent-job-search-prefs:${user.uid}`, JSON.stringify(initialDraft));
  ui.flush();
  await ui.settle();
  return { ui, requests, pipelineResults, preparedWrites, mergeCalls, workspace: (await page).JobSearchWorkspace, readStoredPackets: (await page).readStoredPackets };
}

const command = ui => ui.find(node => node.type?.name === 'JobSearchCommandStrip');
const feed = ui => ui.find(node => node.type?.name === 'OpportunityFeed');

test('selecting another role clears its predecessor application and Oracle draft; revisiting a prepared role rebinds its own packet', async () => {
  const { ui, mergeCalls } = await setup();
  try {
    await search(ui);
    const [jobA, jobB] = feed(ui).props.jobs;
    await feed(ui).props.onPrepare(jobA);
    await ui.settle();
    const prepared = mergeCalls.at(-1);
    assert.equal(prepared.applicationId, 'app-1');

    feed(ui).props.onSelect(jobB);
    ui.flush();
    const selection = mergeCalls.at(-1);
    const draft = { ...prepared, oracleDraft: { company: jobA.company, targetRole: jobA.title }, ...selection };
    assert.equal(draft.applicationId, null, 'role B must not be scoped to role A’s application');
    assert.equal(draft.oracleDraft, undefined, 'role A’s analysis inputs must not override role B');
    assert.equal(draft.jobTitle, jobB.title);
    assert.equal(draft.jobDescription, jobB.description);

    feed(ui).props.onSelect(jobA);
    ui.flush();
    assert.equal(mergeCalls.at(-1).applicationId, 'app-1', 'reopening A uses its real source-scoped prepared packet');
    feed(ui).props.onSelect(jobA);
    ui.flush();
    assert.equal(Object.hasOwn(mergeCalls.at(-1), 'oracleDraft'), false, 'reselecting the same unchanged role keeps its analysis inputs');
  } finally { ui.unmount(); }
});

test('browsing without a selected resume does not carry an earlier workspace source into role analysis', async () => {
  const { ui, mergeCalls } = await setup({ resumes: [] });
  try {
    await search(ui);
    const selection = mergeCalls.at(-1);
    const retained = { resumeVersionId: 'old-source', resumeSnapshot: { name: 'Old draft' }, resumeText: 'Old draft', ...selection };
    assert.equal(retained.resumeVersionId, null);
    assert.equal(retained.resumeSnapshot, null);
    assert.equal(retained.resumeText, '');
  } finally { ui.unmount(); }
});

test('automatic selection reconnects a prepared packet when its role returns in a later search', async () => {
  const jobA = makeJob('job-a');
  const jobB = makeJob('job-b');
  const { ui, mergeCalls } = await setup({ searches: [
    response({ success: true, scoreResumeId: 'A', jobs: [jobB] }),
    response({ success: true, scoreResumeId: 'A', jobs: [jobA] }),
    response({ success: true, scoreResumeId: 'A', jobs: [jobB] }),
  ] });
  try {
    await search(ui);
    await feed(ui).props.onPrepare(jobB);
    await ui.settle();
    await search(ui);
    assert.equal(mergeCalls.at(-1).applicationId, null);
    await search(ui);
    assert.equal(feed(ui).props.packets[identity(jobB)]?.status, 'ready');
    assert.equal(mergeCalls.at(-1).applicationId, 'app-1', 'automatic selection uses the matching packet even when B was absent from the previous results');
  } finally { ui.unmount(); }
});

test('preparing a packet keeps its confirmed factual resume as the source for subsequent role analysis', async () => {
  const source = makeResume('A', ['TypeScript']);
  const { ui, mergeCalls, pipelineResults } = await setup({ resumes: [source] });
  try {
    await search(ui);
    const job = feed(ui).props.jobs[0];
    pipelineResults.push(response({
      success: true, packetStatus: 'ready_for_review', applicationId: 'app-1', morphedVersionId: 'resume-morphed',
      morphedResume: { skills: ['Generated wording'] }, coverLetter: 'Draft', atsResult: { overallScore: 84 },
    }));
    await feed(ui).props.onPrepare(job);
    await ui.settle();
    const completion = mergeCalls.at(-1);
    assert.equal(completion.applicationId, 'app-1');
    assert.equal(completion.resumeVersionId, source.id, 'analysis must not receive a generated version that source verification rejects');
    assert.deepEqual(completion.resumeSnapshot, source.content);
    assert.equal(completion.resumeText, 'TypeScript');
    assert.equal(completion.targetRole, job.title);
    assert.equal(feed(ui).props.packets[identity(job)]?.morphedVersionId, 'resume-morphed', 'the prepared document remains available on its own packet');
    assert.equal(feed(ui).props.packets[identity(job)]?.atsScore, 84);
    assert.equal(completion.atsResult, undefined, 'the generated document’s score must not become a check of the factual source');
    assert.equal(completion.coverLetterResult.data.coverLetter, 'Draft');
  } finally { ui.unmount(); }
});

test('a pending search cannot detach the application of a packet that finishes before its results arrive', async () => {
  const job = makeJob('job-a');
  const searchPending = deferred();
  const packetPending = deferred();
  const { ui, mergeCalls, pipelineResults } = await setup({ searches: [
    response({ success: true, scoreResumeId: 'A', jobs: [job] }),
    searchPending.promise,
  ] });
  try {
    await search(ui);
    pipelineResults.push(packetPending.promise);
    const preparation = feed(ui).props.onPrepare(job);
    await ui.settle();
    assert.equal(feed(ui).props.packets[identity(job)]?.status, 'preparing');
    const searching = command(ui).props.onSearch();
    await ui.settle();
    packetPending.resolve(response({ success: true, packetStatus: 'ready_for_review', applicationId: 'app-1', morphedVersionId: 'resume-morphed', coverLetter: 'Draft', atsResult: { overallScore: 84 } }));
    await preparation;
    await ui.settle();
    assert.equal(mergeCalls.at(-1).applicationId, 'app-1');
    searchPending.resolve(response({ success: true, scoreResumeId: 'A', jobs: [job] }));
    await searching;
    await ui.settle();
    assert.equal(feed(ui).props.packets[identity(job)]?.status, 'ready');
    assert.equal(mergeCalls.at(-1).applicationId, 'app-1');
  } finally { ui.unmount(); }
});

async function search(ui, query = 'Engineer', location = 'Remote') {
  const strip = command(ui);
  strip.props.onQueryChange(query);
  strip.props.onLocationChange(location);
  ui.flush();
  await command(ui).props.onSearch();
  await ui.settle();
  assert.ok(command(ui).props.resultContext, `search did not set a result snapshot: ${ui.text().slice(0, 500)}`);
}

async function selectResume(ui, id) {
  command(ui).props.onResumeSelect(id);
  ui.flush();
  await ui.settle();
}

test('deferred A preparation is invalidated by selecting B; packet cache stays source-scoped', async () => {
  const { ui, pipelineResults } = await setup();
  try {
    await search(ui);
    const [jobA, jobB] = feed(ui).props.jobs;
    await feed(ui).props.onPrepare(jobA);
    await ui.settle();
    assert.equal(feed(ui).props.packets[identity(jobA)]?.status, 'ready', `first A packet did not become ready: ${JSON.stringify(feed(ui).props.packets)}`);

    const pending = deferred();
    pipelineResults.push(pending.promise);
    const preparation = feed(ui).props.onPrepare(jobB);
    ui.flush();
    await Promise.resolve();
    await Promise.resolve();
    ui.flush();
    assert.equal(feed(ui).props.packets[identity(jobB)]?.status, 'preparing');

    await selectResume(ui, 'B');
    assert.deepEqual(feed(ui).props.packets, {}, 'A packets are hidden while B is selected');
    pending.resolve(response({ success: true, packetStatus: 'ready_for_review', applicationId: 'stale-app', morphedVersionId: 'stale-resume', coverLetter: 'Stale draft', atsResult: { overallScore: 90 } }));
    await preparation;
    await ui.settle();
    assert.deepEqual(feed(ui).props.packets, {}, 'late A completion cannot populate B cache view');

    await search(ui, 'Engineer', 'Remote');
    assert.deepEqual(feed(ui).props.packets, {}, 'A cache remains hidden after B results load');
    await selectResume(ui, 'A');
    await search(ui, 'Engineer', 'Remote');
    const restored = feed(ui).props.packets;
    assert.equal(restored[identity(jobA)]?.status, 'ready', `previous completed A packet returns: ${JSON.stringify(restored)}`);
    assert.equal(restored[identity(jobB)]?.status, 'failed', 'interrupted A packet has an honest retry state');
  } finally { ui.unmount(); }
});

test('switching to a source with no skills clears the prior resume skill evidence', async () => {
  const { ui } = await setup();
  try {
    assert.equal(command(ui).props.userSkillsCount, 1);
    await selectResume(ui, 'B');
    assert.equal(command(ui).props.userSkillsCount, 0);
  } finally { ui.unmount(); }
});

test('resume source failure clears cached source evidence and retry restores the resume list', async () => {
  const retry = deferred();
  const { ui } = await setup({ resumeResults: [new Error('resume list unavailable'), retry.promise] });
  try {
    assert.equal(command(ui).props.resumes.length, 0);
    assert.match(ui.text(), /could not be loaded/);
    const button = ui.find(node => node.type === 'button' && JSON.stringify(node.props.children).includes('Retry resume load'));
    button.props.onClick();
    ui.flush();
    retry.resolve({ success: true, data: [makeResume('B', ['Python'])] });
    await ui.settle();
    assert.deepEqual(command(ui).props.resumes.map(resume => resume.id), ['B']);
    assert.equal(command(ui).props.userSkillsCount, 1);
  } finally { ui.unmount(); }
});

test('a failed source reload makes interrupted preparation retryable after the same source is restored', async () => {
  const source = makeResume('A', ['TypeScript']);
  const pending = deferred();
  const { ui, pipelineResults, requests } = await setup({ resumeResults: [
    { success: true, data: [source] }, new Error('resume reload unavailable'), { success: true, data: [source] },
  ] });
  try {
    await search(ui);
    const job = feed(ui).props.jobs[0];
    pipelineResults.push(pending.promise);
    const interrupted = feed(ui).props.onPrepare(job);
    await ui.settle();
    assert.equal(feed(ui).props.packets[identity(job)]?.status, 'preparing');
    ui.user = { uid: 'alice', accessToken: 'refreshed-token' };
    ui.flush();
    await ui.settle();
    assert.equal(command(ui).props.resumes.length, 0);
    const retry = ui.find(node => node.type === 'button' && JSON.stringify(node.props.children).includes('Retry resume load'));
    retry.props.onClick();
    await ui.settle();
    await search(ui);
    assert.equal(feed(ui).props.packets[identity(job)]?.status, 'failed', 'cancelled work must stop claiming to be preparing');
    await feed(ui).props.onPrepare(job);
    await ui.settle();
    assert.equal(requests.filter(request => request.url === '/api/agent/apply-pipeline').length, 2);
    assert.equal(feed(ui).props.packets[identity(job)]?.status, 'ready');
    pending.resolve(response({ success: true, packetStatus: 'ready_for_review', applicationId: 'old-app', morphedVersionId: 'old-version', coverLetter: 'Old draft', atsResult: { overallScore: 84 } }));
    await interrupted;
    await ui.settle();
    assert.equal(feed(ui).props.packets[identity(job)]?.applicationId, 'app-1', 'a cancelled request cannot overwrite the retried packet');
  } finally { ui.unmount(); }
});

test('editing the query leaves result context attached to the actual search snapshot', async () => {
  const { ui } = await setup();
  try {
    await search(ui, 'Engineer', 'Remote');
    const strip = command(ui);
    assert.equal(strip.props.resultContext.query, 'Engineer');
    strip.props.onQueryChange('Designer');
    ui.flush();
    assert.equal(command(ui).props.resultContext.query, 'Engineer');
    assert.equal(command(ui).props.inputsChanged, true);
  } finally { ui.unmount(); }
});

test('failed new search preserves prior result snapshot and does not relabel it with edited inputs', async () => {
  const { ui } = await setup({ searches: [
    response({ success: true, query: 'Engineer', location: 'Remote', scoreResumeId: 'A', jobs: [makeJob('job-a')] }),
    response({ success: false, error: 'temporary failure' }, false),
  ] });
  try {
    await search(ui, 'Engineer', 'Remote');
    const prior = command(ui).props.resultContext;
    await search(ui, 'Designer', 'New York');
    const strip = command(ui);
    assert.deepEqual(strip.props.resultContext, prior);
    assert.equal(strip.props.resultContext.query, 'Engineer');
    assert.equal(strip.props.resultContext.location, 'Remote');
    assert.equal(strip.props.inputsChanged, true);
  } finally { ui.unmount(); }
});

test('initial preference hydration is passive and does not issue a job search', async () => {
  const { ui, requests } = await setup();
  try {
    const header = ui.find(node => node.type?.name === 'OpportunityIntelligenceBar');
    header.props.onPrefsToggle();
    ui.flush();
    header.props.onPrefsLoaded({ targetRoles: ['Data Analyst'], preferredCities: ['Boston'], salaryMin: 90000 });
    ui.flush();
    assert.equal(requests.filter(request => request.url.startsWith('/api/jobs/search')).length, 0);
  } finally { ui.unmount(); }
});

test('ready packet cache is invalidated when the same role identity receives changed job-description text', async () => {
  const { ui } = await setup({ searches: [
    response({ success: true, query: 'Engineer', location: 'Remote', scoreResumeId: 'A', jobs: [makeJob('job-a')] }),
    response({ success: true, query: 'Engineer', location: 'Remote', scoreResumeId: 'A', jobs: [makeJob('job-a', 'Role job-a', 'Updated verified job description')] }),
  ] });
  try {
    await search(ui);
    const job = feed(ui).props.jobs[0];
    await feed(ui).props.onPrepare(job);
    await ui.settle();
    assert.equal(feed(ui).props.packets[identity(job)]?.status, 'ready');
    await search(ui);
    assert.equal(feed(ui).props.jobs[0].id, job.id);
    assert.deepEqual(feed(ui).props.packets, {}, 'old packet no longer matches the changed job description');
  } finally { ui.unmount(); }
});

test('same resume id with changed content cannot reuse the previous source packet cache', async () => {
  const { ui } = await setup({ resumeResults: [
    { success: true, data: [makeResume('A', ['TypeScript'])] },
    { success: true, data: [makeResume('A', ['Python'])] },
  ] });
  try {
    await search(ui);
    const job = feed(ui).props.jobs[0];
    await feed(ui).props.onPrepare(job);
    await ui.settle();
    assert.equal(feed(ui).props.packets[identity(job)]?.status, 'ready');

    ui.user = { uid: 'alice', accessToken: 'token-refreshed' };
    ui.flush();
    await ui.settle();
    assert.equal(command(ui).props.selectedResumeId, 'A');
    await search(ui);
    assert.deepEqual(feed(ui).props.packets, {}, 'content-derived source key changed despite the stable resume id');
  } finally { ui.unmount(); }
});

test('stored packet readiness keeps score 100 and downgrades out-of-range scores', async () => {
  const { readStoredPackets } = await setup();
  const packet = atsScore => ({
    status: 'ready', stageIndex: 6, applicationId: 'application-1', morphedVersionId: 'resume-1',
    coverLetter: 'Reviewable cover letter', atsScore, sourceKey: 'source-a', jobDescriptionKey: 'job-description-a',
  });
  const restored = readStoredPackets({ at100: packet(100), below: packet(-1), above: packet(101) });
  assert.equal(restored.at100.status, 'ready');
  assert.equal(restored.at100.atsScore, 100);
  assert.equal(restored.below.status, 'needs_attention');
  assert.equal(restored.below.atsScore, undefined);
  assert.equal(restored.above.status, 'needs_attention');
  assert.equal(restored.above.atsScore, undefined);
});

test('guest auth retry waits for resume readiness and preserves the requested target', async () => {
  const resumePending = deferred();
  const { ui, requests } = await setup({
    user: null,
    resumeResults: [resumePending.promise],
    searches: [
      response({ success: false, recovery: { action: 'sign_in', title: 'Sign in', message: 'Sign in to search.' } }, false),
      response({ success: true, query: 'Staff Engineer', location: 'Remote', scoreResumeId: 'A', jobs: [] }),
    ],
  });
  try {
    const strip = command(ui);
    strip.props.onQueryChange('Staff Engineer');
    strip.props.onLocationChange('Remote');
    ui.flush();
    await command(ui).props.onSearch();
    await ui.settle();
    assert.equal(requests.filter(request => request.url.startsWith('/api/jobs/search')).length, 1);
    await feed(ui).props.onRecoveryAction();

    ui.user = { uid: 'alice', accessToken: 'token-a' };
    ui.flush();
    await ui.settle();
    assert.equal(requests.filter(request => request.url.startsWith('/api/jobs/search')).length, 1, 'search waits while the resume source is loading');

    resumePending.resolve({ success: true, data: [makeResume('A', ['TypeScript'])] });
    await ui.settle();
    const searchesMade = requests.filter(request => request.url.startsWith('/api/jobs/search'));
    assert.equal(searchesMade.length, 2);
    assert.equal(new URLSearchParams(searchesMade[1].url.split('?')[1]).get('query'), 'Staff Engineer');
  } finally { ui.unmount(); }
});

test('pending auth retry owned by account A is discarded after switching to account B', async () => {
  const resumeForB = deferred();
  const { ui, requests } = await setup({
    resumeResults: [
      { success: true, data: [makeResume('A', ['TypeScript'])] },
      resumeForB.promise,
    ],
    searches: [response({ success: false, recovery: { action: 'sign_in', title: 'Sign in', message: 'Sign in to search.' } }, false)],
  });
  try {
    const strip = command(ui);
    strip.props.onQueryChange('Account A Target');
    ui.flush();
    await command(ui).props.onSearch();
    await ui.settle();
    await feed(ui).props.onRecoveryAction();

    ui.user = { uid: 'bob', accessToken: 'token-b' };
    ui.flush();
    await ui.settle();
    resumeForB.resolve({ success: true, data: [makeResume('B', ['Python'])] });
    await ui.settle();
    assert.equal(requests.filter(request => request.url.startsWith('/api/jobs/search')).length, 1, 'account B never receives A pending intent');
  } finally { ui.unmount(); }
});

test('late A packet completion cannot replace shared application context after selecting B', async () => {
  const { ui, pipelineResults, mergeCalls } = await setup();
  try {
    await search(ui);
    const jobA = feed(ui).props.jobs[0];
    const pending = deferred();
    pipelineResults.push(pending.promise);
    const preparation = feed(ui).props.onPrepare(jobA);
    ui.flush();
    await Promise.resolve();
    await Promise.resolve();

    await selectResume(ui, 'B');
    await search(ui);
    const contextForB = mergeCalls.at(-1);
    assert.equal(contextForB.jobTitle, 'Role job-a');
    const mergeCountForB = mergeCalls.length;

    pending.resolve(response({ success: true, packetStatus: 'ready_for_review', applicationId: 'stale-app', morphedVersionId: 'stale-resume', coverLetter: 'Stale draft', atsResult: { overallScore: 84 } }));
    await preparation;
    await ui.settle();
    assert.equal(mergeCalls.length, mergeCountForB);
    assert.deepEqual(mergeCalls.at(-1), contextForB);
  } finally { ui.unmount(); }
});

test('same-source job B selection keeps shared context when deferred job A packet becomes ready', async () => {
  const { ui, pipelineResults, mergeCalls } = await setup();
  try {
    await search(ui);
    const [jobA, jobB] = feed(ui).props.jobs;
    const pending = deferred();
    pipelineResults.push(pending.promise);
    const preparation = feed(ui).props.onPrepare(jobA);
    ui.flush();
    await Promise.resolve();
    await Promise.resolve();

    feed(ui).props.onSelect(jobB);
    ui.flush();
    const contextForB = mergeCalls.at(-1);
    assert.equal(contextForB.jobTitle, jobB.title);
    const mergeCountForB = mergeCalls.length;

    pending.resolve(response({ success: true, packetStatus: 'ready_for_review', applicationId: 'job-a-app', morphedVersionId: 'job-a-resume', coverLetter: 'Job A draft', atsResult: { overallScore: 84 } }));
    await preparation;
    await ui.settle();

    assert.equal(feed(ui).props.packets[identity(jobA)]?.status, 'ready', 'completed A packet remains available in the current source cache');
    assert.equal(mergeCalls.length, mergeCountForB, 'late A completion does not merge shared application context');
    assert.deepEqual(mergeCalls.at(-1), contextForB);
  } finally { ui.unmount(); }
});

test('late packet completion after a JD refresh stays hidden and does not merge the old JD context', async () => {
  const { ui, pipelineResults, mergeCalls } = await setup({ searches: [
    response({ success: true, query: 'Engineer', location: 'Remote', scoreResumeId: 'A', jobs: [makeJob('job-a')] }),
    response({ success: true, query: 'Engineer', location: 'Remote', scoreResumeId: 'A', jobs: [makeJob('job-a', 'Role job-a', 'Revised verified job description')] }),
  ] });
  try {
    await search(ui);
    const original = feed(ui).props.jobs[0];
    const pending = deferred();
    pipelineResults.push(pending.promise);
    const preparation = feed(ui).props.onPrepare(original);
    ui.flush();
    await Promise.resolve();
    await Promise.resolve();

    await search(ui);
    const currentContext = mergeCalls.at(-1);
    const currentMergeCount = mergeCalls.length;
    assert.equal(currentContext.jobDescription, 'Revised verified job description');

    pending.resolve(response({ success: true, packetStatus: 'ready_for_review', applicationId: 'old-jd-app', morphedVersionId: 'old-jd-resume', coverLetter: 'Old JD draft', atsResult: { overallScore: 100 } }));
    await preparation;
    await ui.settle();
    assert.deepEqual(feed(ui).props.packets, {}, 'packet for the old description is excluded from the current role');
    assert.equal(mergeCalls.length, currentMergeCount);
    assert.deepEqual(mergeCalls.at(-1), currentContext);
  } finally { ui.unmount(); }
});

test('delayed profile and preference defaults cannot overwrite a restored saved search draft', async () => {
  const profile = deferred();
  const preferences = deferred();
  const { ui } = await setup({
    initialDraft: { query: 'Saved Draft Role', location: 'Saved Draft City', salaryMin: 125000, threshold: 65 },
    profileResult: profile.promise,
    preferencesResult: preferences.promise,
  });
  try {
    assert.equal(command(ui).props.query, 'Saved Draft Role');
    assert.equal(command(ui).props.location, 'Saved Draft City');

    profile.resolve({ data: { target_roles: ['Profile Default'], location_preference: 'Profile City' } });
    preferences.resolve(response({ success: true, isNew: false, preferences: { targetRoles: ['Preference Default'], preferredCities: ['Preference City'], salaryMin: 90000 } }));
    await ui.settle();

    assert.equal(command(ui).props.query, 'Saved Draft Role');
    assert.equal(command(ui).props.location, 'Saved Draft City');
    assert.match(ui.storage.get('talent-job-search-prefs:alice'), /125000/);
    assert.doesNotMatch(command(ui).props.query, /Profile Default|Preference Default/);
  } finally { ui.unmount(); }
});

async function startPipeline(ui, job, expectedCalls, requests) {
  const work = feed(ui).props.onPrepare(job);
  ui.flush();
  for (let i = 0; i < 8 && requests.filter(request => request.url === '/api/agent/apply-pipeline').length < expectedCalls; i += 1) {
    await Promise.resolve();
    ui.flush();
  }
  assert.equal(requests.filter(request => request.url === '/api/agent/apply-pipeline').length, expectedCalls, 'expected packet request reached the pipeline');
  return { work };
}

async function setupOverlappingJobDescriptionPrepares() {
  const { ui, requests, pipelineResults } = await setup({ searches: [
    response({ success: true, query: 'Engineer', location: 'Remote', scoreResumeId: 'A', jobs: [makeJob('job-a', 'Role A', 'JD revision one')] }),
    response({ success: true, query: 'Engineer', location: 'Remote', scoreResumeId: 'A', jobs: [makeJob('job-a', 'Role A', 'JD revision two')] }),
  ] });
  const older = deferred();
  const newer = deferred();
  pipelineResults.push(older.promise, newer.promise);
  await search(ui);
  const firstJob = feed(ui).props.jobs[0];
  const { work: oldWork } = await startPipeline(ui, firstJob, 1, requests);
  await search(ui);
  const secondJob = feed(ui).props.jobs[0];
  const { work: newWork } = await startPipeline(ui, secondJob, 2, requests);
  return { ui, requests, older, newer, oldWork, newWork, firstJob, secondJob };
}

test('older JD preparation resolving first cannot fill the newer JD packet slot', async () => {
  const h = await setupOverlappingJobDescriptionPrepares();
  try {
    assert.equal(feed(h.ui).props.packets[identity(h.secondJob)]?.status, 'preparing');
    h.older.resolve(response({ success: true, packetStatus: 'ready_for_review', applicationId: 'revision-one-app', morphedVersionId: 'revision-one-resume', coverLetter: 'Cover letter for revision one', atsResult: { overallScore: 71 } }));
    await h.oldWork;
    await h.ui.settle();
    const whileNewPending = feed(h.ui).props.packets[identity(h.secondJob)];
    assert.equal(whileNewPending?.status, 'preparing');
    assert.equal(whileNewPending?.applicationId, undefined);
    assert.equal(whileNewPending?.coverLetter, undefined);

    h.newer.resolve(response({ success: true, packetStatus: 'ready_for_review', applicationId: 'revision-two-app', morphedVersionId: 'revision-two-resume', coverLetter: 'Cover letter for revision two', atsResult: { overallScore: 92 } }));
    await h.newWork;
    await h.ui.settle();
    const current = feed(h.ui).props.packets[identity(h.secondJob)];
    assert.equal(current?.status, 'ready');
    assert.equal(current?.applicationId, 'revision-two-app');
    assert.equal(current?.coverLetter, 'Cover letter for revision two');
  } finally { h.ui.unmount(); }
});

test('older JD preparation resolving last cannot overwrite the newer ready packet', async () => {
  const h = await setupOverlappingJobDescriptionPrepares();
  try {
    h.newer.resolve(response({ success: true, packetStatus: 'ready_for_review', applicationId: 'revision-two-app', morphedVersionId: 'revision-two-resume', coverLetter: 'Cover letter for revision two', atsResult: { overallScore: 92 } }));
    await h.newWork;
    await h.ui.settle();
    assert.equal(feed(h.ui).props.packets[identity(h.secondJob)]?.applicationId, 'revision-two-app');

    h.older.resolve(response({ success: true, packetStatus: 'ready_for_review', applicationId: 'revision-one-app', morphedVersionId: 'revision-one-resume', coverLetter: 'Cover letter for revision one', atsResult: { overallScore: 71 } }));
    await h.oldWork;
    await h.ui.settle();
    const current = feed(h.ui).props.packets[identity(h.secondJob)];
    assert.equal(current?.status, 'ready');
    assert.equal(current?.applicationId, 'revision-two-app');
    assert.equal(current?.coverLetter, 'Cover letter for revision two');
    assert.equal(current?.atsScore, 92);
  } finally { h.ui.unmount(); }
});

test('older JD success cannot replace a newer JD preparation failure', async () => {
  const h = await setupOverlappingJobDescriptionPrepares();
  try {
    h.newer.resolve(response({ success: false, error: 'Revision two could not be prepared.' }, false));
    await h.newWork;
    await h.ui.settle();
    const failedNewer = feed(h.ui).props.packets[identity(h.secondJob)];
    assert.equal(failedNewer?.status, 'failed');
    assert.equal(failedNewer?.applicationId, undefined);

    h.older.resolve(response({ success: true, packetStatus: 'ready_for_review', applicationId: 'revision-one-app', morphedVersionId: 'revision-one-resume', coverLetter: 'Cover letter for revision one', atsResult: { overallScore: 71 } }));
    await h.oldWork;
    await h.ui.settle();
    const current = feed(h.ui).props.packets[identity(h.secondJob)];
    assert.equal(current?.status, 'failed');
    assert.equal(current?.applicationId, undefined);
    assert.equal(current?.coverLetter, undefined);
  } finally { h.ui.unmount(); }
});
