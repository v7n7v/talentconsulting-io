const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-runtime-readiness-'));
const outfile = path.join(outdir, 'stripe-runtime-readiness.cjs');

const readinessModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-runtime-readiness.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(outfile));

const priceContractOutfile = path.join(outdir, 'stripe-checkout-price-contract.cjs');
const priceContractModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-checkout-price-contract.ts')],
  outfile: priceContractOutfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(priceContractOutfile));

const testConfig = {
  STAGING_HOSTNAME: 'staging.example.test',
  STRIPE_SECRET_KEY: 'sk_test_runtime_ready',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_runtime_ready',
  STRIPE_BUILD_PUBLISHABLE_KEY: 'pk_test_runtime_ready',
  STRIPE_WEBHOOK_SECRET: 'whsec_runtime_ready',
  STRIPE_PRO_PRICE_ID: 'price_pro_month',
  STRIPE_PRO_ANNUAL_PRICE_ID: 'price_pro_year',
  STRIPE_STUDIO_PRICE_ID: 'price_max_month',
  STRIPE_STUDIO_ANNUAL_PRICE_ID: 'price_max_year',
};

const liveConfig = {
  NODE_ENV: 'production',
  STRIPE_SECRET_KEY: 'sk_live_runtime_ready',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_runtime_ready',
  STRIPE_BUILD_PUBLISHABLE_KEY: 'pk_live_runtime_ready',
  STRIPE_WEBHOOK_SECRET: 'whsec_runtime_ready',
  STRIPE_PRO_PRICE_ID: 'price_pro_month',
  STRIPE_PRO_ANNUAL_PRICE_ID: 'price_pro_year',
  STRIPE_STUDIO_PRICE_ID: 'price_max_month',
  STRIPE_STUDIO_ANNUAL_PRICE_ID: 'price_max_year',
};

test('missing Stripe configuration is reported without attempting checkout', async () => {
  const { getStripeRuntimeReadiness } = await readinessModule;
  const result = getStripeRuntimeReadiness({ STAGING_HOSTNAME: 'staging.example.test' });
  assert.equal(result.status, 'not_configured');
  assert.equal(result.configurationReady, false);
  assert.equal(result.requiredMode, 'test');
  assert.equal(result.pricesConfigured, 0);
});

test('staging accepts a complete test-mode configuration', async () => {
  const { getStripeRuntimeReadiness } = await readinessModule;
  const result = getStripeRuntimeReadiness(testConfig);
  assert.equal(result.status, 'configured');
  assert.equal(result.configurationReady, true);
  assert.equal(result.secretKeyMode, 'test');
  assert.equal(result.publishableKeyMode, 'test');
});

test('staging blocks live Stripe keys', async () => {
  const { getStripeRuntimeReadiness } = await readinessModule;
  const result = getStripeRuntimeReadiness({
    ...liveConfig,
    STAGING_HOSTNAME: 'staging.example.test',
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.configurationReady, false);
  assert.ok(result.missing.includes('test_mode_required'));
});

test('production blocks test Stripe keys', async () => {
  const { getStripeRuntimeReadiness } = await readinessModule;
  const { STAGING_HOSTNAME: _staging, ...config } = testConfig;
  const result = getStripeRuntimeReadiness({ ...config, NODE_ENV: 'production' });
  assert.equal(result.status, 'blocked');
  assert.equal(result.configurationReady, false);
  assert.ok(result.missing.includes('live_mode_required'));
});

test('production accepts a complete live-mode configuration', async () => {
  const { getStripeRuntimeReadiness } = await readinessModule;
  const result = getStripeRuntimeReadiness(liveConfig);
  assert.equal(result.status, 'configured');
  assert.equal(result.configurationReady, true);
  assert.equal(result.requiredMode, 'live');
});

test('webhook readiness stays available when checkout-only configuration drifts', async () => {
  const { getStripeWebhookReadiness } = await readinessModule;
  const result = getStripeWebhookReadiness({
    ...testConfig,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_wrong_browser_mode',
    STRIPE_BUILD_PUBLISHABLE_KEY: 'pk_live_wrong_browser_mode',
    STRIPE_PRO_PRICE_ID: '',
    STRIPE_PRO_ANNUAL_PRICE_ID: '',
    STRIPE_STUDIO_PRICE_ID: '',
    STRIPE_STUDIO_ANNUAL_PRICE_ID: '',
  });
  assert.equal(result.configurationReady, true);
  assert.equal(result.secretKeyMode, 'test');
  assert.equal(result.webhookConfigured, true);
});

test('webhook readiness fails closed for an invalid secret mode or environment mismatch', async () => {
  const { getStripeWebhookReadiness } = await readinessModule;
  assert.equal(getStripeWebhookReadiness({
    ...testConfig,
    STRIPE_SECRET_KEY: 'rk_test_not_a_secret_key',
  }).configurationReady, false);
  assert.equal(getStripeWebhookReadiness({
    ...testConfig,
    STRIPE_SECRET_KEY: 'sk_live_wrong_for_staging',
  }).configurationReady, false);
});

test('mixed key modes and placeholder keys are blocked', async () => {
  const { getStripeRuntimeReadiness } = await readinessModule;
  const mixed = getStripeRuntimeReadiness({
    ...testConfig,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_runtime_ready',
  });
  assert.equal(mixed.configurationReady, false);
  assert.ok(mixed.missing.includes('key_mode_alignment'));

  const placeholders = getStripeRuntimeReadiness({
    ...testConfig,
    STRIPE_SECRET_KEY: 'sk_test_replace_me',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_your_key',
  });
  assert.equal(placeholders.configurationReady, false);
  assert.equal(placeholders.secretKeyMode, 'unknown');
  assert.equal(placeholders.publishableKeyMode, 'unknown');
});

test('a missing or different browser build key is blocked', async () => {
  const { getStripeRuntimeReadiness } = await readinessModule;
  const missingBuild = getStripeRuntimeReadiness({
    ...testConfig,
    STRIPE_BUILD_PUBLISHABLE_KEY: '',
  });
  assert.equal(missingBuild.configurationReady, false);
  assert.ok(missingBuild.missing.includes('browser_build_key'));

  const differentBuild = getStripeRuntimeReadiness({
    ...testConfig,
    STRIPE_BUILD_PUBLISHABLE_KEY: 'pk_test_different_build_key',
  });
  assert.equal(differentBuild.configurationReady, false);
  assert.equal(differentBuild.browserBuildAligned, false);
  assert.ok(differentBuild.missing.includes('browser_build_alignment'));
});

test('duplicate plan price ids are blocked', async () => {
  const { getStripeRuntimeReadiness } = await readinessModule;
  const result = getStripeRuntimeReadiness({
    ...testConfig,
    STRIPE_STUDIO_PRICE_ID: testConfig.STRIPE_PRO_PRICE_ID,
  });
  assert.equal(result.configurationReady, false);
  assert.ok(result.missing.includes('price_ids_unique'));
});

test('checkout price contract verifies the tier ladder and selected plan', async () => {
  const { validateStripeCheckoutPriceContract } = await priceContractModule;
  const base = {
    plan: 'studio',
    interval: 'month',
    selectedPriceId: 'price_max_month',
    pro: {
      id: 'price_pro_month', active: true, type: 'recurring', interval: 'month', currency: 'usd', unitAmount: 499,
    },
    studio: {
      id: 'price_max_month', active: true, type: 'recurring', interval: 'month', currency: 'usd', unitAmount: 999,
    },
  };
  assert.deepEqual(validateStripeCheckoutPriceContract(base), { valid: true, reason: 'verified' });
  assert.equal(validateStripeCheckoutPriceContract({
    ...base,
    pro: { ...base.pro, id: base.studio.id },
  }).reason, 'duplicate_tier_price');
  assert.equal(validateStripeCheckoutPriceContract({
    ...base,
    studio: { ...base.studio, unitAmount: 399 },
  }).reason, 'tier_price_order_invalid');
  assert.equal(validateStripeCheckoutPriceContract({
    ...base,
    studio: { ...base.studio, active: false },
  }).reason, 'selected_price_inactive');
});

test('partial price configuration is blocked and names missing slots', async () => {
  const { getStripeRuntimeReadiness } = await readinessModule;
  const result = getStripeRuntimeReadiness({
    ...testConfig,
    STRIPE_STUDIO_ANNUAL_PRICE_ID: '',
  });
  assert.equal(result.configurationReady, false);
  assert.equal(result.pricesConfigured, 3);
  assert.ok(result.missing.includes('maxYear'));
});

test('readiness output never contains configured Stripe values', async () => {
  const { getStripeRuntimeReadiness } = await readinessModule;
  const serialized = JSON.stringify(getStripeRuntimeReadiness(testConfig));
  for (const value of Object.values(testConfig)) {
    assert.equal(serialized.includes(value), false);
  }
});

test('checkout, webhook, Docker and operator surfaces enforce the readiness gate', () => {
  const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  const embedded = read('app/api/stripe/subscribe/route.ts');
  const hosted = read('app/api/stripe/checkout/route.ts');
  const webhook = read('app/api/stripe/webhook/route.ts');
  const dockerfile = read('Dockerfile');
  const compose = read('deploy/staging/docker-compose.yml');
  const adminOps = read('app/api/admin/ops/route.ts');
  const readiness = read('lib/billing/stripe-runtime-readiness.ts');
  const webhookEnvelope = read('lib/billing/stripe-webhook-envelope.ts');

  for (const route of [embedded, hosted]) {
    assert.match(route, /guardApiRoute[\s\S]*getStripeRuntimeReadiness\(\)\.configurationReady/);
    assert.match(route, /STRIPE_CHECKOUT_NOT_READY/);
    assert.match(route, /validateStripeCheckoutPriceContract/);
    assert.match(route, /retrieveStripeCheckoutTierPrices/);
    assert.match(route, /STRIPE_PRICE_VERIFICATION_UNAVAILABLE/);
  }
  assert.ok(webhook.indexOf('getStripeWebhookReadiness().configurationReady') < webhook.indexOf('verifyStripeWebhookEnvelope({'));
  assert.match(webhookEnvelope, /webhooks\.constructEvent/);
  assert.match(webhook, /Checkout session \$\{session\.id\} is missing its Firebase owner/);
  assert.match(webhook, /Invoice \$\{invoice\.id\} subscription owner could not be verified/);
  assert.match(webhook, /Failed invoice \$\{invoice\.id\} subscription owner could not be verified/);
  assert.match(webhook, /Canceled subscription \$\{subscription\.id\} owner could not be verified/);
  assert.match(dockerfile, /ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
  assert.match(dockerfile, /ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=\$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
  assert.match(dockerfile, /ENV STRIPE_BUILD_PUBLISHABLE_KEY=\$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
  assert.match(compose, /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:\s*\$\{NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:-\}/);
  assert.match(compose, /STAGING_HOSTNAME:\s*\$\{STAGING_HOSTNAME:\?STAGING_HOSTNAME is required for staging safety\}/);
  assert.match(adminOps, /const stripeCheckout = getStripeRuntimeReadiness\(\)/);
  assert.match(adminOps, /stripeCheckout\.configurationReady/);
  assert.match(adminOps, /stripeCheckout,/);
  assert.match(readiness, /compiledStripePublishableKey = process\.env\.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
  assert.match(readiness, /env\.STRIPE_BUILD_PUBLISHABLE_KEY \|\| compiledStripePublishableKey/);
});
