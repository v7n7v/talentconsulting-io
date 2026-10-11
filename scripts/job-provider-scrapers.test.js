const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
function loadModule(file) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-job-provider-'));
  const outfile = path.join(dir, `${path.basename(file, '.ts')}.cjs`);
  buildSync({ entryPoints: [path.join(repoRoot, 'lib', 'job-providers', file)], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  return require(outfile);
}
function env(extra = {}) {
  return {
    BRIGHT_DATA_JOBS_ENABLED: 'true', BRIGHT_DATA_API_KEY: 'bd-secret', BRIGHT_DATA_JOBS_DATASET_ID: 'jobs-dataset',
    BRIGHT_DATA_JOBS_INPUT_JSON: JSON.stringify([{ url: 'https://www.linkedin.com/jobs/search/?keywords=engineer' }]),
    APIFY_JOBS_ENABLED: 'true', APIFY_API_TOKEN: 'apify-secret', JOB_INGEST_QUERY: 'software engineer',
    JOB_INGEST_LOCATION: 'London, UK', ...extra,
  };
}
function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
function request(now = '2026-10-08T12:00:00.000Z', limit = 100, cursor = null, fetchImpl = async () => { throw new Error('unexpected fetch'); }) {
  return { cursor, limit, now, fetchImpl };
}
function brightRow(extra = {}) {
  return {
    url: 'https://www.linkedin.com/jobs/view/1234567890/', job_posting_id: '1234567890',
    job_title: 'Senior Software Engineer', company_name: 'Example Co', job_location: 'Remote, United States',
    job_description_formatted: 'Build reliable systems.', job_posted_date: '2026-10-01T00:00:00Z', job_posted_time: 'Oct 1, 2026',
    salary_min: 100000, salary_max: 150000, salary_currency: 'USD', salary_period: 'year',
    apply_link: 'https://careers.example.com/jobs/1234567890', application_availability: 'open', salary_source: 'employer-provided', ...extra,
  };
}
function apifyRow(id = '1234567890', extra = {}) {
  return {
    id, title: 'Senior Engineer', companyName: 'Example Co', jobUrl: `https://www.linkedin.com/jobs/view/${id}/`,
    applyUrl: 'https://careers.example.com/engineer', description: '<p>Build systems.</p>',
    salaryMin: 100000, salaryMax: 150000, salaryCurrency: 'USD', salaryPeriod: 'year', salarySource: 'LinkedIn estimate',
    workType: 'Remote', contractType: 'Full-time', publishedAt: '2026-10-01T00:00:00Z',
    locationParsed: { city: 'London', region: '', country: 'GB', formatted: 'London, UK' }, ...extra,
  };
}

test('Bright Data validates every configured URL field and refuses unknown origins', async () => {
  const { createBrightDataAdapter } = loadModule('brightdata.ts');
  const adapter = createBrightDataAdapter(env({
    BRIGHT_DATA_JOBS_INPUT_JSON: JSON.stringify([{ searchUrl: 'https://jobs.evil.example/search' }]),
  }));
  let called = false;
  const page = await adapter.nextPage(request(undefined, 100, null, async () => { called = true; return response({}); }));
  assert.equal(adapter.configured, false);
  assert.equal(page.status, 'malformed');
  assert.equal(page.rejectedRows, 1);
  assert.equal(called, false);
});

test('Bright Data refuses more configured inputs than the requested total cap before triggering', async () => {
  const { createBrightDataAdapter } = loadModule('brightdata.ts');
  const adapter = createBrightDataAdapter(env({
    BRIGHT_DATA_JOBS_INPUT_JSON: JSON.stringify([
      { url: 'https://www.linkedin.com/jobs/search/?keywords=engineer' },
      { jobUrl: 'https://www.indeed.com/jobs?q=engineer' },
    ]),
  }));
  let called = false;
  const page = await adapter.nextPage(request(undefined, 1, null, async () => { called = true; return response({ snapshot_id: 'should-not-start' }); }));
  assert.equal(page.status, 'malformed');
  assert.equal(page.complete, false);
  assert.equal(called, false);
});

test('Bright Data trigger, polling, ready transition, and snapshot download are resumable one-request steps', async () => {
  const { createBrightDataAdapter } = loadModule('brightdata.ts');
  const adapter = createBrightDataAdapter(env());
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) return response({ snapshot_id: 'snapshot_1' });
    if (calls.length === 2) return response({ status: 'running' });
    if (calls.length === 3) return response({ status: 'ready' });
    if (calls.length === 4) return response([brightRow({ job_state: 'CLOSED' })]);
    throw new Error('too many calls');
  };
  const start = await adapter.nextPage(request('2026-10-08T12:00:00Z', 100, null, fetchImpl));
  assert.equal(start.pending, true);
  assert.equal(start.status, 'success');
  assert.equal(calls.length, 1);
  const trigger = new URL(calls[0].url);
  assert.equal(trigger.origin, 'https://api.brightdata.com');
  assert.equal(trigger.pathname, '/datasets/v3/trigger');
  assert.equal(trigger.searchParams.get('dataset_id'), 'jobs-dataset');
  assert.equal(trigger.searchParams.has('token'), false);
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer bd-secret');
  const triggerBody = JSON.parse(calls[0].init.body);
  assert.equal(triggerBody.input.length, 1);
  assert.equal(triggerBody.limit_per_input, 100);

  const pending = await adapter.nextPage(request('2026-10-08T12:00:00Z', 100, start.nextCursor, fetchImpl));
  assert.equal(pending.pending, true);
  assert.equal(pending.nextCursor, start.nextCursor);
  assert.equal(calls.length, 2);
  const ready = await adapter.nextPage(request('2026-10-08T12:00:00Z', 100, pending.nextCursor, fetchImpl));
  assert.notEqual(ready.pending, true);
  assert.equal(calls.length, 3);
  const downloaded = await adapter.nextPage(request('2026-10-08T12:00:00Z', 100, ready.nextCursor, fetchImpl));
  assert.equal(calls.length, 4);
  assert.equal(downloaded.status, 'success');
  assert.equal(downloaded.complete, true);
  assert.equal(downloaded.jobs.length, 1);
  assert.equal(downloaded.jobs[0].closed, true);
  assert.equal(downloaded.jobs[0].providerJobId, 'linkedin:1234567890');
  assert.equal(downloaded.jobs[0].applyUrl, 'https://careers.example.com/jobs/1234567890');
  assert.equal(downloaded.jobs[0].salary.interval, 'year');
  assert.equal(downloaded.jobs[0].salary.isPredicted, undefined);
  assert.equal(downloaded.jobs[0].publishedAt, '2026-10-01T00:00:00.000Z');
});

test('Bright Data empty 202 snapshot response stays pending with the same cursor', async () => {
  const { createBrightDataAdapter } = loadModule('brightdata.ts');
  const adapter = createBrightDataAdapter(env());
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return response({ snapshot_id: 'snap202' });
    if (calls === 2) return response({ status: 'ready' });
    return new Response(null, { status: 202 });
  };
  const start = await adapter.nextPage(request(undefined, 100, null, fetchImpl));
  const ready = await adapter.nextPage(request(undefined, 100, start.nextCursor, fetchImpl));
  const pending = await adapter.nextPage(request(undefined, 100, ready.nextCursor, fetchImpl));
  assert.equal(pending.pending, true);
  assert.equal(pending.nextCursor, ready.nextCursor);
  assert.equal(pending.complete, false);
  assert.equal(calls, 3);
});

test('Bright Data reports snapshot overflow as malformed instead of silently dropping records', async () => {
  const { createBrightDataAdapter } = loadModule('brightdata.ts');
  const adapter = createBrightDataAdapter(env({ JOB_INGEST_MAX_ITEMS: '1' }));
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return response({ snapshot_id: 'snap2' });
    if (calls === 2) return response({ status: 'ready' });
    return response([brightRow(), brightRow({ job_posting_id: 'second', url: 'https://www.linkedin.com/jobs/view/second/' })]);
  };
  const start = await adapter.nextPage(request(undefined, 10, null, fetchImpl));
  const ready = await adapter.nextPage(request(undefined, 10, start.nextCursor, fetchImpl));
  const page = await adapter.nextPage(request(undefined, 10, ready.nextCursor, fetchImpl));
  assert.equal(page.jobs.length, 1);
  assert.equal(page.rejectedRows, 1);
  assert.equal(page.complete, false);
  assert.equal(page.status, 'malformed');
});

test('Bright Data rate limits remain visible as a typed result', async () => {
  const { createBrightDataAdapter } = loadModule('brightdata.ts');
  const adapter = createBrightDataAdapter(env());
  const page = await adapter.nextPage(request(undefined, 100, null, async () => response({ error: 'slow down' }, 429)));
  assert.equal(page.status, 'rate_limited');
  assert.equal(page.complete, false);
  assert.equal(page.nextCursor, null);
});

test('Bright Data mapper preserves long descriptions but requires salary currency and interval', () => {
  const { mapBrightDataJob } = loadModule('brightdata.ts');
  const mapped = mapBrightDataJob(brightRow({
    job_description_formatted: 'x'.repeat(110_000), salary_currency: '', salary_period: 'year', job_posted_date: 'Today',
  }), '2026-10-08T12:00:00Z');
  assert.ok(mapped);
  assert.equal(mapped.description.length, 100_000);
  assert.equal(mapped.descriptionTruncated, true);
  assert.equal(mapped.salary.min, null);
  assert.equal(mapped.salary.currency, '');
  assert.equal(mapped.publishedAt, undefined);
  const summaryOnly = mapBrightDataJob(brightRow({ job_description_formatted: undefined, job_summary: 'Search preview only' }), '2026-10-08T12:00:00Z');
  assert.equal(summaryOnly.description, 'Search preview only');
  assert.equal(summaryOnly.descriptionTruncated, true);
  const estimatedPay = mapBrightDataJob(brightRow({ salary_source: undefined, salary_period: undefined }), '2026-10-08T12:00:00Z');
  assert.equal(estimatedPay.salary.min, 100000);
  assert.equal(estimatedPay.salary.currency, 'USD');
  assert.equal(estimatedPay.salary.interval, 'unknown');
  assert.equal(estimatedPay.salary.isPredicted, true);
  assert.deepEqual(estimatedPay.inferredFields, ['salary']);
  const closed = mapBrightDataJob(brightRow({ application_availability: 'No longer accepting applications' }), '2026-10-08T12:00:00Z');
  assert.equal(closed.closed, true);
  assert.equal(mapBrightDataJob(brightRow({ url: 'https://jobs.unknown.example/view/123' }), '2026-10-08T12:00:00Z'), null);
});

test('Apify run is fixed-host, bearer-authenticated, and passes bounded actor input', async () => {
  const { createApifyAdapter } = loadModule('apify.ts');
  const adapter = createApifyAdapter(env({ JOB_INGEST_MAX_ITEMS: '900', APIFY_JOBS_MAX_COST_USD: '2.5' }));
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), init }); return response({ data: { id: 'run_1', defaultDatasetId: 'dataset_1', status: 'READY' } }); };
  const page = await adapter.nextPage(request(undefined, 100, null, fetchImpl));
  assert.equal(adapter.configured, true);
  assert.equal(page.pending, true);
  const url = new URL(calls[0].url);
  assert.equal(url.origin, 'https://api.apify.com');
  assert.equal(url.pathname, '/v2/actors/bebity~linkedin-jobs-scraper/runs');
  assert.equal(url.searchParams.get('maxTotalChargeUsd'), '2.5');
  assert.equal(url.searchParams.get('timeout'), '300');
  assert.equal(url.searchParams.has('token'), false);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer apify-secret');
  assert.equal(calls[0].init.redirect, 'error');
  const actorInput = JSON.parse(calls[0].init.body);
  assert.deepEqual(actorInput.titles, ['software engineer']);
  assert.deepEqual(actorInput.locations, ['London, UK']);
  assert.equal(actorInput.rows, 500);
  assert.equal(actorInput.companyProfile, false);
  assert.equal(actorInput.enrichCompany, false);
});

test('Apify polling resumes and dataset paging stays at 20 rows per request', async () => {
  const { createApifyAdapter } = loadModule('apify.ts');
  const adapter = createApifyAdapter(env());
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) return response({ data: { id: 'r_1', defaultDatasetId: 'd_1', status: 'RUNNING' } });
    if (calls.length === 2) return response({ data: { id: 'r_1', defaultDatasetId: 'd_1', status: 'RUNNING' } });
    if (calls.length === 3) return response({ data: { id: 'r_1', defaultDatasetId: 'd_1', status: 'SUCCEEDED' } });
    const urlObject = new URL(String(url));
    const offset = Number(urlObject.searchParams.get('offset'));
    if (offset === 0) return response(Array.from({ length: 20 }, (_, i) => apifyRow(String(i + 1))), 200, { 'x-apify-pagination-total': '25' });
    return response(Array.from({ length: 5 }, (_, i) => apifyRow(String(i + 21))), 200, { 'x-apify-pagination-total': '25' });
  };
  const start = await adapter.nextPage(request(undefined, 20, null, fetchImpl));
  assert.equal(start.pending, true);
  const pollPending = await adapter.nextPage(request(undefined, 20, start.nextCursor, fetchImpl));
  assert.equal(pollPending.pending, true);
  assert.equal(pollPending.nextCursor, start.nextCursor);
  const pollReady = await adapter.nextPage(request(undefined, 20, pollPending.nextCursor, fetchImpl));
  assert.notEqual(pollReady.pending, true);
  const first = await adapter.nextPage(request(undefined, 20, pollReady.nextCursor, fetchImpl));
  assert.equal(first.jobs.length, 20);
  assert.equal(first.complete, false);
  assert.ok(first.nextCursor);
  assert.equal(new URL(calls[3].url).searchParams.get('limit'), '20');
  const second = await adapter.nextPage(request(undefined, 20, first.nextCursor, fetchImpl));
  assert.equal(second.jobs.length, 5);
  assert.equal(second.complete, true);
  assert.equal(second.status, 'success');
  assert.equal(calls.length, 5);
  assert.equal(second.jobs[0].locations[0], 'London, UK');
  assert.equal(second.jobs[0].publishedAt, '2026-10-01T00:00:00.000Z');
  assert.equal(second.jobs[0].applyUrl, 'https://careers.example.com/engineer');
});

test('Apify maps CLOSED explicitly and leaves salary unknown without currency or period', () => {
  const { mapApifyJob } = loadModule('apify.ts');
  const mapped = mapApifyJob(apifyRow('abc-123', { jobState: 'CLOSED', salaryCurrency: '', salaryPeriod: 'year' }), '2026-10-08T12:00:00Z');
  assert.ok(mapped);
  assert.equal(mapped.closed, true);
  assert.equal(mapped.salary.min, null);
  assert.equal(mapped.salary.currency, '');
  assert.equal(mapped.remoteMode, 'remote');
  assert.equal(mapped.locations[0], 'London, UK');
  assert.equal(mapped.applyUrl, 'https://careers.example.com/engineer');
  assert.equal(mapped.salary.isPredicted, undefined);
  assert.deepEqual(mapped.inferredFields, []);
  const estimated = mapApifyJob(apifyRow('estimated', { salarySource: 'LinkedIn estimate', salaryPeriod: undefined }), '2026-10-08T12:00:00Z');
  assert.equal(estimated.salary.min, 100000);
  assert.equal(estimated.salary.currency, 'USD');
  assert.equal(estimated.salary.interval, 'unknown');
  assert.equal(estimated.salary.isPredicted, true);
  assert.deepEqual(estimated.inferredFields, ['salary']);
  const verified = mapApifyJob(apifyRow('verified', { salarySource: 'employer-provided' }), '2026-10-08T12:00:00Z');
  assert.equal(verified.salary.isPredicted, undefined);
  assert.deepEqual(verified.inferredFields, []);
  assert.equal(mapApifyJob(apifyRow('abc-123', { jobUrl: 'https://evil.example/jobs/abc' }), '2026-10-08T12:00:00Z'), null);
});

test('Apify keeps nonterminal shutdown statuses resumable', async () => {
  const { createApifyAdapter } = loadModule('apify.ts');
  const adapter = createApifyAdapter(env());
  const start = await adapter.nextPage(request(undefined, 20, null, async () => response({ data: { id: 'run_abort', defaultDatasetId: 'ds_abort', status: 'RUNNING' } })));
  const pending = await adapter.nextPage(request(undefined, 20, start.nextCursor, async () => response({ data: { id: 'run_abort', status: 'ABORTING' } })));
  assert.equal(pending.pending, true);
  assert.equal(pending.status, 'success');
  assert.equal(pending.nextCursor, start.nextCursor);
});

test('Apify failures and rate limits are surfaced without follow-up requests', async () => {
  const { createApifyAdapter } = loadModule('apify.ts');
  const failed = createApifyAdapter(env());
  const failedPage = await failed.nextPage(request(undefined, 20, null, async () => response({ error: 'failed' }, 503)));
  assert.equal(failedPage.status, 'unavailable');
  const limited = createApifyAdapter(env());
  const limitedPage = await limited.nextPage(request(undefined, 20, null, async () => response({ error: 'slow down' }, 429)));
  assert.equal(limitedPage.status, 'rate_limited');
});
