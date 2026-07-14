const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-checkout-resume-'));
const outfile = path.join(outdir, 'stripe-checkout-resume.cjs');
const resumeModule = build({
  entryPoints: [path.join(repoRoot, 'lib/billing/stripe-checkout-resume.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(outfile));

const nowMs = Date.parse('2026-07-11T12:00:00.000Z');

function session(overrides = {}) {
  return {
    id: 'cs_test_one',
    status: 'open',
    expires_at: Math.floor((nowMs + 10 * 60 * 1_000) / 1_000),
    ui_mode: 'embedded',
    client_secret: 'cs_test_one_secret_example',
    url: null,
    metadata: { plan: 'studio', interval: 'year' },
    ...overrides,
  };
}

test('embedded Session resume returns only a current client secret', async () => {
  const { buildStripeCheckoutResumePayload } = await resumeModule;
  assert.deepEqual(buildStripeCheckoutResumePayload(session(), nowMs), {
    status: 'open',
    mode: 'embedded',
    clientSecret: 'cs_test_one_secret_example',
  });
  assert.equal(buildStripeCheckoutResumePayload(session({ client_secret: 'not-a-session-secret' }), nowMs), null);
  assert.equal(buildStripeCheckoutResumePayload(session({ client_secret: 'cs_test_one' }), nowMs), null);
});

test('hosted Session resume pins redirects to the Stripe Checkout host', async () => {
  const { buildStripeCheckoutResumePayload } = await resumeModule;
  assert.deepEqual(buildStripeCheckoutResumePayload(session({
    ui_mode: 'hosted',
    client_secret: null,
    url: 'https://checkout.stripe.com/c/pay/cs_test_one',
  }), nowMs), {
    status: 'open',
    mode: 'hosted',
    url: 'https://checkout.stripe.com/c/pay/cs_test_one',
  });
  for (const url of [
    'http://checkout.stripe.com/c/pay/cs_test_one',
    'https://checkout.stripe.com.evil.test/cs_test_one',
    'https://example.com/checkout',
    'not-a-url',
  ]) {
    assert.equal(buildStripeCheckoutResumePayload(session({ ui_mode: 'hosted', url }), nowMs), null);
  }
});

test('closed, near-expiry, or malformed Sessions cannot be resumed', async () => {
  const { buildStripeCheckoutResumePayload, STRIPE_CHECKOUT_RESUME_MIN_LIFETIME_MS } = await resumeModule;
  assert.equal(buildStripeCheckoutResumePayload(session({ status: 'complete' }), nowMs), null);
  assert.equal(buildStripeCheckoutResumePayload(session({ status: 'expired' }), nowMs), null);
  assert.equal(buildStripeCheckoutResumePayload(session({
    expires_at: Math.floor((nowMs + STRIPE_CHECKOUT_RESUME_MIN_LIFETIME_MS - 1) / 1_000),
  }), nowMs), null);
  assert.equal(buildStripeCheckoutResumePayload(session({ metadata: { plan: 'unknown', interval: 'year' } }), nowMs), null);
  assert.equal(buildStripeCheckoutResumePayload(session({ metadata: { plan: 'pro', interval: 'week' } }), nowMs), null);
});

test('resume route revalidates ownership and emits no account history', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'app/api/stripe/checkout/resume/route.ts'),
    'utf8',
  );
  assert.match(source, /export async function POST/);
  assert.doesNotMatch(source, /export async function GET/);
  assert.match(source, /guardApiRoute\(req, \{ rateLimit: 10/);
  assert.match(source, /private, no-store/);
  assert.match(source, /normalizeStripePendingCheckoutReceipt/);
  assert.match(source, /findStripeCheckoutSession/);
  assert.ok((source.match(/await findStripeCheckoutSession/g) || []).length <= 2);
  assert.match(source, /buildStripeCheckoutResumePayload\(result\.session\)/);
  assert.match(source, /await recordStripePendingCheckout/);
  assert.match(source, /result\.status === 'expired'/);
  assert.match(source, /result\.status === 'not_found' && reservationExpiresAtMs <= Date\.now\(\)/);
  assert.match(source, /await releaseStripeCheckout/);
  assert.doesNotMatch(source, /stripe\.(customers|subscriptions)\./);
  assert.doesNotMatch(source, /checkout\.sessions\.(create|update|expire)/);
  assert.doesNotMatch(source, /customerHistory|customerId|stripeCustomerId|providerError/);
});

test('reconciliation keeps cross-account and cross-reservation Sessions ambiguous', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'lib/billing/stripe-checkout-reconciliation.ts'),
    'utf8',
  );
  assert.match(source, /session\.metadata\?\.firebaseUid !== input\.uid/);
  assert.match(source, /session\.metadata\?\.checkoutReservationId !== input\.reservationId/);
  assert.match(source, /session\.id === input\.receipt\.checkoutSessionId/);
});
