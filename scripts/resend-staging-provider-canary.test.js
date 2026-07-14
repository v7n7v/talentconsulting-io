const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { buildSync } = require('esbuild');
const canary = require('./resend-staging-provider-canary');

const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'resend-staging-provider-canary.js');
const env = {
  NODE_ENV: 'production',
  STAGING_HOSTNAME: 'talent-staging.example.test',
  RESEND_API_KEY: 're_staging_fixture_key',
  RESEND_WEBHOOK_SECRET: 'whsec_staging_fixture_secret',
};

function verifiedDomain() {
  return {
    name: canary.REQUIRED_SENDING_DOMAIN,
    status: 'verified',
    capabilities: { sending: 'enabled' },
  };
}

function enabledWebhook(overrides = {}) {
  return {
    endpoint: canary.expectedWebhookEndpoint(env.STAGING_HOSTNAME),
    status: 'enabled',
    events: [...canary.REQUIRED_RESEND_RECEIPT_EVENTS],
    ...overrides,
  };
}

test('configuration requires a staging host and both Resend credentials', () => {
  assert.equal(canary.assessResendStagingConfiguration(env).ready, true);
  assert.deepEqual(canary.assessResendStagingConfiguration({
    ...env,
    STAGING_HOSTNAME: 'talentconsulting.io',
    RESEND_API_KEY: 'replace_me',
    RESEND_WEBHOOK_SECRET: 'your_webhook_secret',
  }).errors, [
    'environment:staging_required',
    'resend:key_missing_or_invalid',
    'resend:webhook_secret_missing_or_invalid',
  ]);
});

test('successful preflight performs two reads and sends no email', async () => {
  const calls = [];
  const result = await canary.runReadOnlyResendProviderCanary({
    env,
    readJson: async (url, headers) => {
      calls.push({ url, headers });
      if (url === canary.RESEND_DOMAINS_URL) return { data: [verifiedDomain()] };
      return { data: [enabledWebhook()] };
    },
  });
  assert.equal(result.assessment.readyForSendCanary, true);
  assert.deepEqual(result.readOperations, ['resend.domains.list', 'resend.webhooks.list']);
  assert.equal(calls.length, 2);
  assert.equal(result.assessment.providerReadsAttempted, 2);
  assert.equal(result.assessment.providerWritesAttempted, 0);
  assert.equal(result.assessment.emailsSent, 0);
  assert.doesNotMatch(JSON.stringify(result.assessment), /fixture_key|fixture_secret/);
});

test('domain and webhook defects produce bounded fail-closed evidence', async () => {
  const result = await canary.runReadOnlyResendProviderCanary({
    env,
    readJson: async url => url === canary.RESEND_DOMAINS_URL
      ? { data: [{ ...verifiedDomain(), status: 'pending' }] }
      : { data: [enabledWebhook({ status: 'disabled', events: ['email.delivered'] })] },
  });
  assert.equal(result.assessment.readyForSendCanary, false);
  assert.deepEqual(result.assessment.errors, [
    'resend:sending_domain_unavailable',
    'resend:webhook_disabled',
    'resend:webhook_events_incomplete',
  ]);
  assert.equal(result.assessment.providerWritesAttempted, 0);
  assert.equal(result.assessment.emailsSent, 0);
});

test('provider failures and duplicate endpoint records remain distinct', async () => {
  const unavailable = await canary.runReadOnlyResendProviderCanary({
    env,
    readJson: async () => { throw new Error('unavailable'); },
  });
  assert.deepEqual(unavailable.assessment.errors, [
    'resend:key_verification_failed',
    'resend:webhook_inventory_unavailable',
  ]);

  const duplicate = await canary.runReadOnlyResendProviderCanary({
    env,
    readJson: async url => url === canary.RESEND_DOMAINS_URL
      ? { data: [verifiedDomain()] }
      : { data: [enabledWebhook(), enabledWebhook()] },
  });
  assert.deepEqual(duplicate.assessment.errors, ['resend:webhook_endpoint_ambiguous']);
});

test('operator receipt events match the application readiness contract', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'resend-contract-'));
  const outfile = path.join(directory, 'readiness.cjs');
  try {
    buildSync({
      entryPoints: [path.join(repoRoot, 'lib', 'job-notification-readiness.ts')],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      logLevel: 'silent',
    });
    const readiness = require(outfile);
    assert.deepEqual(
      [...canary.REQUIRED_RESEND_RECEIPT_EVENTS].sort(),
      [...readiness.REQUIRED_RESEND_JOB_RECEIPT_EVENTS].sort(),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('missing selected config blocks before reads and never prints shell credentials', () => {
  const marker = 're_shell_marker_not_for_output';
  const result = spawnSync(process.execPath, [
    scriptPath,
    '--staging-env-file', path.join(os.tmpdir(), 'missing-resend-canary.env'),
  ], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH || '', RESEND_API_KEY: marker },
    encoding: 'utf8',
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 1);
  assert.match(output, /blocked before provider reads/);
  assert.match(output, /Provider reads attempted: 0/);
  assert.match(output, /Provider writes attempted: 0/);
  assert.match(output, /Emails sent: 0/);
  assert.doesNotMatch(output, new RegExp(marker));
});

test('operator source contains fixed GET reads and no send or mutation path', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.match(source, /method: 'GET'/);
  assert.match(source, /redirect: 'error'/);
  assert.doesNotMatch(source, /method:\s*'POST'|emails\.send|webhooks\.create|domains\.create/);
  assert.doesNotMatch(source, /process\.env/);
});
