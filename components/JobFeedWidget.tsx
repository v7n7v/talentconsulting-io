'use client';

import { TacoName, TacoText } from '@/components/BrandLogo';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { useAuthGate } from '@/hooks/useAuthGate';
import JobDiscoveryRecoveryPanel from '@/components/jobs/JobDiscoveryRecoveryPanel';
import {
  classifyJobDiscoveryFailure,
  classifyJobDiscoveryResponse,
  jobAccountRequiredRecovery,
  jobSuggestionsPartialRecovery,
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
  salary: { min: number | null; max: number | null; currency: string };
  description: string;
  skills: string[];
  url: string;
  postedDate: string;
  acceptanceChance: number;
  acceptanceReason: string;
  sourceMeta?: {
    sourceName?: string;
    sourceConfidence?: 'high' | 'medium' | 'low';
  };
  riskNotes?: string[];
  nextAction?: string;
  preparationEligible?: boolean;
  identityKey?: string;
  dedupeKey?: string;
  sourceJobId?: string;
  outboundLinkVerified?: boolean;
}

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return '';
  const fmt = (n: number) => n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
  if (min && max && min !== max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  if (max) return `Up to ${fmt(max)}`;
  return '';
}

const LEGACY_DISMISS_KEY = 'talent-job-alert-prompt-dismissed';

function alertDismissKey(uid: string) {
  return `talent-job-alert-prompt-dismissed:${uid}`;
}

function jobCountKey(uid: string) {
  return `talent-job-curated-count:${uid}`;
}

export default function JobFeedWidget() {
  const router = useRouter();
  const { setAuthModal, renderAuthModal } = useAuthGate();
  const user = useStore((s) => s.user);
  const userId = String((user as any)?.uid || '');
  const accessToken = String((user as any)?.accessToken || (user as any)?.stsTokenManager?.accessToken || '');
  const [jobs, setJobs] = useState<SuggestedJob[]>([]);
  const jobsRef = useRef<SuggestedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [recovery, setRecovery] = useState<JobDiscoveryRecovery | null>(null);
  const suggestionsRequestIdRef = useRef(0);
  const alertRequestIdRef = useRef(0);
  const activeAlertUserIdRef = useRef(userId);
  const activeAlertAccessTokenRef = useRef(accessToken);
  activeAlertUserIdRef.current = userId;
  activeAlertAccessTokenRef.current = accessToken;

  // Email alert subscription state
  const [alertsEnabled, setAlertsEnabled] = useState<boolean | null>(null);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [enablingAlerts, setEnablingAlerts] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    if (!accessToken) {
      setRecovery(jobAccountRequiredRecovery('suggestions'));
      setLoading(false);
      return;
    }

    const requestId = suggestionsRequestIdRef.current + 1;
    suggestionsRequestIdRef.current = requestId;
    setLoading(true);
    try {
      const res = await fetch('/api/jobs/suggestions', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (requestId !== suggestionsRequestIdRef.current || useStore.getState().user?.uid !== userId) return;
      if (data.needsSetup) {
        setNeedsSetup(true);
        jobsRef.current = [];
        setJobs([]);
        localStorage.setItem(jobCountKey(userId), '0');
        window.dispatchEvent(new Event('job-count-updated'));
        setRecovery(readJobDiscoveryRecovery(data.recovery));
      } else if (res.ok && data.success && Array.isArray(data.jobs)) {
        const nextJobs = data.jobs as SuggestedJob[];
        setNeedsSetup(false);
        const visibleJobs = data.partial ? mergePreservedJobResults(jobsRef.current, nextJobs) : nextJobs;
        jobsRef.current = visibleJobs;
        setJobs(visibleJobs);
        // Notify sibling navigation after the async result, never during a
        // React state updater (which React may run while rendering).
        localStorage.setItem(jobCountKey(userId), visibleJobs.length.toString());
        window.dispatchEvent(new Event('job-count-updated'));
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
  }, [accessToken, userId]);

  const handleRecoveryAction = useCallback(() => {
    if (!recovery) return;
    if (recovery.action === 'open_preferences') {
      router.push('/suite/job-search');
      return;
    }
    if (recovery.action === 'create_account' || recovery.action === 'sign_in') {
      setAuthModal(recovery.action === 'create_account' ? 'signup' : 'login');
      return;
    }
    if (recovery.action === 'upgrade') {
      router.push('/suite/upgrade');
      return;
    }
    fetchSuggestions();
  }, [fetchSuggestions, recovery, router, setAuthModal]);

  useEffect(() => {
    suggestionsRequestIdRef.current += 1;
    jobsRef.current = [];
    setJobs([]);
    setNeedsSetup(false);
    setRecovery(null);
    if (!userId) {
      setLoading(false);
      return;
    }
    fetchSuggestions();
    return () => {
      suggestionsRequestIdRef.current += 1;
    };
  }, [fetchSuggestions, userId]);

  // Check email notification status
  useEffect(() => {
    const requestId = alertRequestIdRef.current + 1;
    alertRequestIdRef.current = requestId;
    setAlertsEnabled(null);
    setPromptDismissed(false);
    setEnablingAlerts(false);
    setAlertError(null);
    localStorage.removeItem(LEGACY_DISMISS_KEY);
    if (!userId || !accessToken) return;
    const dismissed = localStorage.getItem(alertDismissKey(userId));
    if (dismissed) { setPromptDismissed(true); return; }

    fetch('/api/jobs/preferences', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.json())
      .then(data => {
        if (requestId !== alertRequestIdRef.current
          || activeAlertUserIdRef.current !== userId
          || activeAlertAccessTokenRef.current !== accessToken) return;
        if (data.preferences) {
          setAlertsEnabled(data.preferences.jobAlertsEnabled === true);
        }
      })
      .catch(() => {});
    return () => {
      alertRequestIdRef.current += 1;
    };
  }, [accessToken, userId]);

  const handleEnableAlerts = async () => {
    const requestId = alertRequestIdRef.current + 1;
    alertRequestIdRef.current = requestId;
    const requestUserId = userId;
    setEnablingAlerts(true);
    setAlertError(null);
    try {
      if (!requestUserId || !accessToken) throw new Error('Account required');
      const res = await fetch('/api/jobs/preferences', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobAlertsEnabled: true,
          jobAlertsFrequency: 'weekly',
          emailNotifications: true,
          jobAlertsConsentAcknowledged: true,
          jobAlertsConsentSource: 'job_feed_widget',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (requestId !== alertRequestIdRef.current
        || activeAlertUserIdRef.current !== requestUserId
        || activeAlertAccessTokenRef.current !== accessToken) return;
      if (!res.ok) throw new Error(data.error || 'Could not enable Career Picks by Taco');
      setAlertsEnabled(true);
    } catch {
      if (requestId !== alertRequestIdRef.current
        || activeAlertUserIdRef.current !== requestUserId
        || activeAlertAccessTokenRef.current !== accessToken) return;
      setAlertsEnabled(false);
      setAlertError('Career Picks by Taco could not be enabled. Nothing changed. Try again when you are ready.');
    }
    if (requestId === alertRequestIdRef.current
      && activeAlertUserIdRef.current === requestUserId
      && activeAlertAccessTokenRef.current === accessToken) setEnablingAlerts(false);
  };

  const handleDismissPrompt = () => {
    setPromptDismissed(true);
    if (userId) localStorage.setItem(alertDismissKey(userId), Date.now().toString());
  };

  const handleMorph = (job: SuggestedJob) => {
    if (job.preparationEligible !== true) {
      router.push('/suite/job-search');
      return;
    }
    sessionStorage.setItem('talent-resume-draft', JSON.stringify({
      jobDescription: job.description,
      jobTitle: job.title,
      company: job.company,
      skills: job.skills,
    }));
    router.push('/suite/resume');
  };

  // The authenticated dashboard owns recovery. Signed-out users use the landing flow.
  if (!user) return null;

  // Setup CTA
  if (!loading && needsSetup) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-6"
      >
        <div
          className="elevation-interactive group flex min-h-11 cursor-pointer rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 transition-colors hover:border-[var(--border)]"
          onClick={() => router.push('/suite/job-search')}
        >
          <div className="flex items-center gap-4">
            <span className="icon-shell-neutral inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl border">
              <span className="material-symbols-rounded icon-neutral text-lg">radar</span>
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-0.5">Set up your Opportunity Radar</h3>
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                Tell us your target roles and preferred locations to get explainable job matches with one consistent fit score.
              </p>
            </div>
            <span className="material-symbols-rounded text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors shrink-0">arrow_forward</span>
          </div>
        </div>
      </motion.div>
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3 px-1">
          <div className="w-5 h-5 rounded-md bg-[var(--bg-elevated)] animate-pulse" />
          <div className="w-28 h-4 rounded bg-[var(--bg-elevated)] animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-xl border border-[var(--border-subtle)] p-4 animate-pulse" style={{ background: 'var(--bg-surface)' }}>
              <div className="w-14 h-4 rounded bg-[var(--bg-elevated)] mb-3" />
              <div className="w-full h-3 rounded bg-[var(--bg-elevated)] mb-2" />
              <div className="w-3/4 h-3 rounded bg-[var(--bg-elevated)] mb-4" />
              <div className="w-1/2 h-3 rounded bg-[var(--bg-elevated)]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (recovery && jobs.length === 0) {
    return (
      <>
        <div className="mb-6">
          <JobDiscoveryRecoveryPanel recovery={recovery} onAction={handleRecoveryAction} compact />
        </div>
        {renderAuthModal()}
      </>
    );
  }

  // A valid empty search is not an error and does not need dashboard chrome.
  if (jobs.length === 0) return null;

  const topJobs = jobs.slice(0, 3);
  const showAlertPrompt = alertsEnabled === false && !promptDismissed;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-6"
      >
      {recovery && (
        <div className="mb-3">
          <JobDiscoveryRecoveryPanel recovery={recovery} onAction={handleRecoveryAction} compact />
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="icon-shell-neutral inline-grid h-6 w-6 shrink-0 place-items-center rounded-lg border">
            <span className="material-symbols-rounded icon-neutral text-[13px]">radar</span>
          </span>
          <h2 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            Top Opportunities
          </h2>
          <span className="px-1.5 py-0.5 text-[11px] font-bold rounded-full bg-[var(--accent-dim)] text-[var(--accent)]">
            {jobs.length}
          </span>
        </div>
        <button
          onClick={() => router.push('/suite/job-search')}
          className="flex min-h-11 items-center gap-1 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
        >
          View all
          <span className="material-symbols-rounded text-[13px]">arrow_forward</span>
        </button>
      </div>

      {/* Inline subscribe prompt */}
      <AnimatePresence>
        {showAlertPrompt && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-3"
          >
            <div className="elevation-card rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="material-symbols-rounded shrink-0 text-lg text-[var(--text-secondary)]">mail</span>
                  <p className="truncate text-[12px] text-[var(--text-secondary)]">
                    Get weekly picks in your inbox with Career Picks by <TacoName />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                  <button
                    onClick={handleEnableAlerts}
                    disabled={enablingAlerts}
                    className="btn-primary min-h-11 rounded-lg px-3 py-2 text-[11px] font-semibold disabled:opacity-60"
                  >
                    <TacoText text={enablingAlerts ? 'Enabling...' : 'Enable Career Picks by Taco'} />
                  </button>
                  <button
                    onClick={handleDismissPrompt}
                    aria-label="Dismiss Career Picks by Taco prompt"
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
                  >
                    <span className="material-symbols-rounded text-[16px]">close</span>
                  </button>
                </div>
              </div>
              {alertError && (
                <p className="border-t border-[var(--border-subtle)] px-4 py-2 text-[12px] leading-5 text-[var(--danger)]" role="status" aria-live="polite">
                  {alertError}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Job Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <AnimatePresence>
          {topJobs.map((job, i) => (
            <motion.div
              key={getJobResultIdentity(job)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              className="elevation-interactive group relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 transition-colors hover:border-[var(--border)]"
            >
              {/* Match strength — a model estimate; guarded so a missing/zero score renders as a labelled absence, never a fabricated 0% */}
              <div className="flex items-center justify-between mb-2.5 relative">
                {Number.isFinite(job.acceptanceChance) && job.acceptanceChance > 0 ? (
                  <span className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
                    {job.acceptanceChance}% match · est.
                  </span>
                ) : (
                  <span className="rounded-md border border-dashed border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                    Match not scored
                  </span>
                )}
                {(job.salary?.min || job.salary?.max) && (
                  <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                    {formatSalary(job.salary.min, job.salary.max)}
                  </span>
                )}
              </div>

              {/* Job info */}
              <h4 className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug line-clamp-2 mb-0.5">
                {job.title}
              </h4>
              <p className="text-[11px] text-[var(--text-secondary)] font-medium mb-1">{job.company}</p>
              <p className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1 mb-3">
                <span className="material-symbols-rounded text-[11px]">location_on</span>
                {job.location}
              </p>

              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                {job.sourceMeta?.sourceConfidence && (
                  <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1">
                    {(job.sourceMeta?.sourceConfidence || 'low').replace(/^./, value => value.toUpperCase())} source confidence
                  </span>
                )}
              </div>

              {/* Recommendation evidence */}
              <p className="mb-2 line-clamp-2 text-[11px] leading-4 text-[var(--text-tertiary)]">
                {job.acceptanceReason}
              </p>
              {job.riskNotes?.[0] && (
                <p className="mb-3 line-clamp-2 text-[11px] leading-4 text-[var(--warning)]">
                  {job.riskNotes[0]}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2.5 border-t border-[var(--border-subtle)]">
                <button
                  onClick={(e) => { e.stopPropagation(); handleMorph(job); }}
                  className="btn-secondary flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold"
                >
                  <span className="material-symbols-rounded text-[12px]">{job.preparationEligible === true ? 'auto_fix_high' : 'fact_check'}</span>
                  <span className="truncate">{job.preparationEligible === true ? 'Morph' : job.nextAction || 'Review evidence'}</span>
                </button>
                {job.outboundLinkVerified === true && job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--text-primary)] px-2 py-2 text-[11px] font-semibold text-[var(--bg-deep)]"
                  >
                    <span className="material-symbols-rounded text-[12px]">open_in_new</span>
                    <span className="truncate">Open posting</span>
                  </a>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      </motion.div>
      {renderAuthModal()}
    </>
  );
}
