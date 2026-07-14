import { createHash } from 'node:crypto';

export const REQUIRED_RESEND_JOB_RECEIPT_EVENTS = [
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.failed',
  'email.suppressed',
  'email.complained',
] as const;

export type JobNotificationDeliveryReadiness = {
  provider: 'resend';
  status: 'ready' | 'configured' | 'blocked';
  canSendTrackedEmail: boolean;
  sendConfigured: boolean;
  providerVerified: boolean;
  providerVerifiedAt: string | null;
  receiptConfigured: boolean;
  webhookVerified: boolean;
  webhookVerifiedAt: string | null;
  requiredReceiptEvents: number;
  verifiedReceiptEvents: number;
  webhookPath: '/api/webhooks/resend';
  missing: Array<'send_key' | 'provider_verification' | 'webhook_secret' | 'webhook_verification'>;
  message: string;
};

type JobNotificationEnvironment = {
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
};

function hasOperationalSecret(value: string | undefined) {
  const normalized = value?.trim() || '';
  if (!normalized) return false;
  return !/(?:your[_-]?|replace[_-]?|change[_-]?me|placeholder|example|todo|\$\{)/i.test(normalized);
}

function hasExpectedPrefix(value: string | undefined, prefix: string) {
  return hasOperationalSecret(value) && value!.trim().startsWith(prefix);
}

const WEBHOOK_VERIFICATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type IntegrationHealthStore = {
  doc(path: string): {
    get(): Promise<{ data(): Record<string, unknown> | undefined }>;
  };
};

type ResendIntegrationHealth = {
  resendCanaryApiKeyFingerprint?: unknown;
  resendCanaryWebhookSecretFingerprint?: unknown;
  resendCanaryVerifiedAt?: unknown;
  resendWebhookSecretFingerprint?: unknown;
  resendReceiptEvents?: unknown;
};

export function fingerprintResendWebhookSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

export function fingerprintResendApiKey(apiKey: string) {
  return createHash('sha256').update(apiKey).digest('hex');
}

function isRecentVerification(value: unknown, now: number) {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    && timestamp <= now + 5 * 60 * 1000
    && now - timestamp <= WEBHOOK_VERIFICATION_MAX_AGE_MS;
}

export function getJobNotificationDeliveryReadiness(
  env: JobNotificationEnvironment = process.env as JobNotificationEnvironment,
  health: ResendIntegrationHealth = {},
  now = Date.now(),
): JobNotificationDeliveryReadiness {
  const sendConfigured = hasExpectedPrefix(env.RESEND_API_KEY, 're_');
  const receiptConfigured = hasExpectedPrefix(env.RESEND_WEBHOOK_SECRET, 'whsec_');
  const expectedProviderFingerprint = sendConfigured
    ? fingerprintResendApiKey(env.RESEND_API_KEY!.trim())
    : null;
  const expectedFingerprint = receiptConfigured
    ? fingerprintResendWebhookSecret(env.RESEND_WEBHOOK_SECRET!.trim())
    : null;
  const providerVerifiedAt = typeof health.resendCanaryVerifiedAt === 'string'
    ? health.resendCanaryVerifiedAt
    : null;
  const providerVerified = Boolean(
    expectedProviderFingerprint
    && expectedFingerprint
    && health.resendCanaryApiKeyFingerprint === expectedProviderFingerprint
    && health.resendCanaryWebhookSecretFingerprint === expectedFingerprint
    && isRecentVerification(providerVerifiedAt, now),
  );
  const fingerprintMatches = Boolean(
    expectedFingerprint
    && typeof health.resendWebhookSecretFingerprint === 'string'
    && health.resendWebhookSecretFingerprint === expectedFingerprint,
  );
  const eventTimes = health.resendReceiptEvents && typeof health.resendReceiptEvents === 'object'
    ? health.resendReceiptEvents as Record<string, unknown>
    : {};
  const verifiedEventTimes = fingerprintMatches
    ? REQUIRED_RESEND_JOB_RECEIPT_EVENTS.map(event => eventTimes[event])
      .filter((value): value is string => typeof value === 'string')
      .filter(value => {
        return isRecentVerification(value, now);
      })
    : [];
  const webhookVerified = verifiedEventTimes.length === REQUIRED_RESEND_JOB_RECEIPT_EVENTS.length;
  const verifiedAt = verifiedEventTimes.length > 0
    ? new Date(Math.max(...verifiedEventTimes.map(value => Date.parse(value)))).toISOString()
    : null;
  const missing: JobNotificationDeliveryReadiness['missing'] = [];
  if (!sendConfigured) missing.push('send_key');
  if (!providerVerified) missing.push('provider_verification');
  if (!receiptConfigured) missing.push('webhook_secret');
  if (!webhookVerified) missing.push('webhook_verification');
  const canSendTrackedEmail = missing.length === 0;
  const configured = sendConfigured && receiptConfigured;

  return {
    provider: 'resend',
    status: canSendTrackedEmail ? 'ready' : configured ? 'configured' : 'blocked',
    canSendTrackedEmail,
    sendConfigured,
    providerVerified,
    providerVerifiedAt,
    receiptConfigured,
    webhookVerified,
    webhookVerifiedAt: verifiedAt,
    requiredReceiptEvents: REQUIRED_RESEND_JOB_RECEIPT_EVENTS.length,
    verifiedReceiptEvents: verifiedEventTimes.length,
    webhookPath: '/api/webhooks/resend',
    missing,
    message: canSendTrackedEmail
      ? 'Tracked email is configured and a recent signed webhook has been verified.'
      : configured
        ? `Credentials are configured. Send a test email from Admin and verify all Resend receipt events before tracked email is enabled (${verifiedEventTimes.length}/${REQUIRED_RESEND_JOB_RECEIPT_EVENTS.length}).`
        : 'Tracked email is blocked until sending and signed delivery receipts are configured.',
  };
}

export async function getJobNotificationDeliveryReadinessForStore(
  db: IntegrationHealthStore,
  env: JobNotificationEnvironment = process.env as JobNotificationEnvironment,
) {
  const health = await db.doc('settings/integrationHealth').get()
    .then(snapshot => snapshot.data() || {})
    .catch(() => ({}));
  return getJobNotificationDeliveryReadiness(env, health);
}
