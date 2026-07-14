const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-canary-test-'));
const outfile = path.join(outdir, 'canary.cjs');

const canaryModule = build({
  entryPoints: [path.join(repoRoot, 'lib/billing/stripe-staging-canary.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
  plugins: [{
    name: 'alias-root',
    setup(builder) {
      builder.onResolve({ filter: /^@\// }, args => {
        const target = path.join(repoRoot, args.path.slice(2));
        const resolved = [target, `${target}.ts`, `${target}.tsx`].find(candidate => fs.existsSync(candidate));
        return { path: resolved || target };
      });
    },
  }],
}).then(() => require(outfile));

const env = {
  NODE_ENV: 'production',
  STAGING_HOSTNAME: 'staging.example.test',
  STRIPE_SECRET_KEY: 'sk_test_staging_canary_key',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_staging_canary_key',
  STRIPE_BUILD_PUBLISHABLE_KEY: 'pk_test_staging_canary_key',
  STRIPE_WEBHOOK_SECRET: 'whsec_staging_canary_secret',
  STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT: '50',
  STRIPE_PRO_PRICE_ID: 'price_test_pro_month',
  STRIPE_PRO_ANNUAL_PRICE_ID: 'price_test_pro_year',
  STRIPE_STUDIO_PRICE_ID: 'price_test_max_month',
  STRIPE_STUDIO_ANNUAL_PRICE_ID: 'price_test_max_year',
};

function price(id, interval, amount, overrides = {}) {
  return {
    id,
    active: true,
    type: 'recurring',
    interval,
    currency: 'usd',
    unitAmount: amount,
    ...overrides,
  };
}

const prices = {
  pro: {
    month: price(env.STRIPE_PRO_PRICE_ID, 'month', 1900),
    year: price(env.STRIPE_PRO_ANNUAL_PRICE_ID, 'year', 14900),
  },
  studio: {
    month: price(env.STRIPE_STUDIO_PRICE_ID, 'month', 4900),
    year: price(env.STRIPE_STUDIO_ANNUAL_PRICE_ID, 'year', 39900),
  },
};

const promotionAudit = {
  verified: true,
  reason: 'verified',
  activeCodeCount: 1,
  maxObservedPercent: 25,
  pagesRead: 1,
};

function publicPrice(value) {
  return {
    identityFingerprint: `sha256:${createHash('sha256').update(value.id).digest('hex').slice(0, 24)}`,
    unitAmount: value.unitAmount,
    currency: value.currency,
    interval: value.interval,
    sourceInterval: value.interval,
    active: value.active,
    display: '$19',
    effectiveMonthlyDisplay: '$19',
    savingsLabel: '',
    sourceStatus: 'verified',
  };
}

function publicPricing() {
  return {
    plans: {
      pro: { month: publicPrice(prices.pro.month), year: publicPrice(prices.pro.year) },
      studio: { month: publicPrice(prices.studio.month), year: publicPrice(prices.studio.year) },
    },
    checkout: {
      available: true,
      status: 'available',
      code: 'CHECKOUT_READY',
      message: 'Secure checkout is available.',
      options: {
        pro: { month: true, year: true },
        studio: { month: true, year: true },
      },
    },
    updatedAt: '2026-07-11T00:00:00.000Z',
  };
}

test('staging canary accepts a complete test-mode read-only price contract', async () => {
  const { buildStripeStagingCanaryAssessment } = await canaryModule;
  const result = buildStripeStagingCanaryAssessment({
    env,
    baseUrl: 'https://staging.example.test',
    prices,
    promotionAudit,
    publicPricing: publicPricing(),
    health: { status: 'ok' },
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.checks.writesAttempted, 0);
});

test('staging canary refuses live mode, missing staging markers and wrong hosts', async () => {
  const { assessStripeStagingCanaryConfiguration } = await canaryModule;
  assert.equal(assessStripeStagingCanaryConfiguration({
    ...env,
    STRIPE_SECRET_KEY: 'sk_live_staging_canary_key',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_staging_canary_key',
    STRIPE_BUILD_PUBLISHABLE_KEY: 'pk_live_staging_canary_key',
  }, 'https://staging.example.test').ready, false);
  assert.equal(assessStripeStagingCanaryConfiguration({ ...env, STAGING_HOSTNAME: '' }, 'https://staging.example.test').ready, false);
  assert.equal(assessStripeStagingCanaryConfiguration(env, 'https://production.example.test').ready, false);
  assert.equal(assessStripeStagingCanaryConfiguration(env, 'http://staging.example.test').ready, false);
  assert.equal(assessStripeStagingCanaryConfiguration(env, 'https://user:pass@staging.example.test').ready, false);
  assert.ok(assessStripeStagingCanaryConfiguration({
    ...env,
    STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT: '',
  }, 'https://staging.example.test').errors.includes('stripe:promotion_ceiling_invalid'));
});

test('staging canary blocks invalid ladders and deployed price drift', async () => {
  const { buildStripeStagingCanaryAssessment } = await canaryModule;
  const invalidPrices = structuredClone(prices);
  invalidPrices.studio.month.unitAmount = 900;
  invalidPrices.pro.year.interval = 'month';
  const driftedPublic = publicPricing();
  driftedPublic.plans.pro.month.unitAmount = 2000;
  const result = buildStripeStagingCanaryAssessment({
    env,
    baseUrl: 'https://staging.example.test',
    prices: invalidPrices,
    promotionAudit,
    publicPricing: driftedPublic,
    health: { status: 'ok' },
  });
  assert.equal(result.ready, false);
  assert.ok(result.errors.some(error => error.includes('tier_price_order_invalid')));
  assert.ok(result.errors.some(error => error.includes('invalid_price_evidence')));
  assert.ok(result.errors.includes('deployed_price:pro:month:mismatch'));
});

test('staging canary binds each retrieved price to its configured slot', async () => {
  const { buildStripeStagingCanaryAssessment } = await canaryModule;
  const swapped = structuredClone(prices);
  [swapped.pro.month, swapped.studio.month] = [swapped.studio.month, swapped.pro.month];
  const result = buildStripeStagingCanaryAssessment({
    env,
    baseUrl: 'https://staging.example.test',
    prices: swapped,
    promotionAudit,
    publicPricing: publicPricing(),
    health: { status: 'ok' },
  });
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('stripe:month:pro:configured_id_mismatch'));
  assert.ok(result.errors.includes('stripe:month:studio:configured_id_mismatch'));
});

test('staging canary rejects a deployed price with matching economics but a different identity', async () => {
  const { buildStripeStagingCanaryAssessment } = await canaryModule;
  const deployed = publicPricing();
  deployed.plans.pro.month.identityFingerprint = `sha256:${'f'.repeat(24)}`;
  const result = buildStripeStagingCanaryAssessment({
    env,
    baseUrl: 'https://staging.example.test',
    prices,
    promotionAudit,
    publicPricing: deployed,
    health: { status: 'ok' },
  });
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('deployed_price:pro:month:mismatch'));
});

test('staging canary blocks unavailable checkout and unhealthy deployment', async () => {
  const { buildStripeStagingCanaryAssessment } = await canaryModule;
  const unavailable = publicPricing();
  unavailable.checkout.available = false;
  unavailable.checkout.status = 'blocked';
  unavailable.checkout.code = 'CHECKOUT_CONFIGURATION_BLOCKED';
  unavailable.checkout.options.studio.year = false;
  const result = buildStripeStagingCanaryAssessment({
    env,
    baseUrl: 'https://staging.example.test',
    prices,
    promotionAudit,
    publicPricing: unavailable,
    health: { status: 'degraded' },
  });
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('deployed_checkout:not_ready'));
  assert.ok(result.errors.includes('staging_health:not_ok'));
});

test('staging canary blocks an unverified promotion inventory', async () => {
  const { buildStripeStagingCanaryAssessment } = await canaryModule;
  const result = buildStripeStagingCanaryAssessment({
    env,
    baseUrl: 'https://staging.example.test',
    prices,
    promotionAudit: {
      ...promotionAudit,
      verified: false,
      reason: 'fixed_amount_coupon',
      maxObservedPercent: null,
    },
    publicPricing: publicPricing(),
    health: { status: 'ok' },
  });
  assert.equal(result.ready, false);
  assert.equal(result.checks.stripePromotionInventory, false);
  assert.ok(result.errors.includes('stripe:promotion_inventory:fixed_amount_coupon'));
});

test('operator preflight verifies promotions and performs exactly seven instrumented reads', async () => {
  const operator = require(path.join(repoRoot, 'scripts/stripe-staging-canary-preflight.js'));
  const { buildStripeStagingCanaryAssessment, assessStripeStagingCanaryConfiguration } = await canaryModule;
  const byId = new Map(Object.values(prices).flatMap(plan => Object.values(plan)).map(value => [value.id, value]));
  const stripe = new Proxy({
    promotionCodes: {
      list: async () => ({
        data: [{
          id: 'promo_test_safe',
          promotion: { coupon: { valid: true, percent_off: 25, amount_off: null } },
        }],
        has_more: false,
      }),
    },
    prices: {
      retrieve: async id => {
        const value = byId.get(id);
        if (!value) throw new Error('unknown test price');
        return {
          id: value.id,
          active: value.active,
          type: value.type,
          recurring: { interval: value.interval },
          currency: value.currency,
          unit_amount: value.unitAmount,
        };
      },
    },
  }, {
    get(target, property) {
      if (property !== 'prices' && property !== 'promotionCodes') {
        throw new Error(`Unexpected Stripe operation: ${String(property)}`);
      }
      return target[property];
    },
  });
  const readJson = async url => url.endsWith('/api/billing/prices') ? publicPricing() : { status: 'ok' };
  const result = await operator.runReadOnlyCanary({
    env,
    baseUrl: 'https://staging.example.test',
    contract: {
      auditStripePromotionDiscountCeiling: (await canaryModule).auditStripePromotionDiscountCeiling,
      buildStripeStagingCanaryAssessment,
      assessStripeStagingCanaryConfiguration,
    },
    stripe,
    readJson,
  });
  assert.equal(result.assessment.ready, true);
  assert.deepEqual(result.readOperations, [
    'stripe.promotion_codes.list:page_1',
    'stripe.price.retrieve:pro:month',
    'stripe.price.retrieve:pro:year',
    'stripe.price.retrieve:studio:month',
    'stripe.price.retrieve:studio:year',
    'http.get:billing_prices',
    'http.get:health',
  ]);
});

test('operator preflight source is read-only and never prints configured values', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts/stripe-staging-canary-preflight.js'), 'utf8');
  assert.match(source, /stripe\.prices\.retrieve/);
  assert.match(source, /stripe\.promotionCodes\.list/);
  assert.match(source, /method: 'GET'/);
  assert.match(source, /redirect: 'error'/);
  assert.match(source, /readSelectedStagingEnvFile/);
  assert.match(source, /writes attempted: 0/i);
  assert.doesNotMatch(source, /argument\('--staging-env-file',\s*'deploy\/staging/);
  assert.doesNotMatch(source, /\.create\(|\.update\(|\.cancel\(|\.del\(|method:\s*'POST'|console\.log\([^\n]*(?:SECRET|PRICE_ID|PUBLISHABLE)/i);
});

test('operator command blocks before provider calls without echoing configured values', () => {
  const envFile = path.join(outdir, 'blocked.env');
  const secretMarker = 'sk_live_sensitive_marker_not_for_output';
  fs.writeFileSync(envFile, [
    'NODE_ENV=production',
    'STAGING_HOSTNAME=staging.example.test',
    `STRIPE_SECRET_KEY=${secretMarker}`,
  ].join('\n'), { mode: 0o600 });
  const result = spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts/stripe-staging-canary-preflight.js'),
    '--staging-env-file', envFile,
    '--base-url', 'https://staging.example.test',
  ], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH, NODE_ENV: 'production' },
    encoding: 'utf8',
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0);
  assert.match(output, /blocked before provider calls/);
  assert.match(output, /Writes attempted: 0/);
  assert.equal(output.includes(secretMarker), false);
});

test('operator command requires the selected staging env file', () => {
  const result = spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts/stripe-staging-canary-preflight.js'),
    '--staging-env-file', path.join(outdir, 'does-not-exist.env'),
    '--base-url', 'https://staging.example.test',
  ], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH, STRIPE_SECRET_KEY: 'sk_test_stale_shell_value' },
    encoding: 'utf8',
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0);
  assert.match(output, /env_file:not_found/);
  assert.equal(output.includes('sk_test_stale_shell_value'), false);
});

test('operator rejects an implicit, readable or symlinked env file before provider calls', () => {
  const unsafeFile = path.join(outdir, 'unsafe-staging.env');
  const symlink = path.join(outdir, 'linked-staging.env');
  fs.writeFileSync(unsafeFile, 'NODE_ENV=production\n', { mode: 0o644 });
  fs.symlinkSync(unsafeFile, symlink);
  const run = args => spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts/stripe-staging-canary-preflight.js'),
    ...args,
  ], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH },
    encoding: 'utf8',
  });

  const implicit = run([]);
  const readable = run(['--staging-env-file', unsafeFile]);
  const linked = run(['--staging-env-file', symlink]);
  assert.match(`${implicit.stdout}\n${implicit.stderr}`, /env_file:not_found/);
  if (process.platform !== 'win32') {
    assert.match(`${readable.stdout}\n${readable.stderr}`, /env_file:unsafe_permissions/);
  }
  assert.match(`${linked.stdout}\n${linked.stderr}`, /env_file:not_found/);
  for (const result of [implicit, readable, linked]) {
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Writes attempted: 0/);
  }
});
