const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const {
  PUBLIC_BUILD_KEYS,
  ALLOWED_BUILD_KEYS,
  parseDotEnv,
  parseFlatYaml,
  validateProductionDeploy,
} = require('./production-deploy-preflight');
const {
  buildFirebaseRuntimeEnv,
  buildFrameworksConfig,
  buildStaticFallbackConfig,
  deployFirebase,
  isExpectedHostingConflict,
} = require('../deploy-fix');

test('Firebase runtime packaging overlays private values without evaluating content', () => {
  const base = 'SHARED=old\nBASE_ONLY=base\n';
  const privateRuntime = 'SHARED=new\nPRIVATE_VALUE=$(do-not-run)\nQUOTED="literal value"\nFIREBASE_SERVICE_ACCOUNT_JSON=reserved\n';
  const merged = buildFirebaseRuntimeEnv(base, privateRuntime);
  assert.doesNotMatch(merged, /^SHARED=old$/m);
  assert.match(merged, /^SHARED=new$/m);
  assert.match(merged, /^BASE_ONLY=base$/m);
  assert.match(merged, /^PRIVATE_VALUE=\$\(do-not-run\)$/m);
  assert.match(merged, /^QUOTED="literal value"$/m);
  assert.doesNotMatch(merged, /^FIREBASE_SERVICE_ACCOUNT_JSON=/m);
});

const publicEnv = Object.fromEntries(PUBLIC_BUILD_KEYS.map(key => [key, `${key.toLowerCase()}_approved_value`]));
publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_live_approved_public_key';
const fixturePrivateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
  type: 'pkcs8',
  format: 'pem',
});

const runtimeEnv = {
  ...publicEnv,
  NODE_ENV: 'production',
  STRIPE_SECRET_KEY: 'sk_live_approved_server_key',
  STRIPE_WEBHOOK_SECRET: 'whsec_approved_endpoint_secret',
  STRIPE_PRO_PRICE_ID: 'price_approved_pro_month',
  STRIPE_PRO_ANNUAL_PRICE_ID: 'price_approved_pro_year',
  STRIPE_STUDIO_PRICE_ID: 'price_approved_max_month',
  STRIPE_STUDIO_ANNUAL_PRICE_ID: 'price_approved_max_year',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    project_id: publicEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    client_email: `deploy@${publicEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.iam.gserviceaccount.com`,
    private_key: fixturePrivateKey,
  }),
  CRON_SECRET: 'approved_cron_secret_with_at_least_32_characters',
};

test('production preflight accepts aligned live build and runtime configuration', () => {
  assert.deepEqual(validateProductionDeploy(publicEnv, runtimeEnv), { ready: true, errors: [] });
});

test('production preflight blocks test mode, staging markers, drift and duplicate prices', () => {
  const result = validateProductionDeploy(publicEnv, {
    ...runtimeEnv,
    STAGING_HOSTNAME: 'staging.example.test',
    STRIPE_SECRET_KEY: 'sk_test_not_allowed_here',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'different-project',
    STRIPE_STUDIO_PRICE_ID: runtimeEnv.STRIPE_PRO_PRICE_ID,
  });
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('runtime:STAGING_HOSTNAME:must_be_absent'));
  assert.ok(result.errors.includes('stripe:secret_key:live_required'));
  assert.ok(result.errors.includes('public:NEXT_PUBLIC_FIREBASE_PROJECT_ID:mismatch'));
  assert.ok(result.errors.includes('stripe:price_ids:must_be_unique'));
});

test('production preflight rejects unknown build keys and malformed or cross-project admin credentials', () => {
  const result = validateProductionDeploy({ ...publicEnv, GROQ_API_KEY: 'must-not-be-here' }, {
    ...runtimeEnv,
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      project_id: 'other-project',
      client_email: 'deploy@example.test',
      private_key: 'not-a-private-key',
    }),
  });
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('build:GROQ_API_KEY:not_public_allowlisted'));
  assert.ok(result.errors.includes('runtime:FIREBASE_SERVICE_ACCOUNT_JSON:project_mismatch'));
  assert.ok(result.errors.includes('runtime:FIREBASE_SERVICE_ACCOUNT_JSON:invalid_shape'));
});

test('production preflight rejects a weak cron credential', () => {
  const result = validateProductionDeploy(publicEnv, { ...runtimeEnv, CRON_SECRET: 'change-me' });
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('runtime:CRON_SECRET:weak_or_missing'));
});

test('deploy env parsers preserve values without evaluating content', () => {
  assert.deepEqual(parseDotEnv('A="one:two"\nB=three=four\n# ignored\n'), { A: 'one:two', B: 'three=four' });
  assert.deepEqual(parseFlatYaml("A: 'one:two'\nB: three=four\n  nested: ignored\n"), { A: 'one:two', B: 'three=four' });
});

test('tracked production build env contains public values only', () => {
  const content = fs.readFileSync(path.join(repoRoot, '.env.production'), 'utf8');
  const keys = Object.keys(parseDotEnv(content));
  assert.deepEqual(keys.filter(key => !ALLOWED_BUILD_KEYS.includes(key)), []);
  for (const key of PUBLIC_BUILD_KEYS) assert.match(content, new RegExp(`^${key}=.+`, 'm'));
});

test('Cloud Run deployment runs preflight and passes every public build value explicitly', () => {
  const script = fs.readFileSync(path.join(repoRoot, 'deploy-cloudrun.sh'), 'utf8');
  const config = fs.readFileSync(path.join(repoRoot, 'cloudbuild.yaml'), 'utf8');
  assert.match(script, /set -euo pipefail/);
  assert.match(script, /production-deploy-preflight\.js cloudrun/);
  assert.match(script, /--config cloudbuild\.yaml/);
  assert.doesNotMatch(script, /gcloud builds submit --tag/);
  assert.doesNotMatch(script, /gcloud config set project/);
  assert.match(script, /gcloud builds submit[\s\S]*--project="\$\{PROJECT_ID\}"/);
  assert.match(script, /gcloud run deploy[\s\S]*--project="\$\{PROJECT_ID\}"/);
  for (const key of PUBLIC_BUILD_KEYS) {
    assert.match(config, new RegExp(`--build-arg[\\s\\S]*${key}=\\$\\{_${key}\\}`));
  }
});

test('Firebase deployment preserves the original config and limits fallback to a real 409', () => {
  const original = {
    firestore: { rules: 'firestore.rules' },
    storage: { rules: 'storage.rules' },
    hosting: { source: 'old', headers: [{ source: '**', headers: [] }], frameworksBackend: { memory: '1GiB' } },
  };
  const framework = buildFrameworksConfig(original);
  assert.deepEqual(framework.firestore, original.firestore);
  assert.deepEqual(framework.storage, original.storage);
  assert.deepEqual(framework.hosting.headers, original.hosting.headers);
  assert.equal(framework.hosting.frameworksBackend.memory, '1GiB');
  assert.equal(framework.hosting.frameworksBackend.region, 'us-east1');

  const fallback = buildStaticFallbackConfig(original);
  assert.deepEqual(fallback.firestore, original.firestore);
  assert.deepEqual(fallback.storage, original.storage);
  assert.deepEqual(fallback.hosting.headers, original.hosting.headers);
  assert.equal('source' in fallback.hosting, false);
  assert.equal('frameworksBackend' in fallback.hosting, false);
  assert.equal(fallback.hosting.rewrites[0].run.serviceId, 'ssrtalentconsultingacf1');

  assert.equal(isExpectedHostingConflict({ status: 1, stdout: '', stderr: '409 ALREADY_EXISTS' }), false);
  assert.equal(isExpectedHostingConflict({ status: 1, stdout: '', stderr: 'Firebase Hosting version finalization failed: 409 ALREADY_EXISTS' }), true);
  assert.equal(isExpectedHostingConflict({ status: 1, stdout: '', stderr: 'permission denied' }), false);
  const source = fs.readFileSync(path.join(repoRoot, 'deploy-fix.js'), 'utf8');
  assert.match(source, /production-deploy-preflight\.js', 'firebase/);
  assert.match(source, /run\(\['deploy', '--only', 'hosting'\]\)/);
  assert.match(source, /finally\s*\{[\s\S]*writeFileSync\(firebaseJsonPath, originalContent\)/);
});

test('Firebase deployment restores bytes after fallback failure and never runs after preflight failure', () => {
  const originalContent = '{"hosting":{"headers":[]},"firestore":{"rules":"firestore.rules"}}\n';
  const writes = [];
  const fileSystem = {
    readFileSync: () => originalContent,
    writeFileSync: (_path, content) => writes.push(content),
    existsSync: () => true,
  };
  let calls = 0;
  assert.throws(() => deployFirebase({
    fileSystem,
    runPreflight: () => {},
    runFirebase: args => {
      calls += 1;
      if (calls === 1) {
        assert.deepEqual(args, ['deploy', '--only', 'hosting']);
        return { status: 1, stdout: '', stderr: 'Firebase Hosting version finalization failed: 409 ALREADY_EXISTS' };
      }
      assert.deepEqual(args, ['deploy', '--only', 'hosting']);
      return { status: 2, stdout: '', stderr: 'fallback failed' };
    },
  }), /fallback failed with exit status 2/);
  assert.equal(calls, 2);
  assert.equal(writes.at(-1), originalContent);

  let deployed = false;
  assert.throws(() => deployFirebase({
    fileSystem,
    runPreflight: () => { throw new Error('preflight blocked'); },
    runFirebase: () => { deployed = true; return { status: 0 }; },
  }), /preflight blocked/);
  assert.equal(deployed, false);
});

test('Firebase deployment treats unrelated 409 errors as fatal and restores config', () => {
  const originalContent = '{"hosting":{"headers":[]}}\n';
  const writes = [];
  assert.throws(() => deployFirebase({
    fileSystem: {
      readFileSync: () => originalContent,
      writeFileSync: (_path, content) => writes.push(content),
      existsSync: () => true,
    },
    runPreflight: () => {},
    runFirebase: () => ({ status: 1, stdout: '', stderr: 'Backend service update failed: 409 ALREADY_EXISTS' }),
  }), /Firebase deployment failed/);
  assert.equal(writes.at(-1), originalContent);
});
