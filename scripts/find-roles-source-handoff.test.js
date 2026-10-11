const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { buildSync } = require('esbuild');
const test = require('node:test');
const { loadBodies, runtime } = require('./test-ui-hooks.cjs');

const repoRoot = path.join(__dirname, '..');

function loadHandoffPolicy() {
  const result = buildSync({
    stdin: {
      contents: "export { resolveExplicitJobSearchResumeSource } from './lib/job-search-resume-source';",
      resolveDir: repoRoot,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
  });
  const module = { exports: {} };
  new Function('module', 'exports', result.outputFiles[0].text)(module, module.exports);
  return module.exports.resolveExplicitJobSearchResumeSource;
}

const resolveExplicitSource = loadHandoffPolicy();

function resume(id, overrides = {}) {
  return {
    id,
    version_name: id,
    content: {},
    mode: 'technical',
    is_active: true,
    created_at: '2026-10-10T00:00:00.000Z',
    updated_at: '2026-10-10T00:00:00.000Z',
    metadata: {},
    ...overrides,
  };
}

test('Find roles honors an explicit source ID exactly and returns no fallback for unavailable or generated IDs', () => {
  const requested = resume('source_requested');
  const savedDefault = resume('saved-default');
  const generated = resume('generated', { guardrail_report: { version: 1 } });
  const records = [savedDefault, generated, requested];

  assert.equal(resolveExplicitSource(records, requested.id), requested);
  assert.equal(resolveExplicitSource(records, 'source_foreign_or_missing'), null);
  assert.equal(resolveExplicitSource(records, generated.id), null);
  assert.equal(resolveExplicitSource(records, ''), null);
});

test('workspace does not select a same-ID local resume when the authoritative source read fails', async () => {
  const sourceText = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/page.tsx'), 'utf8');
  const importedNames = new Set();
  for (const match of sourceText.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"];?$/gm)) {
    const clause = match[1].trim();
    const defaultName = clause.match(/^[A-Za-z_$][\w$]*/)?.[0];
    if (defaultName && defaultName !== 'type') importedNames.add(defaultName);
    for (const named of clause.matchAll(/\b(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:as\s+[A-Za-z_$][\w$]*)?/g)) {
      if (named[1] !== 'type') importedNames.add(named[1]);
    }
  }
  for (const name of importedNames) globalThis[name] = name;
  globalThis.motion = new Proxy({}, { get: (_target, name) => name });
  globalThis.useSearchParams = () => ({ has: key => key === 'source', get: key => key === 'source' ? 'source_same_id' : null, entries: () => [['source', 'source_same_id']] });
  globalThis.usePathname = () => '/suite/job-search';
  const navigations = [];
  globalThis.useRouter = () => ({ replace: (...args) => navigations.push(args) });
  globalThis.useAuthGate = () => ({ setAuthModal() {}, renderAuthModal: () => null });
  globalThis.getResumeVersions = async () => ({ success: true, data: [{
    id: 'source_same_id', user_id: 'alice', version_name: 'Local same-ID record', content: { skills: ['TypeScript'] },
    mode: 'technical', is_active: true, created_at: '2026-10-10T00:00:00.000Z', updated_at: '2026-10-10T00:00:00.000Z',
    status: 'confirmed', metadata: {},
  }] });
  globalThis.listDemoSearchSources = async () => [];
  const sourceReads = [];
  globalThis.readResumeSearchSource = async input => {
    sourceReads.push(input);
    throw Object.assign(new Error('Source not found'), { status: 404 });
  };
  globalThis.isEligibleJobSearchResume = resume => resume?.status === 'confirmed';
  globalThis.chooseJobSearchResumeSource = resumes => ({ resume: resumes[0] || null, recoveredFromId: false });
  globalThis.resolveExplicitJobSearchResumeSource = resumes => resumes[0] || null;
  globalThis.jobSearchSourceKey = resume => resume?.id || null;
  globalThis.jobSearchContentKey = value => String(value || '');
  globalThis.jobSearchInputsChanged = () => false;
  globalThis.useToolGuidance = () => {};
  globalThis.isGuidanceShortcutBlocked = () => false;
  globalThis.normalizeAlertTargetRole = value => value || '';
  globalThis.SONA_ALERT_TARGET_ROLE_KEY = 'target-role';
  globalThis.getUserProfile = async () => ({ data: null });
  globalThis.resumeVersionToApplicationKitContext = resume => ({ resumeVersionId: resume.id, resumeSnapshot: resume.content });
  globalThis.mergeApplicationKitContext = () => {};
  globalThis.getJobResultIdentity = job => job.identityKey || job.id;
  globalThis.classifyJobDiscoveryFailure = () => ({ action: 'retry', title: 'Retry', message: 'Retry search' });
  globalThis.classifyJobDiscoveryResponse = globalThis.classifyJobDiscoveryFailure;
  globalThis.classifyJobPacketFailure = () => ({ title: 'Interrupted', message: 'Interrupted' });
  globalThis.readPreparedPacketResponse = value => value;
  globalThis.packetIncompleteRecovery = () => null;
  globalThis.readJobPacketRecovery = () => null;
  globalThis.extractResumeSkills = () => [];
  globalThis.updateApplicationStatus = async () => ({ success: true });
  const page = await loadBodies('app/suite/job-search/page.tsx', 'export { JobSearchWorkspace };');
  const ui = runtime(page.JobSearchWorkspace);
  globalThis.sessionStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
  const networkCalls = [];
  ui.fetch = async (url, options = {}) => {
    networkCalls.push({ url: String(url), options });
    return { ok: true, status: 200, json: async () => ({ success: true, jobs: [] }) };
  };
  ui.user = { uid: 'alice', accessToken: 'token' };
  ui.flush();
  try {
    await ui.settle();
    const command = ui.find(node => node.type?.name === 'JobSearchCommandStrip');
    assert.equal(command.props.selectedResumeId, null, 'the failed GET must not fall back to the local same-ID record');
    assert.match(ui.text(), /requested résumé source could not be verified/i);
    assert.equal(networkCalls.some(call => /\/api\/(jobs\/search|agent\/apply-pipeline)/.test(call.url)), false, 'mounting the handoff does not start a search or packet request');
    const retry = ui.find(node => node.type === 'button' && node.props.children === 'Retry requested source');
    retry.props.onClick();
    ui.flush();
    await ui.settle();
    assert.ok(sourceReads.length >= 2, 'Retry repeats the authoritative source read');
    assert.ok(sourceReads.every(input => input.ownerId === 'alice' && input.id === 'source_same_id'));
    assert.deepEqual(navigations, [], 'a failed read keeps the exact source URL in place');
  } finally {
    ui.unmount();
  }
});

test('exact source handoff survives unavailable resume-cache storage without replacing the URL or starting search or packet work', async () => {
  const sourceText = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/page.tsx'), 'utf8');
  const importedNames = new Set();
  for (const match of sourceText.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"];?$/gm)) {
    const clause = match[1].trim();
    const defaultName = clause.match(/^[A-Za-z_$][\w$]*/)?.[0];
    if (defaultName && defaultName !== 'type') importedNames.add(defaultName);
    for (const named of clause.matchAll(/\b(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:as\s+[A-Za-z_$][\w$]*)?/g)) {
      if (named[1] !== 'type') importedNames.add(named[1]);
    }
  }
  for (const name of importedNames) globalThis[name] = name;
  globalThis.motion = new Proxy({}, { get: (_target, name) => name });
  const originalSearch = '?source=source_exact&q=observability';
  globalThis.useSearchParams = () => ({
    has: key => key === 'source', get: key => key === 'source' ? 'source_exact' : key === 'q' ? 'observability' : null,
    entries: () => [['source', 'source_exact'], ['q', 'observability']],
  });
  globalThis.usePathname = () => '/suite/job-search';
  const navigations = [];
  globalThis.useRouter = () => ({ replace: (...args) => navigations.push(args) });
  globalThis.useAuthGate = () => ({ setAuthModal() {}, renderAuthModal: () => null });
  globalThis.getResumeVersions = async () => ({ success: true, data: [] });
  globalThis.listDemoSearchSources = async () => [];
  const sourceReads = [];
  globalThis.readResumeSearchSource = async input => {
    sourceReads.push(input);
    return {
      source: {
        id: 'source_exact', user_id: 'alice', version_name: 'Confirmed source', content: { name: 'Amina Rivera', skills: ['TypeScript'] },
        metadata: { workspace: { kind: 'source', sourceConfirmedAt: '2026-10-10T12:00:00.000Z' } },
      },
      receipt: { sourceId: 'source_exact' },
    };
  };
  globalThis.isEligibleJobSearchResume = () => true;
  globalThis.chooseJobSearchResumeSource = resumes => ({ resume: resumes[0] || null, recoveredFromId: false });
  globalThis.resolveExplicitJobSearchResumeSource = resumes => resumes[0] || null;
  globalThis.jobSearchSourceKey = resume => resume?.id || null;
  globalThis.jobSearchContentKey = value => String(value || '');
  globalThis.jobSearchInputsChanged = () => false;
  globalThis.useToolGuidance = () => {};
  globalThis.isGuidanceShortcutBlocked = () => false;
  globalThis.normalizeAlertTargetRole = value => value || '';
  globalThis.SONA_ALERT_TARGET_ROLE_KEY = 'target-role';
  globalThis.getUserProfile = async () => ({ data: null });
  globalThis.resumeVersionToApplicationKitContext = resume => ({ resumeVersionId: resume.id, resumeSnapshot: resume.content });
  const contexts = [];
  globalThis.mergeApplicationKitContext = context => contexts.push(context);
  globalThis.getJobResultIdentity = job => job.identityKey || job.id;
  globalThis.classifyJobDiscoveryFailure = () => ({ action: 'retry', title: 'Retry', message: 'Retry search' });
  globalThis.classifyJobDiscoveryResponse = globalThis.classifyJobDiscoveryFailure;
  globalThis.classifyJobPacketFailure = () => ({ title: 'Interrupted', message: 'Interrupted' });
  globalThis.readPreparedPacketResponse = value => value;
  globalThis.packetIncompleteRecovery = () => null;
  globalThis.readJobPacketRecovery = () => null;
  globalThis.extractResumeSkills = content => content.skills || [];
  globalThis.resumeSnapshotToText = content => JSON.stringify(content || {});
  globalThis.updateApplicationStatus = async () => ({ success: true });

  const page = await loadBodies('app/suite/job-search/page.tsx', 'export { JobSearchWorkspace };');
  const ui = runtime(page.JobSearchWorkspace);
  globalThis.window.location.search = originalSearch;
  const storage = globalThis.localStorage;
  const attemptedWrites = [];
  globalThis.localStorage = {
    getItem() { throw new Error('storage read denied'); },
    setItem(key, value) {
      attemptedWrites.push(key);
      throw new Error('storage write denied');
    },
    removeItem(key) { ui.storage.delete(key); },
  };
  globalThis.sessionStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
  const networkCalls = [];
  ui.fetch = async (url, options = {}) => {
    networkCalls.push({ url: String(url), options });
    return { ok: true, status: 200, json: async () => ({ success: true, jobs: [] }) };
  };
  ui.user = { uid: 'alice', accessToken: 'token' };
  ui.flush();
  try {
    await ui.settle();
    const command = ui.find(node => node.type?.name === 'JobSearchCommandStrip');
    assert.equal(command.props.selectedResumeId, 'source_exact', ui.text());
    assert.equal(sourceReads.length, 1);
    assert.equal(sourceReads[0].ownerId, 'alice');
    assert.equal(sourceReads[0].id, 'source_exact');
    assert.deepEqual(navigations, [], 'an exact successful source handoff preserves the requested URL');
    assert.equal(globalThis.window.location.search, originalSearch);
    assert.ok(attemptedWrites.some(key => key.includes('talent-job-search-prefs')), 'search preferences still attempt best-effort persistence');
    assert.ok(attemptedWrites.some(key => /talent-job-search-(?:resume-id|skills)/.test(key)), 'resume caches are attempted but optional');
    assert.equal(networkCalls.some(call => /\/api\/(?:jobs\/search|agent\/apply-pipeline)/.test(call.url)), false,
      'storage failure does not auto-search or start packet preparation');
    assert.ok(contexts.some(context => context.resumeVersionId === 'source_exact'));
    assert.equal(globalThis.useSearchParams().get('q'), 'observability');
  } finally {
    ui.unmount();
    globalThis.localStorage = storage;
  }
});
