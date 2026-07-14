const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts/stripe-staging-provision.js');
const provision = require(scriptPath);
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-policy-test-'));
const contractFile = path.join(outdir, 'contracts.cjs');
const contracts = build({
  stdin: {
    contents: [
      "export * from './lib/billing/stripe-checkout-price-contract';",
      "export * from './lib/billing/stripe-webhook-events';",
    ].join('\n'),
    resolveDir: repoRoot,
    sourcefile: 'stripe-provision-test-contracts.ts',
    loader: 'ts',
  },
  outfile: contractFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(contractFile));

function policy(overrides = {}) {
  const publishableKey = 'pk_test_staging_bundle_public';
  return {
    version: provision.POLICY_VERSION,
    status: 'approved',
    stagingHostname: 'talent-staging.187-77-8-98.nip.io',
    firebaseProjectId: 'talent-consulting-stg',
    stripeTestAccountId: 'acct_approved_staging',
    stripePublishableKeySha256: `sha256:${createHash('sha256').update(publishableKey).digest('hex')}`,
    ...overrides,
  };
}

function bundle(approvedPolicy = policy(), overrides = {}) {
  const publishableKey = 'pk_test_staging_bundle_public';
  return {
    STRIPE_SECRET_KEY: 'sk_test_staging_bundle_secret',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: publishableKey,
    STRIPE_WEBHOOK_SECRET: 'whsec_staging_bundle_secret',
    STRIPE_PRO_PRICE_ID: 'price_staging_pro_month',
    STRIPE_PRO_ANNUAL_PRICE_ID: 'price_staging_pro_year',
    STRIPE_STUDIO_PRICE_ID: 'price_staging_max_month',
    STRIPE_STUDIO_ANNUAL_PRICE_ID: 'price_staging_max_year',
    STRIPE_WEBHOOK_ENDPOINT_ID: 'we_staging_bundle',
    STAGING_DEPLOYMENT_IDENTITY_FINGERPRINT: provision.expectedDeploymentIdentity(
      approvedPolicy,
      publishableKey,
    ),
    ...overrides,
  };
}

function price(id, interval, amount) {
  return {
    id,
    active: true,
    type: 'recurring',
    recurring: { interval },
    currency: 'usd',
    unit_amount: amount,
  };
}

async function provider(values, approvedPolicy, operations, overrides = {}) {
  const contract = await contracts;
  const prices = {
    [values.STRIPE_PRO_PRICE_ID]: price(values.STRIPE_PRO_PRICE_ID, 'month', 2900),
    [values.STRIPE_PRO_ANNUAL_PRICE_ID]: price(values.STRIPE_PRO_ANNUAL_PRICE_ID, 'year', 29000),
    [values.STRIPE_STUDIO_PRICE_ID]: price(values.STRIPE_STUDIO_PRICE_ID, 'month', 5900),
    [values.STRIPE_STUDIO_ANNUAL_PRICE_ID]: price(values.STRIPE_STUDIO_ANNUAL_PRICE_ID, 'year', 59000),
  };
  const secretFingerprint = createHash('sha256')
    .update(values.STRIPE_WEBHOOK_SECRET)
    .digest('hex')
    .slice(0, 24);
  return {
    contracts: contract,
    stripe: {
      accounts: {
        retrieve: async () => {
          operations.push('account');
          return { id: overrides.accountId || approvedPolicy.stripeTestAccountId };
        },
      },
      prices: {
        retrieve: async id => {
          operations.push(`price:${id}`);
          if (overrides.priceReadFails) throw new Error('unavailable');
          return prices[id];
        },
      },
      webhookEndpoints: {
        retrieve: async id => {
          operations.push(`webhook:${id}`);
          return {
            id,
            status: 'enabled',
            url: `https://${approvedPolicy.stagingHostname}/api/stripe/webhook`,
            description: `${provision.WEBHOOK_DESCRIPTION_PREFIX}${secretFingerprint}`,
            enabled_events: overrides.enabledEvents || [...contract.STRIPE_WEBHOOK_HANDLED_EVENTS],
          };
        },
      },
    },
  };
}

test('tracked policy blocks provisioning until one test account is explicitly approved', () => {
  const tracked = provision.loadApprovedPolicy();
  assert.equal(tracked.policy, null);
  assert.ok(tracked.errors.includes('policy:approved_test_account_required'));
  assert.ok(tracked.errors.includes('policy:stripe_test_account_required'));
  assert.ok(tracked.errors.includes('policy:publishable_key_hash_required'));
  assert.deepEqual(provision.validatePolicy(policy()).errors, []);
});

test('policy parsing rejects duplicate reviewed identity members', () => {
  const policyPath = path.join(outdir, 'duplicate-policy.json');
  fs.writeFileSync(policyPath, [
    '{',
    '  "version": "stripe-staging-policy-v1",',
    '  "status": "approved",',
    '  "stripeTestAccountId": "acct_first",',
    '  "stripeTestAccountId": "acct_second"',
    '}',
  ].join('\n'));
  assert.deepEqual(provision.loadApprovedPolicy(policyPath).errors, ['policy:duplicate_json_key']);
});

test('unique flat JSON parsing rejects duplicate credential members', () => {
  assert.deepEqual(provision.parseUniqueFlatJson(JSON.stringify(bundle())).errors, []);
  assert.deepEqual(
    provision.parseUniqueFlatJson('{"STRIPE_SECRET_KEY":"first","STRIPE_SECRET_KEY":"second"}').errors,
    ['bundle:duplicate_json_key'],
  );
});

test('bundle is bound to the approved account and deployment identity', () => {
  const approved = policy();
  assert.deepEqual(provision.validateBundle(bundle(approved), approved).errors, []);
  const wrongAccount = policy({ stripeTestAccountId: 'acct_other_staging' });
  assert.ok(provision.validateBundle(bundle(approved), wrongAccount).errors.includes(
    'bundle:deployment_identity_mismatch',
  ));
  assert.ok(provision.validateBundle(bundle(approved, {
    STRIPE_SECRET_KEY: 'sk_live_forbidden_bundle_secret',
  }), approved).errors.includes('bundle:secret_test_mode_required'));
  assert.ok(provision.validateBundle(bundle(approved, {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_different_account_public',
    STAGING_DEPLOYMENT_IDENTITY_FINGERPRINT: provision.expectedDeploymentIdentity(
      approved,
      'pk_test_different_account_public',
    ),
  }), approved).errors.includes('bundle:publishable_key_not_approved'));
});

test('provider proof performs six reads against the approved account and all handled events', async () => {
  const approved = policy();
  const values = bundle(approved);
  const operations = [];
  const clients = await provider(values, approved, operations);
  const result = await provision.verifyResources({
    values,
    policy: approved,
    stripe: clients.stripe,
    contracts: clients.contracts,
  });
  assert.equal(result.ready, true, JSON.stringify(result.errors));
  assert.equal(operations.length, 6);
  assert.equal(result.readOperations.length, 6);
});

test('provider proof rejects a coherent but unapproved test account', async () => {
  const approved = policy();
  const values = bundle(approved);
  const clients = await provider(values, approved, [], { accountId: 'acct_unapproved_test' });
  const result = await provision.verifyResources({
    values,
    policy: approved,
    stripe: clients.stripe,
    contracts: clients.contracts,
  });
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('stripe:approved_test_account_mismatch'));
});

test('provider proof rejects an endpoint missing any application-handled event', async () => {
  const approved = policy();
  const values = bundle(approved);
  const contract = await contracts;
  const incomplete = contract.STRIPE_WEBHOOK_HANDLED_EVENTS.slice(0, -1);
  const clients = await provider(values, approved, [], { enabledEvents: incomplete });
  const result = await provision.verifyResources({
    values,
    policy: approved,
    stripe: clients.stripe,
    contracts: clients.contracts,
  });
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('stripe:webhook_endpoint_mismatch'));
});

test('shared webhook contract exactly matches every route case', async () => {
  const contract = await contracts;
  const route = fs.readFileSync(path.join(repoRoot, 'app/api/stripe/webhook/route.ts'), 'utf8');
  const cases = [...route.matchAll(/case '([^']+)'/g)].map(match => match[1]);
  assert.deepEqual([...new Set(cases)].sort(), [...contract.STRIPE_WEBHOOK_HANDLED_EVENTS].sort());
  assert.match(route, /if \(!isHandledStripeWebhookEvent\(event\.type\)\)/);
});

test('unsafe bundle files are rejected before reading credentials', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-bundle-'));
  const file = path.join(directory, 'bundle.json');
  fs.writeFileSync(file, JSON.stringify(bundle()), { mode: 0o644 });
  assert.ok(provision.readProtectedBundle(file).errors.includes(
    'bundle_file:owner_only_permissions_required',
  ));
  fs.chmodSync(file, 0o600);
  fs.chmodSync(directory, 0o777);
  assert.ok(provision.readProtectedBundle(file).errors.includes(
    'bundle_file:protected_parent_directory_required',
  ));
});

test('validator has no installation or target mutation path', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  const packageJson = fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8');
  assert.doesNotMatch(source, /writeFile|appendFile|rename|unlink|--apply|target-env-file/);
  assert.doesNotMatch(packageJson, /provision:stripe-staging/);
  assert.match(source, /configuration installed: no/);
});

test('process blocks before provider calls while account policy is unapproved', () => {
  const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8', cwd: repoRoot });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 1);
  assert.match(output, /blocked before provider calls/);
  assert.match(output, /policy:approved_test_account_required/);
  assert.match(output, /Configuration installed: no/);
});
