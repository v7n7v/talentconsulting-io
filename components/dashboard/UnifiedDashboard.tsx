'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import DashboardToolWorkbench, { dashboardPreviewTools } from '@/components/dashboard/DashboardToolWorkbench';
import DashboardActionInbox from '@/components/dashboard/DashboardActionInbox';
import JobFeedWidget from '@/components/JobFeedWidget';
import { TalentConsultingMark, TalentConsultingWordmark } from '@/components/BrandLogo';
import { PlanStatusStrip } from '@/components/plan/PlanIdentity';
import { SuitePanel, SuiteToolIcon, SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import { authFetch } from '@/lib/auth-fetch';
import { analytics } from '@/lib/analytics';
import type { DashboardMode, DashboardToolId } from '@/lib/dashboard-types';
import { getPlanIdentity } from '@/lib/plan-identity';
import { RESUME_UPLOAD_LIMITS, ResumeUploadError, uploadAndParseResume, validateResumeFile } from '@/lib/resume-upload';
import { stagePendingSonaResume } from '@/lib/sona/pending-resume-handoff';
import { useUserTier } from '@/hooks/use-user-tier';

interface UnifiedDashboardProps {
  mode: DashboardMode;
  user: User | null;
  activeTool: DashboardToolId;
  onShowLogin: () => void;
  onShowSignup: (postAuthRedirect?: string | null) => void;
  showPublicNav?: boolean;
}

interface DashboardSnapshot {
  vaultTotal: number | null;
  vaultBridge: number | null;
  debriefs: number | null;
  intelligenceScore: number | null;
  loading: boolean;
}

const toolRoutes: Partial<Record<DashboardToolId, string>> = {
  'resume-check': '/suite/resume',
  'ats-analyzer': '/suite/ats-analyzer',
  'writing-trust': '/suite/gallery',
  'quick-polish': '/suite/gallery',
};

const guestSignals = [
  { label: 'Free checks', value: '5', detail: 'resume, ATS, match, writing, polish', icon: 'widgets' },
  { label: 'Review gates', value: '0', detail: 'blind auto-submit defaults', icon: 'verified_user' },
  { label: 'Next action', value: '1', detail: 'recommended move at a time', icon: 'route' },
];

const jobSystemModules = [
  {
    title: 'Job Search Intelligence',
    description: 'Match roles against honest proof, market signals, and your saved search direction.',
    icon: 'travel_explore',
  },
  {
    title: 'Resume Builder',
    description: 'Turn drafts into ATS-readable proof without losing your real voice or facts.',
    icon: 'description',
  },
  {
    title: 'Writing Assistant',
    description: 'Polish cover letters, recruiter replies, and LinkedIn copy with trust checks built in.',
    icon: 'edit_note',
  },
  {
    title: 'Application Operations',
    description: 'Track follow-ups, interviews, offers, stale applications, and the work Sona prepares.',
    icon: 'pending_actions',
  },
  {
    title: 'Interview Prep',
    description: 'Convert resume proof into stories, practice loops, and company-specific prep.',
    icon: 'interpreter_mode',
  },
  {
    title: 'Sona Assistant',
    description: 'Upload a resume, set the target, and let Sona scout job picks you can review before applying.',
    icon: 'auto_awesome',
  },
];

const guestWorkflow = [
  { label: 'Paste', body: 'Use a free preview before you create an account.' },
  { label: 'Improve', body: 'See proof gaps, language risks, and the next best edit.' },
  { label: 'Save', body: 'Sign in only when history, exports, and Sona memory matter.' },
];

const pipelinePreview = [
  { stage: 'Wishlist', count: 12, tone: 'bg-sky-500' },
  { stage: 'Preparing', count: 8, tone: 'bg-amber-500' },
  { stage: 'Applied', count: 24, tone: 'bg-blue-500' },
  { stage: 'Interview', count: 5, tone: 'bg-violet-500' },
  { stage: 'Offer', count: 2, tone: 'bg-blue-500' },
];

const freeToolHighlights: Array<{ id: DashboardToolId; label: string; icon: string; note: string }> = [
  { id: 'job-match', label: 'Job Match', icon: 'radar', note: 'Fit and gaps' },
  { id: 'resume-check', label: 'Resume Check', icon: 'fact_check', note: 'ATS proof' },
  { id: 'ats-analyzer', label: 'ATS Score', icon: 'scanner', note: 'Parser risk' },
  { id: 'writing-trust', label: 'Writing Trust', icon: 'edit_note', note: 'Human polish' },
  { id: 'quick-polish', label: 'Quick Polish', icon: 'auto_fix_high', note: 'Fast rewrite' },
];

const reviewControls = [
  'Upload a resume once',
  'Sona scouts and ranks roles',
  'You approve every application',
];

const heroBadges = [
  'Resume-first agent search',
  'No auto-apply',
  'Review-ready job picks',
  'Review before apply',
];

interface CareerReadinessProfile {
  score: number;
  status: string;
  unit: string;
  caption: string;
  compareDetail: string;
  improveTitle: string;
  improveDetail: string;
  prepareTitle: string;
  prepareDetail: string;
}

const careerReadinessProfiles: Record<DashboardToolId, CareerReadinessProfile> = {
  'job-match': {
    score: 92,
    status: 'Ready',
    unit: 'fit',
    caption: '92 fit means Sona has enough resume evidence to scout roles, explain fit, and prepare review-ready next steps.',
    compareDetail: 'Upload a resume, set a target, and Sona compares role signals against real proof.',
    improveTitle: 'Close proof gaps',
    improveDetail: 'Sona highlights missing evidence instead of guessing or changing facts.',
    prepareTitle: 'Scout queue',
    prepareDetail: 'Sona queues the best job picks for review before any application moves forward.',
  },
  'resume-check': {
    score: 86,
    status: 'Strong',
    unit: 'ready',
    caption: '86 ready means the resume structure is close. Run the check to tighten proof, keywords, and clarity.',
    compareDetail: 'Sections, bullets, and recruiter-readable proof are checked before saving a version.',
    improveTitle: 'Sharper bullets',
    improveDetail: 'Strengthen measurable outcomes while keeping education, titles, dates, and employers intact.',
    prepareTitle: 'Save version',
    prepareDetail: 'Create an account when you want history, exports, and resume version control.',
  },
  'ats-analyzer': {
    score: 78,
    status: 'Review',
    unit: 'ATS',
    caption: '78 ATS means the draft is usable, but parsing risk and missing role signals still need review.',
    compareDetail: 'ATS structure, section labels, and keyword coverage are checked before export.',
    improveTitle: 'Parser cleanup',
    improveDetail: 'Fix section naming, missing skills, and formatting risks that can weaken screening.',
    prepareTitle: 'Export safely',
    prepareDetail: 'Use the full analyzer before sending a resume into high-stakes applications.',
  },
  'writing-trust': {
    score: 88,
    status: 'Clean',
    unit: 'trust',
    caption: '88 trust means the writing sounds credible, with only light generic phrasing to polish.',
    compareDetail: 'Career writing is scanned for generic AI patterns and vague credibility signals.',
    improveTitle: 'Human polish',
    improveDetail: 'Make language more specific without adding claims the user did not provide.',
    prepareTitle: 'Review before send',
    prepareDetail: 'Use the result as an editing signal, not as proof of authorship or detector certainty.',
  },
  'quick-polish': {
    score: 74,
    status: 'Polish',
    unit: 'clear',
    caption: '74 clear means the draft has usable intent, but rhythm, specificity, and confidence can improve.',
    compareDetail: 'Short resume bullets, recruiter replies, and cover letter lines get a fast clarity pass.',
    improveTitle: 'Tighter wording',
    improveDetail: 'Remove filler, strengthen verbs, and preserve the original meaning.',
    prepareTitle: 'Next draft',
    prepareDetail: 'Run a quick polish, then review every fact before copying the result.',
  },
};

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} aria-hidden="true">{name}</span>;
}

function AnimatedCareerReadinessGauge({
  score = 92,
  status = 'Ready',
  label = 'Career readiness',
  unit = 'fit',
  caption = 'Example score. Real results appear when the user runs a check.',
}: {
  score?: number;
  status?: string;
  label?: string;
  unit?: string;
  caption?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const boundedScore = Math.min(100, Math.max(0, Math.round(score)));
  const scoreValue = useMotionValue(prefersReducedMotion ? boundedScore : 0);
  const [displayScore, setDisplayScore] = useState(() => (prefersReducedMotion ? boundedScore : 0));

  useEffect(() => {
    if (prefersReducedMotion) {
      scoreValue.set(boundedScore);
      setDisplayScore(boundedScore);
      return undefined;
    }

    const startScore = scoreValue.get();
    setDisplayScore(Math.round(startScore));

    const controls = animate(scoreValue, boundedScore, {
      duration: 0.95,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplayScore(Math.round(latest)),
      onComplete: () => setDisplayScore(boundedScore),
    });

    return () => controls.stop();
  }, [boundedScore, prefersReducedMotion, scoreValue]);

  return (
    <div
      className="border-t border-[var(--border-subtle)] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"
      role="meter"
      aria-label={`${label} score`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={boundedScore}
      aria-valuetext={`${boundedScore} ${unit}. ${caption}`}
    >
      <motion.span
        key={status}
        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 text-xs font-semibold text-blue-600 dark:text-blue-300"
        initial={prefersReducedMotion ? false : { opacity: 0.84, scale: 0.97 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, scale: [0.97, 1.025, 1] }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
      >
        <motion.span
          className="grid h-5 w-5 place-items-center rounded-full border border-current/30"
          aria-hidden="true"
          initial={prefersReducedMotion ? false : { boxShadow: '0 0 0 0 rgba(59, 130, 246, 0.28)' }}
          animate={prefersReducedMotion ? undefined : { boxShadow: ['0 0 0 0 rgba(59, 130, 246, 0.28)', '0 0 0 8px rgba(59, 130, 246, 0)', '0 0 0 0 rgba(59, 130, 246, 0)'] }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.25 }}
        >
          <Icon name="radio_button_checked" className="text-[14px]" />
        </motion.span>
        {status}
      </motion.span>

      <p className="mt-5 text-xs font-semibold text-[var(--text-muted)]">{label}</p>
      <div className="mt-3 flex min-h-[52px] items-end gap-2">
        <span className="inline-block min-w-[3.35rem] text-5xl font-medium leading-none tracking-[-0.04em] text-[var(--text-primary)] tabular-nums">
          {displayScore}
        </span>
        <span className="pb-1.5 text-sm font-semibold text-[var(--text-muted)]">{unit}</span>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--bg-hover)]" aria-hidden="true">
        <motion.div
          className="h-full overflow-hidden rounded-full bg-blue-500"
          initial={prefersReducedMotion ? false : { width: '0%' }}
          animate={{ width: `${boundedScore}%` }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={caption}
          className="mt-3 text-xs leading-5 text-[var(--text-muted)]"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0, y: -3 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {caption}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function getShortGreeting(user: User | null) {
  const rawName = user?.displayName || user?.email?.split('@')[0];
  const firstName = rawName?.trim().split(/\s+/)[0];
  if (!firstName) return 'Welcome back';
  return `Welcome back, ${firstName}`;
}

function CompactSignal({
  title,
  value,
  icon,
  caption,
}: {
  title: string;
  value: string | number;
  icon: string;
  caption: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
      <SuiteToolIcon icon={icon} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="truncate text-xs leading-5 text-[var(--text-muted)]">{caption}</p>
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
      <div className="h-3 w-28 animate-pulse rounded-full bg-[var(--bg-hover)]" />
      <div className="mt-2 h-2.5 w-40 animate-pulse rounded-full bg-[var(--bg-hover)]" />
    </div>
  );
}

function SignalCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
}) {
  return (
    <div className="min-w-0 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 shadow-sm">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
          <span className="mt-1 block text-2xl font-bold tabular-nums text-[var(--text-primary)]">{value}</span>
        </span>
        <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-blue-500/10 text-blue-600 dark:text-blue-300">
          <Icon name={icon} className="text-[19px]" />
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{detail}</p>
    </div>
  );
}

function ModuleCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <article className="group min-w-0 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-500/30 hover:shadow-md">
      <div className="flex min-w-0 items-start gap-3">
        <SuiteToolIcon icon={icon} size="sm" className="group-hover:border-blue-500/30 group-hover:bg-blue-500/10" iconClassName="group-hover:text-blue-600 dark:group-hover:text-blue-300" />
        <div className="min-w-0">
          <h3 className="premium-heading-wrap text-sm font-bold text-[var(--text-primary)]">{title}</h3>
          <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
    </article>
  );
}

function PipelinePreview() {
  const max = Math.max(...pipelinePreview.map((item) => item.count));

  return (
    <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Application Pipeline</p>
          <h3 className="mt-1 text-base font-bold text-[var(--text-primary)]">Every role has a next move.</h3>
        </div>
        <Icon name="bar_chart" className="text-[22px] text-[var(--text-muted)]" />
      </div>
      <div className="mt-4 space-y-3">
        {pipelinePreview.map((item) => (
          <div key={item.stage} className="grid grid-cols-[88px_minmax(0,1fr)_32px] items-center gap-3">
            <span className="truncate text-xs font-medium text-[var(--text-secondary)]">{item.stage}</span>
            <span className="h-2 overflow-hidden rounded-full bg-[var(--bg-hover)]">
              <span className={`block h-full rounded-full ${item.tone}`} style={{ width: `${Math.max(16, (item.count / max) * 100)}%` }} />
            </span>
            <span className="text-right text-xs font-bold tabular-nums text-[var(--text-primary)]">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PublicLandingNav({
  mode,
  onShowLogin,
  onShowSignup,
  onOpenWorkspace,
	}: {
	  mode: DashboardMode;
	  onShowLogin: () => void;
	  onShowSignup: (postAuthRedirect?: string | null) => void;
	  onOpenWorkspace: () => void;
	}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--bg-deep)]/95 backdrop-blur">
      <div className="mx-auto flex min-h-[72px] w-full max-w-[1280px] items-center justify-between gap-4 px-4 md:px-6">
        <a href="/" className="flex min-w-0 items-center gap-3" aria-label="TalentConsulting.io home">
          <TalentConsultingMark className="h-9 w-9 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
          <TalentConsultingWordmark className="w-[188px] max-w-[48vw]" />
        </a>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-[var(--text-secondary)] lg:flex" aria-label="Primary">
          <a className="transition hover:text-[var(--text-primary)]" href="#product">Product</a>
          <a className="transition hover:text-[var(--text-primary)]" href="#free-tools">Free tools</a>
          <a className="transition hover:text-[var(--text-primary)]" href="/templates">Templates</a>
          <a className="transition hover:text-[var(--text-primary)]" href="/for-teams">For teams</a>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {mode === 'authenticated' ? (
            <button
              type="button"
              onClick={onOpenWorkspace}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 text-sm font-bold text-[var(--bg-deep)] transition hover:opacity-90"
            >
              <Icon name="dashboard" className="text-[17px]" />
              Workspace
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onShowLogin}
                className="hidden min-h-10 items-center justify-center rounded-[12px] px-3 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] sm:inline-flex"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => onShowSignup()}
                className="inline-flex min-h-10 items-center justify-center rounded-[12px] bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-on)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
              >
                Start free
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function CommandCenterPreview({
  activeTool,
  activeToolLabel,
  snapshot,
  mode,
  onUseFreePreview,
}: {
  activeTool: DashboardToolId;
  activeToolLabel: string;
  snapshot: DashboardSnapshot;
  mode: DashboardMode;
  onUseFreePreview: () => void;
}) {
  const resumeChecks = ['Evidence preserved', 'Keyword gaps', 'Role alignment'];
  const readinessProfile = careerReadinessProfiles[activeTool];
  const jobs = [
    { role: 'Product manager', stage: 'Prepare', match: '92%', next: 'Tailor resume' },
    { role: 'Operations lead', stage: 'Follow-up', match: '84%', next: 'Send note' },
    { role: 'Customer success', stage: 'Interview', match: '78%', next: 'Practice stories' },
  ];

  if (mode === 'guest') {
    return (
      <aside id="product" className="h-full p-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Live career check</p>
            <h2 className="premium-heading-wrap mt-1 text-xl font-semibold leading-tight tracking-[-0.01em] text-[var(--text-primary)]">
              Resume in. Job picks out. You stay in control.
            </h2>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_168px] lg:items-start">
          <div className="min-w-0 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
            {[
              { label: 'Compare', value: activeToolLabel, detail: readinessProfile.compareDetail },
              { label: 'Improve', value: readinessProfile.improveTitle, detail: readinessProfile.improveDetail },
              { label: 'Prepare', value: readinessProfile.prepareTitle, detail: readinessProfile.prepareDetail },
            ].map((item) => (
              <div key={item.label} className="grid gap-2 py-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{item.label}</p>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{item.value}</p>
                  <p className="premium-copy-wrap mt-1 text-sm leading-6 text-[var(--text-secondary)]">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <AnimatedCareerReadinessGauge
            score={readinessProfile.score}
            status={readinessProfile.status}
            unit={readinessProfile.unit}
            caption={readinessProfile.caption}
          />
        </div>

        <button
          type="button"
          onClick={onUseFreePreview}
          className="mx-auto mt-5 flex min-h-12 w-full max-w-[280px] items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-6 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 sm:w-auto sm:min-w-[248px]"
        >
          <Icon name="work_history" className="text-[19px]" />
          Preview job matching
        </button>
      </aside>
    );
  }

  return (
    <div className="relative min-w-0 overflow-hidden rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card-bg)] shadow-sm" id="product">
      <div className="flex min-h-12 items-center gap-2.5 border-b border-[var(--border-subtle)] px-3">
        <TalentConsultingMark className="h-8 w-8 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-muted)]">
          <Icon name="search" className="text-[15px]" />
          <span className="truncate">Search jobs, resumes, applications, or ask Sona</span>
          <span className="ml-auto hidden rounded-md border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] sm:inline">Cmd K</span>
        </div>
      </div>

      <div className="grid min-w-0 gap-0 lg:grid-cols-[154px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[var(--border-subtle)] bg-[var(--bg-deep)]/35 p-2 lg:block">
          {[
            ['home', 'Command center'],
            ['description', 'Resume Builder'],
            ['radar', 'Job Search'],
            ['work', 'Applications'],
            ['interpreter_mode', 'Interview Prep'],
            ['auto_awesome', 'Sona'],
          ].map(([icon, label], index) => (
            <div
              key={label}
              className={`mb-1 flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-xs font-semibold ${index === 0 ? 'bg-blue-500/10 text-blue-500' : 'text-[var(--text-secondary)]'}`}
            >
              <Icon name={icon} className="text-[15px]" />
              <span className="truncate">{label}</span>
            </div>
          ))}
        </aside>

        <div className="min-w-0 p-2.5 md:p-3">
          <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_220px]">
            <div className="grid gap-2.5 md:grid-cols-2">
              <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Best match</p>
                    <h3 className="mt-1 text-base font-bold text-[var(--text-primary)]">{activeToolLabel}</h3>
                  </div>
                  <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-500">92%</span>
                </div>
                <div className="mt-4 space-y-2">
                  {['Skills', 'Experience', 'Role fit'].map((label, index) => (
                    <div key={label} className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 text-xs text-[var(--text-muted)]">
                      <span>{label}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-[var(--bg-hover)]">
                        <span className="block h-full rounded-full bg-blue-500" style={{ width: `${88 - index * 12}%` }} />
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Resume proof</p>
                <div className="mt-3 space-y-2">
                  {resumeChecks.map((item) => (
                    <div key={item} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-[var(--text-secondary)]">
                        <Icon name="check_circle" className="text-[16px] text-blue-500" />
                        <span className="truncate">{item}</span>
                      </span>
                      <Icon name="done" className="text-[16px] text-blue-500" />
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Application pipeline</p>
                  <span className="text-xs font-semibold text-[var(--text-muted)]">{mode === 'authenticated' ? `${snapshot.vaultTotal ?? 0} saved assets` : 'Free preview'}</span>
                </div>
                <div className="mt-3 divide-y divide-[var(--border-subtle)]">
                  {jobs.map((job) => (
                    <div key={job.role} className="grid grid-cols-[minmax(0,1fr)_82px_56px] items-center gap-3 py-2 text-xs">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[var(--text-primary)]">{job.role}</span>
                        <span className="block truncate text-[var(--text-muted)]">{job.next}</span>
                      </span>
                      <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-2 py-1 text-center font-semibold text-[var(--text-secondary)]">{job.stage}</span>
                      <span className="text-right font-bold tabular-nums text-blue-500">{job.match}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <aside className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-[var(--text-primary)]">Sona next</p>
                <Icon name="auto_awesome" className="text-[18px] text-blue-500" />
              </div>
              <div className="mt-3 rounded-[14px] border border-blue-500/20 bg-blue-500/[0.07] p-3">
                <p className="text-sm font-bold leading-snug text-[var(--text-primary)]">Prepare the packet for review</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                  Sona drafts the next action, checks proof, and waits for user approval.
                </p>
              </div>
              <div className="mt-3 space-y-2.5 text-xs text-[var(--text-muted)]">
                {['Follow up in 3 days', 'Practice role stories', 'Watch stale applications'].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <Icon name="radio_button_checked" className="text-[13px] text-blue-500" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function FreeToolsBand({
  activeTool,
  onSelect,
}: {
  activeTool: DashboardToolId;
  onSelect: (tool: DashboardToolId) => void;
}) {
  return (
    <section className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 md:p-3" aria-label="Free tools">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="min-w-0 px-1 lg:w-[150px]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Free tools</h2>
          <p className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">Fast checks before signup.</p>
        </div>
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
          {freeToolHighlights.map((tool) => {
            const selected = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onSelect(tool.id)}
                className={`flex min-h-[58px] w-[178px] shrink-0 items-center gap-3 rounded-[14px] border px-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 ${selected ? 'border-blue-500/35 bg-blue-500/10' : 'border-transparent bg-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--card-bg)]'}`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border ${selected ? 'border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-300' : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-muted)]'}`}>
                  <Icon name={tool.icon} className="text-[19px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{tool.label}</span>
                  <span className="block text-[11px] leading-4 text-[var(--text-muted)]">{tool.note}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function UnifiedDashboard({
  mode,
  user,
  activeTool,
  onShowLogin,
  onShowSignup,
  showPublicNav = true,
}: UnifiedDashboardProps) {
  const router = useRouter();
  const { tier, isPro, loading: tierLoading } = useUserTier();
  const plan = getPlanIdentity(tier);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>({
    vaultTotal: null,
    vaultBridge: null,
    debriefs: null,
    intelligenceScore: null,
    loading: false,
  });
  const landingResumeInputRef = useRef<HTMLInputElement>(null);
  const landingResumeButtonRef = useRef<HTMLButtonElement>(null);
  const [landingResumeState, setLandingResumeState] = useState<{
    status: 'idle' | 'reading' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardSnapshot() {
      if (!user) {
        setSnapshot({
          vaultTotal: null,
          vaultBridge: null,
          debriefs: null,
          intelligenceScore: null,
          loading: false,
        });
        return;
      }

      setSnapshot((current) => ({ ...current, loading: true }));

      const next: DashboardSnapshot = {
        vaultTotal: null,
        vaultBridge: null,
        debriefs: null,
        intelligenceScore: null,
        loading: false,
      };

      try {
        const [vaultRes, debriefRes, intelligenceRes] = await Promise.allSettled([
          authFetch('/api/vault/list?limit=20'),
          authFetch('/api/agent/debriefs'),
          authFetch('/api/agent/intelligence'),
        ]);

        if (vaultRes.status === 'fulfilled' && vaultRes.value.ok) {
          const vault = await vaultRes.value.json().catch(() => ({}));
          const items = Array.isArray(vault.items) ? vault.items : Array.isArray(vault.data) ? vault.data : [];
          next.vaultTotal = typeof vault.total === 'number' ? vault.total : items.length;
          next.vaultBridge = items.filter((item: any) => String(item?.type || '').includes('bridge')).length;
        }

        if (debriefRes.status === 'fulfilled' && debriefRes.value.ok) {
          const debriefs = await debriefRes.value.json().catch(() => ({}));
          const rows = Array.isArray(debriefs.debriefs) ? debriefs.debriefs : Array.isArray(debriefs.data) ? debriefs.data : [];
          next.debriefs = rows.length;
        }

        if (intelligenceRes.status === 'fulfilled' && intelligenceRes.value.ok) {
          const intelligence = await intelligenceRes.value.json().catch(() => ({}));
          const score = intelligence?.healthScore ?? intelligence?.score ?? intelligence?.data?.healthScore ?? intelligence?.twin?.completeness?.score;
          next.intelligenceScore = typeof score === 'number' ? Math.round(score) : null;
        }
      } catch {
        // Authenticated widgets still render independently; snapshot cards simply stay quiet.
      }

      if (!cancelled) setSnapshot(next);
    }

    loadDashboardSnapshot();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const activeToolDefinition = useMemo(
    () => dashboardPreviewTools.find((tool) => tool.id === activeTool) || dashboardPreviewTools[1],
    [activeTool],
  );

  const selectTool = useCallback((tool: DashboardToolId) => {
    router.replace(`/?tool=${tool}`, { scroll: false });
  }, [router]);

  const focusPreviewTool = useCallback((tool: DashboardToolId) => {
    selectTool(tool);
    if (typeof window === 'undefined') return;

    window.setTimeout(() => {
      document.getElementById('free-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => {
        document.getElementById('dashboard-preview-input')?.focus({ preventScroll: true });
      }, 320);
    }, 40);
  }, [selectTool]);

  const handleLandingResume = useCallback(async (file: File | null) => {
    if (!file || user) return;
    analytics.sonaResumeUploadStarted('landing_hero');
    try {
      validateResumeFile(file);
      if (file.size > RESUME_UPLOAD_LIMITS.directBytes) {
        setLandingResumeState({
          status: 'error',
          message: 'This resume is over 4MB. Create an account, then upload it securely inside Sona.',
        });
        analytics.sonaResumeUploadFailed('landing_hero', 'auth_required');
        window.requestAnimationFrame(() => {
          landingResumeButtonRef.current?.focus({ preventScroll: true });
          onShowSignup('/suite/agent?intent=resume-upload');
        });
        return;
      }
      setLandingResumeState({ status: 'reading', message: `Reading ${file.name}...` });
      const parsed = await uploadAndParseResume(file);
      analytics.sonaResumeParsed(parsed.sourceType, parsed.characterCount || parsed.text.length);
      const staged = await stagePendingSonaResume({
        text: parsed.text,
        fileName: parsed.fileName || file.name,
        detectedType: parsed.detectedType,
      });
      if (!staged) {
        throw new Error('This browser could not hold the resume handoff. Create an account, then upload inside Sona.');
      }
      analytics.sonaResumeHandoffStaged();
      setLandingResumeState({ status: 'idle', message: '' });
      window.requestAnimationFrame(() => {
        landingResumeButtonRef.current?.focus({ preventScroll: true });
        onShowSignup('/suite/agent?intent=resume-upload&pendingResume=1');
      });
    } catch (error: any) {
      analytics.sonaResumeUploadFailed(
        'landing_hero',
        error instanceof ResumeUploadError ? error.code.toLowerCase() : 'handoff_failed',
      );
      setLandingResumeState({
        status: 'error',
        message: error instanceof ResumeUploadError
          ? error.message
          : error?.message || 'Sona could not read this resume. Try a text-based PDF, DOCX, DOC, or TXT file.',
      });
      if (error instanceof ResumeUploadError && error.code === 'AUTH_REQUIRED') {
        window.requestAnimationFrame(() => {
          landingResumeButtonRef.current?.focus({ preventScroll: true });
          onShowSignup('/suite/agent?intent=resume-upload');
        });
      }
    } finally {
      if (landingResumeInputRef.current) landingResumeInputRef.current.value = '';
    }
  }, [onShowSignup, user]);

  const openFullTool = (tool: DashboardToolId) => {
    const route = toolRoutes[tool];
    if (!route) {
      selectTool(tool);
      return;
    }
    if (!user) {
      onShowSignup();
      return;
    }
    router.push(route);
  };

  const isGuest = mode === 'guest';
  const heroTitle = mode === 'authenticated'
    ? getShortGreeting(user)
    : 'Drop your resume. Let Sona find the right jobs.';
  const heroTitleClass = mode === 'authenticated'
    ? 'text-[clamp(2.05rem,4vw,3.9rem)] leading-[1.04] tracking-[-0.028em]'
    : 'text-[clamp(2.35rem,4.6vw,4.75rem)] leading-[1] tracking-[-0.035em]';
  const hasSavedAssets = mode === 'authenticated' && Number(snapshot.vaultTotal || 0) > 0;

  return (
    <div className="tc-public-command min-h-dvh bg-[var(--bg-deep)] pt-8 text-[var(--text-primary)] sm:pt-10 lg:pt-0">
      {showPublicNav && (
        <PublicLandingNav
          mode={mode}
          onShowLogin={onShowLogin}
          onShowSignup={onShowSignup}
          onOpenWorkspace={() => router.push('/suite')}
        />
      )}

      <SuiteToolShell
        variant="workbench"
        noBackground
        className="pt-3 md:pt-5 lg:pt-6"
        contentClassName="gap-4 md:gap-5"
      >
        <section className="relative overflow-hidden rounded-[30px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm md:p-8 xl:p-10">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/35 to-transparent" />
          <div className="relative">
            <div className="min-w-0">
              <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center text-center">
                {mode === 'guest' && (
                  <div className="mb-5 hidden flex-wrap justify-center gap-2 text-[11px] font-semibold text-[var(--text-muted)] sm:flex">
                    {heroBadges.map((badge) => (
                      <span key={badge} className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5">
                        {badge}
                      </span>
                    ))}
                  </div>
                )}
                <h1 className={`mx-auto max-w-[1120px] text-center font-medium text-[var(--text-primary)] [text-wrap:balance] ${heroTitleClass}`}>
                  {heroTitle}
                </h1>
                <p className="premium-copy-wrap mx-auto mt-6 max-w-[760px] text-base leading-7 text-[var(--text-secondary)] md:text-lg md:leading-8">
                  {mode === 'authenticated'
                    ? 'Your resume, applications, interview prep, writing checks, and Sona context stay connected in one review-first workspace.'
                    : 'Upload a resume, tell Sona your target, and get fit-ranked job picks with truthful resume morphs prepared for your review.'}
                </p>

                <div className="mt-7 flex w-full flex-col justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  {mode === 'authenticated' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => router.push(hasSavedAssets ? '/suite' : '/suite/agent?intent=resume-upload')}
                        className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[12px] bg-[var(--text-primary)] px-5 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 sm:min-w-[202px]"
                      >
                        <Icon name={hasSavedAssets ? 'dashboard' : 'upload_file'} className="text-[19px]" />
                        {hasSavedAssets ? 'Continue workspace' : 'Upload resume to Sona'}
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push('/suite/applications')}
                        className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 sm:min-w-[202px]"
                      >
                        <Icon name="work" className="text-[19px]" />
                        Review applications
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        ref={landingResumeInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                        className="hidden"
                        onChange={event => void handleLandingResume(event.target.files?.[0] || null)}
                      />
                      <button
                        ref={landingResumeButtonRef}
                        data-sona-resume-upload-trigger="true"
                        type="button"
                        onClick={() => landingResumeInputRef.current?.click()}
                        disabled={landingResumeState.status === 'reading'}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-5 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                      >
                        <Icon name={landingResumeState.status === 'reading' ? 'progress_activity' : 'upload_file'} className={`text-[19px] ${landingResumeState.status === 'reading' ? 'animate-spin' : ''}`} />
                        {landingResumeState.status === 'reading' ? 'Reading resume' : 'Upload resume to Sona'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onShowSignup()}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20"
                      >
                        <Icon name="person_add" className="text-[19px]" />
                        Create free account
                      </button>
                      <button
                        type="button"
                        onClick={onShowLogin}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[12px] border border-transparent px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20"
                      >
                        <Icon name="login" className="text-[19px]" />
                        Sign in
                      </button>
                    </>
                  )}
                </div>

                {isGuest && landingResumeState.message && (
                  <p
                    className={`premium-copy-wrap mt-3 max-w-lg text-sm leading-6 ${landingResumeState.status === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`}
                    role={landingResumeState.status === 'error' ? 'alert' : 'status'}
                  >
                    {landingResumeState.message}
                  </p>
                )}

                <div className="mt-6 flex flex-col items-center justify-center gap-2 text-sm text-[var(--text-secondary)] sm:flex-row sm:flex-wrap sm:gap-x-5">
                  {reviewControls.map((item) => (
                    <span key={item} className="inline-flex items-center gap-2">
                      <Icon name="check_circle" className="text-[17px] text-blue-500" />
                      {item}
                    </span>
                  ))}
                </div>

                {!isGuest && (
                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  {snapshot.loading ? (
                    <>
                      <SkeletonRow />
                      <SkeletonRow />
                      <SkeletonRow />
                    </>
                  ) : (
                    <>
                      <CompactSignal title="Saved assets" value={snapshot.vaultTotal ?? 0} icon="folder_special" caption="Resume, story, and prep context" />
                      <CompactSignal title="Career health" value={snapshot.intelligenceScore ? `${snapshot.intelligenceScore}%` : 'Ready'} icon="neurology" caption="Sona intelligence signal" />
                      <CompactSignal title="Interview prep" value={snapshot.debriefs ?? 0} icon="interpreter_mode" caption="Debriefs connected to your path" />
                    </>
                  )}
                </div>
                )}
              </div>
            </div>

            <div className="mt-8 min-w-0 border-t border-[var(--border-subtle)] pt-7 md:mt-10 md:pt-8">
              <CommandCenterPreview
                activeTool={activeTool}
                activeToolLabel={activeToolDefinition.label}
                snapshot={snapshot}
                mode={mode}
                onUseFreePreview={() => focusPreviewTool('job-match')}
              />
            </div>
          </div>
        </section>

        <div>
          <FreeToolsBand activeTool={activeTool} onSelect={focusPreviewTool} />
        </div>

        <section>
          <SuitePanel className="p-5 md:p-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(320px,1.08fr)] lg:items-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Market-aligned operating system</p>
                <h2 className="premium-heading-wrap mt-2 max-w-2xl text-2xl font-semibold leading-tight tracking-[-0.015em] text-[var(--text-primary)] md:text-3xl">
                  Everything a modern job seeker needs, organized around the next move.
                </h2>
                <p className="premium-copy-wrap mt-4 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] md:text-base md:leading-7">
                  TalentConsulting.io connects role discovery, resume proof, writing trust, application operations, interview prep, and Sona guidance in one review-first workspace.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { icon: 'fact_check', label: 'Free previews', detail: 'Try checks before signup.' },
                  { icon: 'folder_special', label: 'Saved context', detail: 'Keep resumes, roles, and notes together.' },
                  { icon: 'verified_user', label: 'Review first', detail: 'Sona prepares work for your approval.' },
                ].map((item) => (
                  <div key={item.label} className="min-w-0 border-t border-[var(--border-subtle)] pt-4">
                    <Icon name={item.icon} className="icon-neutral text-[20px]" />
                    <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{item.label}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </SuitePanel>
        </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {jobSystemModules.map((module) => (
          <ModuleCard key={module.title} {...module} />
        ))}
      </section>

      <div id="free-tools" className="scroll-mt-24">
        <DashboardToolWorkbench
          mode={mode}
          activeTool={activeTool}
          onSelectTool={selectTool}
          onShowSignup={() => onShowSignup()}
          variant="minimal"
        />
      </div>

      {mode === 'authenticated' ? (
        <div className="space-y-4">
          {user && <DashboardActionInbox key={user.uid} />}
          <JobFeedWidget />
        </div>
      ) : (
        <SuitePanel className="p-5 md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-blue-600 dark:text-blue-300">
                <Icon name="lock_open" className="text-[23px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Unlock when ready</p>
                <h2 className="premium-heading-wrap mt-1 text-2xl font-bold text-[var(--text-primary)]">Create a free account when the work is worth saving.</h2>
                <p className="premium-copy-wrap mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                  Saved history, Sona context, exports, application tracking, billing controls, and communication preferences stay behind the account wall.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onShowSignup()}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-5 text-sm font-bold text-[var(--bg-deep)] transition hover:opacity-90"
            >
              <Icon name="person_add" className="text-[18px]" />
              Start free
            </button>
          </div>
        </SuitePanel>
      )}
      </SuiteToolShell>
    </div>
  );
}
