const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-checkout-recovery-'));
const outfile = path.join(outdir, 'stripe-checkout-recovery.cjs');
const supportOutfile = path.join(outdir, 'stripe-account-review-support.cjs');
const statusOutfile = path.join(outdir, 'stripe-checkout-status.cjs');
const recoveryModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-checkout-recovery.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(outfile));
const supportModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-account-review-support.ts')],
  outfile: supportOutfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(supportOutfile));
const statusModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-checkout-status.ts')],
  outfile: statusOutfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(statusOutfile));

test('billing support context accepts only the known non-sensitive issue marker', async () => {
  const {
    issueCodeForStripeAccountReviewContext,
    normalizeStripeAccountReviewIssueCode,
    STRIPE_ACCOUNT_REVIEW_ISSUE_CODE,
  } = await supportModule;
  assert.equal(
    issueCodeForStripeAccountReviewContext('billing-account-review'),
    STRIPE_ACCOUNT_REVIEW_ISSUE_CODE,
  );
  assert.equal(issueCodeForStripeAccountReviewContext('customer-count=21'), null);
  assert.equal(normalizeStripeAccountReviewIssueCode(STRIPE_ACCOUNT_REVIEW_ISSUE_CODE), STRIPE_ACCOUNT_REVIEW_ISSUE_CODE);
  assert.equal(normalizeStripeAccountReviewIssueCode('raw_stripe_error'), null);
});

test('existing subscriptions recover through billing management without a retry loop', async () => {
  const { resolveStripeCheckoutRecovery } = await recoveryModule;
  const recovery = resolveStripeCheckoutRecovery({
    code: 'STRIPE_SUBSCRIPTION_EXISTS',
    manageBilling: true,
    error: 'provider detail that should not become the action',
  });
  assert.equal(recovery.primaryAction, 'manage_billing');
  assert.equal(recovery.primaryLabel, 'Manage billing');
  assert.equal(recovery.retryAllowed, false);
});

test('an active checkout explains the lock and allows an intentional check', async () => {
  const { resolveStripeCheckoutRecovery } = await recoveryModule;
  const recovery = resolveStripeCheckoutRecovery({ code: 'STRIPE_CHECKOUT_IN_PROGRESS' });
  assert.equal(recovery.title, 'Checkout is already open');
  assert.equal(recovery.primaryLabel, 'Check again');
  assert.equal(recovery.retryAllowed, true);
  assert.match(recovery.message, /Finish or close/);
});

test('runtime readiness and unknown failures keep distinct recovery actions', async () => {
  const { resolveStripeCheckoutRecovery } = await recoveryModule;
  assert.equal(resolveStripeCheckoutRecovery({
    code: 'STRIPE_CHECKOUT_NOT_READY',
    error: 'Secure checkout is temporarily unavailable.',
  }).primaryAction, 'check_availability');
  const fallback = resolveStripeCheckoutRecovery({ error: 'Network failed' });
  assert.equal(fallback.primaryAction, 'retry');
  assert.equal(fallback.message, 'Checkout could not be opened. Check your connection and try again.');
  assert.doesNotMatch(fallback.message, /Network failed/);
});

test('price verification failure refreshes bounded availability without exposing provider errors', async () => {
  const { resolveStripeCheckoutRecovery } = await recoveryModule;
  const recovery = resolveStripeCheckoutRecovery({
    code: 'STRIPE_PRICE_VERIFICATION_UNAVAILABLE',
    error: 'raw provider timeout detail',
  });
  assert.equal(recovery.title, 'Price verification is unavailable');
  assert.equal(recovery.primaryAction, 'check_availability');
  assert.equal(recovery.primaryLabel, 'Check prices');
  assert.equal(recovery.retryAllowed, false);
  assert.doesNotMatch(recovery.message, /raw provider timeout detail/);
});

test('commercial safety gates pause checkout without encouraging a retry loop', async () => {
  const { resolveStripeCheckoutRecovery } = await recoveryModule;
  for (const code of [
    'CHECKOUT_PROMOTION_POLICY_INVALID',
    'CHECKOUT_PROMOTION_INVENTORY_UNVERIFIED',
    'CHECKOUT_ECONOMICS_BLOCKED',
  ]) {
    const recovery = resolveStripeCheckoutRecovery({ code });
    assert.equal(recovery.code, code);
    assert.equal(recovery.primaryAction, 'check_availability');
    assert.equal(recovery.retryAllowed, false);
    assert.match(recovery.message, /No checkout was created/i);
  }
});

test('account evidence failures retry only after confirming no checkout was created', async () => {
  const { resolveStripeCheckoutRecovery } = await recoveryModule;
  for (const code of [
    'STRIPE_CUSTOMER_DISCOVERY_UNAVAILABLE',
    'STRIPE_SUBSCRIPTION_HISTORY_UNAVAILABLE',
  ]) {
    const recovery = resolveStripeCheckoutRecovery({ code, error: 'raw Stripe detail' });
    assert.equal(recovery.title, 'Billing history check is unavailable');
    assert.equal(recovery.primaryAction, 'retry');
    assert.equal(recovery.primaryLabel, 'Try again');
    assert.equal(recovery.retryAllowed, true);
    assert.match(recovery.message, /No checkout was created/);
    assert.doesNotMatch(recovery.message, /raw Stripe detail/);
  }
});

test('customer preparation failure retries only after confirming no checkout was created', async () => {
  const { resolveStripeCheckoutRecovery } = await recoveryModule;
  const recovery = resolveStripeCheckoutRecovery({
    code: 'STRIPE_CUSTOMER_PREPARATION_UNAVAILABLE',
    error: 'raw provider write detail',
  });
  assert.equal(recovery.title, 'Billing account preparation is unavailable');
  assert.equal(recovery.primaryAction, 'retry');
  assert.equal(recovery.primaryLabel, 'Try again');
  assert.equal(recovery.retryAllowed, true);
  assert.match(recovery.message, /No checkout was created/);
  assert.doesNotMatch(recovery.message, /raw provider write detail/);
});

test('Session rejection and ambiguous acceptance have different recovery actions', async () => {
  const { resolveStripeCheckoutRecovery } = await recoveryModule;
  const rejected = resolveStripeCheckoutRecovery({
    code: 'STRIPE_CHECKOUT_CREATION_UNAVAILABLE',
    error: 'raw provider rejection',
  });
  assert.equal(rejected.title, 'Checkout could not be opened');
  assert.equal(rejected.primaryAction, 'retry');
  assert.equal(rejected.retryAllowed, true);
  assert.match(rejected.message, /No checkout was created/);
  assert.doesNotMatch(rejected.message, /raw provider rejection/);

  const ambiguous = resolveStripeCheckoutRecovery({
    code: 'STRIPE_CHECKOUT_CONFIRMATION_PENDING',
    error: 'raw transport timeout',
  });
  assert.equal(ambiguous.title, 'Checkout confirmation is pending');
  assert.equal(ambiguous.primaryAction, 'check_availability');
  assert.equal(ambiguous.primaryLabel, 'Check status');
  assert.equal(ambiguous.retryAllowed, false);
  assert.match(ambiguous.message, /prevent a duplicate checkout/);
  assert.doesNotMatch(ambiguous.message, /raw transport timeout/);
});

test('public checkout statuses preserve locks until idle or proven expiry', async () => {
  const {
    parseStripeCheckoutPublicStatus,
    parseStripeCheckoutResumeResult,
    recoveryForStripeCheckoutStatus,
  } = await statusModule;
  for (const status of ['idle', 'pending', 'open', 'complete', 'expired']) {
    assert.equal(parseStripeCheckoutPublicStatus({ status }), status);
  }
  assert.equal(parseStripeCheckoutPublicStatus({ status: 'unknown' }), null);
  assert.equal(parseStripeCheckoutPublicStatus({ checkoutSessionId: 'cs_secret' }), null);
  assert.equal(recoveryForStripeCheckoutStatus('idle'), null);
  assert.equal(recoveryForStripeCheckoutStatus('expired'), null);
  const pending = recoveryForStripeCheckoutStatus('pending');
  assert.equal(pending.primaryAction, 'check_availability');
  assert.equal(pending.retryAllowed, false);
  const open = recoveryForStripeCheckoutStatus('open');
  assert.equal(open.title, 'Checkout is still open');
  assert.equal(open.primaryAction, 'resume_checkout');
  assert.equal(open.primaryLabel, 'Resume checkout');
  assert.equal(open.retryAllowed, false);
  const complete = recoveryForStripeCheckoutStatus('complete');
  assert.equal(complete.primaryAction, 'manage_billing');
  assert.equal(complete.primaryLabel, 'View billing');
  assert.equal(complete.retryAllowed, false);

  assert.deepEqual(parseStripeCheckoutResumeResult({
    status: 'open',
    mode: 'embedded',
    clientSecret: 'cs_test_one_secret_example',
  }), {
    status: 'open',
    mode: 'embedded',
    clientSecret: 'cs_test_one_secret_example',
  });
  assert.deepEqual(parseStripeCheckoutResumeResult({
    status: 'open',
    mode: 'hosted',
    url: 'https://checkout.stripe.com/c/pay/cs_test_one',
  }), {
    status: 'open',
    mode: 'hosted',
    url: 'https://checkout.stripe.com/c/pay/cs_test_one',
  });
  assert.equal(parseStripeCheckoutResumeResult({
    status: 'open',
    mode: 'hosted',
    url: 'https://checkout.stripe.com.evil.test/cs_test_one',
  }), null);
  assert.equal(parseStripeCheckoutResumeResult({
    status: 'open',
    mode: 'embedded',
    clientSecret: 'cs_test_one',
  }), null);
});

test('abnormal account history requires support instead of repeating checkout', async () => {
  const { resolveStripeCheckoutRecovery } = await recoveryModule;
  const recovery = resolveStripeCheckoutRecovery({
    code: 'STRIPE_ACCOUNT_REVIEW_REQUIRED',
    error: 'raw customer count and provider details',
  });
  assert.equal(recovery.title, 'Billing account needs review');
  assert.equal(recovery.primaryAction, 'contact_support');
  assert.equal(recovery.primaryLabel, 'Get help');
  assert.equal(recovery.retryAllowed, false);
  assert.match(recovery.message, /No checkout was created/);
  assert.doesNotMatch(recovery.message, /raw customer count/);
});

test('both upgrade surfaces render typed recovery actions', () => {
  const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  for (const source of [read('app/suite/upgrade/page.tsx'), read('components/UpgradeModal.tsx')]) {
    assert.match(source, /resolveStripeCheckoutRecovery/);
    assert.match(source, /primaryAction === 'manage_billing'/);
    assert.match(source, /primaryAction === 'check_availability'/);
    assert.match(source, /primaryAction === 'contact_support'/);
    assert.match(source, /\/suite\/feedback\?context=billing-account-review/);
    assert.match(source, /primaryLabel/);
    assert.match(source, /authFetch\('\/api\/stripe\/checkout\/status'/);
    assert.match(source, /authFetch\('\/api\/stripe\/checkout\/resume'/);
    assert.match(source, /parseStripeCheckoutPublicStatus/);
    assert.match(source, /recoveryForStripeCheckoutStatus/);
    assert.match(source, /parseStripeCheckoutResumeResult/);
    assert.match(source, /status === 'complete' \|\| status === 'idle' \|\| status === 'expired'/);
    assert.match(source, /await checkCheckoutStatus\(\)/);
    assert.match(source, /primaryAction === 'resume_checkout'/);
    assert.match(source, /await resumeCheckout\(\)/);
    assert.match(source, /setClientSecret\(payload\.clientSecret\)/);
    assert.match(source, /window\.location\.assign\(payload\.url\)/);
    assert.match(source, /Checking status\.\.\./);
    assert.match(source, /Resuming checkout\.\.\./);
    assert.match(source, /min-h-\[44px\]/);
    assert.doesNotMatch(
      source,
      /primaryAction === 'check_availability'[\s\S]{0,180}setRecovery\(null\)/,
    );
  }
  const modal = read('components/UpgradeModal.tsx');
  assert.match(modal, /useEffect\(\(\) => \(\) => \{\s*checkoutRequests\.invalidate\(\);/);
});

test('billing account review opens a typed support request that requires admin persistence', () => {
  const feedbackPage = fs.readFileSync(path.join(repoRoot, 'app/suite/feedback/page.tsx'), 'utf8');
  const feedbackApi = fs.readFileSync(path.join(repoRoot, 'app/api/feedback/route.ts'), 'utf8');
  assert.match(feedbackPage, /issueCodeForStripeAccountReviewContext/);
  assert.match(feedbackPage, /Request billing review/);
  assert.match(feedbackPage, /No checkout was created and your current plan is unchanged/);
  assert.match(feedbackApi, /normalizeStripeAccountReviewIssueCode/);
  const persistenceGate = feedbackApi.indexOf('await db.runTransaction');
  const discordAttempt = feedbackApi.indexOf('const discordPromise');
  assert.ok(persistenceGate > 0 && discordAttempt > persistenceGate);
  assert.match(feedbackApi, /BILLING_SUPPORT_REQUEST_UNAVAILABLE/);
});

test('the full upgrade page records its funnel and invalidates requests on unmount', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'app', 'suite', 'upgrade', 'page.tsx'), 'utf8');
  assert.match(page, /analytics\.upgradeViewed\('upgrade_page'/);
  assert.match(page, /analytics\.upgradePlanSelected\('upgrade_page'/);
  assert.match(page, /analytics\.upgradeIntervalSelected\('upgrade_page'/);
  assert.match(page, /analytics\.checkoutSessionFailed\('upgrade_page'/);
  assert.match(page, /useEffect\(\(\) => \(\) => \{\s*checkoutRequestRef\.current \+= 1;/);
});
