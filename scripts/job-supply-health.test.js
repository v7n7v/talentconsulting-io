const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

function loadHealthModule() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-job-supply-health-'));
  const outfile = path.join(outdir, 'job-supply-health.cjs');
  buildSync({
    entryPoints: [path.join(repoRoot, 'lib', 'job-supply-health.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const ENV_KEYS = [
  'EVER_JOBS_ENABLED',
  'EVER_JOBS_API_URL',
  'EVER_JOBS_API_KEY',
  'EVER_JOBS_SAFE_SOURCES',
  'EVER_JOBS_ALLOW_PRIVATE_HTTP',
];

async function withEverJobsEnv(values, callback) {
  const previous = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    return await callback();
  } finally {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const configuredEnv = {
  EVER_JOBS_ENABLED: 'true',
  EVER_JOBS_API_URL: 'https://ever-jobs.internal:3001',
  EVER_JOBS_API_KEY: 'test-key-that-must-not-leak',
  EVER_JOBS_SAFE_SOURCES: 'greenhouse,lever,ashby',
};

test('disabled Ever Jobs is explicit and never calls the network', { concurrency: false }, async () => {
  const { probeJobSupplyHealth } = loadHealthModule();
  let calls = 0;
  await withEverJobsEnv({ EVER_JOBS_ENABLED: 'false' }, async () => {
    const result = await probeJobSupplyHealth({ fetchImpl: async () => { calls += 1; } });
    assert.equal(result.status, 'disabled');
    assert.equal(result.preparationReady, false);
    assert.equal(calls, 0);
  });
});

test('missing credentials and restricted sources fail configuration closed', { concurrency: false }, async () => {
  const { getJobSupplyConfiguration } = loadHealthModule();
  await withEverJobsEnv({
    EVER_JOBS_ENABLED: 'true',
    EVER_JOBS_API_URL: 'https://ever-jobs.internal:3001',
    EVER_JOBS_SAFE_SOURCES: 'greenhouse,linkedin',
  }, async () => {
    const result = getJobSupplyConfiguration();
    assert.equal(result.preparationConfigured, false);
    assert.deepEqual(result.unsafeSources, ['linkedin']);
    assert.equal(result.missing.includes('EVER_JOBS_API_KEY'), true);
    assert.equal(result.missing.includes('safe source policy'), true);
  });
});

test('safe sources must be explicit and limited to the approved source set', { concurrency: false }, async () => {
  const { getJobSupplyConfiguration } = loadHealthModule();
  await withEverJobsEnv({
    EVER_JOBS_ENABLED: 'true',
    EVER_JOBS_API_URL: 'https://ever-jobs.internal:3001',
    EVER_JOBS_API_KEY: 'test-key',
  }, async () => {
    const missingSources = getJobSupplyConfiguration();
    assert.equal(missingSources.preparationConfigured, false);
    assert.equal(missingSources.missing.includes('EVER_JOBS_SAFE_SOURCES'), true);
  });
  await withEverJobsEnv({
    ...configuredEnv,
    EVER_JOBS_SAFE_SOURCES: 'greenhouse,unknown-board',
  }, async () => {
    const unknownSource = getJobSupplyConfiguration();
    assert.equal(unknownSource.preparationConfigured, false);
    assert.deepEqual(unknownSource.unsafeSources, ['unknown-board']);
  });
});

test('remote Ever Jobs URLs must use HTTPS before an API key can be sent', { concurrency: false }, async () => {
  const { getJobSupplyConfiguration } = loadHealthModule();
  await withEverJobsEnv({
    ...configuredEnv,
    EVER_JOBS_API_URL: 'http://ever-jobs.internal:3001',
  }, async () => {
    const result = getJobSupplyConfiguration();
    assert.equal(result.preparationConfigured, false);
    assert.equal(result.missing.includes('EVER_JOBS_API_URL'), true);
  });
});

test('explicit private HTTP is limited to a single-label Docker service hostname', { concurrency: false }, async () => {
  const { getJobSupplyConfiguration } = loadHealthModule();
  await withEverJobsEnv({
    ...configuredEnv,
    EVER_JOBS_API_URL: 'http://ever-jobs:3001',
    EVER_JOBS_ALLOW_PRIVATE_HTTP: 'true',
  }, async () => {
    const result = getJobSupplyConfiguration();
    assert.equal(result.preparationConfigured, true);
    assert.equal(result.serviceHost, 'ever-jobs:3001');
  });
  for (const unsafeUrl of [
    'http://ever-jobs.internal:3001',
    'http://10.0.0.4:3001',
    'http://user:password@ever-jobs:3001',
  ]) {
    await withEverJobsEnv({
      ...configuredEnv,
      EVER_JOBS_API_URL: unsafeUrl,
      EVER_JOBS_ALLOW_PRIVATE_HTTP: 'true',
    }, async () => {
      assert.equal(getJobSupplyConfiguration().preparationConfigured, false);
    });
  }
});

test('a healthy authenticated primary service enables preparation without exposing its key', { concurrency: false }, async () => {
  const { probeJobSupplyHealth } = loadHealthModule();
  const requests = [];
  await withEverJobsEnv(configuredEnv, async () => {
    const result = await probeJobSupplyHealth({
      force: true,
      fetchImpl: async (url, init) => {
        const apiKey = init.headers['x-api-key'];
        requests.push({ url: String(url), apiKey });
        return apiKey
          ? new Response(JSON.stringify({ status: 'healthy' }), { status: 200 })
          : new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      },
    });
    assert.equal(result.status, 'healthy');
    assert.equal(result.preparationReady, true);
    assert.equal(result.endpoint, '/health');
    assert.equal(result.apiKeyProtectionVerified, true);
    assert.equal(result.serviceHost, 'ever-jobs.internal:3001');
    assert.equal(requests[0].url, 'https://ever-jobs.internal:3001/health');
    assert.equal(requests[0].apiKey, configuredEnv.EVER_JOBS_API_KEY);
    assert.equal(requests[1].apiKey, undefined);
    assert.equal(JSON.stringify(result).includes(configuredEnv.EVER_JOBS_API_KEY), false);
  });
});

test('only an Ever Jobs success without fallback verifies the actual search for preparation', () => {
  const { isVerifiedPrimaryJobSearch } = loadHealthModule();
  assert.equal(isVerifiedPrimaryJobSearch({ everJobs: 'success', fallbackUsed: false }), true);
  assert.equal(isVerifiedPrimaryJobSearch({ everJobs: 'success', fallbackUsed: true }), false);
  assert.equal(isVerifiedPrimaryJobSearch({ everJobs: 'error', fallbackUsed: true }), false);
  assert.equal(isVerifiedPrimaryJobSearch(null), false);
});

test('the probe falls back from health to ping and reports network failures as unreachable', { concurrency: false }, async () => {
  const { probeJobSupplyHealth } = loadHealthModule();
  await withEverJobsEnv(configuredEnv, async () => {
    const endpoints = [];
    const healthy = await probeJobSupplyHealth({
      force: true,
      fetchImpl: async (url, init) => {
        endpoints.push(new URL(String(url)).pathname);
        if (!init.headers['x-api-key']) return new Response('', { status: 401 });
        return endpoints.length === 1
          ? new Response('', { status: 404 })
          : new Response('pong', { status: 200 });
      },
    });
    assert.deepEqual(endpoints, ['/health', '/ping', '/health']);
    assert.equal(healthy.status, 'healthy');
    assert.equal(healthy.endpoint, '/ping');

    const unreachable = await probeJobSupplyHealth({
      force: true,
      fetchImpl: async () => { throw new Error('connection refused'); },
    });
    assert.equal(unreachable.status, 'unreachable');
    assert.equal(unreachable.preparationReady, false);
  });
});

test('a healthy service with API-key auth disabled cannot enable preparation', { concurrency: false }, async () => {
  const { probeJobSupplyHealth } = loadHealthModule();
  await withEverJobsEnv(configuredEnv, async () => {
    const result = await probeJobSupplyHealth({
      force: true,
      fetchImpl: async () => new Response(JSON.stringify({ status: 'healthy' }), { status: 200 }),
    });
    assert.equal(result.status, 'unhealthy');
    assert.equal(result.apiKeyProtectionVerified, false);
    assert.equal(result.preparationReady, false);
  });
});

test('an HTTP 200 body that reports degraded health remains unavailable for preparation', { concurrency: false }, async () => {
  const { probeJobSupplyHealth } = loadHealthModule();
  await withEverJobsEnv(configuredEnv, async () => {
    const result = await probeJobSupplyHealth({
      force: true,
      fetchImpl: async () => new Response(JSON.stringify({ status: 'degraded', healthy: false }), { status: 200 }),
    });
    assert.equal(result.status, 'unhealthy');
    assert.equal(result.preparationReady, false);
  });
});

test('preparation routes expose a typed primary-supply recovery state', () => {
  const harnessRoute = fs.readFileSync(path.join(repoRoot, 'app/api/agent/harness/route.ts'), 'utf8');
  const cronRoute = fs.readFileSync(path.join(repoRoot, 'app/api/cron/agent-pipeline/route.ts'), 'utf8');
  const adminRoute = fs.readFileSync(path.join(repoRoot, 'app/api/admin/ops/job-supply/route.ts'), 'utf8');
  const adminOpsRoute = fs.readFileSync(path.join(repoRoot, 'app/api/admin/ops/route.ts'), 'utf8');
  assert.match(harnessRoute, /PRIMARY_JOB_SUPPLY_UNAVAILABLE/);
  assert.match(cronRoute, /probeJobSupplyHealth\(\{ force: true \}\)/);
  assert.match(cronRoute, /primarySearchVerified/);
  assert.match(cronRoute, /cancelSonaPaidWorkloadRun/);
  assert.match(cronRoute, /selectDailyCronBatch/);
  assert.ok(
    cronRoute.indexOf('if (canPrepareAssets && !primarySearchVerified)')
      < cronRoute.indexOf('// 7. Morph + Cover Letter + Queue for each job'),
  );
  assert.ok(
    cronRoute.indexOf("if (configuredAutonomy !== 'scout' && !primarySupply.preparationReady)")
      < cronRoute.indexOf('twin = await getOrComputeTwin(uid)'),
  );
  assert.match(adminOpsRoute, /const jobSupply = await probeJobSupplyHealth\(\)/);
  assert.match(adminOpsRoute, /everJobs: jobSupply\.preparationReady/);
  assert.match(adminRoute, /result\.preparationReady \? 200 : 503/);
  assert.match(adminRoute, /checkRateLimitStrict/);
  assert.ok(adminRoute.indexOf('const strictLimit = await checkRateLimitStrict') < adminRoute.indexOf('const result = await probeJobSupplyHealth'));
});
