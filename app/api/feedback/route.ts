/**
 * Feedback API — POST /api/feedback
 * Dual-sends feedback to Discord (webhook embed) and admin email.
 * Requires authentication.
 */
import { after, NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { monitor } from '@/lib/monitor';
import { getAdminDb } from '@/lib/firebase-admin';
import { normalizeStripeAccountReviewIssueCode } from '@/lib/billing/stripe-account-review-support';
import { normalizeStripeAccountReviewReceipt } from '@/lib/billing/stripe-account-review-receipt';
import { enqueueEmail } from '@/lib/email/outbox';
import { recordObservabilitySafely } from '@/lib/observability/recorder';
import { observabilityNoticeVersion, observabilitySurfaceAvailable } from '@/lib/observability/config';
import { prepareDiagnosticCase } from '@/lib/observability/diagnostics';

const CATEGORY_MAP: Record<string, { label: string; emoji: string; color: number }> = {
  bug:     { label: 'Bug Report',       emoji: '🐛', color: 0xEF4444 },
  feature: { label: 'Feature Request',  emoji: '💡', color: 0x3B82F6 },
  general: { label: 'General Feedback', emoji: '💬', color: 0x10B981 },
  billing: { label: 'Billing Account Review', emoji: '🧾', color: 0x2563EB },
  other:   { label: 'Other',            emoji: '❓', color: 0x6B7280 },
};

const MOOD_MAP: Record<number, string> = {
  1: '😡 Frustrated',
  2: '😕 Confused',
  3: '😐 Neutral',
  4: '🙂 Happy',
  5: '😍 Delighted',
};

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 5, rateLimitWindow: 3600_000 });
  if (guard.error) return guard.error;

  try {
    const body = await req.json();
    const {
      category,
      message,
      page: pageUrl,
      mood,
      issueCode,
      diagnosticsRequested,
      diagnosticsNoticeVersion,
    } = body;

    if (!message || typeof message !== 'string' || message.length < 5) {
      return NextResponse.json({ error: 'Feedback message is required (min 5 chars)' }, { status: 400 });
    }
    if (message.length > 5000) {
      return NextResponse.json({ error: 'Message too long (max 5000 chars)' }, { status: 400 });
    }

    const normalizedIssueCode = normalizeStripeAccountReviewIssueCode(issueCode);
    if (issueCode !== undefined && issueCode !== null && !normalizedIssueCode) {
      return NextResponse.json({ error: 'Unsupported support request.' }, { status: 400 });
    }
    const effectiveCategory = normalizedIssueCode ? 'billing' : category;
    const cat = CATEGORY_MAP[effectiveCategory] || CATEGORY_MAP.general;
    const userName = guard.user.email?.split('@')[0] || 'Unknown';
    const userEmail = guard.user.email || 'unknown';
    // Retain the complete accepted report; only delivery summaries are bounded.
    const safeMessage = message;
    const moodLabel = mood ? MOOD_MAP[mood] || '' : '';
    const submittedAt = new Date().toISOString();
    const retentionExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60_000);

    const db = getAdminDb();
    const billingReceiptRef = db
      .collection('users')
      .doc(guard.user.uid)
      .collection('billingSupport')
      .doc('current');
    const baseFeedbackRecord = {
      type: 'feedback',
      uid: guard.user.uid,
      email: userEmail,
      name: userName,
      category: effectiveCategory || 'general',
      categoryLabel: cat.label,
      issueCode: normalizedIssueCode,
      message: safeMessage,
      page: pageUrl || null,
      mood: mood || null,
      moodLabel: moodLabel || null,
      status: 'new',
      diagnosticsRequested: false,
      diagnosticsNoticeVersion: null,
      diagnosticCaseId: null,
      diagnosticsState: 'not_requested',
      createdAt: submittedAt,
      expiresAt: retentionExpiresAt,
    };

    let billingCaseId: string | null = null;
    let generalCaseId: string | null = null;
    let diagnosticCaseId: string | null = null;
    let diagnosticsWereRequested = false;
    if (normalizedIssueCode) {
      const proposedCaseRef = db.collection('admin_feedback').doc();
      const userFeedbackRef = db.collection('users').doc(guard.user.uid).collection('feedback').doc();
      const communicationRef = db.collection('users').doc(guard.user.uid).collection('communications').doc();
      try {
        const creation = await db.runTransaction(async transaction => {
          const currentReceiptSnapshot = await transaction.get(billingReceiptRef);
          const currentReceipt = normalizeStripeAccountReviewReceipt(currentReceiptSnapshot.data());
          if (currentReceiptSnapshot.exists && !currentReceipt) {
            throw new Error('Existing billing support receipt is invalid.');
          }
          if (currentReceipt && currentReceipt.status !== 'resolved') {
            return {
              created: false,
              caseId: currentReceipt.caseId,
              status: currentReceipt.status,
            } as const;
          }
          const caseId = proposedCaseRef.id;
          const feedbackRecord = { ...baseFeedbackRecord, caseId };
          transaction.set(userFeedbackRef, feedbackRecord);
          transaction.set(communicationRef, feedbackRecord);
          transaction.set(proposedCaseRef, feedbackRecord);
          transaction.set(billingReceiptRef, {
            caseId,
            issueCode: normalizedIssueCode,
            status: 'new',
            createdAt: submittedAt,
            updatedAt: submittedAt,
            resolvedAt: null,
            expiresAt: retentionExpiresAt,
          });
          return { created: true, caseId, status: 'new' as const };
        });
        if (!creation.created) {
          return NextResponse.json({
            success: true,
            caseId: creation.caseId,
            status: creation.status,
            alreadyOpen: true,
          });
        }
        billingCaseId = creation.caseId;
      } catch (error) {
        console.error('[feedback] Billing support transaction failed:', error);
        return NextResponse.json({
          code: 'BILLING_SUPPORT_REQUEST_UNAVAILABLE',
          error: 'Billing support could not accept this request. Please try again later.',
        }, { status: 503 });
      }
    } else {
      const adminFeedbackRef = db.collection('admin_feedback').doc();
      const userFeedbackRef = db.collection('users').doc(guard.user.uid).collection('feedback').doc();
      const communicationRef = db.collection('users').doc(guard.user.uid).collection('communications').doc();
      generalCaseId = adminFeedbackRef.id;
      diagnosticsWereRequested = effectiveCategory === 'bug' && diagnosticsRequested === true;
      const acknowledgedDiagnosticsNotice = typeof diagnosticsNoticeVersion === 'string'
        ? diagnosticsNoticeVersion
        : '';
      if (
        diagnosticsWereRequested
        && acknowledgedDiagnosticsNotice !== observabilityNoticeVersion()
      ) {
        return NextResponse.json({
          code: 'OBSERVABILITY_NOTICE_VERSION_CHANGED',
          error: 'The privacy notice changed. Review the current notice before sharing diagnostics.',
        }, { status: 409 });
      }
      const preparedDiagnostic = diagnosticsWereRequested && observabilitySurfaceAvailable()
        ? prepareDiagnosticCase(
            guard.user.uid,
            {
              category: 'tool_failure',
              shareDiagnostics: true,
              noticeVersion: acknowledgedDiagnosticsNotice,
            },
            generalCaseId,
            new Date(submittedAt),
          )
        : null;
      diagnosticCaseId = preparedDiagnostic?.caseId || null;
      const feedbackRecord = {
        ...baseFeedbackRecord,
        caseId: generalCaseId,
        diagnosticsRequested: diagnosticsWereRequested,
        diagnosticsNoticeVersion: diagnosticsWereRequested ? acknowledgedDiagnosticsNotice : null,
        diagnosticCaseId,
        diagnosticsState: preparedDiagnostic ? 'active' : diagnosticsWereRequested ? 'unavailable' : 'not_requested',
      };
      try {
        await db.runTransaction(async transaction => {
          transaction.create(userFeedbackRef, feedbackRecord);
          transaction.create(communicationRef, feedbackRecord);
          transaction.create(adminFeedbackRef, feedbackRecord);
          if (preparedDiagnostic) {
            transaction.create(
              db.collection('diagnostic_support_cases').doc(preparedDiagnostic.caseId),
              preparedDiagnostic.caseData,
            );
            if (preparedDiagnostic.grantData) {
              transaction.create(
                db
                  .collection('users')
                  .doc(guard.user.uid)
                  .collection('diagnosticGrants')
                  .doc(preparedDiagnostic.caseId),
                preparedDiagnostic.grantData,
              );
            }
          }
        });
      } catch (error) {
        console.error('[feedback] Feedback transaction failed:', error);
        return NextResponse.json({
          error: 'Feedback could not be saved. Please try again later.',
        }, { status: 503 });
      }
    }

    // ── Send to Discord (fire-and-forget) ──
    const discordUrl = process.env.DISCORD_FEEDBACK_WEBHOOK_URL;
    const discordPromise = discordUrl
      ? fetch(discordUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: `${cat.emoji} ${cat.label}`,
              description: safeMessage.slice(0, 1900),
              color: cat.color,
              fields: [
                { name: 'User', value: `${userName} (${userEmail})`, inline: true },
                ...(pageUrl ? [{ name: 'Page', value: pageUrl, inline: true }] : []),
                ...(moodLabel ? [{ name: 'Mood', value: moodLabel, inline: true }] : []),
              ],
              footer: { text: `UID: ${guard.user.uid.slice(0, 8)}…` },
              timestamp: new Date().toISOString(),
            }],
          }),
        }).catch(err => console.error('[feedback] Discord webhook failed:', err))
      : Promise.resolve();

    // ── Send admin email ──
    const caseId = billingCaseId || generalCaseId;
    if (!caseId) throw new Error('Feedback case identifier was not created');

    const [customerMessage, operationsMessage] = await Promise.allSettled([
      enqueueEmail({
        event: 'support.feedback_received',
        recipient: { kind: 'user', uid: guard.user.uid },
        dedupeKey: `feedback-receipt:${caseId}`,
        payload: {
          recipientName: userName,
          caseId,
          summary: safeMessage.slice(0, 600),
          occurredAt: submittedAt,
          caseUrl: 'https://talentconsulting.io/suite/feedback',
        },
        metadata: { category: effectiveCategory || 'general', billingReview: Boolean(normalizedIssueCode) },
      }),
      enqueueEmail({
        event: 'internal.support_request_received',
        recipient: { kind: 'operations' },
        dedupeKey: `feedback-ops:${caseId}`,
        payload: {
          referenceId: caseId,
          summary: safeMessage.slice(0, 1_000),
          severity: normalizedIssueCode || effectiveCategory === 'bug' ? 'warning' : 'info',
          occurredAt: submittedAt,
          details: [
            { label: 'User ID', value: guard.user.uid },
            { label: 'Category', value: cat.label },
            ...(diagnosticCaseId ? [{ label: 'Diagnostic case', value: diagnosticCaseId }] : []),
            ...(moodLabel ? [{ label: 'Mood', value: moodLabel }] : []),
            ...(pageUrl ? [{ label: 'Page', value: String(pageUrl).slice(0, 500) }] : []),
          ],
        },
        metadata: {
          category: effectiveCategory || 'general',
          billingReview: Boolean(normalizedIssueCode),
          diagnosticsAttached: Boolean(diagnosticCaseId),
        },
      }),
      discordPromise,
    ]);

    monitor.info('User Feedback', cat.label, [
      { name: 'User', value: userName },
      { name: 'Category', value: cat.label },
      ...(moodLabel ? [{ name: 'Mood', value: moodLabel }] : []),
    ]);
    after(() => recordObservabilitySafely({
      db,
      uid: guard.user.uid,
      author: 'server',
      productAnalyticsConsent: false,
      events: [{
        schemaVersion: 1,
        purpose: 'service_reliability',
        producer: 'feedback_server',
        eventName: 'feedback_accepted',
        operationId: caseId,
        category: 'support',
        action: 'submit',
        outcome: 'success',
        plan: guard.user.tier === 'god' ? 'studio' : guard.user.tier,
      }],
    }));

    return NextResponse.json({
      success: true,
      caseId,
      diagnosticCaseId,
      diagnosticsRequested: diagnosticsWereRequested,
      diagnosticsAttached: Boolean(diagnosticCaseId),
      emailQueued: (customerMessage.status === 'fulfilled' && customerMessage.value.created) || (operationsMessage.status === 'fulfilled' && operationsMessage.value.created),
      deliveryWarning: customerMessage.status === 'rejected' || operationsMessage.status === 'rejected' ? 'Feedback saved; an email receipt could not be queued.' : null,
    });
  } catch (error) {
    console.error('[api/feedback] Error:', error);
    monitor.critical('Tool: feedback', String(error));
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
  }
}
