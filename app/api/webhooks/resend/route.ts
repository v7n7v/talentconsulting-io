import { NextRequest, NextResponse } from 'next/server';
import { Resend, type WebhookEventPayload } from 'resend';
import { getAdminDb } from '@/lib/firebase-admin';
import { normalizeResendJobEmailReceipt } from '@/lib/job-notification-receipt-contract';
import { applyJobEmailDeliveryReceipt } from '@/lib/job-notification-receipts';
import {
  fingerprintResendApiKey,
  fingerprintResendWebhookSecret,
  REQUIRED_RESEND_JOB_RECEIPT_EVENTS,
} from '@/lib/job-notification-readiness';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  }

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing webhook signature' }, { status: 400 });
  }

  const payload = await req.text();
  let event: WebhookEventPayload;
  try {
    event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
      payload,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret,
    });
  } catch (error) {
    console.warn('[webhooks/resend] Rejected webhook:', error instanceof Error ? error.message : 'invalid payload');
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
  }

  const db = getAdminDb();
  const eventData = event.data && typeof event.data === 'object'
    ? event.data as unknown as Record<string, unknown>
    : {};
  const providerMessageId = typeof eventData.email_id === 'string' ? eventData.email_id : null;
  const isRequiredReceiptEvent = (REQUIRED_RESEND_JOB_RECEIPT_EVENTS as readonly string[]).includes(event.type);
  if (isRequiredReceiptEvent || providerMessageId) {
    try {
      const healthRef = db.doc('settings/integrationHealth');
      const secretFingerprint = fingerprintResendWebhookSecret(webhookSecret);
      const apiKey = process.env.RESEND_API_KEY;
      const apiKeyFingerprint = apiKey ? fingerprintResendApiKey(apiKey) : null;
      const verifiedAt = new Date().toISOString();
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(healthRef);
        const current = snapshot.data() || {};
        const existingEvents = current.resendWebhookSecretFingerprint === secretFingerprint
          && current.resendReceiptEvents
          && typeof current.resendReceiptEvents === 'object'
          ? current.resendReceiptEvents as Record<string, unknown>
          : {};
        const canaryMatches = Boolean(
          providerMessageId
          && apiKeyFingerprint
          && current.resendCanaryProviderMessageId === providerMessageId
          && current.resendCanaryApiKeyFingerprint === apiKeyFingerprint,
        );
        const healthUpdate: Record<string, unknown> = {};
        if (isRequiredReceiptEvent) {
          healthUpdate.resendWebhookSecretFingerprint = secretFingerprint;
          healthUpdate.resendReceiptEvents = { ...existingEvents, [event.type]: verifiedAt };
          healthUpdate.resendWebhookVerifiedAt = verifiedAt;
          healthUpdate.resendWebhookEventType = event.type;
        }
        if (canaryMatches) {
          healthUpdate.resendCanaryWebhookSecretFingerprint = secretFingerprint;
          healthUpdate.resendCanaryVerifiedAt = verifiedAt;
          healthUpdate.resendCanaryEventType = event.type;
        }
        if (Object.keys(healthUpdate).length === 0) return;
        if (snapshot.exists) transaction.update(healthRef, healthUpdate);
        else transaction.set(healthRef, healthUpdate);
      });
    } catch (error) {
      console.error('[webhooks/resend] Integration health persistence failed:', error);
      return NextResponse.json({ error: 'Webhook health persistence failed' }, { status: 500 });
    }
  }

  const receipt = normalizeResendJobEmailReceipt(event);
  if (!receipt) return NextResponse.json({ received: true, ignored: true });
  try {
    const result = await applyJobEmailDeliveryReceipt(db, svixId, receipt);
    return NextResponse.json({ received: true, outcome: result.outcome });
  } catch (error) {
    console.error('[webhooks/resend] Receipt persistence failed:', error);
    return NextResponse.json({ error: 'Receipt persistence failed' }, { status: 500 });
  }
}
