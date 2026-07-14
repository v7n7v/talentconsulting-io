const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const canary = require('./ever-jobs-staging-canary');

const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'ever-jobs-staging-canary.js');
const env = {
  NODE_ENV: 'production',
  STAGING_HOSTNAME: 'talent-staging.example.test',
  EVER_JOBS_ENABLED: 'true',
  EVER_JOBS_API_URL: 'http://ever-jobs:3001',
  EVER_JOBS_API_KEY: 'ever_jobs_staging_fixture_key',
  EVER_JOBS_SAFE_SOURCES: 'remoteok,remotive,jobicy,himalayas,weworkremotely',
};

function job(overrides = {}) {
  return {
    id: 'job-fixture',
    title: 'Software Engineer',
    companyName: 'Example Company',
    location: 'Remote',
    site: 'himalayas',
    jobUrl: 'https://himalayas.app/jobs/example',
    ...overrides,
  };
}

test('configuration is bound to the private staging service and approved sources', () => {
  assert.equal(canary.assessEverJobsStagingConfiguration(env).ready, true);
  const invalid = canary.assessEverJobsStagingConfiguration({
    ...env,
    STAGING_HOSTNAME: 'talentconsulting.io',
    EVER_JOBS_API_URL: 'https://attacker.example',
    EVER_JOBS_API_KEY: 'replace_me',
    EVER_JOBS_SAFE_SOURCES: 'remoteok,linkedin',
  });
  assert.deepEqual(invalid.errors, [
    'environment:staging_required',
    'ever_jobs:private_service_url_invalid',
    'ever_jobs:key_missing_or_invalid',
    'ever_jobs:safe_sources_unsupported',
  ]);
});

test('successful canary proves auth, safe search evidence and zero product writes', async () => {
  const calls = [];
  const result = await canary.runEverJobsStagingCanary({
    env,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (String(url).endsWith('/api/jobs/search')) {
        return new Response(JSON.stringify({ jobs: [
          job(),
          job({ id: 'job-2', site: 'remoteok', jobUrl: 'https://remoteok.com/remote-jobs/example' }),
        ] }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      return init.headers['x-api-key']
        ? new Response(JSON.stringify({ status: 'healthy' }), { status: 200 })
        : new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    },
  });
  assert.equal(result.assessment.ready, true);
  assert.equal(result.assessment.resultCount, 2);
  assert.equal(result.assessment.observedSafeSourceCount, 2);
  assert.equal(result.assessment.providerRequestsAttempted, 3);
  assert.equal(result.assessment.productWritesAttempted, 0);
  assert.equal(result.assessment.externalApplicationsSubmitted, 0);
  assert.deepEqual(result.operations, [
    'ever_jobs.health.authenticated',
    'ever_jobs.health.unauthenticated',
    'ever_jobs.search.safe_sources',
  ]);
  const search = calls.find(call => String(call.url).endsWith('/api/jobs/search'));
  const body = JSON.parse(search.init.body);
  assert.equal(body.query, canary.GENERIC_SEARCH_QUERY);
  assert.deepEqual(body.sources, Object.keys(canary.STAGING_SAFE_SOURCE_HOSTS));
  assert.doesNotMatch(JSON.stringify(result.assessment), /fixture_key|Software Engineer|Example Company/);
});

test('empty, unsupported and unsafe search evidence fail closed', async () => {
  const run = payload => canary.runEverJobsStagingCanary({
    env,
    fetchImpl: async (url, init) => {
      if (String(url).endsWith('/api/jobs/search')) {
        return new Response(JSON.stringify(payload), { status: 201 });
      }
      return init.headers['x-api-key']
        ? new Response(JSON.stringify({ status: 'healthy' }), { status: 200 })
        : new Response('', { status: 401 });
    },
  });
  const empty = await run({ jobs: [] });
  const unsupported = await run({ status: 'ok' });
  const unsafe = await run({ jobs: [job({ jobUrl: 'https://attacker.example/job' })] });
  assert.deepEqual(empty.assessment.errors, ['ever_jobs:search_returned_no_jobs']);
  assert.deepEqual(unsupported.assessment.errors, ['ever_jobs:search_contract_unsupported']);
  assert.deepEqual(unsafe.assessment.errors, ['ever_jobs:unsafe_result_evidence']);
});

test('source labels and HTTPS hosts must agree for every returned job', () => {
  const sources = Object.keys(canary.STAGING_SAFE_SOURCE_HOSTS);
  for (const [source, hosts] of Object.entries(canary.STAGING_SAFE_SOURCE_HOSTS)) {
    const valid = canary.validateSafeSearchRows([
      job({ site: source, jobUrl: `https://${hosts[0]}/jobs/example` }),
    ], sources);
    assert.equal(valid.ready, true);
  }
  assert.equal(canary.validateSafeSearchRows([
    job({ site: 'linkedin', jobUrl: 'https://linkedin.com/jobs/example' }),
  ], sources).ready, false);
  assert.equal(canary.validateSafeSearchRows([
    job({ jobUrl: 'http://himalayas.app/jobs/example' }),
  ], sources).ready, false);
});

test('canary source profiles remain present in the application trust contract', () => {
  const applicationSource = fs.readFileSync(path.join(repoRoot, 'lib', 'job-recommendation-platform.ts'), 'utf8');
  for (const [source, hosts] of Object.entries(canary.STAGING_SAFE_SOURCE_HOSTS)) {
    assert.match(applicationSource, new RegExp(`${source}:\\s*\\{[^\\n]+hosts:\\s*\\[[^\\]]*'${hosts[0].replace('.', '\\.')}'`));
  }
});

test('missing selected config blocks before requests and ignores shell credentials', () => {
  const marker = 'ever_jobs_shell_marker_not_for_output';
  const result = spawnSync(process.execPath, [
    scriptPath,
    '--staging-env-file', path.join(os.tmpdir(), 'missing-ever-jobs-canary.env'),
  ], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH || '', EVER_JOBS_API_KEY: marker },
    encoding: 'utf8',
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 1);
  assert.match(output, /blocked before provider requests/);
  assert.match(output, /Provider requests attempted: 0/);
  assert.match(output, /Product writes attempted: 0/);
  assert.match(output, /External applications submitted: 0/);
  assert.doesNotMatch(output, new RegExp(marker));
});

test('operator has one fixed generic search and no application or user-data write path', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.match(source, /GENERIC_SEARCH_QUERY = 'engineer'/);
  assert.match(source, /method: 'GET'/);
  assert.match(source, /method: 'POST'/);
  assert.doesNotMatch(source, /process\.env|\/apply|applications?\.(create|add|set|update)|collection\(/);
  assert.doesNotMatch(source, /resume|userSkills|targetRoles|preferredCities|salaryMin/);
});
