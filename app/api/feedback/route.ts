/**
 * Feedback API — POST /api/feedback
 * Dual-sends feedback to Discord (webhook embed) and admin email.
 * Requires authentication.
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { monitor } from '@/lib/monitor';
import { Resend } from 'resend';
import { EMAIL_FROM, buildContactEmail } from '@/lib/email-templates';
import { getAdminDb } from '@/lib/firebase-admin';
import { normalizeStripeAccountReviewIssueCode } from '@/lib/billing/stripe-account-review-support';
import { normalizeStripeAccountReviewReceipt } from '@/lib/billing/stripe-account-review-receipt';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY not set');
    _resend = new Resend(key);
  }
  return _resend;
}

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
    const { category, message, page: pageUrl, mood, issueCode } = body;

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
    const safeMessage = message.slice(0, 2000);
    const moodLabel = mood ? MOOD_MAP[mood] || '' : '';
    const submittedAt = new Date().toISOString();

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
      createdAt: submittedAt,
    };

    let billingCaseId: string | null = null;
    let generalPersistence: Promise<PromiseSettledResult<unknown>[]> | null = null;
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
      generalPersistence = Promise.allSettled([
        db.collection('users').doc(guard.user.uid).collection('feedback').add(baseFeedbackRecord),
        db.collection('users').doc(guard.user.uid).collection('communications').add(baseFeedbackRecord),
        db.collection('admin_feedback').add(baseFeedbackRecord),
      ]);
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
              description: safeMessage,
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
    const emailPromise = (async () => {
      try {
        const { subject, html } = buildContactEmail(userName, userEmail, cat.label, safeMessage);
        await getResend().emails.send({
          from: EMAIL_FROM,
          to: ['hello@talentconsulting.io'],
          subject,
          html,
        });
      } catch (err) {
        console.error('[feedback] Email send failed:', err);
      }
    })();

    // Fire both in parallel
    await Promise.all([
      discordPromise,
      emailPromise,
    ]);
    if (generalPersistence) await generalPersistence;

    monitor.info('User Feedback', cat.label, [
      { name: 'User', value: userName },
      { name: 'Category', value: cat.label },
      ...(moodLabel ? [{ name: 'Mood', value: moodLabel }] : []),
    ]);

    return NextResponse.json({ success: true, ...(billingCaseId ? { caseId: billingCaseId } : {}) });
  } catch (error) {
    console.error('[api/feedback] Error:', error);
    monitor.critical('Tool: feedback', String(error));
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
  }
}
