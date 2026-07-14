const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-billing-checkout-readiness-'));
const outfile = path.join(outdir, 'billing-price-types.cjs');

const priceTypesModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'billing-price-types.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(outfile));

test('unavailable billing prices carry a typed fail-closed checkout state', async () => {
  const { PRICE_UNAVAILABLE_LABEL, unavailableBillingPrices } = await priceTypesModule;
  const prices = unavailableBillingPrices();
  assert.equal(PRICE_UNAVAILABLE_LABEL, 'Price unavailable');
  assert.deepEqual(prices.checkout, {
    available: false,
    status: 'not_configured',
    code: 'CHECKOUT_NOT_CONFIGURED',
    message: 'Secure checkout is temporarily unavailable. Your current plan remains active.',
    options: {
      pro: { month: false, year: false },
      studio: { month: false, year: false },
    },
  });
});

test('malformed billing payloads normalize to a safe non-checkout state', async () => {
  const { normalizePublicBillingPrices } = await priceTypesModule;
  assert.equal(normalizePublicBillingPrices(null).checkout.available, false);
  assert.equal(normalizePublicBillingPrices({ checkout: { available: 'false' } }).checkout.available, false);

  const malformed = normalizePublicBillingPrices({
    plans: {
      pro: { month: {}, year: {} },
      studio: { month: {}, year: {} },
    },
    checkout: {
      available: true,
      status: 'available',
      code: 'CHECKOUT_READY',
      options: {
        pro: { month: true, year: true },
        studio: { month: true, year: true },
      },
    },
    updatedAt: '2026-07-11T00:00:00.000Z',
  });
  assert.equal(malformed.checkout.available, false);
  assert.equal(malformed.plans.pro.month.sourceStatus, 'retrieval_error');
});

test('client checkout readiness requires the complete Pro and Max price ladder', async () => {
  const { normalizePublicBillingPrices } = await priceTypesModule;
  const price = (interval, amount, identity) => ({
    identityFingerprint: `sha256:${identity.repeat(24)}`,
    unitAmount: amount,
    currency: 'usd',
    interval,
    sourceInterval: interval,
    active: true,
    display: `$${amount / 100}`,
    effectiveMonthlyDisplay: `$${amount / 100}`,
    savingsLabel: '',
    sourceStatus: 'verified',
  });
  const payload = {
    plans: {
      pro: { month: price('month', 499, 'a'), year: price('year', 4999, 'b') },
      studio: { month: price('month', 999, 'c'), year: price('year', 8999, 'd') },
    },
    checkout: {
      available: true,
      status: 'available',
      code: 'CHECKOUT_READY',
      options: {
        pro: { month: true, year: true },
        studio: { month: true, year: true },
      },
    },
    updatedAt: '2026-07-11T00:00:00.000Z',
  };
  assert.equal(normalizePublicBillingPrices(payload).checkout.available, true);
  const partial = normalizePublicBillingPrices({
    ...payload,
    plans: {
      ...payload.plans,
      studio: { ...payload.plans.studio, month: price('month', 399, 'c') },
    },
  });
  assert.equal(partial.checkout.available, true);
  assert.equal(partial.checkout.options.pro.month, false);
  assert.equal(partial.checkout.options.studio.month, false);
  assert.equal(partial.checkout.options.pro.year, true);

  const commerciallyPartial = normalizePublicBillingPrices({
    ...payload,
    checkout: {
      ...payload.checkout,
      options: {
        pro: { month: true, year: true },
        studio: { month: false, year: true },
      },
    },
  });
  assert.equal(commerciallyPartial.checkout.options.pro.month, true);
  assert.equal(commerciallyPartial.checkout.options.studio.month, false);
  assert.equal(commerciallyPartial.checkout.options.studio.year, true);
});

test('the pricing service derives a public checkout status from the server readiness contract', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'lib', 'billing-prices.ts'), 'utf8');
  assert.match(source, /const checkoutRuntime = getStripeRuntimeReadiness\(\)/);
  assert.match(source, /getStripeCommercialReadinessSnapshot/);
  assert.match(source, /monthContractReady && commercialOptions\.pro\.month/);
  assert.match(source, /available:\s*true,[\s\S]*code:\s*'CHECKOUT_READY'/);
  assert.match(source, /code:\s*runtime\.status === 'not_configured'[\s\S]*'CHECKOUT_NOT_CONFIGURED'[\s\S]*'CHECKOUT_CONFIGURATION_BLOCKED'/);
  assert.doesNotMatch(source, /checkoutRuntime\.missing/);
  assert.doesNotMatch(source, /checkoutRuntime\.secretKeyMode/);
});

test('the billing hook fails closed when an older or malformed response omits checkout readiness', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'hooks', 'use-billing-prices.ts'), 'utf8');
  assert.match(source, /setPrices\(normalizePublicBillingPrices\(data\)\)/);
  assert.match(source, /setPrices\(previous => \(\{ \.\.\.previous, checkout: unavailableBillingCheckout\(\) \}\)\)/);
  assert.match(source, /window\.setInterval\(loadPrices, 60_000\)/);
  assert.match(source, /window\.addEventListener\('focus', refreshOnFocus\)/);
  assert.match(source, /return \{ prices, checkout: prices\.checkout, loading, error, refresh: loadPrices \}/);
});

test('upgrade surfaces disable checkout and render an explicit non-destructive recovery state', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'app', 'suite', 'upgrade', 'page.tsx'), 'utf8');
  const modal = fs.readFileSync(path.join(repoRoot, 'components', 'UpgradeModal.tsx'), 'utf8');

  assert.match(page, /const checkoutAvailable = checkout\.options\[selectedPlan\]\[interval\]/);
  assert.match(page, /const checkoutUnavailable = !pricesLoading && !checkout\.options\[selectedPlan\]\[interval\]/);
  assert.match(page, /Checkout is temporarily unavailable/);
  assert.match(page, /Check again/);
  assert.match(page, /if \(!checkout\.options\[plan\]\[int\]\) \{[\s\S]*This billing option is temporarily unavailable/);

  assert.match(modal, /const selectedCheckoutAvailable = checkout\.options\[selectedPlan\]\[interval\]/);
  assert.match(modal, /selectedCheckoutAvailable \? 'Continue to secure checkout' : 'Checkout unavailable'/);
  assert.match(modal, /Checkout is temporarily unavailable/);
  assert.match(modal, /aria-pressed=\{interval === int\}/);
  assert.match(modal, /aria-live="polite" aria-busy=\{loading \|\| pricesLoading\}/);
  assert.match(modal, /role="status" aria-label="Opening secure checkout"/);
  assert.match(modal, /role="alert"/);
  assert.match(modal, /if \(!checkout\.options\[plan\]\[selectedInterval\]\) \{[\s\S]*This billing option is temporarily unavailable/);
  assert.doesNotMatch(modal, /checkoutRuntime\.|secretKeyMode|publishableKeyMode/);
});

test('public pricing readiness is not browser-cached and validates actual Stripe intervals', () => {
  const route = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'billing', 'prices', 'route.ts'), 'utf8');
  const service = fs.readFileSync(path.join(repoRoot, 'lib', 'billing-prices.ts'), 'utf8');
  assert.match(route, /Cache-Control': 'no-store, max-age=0'/);
  assert.match(service, /const CACHE_TTL_MS = 60 \* 1000/);
  assert.match(service, /if \(sourceInterval !== interval\) \{[\s\S]*unavailableBillingPrice\(interval, 'retrieval_error'\)/);
  assert.match(service, /publicBillingIntervalContractReady\(next\.plans, 'month'\)/);
  assert.match(service, /getStripeCommercialReadinessSnapshot\(stripe, next\.plans, options\)/);
  assert.match(service, /if \(!hasRetrievalError\) \{[\s\S]*cachedPrices =/);
});

test('billing price retrieval is parallel, time-bounded, and never caches provider failures', () => {
  const service = fs.readFileSync(path.join(repoRoot, 'lib', 'billing-prices.ts'), 'utf8');
  assert.match(service, /BILLING_PRICE_REQUEST_TIMEOUT_MS = 5_000/);
  assert.match(service, /BILLING_PRICE_MAX_NETWORK_RETRIES = 0/);
  assert.match(service, /timeout: BILLING_PRICE_REQUEST_TIMEOUT_MS/);
  assert.match(service, /maxNetworkRetries: BILLING_PRICE_MAX_NETWORK_RETRIES/);
  assert.match(service, /await Promise\.all\(\[/);
  assert.match(service, /return unavailableBillingPrice\(interval, 'retrieval_error'\)/);
  assert.match(service, /if \(!hasRetrievalError\) \{[\s\S]*cachedPrices =/);
});

test('checkout APIs and public pricing use the same runtime readiness source', () => {
  const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  for (const source of [
    read('lib/billing-prices.ts'),
    read('app/api/stripe/subscribe/route.ts'),
    read('app/api/stripe/checkout/route.ts'),
  ]) {
    assert.match(source, /getStripeRuntimeReadiness/);
  }
});
