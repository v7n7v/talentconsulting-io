export type JobEmailDeliveryPurpose = 'job_alert' | 'agent_digest';
export type JobEmailReceiptStatus = 'sending' | 'accepted' | 'delivered' | 'delayed' | 'failed';

export interface NormalizedJobEmailReceipt {
  attemptId: string;
  providerMessageId: string;
  providerEvent: string;
  status: Exclude<JobEmailReceiptStatus, 'sending'>;
  occurredAt: string;
  error: string | null;
  pauseEmail: boolean;
  recipients: string[];
}

function boundedString(value: unknown, max = 180) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function safeEventTime(value: unknown) {
  const raw = boundedString(value, 80);
  if (!raw) return null;
  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

type UnknownRecord = { [key: string]: unknown };

function isObjectRecord(value: unknown): value is UnknownRecord {
  // Preserve the provider parser's existing object check, including arrays.
  return value !== null && typeof value === 'object';
}

function propertyOf(value: unknown, key: string): unknown {
  return isObjectRecord(value) ? value[key] : undefined;
}

function receiptError(type: string, data: UnknownRecord) {
  if (type === 'email.delivery_delayed') return 'The recipient email server temporarily delayed delivery.';
  if (type === 'email.bounced') return boundedString(propertyOf(data.bounce, 'message')) || 'The recipient email server rejected the message.';
  if (type === 'email.failed') return boundedString(propertyOf(data.failed, 'reason')) || 'The email provider could not send the message.';
  if (type === 'email.suppressed') return boundedString(propertyOf(data.suppressed, 'message')) || 'The email provider suppressed the message.';
  if (type === 'email.complained') return 'The recipient reported this email as spam. Email delivery has been paused.';
  return null;
}

export function normalizeResendJobEmailReceipt(payload: unknown): NormalizedJobEmailReceipt | null {
  if (!isObjectRecord(payload)) return null;
  const event = payload;
  const type = boundedString(event.type, 80);
  const data = isObjectRecord(event.data) ? event.data : null;
  if (!type || !data) return null;

  const status = type === 'email.sent'
    ? 'accepted'
    : type === 'email.delivered'
      ? 'delivered'
      : type === 'email.delivery_delayed'
        ? 'delayed'
        : ['email.bounced', 'email.failed', 'email.suppressed', 'email.complained'].includes(type)
          ? 'failed'
          : null;
  if (!status) return null;

  const tags = isObjectRecord(data.tags) ? data.tags : {};
  const attemptId = boundedString(tags.tc_attempt, 100);
  const providerMessageId = boundedString(data.email_id, 120);
  const occurredAt = safeEventTime(event.created_at);
  const recipients = Array.isArray(data.to)
    ? [...new Set(data.to.map((value: unknown) => boundedString(value, 320)?.toLowerCase()).filter((value): value is string => Boolean(value)))]
    : [];
  if (!attemptId || !/^[A-Za-z0-9_-]+$/.test(attemptId) || !providerMessageId || !occurredAt || recipients.length === 0) return null;

  return {
    attemptId,
    providerMessageId,
    providerEvent: type,
    status,
    occurredAt,
    error: receiptError(type, data),
    pauseEmail: type === 'email.bounced' || type === 'email.suppressed' || type === 'email.complained',
    recipients,
  };
}

export function getResendDeliveryTags(attemptId: string, purpose: JobEmailDeliveryPurpose) {
  return [
    { name: 'tc_attempt', value: attemptId },
    { name: 'tc_purpose', value: purpose },
  ];
}

export function shouldApplyJobEmailReceipt(
  previousEventAt: unknown,
  nextEventAt: string,
  previousStatus?: JobEmailReceiptStatus,
  nextStatus?: JobEmailReceiptStatus,
) {
  const previousTimestamp = typeof previousEventAt === 'string' ? new Date(previousEventAt).getTime() : 0;
  const nextTimestamp = new Date(nextEventAt).getTime();
  if (!Number.isFinite(nextTimestamp)) return false;
  if (!Number.isFinite(previousTimestamp) || previousTimestamp <= 0 || nextTimestamp > previousTimestamp) return true;
  if (nextTimestamp < previousTimestamp) return false;
  const priority: Record<JobEmailReceiptStatus, number> = {
    sending: 0,
    accepted: 1,
    delayed: 2,
    delivered: 3,
    failed: 4,
  };
  return Boolean(previousStatus && nextStatus && priority[nextStatus] > priority[previousStatus]);
}

export function isJobEmailDeliveryLockActive(lockUntil: unknown, now = Date.now()) {
  if (typeof lockUntil !== 'string') return false;
  const timestamp = new Date(lockUntil).getTime();
  return Number.isFinite(timestamp) && timestamp > now;
}
