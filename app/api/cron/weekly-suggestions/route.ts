import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { EMAIL_FROM, buildJobDigestEmail, type JobForDigest } from '@/lib/email-templates';
import { getJobAlertEmailConsent, sanitizeJobDeliveryError } from '@/lib/job-notification-delivery';
import { shouldSendJobAlertDigest } from '@/lib/job-alerts';
import { getJobNotificationDeliveryReadinessForStore } from '@/lib/job-notification-readiness';
import { getResendDeliveryTags } from '@/lib/job-notification-receipt-contract';
import {
  acceptJobEmailDeliveryAttempt,
  createJobEmailDeliveryAttempt,
  failJobEmailDeliveryAttempt,
  planJobEmailDeliveryClaim,
} from '@/lib/job-notification-receipts';
import { getTrustedTalentJobApplyUrl } from '@/lib/job-recommendation-platform';
import { logUserCommunication } from '@/lib/communications';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = getAdminDb();
  const notificationDelivery = await getJobNotificationDeliveryReadinessForStore(db);
  if (!notificationDelivery.canSendTrackedEmail) {
    return NextResponse.json({ code: 'EMAIL_DELIVERY_NOT_READY', error: 'Tracked email delivery is unavailable.' }, { status: 503 });
  }

  const results: Array<{ uid: string; status: string }> = [];
  const userRefs = await db.collection('users').listDocuments();
  for (const userRef of userRefs) {
    const uid = userRef.id;
    const prefsRef = db.collection('users').doc(uid).collection('settings').doc('jobPreferences');
    const dayKey = new Date().toISOString().slice(0, 10);
    const claimRef = db.collection('users').doc(uid).collection('notificationClaims').doc(`sona-picks-${dayKey}`);
    const proposedAttemptId = db.collection('job_email_delivery_attempts').doc().id;
    const claimedAt = new Date().toISOString();
    const claim = await db.runTransaction(async transaction => {
      const [latest, existingClaim] = await Promise.all([transaction.get(prefsRef), transaction.get(claimRef)]);
      const latestData = latest.data() || {};
      const consent = getJobAlertEmailConsent(latestData);
      if (!consent.granted) return { outcome: 'skip' as const, reason: 'consent' };
      const schedule = shouldSendJobAlertDigest({
        enabled: consent.granted,
        emailNotifications: consent.granted,
        frequency: latestData.jobAlertsFrequency || 'weekly',
        tier: latestData.tier || 'free',
        lastSentAt: latestData.jobAlertsLastAcceptedAt || latestData.jobAlertsLastAttemptAt,
      });
      if (!schedule.send) return { outcome: 'skip' as const, reason: schedule.reason || 'schedule' };
      const current = existingClaim.data() || {};
      const planned = planJobEmailDeliveryClaim({
        baseIdempotencyKey: `sona-picks-${uid}-${dayKey}`,
        proposedAttemptId,
        existingAttemptId: current.attemptId,
        existingClaimStatus: current.status,
        existingAttemptStatus: current.status,
        existingProviderIdempotencyKey: current.providerIdempotencyKey,
        existingRetryCount: current.retryCount,
        lockUntil: current.lockUntil,
      });
      if (planned.outcome !== 'acquired') return planned;
      transaction.set(claimRef, { ...planned, status: 'sending', updatedAt: claimedAt, lockUntil: new Date(Date.now() + 10 * 60_000).toISOString() }, { merge: true });
      transaction.set(prefsRef, { jobAlertsDeliveryStatus: 'sending', jobAlertsDeliveryAttemptId: planned.attemptId, jobAlertsLastAttemptAt: claimedAt }, { merge: true });
      return planned;
    });
    if (claim.outcome !== 'acquired') { results.push({ uid, status: `skip:${claim.outcome}` }); continue; }

    const authUser = await getAdminAuth().getUser(uid).catch(() => null);
    const email = authUser?.emailVerified ? authUser.email : null;
    if (!email) { results.push({ uid, status: 'skip:unverified-email' }); continue; }
    const prefs = await prefsRef.get().then(snapshot => snapshot.data() || {});
    const storedJobs = Array.isArray(prefs.latestSonaPicks) ? prefs.latestSonaPicks.slice(0, 10) : [];
    const jobs: JobForDigest[] = storedJobs.flatMap((job: any) => {
      const trustedUrl = getTrustedTalentJobApplyUrl(job);
      if (!trustedUrl) return [];
      return [{
        title: String(job.title || 'Role'), company: String(job.company || 'Company'),
        location: String(job.location || ''), url: trustedUrl, viewUrl: trustedUrl,
        sourceName: String(job.sourceMeta?.source || job.sourceName || ''),
        acceptanceChance: Number(job.fitScore || 0), acceptanceReason: String(job.fitReasons?.[0] || ''),
      }];
    });
    if (!jobs.length) { results.push({ uid, status: 'skip:no-current-picks' }); continue; }

    const { subject, html } = buildJobDigestEmail(
      email.split('@')[0], jobs, Math.max(...jobs.map(job => job.acceptanceChance)),
      { frequencyLabel: 'Weekly', campaign: 'sona_picks_weekly' },
    );
    await createJobEmailDeliveryAttempt(db, { uid, attemptId: claim.attemptId, purpose: 'job_alert', source: 'weekly_cron', createdAt: claimedAt, recipientEmail: email });
    let status = 'accepted';
    try {
      const delivery = await new Resend(process.env.RESEND_API_KEY!).emails.send({
        from: EMAIL_FROM, to: [email], subject, html, tags: getResendDeliveryTags(claim.attemptId, 'job_alert'),
      }, { idempotencyKey: `sona-picks-${uid}-${dayKey}` });
      if (delivery.error) throw new Error(delivery.error.message);
      await acceptJobEmailDeliveryAttempt(db, { attemptId: claim.attemptId, providerMessageId: delivery.data?.id || null, acceptedAt: new Date().toISOString() });
      await claimRef.set({ status: 'accepted', lockUntil: null, updatedAt: new Date().toISOString() }, { merge: true });
      await logUserCommunication({ uid, email, subject, bodyPreview: `Sona Picks weekly digest with ${jobs.length} reviewed jobs.`, template: 'sona_picks_weekly', sentBy: 'weekly_suggestions', status: 'accepted' });
    } catch (error) {
      status = `error:${sanitizeJobDeliveryError(error)}`;
      const failedAt = new Date().toISOString();
      await failJobEmailDeliveryAttempt(db, { attemptId: claim.attemptId, failedAt, error: sanitizeJobDeliveryError(error) }).catch(() => undefined);
      await claimRef.set({ status: 'failed', lockUntil: null, updatedAt: failedAt }, { merge: true });
      await logUserCommunication({ uid, email, subject, bodyPreview: 'Sona Picks weekly digest delivery failed.', template: 'sona_picks_weekly', sentBy: 'weekly_suggestions', status: 'failed' }).catch(() => undefined);
    }
    if (status.startsWith('error')) results.push({ uid, status });
    else results.push({ uid, status: 'accepted' });
  }
  return NextResponse.json({ success: true, summary: { total: results.length, accepted: results.filter(item => item.status === 'accepted').length }, results });
}
