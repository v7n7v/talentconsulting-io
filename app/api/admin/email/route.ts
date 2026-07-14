import { NextRequest, NextResponse } from 'next/server';
import { requireBillingAdmin } from '@/lib/admin-billing-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { sendCustomEmailResult } from '@/lib/email';
import { fingerprintResendApiKey, fingerprintResendWebhookSecret } from '@/lib/job-notification-readiness';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

export async function POST(req: NextRequest) {
  const admin = await requireBillingAdmin(req);
  if (admin.error) return admin.error;
  const input = await req.json().catch(() => null);
  const to = typeof input?.to === 'string' ? input.to.trim().toLowerCase() : '';
  const subject = typeof input?.subject === 'string' ? input.subject.trim().slice(0, 160) : '';
  const body = typeof input?.body === 'string' ? input.body.trim().slice(0, 5_000) : '';
  if (!EMAIL.test(to) || subject.length < 2 || body.length < 2) {
    return NextResponse.json({ error: 'Recipient, subject, and message are required.' }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const delivery = await sendCustomEmailResult(
    to, subject, `<p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>`, undefined, undefined,
    { idempotencyKey: `admin-email-${crypto.randomUUID()}` },
  );
  if (!delivery.ok) {
    return NextResponse.json({ error: 'The email provider did not accept the message.' }, { status: 502, headers: PRIVATE_HEADERS });
  }
  const apiKey = process.env.RESEND_API_KEY || '';
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET || '';
  await getAdminDb().doc('settings/integrationHealth').set({
    resendCanaryProviderMessageId: delivery.id || null,
    resendCanaryApiKeyFingerprint: apiKey ? fingerprintResendApiKey(apiKey) : null,
    resendCanaryWebhookSecretFingerprint: webhookSecret ? fingerprintResendWebhookSecret(webhookSecret) : null,
    resendCanaryVerifiedAt: null,
    resendCanaryRequestedAt: new Date().toISOString(),
  }, { merge: true });
  return NextResponse.json({ accepted: true }, { headers: PRIVATE_HEADERS });
}
