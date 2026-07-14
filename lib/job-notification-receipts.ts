import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  JobEmailDeliveryPurpose,
  JobEmailReceiptStatus,
  NormalizedJobEmailReceipt,
} from '@/lib/job-notification-receipt-contract';
import {
  isJobEmailDeliveryLockActive,
  shouldApplyJobEmailReceipt,
} from '@/lib/job-notification-receipt-contract';

const ATTEMPTS_COLLECTION = 'emailDeliveryAttempts';
const EVENTS_COLLECTION = 'emailDeliveryWebhookEvents';

type AttemptSource = 'manual' | 'weekly_cron' | 'agent_cron' | 'sona_harness';

function preferencePatch(
  purpose: JobEmailDeliveryPurpose,
  input: {
    status: JobEmailReceiptStatus;
    updatedAt: string;
    providerMessageId?: string | null;
    providerEvent?: string | null;
    error?: string | null;
    pauseEmail?: boolean;
  },
) {
  const tracking = input.status === 'delivered'
    ? 'confirmed'
    : input.status === 'delayed'
      ? 'delayed'
      : input.status === 'failed'
        ? 'failed'
        : input.providerMessageId
          ? 'pending'
          : 'unavailable';
  const common = input.pauseEmail ? {
    emailNotifications: false,
    emailDeliveryPausedAt: input.updatedAt,
    emailDeliveryPausedReason: input.error || 'Email delivery was paused.',
  } : {};

  if (purpose === 'agent_digest') {
    return {
      ...common,
      agentDigestDeliveryStatus: input.status,
      agentDigestDeliveryUpdatedAt: input.updatedAt,
      agentDigestDeliveryError: input.error || null,
      agentDigestProviderMessageId: input.providerMessageId || null,
      agentDigestLastProviderEvent: input.providerEvent || null,
      agentDigestReceiptTracking: tracking,
      ...(input.status === 'delivered' ? { agentDigestLastDeliveredAt: input.updatedAt } : {}),
      ...(input.pauseEmail ? {
        agentDigestEmailEnabled: false,
        agentDigestDeliveryPausedAt: input.updatedAt,
        agentDigestDeliveryPausedReason: input.error || 'Email delivery was paused.',
      } : {}),
    };
  }

  return {
    ...common,
    jobAlertsDeliveryStatus: input.status,
    jobAlertsDeliveryUpdatedAt: input.updatedAt,
    jobAlertsDeliveryError: input.error || null,
    jobAlertsProviderMessageId: input.providerMessageId || null,
    jobAlertsLastProviderEvent: input.providerEvent || null,
    jobAlertsReceiptTracking: tracking,
    ...(input.status === 'delivered' ? { jobAlertsLastDeliveredAt: input.updatedAt } : {}),
    ...(input.pauseEmail ? {
      jobAlertsDeliveryPausedAt: input.updatedAt,
      jobAlertsDeliveryPausedReason: input.error || 'Email delivery was paused.',
    } : {}),
  };
}

function recipientHash(email: string) {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export async function createJobEmailDeliveryAttempt(db: Firestore, input: {
  uid: string;
  attemptId: string;
  purpose: JobEmailDeliveryPurpose;
  source: AttemptSource;
  createdAt: string;
  recipientEmail: string;
}) {
  const attemptRef = db.collection(ATTEMPTS_COLLECTION).doc(input.attemptId);
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(attemptRef);
    const expectedRecipientHash = recipientHash(input.recipientEmail);
    if (existing.exists) {
      const data = existing.data() || {};
      if (data.uid !== input.uid || data.purpose !== input.purpose || data.recipientHash !== expectedRecipientHash) {
        throw new Error('Email delivery attempt identity did not match');
      }
      return;
    }
    transaction.set(attemptRef, {
      version: 1,
      provider: 'resend',
      channel: 'email',
      uid: input.uid,
      attemptId: input.attemptId,
      purpose: input.purpose,
      source: input.source,
      status: 'sending',
      providerMessageId: null,
      recipientHash: expectedRecipientHash,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      lastEventAt: null,
      lastProviderEvent: null,
    });
  });
}

export function buildJobEmailIdempotencyKey(scope: string, parts: string[]) {
  const digest = createHash('sha256').update(parts.join('\u001f')).digest('hex');
  return `${scope}-${digest}`.slice(0, 180);
}

export function buildJobEmailRetryIdempotencyKey(baseKey: string, retryNumber: number) {
  return buildJobEmailIdempotencyKey('email-retry', [baseKey, String(Math.max(1, retryNumber))]);
}

export function planJobEmailDeliveryClaim(input: {
  baseIdempotencyKey: string;
  proposedAttemptId: string;
  existingAttemptId?: unknown;
  existingClaimStatus?: unknown;
  existingAttemptStatus?: unknown;
  existingProviderIdempotencyKey?: unknown;
  existingRetryCount?: unknown;
  lockUntil?: unknown;
  now?: number;
}) {
  const existingAttemptId = typeof input.existingAttemptId === 'string' ? input.existingAttemptId : '';
  const effectiveStatus = String(input.existingAttemptStatus || input.existingClaimStatus || '');
  if (effectiveStatus === 'accepted' || effectiveStatus === 'delivered' || effectiveStatus === 'delayed') {
    return { outcome: 'duplicate' as const, attemptId: existingAttemptId };
  }
  if (effectiveStatus === 'sending' && isJobEmailDeliveryLockActive(input.lockUntil, input.now)) {
    return { outcome: 'in_progress' as const, attemptId: existingAttemptId };
  }

  const isExplicitRetry = effectiveStatus === 'failed';
  const parsedRetryCount = Number(input.existingRetryCount);
  const previousRetryCount = Number.isFinite(parsedRetryCount) ? Math.max(0, parsedRetryCount) : 0;
  const retryCount = isExplicitRetry ? previousRetryCount + 1 : previousRetryCount;
  return {
    outcome: 'acquired' as const,
    attemptId: isExplicitRetry ? input.proposedAttemptId : existingAttemptId || input.proposedAttemptId,
    providerIdempotencyKey: isExplicitRetry
      ? buildJobEmailRetryIdempotencyKey(input.baseIdempotencyKey, retryCount)
      : typeof input.existingProviderIdempotencyKey === 'string' && input.existingProviderIdempotencyKey
        ? input.existingProviderIdempotencyKey
        : input.baseIdempotencyKey,
    retryCount,
  };
}

export async function acceptJobEmailDeliveryAttempt(db: Firestore, input: {
  attemptId: string;
  providerMessageId: string | null;
  acceptedAt: string;
}) {
  const attemptRef = db.collection(ATTEMPTS_COLLECTION).doc(input.attemptId);
  return db.runTransaction(async transaction => {
    const attemptSnap = await transaction.get(attemptRef);
    if (!attemptSnap.exists) throw new Error('Email delivery attempt was not registered');
    const attempt = attemptSnap.data() || {};
    const purpose = attempt.purpose as JobEmailDeliveryPurpose;
    if (attempt.providerMessageId && input.providerMessageId && attempt.providerMessageId !== input.providerMessageId) {
      throw new Error('Email provider message did not match the registered attempt');
    }
    const status = attempt.status === 'sending' ? 'accepted' : attempt.status as JobEmailReceiptStatus;
    const updatedAt = attempt.status === 'sending' ? input.acceptedAt : String(attempt.updatedAt || input.acceptedAt);
    const providerMessageId = input.providerMessageId || attempt.providerMessageId || null;
    const prefsRef = db.collection('users').doc(String(attempt.uid)).collection('settings').doc('jobPreferences');
    const prefsSnap = await transaction.get(prefsRef);
    transaction.set(attemptRef, {
      status,
      providerMessageId,
      acceptedAt: input.acceptedAt,
      updatedAt,
    }, { merge: true });
    const currentAttemptField = purpose === 'agent_digest' ? 'agentDigestDeliveryAttemptId' : 'jobAlertsDeliveryAttemptId';
    if (prefsSnap.data()?.[currentAttemptField] === input.attemptId) {
      transaction.set(
        prefsRef,
        preferencePatch(purpose, {
          status,
          updatedAt,
          providerMessageId,
          providerEvent: attempt.lastProviderEvent || null,
          error: attempt.error || null,
        }),
        { merge: true },
      );
    }
    return { status, providerMessageId, updatedAt };
  });
}

export async function failJobEmailDeliveryAttempt(db: Firestore, input: {
  attemptId: string;
  failedAt: string;
  error: string;
}) {
  const attemptRef = db.collection(ATTEMPTS_COLLECTION).doc(input.attemptId);
  return db.runTransaction(async transaction => {
    const attemptSnap = await transaction.get(attemptRef);
    if (!attemptSnap.exists) return { updated: false, status: null };
    const attempt = attemptSnap.data() || {};
    if (attempt.status !== 'sending') return { updated: false, status: String(attempt.status || 'unknown') };
    const purpose = attempt.purpose as JobEmailDeliveryPurpose;
    const prefsRef = db.collection('users').doc(String(attempt.uid)).collection('settings').doc('jobPreferences');
    const prefsSnap = await transaction.get(prefsRef);
    transaction.set(attemptRef, {
      status: 'failed',
      error: input.error,
      updatedAt: input.failedAt,
    }, { merge: true });
    const currentAttemptField = purpose === 'agent_digest' ? 'agentDigestDeliveryAttemptId' : 'jobAlertsDeliveryAttemptId';
    if (prefsSnap.data()?.[currentAttemptField] === input.attemptId) {
      transaction.set(
        prefsRef,
        {
          ...preferencePatch(purpose, {
            status: 'failed',
            updatedAt: input.failedAt,
            providerMessageId: attempt.providerMessageId || null,
            error: input.error,
          }),
          ...(purpose === 'agent_digest'
            ? { agentDigestDeliveryLockUntil: null, agentDigestLastAttemptAt: null }
            : { jobAlertsDeliveryLockUntil: null, jobAlertsLastAttemptAt: null }),
        },
        { merge: true },
      );
    }
    return { updated: true, status: 'failed' as const };
  });
}

export async function applyJobEmailDeliveryReceipt(db: Firestore, svixId: string, receipt: NormalizedJobEmailReceipt) {
  const eventId = createHash('sha256').update(svixId).digest('hex');
  const eventRef = db.collection(EVENTS_COLLECTION).doc(eventId);
  const attemptRef = db.collection(ATTEMPTS_COLLECTION).doc(receipt.attemptId);

  return db.runTransaction(async transaction => {
    const [eventSnap, attemptSnap] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(attemptRef),
    ]);
    if (eventSnap.exists) return { outcome: 'duplicate' as const };

    const eventRecord = {
      version: 1,
      provider: 'resend',
      svixIdHash: eventId,
      attemptId: receipt.attemptId,
      providerMessageId: receipt.providerMessageId,
      providerEvent: receipt.providerEvent,
      status: receipt.status,
      eventAt: receipt.occurredAt,
      receivedAt: new Date().toISOString(),
    };
    if (!attemptSnap.exists) {
      transaction.set(eventRef, { ...eventRecord, outcome: 'unmatched' });
      return { outcome: 'unmatched' as const };
    }

    const attempt = attemptSnap.data() || {};
    if (attempt.providerMessageId && attempt.providerMessageId !== receipt.providerMessageId) {
      transaction.set(eventRef, { ...eventRecord, outcome: 'message_mismatch' });
      return { outcome: 'message_mismatch' as const };
    }
    if (!receipt.recipients.some(email => recipientHash(email) === attempt.recipientHash)) {
      transaction.set(eventRef, { ...eventRecord, outcome: 'recipient_mismatch' });
      return { outcome: 'recipient_mismatch' as const };
    }

    if (!shouldApplyJobEmailReceipt(
      attempt.lastEventAt,
      receipt.occurredAt,
      attempt.status as JobEmailReceiptStatus,
      receipt.status,
    )) {
      transaction.set(eventRef, { ...eventRecord, outcome: 'out_of_order' });
      return { outcome: 'out_of_order' as const };
    }

    const purpose = attempt.purpose as JobEmailDeliveryPurpose;
    const prefsRef = db.collection('users').doc(String(attempt.uid)).collection('settings').doc('jobPreferences');
    const prefsSnap = await transaction.get(prefsRef);
    transaction.set(attemptRef, {
      status: receipt.status,
      providerMessageId: receipt.providerMessageId,
      lastProviderEvent: receipt.providerEvent,
      lastEventAt: receipt.occurredAt,
      updatedAt: receipt.occurredAt,
      error: receipt.error,
      ...(receipt.pauseEmail ? { deliveryPausedAt: receipt.occurredAt } : {}),
    }, { merge: true });
    const currentAttemptField = purpose === 'agent_digest' ? 'agentDigestDeliveryAttemptId' : 'jobAlertsDeliveryAttemptId';
    if (prefsSnap.data()?.[currentAttemptField] === receipt.attemptId) {
      transaction.set(
        prefsRef,
        preferencePatch(purpose, {
          status: receipt.status,
          updatedAt: receipt.occurredAt,
          providerMessageId: receipt.providerMessageId,
          providerEvent: receipt.providerEvent,
          error: receipt.error,
          pauseEmail: receipt.pauseEmail,
        }),
        { merge: true },
      );
    } else if (receipt.pauseEmail) {
      transaction.set(prefsRef, {
        emailNotifications: false,
        emailDeliveryPausedAt: receipt.occurredAt,
        emailDeliveryPausedReason: receipt.error || 'Email delivery was paused.',
        ...(purpose === 'agent_digest'
          ? {
            agentDigestEmailEnabled: false,
            agentDigestDeliveryPausedAt: receipt.occurredAt,
            agentDigestDeliveryPausedReason: receipt.error || 'Email delivery was paused.',
          }
          : {
            jobAlertsDeliveryPausedAt: receipt.occurredAt,
            jobAlertsDeliveryPausedReason: receipt.error || 'Email delivery was paused.',
          }),
      }, { merge: true });
    }
    transaction.set(eventRef, { ...eventRecord, outcome: 'applied', purpose });
    return { outcome: 'applied' as const, status: receipt.status, purpose };
  });
}
