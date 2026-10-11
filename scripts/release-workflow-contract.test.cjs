'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const yaml = require('js-yaml');

const workflowPath = path.resolve(__dirname, '../.github/workflows/security-cve-audit.yml');
const seoWorkflowPath = path.resolve(__dirname, '../.github/workflows/seo-audit.yml');

function readWorkflow(file) {
  const source = fs.readFileSync(file, 'utf8');
  return yaml.load(source);
}

// The contract governs the dependency-installing audit job. Select it by name:
// a workflow may also carry install-free jobs (e.g. SEO route-policy fixtures),
// and job order in YAML carries no meaning for GitHub Actions.
function auditJobName(workflow) {
  const jobs = workflow.jobs || {};
  if (jobs['seo-audit']) return 'seo-audit';
  if (jobs['security-cve-audit']) return 'security-cve-audit';
  return Object.keys(jobs)[0];
}

function namedStep(workflow, name) {
  const steps = workflow.jobs?.[auditJobName(workflow)]?.steps;
  return Array.isArray(steps) ? steps.find(step => step.name === name) : undefined;
}

function stepIndex(workflow, name, jobName = auditJobName(workflow)) {
  const steps = workflow.jobs[jobName].steps;
  return steps.findIndex(step => step.name === name);
}

function installStepName(workflow) {
  return workflow.jobs['seo-audit'] ? 'Install dependencies' : 'Install reviewed dependencies';
}

function assertNpmRuntimeContract(workflow, { seo = false } = {}) {
  const jobName = seo ? 'seo-audit' : 'security-cve-audit';
  const job = workflow.jobs?.[jobName];
  assert.ok(job && Array.isArray(job.steps), `${jobName} job steps are required`);
  const setup = namedStep(workflow, 'Setup Node');
  assert.ok(setup, 'Node setup is required');
  assert.equal(setup.uses, 'actions/setup-node@v4');
  assert.equal(setup.with?.['node-version'], '22.23.2', 'Node runtime version must stay pinned');
  assert.equal(Object.hasOwn(setup.with || {}, 'cache'), false, 'setup-node npm CLI cache must stay disabled');
  if (seo) assert.equal(setup.if, "steps.cadence.outputs.run == 'true'", 'Node setup must remain behind the biweekly cadence gate');

  const prepare = namedStep(workflow, 'Verify selected npm before cache restore');
  const cache = namedStep(workflow, 'Restore private npm content cache');
  const reverify = namedStep(workflow, 'Reverify selected npm and remove disposable original');
  const install = namedStep(workflow, seo ? 'Install dependencies' : 'Install reviewed dependencies');
  assert.ok(prepare && cache && reverify && install, 'Selected npm preparation, cache, re-verification, and install steps are required');
  for (const step of [prepare, cache, reverify, install]) {
    if (seo) assert.equal(step.if, "steps.cadence.outputs.run == 'true'", `${step.name} must remain behind the biweekly cadence gate`);
  }
  assert.ok(stepIndex(workflow, 'Setup Node', jobName) < stepIndex(workflow, prepare.name, jobName));
  assert.ok(stepIndex(workflow, prepare.name, jobName) < stepIndex(workflow, cache.name, jobName), 'npm identity must be prepared before cache restore');
  assert.ok(stepIndex(workflow, cache.name, jobName) < stepIndex(workflow, reverify.name, jobName), 'restored cache must be followed by npm re-verification');
  assert.ok(stepIndex(workflow, reverify.name, jobName) < stepIndex(workflow, install.name, jobName), 'selected npm must be installed before dependencies');

  assert.match(prepare.run, /npm-runtime\.cjs prepare --cache-parent/);
  assert.match(prepare.run, /TACO_NPM_CONTENT_CACHE=.*npmContentCache/);
  assert.match(prepare.run, /TACO_NPM_RUNTIME_KEY=.*cacheKey/);
  assert.equal(cache.uses, 'actions/cache@v4');
  assert.equal(cache.with?.path, '${{ env.TACO_NPM_CONTENT_CACHE }}', 'only the selected npm content cache may be restored');
  assert.equal(cache.with?.key, '${{ runner.os }}-${{ runner.arch }}-taco-npm-v2-${{ env.TACO_NPM_RUNTIME_KEY }}',
    'cache key must bind schema, runner platform, and selected runtime identity');
  assert.equal(Object.hasOwn(cache.with || {}, 'restore-keys'), false, 'broad cache restore keys are forbidden');
  assert.doesNotMatch(JSON.stringify(cache.with), /(?:~\/\.npm|\.npm\/_cacache|npm-cache)/i,
    'npm CLI package cache must not be shared');

  assert.match(reverify.run, /npm-runtime\.cjs identity --cache-parent/);
  assert.match(reverify.run, /rm -rf[^\n]*lib\/node_modules\/npm[^\n]*\/npm[^\n]*\/npx/,
    'disposable setup-node npm package and shims must be removed');
  assert.match(reverify.run, /symlinkSync\(i\.npmShimRealpath/);
  assert.match(reverify.run, /symlinkSync\(i\.npxShimRealpath/);
  assert.match(reverify.run, /test ! -e [^\n]*lib\/node_modules\/npm/);
  assert.match(reverify.run, /npm --version[^\n]*12\.1\.0/);
  assert.match(reverify.run, /npx --version[^\n]*12\.1\.0/);
  assert.match(reverify.run, /npm cache verify/, 'restored npm content must be verified before installation');

  assert.match(install.run, /sha256sum package\.json package-lock\.json \.npmrc/,
    'package and npm configuration inputs must be hashed before install');
  assert.match(install.run, /npm ci --no-audit --no-fund --foreground-scripts/,
    'dependency installation must run lifecycle scripts visibly with fixed flags');
  assert.match(install.run, /sha256sum --check/,
    'package and npm configuration input hashes must be checked after install');
  assert.doesNotMatch(`${JSON.stringify(job.env || {})}\n${JSON.stringify(install.env || {})}\n${install.run}`,
    /(?:ignore-scripts|NPM_CONFIG_IGNORE_SCRIPTS)/i, 'install scripts must not be suppressed or bypassed');
  const beforeHash = install.run.indexOf('sha256sum package.json');
  const npmCi = install.run.indexOf('npm ci ');
  const afterHash = install.run.indexOf('sha256sum --check');
  assert.ok(beforeHash >= 0 && npmCi > beforeHash && afterHash > npmCi, 'input hashes must bracket npm ci');
  const beforeFile = install.run.match(/sha256sum package\.json package-lock\.json \.npmrc > ([^\n]+)/)?.[1];
  const checkedFile = install.run.match(/sha256sum --check ([^\n]+)/)?.[1];
  assert.ok(beforeFile && checkedFile && checkedFile === beforeFile,
    'the post-install check must verify the exact pre-install input checksum file');
}

function assertSeoCadenceContract(workflow) {
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'), 'SEO audit must remain manually dispatchable');
  assert.deepEqual(workflow.on.schedule, [{ cron: '0 13 * * 1' }], 'SEO scheduled trigger must retain its weekly cadence');
  const cadence = namedStep(workflow, 'Check biweekly cadence');
  const skip = namedStep(workflow, 'Skip off-week');
  assert.ok(cadence && skip, 'Biweekly date gate and explicit off-week step are required');
  assert.equal(cadence.id, 'cadence');
  assert.match(cadence.run, /github\.event_name.*workflow_dispatch/);
  assert.match(cadence.run, /days_since_anchor % 14/);
  assert.match(cadence.run, /echo "run=false"/);
  assert.equal(skip.if, "steps.cadence.outputs.run != 'true'");
  for (const name of ['Checkout', 'Setup Node', 'Verify selected npm before cache restore', 'Restore private npm content cache',
    'Reverify selected npm and remove disposable original', 'Install dependencies', 'Run SEO/GEO audit']) {
    assert.equal(namedStep(workflow, name)?.if, "steps.cadence.outputs.run == 'true'", `${name} must stay gated to audit weeks`);
  }
  assert.equal(namedStep(workflow, 'Upload audit artifacts')?.if,
    "always() && steps.cadence.outputs.run == 'true'", 'artifact upload must run after gated audit steps and stay off-week gated');
}

function assertSecurityGateContract(workflow) {
  const boundary = namedStep(workflow, 'Verify install boundaries and compatibility');
  const baseline = namedStep(workflow, 'Run required baseline gates');
  const affected = namedStep(workflow, 'Run affected behavior suites and SEO');
  const cve = namedStep(workflow, 'Run new-CVE audit');
  assert.equal(boundary?.run, 'npm run test:install-boundaries', 'Strict install hook/configuration enforcement must remain required');
  assert.equal(baseline?.run, 'node scripts/verify.js --all', 'Full release verification must remain required');
  assert.match(affected?.run || '', /test:job-providers/);
  assert.match(affected?.run || '', /seo:audit:ci/);
  assert.equal(cve?.if, "always() && steps.install.outcome == 'success'");
  assert.match(cve?.run || '', /security:cve:ci/);
}

function assertDispatchContract(workflow) {
  assert.ok(workflow && typeof workflow.on === 'object', 'Workflow triggers are required');
  assert.ok(Object.hasOwn(workflow.on, 'pull_request'), 'Every PR must dispatch release checks');
  const pr = workflow.on.pull_request;
  assert.ok(pr === null || (pr && typeof pr === 'object' && !Array.isArray(pr)
    && Object.keys(pr).length === 0), 'PR dispatch must have no path, branch, or event filters');
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'), 'Manual dispatch must remain available');
  assert.deepEqual(workflow.on.schedule, [{ cron: '30 13 * * 1' }], 'Weekly audit cadence must remain');
  const job = workflow.jobs?.['security-cve-audit'];
  assert.ok(job && (job['continue-on-error'] === undefined || job['continue-on-error'] === false),
    'Release job failures must block the workflow');
  const steps = job.steps;
  assert.ok(Array.isArray(steps), 'Release job steps are required');
  const lintSteps = steps.filter(step => step.name === 'Require functioning lint');
  assert.equal(lintSteps.length, 1, 'Exactly one mandatory lint step is required');
  assert.equal(lintSteps[0].run.trim(), 'npm run lint', 'Lint failures must propagate');
  assert.equal(lintSteps[0].if, "always() && steps.install.outcome == 'success'",
    'Lint must run after a successful install even if another gate failed');
  assert.ok(lintSteps[0]['continue-on-error'] === undefined || lintSteps[0]['continue-on-error'] === false,
    'Lint failures must block the workflow');
  const configSteps = steps.filter(step => step.name === 'Verify lint configuration and release dispatch');
  assert.equal(configSteps.length, 1, 'Configuration and dispatch negative tests must run in CI');
  assert.equal(configSteps[0].run.trim(), 'node --test scripts/lint-verify.test.cjs scripts/release-workflow-contract.test.cjs');
  assert.equal(configSteps[0].if, "always() && steps.install.outcome == 'success'");
  assert.ok(configSteps[0]['continue-on-error'] === undefined || configSteps[0]['continue-on-error'] === false);
}

const workflow = readWorkflow(workflowPath);

test('release checks dispatch on every PR and retain mandatory lint, manual and weekly checks', () => {
  assertDispatchContract(workflow);
});

test('a root, types, toolchain, or moved source file cannot be excluded by a restored PR filter', () => {
  for (const pr of [
    { paths: ['package.json', 'package-lock.json'] },
    { 'paths-ignore': ['types/**', 'toolchain/**'] },
    { branches: ['main'] },
    { types: ['opened'] },
  ]) {
    const changed = structuredClone(workflow);
    changed.on.pull_request = pr;
    assert.throws(() => assertDispatchContract(changed), /PR dispatch must have no/);
  }
});

test('omitting dispatch or swallowing a lint failure cannot satisfy the contract', () => {
  const omitted = structuredClone(workflow);
  delete omitted.on.pull_request;
  assert.throws(() => assertDispatchContract(omitted), /Every PR/);
  const swallowed = structuredClone(workflow);
  swallowed.jobs['security-cve-audit'].steps.find(step => step.name === 'Require functioning lint').run += ' || true';
  assert.throws(() => assertDispatchContract(swallowed), /Lint failures must propagate/);
  const allowedFailure = structuredClone(workflow);
  allowedFailure.jobs['security-cve-audit'].steps.find(step => step.name === 'Require functioning lint')['continue-on-error'] = true;
  assert.throws(() => assertDispatchContract(allowedFailure), /Lint failures must block/);
  const dynamicFailure = structuredClone(workflow);
  dynamicFailure.jobs['security-cve-audit'].steps.find(step => step.name === 'Require functioning lint')['continue-on-error'] = '${{ true }}';
  assert.throws(() => assertDispatchContract(dynamicFailure), /Lint failures must block/);
  const jobFailure = structuredClone(workflow);
  jobFailure.jobs['security-cve-audit']['continue-on-error'] = true;
  assert.throws(() => assertDispatchContract(jobFailure), /Release job failures must block/);
});

test('both audit workflows pin and select the same npm runtime before a narrowly scoped cache restore', () => {
  const security = readWorkflow(workflowPath);
  const seo = readWorkflow(seoWorkflowPath);
  assertNpmRuntimeContract(security);
  assertNpmRuntimeContract(seo, { seo: true });
  assertSecurityGateContract(security);
});

test('cache-key omissions, broad restores, and setup-node CLI caching fail the contract', () => {
  const mutations = [
    workflow => { namedStep(workflow, 'Restore private npm content cache').with.key = '${{ runner.os }}-taco-npm-v2'; },
    workflow => { namedStep(workflow, 'Restore private npm content cache').with.key = '${{ runner.os }}-${{ runner.arch }}-taco-npm-v2-static'; },
    workflow => { namedStep(workflow, 'Restore private npm content cache').with['restore-keys'] = ['${{ runner.os }}-']; },
    workflow => { namedStep(workflow, 'Restore private npm content cache').with.path = '~/.npm'; },
    workflow => { namedStep(workflow, 'Setup Node').with.cache = 'npm'; },
  ];
  for (const source of [readWorkflow(workflowPath), readWorkflow(seoWorkflowPath)]) {
    for (const mutate of mutations) {
      const changed = structuredClone(source);
      mutate(changed);
      assert.throws(() => assertNpmRuntimeContract(changed, { seo: changed.jobs['seo-audit'] !== undefined }));
    }
  }
});

test('runtime verification order, disposable npm replacement, ignored-script bypass, and Node drift fail closed', () => {
  const mutations = [
    workflow => { namedStep(workflow, 'Verify selected npm before cache restore').run = 'echo skipped'; },
    workflow => { namedStep(workflow, 'Reverify selected npm and remove disposable original').run = 'echo skipped'; },
    workflow => { namedStep(workflow, 'Reverify selected npm and remove disposable original').run = 'sudo rm -rf "$taco_node_bin/../lib/node_modules/npm"'; },
    workflow => { const install = namedStep(workflow, installStepName(workflow)); install.run = install.run.replace('--foreground-scripts', '--ignore-scripts'); },
    workflow => { namedStep(workflow, installStepName(workflow)).env = { NPM_CONFIG_IGNORE_SCRIPTS: 'true' }; },
    workflow => { namedStep(workflow, 'Setup Node').with['node-version'] = '22.x'; },
  ];
  for (const source of [readWorkflow(workflowPath), readWorkflow(seoWorkflowPath)]) {
    for (const mutate of mutations) {
      const changed = structuredClone(source);
      mutate(changed);
      assert.throws(() => assertNpmRuntimeContract(changed, { seo: changed.jobs['seo-audit'] !== undefined }));
    }
  }
});

test('install input hashes must bracket npm ci and SEO audit must retain its off-week cadence gate', () => {
  const security = readWorkflow(workflowPath);
  const seo = readWorkflow(seoWorkflowPath);
  assertNpmRuntimeContract(security);
  assertNpmRuntimeContract(seo, { seo: true });
  assertSeoCadenceContract(seo);

  const hashOrder = structuredClone(security);
  const install = namedStep(hashOrder, 'Install reviewed dependencies');
  install.run = install.run.replace(/sha256sum --check[^\n]*\n?/, '');
  assert.throws(() => assertNpmRuntimeContract(hashOrder), /input hashes must be checked after install/);

  const offWeek = structuredClone(seo);
  namedStep(offWeek, 'Install dependencies').if = undefined;
  assert.throws(() => assertSeoCadenceContract(offWeek), /must stay gated/);
  const missingBiweeklyCheck = structuredClone(seo);
  namedStep(missingBiweeklyCheck, 'Check biweekly cadence').run = 'if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then echo run=true; else echo run=false; fi';
  assert.throws(() => assertSeoCadenceContract(missingBiweeklyCheck), /days_since_anchor % 14/);
});
