const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
function loadSelection() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-job-selection-'));
  const outfile = path.join(dir, 'job-search-selection.cjs');
  buildSync({ entryPoints: [path.join(repoRoot, 'lib', 'job-search-selection.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  return require(outfile);
}
function job(overrides = {}) {
  return {
    id: 'id', title: 'Engineer', company: 'Example', location: 'New York, NY', locations: [], country: 'us',
    remoteMode: 'onsite', employmentType: 'Full-time', salary: { min: 90000, max: 100000, currency: 'USD', interval: 'year' },
    postedDate: '2026-01-01T00:00:00Z', url: 'https://jobs.example/1', ...overrides,
  };
}

test('strict remote and full-time filters require known matching values', () => {
  const { filterJobSearchCandidates } = loadSelection();
  const jobs = [
    job({ id: 'remote-ft', remoteMode: 'remote', employmentType: 'full-time' }),
    job({ id: 'unknown-remote', remoteMode: 'unknown' }),
    job({ id: 'hybrid', remoteMode: 'hybrid' }),
    job({ id: 'unknown-type', remoteMode: 'remote', employmentType: 'Not listed' }),
    job({ id: 'contract', remoteMode: 'remote', employmentType: 'Contract' }),
  ];
  assert.deepEqual(filterJobSearchCandidates(jobs, { query: '', remote: true }).map(j => j.id), ['remote-ft', 'unknown-type', 'contract']);
  assert.deepEqual(filterJobSearchCandidates(jobs, { query: '', fullTime: true }).map(j => j.id), ['remote-ft', 'unknown-remote', 'hybrid']);
  assert.deepEqual(filterJobSearchCandidates(jobs, { query: '', remote: true, fullTime: true }).map(j => j.id), ['remote-ft']);
});

test('secondary locations and New York state aliases match; known country mismatches filter while unknown country remains', () => {
  const { filterJobSearchCandidates } = loadSelection();
  const jobs = [
    job({ id: 'secondary', location: 'United States', locations: ['New York City, New York'] }),
    job({ id: 'abbrev', location: 'New York, NY' }),
    job({ id: 'wrong-country', location: 'London, UK', country: 'gb' }),
    job({ id: 'unknown-country', location: 'Remote', country: '' }),
    job({ id: 'placeholder-country', location: 'Remote', country: 'ZZ' }),
  ];
  assert.deepEqual(filterJobSearchCandidates(jobs, { query: '', location: 'New York, NY', country: 'us' }).map(j => j.id), ['secondary', 'abbrev']);
  assert.deepEqual(filterJobSearchCandidates(jobs, { query: '', country: 'us' }).map(j => j.id), ['secondary', 'abbrev', 'unknown-country', 'placeholder-country']);
});

test('salary floor compares only known annual USD and retains unknown or incomparable salary', () => {
  const { filterJobSearchCandidates } = loadSelection();
  const jobs = [
    job({ id: 'low', salary: { min: 50000, max: 70000, currency: 'USD', interval: 'year' } }),
    job({ id: 'high', salary: { min: 90000, max: 110000, currency: 'USD', interval: 'year' } }),
    job({ id: 'unknown', salary: { min: null, max: null, currency: 'USD', interval: 'unknown' } }),
    job({ id: 'hourly', salary: { min: 30, max: 40, currency: 'USD', interval: 'hour' } }),
    job({ id: 'foreign', salary: { min: 100000, max: 200000, currency: 'GBP', interval: 'year' } }),
  ];
  assert.deepEqual(filterJobSearchCandidates(jobs, { query: '', salaryMin: 80000 }).map(j => j.id), ['high', 'unknown', 'hourly', 'foreign']);
});

test('date and salary sorting put invalid dates and incomparable salary at the end', () => {
  const { sortJobSearchCandidates } = loadSelection();
  const jobs = [
    job({ id: 'invalid-date', postedDate: 'not a date', salary: { min: null, max: null, currency: 'USD', interval: 'unknown' } }),
    job({ id: 'older', postedDate: '2025-01-01T00:00:00Z', salary: { min: null, max: null, currency: 'USD', interval: 'unknown' } }),
    job({ id: 'newer', postedDate: '2026-05-01T00:00:00Z', salary: { min: null, max: null, currency: 'USD', interval: 'unknown' } }),
    job({ id: 'hourly', postedDate: 'not-a-date', salary: { min: 200, max: 300, currency: 'USD', interval: 'hour' } }),
    job({ id: 'foreign', postedDate: 'not-a-date', salary: { min: 200000, max: 300000, currency: 'GBP', interval: 'year' } }),
    job({ id: 'annual', postedDate: 'not-a-date', salary: { min: 120000, max: 150000, currency: 'USD', interval: 'year' } }),
  ];
  assert.deepEqual(sortJobSearchCandidates(jobs, 'date').map(j => j.id), ['newer', 'older', 'annual', 'foreign', 'hourly', 'invalid-date']);
  assert.deepEqual(sortJobSearchCandidates(jobs, 'salary').map(j => j.id), ['annual', 'foreign', 'hourly', 'invalid-date', 'newer', 'older']);
});

test('equal sort scores have deterministic stable ordering and local pages do not overlap', () => {
  const { sortJobSearchCandidates, selectJobSearchPage } = loadSelection();
  const jobs = [job({ id: 'c', identityKey: 'c', matchScore: 80 }), job({ id: 'a', identityKey: 'a', matchScore: 80 }), job({ id: 'b', identityKey: 'b', matchScore: 80 })];
  assert.deepEqual(sortJobSearchCandidates(jobs, 'relevance').map(j => j.id), ['a', 'b', 'c']);
  const all = [
    job({ id: 'a', identityKey: 'a', matchScore: 90 }), job({ id: 'b', identityKey: 'b', matchScore: 80 }),
    job({ id: 'c', identityKey: 'c', matchScore: 70 }), job({ id: 'd', identityKey: 'd', matchScore: 60 }),
  ];
  const first = selectJobSearchPage(all, { query: '', page: 1, resultsPerPage: 2 });
  const second = selectJobSearchPage(all, { query: '', page: 2, resultsPerPage: 2 });
  assert.deepEqual(first.jobs.map(j => j.id), ['a', 'b']);
  assert.deepEqual(second.jobs.map(j => j.id), ['c', 'd']);
  assert.equal(first.totalCount, 4);
  assert.equal(second.totalCount, 4);
  assert.equal(first.jobs.some(j => second.jobs.some(other => other.id === j.id)), false);
});

test('search parameters are bounded and normalized for malformed inputs', () => {
  const { normalizeJobSearchParams } = loadSelection();
  const params = normalizeJobSearchParams({ query: ` ${'x'.repeat(240)} `, location: '  Remote  ', country: ' USA ', page: Infinity, resultsPerPage: 900, salaryMin: 20_000_000, sortBy: 'bogus' });
  assert.equal(params.query.length, 200);
  assert.equal(params.location, 'Remote');
  assert.equal(params.country, 'usa');
  assert.equal(params.page, 1);
  assert.equal(params.resultsPerPage, 50);
  assert.equal(params.salaryMin, 10_000_000);
  assert.equal(params.sortBy, 'relevance');
  assert.equal(normalizeJobSearchParams({ query: '', page: -3, resultsPerPage: 0 }).page, 1);
});

test('URL query parsing applies defaults, clamps valid upper bounds, and rejects malformed controls', () => {
  const { parseJobSearchQuery } = loadSelection();
  const defaults = parseJobSearchQuery(new URLSearchParams());
  assert.equal(defaults.query, 'software engineer');
  assert.equal(defaults.country, 'us');
  assert.equal(defaults.page, 1);
  assert.equal(defaults.resultsPerPage, 20);
  assert.equal(defaults.salaryMin, 0);
  assert.equal(defaults.remote, false);
  assert.equal(defaults.fullTime, false);

  const valid = parseJobSearchQuery(new URLSearchParams('query=data+engineer&country=GB&page=2000&limit=80&salaryMin=10000001&remote=true&fullTime=false&sortBy=date'));
  assert.equal(valid.query, 'data engineer');
  assert.equal(valid.country, 'gb');
  assert.equal(valid.page, 1000);
  assert.equal(valid.resultsPerPage, 50);
  assert.equal(valid.salaryMin, 10_000_000);
  assert.equal(valid.remote, true);
  assert.equal(valid.fullTime, false);
  assert.equal(valid.sortBy, 'date');

  for (const search of ['page=0', 'page=-1', 'page=1.5', 'page=1e2', 'limit=0', 'salaryMin=-1', 'salaryMin=abc', 'remote=1', 'fullTime=yes', 'sortBy=score']) {
    assert.throws(() => parseJobSearchQuery(new URLSearchParams(search)), RangeError, search);
  }
});
