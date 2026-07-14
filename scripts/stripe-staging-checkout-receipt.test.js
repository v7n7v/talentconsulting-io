const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts/stripe-staging-checkout-receipt.js');
const operator = require(scriptPath);
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-collector-test-'));
const outfile = path.join(outdir, 'receipt-contract.cjs');

const receiptModule = build({
  stdin: {
    contents: [
      "export * from './lib/billing/stripe-checkout-canary-receipt';",
      "export * from './lib/sona/purchase-contract';",
      "export * from './lib/billing-price-types';",
      "export * from './lib/billing/stripe-price-identity';",
      "export * from './lib/staging-deployment-identity';",
    ].join('\n'),
    resolveDir: repoRoot,
    sourcefile: 'stripe-collector-test-entry.ts',
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

async function fixture() {
  const {
    buildSonaPurchaseContract,
    buildSonaPurchaseContractMetadata,
    stagingDeploymentIdentityFingerprint,
    stripePriceIdentityFingerprint,
  } = await receiptModule;
  const uid = 'staging-canary-user';
  const customerId = 'cus_staging_receipt';
  const subscriptionId = 'sub_staging_receipt';
  const sessionId = 'cs_test_staging_receipt';
  const priceId = 'price_pro_month';
  const contract = buildSonaPurchaseContract('pro', 'month');
  const metadata = {
    firebaseUid: uid,
    plan: 'pro',
    interval: 'month',
    ...buildSonaPurchaseContractMetadata('pro', 'month'),
  };
  const observedAtMs = Date.parse('2026-07-11T11:00:00.000Z');
  const status = 'trialing';
  const amount = 2900;
  const env = {
    NODE_ENV: 'staging',
    STAGING_HOSTNAME: 'talent-staging.example.test',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'talent-staging-project',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_staging_receipt',
  };
  const publicPrice = (id, sourceInterval, unitAmount) => ({
    interval: sourceInterval,
    unitAmount,
    currency: 'usd',
    active: true,
    sourceStatus: 'verified',
    sourceInterval,
    identityFingerprint: stripePriceIdentityFingerprint(id),
    display: `$${unitAmount / 100}`,
    effectiveMonthlyDisplay: `$${unitAmount / 100}`,
    savingsLabel: '',
  });
  const options = {
    pro: { month: true, year: true },
    studio: { month: true, year: true },
  };
  return {
    uid,
    sessionId,
    plan: 'pro',
    interval: 'month',
    configuredPrices: {
      pro: [priceId, 'price_pro_year'],
      studio: ['price_studio_month', 'price_studio_year'],
    },
    observedAtMs,
    env,
    baseUrl: 'https://talent-staging.example.test',
    health: {
      status: 'ok',
      stagingDeploymentIdentity: stagingDeploymentIdentityFingerprint(env),
    },
    publicPricing: {
      plans: {
        pro: {
          month: publicPrice('price_pro_month', 'month', 2900),
          year: publicPrice('price_pro_year', 'year', 29000),
        },
        studio: {
          month: publicPrice('price_studio_month', 'month', 5900),
          year: publicPrice('price_studio_year', 'year', 59000),
        },
      },
      checkout: {
        available: true,
        status: 'available',
        code: 'CHECKOUT_READY',
        message: 'Secure checkout is available.',
        options,
      },
      updatedAt: '2026-07-11T10:59:00.000Z',
    },
    session: {
      id: sessionId,
      created: Math.floor((observedAtMs - 60_000) / 1_000),
      livemode: false,
      mode: 'subscription',
      status: 'complete',
      payment_status: 'no_payment_required',
      client_reference_id: uid,
      customer: customerId,
      subscription: subscriptionId,
      metadata,
    },
    customer: {
      id: customerId,
      deleted: false,
      livemode: false,
      metadata: { firebaseUid: uid },
    },
    subscription: {
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
            recurring: { interval: 'month' },
            currency: 'usd',
            unit_amount: amount,
          },
        }],
      },
    },
    userSubscription: {
      plan: 'pro',
      status,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      billingInterval: 'month',
      amount,
      currency: 'usd',
      recurringAmountCents: amount,
      recurringCurrency: 'usd',
      stripeStateEntitled: true,
      stripeStateEventId: 'evt_staging_receipt',
      stripeStateEventType: 'checkout.session.completed',
      stripeStateSubscriptionId: subscriptionId,
      sonaPurchaseContractStatus: 'verified',
      sonaPurchaseContractFingerprint: contract.fingerprint,
      sonaPurchaseContract: contract,
    },
    billingAccount: {
      accountId: customerId,
      uid,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      plan: 'pro',
      status,
      billingInterval: 'month',
      recurringAmountCents: amount,
      recurringCurrency: 'usd',
    },
    ledger: {
      uid,
      accountId: customerId,
      stripeCustomerId: customerId,
      stripeObjectId: sessionId,
      stripeEventId: 'evt_staging_receipt',
      type: 'checkout',
      source: 'stripe_webhook',
      status,
      amount,
      currency: 'usd',
      occurredAt: '2026-07-11T10:59:05.000Z',
      postedAt: '2026-07-11T10:59:10.000Z',
      metadata: {
        plan: 'pro',
        interval: 'month',
        sonaPurchaseContractStatus: 'verified',
        sonaPurchaseContractFingerprint: contract.fingerprint,
        stripePlanEvidenceStatus: 'price_verified',
      },
    },
  };
}

function clients(data, operations, ledgerCount = 1) {
  return {
    stripe: {
      checkout: { sessions: { retrieve: async id => { operations.push(`session:${id}`); return data.session; } } },
      customers: { retrieve: async id => { operations.push(`customer:${id}`); return data.customer; } },
      subscriptions: { retrieve: async id => { operations.push(`subscription:${id}`); return data.subscription; } },
    },
    store: {
      getUserSubscription: async uid => { operations.push(`user:${uid}`); return data.userSubscription; },
      getBillingAccount: async id => { operations.push(`account:${id}`); return data.billingAccount; },
      findCheckoutLedger: async id => {
        operations.push(`ledger:${id}`);
        return { count: ledgerCount, record: ledgerCount === 1 ? data.ledger : null };
      },
    },
    readJson: async url => {
      operations.push(`http:${url}`);
      return url.endsWith('/api/health') ? data.health : data.publicPricing;
    },
  };
}

test('collector performs exactly eight read-only operations and verifies a receipt', async () => {
  const data = await fixture();
  const operations = [];
  const { stripe, store, readJson } = clients(data, operations);
  const result = await operator.runReadOnlyCheckoutReceiptCollector({
    uid: data.uid,
    sessionId: data.sessionId,
    plan: data.plan,
    interval: data.interval,
    configuredPrices: data.configuredPrices,
    stripe,
    store,
    receiptContract: await receiptModule,
    env: data.env,
    baseUrl: data.baseUrl,
    readJson,
    observedAtMs: data.observedAtMs,
  });
  assert.equal(result.assessment.ready, true, JSON.stringify(result.assessment.errors));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.readOperations, [
    'stripe.checkout_session.retrieve',
    'stripe.customer.retrieve',
    'stripe.subscription.retrieve',
    'firestore.user_subscription.get',
    'firestore.billing_account.get',
    'firestore.checkout_ledger.query',
    'http.get:health',
    'http.get:billing_prices',
  ]);
  assert.equal(operations.length, 8);
});

test('collector stops after the session read when Stripe references are absent', async () => {
  const data = await fixture();
  data.session.subscription = null;
  const operations = [];
  const { stripe, store, readJson } = clients(data, operations);
  const result = await operator.runReadOnlyCheckoutReceiptCollector({
    uid: data.uid,
    sessionId: data.sessionId,
    plan: data.plan,
    interval: data.interval,
    configuredPrices: data.configuredPrices,
    stripe,
    store,
    receiptContract: await receiptModule,
    env: data.env,
    baseUrl: data.baseUrl,
    readJson,
    observedAtMs: data.observedAtMs,
  });
  assert.equal(result.assessment, null);
  assert.deepEqual(result.errors, ['stripe:session_references_missing']);
  assert.equal(operations.length, 1);
});

test('collector blocks missing or ambiguous checkout ledger evidence', async () => {
  const data = await fixture();
  for (const count of [0, 2]) {
    const operations = [];
    const { stripe, store, readJson } = clients(data, operations, count);
    const result = await operator.runReadOnlyCheckoutReceiptCollector({
      uid: data.uid,
      sessionId: data.sessionId,
      plan: data.plan,
      interval: data.interval,
      configuredPrices: data.configuredPrices,
      stripe,
      store,
      receiptContract: await receiptModule,
      env: data.env,
      baseUrl: data.baseUrl,
      readJson,
      observedAtMs: data.observedAtMs,
    });
    assert.equal(result.assessment.ready, false);
    assert.ok(result.assessment.errors.includes('firestore:checkout_ledger_not_unique'));
  }
});

test('collector binds the receipt to deployed Firebase and Stripe fingerprints', async () => {
  const data = await fixture();
  data.health.stagingDeploymentIdentity = 'wrong-deployment';
  data.publicPricing.plans.pro.month.identityFingerprint = 'sha256:000000000000000000000000';
  const operations = [];
  const { stripe, store, readJson } = clients(data, operations);
  const result = await operator.runReadOnlyCheckoutReceiptCollector({
    uid: data.uid,
    sessionId: data.sessionId,
    plan: data.plan,
    interval: data.interval,
    configuredPrices: data.configuredPrices,
    stripe,
    store,
    receiptContract: await receiptModule,
    env: data.env,
    baseUrl: data.baseUrl,
    readJson,
    observedAtMs: data.observedAtMs,
  });
  assert.equal(result.assessment.ready, false);
  assert.ok(result.assessment.errors.includes('deployed_environment:identity_mismatch'));
  assert.ok(result.assessment.errors.includes('deployed_environment:checkout_price_mismatch'));
});

test('operator inputs accept only test checkout ids and known plans', () => {
  assert.deepEqual(operator.validateOperatorInput({
    uid: 'staging-user',
    sessionId: 'cs_test_valid_receipt',
    plan: 'studio',
    interval: 'year',
  }), []);
  const errors = operator.validateOperatorInput({
    uid: '../bad',
    sessionId: 'cs_live_forbidden',
    plan: 'max',
    interval: 'weekly',
  });
  assert.deepEqual(errors, [
    'input:invalid_uid',
    'input:invalid_test_checkout_session',
    'input:invalid_plan',
    'input:invalid_interval',
  ]);
});

test('Firebase configuration is bound to the selected project', () => {
  const serviceAccount = {
    type: 'service_account',
    project_id: 'staging-project',
    client_email: 'canary@staging-project.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nredacted\n-----END PRIVATE KEY-----\n',
  };
  assert.deepEqual(operator.validateFirebaseConfiguration({
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'staging-project',
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(serviceAccount),
  }).errors, []);
  assert.ok(operator.validateFirebaseConfiguration({
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'different-project',
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(serviceAccount),
  }).errors.includes('firebase:project_mismatch'));
});

test('receipt input must be an owner-only regular file', () => {
  const inputPath = path.join(outdir, 'receipt-input.json');
  fs.writeFileSync(inputPath, JSON.stringify({
    uid: 'staging-user',
    checkoutSessionId: 'cs_test_valid_receipt',
    plan: 'pro',
    interval: 'month',
  }), { mode: 0o600 });
  assert.deepEqual(operator.loadProtectedOperatorInput(inputPath).errors, []);
  fs.chmodSync(inputPath, 0o644);
  const readableErrors = operator.loadProtectedOperatorInput(inputPath).errors;
  if (process.platform === 'win32') assert.deepEqual(readableErrors, []);
  else assert.ok(readableErrors.includes('input_file:owner_only_permissions_required'));
});

test('operator source is read-only and does not print evidence identifiers', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.doesNotMatch(source, /\.create\s*\(|\.set\s*\(|\.update\s*\(|\.delete\s*\(|\.add\s*\(/);
  assert.doesNotMatch(source, /\.limit\s*\(/);
  assert.match(source, /\.where\('stripeObjectId', '==', sessionId\)[\s\S]*\.where\('type', '==', 'checkout'\)/);
  assert.doesNotMatch(source, /argument\('--uid'\)|argument\('--checkout-session-id'\)/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:sessionId|customerId|subscriptionId|uid)/);
  assert.match(source, /Writes attempted: 0/);
});

test('operator command blocks invalid input before provider calls without echoing env values', () => {
  const envPath = path.join(outdir, 'operator.env');
  const secret = 'sk_test_collector_secret_not_for_output';
  const serviceAccount = JSON.stringify({
    type: 'service_account',
    project_id: 'staging-project',
    client_email: 'canary@staging-project.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nredacted\\n-----END PRIVATE KEY-----\\n',
  });
  fs.writeFileSync(envPath, [
    'NODE_ENV=staging',
    'STAGING_HOSTNAME=talent-staging.187-77-8-98.nip.io',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID=staging-project',
    `FIREBASE_SERVICE_ACCOUNT_JSON=${serviceAccount}`,
    `STRIPE_SECRET_KEY=${secret}`,
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_collector_public',
    'STRIPE_BUILD_PUBLISHABLE_KEY=pk_test_collector_public',
    'STRIPE_WEBHOOK_SECRET=whsec_collector_test',
    'STRIPE_PRO_PRICE_ID=price_pro_month',
    'STRIPE_PRO_ANNUAL_PRICE_ID=price_pro_year',
    'STRIPE_STUDIO_PRICE_ID=price_studio_month',
    'STRIPE_STUDIO_ANNUAL_PRICE_ID=price_studio_year',
  ].join('\n'));
  const inputPath = path.join(outdir, 'invalid-receipt-input.json');
  fs.writeFileSync(inputPath, JSON.stringify({
    uid: 'bad',
    checkoutSessionId: 'cs_live_forbidden',
    plan: 'max',
    interval: 'week',
  }), { mode: 0o600 });
  const commandArgs = [
    scriptPath,
    `--staging-env-file=${envPath}`,
    `--receipt-input-file=${inputPath}`,
    '--base-url=https://talent-staging.187-77-8-98.nip.io',
  ];
  const result = spawnSync(process.execPath, commandArgs, { encoding: 'utf8', cwd: repoRoot });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 1);
  assert.match(output, /blocked before provider calls/);
  assert.match(output, /Writes attempted: 0/);
  assert.doesNotMatch(output, new RegExp(secret));
  assert.doesNotMatch(output, /cs_live_forbidden/);
  assert.doesNotMatch(commandArgs.join(' '), /staging-user|cs_test_/);
});
