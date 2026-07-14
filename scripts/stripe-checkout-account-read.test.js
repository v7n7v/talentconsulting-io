const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-checkout-account-read-'));
const outfile = path.join(outdir, 'stripe-checkout-account-read.cjs');
const readModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-checkout-account-read.ts')],
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

test('customer discovery is parallel, bounded, and stops pagination after deadline', async () => {
  const { discoverStripeCheckoutCustomers } = await readModule;
  let resolveEmail;
  let resolveSearch;
  const calls = [];
  const stripe = {
    customers: {
      list(input, options) {
        calls.push({ method: 'list', input, options });
        return new Promise(resolve => { resolveEmail = resolve; });
      },
      search(input, options) {
        calls.push({ method: 'search', input, options });
        return new Promise(resolve => { resolveSearch = resolve; });
      },
    },
    subscriptions: { async list() { return { data: [] }; } },
  };

  const resultPromise = discoverStripeCheckoutCustomers(stripe, {
    email: 'person@example.com',
    uid: 'uid-one',
    deadlineMs: 5,
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.options.timeout === 5_000));
  assert.ok(calls.every(call => call.options.maxNetworkRetries === 0));
  await assert.rejects(resultPromise, /deadline exceeded/i);

  resolveEmail({ data: [] });
  resolveSearch({ data: [{ id: 'cus_one' }], next_page: 'another_page' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.filter(call => call.method === 'search').length, 1);
});

test('subscription history reads every associated customer in parallel with bounded options', async () => {
  const { readStripeCheckoutSubscriptionHistory } = await readModule;
  const calls = [];
  const stripe = {
    customers: {
      async list() { return { data: [] }; },
      async search() { return { data: [], next_page: null }; },
    },
    subscriptions: {
      async list(input, options) {
        calls.push({ input, options });
        return input.customer === 'cus_old'
          ? { data: [{ id: 'sub_old', status: 'canceled' }] }
          : { data: [] };
      },
    },
  };
  const result = await readStripeCheckoutSubscriptionHistory(stripe, {
    customerIds: ['cus_new', 'cus_old', 'cus_new'],
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.options.timeout === 5_000));
  assert.ok(calls.every(call => call.options.maxNetworkRetries === 0));
  assert.equal(result.hasHistory, true);
  assert.equal(result.blockingSubscription, null);
});

test('subscription history blocks abnormal customer fan-out before any Stripe read', async () => {
  const {
    readStripeCheckoutSubscriptionHistory,
    STRIPE_CHECKOUT_MAX_ASSOCIATED_CUSTOMERS,
    StripeCheckoutAccountReviewRequiredError,
  } = await readModule;
  let reads = 0;
  const stripe = {
    customers: {
      async list() { return { data: [] }; },
      async search() { return { data: [], next_page: null }; },
    },
    subscriptions: {
      async list() {
        reads += 1;
        return { data: [] };
      },
    },
  };
  const customerIds = Array.from(
    { length: STRIPE_CHECKOUT_MAX_ASSOCIATED_CUSTOMERS + 1 },
    (_, index) => `cus_${index}`,
  );
  await assert.rejects(
    readStripeCheckoutSubscriptionHistory(stripe, { customerIds }),
    error => error instanceof StripeCheckoutAccountReviewRequiredError
      && error.code === 'associated_customer_limit_exceeded',
  );
  assert.equal(reads, 0);
});

test('both checkout routes release reservation and return typed read recovery before Session creation', () => {
  for (const relative of ['app/api/stripe/subscribe/route.ts', 'app/api/stripe/checkout/route.ts']) {
    const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
    for (const code of [
      'STRIPE_CUSTOMER_DISCOVERY_UNAVAILABLE',
      'STRIPE_SUBSCRIPTION_HISTORY_UNAVAILABLE',
      'STRIPE_ACCOUNT_REVIEW_REQUIRED',
    ]) {
      const codeIndex = source.indexOf(`code: '${code}'`);
      const releaseIndex = source.lastIndexOf('releaseStripeCheckout', codeIndex);
      assert.ok(codeIndex > 0);
      assert.ok(releaseIndex > 0 && releaseIndex < codeIndex);
    }
    const historyCallIndex = source.indexOf(
      'subscriptionHistory = await readStripeCheckoutSubscriptionHistory',
    );
    const reviewCodeIndex = source.indexOf("code: 'STRIPE_ACCOUNT_REVIEW_REQUIRED'");
    assert.ok(historyCallIndex > 0 && reviewCodeIndex > historyCallIndex);
    assert.match(
      source.slice(historyCallIndex, reviewCodeIndex),
      /error instanceof StripeCheckoutAccountReviewRequiredError/,
    );
    const sessionWriteIndex = source.indexOf('await createStripeCheckoutSession');
    assert.ok(sessionWriteIndex > 0);
    assert.ok(source.indexOf('STRIPE_CUSTOMER_DISCOVERY_UNAVAILABLE') < sessionWriteIndex);
    assert.ok(source.indexOf('STRIPE_SUBSCRIPTION_HISTORY_UNAVAILABLE') < sessionWriteIndex);
    assert.ok(source.indexOf('STRIPE_ACCOUNT_REVIEW_REQUIRED') < sessionWriteIndex);
  }
});
