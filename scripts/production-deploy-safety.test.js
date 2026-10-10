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
  validateFirebaseFrameworkPackage,
} = require('./production-deploy-preflight');
const {
  buildFrameworksConfig,
  buildFirebaseRuntimeEnv,
  buildStaticFallbackConfig,
  captureProductionRollbackPoint,
  deployFirebase,
  DISPOSABLE_BUILD_CACHES,
  isExpectedHostingConflict,
  pruneBuildCaches,
  restoreProductionRollbackPoint,
  promoteDeployedRevision,
} = require('../deploy-fix');

const publicEnv = Object.fromEntries(PUBLIC_BUILD_KEYS.map(key => [key, `${key.toLowerCase()}_approved_value`]));
publicEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'talent-consulting-acf16';
publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_live_approved_public_key';
publicEnv.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = 'true';
publicEnv.NEXT_PUBLIC_MFA_ENABLED = 'false';
publicEnv.NEXT_PUBLIC_ADMIN_COMMAND_GRID_V2 = 'true';
publicEnv.FIREBASE_MFA_PROJECT_ENABLED = 'false';
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
  ADMIN_MFA_ENFORCED: 'false',
  ADMIN_MUTATIONS_V2_ENABLED: 'false',
  ADMIN_RECOVERY_OWNERS_VERIFIED: 'false',
  ADMIN_REFERENCE_SECRET: 'approved_admin_reference_secret_with_32_characters',
  ADMIN_SMOKE_OWNER_EMAIL: 'owner@example.com',
};

test('production preflight accepts aligned live build and runtime configuration', () => {
  assert.deepEqual(validateProductionDeploy(publicEnv, runtimeEnv), { ready: true, errors: [] });
});

test('production preflight requires the smoke owner email even with mutations disabled', () => {
  // These checks used to sit inside the ADMIN_MUTATIONS_V2_ENABLED block, so with
  // mutations off they never ran. But deploy-fix.js runs admin-production-smoke.js
  // after EVERY deploy and a throw there triggers the rollback, so a missing
  // ADMIN_SMOKE_OWNER_EMAIL reverted a deploy that had already fully succeeded.
  assert.equal(runtimeEnv.ADMIN_MUTATIONS_V2_ENABLED, 'false', 'guard: this is the mutations-off path');
  for (const bad of [undefined, '', '   ', 'not-an-email']) {
    const { ready, errors } = validateProductionDeploy(publicEnv, { ...runtimeEnv, ADMIN_SMOKE_OWNER_EMAIL: bad });
    assert.equal(ready, false, `expected rejection for ${JSON.stringify(bad)}`);
    assert.ok(errors.includes('admin:smoke_owner_email_required'));
  }

  // With MFA off the smoke never takes its MFA branch, so a token must not be demanded.
  assert.equal(
    validateProductionDeploy(publicEnv, runtimeEnv).errors.includes('admin:fresh_mfa_smoke_token_required'),
    false,
  );
  // With MFA enforced it must be, even when mutations stay off.
  const mfaOn = { ...runtimeEnv, ADMIN_MFA_ENFORCED: 'true', FIREBASE_MFA_PROJECT_ENABLED: 'true' };
  assert.ok(validateProductionDeploy({ ...publicEnv, FIREBASE_MFA_PROJECT_ENABLED: 'true' }, mfaOn)
    .errors.includes('admin:fresh_mfa_smoke_token_required'));
  assert.equal(
    validateProductionDeploy({ ...publicEnv, FIREBASE_MFA_PROJECT_ENABLED: 'true' },
      { ...mfaOn, ADMIN_SMOKE_MFA_ID_TOKEN: 'x'.repeat(120) })
      .errors.includes('admin:fresh_mfa_smoke_token_required'),
    false,
  );
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

test('production preflight validates every enabled observability production prerequisite', () => {
  const observabilityEnv = {
    ...runtimeEnv,
    FIREBASE_MFA_PROJECT_ENABLED: 'true',
    ADMIN_MFA_ENFORCED: 'true',
    // With enforcement on, admin-production-smoke.js takes its MFA branch and
    // throws firebase:mfa_smoke_id_token_required without this — which, running
    // post-deploy, would roll back an otherwise successful deploy. A config with
    // MFA enforced and no smoke token is not actually deployable.
    ADMIN_SMOKE_MFA_ID_TOKEN: 'x'.repeat(120),
    USER_OBSERVABILITY_V1_ENABLED: 'true',
    OBSERVABILITY_NOTICE_VERSION: 'observability-privacy-v1',
    OBSERVABILITY_RETENTION_POLICY_APPROVED: 'true',
    OBSERVABILITY_RETENTION_POLICY_VERSION: 'approved-v1',
    OBSERVABILITY_RETENTION_DAYS: '7',
    OBSERVABILITY_CASE_RETENTION_DAYS: '30',
    OBSERVABILITY_ACCESS_AUDIT_RETENTION_DAYS: '30',
    OBSERVABILITY_RESET_JOB_RETENTION_DAYS: '30',
    OBSERVABILITY_DAILY_SHARDS: '16',
    OBSERVABILITY_HMAC_ACTIVE_VERSION: 'v1',
    OBSERVABILITY_HMAC_KEYS_JSON: JSON.stringify({
      v1: 'M6cDq1wJ9sRf4Xy8Lp2Va7Nk5Tu0Hb3Ze6GiQm4Ko9Wx7Pa3',
    }),
    OBSERVABILITY_CURSOR_SECRET: 'Z4pLm8Qv2Rt7Ys1Kd5Ha9Nx3Uc6We0Bj4Fg8So2Vi7Er5Lm9',
    OBSERVABILITY_RETAINED_KEY_VERSIONS_JSON: '["v1"]',
  };
  assert.deepEqual(
    validateProductionDeploy(
      { ...publicEnv, FIREBASE_MFA_PROJECT_ENABLED: 'true' },
      observabilityEnv,
    ),
    { ready: true, errors: [] },
  );

  const invalid = validateProductionDeploy(
    { ...publicEnv, FIREBASE_MFA_PROJECT_ENABLED: 'true' },
    {
    ...observabilityEnv,
    OBSERVABILITY_RETENTION_DAYS: '6',
    OBSERVABILITY_DAILY_SHARDS: '100',
    OBSERVABILITY_HMAC_KEYS_JSON: JSON.stringify({
      v1: 'replace_with_a_managed_random_secret_of_at_least_48_characters',
    }),
    OBSERVABILITY_RETAINED_KEY_VERSIONS_JSON: '["retired-v0"]',
    },
  );
  assert.equal(invalid.ready, false);
  assert.ok(invalid.errors.includes(
    'observability:OBSERVABILITY_RETENTION_DAYS:bounded_integer_required',
  ));
  assert.ok(invalid.errors.includes(
    'observability:OBSERVABILITY_DAILY_SHARDS:bounded_integer_required',
  ));
  assert.ok(invalid.errors.includes(
    'observability:hmac_registry:strong_unique_keys_required',
  ));
  assert.ok(invalid.errors.includes(
    'observability:hmac_registry:retained_versions_manifest_invalid',
  ));
});

test('production preflight rejects unsafe MFA deployment combinations', () => {
  const result = validateProductionDeploy(
    { ...publicEnv, FIREBASE_MFA_PROJECT_ENABLED: 'false' },
    { ...runtimeEnv, FIREBASE_MFA_PROJECT_ENABLED: 'false', ADMIN_MFA_ENFORCED: 'true' },
  );
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('mfa:admin_enforcement_requires_project_mfa'));
});

test('mutation-enabled production preflight requires a live recovery-owner proof', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'production-deploy-preflight.js'), 'utf8');
  const proof = fs.readFileSync(path.join(repoRoot, 'scripts', 'admin-recovery-owner-proof.js'), 'utf8');
  assert.match(source, /admin-recovery-owner-proof\.js/);
  assert.match(source, /ADMIN_MUTATIONS_V2_ENABLED === 'true'/);
  assert.match(proof, /REQUIRED_RECOVERY_OWNERS = 2/);
  assert.match(proof, /multiFactor\?\.enrolledFactors/);
  assert.match(proof, /emailVerified === true/);
  assert.match(proof, /customClaims\?\.admin === true/);
  assert.match(proof, /customClaims\?\.adminRole === 'owner'/);
  assert.match(proof, /customClaims\?\.adminVersion/);
  assert.doesNotMatch(proof, /console\.(?:log|error).*(?:email|uid)/);
});

test('mutation-enabled production requires a fresh MFA smoke identity and pins aggregate prime origin', () => {
  const enabled = validateProductionDeploy(
    { ...publicEnv, FIREBASE_MFA_PROJECT_ENABLED: 'true' },
    {
      ...runtimeEnv,
      FIREBASE_MFA_PROJECT_ENABLED: 'true',
      ADMIN_MFA_ENFORCED: 'true',
      ADMIN_MUTATIONS_V2_ENABLED: 'true',
      ADMIN_RECOVERY_OWNERS_VERIFIED: 'true',
      // The shared fixture now carries a valid address, since preflight requires
      // one on every deploy. Blank it explicitly to keep asserting the rejection.
      ADMIN_SMOKE_OWNER_EMAIL: '',
    },
  );
  assert.equal(enabled.ready, false);
  assert.ok(enabled.errors.includes('admin:smoke_owner_email_required'));
  assert.ok(enabled.errors.includes('admin:fresh_mfa_smoke_token_required'));

  const unsafeOrigin = validateProductionDeploy(publicEnv, {
    ...runtimeEnv,
    ADMIN_AGGREGATE_BASE_URL: 'https://attacker.example',
  });
  assert.equal(unsafeOrigin.ready, false);
  assert.ok(unsafeOrigin.errors.includes(
    'runtime:ADMIN_AGGREGATE_BASE_URL:approved_production_origin_required',
  ));
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

test('production build uses the Firebase-compatible Webpack fallback', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.build, 'next build --webpack');
});

test('Firebase framework runtime alias resolves every Admin SDK subpath', () => {
  assert.deepEqual(validateFirebaseFrameworkPackage(repoRoot), { ready: true, errors: [] });
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const expectedAliases = {
    'firebase-admin-a14c8a5423a75469': 'firebase-admin',
    'prettier-3c69a91af3bc4731': 'prettier',
    'mammoth-ea033c5d84d0b9b2': 'mammoth',
    '@react-pdf/renderer-5f716e9bc7d68b8a': '@react-pdf/renderer',
  };
  for (const [alias, target] of Object.entries(expectedAliases)) {
    assert.match(packageJson.dependencies[alias], new RegExp(`^npm:${target.replace('/', '\\/')}@`));
  }
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
  assert.match(source, /PRODUCTION_FIREBASE_PROJECT = 'talent-consulting-acf16'/);
  assert.match(source, /'hosting,firestore'[\s\S]*'--project'[\s\S]*PRODUCTION_FIREBASE_PROJECT/);
  assert.match(source, /captureProductionRollbackPoint/);
  assert.match(source, /restoreProductionRollbackPoint/);
  assert.match(source, /runPostDeploySmoke/);
  assert.match(source, /admin-public-production-smoke\.js/);
  assert.match(source, /admin-production-smoke\.js/);
  assert.match(source, /--format=json\(status\.traffic\)/);
  assert.doesNotMatch(source, /\['deploy', '--only', '[^']*storage/);
  assert.match(source, /finally\s*\{[\s\S]*writeFileSync\(firebaseJsonPath, originalContent\)/);
});

test('deploy prunes .next dev and build caches before the adapter build', () => {
  // Firebase's framework adapter copies .next wholesale into the function bundle,
  // and nothing excludes the caches: hosting.ignore only governs hosting, and there
  // is no functions key or .gcloudignore. A single `next dev` run took .next to
  // 7.4 GB, the packaged upload to 4.67 GB, and the Cloud Run function update to
  // "timed out after 1500000ms" - a 25-minute failed deploy.
  const removed = [];
  const present = new Set(['.next/dev', '.next/cache']);
  const pruned = pruneBuildCaches({
    existsSync: p => present.has(p),
    rmSync: (p, opts) => {
      assert.equal(opts.recursive, true);
      assert.equal(opts.force, true);
      removed.push(p);
    },
  });
  assert.deepEqual(removed, ['.next/dev', '.next/cache']);
  assert.deepEqual(pruned, ['.next/dev', '.next/cache']);

  // Only caches. Removing these would delete the build itself.
  for (const keep of ['.next/server', '.next/standalone', '.next/static', '.next']) {
    assert.equal(DISPOSABLE_BUILD_CACHES.includes(keep), false, `${keep} must never be pruned`);
  }

  // Absent directories are skipped rather than removed.
  assert.deepEqual(pruneBuildCaches({ existsSync: () => false, rmSync: () => assert.fail('must not remove absent paths') }), []);

  // And it must run before the deploy command, since the adapter builds from
  // whatever .next holds at that moment.
  const order = [];
  deployFirebase({
    fileSystem: {
      readFileSync: () => '{"hosting":{}}',
      writeFileSync: () => {},
      existsSync: () => true,
    },
    runPreflight: () => order.push('preflight'),
    pruneBuildCaches: () => order.push('prune'),
    runFirebase: args => { order.push(`firebase:${args[0]}`); return { status: 0, stdout: '', stderr: '' }; },
  });
  assert.deepEqual(order.slice(0, 3), ['preflight', 'prune', 'firebase:deploy']);
});

test('hosting:clone is never passed flags the pinned firebase-tools rejects', () => {
  // `firebase hosting:clone` declares no options but --help, and --force is not a
  // global either, so commander exits 1 with "unknown option '--force'" before the
  // clone runs. Both rollback paths passed it, so `npm run deploy` died at the
  // very first step every time. Verified against the exact version pinned in
  // runFirebase.
  //
  // The restore path is the dangerous one: an unknown-option exit there fires
  // while production is mid-deploy, so the thing meant to put production back
  // would itself have thrown.
  const calls = [];
  const record = { runFirebase: args => { calls.push(args); return { status: 0, stdout: '', stderr: '' }; } };

  captureProductionRollbackPoint({
    ...record,
    runGcloud: () => ({
      status: 0,
      stdout: JSON.stringify({ status: { traffic: [{ revisionName: 'ssrtalentconsultingacf1-00156-loh', percent: 100 }] } }),
      stderr: '',
    }),
  });
  restoreProductionRollbackPoint(
    { traffic: [{ revision: 'ssrtalentconsultingacf1-00156-loh', percent: 100 }] },
    { ...record, runGcloud: () => ({ status: 0, stdout: '', stderr: '' }) },
  );

  const clones = calls.filter(args => args[0] === 'hosting:clone');
  assert.equal(clones.length, 2, 'both capture and restore must clone');
  for (const args of clones) {
    assert.equal(args.includes('--force'), false, `hosting:clone rejects --force: ${args.join(' ')}`);
    // --non-interactive is a real global and is what makes this safe unattended.
    assert.equal(args.includes('--non-interactive'), true);
    assert.equal(args.includes('--project'), true);
  }
});

test('rollback capture ignores tag-only revisions that carry no percent', () => {
  const stub = payload => ({
    runFirebase: () => ({ status: 0, stdout: '', stderr: '' }),
    runGcloud: () => ({ status: 0, stdout: JSON.stringify(payload), stderr: '' }),
  });

  // Firebase Hosting leaves one `fh-`-tagged Cloud Run revision behind for every
  // preview channel it has ever created. Production carries 69 of them against a
  // single revision actually serving traffic. They have no `percent` field at all.
  //
  // Number(undefined) is NaN and NaN <= 0 is false, so a bare `percent <= 0` guard
  // did not skip them — each added 0 + NaN, Number.isInteger(NaN) then failed the
  // resolved-assignment check, and capture threw on every real deploy. The suite
  // missed it because every fixture here had a percent. Keep a percent-less entry
  // in this one.
  const withTags = {
    status: {
      traffic: [
        { revisionName: 'ssrtalentconsultingacf1-00010-jiw', tag: 'fh-a3518d8f7bcc0775' },
        { revisionName: 'ssrtalentconsultingacf1-00154-lon', tag: 'fh-939ee7351fd343d9' },
        { latestRevision: true, percent: 100, revisionName: 'ssrtalentconsultingacf1-00156-loh' },
      ],
    },
  };
  assert.deepEqual(
    captureProductionRollbackPoint(stub(withTags)),
    { traffic: [{ revision: 'ssrtalentconsultingacf1-00156-loh', percent: 100 }] },
  );

  // Split traffic still merges per revision, and a tagged entry alongside it is ignored.
  assert.deepEqual(
    captureProductionRollbackPoint(stub({
      status: {
        traffic: [
          { revisionName: 'ssrtalentconsultingacf1-00041-sta', percent: 60 },
          { revisionName: 'ssrtalentconsultingacf1-00041-sta', percent: 20 },
          { revisionName: 'ssrtalentconsultingacf1-00042-can', percent: 20 },
          { revisionName: 'ssrtalentconsultingacf1-00009-old', tag: 'fh-legacy' },
        ],
      },
    })),
    {
      traffic: [
        { revision: 'ssrtalentconsultingacf1-00041-sta', percent: 80 },
        { revision: 'ssrtalentconsultingacf1-00042-can', percent: 20 },
      ],
    },
  );

  // Ignoring percent-less entries must not make the validation permissive.
  for (const invalid of [
    { status: { traffic: [{ revisionName: 'ssrtalentconsultingacf1-00156-loh', percent: 60 }] } },
    { status: { traffic: [{ revisionName: 'ssrtalentconsultingacf1-00156-loh', tag: 'fh-only' }] } },
    { status: { traffic: [{ revisionName: 'ssrtalentconsultingacf1-00156-loh', percent: 150 }] } },
    { status: { traffic: [] } },
  ]) {
    assert.throws(() => captureProductionRollbackPoint(stub(invalid)), /invalid resolved traffic assignment/);
  }
});

test('post-deploy promotion routes traffic to the exact latest ready revision', () => {
  const calls = [];
  const revision = promoteDeployedRevision({ runGcloud: args => {
    calls.push(args);
    if (args[0] === 'functions') return { status: 0, stdout: JSON.stringify({ state: 'ACTIVE', serviceConfig: { revision: 'ssrtalentconsultingacf1-00169-fuy' } }), stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  } });
  assert.equal(revision, 'ssrtalentconsultingacf1-00169-fuy');
  assert.ok(calls.some(args => args.includes('--to-revisions=ssrtalentconsultingacf1-00169-fuy=100')));
});

test('post-deploy promotion fails closed when latest revision is not ready', () => {
  assert.throws(() => promoteDeployedRevision({ runGcloud: args => args[0] === 'functions'
    ? { status: 0, stdout: JSON.stringify({ state: 'DEPLOYING', serviceConfig: { revision: 'ssrtalentconsultingacf1-00169-fuy' } }), stderr: '' }
    : { status: 0, stdout: '', stderr: '' } }), /not active or valid/);
});

test('Firebase deployment stages validated runtime values without reserved Firebase keys', () => {
  const staged = buildFirebaseRuntimeEnv(
    'KEEP=old\nROOT_ONLY=value\nFIREBASE_CONFIG=reserved\nADMIN_SMOKE_MFA_ID_TOKEN=stale\n',
    'KEEP=new\nCRON_SECRET=strong\nFIREBASE_SERVICE_ACCOUNT_JSON=reserved\nFIREBASE_MFA_PROJECT_ENABLED=false\nADMIN_SMOKE_MFA_ID_TOKEN=fresh-sensitive-token\nADMIN_SMOKE_OWNER_EMAIL=owner@example.com\nADMIN_AGGREGATE_BASE_URL=https://talentconsulting.io\n',
  );
  assert.match(staged, /^KEEP=new$/m);
  assert.match(staged, /^ROOT_ONLY=value$/m);
  assert.match(staged, /^CRON_SECRET=strong$/m);
  assert.doesNotMatch(staged, /^FIREBASE_/m);
  assert.doesNotMatch(staged, /^ADMIN_SMOKE_MFA_ID_TOKEN=/m);
  assert.doesNotMatch(staged, /^ADMIN_SMOKE_OWNER_EMAIL=/m);
  assert.doesNotMatch(staged, /^ADMIN_AGGREGATE_BASE_URL=/m);
});

test('Firebase deployment restores bytes after fallback failure and never runs after preflight failure', () => {
  const originalContent = '{"hosting":{"headers":[]},"firestore":{"rules":"firestore.rules"}}\n';
  const originalEnvContent = 'ROOT_ONLY=value\n';
  const localEnvContent = 'CRON_SECRET=approved_cron_secret_with_at_least_32_characters\n';
  const writes = [];
  const fileSystem = {
    readFileSync: file => file === './firebase.json'
      ? originalContent
      : file === './.env'
        ? originalEnvContent
        : localEnvContent,
    writeFileSync: (file, content) => writes.push({ file, content }),
    existsSync: () => true,
    // deployFirebase prunes .next/dev and .next/cache before the adapter build.
    rmSync: (file, options) => writes.push({ file, removed: true, options }),
  };
  let calls = 0;
  assert.throws(() => deployFirebase({
    fileSystem,
    runPreflight: () => {},
    runFirebase: args => {
      calls += 1;
      if (args[0] === 'deploy' && args.includes('hosting,firestore')) {
        return { status: 1, stdout: '', stderr: 'Firebase Hosting version finalization failed: 409 ALREADY_EXISTS' };
      }
      return { status: 2, stdout: '', stderr: 'fallback failed' };
    },
  }), /fallback failed with exit status 2/);
  assert.equal(calls, 2);
  assert.equal(writes.filter(write => write.file === './firebase.json').at(-1).content, originalContent);
  assert.equal(writes.filter(write => write.file === './.env').at(-1).content, originalEnvContent);

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
  const originalEnvContent = 'ROOT_ONLY=value\n';
  const localEnvContent = 'CRON_SECRET=approved_cron_secret_with_at_least_32_characters\n';
  const writes = [];
  assert.throws(() => deployFirebase({
    fileSystem: {
      readFileSync: file => file === './firebase.json'
        ? originalContent
        : file === './.env'
          ? originalEnvContent
          : localEnvContent,
      writeFileSync: (file, content) => writes.push({ file, content }),
      existsSync: () => true,
      // deployFirebase prunes .next/dev and .next/cache before the adapter build.
      rmSync: (file, options) => writes.push({ file, removed: true, options }),
    },
    runPreflight: () => {},
    runFirebase: () => ({ status: 1, stdout: '', stderr: 'Backend service update failed: 409 ALREADY_EXISTS' }),
  }), /Firebase deployment failed/);
  assert.equal(writes.filter(write => write.file === './firebase.json').at(-1).content, originalContent);
  assert.equal(writes.filter(write => write.file === './.env').at(-1).content, originalEnvContent);
});
