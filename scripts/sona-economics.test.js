const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

async function loadEconomics() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-economics-'));
  const outfile = path.join(outdir, 'economics.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'sona', 'economics.ts')],
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

async function loadPaymentEvidenceServer() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-payment-evidence-'));
  const outfile = path.join(outdir, 'payment-evidence-server.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'sona', 'payment-evidence-server.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'alias-root-and-server-only',
      setup(builder) {
        builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' }));
        builder.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: 'export {};', loader: 'js' }));
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

async function loadRenewalEvidenceExport() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-renewal-export-'));
  const outfile = path.join(outdir, 'renewal-evidence-export.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'sona', 'renewal-evidence-export.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'alias-root-and-server-only',
      setup(builder) {
        builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' }));
        builder.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: 'export {};', loader: 'js' }));
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

async function loadPricingMemoAcknowledgement() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-pricing-memo-ack-'));
  const outfile = path.join(outdir, 'pricing-memo-acknowledgement.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'sona', 'pricing-memo-acknowledgement.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

async function loadPricingMemoReviewStatusStore() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-pricing-memo-review-store-'));
  const outfile = path.join(outdir, 'pricing-memo-review-status-store.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'sona', 'pricing-memo-review-status-store.ts')],
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

async function loadPricingMemoStatusRequest() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-pricing-memo-status-request-'));
  const outfile = path.join(outdir, 'pricing-memo-status-request.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'sona', 'pricing-memo-status-request.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

function createPagedRenewalEvidenceDb(collections, options = {}) {
  const reads = {};
  const createQuery = (collectionName, state = {}) => ({
    where(field, operator, value) {
      assert.equal(['==', '>='].includes(operator), true);
      return createQuery(collectionName, { ...state, filter: { field, operator, value } });
    },
    orderBy() {
      return createQuery(collectionName, state);
    },
    limit(value) {
      return createQuery(collectionName, { ...state, limit: value });
    },
    startAfter(cursor) {
      return createQuery(collectionName, { ...state, after: cursor.id });
    },
    async readFrom(sourceCollections) {
      reads[collectionName] = (reads[collectionName] || 0) + 1;
      options.onRead?.({ collectionName, read: reads[collectionName], collections });
      const records = [...(sourceCollections[collectionName] || [])]
        .filter(record => {
          if (!state.filter) return true;
          const fieldValue = record.data[state.filter.field];
          return state.filter.operator === '>='
            ? String(fieldValue || '') >= String(state.filter.value)
            : fieldValue === state.filter.value;
        })
        .sort((left, right) => left.id.localeCompare(right.id));
      const start = state.after
        ? records.findIndex(record => record.id === state.after) + 1
        : 0;
      const page = records.slice(start, start + (state.limit || records.length));
      return {
        docs: page.map(record => ({ id: record.id, data: () => clone(record.data) })),
      };
    },
    async get() {
      return this.readFrom(collections);
    },
  });
  return {
    db: {
      collection: name => createQuery(name),
      async runTransaction(callback, transactionOptions) {
        assert.equal(transactionOptions.readOnly, true);
        reads.transactions = (reads.transactions || 0) + 1;
        const snapshot = clone(collections);
        return callback({ get: query => query.readFrom(snapshot) });
      },
    },
    reads,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createFakeFirestore() {
  const docs = new Map();
  let transactionFailures = 0;

  function docRef(docPath) {
    return {
      path: docPath,
      async get() {
        const data = docs.get(docPath);
        return { exists: Boolean(data), data: () => clone(data || {}), ref: docRef(docPath) };
      },
      async set(data, options = {}) {
        const current = options.merge ? docs.get(docPath) || {} : {};
        docs.set(docPath, clone(options.merge ? { ...current, ...data } : data));
      },
      collection(name) {
        return collectionRef(`${docPath}/${name}`);
      },
    };
  }

  function collectionRef(collectionPath) {
    let filter = null;
    let limitCount = null;
    let orderField = null;
    let orderDirection = 'asc';
    const ref = {
      doc(id) {
        return docRef(`${collectionPath}/${id}`);
      },
      where(field, operator, value) {
        assert.equal(operator, '==');
        filter = { field, value };
        return ref;
      },
      limit(value) {
        limitCount = value;
        return ref;
      },
      orderBy(field, direction = 'asc') {
        orderField = field;
        orderDirection = direction;
        return ref;
      },
      async get() {
        const prefix = `${collectionPath}/`;
        const rows = [];
        for (const [docPath, data] of docs.entries()) {
          const id = docPath.startsWith(prefix) ? docPath.slice(prefix.length) : '';
          if (!id || id.includes('/')) continue;
          if (filter && data[filter.field] !== filter.value) continue;
          rows.push({ id, exists: true, data: () => clone(data), ref: docRef(docPath) });
        }
        if (orderField) {
          rows.sort((a, b) => {
            const comparison = String(a.data()[orderField] || '').localeCompare(String(b.data()[orderField] || ''));
            return orderDirection === 'desc' ? -comparison : comparison;
          });
        }
        return { docs: limitCount ? rows.slice(0, limitCount) : rows };
      },
    };
    return ref;
  }

  return {
    docs,
    collection: collectionRef,
    failNextTransactions(count = 1) {
      transactionFailures = count;
    },
    async runTransaction(callback) {
      if (transactionFailures > 0) {
        transactionFailures -= 1;
        throw new Error('transient transaction failure');
      }
      return callback({
        get: ref => ref.get(),
        getAll: (...refs) => Promise.all(refs.map(ref => ref.get())),
        set: (ref, data, options) => ref.set(data, options),
      });
    },
  };
}

const actualWork = {
  searchQueries: 1,
  rankedRoles: 3,
  resumeMorphAttempts: 1,
  coverLetterAttempts: 1,
  emailDigestChecks: 1,
  emailDigestsSent: 1,
};

test('cost estimates are versioned and useful outcomes are explicit', async () => {
  const economics = await loadEconomics();
  const estimate = economics.estimateSonaRunCost(actualWork);

  assert.equal(estimate.estimatedCostMicros, 10_900);
  assert.equal(estimate.estimatedCostUsd, 0.0109);
  assert.match(estimate.basisVersion, /sona-directional-cost-v1/);
  assert.equal(economics.classifySonaUsefulOutcome({ queuedCount: 3, preparedCount: 0 }), 'ranked_picks');
  assert.equal(economics.classifySonaUsefulOutcome({ queuedCount: 3, preparedCount: 1 }), 'prepared_packet');
  assert.equal(economics.classifySonaUsefulOutcome({ queuedCount: 0, preparedCount: 0 }), null);
});

test('legacy payment preview recovers verified evidence from the paid invoice', async () => {
  const economics = await loadEconomics();
  const preview = economics.buildSonaPaymentEvidencePreview({
    paymentReferenceId: 'pi_metadata',
    uid: 'user-1',
    invoiceId: 'in_metadata',
    existingPlan: null,
    existingCurrency: null,
    invoiceFound: true,
    invoicePaid: true,
    paymentReferenceVerified: true,
    customerUid: 'user-1',
    subscriptionUid: 'user-1',
    stripePriceId: 'price_studio_month',
    invoiceCurrency: 'usd',
    subscriptionBillingInterval: 'month',
    invoiceBillingReason: 'subscription_create',
    configuredPriceIds: {
      pro: ['price_pro_month'],
      studio: ['price_studio_month'],
    },
  });

  assert.equal(preview.status, 'ready');
  assert.deepEqual(preview.missing, []);
  assert.equal(preview.proposed.plan, 'studio');
  assert.equal(preview.proposed.currency, 'usd');
  assert.equal(preview.proposed.planSource, 'price_id');
  assert.equal(preview.proposed.billingInterval, 'month');
  assert.equal(preview.proposed.billingReason, 'subscription_create');
});

test('legacy payment preview fails closed on ownership, plan and currency conflicts', async () => {
  const economics = await loadEconomics();
  const preview = economics.buildSonaPaymentEvidencePreview({
    paymentReferenceId: 'pi_conflict',
    uid: 'stored-user',
    invoiceId: 'in_conflict',
    existingPlan: 'pro',
    existingCurrency: 'usd',
    invoiceFound: true,
    invoicePaid: true,
    paymentReferenceVerified: true,
    customerUid: 'customer-user',
    subscriptionUid: 'subscription-user',
    stripePriceId: 'price_studio_month',
    invoiceCurrency: 'eur',
    existingBillingInterval: 'month',
    subscriptionBillingInterval: 'month',
    existingBillingReason: 'subscription_create',
    invoiceBillingReason: 'subscription_create',
    configuredPriceIds: {
      pro: ['price_pro_month'],
      studio: ['price_studio_month'],
    },
  });

  assert.equal(preview.status, 'blocked');
  assert.deepEqual(preview.missing, [
    'ownership_conflict',
    'plan_conflict',
    'currency_conflict',
    'currency_conversion',
  ]);
  assert.equal(preview.proposed.plan, null);

  const duplicatePrice = economics.buildSonaPaymentEvidencePreview({
    paymentReferenceId: 'pi_duplicate_price',
    uid: 'user-1',
    invoiceId: 'in_duplicate_price',
    invoiceFound: true,
    invoicePaid: true,
    paymentReferenceVerified: true,
    customerUid: 'user-1',
    stripePriceId: 'price_shared',
    invoiceCurrency: 'usd',
    subscriptionBillingInterval: 'month',
    invoiceBillingReason: 'subscription_create',
    configuredPriceIds: {
      pro: ['price_shared'],
      studio: ['price_shared'],
    },
  });
  assert.equal(duplicatePrice.status, 'blocked');
  assert.deepEqual(duplicatePrice.missing, ['plan_conflict']);
});

test('legacy payment preview blocks conflicting renewal evidence', async () => {
  const economics = await loadEconomics();
  const preview = economics.buildSonaPaymentEvidencePreview({
    paymentReferenceId: 'pi_renewal_conflict',
    uid: 'user-1',
    invoiceId: 'in_renewal_conflict',
    existingPlan: 'pro',
    existingCurrency: 'usd',
    existingBillingInterval: 'month',
    existingBillingReason: 'subscription_create',
    invoiceFound: true,
    invoicePaid: true,
    paymentReferenceVerified: true,
    customerUid: 'user-1',
    stripePriceId: 'price_pro_month',
    subscriptionBillingInterval: 'year',
    invoiceBillingReason: 'subscription_cycle',
    invoiceCurrency: 'usd',
    configuredPriceIds: { pro: ['price_pro_month'], studio: [] },
  });

  assert.equal(preview.status, 'blocked');
  assert.deepEqual(preview.missing, ['billing_interval_conflict', 'billing_reason_conflict']);
  assert.equal(preview.proposed.billingInterval, 'year');
  assert.equal(preview.proposed.billingReason, 'subscription_cycle');
});

test('stored payment fields cannot replace missing Stripe invoice proof', async () => {
  const economics = await loadEconomics();
  const preview = economics.buildSonaPaymentEvidencePreview({
    paymentReferenceId: 'pi_stored_only',
    uid: 'user-1',
    invoiceId: 'in_stored_only',
    existingPlan: 'pro',
    existingCurrency: 'usd',
    existingBillingInterval: 'month',
    existingBillingReason: 'subscription_cycle',
    invoiceFound: true,
    invoicePaid: true,
    paymentReferenceVerified: true,
    customerUid: 'user-1',
    configuredPriceIds: { pro: ['price_pro_month'], studio: [] },
  });

  assert.equal(preview.status, 'blocked');
  assert.deepEqual(preview.missing, ['plan', 'currency', 'billing_interval', 'billing_reason']);
  assert.equal(preview.proposed.plan, null);
  assert.equal(preview.proposed.billingReason, null);
});

test('complete legacy payment fields require explicit evidence provenance', async () => {
  const economics = await loadEconomics();
  const baseInput = {
    paymentReferenceId: 'pi_complete_legacy',
    uid: 'user-1',
    invoiceId: 'in_complete_legacy',
    existingPlan: 'pro',
    existingCurrency: 'usd',
    existingBillingInterval: 'month',
    existingBillingReason: 'subscription_create',
    invoiceFound: true,
    invoicePaid: true,
    paymentReferenceVerified: true,
    customerUid: 'user-1',
    stripePriceId: 'price_pro_month',
    invoiceCurrency: 'usd',
    subscriptionBillingInterval: 'month',
    invoiceBillingReason: 'subscription_create',
    configuredPriceIds: { pro: ['price_pro_month'], studio: [] },
  };

  const unverified = economics.buildSonaPaymentEvidencePreview({
    ...baseInput,
    existingEvidenceVerified: false,
  });
  const verified = economics.buildSonaPaymentEvidencePreview({
    ...baseInput,
    existingEvidenceVerified: true,
  });

  assert.equal(unverified.status, 'ready');
  assert.equal(verified.status, 'verified');
  assert.equal(economics.hasVerifiedSonaPaymentEvidence({
    evidenceStatus: 'verified',
    evidenceVersion: economics.SONA_ECONOMICS_VERSION,
  }), false);
  assert.equal(economics.hasVerifiedSonaPaymentEvidence({
    evidenceStatus: 'verified',
    evidenceVersion: economics.SONA_ECONOMICS_VERSION,
    evidenceSource: 'reviewed_stripe_repair',
  }), false);
  assert.equal(economics.hasVerifiedSonaPaymentEvidence({
    evidenceStatus: 'verified',
    evidenceVersion: economics.SONA_ECONOMICS_VERSION,
    evidenceSource: 'stripe_webhook',
  }), true);
  assert.equal(economics.hasVerifiedSonaPaymentEvidence({
    evidenceStatus: 'verified',
    evidenceVersion: economics.SONA_PAYMENT_EVIDENCE_REPAIR_VERSION,
    evidenceSource: 'reviewed_stripe_repair',
  }), true);
});

test('legacy payment preview names missing invoice and non-USD conversion evidence', async () => {
  const economics = await loadEconomics();
  const missingInvoice = economics.buildSonaPaymentEvidencePreview({
    paymentReferenceId: 'pi_missing',
    uid: 'user-1',
    invoiceId: null,
    existingPlan: null,
    existingCurrency: null,
    configuredPriceIds: { pro: [], studio: [] },
  });
  const nonUsd = economics.buildSonaPaymentEvidencePreview({
    paymentReferenceId: 'pi_eur',
    uid: 'user-1',
    invoiceId: 'in_eur',
    existingPlan: null,
    existingCurrency: null,
    invoiceFound: true,
    invoicePaid: true,
    paymentReferenceVerified: true,
    customerUid: 'user-1',
    stripePriceId: 'price_pro_month',
    invoiceCurrency: 'eur',
    subscriptionBillingInterval: 'month',
    invoiceBillingReason: 'subscription_create',
    configuredPriceIds: { pro: ['price_pro_month'], studio: [] },
  });

  assert.deepEqual(missingInvoice.missing, ['invoice_id', 'plan', 'currency', 'billing_interval', 'billing_reason']);
  assert.equal(nonUsd.status, 'blocked');
  assert.deepEqual(nonUsd.missing, ['currency_conversion']);
  assert.equal(nonUsd.proposed.plan, 'pro');
  assert.equal(nonUsd.proposed.currency, 'eur');
});

test('legacy payment preview names nested Stripe evidence lookup failures', async () => {
  const economics = await loadEconomics();
  const preview = economics.buildSonaPaymentEvidencePreview({
    paymentReferenceId: 'pi_lookup_failed',
    uid: 'user-1',
    invoiceId: 'in_lookup_failed',
    existingPlan: 'pro',
    existingCurrency: 'usd',
    existingBillingInterval: 'month',
    existingBillingReason: 'subscription_create',
    invoiceFound: true,
    invoicePaid: true,
    paymentReferenceVerified: true,
    customerLookupFailed: true,
    subscriptionLookupFailed: true,
    stripePriceId: 'price_pro_month',
    invoiceCurrency: 'usd',
    subscriptionBillingInterval: 'month',
    invoiceBillingReason: 'subscription_create',
    configuredPriceIds: { pro: ['price_pro_month'], studio: [] },
  });

  assert.equal(preview.status, 'blocked');
  assert.deepEqual(preview.missing, [
    'stripe_customer_lookup_failed',
    'stripe_subscription_lookup_failed',
  ]);
});

test('Stripe inspection binds historical price and paid payment evidence to the invoice', async () => {
  const paymentEvidence = await loadPaymentEvidenceServer();
  const originalProPrice = process.env.STRIPE_PRO_PRICE_ID;
  const originalStudioPrice = process.env.STRIPE_STUDIO_PRICE_ID;
  process.env.STRIPE_PRO_PRICE_ID = 'price_pro_month';
  process.env.STRIPE_STUDIO_PRICE_ID = 'price_studio_month';
  let invoiceStatus = 'paid';
  let paidPaymentReference = 'pi_historical';
  let invoiceLineData = [{ pricing: { price_details: { price: 'price_pro_month' } } }];
  let invoiceLinesHasMore = false;
  const stripe = {
    invoices: {
      retrieve: async () => ({
        id: 'in_historical',
        status: invoiceStatus,
        customer: 'cus_user_1',
        subscription: 'sub_current',
        currency: 'usd',
        billing_reason: 'subscription_cycle',
      }),
      listLineItems: async () => ({
        data: invoiceLineData,
        has_more: invoiceLinesHasMore,
      }),
    },
    invoicePayments: {
      list: async () => ({
        data: [{ status: 'paid', payment: { payment_intent: paidPaymentReference } }],
      }),
    },
    subscriptions: {
      retrieve: async () => ({
        metadata: { firebaseUid: 'user-1', plan: 'studio' },
        items: { data: [{ price: { id: 'price_studio_month', recurring: { interval: 'year' } } }] },
      }),
    },
    customers: {
      retrieve: async () => ({ id: 'cus_user_1', deleted: false, metadata: { firebaseUid: 'user-1' } }),
    },
    prices: {
      retrieve: async priceId => ({ id: priceId, recurring: { interval: 'month' } }),
    },
  };

  try {
    const verified = await paymentEvidence.inspectSonaPaymentEvidence(stripe, {
      paymentReferenceId: 'pi_historical',
      uid: 'user-1',
      invoiceId: 'in_historical',
    });
    assert.deepEqual(verified.lookupErrors, []);
    assert.equal(verified.preview.status, 'ready');
    assert.equal(verified.preview.proposed.plan, 'pro');
    assert.equal(verified.preview.proposed.stripePriceId, 'price_pro_month');
    assert.equal(verified.preview.proposed.billingInterval, 'month');
    assert.equal(verified.preview.proposed.billingReason, 'subscription_cycle');
    assert.equal(verified.preview.paymentReferenceVerified, true);

    invoiceStatus = 'open';
    paidPaymentReference = 'pi_different';
    const blocked = await paymentEvidence.inspectSonaPaymentEvidence(stripe, {
      paymentReferenceId: 'pi_historical',
      uid: 'user-1',
      invoiceId: 'in_historical',
    });
    assert.equal(blocked.preview.status, 'blocked');
    assert.deepEqual(blocked.preview.missing, ['invoice_not_paid', 'payment_reference_mismatch']);

    invoiceStatus = 'paid';
    paidPaymentReference = 'pi_historical';
    invoiceLineData = [
      { pricing: { price_details: { price: 'price_pro_month' } } },
      { pricing: { price_details: { price: 'price_unknown_add_on' } } },
    ];
    const mixedPrice = await paymentEvidence.inspectSonaPaymentEvidence(stripe, {
      paymentReferenceId: 'pi_historical',
      uid: 'user-1',
      invoiceId: 'in_historical',
    });
    assert.equal(mixedPrice.preview.status, 'blocked');
    assert.equal(mixedPrice.preview.missing.includes('invoice_price_conflict'), true);

    invoiceLineData = [{ pricing: { price_details: { price: 'price_pro_month' } } }];
    invoiceLinesHasMore = true;
    const truncatedLines = await paymentEvidence.inspectSonaPaymentEvidence(stripe, {
      paymentReferenceId: 'pi_historical',
      uid: 'user-1',
      invoiceId: 'in_historical',
    });
    assert.equal(truncatedLines.preview.status, 'blocked');
    assert.equal(truncatedLines.preview.missing.includes('invoice_lines_incomplete'), true);
  } finally {
    if (originalProPrice === undefined) delete process.env.STRIPE_PRO_PRICE_ID;
    else process.env.STRIPE_PRO_PRICE_ID = originalProPrice;
    if (originalStudioPrice === undefined) delete process.env.STRIPE_STUDIO_PRICE_ID;
    else process.env.STRIPE_STUDIO_PRICE_ID = originalStudioPrice;
  }
});

test('reviewed legacy payment repair patches only verified attribution evidence', async () => {
  const economics = await loadEconomics();
  const preview = economics.buildSonaPaymentEvidencePreview({
    paymentReferenceId: 'pi_repairable_12345678',
    uid: 'user-1',
    invoiceId: 'in_repairable',
    invoiceFound: true,
    invoicePaid: true,
    paymentReferenceVerified: true,
    customerUid: 'user-1',
    subscriptionUid: 'user-1',
    stripePriceId: 'price_studio_month',
    invoiceCurrency: 'usd',
    subscriptionBillingInterval: 'month',
    invoiceBillingReason: 'subscription_cycle',
    configuredPriceIds: { pro: [], studio: ['price_studio_month'] },
  });
  const decision = economics.buildSonaPaymentEvidenceRepairDecision({
    current: {
      paymentReferenceId: preview.paymentReferenceId,
      uid: 'user-1',
      invoiceId: preview.invoiceId,
    },
    preview,
    expected: {
      invoiceId: preview.invoiceId,
      plan: 'studio',
      currency: 'usd',
      planSource: 'price_id',
      stripePriceId: 'price_studio_month',
      billingInterval: 'month',
      billingReason: 'subscription_cycle',
    },
    linkedEvents: [
      { eventId: 'invoice_in_repairable', eventType: 'invoice_paid', uid: 'user-1', invoiceId: 'in_repairable', paymentReferenceId: preview.paymentReferenceId },
      {
        eventId: 'refund_repairable',
        eventType: 'refund_succeeded',
        uid: 'user-1',
        paymentReferenceId: preview.paymentReferenceId,
        plan: 'studio',
        currency: 'usd',
        billingInterval: 'year',
        billingReason: 'subscription_create',
        isRenewal: false,
      },
    ],
    confirmationText: preview.confirmationPhrase,
    acknowledged: true,
    reason: 'Restore verified Stripe attribution evidence.',
    actor: 'admin@example.com',
    repairedAt: '2026-07-10T12:00:00.000Z',
  });

  assert.equal(decision.status, 'ready');
  assert.deepEqual(decision.paymentPatch.plan, 'studio');
  assert.deepEqual(decision.paymentPatch.currency, 'usd');
  assert.deepEqual(decision.paymentPatch.billingInterval, 'month');
  assert.deepEqual(decision.paymentPatch.billingReason, 'subscription_cycle');
  assert.equal(decision.paymentPatch.isRenewal, true);
  assert.deepEqual(decision.changedEventIds, ['invoice_in_repairable', 'refund_repairable']);
  const invoiceEventPatch = decision.eventPatches.find(event => event.eventId === 'invoice_in_repairable').patch;
  const refundEventPatch = decision.eventPatches.find(event => event.eventId === 'refund_repairable').patch;
  assert.equal(invoiceEventPatch.isRenewal, true);
  assert.equal(invoiceEventPatch.billingReason, 'subscription_cycle');
  assert.equal(refundEventPatch.isRenewal, false);
  assert.equal('billingReason' in refundEventPatch, false);
  assert.equal(decision.paymentPatch.evidenceRepair.noStripeMutation, true);
  assert.equal(decision.auditChanges.attestationVersion, economics.SONA_PAYMENT_EVIDENCE_REPAIR_VERSION);
});

test('legacy payment repair fails closed on stale review, conflicts and duplicate repair', async () => {
  const economics = await loadEconomics();
  const preview = economics.buildSonaPaymentEvidencePreview({
    paymentReferenceId: 'pi_guarded_12345678',
    uid: 'user-1',
    invoiceId: 'in_guarded',
    invoiceFound: true,
    invoicePaid: true,
    paymentReferenceVerified: true,
    customerUid: 'user-1',
    stripePriceId: 'price_pro_month',
    invoiceCurrency: 'usd',
    subscriptionBillingInterval: 'month',
    invoiceBillingReason: 'subscription_create',
    configuredPriceIds: { pro: ['price_pro_month'], studio: [] },
  });
  const base = {
    current: { paymentReferenceId: preview.paymentReferenceId, uid: 'user-1', invoiceId: preview.invoiceId },
    preview,
    expected: {
      invoiceId: preview.invoiceId,
      plan: 'pro',
      currency: 'usd',
      planSource: 'price_id',
      stripePriceId: 'price_pro_month',
      billingInterval: 'month',
      billingReason: 'subscription_create',
    },
    linkedEvents: [],
    confirmationText: preview.confirmationPhrase,
    acknowledged: true,
    reason: 'Restore verified Stripe attribution evidence.',
    actor: 'admin@example.com',
    repairedAt: '2026-07-10T12:00:00.000Z',
  };

  assert.equal(economics.buildSonaPaymentEvidenceRepairDecision({
    ...base,
    confirmationText: 'REPAIR WRONG',
  }).code, 'confirmation_mismatch');
  assert.equal(economics.buildSonaPaymentEvidenceRepairDecision({
    ...base,
    expected: { ...base.expected, plan: 'studio' },
  }).code, 'evidence_changed');
  assert.equal(economics.buildSonaPaymentEvidenceRepairDecision({
    ...base,
    linkedEvents: [{
      eventId: 'invoice_conflict',
      eventType: 'invoice_paid',
      uid: 'user-1',
      invoiceId: 'in_guarded',
      paymentReferenceId: preview.paymentReferenceId,
      plan: 'studio',
      currency: 'usd',
    }],
  }).code, 'linked_event_conflict');
  assert.equal(economics.buildSonaPaymentEvidenceRepairDecision({
    ...base,
    current: {
      ...base.current,
      plan: 'pro',
      currency: 'usd',
      billingInterval: 'month',
      billingReason: 'subscription_create',
      evidenceStatus: 'verified',
      evidenceVersion: economics.SONA_ECONOMICS_VERSION,
      evidenceSource: 'stripe_webhook',
    },
  }).code, 'already_verified');
});

test('account renewal summary repair is complete and replay-safe', async () => {
  const economics = await loadEconomics();
  const currentSummary = {
    uid: 'summary-user',
    paidInvoiceCount: 2,
    renewalInvoiceCount: 99,
  };
  const paymentRecords = [
      {
        invoiceId: 'in_initial',
        paymentReferenceId: 'pi_initial',
        plan: 'pro',
        currency: 'usd',
        billingInterval: 'month',
        billingReason: 'subscription_create',
        amountPaidCents: 1_900,
        occurredAt: '2026-06-01T12:00:00.000Z',
        paidAfterUsefulOutcome: false,
        evidenceStatus: 'verified',
        evidenceVersion: economics.SONA_ECONOMICS_VERSION,
        evidenceSource: 'stripe_webhook',
      },
      {
        invoiceId: 'in_renewal',
        paymentReferenceId: 'pi_renewal',
        amountPaidCents: 1_900,
        occurredAt: '2026-07-01T12:00:00.000Z',
        paidAfterUsefulOutcome: false,
      },
    ];
  const input = {
    currentSummary,
    paymentRecords,
    paymentHistoryTruncated: false,
    verifiedPayment: {
      uid: 'summary-user',
      invoiceId: 'in_renewal',
      paymentReferenceId: 'pi_renewal',
      plan: 'pro',
      currency: 'usd',
      billingInterval: 'month',
      billingReason: 'subscription_cycle',
    },
    repairedAt: '2026-07-10T14:00:00.000Z',
  };
  const first = economics.buildSonaAccountRenewalSummaryRepairDecision(input);
  const replay = economics.buildSonaAccountRenewalSummaryRepairDecision({
    ...input,
    currentSummary: { ...currentSummary, ...first.summaryPatch },
  });

  assert.equal(first.status, 'ready');
  assert.equal(first.summaryPatch.renewalEvidenceStatus, 'complete');
  assert.equal(first.summaryPatch.paidInvoiceCount, 2);
  assert.equal(first.summaryPatch.renewalInvoiceCount, 1);
  assert.equal(first.summaryPatch.firstPaidInterval, 'month');
  assert.equal(first.summaryPatch.firstRenewalAt, '2026-07-01T12:00:00.000Z');
  assert.equal(first.summaryPatch.latestRenewalAt, '2026-07-01T12:00:00.000Z');
  assert.equal(replay.status, 'ready');
  assert.equal(replay.summaryPatch.renewalInvoiceCount, 1);
});

test('account renewal summary remains incomplete until every paid invoice is verified', async () => {
  const economics = await loadEconomics();
  const decision = economics.buildSonaAccountRenewalSummaryRepairDecision({
    currentSummary: {
      uid: 'incomplete-user',
      paidInvoiceCount: 2,
      renewalInvoiceCount: 99,
      firstPaidInterval: 'year',
    },
    paymentRecords: [
        {
          invoiceId: 'in_unknown',
          paymentReferenceId: 'pi_unknown',
          plan: 'pro',
          currency: 'usd',
          billingInterval: 'month',
          amountPaidCents: 1_900,
          occurredAt: '2026-06-01T12:00:00.000Z',
          evidenceStatus: 'verified',
          evidenceVersion: economics.SONA_ECONOMICS_VERSION,
          evidenceSource: 'stripe_webhook',
        },
        {
          invoiceId: 'in_target',
          paymentReferenceId: 'pi_target',
          amountPaidCents: 1_900,
          occurredAt: '2026-07-01T12:00:00.000Z',
        },
      ],
    paymentHistoryTruncated: false,
    verifiedPayment: {
      uid: 'incomplete-user',
      invoiceId: 'in_target',
      paymentReferenceId: 'pi_target',
      plan: 'pro',
      currency: 'usd',
      billingInterval: 'month',
      billingReason: 'subscription_cycle',
    },
    repairedAt: '2026-07-10T14:00:00.000Z',
  });

  assert.equal(decision.status, 'incomplete');
  assert.equal(decision.clearPaidEvidence, true);
  assert.deepEqual(decision.missingInvoiceIds, ['in_unknown']);
  assert.equal(decision.summaryPatch.renewalEvidenceStatus, 'incomplete');
  assert.equal('renewalInvoiceCount' in decision.summaryPatch, false);
});

test('account renewal summary blocks conflicts and names truncated history', async () => {
  const economics = await loadEconomics();
  const completeInvoices = Array.from({ length: 200 }, (_, index) => ({
    invoiceId: `in_${index}`,
    paymentReferenceId: `pi_${index}`,
    plan: 'pro',
    currency: 'usd',
    billingInterval: 'month',
    billingReason: index === 199 ? 'subscription_cycle' : 'subscription_create',
    amountPaidCents: 1_900,
    occurredAt: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
    evidenceStatus: 'verified',
    evidenceVersion: economics.SONA_ECONOMICS_VERSION,
    evidenceSource: 'stripe_webhook',
  }));
  const verifiedPayment = {
    uid: 'capped-user',
    invoiceId: 'in_199',
    paymentReferenceId: 'pi_199',
    plan: 'pro',
    currency: 'usd',
    billingInterval: 'month',
    billingReason: 'subscription_cycle',
  };
  const truncated = economics.buildSonaAccountRenewalSummaryRepairDecision({
    currentSummary: { uid: 'capped-user' },
    paymentRecords: completeInvoices,
    paymentHistoryTruncated: true,
    verifiedPayment,
    repairedAt: '2026-07-10T14:00:00.000Z',
  });
  const ownerConflict = economics.buildSonaAccountRenewalSummaryRepairDecision({
    currentSummary: { uid: 'different-user' },
    paymentRecords: completeInvoices,
    paymentHistoryTruncated: false,
    verifiedPayment,
    repairedAt: '2026-07-10T14:00:00.000Z',
  });
  const invoiceConflict = economics.buildSonaAccountRenewalSummaryRepairDecision({
    currentSummary: { uid: 'capped-user' },
    paymentRecords: completeInvoices.slice(0, 10),
    paymentHistoryTruncated: false,
    verifiedPayment,
    repairedAt: '2026-07-10T14:00:00.000Z',
  });

  assert.equal(truncated.status, 'incomplete');
  assert.equal(truncated.code, 'account_payment_history_truncated');
  assert.equal(truncated.summaryPatch.renewalEvidenceHistoryTruncated, true);
  assert.equal(ownerConflict.code, 'account_summary_owner_conflict');
  assert.equal(invoiceConflict.code, 'account_payment_ledger_conflict');
});

test('account renewal summary rejects field-present records without provenance or uniqueness', async () => {
  const economics = await loadEconomics();
  const verifiedPayment = {
    uid: 'provenance-user',
    invoiceId: 'in_target',
    paymentReferenceId: 'pi_target',
    plan: 'pro',
    currency: 'usd',
    billingInterval: 'month',
    billingReason: 'subscription_cycle',
  };
  const target = {
    invoiceId: 'in_target',
    paymentReferenceId: 'pi_target',
    amountPaidCents: 1_900,
    occurredAt: '2026-07-01T12:00:00.000Z',
  };
  const fieldPresentButUnverified = {
    invoiceId: 'in_unverified',
    paymentReferenceId: 'pi_unverified',
    plan: 'pro',
    currency: 'usd',
    billingInterval: 'month',
    billingReason: 'subscription_create',
    amountPaidCents: 1_900,
    occurredAt: '2026-06-01T12:00:00.000Z',
    economicsVersion: economics.SONA_ECONOMICS_VERSION,
  };
  const unverified = economics.buildSonaAccountRenewalSummaryRepairDecision({
    currentSummary: { uid: 'provenance-user' },
    paymentRecords: [fieldPresentButUnverified, target],
    paymentHistoryTruncated: false,
    verifiedPayment,
    repairedAt: '2026-07-10T14:00:00.000Z',
  });
  const duplicate = economics.buildSonaAccountRenewalSummaryRepairDecision({
    currentSummary: { uid: 'provenance-user' },
    paymentRecords: [
      {
        ...fieldPresentButUnverified,
        evidenceStatus: 'verified',
        evidenceVersion: economics.SONA_ECONOMICS_VERSION,
        evidenceSource: 'stripe_webhook',
      },
      {
        ...fieldPresentButUnverified,
        paymentReferenceId: 'pi_duplicate',
        evidenceStatus: 'verified',
        evidenceVersion: economics.SONA_ECONOMICS_VERSION,
        evidenceSource: 'stripe_webhook',
      },
      target,
    ],
    paymentHistoryTruncated: false,
    verifiedPayment,
    repairedAt: '2026-07-10T14:00:00.000Z',
  });

  assert.equal(unverified.status, 'incomplete');
  assert.deepEqual(unverified.missingInvoiceIds, ['in_unverified']);
  assert.equal(duplicate.status, 'incomplete');
  assert.equal(duplicate.code, 'account_payment_ledger_duplicate');
  assert.equal(duplicate.missingInvoiceIds.includes('invoice:in_unverified'), true);
});

test('a transient run-attribution failure is queued and recovered idempotently', async () => {
  const economics = await loadEconomics();
  const db = createFakeFirestore();
  const input = {
    uid: 'retry-user',
    runId: 'retry-run',
    tier: 'pro',
    startedAt: '2026-07-10T00:00:00.000Z',
    completedAt: '2026-07-10T00:01:00.000Z',
    terminalStatus: 'completed',
    queuedCount: 3,
    preparedCount: 0,
    actual: actualWork,
  };
  db.failNextTransactions(1);

  const queued = await economics.recordOrQueueSonaRunEconomics(db, input);
  assert.equal(queued.status, 'pending_retry');
  assert.equal(db.docs.get('sona_economics_outbox/retry-run').status, 'pending');

  const recovery = await economics.processSonaEconomicsOutbox(db, 5);
  assert.deepEqual(recovery, { processed: 1, completed: 1, failed: 0 });
  assert.equal(db.docs.get('sona_economics_outbox/retry-run').status, 'completed');
  assert.ok(db.docs.get('sona_economics_events/retry-run'));

  const secondRecovery = await economics.processSonaEconomicsOutbox(db, 5);
  assert.deepEqual(secondRecovery, { processed: 0, completed: 0, failed: 0 });
});

test('a poison outbox entry dead-letters and cannot starve newer work', async () => {
  const economics = await loadEconomics();
  const db = createFakeFirestore();
  const poison = {
    uid: 'poison-user',
    runId: 'poison-run',
    tier: 'pro',
    startedAt: '2026-07-10T00:00:00.000Z',
    completedAt: '2026-07-10T00:01:00.000Z',
    terminalStatus: 'failed',
    queuedCount: 0,
    preparedCount: 0,
    actual: actualWork,
  };
  await economics.queueSonaRunEconomicsRetry(db, poison);
  await db.collection('sona_economics_outbox').doc('poison-run').set({
    attempts: 4,
    nextAttemptAt: '2026-01-01T00:00:00.000Z',
  }, { merge: true });

  const failed = await economics.processSonaEconomicsOutbox(db, 1, {
    recordRunEconomics: async () => { throw new Error('permanent failure'); },
  });
  assert.deepEqual(failed, { processed: 1, completed: 0, failed: 1 });
  assert.equal(db.docs.get('sona_economics_outbox/poison-run').status, 'dead_letter');

  const healthy = { ...poison, uid: 'healthy-user', runId: 'healthy-run', terminalStatus: 'completed', queuedCount: 3 };
  await economics.queueSonaRunEconomicsRetry(db, healthy);
  const recovered = await economics.processSonaEconomicsOutbox(db, 1);
  assert.deepEqual(recovered, { processed: 1, completed: 1, failed: 0 });
  assert.ok(db.docs.get('sona_economics_events/healthy-run'));
});

test('run and checkout attribution is idempotent and preserves the first useful outcome', async () => {
  const economics = await loadEconomics();
  const db = createFakeFirestore();
  const firstInput = {
    uid: 'user-1',
    runId: 'run-1',
    tier: 'pro',
    startedAt: '2026-07-10T00:00:00.000Z',
    completedAt: '2026-07-10T00:01:00.000Z',
    terminalStatus: 'completed',
    queuedCount: 3,
    preparedCount: 0,
    actual: actualWork,
  };

  const first = await economics.recordSonaRunEconomics(db, firstInput);
  const duplicate = await economics.recordSonaRunEconomics(db, firstInput);
  await economics.recordSonaRunEconomics(db, {
    ...firstInput,
    runId: 'run-2',
    tier: 'studio',
    completedAt: '2026-07-10T01:01:00.000Z',
    preparedCount: 1,
  });
  await economics.recordSonaRunEconomics(db, {
    ...firstInput,
    runId: 'run-failed',
    completedAt: '2026-07-10T01:31:00.000Z',
    terminalStatus: 'failed',
    queuedCount: 0,
    preparedCount: 0,
  });

  assert.equal(first.recorded, true);
  assert.equal(first.firstUsefulOutcome, true);
  assert.equal(duplicate.recorded, false);

  const summaryPath = 'users/user-1/metrics/sona_economics';
  const summary = db.docs.get(summaryPath);
  assert.equal(summary.runsObserved, 3);
  assert.equal(summary.usefulRunsObserved, 2);
  assert.equal(summary.firstUsefulRunId, 'run-1');
  assert.equal(summary.firstUsefulOutcome, 'ranked_picks');
  assert.equal(summary.preparedPacketsObserved, 1);
  assert.equal(db.docs.get('sona_economics_events/run-failed').usefulOutcome, null);
  assert.equal(db.docs.get('sona_economics_events/run-failed').terminalStatus, 'failed');

  const checkoutInput = {
    uid: 'user-1',
    stripeEventId: 'evt_123',
    checkoutSessionId: 'cs_123',
    plan: 'studio',
    interval: 'month',
    checkoutValueCents: 4_900,
    currency: 'usd',
    occurredAt: '2026-07-10T02:01:00.000Z',
    checkoutSource: 'resume_upgrade_modal',
  };
  const checkout = await economics.recordSonaCheckoutConversion(db, checkoutInput);
  const checkoutDuplicate = await economics.recordSonaCheckoutConversion(db, {
    ...checkoutInput,
    stripeEventId: 'evt_retry_123',
  });

  assert.equal(checkout.recorded, true);
  assert.equal(checkout.afterUsefulOutcome, true);
  assert.equal(checkoutDuplicate.recorded, false);
  assert.equal(db.docs.get(summaryPath).checkoutCount, 1);
  assert.equal(db.docs.get(summaryPath).firstCheckoutInterval, 'month');
  assert.equal(db.docs.get(summaryPath).firstCheckoutSource, 'resume_upgrade_modal');

  const conversion = db.docs.get('sona_economics_events/checkout_cs_123');
  assert.equal(conversion.firstUsefulRunId, 'run-1');
  assert.equal(conversion.hoursFromFirstUseful, 2);
  assert.equal(conversion.runsBeforeConversion, 3);
  assert.equal(conversion.checkoutValueCents, 4_900);
  assert.equal(conversion.checkoutSource, 'resume_upgrade_modal');
  assert.equal('email' in conversion, false);
  assert.equal('resume' in conversion, false);
  assert.equal('userRequest' in conversion, false);

  const invoice = await economics.recordSonaPaidInvoice(db, {
    uid: 'user-1',
    stripeEventId: 'evt_invoice_123',
    invoiceId: 'in_123',
    paymentReferenceId: 'pi_123',
    plan: 'studio',
    billingInterval: 'month',
    billingReason: 'subscription_cycle',
    amountPaidCents: 4_900,
    currency: 'usd',
    occurredAt: '2026-07-17T02:01:00.000Z',
  });
  const invoiceDuplicate = await economics.recordSonaPaidInvoice(db, {
    uid: 'user-1',
    stripeEventId: 'evt_invoice_retry_123',
    invoiceId: 'in_123',
    paymentReferenceId: 'pi_123',
    plan: 'studio',
    billingInterval: 'month',
    billingReason: 'subscription_cycle',
    amountPaidCents: 4_900,
    currency: 'usd',
    occurredAt: '2026-07-17T02:01:00.000Z',
  });
  assert.equal(invoice.recorded, true);
  assert.equal(invoice.paidAfterUsefulOutcome, true);
  assert.equal(invoiceDuplicate.recorded, false);
  assert.equal(db.docs.get(summaryPath).grossCashCollectedCents, 4_900);
  assert.equal(db.docs.get(summaryPath).firstPaidPlan, 'studio');
  assert.equal(db.docs.get(summaryPath).latestPaidPlan, 'studio');
  assert.equal(db.docs.get(summaryPath).firstPaidInterval, 'month');
  assert.equal(db.docs.get(summaryPath).renewalInvoiceCount, 0);
  assert.equal(db.docs.get(summaryPath).firstRenewalAt, null);
  assert.equal(db.docs.get(summaryPath).renewalEvidenceStatus, 'complete');
  assert.equal(db.docs.get(summaryPath).renewalEvidenceVersion, economics.SONA_ACCOUNT_RENEWAL_EVIDENCE_VERSION);
  assert.equal(db.docs.get(summaryPath).renewalEvidenceHistoryTruncated, false);
  assert.equal(db.docs.get('sona_economics_payments/pi_123').plan, 'studio');
  assert.equal(db.docs.get('sona_economics_payments/pi_123').currency, 'usd');
  assert.equal(db.docs.get('sona_economics_payments/pi_123').billingInterval, 'month');
  assert.equal(db.docs.get('sona_economics_payments/pi_123').billingReason, 'subscription_cycle');
  assert.equal(db.docs.get('sona_economics_events/invoice_in_123').isRenewal, true);

  const refund = await economics.recordSonaRefund(db, {
    uid: 'user-1',
    stripeEventId: 'evt_refund_123',
    refundId: 're_123',
    paymentReferenceId: 'pi_123',
    amountRefundedCents: 900,
    currency: 'usd',
    occurredAt: '2026-07-18T02:01:00.000Z',
  });
  const refundDuplicate = await economics.recordSonaRefund(db, {
    uid: 'user-1',
    stripeEventId: 'evt_refund_retry_123',
    refundId: 're_123',
    paymentReferenceId: 'pi_123',
    amountRefundedCents: 900,
    currency: 'usd',
    occurredAt: '2026-07-18T02:01:00.000Z',
  });
  assert.equal(refund.recorded, true);
  assert.equal(refund.afterUsefulOutcome, true);
  assert.equal(refundDuplicate.recorded, false);
  assert.equal(db.docs.get(summaryPath).refundedCents, 900);
  assert.equal(db.docs.get('sona_economics_events/refund_re_123').plan, 'studio');
});

test('checkout before activation and a zero-dollar trial are not counted as paid conversion', async () => {
  const economics = await loadEconomics();
  const db = createFakeFirestore();
  const checkout = await economics.recordSonaCheckoutConversion(db, {
    uid: 'trial-user',
    stripeEventId: 'evt_trial',
    checkoutSessionId: 'cs_trial',
    plan: 'studio',
    interval: 'month',
    checkoutValueCents: 0,
    currency: 'usd',
    occurredAt: '2026-07-10T00:00:00.000Z',
  });
  await economics.recordSonaRunEconomics(db, {
    uid: 'trial-user',
    runId: 'run_after_checkout',
    tier: 'studio',
    startedAt: '2026-07-10T00:59:00.000Z',
    completedAt: '2026-07-10T01:00:00.000Z',
    terminalStatus: 'completed',
    queuedCount: 3,
    preparedCount: 1,
    actual: actualWork,
  });

  assert.equal(checkout.afterUsefulOutcome, false);
  assert.equal(db.docs.get('sona_economics_events/checkout_cs_trial').checkoutValueCents, 0);
  const account = db.docs.get('sona_economics_accounts/trial-user');
  assert.equal(account.convertedAfterUsefulOutcome, false);
  assert.equal(account.paidAfterUsefulOutcome, false);
});

test('checkout attribution follows event time and legacy missing sources stay direct', async () => {
  const economics = await loadEconomics();
  const db = createFakeFirestore();
  const base = {
    uid: 'ordered-checkout-user',
    stripeEventId: 'evt_latest',
    checkoutSessionId: 'cs_latest',
    plan: 'studio',
    interval: 'month',
    checkoutValueCents: 4_900,
    currency: 'usd',
    occurredAt: '2026-07-10T03:00:00.000Z',
    checkoutSource: 'upgrade_page',
  };
  await economics.recordSonaCheckoutConversion(db, base);
  await economics.recordSonaCheckoutConversion(db, {
    ...base,
    stripeEventId: 'evt_first',
    checkoutSessionId: 'cs_first',
    plan: 'pro',
    interval: 'year',
    occurredAt: '2026-07-10T01:00:00.000Z',
    checkoutSource: 'resume_upgrade_modal',
  });
  await economics.recordSonaCheckoutConversion(db, {
    ...base,
    stripeEventId: 'evt_middle',
    checkoutSessionId: 'cs_middle',
    occurredAt: '2026-07-10T02:00:00.000Z',
    checkoutSource: 'direct',
  });

  const ordered = db.docs.get('sona_economics_accounts/ordered-checkout-user');
  assert.equal(ordered.firstCheckoutAt, '2026-07-10T01:00:00.000Z');
  assert.equal(ordered.firstCheckoutPlan, 'pro');
  assert.equal(ordered.firstCheckoutInterval, 'year');
  assert.equal(ordered.firstCheckoutSource, 'resume_upgrade_modal');
  assert.equal(ordered.latestCheckoutAt, '2026-07-10T03:00:00.000Z');
  assert.equal(ordered.latestCheckoutPlan, 'studio');
  assert.equal(ordered.latestCheckoutSource, 'upgrade_page');

  db.docs.set('sona_economics_accounts/legacy-checkout-user', {
    uid: 'legacy-checkout-user',
    checkoutCount: 1,
    firstCheckoutAt: '2026-07-09T01:00:00.000Z',
    firstCheckoutPlan: 'pro',
    firstCheckoutInterval: 'month',
    latestCheckoutAt: '2026-07-09T01:00:00.000Z',
  });
  await economics.recordSonaCheckoutConversion(db, {
    ...base,
    uid: 'legacy-checkout-user',
    stripeEventId: 'evt_legacy_later',
    checkoutSessionId: 'cs_legacy_later',
  });
  const legacy = db.docs.get('sona_economics_accounts/legacy-checkout-user');
  assert.equal(legacy.firstCheckoutAt, '2026-07-09T01:00:00.000Z');
  assert.equal(legacy.firstCheckoutSource, 'direct');
  assert.equal(legacy.latestCheckoutSource, 'upgrade_page');
});

test('initial and renewal invoice evidence remains distinct and replay-safe', async () => {
  const economics = await loadEconomics();
  const db = createFakeFirestore();
  const initial = {
    uid: 'renewal-user',
    stripeEventId: 'evt_initial',
    invoiceId: 'in_initial',
    paymentReferenceId: 'pi_initial',
    plan: 'pro',
    billingInterval: 'month',
    billingReason: 'subscription_create',
    amountPaidCents: 1_900,
    currency: 'usd',
    occurredAt: '2026-06-01T12:00:00.000Z',
  };
  const renewal = {
    ...initial,
    stripeEventId: 'evt_renewal',
    invoiceId: 'in_renewal',
    paymentReferenceId: 'pi_renewal',
    billingInterval: 'year',
    billingReason: 'subscription_cycle',
    occurredAt: '2026-07-01T12:00:00.000Z',
  };

  await economics.recordSonaPaidInvoice(db, renewal);
  await economics.recordSonaPaidInvoice(db, initial);
  await economics.recordSonaPaidInvoice(db, { ...renewal, stripeEventId: 'evt_renewal_replay' });

  const summary = db.docs.get('sona_economics_accounts/renewal-user');
  assert.equal(summary.paidInvoiceCount, 2);
  assert.equal(summary.renewalInvoiceCount, 1);
  assert.equal(summary.firstPaidInterval, 'month');
  assert.equal(summary.latestPaidInterval, 'year');
  assert.equal(summary.firstRenewalAt, '2026-07-01T12:00:00.000Z');
  assert.equal(summary.latestRenewalAt, '2026-07-01T12:00:00.000Z');
  assert.equal(db.docs.get('sona_economics_events/invoice_in_initial').isRenewal, false);
  assert.equal(db.docs.get('sona_economics_events/invoice_in_renewal').isRenewal, true);
});

test('webhook renewal evidence stays incomplete when prior history is unverified', async () => {
  const economics = await loadEconomics();
  const db = createFakeFirestore();
  db.docs.set('sona_economics_accounts/mixed-history-user', {
    uid: 'mixed-history-user',
    paidInvoiceCount: 1,
    invoicePayments: [{
      invoiceId: 'in_legacy',
      paymentReferenceId: 'pi_legacy',
      plan: 'pro',
      currency: 'usd',
      billingInterval: 'month',
      billingReason: 'subscription_create',
      amountPaidCents: 1_900,
      occurredAt: '2026-06-01T12:00:00.000Z',
      paidAfterUsefulOutcome: false,
    }],
  });

  await economics.recordSonaPaidInvoice(db, {
    uid: 'mixed-history-user',
    stripeEventId: 'evt_verified_renewal',
    invoiceId: 'in_verified_renewal',
    paymentReferenceId: 'pi_verified_renewal',
    plan: 'pro',
    billingInterval: 'month',
    billingReason: 'subscription_cycle',
    amountPaidCents: 1_900,
    currency: 'usd',
    occurredAt: '2026-07-01T12:00:00.000Z',
  });

  const summary = db.docs.get('sona_economics_accounts/mixed-history-user');
  assert.equal(summary.paidInvoiceCount, 2);
  assert.equal(summary.renewalEvidenceStatus, 'incomplete');
  assert.equal(summary.renewalEvidenceMissingInvoiceCount, 1);
  assert.deepEqual(summary.renewalEvidenceMissingInvoiceIds, ['in_legacy']);
});

test('non-USD or legacy currency evidence is excluded from aggregate USD cash', async () => {
  const economics = await loadEconomics();
  const db = createFakeFirestore();
  await economics.recordSonaRunEconomics(db, {
    uid: 'eur-user',
    runId: 'run-eur-user',
    tier: 'pro',
    startedAt: '2026-07-10T09:59:00.000Z',
    completedAt: '2026-07-10T10:00:00.000Z',
    terminalStatus: 'completed',
    queuedCount: 3,
    preparedCount: 0,
    actual: actualWork,
  });
  await economics.recordSonaPaidInvoice(db, {
    uid: 'eur-user',
    stripeEventId: 'evt_eur_invoice',
    invoiceId: 'in_eur',
    paymentReferenceId: 'pi_eur',
    plan: 'pro',
    amountPaidCents: 499,
    currency: 'eur',
    occurredAt: '2026-07-10T11:00:00.000Z',
  });

  const account = db.docs.get('sona_economics_accounts/eur-user');
  const snapshot = economics.summarizeSonaEconomicsEvents([], { accountSummaries: [account] });
  assert.equal(account.grossCashAfterUsefulCents, 0);
  assert.equal(account.unsupportedCurrencyEvents, 1);
  assert.equal(snapshot.grossCashCollectedUsd, 0);
  assert.equal(snapshot.netCashObservedUsd, 0);
  assert.equal(snapshot.unsupportedCurrencyEventsObserved, 1);
});

test('legacy summary data cannot erase verified payment plan evidence', async () => {
  const economics = await loadEconomics();
  const db = createFakeFirestore();
  db.docs.set('sona_economics_accounts/preserved-user', {
    uid: 'preserved-user',
    invoicePayments: [{
      invoiceId: 'in_preserved',
      paymentReferenceId: 'pi_preserved',
      amountPaidCents: 999,
      occurredAt: '2026-07-10T09:00:00.000Z',
      paidAfterUsefulOutcome: false,
    }],
  });
  db.docs.set('sona_economics_payments/pi_preserved', {
    paymentReferenceId: 'pi_preserved',
    uid: 'preserved-user',
    invoiceId: 'in_preserved',
    plan: 'studio',
    currency: 'usd',
  });

  await economics.recordSonaRunEconomics(db, {
    uid: 'preserved-user',
    runId: 'run-preserved-user',
    tier: 'studio',
    startedAt: '2026-07-10T09:59:00.000Z',
    completedAt: '2026-07-10T10:00:00.000Z',
    terminalStatus: 'completed',
    queuedCount: 3,
    preparedCount: 0,
    actual: actualWork,
  });

  const payment = db.docs.get('sona_economics_payments/pi_preserved');
  assert.equal(payment.plan, 'studio');
  assert.equal(payment.currency, 'usd');
  assert.equal(payment.evidenceStatus, undefined);
  assert.equal(payment.evidenceVersion, undefined);

  const preservedSummary = db.docs.get('sona_economics_accounts/preserved-user');
  db.docs.set('sona_economics_accounts/preserved-user', {
    ...preservedSummary,
    invoicePayments: [{
      invoiceId: 'in_preserved',
      paymentReferenceId: 'pi_preserved',
      plan: 'pro',
      currency: 'eur',
      billingInterval: 'year',
      billingReason: 'subscription_cycle',
      amountPaidCents: 999,
      occurredAt: '2030-07-10T09:00:00.000Z',
      paidAfterUsefulOutcome: false,
    }, {
      invoiceId: 'in_delayed_verified',
      paymentReferenceId: 'pi_delayed_verified',
      plan: 'pro',
      currency: 'usd',
      billingInterval: 'month',
      billingReason: 'subscription_create',
      amountPaidCents: 0,
      occurredAt: '2026-07-10T09:00:00.000Z',
      paidAfterUsefulOutcome: false,
    }],
  });
  db.docs.set('sona_economics_payments/pi_preserved', {
    ...payment,
    plan: 'studio',
    currency: 'usd',
    billingInterval: 'month',
    billingReason: 'subscription_create',
    amountPaidCents: 999,
    occurredAt: '2026-07-10T09:00:00.000Z',
    evidenceStatus: 'verified',
    evidenceVersion: economics.SONA_ECONOMICS_VERSION,
    evidenceSource: 'stripe_webhook',
  });
  db.docs.set('sona_economics_payments/pi_delayed_verified', {
    paymentReferenceId: 'pi_delayed_verified',
    uid: 'preserved-user',
    invoiceId: 'in_delayed_verified',
    plan: 'pro',
    currency: 'usd',
    billingInterval: 'month',
    billingReason: 'subscription_create',
    amountPaidCents: 999,
    occurredAt: '2026-07-10T10:30:00.000Z',
    paidAfterUsefulOutcome: false,
    evidenceStatus: 'verified',
    evidenceVersion: economics.SONA_ECONOMICS_VERSION,
    evidenceSource: 'stripe_webhook',
  });

  await economics.recordSonaRunEconomics(db, {
    uid: 'preserved-user',
    runId: 'run-preserved-user-second',
    tier: 'studio',
    startedAt: '2026-07-10T10:59:00.000Z',
    completedAt: '2026-07-10T11:00:00.000Z',
    terminalStatus: 'completed',
    queuedCount: 3,
    preparedCount: 0,
    actual: actualWork,
  });

  const verifiedPayment = db.docs.get('sona_economics_payments/pi_preserved');
  assert.equal(verifiedPayment.plan, 'studio');
  assert.equal(verifiedPayment.currency, 'usd');
  assert.equal(verifiedPayment.billingInterval, 'month');
  assert.equal(verifiedPayment.billingReason, 'subscription_create');
  assert.equal(verifiedPayment.amountPaidCents, 999);
  assert.equal(verifiedPayment.occurredAt, '2026-07-10T09:00:00.000Z');
  assert.equal(verifiedPayment.evidenceStatus, 'verified');
  assert.equal(verifiedPayment.evidenceVersion, economics.SONA_ECONOMICS_VERSION);
  assert.equal(verifiedPayment.evidenceSource, 'stripe_webhook');
  assert.equal(verifiedPayment.paidAfterUsefulOutcome, undefined);
  assert.equal(
    db.docs.get('sona_economics_payments/pi_delayed_verified').paidAfterUsefulOutcome,
    true,
  );
});

test('delayed activation recovery reconciles later checkout and paid timestamps', async () => {
  const economics = await loadEconomics();
  const db = createFakeFirestore();
  await economics.recordSonaCheckoutConversion(db, {
    uid: 'delayed-user',
    stripeEventId: 'evt_delayed_checkout',
    checkoutSessionId: 'cs_delayed',
    plan: 'studio',
    interval: 'month',
    checkoutValueCents: 0,
    currency: 'usd',
    occurredAt: '2026-07-10T11:00:00.000Z',
  });
  await economics.recordSonaPaidInvoice(db, {
    uid: 'delayed-user',
    stripeEventId: 'evt_delayed_invoice',
    invoiceId: 'in_delayed',
    paymentReferenceId: 'pi_delayed',
    plan: 'studio',
    amountPaidCents: 4_900,
    currency: 'usd',
    occurredAt: '2026-07-10T12:00:00.000Z',
  });
  await economics.recordSonaRunEconomics(db, {
    uid: 'delayed-user',
    runId: 'run_delayed_processing',
    tier: 'studio',
    startedAt: '2026-07-10T09:59:00.000Z',
    completedAt: '2026-07-10T10:00:00.000Z',
    terminalStatus: 'completed',
    queuedCount: 3,
    preparedCount: 1,
    actual: actualWork,
  });

  const account = db.docs.get('sona_economics_accounts/delayed-user');
  assert.equal(account.convertedAfterUsefulOutcome, true);
  assert.equal(account.paidAfterUsefulOutcome, true);
  assert.equal(account.grossCashAfterUsefulCents, 4_900);
  assert.equal(db.docs.get('sona_economics_payments/pi_delayed').paidAfterUsefulOutcome, true);

  const delayedRefund = await economics.recordSonaRefund(db, {
    uid: 'delayed-user',
    stripeEventId: 'evt_delayed_refund',
    refundId: 're_delayed',
    paymentReferenceId: 'pi_delayed',
    amountRefundedCents: 900,
    currency: 'usd',
    occurredAt: '2026-07-10T13:00:00.000Z',
  });
  assert.equal(delayedRefund.afterUsefulOutcome, true);
  assert.equal(db.docs.get('sona_economics_accounts/delayed-user').netCashAfterUsefulCents, 4_000);
  assert.equal(db.docs.get('sona_economics_events/refund_re_delayed').plan, 'studio');
});

test('a post-activation refund inherits its original pre-activation payment attribution', async () => {
  const economics = await loadEconomics();
  const db = createFakeFirestore();
  await economics.recordSonaPaidInvoice(db, {
    uid: 'old-payment-user',
    stripeEventId: 'evt_old_invoice',
    invoiceId: 'in_old',
    paymentReferenceId: 'pi_old',
    plan: 'pro',
    amountPaidCents: 1_900,
    currency: 'usd',
    occurredAt: '2026-07-10T09:00:00.000Z',
  });
  await economics.recordSonaRunEconomics(db, {
    uid: 'old-payment-user',
    runId: 'run_after_old_payment',
    tier: 'pro',
    startedAt: '2026-07-10T09:59:00.000Z',
    completedAt: '2026-07-10T10:00:00.000Z',
    terminalStatus: 'completed',
    queuedCount: 3,
    preparedCount: 0,
    actual: actualWork,
  });
  const refund = await economics.recordSonaRefund(db, {
    uid: 'old-payment-user',
    stripeEventId: 'evt_old_refund',
    refundId: 're_old',
    paymentReferenceId: 'pi_old',
    amountRefundedCents: 1_900,
    currency: 'usd',
    occurredAt: '2026-07-10T11:00:00.000Z',
  });

  assert.equal(refund.afterUsefulOutcome, false);
  const refundEvent = db.docs.get('sona_economics_events/refund_re_old');
  assert.equal(refundEvent.attributionStatus, 'linked');
  assert.equal(refundEvent.linkedInvoiceId, 'in_old');
  const oldPaymentAccount = db.docs.get('sona_economics_accounts/old-payment-user');
  assert.equal(oldPaymentAccount.grossCashAfterUsefulCents, 0);
  assert.equal(oldPaymentAccount.refundsAfterUsefulCents, 0);
});

test('economics summary joins useful output, cost and checkout value without calling it revenue', async () => {
  const economics = await loadEconomics();
  const snapshot = economics.summarizeSonaEconomicsEvents([
    {
      eventId: 'run-1', eventType: 'sona_run_completed', uid: 'user-1',
      occurredAt: '2026-07-10T00:01:00.000Z', economicsVersion: economics.SONA_ECONOMICS_VERSION,
      usefulOutcome: 'ranked_picks', estimatedCostMicros: 10_900, preparedCount: 0,
      actual: { rankedRoles: 3 },
    },
    {
      eventId: 'run-2', eventType: 'sona_run_completed', uid: 'user-2',
      occurredAt: '2026-07-10T00:02:00.000Z', economicsVersion: economics.SONA_ECONOMICS_VERSION,
      usefulOutcome: null, estimatedCostMicros: 1_500, preparedCount: 0,
      actual: { rankedRoles: 0 },
    },
    {
      eventId: 'checkout_evt_123', eventType: 'checkout_completed', uid: 'user-1',
      occurredAt: '2026-07-10T02:01:00.000Z', economicsVersion: economics.SONA_ECONOMICS_VERSION,
      afterUsefulOutcome: true, checkoutValueCents: 4_900,
    },
    {
      eventId: 'invoice_evt_invoice_123', eventType: 'invoice_paid', uid: 'user-1',
      occurredAt: '2026-07-17T02:01:00.000Z', economicsVersion: economics.SONA_ECONOMICS_VERSION,
      paidAfterUsefulOutcome: true, amountPaidCents: 4_900, paymentReferenceId: 'pi_123',
    },
    {
      eventId: 'refund_re_123', eventType: 'refund_succeeded', uid: 'user-1',
      occurredAt: '2026-07-18T02:01:00.000Z', economicsVersion: economics.SONA_ECONOMICS_VERSION,
      amountRefundedCents: 900, afterUsefulOutcome: true, attributionStatus: 'linked', paymentReferenceId: 'pi_123',
    },
    {
      eventId: 'refund_re_unlinked', eventType: 'refund_succeeded', uid: 'user-1',
      occurredAt: '2026-07-18T03:01:00.000Z', economicsVersion: economics.SONA_ECONOMICS_VERSION,
      amountRefundedCents: 500, afterUsefulOutcome: false, attributionStatus: 'unlinked',
    },
  ], {
    windowDays: 30,
    sampleLimit: 1_000,
    accountSummaries: [{
      uid: 'user-1',
      firstUsefulAt: '2026-07-10T00:01:00.000Z',
      convertedAfterUsefulOutcome: true,
      paidAfterUsefulOutcome: true,
      grossCashAfterUsefulCents: 4_900,
      refundsAfterUsefulCents: 900,
      unlinkedRefunds: 1,
    }, {
      uid: 'user-2',
      firstUsefulAt: '2026-07-10T00:02:00.000Z',
      convertedAfterUsefulOutcome: false,
      paidAfterUsefulOutcome: false,
    }],
  });

  assert.equal(snapshot.runsObserved, 2);
  assert.equal(snapshot.usefulRunsObserved, 1);
  assert.equal(snapshot.usefulRunRate, 50);
  assert.equal(snapshot.activationToCheckoutRate, 50);
  assert.equal(snapshot.activationToPaidRate, 50);
  assert.equal(snapshot.estimatedCostUsd, 0.0124);
  assert.equal(snapshot.estimatedCostPerUsefulOutputUsd, 0.0124);
  assert.equal(snapshot.checkoutValueUsd, 49);
  assert.equal(snapshot.grossCashCollectedUsd, 49);
  assert.equal(snapshot.refundedUsd, 9);
  assert.equal(snapshot.netCashObservedUsd, 40);
  assert.equal(snapshot.unlinkedRefundsObserved, 1);
  assert.equal(snapshot.unsupportedCurrencyEventsObserved, 0);
  assert.equal(snapshot.rankedRoles, 3);
});

test('paid retention requires a mature per-plan cohort and a useful day 7-14 return', async () => {
  const economics = await loadEconomics();
  const accounts = [];
  const events = [];
  for (const plan of ['pro', 'studio']) {
    for (let index = 0; index < 10; index += 1) {
      const uid = `${plan}-retention-${index}`;
      accounts.push({
        uid,
        firstPaidAt: '2026-07-15T12:00:00.000Z',
        firstPaidPlan: plan,
      });
      if (index < 2) {
        events.push({
          eventId: `return-${uid}`,
          eventType: 'sona_run_completed',
          uid,
          occurredAt: '2026-07-23T12:00:00.000Z',
          economicsVersion: economics.SONA_ECONOMICS_VERSION,
          terminalStatus: 'completed',
          usefulOutcome: 'ranked_picks',
        });
      }
    }
  }
  events.push({
    eventId: 'too-early',
    eventType: 'sona_run_completed',
    uid: 'pro-retention-2',
    occurredAt: '2026-07-21T12:00:00.000Z',
    economicsVersion: economics.SONA_ECONOMICS_VERSION,
    terminalStatus: 'completed',
    usefulOutcome: 'ranked_picks',
  }, {
    eventId: 'too-late',
    eventType: 'sona_run_completed',
    uid: 'studio-retention-2',
    occurredAt: '2026-07-30T12:00:00.000Z',
    economicsVersion: economics.SONA_ECONOMICS_VERSION,
    terminalStatus: 'completed',
    usefulOutcome: 'ranked_picks',
  });

  const result = economics.summarizeSonaPaidCohortRetention(events, accounts, {
    now: '2026-07-31T12:00:00.000Z',
  });

  assert.equal(result.status, 'pass');
  assert.equal(result.readyForPricingDecision, true);
  assert.equal(result.matureAccountsObserved, 20);
  assert.equal(result.returnedAccountsObserved, 4);
  assert.equal(result.plans.find(plan => plan.plan === 'pro').returnRatePercent, 20);
  assert.equal(result.plans.find(plan => plan.plan === 'studio').returnRatePercent, 20);
  assert.match(result.scope, /not subscription renewal or product-wide retention/);
});

test('paid renewal cohorts compare monthly and annual evidence by plan', async () => {
  const economics = await loadEconomics();
  const accounts = [];
  const paymentRecords = [];
  for (const plan of ['pro', 'studio']) {
    for (const interval of ['month', 'year']) {
      for (let index = 0; index < 10; index += 1) {
        const renewed = index < 6;
        accounts.push({
          uid: `${plan}-${interval}-renewal-${index}`,
          firstPaidAt: interval === 'year'
            ? '2025-06-20T12:00:00.000Z'
            : '2026-05-01T12:00:00.000Z',
          firstPaidPlan: plan,
          firstPaidInterval: interval,
          latestPaidAt: renewed
            ? interval === 'year'
              ? '2026-06-20T12:00:00.000Z'
              : '2026-06-01T12:00:00.000Z'
            : interval === 'year'
              ? '2025-06-20T12:00:00.000Z'
              : '2026-05-01T12:00:00.000Z',
          latestPaidPlan: plan,
          latestPaidInterval: interval,
          paidInvoiceCount: renewed ? 2 : 1,
          renewalInvoiceCount: renewed ? 1 : 0,
          firstRenewalAt: renewed
            ? interval === 'year'
              ? '2026-06-20T12:00:00.000Z'
              : '2026-06-01T12:00:00.000Z'
            : null,
          latestRenewalAt: renewed
            ? interval === 'year'
              ? '2026-06-20T12:00:00.000Z'
              : '2026-06-01T12:00:00.000Z'
            : null,
          renewalEvidenceStatus: 'complete',
          renewalEvidenceVersion: economics.SONA_ACCOUNT_RENEWAL_EVIDENCE_VERSION,
          renewalEvidenceMissingInvoiceCount: 0,
          renewalEvidenceMissingInvoiceIds: [],
          renewalEvidenceHistoryTruncated: false,
          renewalEvidenceUpdatedAt: '2026-07-01T12:00:00.000Z',
        });
        paymentRecords.push({
          uid: `${plan}-${interval}-renewal-${index}`,
          invoiceId: `in_${plan}_${interval}_${index}`,
          paymentReferenceId: `pi_${plan}_${interval}_${index}`,
          plan,
          currency: 'usd',
          billingInterval: interval,
          billingReason: 'subscription_create',
          amountPaidCents: 1_900,
          occurredAt: interval === 'year'
            ? '2025-06-20T12:00:00.000Z'
            : '2026-05-01T12:00:00.000Z',
          evidenceStatus: 'verified',
          evidenceVersion: economics.SONA_ECONOMICS_VERSION,
          evidenceSource: 'stripe_webhook',
        });
        if (renewed) {
          paymentRecords.push({
            uid: `${plan}-${interval}-renewal-${index}`,
            invoiceId: `in_${plan}_${interval}_${index}_renewal`,
            paymentReferenceId: `pi_${plan}_${interval}_${index}_renewal`,
            plan,
            currency: 'usd',
            billingInterval: interval,
            billingReason: 'subscription_cycle',
            amountPaidCents: 1_900,
            occurredAt: interval === 'year'
              ? '2026-06-20T12:00:00.000Z'
              : '2026-06-01T12:00:00.000Z',
            evidenceStatus: 'verified',
            evidenceVersion: economics.SONA_ECONOMICS_VERSION,
            evidenceSource: 'stripe_webhook',
          });
        }
      }
    }
  }

  const result = economics.summarizeSonaPaidRenewalCohorts(accounts, {
    now: '2026-07-10T12:00:00.000Z',
    paymentRecords,
    invoiceRecords: paymentRecords.map(payment => ({ ...payment, eventType: 'invoice_paid' })),
    includeAccountEvidenceRows: true,
  });

  assert.equal(result.status, 'pass');
  assert.equal(result.evidenceComplete, true);
  assert.equal(result.readyForHumanReview, true);
  assert.equal(result.populationAccountsObserved, 40);
  assert.equal(result.reconciledAccountsObserved, 40);
  assert.equal(result.unreconciledPopulationAccounts, 0);
  assert.equal(result.evidenceCoveragePercent, 100);
  assert.equal(result.unresolvedSignalCount, 0);
  assert.equal(result.coverageMetricsPartial, false);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.accountEvidenceRows.length, 40);
  assert.equal(result.accountEvidenceRows.every(row => row.status === 'reconciled'), true);
  assert.equal(result.accountEvidenceRows.every(row => row.blockerCodes.length === 0), true);
  assert.equal(result.accountEvidenceRows.every(row => row.accountSummaryPresent), true);
  assert.equal(result.matureAccountsObserved, 40);
  assert.equal(result.renewedAccountsObserved, 24);
  assert.equal(result.segments.length, 4);
  result.segments.forEach(segment => {
    assert.equal(segment.eligibleAccounts, 10);
    assert.equal(segment.renewedAccounts, 6);
    assert.equal(segment.renewalRatePercent, 60);
    assert.equal(segment.status, 'pass');
  });
  assert.match(result.scope, /not recognized revenue, cancellation retention or an automatic pricing decision/);
  assert.equal(result.noAutomaticPricingChange, true);

  const renewalExport = await loadRenewalEvidenceExport();
  const reviewPacket = renewalExport.buildSonaRenewalPricingReviewPacket({
    fullPopulation: true,
    snapshotConsistent: true,
    evidenceFingerprint: 'complete-evidence-fingerprint',
    reconciliation: result,
  });
  assert.equal(reviewPacket.status, 'ready');
  assert.equal(reviewPacket.outcome, 'pass');
  assert.equal(reviewPacket.readyForHumanReview, true);
  assert.equal(reviewPacket.requiresHumanApproval, true);
  assert.equal(reviewPacket.priceChangeAuthorized, false);
  assert.equal(reviewPacket.totalPricingDecisionAuthorized, false);
  assert.match(reviewPacket.scope, /Renewal evidence only/);
  assert.equal(reviewPacket.noAutomaticPricingChange, true);
  const watchPacket = renewalExport.buildSonaRenewalPricingReviewPacket({
    fullPopulation: true,
    snapshotConsistent: true,
    evidenceFingerprint: 'watch-evidence-fingerprint',
    reconciliation: {
      ...result,
      segments: result.segments.map((segment, index) => index === 0
        ? { ...segment, renewedAccounts: 5, renewalRatePercent: 50, status: 'watch' }
        : segment),
    },
  });
  assert.equal(watchPacket.status, 'ready');
  assert.equal(watchPacket.outcome, 'watch');
  assert.equal(watchPacket.priceChangeAuthorized, false);
  const combinedPass = renewalExport.buildSonaCombinedPricingMemo({
    evidenceFingerprint: 'complete-evidence-fingerprint',
    renewalPacket: reviewPacket,
    observedMargin: { status: 'pass', evidenceComplete: true, sampleCapped: false, plans: [] },
    usefulReturn: { status: 'pass', evidenceComplete: true, sampleCapped: false, plans: [] },
  });
  assert.equal(combinedPass.status, 'ready');
  assert.equal(combinedPass.outcome, 'pass');
  assert.equal(combinedPass.readyForHumanReview, true);
  assert.equal(combinedPass.requiresHumanApproval, true);
  assert.equal(combinedPass.priceChangeAuthorized, false);
  assert.equal(combinedPass.entitlementChangeAuthorized, false);
  const combinedWatch = renewalExport.buildSonaCombinedPricingMemo({
    evidenceFingerprint: 'watch-evidence-fingerprint',
    renewalPacket: watchPacket,
    observedMargin: { status: 'pass', evidenceComplete: true, sampleCapped: false, plans: [] },
    usefulReturn: { status: 'pass', evidenceComplete: true, sampleCapped: false, plans: [] },
  });
  assert.equal(combinedWatch.status, 'ready');
  assert.equal(combinedWatch.outcome, 'watch');
  const combinedCollecting = renewalExport.buildSonaCombinedPricingMemo({
    evidenceFingerprint: 'complete-evidence-fingerprint',
    renewalPacket: { ...reviewPacket, status: 'collecting', outcome: null, readyForHumanReview: false },
    observedMargin: { status: 'pass', evidenceComplete: true, sampleCapped: false, plans: [] },
    usefulReturn: { status: 'pass', evidenceComplete: true, sampleCapped: false, plans: [] },
  });
  assert.equal(combinedCollecting.status, 'collecting');
  assert.equal(combinedCollecting.outcome, null);
  const combinedIncomplete = renewalExport.buildSonaCombinedPricingMemo({
    evidenceFingerprint: 'complete-evidence-fingerprint',
    renewalPacket: reviewPacket,
    observedMargin: { status: 'pass', evidenceComplete: false, sampleCapped: false, plans: [] },
    usefulReturn: { status: 'pass', evidenceComplete: true, sampleCapped: false, plans: [] },
  });
  assert.equal(combinedIncomplete.status, 'blocked');
  assert.equal(combinedIncomplete.blockers.includes('margin_evidence'), true);
});

test('paid renewal cohorts exclude unresolved evidence and fail closed', async () => {
  const economics = await loadEconomics();
  const complete = {
    uid: 'complete-monthly',
    firstPaidAt: '2026-05-01T12:00:00.000Z',
    firstPaidPlan: 'pro',
    firstPaidInterval: 'month',
    latestPaidAt: '2026-06-01T12:00:00.000Z',
    latestPaidPlan: 'pro',
    latestPaidInterval: 'month',
    paidInvoiceCount: 2,
    renewalInvoiceCount: 1,
    firstRenewalAt: '2026-06-01T12:00:00.000Z',
    latestRenewalAt: '2026-06-01T12:00:00.000Z',
    renewalEvidenceStatus: 'complete',
    renewalEvidenceVersion: economics.SONA_ACCOUNT_RENEWAL_EVIDENCE_VERSION,
    renewalEvidenceMissingInvoiceCount: 0,
    renewalEvidenceMissingInvoiceIds: [],
    renewalEvidenceHistoryTruncated: false,
    renewalEvidenceUpdatedAt: '2026-07-01T12:00:00.000Z',
  };
  const paymentFor = (uid, billingReason = 'subscription_create') => ({
    uid,
    invoiceId: `in_${uid}`,
    paymentReferenceId: `pi_${uid}`,
    plan: 'pro',
    currency: 'usd',
    billingInterval: 'month',
    billingReason,
    amountPaidCents: 1_900,
    occurredAt: '2026-05-01T12:00:00.000Z',
    evidenceStatus: 'verified',
    evidenceVersion: economics.SONA_ECONOMICS_VERSION,
    evidenceSource: 'stripe_webhook',
  });
  const renewalPaymentFor = (uid, occurredAt = '2026-06-01T12:00:00.000Z') => ({
    ...paymentFor(uid),
    invoiceId: `in_${uid}_renewal`,
    paymentReferenceId: `pi_${uid}_renewal`,
    billingReason: 'subscription_cycle',
    occurredAt,
  });
  const populationUids = [
    'complete-monthly',
    'incomplete-monthly',
    'stale-version',
    'missing-contract',
    'invalid-renewal-date',
    'left-censored',
    'missing-summary',
  ];
  const populationPaymentRecords = populationUids.flatMap(uid => {
    if (uid === 'left-censored') return [paymentFor(uid, 'subscription_cycle')];
    return [
      paymentFor(uid),
      renewalPaymentFor(uid, uid === 'invalid-renewal-date'
        ? '2026-05-05T12:00:00.000Z'
        : '2026-06-01T12:00:00.000Z'),
      ];
  });
  const missingPaymentEvent = {
    ...paymentFor('missing-payment-document'),
    invoiceId: 'in_missing_payment_document',
    paymentReferenceId: null,
    eventType: 'invoice_paid',
  };
  const ownerConflictEvent = {
    ...populationPaymentRecords[0],
    uid: 'invoice-owner-conflict',
    eventType: 'invoice_paid',
  };
  const result = economics.summarizeSonaPaidRenewalCohorts([
    complete,
    { ...complete, uid: 'incomplete-monthly', renewalEvidenceStatus: 'incomplete' },
    { ...complete, uid: 'stale-version', renewalEvidenceVersion: 'legacy-renewal-version' },
    { ...complete, uid: 'missing-contract', renewalEvidenceMissingInvoiceIds: undefined },
    {
      ...complete,
      uid: 'invalid-renewal-date',
      firstRenewalAt: '2026-05-05T12:00:00.000Z',
      latestRenewalAt: '2026-05-05T12:00:00.000Z',
      latestPaidAt: '2026-05-05T12:00:00.000Z',
    },
    {
      ...complete,
      uid: 'left-censored',
      paidInvoiceCount: 1,
      renewalInvoiceCount: 0,
      firstRenewalAt: null,
      latestRenewalAt: null,
      latestPaidAt: '2026-05-01T12:00:00.000Z',
    },
    {
      ...complete,
      uid: 'missing-payment-document',
      paidInvoiceCount: 1,
      renewalInvoiceCount: 0,
      firstRenewalAt: null,
      latestRenewalAt: null,
    },
    {
      ...complete,
      uid: 'summary-only-history',
      paidInvoiceCount: 1,
      renewalInvoiceCount: 0,
      firstRenewalAt: null,
      latestRenewalAt: null,
    },
    { ...complete },
  ], {
    now: '2026-07-10T12:00:00.000Z',
    minMatureAccountsPerSegment: 1,
    includeAccountEvidenceRows: true,
    paymentRecords: populationPaymentRecords,
    invoiceRecords: [
      ...populationPaymentRecords.map(payment => ({ ...payment, eventType: 'invoice_paid' })),
      missingPaymentEvent,
      ownerConflictEvent,
    ],
  });
  const cappedPaymentRecords = [paymentFor(complete.uid), renewalPaymentFor(complete.uid)];
  const capped = economics.summarizeSonaPaidRenewalCohorts([complete], {
    now: '2026-07-10T12:00:00.000Z',
    minMatureAccountsPerSegment: 1,
    sampleCapped: true,
    paymentRecords: cappedPaymentRecords,
    invoiceRecords: cappedPaymentRecords.map(payment => ({ ...payment, eventType: 'invoice_paid' })),
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.readyForHumanReview, false);
  assert.equal(result.unresolved.evidenceAccounts, 3);
  assert.equal(result.unresolved.renewalDateAccounts, 1);
  assert.equal(result.unresolved.duplicateAccounts, 1);
  assert.equal(result.unresolved.populationAccounts, 4);
  assert.equal(result.unresolved.invoiceRecords, 3);
  assert.equal(result.populationAccountsObserved, 10);
  assert.equal(result.reconciledAccountsObserved, 1);
  assert.equal(result.unreconciledPopulationAccounts, 9);
  assert.equal(result.evidenceCoveragePercent, 10);
  assert.equal(result.unresolvedSignalCount, 12);
  assert.equal(result.blockers.find(blocker => blocker.code === 'population_gap').count, 4);
  assert.equal(result.blockers.find(blocker => blocker.code === 'invoice_cross_link').count, 3);
  assert.equal(result.accountEvidenceRows.length, 10);
  assert.equal(
    result.accountEvidenceRows.filter(row => row.status === 'reconciled').length,
    result.reconciledAccountsObserved,
  );
  assert.equal(
    result.accountEvidenceRows.every(row => row.status === 'blocked' || row.blockerCodes.length === 0),
    true,
  );
  assert.equal(
    result.accountEvidenceRows.find(row => row.uid === 'incomplete-monthly').blockerCodes.includes('account_evidence'),
    true,
  );
  assert.equal(
    result.accountEvidenceRows.find(row => row.uid === 'missing-summary').blockerCodes.includes('population_gap'),
    true,
  );
  assert.equal(result.segments.reduce((sum, segment) => sum + segment.cohortAccountsObserved, 0), 3);
  assert.equal(capped.status, 'blocked');
  assert.equal(capped.sampleCapped, true);
  assert.equal(capped.coverageMetricsPartial, true);
  assert.equal(capped.blockers[0].code, 'sample_cap');
  assert.equal(capped.blockers[0].count, null);
  assert.equal(capped.populationAccountsObserved, null);
  assert.equal(capped.reconciledAccountsObserved, null);
  assert.equal(capped.unresolvedSignalCount, null);
  assert.equal(capped.unassignedSignalCount, null);
});

test('renewal coverage uses recent activity and ignores old-only defects', async () => {
  const economics = await loadEconomics();
  const currentUid = 'long-standing-current-renewal';
  const oldUid = 'old-only-defect';
  const currentPayments = [{
    uid: currentUid,
    invoiceId: 'in_long_initial',
    paymentReferenceId: 'pi_long_initial',
    plan: 'pro',
    currency: 'usd',
    billingInterval: 'year',
    billingReason: 'subscription_create',
    amountPaidCents: 19_000,
    occurredAt: '2024-06-01T12:00:00.000Z',
    evidenceStatus: 'verified',
    evidenceVersion: economics.SONA_ECONOMICS_VERSION,
    evidenceSource: 'stripe_webhook',
  }, {
    uid: currentUid,
    invoiceId: 'in_long_renewal',
    paymentReferenceId: 'pi_long_renewal',
    plan: 'pro',
    currency: 'usd',
    billingInterval: 'year',
    billingReason: 'subscription_cycle',
    amountPaidCents: 19_000,
    occurredAt: '2026-06-01T12:00:00.000Z',
    evidenceStatus: 'verified',
    evidenceVersion: economics.SONA_ECONOMICS_VERSION,
    evidenceSource: 'stripe_webhook',
  }];
  const result = economics.summarizeSonaPaidRenewalCohorts([{
    uid: currentUid,
    firstPaidAt: '2024-06-01T12:00:00.000Z',
    latestPaidAt: '2026-06-01T12:00:00.000Z',
    latestRenewalAt: '2026-06-01T12:00:00.000Z',
    latestPaidPlan: 'pro',
    latestPaidInterval: 'year',
    firstPaidPlan: 'pro',
    firstPaidInterval: 'year',
    paidInvoiceCount: 2,
    renewalInvoiceCount: 1,
    firstRenewalAt: '2026-06-01T12:00:00.000Z',
    renewalEvidenceStatus: 'complete',
    renewalEvidenceVersion: economics.SONA_ACCOUNT_RENEWAL_EVIDENCE_VERSION,
    renewalEvidenceMissingInvoiceCount: 0,
    renewalEvidenceMissingInvoiceIds: [],
    renewalEvidenceHistoryTruncated: false,
    renewalEvidenceUpdatedAt: '2026-06-01T12:00:00.000Z',
  }, {
    uid: oldUid,
    firstPaidAt: '2024-01-01T12:00:00.000Z',
    latestPaidAt: '2024-01-01T12:00:00.000Z',
    paidInvoiceCount: 1,
  }], {
    now: '2026-07-10T12:00:00.000Z',
    paymentRecords: [
      ...currentPayments,
      {
        uid: oldUid,
        invoiceId: 'in_old_defect',
        paymentReferenceId: 'pi_old_defect',
        amountPaidCents: 1_900,
        occurredAt: '2024-01-01T12:00:00.000Z',
      },
    ],
    invoiceRecords: currentPayments.map(payment => ({ ...payment, eventType: 'invoice_paid' })),
  });

  assert.equal(result.evidenceComplete, true);
  assert.equal(result.populationAccountsObserved, 1);
  assert.equal(result.reconciledAccountsObserved, 1);
  assert.equal(result.evidenceCoveragePercent, 100);
  assert.equal(result.unresolvedSignalCount, 0);
  assert.equal(result.matureAccountsObserved, 0);
});

test('renewal evidence rejects duplicate invoice event identities', async () => {
  const economics = await loadEconomics();
  const uid = 'duplicate-invoice-user';
  const payment = {
    uid,
    invoiceId: 'in_duplicate_event',
    paymentReferenceId: 'pi_duplicate_event',
    plan: 'pro',
    currency: 'usd',
    billingInterval: 'month',
    billingReason: 'subscription_create',
    amountPaidCents: 1_900,
    occurredAt: '2026-05-01T12:00:00.000Z',
    evidenceStatus: 'verified',
    evidenceVersion: economics.SONA_ECONOMICS_VERSION,
    evidenceSource: 'stripe_webhook',
  };
  const account = {
    uid,
    firstPaidAt: payment.occurredAt,
    firstPaidPlan: 'pro',
    firstPaidInterval: 'month',
    latestPaidAt: payment.occurredAt,
    latestPaidPlan: 'pro',
    latestPaidInterval: 'month',
    paidInvoiceCount: 1,
    renewalInvoiceCount: 0,
    firstRenewalAt: null,
    latestRenewalAt: null,
    renewalEvidenceStatus: 'complete',
    renewalEvidenceVersion: economics.SONA_ACCOUNT_RENEWAL_EVIDENCE_VERSION,
    renewalEvidenceMissingInvoiceCount: 0,
    renewalEvidenceMissingInvoiceIds: [],
    renewalEvidenceHistoryTruncated: false,
    renewalEvidenceUpdatedAt: '2026-07-01T12:00:00.000Z',
  };
  const result = economics.summarizeSonaPaidRenewalCohorts([account], {
    now: '2026-07-10T12:00:00.000Z',
    paymentRecords: [payment],
    invoiceRecords: [
      { ...payment, eventType: 'invoice_paid' },
      { ...payment, eventType: 'invoice_paid' },
    ],
    includeAccountEvidenceRows: true,
  });

  assert.equal(result.evidenceComplete, false);
  assert.equal(result.reconciledAccountsObserved, 0);
  assert.equal(result.evidenceCoveragePercent, 0);
  assert.equal(result.blockers.find(blocker => blocker.code === 'invoice_cross_link').count, 1);
  assert.equal(result.accountEvidenceRows[0].status, 'blocked');
  assert.deepEqual(result.accountEvidenceRows[0].blockerCodes, ['invoice_cross_link']);
});

test('wrong-owner invoice events block both the event and durable-payment owners', async () => {
  const economics = await loadEconomics();
  const ownerUid = 'durable-payment-owner';
  const payment = {
    uid: ownerUid,
    invoiceId: 'in_wrong_owner',
    paymentReferenceId: 'pi_wrong_owner',
    plan: 'pro',
    currency: 'usd',
    billingInterval: 'month',
    billingReason: 'subscription_create',
    amountPaidCents: 1_900,
    occurredAt: '2026-05-01T12:00:00.000Z',
    evidenceStatus: 'verified',
    evidenceVersion: economics.SONA_ECONOMICS_VERSION,
    evidenceSource: 'stripe_webhook',
  };
  const account = {
    uid: ownerUid,
    firstPaidAt: payment.occurredAt,
    firstPaidPlan: 'pro',
    firstPaidInterval: 'month',
    latestPaidAt: payment.occurredAt,
    latestPaidPlan: 'pro',
    latestPaidInterval: 'month',
    paidInvoiceCount: 1,
    renewalInvoiceCount: 0,
    firstRenewalAt: null,
    latestRenewalAt: null,
    renewalEvidenceStatus: 'complete',
    renewalEvidenceVersion: economics.SONA_ACCOUNT_RENEWAL_EVIDENCE_VERSION,
    renewalEvidenceMissingInvoiceCount: 0,
    renewalEvidenceMissingInvoiceIds: [],
    renewalEvidenceHistoryTruncated: false,
    renewalEvidenceUpdatedAt: '2026-07-01T12:00:00.000Z',
  };
  const result = economics.summarizeSonaPaidRenewalCohorts([account], {
    now: '2026-07-10T12:00:00.000Z',
    paymentRecords: [payment],
    invoiceRecords: [{ ...payment, uid: 'wrong-event-owner', eventType: 'invoice_paid' }],
    includeAccountEvidenceRows: true,
  });

  assert.equal(result.evidenceComplete, false);
  assert.equal(result.reconciledAccountsObserved, 0);
  assert.equal(
    result.accountEvidenceRows.find(row => row.uid === ownerUid).blockerCodes.includes('invoice_cross_link'),
    true,
  );
  assert.equal(
    result.accountEvidenceRows.find(row => row.uid === 'wrong-event-owner').status,
    'blocked',
  );

  const crossOwnerDuplicate = economics.summarizeSonaPaidRenewalCohorts([account], {
    now: '2026-07-10T12:00:00.000Z',
    paymentRecords: [payment],
    invoiceRecords: [
      { ...payment, uid: 'wrong-event-owner', eventType: 'invoice_paid' },
      { ...payment, eventType: 'invoice_paid' },
    ],
    includeAccountEvidenceRows: true,
  });
  assert.equal(crossOwnerDuplicate.reconciledAccountsObserved, 0);
  assert.equal(
    crossOwnerDuplicate.accountEvidenceRows.every(row => (
      row.status === 'blocked' && row.blockerCodes.includes('invoice_cross_link')
    )),
    true,
  );
});

test('cross-owner duplicate durable payment identities block both owners', async () => {
  const economics = await loadEconomics();
  const firstUid = 'first-payment-owner';
  const secondUid = 'second-payment-owner';
  const payment = {
    uid: firstUid,
    invoiceId: 'in_cross_owner_payment',
    paymentReferenceId: 'pi_cross_owner_payment',
    plan: 'pro',
    currency: 'usd',
    billingInterval: 'month',
    billingReason: 'subscription_create',
    amountPaidCents: 1_900,
    occurredAt: '2026-05-01T12:00:00.000Z',
    evidenceStatus: 'verified',
    evidenceVersion: economics.SONA_ECONOMICS_VERSION,
    evidenceSource: 'stripe_webhook',
  };
  const accountFor = uid => ({
    uid,
    firstPaidAt: payment.occurredAt,
    firstPaidPlan: 'pro',
    firstPaidInterval: 'month',
    latestPaidAt: payment.occurredAt,
    latestPaidPlan: 'pro',
    latestPaidInterval: 'month',
    paidInvoiceCount: 1,
    renewalInvoiceCount: 0,
    firstRenewalAt: null,
    latestRenewalAt: null,
    renewalEvidenceStatus: 'complete',
    renewalEvidenceVersion: economics.SONA_ACCOUNT_RENEWAL_EVIDENCE_VERSION,
    renewalEvidenceMissingInvoiceCount: 0,
    renewalEvidenceMissingInvoiceIds: [],
    renewalEvidenceHistoryTruncated: false,
    renewalEvidenceUpdatedAt: '2026-07-01T12:00:00.000Z',
  });
  const result = economics.summarizeSonaPaidRenewalCohorts(
    [accountFor(firstUid), accountFor(secondUid)],
    {
      now: '2026-07-10T12:00:00.000Z',
      paymentRecords: [payment, { ...payment, uid: secondUid }],
      invoiceRecords: [{ ...payment, eventType: 'invoice_paid' }],
      includeAccountEvidenceRows: true,
    },
  );

  assert.equal(result.evidenceComplete, false);
  assert.equal(result.reconciledAccountsObserved, 0);
  assert.equal(result.blockers.find(blocker => blocker.code === 'payment_ledger').count, 2);
  assert.equal(
    result.accountEvidenceRows.every(row => row.status === 'blocked' && row.blockerCodes.includes('payment_ledger')),
    true,
  );
});

test('ownerless renewal evidence withholds exact coverage', async () => {
  const economics = await loadEconomics();
  const uid = 'owned-evidence-user';
  const payment = {
    uid,
    invoiceId: 'in_owned',
    paymentReferenceId: 'pi_owned',
    plan: 'pro',
    currency: 'usd',
    billingInterval: 'month',
    billingReason: 'subscription_create',
    amountPaidCents: 1_900,
    occurredAt: '2026-05-01T12:00:00.000Z',
    evidenceStatus: 'verified',
    evidenceVersion: economics.SONA_ECONOMICS_VERSION,
    evidenceSource: 'stripe_webhook',
  };
  const account = {
    uid,
    firstPaidAt: payment.occurredAt,
    firstPaidPlan: 'pro',
    firstPaidInterval: 'month',
    latestPaidAt: payment.occurredAt,
    latestPaidPlan: 'pro',
    latestPaidInterval: 'month',
    paidInvoiceCount: 1,
    renewalInvoiceCount: 0,
    firstRenewalAt: null,
    latestRenewalAt: null,
    renewalEvidenceStatus: 'complete',
    renewalEvidenceVersion: economics.SONA_ACCOUNT_RENEWAL_EVIDENCE_VERSION,
    renewalEvidenceMissingInvoiceCount: 0,
    renewalEvidenceMissingInvoiceIds: [],
    renewalEvidenceHistoryTruncated: false,
    renewalEvidenceUpdatedAt: '2026-07-01T12:00:00.000Z',
  };
  const result = economics.summarizeSonaPaidRenewalCohorts([account], {
    now: '2026-07-10T12:00:00.000Z',
    paymentRecords: [payment, { ...payment, uid: undefined, invoiceId: 'in_ownerless_payment' }],
    invoiceRecords: [
      { ...payment, eventType: 'invoice_paid' },
      { ...payment, uid: undefined, invoiceId: 'in_ownerless_invoice', eventType: 'invoice_paid' },
    ],
    includeAccountEvidenceRows: true,
  });

  assert.equal(result.evidenceComplete, false);
  assert.equal(result.coverageMetricsPartial, true);
  assert.equal(result.coverageWithheldReason, 'unassigned_evidence');
  assert.equal(result.unassignedSignalCount, 2);
  assert.equal(result.populationAccountsObserved, null);
  assert.equal(result.reconciledAccountsObserved, null);
  assert.equal(result.unreconciledPopulationAccounts, null);
  assert.equal(result.evidenceCoveragePercent, null);
  assert.equal(result.unresolvedSignalCount, null);
  assert.equal(result.blockers.find(blocker => blocker.code === 'payment_ledger').count, 1);
  assert.equal(result.blockers.find(blocker => blocker.code === 'invoice_cross_link').count, 1);
  assert.equal(result.accountEvidenceRows[0].status, 'reconciled');
  const renewalExport = await loadRenewalEvidenceExport();
  const reviewPacket = renewalExport.buildSonaRenewalPricingReviewPacket({
    fullPopulation: true,
    snapshotConsistent: true,
    evidenceFingerprint: 'ownerless-evidence-fingerprint',
    reconciliation: result,
  });
  assert.equal(reviewPacket.status, 'blocked');
  assert.equal(reviewPacket.readyForHumanReview, false);
  assert.equal(reviewPacket.blockers.includes('unassigned_evidence'), true);
  assert.equal(reviewPacket.priceChangeAuthorized, false);
  const combinedMemo = renewalExport.buildSonaCombinedPricingMemo({
    evidenceFingerprint: 'ownerless-evidence-fingerprint',
    renewalPacket: reviewPacket,
    observedMargin: { status: 'pass', evidenceComplete: true, sampleCapped: false, plans: [] },
    usefulReturn: { status: 'pass', evidenceComplete: true, sampleCapped: false, plans: [] },
  });
  assert.equal(combinedMemo.status, 'blocked');
  assert.equal(combinedMemo.outcome, null);
  assert.equal(combinedMemo.priceChangeAuthorized, false);
});

test('full renewal evidence export reads every Firestore page without sampling', async () => {
  const economics = await loadEconomics();
  const renewalExport = await loadRenewalEvidenceExport();
  const accountRecords = [];
  const paymentRecords = [];
  const invoiceRecords = [];
  for (let index = 0; index < 101; index += 1) {
    const uid = `paid-user-${String(index).padStart(3, '0')}`;
    const invoiceId = `in_${uid}`;
    const paymentReferenceId = `pi_${uid}`;
    accountRecords.push({
      id: uid,
      data: {
        uid,
        firstPaidAt: '2026-05-01T12:00:00.000Z',
        firstPaidPlan: 'pro',
        firstPaidInterval: 'month',
        latestPaidAt: '2026-05-01T12:00:00.000Z',
        latestPaidPlan: 'pro',
        latestPaidInterval: 'month',
        paidInvoiceCount: 1,
        renewalInvoiceCount: 0,
        firstRenewalAt: null,
        latestRenewalAt: null,
        renewalEvidenceStatus: 'complete',
        renewalEvidenceVersion: economics.SONA_ACCOUNT_RENEWAL_EVIDENCE_VERSION,
        renewalEvidenceMissingInvoiceCount: 0,
        renewalEvidenceMissingInvoiceIds: [],
        renewalEvidenceHistoryTruncated: false,
        renewalEvidenceUpdatedAt: '2026-07-01T12:00:00.000Z',
      },
    });
    const evidence = {
      uid,
      invoiceId,
      paymentReferenceId,
      plan: 'pro',
      currency: 'usd',
      billingInterval: 'month',
      billingReason: 'subscription_create',
      amountPaidCents: 1_900,
      occurredAt: '2026-05-01T12:00:00.000Z',
      evidenceStatus: 'verified',
      evidenceVersion: economics.SONA_ECONOMICS_VERSION,
      evidenceSource: 'stripe_webhook',
    };
    paymentRecords.push({ id: paymentReferenceId, data: evidence });
    invoiceRecords.push({ id: `invoice_${invoiceId}`, data: { ...evidence, eventType: 'invoice_paid' } });
  }
  accountRecords.push({
    id: 'free-sona-account',
    data: {
      uid: 'free-sona-account',
      firstUsefulAt: '2026-07-01T12:00:00.000Z',
      paidInvoiceCount: 0,
    },
  });
  const collections = {
    sona_economics_accounts: accountRecords,
    sona_economics_payments: paymentRecords,
    sona_economics_events: invoiceRecords,
  };
  const { db, reads } = createPagedRenewalEvidenceDb(collections, {
    onRead({ collectionName, read }) {
      if (collectionName !== 'sona_economics_payments' || read !== 1) return;
      accountRecords.push({
        id: 'written-during-export',
        data: {
          uid: 'written-during-export',
          paidInvoiceCount: 1,
          latestPaidAt: '2026-07-10T12:00:00.000Z',
        },
      });
    },
  });

  const report = await renewalExport.getFullSonaRenewalEvidenceExport(db, {
    now: '2026-07-10T12:00:00.000Z',
    pageSize: 100,
  });

  assert.equal(report.fullPopulation, true);
  assert.equal(report.snapshotConsistent, true);
  assert.match(report.evidenceFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.sourceCounts, {
    paymentRecords: 101,
    invoiceEvents: 101,
    accountSummaries: 102,
    paidAccountSummaries: 101,
    recentEconomicsEvents: 0,
  });
  assert.equal(report.reconciliation.populationAccountsObserved, 101);
  assert.equal(report.reconciliation.reconciledAccountsObserved, 101);
  assert.equal(report.reconciliation.evidenceCoveragePercent, 100);
  assert.equal(report.reconciliation.accountEvidenceRows.length, 101);
  assert.equal(reads.sona_economics_accounts, 2);
  assert.equal(reads.sona_economics_payments, 2);
  assert.equal(reads.sona_economics_events, 3);
  assert.equal(reads.transactions, 1);
  assert.equal(accountRecords.length, 103);
  assert.equal(report.noStripeRead, true);
  assert.equal(report.noStripeMutation, true);
  assert.equal(report.noAutomaticPricingChange, true);
  assert.equal(report.reviewPacket.status, 'collecting');
  assert.equal(report.reviewPacket.outcome, null);
  assert.equal(report.reviewPacket.readyForHumanReview, false);
  assert.equal(report.reviewPacket.evidenceFingerprint, report.evidenceFingerprint);
  assert.equal(report.reviewPacket.requiresHumanApproval, true);
  assert.equal(report.reviewPacket.priceChangeAuthorized, false);
  assert.equal(report.reviewPacket.totalPricingDecisionAuthorized, false);
  assert.equal(report.observedMargin.status, 'collecting');
  assert.equal(report.usefulReturn.status, 'collecting');
  assert.equal(report.usefulReturn.evidenceComplete, true);
  assert.equal(report.usefulReturn.unresolved.dateAccounts, 0);
  assert.equal(report.combinedPricingMemo.status, 'collecting');
  assert.equal(report.combinedPricingMemo.outcome, null);
  assert.equal(report.combinedPricingMemo.evidenceFingerprint, report.evidenceFingerprint);
  assert.equal(report.combinedPricingMemo.priceChangeAuthorized, false);
  assert.equal(report.combinedPricingMemo.entitlementChangeAuthorized, false);
});

test('pricing memo acknowledgement binds a fresh audited fingerprint to no-change attestations', async () => {
  const acknowledgement = await loadPricingMemoAcknowledgement();
  const evidenceFingerprint = 'a'.repeat(64);
  const input = acknowledgement.parsePricingMemoAcknowledgementInput({
    evidenceFingerprint,
    expectedStatus: 'ready',
    expectedOutcome: 'watch',
    rationale: 'Reviewed the evidence and recorded a no-change decision for this snapshot.',
    confirmationText: 'ACKNOWLEDGE AAAAAAAA',
    acknowledgedNoStripeMutation: true,
    acknowledgedNoPriceChange: true,
    acknowledgedNoEntitlementChange: true,
  });
  const exportAudit = {
    action: 'renewal_evidence_export',
    by: 'admin@example.com',
    at: '2026-07-10T12:00:00.000Z',
    changes: {
      evidenceFingerprint,
      combinedPricingMemoStatus: 'ready',
      combinedPricingMemoOutcome: 'watch',
      requiresHumanApproval: true,
      priceChangeAuthorized: false,
      entitlementChangeAuthorized: false,
      noStripeMutation: true,
    },
  };
  const latestExport = {
    action: 'renewal_evidence_export_latest',
    evidenceFingerprint,
    exportAuditId: 'export-a',
    generatedAt: '2026-07-10T12:00:00.000Z',
  };
  const accepted = acknowledgement.buildPricingMemoAcknowledgementDecision(exportAudit, latestExport, input, {
    now: '2026-07-10T13:00:00.000Z',
    reviewedBy: 'admin@example.com',
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.record.action, 'pricing_memo_acknowledged');
  assert.equal(accepted.record.changes.decision, 'no_change');
  assert.equal(accepted.record.changes.evidenceFingerprint, evidenceFingerprint);
  assert.equal(accepted.record.changes.priceChangeAuthorized, false);
  assert.equal(accepted.record.changes.entitlementChangeAuthorized, false);
  assert.equal(accepted.record.changes.noStripeMutation, true);

  const stale = acknowledgement.buildPricingMemoAcknowledgementDecision(exportAudit, latestExport, input, {
    now: '2026-07-12T13:00:00.000Z',
    reviewedBy: 'admin@example.com',
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'EXPORT_STALE');
  const mismatched = acknowledgement.buildPricingMemoAcknowledgementDecision({
    ...exportAudit,
    changes: { ...exportAudit.changes, combinedPricingMemoOutcome: 'pass' },
  }, latestExport, input, {
    now: '2026-07-10T13:00:00.000Z',
    reviewedBy: 'admin@example.com',
  });
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.code, 'MEMO_MISMATCH');
  const unsafe = acknowledgement.buildPricingMemoAcknowledgementDecision({
    ...exportAudit,
    changes: { ...exportAudit.changes, priceChangeAuthorized: true },
  }, latestExport, input, {
    now: '2026-07-10T13:00:00.000Z',
    reviewedBy: 'admin@example.com',
  });
  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.code, 'SAFEGUARD_MISSING');
  const superseded = acknowledgement.buildPricingMemoAcknowledgementDecision(exportAudit, {
    ...latestExport,
    evidenceFingerprint: 'b'.repeat(64),
    exportAuditId: 'export-b',
    generatedAt: '2026-07-10T12:30:00.000Z',
  }, input, {
    now: '2026-07-10T13:00:00.000Z',
    reviewedBy: 'admin@example.com',
  });
  assert.equal(superseded.ok, false);
  assert.equal(superseded.code, 'EXPORT_SUPERSEDED');
  const exactReplay = acknowledgement.comparePricingMemoAcknowledgementReplay(accepted.record, input, 'admin@example.com');
  assert.equal(exactReplay.ok, true);
  assert.equal(exactReplay.alreadyAcknowledged, true);
  const conflictingReplay = acknowledgement.comparePricingMemoAcknowledgementReplay(accepted.record, {
    ...input,
    rationale: 'A different review rationale must not replace the canonical audit record.',
  }, 'admin@example.com');
  assert.equal(conflictingReplay.ok, false);
  assert.equal(conflictingReplay.code, 'ACKNOWLEDGEMENT_CONFLICT');
  const differentReviewerReplay = acknowledgement.comparePricingMemoAcknowledgementReplay(
    accepted.record,
    input,
    'other-admin@example.com',
  );
  assert.equal(differentReviewerReplay.ok, false);
  assert.equal(differentReviewerReplay.code, 'ACKNOWLEDGEMENT_CONFLICT');
  const incompleteReplay = acknowledgement.comparePricingMemoAcknowledgementReplay(accepted.record, {
    ...input,
    acknowledgedNoPriceChange: false,
  }, 'admin@example.com');
  assert.equal(incompleteReplay.ok, false);
  assert.equal(incompleteReplay.code, 'ATTESTATION_REQUIRED');
  assert.equal(acknowledgement.parsePricingMemoAcknowledgementInput({
    ...input,
    expectedStatus: 'collecting',
    expectedOutcome: 'watch',
  }), null);
});

test('pricing memo review status restores only the canonical latest acknowledgement', async () => {
  const acknowledgement = await loadPricingMemoAcknowledgement();
  const evidenceFingerprint = 'c'.repeat(64);
  const latestExport = {
    action: 'renewal_evidence_export_latest',
    evidenceFingerprint,
    exportAuditId: 'export-c',
    generatedAt: '2026-07-10T12:00:00.000Z',
  };
  const exportAudit = {
    action: 'renewal_evidence_export',
    by: 'admin@example.com',
    at: '2026-07-10T12:00:00.000Z',
    changes: {
      generatedAt: '2026-07-10T12:00:00.000Z',
      evidenceFingerprint,
      combinedPricingMemoStatus: 'ready',
      combinedPricingMemoOutcome: 'pass',
      requiresHumanApproval: true,
      priceChangeAuthorized: false,
      entitlementChangeAuthorized: false,
      noStripeMutation: true,
    },
  };
  const empty = acknowledgement.buildPricingMemoReviewStatus(null, null, null, {
    now: '2026-07-10T13:00:00.000Z',
  });
  assert.equal(empty.ok, true);
  assert.equal(empty.reviewStatus.available, false);
  assert.equal(empty.reviewStatus.canAcknowledge, false);

  const unreviewed = acknowledgement.buildPricingMemoReviewStatus(latestExport, exportAudit, null, {
    now: '2026-07-10T13:00:00.000Z',
  });
  assert.equal(unreviewed.ok, true);
  assert.equal(unreviewed.reviewStatus.available, true);
  assert.equal(unreviewed.reviewStatus.memo.evidenceFingerprint, evidenceFingerprint);
  assert.equal(unreviewed.reviewStatus.canAcknowledge, true);
  assert.equal(unreviewed.reviewStatus.requiresNewExport, false);

  const input = acknowledgement.parsePricingMemoAcknowledgementInput({
    evidenceFingerprint,
    expectedStatus: 'ready',
    expectedOutcome: 'pass',
    rationale: 'Reviewed the canonical evidence and recorded a no-change decision.',
    confirmationText: 'ACKNOWLEDGE CCCCCCCC',
    acknowledgedNoStripeMutation: true,
    acknowledgedNoPriceChange: true,
    acknowledgedNoEntitlementChange: true,
  });
  const decision = acknowledgement.buildPricingMemoAcknowledgementDecision(
    exportAudit,
    latestExport,
    input,
    { now: '2026-07-10T13:00:00.000Z', reviewedBy: 'admin@example.com' },
  );
  assert.equal(decision.ok, true);
  const restored = acknowledgement.buildPricingMemoReviewStatus(latestExport, exportAudit, decision.record, {
    now: '2026-07-12T13:00:00.000Z',
  });
  assert.equal(restored.ok, true);
  assert.equal(restored.reviewStatus.memo.fresh, false);
  assert.equal(restored.reviewStatus.acknowledgement.evidenceFingerprint, evidenceFingerprint);
  assert.equal(restored.reviewStatus.acknowledgement.reviewedBy, 'admin@example.com');
  assert.equal(restored.reviewStatus.acknowledgement.decision, 'no_change');
  assert.equal(restored.reviewStatus.canAcknowledge, false);
  assert.equal(restored.reviewStatus.requiresNewExport, true);
  assert.match(restored.reviewStatus.memo.reason, /historical snapshot/);

  const corrupt = acknowledgement.buildPricingMemoReviewStatus(latestExport, exportAudit, {
    ...decision.record,
    changes: { ...decision.record.changes, priceChangeAuthorized: true },
  }, {
    now: '2026-07-10T13:00:00.000Z',
  });
  assert.equal(corrupt.ok, false);
  assert.equal(corrupt.code, 'ACKNOWLEDGEMENT_INVALID');
  const wrongSourceTime = acknowledgement.buildPricingMemoReviewStatus(latestExport, exportAudit, {
    ...decision.record,
    at: '2026-07-10T11:59:59.000Z',
  }, {
    now: '2026-07-10T13:00:00.000Z',
  });
  assert.equal(wrongSourceTime.ok, false);
  assert.equal(wrongSourceTime.code, 'ACKNOWLEDGEMENT_INVALID');
  const wrongSource = acknowledgement.buildPricingMemoReviewStatus(
    { ...latestExport, exportAuditId: 'export-newer', evidenceFingerprint: 'd'.repeat(64) },
    exportAudit,
    null,
    { now: '2026-07-10T13:00:00.000Z' },
  );
  assert.equal(wrongSource.ok, false);
  assert.equal(wrongSource.code, 'EXPORT_AUDIT_INVALID');
});

test('pricing memo status transaction retries a concurrent latest-pointer swap', async () => {
  const { loadLatestPricingMemoReviewStatus } = await loadPricingMemoReviewStatusStore();
  const latestPath = 'settings/admin_log/pricing_memo/latest_export';
  const oldFingerprint = 'e'.repeat(64);
  const newFingerprint = 'f'.repeat(64);
  const makeExportAudit = (fingerprint, generatedAt) => ({
    action: 'renewal_evidence_export',
    by: 'admin@example.com',
    at: generatedAt,
    changes: {
      generatedAt,
      evidenceFingerprint: fingerprint,
      combinedPricingMemoStatus: 'ready',
      combinedPricingMemoOutcome: 'pass',
      requiresHumanApproval: true,
      priceChangeAuthorized: false,
      entitlementChangeAuthorized: false,
      noStripeMutation: true,
    },
  });
  const records = new Map([
    [latestPath, {
      action: 'renewal_evidence_export_latest',
      evidenceFingerprint: oldFingerprint,
      exportAuditId: 'export-old',
      generatedAt: '2026-07-10T12:00:00.000Z',
    }],
    ['settings/admin_log/entries/export-old', makeExportAudit(oldFingerprint, '2026-07-10T12:00:00.000Z')],
    ['settings/admin_log/entries/export-new', makeExportAudit(newFingerprint, '2026-07-10T12:30:00.000Z')],
  ]);
  const versions = new Map([[latestPath, 1]]);
  let attempts = 0;
  const ref = pathname => ({
    path: pathname,
    doc(id) { return ref(`${pathname}/${id}`); },
    collection(name) { return ref(`${pathname}/${name}`); },
  });
  const snapshot = pathname => {
    const value = records.get(pathname);
    return { exists: Boolean(value), data: () => value ? clone(value) : undefined };
  };
  const db = {
    collection(name) { return ref(name); },
    async runTransaction(callback) {
      while (attempts < 3) {
        attempts += 1;
        const readVersions = new Map();
        const transaction = {
          async get(documentRef) {
            const version = versions.get(documentRef.path) || 0;
            readVersions.set(documentRef.path, version);
            const result = snapshot(documentRef.path);
            if (documentRef.path === latestPath && attempts === 1) {
              records.set(latestPath, {
                action: 'renewal_evidence_export_latest',
                evidenceFingerprint: newFingerprint,
                exportAuditId: 'export-new',
                generatedAt: '2026-07-10T12:30:00.000Z',
              });
              versions.set(latestPath, version + 1);
            }
            return result;
          },
        };
        const result = await callback(transaction);
        const conflicted = [...readVersions.entries()]
          .some(([pathname, version]) => (versions.get(pathname) || 0) !== version);
        if (!conflicted) return result;
      }
      throw new Error('transaction did not converge');
    },
  };

  const result = await loadLatestPricingMemoReviewStatus(db, {
    now: '2026-07-10T13:00:00.000Z',
  });
  assert.equal(attempts, 2);
  assert.equal(result.ok, true);
  assert.equal(result.reviewStatus.memo.evidenceFingerprint, newFingerprint);
  assert.equal(result.reviewStatus.canAcknowledge, true);
});

test('pricing memo status request sequencing rejects delayed and invalidated responses', async () => {
  const request = await loadPricingMemoStatusRequest();
  const counter = { current: 0 };
  const applied = [];
  const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
  };
  const run = async (label, pending) => {
    const requestId = request.beginPricingMemoStatusRequest(counter);
    const value = await pending.promise;
    if (request.isLatestPricingMemoStatusRequest(counter, requestId)) applied.push(`${label}:${value}`);
  };

  const oldResponse = deferred();
  const newResponse = deferred();
  const oldRun = run('old', oldResponse);
  const newRun = run('new', newResponse);
  newResponse.resolve('new-fingerprint');
  await newRun;
  oldResponse.resolve('old-fingerprint');
  await oldRun;
  assert.deepEqual(applied, ['new:new-fingerprint']);

  const exportRace = deferred();
  const exportRaceRun = run('pre-export', exportRace);
  request.invalidatePricingMemoStatusRequests(counter);
  exportRace.resolve('superseded-fingerprint');
  await exportRaceRun;
  assert.deepEqual(applied, ['new:new-fingerprint']);

  const recordedMessage = { evidenceFingerprint: 'old-fingerprint', message: 'Review recorded' };
  assert.equal(request.retainPricingMemoStatusForFingerprint(recordedMessage, 'new-fingerprint'), null);
  assert.deepEqual(
    request.retainPricingMemoStatusForFingerprint(recordedMessage, 'old-fingerprint'),
    recordedMessage,
  );
});

test('pricing gate fails closed on immature or incomplete paid retention evidence', async () => {
  const economics = await loadEconomics();
  const collecting = economics.summarizeSonaPaidCohortRetention([], [{
    uid: 'new-pro-user',
    firstPaidAt: '2026-07-25T12:00:00.000Z',
    firstPaidPlan: 'pro',
  }], {
    now: '2026-07-31T12:00:00.000Z',
  });
  const blocked = economics.summarizeSonaPaidCohortRetention([], [{
    uid: 'unknown-plan-user',
    firstPaidAt: '2026-07-15T12:00:00.000Z',
  }], {
    now: '2026-07-31T12:00:00.000Z',
    sampleCapped: true,
  });

  assert.equal(collecting.status, 'collecting');
  assert.equal(collecting.matureAccountsObserved, 0);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.readyForPricingDecision, false);
  assert.equal(blocked.unresolved.planAccounts, 1);
  assert.equal(economics.buildSonaPricingDecisionGate(
    { status: 'pass' },
    { status: 'collecting' },
  ).status, 'collecting');
  assert.equal(economics.buildSonaPricingDecisionGate(
    { status: 'watch' },
    { status: 'pass' },
  ).readyForHumanReview, true);
  assert.equal(economics.buildSonaPricingDecisionGate(
    { status: 'pass' },
    { status: 'blocked' },
  ).noAutomaticPricingChange, true);
});

test('observed plan economics attributes paid cash, linked refunds and run cost by plan', async () => {
  const economics = await loadEconomics();
  const events = [];
  for (const [plan, tier] of [['pro', 'pro'], ['studio', 'studio']]) {
    for (let index = 0; index < 20; index += 1) {
      events.push({
        eventId: `run-${plan}-${index}`,
        eventType: 'sona_run_completed',
        uid: `${plan}-user-${index % 5}`,
        occurredAt: '2026-07-10T00:00:00.000Z',
        economicsVersion: economics.SONA_ECONOMICS_VERSION,
        tier,
        usefulOutcome: 'ranked_picks',
        estimatedCostMicros: 10_000,
      });
    }
    for (let index = 0; index < 5; index += 1) {
      events.push({
        eventId: `invoice-${plan}-${index}`,
        eventType: 'invoice_paid',
        uid: `${plan}-user-${index}`,
        occurredAt: '2026-07-10T01:00:00.000Z',
        economicsVersion: economics.SONA_ECONOMICS_VERSION,
        plan,
        paidAfterUsefulOutcome: true,
        amountPaidCents: plan === 'pro' ? 499 : 999,
        currency: 'usd',
        paymentReferenceId: `payment-${plan}-${index}`,
      });
    }
  }
  events.push({
    eventId: 'refund-pro-0',
    eventType: 'refund_succeeded',
    uid: 'pro-user-0',
    occurredAt: '2026-07-10T02:00:00.000Z',
    economicsVersion: economics.SONA_ECONOMICS_VERSION,
    afterUsefulOutcome: true,
    attributionStatus: 'linked',
    amountRefundedCents: 499,
    currency: 'usd',
    paymentReferenceId: 'payment-pro-0',
  });

  const result = economics.summarizeSonaPlanObservedEconomics(events);
  const pro = result.plans.find(plan => plan.plan === 'pro');
  const studio = result.plans.find(plan => plan.plan === 'studio');

  assert.equal(result.status, 'pass');
  assert.equal(result.readyForPricingDecision, true);
  assert.equal(result.evidenceComplete, true);
  assert.equal(pro.runsObserved, 20);
  assert.equal(pro.paidAccountsObserved, 5);
  assert.equal(pro.grossCashObservedUsd, 24.95);
  assert.equal(pro.refundedUsd, 4.99);
  assert.equal(pro.netCashObservedUsd, 19.96);
  assert.equal(pro.status, 'pass');
  assert.equal(studio.grossCashObservedUsd, 49.95);
  assert.equal(studio.status, 'pass');
});

test('observed plan economics blocks capped, non-USD or unattributed evidence', async () => {
  const economics = await loadEconomics();
  const result = economics.summarizeSonaPlanObservedEconomics([
    {
      eventId: 'unknown-run', eventType: 'sona_run_completed', uid: 'user-1',
      occurredAt: '2026-07-10T00:00:00.000Z', economicsVersion: economics.SONA_ECONOMICS_VERSION,
      tier: 'legacy', estimatedCostMicros: 1_000,
    },
    {
      eventId: 'eur-invoice', eventType: 'invoice_paid', uid: 'user-1',
      occurredAt: '2026-07-10T01:00:00.000Z', economicsVersion: economics.SONA_ECONOMICS_VERSION,
      plan: 'pro', paidAfterUsefulOutcome: true, amountPaidCents: 499, currency: 'eur',
    },
    {
      eventId: 'unlinked-plan-refund', eventType: 'refund_succeeded', uid: 'user-1',
      occurredAt: '2026-07-10T02:00:00.000Z', economicsVersion: economics.SONA_ECONOMICS_VERSION,
      afterUsefulOutcome: true, attributionStatus: 'linked', amountRefundedCents: 100, currency: 'usd',
      paymentReferenceId: 'missing-payment',
    },
  ], { sampleCapped: true });

  assert.equal(result.status, 'blocked');
  assert.equal(result.readyForPricingDecision, false);
  assert.equal(result.evidenceComplete, false);
  assert.deepEqual(result.unresolved, {
    planEvents: 1,
    currencyEvents: 1,
    refundAttributionEvents: 1,
  });
  assert.ok(result.plans.every(plan => plan.contributionMarginPercent == null));
});

test('observed plan economics remains collecting below the paid cohort gate', async () => {
  const economics = await loadEconomics();
  const result = economics.summarizeSonaPlanObservedEconomics([
    {
      eventId: 'run-pro', eventType: 'sona_run_completed', uid: 'user-pro',
      occurredAt: '2026-07-10T00:00:00.000Z', economicsVersion: economics.SONA_ECONOMICS_VERSION,
      tier: 'pro', usefulOutcome: 'ranked_picks', estimatedCostMicros: 10_000,
    },
    {
      eventId: 'invoice-pro', eventType: 'invoice_paid', uid: 'user-pro',
      occurredAt: '2026-07-10T01:00:00.000Z', economicsVersion: economics.SONA_ECONOMICS_VERSION,
      plan: 'pro', paidAfterUsefulOutcome: true, amountPaidCents: 499, currency: 'usd',
    },
  ]);

  const pro = result.plans.find(plan => plan.plan === 'pro');
  assert.equal(result.status, 'collecting');
  assert.equal(result.readyForPricingDecision, false);
  assert.equal(pro.status, 'collecting');
  assert.match(pro.reason, /Collect 19 more runs and 4 more paid accounts/);
});

test('a plan-stamped late refund remains attributable after its invoice leaves the report window', async () => {
  const economics = await loadEconomics();
  const result = economics.summarizeSonaPlanObservedEconomics([{
    eventId: 'late-refund',
    eventType: 'refund_succeeded',
    uid: 'user-pro',
    occurredAt: '2026-07-10T02:00:00.000Z',
    economicsVersion: economics.SONA_ECONOMICS_VERSION,
    plan: 'pro',
    afterUsefulOutcome: true,
    attributionStatus: 'linked',
    amountRefundedCents: 499,
    currency: 'usd',
    paymentReferenceId: 'payment-from-prior-window',
  }]);
  const pro = result.plans.find(plan => plan.plan === 'pro');

  assert.equal(result.unresolved.refundAttributionEvents, 0);
  assert.equal(pro.refundedUsd, 4.99);
  assert.equal(result.status, 'collecting');
});

test('production paths call the server-side economics ledger', () => {
  const harness = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'agent-harness.ts'), 'utf8');
  const webhook = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'stripe', 'webhook', 'route.ts'), 'utf8');
  const costs = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'admin', 'costs', 'route.ts'), 'utf8');
  const cron = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'cron', 'agent-pipeline', 'route.ts'), 'utf8');
  const ops = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'admin', 'ops', 'route.ts'), 'utf8');
  const adminPage = fs.readFileSync(path.join(repoRoot, 'app', 'suite', 'admin', 'page.tsx'), 'utf8');
  const paymentPreview = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'admin', 'billing', 'payment-evidence-preview', 'route.ts'), 'utf8');
  const paymentRepair = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'admin', 'billing', 'payment-evidence', '[paymentReferenceId]', 'repair', 'route.ts'), 'utf8');
  const paymentEvidenceServer = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'payment-evidence-server.ts'), 'utf8');
  const economicsSource = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'economics.ts'), 'utf8');
  const renewalExportServer = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'renewal-evidence-export.ts'), 'utf8');
  const renewalExportRoute = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'admin', 'billing', 'renewal-evidence-export', 'route.ts'), 'utf8');
  const memoAcknowledgement = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'pricing-memo-acknowledgement.ts'), 'utf8');
  const memoAcknowledgementRoute = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'admin', 'billing', 'pricing-memo-acknowledgement', 'route.ts'), 'utf8');
  const memoReviewStatusRoute = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'admin', 'billing', 'pricing-memo-review-status', 'route.ts'), 'utf8');
  const memoReviewStatusStore = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'pricing-memo-review-status-store.ts'), 'utf8');

  assert.match(harness, /recordRunEconomics\(db/);
  assert.match(webhook, /recordSonaCheckoutConversion\(getAdminDb\(\)/);
  assert.match(webhook, /recordSonaPaidInvoice\(getAdminDb\(\)/);
  assert.match(webhook, /recordSonaRefund\(getAdminDb\(\)/);
  assert.match(webhook, /checkoutAmountCents = Number\(\(session as any\)\.amount_total \|\| 0\)/);
  assert.match(webhook, /checkoutValueCents: checkoutAmountCents/);
  assert.match(webhook, /invoice\.payments\?\.data\.find/);
  assert.match(webhook, /paymentReferenceId: invoicePaymentReference\(invoice\)/);
  assert.match(webhook, /billingInterval: interval === 'year' \? 'year' : 'month'/);
  assert.match(webhook, /billingReason: invoice\.billing_reason \|\| null/);
  assert.match(costs, /getSonaEconomicsSnapshot/);
  assert.match(costs, /cache_costs_v8/);
  assert.match(ops, /cache_costs_v8/);
  assert.match(paymentRepair, /cache_costs_v8/);
  assert.match(adminPage, /Pro and Max margin \+ useful week-2 return/);
  assert.match(adminPage, /Paid cohort return/);
  assert.match(adminPage, /Monthly and annual cohorts/);
  assert.match(adminPage, /paidRenewalCohorts/);
  assert.match(adminPage, /Review evidence backlog/);
  assert.match(adminPage, /coverageMetricsPartial/);
  assert.match(adminPage, /useful week-2 return/);
  assert.match(costs, /windowDays: 30/);
  assert.match(paymentPreview, /MAX_PREVIEW_PAYMENTS = 20/);
  assert.match(paymentPreview, /writePerformed: false/);
  assert.doesNotMatch(paymentPreview, /\.set\(|\.delete\(|recordSonaPaidInvoice|recordSonaRefund/);
  assert.match(adminPage, /Audit legacy evidence/);
  assert.match(adminPage, /Repair verified evidence/);
  assert.match(paymentPreview, /inspectSonaPaymentEvidence/);
  assert.match(paymentPreview, /payment\.billingInterval/);
  assert.match(paymentPreview, /payment\.billingReason/);
  assert.match(paymentPreview, /hasVerifiedSonaPaymentEvidence\(payment\)/);
  assert.match(paymentRepair, /checkRateLimitStrict/);
  assert.match(paymentRepair, /runTransaction/);
  assert.match(paymentRepair, /sona_payment_evidence_repaired/);
  assert.match(paymentRepair, /confirmationText/);
  assert.match(paymentRepair, /noStripeMutation: true/);
  assert.doesNotMatch(paymentRepair, /stripe\.[a-z.]+\.(create|update|del)\(/);
  assert.match(paymentEvidenceServer, /invoices\.retrieve/);
  assert.match(paymentEvidenceServer, /invoicePayments\.list/);
  assert.match(paymentEvidenceServer, /invoices\.listLineItems/);
  assert.match(paymentEvidenceServer, /prices\.retrieve/);
  assert.match(paymentEvidenceServer, /subscriptions\.retrieve/);
  assert.match(paymentEvidenceServer, /customers\.retrieve/);
  assert.match(paymentEvidenceServer, /invoiceBillingReason: invoice\.billing_reason/);
  assert.match(paymentEvidenceServer, /subscriptionBillingInterval: invoicePrice\?\.recurring\?\.interval/);
  assert.match(paymentRepair, /billingInterval: expected\.billingInterval/);
  assert.match(paymentRepair, /billingReason: expected\.billingReason/);
  assert.match(paymentRepair, /buildSonaAccountRenewalSummaryRepairDecision/);
  assert.match(paymentRepair, /SONA_ECONOMICS_ACCOUNTS_COLLECTION/);
  assert.match(paymentRepair, /accountRenewalEvidenceStatus/);
  assert.match(paymentRepair, /MAX_ACCOUNT_PAYMENT_HISTORY = 200/);
  assert.match(paymentRepair, /accountPaymentsQuery/);
  assert.match(paymentRepair, /firstPaidInterval: FieldValue\.delete\(\)/);
  assert.match(paymentRepair, /latestPaidInterval: FieldValue\.delete\(\)/);
  assert.match(paymentRepair, /renewalInvoiceCount: FieldValue\.delete\(\)/);
  assert.match(paymentRepair, /billingInterval: FieldValue\.delete\(\)/);
  assert.match(paymentRepair, /billingReason: FieldValue\.delete\(\)/);
  assert.match(economicsSource, /SONA_RENEWAL_COHORT_LOOKBACK_DAYS = 400/);
  assert.match(economicsSource, /renewalAccountSummaries/);
  assert.match(economicsSource, /blockerDefinitions/);
  assert.match(economicsSource, /includeAccountEvidenceRows/);
  assert.match(economicsSource, /coverageWithheldReason/);
  assert.match(renewalExportServer, /collectAllQueryDocuments/);
  assert.match(renewalExportServer, /while \(true\)/);
  assert.match(renewalExportServer, /runTransaction/);
  assert.match(renewalExportServer, /readOnly: true/);
  assert.match(renewalExportServer, /snapshotConsistent: true/);
  assert.match(renewalExportServer, /buildSonaRenewalPricingReviewPacket/);
  assert.match(renewalExportServer, /createHash\('sha256'\)/);
  assert.match(renewalExportServer, /priceChangeAuthorized: false/);
  assert.match(renewalExportServer, /totalPricingDecisionAuthorized: false/);
  assert.match(renewalExportServer, /buildSonaCombinedPricingMemo/);
  assert.match(renewalExportServer, /entitlementChangeAuthorized: false/);
  assert.match(renewalExportServer, /recentEconomicsEvents/);
  assert.match(renewalExportServer, /reconciliation,/);
  assert.match(renewalExportServer, /includeAccountEvidenceRows: true/);
  assert.match(renewalExportRoute, /requireBillingAdmin\(req\)/);
  assert.match(renewalExportRoute, /checkRateLimitStrict/);
  assert.match(renewalExportRoute, /maxDuration = 300/);
  assert.match(renewalExportRoute, /renewal_evidence_export_latest/);
  assert.match(renewalExportRoute, /latestGeneratedAt/);
  assert.match(renewalExportRoute, /runTransaction/);
  assert.match(renewalExportRoute, /noStripeMutation: true/);
  assert.match(renewalExportRoute, /private, no-store/);
  assert.doesNotMatch(renewalExportRoute, /stripe\.|from ['"]stripe['"]/);
  assert.match(memoAcknowledgement, /PRICING_MEMO_ACKNOWLEDGEMENT_MAX_AGE_MS/);
  assert.match(memoAcknowledgement, /decision: 'no_change'/);
  assert.match(memoAcknowledgement, /EXPORT_SUPERSEDED/);
  assert.match(memoAcknowledgement, /ACKNOWLEDGEMENT_CONFLICT/);
  assert.match(memoAcknowledgement, /priceChangeAuthorized: false/);
  assert.match(memoAcknowledgementRoute, /requireBillingAdmin\(req\)/);
  assert.match(memoAcknowledgementRoute, /checkRateLimitStrict/);
  assert.match(memoAcknowledgementRoute, /runTransaction/);
  assert.match(memoAcknowledgementRoute, /pricing_memo_ack_/);
  assert.match(memoAcknowledgementRoute, /latestExportRef/);
  assert.match(memoAcknowledgementRoute, /comparePricingMemoAcknowledgementReplay/);
  assert.doesNotMatch(memoAcknowledgementRoute, /stripe\.|from ['"]stripe['"]/);
  assert.match(memoReviewStatusRoute, /requireBillingAdmin\(req\)/);
  assert.match(memoReviewStatusRoute, /checkRateLimitStrict/);
  assert.match(memoReviewStatusRoute, /loadLatestPricingMemoReviewStatus/);
  assert.match(memoReviewStatusRoute, /private, no-store/);
  assert.doesNotMatch(memoReviewStatusRoute, /\.set\(|\.update\(|\.delete\(|stripe\.|from ['"]stripe['"]/);
  assert.match(memoReviewStatusStore, /runTransaction/);
  assert.match(memoReviewStatusStore, /buildPricingMemoReviewStatus/);
  assert.doesNotMatch(memoReviewStatusStore, /\.set\(|\.update\(|\.delete\(|stripe\.|from ['"]stripe['"]/);
  assert.match(adminPage, /Export evidence/);
  assert.match(adminPage, /renewalEvidenceExporting/);
  assert.match(adminPage, /Latest pricing memo/);
  assert.match(adminPage, /No automatic price change/);
  assert.match(adminPage, /memo\.evidenceFingerprint !== report\.evidenceFingerprint/);
  assert.match(adminPage, /Record no-change review/);
  assert.match(adminPage, /acknowledgedNoStripeMutation/);
  assert.match(adminPage, /aria-live=/);
  assert.match(adminPage, /pricingMemoStatusRef/);
  assert.match(adminPage, /pricingMemoStatusRequestRef/);
  assert.match(adminPage, /isLatestPricingMemoStatusRequest/);
  assert.match(adminPage, /invalidatePricingMemoStatusRequests/);
  assert.match(adminPage, /retainPricingMemoStatusForFingerprint/);
  assert.match(adminPage, /pricingMemoActionStatus\?\.evidenceFingerprint === combinedPricingMemo\.evidenceFingerprint/);
  assert.match(adminPage, /pricingMemoCanonicalReview\?\.evidenceFingerprint === combinedPricingMemo\.evidenceFingerprint/);
  assert.match(adminPage, /pricingMemoDisplayedFingerprintRef\.current === evidenceFingerprint/);
  assert.match(adminPage, /await refreshPricingMemoReviewStatus\(\)/);
  assert.match(adminPage, /Retry review status/);
  assert.match(adminPage, /Canonical no-change review/);
  assert.match(economicsSource, /where\('eventType', '==', 'invoice_paid'\)/);
  assert.match(economicsSource, /where\('paidInvoiceCount', '>', 0\)/);
  assert.match(economicsSource, /await db\.getAll\(\.\.\.renewalAccountRefs\)/);
  assert.match(adminPage, /billing interval, and invoice reason/);
  assert.doesNotMatch(paymentEvidenceServer, /\.(create|update|del)\(/);
  assert.match(cron, /processSonaEconomicsOutbox/);
});
