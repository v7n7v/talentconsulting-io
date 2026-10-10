const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

test('admin reads consume scheduled materialized aggregates without live scans', () => {
  const stats = read('app/api/admin/stats/route.ts');
  const costs = read('app/api/admin/costs/route.ts');
  const email = read('app/api/admin/email/route.ts');

  assert.match(stats, /requireAdmin\(request, 'analytics\.read'\)/);
  assert.match(costs, /requireAdmin\(request, 'billing\.read'\)/);
  assert.match(stats, /readAdminAggregateCache/);
  assert.match(costs, /readAdminAggregateCache/);
  assert.match(email, /readAdminAggregateCache/);
  assert.match(stats, /isAdminPlatformStatsSnapshot/);
  assert.match(costs, /isAdminCostSnapshot/);
  assert.match(email, /isAdminEmailSnapshot/);
  assert.match(stats, /ADMIN_STATS_SNAPSHOT_UNAVAILABLE/);
  assert.match(costs, /ADMIN_COSTS_SNAPSHOT_UNAVAILABLE/);
  assert.match(stats, /no live source scan was triggered/);
  assert.match(costs, /no live source scan was triggered/);
  assert.doesNotMatch(stats, /collectionGroup\(|readBounded|readVerified|Promise\.allSettled/);
  assert.doesNotMatch(costs, /collectionGroup\(|readBounded|readVerified|Promise\.allSettled/);
  assert.doesNotMatch(email, /readCollectionCount|readFilteredCollectionCount|Promise\.allSettled/);
});

test('one authenticated scheduler pass materializes bounded platform and finance windows', () => {
  const cron = read('app/api/cron/admin-aggregates/route.ts');
  const materializer = read('lib/admin/aggregate-materializer.ts');

  assert.match(cron, /process\.env\.CRON_SECRET/);
  assert.match(cron, /timingSafeEqual/);
  assert.match(cron, /materializeAdminAggregateSnapshots/);
  assert.match(materializer, /ADMIN_COST_CACHE_WINDOWS = \[7, 30, 90\]/);
  assert.equal(
    (materializer.match(/readVerifiedSubscriptionAggregates\(db\)/g) || []).length,
    1,
    'subscription evidence must be read once per scheduled batch',
  );
  assert.match(materializer, /Promise\.allSettled/);
  assert.match(materializer, /ADMIN_STATS_CACHE_KEY/);
  assert.match(materializer, /ADMIN_EMAIL_CACHE_KEY/);
  assert.match(materializer, /`costs_v2_\$\{payload\.windowDays\}`/);
  assert.match(materializer, /claimAdminAggregateRefresh/);
  assert.match(materializer, /publishAdminAggregateGeneration/);
  assert.match(materializer, /releaseAdminAggregateRefresh/);
  assert.match(materializer, /providerWritesPerformed: false/);
  assert.doesNotMatch(cron, /stripe|resend|sendEmail|checkout\.sessions|entitlement/i);
});

test('aggregate publication is atomic, generation-fenced, and stale workers cannot clear a successor lease', () => {
  const cache = read('lib/admin/aggregate-cache.ts');
  const materializer = read('lib/admin/aggregate-materializer.ts');

  assert.match(cache, /refreshExecutionId: executionId/);
  assert.match(cache, /publishAdminAggregateGeneration/);
  assert.match(cache, /db\.runTransaction/);
  assert.match(cache, /lease\.data\(\)\?\.refreshExecutionId !== executionId/);
  assert.match(cache, /generationId: executionId/);
  assert.match(cache, /activeGenerationId: executionId/);
  assert.match(cache, /snapshot\.data\(\)\?\.refreshExecutionId !== executionId/);
  assert.match(materializer, /ADMIN_AGGREGATE_LEASE_SUPERSEDED/);
  assert.doesNotMatch(materializer, /Promise\.all\(\[\s*writeAdminAggregateCache/);
});

test('aggregate cache schemas reject incomplete and rollback-era payload shapes', () => {
  const schemas = read('lib/admin/aggregate-contracts.ts');

  assert.match(schemas, /adminPlatformStatsSnapshotSchema/);
  assert.match(schemas, /adminCostSnapshotSchema/);
  assert.match(schemas, /adminEmailSnapshotSchema/);
  assert.match(schemas, /directionalContribution: z\.object/);
  assert.match(schemas, /evidence: z\.object\(\{\s*subscriptions:/);
  assert.match(schemas, /providerVerified: z\.boolean\(\)/);
  assert.match(schemas, /export type AdminCostSnapshot = z\.infer/);
  assert.equal((schemas.match(/\.strict\(\)/g) || []).length >= 15, true);
  assert.doesNotMatch(schemas, /\.passthrough\(\)/);
});

test('production owns a ten-minute refresh schedule and post-deploy prime', () => {
  const workflow = read('.github/workflows/admin-aggregate-materialization.yml');
  const deploy = read('deploy-fix.js');
  const prime = read('scripts/admin-aggregate-prime.js');

  assert.match(workflow, /cron: '\*\/10 \* \* \* \*'/);
  assert.match(workflow, /secrets\.ADMIN_AGGREGATE_CRON_SECRET/);
  assert.match(workflow, /node scripts\/admin-aggregate-prime\.js/);
  const mainStart = deploy.indexOf('function main()');
  const mainEnd = deploy.indexOf('if (require.main', mainStart);
  assert.ok(mainStart >= 0 && mainEnd > mainStart, 'production orchestration must be present');
  const main = deploy.slice(mainStart, mainEnd);
  const deployAt = main.search(/deployFirebase\(\{ runPreflight: \(\) => \{\} \}\)/);
  const promoteAt = main.indexOf('promoteDeployedRevision();');
  const primeAt = main.indexOf('primeAdminAggregates();');
  const smokeAt = main.indexOf('runPostDeploySmoke();');
  assert.ok(deployAt >= 0 && primeAt > deployAt, 'prime aggregates only after deployment');
  assert.ok(promoteAt > deployAt && promoteAt < primeAt, 'promote the deployed revision before priming its aggregates');
  assert.ok(smokeAt > primeAt, 'verify the release after aggregates are primed');
  assert.match(prime, /MAX_RECEIPT_AGE_MS/);
  assert.match(prime, /providerWritesPerformed/);
  assert.doesNotMatch(workflow, /echo.+CRON_SECRET/i);
});

test('unknown finance evidence stays null and is never presented as a measured zero', () => {
  const materializer = read('lib/admin/aggregate-materializer.ts');

  assert.match(materializer, /totalCost: null/);
  assert.match(materializer, /netProfit: null/);
  assert.match(materializer, /profitMargin: null/);
  assert.match(materializer, /costPerUser: null/);
  assert.match(materializer, /A null KPI is unavailable or incomplete evidence, never a measured zero/);
  assert.doesNotMatch(materializer, /proCount \* multiplier|studioCount \* multiplier/);
});
