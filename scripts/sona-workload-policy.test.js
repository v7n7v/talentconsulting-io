const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');

async function loadPolicy() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'sona-workload-policy-'));
  const outfile = path.join(outdir, 'workload-policy.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'sona', 'workload-policy.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

test('Free gets one bounded scout outcome and cannot request packet preparation', async () => {
  const { resolveSonaWorkloadEntitlement } = await loadPolicy();
  const policy = resolveSonaWorkloadEntitlement('free', 'prepare', 8);

  assert.equal(policy.plan, 'free');
  assert.equal(policy.effectiveMode, 'scout');
  assert.equal(policy.downgraded, true);
  assert.equal(policy.maxRankedRoles, 3);
  assert.equal(policy.maxPreparedPackets, 0);
  assert.equal(policy.recurringScouting, false);
  assert.equal(policy.costEnvelope.resumeMorphsMax, 0);
  assert.equal(policy.costEnvelope.coverLettersMax, 0);
  assert.match(policy.upgrade.reason, /Pro.*repeatable|repeatable.*Pro/i);
});

test('Pro pays for repeatable manual scouting without hidden packet generation', async () => {
  const { resolveSonaWorkloadEntitlement } = await loadPolicy();
  const policy = resolveSonaWorkloadEntitlement('pro', 'prepare', 5);

  assert.equal(policy.plan, 'pro');
  assert.equal(policy.effectiveMode, 'scout');
  assert.equal(policy.maxRankedRoles, 3);
  assert.equal(policy.maxPreparedPackets, 0);
  assert.equal(policy.costEnvelope.modelCallsMax, 1);
  assert.match(policy.paidReason, /repeatable/i);
  assert.equal(policy.upgrade.href, '/suite/upgrade?plan=studio');
});

test('Max pays for proactive work and up to five review-ready packets', async () => {
  const { resolveSonaWorkloadEntitlement } = await loadPolicy();
  const policy = resolveSonaWorkloadEntitlement('studio', 'prepare', 8);

  assert.equal(policy.plan, 'max');
  assert.equal(policy.effectiveMode, 'prepare');
  assert.equal(policy.maxRankedRoles, 5);
  assert.equal(policy.maxPreparedPackets, 5);
  assert.equal(policy.recurringScouting, true);
  assert.equal(policy.costEnvelope.resumeMorphsMax, 5);
  assert.equal(policy.costEnvelope.coverLettersMax, 5);
  assert.equal(policy.costEnvelope.modelCallsMax, 11);
  assert.equal(policy.upgrade, null);
});

test('Max can deliberately run a lower-cost scout without preparing assets', async () => {
  const { resolveSonaWorkloadEntitlement } = await loadPolicy();
  const policy = resolveSonaWorkloadEntitlement('studio', 'scout', 2);

  assert.equal(policy.effectiveMode, 'scout');
  assert.equal(policy.downgraded, false);
  assert.equal(policy.maxRankedRoles, 2);
  assert.equal(policy.maxPreparedPackets, 0);
  assert.equal(policy.costEnvelope.modelCallsMax, 1);
});

test('daily budgets keep paid Sona work inside a measurable cost envelope', async () => {
  const { getSonaDailyWorkloadBudget } = await loadPolicy();

  assert.deepEqual(getSonaDailyWorkloadBudget('pro'), {
    runsMax: 10,
    modelCallsMax: 10,
    preparedPacketsMax: 0,
  });
  assert.deepEqual(getSonaDailyWorkloadBudget('studio'), {
    runsMax: 3,
    modelCallsMax: 33,
    preparedPacketsMax: 15,
  });
});

test('server-owned tier enforcement keeps proactive work exclusive to Max', () => {
  const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  const client = read('app/suite/agent/page.tsx');
  const cron = read('app/api/cron/agent-pipeline/route.ts');
  const harness = read('lib/sona/agent-harness.ts');
  const preferences = read('app/api/jobs/preferences/route.ts');

  assert.doesNotMatch(client, /resolveSonaWorkloadEntitlement/);
  assert.match(cron, /pro:\s*0,\s*studio:\s*5/);
  assert.match(cron, /getAdminAuth\(\)\.getUser\(uid\)/);
  assert.match(cron, /getUserTier\(uid, verifiedAuthEmail\)/);
  assert.doesNotMatch(cron, /getUserTier\(uid, userData\.email\)/);
  assert.match(harness, /const tier: PlanTier = input\.tier \|\| 'free'/);
  assert.doesNotMatch(harness, /input\.email \|\| userData\.email/);
  assert.match(cron, /reserveSonaPaidWorkloadRun/);
  assert.match(cron, /releaseSonaPaidWorkloadRun/);
  assert.match(cron, /finalizeTalentRecommendations/);
  assert.doesNotMatch(cron, /GoogleGenerativeAI/);
  assert.match(cron, /packetStatus:\s*packetPrepared\s*\?\s*'prepared'/);
  assert.match(preferences, /canUseProactiveAgent\s*=\s*guard\.user\.tier === 'studio' \|\| guard\.user\.tier === 'god'/);
});
