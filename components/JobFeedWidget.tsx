'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { formatJobSalary } from '@/lib/job-display';
import type { JobSalary } from '@/lib/job-ingestion';
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
  salary: JobSalary;
  description: string;
  skills: string[];
  url: string;
  postedDate: string;
  acceptanceChance?: number | null;
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

function hasFitScore(score: unknown): score is number {
  return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100;
}

function getScoreColor(score: number | null | undefined): string {
  if (!hasFitScore(score)) return 'var(--text-muted)';
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#3b82f6';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
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
      if (requestId !== suggestionsRequestIdRef.current) return;
      if (data.needsSetup) {
        setNeedsSetup(true);
        setJobs([]);
        localStorage.setItem(jobCountKey(userId), '0');
        window.dispatchEvent(new Event('job-count-updated'));
        setRecovery(readJobDiscoveryRecovery(data.recovery));
      } else if (res.ok && data.success && Array.isArray(data.jobs)) {
        const nextJobs = data.jobs as SuggestedJob[];
        setNeedsSetup(false);
        setJobs(previousJobs => {
          const visibleJobs = data.partial ? mergePreservedJobResults(previousJobs, nextJobs) : nextJobs;
          localStorage.setItem(jobCountKey(userId), visibleJobs.length.toString());
          window.dispatchEvent(new Event('job-count-updated'));
          return visibleJobs;
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
          className="rounded-2xl border p-5 cursor-pointer hover:border-cyan-500/25 transition-all group"
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
          onClick={() => router.push('/suite/job-search')}
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center shadow-lg shadow-cyan-500/15 shrink-0">
              <span className="material-symbols-rounded text-white text-lg">radar</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-0.5">Set up your Opportunity Radar</h3>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                Tell us your target roles and preferred locations to get explainable job matches with one consistent fit score.
              </p>
            </div>
            <span className="material-symbols-rounded text-[var(--text-muted)] group-hover:text-cyan-500 transition-colors shrink-0">arrow_forward</span>
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
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center">
            <span className="material-symbols-rounded text-white text-[13px]">radar</span>
          </div>
          <h2 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            Top Opportunities
          </h2>
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500/10 text-cyan-500">
            {jobs.length}
          </span>
        </div>
        <button
          onClick={() => router.push('/suite/job-search')}
          className="text-[11px] font-medium text-[var(--text-secondary)] hover:text-cyan-500 transition-colors flex items-center gap-1"
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
            <div
              className="rounded-xl border"
              style={{
                background: 'rgba(16,185,129,0.04)',
                borderColor: 'rgba(16,185,129,0.15)',
              }}
            >
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="material-symbols-rounded shrink-0 text-lg text-emerald-500">mail</span>
                  <p className="truncate text-[12px] text-[var(--text-secondary)]">
                    Get weekly picks in your inbox with Career Picks by Taco
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                  <button
                    onClick={handleEnableAlerts}
                    disabled={enablingAlerts}
                    className="min-h-11 rounded-lg px-3 py-2 text-[11px] font-semibold text-white transition-all disabled:opacity-60"
                    style={{ background: '#10b981' }}
                  >
                    {enablingAlerts ? '...' : 'Enable Career Picks by Taco'}
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
                <p className="border-t border-rose-400/20 px-4 py-2 text-xs leading-5 text-rose-700 dark:text-rose-300" role="status" aria-live="polite">
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
          {topJobs.map((job, i) => {
            const fitAvailable = hasFitScore(job.acceptanceChance);
            const scoreColor = getScoreColor(job.acceptanceChance);
            return (
            <motion.div
              key={getJobResultIdentity(job)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              className="rounded-xl border p-4 transition-all hover:border-cyan-500/25 group relative overflow-hidden"
              style={{
                background: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {/* Ambient glow */}
              <div
                className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-20 pointer-events-none blur-xl"
                style={{ background: scoreColor }}
              />

              {/* Score badge */}
              <div className="flex items-center justify-between mb-2.5 relative">
                <span
                  className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px] font-bold tabular-nums rounded-md border"
                  style={{
                    color: scoreColor,
                    background: fitAvailable ? `${scoreColor}12` : 'var(--bg-elevated)',
                    borderColor: fitAvailable ? `${scoreColor}25` : 'var(--border-subtle)',
                    borderStyle: fitAvailable ? 'solid' : 'dashed',
                  }}
                >
                  {fitAvailable ? `${job.acceptanceChance}% match` : 'Fit unavailable'}
                </span>
                {(job.salary?.min || job.salary?.max) && (
                  <span className="text-[10px] text-emerald-500 font-medium">
                    {formatJobSalary(job.salary)}
                  </span>
                )}
              </div>

              {/* Job info */}
              <h4 className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug line-clamp-2 mb-0.5">
                {job.title}
              </h4>
              <p className="text-[11px] text-[var(--text-secondary)] font-medium mb-1">{job.company}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1 mb-3">
                <span className="material-symbols-rounded text-[11px]">location_on</span>
                {job.location}
              </p>

              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-[var(--text-secondary)]">
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1">
                  {(job.sourceMeta?.sourceConfidence || 'low').replace(/^./, value => value.toUpperCase())} source confidence
                </span>
              </div>

              {/* Recommendation evidence */}
              <p className="mb-2 line-clamp-2 text-[10px] leading-4 text-[var(--text-tertiary)]">
                {job.acceptanceReason}
              </p>
              {job.riskNotes?.[0] && (
                <p className="mb-3 line-clamp-2 text-[10px] leading-4 text-amber-700 dark:text-amber-300">
                  {job.riskNotes[0]}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2.5 border-t border-[var(--border-subtle)]">
                <button
                  onClick={(e) => { e.stopPropagation(); handleMorph(job); }}
                  className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[10px] font-semibold transition-all"
                  style={{
                    background: 'rgba(6,182,212,0.08)',
                    border: '1px solid rgba(6,182,212,0.18)',
                    color: '#06b6d4',
                  }}
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
                    className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--text-primary)] px-2 py-2 text-[10px] font-semibold text-[var(--bg-deep)]"
                  >
                    <span className="material-symbols-rounded text-[12px]">open_in_new</span>
                    <span className="truncate">Open posting</span>
                  </a>
                )}
              </div>
            </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      </motion.div>
      {renderAuthModal()}
    </>
  );
}
