const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');
const { Resend } = require('resend');
const { Webhook } = require('svix');

const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-job-notification-'));
const outfile = path.join(outdir, 'job-notification.cjs');
const receiptOutfile = path.join(outdir, 'job-notification-receipt.cjs');
const receiptStoreOutfile = path.join(outdir, 'job-notification-receipt-store.cjs');
const readinessOutfile = path.join(outdir, 'job-notification-readiness.cjs');
buildSync({
  entryPoints: [path.join(__dirname, '..', 'lib', 'job-notification-delivery.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});
buildSync({
  entryPoints: [path.join(__dirname, '..', 'lib', 'job-notification-receipts.ts')],
  outfile: receiptStoreOutfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  tsconfig: path.join(__dirname, '..', 'tsconfig.json'),
  logLevel: 'silent',
});
buildSync({
  entryPoints: [path.join(__dirname, '..', 'lib', 'job-notification-receipt-contract.ts')],
  outfile: receiptOutfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});
buildSync({
  entryPoints: [path.join(__dirname, '..', 'lib', 'job-notification-readiness.ts')],
  outfile: readinessOutfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});

const {
  getJobAlertDeliverySnapshot,
  getAgentDigestEmailConsent,
  getJobAlertEmailConsent,
  sanitizeJobDeliveryError,
  verifyJobAlertEmailResume,
} = require(outfile);
const {
  getResendDeliveryTags,
  isJobEmailDeliveryLockActive,
  normalizeResendJobEmailReceipt,
  shouldApplyJobEmailReceipt,
} = require(receiptOutfile);
const {
  acceptJobEmailDeliveryAttempt,
  applyJobEmailDeliveryReceipt,
  buildJobEmailIdempotencyKey,
  buildJobEmailRetryIdempotencyKey,
  createJobEmailDeliveryAttempt,
  failJobEmailDeliveryAttempt,
  planJobEmailDeliveryClaim,
} = require(receiptStoreOutfile);
const {
  fingerprintResendApiKey,
  fingerprintResendWebhookSecret,
  getJobNotificationDeliveryReadiness,
  REQUIRED_RESEND_JOB_RECEIPT_EVENTS,
} = require(readinessOutfile);

function fakeFirestore(initial = {}) {
  const store = new Map(Object.entries(initial).map(([key, value]) => [key, structuredClone(value)]));
  class Ref {
    constructor(pathname) { this.path = pathname; }
    collection(name) { return new Ref(`${this.path}/${name}`); }
    doc(id) { return new Ref(`${this.path}/${id}`); }
    async get() { return snapshot(this.path); }
    async set(value, options) { write(this.path, value, options); }
  }
  const snapshot = pathname => ({
    exists: store.has(pathname),
    data: () => store.has(pathname) ? structuredClone(store.get(pathname)) : undefined,
  });
  const write = (pathname, value, options) => {
    const current = options?.merge && store.has(pathname) ? store.get(pathname) : {};
    store.set(pathname, structuredClone({ ...current, ...value }));
  };
  return {
    store,
    collection: name => new Ref(name),
    async runTransaction(callback) {
      let writeStarted = false;
      const pending = [];
      const transaction = {
        async get(ref) {
          if (writeStarted) throw new Error('transaction read occurred after write');
          return snapshot(ref.path);
        },
        set(ref, value, options) {
          writeStarted = true;
          pending.push(() => write(ref.path, value, options));
        },
      };
      const result = await callback(transaction);
      pending.forEach(apply => apply());
      return result;
    },
  };
}

test('missing preferences never imply email consent', () => {
  assert.equal(getJobAlertEmailConsent({}).granted, false);
  assert.equal(getJobAlertDeliverySnapshot({}).status, 'consent_required');
});

test('an explicit legacy subscription remains valid consent', () => {
  const consent = getJobAlertEmailConsent({
    jobAlertsEnabled: true,
    emailNotifications: true,
    jobAlertsSubscribedAt: '2026-07-01T12:00:00.000Z',
  });
  assert.equal(consent.granted, true);
  assert.equal(consent.version, 'legacy-explicit-opt-in');
});

test('agent digests require agent, channel and purpose consent together', () => {
  assert.equal(getAgentDigestEmailConsent({
    agentEnabled: true,
    emailNotifications: true,
    agentDigestEmailEnabled: true,
    lastUpdated: '2026-07-10T02:59:00.000Z',
  }).granted, false);

  assert.equal(getAgentDigestEmailConsent({
    agentEnabled: true,
    emailNotifications: true,
    agentDigestEmailEnabled: true,
    agentDigestConsentAt: '2026-07-10T03:00:00.000Z',
  }).granted, true);
});

test('delivery state distinguishes provider acceptance, confirmed delivery and failure', () => {
  const base = {
    jobAlertsEnabled: true,
    emailNotifications: true,
    jobAlertsConsentAt: '2026-07-10T03:00:00.000Z',
  };
  const accepted = getJobAlertDeliverySnapshot({
    ...base,
    jobAlertsDeliveryStatus: 'accepted',
    jobAlertsLastSentAt: '2026-07-10T03:01:00.000Z',
    jobAlertsLastJobCount: 3,
  });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.lastJobCount, 3);

  const delivered = getJobAlertDeliverySnapshot({
    ...base,
    jobAlertsDeliveryStatus: 'delivered',
    jobAlertsLastAcceptedAt: '2026-07-10T03:01:00.000Z',
    jobAlertsLastDeliveredAt: '2026-07-10T03:02:00.000Z',
    jobAlertsProviderMessageId: 'email_123',
    jobAlertsReceiptTracking: 'confirmed',
  });
  assert.equal(delivered.status, 'delivered');
  assert.equal(delivered.lastDeliveredAt, '2026-07-10T03:02:00.000Z');
  assert.equal(delivered.receiptTracking, 'confirmed');

  const legacySent = getJobAlertDeliverySnapshot({ ...base, jobAlertsDeliveryStatus: 'sent' });
  assert.equal(legacySent.status, 'accepted');

  const failed = getJobAlertDeliverySnapshot({
    ...base,
    jobAlertsDeliveryStatus: 'failed',
    jobAlertsDeliveryError: 'Provider rejected message',
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'Provider rejected message');
});

test('a provider pause remains visible even after email consent is disabled', () => {
  const delivery = getJobAlertDeliverySnapshot({
    jobAlertsEnabled: true,
    emailNotifications: false,
    jobAlertsConsentAt: '2026-07-10T03:00:00.000Z',
    jobAlertsDeliveryStatus: 'failed',
    jobAlertsDeliveryError: 'Mailbox rejected the message',
    jobAlertsDeliveryPausedReason: 'Mailbox rejected the message',
  });
  assert.equal(delivery.status, 'failed');
  assert.equal(delivery.consent.granted, false);
  assert.equal(delivery.pausedReason, 'Mailbox rejected the message');
});

test('a stale settings save cannot resume a provider-paused email channel', () => {
  const paused = {
    emailNotifications: false,
    emailDeliveryPausedAt: '2026-07-10T03:04:00.000Z',
  };
  assert.equal(verifyJobAlertEmailResume(paused, { enableEmail: true }).allowed, false);
  assert.equal(verifyJobAlertEmailResume(paused, {
    enableEmail: true,
    resumeAfterProviderPause: true,
    providerPauseAt: '2026-07-10T03:03:00.000Z',
  }).allowed, false);
  assert.equal(verifyJobAlertEmailResume(paused, {
    enableEmail: true,
    resumeAfterProviderPause: true,
    providerPauseAt: '2026-07-10T03:04:00.000Z',
  }).allowed, true);
});

test('Resend receipts require a tagged attempt and preserve delivery truth', () => {
  const base = {
    created_at: '2026-07-10T03:02:00.000Z',
    data: {
      email_id: 'email_123',
      to: ['user@example.com'],
      tags: { tc_attempt: 'attempt_123', tc_purpose: 'job_alert' },
    },
  };
  assert.equal(normalizeResendJobEmailReceipt({ ...base, type: 'email.sent' }).status, 'accepted');
  assert.equal(normalizeResendJobEmailReceipt({ ...base, type: 'email.delivered' }).status, 'delivered');
  assert.equal(normalizeResendJobEmailReceipt({ ...base, type: 'email.delivery_delayed' }).status, 'delayed');

  const bounced = normalizeResendJobEmailReceipt({
    ...base,
    type: 'email.bounced',
    data: { ...base.data, bounce: { message: 'Mailbox unavailable' } },
  });
  assert.equal(bounced.status, 'failed');
  assert.equal(bounced.pauseEmail, true);
  assert.equal(bounced.error, 'Mailbox unavailable');

  assert.equal(normalizeResendJobEmailReceipt({ ...base, type: 'email.opened' }), null);
  assert.equal(normalizeResendJobEmailReceipt({ ...base, data: { email_id: 'email_123', to: ['user@example.com'], tags: {} }, type: 'email.delivered' }), null);
});

test('receipt tags and timestamps support idempotent, monotonic updates', () => {
  assert.deepEqual(getResendDeliveryTags('attempt_123', 'job_alert'), [
    { name: 'tc_attempt', value: 'attempt_123' },
    { name: 'tc_purpose', value: 'job_alert' },
  ]);
  assert.equal(shouldApplyJobEmailReceipt(null, '2026-07-10T03:02:00.000Z'), true);
  assert.equal(shouldApplyJobEmailReceipt('2026-07-10T03:02:00.000Z', '2026-07-10T03:01:00.000Z'), false);
  assert.equal(shouldApplyJobEmailReceipt('2026-07-10T03:02:00.000Z', '2026-07-10T03:02:00.000Z'), false);
  assert.equal(shouldApplyJobEmailReceipt('2026-07-10T03:02:00.000Z', '2026-07-10T03:02:00.000Z', 'delivered', 'failed'), true);
  assert.equal(shouldApplyJobEmailReceipt('2026-07-10T03:02:00.000Z', '2026-07-10T03:02:00.000Z', 'failed', 'delivered'), false);
  assert.equal(shouldApplyJobEmailReceipt('2026-07-10T03:02:00.000Z', '2026-07-10T03:03:00.000Z'), true);
  assert.equal(isJobEmailDeliveryLockActive('2026-07-10T03:10:00.000Z', new Date('2026-07-10T03:05:00.000Z').getTime()), true);
  assert.equal(isJobEmailDeliveryLockActive('2026-07-10T03:00:00.000Z', new Date('2026-07-10T03:05:00.000Z').getTime()), false);
});

test('Resend SDK verification accepts the raw signed body and rejects a forged signature', () => {
  const secret = `whsec_${Buffer.from('talent-resend-webhook-test-secret').toString('base64')}`;
  const id = 'msg_receipt_test';
  const timestamp = new Date();
  const payload = JSON.stringify({
    type: 'email.opened',
    created_at: timestamp.toISOString(),
    data: { email_id: 'email_test', tags: {} },
  });
  const signature = new Webhook(secret).sign(id, timestamp, payload);
  const headers = {
    id,
    timestamp: String(Math.floor(timestamp.getTime() / 1000)),
    signature,
  };
  const verified = new Resend('re_test').webhooks.verify({ payload, headers, webhookSecret: secret });
  assert.equal(verified.type, 'email.opened');
  assert.throws(() => new Resend('re_test').webhooks.verify({
    payload,
    headers: { ...headers, signature: 'v1,forged' },
    webhookSecret: secret,
  }));
});

test('receipt transactions bind recipient, dedupe replay and protect the current snapshot', async () => {
  const db = fakeFirestore({
    'users/user_1/settings/jobPreferences': {
      jobAlertsEnabled: true,
      emailNotifications: true,
      jobAlertsConsentAt: '2026-07-10T03:00:00.000Z',
      jobAlertsDeliveryAttemptId: 'attempt_1',
      jobAlertsDeliveryStatus: 'sending',
    },
  });
  await createJobEmailDeliveryAttempt(db, {
    uid: 'user_1',
    attemptId: 'attempt_1',
    purpose: 'job_alert',
    source: 'manual',
    createdAt: '2026-07-10T03:00:00.000Z',
    recipientEmail: 'verified@example.com',
  });
  await acceptJobEmailDeliveryAttempt(db, {
    attemptId: 'attempt_1',
    providerMessageId: 'email_1',
    acceptedAt: '2026-07-10T03:01:00.000Z',
  });
  const delivered = {
    attemptId: 'attempt_1',
    providerMessageId: 'email_1',
    providerEvent: 'email.delivered',
    status: 'delivered',
    occurredAt: '2026-07-10T03:02:00.000Z',
    error: null,
    pauseEmail: false,
    recipients: ['verified@example.com'],
  };
  assert.equal((await applyJobEmailDeliveryReceipt(db, 'svix_1', delivered)).outcome, 'applied');
  assert.equal((await applyJobEmailDeliveryReceipt(db, 'svix_1', delivered)).outcome, 'duplicate');
  assert.equal(db.store.get('users/user_1/settings/jobPreferences').jobAlertsDeliveryStatus, 'delivered');
  const deliveredFailure = await failJobEmailDeliveryAttempt(db, {
    attemptId: 'attempt_1',
    failedAt: '2026-07-10T03:02:30.000Z',
    error: 'ambiguous local failure',
  });
  assert.equal(deliveredFailure.updated, false);
  assert.equal(deliveredFailure.status, 'delivered');

  const delayedOlder = { ...delivered, providerEvent: 'email.delivery_delayed', status: 'delayed', occurredAt: '2026-07-10T03:01:30.000Z' };
  assert.equal((await applyJobEmailDeliveryReceipt(db, 'svix_2', delayedOlder)).outcome, 'out_of_order');
  const wrongRecipient = { ...delivered, recipients: ['other@example.com'], occurredAt: '2026-07-10T03:03:00.000Z' };
  assert.equal((await applyJobEmailDeliveryReceipt(db, 'svix_3', wrongRecipient)).outcome, 'recipient_mismatch');

  db.store.set('users/user_1/settings/jobPreferences', {
    ...db.store.get('users/user_1/settings/jobPreferences'),
    jobAlertsDeliveryAttemptId: 'attempt_2',
    jobAlertsDeliveryStatus: 'sending',
  });
  const complained = {
    ...delivered,
    providerEvent: 'email.complained',
    status: 'failed',
    occurredAt: '2026-07-10T03:04:00.000Z',
    error: 'Spam complaint',
    pauseEmail: true,
  };
  assert.equal((await applyJobEmailDeliveryReceipt(db, 'svix_4', complained)).outcome, 'applied');
  assert.equal(db.store.get('users/user_1/settings/jobPreferences').jobAlertsDeliveryStatus, 'sending');
  assert.equal(db.store.get('users/user_1/settings/jobPreferences').emailNotifications, false);
  assert.equal(db.store.get('users/user_1/settings/jobPreferences').emailDeliveryPausedAt, '2026-07-10T03:04:00.000Z');
  assert.equal(db.store.get('users/user_1/settings/jobPreferences').jobAlertsDeliveryPausedReason, 'Spam complaint');
  const lateFailure = await failJobEmailDeliveryAttempt(db, {
    attemptId: 'attempt_1',
    failedAt: '2026-07-10T03:05:00.000Z',
    error: 'late failure',
  });
  assert.equal(lateFailure.updated, false);
  assert.equal(lateFailure.status, 'failed');
});

test('provider idempotency keys are stable for one digest and distinct for changed content', () => {
  const first = buildJobEmailIdempotencyKey('manual-picks', ['user_1', '2026-07-10', 'Role|Company|URL']);
  const repeated = buildJobEmailIdempotencyKey('manual-picks', ['user_1', '2026-07-10', 'Role|Company|URL']);
  const changed = buildJobEmailIdempotencyKey('manual-picks', ['user_1', '2026-07-10', 'Other|Company|URL']);
  assert.equal(first, repeated);
  assert.notEqual(first, changed);
  assert.ok(first.length <= 180);
  const retryKey = buildJobEmailRetryIdempotencyKey(first, 1);
  assert.notEqual(retryKey, first);
  assert.equal(buildJobEmailRetryIdempotencyKey(first, 1), retryKey);
  assert.notEqual(buildJobEmailRetryIdempotencyKey(first, 2), retryKey);
});

test('provider-terminal claims create a fresh attempt and provider idempotency key', () => {
  const plan = planJobEmailDeliveryClaim({
    baseIdempotencyKey: 'manual-picks-base',
    proposedAttemptId: 'attempt_new',
    existingAttemptId: 'attempt_old',
    existingClaimStatus: 'accepted',
    existingAttemptStatus: 'failed',
    existingProviderIdempotencyKey: 'manual-picks-base',
    existingRetryCount: 0,
  });
  assert.equal(plan.outcome, 'acquired');
  assert.equal(plan.attemptId, 'attempt_new');
  assert.equal(plan.retryCount, 1);
  assert.notEqual(plan.providerIdempotencyKey, 'manual-picks-base');

  const duplicate = planJobEmailDeliveryClaim({
    baseIdempotencyKey: 'manual-picks-base',
    proposedAttemptId: 'attempt_new',
    existingAttemptId: 'attempt_old',
    existingClaimStatus: 'accepted',
    existingAttemptStatus: 'delivered',
  });
  assert.equal(duplicate.outcome, 'duplicate');
});

test('a provider-terminal failure remains immutable and a retry uses a fresh attempt', async () => {
  const db = fakeFirestore({
    'users/user_2/settings/jobPreferences': { jobAlertsDeliveryAttemptId: 'attempt_retry' },
  });
  const input = {
    uid: 'user_2',
    attemptId: 'attempt_retry',
    purpose: 'job_alert',
    source: 'manual',
    createdAt: '2026-07-10T04:00:00.000Z',
    recipientEmail: 'verified@example.com',
  };
  await createJobEmailDeliveryAttempt(db, input);
  await acceptJobEmailDeliveryAttempt(db, {
    attemptId: 'attempt_retry',
    providerMessageId: 'email_original',
    acceptedAt: '2026-07-10T04:00:30.000Z',
  });
  const providerFailure = {
    attemptId: 'attempt_retry',
    providerMessageId: 'email_original',
    providerEvent: 'email.failed',
    status: 'failed',
    occurredAt: '2026-07-10T04:01:00.000Z',
    error: 'Provider failed after acceptance',
    pauseEmail: false,
    recipients: ['verified@example.com'],
  };
  assert.equal((await applyJobEmailDeliveryReceipt(db, 'svix_retry_failure', providerFailure)).outcome, 'applied');
  assert.equal((await failJobEmailDeliveryAttempt(db, {
    attemptId: 'attempt_retry',
    failedAt: '2026-07-10T04:01:30.000Z',
    error: 'late local failure',
  })).updated, false);
  await createJobEmailDeliveryAttempt(db, { ...input, createdAt: '2026-07-10T04:02:00.000Z' });
  assert.equal(db.store.get('emailDeliveryAttempts/attempt_retry').status, 'failed');
  assert.equal(db.store.get('emailDeliveryAttempts/attempt_retry').providerMessageId, 'email_original');

  const freshAttempt = { ...input, attemptId: 'attempt_retry_2', createdAt: '2026-07-10T04:02:00.000Z' };
  await createJobEmailDeliveryAttempt(db, freshAttempt);
  const accepted = await acceptJobEmailDeliveryAttempt(db, {
    attemptId: 'attempt_retry_2',
    providerMessageId: 'email_retry',
    acceptedAt: '2026-07-10T04:03:00.000Z',
  });
  assert.equal(accepted.status, 'accepted');
});

test('delivery errors are flattened and bounded before persistence', () => {
  const sanitized = sanitizeJobDeliveryError(`Provider\nfailed\t${'x'.repeat(300)}`);
  assert.equal(sanitized.includes('\n'), false);
  assert.equal(sanitized.length, 180);
});

test('tracked email requires both provider sending and signed receipt configuration', () => {
  const now = Date.parse('2026-07-11T12:00:00.000Z');
  const secret = 'whsec_live_test';
  const apiKey = 're_live_test';
  const missingAll = getJobNotificationDeliveryReadiness({});
  assert.equal(missingAll.canSendTrackedEmail, false);
  assert.deepEqual(missingAll.missing, ['send_key', 'provider_verification', 'webhook_secret', 'webhook_verification']);

  const sendOnly = getJobNotificationDeliveryReadiness({ RESEND_API_KEY: apiKey });
  assert.equal(sendOnly.sendConfigured, true);
  assert.equal(sendOnly.receiptConfigured, false);
  assert.deepEqual(sendOnly.missing, ['provider_verification', 'webhook_secret', 'webhook_verification']);

  const receiptOnly = getJobNotificationDeliveryReadiness({ RESEND_WEBHOOK_SECRET: 'whsec_live_test' });
  assert.equal(receiptOnly.canSendTrackedEmail, false);
  assert.deepEqual(receiptOnly.missing, ['send_key', 'provider_verification', 'webhook_verification']);

  const configured = getJobNotificationDeliveryReadiness({
    RESEND_API_KEY: 're_live_test',
    RESEND_WEBHOOK_SECRET: 'whsec_live_test',
  });
  assert.equal(configured.status, 'configured');
  assert.equal(configured.canSendTrackedEmail, false);

  const ready = getJobNotificationDeliveryReadiness({
    RESEND_API_KEY: apiKey,
    RESEND_WEBHOOK_SECRET: secret,
  }, {
    resendCanaryApiKeyFingerprint: fingerprintResendApiKey(apiKey),
    resendCanaryWebhookSecretFingerprint: fingerprintResendWebhookSecret(secret),
    resendCanaryVerifiedAt: '2026-07-11T11:55:00.000Z',
    resendWebhookSecretFingerprint: fingerprintResendWebhookSecret(secret),
    resendReceiptEvents: Object.fromEntries(
      REQUIRED_RESEND_JOB_RECEIPT_EVENTS.map(event => [event, '2026-07-11T11:55:00.000Z']),
    ),
  }, now);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.canSendTrackedEmail, true);
  assert.deepEqual(ready.missing, []);
});

test('tracked email requires a recent signed webhook verification', () => {
  const env = {
    RESEND_API_KEY: 're_live_test',
    RESEND_WEBHOOK_SECRET: 'whsec_live_test',
  };
  const now = Date.parse('2026-07-11T12:00:00.000Z');
  const fingerprint = fingerprintResendWebhookSecret(env.RESEND_WEBHOOK_SECRET);
  const healthAt = timestamp => ({
    resendCanaryApiKeyFingerprint: fingerprintResendApiKey(env.RESEND_API_KEY),
    resendCanaryWebhookSecretFingerprint: fingerprint,
    resendCanaryVerifiedAt: '2026-07-11T11:55:00.000Z',
    resendWebhookSecretFingerprint: fingerprint,
    resendReceiptEvents: Object.fromEntries(
      REQUIRED_RESEND_JOB_RECEIPT_EVENTS.map(event => [event, timestamp]),
    ),
  });
  const stale = getJobNotificationDeliveryReadiness(env, healthAt('2026-05-01T12:00:00.000Z'), now);
  const implausibleFuture = getJobNotificationDeliveryReadiness(env, healthAt('2026-07-12T12:00:00.000Z'), now);
  const incomplete = getJobNotificationDeliveryReadiness(env, {
    resendWebhookSecretFingerprint: fingerprint,
    resendReceiptEvents: { 'email.delivered': '2026-07-11T11:55:00.000Z' },
  }, now);
  const rotated = getJobNotificationDeliveryReadiness({ ...env, RESEND_WEBHOOK_SECRET: 'whsec_rotated' }, {
    resendWebhookSecretFingerprint: fingerprint,
    resendReceiptEvents: healthAt('2026-07-11T11:55:00.000Z').resendReceiptEvents,
  }, now);
  assert.equal(stale.canSendTrackedEmail, false);
  assert.equal(implausibleFuture.canSendTrackedEmail, false);
  assert.equal(incomplete.verifiedReceiptEvents, 1);
  assert.equal(incomplete.canSendTrackedEmail, false);
  assert.equal(rotated.verifiedReceiptEvents, 0);
  assert.equal(rotated.canSendTrackedEmail, false);
  assert.deepEqual(stale.missing, ['webhook_verification']);
});

test('tracked email provider proof is bound to the current API key', () => {
  const now = Date.parse('2026-07-11T12:00:00.000Z');
  const oldKey = 're_old_key';
  const health = {
    resendCanaryApiKeyFingerprint: fingerprintResendApiKey(oldKey),
    resendCanaryWebhookSecretFingerprint: fingerprintResendWebhookSecret('whsec_live_test'),
    resendCanaryVerifiedAt: '2026-07-11T11:55:00.000Z',
  };
  const rotated = getJobNotificationDeliveryReadiness({
    RESEND_API_KEY: 're_new_key',
    RESEND_WEBHOOK_SECRET: 'whsec_live_test',
  }, health, now);
  assert.equal(rotated.sendConfigured, true);
  assert.equal(rotated.providerVerified, false);
  assert.ok(rotated.missing.includes('provider_verification'));

  const crossAccount = getJobNotificationDeliveryReadiness({
    RESEND_API_KEY: oldKey,
    RESEND_WEBHOOK_SECRET: 'whsec_other_account',
  }, health, now);
  assert.equal(crossAccount.providerVerified, false);
  assert.ok(crossAccount.missing.includes('provider_verification'));
});

test('tracked email readiness rejects placeholders and never returns secret values', () => {
  const readiness = getJobNotificationDeliveryReadiness({
    RESEND_API_KEY: 'your_resend_api_key',
    RESEND_WEBHOOK_SECRET: 'change_me',
  });
  assert.equal(readiness.canSendTrackedEmail, false);
  const serialized = JSON.stringify(readiness);
  assert.doesNotMatch(serialized, /your_resend_api_key|change_me/);
});

test('notification routes enforce consent and record provider failures', () => {
  const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  const preferences = read('app/api/jobs/preferences/route.ts');
  const manual = read('app/api/jobs/notify/route.ts');
  const weekly = read('app/api/cron/weekly-suggestions/route.ts');
  const agent = read('app/api/cron/agent-pipeline/route.ts');
  const harness = read('lib/assistant/agent-harness.ts');
  const webhook = read('app/api/webhooks/resend/route.ts');
  const receipts = read('lib/job-notification-receipts.ts');
  const adminOps = read('app/api/admin/ops/route.ts');
  const adminEmail = read('app/api/admin/email/route.ts');
  const proxy = read('proxy.ts');

  assert.match(preferences, /emailNotifications:\s*false/);
  assert.match(preferences, /EMAIL_CONSENT_REQUIRED/);
  assert.match(preferences, /AGENT_DIGEST_CONSENT_REQUIRED/);
  assert.match(manual, /if \(!consent\.granted\)/);
  assert.match(manual, /await getJobNotificationDeliveryReadinessForStore\(db\)/);
  assert.match(manual, /EMAIL_DELIVERY_NOT_READY/);
  assert.ok(
    manual.indexOf('EMAIL_DELIVERY_NOT_READY') < manual.indexOf('await createJobEmailDeliveryAttempt'),
    'manual delivery must fail closed before creating a delivery attempt',
  );
  assert.match(manual, /if \(!delivery\.ok\) throw/);
  assert.match(manual, /jobAlertsDeliveryStatus:\s*'failed'/);
  assert.match(manual, /getResendDeliveryTags\(attemptId, 'job_alert'\)/);
  assert.match(manual, /idempotencyKey/);
  assert.match(manual, /planJobEmailDeliveryClaim/);
  assert.match(manual, /providerIdempotencyKey/);
  assert.match(manual, /notificationClaims/);
  assert.doesNotMatch(manual, /jobAlertsDeliveryStatus:\s*'sent'/);
  assert.match(weekly, /runTransaction/);
  assert.match(weekly, /getJobAlertEmailConsent\(latestData\)/);
  assert.match(weekly, /latestData\.jobAlertsLastAcceptedAt/);
  assert.match(weekly, /latestData\.jobAlertsLastAttemptAt/);
  assert.match(weekly, /shouldSendJobAlertDigest\(\{/);
  assert.match(weekly, /if \(delivery\.error\) throw/);
  assert.match(weekly, /authUser\?\.emailVerified \? authUser\.email : null/);
  assert.match(weekly, /idempotencyKey:\s*`sona-picks-/);
  assert.match(weekly, /status\.startsWith\('error'\)/);
  assert.match(weekly, /await getJobNotificationDeliveryReadinessForStore\(db\)/);
  assert.match(weekly, /EMAIL_DELIVERY_NOT_READY/);
  assert.ok(
    weekly.indexOf('EMAIL_DELIVERY_NOT_READY') < weekly.indexOf("collection('users').listDocuments"),
    'weekly delivery must fail closed before scanning users',
  );
  assert.match(agent, /getAgentDigestEmailConsent/);
  assert.match(agent, /runTransaction/);
  assert.match(agent, /getAgentDigestEmailConsent\(latestData\)/);
  assert.match(agent, /if \(!delivery\.ok\) throw/);
  assert.match(agent, /agentDigestDeliveryStatus:\s*'failed'/);
  assert.match(agent, /getResendDeliveryTags\(attemptId, 'agent_digest'\)/);
  assert.match(agent, /idempotencyKey:\s*`sona-agent-/);
  assert.match(agent, /notificationDelivery\.canSendTrackedEmail/);
  assert.match(harness, /getAgentDigestEmailConsent\(latestPreferences\)/);
  assert.match(harness, /if \(!delivery\.ok\) throw/);
  assert.match(harness, /getResendDeliveryTags\(attemptId, 'agent_digest'\)/);
  assert.match(harness, /idempotencyKey:\s*`sona-harness-/);
  assert.match(harness, /await getJobNotificationDeliveryReadinessForStore\(params\.db\)/);
  assert.match(harness, /emailAccepted/);
  assert.match(adminOps, /getJobNotificationDeliveryReadinessForStore/);
  assert.match(adminOps, /Resend Email and Receipts/);
  assert.match(adminEmail, /fingerprintResendApiKey/);
  assert.match(adminEmail, /sendCustomEmailResult/);
  assert.match(adminEmail, /resendCanaryProviderMessageId/);
  assert.match(adminEmail, /resendCanaryVerifiedAt:\s*null/);
  assert.match(webhook, /const payload = await req\.text\(\)/);
  assert.match(webhook, /webhooks\.verify/);
  assert.match(webhook, /RESEND_WEBHOOK_SECRET/);
  assert.match(webhook, /settings\/integrationHealth/);
  assert.match(webhook, /resendWebhookVerifiedAt/);
  assert.match(webhook, /resendWebhookSecretFingerprint/);
  assert.match(webhook, /REQUIRED_RESEND_JOB_RECEIPT_EVENTS/);
  assert.match(webhook, /transaction\.update\(healthRef, healthUpdate\)/);
  assert.match(webhook, /current\.resendCanaryProviderMessageId === providerMessageId/);
  assert.match(webhook, /resendCanaryWebhookSecretFingerprint/);
  assert.match(receipts, /createHash\('sha256'\)\.update\(svixId\)/);
  assert.match(receipts, /if \(eventSnap\.exists\) return \{ outcome: 'duplicate'/);
  assert.match(receipts, /shouldApplyJobEmailReceipt/);
  assert.match(proxy, /'\/api\/webhooks\/resend'/);
});

test('active job-alert opt-in surfaces acknowledge email consent', () => {
  const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  assert.match(read('components/JobFeedWidget.tsx'), /jobAlertsConsentAcknowledged:\s*true/);
  assert.match(read('components/SonaPicksCapture.tsx'), /consentAcknowledged:\s*true/);
  assert.match(read('app/suite/page.tsx'), /<JobFeedWidget/); // Consent belongs to the embedded widget; exercised in job-widget-behavior.test.js.
  assert.match(read('app/suite/settings/page.tsx'), /jobAlertsConsentAcknowledged:\s*true/);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'app/suite/job-search/WeeklyPicksSection.tsx')), false, 'Dormant weekly UI is retired; active consent surfaces remain covered above');
  assert.match(read('app/suite/job-search/JobPreferencesPanel.tsx'), /agentDigestConsentAcknowledged:\s*isMaxPlan\s*&&\s*agentDigestEmailEnabled/);
});
