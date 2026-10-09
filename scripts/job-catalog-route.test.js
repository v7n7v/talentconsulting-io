const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');
const { approvedOrigin, safeReceipt, selectedProvider, triggerJobCatalog } = require('./job-catalog-trigger');

const repoRoot = path.join(__dirname, '..');
const cronSecret = 'job-catalog-test-secret-with-more-than-32-chars';

function writeFixture(dir, name, content) {
  const filename = path.join(dir, name);
  fs.writeFileSync(filename, content);
  return filename;
}

let route;
let tempDir;
async function loadRoute() {
  if (route) return route;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-job-catalog-route-'));
  const nextServer = writeFixture(tempDir, 'next-server.cjs', `
    exports.NextResponse = { json(body, init = {}) {
      return new Response(JSON.stringify(body), { status: init.status || 200, headers: init.headers });
    } };
  `);
  const runner = writeFixture(tempDir, 'runner.cjs', `
    exports.runJobCatalogIngestion = async options => {
      const fixture = global.__JOB_CATALOG_ROUTE_FIXTURE__;
      fixture.calls.push(options);
      if (fixture.error) throw new Error(fixture.error);
      return fixture.result;
    };
  `);
  const providers = writeFixture(tempDir, 'providers.cjs', `
    exports.JOB_PROVIDERS = ['fantastic', 'brightdata', 'apify'];
  `);
  const outfile = path.join(tempDir, 'route.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'app/api/cron/job-catalog/route.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'route-fixtures',
      setup(buildApi) {
        const aliases = {
          'next/server': nextServer,
          '@/lib/job-provider-contract': providers,
          '@/lib/job-catalog-ingestion': runner,
        };
        buildApi.onResolve({ filter: /.*/ }, args => aliases[args.path]
          ? { path: aliases[args.path] }
          : undefined);
      },
    }],
  });
  route = require(outfile);
  return route;
}

async function invoke(method, url, { authorization = `Bearer ${cronSecret}`, result, error } = {}) {
  const fixture = { calls: [], result, error };
  global.__JOB_CATALOG_ROUTE_FIXTURE__ = fixture;
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = cronSecret;
  try {
    const handlers = await loadRoute();
    const request = new Request(`https://staging.example.test${url}`, {
      method,
      headers: authorization ? { Authorization: authorization } : {},
    });
    const response = await handlers[method](request);
    return { response, body: await response.json(), fixture };
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
    delete global.__JOB_CATALOG_ROUTE_FIXTURE__;
  }
}

test.after(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('cron route rejects missing authorization before invoking the runner', async () => {
  const { response, body, fixture } = await invoke('POST', '/api/cron/job-catalog', {
    authorization: '',
  });
  assert.equal(response.status, 401);
  assert.equal(body.error, 'Unauthorized');
  assert.equal(fixture.calls.length, 0);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('cron route validates provider and query parameters after authorization', async () => {
  for (const url of [
    '/api/cron/job-catalog?provider=linkedin',
    '/api/cron/job-catalog?provider=fantastic&provider=apify',
    '/api/cron/job-catalog?limit=5',
  ]) {
    const { response, fixture } = await invoke('GET', url, { result: { status: 'success', complete: true } });
    assert.equal(response.status, 400);
    assert.equal(fixture.calls.length, 0);
  }
});

test('disabled ingestion returns a sanitized no-op receipt', async () => {
  const { response, body, fixture } = await invoke('POST', '/api/cron/job-catalog', {
    result: { enabled: false, provider: 'fantastic', status: 'disabled', complete: false, records: 0, closed: 0, requests: 0 },
  });
  assert.equal(response.status, 200);
  assert.equal(body.enabled, false);
  assert.equal(body.status, 'disabled');
  assert.equal(fixture.calls[0].provider, 'fantastic');
});

test('pending work returns 202 with a bounded Retry-After header', async () => {
  const { response, body } = await invoke('POST', '/api/cron/job-catalog?provider=apify', {
    result: { enabled: true, provider: 'apify', status: 'pending', complete: false, records: 10, closed: 0, requests: 1, retryAfterSeconds: 7200 },
  });
  assert.equal(response.status, 202);
  assert.equal(body.status, 'pending');
  assert.equal(body.retryAfterSeconds, 7200);
  assert.equal(response.headers.get('retry-after'), '7200');
});

test('thrown runner errors become generic unavailable responses', async () => {
  const secretMarker = 'provider-secret-must-not-appear';
  const { response, body } = await invoke('POST', '/api/cron/job-catalog', {
    error: `stack ${secretMarker}`,
  });
  assert.equal(response.status, 503);
  assert.equal(body.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(body), new RegExp(secretMarker));
});

test('complete successful provider run returns a sanitized receipt', async () => {
  const { response, body, fixture } = await invoke('GET', '/api/cron/job-catalog?provider=brightdata', {
    result: { enabled: true, provider: 'brightdata', status: 'success', complete: true, records: 23, closed: 2, requests: 4 },
  });
  assert.equal(response.status, 200);
  assert.equal(body.records, 23);
  assert.equal(body.closed, 2);
  assert.deepEqual(fixture.calls, [{ provider: 'brightdata' }]);
  assert.equal(body.provider, 'brightdata');
});

test('manual trigger requires an explicit HTTPS origin and known provider', () => {
  assert.equal(approvedOrigin('https://staging.example.test'), 'https://staging.example.test');
  for (const value of [
    '', 'http://staging.example.test', 'https://user:pass@staging.example.test',
    'https://staging.example.test/path', 'https://staging.example.test?key=x',
    'https://staging.example.test#fragment',
  ]) assert.throws(() => approvedOrigin(value), /explicit HTTPS origin/);
  assert.equal(selectedProvider(undefined), 'fantastic');
  assert.throws(() => selectedProvider('linkedin'), /not supported/);
});

test('manual trigger sends one authenticated non-redirecting request and prints only safe fields', async () => {
  const calls = [];
  const receipt = await triggerJobCatalog({
    baseUrl: 'https://staging.example.test',
    provider: 'fantastic',
    secret: cronSecret,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        provider: 'fantastic', status: 'success', enabled: true, complete: true,
        records: 4, closed: 0, requests: 2, secret: cronSecret,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${cronSecret}`);
  assert.equal(receipt.records, 4);
  assert.equal(Object.hasOwn(receipt, 'secret'), false);
  assert.doesNotMatch(JSON.stringify(receipt), new RegExp(cronSecret));
});

test('manual trigger does not follow redirects or retry failures', async () => {
  let calls = 0;
  await assert.rejects(triggerJobCatalog({
    baseUrl: 'https://staging.example.test',
    secret: cronSecret,
    fetchImpl: async (_url, options) => {
      calls += 1;
      assert.equal(options.redirect, 'error');
      return new Response('redirect', { status: 302 });
    },
  }), /trigger failed/);
  assert.equal(calls, 1);
});
