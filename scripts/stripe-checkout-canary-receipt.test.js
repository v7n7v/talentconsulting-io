const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-receipt-test-'));
const outfile = path.join(outdir, 'receipt.cjs');

const receiptModule = build({
  stdin: {
    contents: [
      "export * from './lib/billing/stripe-checkout-canary-receipt';",
      "export * from './lib/sona/purchase-contract';",
    ].join('\n'),
    resolveDir: repoRoot,
    sourcefile: 'stripe-checkout-canary-receipt-entry.ts',
    loader: 'ts',
  },
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

const configuredPrices = {
  pro: ['price_pro_month', 'price_pro_year'],
  studio: ['price_studio_month', 'price_studio_year'],
};

async function fixture(plan = 'pro', interval = 'month') {
  const { buildSonaPurchaseContract, buildSonaPurchaseContractMetadata } = await receiptModule;
  const uid = 'canary-user-123';
  const customerId = 'cus_staging_canary';
  const subscriptionId = 'sub_staging_canary';
  const sessionId = 'cs_test_staging_canary';
  const priceId = `price_${plan}_${interval}`;
  const contract = buildSonaPurchaseContract(plan, interval);
  const metadata = {
    firebaseUid: uid,
    plan,
    interval,
    checkoutSource: 'direct',
    ...buildSonaPurchaseContractMetadata(plan, interval),
  };
  const status = 'trialing';
  const unitAmount = plan === 'studio' ? 5900 : 2900;
  const observedAtMs = Date.parse('2026-07-11T10:00:00.000Z');
  const session = {
    id: sessionId,
    livemode: false,
    mode: 'subscription',
    status: 'complete',
    payment_status: 'no_payment_required',
    created: Math.floor((observedAtMs - 60_000) / 1_000),
    client_reference_id: uid,
    customer: customerId,
    subscription: subscriptionId,
    metadata,
  };
  const customer = { id: customerId, deleted: false, livemode: false, metadata: { firebaseUid: uid } };
  const subscription = {
    id: subscriptionId,
    livemode: false,
    customer: customerId,
    status,
    metadata,
    items: {
      data: [{
        quantity: 1,
        price: {
          id: priceId,
          active: true,
          type: 'recurring',
          recurring: { interval },
          currency: 'usd',
          unit_amount: unitAmount,
        },
      }],
    },
  };
  const userSubscription = {
    plan,
    status,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripePriceId: priceId,
    billingInterval: interval,
    amount: unitAmount,
    currency: 'usd',
    recurringAmountCents: unitAmount,
    recurringCurrency: 'usd',
    stripeStateEntitled: true,
    stripeStateEventId: 'evt_checkout_canary',
    stripeStateEventType: 'checkout.session.completed',
    stripeStateSubscriptionId: subscriptionId,
    sonaPurchaseContractStatus: 'verified',
    sonaPurchaseContractFingerprint: contract.fingerprint,
    sonaPurchaseContract: contract,
  };
  const billingAccount = {
    accountId: customerId,
    uid,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripePriceId: priceId,
    plan,
    status,
    billingInterval: interval,
    recurringAmountCents: unitAmount,
    recurringCurrency: 'usd',
  };
  const checkoutLedger = {
    uid,
    accountId: customerId,
    stripeCustomerId: customerId,
    stripeObjectId: sessionId,
    type: 'checkout',
    source: 'stripe_webhook',
    stripeEventId: 'evt_checkout_canary',
    status,
    amount: unitAmount,
    currency: 'usd',
    occurredAt: '2026-07-11T09:59:05.000Z',
    postedAt: '2026-07-11T09:59:10.000Z',
    metadata: {
      plan,
      interval,
      sonaPurchaseContractStatus: 'verified',
      sonaPurchaseContractFingerprint: contract.fingerprint,
      stripePlanEvidenceStatus: 'price_verified',
    },
  };
  return {
    expected: { uid, plan, interval },
    configuredPrices,
    session,
    customer,
    subscription,
    userSubscription,
    billingAccount,
    checkoutLedger,
    observedAtMs,
  };
}

test('receipt verifies independent Pro and Max checkout evidence', async () => {
  const { assessStripeCheckoutCanaryReceipt } = await receiptModule;
  for (const [plan, interval] of [['pro', 'month'], ['studio', 'year']]) {
    const result = assessStripeCheckoutCanaryReceipt(await fixture(plan, interval));
    assert.equal(result.ready, true);
    assert.equal(result.status, 'verified');
    assert.deepEqual(result.errors, []);
    assert.equal(result.evidence.purchaseContractAligned, true);
    assert.equal(result.evidence.reviewRequired, true);
    assert.equal(result.evidence.externalAutoApply, false);
  }
});

test('receipt blocks cross-account and cross-subscription evidence', async () => {
  const { assessStripeCheckoutCanaryReceipt } = await receiptModule;
  const input = await fixture();
  input.customer.metadata.firebaseUid = 'different-user';
  input.session.subscription = 'sub_different';
  const result = assessStripeCheckoutCanaryReceipt(input);
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('stripe:owner_mismatch'));
  assert.ok(result.errors.includes('stripe:subscription_mismatch'));
});

test('configured Stripe price remains authoritative over matching stored labels', async () => {
  const { assessStripeCheckoutCanaryReceipt } = await receiptModule;
  const input = await fixture('studio', 'month');
  input.subscription.items.data[0].price.id = 'price_unknown';
  input.userSubscription.stripePriceId = 'price_unknown';
  input.billingAccount.stripePriceId = 'price_unknown';
  const result = assessStripeCheckoutCanaryReceipt(input);
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('stripe:price_evidence_unknown_price'));
  assert.ok(result.errors.includes('contract:not_verified'));
});

test('receipt identifies each missing Firestore agreement independently', async () => {
  const { assessStripeCheckoutCanaryReceipt } = await receiptModule;
  const input = await fixture();
  input.userSubscription.sonaPurchaseContract.externalAutoApply = true;
  input.userSubscription.sonaPurchaseContract.rankedRolesPerRunMax += 1;
  input.billingAccount.recurringAmountCents = 1;
  input.checkoutLedger.metadata.sonaPurchaseContractFingerprint = 'tampered';
  const result = assessStripeCheckoutCanaryReceipt(input);
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('firestore:user_entitlement_mismatch'));
  assert.ok(result.errors.includes('firestore:billing_account_mismatch'));
  assert.ok(result.errors.includes('firestore:checkout_ledger_mismatch'));
});

test('receipt blocks stale metadata even when the configured price identifies the expected plan', async () => {
  const { assessStripeCheckoutCanaryReceipt } = await receiptModule;
  const input = await fixture('studio', 'month');
  input.session.metadata.plan = 'pro';
  const result = assessStripeCheckoutCanaryReceipt(input);
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('stripe:subscription_evidence_mismatch'));
});

test('receipt requires a completed test checkout and an entitled subscription', async () => {
  const { assessStripeCheckoutCanaryReceipt } = await receiptModule;
  const input = await fixture();
  input.session.livemode = true;
  input.session.status = 'open';
  input.subscription.status = 'canceled';
  const result = assessStripeCheckoutCanaryReceipt(input);
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('checkout:not_complete_test_subscription'));
  assert.ok(result.errors.includes('stripe:subscription_evidence_mismatch'));
});

test('receipt rejects replayed checkout evidence outside the bounded audit window', async () => {
  const { assessStripeCheckoutCanaryReceipt } = await receiptModule;
  const input = await fixture();
  input.session.created -= 60 * 60;
  input.checkoutLedger.occurredAt = '2026-07-11T08:59:05.000Z';
  input.checkoutLedger.postedAt = '2026-07-11T08:59:10.000Z';
  const result = assessStripeCheckoutCanaryReceipt(input);
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('checkout:evidence_stale_or_invalid'));
});

test('receipt rejects quantity, status and amount drift across evidence stores', async () => {
  const { assessStripeCheckoutCanaryReceipt } = await receiptModule;
  const input = await fixture();
  input.subscription.items.data[0].quantity = 2;
  input.userSubscription.status = 'active';
  input.userSubscription.amount = 1;
  input.billingAccount.status = 'active';
  input.checkoutLedger.status = 'active';
  input.checkoutLedger.amount = 1;
  const result = assessStripeCheckoutCanaryReceipt(input);
  assert.equal(result.ready, false);
  assert.ok(result.errors.includes('stripe:subscription_evidence_mismatch'));
  assert.ok(result.errors.includes('firestore:user_entitlement_mismatch'));
  assert.ok(result.errors.includes('firestore:billing_account_mismatch'));
  assert.ok(result.errors.includes('firestore:checkout_ledger_mismatch'));
});

test('receipt contract is pure and contains no provider or database write calls', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'lib/billing/stripe-checkout-canary-receipt.ts'), 'utf8');
  assert.doesNotMatch(source, /\.create\s*\(|\.set\s*\(|\.update\s*\(|\.delete\s*\(/);
  assert.doesNotMatch(source, /getAdminDb|getFirestore|new Stripe/);
});
