const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-checkout-session-write-'));
const outfile = path.join(outdir, 'stripe-checkout-session-write.cjs');
const reservationOutfile = path.join(outdir, 'stripe-checkout-reservation.cjs');
const writeModule = build({
  entryPoints: [path.join(repoRoot, 'lib/billing/stripe-checkout-session-write.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(outfile));
const reservationModule = build({
  entryPoints: [path.join(repoRoot, 'lib/billing/stripe-checkout-reservation.ts')],
  outfile: reservationOutfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(reservationOutfile));

function sessionWriter(create) {
  const calls = [];
  return {
    calls,
    stripe: {
      checkout: {
        sessions: {
          async create(params, options) {
            calls.push({ params, options });
            return create ? create(params, options) : { id: 'cs_test', url: 'https://checkout.stripe.test' };
          },
        },
      },
    },
  };
}

test('checkout Session creation is bounded, no-retry, and preserves its idempotency key', async () => {
  const {
    createStripeCheckoutSession,
    STRIPE_CHECKOUT_SESSION_WRITE_MAX_NETWORK_RETRIES,
    STRIPE_CHECKOUT_SESSION_WRITE_TIMEOUT_MS,
  } = await writeModule;
  const writer = sessionWriter();
  const result = await createStripeCheckoutSession(
    writer.stripe,
    { mode: 'subscription', line_items: [{ price: 'price_pro', quantity: 1 }] },
    { idempotencyKey: 'talent-checkout-user-reservation' },
  );
  assert.equal(result.id, 'cs_test');
  assert.equal(writer.calls.length, 1);
  assert.equal(writer.calls[0].options.idempotencyKey, 'talent-checkout-user-reservation');
  assert.equal(writer.calls[0].options.timeout, STRIPE_CHECKOUT_SESSION_WRITE_TIMEOUT_MS);
  assert.equal(
    writer.calls[0].options.maxNetworkRetries,
    STRIPE_CHECKOUT_SESSION_WRITE_MAX_NETWORK_RETRIES,
  );
});

test('a stalled Session write is ambiguous and retains the checkout reservation', async () => {
  const { createStripeCheckoutSession } = await writeModule;
  const { shouldRetainStripeCheckoutReservation } = await reservationModule;
  const writer = sessionWriter(() => new Promise(() => {}));
  await assert.rejects(
    createStripeCheckoutSession(
      writer.stripe,
      { mode: 'subscription' },
      { idempotencyKey: 'talent-checkout-user-reservation', deadlineMs: 5 },
    ),
    error => {
      assert.equal(error.checkoutSessionOutcome, 'ambiguous');
      assert.equal(shouldRetainStripeCheckoutReservation(error), true);
      return true;
    },
  );
});

test('definitive Stripe rejection releases while transport and unknown failures retain', async () => {
  const { createStripeCheckoutSession } = await writeModule;
  const { shouldRetainStripeCheckoutReservation } = await reservationModule;
  for (const [type, expectedOutcome, expectedRetention] of [
    ['StripeInvalidRequestError', 'rejected', false],
    ['StripeAuthenticationError', 'rejected', false],
    ['StripeConnectionError', 'ambiguous', true],
    ['StripeAPIError', 'ambiguous', true],
    ['', 'ambiguous', true],
  ]) {
    const writer = sessionWriter(() => Promise.reject(type ? { type } : new Error('unknown')));
    await assert.rejects(
      createStripeCheckoutSession(
        writer.stripe,
        { mode: 'subscription' },
        { idempotencyKey: `talent-checkout-${type || 'unknown'}` },
      ),
      error => {
        assert.equal(error.checkoutSessionOutcome, expectedOutcome);
        assert.equal(shouldRetainStripeCheckoutReservation(error), expectedRetention);
        return true;
      },
    );
  }
});

test('both checkout routes use the bounded writer and return typed Session recovery', () => {
  for (const relative of ['app/api/stripe/subscribe/route.ts', 'app/api/stripe/checkout/route.ts']) {
    const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
    const helperIndex = source.indexOf('await createStripeCheckoutSession');
    const pendingIndex = source.indexOf("'STRIPE_CHECKOUT_CONFIRMATION_PENDING'");
    const rejectedIndex = source.indexOf("'STRIPE_CHECKOUT_CREATION_UNAVAILABLE'");
    assert.ok(helperIndex > 0);
    assert.ok(pendingIndex > helperIndex);
    assert.ok(rejectedIndex > helperIndex);
    assert.match(source, /checkoutSessionState === 'created'/);
    const createdIndex = source.indexOf("checkoutSessionState = 'created'");
    const receiptIndex = source.indexOf('await recordStripePendingCheckout');
    const responseIndex = source.indexOf('return NextResponse.json', receiptIndex);
    assert.ok(createdIndex > helperIndex && receiptIndex > createdIndex);
    assert.ok(responseIndex > receiptIndex);
    assert.match(source.slice(receiptIndex, responseIndex), /if \(!pendingReceipt\.recorded\)/);
    assert.match(source, /shouldRetainStripeCheckoutReservation\(error\)/);
    assert.match(source, /talent-(checkout|subscribe)-\$\{uid\}-\$\{reservationId\}/);
    assert.doesNotMatch(source, /stripe\.checkout\.sessions\.create/);
  }
});

test('pending checkout receipts remain server-only and omit reusable checkout credentials', () => {
  const reservation = fs.readFileSync(
    path.join(repoRoot, 'lib/billing/stripe-checkout-reservation.ts'),
    'utf8',
  );
  const receiptStart = reservation.indexOf('export async function recordStripePendingCheckout');
  const receiptEnd = reservation.indexOf('export async function completeStripeCheckoutReservation');
  const receiptSource = reservation.slice(receiptStart, receiptEnd);
  assert.ok(receiptStart > 0 && receiptEnd > receiptStart);
  assert.match(receiptSource, /pendingCheckoutSessionId/);
  assert.match(receiptSource, /pendingCheckoutReservationId/);
  assert.doesNotMatch(receiptSource, /url|clientSecret|customerId|email/);

  const rules = fs.readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf8');
  const mutableCollections = rules.slice(
    rules.indexOf('function isUserMutableCollection'),
    rules.indexOf('function hasServerMorphProof'),
  );
  assert.doesNotMatch(mutableCollections, /['"]billing['"]/);
  assert.match(rules, /Deny everything else by default/);
});
