const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');

async function loadCheckoutEconomics() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'stripe-checkout-economics-'));
  const outfile = path.join(outdir, 'checkout-economics.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-checkout-economics.ts')],
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
  });
  return require(outfile);
}

function recurringPrice(unitAmount, interval = 'month') {
  return {
    id: `price_${interval}_${unitAmount}`,
    active: true,
    currency: 'usd',
    unit_amount: unitAmount,
    recurring: { interval },
  };
}

function publicPrice(interval, unitAmount, identity) {
  return {
    identityFingerprint: `sha256:${identity.repeat(24)}`,
    unitAmount,
    currency: 'usd',
    interval,
    sourceInterval: interval,
    active: true,
    display: `$${unitAmount / 100}`,
    effectiveMonthlyDisplay: '',
    savingsLabel: '',
    sourceStatus: 'verified',
  };
}

function publicPrices(overrides = {}) {
  return {
    pro: {
      month: publicPrice('month', 2_000, 'a'),
      year: publicPrice('year', 19_200, 'b'),
    },
    studio: {
      month: publicPrice('month', 5_000, 'c'),
      year: publicPrice('year', 48_000, 'd'),
    },
    ...overrides,
  };
}

function promotionReader(percentOff = 50) {
  let reads = 0;
  return {
    get reads() { return reads; },
    promotionCodes: {
      async list() {
        reads += 1;
        return {
          data: [{
            id: 'promo_test',
            promotion: {
              coupon: { valid: true, percent_off: percentOff, amount_off: null },
            },
          }],
          has_more: false,
        };
      },
    },
  };
}

test('missing reviewed promotion policy blocks before provider reads', async () => {
  const economics = await loadCheckoutEconomics();
  const stripe = promotionReader();
  const result = await economics.verifyStripeCheckoutEconomics(stripe, {
    plan: 'pro',
    interval: 'month',
    selectedPrice: recurringPrice(2_000),
    reviewedPromotionDiscountPercent: '',
  });

  assert.equal(result.ready, false);
  assert.equal(result.code, 'CHECKOUT_PROMOTION_POLICY_INVALID');
  assert.equal(stripe.reads, 0);
});

test('unverified provider promotion exposure blocks checkout', async () => {
  const economics = await loadCheckoutEconomics();
  const stripe = promotionReader(60);
  const result = await economics.verifyStripeCheckoutEconomics(stripe, {
    plan: 'pro',
    interval: 'month',
    selectedPrice: recurringPrice(2_000),
    reviewedPromotionDiscountPercent: '50',
  });

  assert.equal(result.ready, false);
  assert.equal(result.code, 'CHECKOUT_PROMOTION_INVENTORY_UNVERIFIED');
  assert.equal(result.promotionAuditReason, 'ceiling_exceeded');
  assert.equal(stripe.reads, 1);
});

test('verified recurring price and bounded promotion exposure pass the commercial gate', async () => {
  const economics = await loadCheckoutEconomics();
  const stripe = promotionReader(50);
  const result = await economics.verifyStripeCheckoutEconomics(stripe, {
    plan: 'studio',
    interval: 'month',
    selectedPrice: recurringPrice(5_000),
    reviewedPromotionDiscountPercent: '50',
  });

  assert.equal(result.ready, true);
  assert.equal(result.code, 'CHECKOUT_ECONOMICS_READY');
  assert.equal(result.economicsStatus, 'pass');
  assert.equal(result.promotionAuditReason, 'verified');
  assert.equal(stripe.reads, 1);
});

test('verified but underpriced recurring option cannot create checkout', async () => {
  const economics = await loadCheckoutEconomics();
  const result = await economics.verifyStripeCheckoutEconomics(promotionReader(50), {
    plan: 'studio',
    interval: 'month',
    selectedPrice: recurringPrice(500),
    reviewedPromotionDiscountPercent: '50',
  });

  assert.equal(result.ready, false);
  assert.equal(result.code, 'CHECKOUT_ECONOMICS_BLOCKED');
  assert.equal(result.economicsStatus, 'watch');
  assert.match(result.reason, /contribution-margin target/i);
});

test('both checkout routes run the commercial gate before reservation or customer writes', () => {
  for (const route of [
    'app/api/stripe/checkout/route.ts',
    'app/api/stripe/subscribe/route.ts',
  ]) {
    const source = fs.readFileSync(path.join(repoRoot, route), 'utf8');
    const gateAt = source.indexOf('await verifyStripeCheckoutEconomics');
    const reservationAt = source.indexOf('await reserveStripeCheckout');
    const customerAt = source.indexOf('await prepareStripeCheckoutCustomer');
    const sessionAt = source.indexOf('await createStripeCheckoutSession');

    assert.ok(gateAt > 0, `${route} must invoke the commercial gate`);
    assert.ok(gateAt < reservationAt, `${route} must gate before reservation`);
    assert.ok(gateAt < customerAt, `${route} must gate before customer writes`);
    assert.ok(gateAt < sessionAt, `${route} must gate before Session creation`);
    assert.match(source, /timeout:\s*STRIPE_CHECKOUT_PRICE_READ_TIMEOUT_MS/);
    assert.match(source, /maxNetworkRetries:\s*STRIPE_CHECKOUT_PRICE_READ_MAX_NETWORK_RETRIES/);
  }
});

test('public readiness audits promotions once and evaluates each plan interval separately', async () => {
  const economics = await loadCheckoutEconomics();
  const stripe = promotionReader(50);
  const prices = publicPrices({
    studio: {
      month: publicPrice('month', 500, 'e'),
      year: publicPrice('year', 48_000, 'f'),
    },
  });
  const snapshot = await economics.getStripeCommercialReadinessSnapshot(stripe, prices, {
    reviewedPromotionDiscountPercent: '50',
    force: true,
    now: Date.parse('2026-07-11T23:00:00.000Z'),
  });

  assert.equal(stripe.reads, 1);
  assert.equal(snapshot.verified, true);
  assert.equal(snapshot.options.pro.month, true);
  assert.equal(snapshot.options.studio.month, false);
  assert.equal(snapshot.options.studio.year, true);
  assert.deepEqual(Object.keys(snapshot).sort(), ['checkedAt', 'code', 'options', 'verified']);
});

test('public readiness shares one in-flight provider audit and reuses its short-lived snapshot', async () => {
  const economics = await loadCheckoutEconomics();
  let reads = 0;
  const stripe = {
    promotionCodes: {
      async list() {
        reads += 1;
        await new Promise(resolve => setTimeout(resolve, 5));
        return { data: [], has_more: false };
      },
    },
  };
  const prices = publicPrices({
    pro: {
      month: publicPrice('month', 2_100, 'g'),
      year: publicPrice('year', 20_000, 'h'),
    },
  });
  const input = {
    reviewedPromotionDiscountPercent: '50',
    now: Date.parse('2026-07-11T23:10:00.000Z'),
  };
  const [first, second] = await Promise.all([
    economics.getStripeCommercialReadinessSnapshot(stripe, prices, input),
    economics.getStripeCommercialReadinessSnapshot(stripe, prices, input),
  ]);
  const cached = await economics.getStripeCommercialReadinessSnapshot(stripe, prices, {
    ...input,
    now: input.now + 1_000,
  });

  assert.equal(reads, 1);
  assert.deepEqual(second, first);
  assert.deepEqual(cached, first);
  assert.equal(first.verified, true);
});
