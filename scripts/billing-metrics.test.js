const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');

async function loadBillingMetrics() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-metrics-'));
  const outfile = path.join(outdir, 'billing-metrics.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'billing-metrics.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

async function loadBillingLedger() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-ledger-'));
  const outfile = path.join(outdir, 'billing-ledger.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'billing-ledger.ts')],
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

test('verified MRR uses each active account recurring amount and interval without extrapolation', async () => {
  const { calculateVerifiedMrr } = await loadBillingMetrics();
  const result = calculateVerifiedMrr([
    { plan: 'pro', status: 'active', billingInterval: 'month', recurringAmountCents: 2_000, recurringCurrency: 'usd' },
    { plan: 'studio', status: 'active', billingInterval: 'year', recurringAmountCents: 48_000, recurringCurrency: 'usd' },
    { plan: 'pro', status: 'trialing', billingInterval: 'month', recurringAmountCents: 2_000, recurringCurrency: 'usd' },
    { plan: 'pro', status: 'canceled', billingInterval: 'month', recurringAmountCents: 2_000, recurringCurrency: 'usd' },
  ]);

  assert.equal(result.mrrUsd, 60);
  assert.equal(result.activePaidAccounts, 2);
  assert.equal(result.pricedActiveAccounts, 2);
  assert.equal(result.byPlan.pro.mrrUsd, 20);
  assert.equal(result.byPlan.studio.mrrUsd, 40);
  assert.equal(result.complete, true);
});

test('missing or non-USD recurring evidence is excluded and lowers coverage', async () => {
  const { calculateVerifiedMrr } = await loadBillingMetrics();
  const result = calculateVerifiedMrr([
    { plan: 'pro', status: 'active', billingInterval: 'month', recurringAmountCents: 2_000, recurringCurrency: 'usd' },
    { plan: 'studio', status: 'active', billingInterval: 'year', recurringAmountCents: null, recurringCurrency: 'usd' },
    { plan: 'studio', status: 'active', billingInterval: 'month', recurringAmountCents: 5_000, recurringCurrency: 'eur' },
    { plan: 'legacy', status: 'active', billingInterval: 'month', recurringAmountCents: 9_900, recurringCurrency: 'usd' },
  ]);

  assert.equal(result.mrrUsd, 20);
  assert.equal(result.activePaidAccounts, 4);
  assert.equal(result.pricedActiveAccounts, 1);
  assert.equal(result.unresolvedActiveAccounts, 3);
  assert.equal(result.coveragePercent, 25);
  assert.equal(result.complete, false);
  assert.deepEqual(result.unresolved, { evidence: 0, plan: 1, amount: 1, interval: 0, currency: 1 });
});

test('an explicitly incomplete Stripe sync cannot count as verified MRR', async () => {
  const { calculateVerifiedMrr } = await loadBillingMetrics();
  const result = calculateVerifiedMrr([
    {
      plan: 'studio',
      status: 'active',
      billingInterval: 'month',
      recurringAmountCents: 9_999,
      recurringCurrency: 'usd',
      billingEvidenceStatus: 'incomplete',
    },
  ]);

  assert.equal(result.mrrUsd, 0);
  assert.equal(result.complete, false);
  assert.equal(result.unresolved.evidence, 1);
});

test('empty billing evidence is complete zero rather than a sampled estimate', async () => {
  const { calculateVerifiedMrr } = await loadBillingMetrics();
  const result = calculateVerifiedMrr([]);

  assert.equal(result.mrrUsd, 0);
  assert.equal(result.coveragePercent, 100);
  assert.equal(result.complete, true);
});

test('Stripe reconciliation builds complete annual subscription evidence without changing price or plan', async () => {
  const { buildSubscriptionBillingEvidence } = await loadBillingMetrics();
  const evidence = buildSubscriptionBillingEvidence({
    ownerUid: 'user-1',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    status: 'active',
    plan: 'studio',
    interval: 'year',
    amountCents: 8_999,
    currency: 'USD',
    stripePriceId: 'price_max_year',
    currentPeriodEnd: '2027-07-10T00:00:00.000Z',
    syncedAt: '2026-07-10T00:00:00.000Z',
  });

  assert.equal(evidence.complete, true);
  assert.deepEqual(evidence.missing, []);
  assert.equal(evidence.patch.plan, 'studio');
  assert.equal(evidence.patch.billingInterval, 'year');
  assert.equal(evidence.patch.recurringAmountCents, 8_999);
  assert.equal(evidence.patch.recurringCurrency, 'usd');
  assert.equal(evidence.patch.billingEvidenceStatus, 'complete');
});

test('Stripe reconciliation reports incomplete evidence instead of inventing missing recurrence fields', async () => {
  const { buildSubscriptionBillingEvidence } = await loadBillingMetrics();
  const evidence = buildSubscriptionBillingEvidence({
    ownerUid: 'user-2',
    stripeCustomerId: 'cus_2',
    stripeSubscriptionId: 'sub_2',
    status: 'active',
    plan: 'pro',
    interval: null,
    amountCents: null,
    currency: 'usd',
    stripePriceId: null,
  });

  assert.equal(evidence.complete, false);
  assert.deepEqual(evidence.missing, ['interval', 'amount', 'price_id']);
  assert.equal(evidence.patch.billingEvidenceStatus, 'incomplete');
  assert.equal('billingInterval' in evidence.patch, false);
  assert.equal('recurringAmountCents' in evidence.patch, false);
});

test('Stripe reconciliation stays incomplete without an owner or USD conversion', async () => {
  const { buildSubscriptionBillingEvidence } = await loadBillingMetrics();
  const evidence = buildSubscriptionBillingEvidence({
    ownerUid: null,
    stripeCustomerId: 'cus_3',
    stripeSubscriptionId: 'sub_3',
    status: 'active',
    plan: 'pro',
    interval: 'month',
    amountCents: 1_999,
    currency: 'eur',
    stripePriceId: 'price_eur',
  });

  assert.equal(evidence.complete, false);
  assert.deepEqual(evidence.missing, ['owner_uid', 'currency_conversion']);
  assert.equal(evidence.patch.billingEvidenceStatus, 'incomplete');
});

test('partial billing account patches preserve existing plan, status, owner and creation time', async () => {
  const { buildBillingAccountRecord } = await loadBillingLedger();
  const existing = {
    accountId: 'cus_1',
    uid: 'user-1',
    stripeCustomerId: 'cus_1',
    plan: 'studio',
    status: 'active',
    riskFlags: ['reviewed'],
    stripeLinks: { customer: 'customer-link', subscription: 'subscription-link' },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const patch = buildBillingAccountRecord({
    stripeCustomerId: 'cus_1',
    stripeLatestInvoiceId: 'in_1',
  }, existing, '2026-07-10T00:00:00.000Z');
  const merged = { ...existing, ...patch };

  assert.equal(patch.plan, 'studio');
  assert.equal(patch.status, 'active');
  assert.equal(patch.uid, 'user-1');
  assert.equal(merged.plan, 'studio');
  assert.equal(merged.status, 'active');
  assert.equal(merged.uid, 'user-1');
  assert.equal(merged.createdAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(merged.riskFlags, ['reviewed']);
  assert.equal(merged.stripeLatestInvoiceId, 'in_1');
  assert.ok(merged.stripeLinks.subscription);
  assert.ok(merged.stripeLinks.latestInvoice);
});

test('reconciliation preview identifies complete Stripe evidence without writing it', async () => {
  const { buildBillingReconciliationPreview } = await loadBillingLedger();
  const preview = buildBillingReconciliationPreview({
    accountId: 'cus_ready',
    uid: 'user-ready',
    stripeCustomerId: 'cus_ready',
    billingEvidenceStatus: 'incomplete',
    riskFlags: [],
    stripeLinks: {},
    updatedAt: '2026-07-10T00:00:00.000Z',
  }, {
    id: 'cus_ready',
    metadata: { firebaseUid: 'user-ready' },
  }, [{
    id: 'sub_ready',
    status: 'active',
    created: 100,
    metadata: { firebaseUid: 'user-ready', plan: 'pro' },
    current_period_end: 1_800_000_000,
    items: {
      data: [{ price: { id: 'price_pro_month', unit_amount: 499, currency: 'usd', recurring: { interval: 'month' } } }],
    },
  }], '2026-07-10T00:00:00.000Z');

  assert.equal(preview.status, 'ready');
  assert.equal(preview.evidenceStatus, 'complete');
  assert.deepEqual(preview.missing, []);
  assert.equal(preview.proposed.plan, 'pro');
  assert.equal(preview.proposed.billingInterval, 'month');
  assert.equal(preview.proposed.recurringAmountCents, 499);
  assert.equal(preview.proposed.recurringCurrency, 'usd');
});

test('reconciliation preview blocks conflicting Stripe ownership', async () => {
  const { buildBillingReconciliationPreview } = await loadBillingLedger();
  const preview = buildBillingReconciliationPreview({
    accountId: 'cus_conflict',
    uid: 'stored-user',
    stripeCustomerId: 'cus_conflict',
    riskFlags: [],
    stripeLinks: {},
    updatedAt: '2026-07-10T00:00:00.000Z',
  }, {
    id: 'cus_conflict',
    metadata: { firebaseUid: 'customer-user' },
  }, [{
    id: 'sub_conflict',
    status: 'active',
    created: 100,
    metadata: { firebaseUid: 'subscription-user', plan: 'studio' },
    items: { data: [] },
  }]);

  assert.equal(preview.status, 'blocked');
  assert.deepEqual(preview.missing, ['ownership_conflict']);
  assert.deepEqual(preview.proposed, {});
});

test('reconciliation preview blocks deleted customers and missing subscriptions explicitly', async () => {
  const { buildBillingReconciliationPreview } = await loadBillingLedger();
  const account = {
    accountId: 'cus_missing',
    uid: 'user-missing',
    stripeCustomerId: 'cus_missing',
    riskFlags: [],
    stripeLinks: {},
    updatedAt: '2026-07-10T00:00:00.000Z',
  };
  const deleted = buildBillingReconciliationPreview(account, { id: 'cus_missing', deleted: true }, []);
  const noSubscription = buildBillingReconciliationPreview(account, {
    id: 'cus_missing',
    metadata: { firebaseUid: 'user-missing' },
  }, []);

  assert.equal(deleted.status, 'blocked');
  assert.deepEqual(deleted.missing, ['stripe_customer_deleted']);
  assert.equal(noSubscription.status, 'blocked');
  assert.deepEqual(noSubscription.missing, ['subscription']);
});

test('production pricing paths persist recurrence evidence and reject a mismatched checkout price', () => {
  const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  const checkout = read('app/api/stripe/subscribe/route.ts');
  const checkoutPriceContract = read('lib/billing/stripe-checkout-price-contract.ts');
  const webhook = read('app/api/stripe/webhook/route.ts');
  const billingPrices = read('lib/billing-prices.ts');
  const billingLedger = read('lib/billing-ledger.ts');
  const costs = read('app/api/admin/costs/route.ts');
  const stats = read('app/api/admin/stats/route.ts');
  const portal = read('app/api/stripe/portal/route.ts');
  const hostedCheckout = read('app/api/stripe/checkout/route.ts');
  const indexes = read('firestore.indexes.json');
  const accountSync = read('app/api/admin/billing/accounts/[accountId]/sync/route.ts');
  const reconciliationPreview = read('app/api/admin/billing/reconciliation-preview/route.ts');
  const adminPage = read('app/suite/admin/page.tsx');

  assert.match(checkout, /validateStripeCheckoutPriceContract/);
  assert.match(checkout, /if \(!priceContract\.valid\)/);
  assert.match(checkoutPriceContract, /price\.type !== 'recurring' \|\| price\.interval !== input\.interval/);
  assert.match(checkoutPriceContract, /expected\.id !== input\.selectedPriceId/);
  assert.match(checkout, /if \(!validated\.success\) return validated\.error/);
  assert.match(hostedCheckout, /if \(!validated\.success\) return validated\.error/);
  assert.match(webhook, /billingInterval:/);
  assert.match(webhook, /recurringAmountCents:/);
  assert.match(billingPrices, /sourceInterval/);
  assert.match(costs, /calculateVerifiedMrr/);
  assert.match(costs, /collectionGroup\('subscription'\)/);
  assert.match(stats, /collectionGroup\('subscription'\)/);
  assert.doesNotMatch(costs, /proCount \* multiplier|studioCount \* multiplier/);
  assert.doesNotMatch(billingLedger, /plan: input\.plan \?\? null|status: input\.status \?\? null/);
  assert.match(billingLedger, /selectAuthoritativeStripeSubscription/);
  assert.match(webhook, /'invoice_failed' : 'invoice_finalized'/);
  assert.match(webhook, /verifiedWebhookUid/);
  assert.match(portal, /selectStripeCustomerForUser/);
  assert.match(indexes, /"collectionGroup": "subscription"/);
  assert.match(accountSync, /uid: typeof storedAccount\.uid === 'string'/);
  assert.match(accountSync, /cache_costs_v8/);
  assert.match(adminPage, /Sync evidence/);
  assert.match(reconciliationPreview, /MAX_PREVIEW_ACCOUNTS = 20/);
  assert.match(reconciliationPreview, /writePerformed: false/);
  assert.doesNotMatch(reconciliationPreview, /\.set\(|\.delete\(|syncCustomerAccount|postInvoiceToLedger/);
  assert.match(adminPage, /Preview repairs/);
});
