'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const yaml = require('js-yaml');

const workflowPath = path.resolve(__dirname, '../.github/workflows/security-cve-audit.yml');

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

const workflow = yaml.load(fs.readFileSync(workflowPath, 'utf8'));

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
