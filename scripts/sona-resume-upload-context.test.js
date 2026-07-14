const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build, buildSync } = require('esbuild');

function loadResumeUploadContext() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-resume-upload-context-'));
  const outfile = path.join(outdir, 'resume-upload-context.cjs');

  buildSync({
    entryPoints: [path.join(__dirname, '..', 'lib', 'sona', 'resume-upload-context.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });

  return require(outfile);
}

async function loadSonaToolsExecutor() {
  const repoRoot = path.join(__dirname, '..');
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-tools-selected-resume-'));
  const outfile = path.join(outdir, 'sona-tools.cjs');
  const stubs = new Map([
    ['@/lib/firebase-admin', `exports.getAdminDb = () => ({ kind: 'test-db' });`],
    ['@/lib/job-search-api', `exports.calculateFitScore = () => 0; exports.extractSkillsFromDescription = () => [];`],
    ['@/lib/job-recommendation-platform', `exports.searchTalentJobSupply = async () => ({ jobs: [], providerStatus: {} });`],
    ['@/lib/portal-scanner', `exports.searchCompanyJobs = async () => [];`],
    ['@/lib/story-bank', `exports.createStoryBankStory = async () => null; exports.listStoryBankStories = async () => [];`],
    ['@/lib/career-twin', `exports.invalidateTwin = async () => {};`],
    ['@/lib/server-resume', `exports.extractResumeSkills = () => []; exports.getLatestResumeForUser = async () => ({ resume: null, source: null, id: null });`],
    ['@/lib/sona/agent-harness', `
      exports.runSonaAgentHarness = async (_db, uid, input) => {
        global.__sonaToolsHarnessCall = { uid, input };
        return {
          success: false,
          runId: 'run-test',
          status: 'blocked',
          goal: { targetRole: 'Security Engineer', location: 'New Jersey', salaryTarget: 0, remotePreference: 'any', keywords: [], confidence: 1 },
          mode: 'scout',
          queuedCount: 0,
          queued: [],
          nextActions: [],
          approvalRequired: [],
          notification: { inApp: false, emailSent: false },
          warnings: [],
        };
      };
    `],
    ['@/lib/sona/guarded-resume-morph', `exports.runGuardedSonaResumeMorph = async () => ({ success: false });`],
  ]);

  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'sona-tools.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'sona-tools-test-stubs',
      setup(build) {
        build.onResolve({ filter: /^@\// }, args => {
          if (stubs.has(args.path)) return { path: args.path, namespace: 'stub' };
          const base = path.join(repoRoot, args.path.slice(2));
          for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
            if (fs.existsSync(candidate)) return { path: candidate };
          }
          return { path: args.path, external: true };
        });
        build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({
          contents: stubs.get(args.path),
          loader: 'js',
        }));
      },
    }],
  });

  return require(outfile);
}

async function loadSonaContextModule() {
  const repoRoot = path.join(__dirname, '..');
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-selected-context-'));
  const outfile = path.join(outdir, 'sona-context.cjs');
  const stubs = new Map([
    ['@/lib/firebase-admin', `exports.getAdminDb = () => ({ kind: 'context-test-db' });`],
    ['@/lib/career-twin', `
      exports.getOrComputeTwin = async () => ({ version: 1, memory: {} });
      exports.getTwinPromptSummary = () => 'Career Twin test context';
    `],
    ['@/lib/server-resume', `
      exports.getVerifiedResumeForUserById = async (_db, uid, resumeId) => {
        global.__sonaSelectedContextCalls.selected += 1;
        return global.__sonaSelectedContextResolver(uid, resumeId);
      };
      exports.getLatestVerifiedResumeForUser = async () => {
        global.__sonaSelectedContextCalls.latest += 1;
        return { resume: { name: 'Wrong fallback resume' }, source: 'resume_versions', id: 'wrong-latest' };
      };
    `],
    ['@/lib/sona/capabilities', `
      exports.SONA_CAPABILITIES = [{
        id: 'jobs.find_rank_prepare', shortTitle: 'Find jobs', title: 'Find jobs', toolName: 'Job Search',
        inputs: [], stages: ['understand'], approval: 'review', createsArtifacts: false, outputs: [],
      }];
    `],
  ]);

  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'sona-context.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'sona-context-test-stubs',
      setup(build) {
        build.onResolve({ filter: /^@\// }, args => {
          if (stubs.has(args.path)) return { path: args.path, namespace: 'stub' };
          const base = path.join(repoRoot, args.path.slice(2));
          for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
            if (fs.existsSync(candidate)) return { path: candidate };
          }
          return { path: args.path, external: true };
        });
        build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({
          contents: stubs.get(args.path),
          loader: 'js',
        }));
      },
    }],
  });

  return require(outfile);
}

const {
  buildResumeContextFromUpload,
  hasResumeContextEvidence,
} = loadResumeUploadContext();

test('hasResumeContextEvidence accepts summary-only resume context', () => {
  assert.equal(hasResumeContextEvidence({ summary: 'Wireless network technician with LTE and 5G troubleshooting experience.' }), true);
  assert.equal(hasResumeContextEvidence({ name: '', experience: [], skills: [], summary: '' }), false);
});

test('buildResumeContextFromUpload preserves extracted text as Sona context', () => {
  const resume = buildResumeContextFromUpload([
    'Alula Gebreegziabher',
    'Cybersecurity Graduate / Wireless Engineer',
    'Experience',
    'Wireless Network Technician at CityNet',
    'Skills: LTE, 5G, NIST, troubleshooting',
  ].join('\n'), 'alula-resume.txt');

  assert.equal(resume.name, 'Alula Gebreegziabher');
  assert.equal(resume.title, 'Cybersecurity Graduate / Wireless Engineer');
  assert.match(resume.summary, /Wireless Network Technician/);
  assert.deepEqual(resume.skills[0].items, ['LTE', '5G', 'NIST', 'troubleshooting']);
});

test('Sona binds uploaded and selected resume ids into the execution harness', () => {
  const repoRoot = path.join(__dirname, '..');
  const page = fs.readFileSync(path.join(repoRoot, 'app', 'suite', 'agent', 'page.tsx'), 'utf8');
  const chatRoute = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'agent', 'chat', 'route.ts'), 'utf8');
  const harness = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'agent-harness.ts'), 'utf8');
  const activationProof = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'activation-proof.ts'), 'utf8');

  assert.match(page, /resumeVersionId:\s*activeResumeId/);
  assert.match(page, /resumeVersionId:\s*saved\.data\.id/);
  assert.match(chatRoute, /resumeVersionId \? \{ resumeVersionId \} : \{\}/);
  assert.match(chatRoute, /activeResumeVersionId = resumeVersionId[\s\S]*?harnessRequest\?\.resumeVersionId/);
  assert.match(chatRoute, /getSonaContext\(uid, \{[\s\S]*?resumeVersionId: activeResumeVersionId/);
  assert.match(chatRoute, /executeTool\(tc\.function\.name, args, uid, \{[\s\S]*?resumeVersionId/);
  assert.match(harness, /getVerifiedResumeForUserById/);
  assert.match(harness, /requestedResumeVersionId/);
  assert.match(activationProof, /getVerifiedResumeForUserById/);
  assert.match(activationProof, /requestedResumeVersionId/);
});

test('the model-triggered career harness receives the active resume id', async () => {
  delete global.__sonaToolsHarnessCall;
  const { executeTool } = await loadSonaToolsExecutor();
  const blocked = JSON.parse(await executeTool(
    'run_career_goal_harness',
    { userRequest: 'Find security roles in New Jersey', mode: 'scout' },
    'user-selected-resume',
    { resumeVersionId: 'resume-version-77', tier: 'pro', email: 'candidate@example.com' },
  ));

  assert.equal(blocked.code, 'PREFLIGHT_REQUIRED');
  assert.equal(blocked.approvalRequired, true);
  assert.equal(global.__sonaToolsHarnessCall, undefined);

  const response = JSON.parse(await executeTool(
    'run_career_goal_harness',
    { userRequest: 'Find security roles in New Jersey', mode: 'scout' },
    'user-selected-resume',
    { resumeVersionId: 'resume-version-77', tier: 'pro', email: 'candidate@example.com', activationConfirmed: true },
  ));

  assert.equal(global.__sonaToolsHarnessCall.uid, 'user-selected-resume');
  assert.equal(global.__sonaToolsHarnessCall.input.resumeVersionId, 'resume-version-77');
  assert.equal(global.__sonaToolsHarnessCall.input.tier, 'pro');
  assert.equal(response.action, 'run_career_goal_harness');
});

test('selected resume context never falls back to the latest resume', async () => {
  global.__sonaSelectedContextCalls = { selected: 0, latest: 0 };
  global.__sonaSelectedContextResolver = async () => ({
    resume: null,
    source: null,
    id: null,
    updatedAt: null,
  });
  const { getSonaContext } = await loadSonaContextModule();

  await assert.rejects(
    () => getSonaContext('user-selected-context', { resumeVersionId: 'deleted-selected-resume' }),
    error => error?.code === 'SELECTED_RESUME_UNAVAILABLE',
  );
  assert.equal(global.__sonaSelectedContextCalls.selected, 1);
  assert.equal(global.__sonaSelectedContextCalls.latest, 0);
});

test('selected resume context reports resolver outages as retryable lookup failures', async () => {
  global.__sonaSelectedContextCalls = { selected: 0, latest: 0 };
  global.__sonaSelectedContextResolver = async () => {
    throw new Error('temporary Firestore outage');
  };
  const { getSonaContext } = await loadSonaContextModule();

  await assert.rejects(
    () => getSonaContext('user-selected-context', { resumeVersionId: 'selected-resume-outage' }),
    error => error?.code === 'RESUME_LOOKUP_UNAVAILABLE',
  );
  assert.equal(global.__sonaSelectedContextCalls.selected, 1);
  assert.equal(global.__sonaSelectedContextCalls.latest, 0);
});
