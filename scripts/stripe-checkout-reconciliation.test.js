const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-checkout-reconciliation-'));
const outfile = path.join(outdir, 'stripe-checkout-reconciliation.cjs');
const reconciliationModule = build({
  entryPoints: [path.join(repoRoot, 'lib/billing/stripe-checkout-reconciliation.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(outfile));

function stripeSession(overrides = {}) {
  const calls = [];
  return {
    calls,
    stripe: {
      checkout: {
        sessions: {
          async retrieve(id, options) {
            calls.push({ method: 'retrieve', id, options });
            return {
              id,
              status: 'open',
              ui_mode: 'embedded',
              metadata: {
                firebaseUid: 'uid_one',
                checkoutReservationId: 'reservation_one',
                plan: 'studio',
                interval: 'year',
              },
            };
          },
          async list(params, options) {
            calls.push({ method: 'list', params, options });
            return { data: [] };
          },
          ...overrides,
        },
      },
    },
  };
}

const baseInput = {
  uid: 'uid_one',
  email: 'PERSON@Example.com',
  reservationId: 'reservation_one',
  reservationStartedAtMs: Date.parse('2026-07-11T12:00:00.000Z'),
};

test('stored receipt retrieval is bounded and requires exact ownership metadata', async () => {
  const {
    reconcileStripeCheckoutSession,
    STRIPE_CHECKOUT_RECONCILIATION_MAX_NETWORK_RETRIES,
    STRIPE_CHECKOUT_RECONCILIATION_TIMEOUT_MS,
  } = await reconciliationModule;
  const reader = stripeSession();
  const result = await reconcileStripeCheckoutSession(reader.stripe, {
    ...baseInput,
    receipt: {
      checkoutSessionId: 'cs_one',
      mode: 'embedded',
      plan: 'studio',
      interval: 'year',
    },
  });
  assert.deepEqual(result, { status: 'open' });
  assert.equal(reader.calls.length, 1);
  assert.equal(reader.calls[0].method, 'retrieve');
  assert.equal(reader.calls[0].options.timeout, STRIPE_CHECKOUT_RECONCILIATION_TIMEOUT_MS);
  assert.equal(
    reader.calls[0].options.maxNetworkRetries,
    STRIPE_CHECKOUT_RECONCILIATION_MAX_NETWORK_RETRIES,
  );

  const mismatch = stripeSession({
    async retrieve() {
      return {
        id: 'cs_one',
        status: 'open',
        ui_mode: 'embedded',
        metadata: { firebaseUid: 'other_uid', checkoutReservationId: 'reservation_one' },
      };
    },
  });
  assert.deepEqual(await reconcileStripeCheckoutSession(mismatch.stripe, {
    ...baseInput,
    receipt: {
      checkoutSessionId: 'cs_one',
      mode: 'embedded',
      plan: 'studio',
      interval: 'year',
    },
  }), { status: 'ambiguous' });
});

test('missing receipt discovery filters one bounded email list by UID and reservation', async () => {
  const { reconcileStripeCheckoutSession } = await reconciliationModule;
  const reader = stripeSession({
    async list(params, options) {
      reader.calls.push({ method: 'list', params, options });
      return {
        data: [
          { id: 'cs_other', status: 'open', metadata: { firebaseUid: 'other_uid', checkoutReservationId: 'reservation_one' } },
          { id: 'cs_match', status: 'complete', metadata: { firebaseUid: 'uid_one', checkoutReservationId: 'reservation_one' } },
        ],
      };
    },
  });
  assert.deepEqual(await reconcileStripeCheckoutSession(reader.stripe, baseInput), { status: 'complete' });
  assert.equal(reader.calls.length, 1);
  assert.equal(reader.calls[0].params.customer_details.email, 'person@example.com');
  assert.equal(reader.calls[0].params.limit, 100);
  assert.equal(
    reader.calls[0].params.created.gte,
    Math.floor(baseInput.reservationStartedAtMs / 1_000) - 60,
  );
});

test('multiple exact Sessions and provider uncertainty fail closed', async () => {
  const { reconcileStripeCheckoutSession } = await reconciliationModule;
  const duplicate = stripeSession({
    async list() {
      const metadata = { firebaseUid: 'uid_one', checkoutReservationId: 'reservation_one' };
      return { data: [
        { id: 'cs_one', status: 'open', metadata },
        { id: 'cs_two', status: 'expired', metadata },
      ] };
    },
  });
  assert.deepEqual(await reconcileStripeCheckoutSession(duplicate.stripe, baseInput), { status: 'ambiguous' });

  const truncated = stripeSession({
    async list() { return { data: [], has_more: true }; },
  });
  assert.deepEqual(await reconcileStripeCheckoutSession(truncated.stripe, baseInput), { status: 'ambiguous' });

  const stalled = stripeSession({ list() { return new Promise(() => {}); } });
  await assert.rejects(
    reconcileStripeCheckoutSession(stalled.stripe, { ...baseInput, deadlineMs: 5 }),
    /deadline exceeded/i,
  );
});

test('a missing stored Session is distinct from provider failure', async () => {
  const { reconcileStripeCheckoutSession } = await reconciliationModule;
  const missing = stripeSession({
    async retrieve() {
      throw { type: 'StripeInvalidRequestError', code: 'resource_missing' };
    },
  });
  assert.deepEqual(await reconcileStripeCheckoutSession(missing.stripe, {
    ...baseInput,
    receipt: {
      checkoutSessionId: 'cs_missing',
      mode: 'hosted',
      plan: 'pro',
      interval: 'month',
    },
  }), { status: 'not_found' });

  const unavailable = stripeSession({
    async retrieve() { throw { type: 'StripeConnectionError' }; },
  });
  await assert.rejects(reconcileStripeCheckoutSession(unavailable.stripe, {
    ...baseInput,
    receipt: {
      checkoutSessionId: 'cs_unknown',
      mode: 'hosted',
      plan: 'pro',
      interval: 'month',
    },
  }));
});

test('status route is private, read-only at Stripe, and releases only proven expiry', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'app/api/stripe/checkout/status/route.ts'),
    'utf8',
  );
  assert.match(source, /export async function GET/);
  assert.doesNotMatch(source, /export async function POST/);
  assert.match(source, /guardApiRoute/);
  assert.match(source, /private, no-store/);
  assert.match(source, /reconcileStripeCheckoutSession/);
  assert.match(source, /result\.status === 'expired' \|\| \(result\.status === 'not_found' && reservationExpired\)/);
  assert.doesNotMatch(source, /checkout\.sessions\.(create|update|expire)/);
  const responseHelper = source.slice(
    source.indexOf('function statusResponse'),
    source.indexOf('function pendingReceipt'),
  );
  assert.doesNotMatch(responseHelper, /clientSecret|customerId|checkoutSessionId/);
  assert.equal((source.match(/NextResponse\.json/g) || []).length, 1);
  assert.match(source, /statusResponse\('idle'\)/);
  assert.match(source, /statusResponse\('pending'/);
  assert.match(source, /statusResponse\(result\.status\)/);
});
