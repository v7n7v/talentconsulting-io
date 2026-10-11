const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
function loadAdapter() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-fantastic-provider-'));
  const outfile = path.join(dir, 'fantastic.cjs');
  buildSync({ entryPoints: [path.join(repoRoot, 'lib/job-providers/fantastic.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  return require(outfile);
}

const NOW = '2026-10-08T12:00:00.000Z';
const ENV = { FANTASTIC_JOBS_ENABLED: 'true', FANTASTIC_JOBS_API_KEY: 'synthetic-test-key' };
function fixture(overrides = {}) {
  return {
    id: 41002,
    title: 'Senior Platform Engineer',
    organization: 'Example Labs',
    source: 'greenhouse',
    source_type: 'ats',
    url: 'https://job-boards.greenhouse.io/example/jobs/41002',
    date_posted: '2026-10-07T15:00:00Z',
    date_created: '2026-10-07T15:14:00Z',
    date_valid_through: '2026-11-07T00:00:00Z',
    description_text: 'Build reliable services and collaborate with the infrastructure team.',
    employment_type: ['Full Time'],
    location_type: 'TELECOMMUTE',
    locations: [{ address: { addressLocality: 'Brooklyn', addressRegion: 'New York', addressCountry: 'United States' } }],
    salary: { currency: 'USD', value: { minValue: 125000, maxValue: 155000, unitText: 'YEAR' } },
    ai_salary_min_value: 110000,
    ai_work_arrangement: 'Remote Solely',
    ai_key_skills: ['Kubernetes'],
    locations_derived: ['Brooklyn, NY, USA'],
    ...overrides,
  };
}
function request({ cursor = null, limit = 20, knownIds = [], fetchImpl, now = NOW }) {
  return { cursor, limit, knownIds, now, fetchImpl };
}
function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function unpack(cursor) {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
}

test('adapter is disabled unless explicitly enabled and configured with a key', async () => {
  const { createFantasticAdapter } = loadAdapter();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('unexpected fetch'); };
  for (const env of [{}, { ...ENV, FANTASTIC_JOBS_ENABLED: 'TRUE' }, { FANTASTIC_JOBS_ENABLED: 'true' }]) {
    const adapter = createFantasticAdapter(env);
    assert.equal(adapter.configured, false);
    assert.equal(adapter.requestsPerPage, 1);
    assert.equal((await adapter.nextPage(request({ fetchImpl }))).status, 'disabled');
  }
  assert.equal(calls, 0);
});

test('source-backed mapping preserves full description, publication/index dates and normalized source facts', () => {
  const { mapFantasticJob } = loadAdapter();
  const job = mapFantasticJob(fixture(), NOW);
  assert.ok(job);
  assert.equal(job.provider, 'fantastic');
  assert.equal(job.providerJobId, '41002');
  assert.equal(job.sourceJobId, '41002');
  assert.equal(job.origin, 'greenhouse');
  assert.equal(job.publishedAt, '2026-10-07T15:00:00.000Z');
  assert.equal(job.discoveredAt, '2026-10-07T15:14:00.000Z');
  assert.equal(job.validThrough, '2026-11-07T00:00:00.000Z');
  assert.equal(job.remoteMode, 'remote');
  assert.equal(job.country, 'United States');
  assert.deepEqual(job.salary, { min: 125000, max: 155000, currency: 'USD', interval: 'year' });
  assert.equal(job.description, fixture().description_text);
  assert.equal(job.observedAt, NOW);
  assert.ok(job.inferredFields.includes('ai_salary_min_value'));
  assert.ok(job.inferredFields.includes('ai_work_arrangement'));
  assert.ok(job.inferredFields.includes('locations_derived'));
  assert.equal(mapFantasticJob(fixture({ date_posted: '', date_created: 0, date_valid_through: 'not-a-date' }), NOW).publishedAt, undefined);
  const inferred = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`ai_field_${i}`, true]));
  assert.equal(mapFantasticJob(fixture(inferred), NOW).inferredFields.length, 50);
  assert.equal(Object.keys(job).some(key => /person|contact|email|manager/i.test(key)), false);
});

test('AI-only compensation and work-mode hints remain unknown; source URL family mismatch rejects row', () => {
  const { mapFantasticJob } = loadAdapter();
  const unknown = mapFantasticJob(fixture({ salary: null, employment_type: [], location_type: undefined }), NOW);
  assert.ok(unknown);
  assert.deepEqual(unknown.salary, { min: null, max: null, currency: '', interval: 'unknown' });
  assert.equal(unknown.remoteMode, 'unknown');
  assert.equal(unknown.employmentType, 'Not listed');
  assert.equal(mapFantasticJob(fixture({ source: 'ashby' }), NOW), null);
  assert.equal(mapFantasticJob(fixture({ title: '  ' }), NOW), null);
  assert.equal(mapFantasticJob(fixture({ id: 'vendor-id' }), NOW), null);
  assert.equal(mapFantasticJob(fixture({ url: 'https://jobs.example.test/41002' }), NOW), null);
});

test('long full description is capped and visibly marked truncated', () => {
  const { mapFantasticJob } = loadAdapter();
  const job = mapFantasticJob(fixture({ description_text: 'x'.repeat(100_100) }), NOW);
  assert.equal(job.description.length, 100_000);
  assert.equal(job.descriptionTruncated, true);
});

test('active cursor stabilizes a 24-hour overlap window, advances by FJ id, then enters expiry phase', async () => {
  const { createFantasticAdapter } = loadAdapter();
  const adapter = createFantasticAdapter(ENV);
  const urls = [];
  const initOptions = [];
  let call = 0;
  const fetchImpl = async (url, init) => {
    urls.push(new URL(String(url)));
    initOptions.push(init);
    call += 1;
    if (call === 1) return response(Array.from({ length: 20 }, (_, i) => fixture({ id: 1001 + i, url: `https://job-boards.greenhouse.io/example/jobs/${1001 + i}` })));
    return response([]);
  };
  const first = await adapter.nextPage(request({ fetchImpl }));
  assert.equal(first.jobs.length, 20);
  assert.equal(first.complete, false);
  assert.deepEqual(Object.fromEntries(urls[0].searchParams), {
    time_frame: '7d', description_format: 'text', limit: '20',
    date_created_gte: '2026-10-07T12:00:00.000Z', date_created_lt: NOW,
    source: 'greenhouse,lever.co,ashby,workday', cursor: '0',
  });
  assert.equal(urls[0].origin, 'https://data.fantastic.jobs');
  assert.equal(urls[0].pathname, '/v1/active-ats');
  assert.equal(initOptions[0].method, 'GET');
  assert.equal(initOptions[0].headers.Authorization, 'Bearer synthetic-test-key');
  assert.equal(initOptions[0].redirect, 'error');

  const cursorState = unpack(first.nextCursor);
  assert.equal(cursorState.lastId, '1020');
  const second = await adapter.nextPage(request({ cursor: first.nextCursor, fetchImpl, now: '2026-10-09T12:00:00.000Z' }));
  assert.equal(second.jobs.length, 0);
  assert.equal(second.complete, false);
  assert.equal(urls[1].searchParams.get('cursor'), '1020');
  assert.equal(urls[1].searchParams.get('date_created_gte'), urls[0].searchParams.get('date_created_gte'));
  assert.equal(urls[1].searchParams.get('date_created_lt'), NOW);
  assert.equal(unpack(second.nextCursor).phase, 'expired');
});

test('optional title and location filters remain in the fixed cursor window', async () => {
  const { createFantasticAdapter } = loadAdapter();
  const adapter = createFantasticAdapter({ ...ENV, JOB_INGEST_QUERY: 'platform engineer', JOB_INGEST_LOCATION: 'United States' });
  let seen;
  const fetchImpl = async url => { seen = new URL(String(url)); return response([]); };
  const result = await adapter.nextPage(request({ fetchImpl }));
  assert.equal(seen.searchParams.get('title'), 'platform engineer');
  assert.equal(seen.searchParams.get('location'), 'United States');
  const decoded = unpack(result.nextCursor);
  assert.equal(decoded.title, 'platform engineer');
  assert.equal(decoded.location, 'United States');
});

test('expired IDs are intersected with known catalog IDs and drained in small cursor batches without extra HTTP', async () => {
  const { createFantasticAdapter } = loadAdapter();
  const adapter = createFantasticAdapter(ENV);
  let calls = 0;
  const fetchImpl = async url => {
    calls += 1;
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, '/v1/expired-ats');
    assert.equal(parsed.searchParams.get('time_frame'), '1m');
    assert.equal(parsed.origin, 'https://data.fantastic.jobs');
    return response([...Array.from({ length: 25 }, (_, i) => i + 1), 999]);
  };
  const knownIds = [...Array.from({ length: 25 }, (_, i) => String(i + 1)), '700'];
  const first = await adapter.nextPage(request({ cursor: Buffer.from(JSON.stringify({ phase: 'expired', since: '2026-10-07T12:00:00Z', until: NOW })).toString('base64url'), knownIds, fetchImpl }));
  assert.deepEqual(first.closedIds, [...Array.from({ length: 20 }, (_, i) => String(i + 1))]);
  assert.equal(first.complete, false);
  assert.equal(unpack(first.nextCursor).ids.length, 5);
  const second = await adapter.nextPage(request({ cursor: first.nextCursor, knownIds: [], fetchImpl }));
  assert.deepEqual(second.closedIds, ['21', '22', '23', '24', '25']);
  assert.equal(second.complete, true);
  assert.equal(second.nextCursor, null);
  assert.equal(calls, 1);
});

test('malformed provider payload and HTTP 429 yield typed malformed and rate-limited outcomes', async () => {
  const { createFantasticAdapter } = loadAdapter();
  const adapter = createFantasticAdapter(ENV);
  const emptyActive = Buffer.from(JSON.stringify({ phase: 'active', since: '2026-10-07T12:00:00Z', until: NOW })).toString('base64url');
  const malformed = await adapter.nextPage(request({ cursor: emptyActive, fetchImpl: async () => response({ jobs: [] }) }));
  assert.equal(malformed.status, 'malformed');
  assert.equal(malformed.complete, false);
  const limited = await adapter.nextPage(request({ fetchImpl: async () => response({ error: 'slow down' }, 429) }));
  assert.equal(limited.status, 'rate_limited');
});

test('expired payload and oversized known-id input fail closed as malformed', async () => {
  const { createFantasticAdapter } = loadAdapter();
  const adapter = createFantasticAdapter(ENV);
  const expiredCursor = Buffer.from(JSON.stringify({ phase: 'expired', since: '2026-10-07T12:00:00Z', until: NOW })).toString('base64url');
  const badFeed = await adapter.nextPage(request({ cursor: expiredCursor, knownIds: ['1'], fetchImpl: async () => response({ ids: [1] }) }));
  assert.equal(badFeed.status, 'malformed');
  const tooManyIds = await adapter.nextPage(request({ cursor: expiredCursor, knownIds: Array.from({ length: 501 }, (_, i) => String(i)), fetchImpl: async () => response([1]) }));
  assert.equal(tooManyIds.status, 'malformed');
});

test('invalid configured source list disables the adapter instead of removing the source filter', async () => {
  const { createFantasticAdapter } = loadAdapter();
  let calls = 0;
  const adapter = createFantasticAdapter({ ...ENV, FANTASTIC_JOBS_SOURCES: 'linkedin,indeed' });
  assert.equal(adapter.configured, false);
  assert.equal((await adapter.nextPage(request({ fetchImpl: async () => { calls += 1; return response([]); } }))).status, 'disabled');
  assert.equal(calls, 0);
});

test('oversized or non-advancing active pages fail malformed rather than finishing or looping', async () => {
  const { createFantasticAdapter } = loadAdapter();
  const adapter = createFantasticAdapter(ENV);
  const tooMany = await adapter.nextPage(request({ limit: 2, fetchImpl: async () => response([
    fixture({ id: 11, url: 'https://job-boards.greenhouse.io/example/jobs/11' }),
    fixture({ id: 12, url: 'https://job-boards.greenhouse.io/example/jobs/12' }),
    fixture({ id: 13, url: 'https://job-boards.greenhouse.io/example/jobs/13' }),
  ]) }));
  assert.equal(tooMany.status, 'malformed');
  const activeCursor = Buffer.from(JSON.stringify({ phase: 'active', lastId: '12', since: '2026-10-07T12:00:00Z', until: NOW })).toString('base64url');
  const nonAdvancing = await adapter.nextPage(request({ cursor: activeCursor, fetchImpl: async () => response([
    fixture({ id: 12, url: 'https://job-boards.greenhouse.io/example/jobs/12' }),
  ]) }));
  assert.equal(nonAdvancing.status, 'malformed');
  assert.equal(nonAdvancing.complete, false);
});

test('valid rows survive beside source-rejected rows and preserve rejected count', async () => {
  const { createFantasticAdapter } = loadAdapter();
  const adapter = createFantasticAdapter(ENV);
  const result = await adapter.nextPage(request({ fetchImpl: async () => response([
    fixture({ id: 501, url: 'https://job-boards.greenhouse.io/example/jobs/501' }),
    fixture({ id: 502, source: 'ashby', url: 'https://job-boards.greenhouse.io/example/jobs/502' }),
  ]) }));
  assert.equal(result.status, 'success');
  assert.equal(result.jobs.length, 1);
  assert.equal(result.rejectedRows, 1);
});
