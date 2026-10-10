'use client';

import PageHelp from '@/components/PageHelp';
import { useToolGuidance, ToolGuidanceInvitation } from '@/components/guidance/ToolGuidanceProvider';
import { buildToolStory, storyStep } from '@/lib/tool-story-adapters';

import { TacoName } from '@/components/BrandLogo';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader, SuitePanel } from '@/components/suite/SuiteToolChrome';
import {
  issueCodeForStripeAccountReviewContext,
  STRIPE_ACCOUNT_REVIEW_MESSAGE,
} from '@/lib/billing/stripe-account-review-support';
import { readPrivacySafeDiagnosticNoticeVersion } from '@/lib/observability/client';
import { auth } from '@/lib/firebase';
import { authFetch } from '@/lib/auth-fetch';

const CATEGORIES = [
  { id: 'bug',     label: 'Bug Report',       icon: 'bug_report' },
  { id: 'feature', label: 'Feature Request',   icon: 'lightbulb' },
  { id: 'general', label: 'General Feedback',  icon: 'chat_bubble' },
  { id: 'billing', label: 'Billing Support',   icon: 'receipt_long' },
  { id: 'other',   label: 'Other',             icon: 'help' },
];

const MOODS = [
  { value: 1, icon: 'sentiment_very_dissatisfied', label: 'Frustrated' },
  { value: 2, icon: 'sentiment_dissatisfied', label: 'Confused' },
  { value: 3, icon: 'sentiment_neutral', label: 'Neutral' },
  { value: 4, icon: 'sentiment_satisfied', label: 'Happy' },
  { value: 5, icon: 'sentiment_very_satisfied', label: 'Delighted' },
];

export default function FeedbackPage() {
  const uid = useStore(state => state.user?.uid || 'guest');
  return <FeedbackForm key={uid} />;
}

function FeedbackForm() {
  const { user } = useStore();
  const router = useRouter();
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [storyFailure, setStoryFailure] = useState(false);
  const [issueCode, setIssueCode] = useState<string | null>(null);
  const [diagnosticCaseId, setDiagnosticCaseId] = useState<string | null>(null);
  const [receiptCaseId, setReceiptCaseId] = useState<string | null>(null);
  const [diagnosticWarning, setDiagnosticWarning] = useState<string | null>(null);
  const [diagnosticAcknowledgement, setDiagnosticAcknowledgement] = useState<{
    uid: string;
    noticeVersion: string;
  } | null>(null);
  const [diagnosticPolicyLoading, setDiagnosticPolicyLoading] = useState(false);
  const userUid = typeof (user as any)?.uid === 'string' ? (user as any).uid as string : null;
  const shareDiagnostics = Boolean(
    userUid
    && auth.currentUser?.uid === userUid
    && diagnosticAcknowledgement?.uid === userUid,
  );
  const diagnosticsNoticeVersion = shareDiagnostics
    ? diagnosticAcknowledgement?.noticeVersion || null
    : null;

  useEffect(() => {
    // Capture the referring page
    if (typeof document !== 'undefined') {
      setCurrentPage(document.referrer || window.location.pathname);
      const context = new URLSearchParams(window.location.search).get('context');
      const nextIssueCode = issueCodeForStripeAccountReviewContext(context);
      if (nextIssueCode) {
        setIssueCode(nextIssueCode);
        setCategory('billing');
        setMessage(STRIPE_ACCOUNT_REVIEW_MESSAGE);
      }
    }
  }, []);

  useEffect(() => {
    setDiagnosticAcknowledgement(null); setStoryFailure(false);
    setDiagnosticPolicyLoading(false);
    setDiagnosticWarning(null);
  }, [userUid]);

  useToolGuidance(buildToolStory({
    toolId: 'feedback', title: 'Feedback and support', contextKey: JSON.stringify([issueCode || 'feedback', receiptCaseId || 'draft']),
    purpose: 'Describe a real issue or suggestion and review any diagnostic-sharing choice before sending it.',
    pending: submitting || diagnosticPolicyLoading, hasResult: submitted, failed: storyFailure,
    blockedReason: !user ? 'Sign in to send feedback from your account.' : undefined,
    work: !user ? [storyStep('account', 'Read the account prerequisite', 'Sign in to use the feedback form. Reading Help does not sign you in, submit a message or share diagnostics.', 'feedback-account')] : [storyStep('category', 'Choose the feedback category', 'Use the category that describes this case. Billing account-review context keeps the support category scoped.', 'feedback-category', 'Sign in to use the feedback form.'), storyStep('message', 'Describe the actual case', 'State what happened and what you expected. Keep credentials and private resume content out of the message.', 'feedback-message', 'Sign in to write feedback.'), storyStep('privacy', 'Review optional diagnostics', 'For a bug report, choose diagnostic sharing yourself after reading the privacy notice. Other categories do not require this choice.', 'feedback-diagnostics', 'Diagnostic sharing is shown only for eligible bug reports. Review any visible privacy warning.'), storyStep('send', 'Send only when ready', 'Send submits this feedback to the team. Help never sends it or opts you into diagnostic sharing.', 'feedback-send')],
    recovery: [storyStep('retry', 'Keep your message and review the failure', 'The last send did not confirm a receipt. Your text remains in the form; choose Send again yourself when ready.', 'feedback-send')],
    result: [storyStep('receipt', 'Read the actual receipt', 'This receipt follows successful submission. Billing support requests do not create checkout or change a plan.', 'feedback-receipt'), storyStep('next', 'Choose where to continue', 'Use the receipt actions yourself. Guide position does not close a case or confirm a support resolution.', 'feedback-receipt')],
  }));

  if (!user) {
    return (
      <div className="mobile-app-content flex min-h-dvh items-center justify-center p-6">
        <div className="relative w-full max-w-xl px-12 text-center">
          <div className="absolute right-0 top-0"><PageHelp toolId="feedback" /></div>
          <span className="material-symbols-rounded text-5xl text-[var(--text-muted)] mb-4 block">lock</span>
          <p data-guide="feedback-account" className="text-[var(--text-secondary)]">Please sign in to share feedback.</p>
          <ToolGuidanceInvitation toolId="feedback" />
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || message.trim().length < 5) {
      showToast('Please write at least a few words', 'cancel');
      return;
    }
    const submittingUid = auth.currentUser?.uid || null;
    if (!submittingUid || userUid !== submittingUid || submitting) return;
    const isCurrent = () => alive.current && auth.currentUser?.uid === submittingUid;
    setSubmitting(true); setStoryFailure(false);
    try {
      const diagnosticsRequested = Boolean(
        category === 'bug'
        && submittingUid
        && userUid === submittingUid
        && diagnosticAcknowledgement?.uid === submittingUid
        && diagnosticAcknowledgement.noticeVersion,
      );
      const res = await authFetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category,
          message: message.trim(),
          page: currentPage,
          mood,
          issueCode,
          diagnosticsRequested,
          diagnosticsNoticeVersion: diagnosticsRequested
            ? diagnosticAcknowledgement?.noticeVersion
            : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!isCurrent()) {
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit');
      }
      let diagnosticsFailed = false;
      if (typeof data.caseId === 'string') setReceiptCaseId(data.caseId);
      if (diagnosticsRequested) {
        if (typeof data.diagnosticCaseId === 'string' && data.diagnosticsAttached === true) {
          setDiagnosticCaseId(data.diagnosticCaseId);
          setDiagnosticWarning(null);
        } else {
          diagnosticsFailed = true;
          setDiagnosticCaseId(null);
          setDiagnosticWarning(
            'Your feedback was sent, but privacy-safe diagnostics are not enabled right now.',
          );
        }
      }
      setSubmitted(true);
      showToast(
        diagnosticsFailed
          ? 'Feedback sent; diagnostics remain private'
          : issueCode
            ? 'Billing review requested'
            : 'Thank you for your feedback!',
        'check_circle',
      );
    } catch (err: any) {
      if (isCurrent()) { setStoryFailure(true); showToast(err.message || 'Failed to submit', 'cancel'); }
    } finally {
      if (isCurrent()) setSubmitting(false);
    }
  };

  const updateDiagnosticSharing = async (checked: boolean) => {
    if (!checked) {
      setDiagnosticAcknowledgement(null);
      setDiagnosticWarning(null);
      return;
    }
    const requestingUid = auth.currentUser?.uid || null;
    if (!requestingUid || userUid !== requestingUid) {
      setDiagnosticAcknowledgement(null);
      setDiagnosticWarning('Sign in again before sharing privacy-safe diagnostics.');
      return;
    }
    setDiagnosticPolicyLoading(true);
    setDiagnosticWarning(null);
    try {
      const noticeVersion = await readPrivacySafeDiagnosticNoticeVersion();
      if (auth.currentUser?.uid !== requestingUid || userUid !== requestingUid) return;
      setDiagnosticAcknowledgement({ uid: requestingUid, noticeVersion });
    } catch (error) {
      if (auth.currentUser?.uid !== requestingUid) return;
      setDiagnosticAcknowledgement(null);
      setDiagnosticWarning(
        error instanceof Error
          ? error.message
          : 'Privacy-safe diagnostics are not enabled right now.',
      );
    } finally {
      setDiagnosticPolicyLoading(false);
    }
  };

  // ── Success State ──
  if (submitted) {
    const tone = issueCode ? '--accent' : '--success';
    return (
      <div className="mobile-app-content flex min-h-dvh items-center justify-center p-6">
        <motion.div data-guide="feedback-receipt"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative min-w-0 max-w-md text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
            className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border"
            style={{
              borderColor: `color-mix(in srgb, var(${tone}) 30%, transparent)`,
              background: `color-mix(in srgb, var(${tone}) 12%, transparent)`,
            }}
          >
            <span className="material-symbols-rounded text-4xl" style={{ color: `var(${tone})` }}>
              {issueCode ? 'support_agent' : 'favorite'}
            </span>
          </motion.div>
          <div className="absolute right-0 top-0"><PageHelp toolId="feedback" /></div>
          <h2 className="mb-2 px-12 text-2xl font-bold text-[var(--text-primary)]">
            {issueCode ? 'Billing review requested' : 'Thanks for sharing!'}
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-8 leading-relaxed">
            {issueCode
              ? 'Your request is in the support queue. Your plan is unchanged, and no checkout was created.'
              : 'Your feedback has been sent to our team. We read every submission and it directly shapes what we build next.'}
          </p>
          {diagnosticCaseId ? (
            <div
              className="mb-6 rounded-[12px] border p-4 text-left"
              style={{
                borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)',
                background: 'var(--accent-dim)',
              }}
            >
              <p className="text-sm font-bold text-[var(--text-primary)]">Privacy-safe diagnostics shared</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                Case {diagnosticCaseId}. The grant is time-limited and contains metadata only. You can revoke it from Data &amp; Privacy.
              </p>
            </div>
          ) : diagnosticWarning ? (
            <div
              className="mb-6 rounded-[12px] border p-4 text-left"
              style={{
                borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)',
                background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
              }}
            >
              <p className="text-sm font-bold text-[var(--text-primary)]">Feedback sent; diagnostics stayed private</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{diagnosticWarning}</p>
            </div>
          ) : null}
          {receiptCaseId ? (
            <p className="mb-6 text-xs text-[var(--text-tertiary)]">Receipt: {receiptCaseId}</p>
          ) : null}
          <div className="flex gap-3 justify-center">
            {!issueCode && (
              <button
                onClick={() => { setSubmitted(false); setMessage(''); setMood(null); setReceiptCaseId(null); setDiagnosticCaseId(null); }}
                className="btn-secondary inline-flex min-h-[44px] items-center justify-center"
              >
                Send Another
              </button>
            )}
            <button
              onClick={() => router.push(issueCode ? '/suite/settings?tab=subscription' : '/suite')}
              className="btn-primary inline-flex items-center justify-center"
            >
              {issueCode ? 'Back to billing' : 'Back to Dashboard'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mobile-app-content min-h-dvh px-4 py-3 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <SuiteToolHeader
          tool="feedback"
          title={issueCode ? 'Billing support' : 'Feedback'}
          subtitle={issueCode ? 'Request a safe review of your billing account.' : 'Help us build a better product.'}
          icon="rate_review"
          pageHelpId="feedback"
          className="mb-4 md:mb-6"
        />

        <form onSubmit={handleSubmit} className="space-y-6">
          {issueCode && (
            <div
              className="rounded-[20px] border p-4 sm:p-5"
              style={{
                borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)',
                background: 'var(--accent-dim)',
              }}
              role="status"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="material-symbols-rounded mt-0.5 text-[22px] text-[var(--accent)]" aria-hidden="true">verified_user</span>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">Checkout remains closed while we review</h2>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    No checkout was created and your current plan is unchanged. Edit the note below if there is more context you want support to know.
                  </p>
                </div>
              </div>
            </div>
          )}
          {/* Category Selector */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <SuitePanel>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-3">
                {issueCode ? 'Support category' : 'What kind of feedback?'}
              </label>
              <div data-guide="feedback-category" className={`grid gap-2 ${issueCode ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-5'}`}>
                {CATEGORIES.filter(cat => !issueCode || cat.id === 'billing').map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setCategory(cat.id);
                      if (cat.id !== 'bug') {
                        setDiagnosticAcknowledgement(null);
                      }
                      if (cat.id !== 'billing') setIssueCode(null);
                    }}
                    className={`flex min-h-[44px] flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                      category === cat.id
                        ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                        : 'border-[var(--border-subtle)] hover:border-[var(--border)]'
                    }`}
                  >
                    <span
                      className={`material-symbols-rounded text-2xl transition-colors ${
                        category === cat.id ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {cat.icon}
                    </span>
                    <span className={`text-xs font-medium ${category === cat.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                      {cat.label}
                    </span>
                  </button>
                ))}
              </div>
            </SuitePanel>
          </motion.div>

          {/* Message */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <SuitePanel>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-3">
                {issueCode ? 'Support note' : 'Your feedback'}
              </label>
              <textarea data-guide="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={5000}
                placeholder="Describe what happened, what you expected, or what you'd like to see..."
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-base leading-relaxed resize-none focus:outline-none focus:border-[var(--accent)] transition-all placeholder:text-[var(--text-muted)]"
              />
              <div className="flex justify-between items-center mt-2">
                <p className="text-[11px] text-[var(--text-muted)]">
                  {message.length > 0 ? `${message.length}/5000` : 'Min 5 characters'}
                </p>
              </div>
            </SuitePanel>
          </motion.div>

          {category === 'bug' && !issueCode ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <SuitePanel>
                <label className="flex cursor-pointer items-start gap-3">
                  <input data-guide="feedback-diagnostics"
                    type="checkbox"
                    checked={shareDiagnostics}
                    disabled={diagnosticPolicyLoading || submitting}
                    onChange={(event) => void updateDiagnosticSharing(event.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-[var(--border-subtle)] accent-[var(--accent)]"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                      <span className="material-symbols-rounded text-[19px] text-[var(--accent)]" aria-hidden="true">troubleshoot</span>
                      Share privacy-safe diagnostics for this case
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">
                      Give authorized support staff time-limited access to coarse tool outcomes, error categories,
                      and timing bands already retained for this issue. Prompts, <TacoName /> replies, resumes, cover letters,
                      filenames, search terms, companies, job titles, and account credentials are never included.
                    </span>
                    <span className="mt-2 block text-[11px] font-semibold text-[var(--accent)]">
                      Optional · case-bound · visible and revocable
                    </span>
                    <span className="mt-1 block text-[11px] text-[var(--text-secondary)]" aria-live="polite">
                      {diagnosticPolicyLoading
                        ? 'Loading the current privacy notice…'
                        : shareDiagnostics && diagnosticsNoticeVersion
                          ? `Current notice: ${diagnosticsNoticeVersion}`
                          : diagnosticWarning || ''}
                    </span>
                  </span>
                </label>
              </SuitePanel>
            </motion.div>
          ) : null}

          {/* Mood Selector */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <SuitePanel>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1">
                How are you feeling?
              </label>
              <p className="text-xs text-[var(--text-muted)] mb-4">Optional — helps us prioritize</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {MOODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMood(mood === m.value ? null : m.value)}
                    className={`min-w-0 flex min-h-[44px] flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                      mood === m.value
                        ? 'scale-110 border-[var(--accent)] bg-[var(--accent-dim)]'
                        : 'border-[var(--border-subtle)] hover:scale-105 hover:border-[var(--border)]'
                    }`}
                  >
                    <span
                      className={`material-symbols-rounded text-3xl transition-colors ${
                        mood === m.value ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {m.icon}
                    </span>
                    <span className={`text-[11px] font-medium ${mood === m.value ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                      {m.label}
                    </span>
                  </button>
                ))}
              </div>
            </SuitePanel>
          </motion.div>

          {/* Submit */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex gap-3"
          >
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary inline-flex min-h-[44px] items-center justify-center"
            >
              Cancel
            </button>
            <button data-guide="feedback-send"
              type="submit"
              disabled={submitting || message.trim().length < 5}
              className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--accent-on) 30%, transparent)',
                      borderTopColor: 'var(--accent-on)',
                    }}
                  />
                  Sending...
                </>
              ) : (
                <>
                  <span className="material-symbols-rounded text-lg">send</span>
                  {issueCode ? 'Request billing review' : 'Send Feedback'}
                </>
              )}
            </button>
          </motion.div>
        </form>
      </div>
    </div>
  );
}
