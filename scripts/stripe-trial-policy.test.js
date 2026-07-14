const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-trial-policy-'));
const outfile = path.join(outdir, 'stripe-trial-policy.cjs');
const policyModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-trial-policy.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(outfile));

const reservationOutfile = path.join(outdir, 'stripe-checkout-reservation.cjs');
const reservationModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-checkout-reservation.ts')],
  outfile: reservationOutfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(reservationOutfile));

const accountSelectionOutfile = path.join(outdir, 'stripe-account-selection.cjs');
const accountSelectionModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'stripe-account-selection.ts')],
  outfile: accountSelectionOutfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(accountSelectionOutfile));

test('only a customer without Stripe subscription history receives the trial', async () => {
  const { decideStripeTrialOffer, STRIPE_TRIAL_DAYS } = await policyModule;
  const firstOffer = decideStripeTrialOffer(false);
  assert.equal(firstOffer.eligible, true);
  assert.equal(firstOffer.days, STRIPE_TRIAL_DAYS);
  const returningOffer = decideStripeTrialOffer(true);
  assert.equal(returningOffer.eligible, false);
  assert.equal(returningOffer.days, 0);
  assert.equal(returningOffer.reason, 'subscription_history');
});

test('trial history is aggregated across every Stripe customer associated with the user', async () => {
  const { resolveStripeCustomerSubscriptionHistory } = await policyModule;
  const reads = [];
  const result = await resolveStripeCustomerSubscriptionHistory({
    subscriptions: {
      async list(input) {
        reads.push(input);
        return input.customer === 'cus_old'
          ? { data: [{ id: 'sub_canceled', status: 'canceled' }] }
          : { data: [] };
      },
    },
  }, ['cus_new', 'cus_old', 'cus_new']);
  assert.equal(result.customerCount, 2);
  assert.equal(result.hasHistory, true);
  assert.equal(result.blockingSubscription, null);
  assert.deepEqual(reads.map(read => read.customer).sort(), ['cus_new', 'cus_old']);
  assert.ok(reads.every(read => read.status === 'all' && read.limit === 100));
});

test('UID customer discovery is metadata-bound, paginated, and safely escaped', async () => {
  const { searchStripeCustomersByFirebaseUid } = await accountSelectionModule;
  const reads = [];
  const customers = await searchStripeCustomersByFirebaseUid({
    customers: {
      async search(input) {
        reads.push(input);
        return input.page
          ? { data: [{ id: 'cus_old_email' }], next_page: null }
          : { data: [{ id: 'cus_current' }], next_page: 'next_page_token' };
      },
    },
  }, "uid'with\\characters");
  assert.deepEqual(customers.map(customer => customer.id), ['cus_current', 'cus_old_email']);
  assert.equal(reads.length, 2);
  assert.match(reads[0].query, /metadata\['firebaseUid'\]/);
  assert.match(reads[0].query, /uid\\'with\\\\characters/);
  assert.equal(reads[1].page, 'next_page_token');
});

test('active and unresolved Stripe subscriptions block a second checkout', async () => {
  const { resolveStripeCustomerSubscriptionHistory } = await policyModule;
  for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']) {
    const result = await resolveStripeCustomerSubscriptionHistory({
      subscriptions: { async list() { return { data: [{ id: `sub_${status}`, status }] }; } },
    }, ['cus_user']);
    assert.deepEqual(result.blockingSubscription, { id: `sub_${status}`, status });
  }
});

function fakeCheckoutGuardDb(initial = {}) {
  let state = { ...initial };
  const ref = {};
  return {
    collection() {
      return { doc() { return { collection() { return { doc() { return ref; } }; } }; } };
    },
    async runTransaction(callback) {
      return callback({
        async get() { return { data: () => ({ ...state }) }; },
        set(_ref, data) { state = { ...state, ...data }; },
      });
    },
    state: () => ({ ...state }),
  };
}

test('one UID can hold only one live checkout reservation and completion consumes its trial', async () => {
  const { reserveStripeCheckout, completeStripeCheckoutReservation } = await reservationModule;
  const now = Date.parse('2026-07-11T12:00:00.000Z');
  const db = fakeCheckoutGuardDb();
  assert.equal((await reserveStripeCheckout(db, 'uid_one', 'reservation_one', now)).acquire, true);
  assert.equal((await reserveStripeCheckout(db, 'uid_one', 'reservation_two', now + 1)).reason, 'checkout_in_progress');
  const completed = await completeStripeCheckoutReservation(db, {
    uid: 'uid_one',
    reservationId: 'reservation_one',
    checkoutSessionId: 'cs_test_one',
    stripeEventId: 'evt_one',
    consumeTrial: true,
    nowMs: now + 2,
  });
  assert.equal(completed.reservationMatches, true);
  assert.equal(db.state().activeReservationId, null);
  assert.equal(typeof db.state().trialConsumedAt, 'string');
  const next = await reserveStripeCheckout(db, 'uid_one', 'reservation_three', now + 3);
  assert.equal(next.acquire, true);
  assert.equal(next.trialPreviouslyConsumed, true);
});

test('pending checkout receipt is reservation-bound, minimal, and cleared by lifecycle changes', async () => {
  const {
    completeStripeCheckoutReservation,
    recordStripePendingCheckout,
    releaseStripeCheckout,
    reserveStripeCheckout,
  } = await reservationModule;
  const now = Date.parse('2026-07-11T12:00:00.000Z');
  const db = fakeCheckoutGuardDb();
  await reserveStripeCheckout(db, 'uid_one', 'reservation_one', now);
  const recorded = await recordStripePendingCheckout(db, {
    uid: 'uid_one',
    reservationId: 'reservation_one',
    checkoutSessionId: 'cs_test_one',
    mode: 'embedded',
    plan: 'studio',
    interval: 'year',
    expiresAtMs: now + 31 * 60 * 1_000,
    nowMs: now + 1,
  });
  assert.equal(recorded.recorded, true);
  assert.equal(db.state().pendingCheckoutSessionId, 'cs_test_one');
  assert.equal(db.state().pendingCheckoutMode, 'embedded');
  assert.equal(db.state().pendingCheckoutPlan, 'studio');
  assert.equal(db.state().pendingCheckoutInterval, 'year');
  assert.equal('url' in db.state(), false);
  assert.equal('clientSecret' in db.state(), false);
  assert.equal('customerId' in db.state(), false);
  assert.equal('email' in db.state(), false);

  const conflict = await recordStripePendingCheckout(db, {
    uid: 'uid_one',
    reservationId: 'reservation_one',
    checkoutSessionId: 'cs_test_other',
    mode: 'embedded',
    plan: 'studio',
    interval: 'year',
    expiresAtMs: now + 31 * 60 * 1_000,
    nowMs: now + 2,
  });
  assert.deepEqual(conflict, { recorded: false, reason: 'session_conflict' });
  assert.equal(db.state().pendingCheckoutSessionId, 'cs_test_one');

  await completeStripeCheckoutReservation(db, {
    uid: 'uid_one',
    reservationId: 'reservation_one',
    checkoutSessionId: 'cs_test_one',
    stripeEventId: 'evt_one',
    consumeTrial: false,
    nowMs: now + 3,
  });
  assert.equal(db.state().pendingCheckoutSessionId, null);
  assert.equal(db.state().pendingCheckoutMode, null);

  await reserveStripeCheckout(db, 'uid_one', 'reservation_two', now + 4);
  await recordStripePendingCheckout(db, {
    uid: 'uid_one',
    reservationId: 'reservation_two',
    checkoutSessionId: 'cs_test_two',
    mode: 'hosted',
    plan: 'pro',
    interval: 'month',
    expiresAtMs: now + 32 * 60 * 1_000,
    nowMs: now + 5,
  });
  await releaseStripeCheckout(db, 'uid_one', 'reservation_two', now + 6);
  assert.equal(db.state().pendingCheckoutSessionId, null);
  assert.equal(db.state().pendingCheckoutReservationId, null);
});

test('reservations are retained only for ambiguous Stripe creation failures', async () => {
  const { shouldRetainStripeCheckoutReservation } = await reservationModule;
  assert.equal(shouldRetainStripeCheckoutReservation({ type: 'StripeConnectionError' }), true);
  assert.equal(shouldRetainStripeCheckoutReservation({ type: 'StripeAPIError' }), true);
  assert.equal(shouldRetainStripeCheckoutReservation({ type: 'StripeInvalidRequestError' }), false);
  assert.equal(shouldRetainStripeCheckoutReservation({ type: 'StripeAuthenticationError' }), false);
  assert.equal(shouldRetainStripeCheckoutReservation(new Error('local failure')), false);
});

test('subscription parameters include seven days only for an eligible first subscription', async () => {
  const {
    buildStripeSubscriptionData,
    buildStripeTrialMetadata,
    decideStripeTrialOffer,
    STRIPE_TRIAL_DAYS,
  } = await policyModule;
  const eligible = decideStripeTrialOffer(false);
  const returning = decideStripeTrialOffer(true);
  const eligibleMetadata = buildStripeTrialMetadata(eligible);
  const returningMetadata = buildStripeTrialMetadata(returning);

  assert.deepEqual(buildStripeSubscriptionData(eligibleMetadata, eligible), {
    trial_period_days: STRIPE_TRIAL_DAYS,
    metadata: eligibleMetadata,
  });
  assert.deepEqual(buildStripeSubscriptionData(returningMetadata, returning), {
    metadata: returningMetadata,
  });
});

test('trial metadata rejects changed duration, reason, and partial markings', async () => {
  const { buildStripeTrialMetadata, decideStripeTrialOffer, parseStripeTrialMetadata } = await policyModule;
  const metadata = buildStripeTrialMetadata(decideStripeTrialOffer(false));
  assert.equal(parseStripeTrialMetadata(metadata).eligible, true);
  assert.equal(parseStripeTrialMetadata({ ...metadata, trialDays: '30' }), null);
  assert.equal(parseStripeTrialMetadata({ ...metadata, trialReason: 'subscription_history' }), null);
  assert.equal(parseStripeTrialMetadata({ ...metadata, trialEligible: 'yes' }), null);
});

test('webhook evidence requires session, subscription, and actual Stripe trial to agree', async () => {
  const {
    buildStripeTrialMetadata,
    decideStripeTrialOffer,
    resolveStripeTrialEvidence,
    STRIPE_TRIAL_DAYS,
  } = await policyModule;
  const start = 1_800_000_000;
  const eligibleMetadata = buildStripeTrialMetadata(decideStripeTrialOffer(false));
  const returningMetadata = buildStripeTrialMetadata(decideStripeTrialOffer(true));
  const verified = resolveStripeTrialEvidence({
    sessionMetadata: eligibleMetadata,
    subscriptionMetadata: eligibleMetadata,
    subscriptionStatus: 'trialing',
    trialStart: start,
    trialEnd: start + STRIPE_TRIAL_DAYS * 86_400,
    checkoutCreated: start,
  });
  assert.equal(verified.status, 'verified');
  assert.equal(verified.trialStarted, true);

  assert.equal(resolveStripeTrialEvidence({
    sessionMetadata: returningMetadata,
    subscriptionMetadata: returningMetadata,
    subscriptionStatus: 'active',
    trialStart: null,
    trialEnd: null,
    checkoutCreated: start,
  }).status, 'verified');
  assert.equal(resolveStripeTrialEvidence({
    sessionMetadata: eligibleMetadata,
    subscriptionMetadata: eligibleMetadata,
    subscriptionStatus: 'active',
    trialStart: null,
    trialEnd: null,
    checkoutCreated: start,
  }).status, 'stripe_mismatch');
  assert.equal(resolveStripeTrialEvidence({
    sessionMetadata: eligibleMetadata,
    subscriptionMetadata: returningMetadata,
    subscriptionStatus: 'trialing',
    trialStart: start,
    trialEnd: start + STRIPE_TRIAL_DAYS * 86_400,
    checkoutCreated: start,
  }).status, 'conflict');
  assert.equal(resolveStripeTrialEvidence({
    sessionMetadata: eligibleMetadata,
    subscriptionMetadata: eligibleMetadata,
    subscriptionStatus: 'trialing',
    trialStart: start,
    trialEnd: start + 30 * 86_400,
    checkoutCreated: start,
  }).status, 'stripe_mismatch');
});

test('missing trial metadata is legacy only before the enforcement cutoff', async () => {
  const { resolveStripeTrialEvidence, STRIPE_TRIAL_POLICY_ENFORCEMENT_EPOCH } = await policyModule;
  const input = {
    sessionMetadata: {},
    subscriptionMetadata: {},
    subscriptionStatus: 'trialing',
    trialStart: 1_700_000_000,
    trialEnd: 1_700_604_800,
  };
  assert.equal(resolveStripeTrialEvidence({
    ...input,
    checkoutCreated: STRIPE_TRIAL_POLICY_ENFORCEMENT_EPOCH - 1,
  }).status, 'legacy_missing');
  assert.equal(resolveStripeTrialEvidence({
    ...input,
    checkoutCreated: STRIPE_TRIAL_POLICY_ENFORCEMENT_EPOCH,
  }).status, 'invalid');
});

test('trial quarantine remains effective through later trialing lifecycle events', async () => {
  const {
    buildStripeTrialMetadata,
    decideStripeTrialOffer,
    preserveStripeTrialQuarantine,
    resolveStripeSubscriptionTrialState,
  } = await policyModule;
  assert.deepEqual(preserveStripeTrialQuarantine(
    { trialPolicyQuarantined: true },
    { plan: 'studio', status: 'trialing', amount: 4900 },
  ), { plan: 'free', status: 'trialing', amount: 4900, trialPolicyQuarantined: true });
  assert.deepEqual(preserveStripeTrialQuarantine(
    { trialPolicyQuarantined: true },
    { plan: 'studio', status: 'active' },
  ), { plan: 'studio', status: 'active' });
  assert.deepEqual(preserveStripeTrialQuarantine(
    {},
    { plan: 'studio', status: 'trialing', trialPolicyPendingCheckout: true },
  ), { plan: 'free', status: 'trialing', trialPolicyPendingCheckout: true });
  assert.deepEqual(preserveStripeTrialQuarantine(
    { stripeCheckoutEvidenceVerified: true },
    { plan: 'studio', status: 'trialing', trialPolicyPendingCheckout: true },
  ), {
    plan: 'studio',
    status: 'trialing',
    stripeCheckoutEvidenceVerified: true,
    trialPolicyPendingCheckout: false,
  });

  const start = 1_800_000_000;
  const metadata = buildStripeTrialMetadata(decideStripeTrialOffer(false));
  assert.equal(resolveStripeSubscriptionTrialState({
    metadata,
    status: 'trialing',
    trial_start: start,
    trial_end: start + 7 * 86_400,
    created: start,
  }).quarantined, false);
  assert.equal(resolveStripeSubscriptionTrialState({
    metadata: {},
    status: 'trialing',
    trial_start: start,
    trial_end: start + 7 * 86_400,
    created: start,
  }).quarantined, true);
});

test('both checkout entrypoints use the shared trial policy and no hard-coded trial duration', () => {
  const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  for (const route of [read('app/api/stripe/checkout/route.ts'), read('app/api/stripe/subscribe/route.ts')]) {
    assert.match(route, /reserveStripeCheckout\(getAdminDb\(\), uid, reservationId\)/);
    assert.match(route, /discoverStripeCheckoutCustomers/);
    assert.match(route, /readStripeCheckoutSubscriptionHistory/);
    assert.match(route, /reservation\.trialPreviouslyConsumed \|\| subscriptionHistory\.hasHistory/);
    assert.match(route, /STRIPE_SUBSCRIPTION_EXISTS/);
    assert.match(route, /STRIPE_CHECKOUT_IN_PROGRESS/);
    assert.match(route, /expires_at:/);
    assert.match(route, /idempotencyKey:/);
    assert.match(route, /shouldRetainStripeCheckoutReservation\(error\)/);
    assert.match(route, /buildStripeTrialMetadata\(trialOffer\)/);
    assert.match(route, /buildStripeSubscriptionData\(checkoutMetadata, trialOffer\)/);
    assert.doesNotMatch(route, /trial_period_days:\s*7/);
  }
});

test('checkout webhook records actual trial evidence instead of trusting offer copy', () => {
  const webhook = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'stripe', 'webhook', 'route.ts'), 'utf8');
  assert.match(webhook, /resolveStripeTrialEvidence\(\{/);
  assert.match(webhook, /subscriptionStatus:\s*status/);
  assert.match(webhook, /trialStart:\s*verifiedSubscription\?\.trial_start/);
  assert.match(webhook, /stripeTrialPolicyStatus:\s*trialEvidence\.status/);
  assert.match(webhook, /trialEligibleAtCheckout:\s*trialEvidence\.offer\?\.eligible/);
  assert.match(webhook, /trialStarted:\s*trialEvidence\.trialStarted/);
  assert.match(webhook, /trialPolicyQuarantined/);
  assert.match(webhook, /preserveStripeTrialQuarantine\(current\.data\(\), data\)/);
  assert.match(webhook, /checkoutEvidenceTransition/);
  assert.match(webhook, /stripeCheckoutEvidenceVerified:\s*!trialPolicyQuarantined/);
  assert.ok((webhook.match(/trialPolicyPendingCheckout:/g) || []).length >= 3);
  assert.ok((webhook.match(/resolveStripeSubscriptionTrialState\(subscription\)/g) || []).length >= 2);
  assert.match(webhook, /completeStripeCheckoutReservation\(getAdminDb\(\),/);
  assert.match(webhook, /if \(!trialPolicyQuarantined\) \{\s*await recordSonaCheckoutConversion/);
  assert.doesNotMatch(webhook, /\(7-day trial\)/);
});
