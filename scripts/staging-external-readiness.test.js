const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { buildStagingExternalReadiness } = require('./staging-external-readiness');

const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'staging-external-readiness.js');
const completeEnv = {
  NODE_ENV: 'production',
  STAGING_HOSTNAME: 'staging.talent.test',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'talent-staging-project',
  FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"talent-staging-project"}',
  CRON_SECRET: 'c'.repeat(40),
  EVER_JOBS_ENABLED: 'true',
  EVER_JOBS_API_URL: 'http://ever-jobs:3001',
  EVER_JOBS_API_KEY: 'ever_jobs_fixture_key',
  EVER_JOBS_SAFE_SOURCES: 'remoteok,remotive',
  GROQ_API_KEY: 'gsk_staging_fixture',
  OPENROUTER_API_KEY: 'sk-or-v1-staging-fixture',
  UPSTASH_REDIS_REST_URL: 'https://staging-upstash.test',
  UPSTASH_REDIS_REST_TOKEN: 'upstash_staging_fixture',
  RESEND_API_KEY: 're_staging_fixture',
  RESEND_WEBHOOK_SECRET: 'whsec_staging_resend_fixture',
  STRIPE_SECRET_KEY: 'sk_test_staging_fixture',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_staging_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_staging_stripe_fixture',
  STRIPE_PRO_PRICE_ID: 'price_pro_month_fixture',
  STRIPE_PRO_ANNUAL_PRICE_ID: 'price_pro_year_fixture',
  STRIPE_STUDIO_PRICE_ID: 'price_max_month_fixture',
  STRIPE_STUDIO_ANNUAL_PRICE_ID: 'price_max_year_fixture',
  STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT: '50',
};

test('complete staging configuration unlocks each provider canary boundary', () => {
  const report = buildStagingExternalReadiness(completeEnv);
  assert.equal(report.readyForActivationSmoke, true);
  assert.equal(report.readyForTrackedEmailCanary, true);
  assert.equal(report.readyForBillingCanary, true);
  assert.equal(report.allConfigurationPresent, true);
  assert.equal(report.providerReadsAttempted, 0);
  assert.equal(report.providerWritesAttempted, 0);
});

test('current core and job supply can stay ready while external product proofs remain blocked', () => {
  const report = buildStagingExternalReadiness(Object.fromEntries(
    Object.entries(completeEnv).filter(([key]) => ![
      'GROQ_API_KEY',
      'OPENROUTER_API_KEY',
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
      'RESEND_API_KEY',
      'RESEND_WEBHOOK_SECRET',
      'STRIPE_SECRET_KEY',
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PRO_PRICE_ID',
      'STRIPE_PRO_ANNUAL_PRICE_ID',
      'STRIPE_STUDIO_PRICE_ID',
      'STRIPE_STUDIO_ANNUAL_PRICE_ID',
      'STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT',
    ].includes(key)),
  ));
  assert.equal(report.tracks.find(item => item.id === 'core').configurationReady, true);
  assert.equal(report.tracks.find(item => item.id === 'job_supply').configurationReady, true);
  assert.equal(report.readyForActivationSmoke, false);
  assert.equal(report.readyForTrackedEmailCanary, false);
  assert.equal(report.readyForBillingCanary, false);
});

test('live Stripe mode and an invalid ceiling cannot pass the staging billing boundary', () => {
  const report = buildStagingExternalReadiness({
    ...completeEnv,
    STRIPE_SECRET_KEY: 'sk_live_wrong_boundary',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_wrong_boundary',
    STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT: '101',
  });
  const billing = report.tracks.find(item => item.id === 'billing');
  assert.equal(report.readyForBillingCanary, false);
  assert.deepEqual(billing.missing, [
    'STRIPE_SECRET_KEY:test_mode_required',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:test_mode_required',
    'STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT:invalid',
  ]);
});

test('a long placeholder cannot satisfy the core secret boundary', () => {
  const report = buildStagingExternalReadiness({
    ...completeEnv,
    CRON_SECRET: 'change_me_placeholder_secret_that_is_long_enough',
  });
  const core = report.tracks.find(item => item.id === 'core');
  assert.equal(core.configurationReady, false);
  assert.ok(core.missing.includes('CRON_SECRET:missing_or_weak'));
});

test('operator requires the selected env file and never prints shell credentials', () => {
  const marker = 'sk_test_shell_marker_not_for_output';
  const result = spawnSync(process.execPath, [scriptPath, '--staging-env-file', path.join(os.tmpdir(), 'missing-staging-readiness.env')], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH || '', STRIPE_SECRET_KEY: marker },
    encoding: 'utf8',
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 1);
  assert.match(output, /env_file:not_found/);
  assert.match(output, /Provider reads attempted: 0/);
  assert.match(output, /Provider writes attempted: 0/);
  assert.doesNotMatch(output, new RegExp(marker));
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.match(source, /readSelectedStagingEnvFile/);
  assert.doesNotMatch(source, /fetch\(|https?\.request|\.create\(|\.update\(|\.delete\(/);
});

test('operator rejects readable and symlinked env files before inspecting configuration', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-readiness-env-'));
  const unsafeFile = path.join(directory, 'unsafe.env');
  const safeFile = path.join(directory, 'safe.env');
  const symlink = path.join(directory, 'linked.env');
  const run = selectedPath => spawnSync(process.execPath, [scriptPath, '--staging-env-file', selectedPath], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH || '' },
    encoding: 'utf8',
  });
  try {
    fs.writeFileSync(unsafeFile, 'NODE_ENV=production\n', { mode: 0o644 });
    fs.writeFileSync(safeFile, 'NODE_ENV=production\n', { mode: 0o600 });
    fs.symlinkSync(safeFile, symlink);
    const readable = run(unsafeFile);
    const linked = run(symlink);
    assert.equal(readable.status, 1);
    if (process.platform !== 'win32') {
      assert.match(`${readable.stdout}\n${readable.stderr}`, /env_file:unsafe_permissions/);
    }
    assert.equal(linked.status, 1);
    assert.match(`${linked.stdout}\n${linked.stderr}`, /env_file:not_found/);
    for (const result of process.platform === 'win32' ? [linked] : [readable, linked]) {
      assert.match(`${result.stdout}\n${result.stderr}`, /Provider reads attempted: 0/);
      assert.match(`${result.stdout}\n${result.stderr}`, /Provider writes attempted: 0/);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
