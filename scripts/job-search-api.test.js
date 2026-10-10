const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
function loadApi() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-job-search-api-'));
  const outfile = path.join(dir, 'job-search-api.cjs');
  buildSync({ entryPoints: [path.join(repoRoot, 'lib', 'job-search-api.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  return require(outfile);
}
const ENV_KEYS = ['ADZUNA_LICENSED', 'ADZUNA_APP_ID', 'ADZUNA_API_KEY'];
async function withEnv(values, callback) {
  const previous = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const key of ENV_KEYS) values[key] === undefined ? delete process.env[key] : process.env[key] = values[key];
  try { return await callback(); }
  finally { for (const key of ENV_KEYS) previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key]; }
}
async function withFetch(fetchImpl, callback) {
  const previous = global.fetch;
  global.fetch = fetchImpl;
  try { return await callback(); } finally { global.fetch = previous; }
}

test('skill matching uses technical tokens, aliases, and context for ambiguous words', () => {
  const { extractSkillsFromDescription: extract } = loadApi();
  assert.deepEqual(extract('We react quickly to goals. This is a go-to-market role.'), []);
  assert.deepEqual(extract('Go developer using React framework, Spark SQL, C++, C#, CI/CD, Next.js, Node.js, PostgreSQL, Kubernetes.').sort(), [
    'C#', 'C++', 'CI/CD', 'Go', 'Kubernetes', 'Next.js', 'Node.js', 'PostgreSQL', 'React', 'Spark', 'Sql',
  ]);
  assert.deepEqual(extract('Golang and Go developer; Postgres/PostgreSQL; k8s/Kubernetes; Nextjs/Next.js.').sort(), [
    'Go', 'Kubernetes', 'Next.js', 'PostgreSQL',
  ]);
  assert.deepEqual(extract('I use React.'), []);
  assert.deepEqual(extract('Skills: Go, React, Spark, Python').sort(), ['Go', 'Python', 'React', 'Spark']);
  assert.deepEqual(extract('Experience with React and TypeScript').sort(), ['React', 'TypeScript']);
});

test('disabled providers are explicit and no license or keys means no network request', { concurrency: false }, async () => {
  const api = loadApi();
  let calls = 0;
  await withEnv({}, () => withFetch(async () => { calls += 1; throw new Error('unexpected network'); }, async () => {
    const adzuna = await api.searchJobsAdzuna({ query: 'disabled-test' });
    assert.equal(adzuna.status, 'disabled');
    assert.deepEqual(adzuna.diagnostics.map(d => d.status), ['disabled']);
    assert.equal((await api.searchJobsRemotive({ query: 'disabled-test' })).status, 'disabled');
    const aggregate = await api.searchJobs({ query: 'disabled-test' });
    assert.equal(aggregate.status, 'disabled');
    assert.deepEqual(aggregate.diagnostics.map(d => d.provider), ['adzuna', 'remotive']);
    assert.equal(calls, 0);
  }));
});

test('Adzuna fixture preserves unknowns, annual salary, country currency, and per-query cache behavior', { concurrency: false }, async () => {
  const api = loadApi();
  const urls = [];
  await withEnv({ ADZUNA_LICENSED: 'true', ADZUNA_APP_ID: 'fixture-id', ADZUNA_API_KEY: 'fixture-key' }, () => withFetch(async url => {
    urls.push(String(url));
    return { ok: true, json: async () => ({ results: [
      { id: 1, title: 'Engineer', salary_min: 55000, salary_max: 65000, created: '2026-10-01T00:00:00Z', contract_time: 'full_time', description: 'Uses Python', redirect_url: 'https://example.test/apply', location: { display_name: 'London' } },
      { id: 2, title: 'Consultant', salary_min: 'bad', description: 'Uses SQL', redirect_url: 'https://example.test/consultant' },
      { id: 3, title: '   ', redirect_url: 'https://example.test/bad' },
    ] }) };
  }, async () => {
    const params = { query: 'fixture-job-search-cache', country: 'gb', remote: false, resultsPerPage: 7, numPages: 2 };
    const first = await api.searchJobsAdzuna(params);
    assert.equal(first.status, 'success');
    assert.equal(first.jobs.length, 2);
    assert.deepEqual(first.jobs[0].salary, { min: 55000, max: 65000, currency: 'GBP', interval: 'year', isPredicted: false });
    assert.equal(first.jobs[0].employmentType, 'Full-time');
    assert.equal(first.jobs[0].postedDate, '2026-10-01T00:00:00.000Z');
    assert.equal(first.jobs[0].descriptionPreview, 'Uses Python');
    assert.equal(first.jobs[1].salary.min, null);
    assert.equal(first.jobs[1].salary.currency, 'GBP');
    assert.equal(first.jobs[1].salary.interval, 'unknown');
    assert.equal(first.jobs[1].employmentType, 'Not listed');
    assert.equal(first.jobs[1].postedDate, '');
    assert.equal(first.jobs[1].url, 'https://example.test/consultant');
    assert.equal(first.diagnostics[0].rejectedRows, 1);
    assert.equal(first.jobs[1].company, 'Not listed');
    first.jobs[0].title = 'caller mutation';
    const cached = await api.searchJobsAdzuna(params);
    assert.equal(cached.cached, true);
    assert.equal(cached.jobs[0].title, 'Engineer');
    await api.searchJobsAdzuna({ ...params, remote: true });
    await api.searchJobsAdzuna({ ...params, resultsPerPage: 8 });
    assert.equal(urls.length, 3);
    assert.equal(urls[0].includes('results_per_page=7'), true);
    assert.equal(urls[2].includes('results_per_page=8'), true);
  }));
});

test('invalid dates and currency intervals format as unknown or localized values', () => {
  const { timeAgo, formatSalaryRange } = loadApi();
  assert.equal(timeAgo(''), 'Date not listed');
  assert.equal(timeAgo('not-a-date'), 'Date not listed');
  assert.equal(formatSalaryRange(50000, 65000), '$50k – $65k');
  assert.equal(formatSalaryRange(50000, 65000, 'GBP', 'year'), '£50k – £65k/yr');
  assert.equal(formatSalaryRange(25, 30, 'USD', 'hour'), '$25 – $30/hr');
  assert.equal(formatSalaryRange(1000, null, 'BOGUS'), 'BOGUS 1,000+');
});

test('annual USD salary targets are not sent as foreign-currency upstream thresholds', { concurrency: false }, async () => {
  const api = loadApi();
  const urls = [];
  await withEnv({ ADZUNA_LICENSED: 'true', ADZUNA_APP_ID: 'fixture-id', ADZUNA_API_KEY: 'fixture-key' }, () => withFetch(async url => {
    urls.push(new URL(String(url)));
    return { ok: true, json: async () => ({ results: [] }) };
  }, async () => {
    await api.searchJobsAdzuna({ query: 'foreign-salary-floor', country: 'gb', salaryMin: 80000 });
    await api.searchJobsAdzuna({ query: 'domestic-salary-floor', country: 'us', salaryMin: 80000 });
    assert.equal(urls[0].searchParams.has('salary_min'), false);
    assert.equal(urls[1].searchParams.get('salary_min'), '80000');
  }));
});

test('failed primary status survives a disabled fallback and diagnostics are aggregated', { concurrency: false }, async () => {
  const api = loadApi();
  await withEnv({ ADZUNA_LICENSED: 'true', ADZUNA_APP_ID: 'fixture-id', ADZUNA_API_KEY: 'fixture-key' }, () => withFetch(async () => ({ ok: false, status: 503, statusText: 'Unavailable' }), async () => {
    const result = await api.searchJobs({ query: 'fixture-primary-failure' });
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.diagnostics.map(d => [d.provider, d.status]), [['adzuna', 'unavailable'], ['remotive', 'disabled']]);
  }));
});

test('malformed Adzuna payload is reported instead of becoming an empty success', { concurrency: false }, async () => {
  const api = loadApi();
  await withEnv({ ADZUNA_LICENSED: 'true', ADZUNA_APP_ID: 'fixture-id', ADZUNA_API_KEY: 'fixture-key' }, () => withFetch(async () => ({ ok: true, json: async () => ({ unexpected: [] }) }), async () => {
    const result = await api.searchJobsAdzuna({ query: 'fixture-malformed-payload' });
    assert.equal(result.status, 'malformed');
    assert.equal(result.diagnostics[0].provider, 'adzuna');
  }));
});

test('individual malformed Adzuna rows are skipped while a valid sibling and unknown fields survive', { concurrency: false }, async () => {
  const api = loadApi();
  const malformedRows = [
    null,
    'not a job row',
    { title: 'Missing identifier', redirect_url: 'https://example.test/no-id' },
    { id: 4, title: '   ', redirect_url: 'https://example.test/no-title' },
    { id: 5, title: 'Missing URL' },
    { id: 6, title: 'Wrong protocol', redirect_url: 'javascript:alert(1)' },
    { id: 7, title: 'Relative URL', redirect_url: '/jobs/7' },
  ];
  const validWithUnknowns = {
    id: 24,
    title: 'Analyst',
    redirect_url: ['https://example.test/coerced'],
    salary_min: 'not a salary',
    salary_max: null,
    created: 'not a date',
    description: 'Uses Python',
    company: 'unexpected nested value',
    location: ['unexpected nested value'],
    category: [],
  };

  await withEnv({ ADZUNA_LICENSED: 'true', ADZUNA_APP_ID: 'fixture-id', ADZUNA_API_KEY: 'fixture-key' }, () => withFetch(async () => ({
    ok: true,
    json: async () => ({ results: [validWithUnknowns, ...malformedRows] }),
  }), async () => {
    const result = await api.searchJobsAdzuna({ query: 'fixture-individual-malformed-rows' });
    assert.equal(result.status, 'success');
    assert.equal(result.totalCount, 1);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].id, '24');
    assert.equal(result.jobs[0].url, 'https://example.test/coerced');
    assert.equal(result.jobs[0].applyUrl, 'https://example.test/coerced');
    assert.equal(result.jobs[0].salary.min, null);
    assert.equal(result.jobs[0].salary.max, null);
    assert.equal(result.jobs[0].salary.interval, 'unknown');
    assert.equal(result.jobs[0].postedDate, '');
    assert.equal(result.jobs[0].publishedAt, '');
    assert.equal(result.jobs[0].company, 'Not listed');
    assert.equal(result.jobs[0].location, 'Not listed');
    assert.deepEqual(result.jobs[0].locations, []);
    assert.equal(result.jobs[0].category, '');
    assert.deepEqual(result.jobs[0].skills, ['Python']);
    assert.equal(result.diagnostics[0].rejectedRows, malformedRows.length);
  }));
});

test('all malformed Adzuna rows remain malformed, are not cached, and survive disabled fallback', { concurrency: false }, async () => {
  const api = loadApi();
  let calls = 0;
  await withEnv({ ADZUNA_LICENSED: 'true', ADZUNA_APP_ID: 'fixture-id', ADZUNA_API_KEY: 'fixture-key' }, () => withFetch(async () => {
    calls += 1;
    return { ok: true, json: async () => ({ results: [
      null,
      { id: 1, title: 'Unsafe URL', redirect_url: 'javascript:alert(1)' },
    ] }) };
  }, async () => {
    const first = await api.searchJobs({ query: 'fixture-all-malformed-rows' });
    const second = await api.searchJobs({ query: 'fixture-all-malformed-rows' });
    for (const result of [first, second]) {
      assert.equal(result.status, 'malformed');
      assert.equal(result.totalCount, 0);
      assert.deepEqual(result.jobs, []);
      assert.deepEqual(result.diagnostics.map(diagnostic => [diagnostic.provider, diagnostic.status]), [
        ['adzuna', 'malformed'], ['remotive', 'disabled'],
      ]);
      assert.equal(result.diagnostics[0].rejectedRows, 2);
    }
    assert.equal(calls, 2, 'malformed row sets must not enter the success/empty response cache');
  }));
});

test('Adzuna classifies rate limits and timeouts without exposing raw errors', { concurrency: false }, async () => {
  const api = loadApi();
  const warnings = [];
  const priorWarn = console.warn;
  console.warn = value => warnings.push(String(value));
  try {
    await withEnv({ ADZUNA_LICENSED: 'true', ADZUNA_APP_ID: 'fixture-id', ADZUNA_API_KEY: 'fixture-secret' }, async () => {
      await withFetch(async () => ({ ok: false, status: 429, statusText: 'Too Many Requests' }), async () => {
        assert.equal((await api.searchJobsAdzuna({ query: 'fixture-rate-limit' })).status, 'rate_limited');
      });
      await withFetch(async () => { throw Object.assign(new Error('secret URL https://api.test?app_key=fixture-secret'), { name: 'TimeoutError' }); }, async () => {
        assert.equal((await api.searchJobsAdzuna({ query: 'fixture-timeout' })).status, 'timeout');
      });
    });
  } finally { console.warn = priorWarn; }
  assert.deepEqual(warnings, ['Adzuna provider outcome: rate_limited', 'Adzuna provider outcome: timeout']);
});
