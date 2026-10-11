const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');
const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'taco-job-display-')), 'display.cjs');
buildSync({ entryPoints: [path.join(__dirname, '../lib/job-display.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const { formatJobSalary } = require(outfile);

test('salary labels preserve currency and period instead of displaying an annual USD estimate', () => {
  const hourly = formatJobSalary({ min: 30, max: 45, currency: 'GBP', interval: 'hour' });
  assert.match(hourly, /GBP/);
  assert.match(hourly, /30/);
  assert.match(hourly, /45/);
  assert.match(hourly, /\/hr$/);
  assert.doesNotMatch(hourly, /\$/);
  assert.equal(hourly, 'GBP 30–45/hr');
  const annual = formatJobSalary({ min: 120000, max: 150000, currency: 'USD', interval: 'year' });
  assert.match(annual, /\$120K.*\$150K\/yr$/);
});

test('absent and invalid pay stay unknown; old records remain readable', () => {
  assert.equal(formatJobSalary({ min: null, max: NaN, currency: 'USD' }), 'Not listed');
  const unknown = formatJobSalary({ min: 50000, max: null, currency: 'UNKNOWN', interval: 'unknown' });
  assert.match(unknown, /period not listed/);
  assert.match(unknown, /currency not listed/);
  assert.doesNotMatch(unknown, /\$/);
  assert.match(formatJobSalary({ min: 100000, max: null, currency: 'USD' }), /^\$100K\+$/);
  assert.match(formatJobSalary({ min: 0, max: 25.5, currency: 'EUR', interval: 'hour' }), /25\.5.*\/hr$/);
});
