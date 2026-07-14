/**
 * Job Alerts Subscribe API — /api/jobs/subscribe
 * POST: Toggle job alert subscription
 * GET: Check subscription status
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { normalizeJobAlertsFrequency } from '@/lib/job-alerts';
import {
  JOB_ALERT_EMAIL_CONSENT_VERSION,
  getJobAlertDeliverySnapshot,
  getJobAlertEmailConsent,
  verifyJobAlertEmailResume,
} from '@/lib/job-notification-delivery';

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const enabled = body.enabled !== false;
    const frequency = normalizeJobAlertsFrequency(body.frequency ?? body.jobAlertsFrequency ?? 'weekly', guard.user.tier);
    const db = getAdminDb();
    const uid = guard.user.uid;
    const prefsRef = db.collection('users').doc(uid).collection('settings').doc('jobPreferences');
    const now = new Date().toISOString();
    const result = await db.runTransaction(async transaction => {
      const prefsSnap = await transaction.get(prefsRef);
      const existing = prefsSnap.data() || {};
      const enabling = enabled && (existing.jobAlertsEnabled !== true || existing.emailNotifications !== true);
      const resume = verifyJobAlertEmailResume(existing, {
        enableEmail: enabled,
        resumeAfterProviderPause: body.resumeAfterProviderPause,
        providerPauseAt: body.providerPauseAt,
      });
      if (!resume.allowed) {
          return {
            error: 'EMAIL_RESUME_CONFIRMATION_REQUIRED' as const,
            message: 'Email was paused after a provider complaint or rejection. Resume it from Job Search controls.',
          };
      }
      if (enabling && body.consentAcknowledged !== true) {
        return { error: 'EMAIL_CONSENT_REQUIRED' as const, message: 'Confirm email delivery before enabling Sona Picks.' };
      }

      const update: Record<string, any> = {
        jobAlertsEnabled: enabled,
        jobAlertsFrequency: frequency,
        emailNotifications: enabled ? true : existing.emailNotifications === true,
        lastUpdated: now,
      };
      if (enabled) {
        update.jobAlertsSubscribedAt = existing.jobAlertsSubscribedAt || now;
        if (enabling) {
          update.jobAlertsConsentAt = now;
          update.jobAlertsConsentVersion = JOB_ALERT_EMAIL_CONSENT_VERSION;
          update.jobAlertsConsentSource = String(body.source || 'sona_picks').slice(0, 80);
          update.jobAlertsDeliveryStatus = 'ready';
          update.jobAlertsDeliveryError = null;
          update.emailDeliveryPausedAt = null;
          update.emailDeliveryPausedReason = null;
          update.jobAlertsDeliveryPausedAt = null;
          update.jobAlertsDeliveryPausedReason = null;
          update.agentDigestDeliveryPausedAt = null;
          update.agentDigestDeliveryPausedReason = null;
        }
      } else update.jobAlertsUnsubscribedAt = now;
      transaction.set(prefsRef, update, { merge: true });
      return { next: { ...existing, ...update } };
    });
    if ('error' in result) {
      return NextResponse.json({ success: false, code: result.error, error: result.message }, { status: 409 });
    }
    const next = result.next;

    return NextResponse.json({
      success: true,
      subscribed: enabled,
      frequency,
      consent: getJobAlertEmailConsent(next),
      delivery: getJobAlertDeliverySnapshot(next),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 20, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  try {
    const db = getAdminDb();
    const uid = guard.user.uid;
    const prefsSnap = await db.collection('users').doc(uid).collection('settings').doc('jobPreferences').get();

    if (!prefsSnap.exists) {
      return NextResponse.json({
        subscribed: false,
        frequency: 'weekly',
        consent: getJobAlertEmailConsent({}),
        delivery: getJobAlertDeliverySnapshot({}),
      });
    }

    const data = prefsSnap.data()!;
    const frequency = normalizeJobAlertsFrequency(data.jobAlertsFrequency || 'weekly', guard.user.tier);
    if (data.jobAlertsFrequency !== frequency) {
      db.collection('users').doc(uid).collection('settings').doc('jobPreferences')
        .set({ jobAlertsFrequency: frequency }, { merge: true })
        .catch(() => {});
    }
    return NextResponse.json({
      subscribed: getJobAlertEmailConsent(data).granted,
      subscribedAt: data.jobAlertsSubscribedAt || null,
      lastSentAt: data.jobAlertsLastSentAt || null,
      lastJobCount: data.jobAlertsLastJobCount || 0,
      frequency,
      consent: getJobAlertEmailConsent(data),
      delivery: getJobAlertDeliverySnapshot(data),
    });
  } catch {
    return NextResponse.json({ subscribed: false });
  }
}
