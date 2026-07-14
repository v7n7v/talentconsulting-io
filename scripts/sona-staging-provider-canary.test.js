const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const canary = require('./sona-staging-provider-canary');

const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'sona-staging-provider-canary.js');
const env = {
  NODE_ENV: 'production',
  STAGING_HOSTNAME: 'talent-staging.example.test',
  GROQ_API_KEY: 'gsk_staging_fixture_key',
  OPENROUTER_API_KEY: 'sk-or-v1-staging-fixture-key',
  UPSTASH_REDIS_REST_URL: 'https://staging-redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'upstash_staging_fixture_token',
};

test('configuration accepts only staging keys and an official Upstash HTTPS origin', () => {
  assert.equal(canary.assessSonaStagingProviderConfiguration(env).ready, true);
  const invalid = canary.assessSonaStagingProviderConfiguration({
    ...env,
    STAGING_HOSTNAME: 'talentconsulting.io',
    GROQ_API_KEY: 'change_me_gsk_placeholder',
    UPSTASH_REDIS_REST_URL: 'https://attacker.example/redis',
  });
  assert.deepEqual(invalid.errors, [
    'environment:staging_required',
    'groq:key_missing_or_invalid',
    'upstash:url_invalid',
  ]);
});

test('successful canary performs exactly four reads and verifies provider access', async () => {
  const calls = [];
  const result = await canary.runReadOnlySonaProviderCanary({
    env,
    readJson: async (url, headers) => {
      calls.push({ url, headers });
      if (url === canary.GROQ_MODELS_URL) return { data: [{ id: canary.REQUIRED_GROQ_MODEL }] };
      if (url === canary.OPENROUTER_KEY_URL) return { data: { is_free_tier: false } };
      if (url === canary.OPENROUTER_MODELS_URL) return { data: [{ id: canary.REQUIRED_OPENROUTER_MODEL }] };
      return { result: 'PONG' };
    },
  });
  assert.equal(result.assessment.ready, true);
  assert.deepEqual(result.readOperations, ['groq.models.list', 'openrouter.key.get', 'openrouter.models.list', 'upstash.ping']);
  assert.equal(calls.length, 4);
  assert.equal(result.assessment.openRouterKeyReady, true);
  assert.equal(result.assessment.providerReadsAttempted, 4);
  assert.equal(result.assessment.providerWritesAttempted, 0);
  assert.doesNotMatch(JSON.stringify(result.assessment), /fixture_key|fixture-token/);
});

test('missing model and failed ping produce distinct fail-closed evidence', async () => {
  const result = await canary.runReadOnlySonaProviderCanary({
    env,
    readJson: async url => {
      if (url === canary.GROQ_MODELS_URL) return { data: [] };
      if (url === canary.OPENROUTER_KEY_URL) throw new Error('unauthorized');
      if (url === canary.OPENROUTER_MODELS_URL) throw new Error('provider unavailable');
      return { result: 'NOPE' };
    },
  });
  assert.equal(result.assessment.ready, false);
  assert.deepEqual(result.assessment.errors, [
    'groq:required_model_unavailable',
    'openrouter:key_verification_failed',
    'openrouter:required_model_unavailable',
    'upstash:ping_failed',
  ]);
  assert.equal(result.assessment.providerWritesAttempted, 0);
});

test('missing configuration blocks before any read and ignores shell credentials', () => {
  const marker = 'gsk_shell_marker_not_for_output';
  const result = spawnSync(process.execPath, [
    scriptPath,
    '--staging-env-file', path.join(os.tmpdir(), 'missing-sona-provider-canary.env'),
  ], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH || '', GROQ_API_KEY: marker },
    encoding: 'utf8',
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 1);
  assert.match(output, /blocked before provider reads/);
  assert.match(output, /Provider reads attempted: 0/);
  assert.match(output, /Provider writes attempted: 0/);
  assert.doesNotMatch(output, new RegExp(marker));
});

test('selected env file must be regular, owner-only and non-symlinked', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sona-provider-env-'));
  const safePath = path.join(directory, 'staging.env');
  const linkPath = path.join(directory, 'staging-link.env');
  try {
    fs.writeFileSync(safePath, 'NODE_ENV=production\n', { mode: 0o600 });
    assert.equal(canary.readSelectedStagingEnvFile(safePath).error, null);

    fs.chmodSync(safePath, 0o644);
    assert.equal(
      canary.readSelectedStagingEnvFile(safePath).error,
      process.platform === 'win32' ? null : 'env_file:unsafe_permissions',
    );

    fs.chmodSync(safePath, 0o600);
    fs.symlinkSync(safePath, linkPath);
    assert.equal(canary.readSelectedStagingEnvFile(linkPath).error, 'env_file:not_found');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('operator source exposes no provider mutation or dynamic provider host path', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.match(source, /method: 'GET'/);
  assert.match(source, /redirect: 'error'/);
  assert.doesNotMatch(source, /method:\s*'POST'|\.create\(|\.update\(|\.delete\(|\.set\(/);
  assert.doesNotMatch(source, /process\.env/);
});
