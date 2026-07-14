'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/components/ThemeProvider';
import { useStore } from '@/lib/store';
import { useUserTier } from '@/hooks/use-user-tier';
import { authFetch } from '@/lib/auth-fetch';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import AuthModal from '@/components/modals/AuthModal';
import ResumeLibraryPicker from '@/components/ResumeLibraryPicker';
import SonaThinkingTile from '@/components/SonaThinkingTile';
import { SonaMark } from '@/components/sona';
import { SonaActivationProofPanel, type SonaActivationProofViewState } from '@/components/sona/SonaActivationProofPanel';
import { SonaMessageContent } from '@/components/sona/SonaMessageContent';
import { SuiteToolHeader } from '@/components/suite/SuiteToolChrome';
import { saveResumeVersion, type ResumeVersion } from '@/lib/database-suite';
import { uploadAndParseResume, validateResumeFile, ResumeUploadError } from '@/lib/resume-upload';
import { normalizeResume, type CanonicalResume } from '@/lib/resume-normalizer';
import { analytics } from '@/lib/analytics';
import { formatSonaPlanSteps, formatSonaPlanTitle } from '@/lib/sona/chat-ui-formatting';
import { buildResumeContextFromUpload, hasResumeContextEvidence } from '@/lib/sona/resume-upload-context';
import { activationPreviewConsumedRecovery, type SonaRecovery } from '@/lib/sona/recovery';
import { getSonaHarnessNotificationStatus } from '@/lib/sona/harness-notification-status';
import { getSafeExternalUrl, selectSonaTopPicks } from '@/lib/sona/top-picks';
import { resolveResumeSourcePromptMode } from '@/lib/sona/mobile-activation-state';
import { normalizeAlertTargetRole, SONA_ALERT_TARGET_ROLE_KEY } from '@/lib/sona/alert-consent-handoff';
import { clearPendingSonaResume, readPendingSonaResume } from '@/lib/sona/pending-resume-handoff';

type Personality = 'professional' | 'coach' | 'direct';
type SonaActionPlan = {
  intent: string;
  capabilityId: string;
  plannedSteps: string[];
  approvalRequired: boolean;
  artifactTargets: string[];
};
type ConversationMeta = { id: string; title: string; personality: string; lastMessageAt: string };
type SonaVoiceId = 'alloy' | 'nova' | 'echo' | 'fable' | 'onyx' | 'shimmer';
type ResumeUploadStage = 'idle' | 'extracting' | 'structuring' | 'saving' | 'ready' | 'error';
type TargetWorkMode = 'hybrid' | 'remote' | 'onsite' | 'any';
type SonaHarnessRequest = {
  resumeVersionId?: string;
  targetRole?: string;
  location?: string;
  salaryTarget?: number;
  remotePreference?: TargetWorkMode;
  maxPackets?: number;
  mode?: 'scout' | 'prepare';
  notify?: boolean;
  activationReceipt?: string;
};
type SonaHarnessClientResult = {
  success: boolean;
  status: 'blocked' | 'scouted' | 'prepared';
  runId: string;
  mode: 'scout' | 'prepare';
  entitlement?: {
    plan: 'free' | 'pro' | 'max';
    planLabel: string;
    outcomeLabel: string;
    outcomeDescription: string;
    limitLabel: string;
    requestedMode: 'scout' | 'prepare';
    effectiveMode: 'scout' | 'prepare';
    downgraded: boolean;
    recurringScouting: boolean;
    upgrade: { href: string; label: string; reason: string } | null;
  };
  queuedCount: number;
  jobsFound: number;
  goal: {
    targetRole: string;
    location: string;
    salaryTarget: number;
    remotePreference: TargetWorkMode;
  };
  queued: Array<{
    queueId: string;
    title: string;
    company: string;
    location: string;
    matchScore: number;
    packetStatus: string;
    resumeVersionId: string | null;
    applicationUrl: string;
    fitSignals?: string[];
    riskSignals?: string[];
    sourceNotes?: string[];
    nextAction?: string;
  }>;
  nextActions: string[];
  warnings: string[];
  notification?: {
    inApp: boolean;
    emailAccepted?: boolean;
    emailSkippedReason?: string | null;
  };
  error?: string;
  needsResume?: boolean;
  needsTargetBrief?: boolean;
  missingTargetFields?: string[];
  workloadLimit?: {
    reason: 'concurrent_run' | 'daily_run_cap' | 'daily_model_cap' | 'daily_packet_cap';
    used: number;
    cap: number;
    resetsAt: string;
  };
  score?: number;
  recommendedAction?: string;
  recommendationReason?: string;
};
type SonaRetryOptions = {
  resumeVersionId?: string | null;
  harnessRequest?: SonaHarnessRequest;
  autoSpeak?: boolean;
};
type SonaActivationLaunchIntent = {
  message: string;
  resumeVersionId?: string | null;
  harnessRequest: SonaHarnessRequest;
  autoSpeak?: boolean;
  source: 'target_brief' | 'resume_upload';
};
type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  actionPlan?: SonaActionPlan;
  harnessResult?: SonaHarnessClientResult;
  recovery?: SonaRecovery & { retryText?: string; retryOptions?: SonaRetryOptions };
};

const PERSONALITY_CONFIG: Record<Personality, { label: string; icon: string; desc: string; color: string }> = {
  professional: { label: 'Professional', icon: 'business_center', desc: 'Formal & data-driven', color: '#3b82f6' },
  coach: { label: 'Coach', icon: 'fitness_center', desc: 'Warm & encouraging', color: '#10b981' },
  direct: { label: 'Direct', icon: 'bolt', desc: 'No-fluff, results only', color: '#f59e0b' },
};

const ALL_PROMPTS = [
  // Resume & Build
  { icon: 'description', text: 'Show me my saved resume versions', color: '#f59e0b' },
  { icon: 'swap_horiz', text: 'Use my Google resume and analyze it against this JD', color: '#f59e0b' },
  { icon: 'edit_note', text: 'Morph my resume for a Data Engineer role at Stripe', color: '#f59e0b' },
  // Search & Apply
  { icon: 'radar', text: 'Find remote React jobs and score them against my resume', color: '#06b6d4' },
  { icon: 'domain', text: 'Scan Airbnb\'s career page for open engineering roles', color: '#06b6d4' },
  { icon: 'work', text: 'Review my pipeline — any follow-ups needed?', color: '#22c55e' },
  // Prepare
  { icon: 'chat', text: 'Prep me for my Amazon interview next week', color: '#3b82f6' },
  { icon: 'auto_stories', text: 'Save a STAR story about cutting deploy time 80%', color: '#10b981' },
  { icon: 'quiz', text: 'Help me answer: "Tell me about a time you led a team"', color: '#3b82f6' },
  // Grow
  { icon: 'payments', text: 'I got a $130K offer from Meta. Help me review it in Applications', color: '#10b981' },
  { icon: 'neurology', text: 'How is my job search going? What should I focus on?', color: '#8b5cf6' },
  // Cover Letter & LinkedIn
  { icon: 'edit_document', text: 'Write a cover letter using my Stripe-tailored resume', color: '#f43f5e' },
  { icon: 'badge', text: 'Optimize my LinkedIn headline for ML Engineer roles', color: '#3b82f6' },
  { icon: 'auto_awesome', text: 'Analyze my skill gaps and suggest what to learn', color: '#a855f7' },
];

const AGENT_WORKFLOWS = [
  {
    label: 'Upload and scout',
    detail: 'Resume-led job picks',
    icon: 'upload_file',
    color: '#06b6d4',
    action: 'resumeUpload',
    prompt: 'Use my active resume to find strong-fit jobs. Ask for target role, salary, location, and remote preference if you need them, then run the career goal harness for review-first job picks.',
  },
  {
    label: 'Sharpen my story',
    detail: 'STAR proof, interview use',
    icon: 'auto_stories',
    color: '#10b981',
    prompt: 'Help me turn a recent work win into a strong STAR story for interviews.',
  },
  {
    label: 'Fix my pipeline',
    detail: 'Follow-ups, blockers, focus',
    icon: 'work_history',
    color: '#f59e0b',
    prompt: 'Review my job search pipeline and tell me which follow-ups or priorities matter most.',
  },
  {
    label: 'Prepare for a loop',
    detail: 'Questions, drills, strategy',
    icon: 'psychology',
    color: '#8b5cf6',
    prompt: 'Build a focused interview prep plan for my next role.',
  },
];

const SONA_VOICES: Array<{ id: SonaVoiceId; label: string; tone: string }> = [
  { id: 'nova', label: 'Nova', tone: 'Warm and clear' },
  { id: 'alloy', label: 'Alloy', tone: 'Balanced guide' },
  { id: 'shimmer', label: 'Shimmer', tone: 'Bright coach' },
  { id: 'echo', label: 'Echo', tone: 'Calm strategist' },
  { id: 'fable', label: 'Fable', tone: 'Story-focused' },
  { id: 'onyx', label: 'Onyx', tone: 'Direct and grounded' },
];

function formatTargetBrief(target: {
  role?: string;
  salary?: string;
  location?: string;
  workMode?: TargetWorkMode;
}) {
  return [
    target.role ? `target role: ${target.role}` : '',
    target.salary ? `salary target: ${target.salary}` : '',
    target.location ? `location: ${target.location}` : '',
    target.workMode && target.workMode !== 'any' ? `work mode: ${target.workMode}` : '',
  ].filter(Boolean).join('; ');
}

function parseSalaryTarget(value: string) {
  const numeric = Number(value.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return numeric < 1000 ? Math.round(numeric * 1000) : Math.round(numeric);
}

function buildHarnessRequest(params: {
  resumeVersionId?: string | null;
  role?: string;
  salary?: string;
  location?: string;
  workMode: TargetWorkMode;
}): SonaHarnessRequest {
  return {
    ...(params.resumeVersionId ? { resumeVersionId: params.resumeVersionId } : {}),
    targetRole: params.role?.trim() || undefined,
    location: params.location?.trim() || undefined,
    salaryTarget: parseSalaryTarget(params.salary || ''),
    remotePreference: params.workMode,
    notify: true,
  };
}

function SonaHarnessResultCard({
  result,
  accentColor,
  isLight,
}: {
  result: SonaHarnessClientResult;
  accentColor: string;
  isLight: boolean;
}) {
  const goal = result.goal || ({} as Partial<SonaHarnessClientResult['goal']>);
  const queued = Array.isArray(result.queued) ? result.queued : [];
  const topPicks = selectSonaTopPicks(queued);
  const [activeQueueId, setActiveQueueId] = useState<string | null>(topPicks[0]?.queueId || null);
  const activePick = topPicks.find(job => job.queueId === activeQueueId) || topPicks[0] || null;
  const safeApplicationUrl = getSafeExternalUrl(activePick?.applicationUrl);
  const queuedCount = typeof result.queuedCount === 'number' ? result.queuedCount : queued.length;
  const needsResume = Boolean(result.needsResume);
  const needsTargetBrief = Boolean(result.needsTargetBrief);
  const missingTargetFields = Array.isArray(result.missingTargetFields) ? result.missingTargetFields : [];
  const partialScore = typeof result.score === 'number' && Number.isFinite(result.score)
    ? Math.max(0, Math.min(100, Math.round(result.score)))
    : null;
  const salaryTarget = typeof goal.salaryTarget === 'number' ? goal.salaryTarget : 0;
  const salaryLabel = salaryTarget
    ? `$${Math.round(salaryTarget / 1000)}k`
    : 'Not set';
  const statusLabel = queuedCount > 0
    ? result.status === 'prepared' ? 'Packets ready' : 'Roles queued'
    : needsResume ? 'Resume needed' : needsTargetBrief ? 'Target brief needed' : partialScore !== null ? 'Fit review ready' : 'No strong match yet';
  const badgeLabel = queuedCount > 0
    ? `${queuedCount} queued`
    : needsTargetBrief
      ? `${missingTargetFields.length || 1} field${missingTargetFields.length === 1 ? '' : 's'} needed`
      : partialScore !== null ? `${partialScore} fit` : '0 queued';
  const fallbackActionLabel = partialScore !== null || result.recommendedAction ? 'Continue search' : 'Broaden search';
  const entitlement = result.entitlement;
  const upgradeAction = entitlement?.upgrade || (result.error && !result.workloadLimit
    ? { href: '/suite/upgrade', label: 'View Pro / Max', reason: 'Compare the available Sona workflows.' }
    : null);
  const notificationState = getSonaHarnessNotificationStatus(result.notification);
  const detailRows = [
    ['Role', goal.targetRole || 'Not set'],
    ['Location', goal.location || 'Not set'],
    ['Work mode', goal.remotePreference || 'Any'],
    ['Salary', salaryLabel],
  ];

  return (
    <div
      className="mt-3 rounded-[18px] border p-3 sm:p-4"
      style={{
        background: isLight ? 'rgba(248,250,252,0.92)' : 'rgba(255,255,255,0.04)',
        borderColor: queuedCount > 0 ? `${accentColor}38` : isLight ? 'rgba(15,23,42,0.1)' : 'rgba(255,255,255,0.1)',
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {entitlement?.planLabel || 'Sona scout run'}
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{statusLabel}</p>
              {entitlement?.limitLabel && (
                <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">{entitlement.limitLabel}</p>
              )}
        </div>
        <span
          className="inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
          style={{ borderColor: `${accentColor}30`, background: `${accentColor}10`, color: accentColor }}
        >
          <span className="material-symbols-rounded text-[14px]">radar</span>
          {badgeLabel}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        {detailRows.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
            <span className="mt-0.5 block truncate font-semibold text-[var(--text-primary)]">{value}</span>
          </div>
        ))}
      </div>

      {queued.length > 0 && (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-4" aria-label="Top job picks">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Top picks</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Choose a role to review its fit, checks, and next action.</p>
            </div>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
              {activePick ? topPicks.findIndex(job => job.queueId === activePick.queueId) + 1 : 0} of {topPicks.length}
            </span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3" role="group" aria-label="Sona top job picks">
            {topPicks.map((job, index) => {
              const selected = activePick?.queueId === job.queueId;
              return (
                <button
                  key={job.queueId}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActiveQueueId(job.queueId)}
                  className={`flex min-h-14 min-w-0 items-center gap-3 rounded-[13px] border px-3 py-2.5 text-left transition ${
                    selected
                      ? 'border-blue-500/45 bg-blue-500/10'
                      : 'border-[var(--border-subtle)] bg-[var(--card-bg)] hover:border-[var(--border)]'
                  }`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-xs font-bold tabular-nums text-[var(--text-primary)]">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block line-clamp-2 text-xs font-semibold leading-4 text-[var(--text-primary)]">{job.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]">{job.company}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-blue-600 dark:text-blue-300">{job.matchScore}%</span>
                </button>
              );
            })}
          </div>

          {activePick && (
            <div className="mt-4 border-t border-[var(--border-subtle)] pt-4" aria-live="polite">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5 text-[var(--text-primary)]">{activePick.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">{activePick.company} · {activePick.location}</p>
                </div>
                <span className="w-fit shrink-0 rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  {activePick.matchScore}% Talent fit
                </span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Why it ranks</p>
                  <ul className="mt-1.5 space-y-1.5 text-xs leading-5 text-[var(--text-secondary)]">
                    {(activePick.fitSignals?.length ? activePick.fitSignals : ['Review the role against your verified resume evidence.']).slice(0, 2).map(signal => (
                      <li key={signal} className="flex min-w-0 gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
                        <span className="min-w-0 [overflow-wrap:anywhere]">{signal}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Check first</p>
                  <ul className="mt-1.5 space-y-1.5 text-xs leading-5 text-[var(--text-secondary)]">
                    {(activePick.riskSignals?.length ? activePick.riskSignals : activePick.sourceNotes?.length ? activePick.sourceNotes : ['Verify the original posting before applying.']).slice(0, 2).map(signal => (
                      <li key={signal} className="flex min-w-0 gap-2">
                        <span className="material-symbols-rounded mt-0.5 shrink-0 text-[14px] text-[var(--text-muted)]" aria-hidden="true">rule</span>
                        <span className="min-w-0 [overflow-wrap:anywhere]">{signal}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {activePick.nextAction && (
                <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">Next: </span>{activePick.nextAction}
                </p>
              )}

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <a
                  href={`/suite/agent/queue?packet=${encodeURIComponent(activePick.queueId)}`}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[11px] bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
                >
                  <span className="material-symbols-rounded text-[16px]" aria-hidden="true">fact_check</span>
                  {activePick.packetStatus === 'prepared' ? 'Review packet' : 'Review role'}
                </a>
                {safeApplicationUrl && (
                  <a
                    href={safeApplicationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
                  >
                    <span className="material-symbols-rounded text-[16px]" aria-hidden="true">open_in_new</span>
                    Verify posting
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {queued.length === 0 && (result.recommendedAction || result.recommendationReason) && (
        <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2.5 text-xs leading-5 text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">
            {result.recommendedAction || 'Review next step'}
          </span>
          {result.recommendationReason && (
            <span className="mt-1 block">{result.recommendationReason}</span>
          )}
        </div>
      )}

      {result.warnings?.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:text-amber-200">
          <span className="font-semibold">Review needed</span>
          <ul className="mt-1 space-y-1">
            {result.warnings.slice(0, 3).map(warning => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <a
          href={queuedCount > 0 ? '/suite/agent/queue' : needsResume ? '/suite/resume' : needsTargetBrief ? '#sona-target-brief' : '/suite/job-search'}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-3 text-xs font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
        >
          <span className="material-symbols-rounded text-[16px]">{queuedCount > 0 ? 'reviews' : needsResume ? 'upload_file' : needsTargetBrief ? 'tune' : 'search'}</span>
          {queuedCount > 0 ? 'Open Agent Queue' : needsResume ? 'Add resume' : needsTargetBrief ? 'Complete target brief' : fallbackActionLabel}
        </a>
        {upgradeAction && !needsTargetBrief && !needsResume && (
          <a
            href={upgradeAction.href}
            title={upgradeAction.reason}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 text-center text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
          >
            <span className="material-symbols-rounded text-[16px]" aria-hidden="true">workspace_premium</span>
            {upgradeAction.label}
          </a>
        )}
      </div>

      {queuedCount > 0 && (
        <div className="mt-3 flex min-w-0 flex-col gap-2 border-t border-[var(--border-subtle)] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <span className={`inline-flex min-h-7 w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
              notificationState.status === 'accepted'
                ? 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                : notificationState.status === 'unavailable'
                  ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
            }`}>
              <span className="material-symbols-rounded text-[14px]" aria-hidden="true">{notificationState.icon}</span>
              {notificationState.label}
            </span>
            <p className="mt-1 min-w-0 text-xs leading-5 text-[var(--text-secondary)]">{notificationState.message}</p>
          </div>
          <a
            href="/suite/job-search?controls=alerts#sona-picks-controls"
            onClick={() => {
              try {
                const targetRole = normalizeAlertTargetRole(goal.targetRole);
                if (targetRole) sessionStorage.setItem(SONA_ALERT_TARGET_ROLE_KEY, targetRole);
              } catch {
                // The controls still open if local handoff storage is unavailable.
              }
            }}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
          >
            <span className="material-symbols-rounded text-[16px]" aria-hidden="true">notifications</span>
            Choose email alerts
          </a>
        </div>
      )}
    </div>
  );
}

function buildSonaResumeSearchPrompt(
  fileName: string,
  target: { role?: string; salary?: string; location?: string; workMode?: TargetWorkMode } = {},
) {
  const targetBrief = formatTargetBrief(target);
  return [
    `I uploaded ${fileName}. Use this resume as my source of truth.`,
    targetBrief
      ? `My current search target is ${targetBrief}.`
      : 'Help me find jobs that fit it. Infer a safe starting role and location from the resume or saved preferences, then ask only for information that cannot be grounded there.',
    'If you have enough context, run the career goal harness, queue the best matches for my review, and do not apply or contact anyone externally.',
  ].join(' ');
}

function buildSonaTargetPrompt(target: {
  role: string;
  salary?: string;
  location?: string;
  workMode: TargetWorkMode;
  hasResume: boolean;
}) {
  const targetBrief = formatTargetBrief(target);
  return [
    target.hasResume
      ? 'Use my active resume and this target to run a review-first job search.'
      : 'Save this target as my job-search brief and tell me what resume context you need next.',
    targetBrief ? `Target: ${targetBrief}.` : '',
    target.hasResume && !targetBrief
      ? 'Infer the safest starting role and location from the verified resume or saved preferences, then show me what you used.'
      : '',
    'Find strong-fit roles, explain the fit and risks, and prepare only review-ready next steps. Do not apply, email, text, or contact anyone externally.',
  ].filter(Boolean).join(' ');
}

function buildSkillGraphFromResume(resume: CanonicalResume) {
  return {
    source: 'sona_resume_upload',
    skills: resume.skills.flatMap((group) => group.items).filter(Boolean).slice(0, 80),
    experienceCount: resume.experience.length,
    educationCount: resume.education.length,
    certificationCount: resume.certifications.length,
  };
}


export default function SonaAgentPage() {
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const { user } = useStore();
  const { tier, isPro } = useUserTier();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [personality, setPersonality] = useState<Personality>('coach');
  const [showPersonalityPicker, setShowPersonalityPicker] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [audioRepliesEnabled, setAudioRepliesEnabled] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<SonaVoiceId>('nova');
  const [gated, setGated] = useState<{ message: string; used: number; cap: number } | null>(null);
  const [showAuth, setShowAuth] = useState<'login' | 'signup' | null>(null);

  // Active resume context for Sona
  const [activeResumeId, setActiveResumeId] = useState<string | null>(null);
  const [activeResumeName, setActiveResumeName] = useState('');
  const [resumeUploadStage, setResumeUploadStage] = useState<ResumeUploadStage>('idle');
  const [resumeUploadMessage, setResumeUploadMessage] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [targetSalary, setTargetSalary] = useState('');
  const [targetLocation, setTargetLocation] = useState('');
  const [targetWorkMode, setTargetWorkMode] = useState<TargetWorkMode>('hybrid');
  const [targetBriefError, setTargetBriefError] = useState('');
  const [activationProofState, setActivationProofState] = useState<SonaActivationProofViewState>({ phase: 'idle' });
  const [activationLaunchIntent, setActivationLaunchIntent] = useState<SonaActivationLaunchIntent | null>(null);

  // Conversation persistence
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const suggestedPrompts = useMemo(() => AGENT_WORKFLOWS, []);

  // Typewriter placeholder hints
  const PLACEHOLDER_HINTS = useMemo(() => ALL_PROMPTS.slice(0, 10).map(p => p.text), []);
  const [placeholderText, setPlaceholderText] = useState('');


  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resumeUploadInputRef = useRef<HTMLInputElement>(null);
  const pendingResumeConsumedRef = useRef(false);
  const activationProofRequestRef = useRef(0);
  const activationProofAbortRef = useRef<AbortController | null>(null);
  const isResumeUploadBusy = resumeUploadStage === 'extracting' || resumeUploadStage === 'structuring' || resumeUploadStage === 'saving';
  const isActivationChecking = activationProofState.phase === 'checking';

  const invalidateActivationProof = useCallback(() => {
    activationProofRequestRef.current += 1;
    activationProofAbortRef.current?.abort();
    activationProofAbortRef.current = null;
    setActivationProofState({ phase: 'idle' });
    setActivationLaunchIntent(null);
  }, []);

  useEffect(() => () => activationProofAbortRef.current?.abort(), []);

  // Voice: Deepgram STT + DashScope CosyVoice TTS (same stack as Interview Prep)
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const { isRecording, recordingTime, startRecording, stopRecording, getVisualizerData } = useAudioRecorder();
  const { isPlaying, playAudio, stopAudio } = useAudioPlayer();
  const [visualizerData, setVisualizerData] = useState<number[]>([]);
  const animFrameRef = useRef<number | null>(null);

  // Typewriter placeholder effect (must be after isRecording/isTranscribing declarations)
  useEffect(() => {
    if (input || loading || isRecording || isTranscribing || gated) return;
    let hintIdx = 0;
    let charIdx = 0;
    let isDeleting = false;
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      const currentHint = PLACEHOLDER_HINTS[hintIdx];
      if (!isDeleting) {
        charIdx++;
        setPlaceholderText(currentHint.slice(0, charIdx));
        if (charIdx === currentHint.length) {
          timeout = setTimeout(() => { isDeleting = true; tick(); }, 2200);
          return;
        }
        timeout = setTimeout(tick, 45 + Math.random() * 30);
      } else {
        charIdx--;
        setPlaceholderText(currentHint.slice(0, charIdx));
        if (charIdx === 0) {
          isDeleting = false;
          hintIdx = (hintIdx + 1) % PLACEHOLDER_HINTS.length;
          timeout = setTimeout(tick, 400);
          return;
        }
        timeout = setTimeout(tick, 25);
      }
    };

    timeout = setTimeout(tick, 800);
    return () => clearTimeout(timeout);
  }, [input, loading, isRecording, isTranscribing, gated, PLACEHOLDER_HINTS]);

  // STT: Record → Deepgram transcribe → populate input
  const handleVoiceInput = useCallback(async () => {
    if (isRecording) {
      const blob = await stopRecording();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (!blob) return;
      setIsTranscribing(true);
      try {
        const formData = new FormData();
        formData.append('file', blob, 'sona-voice.webm');
        const res = await authFetch('/api/voice/transcribe', { method: 'POST', body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (err.upgrade) {
            // Voice is a Pro feature
            setInput('(Voice mode requires Pro — try typing instead)');
          }
          return;
        }
        const { text } = await res.json();
        if (text) setInput(prev => prev ? prev + ' ' + text : text);
      } catch (e) {
        console.error('STT error:', e);
      } finally {
        setIsTranscribing(false);
      }
    } else {
      startRecording();
      // Start visualizer animation
      const updateVisualizer = () => {
        setVisualizerData(getVisualizerData());
        animFrameRef.current = requestAnimationFrame(updateVisualizer);
      };
      animFrameRef.current = requestAnimationFrame(updateVisualizer);
    }
  }, [isRecording, stopRecording, startRecording, getVisualizerData]);

  // TTS: Send text → DashScope CosyVoice → play MP3
  const speakMessage = useCallback(async (text: string, idx: number) => {
    if (speakingIdx === idx) {
      stopAudio();
      setSpeakingIdx(null);
      return;
    }
    stopAudio();
    setSpeakingIdx(idx);
    try {
      const res = await authFetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 1000), voiceId: selectedVoiceId }), // Cap at 1K chars
      });
      if (!res.ok) {
        setSpeakingIdx(null);
        return;
      }
      const audioBlob = await res.blob();
      await playAudio(audioBlob, () => setSpeakingIdx(null));
    } catch {
      setSpeakingIdx(null);
    }
  }, [speakingIdx, stopAudio, playAudio, selectedVoiceId]);

  // Load Sona preferences from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sona-personality');
    if (saved && saved in PERSONALITY_CONFIG) setPersonality(saved as Personality);

    const savedVoice = localStorage.getItem('sona-voice-id') as SonaVoiceId | null;
    if (savedVoice && SONA_VOICES.some((voice) => voice.id === savedVoice)) {
      setSelectedVoiceId(savedVoice);
    }
    setAudioRepliesEnabled(localStorage.getItem('sona-audio-replies') === 'true');
  }, []);

  const updateSelectedVoice = (voiceId: SonaVoiceId) => {
    setSelectedVoiceId(voiceId);
    localStorage.setItem('sona-voice-id', voiceId);
  };

  const updateAudioReplies = (enabled: boolean) => {
    setAudioRepliesEnabled(enabled);
    localStorage.setItem('sona-audio-replies', enabled ? 'true' : 'false');
  };

  // Load conversation list on mount
  useEffect(() => {
    if (!user) return;
    loadConversations();
  }, [user]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length === 0 && !loading) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const loadConversations = async () => {
    try {
      const res = await authFetch('/api/agent/chat');
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch { /* silent */ }
  };

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setGated(null);
    setShowSidebar(false);
    invalidateActivationProof();
    inputRef.current?.focus();
  };

  const loadConversation = async (convId: string) => {
    invalidateActivationProof();
    setLoadingHistory(true);
    setShowSidebar(false);
    setConversationId(convId);
    setMessages([]);
    setGated(null);

    try {
      const conv = conversations.find(c => c.id === convId);
      if (conv) {
        setPersonality((conv.personality as Personality) || 'coach');
      }

      // Load actual messages from the API
      const res = await authFetch(`/api/agent/chat/history?conversationId=${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } finally {
      setLoadingHistory(false);
      inputRef.current?.focus();
    }
  };

  const selectPersonality = (p: Personality) => {
    setPersonality(p);
    localStorage.setItem('sona-personality', p);
    setShowPersonalityPicker(false);
  };

  const sendMessage = useCallback(async (text?: string, options?: {
    resumeVersionId?: string | null;
    autoSpeak?: boolean;
    harnessRequest?: SonaHarnessRequest;
    retry?: boolean;
  }) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    if (!user) {
      setShowAuth('signup');
      return;
    }

    const userMsg: Message = { role: 'user', content: msg };
    const canReuseLastUserMessage = options?.retry
      && messages[messages.length - 1]?.recovery
      && messages[messages.length - 2]?.role === 'user'
      && messages[messages.length - 2]?.content === msg;
    const updated = canReuseLastUserMessage ? messages.slice(0, -1) : [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setLoading(true);
    setGated(null);

    try {
      const res = await authFetch('/api/agent/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: updated,
          personality,
          conversationId,
          ...((options?.resumeVersionId ?? activeResumeId) ? { resumeVersionId: options?.resumeVersionId ?? activeResumeId } : {}),
          ...(options?.harnessRequest ? { harnessRequest: options.harnessRequest } : {}),
        }),
      });

      const data = await res.json();

      if (data.gated) {
        setGated({ message: data.error, used: data.used, cap: data.cap });
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const error = new Error(data.error || 'Sona could not complete that request.') as Error & {
          code?: string;
          retryable?: boolean;
          requiresFreshPreflight?: boolean;
          recovery?: SonaRecovery;
        };
        error.code = data.code;
        error.retryable = data.retryable;
        error.requiresFreshPreflight = data.requiresFreshPreflight;
        error.recovery = data.recovery;
        throw error;
      }

      // Track conversation ID from response
      if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      const assistantIndex = updated.length;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        actionPlan: data.actionPlan,
        harnessResult: data.harnessResult,
      }]);

      if (audioRepliesEnabled || options?.autoSpeak) {
        window.setTimeout(() => {
          speakMessage(data.message, assistantIndex);
        }, 120);
      }

      // Refresh conversation list (new conversation may have been created)
      loadConversations();
    } catch (err: any) {
      const recovery = (err?.recovery || (options?.harnessRequest?.activationReceipt
        ? activationPreviewConsumedRecovery()
        : {
          code: 'sona_failed',
          title: 'Sona paused safely',
          message: `Sona couldn't complete this step. ${err?.message || 'Your workspace was not changed.'}`,
          nextAction: 'Retry this message',
          action: 'retry',
          retryable: true,
        })) as SonaRecovery;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: recovery.message,
        recovery: {
          ...recovery,
          ...(recovery.action === 'retry' ? {
            retryText: msg,
            retryOptions: {
              resumeVersionId: options?.resumeVersionId ?? activeResumeId,
              harnessRequest: options?.harnessRequest,
              autoSpeak: options?.autoSpeak,
            },
          } : {}),
        },
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, messages, loading, user, personality, conversationId, activeResumeId, audioRepliesEnabled, speakMessage]);

  const runActivationPreflight = useCallback(async (intent: SonaActivationLaunchIntent) => {
    if (!user) {
      setShowAuth('signup');
      return;
    }

    const requestId = activationProofRequestRef.current + 1;
    activationProofRequestRef.current = requestId;
    activationProofAbortRef.current?.abort();
    const abortController = new AbortController();
    activationProofAbortRef.current = abortController;
    setActivationLaunchIntent(intent);
    setActivationProofState({ phase: 'checking' });

    try {
      const response = await authFetch('/api/agent/harness/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(intent.harnessRequest.resumeVersionId ? { resumeVersionId: intent.harnessRequest.resumeVersionId } : {}),
          ...(intent.harnessRequest.targetRole ? { targetRole: intent.harnessRequest.targetRole } : {}),
          ...(intent.harnessRequest.location ? { location: intent.harnessRequest.location } : {}),
          ...(intent.harnessRequest.salaryTarget ? { salaryTarget: intent.harnessRequest.salaryTarget } : {}),
          ...(intent.harnessRequest.remotePreference ? { remotePreference: intent.harnessRequest.remotePreference } : {}),
        }),
        signal: abortController.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (requestId !== activationProofRequestRef.current) return;

      const isProofResult = data
        && ['ready', 'degraded', 'blocked'].includes(data.status)
        && data.target
        && data.resume
        && data.supply
        && Array.isArray(data.topPicks);
      if (isProofResult) {
        activationProofAbortRef.current = null;
        setActivationProofState({ phase: 'result', result: data });
        return;
      }

      activationProofAbortRef.current = null;
      setActivationProofState({
        phase: 'error',
        error: {
          code: String(data.code || 'ACTIVATION_PROOF_FAILED'),
          title: response.status === 401 ? 'Sign in to preview' : response.status === 429 ? 'Preview limit reached' : 'Scout preview paused',
          message: String(data.error || 'Sona could not verify this path. No scout quota or external action was used.'),
          retryable: response.status !== 401 && data.retryable !== false,
        },
      });
    } catch (error) {
      if (requestId !== activationProofRequestRef.current) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      activationProofAbortRef.current = null;
      setActivationProofState({
        phase: 'error',
        error: {
          code: 'NETWORK_INTERRUPTED',
          title: 'Connection interrupted',
          message: 'The preview stopped before Sona used scout quota or created a packet. Your target is still here.',
          retryable: true,
        },
      });
    }
  }, [user]);

  const launchActivationProof = useCallback(() => {
    if (!activationLaunchIntent || activationProofState.phase !== 'result' || !activationProofState.result.canScout) return;
    const intent = activationLaunchIntent;
    const proof = activationProofState.result;
    const receiptToken = proof.activationReceipt?.token;
    if (!receiptToken) {
      setActivationProofState({
        phase: 'error',
        error: {
          code: 'PREFLIGHT_RECEIPT_MISSING',
          title: 'Run a fresh scout preview',
          message: 'Sona did not receive a launch receipt. No scout quota was used.',
          retryable: true,
        },
      });
      return;
    }
    if (intent.resumeVersionId && proof.resume.id !== intent.resumeVersionId) {
      setActivationProofState({
        phase: 'error',
        error: {
          code: 'RESUME_CONTEXT_CHANGED',
          title: 'Resume context changed',
          message: 'Sona stopped before using scout quota. Run the preview again with the selected resume.',
          retryable: true,
        },
      });
      return;
    }
    const harnessRequest: SonaHarnessRequest = {
      ...intent.harnessRequest,
      resumeVersionId: proof.resume.id || undefined,
      targetRole: proof.target.role,
      location: proof.target.location,
      salaryTarget: proof.target.salaryTarget || undefined,
      remotePreference: proof.target.remotePreference,
      mode: 'scout',
      notify: false,
      activationReceipt: receiptToken,
    };
    analytics.sonaPacketPromptStarted(intent.source);
    setActivationProofState({ phase: 'idle' });
    setActivationLaunchIntent(null);
    sendMessage(intent.message, {
      resumeVersionId: proof.resume.id,
      autoSpeak: intent.autoSpeak,
      harnessRequest,
    });
  }, [activationLaunchIntent, activationProofState, sendMessage]);

  const editActivationTarget = useCallback(() => {
    invalidateActivationProof();
    document.getElementById('sona-target-brief')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => document.getElementById('sona-target-role')?.focus(), 350);
  }, [invalidateActivationProof]);

  const retryActivationProof = useCallback(() => {
    if (activationLaunchIntent) runActivationPreflight(activationLaunchIntent);
  }, [activationLaunchIntent, runActivationPreflight]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const submitTargetBrief = useCallback(() => {
    const role = targetRole.trim();
    const salary = targetSalary.trim();
    const location = targetLocation.trim();
    const canInferFromResume = Boolean(activeResumeId);
    if ((!role || !location) && !canInferFromResume) {
      setTargetBriefError('Add a target role and location, or upload a resume so Sona can infer the starting point.');
      return;
    }

    setTargetBriefError('');
    analytics.sonaTargetPromptSubmitted(Boolean(activeResumeId), targetWorkMode);
    const harnessRequest = buildHarnessRequest({
      resumeVersionId: activeResumeId,
      role,
      salary,
      location,
      workMode: targetWorkMode,
    });
    runActivationPreflight({
      message: buildSonaTargetPrompt({
        role,
        salary,
        location,
        workMode: targetWorkMode,
        hasResume: Boolean(activeResumeId),
      }),
      resumeVersionId: activeResumeId,
      harnessRequest,
      source: 'target_brief',
    });
  }, [activeResumeId, runActivationPreflight, targetLocation, targetRole, targetSalary, targetWorkMode]);

  const useExampleTarget = () => {
    invalidateActivationProof();
    setTargetRole('Cybersecurity engineer');
    setTargetSalary('$120k');
    setTargetLocation('New Jersey');
    setTargetWorkMode('hybrid');
  };

  const openResumeUploadPicker = useCallback(() => {
    if (!user) {
      setShowAuth('signup');
      return;
    }
    if (loading || isResumeUploadBusy) return;
    resumeUploadInputRef.current?.click();
  }, [isResumeUploadBusy, loading, user]);

  const processExtractedResume = useCallback(async (upload: {
    text: string;
    fileName: string;
    sourceType: 'direct' | 'storage';
    characterCount?: number;
    detectedType?: 'pdf' | 'docx' | 'doc' | 'txt';
    handoffId?: string;
  }, savedFrom: 'sona_agent_upload' | 'landing_resume_handoff') => {
    setResumeUploadStage('structuring');
    setResumeUploadMessage('Structuring resume evidence for Sona...');

    const parseRes = await authFetch('/api/resume/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: upload.text }),
    });
    const parsed = await parseRes.json().catch(() => ({}));
    if (!parseRes.ok || parsed.error) {
      const message = parsed.message || parsed.error || 'Sona could not structure this resume.';
      throw new Error(
        savedFrom === 'landing_resume_handoff'
          ? `${message} Your resume is still staged in this tab.`
          : message,
      );
    }

    let normalizedResume = normalizeResume(parsed.resume || parsed.data?.resume || parsed.parsedResume);
    if (!hasResumeContextEvidence(normalizedResume)) {
      normalizedResume = buildResumeContextFromUpload(upload.text, upload.fileName);
    }
    if (!hasResumeContextEvidence(normalizedResume)) {
      throw new Error('This file uploaded, but Sona could not find enough resume evidence.');
    }

    setResumeUploadStage('saving');
    setResumeUploadMessage('Saving resume as Sona context...');

    const cleanName = upload.fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Uploaded resume';
    const saved = await saveResumeVersion(
      `Sona intake - ${cleanName}`,
      normalizedResume as any,
      buildSkillGraphFromResume(normalizedResume),
      'technical',
      {
        savedFrom,
        originalFileName: upload.fileName,
        uploadSourceType: upload.sourceType,
        detectedType: upload.detectedType || null,
        characterCount: upload.characterCount || upload.text.length,
        resumeProvenance: { verified: true, origin: 'sona_upload' },
        ...(upload.handoffId ? { handoffId: upload.handoffId } : {}),
      },
      savedFrom === 'landing_resume_handoff' && upload.handoffId
        ? { idempotencyKey: upload.handoffId }
        : {},
    );

    if (!saved.success || !saved.data?.id) {
      throw new Error(saved.error || 'Resume uploaded, but could not be saved for Sona.');
    }

    invalidateActivationProof();
    setActiveResumeId(saved.data.id);
    setActiveResumeName(saved.data.version_name);
    analytics.sonaResumeSaved(saved.data.id);
    setResumeUploadStage('ready');
    if (!targetRole.trim() || !targetLocation.trim()) {
      setResumeUploadMessage(`${saved.data.version_name} is saved. Add a target to refine the search, or let Sona start from this resume.`);
      setTargetBriefError('You can add a target to refine the search, or scout from the verified resume.');
      return;
    }

    setTargetBriefError('');
    setResumeUploadMessage(`${saved.data.version_name} is ready. Checking safe matches before using scout quota.`);
    const harnessRequest = buildHarnessRequest({
      resumeVersionId: saved.data.id,
      role: targetRole.trim(),
      salary: targetSalary.trim(),
      location: targetLocation.trim(),
      workMode: targetWorkMode,
    });
    await runActivationPreflight({
      message: buildSonaResumeSearchPrompt(upload.fileName, {
        role: targetRole.trim(),
        salary: targetSalary.trim(),
        location: targetLocation.trim(),
        workMode: targetWorkMode,
      }),
      resumeVersionId: saved.data.id,
      autoSpeak: audioRepliesEnabled,
      harnessRequest,
      source: 'resume_upload',
    });
  }, [audioRepliesEnabled, invalidateActivationProof, runActivationPreflight, targetLocation, targetRole, targetSalary, targetWorkMode]);

  const handleResumeUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!user) {
      setShowAuth('signup');
      if (resumeUploadInputRef.current) {
        resumeUploadInputRef.current.value = '';
      }
      return;
    }

    try {
      validateResumeFile(file);
    } catch (error: any) {
      setResumeUploadStage('error');
      setResumeUploadMessage(error?.message || 'Please upload a PDF, Word, or TXT resume.');
      if (resumeUploadInputRef.current) {
        resumeUploadInputRef.current.value = '';
      }
      return;
    }

    invalidateActivationProof();
    setResumeUploadStage('extracting');
    setResumeUploadMessage(`Reading ${file.name}...`);
    analytics.sonaResumeUploadStarted('sona_agent');

    try {
      const upload = await uploadAndParseResume(file);
      analytics.sonaResumeParsed(upload.sourceType, upload.characterCount || upload.text.length);
      await processExtractedResume(upload, 'sona_agent_upload');
    } catch (error: any) {
      setResumeUploadStage('error');
      setResumeUploadMessage(
        error instanceof ResumeUploadError
          ? error.message
          : error?.message || 'Resume upload failed. Try a text-based PDF, DOCX, or TXT file.',
      );
    } finally {
      if (resumeUploadInputRef.current) {
        resumeUploadInputRef.current.value = '';
      }
    }
  }, [processExtractedResume, user]);

  useEffect(() => {
    if (!user || pendingResumeConsumedRef.current || searchParams.get('pendingResume') !== '1') return;
    pendingResumeConsumedRef.current = true;
    const pending = readPendingSonaResume();
    const clearPendingQuery = () => {
      const params = new URLSearchParams(window.location.search);
      params.delete('pendingResume');
      window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}${window.location.hash}`);
    };
    if (!pending) {
      clearPendingQuery();
      setResumeUploadStage('error');
      setResumeUploadMessage('The temporary resume handoff expired. Upload the resume again to continue.');
      return;
    }

    invalidateActivationProof();
    setResumeUploadStage('extracting');
    setResumeUploadMessage(`Resume ready from ${pending.fileName}. Preparing Sona context...`);
    analytics.sonaResumeUploadStarted('landing_handoff');
    analytics.sonaResumeParsed(pending.sourceType, pending.characterCount);
    void processExtractedResume(pending, 'landing_resume_handoff')
      .then(() => {
        clearPendingSonaResume();
        clearPendingQuery();
      })
      .catch((error: any) => {
        setResumeUploadStage('error');
        setResumeUploadMessage(error?.message || 'Sona could not save the resume handoff. Your resume is still staged in this tab.');
      });
  }, [invalidateActivationProof, processExtractedResume, searchParams, user]);

  const pConfig = PERSONALITY_CONFIG[personality];
  const handleRecoveryAction = useCallback((recovery: SonaRecovery & { retryText?: string; retryOptions?: SonaRetryOptions }) => {
    if (recovery.action === 'retry' && recovery.retryText) {
      sendMessage(recovery.retryText, { ...recovery.retryOptions, retry: true });
      return;
    }
    if (recovery.action === 'upload_resume') {
      openResumeUploadPicker();
      return;
    }
    if (recovery.action === 'edit_target') {
      document.getElementById('sona-target-brief')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => document.getElementById('sona-target-role')?.focus(), 350);
      return;
    }
    if (recovery.action === 'open_queue') window.location.href = '/suite/agent/queue';
  }, [openResumeUploadPicker, sendMessage]);
  const resumeSourcePromptMode = resolveResumeSourcePromptMode({
    intentRequested: searchParams.get('intent') === 'resume-upload',
    activeResumeId,
    uploadReady: resumeUploadStage === 'ready',
  });
  const showResumeUploadIntent = resumeSourcePromptMode === 'all';
  const shouldShowResumeSourcePrompt = resumeSourcePromptMode !== 'none';
  const visibleSuggestedPrompts = useMemo(
    () => showResumeUploadIntent
      ? suggestedPrompts.filter((prompt) => prompt.action !== 'resumeUpload')
      : suggestedPrompts,
    [showResumeUploadIntent, suggestedPrompts],
  );

  const formatTimeAgo = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  };

  const isOpeningState = messages.length === 0 && !gated && !loadingHistory;

  const renderComposer = (inline = false) => (
    <div
      className={inline ? 'mt-5' : 'shrink-0 px-4 sm:px-6 py-4 border-t'}
      style={inline ? undefined : { borderColor: isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)' }}
    >
      <div className="max-w-5xl mx-auto">
        <input
          ref={resumeUploadInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden"
          onChange={(event) => handleResumeUpload(event.target.files?.[0] || null)}
        />
        <div
          className={`flex items-end gap-2 rounded-2xl p-2 ${inline ? 'shadow-lg shadow-black/10' : ''}`}
          style={{
            background: isLight ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.045)',
            border: `1px solid ${isLight ? 'rgba(15,23,42,0.09)' : 'rgba(255,255,255,0.09)'}`,
          }}
        >
          <button
            type="button"
            onClick={openResumeUploadPicker}
            disabled={loading || isResumeUploadBusy}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-all hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-45"
            title={isResumeUploadBusy ? 'Resume upload in progress' : 'Upload resume for Sona'}
            aria-label={isResumeUploadBusy ? 'Resume upload in progress' : 'Upload resume for Sona'}
          >
            <span className={`material-symbols-rounded text-[20px] ${isResumeUploadBusy ? 'animate-spin text-blue-500' : 'text-[var(--text-muted)]'}`}>
              {isResumeUploadBusy ? 'progress_activity' : 'add'}
            </span>
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? 'Recording...' : isTranscribing ? 'Transcribing...' : gated ? 'Upgrade to continue...' : placeholderText || 'Ask Sona anything...'}
            disabled={loading || !!gated}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none px-2 py-2 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] max-h-32 sm:text-sm"
            style={{ minHeight: '44px' }}
          />
          <button
            onClick={handleVoiceInput}
            disabled={loading || !!gated || isTranscribing}
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-all disabled:opacity-30 ${isRecording ? 'animate-pulse' : ''}`}
            style={{
              background: isRecording ? '#f43f5e' : isTranscribing ? '#f59e0b' : 'transparent',
              color: isRecording || isTranscribing ? '#fff' : 'var(--text-muted)',
            }}
            title={isRecording ? 'Stop recording' : isTranscribing ? 'Transcribing...' : 'Voice input'}
            aria-label={isRecording ? 'Stop recording' : isTranscribing ? 'Transcribing voice input' : 'Start voice input'}
          >
            <span className="material-symbols-rounded text-[18px]">
              {isTranscribing ? 'progress_activity' : isRecording ? 'stop_circle' : 'mic'}
            </span>
          </button>
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading || !!gated}
            aria-label="Send message to Sona"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-all disabled:opacity-30"
            style={{
              background: input.trim() ? pConfig.color : 'transparent',
              color: input.trim() ? '#fff' : 'var(--text-muted)',
            }}
          >
            <span className="material-symbols-rounded text-[18px]">arrow_upward</span>
          </button>
        </div>
        {resumeUploadStage !== 'idle' && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-2 flex flex-wrap items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5 ${
              resumeUploadStage === 'error'
                ? 'border-rose-500/25 bg-rose-500/10 text-rose-500'
                : resumeUploadStage === 'ready'
                  ? 'border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-300'
                  : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)]'
            }`}
          >
            <span className="flex min-w-0 flex-1 items-start gap-2">
              <span className={`material-symbols-rounded mt-0.5 text-[15px] ${isResumeUploadBusy ? 'animate-spin' : ''}`} aria-hidden="true">
                {resumeUploadStage === 'error' ? 'error' : resumeUploadStage === 'ready' ? 'check_circle' : 'progress_activity'}
              </span>
              <span className="min-w-0 flex-1">{resumeUploadMessage}</span>
            </span>
            {resumeUploadStage === 'error' && searchParams.get('pendingResume') === '1' && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="ml-6 inline-flex min-h-11 w-[calc(100%-1.5rem)] items-center justify-center gap-2 rounded-[11px] border border-current/25 bg-[var(--card-bg)] px-3 font-semibold text-[var(--text-primary)] sm:ml-auto sm:w-auto"
              >
                <span className="material-symbols-rounded text-[16px]" aria-hidden="true">refresh</span>
                Retry saved resume
              </button>
            )}
          </div>
        )}
        {(isRecording || isTranscribing || audioRepliesEnabled) && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[10px] text-[var(--text-muted)]">
            {isRecording && <span className="font-semibold text-rose-500">Recording {recordingTime}s</span>}
            {isTranscribing && <span>Turning voice into text...</span>}
            {audioRepliesEnabled && <span>Sona replies with {SONA_VOICES.find((voice) => voice.id === selectedVoiceId)?.label || 'Nova'} voice</span>}
          </div>
        )}
        <p className="text-[10px] text-[var(--text-muted)] mt-2 text-center">
          Sona can make mistakes. Always verify important career decisions.
        </p>
      </div>
    </div>
  );

  return (
    <div className="mobile-app-content flex h-[calc(100dvh-var(--mobile-appbar-height,0px)-0.75rem)] lg:h-dvh" style={{ background: isLight ? '#F8FAFC' : '#060608' }}>

      {/* ═══ CONVERSATION SIDEBAR (mobile overlay + desktop panel) ═══ */}
      <AnimatePresence>
        {showSidebar && (
          <>
            {/* Backdrop (mobile) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40 lg:hidden"
              onClick={() => setShowSidebar(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed lg:relative z-50 w-[280px] h-full flex flex-col border-r shrink-0"
              style={{
                background: isLight ? '#fff' : '#0c0c10',
                borderColor: isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)',
              }}
            >
              {/* Sidebar header */}
              <div
                className="flex items-center justify-between px-4 py-3 border-b shrink-0"
                style={{ borderColor: isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)' }}
              >
                <span className="text-sm font-semibold text-[var(--text-primary)]">History</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={startNewConversation}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
                    title="New conversation"
                  >
                    <span className="material-symbols-rounded text-[18px] text-[var(--text-secondary)]">add</span>
                  </button>
                  <button
                    onClick={() => setShowSidebar(false)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors lg:hidden"
                  >
                    <span className="material-symbols-rounded text-[18px] text-[var(--text-secondary)]">close</span>
                  </button>
                </div>
              </div>

              {/* Conversation list */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {conversations.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)] text-center py-8">No conversations yet</p>
                )}
                {conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                      conv.id === conversationId ? '' : 'hover:bg-[var(--bg-hover)]'
                    }`}
                    style={conv.id === conversationId ? {
                      background: `${pConfig.color}10`,
                      border: `1px solid ${pConfig.color}20`,
                    } : {}}
                  >
                    <p className="text-sm text-[var(--text-primary)] truncate">{conv.title}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{formatTimeAgo(conv.lastMessageAt)}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ MAIN CHAT AREA ═══ */}
      <div className="flex-1 flex flex-col min-w-0">

        <SuiteToolHeader
          tool="agent"
          title="Sona Agent"
          subtitle={activeResumeName ? `Using ${activeResumeName}` : 'Career Intelligence Agent'}
          className="m-3 mb-0 shrink-0 sm:m-4 sm:mb-0"
          titleClassName="!max-w-none !whitespace-nowrap"
          actionsClassName="lg:flex-none lg:max-w-full"
          meta={
            <>
              <span
                className="rounded-full px-2 py-1 text-[10px] font-medium"
                style={{ background: `${pConfig.color}15`, color: pConfig.color }}
              >
                {pConfig.label}
              </span>
              {tier !== 'studio' && tier !== 'god' && (
                <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-400">
                  {tier === 'pro' ? 'Manual scout' : '1 free scout'}
                </span>
              )}
            </>
          }
          actions={
            <>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
              aria-label="Toggle conversation history"
            >
              <span className="material-symbols-rounded text-[20px] text-[var(--text-secondary)]">menu</span>
            </button>
            <SonaMark size="xs" state={loading ? 'thinking' : input.trim() ? 'listening' : 'idle'} className="hidden sm:inline-flex" />
            {conversationId && (
              <button
                onClick={startNewConversation}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <span className="material-symbols-rounded text-[14px]">add</span>
                New
              </button>
            )}
            <a
              href="/suite/agent/quality"
              className="hidden items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors sm:flex"
            >
              <span className="material-symbols-rounded icon-current text-[14px]">monitoring</span>
              Quality
            </a>
            <a
              href="/suite/agent/stories"
              className="hidden items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors sm:flex"
            >
              <span className="material-symbols-rounded icon-current text-[14px]">auto_stories</span>
              Stories
            </a>
            <button
              onClick={() => setShowVoiceSettings(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors sm:px-3"
              aria-label="Open Sona voice settings"
            >
              <span className="material-symbols-rounded icon-current text-[16px]">{audioRepliesEnabled ? 'volume_up' : 'graphic_eq'}</span>
              Voice
              <span className="hidden rounded-full border border-[var(--border-subtle)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)] sm:inline">
                {SONA_VOICES.find((voice) => voice.id === selectedVoiceId)?.label || 'Nova'}
              </span>
            </button>
            <button
              onClick={() => setShowPersonalityPicker(true)}
              className="hidden items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors md:flex"
            >
              <span className="material-symbols-rounded icon-current text-[16px]">{pConfig.icon}</span>
              {pConfig.label}
              <span className="material-symbols-rounded text-[14px] opacity-50">expand_more</span>
            </button>
            <ResumeLibraryPicker
              onSelect={(rv: ResumeVersion) => {
                invalidateActivationProof();
                setActiveResumeId(rv.id);
                setActiveResumeName(rv.version_name);
              }}
              selectedId={activeResumeId}
              selectedName={activeResumeName}
              compact
              triggerLabel={activeResumeName ? 'Resume' : 'Resumes'}
            />
            </>
          }
        />

        {/* ═══ CHAT AREA ═══ */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
          <div className="max-w-5xl mx-auto space-y-4">
            {showResumeUploadIntent && !isOpeningState && (
              <div
                className="flex flex-col gap-3 rounded-[22px] border p-4 sm:flex-row sm:items-center sm:justify-between"
                style={{
                  background: isLight ? 'rgba(239,246,255,0.9)' : 'rgba(59,130,246,0.08)',
                  borderColor: isLight ? 'rgba(37,99,235,0.18)' : 'rgba(96,165,250,0.22)',
                }}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300">
                    <span className="material-symbols-rounded text-[20px]">upload_file</span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Resume upload is ready</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                      Add your resume, then Sona can scout fit-ranked roles and prepare review-ready next steps.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openResumeUploadPicker}
                  disabled={loading || isResumeUploadBusy}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <span className={`material-symbols-rounded text-[18px] ${isResumeUploadBusy ? 'animate-spin' : ''}`}>{isResumeUploadBusy ? 'progress_activity' : 'upload_file'}</span>
                  {isResumeUploadBusy ? 'Uploading...' : 'Upload resume'}
                </button>
              </div>
            )}

            {/* Empty state */}
            {messages.length === 0 && !gated && !loadingHistory && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="py-4 sm:py-6 lg:py-12"
              >
                <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                  <section
                    className="rounded-[24px] border p-4 sm:rounded-[28px] sm:p-8"
                    style={{
                      background: isLight ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.035)',
                      borderColor: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)',
                      boxShadow: isLight ? '0 24px 80px rgba(15,23,42,0.08)' : '0 24px 80px rgba(0,0,0,0.28)',
                    }}
                  >
                    <div className="flex items-start gap-4">
                        <SonaMark size="sm" state="idle" className="sm:hidden" />
                        <SonaMark size="md" state="idle" className="hidden sm:inline-flex" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-muted)]">Sona Agent</p>
                        <h2 className="mt-2 text-[1.35rem] font-semibold leading-tight tracking-tight text-[var(--text-primary)] sm:text-3xl">
                          {conversationId
                            ? 'Continue this conversation'
                            : showResumeUploadIntent ? 'Upload your resume. Sona will scout from it.'
                            : personality === 'coach' ? 'Your career strategy room is ready.'
                            : personality === 'professional' ? 'Career intelligence ready.'
                            : 'Direct mode. Pick the outcome.'}
                        </h2>
                        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
                          {conversationId
                            ? 'Your previous context is loaded.'
                            : showResumeUploadIntent ? 'Add your resume as source context, set the role target, then let Sona prepare fit-ranked job picks for review.'
                            : 'Resume context, search strategy, applications, interview prep, negotiation, and follow-through in one place.'}
                        </p>
                      </div>
                    </div>

                    {!conversationId && (
                      <>
                      {shouldShowResumeSourcePrompt && (
                        <div
                          className={`${resumeSourcePromptMode === 'mobile' ? 'lg:hidden' : ''} mt-4 rounded-[20px] border p-3 sm:p-4`}
                          style={{
                            background: isLight ? 'rgba(239,246,255,0.72)' : 'rgba(59,130,246,0.08)',
                            borderColor: isLight ? 'rgba(37,99,235,0.2)' : 'rgba(96,165,250,0.24)',
                          }}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300">
                                <span className="material-symbols-rounded text-[20px]">upload_file</span>
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[var(--text-primary)]">Resume source first</p>
                                <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">
                                  Sona uses your file before ranking roles or drafting packets.
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={openResumeUploadPicker}
                              disabled={loading || isResumeUploadBusy}
                              className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
                            >
                              <span className={`material-symbols-rounded text-[18px] ${isResumeUploadBusy ? 'animate-spin' : ''}`}>
                                {isResumeUploadBusy ? 'progress_activity' : 'upload_file'}
                              </span>
                              {isResumeUploadBusy ? 'Uploading...' : 'Upload resume'}
                            </button>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-1.5 text-[11px] sm:gap-2 sm:text-xs">
                            {[
                              'Truth locked',
                              'Ranked picks',
                              'Review first',
                            ].map((item) => (
                              <div
                                key={item}
                                className="flex min-h-10 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-center text-[var(--text-secondary)] sm:min-h-9 sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left"
                                style={{
                                  background: isLight ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.035)',
                                  borderColor: isLight ? 'rgba(37,99,235,0.14)' : 'rgba(96,165,250,0.16)',
                                }}
                              >
                                <span className="material-symbols-rounded text-[14px] text-blue-600 dark:text-blue-300">verified</span>
                                <span className="min-w-0 leading-3.5 sm:leading-4">{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <form
                        id="sona-target-brief"
                        className={`${showResumeUploadIntent ? 'mt-3 sm:mt-4' : resumeSourcePromptMode === 'mobile' ? 'mt-3 sm:mt-4 lg:mt-6' : 'mt-4 sm:mt-6'} scroll-mt-24 rounded-[20px] border p-3 sm:p-4`}
                        style={{
                          background: isLight ? 'rgba(248,250,252,0.88)' : 'rgba(255,255,255,0.035)',
                          borderColor: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)',
                        }}
                        onSubmit={(event) => {
                          event.preventDefault();
                          submitTargetBrief();
                        }}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Target brief</p>
                            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">Tell Sona what job to scout first.</p>
                          </div>
                          <button
                            type="button"
                            onClick={useExampleTarget}
                            className="inline-flex min-h-9 items-center justify-center rounded-full border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)]"
                          >
                            Use $120k hybrid example
                          </button>
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,0.55fr)]">
                          <label className="min-w-0">
                            <span className="sr-only">Target role</span>
                            <input
                              id="sona-target-role"
                              value={targetRole}
                              onChange={(event) => {
                                invalidateActivationProof();
                                setTargetRole(event.target.value);
                                if (targetBriefError) setTargetBriefError('');
                              }}
                              className="min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 text-base text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-blue-500 sm:text-sm"
                              placeholder="Target role"
                            />
                          </label>
                          <label className="min-w-0">
                            <span className="sr-only">Salary target</span>
                            <input
                              value={targetSalary}
                              onChange={(event) => {
                                invalidateActivationProof();
                                setTargetSalary(event.target.value);
                              }}
                              className="min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 text-base text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-blue-500 sm:text-sm"
                              placeholder="$120k"
                              inputMode="text"
                            />
                          </label>
                          <label className="min-w-0 sm:col-span-2">
                            <span className="sr-only">Location</span>
                            <input
                              value={targetLocation}
                              onChange={(event) => {
                                invalidateActivationProof();
                                setTargetLocation(event.target.value);
                                if (targetBriefError) setTargetBriefError('');
                              }}
                              className="min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 text-base text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-blue-500 sm:text-sm"
                              placeholder="City, state, or remote"
                            />
                          </label>
                        </div>

                        {targetBriefError && (
                          <p role="alert" className="mt-2 text-xs leading-5 text-rose-500">
                            {targetBriefError}
                          </p>
                        )}

                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0" aria-label="Work mode">
                            {([
                              ['hybrid', 'Hybrid'],
                              ['remote', 'Remote'],
                              ['onsite', 'On-site'],
                              ['any', 'Any'],
                            ] as Array<[TargetWorkMode, string]>).map(([value, label]) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => {
                                  invalidateActivationProof();
                                  setTargetWorkMode(value);
                                }}
                                aria-pressed={targetWorkMode === value}
                                className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold transition ${
                                  targetWorkMode === value
                                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-300'
                                    : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text-primary)]'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                            <button
                              type="submit"
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={isActivationChecking || ((!targetRole.trim() || !targetLocation.trim()) && !activeResumeId)}
                          >
                            <span className={`material-symbols-rounded text-[18px] ${isActivationChecking ? 'animate-spin' : ''}`}>{isActivationChecking ? 'progress_activity' : 'preview'}</span>
                            {isActivationChecking ? 'Checking path...' : 'Preview scout'}
                          </button>
                        </div>

                        <SonaActivationProofPanel
                          state={activationProofState}
                          launching={loading || isResumeUploadBusy}
                          onLaunch={launchActivationProof}
                          onRetry={retryActivationProof}
                          onEditTarget={editActivationTarget}
                          onUploadResume={openResumeUploadPicker}
                        />
                      </form>

                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {visibleSuggestedPrompts.map((p) => (
                          <button
                            key={p.label}
                            onClick={() => {
                              if (p.action === 'resumeUpload') {
                                openResumeUploadPicker();
                                return;
                              }
                              sendMessage(p.prompt);
                            }}
                            disabled={p.action === 'resumeUpload' && (loading || isResumeUploadBusy)}
                            className={`group min-h-[112px] flex-col justify-between rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none ${p.action === 'resumeUpload' && resumeSourcePromptMode === 'mobile' ? 'hidden lg:flex' : 'flex'}`}
                            style={{
                              background: isLight ? 'rgba(248,250,252,0.82)' : 'rgba(255,255,255,0.035)',
                              borderColor: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)',
                            }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span
                                className="icon-shell-neutral flex h-9 w-9 items-center justify-center rounded-xl border"
                              >
                                <span className="material-symbols-rounded icon-neutral text-[19px]">{p.icon}</span>
                              </span>
                              <span className="material-symbols-rounded text-[16px] text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5">
                                {p.action === 'resumeUpload' && isResumeUploadBusy ? 'progress_activity' : p.action === 'resumeUpload' ? 'upload' : 'arrow_forward'}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-[var(--text-primary)]">{p.label}</p>
                              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                                {p.action === 'resumeUpload' && isResumeUploadBusy ? 'Upload in progress' : p.detail}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                      </>
                    )}
                  </section>

                  <aside className="space-y-4">
                    <div
                      className="rounded-2xl border p-4"
                      style={{
                        background: isLight ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.035)',
                        borderColor: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Active Context</p>
                          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{activeResumeName || 'No resume selected'}</p>
                        </div>
                        <span className="material-symbols-rounded icon-neutral text-[20px]">description</span>
                      </div>
                      {resumeSourcePromptMode !== 'all' && (
                        <button
                          type="button"
                          onClick={openResumeUploadPicker}
                          disabled={loading || isResumeUploadBusy}
                          className={`mt-3 min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)] disabled:cursor-not-allowed disabled:opacity-60 ${resumeSourcePromptMode === 'mobile' ? 'hidden lg:inline-flex' : 'inline-flex'}`}
                        >
                          <span className={`material-symbols-rounded text-[16px] ${isResumeUploadBusy ? 'animate-spin' : ''}`}>{isResumeUploadBusy ? 'progress_activity' : 'upload_file'}</span>
                          {isResumeUploadBusy ? 'Uploading resume...' : activeResumeName ? 'Upload another resume' : 'Upload resume for Sona'}
                        </button>
                      )}
                    </div>

                    <div
                      className="rounded-2xl border p-4"
                      style={{
                        background: isLight ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.035)',
                        borderColor: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Operating Mode</p>
                      <button
                        onClick={() => setShowPersonalityPicker(true)}
                        className="mt-3 w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
                        style={{ borderColor: `${pConfig.color}22`, background: `${pConfig.color}08` }}
                      >
                        <span className="material-symbols-rounded text-[19px]" style={{ color: pConfig.color }}>{pConfig.icon}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[var(--text-primary)]">{pConfig.label}</span>
                          <span className="block text-xs text-[var(--text-muted)]">{pConfig.desc}</span>
                        </span>
                        <span className="material-symbols-rounded ml-auto text-[16px] text-[var(--text-muted)]">expand_more</span>
                      </button>
                    </div>

                    <div
                      className="rounded-2xl border p-4"
                      style={{
                        background: isLight ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.035)',
                        borderColor: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Career Stack</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {[
                          { label: 'Quality', icon: 'monitoring', href: '/suite/agent/quality' },
                          { label: 'Stories', icon: 'auto_stories', href: '/suite/agent/stories' },
                          { label: 'Queue', icon: 'smart_toy', href: '/suite/agent/queue' },
                          { label: 'Resume', icon: 'description', href: '/suite/resume' },
                        ].map(item => (
                          <a
                            key={item.label}
                            href={item.href}
                            className="rounded-xl border px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            style={{ borderColor: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)' }}
                          >
                            <span className="material-symbols-rounded icon-current mr-1 align-middle text-[15px]">{item.icon}</span>
                            {item.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  </aside>
                </div>
                {renderComposer(true)}
              </motion.div>
            )}

            {/* Messages */}
            <AnimatePresence>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <SonaMark
                      size="xs"
                      state={speakingIdx === i ? 'responding' : 'idle'}
                      className="mb-1 hidden shrink-0 sm:inline-flex"
                    />
                  )}
                  <div
                    className={`group max-w-[91%] px-4 py-3 text-sm leading-relaxed shadow-sm sm:max-w-[76%] ${
                      msg.role === 'user'
                        ? 'rounded-[22px] rounded-br-md text-white'
                        : 'rounded-[22px] rounded-bl-md border text-[var(--text-primary)]'
                    }`}
                    style={
                      msg.role === 'user'
                        ? { background: pConfig.color, borderColor: 'transparent' }
                        : {
                            background: isLight ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.055)',
                            borderColor: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)',
                          }
                    }
                  >
                    {msg.role === 'assistant' && (
                      <div className="mb-2 flex items-center gap-1.5">
                        <SonaMark size="xs" state={speakingIdx === i ? 'responding' : 'idle'} className="sm:hidden" />
                        <span className="text-[11px] font-semibold" style={{ color: pConfig.color }}>Sona</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); speakMessage(msg.content, i); }}
                          className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                          title={speakingIdx === i ? 'Stop speaking' : 'Read aloud'}
                          aria-label={speakingIdx === i ? 'Stop speaking Sona message' : 'Read Sona message aloud'}
                        >
                          <span
                            className={`material-symbols-rounded text-[14px] ${speakingIdx === i ? 'text-rose-400' : 'text-[var(--text-muted)]'}`}
                          >
                            {speakingIdx === i ? 'stop_circle' : 'volume_up'}
                          </span>
                        </button>
                      </div>
                    )}
                    {msg.role === 'assistant' && msg.actionPlan && (
                      <div
                        className="mb-3 rounded-[16px] border px-3 py-2 text-xs"
                        style={{ borderColor: `${pConfig.color}22`, background: `${pConfig.color}08` }}
                      >
                        <div className="font-semibold" style={{ color: pConfig.color }}>{formatSonaPlanTitle(msg.actionPlan)}</div>
                        <div className="mt-1 text-[var(--text-secondary)]">{formatSonaPlanSteps(msg.actionPlan)}</div>
                        {msg.actionPlan.approvalRequired && (
                          <div className="mt-1 text-[var(--text-muted)]">Review required before any external action.</div>
                        )}
                      </div>
                    )}
                    <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                      {msg.role === 'assistant' ? <SonaMessageContent text={msg.content} /> : <span className="whitespace-pre-wrap">{msg.content}</span>}
                    </div>
                    {msg.role === 'assistant' && msg.recovery && (
                      <div className="mt-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3" role="alert">
                        <p className="text-xs font-semibold text-[var(--text-primary)]">{msg.recovery.title}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Next: {msg.recovery.nextAction}</p>
                        {msg.recovery.action !== 'none' && (
                          <button
                            type="button"
                            onClick={() => handleRecoveryAction(msg.recovery!)}
                            className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
                          >
                            <span className="material-symbols-rounded text-[16px]" aria-hidden="true">
                              {msg.recovery.action === 'retry' ? 'refresh' : msg.recovery.action === 'upload_resume' ? 'upload_file' : msg.recovery.action === 'open_queue' ? 'smart_toy' : 'edit'}
                            </span>
                            {msg.recovery.nextAction}
                          </button>
                        )}
                      </div>
                    )}
                    {msg.role === 'assistant' && msg.harnessResult && (
                      <SonaHarnessResultCard
                        result={msg.harnessResult}
                        accentColor={pConfig.color}
                        isLight={isLight}
                      />
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Loading indicator — Cinematic Thinking Animation */}
            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <SonaThinkingTile
                  variant="agent"
                  accentColor={pConfig.color}
                  icon={pConfig.icon}
                  title="Sona is thinking"
                  description="Checking your context, tools, and next best move."
                  activeStage="thinking"
                  stages={['Context', 'Tools', 'Reasoning', 'Reply']}
                  compact
                  className="min-w-[240px]"
                />
              </motion.div>
            )}

            {/* Gating wall */}
            {gated && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 rounded-2xl text-center"
                style={{
                  background: isLight ? 'rgba(244,63,94,0.05)' : 'rgba(244,63,94,0.08)',
                  border: '1px solid rgba(244,63,94,0.2)',
                }}
              >
                <SonaMark size="md" state="locked" className="mx-auto mb-3" />
                <p className="text-sm text-[var(--text-primary)] font-medium mb-1">Sona is Resting</p>
                <p className="text-xs text-[var(--text-secondary)] mb-4">{gated.message}</p>
                <a
                  href="/suite/upgrade"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' }}
                >
                  <span className="material-symbols-rounded text-[16px]">bolt</span>
                  Unlock Sona
                </a>
              </motion.div>
            )}
          </div>
        </div>

        {/* ═══ INPUT ═══ */}
        {!isOpeningState && renderComposer()}
      </div>

      {/* ═══ PERSONALITY PICKER MODAL ═══ */}
      <AnimatePresence>
        {showPersonalityPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-start justify-center bg-black/45 p-4 pt-[calc(env(safe-area-inset-top,0px)+4.5rem)] sm:items-center sm:pt-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              className="w-full max-w-sm rounded-[20px] p-5 sm:max-w-md sm:p-6"
              style={{
                background: isLight ? '#fff' : '#111114',
                border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              <h2 className="mb-1 text-lg font-semibold text-[var(--text-primary)]">Choose Sona&apos;s personality</h2>
              <p className="mb-4 text-xs leading-5 text-[var(--text-secondary)]">Pick the tone for this workspace. You can change it from the header later.</p>

              <div className="space-y-2.5">
                {(Object.entries(PERSONALITY_CONFIG) as [Personality, typeof PERSONALITY_CONFIG[Personality]][]).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => selectPersonality(key)}
                    className="flex min-h-[72px] w-full items-center gap-3 rounded-[14px] p-3 text-left transition-transform hover:scale-[1.01]"
                    style={{
                      background: personality === key ? `${config.color}10` : isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                      border: `2px solid ${personality === key ? config.color : isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <div
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${config.color}15`, color: config.color }}
                    >
                      <span className="material-symbols-rounded text-[22px]">{config.icon}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{config.label}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{config.desc}</p>
                    </div>
                    {personality === key && (
                      <span className="material-symbols-rounded ml-auto text-[20px]" style={{ color: config.color }}>check_circle</span>
                    )}
                  </button>
                ))}
              </div>

              {messages.length > 0 && (
                <button
                  onClick={() => setShowPersonalityPicker(false)}
                  className="w-full mt-4 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Cancel
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ VOICE SETTINGS MODAL ═══ */}
      <AnimatePresence>
        {showVoiceSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-start justify-center bg-black/45 p-4 pt-[calc(env(safe-area-inset-top,0px)+4.5rem)] sm:items-center sm:pt-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowVoiceSettings(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.96, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              className="max-h-[calc(100dvh-6rem)] w-full max-w-lg overflow-y-auto rounded-[22px] p-5 sm:p-6"
              style={{
                background: isLight ? '#fff' : '#111114',
                border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Sona audio</p>
                  <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Choose how Sona speaks</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    Use the mic to talk about your resume. Turn on spoken replies when you want a hands-free career strategy session.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVoiceSettings(false)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  aria-label="Close voice settings"
                >
                  <span className="material-symbols-rounded text-[19px]">close</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => updateAudioReplies(!audioRepliesEnabled)}
                className="mt-5 flex w-full items-center justify-between gap-4 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 text-left transition hover:border-[var(--border)]"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">Spoken replies</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">Sona reads new answers aloud after she responds.</span>
                </span>
                <span
                  className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${audioRepliesEnabled ? 'bg-blue-500' : 'bg-[var(--bg-hover)]'}`}
                  aria-hidden="true"
                >
                  <span className={`h-5 w-5 rounded-full bg-white transition ${audioRepliesEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </span>
              </button>

              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">Voice</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SONA_VOICES.map((voice) => {
                    const selected = selectedVoiceId === voice.id;
                    return (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => updateSelectedVoice(voice.id)}
                        className={`min-h-[72px] rounded-[16px] border p-3 text-left transition ${
                          selected
                            ? 'border-blue-500/45 bg-blue-500/10'
                            : 'border-[var(--border-subtle)] bg-[var(--card-bg)] hover:border-[var(--border)]'
                        }`}
                        aria-pressed={selected}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">{voice.label}</span>
                          {selected && <span className="material-symbols-rounded text-[17px] text-blue-500">radio_button_checked</span>}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{voice.tone}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    updateAudioReplies(true);
                    speakMessage('I can talk through your resume, scout jobs, and prepare the next move for your review.', -1);
                  }}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
                >
                  <span className="material-symbols-rounded text-[18px]">play_arrow</span>
                  Test voice
                </button>
                <button
                  type="button"
                  onClick={() => setShowVoiceSettings(false)}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth Modal */}
      {showAuth && (
        <AuthModal
          mode={showAuth}
          onClose={() => setShowAuth(null)}
          onSwitchMode={() => setShowAuth(showAuth === 'login' ? 'signup' : 'login')}
        />
      )}
    </div>
  );
}
