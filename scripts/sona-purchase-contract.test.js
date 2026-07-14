const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-purchase-contract-'));
const outfile = path.join(outdir, 'purchase-contract.cjs');

const contractModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'sona', 'purchase-contract.ts')],
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

const stateOutfile = path.join(outdir, 'stripe-subscription-contract.cjs');
const stateModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-subscription-contract.ts')],
  outfile: stateOutfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(stateOutfile));

async function fullMetadata(plan, interval) {
  const { buildSonaPurchaseContractMetadata } = await contractModule;
  return { plan, interval, ...buildSonaPurchaseContractMetadata(plan, interval) };
}

test('Pro checkout records the exact repeatable scout contract', async () => {
  const { buildSonaPurchaseContract, SONA_PURCHASE_CONTRACT_VERSION } = await contractModule;
  const contract = buildSonaPurchaseContract('pro', 'month');
  assert.equal(contract.contractVersion, SONA_PURCHASE_CONTRACT_VERSION);
  assert.equal(contract.plan, 'pro');
  assert.equal(contract.effectiveMode, 'scout');
  assert.equal(contract.rankedRolesPerRunMax, 3);
  assert.equal(contract.preparedPacketsPerRunMax, 0);
  assert.equal(contract.dailyRunsMax, 10);
  assert.equal(contract.reviewRequired, true);
  assert.equal(contract.externalAutoApply, false);
});

test('Max checkout records proactive truth-locked preparation limits', async () => {
  const { buildSonaPurchaseContract } = await contractModule;
  const contract = buildSonaPurchaseContract('studio', 'year');
  assert.equal(contract.plan, 'studio');
  assert.equal(contract.billingInterval, 'year');
  assert.equal(contract.effectiveMode, 'prepare');
  assert.equal(contract.rankedRolesPerRunMax, 5);
  assert.equal(contract.preparedPacketsPerRunMax, 5);
  assert.equal(contract.dailyRunsMax, 3);
  assert.equal(contract.dailyPreparedPacketsMax, 15);
  assert.equal(contract.recurringScouting, true);
});

test('Stripe metadata round-trips only when plan, interval and safeguards match', async () => {
  const { parseSonaPurchaseContractMetadata } = await contractModule;
  const metadata = await fullMetadata('studio', 'month');
  const parsed = parseSonaPurchaseContractMetadata(metadata, 'studio', 'month');
  assert.ok(parsed);
  assert.equal(parsed.fingerprint, metadata.sonaContractFingerprint);
  assert.equal(parseSonaPurchaseContractMetadata(metadata, 'pro', 'month'), null);
  assert.equal(parseSonaPurchaseContractMetadata(metadata, 'studio', 'year'), null);
  assert.equal(parseSonaPurchaseContractMetadata({ ...metadata, sonaPreparedPacketsMax: '6' }, 'studio', 'month'), null);
  assert.equal(parseSonaPurchaseContractMetadata({ ...metadata, sonaReviewRequired: 'false' }, 'studio', 'month'), null);
  assert.equal(parseSonaPurchaseContractMetadata({ ...metadata, sonaExternalAutoApply: 'true' }, 'studio', 'month'), null);
});

test('session and subscription evidence must agree when both carry a contract', async () => {
  const { resolveSonaPurchaseContractEvidence } = await contractModule;
  const session = await fullMetadata('studio', 'month');
  const subscription = await fullMetadata('studio', 'month');
  const verified = resolveSonaPurchaseContractEvidence(session, subscription, 'studio', 'month');
  assert.equal(verified.status, 'verified');
  assert.ok(verified.contract);

  const conflict = resolveSonaPurchaseContractEvidence(
    session,
    { ...subscription, sonaContractFingerprint: '0'.repeat(64) },
    'studio',
    'month',
  );
  assert.equal(conflict.status, 'invalid');
  assert.equal(conflict.contract, null);
  assert.equal(resolveSonaPurchaseContractEvidence({}, {}, 'pro', 'month').status, 'legacy_missing');
  assert.equal(resolveSonaPurchaseContractEvidence(session, {}, 'studio', 'month').status, 'invalid');
});

test('configured Stripe price is authoritative over stale plan metadata', async () => {
  const { resolveStripePlanFromConfiguredPrice } = await stateModule;
  const config = {
    proPriceIds: ['price_pro_month', 'price_pro_year'],
    studioPriceIds: ['price_max_month', 'price_max_year'],
  };
  assert.deepEqual(resolveStripePlanFromConfiguredPrice({
    ...config,
    priceId: 'price_pro_month',
    metadataPlan: 'studio',
  }), { plan: 'pro', status: 'metadata_conflict' });
  assert.deepEqual(resolveStripePlanFromConfiguredPrice({
    ...config,
    priceId: 'price_max_year',
    metadataPlan: 'pro',
  }), { plan: 'studio', status: 'metadata_conflict' });
  assert.equal(resolveStripePlanFromConfiguredPrice({ ...config, priceId: 'price_unknown' }).plan, null);
  assert.equal(resolveStripePlanFromConfiguredPrice({
    priceId: 'price_duplicate',
    metadataPlan: 'studio',
    proPriceIds: ['price_duplicate'],
    studioPriceIds: ['price_duplicate'],
  }).status, 'configuration_conflict');
});

test('subscription state rejects stale and lower-priority lifecycle events', async () => {
  const { decideStripeSubscriptionStateWrite } = await stateModule;
  const canceled = {
    stripeStateEventId: 'evt_delete',
    stripeStateEventCreated: 200,
    stripeStateEventPriority: 50,
    stripeStateSubscriptionId: 'sub_current',
    stripeStateSubscriptionCreated: 100,
    stripeStateEntitled: false,
  };
  assert.equal(decideStripeSubscriptionStateWrite(canceled, {
    eventId: 'evt_old_invoice',
    eventType: 'invoice.payment_succeeded',
    eventCreated: 199,
    subscriptionId: 'sub_current',
  }).reason, 'stale');
  assert.equal(decideStripeSubscriptionStateWrite(canceled, {
    eventId: 'evt_same_second_checkout',
    eventType: 'checkout.session.completed',
    eventCreated: 200,
    subscriptionId: 'sub_current',
  }).reason, 'lower_priority');
  const duplicate = decideStripeSubscriptionStateWrite(canceled, {
    eventId: 'evt_delete',
    eventType: 'customer.subscription.deleted',
    eventCreated: 200,
    subscriptionId: 'sub_current',
  });
  assert.equal(duplicate.reason, 'duplicate');
  assert.equal(duplicate.resumeSideEffects, true);
  assert.equal(decideStripeSubscriptionStateWrite(canceled, {
    eventId: 'evt_new_subscription',
    eventType: 'customer.subscription.updated',
    eventCreated: 201,
    subscriptionId: 'sub_current',
  }).apply, true);
  assert.equal(decideStripeSubscriptionStateWrite(canceled, {
    eventId: 'evt_old_subscription_delete',
    eventType: 'customer.subscription.deleted',
    eventCreated: 202,
    subscriptionId: 'sub_old',
  }).reason, 'different_subscription');
  assert.equal(decideStripeSubscriptionStateWrite(canceled, {
    eventId: 'evt_new_checkout',
    eventType: 'checkout.session.completed',
    eventCreated: 150,
    subscriptionId: 'sub_new',
    subscriptionCreated: 300,
    entitled: true,
  }).apply, true);
  assert.equal(decideStripeSubscriptionStateWrite({
    ...canceled,
    stripeStateSubscriptionCreated: 300,
  }, {
    eventId: 'evt_equal_second_active_checkout',
    eventType: 'checkout.session.completed',
    eventCreated: 150,
    subscriptionId: 'sub_new',
    subscriptionCreated: 300,
    entitled: true,
  }).reason, 'active_subscription');
});

test('Stripe event processing reclaims crashed and failed work but not a live lease', async () => {
  const { decideStripeEventProcessingClaim } = await stateModule;
  const now = Date.parse('2026-07-11T12:00:00.000Z');
  assert.equal(decideStripeEventProcessingClaim(null, now).acquire, true);
  assert.equal(decideStripeEventProcessingClaim({ processingStatus: 'failed' }, now).reason, 'retry');
  assert.equal(decideStripeEventProcessingClaim({
    processingStatus: 'processing',
    processingLeaseUntil: '2026-07-11T11:59:00.000Z',
  }, now).reason, 'lease_expired');
  assert.equal(decideStripeEventProcessingClaim({
    processingStatus: 'processing',
    processingLeaseUntil: '2026-07-11T12:01:00.000Z',
  }, now).reason, 'in_progress');
  assert.equal(decideStripeEventProcessingClaim({ processingStatus: 'processed' }, now).reason, 'terminal');
});

test('both checkout paths stamp the contract on the session and subscription', () => {
  const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  const embedded = read('app/api/stripe/subscribe/route.ts');
  const hosted = read('app/api/stripe/checkout/route.ts');
  const webhook = read('app/api/stripe/webhook/route.ts');
  const webhookEvidence = read('lib/billing/stripe-checkout-webhook-evidence.ts');
  const email = read('lib/email.ts');
  const ledger = read('lib/billing-ledger.ts');

  for (const route of [embedded, hosted]) {
    assert.match(route, /buildSonaPurchaseContractMetadata\(plan, interval\)/);
    assert.match(route, /subscription_data:[\s\S]*metadata:\s*checkoutMetadata/);
    assert.match(route, /metadata:\s*checkoutMetadata/);
  }
  assert.match(webhook, /resolveStripeCheckoutWebhookEvidence/);
  assert.match(webhookEvidence, /resolveSonaPurchaseContractEvidence/);
  assert.match(webhook, /resolveStripePlanFromConfiguredPrice/);
  assert.doesNotMatch(webhook, /subscription\.metadata\?\.plan \|\|/);
  assert.match(webhook, /sonaPurchaseContractStatus:\s*purchaseContract\.status/);
  assert.match(webhook, /sonaPurchaseContractFingerprint/);
  assert.match(webhook, /Could not verify checkout subscription/);
  assert.match(webhook, /Invoice \$\{invoice\.id\} price could not be mapped/);
  assert.match(webhook, /Subscription \$\{subscription\.id\} price could not be mapped/);
  assert.match(webhook, /subscriptionWrite\.resumeSideEffects/);
  assert.match(webhook, /decideStripeSubscriptionStateWrite/);
  assert.match(webhook, /stripeStateEventCreated/);
  assert.match(webhook, /claimStripeEventProcessing/);
  assert.match(ledger, /processingStatus:\s*'processing'/);
  assert.match(webhook, /stripe:\$\{stripeEventId\}:\$\{communication\.template\}/);
  assert.match(email, /idempotencyKey:\s*options\.idempotencyKey/);
  assert.match(ledger, /createHash\('sha256'\)\.update\(input\.idempotencyKey\)/);
  assert.match(ledger, /resolveStripePlanFromConfiguredPrice/);
  assert.doesNotMatch(ledger, /subscription\?\.metadata\?\.plan \|\| price\?\.nickname/);
  assert.doesNotMatch(embedded, /sonaExternalAutoApply:\s*'true'/);
  assert.doesNotMatch(hosted, /sonaExternalAutoApply:\s*'true'/);
});
