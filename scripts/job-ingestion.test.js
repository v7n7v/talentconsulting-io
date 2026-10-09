const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
function loadModule(file) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-job-ingestion-'));
  const outfile = path.join(dir, `${path.basename(file, '.ts')}.cjs`);
  buildSync({ entryPoints: [path.join(repoRoot, 'lib', file)], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  return require(outfile);
}

test('job dates normalize valid values and leave invalid, empty, and non-finite inputs unknown', () => {
  const { normalizeJobDate } = loadModule('job-ingestion.ts');
  assert.equal(normalizeJobDate('2026-02-03T04:05:06Z'), '2026-02-03T04:05:06.000Z');
  assert.equal(normalizeJobDate(0), '');
  assert.equal(normalizeJobDate(''), '');
  assert.equal(normalizeJobDate('not-a-date'), '');
  assert.equal(normalizeJobDate(Number.NaN), '');
  assert.equal(normalizeJobDate(Number.POSITIVE_INFINITY), '');
  assert.equal(normalizeJobDate(undefined), '');
});

test('employment, workplace, salary interval, and finite salary normalization preserve unknowns', () => {
  const { normalizeEmploymentType, normalizeWorkplaceType, normalizeSalaryInterval, finiteSalary } = loadModule('job-ingestion.ts');
  assert.equal(normalizeEmploymentType('FULL_TIME'), 'Full-time');
  assert.equal(normalizeEmploymentType('contractor'), 'Contract');
  assert.equal(normalizeEmploymentType(undefined), 'Not listed');
  assert.equal(normalizeWorkplaceType('Hybrid'), 'hybrid');
  assert.equal(normalizeWorkplaceType(undefined), 'unknown');
  assert.equal(normalizeSalaryInterval('annually'), 'year');
  assert.equal(normalizeSalaryInterval('per hour'), 'hour');
  assert.equal(normalizeSalaryInterval(undefined), 'unknown');
  assert.equal(finiteSalary(0), 0);
  assert.equal(finiteSalary(100000), 100000);
  assert.equal(finiteSalary(Number.NaN), null);
  assert.equal(finiteSalary(Number.POSITIVE_INFINITY), null);
  assert.equal(finiteSalary(-1), null);
  assert.equal(finiteSalary('100'), null);
});

test('comparable annual salary accepts USD annual and legacy optional interval only', () => {
  const { comparableAnnualSalary } = loadModule('job-ingestion.ts');
  assert.equal(comparableAnnualSalary({ min: 80000, max: 100000, currency: 'USD', interval: 'year' }), 100000);
  assert.equal(comparableAnnualSalary({ min: 80000, max: null, currency: 'USD' }), 80000);
  assert.equal(comparableAnnualSalary({ min: 80000, max: 100000, currency: 'GBP', interval: 'year' }), null);
  assert.equal(comparableAnnualSalary({ min: 25, max: 40, currency: 'USD', interval: 'hour' }), null);
  assert.equal(comparableAnnualSalary({ min: 80000, max: 100000, currency: 'USD', interval: 'unknown' }), null);
});

test('source policy disables Remotive and gates Adzuna on an explicit license flag', { concurrency: false }, () => {
  const { isJobSourceEnabled, enabledJobSources, DEFAULT_JOB_SOURCES } = loadModule('job-source-policy.ts');
  const previous = process.env.ADZUNA_LICENSED;
  try {
    delete process.env.ADZUNA_LICENSED;
    assert.equal(isJobSourceEnabled('remotive'), false);
    assert.equal(isJobSourceEnabled('adzuna'), false);
    assert.equal(isJobSourceEnabled('unknown-provider'), false);
    assert.equal(DEFAULT_JOB_SOURCES.includes('adzuna'), false);
    assert.equal(DEFAULT_JOB_SOURCES.includes('remotive'), false);
    assert.deepEqual(enabledJobSources(['Greenhouse', 'REMOTIVE', 'Adzuna', 'greenhouse']), ['greenhouse']);
    process.env.ADZUNA_LICENSED = 'true';
    assert.equal(isJobSourceEnabled('adzuna'), true);
    assert.deepEqual(enabledJobSources(['Adzuna', 'Remotive']), ['adzuna']);
    process.env.ADZUNA_LICENSED = 'TRUE';
    assert.equal(isJobSourceEnabled('adzuna'), false);
  } finally {
    if (previous === undefined) delete process.env.ADZUNA_LICENSED;
    else process.env.ADZUNA_LICENSED = previous;
  }
});
