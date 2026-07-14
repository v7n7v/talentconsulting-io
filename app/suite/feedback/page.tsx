'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader } from '@/components/suite/SuiteToolChrome';
import {
  issueCodeForStripeAccountReviewContext,
  STRIPE_ACCOUNT_REVIEW_MESSAGE,
} from '@/lib/billing/stripe-account-review-support';

const CATEGORIES = [
  { id: 'bug',     label: 'Bug Report',       icon: 'bug_report',     color: '#ef4444' },
  { id: 'feature', label: 'Feature Request',   icon: 'lightbulb',      color: '#3b82f6' },
  { id: 'general', label: 'General Feedback',  icon: 'chat_bubble',    color: '#10b981' },
  { id: 'billing', label: 'Billing Support',   icon: 'receipt_long',   color: '#2563eb' },
  { id: 'other',   label: 'Other',             icon: 'help',           color: '#6b7280' },
];

const MOODS = [
  { value: 1, icon: 'sentiment_very_dissatisfied', label: 'Frustrated', color: '#ef4444' },
  { value: 2, icon: 'sentiment_dissatisfied', label: 'Confused', color: '#f97316' },
  { value: 3, icon: 'sentiment_neutral', label: 'Neutral', color: '#a3a3a3' },
  { value: 4, icon: 'sentiment_satisfied', label: 'Happy', color: '#22c55e' },
  { value: 5, icon: 'sentiment_very_satisfied', label: 'Delighted', color: '#10b981' },
];

export default function FeedbackPage() {
  const { user } = useStore();
  const router = useRouter();
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [issueCode, setIssueCode] = useState<string | null>(null);

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

  if (!user) {
    return (
      <div className="mobile-app-content flex min-h-dvh items-center justify-center p-6">
        <div className="text-center">
          <span className="material-symbols-rounded text-5xl text-[var(--text-muted)] mb-4 block">lock</span>
          <p className="text-[var(--text-secondary)]">Please sign in to share feedback.</p>
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
    setSubmitting(true);
    try {
      const token = (user as any).accessToken || (user as any).stsTokenManager?.accessToken;
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ category, message: message.trim(), page: currentPage, mood, issueCode }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit');
      }
      setSubmitted(true);
      showToast(issueCode ? 'Billing review requested' : 'Thank you for your feedback!', 'check_circle');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit', 'cancel');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success State ──
  if (submitted) {
    return (
      <div className="mobile-app-content flex min-h-dvh items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
            className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border ${
              issueCode ? 'border-blue-500/20 bg-blue-500/10' : 'border-emerald-500/20 bg-emerald-500/10'
            }`}
          >
            <span className={`material-symbols-rounded text-4xl ${issueCode ? 'text-blue-500' : 'text-emerald-500'}`}>
              {issueCode ? 'support_agent' : 'favorite'}
            </span>
          </motion.div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            {issueCode ? 'Billing review requested' : 'Thanks for sharing!'}
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-8 leading-relaxed">
            {issueCode
              ? 'Your request is in the support queue. Your plan is unchanged, and no checkout was created.'
              : 'Your feedback has been sent to our team. We read every submission and it directly shapes what we build next.'}
          </p>
          <div className="flex gap-3 justify-center">
            {!issueCode && (
              <button
                onClick={() => { setSubmitted(false); setMessage(''); setMood(null); }}
                className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              >
                Send Another
              </button>
            )}
            <button
              onClick={() => router.push(issueCode ? '/suite/settings?tab=subscription' : '/suite')}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: issueCode ? '#2563eb' : 'linear-gradient(135deg, #10b981, #059669)' }}
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
            <div className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.07] p-4 sm:p-5" role="status">
              <div className="flex min-w-0 items-start gap-3">
                <span className="material-symbols-rounded mt-0.5 text-[22px] text-blue-500" aria-hidden="true">verified_user</span>
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
            className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6"
          >
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-3">
              {issueCode ? 'Support category' : 'What kind of feedback?'}
            </label>
            <div className={`grid gap-2 ${issueCode ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-5'}`}>
              {CATEGORIES.filter(cat => !issueCode || cat.id === 'billing').map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setCategory(cat.id);
                    if (cat.id !== 'billing') setIssueCode(null);
                  }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                    category === cat.id
                      ? 'shadow-sm'
                      : 'hover:border-[var(--border-active)]'
                  }`}
                  style={{
                    borderColor: category === cat.id ? `${cat.color}40` : 'var(--border-subtle)',
                    background: category === cat.id ? `${cat.color}08` : 'transparent',
                  }}
                >
                  <span
                    className="material-symbols-rounded text-2xl transition-colors"
                    style={{ color: category === cat.id ? cat.color : 'var(--text-muted)' }}
                  >
                    {cat.icon}
                  </span>
                  <span className={`text-xs font-medium ${category === cat.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                    {cat.label}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>

          {/* Message */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6"
          >
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-3">
              {issueCode ? 'Support note' : 'Your feedback'}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={5000}
              placeholder="Describe what happened, what you expected, or what you'd like to see..."
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm leading-relaxed resize-none focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-[var(--text-muted)]"
            />
            <div className="flex justify-between items-center mt-2">
              <p className="text-[10px] text-[var(--text-muted)]">
                {message.length > 0 ? `${message.length}/5000` : 'Min 5 characters'}
              </p>
            </div>
          </motion.div>

          {/* Mood Selector */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6"
          >
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
                  className={`min-w-0 flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                    mood === m.value ? 'scale-110 shadow-md' : 'hover:scale-105'
                  }`}
                  style={{
                    borderColor: mood === m.value ? 'rgba(16,185,129,0.4)' : 'var(--border-subtle)',
                    background: mood === m.value ? 'rgba(16,185,129,0.06)' : 'transparent',
                  }}
                >
                  <span className="material-symbols-rounded text-3xl transition-colors" style={{ color: mood === m.value ? m.color : 'var(--text-muted)' }}>{m.icon}</span>
                  <span className={`text-[10px] font-medium ${mood === m.value ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}>
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
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
              className="px-5 py-3 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || message.trim().length < 5}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              style={{
                background: issueCode ? '#2563eb' : 'linear-gradient(135deg, #10b981, #059669)',
                boxShadow: issueCode ? '0 4px 16px rgba(37,99,235,0.2)' : '0 4px 16px rgba(16,185,129,0.25)',
              }}
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
