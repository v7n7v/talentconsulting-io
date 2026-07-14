/**
 * Job Suggestions Email Notification
 * POST /api/jobs/notify — sends on-demand picks digest via Resend
 * Called after suggestions are generated if user has emailNotifications enabled
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { Resend } from 'resend';
import { monitor } from '@/lib/monitor';
import { EMAIL_FROM, buildJobDigestEmail, type JobForDigest } from '@/lib/email-templates';
import { createJobAlertUnsubscribeToken } from '@/lib/job-alerts-unsubscribe';
import { getJobAlertFrequencyLabel, withSonaPicksUtm } from '@/lib/job-alerts';
import { logUserCommunication } from '@/lib/communications';
import {
  getJobAlertDeliverySnapshot,
  getJobAlertEmailConsent,
  sanitizeJobDeliveryError,
} from '@/lib/job-notification-delivery';
import { getResendDeliveryTags, isJobEmailDeliveryLockActive } from '@/lib/job-notification-receipt-contract';
import {
  acceptJobEmailDeliveryAttempt,
  buildJobEmailIdempotencyKey,
  createJobEmailDeliveryAttempt,
  failJobEmailDeliveryAttempt,
  planJobEmailDeliveryClaim,
} from '@/lib/job-notification-receipts';
import {
  loadRecommendationLedger,
  resolveRecommendationDigestEvidence,
} from '@/lib/job-recommendation-platform';
import { getJobNotificationDeliveryReadinessForStore } from '@/lib/job-notification-readiness';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 3, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  try {
    const { jobs } = await req.json() as { jobs: Array<Partial<JobForDigest> & { identityKey?: string; dedupeKey?: string }> };

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ success: false, error: 'No jobs to send' }, { status: 400 });
    }

    const email = guard.user.email;
    if (!email) {
      return NextResponse.json({ success: false, error: 'No email on account' }, { status: 400 });
    }

    const db = getAdminDb();
    const prefsRef = db.collection('users').doc(guard.user.uid).collection('settings').doc('jobPreferences');
    const prefsSnap = await prefsRef.get();
    const prefs = prefsSnap.exists ? prefsSnap.data() || {} : {};
    const consent = getJobAlertEmailConsent(prefs);
    if (!consent.granted) {
      return NextResponse.json({
        success: false,
        code: 'EMAIL_CONSENT_REQUIRED',
        error: 'Enable Sona Picks email delivery before sending this digest.',
        consent,
        delivery: getJobAlertDeliverySnapshot(prefs),
      }, { status: 403 });
    }

    if (!(await getJobNotificationDeliveryReadinessForStore(db)).canSendTrackedEmail) {
      return NextResponse.json({
        success: false,
        code: 'EMAIL_DELIVERY_NOT_READY',
        error: 'Confirmed email delivery is temporarily unavailable. Your picks remain available here.',
        delivery: getJobAlertDeliverySnapshot(prefs),
      }, { status: 503 });
    }

    const ledger = await loadRecommendationLedger(db, guard.user.uid);
    const evidence = jobs.slice(0, 15).map(job => resolveRecommendationDigestEvidence(ledger, job));
    if (evidence.some(item => item === null)) {
      return NextResponse.json({
        success: false,
        code: 'RECOMMENDATION_EVIDENCE_STALE',
        retryable: true,
        error: 'Refresh Sona Picks before sending. One or more scores no longer match current server evidence.',
      }, { status: 409 });
    }
    const verifiedJobs = evidence.filter((item): item is NonNullable<typeof item> => Boolean(item));
    const topScore = Math.max(...verifiedJobs.map(job => job.talentFitScore));
    const userName = guard.user.email?.split('@')[0] || 'there';
    const token = createJobAlertUnsubscribeToken(guard.user.uid);
    const unsubscribeUrl = `https://talentconsulting.io/api/jobs/unsubscribe?uid=${encodeURIComponent(guard.user.uid)}&token=${token}&source=manual_digest`;
    const digestJobs: JobForDigest[] = verifiedJobs.map((job, index) => {
      const params = new URLSearchParams({
        source: 'sona_picks',
        jobTitle: job.title,
        company: job.company,
        jobUrl: job.url,
      });
      return {
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
        acceptanceChance: job.talentFitScore,
        acceptanceReason: job.reason,
        sourceName: job.sourceName,
        sourceConfidence: job.sourceConfidence,
        fitConfidence: job.fitConfidence,
        scoreVersion: job.scoreVersion,
        prepareUrl: withSonaPicksUtm(`https://talentconsulting.io/suite/resume?${params.toString()}`, `prepare_${index + 1}`),
        saveUrl: withSonaPicksUtm('https://talentconsulting.io/suite/applications', `save_${index + 1}`),
        viewUrl: withSonaPicksUtm(job.url, `view_${index + 1}`),
      };
    });
    const { subject, html } = buildJobDigestEmail(userName, digestJobs, topScore, {
      tier: guard.user.tier,
      frequencyLabel: getJobAlertFrequencyLabel(prefs.jobAlertsFrequency || 'weekly', guard.user.tier),
      unsubscribeUrl,
    });

    const requestedAt = new Date().toISOString();
    const idempotencyKey = buildJobEmailIdempotencyKey('manual-picks', [
      guard.user.uid,
      requestedAt.slice(0, 10),
      ...digestJobs.map(job => `${job.title}|${job.company}|${job.url}`).sort(),
    ]);
    const claimRef = db.collection('users').doc(guard.user.uid).collection('notificationClaims').doc(idempotencyKey);
    const proposedAttemptId = crypto.randomUUID();
    const claim = await db.runTransaction(async transaction => {
      const [latestPrefsSnap, claimSnap] = await Promise.all([
        transaction.get(prefsRef),
        transaction.get(claimRef),
      ]);
      const latestPrefs = latestPrefsSnap.data() || {};
      if (!getJobAlertEmailConsent(latestPrefs).granted) return { outcome: 'consent_revoked' as const };
      if (isJobEmailDeliveryLockActive(latestPrefs.jobAlertsDeliveryLockUntil)) {
        return { outcome: 'delivery_in_progress' as const };
      }
      const existingClaim = claimSnap.data() || {};
      const existingAttemptId = typeof existingClaim.attemptId === 'string' ? existingClaim.attemptId : '';
      const existingAttemptSnap = existingAttemptId
        ? await transaction.get(db.collection('emailDeliveryAttempts').doc(existingAttemptId))
        : null;
      const existingAttempt = existingAttemptSnap?.data() || {};
      const deliveryPlan = planJobEmailDeliveryClaim({
        baseIdempotencyKey: idempotencyKey,
        proposedAttemptId,
        existingAttemptId,
        existingClaimStatus: existingClaim.status,
        existingAttemptStatus: existingAttempt.status,
        existingProviderIdempotencyKey: existingClaim.providerIdempotencyKey,
        existingRetryCount: existingClaim.retryCount,
        lockUntil: existingClaim.lockUntil,
      });
      if (deliveryPlan.outcome !== 'acquired') return deliveryPlan;
      const { attemptId, providerIdempotencyKey, retryCount } = deliveryPlan;
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      transaction.set(claimRef, {
        status: 'sending',
        attemptId,
        idempotencyKey,
        providerIdempotencyKey,
        retryCount,
        lockUntil,
        updatedAt: requestedAt,
        createdAt: existingClaim.createdAt || requestedAt,
      }, { merge: true });
      transaction.set(prefsRef, {
        jobAlertsDeliveryStatus: 'sending',
        jobAlertsDeliveryAttemptId: attemptId,
        jobAlertsDeliveryUpdatedAt: requestedAt,
        jobAlertsDeliveryError: null,
        jobAlertsLastAttemptAt: requestedAt,
        jobAlertsDeliveryLockUntil: lockUntil,
      }, { merge: true });
      return deliveryPlan;
    });
    if (claim.outcome === 'consent_revoked') {
      return NextResponse.json({
        success: false,
        code: 'EMAIL_CONSENT_REQUIRED',
        error: 'Email consent changed before this digest could be sent.',
      }, { status: 403 });
    }
    if (claim.outcome === 'in_progress') {
      return NextResponse.json({
        success: false,
        code: 'EMAIL_DELIVERY_IN_PROGRESS',
        error: 'This digest is already being prepared for delivery.',
      }, { status: 409 });
    }
    if (claim.outcome === 'delivery_in_progress') {
      return NextResponse.json({
        success: false,
        code: 'EMAIL_DELIVERY_IN_PROGRESS',
        error: 'Another Sona Picks delivery is already in progress.',
      }, { status: 409 });
    }
    if (claim.outcome === 'duplicate') {
      const latestPrefs = await prefsRef.get().then(snapshot => snapshot.data() || prefs);
      return NextResponse.json({
        success: true,
        accepted: true,
        duplicate: true,
        jobCount: digestJobs.length,
        delivery: getJobAlertDeliverySnapshot(latestPrefs),
      });
    }
    const attemptId = claim.attemptId;
    const eventsRef = db.collection('users').doc(guard.user.uid).collection('jobAlertEvents');
    await eventsRef.add({
      type: 'digest_delivery',
      status: 'sending',
      channel: 'email',
      source: 'manual',
      attemptId,
      jobCount: digestJobs.length,
      createdAt: requestedAt,
    }).catch(() => {});
    try {
      await createJobEmailDeliveryAttempt(db, {
        uid: guard.user.uid,
        attemptId,
        purpose: 'job_alert',
        source: 'manual',
        createdAt: requestedAt,
        recipientEmail: email,
      });
    } catch (error) {
      const safeError = sanitizeJobDeliveryError(error);
      await db.runTransaction(async transaction => {
        const latest = await transaction.get(prefsRef);
        if (latest.data()?.jobAlertsDeliveryAttemptId !== attemptId) return;
        transaction.set(prefsRef, {
          jobAlertsDeliveryStatus: 'failed',
          jobAlertsDeliveryUpdatedAt: new Date().toISOString(),
          jobAlertsDeliveryError: safeError,
          jobAlertsLastAttemptAt: null,
          jobAlertsDeliveryLockUntil: null,
        }, { merge: true });
      }).catch(() => {});
      await claimRef.set({ status: 'failed', error: safeError, lockUntil: null, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
      return NextResponse.json({
        success: false,
        code: 'EMAIL_RECEIPT_TRACKING_UNAVAILABLE',
        error: 'Email delivery tracking is unavailable. Your picks are still available here.',
      }, { status: 503 });
    }

    let providerMessageId: string | null = null;
    try {
      const delivery = await getResend().emails.send({
        from: EMAIL_FROM,
        to: [email],
        subject,
        html,
        tags: getResendDeliveryTags(attemptId, 'job_alert'),
      }, { idempotencyKey: claim.providerIdempotencyKey });
      if (delivery.error) throw new Error(delivery.error.message);
      providerMessageId = delivery.data?.id || null;
    } catch (deliveryError) {
      const failedAt = new Date().toISOString();
      const safeError = sanitizeJobDeliveryError(deliveryError);
      const failedState = {
        jobAlertsDeliveryStatus: 'failed',
        jobAlertsDeliveryAttemptId: attemptId,
        jobAlertsDeliveryUpdatedAt: failedAt,
        jobAlertsDeliveryError: safeError,
        jobAlertsLastAttemptAt: null,
        jobAlertsDeliveryLockUntil: null,
      };
      const failure = await failJobEmailDeliveryAttempt(db, { attemptId, failedAt, error: safeError })
        .catch(() => ({ updated: false, status: null }));
      if (!failure.updated && failure.status && failure.status !== 'failed') {
        await db.runTransaction(async transaction => {
          const latest = await transaction.get(claimRef);
          if (latest.data()?.attemptId !== attemptId) return;
          transaction.set(claimRef, { status: failure.status, lockUntil: null, updatedAt: failedAt }, { merge: true });
        }).catch(() => {});
        const latestPrefs = await prefsRef.get().then(snapshot => snapshot.data() || prefs);
        return NextResponse.json({
          success: true,
          accepted: true,
          jobCount: digestJobs.length,
          delivery: getJobAlertDeliverySnapshot(latestPrefs),
        });
      }
      if (!failure.updated && failure.status === null) {
        await db.runTransaction(async transaction => {
          const latest = await transaction.get(prefsRef);
          if (latest.data()?.jobAlertsDeliveryAttemptId !== attemptId) return;
          transaction.set(prefsRef, failedState, { merge: true });
        }).catch(() => {});
      }
      await db.runTransaction(async transaction => {
        const latest = await transaction.get(claimRef);
        if (latest.data()?.attemptId !== attemptId) return;
        transaction.set(claimRef, { status: 'failed', error: safeError, lockUntil: null, updatedAt: failedAt }, { merge: true });
      }).catch(() => {});
      await eventsRef.add({
        type: 'digest_delivery',
        status: 'failed',
        channel: 'email',
        source: 'manual',
        attemptId,
        jobCount: digestJobs.length,
        error: safeError,
        createdAt: failedAt,
      }).catch(() => {});
      await logUserCommunication({
        uid: guard.user.uid,
        email,
        subject,
        bodyPreview: `Sona Picks email delivery failed for ${digestJobs.length} jobs.`,
        template: 'sona_picks_manual_digest',
        sentBy: 'jobs_notify',
        status: 'failed',
        metadata: { attemptId, jobCount: digestJobs.length },
      }).catch(() => {});
      return NextResponse.json({
        success: false,
        code: 'EMAIL_DELIVERY_FAILED',
        error: 'The email could not be delivered. Your picks are still available here.',
        delivery: getJobAlertDeliverySnapshot({ ...prefs, ...failedState }),
      }, { status: 502 });
    }

    const acceptedAt = new Date().toISOString();
    let acceptance: { status: string } = { status: 'accepted' };
    let acceptancePersisted = true;
    try {
      acceptance = await acceptJobEmailDeliveryAttempt(db, { attemptId, providerMessageId, acceptedAt });
    } catch (error) {
      acceptancePersisted = false;
      console.error('[jobs/notify] Email was accepted but receipt state could not be persisted:', error);
    }
    await db.runTransaction(async transaction => {
      const [latestPrefsSnap, latestClaimSnap] = await Promise.all([
        transaction.get(prefsRef),
        transaction.get(claimRef),
      ]);
      if (latestPrefsSnap.data()?.jobAlertsDeliveryAttemptId === attemptId) {
        transaction.set(prefsRef, {
          lastNotificationSentAt: acceptedAt,
          jobAlertsLastSentAt: acceptedAt,
          jobAlertsLastAcceptedAt: acceptedAt,
          jobAlertsLastJobCount: digestJobs.length,
          jobAlertsDeliveryLockUntil: null,
        }, { merge: true });
      }
      if (latestClaimSnap.data()?.attemptId === attemptId) {
        transaction.set(claimRef, {
          status: acceptance.status,
          providerMessageId,
          acceptedAt,
          lockUntil: null,
          updatedAt: acceptedAt,
        }, { merge: true });
      }
    }).catch(error => {
      console.error('[jobs/notify] Email was accepted but cadence state could not be persisted:', error);
    });
    await eventsRef.add({
      type: 'digest_delivery',
      status: acceptance.status,
      channel: 'email',
      source: 'manual',
      attemptId,
      providerMessageId,
      jobCount: digestJobs.length,
      topScore,
      createdAt: acceptedAt,
    }).catch(() => {});
    await logUserCommunication({
      uid: guard.user.uid,
      email,
      subject,
      bodyPreview: `Sona Picks provider outcome: ${acceptance.status} for ${digestJobs.length} jobs. Top score: ${topScore}%.`,
      template: 'sona_picks_manual_digest',
      sentBy: 'jobs_notify',
      status: acceptance.status,
      metadata: { attemptId, providerMessageId, jobCount: digestJobs.length, topScore },
    }).catch(error => {
      console.error('[jobs/notify] Failed to log communication:', error);
    });

    const latestPrefs = await prefsRef.get().then(snapshot => snapshot.data() || prefs);
    const responsePrefs = acceptancePersisted ? latestPrefs : {
      ...latestPrefs,
      jobAlertsDeliveryStatus: acceptance.status,
      jobAlertsDeliveryUpdatedAt: acceptedAt,
      jobAlertsDeliveryError: acceptance.status === 'failed' ? 'The provider reported a delivery failure.' : null,
      jobAlertsProviderMessageId: providerMessageId,
      jobAlertsReceiptTracking: providerMessageId ? 'pending' : 'unavailable',
    };
    return NextResponse.json({
      success: true,
      accepted: true,
      jobCount: digestJobs.length,
      delivery: getJobAlertDeliverySnapshot(responsePrefs),
    });
  } catch (error) {
    console.error('[jobs/notify] Error:', error);
    monitor.critical('Tool: jobs/notify', String(error));
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
