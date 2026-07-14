const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-checkout-customer-write-'));
const outfile = path.join(outdir, 'stripe-checkout-customer-write.cjs');
const writeModule = build({
  entryPoints: [path.join(repoRoot, 'lib/billing/stripe-checkout-customer-write.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(outfile));

function stripeWriter(overrides = {}) {
  const calls = [];
  return {
    calls,
    stripe: {
      customers: {
        async update(customerId, input, options) {
          calls.push({ method: 'update', customerId, input, options });
          return { id: customerId };
        },
        async create(input, options) {
          calls.push({ method: 'create', input, options });
          return { id: 'cus_created' };
        },
        ...overrides,
      },
    },
  };
}

test('an owned customer is reused without a Stripe write', async () => {
  const { prepareStripeCheckoutCustomer } = await writeModule;
  const writer = stripeWriter();
  const result = await prepareStripeCheckoutCustomer(writer.stripe, {
    uid: 'uid-one',
    email: 'person@example.com',
    selectedCustomer: { customerId: 'cus_owned', claimRequired: false },
  });
  assert.deepEqual(result, { customerId: 'cus_owned', operation: 'reused' });
  assert.equal(writer.calls.length, 0);
});

test('claim and create writes are bounded, no-retry, and account-idempotent', async () => {
  const {
    prepareStripeCheckoutCustomer,
    STRIPE_CHECKOUT_CUSTOMER_WRITE_TIMEOUT_MS,
    STRIPE_CHECKOUT_CUSTOMER_WRITE_MAX_NETWORK_RETRIES,
  } = await writeModule;
  const writer = stripeWriter();
  const claim = await prepareStripeCheckoutCustomer(writer.stripe, {
    uid: 'uid-one',
    email: 'person@example.com',
    selectedCustomer: { customerId: 'cus_unclaimed', claimRequired: true },
    selectedCustomerMetadata: { source: 'legacy' },
  });
  const create = await prepareStripeCheckoutCustomer(writer.stripe, {
    uid: 'uid-one',
    email: 'person@example.com',
    selectedCustomer: null,
  });
  await prepareStripeCheckoutCustomer(writer.stripe, {
    uid: 'uid-one',
    email: 'PERSON@example.com',
    selectedCustomer: null,
  });
  assert.deepEqual(claim, { customerId: 'cus_unclaimed', operation: 'claimed' });
  assert.deepEqual(create, { customerId: 'cus_created', operation: 'created' });
  assert.equal(writer.calls[0].input.metadata.source, 'legacy');
  assert.equal(writer.calls[0].input.metadata.firebaseUid, 'uid-one');
  assert.equal(writer.calls[1].input.metadata.firebaseUid, 'uid-one');
  assert.equal(writer.calls[2].input.email, 'person@example.com');
  assert.equal(writer.calls[1].options.idempotencyKey, writer.calls[2].options.idempotencyKey);
  for (const call of writer.calls) {
    assert.equal(call.options.timeout, STRIPE_CHECKOUT_CUSTOMER_WRITE_TIMEOUT_MS);
    assert.equal(call.options.maxNetworkRetries, STRIPE_CHECKOUT_CUSTOMER_WRITE_MAX_NETWORK_RETRIES);
    assert.match(call.options.idempotencyKey, /^talent-checkout-customer-(claim|create)-[a-f0-9]{40}$/);
    assert.doesNotMatch(call.options.idempotencyKey, /uid-one|reservation/);
  }
});

test('a stalled customer write stops at the phase deadline', async () => {
  const { prepareStripeCheckoutCustomer } = await writeModule;
  const writer = stripeWriter({
    create() { return new Promise(() => {}); },
  });
  await assert.rejects(prepareStripeCheckoutCustomer(writer.stripe, {
    uid: 'uid-one',
    email: 'person@example.com',
    selectedCustomer: null,
    deadlineMs: 5,
  }), /deadline exceeded/i);
});

test('both checkout routes release reservation and return typed preparation recovery before Session creation', () => {
  for (const relative of ['app/api/stripe/subscribe/route.ts', 'app/api/stripe/checkout/route.ts']) {
    const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
    const helperIndex = source.indexOf('await prepareStripeCheckoutCustomer');
    const codeIndex = source.indexOf("code: 'STRIPE_CUSTOMER_PREPARATION_UNAVAILABLE'");
    const releaseIndex = source.lastIndexOf('releaseStripeCheckout', codeIndex);
    const sessionIndex = source.indexOf('await createStripeCheckoutSession');
    assert.ok(helperIndex > 0 && codeIndex > helperIndex);
    assert.ok(releaseIndex > helperIndex && releaseIndex < codeIndex);
    assert.ok(codeIndex < sessionIndex);
    assert.doesNotMatch(source, /stripe\.customers\.(create|update)/);
  }
});
