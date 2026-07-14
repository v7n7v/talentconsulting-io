const { randomUUID } = require('node:crypto');
const Stripe = require('stripe');
const { cert, deleteApp, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { readSelectedStagingEnvFile } = require('./staging-env-file');

const CONFIRMATION_PHRASE = 'CREATE_AND_EXPIRE_TEST_CHECKOUT';
const CANARY_ENV_KEYS = [
  'NODE_ENV',
  'STAGING_HOSTNAME',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRO_PRICE_ID',
];

function argument(name, fallback = '') {
  const direct = process.argv.find(value => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function validateResumeCanaryConfiguration(env, baseUrl, confirmation) {
  const errors = [];
  let serviceAccount = null;
  try {
    serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || '');
  } catch {
    errors.push('firebase:service_account_invalid');
  }
  let origin = null;
  try {
    origin = new URL(baseUrl);
  } catch {
    errors.push('staging:base_url_invalid');
  }
  if (confirmation !== CONFIRMATION_PHRASE) errors.push('confirmation:exact_phrase_required');
  if (env.NODE_ENV !== 'production') errors.push('staging:production_runtime_required');
  if (!env.STAGING_HOSTNAME || !String(env.STAGING_HOSTNAME).includes('staging')) {
    errors.push('staging:hostname_marker_required');
  }
  if (
    !origin
    || origin.protocol !== 'https:'
    || origin.hostname !== env.STAGING_HOSTNAME
    || origin.pathname !== '/'
  ) {
    errors.push('staging:origin_mismatch');
  }
  if (!String(env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')) {
    errors.push('stripe:test_secret_required');
  }
  if (!String(env.STRIPE_PRO_PRICE_ID || '').startsWith('price_')) {
    errors.push('stripe:test_price_required');
  }
  if (!env.NEXT_PUBLIC_FIREBASE_API_KEY || String(env.NEXT_PUBLIC_FIREBASE_API_KEY).length < 20) {
    errors.push('firebase:web_api_key_required');
  }
  if (!String(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '').includes('staging')) {
    errors.push('firebase:staging_project_required');
  }
  if (
    !serviceAccount
    || serviceAccount.type !== 'service_account'
    || serviceAccount.project_id !== env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    || typeof serviceAccount.client_email !== 'string'
    || !serviceAccount.client_email.endsWith('.gserviceaccount.com')
    || typeof serviceAccount.private_key !== 'string'
    || !serviceAccount.private_key.includes('BEGIN PRIVATE KEY')
  ) {
    errors.push('firebase:service_account_invalid');
  }
  return { errors: [...new Set(errors)], serviceAccount, origin: origin?.origin || null };
}

async function exchangeCustomToken(apiKey, customToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error('firebase_custom_token_exchange_failed');
  const payload = await response.json();
  if (typeof payload.idToken !== 'string') throw new Error('firebase_id_token_missing');
  return payload.idToken;
}

function apiClient(baseUrl) {
  async function request(pathname, token, method, body) {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => null);
    return { ok: response.ok, statusCode: response.status, payload };
  }
  return {
    get(pathname, token) { return request(pathname, token, 'GET'); },
    post(pathname, token, body) { return request(pathname, token, 'POST', body); },
  };
}

function sessionIdFromClientSecret(value) {
  if (typeof value !== 'string' || !value.startsWith('cs_test_') || !value.includes('_secret_')) return null;
  return value.slice(0, value.indexOf('_secret_'));
}

async function runStripeResumeCanary({ auth, store, stripe, api, issueIdToken, nonce }) {
  const ownerUid = `staging-resume-owner-${nonce}`;
  const otherUid = `staging-resume-other-${nonce}`;
  const createdUsers = [];
  let sessionId = null;
  let customerId = null;
  const operations = [];
  try {
    await auth.createUser({ uid: ownerUid, email: `stripe-resume+${nonce}@talentconsulting.io`, emailVerified: true });
    createdUsers.push(ownerUid);
    await auth.createUser({ uid: otherUid, email: `stripe-resume-other+${nonce}@talentconsulting.io`, emailVerified: true });
    createdUsers.push(otherUid);
    operations.push('firebase.auth.create:2');
    const [ownerToken, otherToken] = await Promise.all([
      issueIdToken(ownerUid),
      issueIdToken(otherUid),
    ]);
    operations.push('firebase.auth.token:2');

    const checkout = await api.post('/api/stripe/subscribe', ownerToken, {
      plan: 'pro',
      interval: 'month',
      source: 'direct',
    });
    operations.push('talent.checkout.create:1');
    if (!checkout.ok) throw new Error('talent_checkout_create_failed');
    sessionId = sessionIdFromClientSecret(checkout.payload?.clientSecret);
    if (!sessionId) throw new Error('talent_checkout_secret_invalid');

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    operations.push('stripe.checkout.retrieve:1');
    customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
    if (
      session.livemode
      || session.status !== 'open'
      || session.payment_status !== 'unpaid'
      || session.subscription
      || session.payment_intent
      || session.metadata?.firebaseUid !== ownerUid
    ) {
      throw new Error('stripe_checkout_not_nonpaying_test_session');
    }

    const ownerStatus = await api.get('/api/stripe/checkout/status', ownerToken);
    const ownerResume = await api.post('/api/stripe/checkout/resume', ownerToken);
    const otherStatus = await api.get('/api/stripe/checkout/status', otherToken);
    const otherResume = await api.post('/api/stripe/checkout/resume', otherToken);
    operations.push('talent.checkout.verify:4');
    if (
      ownerStatus.payload?.status !== 'open'
      || ownerResume.payload?.status !== 'open'
      || ownerResume.payload?.mode !== 'embedded'
      || ownerResume.payload?.clientSecret !== checkout.payload.clientSecret
      || otherStatus.payload?.status !== 'idle'
      || otherResume.payload?.status !== 'idle'
    ) {
      throw new Error('talent_checkout_ownership_verification_failed');
    }

    await stripe.checkout.sessions.expire(sessionId);
    operations.push('stripe.checkout.expire:1');
    const expiredStatus = await api.get('/api/stripe/checkout/status', ownerToken);
    operations.push('talent.checkout.expiry_verify:1');
    if (expiredStatus.payload?.status !== 'expired') throw new Error('talent_checkout_expiry_cleanup_failed');
    const checkoutGuard = await store.readCheckoutGuard(ownerUid);
    const subscription = await store.readSubscription(ownerUid);
    operations.push('firestore.checkout_guard.read:1', 'firestore.subscription.read:1');
    if (checkoutGuard?.activeReservationId || (subscription && subscription.plan !== 'free')) {
      throw new Error('talent_checkout_cleanup_or_entitlement_failed');
    }
    return {
      verified: true,
      paymentCompleted: false,
      entitlementGranted: false,
      externalApplicationsSubmitted: 0,
      operations,
    };
  } finally {
    const cleanupErrors = [];
    const customerIds = new Set(customerId ? [customerId] : []);
    const discoveredCustomers = await stripe.customers.search({
      query: `metadata['firebaseUid']:'${ownerUid}'`,
      limit: 100,
    }).catch(() => {
      cleanupErrors.push('stripe_customer_search_failed');
      return { data: [] };
    });
    if (discoveredCustomers.has_more) cleanupErrors.push('stripe_customer_search_truncated');
    for (const customer of discoveredCustomers.data || []) customerIds.add(customer.id);
    for (const id of customerIds) {
      const sessions = await stripe.checkout.sessions.list({ customer: id, limit: 100 })
        .catch(() => {
          cleanupErrors.push('stripe_session_list_failed');
          return { data: [] };
        });
      if (sessions.has_more) cleanupErrors.push('stripe_session_list_truncated');
      for (const session of sessions.data || []) {
        if (session.status === 'open') {
          await stripe.checkout.sessions.expire(session.id)
            .catch(() => cleanupErrors.push('stripe_session_expire_failed'));
        }
      }
      await stripe.customers.del(id).catch(() => cleanupErrors.push('stripe_customer_delete_failed'));
    }
    for (const uid of createdUsers) {
      await store.deleteUserData(uid).catch(() => cleanupErrors.push('firestore_user_delete_failed'));
      await auth.deleteUser(uid).catch(() => cleanupErrors.push('firebase_user_delete_failed'));
    }
    if (cleanupErrors.length > 0) throw new Error('stripe_resume_canary_cleanup_failed');
  }
}

async function main() {
  const selected = readSelectedStagingEnvFile(argument('--staging-env-file'));
  if (!selected.env) {
    console.error(`Stripe resume canary blocked before provider calls: ${selected.error}`);
    console.error('Provider writes attempted: 0');
    process.exitCode = 1;
    return;
  }
  const env = Object.fromEntries(CANARY_ENV_KEYS.flatMap(key => (
    Object.prototype.hasOwnProperty.call(selected.env, key) ? [[key, selected.env[key]]] : []
  )));
  const baseUrl = argument('--base-url', env.STAGING_HOSTNAME ? `https://${env.STAGING_HOSTNAME}` : '');
  const configuration = validateResumeCanaryConfiguration(env, baseUrl, argument('--confirm'));
  if (configuration.errors.length > 0) {
    console.error('Stripe resume canary blocked before provider calls:');
    for (const error of configuration.errors) console.error(`- ${error}`);
    console.error('Provider writes attempted: 0');
    process.exitCode = 1;
    return;
  }

  const app = initializeApp({
    credential: cert(configuration.serviceAccount),
    projectId: configuration.serviceAccount.project_id,
  }, `stripe-resume-canary-${Date.now()}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-02-25.clover',
    timeout: 10_000,
    maxNetworkRetries: 0,
  });
  const store = {
    async readCheckoutGuard(uid) {
      const snapshot = await db.collection('users').doc(uid).collection('billing').doc('checkoutGuard').get();
      return snapshot.exists ? snapshot.data() : null;
    },
    async readSubscription(uid) {
      const snapshot = await db.collection('users').doc(uid).collection('subscription').doc('current').get();
      return snapshot.exists ? snapshot.data() : null;
    },
    async deleteUserData(uid) {
      await db.recursiveDelete(db.collection('users').doc(uid));
    },
  };
  try {
    const result = await runStripeResumeCanary({
      auth,
      store,
      stripe,
      api: apiClient(configuration.origin),
      issueIdToken: async uid => exchangeCustomToken(
        env.NEXT_PUBLIC_FIREBASE_API_KEY,
        await auth.createCustomToken(uid),
      ),
      nonce: randomUUID().replace(/-/g, '').slice(0, 12),
    });
    console.log(JSON.stringify({
      status: result.verified ? 'verified' : 'blocked',
      paymentCompleted: result.paymentCompleted,
      entitlementGranted: result.entitlementGranted,
      externalApplicationsSubmitted: result.externalApplicationsSubmitted,
      operationCount: result.operations.length,
      cleanup: 'complete',
    }, null, 2));
  } finally {
    await deleteApp(app);
  }
}

if (require.main === module) {
  main().catch(() => {
    console.error('Stripe resume canary failed: controlled_test_or_cleanup_failed');
    process.exitCode = 1;
  });
}

module.exports = {
  CANARY_ENV_KEYS,
  CONFIRMATION_PHRASE,
  apiClient,
  argument,
  runStripeResumeCanary,
  sessionIdFromClientSecret,
  validateResumeCanaryConfiguration,
};
