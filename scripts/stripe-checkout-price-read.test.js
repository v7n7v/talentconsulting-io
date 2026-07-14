const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-checkout-price-read-'));
const outfile = path.join(outdir, 'stripe-checkout-price-read.cjs');
const readModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-checkout-price-read.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(outfile));

test('checkout tier prices are read in parallel with a bounded no-retry policy', async () => {
  const {
    retrieveStripeCheckoutTierPrices,
    STRIPE_CHECKOUT_PRICE_READ_TIMEOUT_MS,
    STRIPE_CHECKOUT_PRICE_READ_MAX_NETWORK_RETRIES,
  } = await readModule;
  const calls = [];
  const pending = new Map();
  const stripe = {
    prices: {
      retrieve(id, options) {
        calls.push({ id, options });
        return new Promise(resolve => pending.set(id, resolve));
      },
    },
  };

  const resultPromise = retrieveStripeCheckoutTierPrices(stripe, 'price_pro', 'price_max');
  assert.equal(calls.length, 2);
  assert.equal(STRIPE_CHECKOUT_PRICE_READ_TIMEOUT_MS, 5_000);
  assert.equal(STRIPE_CHECKOUT_PRICE_READ_MAX_NETWORK_RETRIES, 0);
  assert.deepEqual(calls.map(call => call.options), [
    { timeout: 5_000, maxNetworkRetries: 0 },
    { timeout: 5_000, maxNetworkRetries: 0 },
  ]);

  pending.get('price_pro')({ id: 'price_pro' });
  pending.get('price_max')({ id: 'price_max' });
  const result = await resultPromise;
  assert.equal(result.proPrice.id, 'price_pro');
  assert.equal(result.studioPrice.id, 'price_max');
});

test('both checkout routes fail closed before reservation when price verification is unavailable', () => {
  for (const relative of ['app/api/stripe/subscribe/route.ts', 'app/api/stripe/checkout/route.ts']) {
    const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
    assert.match(source, /retrieveStripeCheckoutTierPrices/);
    assert.match(source, /code: 'STRIPE_PRICE_VERIFICATION_UNAVAILABLE'/);
    assert.match(source, /status: 503/);
    assert.ok(source.indexOf('retrieveStripeCheckoutTierPrices') < source.indexOf('reserveStripeCheckout'));
    const failureBlock = source.slice(
      source.indexOf('Price verification unavailable'),
      source.indexOf("const price = plan === 'studio'"),
    );
    assert.doesNotMatch(failureBlock, /String\(error\)|console\.(error|warn)\([^\n]*error/);
  }
});
