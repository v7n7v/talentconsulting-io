'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { formatJobSalary } from '@/lib/job-display';
import type { JobSalary } from '@/lib/job-ingestion';
import { analytics } from '@/lib/analytics';
import { mergeApplicationKitContext } from '@/lib/application-kit';
import { useUserTier } from '@/hooks/use-user-tier';
import { getJobAlertSendLimit } from '@/lib/job-alerts';
import JobDiscoveryRecoveryPanel from '@/components/jobs/JobDiscoveryRecoveryPanel';
import { useAuthGate } from '@/hooks/useAuthGate';
import {
  classifyJobDiscoveryFailure,
  classifyJobDiscoveryResponse,
  jobAccountRequiredRecovery,
  jobSuggestionsPartialRecovery,
  jobSuggestionsSetupRecovery,
  getJobResultIdentity,
  mergePreservedJobResults,
  readJobDiscoveryRecovery,
  type JobDiscoveryRecovery,
} from '@/lib/job-discovery-recovery';

interface SuggestedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: JobSalary;
  description: string;
  skills: string[];
  url: string;
  postedDate: string;
  employmentType: string;
  acceptanceChance: number;
  acceptanceReason: string;
  outboundLinkVerified?: boolean;
  identityKey?: string;
  dedupeKey?: string;
  sourceJobId?: string;
  sourceMeta?: {
    sourceType?: 'direct_ats' | 'company_page' | 'remote_board' | 'api_board' | 'aggregator';
    sourceName?: string;
    sourceConfidence?: 'high' | 'medium' | 'low';
    canonicalUrl?: string;
    directApplyUrl?: string;
  };
}

// A fit score we can render is one the pipeline actually measured: a finite,
// positive number. A missing or zero chance is rendered as a labelled absence,
// never as "0%".
function hasScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// Map a measured score to a status token (never a hex literal). Colour is not
// the only channel — getScoreLabel supplies a text label alongside it.
function getScoreVar(score: number): string {
  if (score >= 80) return 'var(--success)';
  if (score >= 60) return 'var(--accent)';
  if (score >= 40) return 'var(--warning)';
  return 'var(--danger)';
}

const scoreBg = (v: string) => `color-mix(in srgb, ${v} 12%, transparent)`;
const scoreBorder = (v: string) => `color-mix(in srgb, ${v} 25%, transparent)`;

function getScoreLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 55) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Low';
}


interface Props {
  hasPrefs: boolean;
  onSetupClick: () => void;
}

type EmailDeliveryStatus = 'consent_required' | 'ready' | 'sending' | 'accepted' | 'delivered' | 'delayed' | 'failed';

function formatDeliveryTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

export default function WeeklyPicksSection({ hasPrefs, onSetupClick }: Props) {
  const user = useStore((s) => s.user);
  const { tier } = useUserTier();
  const { setAuthModal, renderAuthModal } = useAuthGate();

  const [jobs, setJobs] = useState<SuggestedJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [recovery, setRecovery] = useState<JobDiscoveryRecovery | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [selectedJob, setSelectedJob] = useState<SuggestedJob | null>(null);
  const [notifSent, setNotifSent] = useState(false);
  const [sendingNotif, setSendingNotif] = useState(false);
  const [alertsSubscribed, setAlertsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<EmailDeliveryStatus>('consent_required');
  const [deliveryMessage, setDeliveryMessage] = useState('Enable email delivery when you want Career Picks by Taco in your inbox.');
  const [providerPauseAt, setProviderPauseAt] = useState<string | null>(null);
  const suggestionsRequestIdRef = useRef(0);

  const fetchSuggestions = useCallback(async () => {
    if (!hasPrefs) return;
    if (!user) {
      setRecovery(jobAccountRequiredRecovery('suggestions'));
      return;
    }
    const token = (user as any).accessToken || (user as any).stsTokenManager?.accessToken;
    if (!token) {
      setRecovery(jobAccountRequiredRecovery('suggestions'));
      return;
    }

    const requestId = suggestionsRequestIdRef.current + 1;
    suggestionsRequestIdRef.current = requestId;
    setLoading(true);
    setRecovery(null);
    try {
      const res = await fetch('/api/jobs/suggestions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (requestId !== suggestionsRequestIdRef.current) return;
      if (data.needsSetup) {
        setJobs([]);
        setSelectedJob(null);
        setRecovery(readJobDiscoveryRecovery(data.recovery) || jobSuggestionsSetupRecovery());
      } else if (res.ok && data.success && Array.isArray(data.jobs)) {
        const nextJobs = data.jobs as SuggestedJob[];
        setJobs(previousJobs => data.partial ? mergePreservedJobResults(previousJobs, nextJobs) : nextJobs);
        setSelectedJob(current => {
          if (!current) return null;
          const currentIdentity = getJobResultIdentity(current);
          const replacement = nextJobs.find(job => getJobResultIdentity(job) === currentIdentity);
          return replacement || (data.partial ? current : null);
        });
        setRecovery(data.partial
          ? readJobDiscoveryRecovery(data.recovery) || jobSuggestionsPartialRecovery()
          : null);
      } else {
        setRecovery(classifyJobDiscoveryResponse(data, 'suggestions', res.status));
      }
    } catch (error) {
      if (requestId !== suggestionsRequestIdRef.current) return;
      setRecovery(classifyJobDiscoveryFailure(error, 'suggestions'));
    } finally {
      if (requestId === suggestionsRequestIdRef.current) setLoading(false);
    }
  }, [user, hasPrefs]);

  const handleRecoveryAction = useCallback(() => {
    if (!recovery) return;
    if (recovery.action === 'open_preferences') {
      onSetupClick();
      return;
    }
    if (recovery.action === 'create_account' || recovery.action === 'sign_in') {
      setAuthModal(recovery.action === 'create_account' ? 'signup' : 'login');
      return;
    }
    if (recovery.action === 'upgrade') {
      window.location.assign('/suite/upgrade');
      return;
    }
    fetchSuggestions();
  }, [fetchSuggestions, onSetupClick, recovery, setAuthModal]);

  useEffect(() => {
    if (hasPrefs) fetchSuggestions();
    // Check alerts subscription
    if (user) {
      const token = (user as any).accessToken || (user as any).stsTokenManager?.accessToken;
      if (token) {
        fetch('/api/jobs/subscribe', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then(d => {
            setAlertsSubscribed(d.subscribed === true);
            const status = d.delivery?.status as EmailDeliveryStatus | undefined;
            if (status) setDeliveryStatus(status);
            setProviderPauseAt(typeof d.delivery?.pausedAt === 'string' ? d.delivery.pausedAt : null);
            const lastAccepted = formatDeliveryTime(d.delivery?.lastAcceptedAt || d.delivery?.lastSentAt);
            const lastDelivered = formatDeliveryTime(d.delivery?.lastDeliveredAt);
            if (status === 'delivered' && lastDelivered) {
              setDeliveryMessage(`Delivered to your email server ${lastDelivered}${typeof d.delivery?.lastJobCount === 'number' ? ` with ${d.delivery.lastJobCount} picks` : ''}.`);
            } else if (status === 'accepted' && lastAccepted) {
              setDeliveryMessage(`Accepted by the email provider ${lastAccepted}. Delivery confirmation is pending.`);
            } else if (status === 'delayed') {
              setDeliveryMessage('Your email provider reports a delivery delay. Your picks remain available here.');
            } else if (status === 'failed') {
              setDeliveryMessage(d.delivery?.error || d.delivery?.pausedReason || 'The last email failed. Your picks stayed available here.');
            } else if (d.subscribed) {
              setDeliveryMessage(`${d.frequency === 'daily' ? 'Daily weekday' : 'Weekly'} email delivery is ready.`);
            }
          })
          .catch(() => { });
      }
    }
  }, [hasPrefs, fetchSuggestions, user]);

  useEffect(() => {
    if (!user || (deliveryStatus !== 'accepted' && deliveryStatus !== 'delayed')) return;
    const token = (user as any).accessToken || (user as any).stsTokenManager?.accessToken;
    if (!token) return;
    let active = true;
    const refreshReceipt = async () => {
      try {
        const response = await fetch('/api/jobs/subscribe', { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!active || !data.delivery?.status) return;
        const status = data.delivery.status as EmailDeliveryStatus;
        setDeliveryStatus(status);
        if (status === 'delivered') {
          setNotifSent(true);
          const deliveredAt = formatDeliveryTime(data.delivery.lastDeliveredAt);
          setDeliveryMessage(`Delivered to your email server${deliveredAt ? ` ${deliveredAt}` : ''}${typeof data.delivery.lastJobCount === 'number' ? ` with ${data.delivery.lastJobCount} picks` : ''}.`);
        } else if (status === 'failed') {
          setNotifSent(false);
          setDeliveryMessage(data.delivery.error || data.delivery.pausedReason || 'The email could not be delivered. Your picks remain available here.');
        } else if (status === 'delayed') {
          setNotifSent(true);
          setDeliveryMessage('Your email provider reports a delivery delay. Your picks remain available here.');
        }
      } catch {
        // Keep the last truthful provider state until the next receipt check.
      }
    };
    const timer = window.setInterval(refreshReceipt, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [deliveryStatus, user]);

  const sendEmailDigest = async () => {
    if (!user || jobs.length === 0) return;
    const token = (user as any).accessToken || (user as any).stsTokenManager?.accessToken;
    if (!token) return;
    const digestJobs = jobs.filter(job => job.outboundLinkVerified && job.url);
    if (digestJobs.length === 0) {
      setDeliveryStatus('failed');
      setDeliveryMessage('No provider links are verified for email yet. Your picks remain available here for review.');
      return;
    }

    setSendingNotif(true);
    setDeliveryStatus('sending');
    setDeliveryMessage('Sending these picks to your account email...');
    try {
      const res = await fetch('/api/jobs/notify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobs: digestJobs.map(job => ({
            identityKey: job.identityKey,
            dedupeKey: job.dedupeKey,
            title: job.title,
            company: job.company,
            location: job.location,
            sourceJobId: job.sourceJobId,
            sourceMeta: job.sourceMeta?.sourceType ? { sourceType: job.sourceMeta.sourceType } : undefined,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        const nextStatus = data.delivery?.status as EmailDeliveryStatus | undefined;
        const resolvedStatus = nextStatus || 'accepted';
        setDeliveryStatus(resolvedStatus);
        setNotifSent(resolvedStatus !== 'failed');
        setDeliveryMessage(resolvedStatus === 'delivered'
          ? `Delivered ${data.jobCount || digestJobs.length} picks to your email server.`
          : resolvedStatus === 'delayed'
            ? 'Your email provider reports a delivery delay. Your picks remain available here.'
            : resolvedStatus === 'failed'
              ? data.delivery?.error || 'The email could not be delivered. Your picks remain available here.'
              : `The email provider accepted ${data.jobCount || digestJobs.length} picks. Delivery confirmation is pending.`);
        analytics.emailDigestSent(digestJobs.length);
        analytics.digestSent(digestJobs.length, 'weekly');
      } else if (data.code === 'EMAIL_CONSENT_REQUIRED') {
        setAlertsSubscribed(false);
        setDeliveryStatus('consent_required');
        setDeliveryMessage('Enable email delivery before sending these picks.');
      } else if (data.code === 'RECOMMENDATION_EVIDENCE_STALE') {
        setDeliveryStatus('failed');
        setDeliveryMessage('These picks changed or expired. Taco is refreshing the verified scores before email delivery.');
        setJobs([]);
        setSelectedJob(null);
        await fetchSuggestions();
      } else {
        setDeliveryStatus('failed');
        setDeliveryMessage(data.error || 'Email delivery failed. Your picks are still available here.');
      }
    } catch {
      setDeliveryStatus('failed');
      setDeliveryMessage('Email delivery was interrupted. Your picks are still available here.');
    } finally {
      setSendingNotif(false);
    }
  };

  const handleTailorResume = (job: SuggestedJob) => {
    mergeApplicationKitContext({
      jobDescription: job.description,
      jobTitle: job.title,
      targetRole: job.title,
      company: job.company,
    });
    sessionStorage.setItem('talent-resume-draft', JSON.stringify({
      jobDescription: job.description,
      jobTitle: job.title,
      company: job.company,
      skills: job.skills,
    }));
    window.location.href = '/suite/resume';
  };

  const handleSubscribeAlerts = async () => {
    if (!user) return;
    const token = (user as any).accessToken || (user as any).stsTokenManager?.accessToken;
    if (!token) return;
    setSubscribing(true);
    try {
      const res = await fetch('/api/jobs/subscribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          frequency: 'weekly',
          consentAcknowledged: true,
          source: 'weekly_picks',
          resumeAfterProviderPause: Boolean(providerPauseAt),
          providerPauseAt,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAlertsSubscribed(true);
        setProviderPauseAt(null);
        setDeliveryStatus('ready');
        setDeliveryMessage('Weekly email delivery is ready. Nothing is sent until you request it or the next digest is due.');
        analytics.newsletterSubscribe('job_search_weekly_picks', 'weekly');
      } else {
        setDeliveryStatus('consent_required');
        setDeliveryMessage(data.error || 'Email delivery could not be enabled.');
      }
    } catch {
      setDeliveryStatus('failed');
      setDeliveryMessage('Email delivery could not be enabled. Try again when your connection is stable.');
    }
    setSubscribing(false);
  };

  // Not set up yet — show setup prompt
  if (!hasPrefs) {
    return (
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="elevation-card mb-5 min-h-11 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 text-left transition-all hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        onClick={onSetupClick}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent)] flex items-center justify-center shrink-0">
            <span className="material-symbols-rounded text-[var(--accent-on)] text-xl">auto_awesome</span>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-0.5">Set up Career Picks by Taco</h3>
            <p className="text-xs text-[var(--text-secondary)]">Tell us your target roles, preferred cities, and work style to get crafted jobs with fit reasons and prep links.</p>
          </div>
          <span className="material-symbols-rounded text-[var(--accent)] text-xl shrink-0">arrow_forward</span>
        </div>
      </motion.button>
    );
  }

  return (
    <>
      <div className="mb-5">
      {/* Section Header */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex min-h-11 items-center gap-2 group"
        >
          <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center">
            <span className="material-symbols-rounded text-[var(--accent-on)] text-sm">auto_awesome</span>
          </div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Career Picks by Taco</h2>
          {jobs.length > 0 && (
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-[var(--accent-dim)] text-[var(--accent)]">{jobs.length}</span>
          )}
          <span className={`material-symbols-rounded text-sm text-[var(--text-tertiary)] transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`}>
            expand_more
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {jobs.length > 0 && !notifSent && (
            <button
              onClick={alertsSubscribed ? sendEmailDigest : handleSubscribeAlerts}
              disabled={sendingNotif || subscribing}
              className="flex min-h-11 items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--accent-dim)] px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] transition-all disabled:opacity-50"
            >
              <span className="material-symbols-rounded text-sm">{sendingNotif || subscribing ? 'hourglass_empty' : alertsSubscribed ? 'mail' : 'notifications_active'}</span>
              {sendingNotif ? 'Sending...' : subscribing ? 'Enabling...' : alertsSubscribed ? 'Email me these' : 'Enable email delivery'}
            </button>
          )}
          {notifSent && (
            <span className="flex min-h-11 items-center gap-1 text-[11px] font-medium text-[var(--accent)]" role="status">
              <span className="material-symbols-rounded text-sm">
                {deliveryStatus === 'delivered' ? 'mark_email_read' : deliveryStatus === 'delayed' ? 'schedule' : 'outgoing_mail'}
              </span>
              {deliveryStatus === 'delivered' ? 'Delivered' : deliveryStatus === 'delayed' ? 'Delayed' : 'Accepted'}
            </span>
          )}
          <button
            onClick={fetchSuggestions}
            disabled={loading}
            className="flex min-h-11 items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-all"
          >
            <span className={`material-symbols-rounded text-sm ${loading ? 'animate-spin' : ''}`}>refresh</span>
            Refresh
          </button>
        </div>
      </div>

      <div
        className={`mb-3 flex min-w-0 items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-5 ${
          deliveryStatus === 'failed'
            ? 'border-[var(--danger)] bg-[var(--bg-surface)] text-[var(--danger)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
        }`}
        role="status"
        aria-live="polite"
      >
        <span className="material-symbols-rounded mt-0.5 shrink-0 text-[15px]" aria-hidden="true">
          {deliveryStatus === 'failed'
            ? 'error'
            : deliveryStatus === 'delivered'
              ? 'mark_email_read'
              : deliveryStatus === 'accepted'
                ? 'outgoing_mail'
                : deliveryStatus === 'delayed' || deliveryStatus === 'sending'
                  ? 'schedule'
                  : deliveryStatus === 'ready'
                    ? 'notifications_active'
                    : 'notifications_off'}
        </span>
        <span className="min-w-0 [overflow-wrap:anywhere]">{deliveryMessage}</span>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-10">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-[var(--accent-dim)] border-t-[var(--accent)] animate-spin" />
                    <span className="material-symbols-rounded text-[var(--accent)] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-base">auto_awesome</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] animate-pulse">Finding your best matches...</p>
                </div>
              </div>
            )}

            {/* Recovery */}
            {recovery && !loading && (
              <div className="mb-3">
                <JobDiscoveryRecoveryPanel
                  recovery={recovery}
                  onAction={handleRecoveryAction}
                  compact={jobs.length > 0}
                />
              </div>
            )}

            {/* Job Cards */}
            {!loading && jobs.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                {jobs.map((job, i) => {
                  const isSelected = Boolean(selectedJob && getJobResultIdentity(selectedJob) === getJobResultIdentity(job));
                  const scoreVar = getScoreVar(job.acceptanceChance);
                  return (
                  <motion.button
                    type="button"
                    key={getJobResultIdentity(job)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setSelectedJob(current => current && getJobResultIdentity(current) === getJobResultIdentity(job) ? null : job)}
                    aria-pressed={isSelected}
                    className={`elevation-interactive w-full min-w-0 rounded-xl border bg-[var(--bg-surface)] p-3 text-left transition-all hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${isSelected ? 'border-[var(--accent)]' : 'border-[var(--border-subtle)]'}`}
                  >
                    {/* Fit badge */}
                    <div className="flex items-center justify-between mb-2">
                      {hasScore(job.acceptanceChance) ? (
                        <>
                          <span className="px-2 py-0.5 text-[11px] font-bold rounded-md border" style={{
                            color: scoreVar,
                            background: scoreBg(scoreVar),
                            borderColor: scoreBorder(scoreVar),
                          }}>
                            <span className="material-symbols-rounded text-[11px] align-middle" style={{ color: scoreVar }}>radar</span> ~{job.acceptanceChance}%
                          </span>
                          <span className="text-[11px] text-[var(--text-tertiary)]">{getScoreLabel(job.acceptanceChance)} · estimate</span>
                        </>
                      ) : (
                        <span className="px-2 py-0.5 text-[11px] font-medium rounded-md border border-dashed border-[var(--border-subtle)] text-[var(--text-muted)]">Fit not scored</span>
                      )}
                    </div>

                    <h4 className="text-[12px] font-semibold text-[var(--text-primary)] leading-snug line-clamp-2 mb-0.5">{job.title}</h4>
                    <p className="text-[11px] text-[var(--text-secondary)] font-medium mb-1">{job.company}</p>
                    <p className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1 mb-1">
                      <span className="material-symbols-rounded text-[11px]">location_on</span>
                      {job.location}
                    </p>
                    {(job.salary?.min || job.salary?.max) && (
                      <p className="text-[11px] text-[var(--success)] font-medium">{formatJobSalary(job.salary)}</p>
                    )}

                    {/* Reason */}
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-2 pt-2 border-t border-[var(--border-subtle)] italic line-clamp-2">
                      {job.acceptanceReason}
                    </p>
                  </motion.button>
                  );
                })}
              </div>
            )}

            {/* Selected Job Detail */}
            <AnimatePresence>
              {selectedJob && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="elevation-card mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 overflow-hidden"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{selectedJob.title}</h3>
                      <p className="text-xs text-[var(--accent)] font-medium">{selectedJob.company} • {selectedJob.location}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasScore(selectedJob.acceptanceChance) ? (
                        <span className="px-2.5 py-1 text-xs font-bold rounded-lg" style={{
                          color: getScoreVar(selectedJob.acceptanceChance),
                          background: scoreBg(getScoreVar(selectedJob.acceptanceChance)),
                        }}>
                          <span className="material-symbols-rounded text-[13px] align-middle" style={{ color: getScoreVar(selectedJob.acceptanceChance) }}>radar</span> {selectedJob.acceptanceChance}% fit
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-lg border border-dashed border-[var(--border-subtle)] text-[var(--text-muted)]">Fit not scored</span>
                      )}
                      <button onClick={() => setSelectedJob(null)} aria-label="Close job detail" className="h-11 w-11 rounded-full flex items-center justify-center bg-[var(--bg-hover)]">
                        <span className="material-symbols-rounded text-sm text-[var(--text-tertiary)]">close</span>
                      </button>
                    </div>
                  </div>

                  {selectedJob.description && (
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3 line-clamp-4">{selectedJob.description}</p>
                  )}

                  {selectedJob.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {selectedJob.skills.slice(0, 8).map(s => (
                        <span key={s} className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)]">{s}</span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {selectedJob.outboundLinkVerified && selectedJob.url ? (
                      <a
                        href={selectedJob.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary flex-1 min-h-11 px-3 py-2 text-xs flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-rounded text-sm">open_in_new</span>
                        View verified job
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="btn-secondary flex-1 min-h-11 px-3 py-2 text-xs flex items-center justify-center gap-1.5 text-[var(--text-tertiary)] opacity-80"
                        title="Taco could not verify this provider link."
                      >
                        <span className="material-symbols-rounded text-sm">shield</span>
                        Source link withheld
                      </button>
                    )}
                    <button
                      onClick={() => handleTailorResume(selectedJob)}
                      className="btn-secondary flex-1 min-h-11 px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-rounded text-sm">auto_fix_high</span>
                      Tailor Resume
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Subscribe Banner — shows after jobs load, if not subscribed */}
            {!loading && jobs.length > 0 && !alertsSubscribed && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="elevation-card mt-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] flex items-center justify-between"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="material-symbols-rounded text-sm text-[var(--accent)]">mail</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Get {getJobAlertSendLimit(tier)} crafted jobs in your inbox every Monday.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-semibold text-[var(--accent)]">
                    Weekly
                  </div>
                  <button
                    onClick={handleSubscribeAlerts}
                    disabled={subscribing}
                    className="btn-primary min-h-11 px-3 py-1 text-[11px] font-semibold shrink-0 transition-all disabled:opacity-50"
                  >
                    {subscribing ? 'Subscribing...' : 'Subscribe'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* Subscribed confirmation */}
            {/* No results */}
            {!loading && !recovery && jobs.length === 0 && hasPrefs && (
              <div className="text-center py-6">
                <p className="text-xs text-[var(--text-tertiary)]">No matches fit your current preferences this week.</p>
                <button
                  type="button"
                  onClick={onSetupClick}
                  className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <span className="material-symbols-rounded text-[16px]" aria-hidden="true">tune</span>
                  Review preferences
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      {renderAuthModal()}
    </>
  );
}
