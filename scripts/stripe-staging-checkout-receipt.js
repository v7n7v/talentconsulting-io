const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Stripe = require('stripe');
const { cert, deleteApp, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { build } = require('esbuild');
const { parseDotEnv } = require('./production-deploy-preflight');

const repoRoot = path.resolve(__dirname, '..');
const RECEIPT_ENV_KEYS = [
  'NODE_ENV',
  'STAGING_HOSTNAME',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_BUILD_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRO_PRICE_ID',
  'STRIPE_PRO_ANNUAL_PRICE_ID',
  'STRIPE_STUDIO_PRICE_ID',
  'STRIPE_STUDIO_ANNUAL_PRICE_ID',
];

function argument(name, fallback = '') {
  const direct = process.argv.find(value => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function aliasRootPlugin() {
  return {
    name: 'alias-root',
    setup(builder) {
      builder.onResolve({ filter: /^@\// }, args => {
        const target = path.join(repoRoot, args.path.slice(2));
        const resolved = [target, `${target}.ts`, `${target}.tsx`].find(candidate => fs.existsSync(candidate));
        return { path: resolved || target };
      });
    },
  };
}

async function loadReceiptContracts() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-receipt-'));
  const outfile = path.join(outdir, 'stripe-checkout-receipt.cjs');
  await build({
    stdin: {
      contents: [
        "export * from './lib/billing/stripe-staging-canary';",
        "export * from './lib/billing/stripe-checkout-canary-receipt';",
        "export * from './lib/billing-price-types';",
        "export * from './lib/billing/stripe-price-identity';",
        "export * from './lib/staging-deployment-identity';",
      ].join('\n'),
      resolveDir: repoRoot,
      sourcefile: 'stripe-checkout-receipt-entry.ts',
      loader: 'ts',
    },
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [aliasRootPlugin()],
  });
  return require(outfile);
}

async function getJson(url, timeoutMs = 10_000) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function objectId(value) {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object' && typeof value.id === 'string' ? value.id : null;
}

function validateOperatorInput({ uid, sessionId, plan, interval }) {
  const errors = [];
  if (!/^[A-Za-z0-9:_-]{6,128}$/.test(uid)) errors.push('input:invalid_uid');
  if (!/^cs_test_[A-Za-z0-9_]{6,200}$/.test(sessionId)) errors.push('input:invalid_test_checkout_session');
  if (plan !== 'pro' && plan !== 'studio') errors.push('input:invalid_plan');
  if (interval !== 'month' && interval !== 'year') errors.push('input:invalid_interval');
  return errors;
}

function loadProtectedOperatorInput(filePath) {
  const errors = [];
  if (!filePath) return { input: null, errors: ['input_file:required'] };
  let descriptor;
  try {
    const resolved = path.resolve(filePath);
    const linkStat = fs.lstatSync(resolved);
    if (!linkStat.isFile() || linkStat.isSymbolicLink()) {
      return { input: null, errors: ['input_file:regular_file_required'] };
    }
    descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(descriptor);
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      errors.push('input_file:owner_only_permissions_required');
    }
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
      errors.push('input_file:owner_mismatch');
    }
    if (stat.size <= 0 || stat.size > 4_096) errors.push('input_file:invalid_size');
    const parsed = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
    const input = {
      uid: typeof parsed?.uid === 'string' ? parsed.uid : '',
      sessionId: typeof parsed?.checkoutSessionId === 'string' ? parsed.checkoutSessionId : '',
      plan: typeof parsed?.plan === 'string' ? parsed.plan : '',
      interval: typeof parsed?.interval === 'string' ? parsed.interval : '',
    };
    errors.push(...validateOperatorInput(input));
    return { input, errors: [...new Set(errors)] };
  } catch {
    return { input: null, errors: ['input_file:invalid_or_unreadable'] };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function validateFirebaseConfiguration(env) {
  const errors = [];
  let serviceAccount = null;
  try {
    serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || '');
  } catch {
    errors.push('firebase:service_account_invalid');
  }
  if (!serviceAccount || serviceAccount.type !== 'service_account') {
    errors.push('firebase:service_account_invalid');
  }
  if (
    !env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    || serviceAccount?.project_id !== env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  ) {
    errors.push('firebase:project_mismatch');
  }
  if (
    typeof serviceAccount?.client_email !== 'string'
    || !serviceAccount.client_email.endsWith('.gserviceaccount.com')
    || typeof serviceAccount?.private_key !== 'string'
    || !serviceAccount.private_key.includes('BEGIN PRIVATE KEY')
  ) {
    errors.push('firebase:credential_shape_invalid');
  }
  return { errors: [...new Set(errors)], serviceAccount };
}

function firestoreReadClient(db) {
  return {
    async getUserSubscription(uid) {
      const snapshot = await db.collection('users').doc(uid).collection('subscription').doc('current').get();
      return snapshot.exists ? snapshot.data() : null;
    },
    async getBillingAccount(accountId) {
      const snapshot = await db.collection('billing_accounts').doc(accountId).get();
      return snapshot.exists ? snapshot.data() : null;
    },
    async findCheckoutLedger(sessionId) {
      const snapshot = await db.collection('finance_ledger')
        .where('stripeObjectId', '==', sessionId)
        .where('type', '==', 'checkout')
        .get();
      const matches = snapshot.docs.map(doc => doc.data());
      return { count: matches.length, record: matches.length === 1 ? matches[0] : null };
    },
  };
}

function deployedEnvironmentErrors({
  env,
  plan,
  interval,
  subscription,
  publicPricing,
  health,
  contracts,
}) {
  const errors = [];
  const expectedDeploymentIdentity = contracts.stagingDeploymentIdentityFingerprint(env);
  if (!expectedDeploymentIdentity || health?.stagingDeploymentIdentity !== expectedDeploymentIdentity) {
    errors.push('deployed_environment:identity_mismatch');
  }
  if (health?.status !== 'ok') errors.push('deployed_environment:health_not_ok');
  const normalized = contracts.normalizePublicBillingPrices(publicPricing);
  const deployed = normalized.plans[plan][interval];
  const price = subscription.items?.data?.[0]?.price;
  if (
    !normalized.checkout.available
    || normalized.checkout.options[plan][interval] !== true
    || deployed.sourceStatus !== 'verified'
    || deployed.identityFingerprint !== contracts.stripePriceIdentityFingerprint(price?.id || '')
    || deployed.sourceInterval !== interval
    || deployed.unitAmount !== price?.unit_amount
    || deployed.currency !== price?.currency
  ) {
    errors.push('deployed_environment:checkout_price_mismatch');
  }
  return errors;
}

function appendAssessmentErrors(assessment, extraErrors) {
  const errors = [...new Set([...assessment.errors, ...extraErrors])];
  return {
    ...assessment,
    ready: errors.length === 0,
    status: errors.length === 0 ? 'verified' : 'blocked',
    errors,
  };
}

async function runReadOnlyCheckoutReceiptCollector({
  uid,
  sessionId,
  plan,
  interval,
  configuredPrices,
  stripe,
  store,
  receiptContract,
  env,
  baseUrl,
  readJson = getJson,
  observedAtMs = Date.now(),
}) {
  const readOperations = [];
  readOperations.push('stripe.checkout_session.retrieve');
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const customerId = objectId(session.customer);
  const subscriptionId = objectId(session.subscription);
  if (!customerId || !subscriptionId) {
    return {
      assessment: null,
      errors: ['stripe:session_references_missing'],
      readOperations,
    };
  }

  readOperations.push('stripe.customer.retrieve');
  const customer = await stripe.customers.retrieve(customerId);
  readOperations.push('stripe.subscription.retrieve');
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  readOperations.push('firestore.user_subscription.get');
  const userSubscription = await store.getUserSubscription(uid);
  readOperations.push('firestore.billing_account.get');
  const billingAccount = await store.getBillingAccount(customerId);
  readOperations.push('firestore.checkout_ledger.query');
  const checkoutLedger = await store.findCheckoutLedger(sessionId);
  readOperations.push('http.get:health');
  const health = await readJson(`${baseUrl}/api/health`);
  readOperations.push('http.get:billing_prices');
  const publicPricing = await readJson(`${baseUrl}/api/billing/prices`);

  const assessment = receiptContract.assessStripeCheckoutCanaryReceipt({
    expected: { uid, plan, interval },
    configuredPrices,
    session,
    customer,
    subscription,
    userSubscription,
    billingAccount,
    checkoutLedger: checkoutLedger.record,
    observedAtMs,
  });
  return {
    assessment: appendAssessmentErrors(
      assessment,
      [
        ...(checkoutLedger.count === 1 ? [] : ['firestore:checkout_ledger_not_unique']),
        ...deployedEnvironmentErrors({
          env,
          plan,
          interval,
          subscription,
          publicPricing,
          health,
          contracts: receiptContract,
        }),
      ],
    ),
    errors: [],
    readOperations,
  };
}

async function main() {
  const envPath = path.resolve(argument('--staging-env-file', 'deploy/staging/.env.staging'));
  if (!fs.existsSync(envPath)) {
    console.error('Stripe checkout receipt blocked before provider calls:');
    console.error('- env_file:not_found');
    console.error('Writes attempted: 0');
    process.exitCode = 1;
    return;
  }
  const fileEnv = parseDotEnv(fs.readFileSync(envPath, 'utf8'));
  const env = Object.fromEntries(RECEIPT_ENV_KEYS.flatMap(key => (
    Object.prototype.hasOwnProperty.call(fileEnv, key) ? [[key, fileEnv[key]]] : []
  )));
  env.STRIPE_BUILD_PUBLISHABLE_KEY ||= env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  const protectedInput = loadProtectedOperatorInput(argument('--receipt-input-file'));
  const firebase = validateFirebaseConfiguration(env);
  const contracts = await loadReceiptContracts();
  const baseUrl = argument('--base-url', env.STAGING_HOSTNAME ? `https://${env.STAGING_HOSTNAME}` : '');
  const configuration = contracts.assessStripeStagingCanaryConfiguration(env, baseUrl);
  const errors = [...protectedInput.errors, ...firebase.errors, ...configuration.errors];
  if (errors.length > 0) {
    console.error('Stripe checkout receipt blocked before provider calls:');
    for (const error of [...new Set(errors)]) console.error(`- ${error}`);
    console.error('Writes attempted: 0');
    process.exitCode = 1;
    return;
  }
  const { uid, sessionId, plan, interval } = protectedInput.input;

  const app = initializeApp({
    credential: cert(firebase.serviceAccount),
    projectId: firebase.serviceAccount.project_id,
  }, `stripe-checkout-receipt-${Date.now()}`);
  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' });
    const result = await runReadOnlyCheckoutReceiptCollector({
      uid,
      sessionId,
      plan,
      interval,
      configuredPrices: {
        pro: [env.STRIPE_PRO_PRICE_ID, env.STRIPE_PRO_ANNUAL_PRICE_ID],
        studio: [env.STRIPE_STUDIO_PRICE_ID, env.STRIPE_STUDIO_ANNUAL_PRICE_ID],
      },
      stripe,
      store: firestoreReadClient(getFirestore(app)),
      receiptContract: contracts,
      env,
      baseUrl: configuration.origin,
    });
    const assessmentErrors = result.assessment?.errors || result.errors;
    if (!result.assessment?.ready) {
      console.error('Stripe checkout receipt verification failed:');
      for (const error of assessmentErrors) console.error(`- ${error}`);
      console.error('Writes attempted: 0');
      process.exitCode = 1;
      return;
    }
    console.log('Stripe checkout receipt verified:');
    console.log(`- plan: ${plan === 'studio' ? 'Talent Max' : 'Talent Pro'}`);
    console.log(`- interval: ${interval}`);
    console.log('- evidence operations: eight read-only checks');
    console.log('- Sona contract: truth-locked and review required');
    console.log('- external auto-apply: disabled');
    console.log('- writes attempted: 0');
  } finally {
    await deleteApp(app);
  }
}

if (require.main === module) {
  main().catch(() => {
    console.error('Stripe checkout receipt failed: provider_or_database_read_failed');
    console.error('Writes attempted: 0');
    process.exitCode = 1;
  });
}

module.exports = {
  RECEIPT_ENV_KEYS,
  appendAssessmentErrors,
  argument,
  firestoreReadClient,
  getJson,
  loadProtectedOperatorInput,
  objectId,
  runReadOnlyCheckoutReceiptCollector,
  validateFirebaseConfiguration,
  validateOperatorInput,
  deployedEnvironmentErrors,
};
