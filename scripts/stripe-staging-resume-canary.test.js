const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts/stripe-staging-resume-canary.js');
const operator = require(scriptPath);

function validConfiguration() {
  return {
    env: {
      NODE_ENV: 'production',
      STAGING_HOSTNAME: 'talent-staging.example.test',
      NEXT_PUBLIC_FIREBASE_API_KEY: 'firebase-web-api-key-for-staging',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'talent-staging',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        type: 'service_account',
        project_id: 'talent-staging',
        client_email: 'staging@talent-staging.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
      }),
      STRIPE_SECRET_KEY: 'sk_test_staging_resume',
      STRIPE_PRO_PRICE_ID: 'price_staging_pro',
    },
    baseUrl: 'https://talent-staging.example.test',
    confirmation: operator.CONFIRMATION_PHRASE,
  };
}

test('configuration requires exact staging, test-mode, Firebase, and confirmation boundaries', () => {
  const valid = validConfiguration();
  assert.deepEqual(operator.validateResumeCanaryConfiguration(
    valid.env,
    valid.baseUrl,
    valid.confirmation,
  ).errors, []);

  const unsafe = {
    ...valid.env,
    STAGING_HOSTNAME: 'talentconsulting.io',
    STRIPE_SECRET_KEY: 'sk_live_forbidden',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'other-project',
  };
  const errors = operator.validateResumeCanaryConfiguration(
    unsafe,
    'https://talentconsulting.io',
    'yes',
  ).errors;
  assert.ok(errors.includes('confirmation:exact_phrase_required'));
  assert.ok(errors.includes('staging:hostname_marker_required'));
  assert.ok(errors.includes('stripe:test_secret_required'));
  assert.ok(errors.includes('firebase:staging_project_required'));
  assert.ok(errors.includes('firebase:service_account_invalid'));
});

function canaryFixture({ crossUserLeak = false } = {}) {
  const createdUsers = [];
  const deletedUsers = [];
  const deletedUserData = [];
  const deletedCustomers = [];
  let expired = false;
  let guardActive = true;
  const ownerToken = 'owner-token';
  const otherToken = 'other-token';
  const session = {
    id: 'cs_test_resume_canary',
    livemode: false,
    status: 'open',
    payment_status: 'unpaid',
    subscription: null,
    payment_intent: null,
    customer: 'cus_resume_canary',
    metadata: {},
  };
  const stripe = {
    checkout: {
      sessions: {
        async retrieve() { return { ...session, status: expired ? 'expired' : 'open' }; },
        async expire() { expired = true; return { ...session, status: 'expired' }; },
        async list() { return { data: [{ ...session, status: expired ? 'expired' : 'open' }] }; },
      },
    },
    customers: {
      async search() { return { data: [{ id: 'cus_resume_canary' }] }; },
      async del(id) { deletedCustomers.push(id); return { id, deleted: true }; },
    },
  };
  const auth = {
    async createUser(input) {
      createdUsers.push(input.uid);
      if (input.uid.includes('owner')) session.metadata.firebaseUid = input.uid;
      return input;
    },
    async deleteUser(uid) { deletedUsers.push(uid); },
  };
  const store = {
    async readCheckoutGuard() { return { activeReservationId: guardActive ? 'reservation' : null }; },
    async readSubscription() { return null; },
    async deleteUserData(uid) { deletedUserData.push(uid); },
  };
  const api = {
    async post(pathname, token) {
      if (pathname === '/api/stripe/subscribe') {
        return { ok: true, payload: { clientSecret: 'cs_test_resume_canary_secret_value' } };
      }
      if (pathname === '/api/stripe/checkout/resume') {
        if (token === otherToken) {
          return { ok: true, payload: crossUserLeak
            ? { status: 'open', mode: 'embedded', clientSecret: 'cs_test_resume_canary_secret_value' }
            : { status: 'idle' } };
        }
        return { ok: true, payload: { status: 'open', mode: 'embedded', clientSecret: 'cs_test_resume_canary_secret_value' } };
      }
      throw new Error(`unexpected_post:${pathname}`);
    },
    async get(pathname, token) {
      if (pathname !== '/api/stripe/checkout/status') throw new Error(`unexpected_get:${pathname}`);
      if (token === otherToken) return { ok: true, payload: { status: 'idle' } };
      if (expired) {
        guardActive = false;
        return { ok: true, payload: { status: 'expired' } };
      }
      return { ok: true, payload: { status: 'open' } };
    },
  };
  return {
    auth,
    store,
    stripe,
    api,
    issueIdToken: async uid => uid.includes('owner') ? ownerToken : otherToken,
    evidence: { createdUsers, deletedUsers, deletedUserData, deletedCustomers, session },
  };
}

test('canary proves same-user resume, cross-user denial, expiry, no entitlement, and cleanup', async () => {
  const fixture = canaryFixture();
  const result = await operator.runStripeResumeCanary({
    ...fixture,
    nonce: 'abc123def456',
  });
  assert.equal(result.verified, true);
  assert.equal(result.paymentCompleted, false);
  assert.equal(result.entitlementGranted, false);
  assert.equal(result.externalApplicationsSubmitted, 0);
  assert.equal(fixture.evidence.createdUsers.length, 2);
  assert.deepEqual(fixture.evidence.deletedUsers.sort(), fixture.evidence.createdUsers.sort());
  assert.deepEqual(fixture.evidence.deletedUserData.sort(), fixture.evidence.createdUsers.sort());
  assert.deepEqual(fixture.evidence.deletedCustomers, ['cus_resume_canary']);
});

test('cross-user resume leakage fails the canary and still cleans every test artifact', async () => {
  const fixture = canaryFixture({ crossUserLeak: true });
  await assert.rejects(operator.runStripeResumeCanary({
    ...fixture,
    nonce: 'abc123def456',
  }), /ownership_verification_failed/);
  assert.equal(fixture.evidence.deletedUsers.length, 2);
  assert.equal(fixture.evidence.deletedUserData.length, 2);
  assert.deepEqual(fixture.evidence.deletedCustomers, ['cus_resume_canary']);
});

test('cleanup failure overrides success and cannot be reported as complete', async () => {
  const fixture = canaryFixture();
  fixture.stripe.customers.del = async () => { throw new Error('provider delete failed'); };
  await assert.rejects(operator.runStripeResumeCanary({
    ...fixture,
    nonce: 'abc123def456',
  }), /cleanup_failed/);
  assert.equal(fixture.evidence.deletedUsers.length, 2);
  assert.equal(fixture.evidence.deletedUserData.length, 2);
});

test('operator blocks before provider calls when the protected env is absent', () => {
  const result = spawnSync(process.execPath, [
    scriptPath,
    '--staging-env-file',
    path.join(os.tmpdir(), `missing-${Date.now()}.env`),
    '--confirm',
    operator.CONFIRMATION_PHRASE,
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /blocked before provider calls/);
  assert.match(result.stderr, /Provider writes attempted: 0/);
});

test('operator has no payment completion, entitlement, or external-application mutation path', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.doesNotMatch(source, /paymentIntents\.create|subscriptions\.create|invoices\.pay/);
  assert.doesNotMatch(source, /apply-pipeline|externalApplicationsSubmitted:\s*[1-9]/);
  assert.match(source, /payment_status !== 'unpaid'/);
  assert.match(source, /session\.subscription/);
  assert.match(source, /session\.payment_intent/);
  assert.match(source, /checkout\.sessions\.expire/);
  assert.match(source, /customers\.del/);
  assert.match(source, /source:\s*'direct'/);
  assert.doesNotMatch(source, /console\.log\([^\n]*(clientSecret|sessionId|customerId|ownerToken|otherToken)/);
});
