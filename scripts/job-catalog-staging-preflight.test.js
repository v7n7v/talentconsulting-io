const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildJobCatalogStagingPreflight, main } = require('./job-catalog-staging-preflight');

const EXPECTED_HOST = 'taco-staging.example.test';
const EXPECTED_PROJECT = 'taco-staging-project';
const VALID_ENV = {
  NODE_ENV: 'production',
  STAGING_HOSTNAME: EXPECTED_HOST,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: EXPECTED_PROJECT,
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: 'service_account', project_id: EXPECTED_PROJECT,
    client_email: 'fixture@taco-staging-project.iam.gserviceaccount.com',
    private_key: 'synthetic-fixture-private-key',
  }),
  CRON_SECRET: 'synthetic-staging-cron-secret-long-enough-000001',
  JOB_CATALOG_ENABLED: 'true',
  JOB_CATALOG_ORIGINS: 'greenhouse,lever,ashby,workday',
  FANTASTIC_JOBS_ENABLED: 'true',
  FANTASTIC_JOBS_API_KEY: 'synthetic-fantastic-api-key',
  FANTASTIC_JOBS_SOURCES: 'greenhouse,lever,ashby,workday',
  JOB_INGEST_MAX_ITEMS: '75',
  JOB_INGEST_MAX_REQUESTS: '3',
  JOB_INGEST_DAILY_MAX_RECORDS: '100',
  JOB_INGEST_DAILY_MAX_REQUESTS: '10',
  JOB_INGEST_QUERY: 'software engineer',
  JOB_INGEST_LOCATION: 'United States',
};

function build(env = VALID_ENV, host = EXPECTED_HOST, project = EXPECTED_PROJECT) {
  return buildJobCatalogStagingPreflight(env, {
    expectedStagingHostname: host,
    expectedFirebaseProjectId: project,
  });
}

test('complete synthetic staging configuration passes without live validation', () => {
  const result = build({ ...VALID_ENV, JOB_CATALOG_ORIGINS: 'workday,ashby,greenhouse,lever' });
  assert.equal(result.configurationReady, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.errors, []);
  assert.equal(result.provider, 'fantastic');
  assert.equal(result.providerReadsAttempted, 0);
  assert.equal(result.providerWritesAttempted, 0);
  assert.equal(result.deploymentCallsAttempted, 0);
  assert.equal(result.liveValidationPerformed, false);
});

test('documented Lever source alias and explicitly selected preview host are supported', () => {
  const result = build({
    ...VALID_ENV,
    STAGING_HOSTNAME: 'preview.taco.test',
    FANTASTIC_JOBS_SOURCES: 'greenhouse,lever.co,ashby,workday',
  }, 'preview.taco.test');
  assert.equal(result.configurationReady, true);
});

test('expected host and Firebase identity must match staging configuration', () => {
  const hostMismatch = build({ ...VALID_ENV, STAGING_HOSTNAME: 'other-staging.example.test' });
  assert.ok(hostMismatch.errors.includes('runtime:staging_hostname_mismatch'));
  const projectMismatch = build({ ...VALID_ENV, NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'other-staging-project' });
  assert.ok(projectMismatch.errors.includes('firebase:project_id_mismatch'));
  const accountMismatch = build({
    ...VALID_ENV,
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      project_id: 'other-staging-project', client_email: 'synthetic@fixture.invalid', private_key: 'synthetic-key',
    }),
  });
  assert.ok(accountMismatch.errors.includes('firebase:service_account_project_mismatch'));
});

test('known production Firebase project, non-staging host and malformed service account are blocked', () => {
  const prodProject = build({
    ...VALID_ENV,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'talent-consulting-acf16',
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'talent-consulting-acf16' }),
  });
  assert.ok(prodProject.errors.includes('firebase:production_project_forbidden'));
  assert.ok(!prodProject.configurationReady);

  const prodHost = build(VALID_ENV, 'talentconsulting.io', EXPECTED_PROJECT);
  assert.ok(prodHost.errors.includes('argument:expected_staging_hostname:invalid_staging_hostname'));

  const malformedAccount = build({ ...VALID_ENV, FIREBASE_SERVICE_ACCOUNT_JSON: '{bad json' });
  assert.ok(malformedAccount.errors.includes('firebase:service_account_invalid'));
});

test('pilot caps, source allowlist, query/location, and placeholders are validated', () => {
  const invalid = build({
    ...VALID_ENV,
    JOB_INGEST_MAX_ITEMS: '101',
    JOB_INGEST_MAX_REQUESTS: '5',
    JOB_INGEST_DAILY_MAX_RECORDS: '101',
    JOB_INGEST_DAILY_MAX_REQUESTS: '11',
    JOB_CATALOG_ORIGINS: 'greenhouse,linkedin',
    FANTASTIC_JOBS_SOURCES: 'greenhouse,linkedin',
    JOB_INGEST_QUERY: 'change_me',
    JOB_INGEST_LOCATION: '',
    CRON_SECRET: 'placeholder-secret-value-that-is-long-enough-000001',
    FANTASTIC_JOBS_API_KEY: 'example-key-that-looks-long-enough',
  });
  assert.equal(invalid.configurationReady, false);
  assert.ok(invalid.errors.includes('pilot:job_ingest_max_items:out_of_bounds'));
  assert.ok(invalid.errors.includes('pilot:job_ingest_max_requests:out_of_bounds'));
  assert.ok(invalid.errors.includes('pilot:job_ingest_daily_max_records:out_of_bounds'));
  assert.ok(invalid.errors.includes('pilot:job_ingest_daily_max_requests:out_of_bounds'));
  assert.ok(invalid.errors.includes('catalog:origin_outside_pilot_allowlist'));
  assert.ok(invalid.errors.includes('fantastic:source_outside_pilot_allowlist'));
  assert.ok(invalid.errors.includes('pilot:query_missing_or_invalid'));
  assert.ok(invalid.missing.includes('pilot:location_missing_or_invalid'));
  assert.ok(invalid.errors.includes('cron:secret_weak_or_placeholder'));
  assert.ok(invalid.errors.includes('fantastic:api_key_placeholder_or_invalid'));
});

test('CLI requires an explicit file and identities and prints codes rather than configuration values', () => {
  const oldExitCode = process.exitCode;
  const output = [];
  try {
    const result = main([], { log: value => output.push(value) });
    assert.equal(result.configurationReady, false);
    const text = output.join('\n');
    assert.ok(text.includes('argument:staging_env_file:required'));
    assert.ok(text.includes('argument:expected_staging_hostname:required'));
    assert.ok(text.includes('argument:expected_firebase_project_id:required'));
    assert.ok(!text.includes('synthetic'));
  } finally {
    process.exitCode = oldExitCode;
  }
});

test('CLI uses the secure explicit env-file loader and never performs provider or deployment I/O', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'job-catalog-preflight-'));
  const envPath = path.join(directory, 'staging.env');
  const output = [];
  const oldExitCode = process.exitCode;
  try {
    const lines = Object.entries(VALID_ENV).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n');
    fs.writeFileSync(envPath, lines, { mode: 0o600 });
    const result = main([
      '--staging-env-file', envPath,
      '--expected-staging-hostname', EXPECTED_HOST,
      '--expected-firebase-project-id', EXPECTED_PROJECT,
    ], { log: value => output.push(value) });
    assert.equal(result.configurationReady, true);
    assert.equal(result.providerReadsAttempted, 0);
    assert.equal(result.providerWritesAttempted, 0);
    assert.equal(result.deploymentCallsAttempted, 0);
    const text = output.join('\n');
    assert.doesNotMatch(text, /synthetic|private_key|client_email|api-key/i);
    assert.match(text, /"configurationReady": true/);
    assert.match(text, /"liveValidationPerformed": false/);

    const symlink = path.join(directory, 'linked.env');
    fs.symlinkSync(envPath, symlink);
    output.length = 0;
    const blocked = main([
      '--staging-env-file', symlink,
      '--expected-staging-hostname', EXPECTED_HOST,
      '--expected-firebase-project-id', EXPECTED_PROJECT,
    ], { log: value => output.push(value) });
    assert.equal(blocked.configurationReady, false);
    assert.ok(blocked.missing.includes('env_file:unusable'));
    assert.doesNotMatch(output.join('\n'), /synthetic|private_key|client_email/i);
  } finally {
    process.exitCode = oldExitCode;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
