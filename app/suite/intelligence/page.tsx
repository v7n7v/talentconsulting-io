'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useStore } from '@/lib/store';
import { authFetch } from '@/lib/auth-fetch';
import { openSona } from '@/lib/assistant/execution-context';
import {
  careerTwinPromptMetadata,
  clampScore,
  compactList,
  formatSalaryFloor,
  healthScoreBasis,
  metricValue,
  normalizeCareerTwinMemory,
  normalizeCareerTwinSummary,
  percentOrDash,
  priorityClass,
  titleCase,
  type CareerTwinSummary,
} from '@/lib/career-twin-client';
import { SuiteEmptyState, SuiteMetricCard, SuitePanel, SuiteToolHeader, SuiteToolIcon, SuiteToolShell, SuiteUnmeasured } from '@/components/suite/SuiteToolChrome';
import SuiteSignedOut from '@/components/suite/SuiteSignedOut';
import dynamic from 'next/dynamic';

const PulseTab = dynamic(() => import('@/app/suite/pulse/PulseContent').then(m => ({ default: m.PulseContent })), {
  loading: () => <div className="h-64 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />,
});

const AnalyticsTab = dynamic(() => import('@/app/suite/analytics/AnalyticsContent').then(m => ({ default: m.AnalyticsContent })), {
  loading: () => <div className="h-64 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />,
});

type IntelTab = 'overview' | 'pulse' | 'analytics' | 'outcomes';

interface HealthBand {
  key: string;
  label: string;
  /** Points earned across measured items. */
  earned: number;
  /** Points available from measured items only. 0 = nothing here is known. */
  available: number;
  max: number;
  items: { key: string; label: string; score: number; max: number; measured: boolean }[];
}

interface CareerProfile {
  healthScore: number;
  /** The real bands behind healthScore. Never re-derive these from the total. */
  healthBands: HealthBand[];
  daysActive: number;
  hasResume: boolean;
  resumeVersionCount: number;
  skills: {
    confirmed: string[]; growing: string[]; weak: string[];
    marketHot: string[]; gap: string[];
    /** How many fit analyses `gap` was derived from. 0 means "never analyzed", not "no gaps". */
    fitAnalysisCount: number;
  };
  pipeline: {
    /** Every record. `appliedApps` is the subset actually sent — the denominator. */
    totalApps: number; appliedApps: number; thisWeekApps: number;
    /** Applications sent per week, one decimal. */
    velocity: number;
    /** Counted, not derived from a rate. */
    responded: number; interviews: number; offers: number;
    /** Null when there is no denominator. Never render null as 0%. */
    responseRate: number | null; interviewConversion: number | null; offerConversion: number | null;
    ghostRate: number | null; topCompanies: string[];
  };
  interviews: {
    totalDebriefs: number; passRate: number; avgConfidence: number; avgFeeling: number;
    confidenceTrend: string;
    weakCategories: { category: string; avgConfidence: number; count: number }[];
    strongCategories: { category: string; avgConfidence: number; count: number }[];
    roundTypeBreakdown: { type: string; count: number; avgConf: number }[];
    companiesInterviewed: string[];
  };
  stories: {
    totalStories: number;
    tagDistribution: { tag: string; count: number }[];
    coverageGaps: string[];
  };
  morale: {
    /** Null until the user checks in on the Weekly Pulse tab. Never defaulted. */
    current: number | null; trend: string | null; burnoutRisk: string | null;
    history: { week: string; score: number }[];
  };
}

interface Recommendation {
  id: string; priority: string; icon: string; title: string;
  description: string; action: string; actionPath: string; color: string;
  category: string;
}

/**
 * Why a health band has nothing measured. Keyed by the band keys emitted by
 * `computeHealthBands` in lib/career-graph.ts. Activity is never in here — its
 * items are always measured, because zero applications is a real observation.
 */
const HEALTH_BAND_REASON: Record<string, string> = {
  // Each item in this band has its own precondition — a sent application, an
  // employer reply, a debrief question, a resolved debrief outcome — so the
  // band goes quiet only when none of them are met.
  performance: 'Rates here need something to divide by: applications sent, replies received, and debriefs with answers and a known outcome. None yet.',
  preparedness: 'Drawn from your resume, the roles you have analyzed, and interview debriefs. None are on record yet.',
  wellbeing: 'Morale is self-reported on the Weekly Pulse tab. You have not checked in yet.',
};

/**
 * A percentage, or an em dash when the API sent null.
 *
 * Re-exported from career-twin-client under the local name this file already
 * uses, so the main dashboard and this page share one definition.
 */
const pctOrDash = percentOrDash;

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} aria-hidden="true">{name}</span>;
}

function MemoryFact({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
      <div className="flex min-w-0 items-start gap-2">
        <Icon name={icon} className="icon-neutral mt-0.5 shrink-0 text-[16px]" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
          <p className="premium-copy-wrap mt-1 text-sm font-semibold text-[var(--text-primary)]">{value}</p>
        </div>
      </div>
    </div>
  );
}

function MemoryChipList({
  label,
  values,
  empty,
  limit = 8,
}: {
  label: string;
  values: string[];
  empty: string;
  limit?: number;
}) {
  const visible = values.filter(Boolean).slice(0, limit);

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
      {visible.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visible.map((item, index) => (
            <span
              key={`${item || 'memory-chip'}-${index}`}
              className="wrap-natural rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]"
            >
              {item}
            </span>
          ))}
          {values.length > limit && (
            <span className="rounded-[10px] border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--text-muted)]">
              +{values.length - limit} more
            </span>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{empty}</p>
      )}
    </div>
  );
}

function CareerTwinMemoryPanel({
  twin,
  exporting,
  onExport,
  onOpenAction,
  onAskSona,
}: {
  twin: CareerTwinSummary | null;
  exporting: boolean;
  onExport: () => void;
  onOpenAction: (path: string) => void;
  onAskSona: (prompt: string, contextLabel?: string) => void;
}) {
  if (!twin) {
    return (
      <SuitePanel className="p-6">
        <div className="flex min-w-0 items-start gap-3">
          <SuiteToolIcon icon="memory" size="md" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Career Twin memory
            </p>
            <h2 className="premium-heading-wrap mt-1 text-lg font-bold text-[var(--text-primary)]">
              Add trusted career data so Taco can work from memory.
            </h2>
            <p className="premium-copy-wrap mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Upload a resume, set target roles, save applications, and add interview stories. Taco will use that evidence before preparing packets or advice.
            </p>
          </div>
        </div>
      </SuitePanel>
    );
  }

  const normalizedTwin = normalizeCareerTwinSummary(twin);

  if (!normalizedTwin) {
    return (
      <SuitePanel className="p-6">
        <div className="flex min-w-0 items-start gap-3">
          <SuiteToolIcon icon="sync" size="md" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Career Twin memory
            </p>
            <h2 className="premium-heading-wrap mt-1 text-lg font-bold text-[var(--text-primary)]">
              Taco is rebuilding missing memory fields.
            </h2>
            <p className="premium-copy-wrap mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Your account loaded, but this Career Twin snapshot is missing required sections. Refresh memory from here or keep using the suite while it syncs.
            </p>
            <button
              type="button"
              onClick={() => onAskSona('My Career Twin memory loaded with missing fields. Help me identify what data to add next.', 'Career Twin repair')}
              className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
            >
              <Icon name="auto_awesome" className="text-[18px]" />
              Ask Taco
            </button>
          </div>
        </div>
      </SuitePanel>
    );
  }

  const memory = normalizeCareerTwinMemory(normalizedTwin.memory, normalizedTwin.background);
  const goals = memory.goals || {
    targetRoles: normalizedTwin.background.targetRoles || [],
    industries: normalizedTwin.background.industries || [],
    salaryMin: null,
  };
  // `responseRate: null`, not 0 — this fallback only runs when there is no
  // memory to read, which is the definition of not measured. `normalizeCareerTwinMemory`
  // always returns an activeSearch, so it is belt and braces either way.
  const activeSearch = memory.activeSearch || {
    totalApplications: 0,
    sentApplications: 0,
    responseRate: null,
    velocity: 0,
    queuedApplications: 0,
    staleApplications: 0,
    skillGaps: [],
    fitAnalysisCount: 0,
  };
  const completenessRaw = normalizedTwin.completeness.score;
  const coverageRaw = normalizedTwin.behavioralBank.coverageScore;
  const completeness = completenessRaw != null && completenessRaw > 0 ? clampScore(completenessRaw) : null;
  const coverage = coverageRaw != null && coverageRaw > 0 ? clampScore(coverageRaw) : null;
  const nextActions = memory.nextBestActions || [];
  const missing = normalizedTwin.completeness.missing || [];

  return (
    <SuitePanel className="p-0 overflow-hidden">
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.55fr)]">
        <div className="min-w-0 p-5 md:p-6">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <SuiteToolIcon icon="memory" size="md" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Career Twin memory
                </p>
                <h2 className="premium-heading-wrap mt-1 text-xl font-bold text-[var(--text-primary)]">
                  Taco's source of truth for your career search.
                </h2>
                <p className="premium-copy-wrap mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  This panel shows what Taco knows, what is missing, and which actions still require your review before anything external happens.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <button
                type="button"
                onClick={() => onAskSona('Review my Career Twin memory. Tell me what is strongest, what is missing, and the next 3 actions that would improve my job search this week.', 'Career Twin')}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
              >
                <Icon name="auto_awesome" className="text-[18px]" />
                Ask Taco
              </button>
              <button
                type="button"
                onClick={onExport}
                disabled={!normalizedTwin.exportable || exporting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
              >
                <Icon name={exporting ? 'progress_activity' : 'download'} className={`text-[16px] ${exporting ? 'animate-spin' : ''}`} />
                {normalizedTwin.exportable ? 'Export JSON' : 'Export locked'}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MemoryFact label="Completeness" value={completeness != null ? `${completeness}%` : 'Not computed'} icon="fact_check" />
            <MemoryFact label="Story coverage" value={coverage != null ? `${coverage}% across ${normalizedTwin.behavioralBank.totalStories} stories` : 'Not computed'} icon="auto_stories" />
            <MemoryFact label="Applications" value={metricValue(activeSearch.totalApplications)} icon="work" />
            <MemoryFact label="Queued packets" value={metricValue(activeSearch.queuedApplications)} icon="pending_actions" />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Identity and goals</p>
                  <h3 className="premium-heading-wrap mt-1 text-base font-bold text-[var(--text-primary)]">
                    {memory.identity.name || 'Career profile'}
                  </h3>
                </div>
                <Icon name="account_circle" className="icon-neutral text-[22px]" />
              </div>
              <div className="mt-4 grid gap-3">
                <MemoryFact label="Current title" value={memory.identity.currentTitle || normalizedTwin.background.currentTitle || 'Not set yet'} icon="badge" />
                <MemoryFact label="Target roles" value={compactList(goals.targetRoles.length ? goals.targetRoles : normalizedTwin.background.targetRoles)} icon="track_changes" />
                <MemoryFact label="Industries" value={compactList(goals.industries.length ? goals.industries : normalizedTwin.background.industries)} icon="domain" />
                <MemoryFact label="Salary floor" value={formatSalaryFloor(goals.salaryMin)} icon="payments" />
              </div>
            </div>

            <div className="min-w-0 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Search state</p>
                  <h3 className="premium-heading-wrap mt-1 text-base font-bold text-[var(--text-primary)]">
                    Current momentum and gaps
                  </h3>
                </div>
                <Icon name="query_stats" className="icon-neutral text-[22px]" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {/* pctOrDash, not metricValue: the funnel one card down calls
                    this same quantity "Not measurable", and a bare 0 here
                    contradicted it on one screen. */}
                <MemoryFact label="Response rate" value={pctOrDash(activeSearch.responseRate)} icon="reply" />
                <MemoryFact label="Velocity" value={`${metricValue(activeSearch.velocity)}/week`} icon="speed" />
                <MemoryFact label="Stale apps" value={metricValue(activeSearch.staleApplications)} icon="schedule" />
                <MemoryFact label="Resume versions" value={metricValue(memory.confirmedFacts.resumeVersionCount)} icon="description" />
              </div>
              <div className="mt-4">
                {/* "No skill gaps detected yet" is an assertion of absence, and
                    it is only true once a role has been analyzed. With no fit
                    analysis on record the honest statement is that nothing has
                    been compared. */}
                <MemoryChipList
                  label="Skill gaps"
                  values={activeSearch.skillGaps}
                  empty={activeSearch.fitAnalysisCount > 0
                    ? 'No gaps found against the roles you have analyzed.'
                    : 'No role analyzed yet, so nothing has been compared.'}
                  limit={6}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
              <MemoryChipList label="Confirmed skills" values={memory.confirmedFacts.skills} empty="Upload or parse a resume to confirm skills." limit={12} />
              <div className="mt-4">
                <MemoryChipList label="Education" values={memory.confirmedFacts.education.length ? memory.confirmedFacts.education : normalizedTwin.background.education} empty="Education has not been captured yet." limit={4} />
              </div>
              <div className="mt-4">
                <MemoryChipList label="Top companies" values={memory.confirmedFacts.topCompanies} empty="Track applications to build company memory." limit={5} />
              </div>
            </div>

            <div className="min-w-0 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Trust controls</p>
              <div className="mt-3 space-y-3">
                <div className="flex min-w-0 items-start gap-3 rounded-[14px] bg-[var(--bg-elevated)] p-3">
                  <Icon name="verified_user" className="icon-status-success mt-0.5 shrink-0 text-[18px]" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Review required before external action</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                      {memory.constraints.requiresReviewBeforeExternalAction ? 'Enabled for applications, messages, and submissions.' : 'Needs review guardrails before external actions.'}
                    </p>
                  </div>
                </div>
                <MemoryFact label="Autonomy" value={titleCase(memory.constraints.autonomyLevel || 'prepare')} icon="rule" />
                <MemoryFact label="Voice" value={memory.writingVoice.tone || 'Clear, specific, confident, and human'} icon="record_voice_over" />
                <MemoryChipList label="Banned claims" values={memory.writingVoice.bannedClaims} empty="No banned claims recorded." limit={6} />
              </div>
            </div>
          </div>
        </div>

        <aside className="min-w-0 border-t border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 md:p-6 lg:border-l lg:border-t-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Next best actions</p>
            <h3 className="premium-heading-wrap mt-1 text-lg font-bold text-[var(--text-primary)]">
              Move the search forward.
            </h3>
            <p className="premium-copy-wrap mt-2 text-xs leading-5 text-[var(--text-secondary)]">
              Taco ranks these from memory. Open a tool, or ask Taco to prepare the work for review.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {nextActions.length ? nextActions.map(action => (
              <div
                key={action.id}
                className={`min-w-0 rounded-[16px] border p-3 ${priorityClass(action.priority)}`}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <Icon name={action.priority === 'critical' ? 'priority_high' : 'arrow_outward'} className="icon-neutral mt-0.5 shrink-0 text-[17px]" />
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="premium-heading-wrap text-sm font-bold text-[var(--text-primary)]">{action.label}</p>
                      <span className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                        {action.priority}
                      </span>
                    </div>
                    <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-muted)]">{action.reason}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => onOpenAction(action.path)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
                  >
                    <Icon name="open_in_new" className="text-[15px]" />
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => onAskSona(`Prepare this Career Twin action for review: ${action.label}. Reason: ${action.reason}. Do not submit, message, or change anything externally.`, action.label)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-3 text-xs font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
                  >
                    <Icon name="auto_awesome" className="text-[15px]" />
                    Ask Taco
                  </button>
                </div>
              </div>
            )) : (
              <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                <Icon name="task_alt" className="icon-status-success text-[22px]" />
                <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">No urgent actions yet.</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  Keep saving jobs, logging outcomes, and adding stories. Taco will surface the next move when the evidence changes.
                </p>
              </div>
            )}
          </div>

          <div className="mt-5 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Completeness</span>
              <span className="text-xs font-bold tabular-nums text-[var(--text-primary)]">{completeness != null ? `${completeness}%` : 'Not computed'}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]" aria-label="Career Twin completeness">
              <div className="h-full rounded-full bg-[var(--text-primary)]" style={{ width: `${completeness ?? 0}%` }} />
            </div>
            {missing.length > 0 && (
              <p className="premium-copy-wrap mt-3 text-xs leading-5 text-[var(--text-muted)]">
                Missing: {missing.slice(0, 4).join(', ')}{missing.length > 4 ? ` +${missing.length - 4}` : ''}
              </p>
            )}
          </div>
        </aside>
      </div>
    </SuitePanel>
  );
}

export default function IntelligencePage() {
  const router = useRouter();
  const { user } = useStore();

  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [twin, setTwin] = useState<CareerTwinSummary | null>(null);
  const [exportingTwin, setExportingTwin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<IntelTab>('overview');
  const [outcomeStats, setOutcomeStats] = useState<any>(null);
  const [outcomeLoading, setOutcomeLoading] = useState(false);
  /*
   * A swallowed fetch failure and a genuinely empty account both leave
   * `outcomeStats` null, and the empty state then asserts "None are marked
   * yet" — a positive claim about the user's data, made after failing to read
   * it. A 401 on an expired token, a 429 from the route's rate limit and a 500
   * all land here.
   */
  const [outcomeFailed, setOutcomeFailed] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setProfile(null);
      setTwin(null);
      setRecommendations([]);
      return;
    }
    loadIntelligence();
  }, [user]);

  const loadIntelligence = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/agent/intelligence');
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile);
        setRecommendations(data.recommendations || []);
        setTwin(normalizeCareerTwinSummary(data.twin));
      }
    } catch {
      setTwin(null);
    }
    finally { setLoading(false); }
  };

  const handleExportTwin = async () => {
    if (!twin?.exportable || exportingTwin) return;
    setExportingTwin(true);
    try {
      const res = await authFetch('/api/agent/intelligence?export=true');
      if (!res.ok) throw new Error('Failed to export Career Twin');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'career-twin.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      openSona({
        prompt: 'I tried to export my Career Twin JSON and it failed. Help me diagnose what data or access is missing.',
        contextLabel: 'Career Twin export',
        context: {
          pathname: '/suite/intelligence',
          pageLabel: 'Career Intelligence',
          sourceTool: 'Career Twin',
        },
      });
    } finally {
      setExportingTwin(false);
    }
  };

  const askSonaAboutTwin = (prompt: string, contextLabel = 'Career Twin') => {
    openSona({
      prompt,
      contextLabel,
      capabilityId: 'applications.next_actions',
      context: {
        pathname: '/suite/intelligence',
        pageLabel: 'Career Intelligence',
        sourceTool: 'Career Twin',
        metadata: careerTwinPromptMetadata(twin),
      },
    });
  };

  // Load outcomes when tab activates
  useEffect(() => {
    if (activeTab === 'outcomes' && !outcomeStats && user) {
      setOutcomeLoading(true);
      setOutcomeFailed(false);
      authFetch('/api/applications/outcome')
        .then(async r => {
          if (!r.ok) throw new Error(`outcome fetch failed: ${r.status}`);
          return r.json();
        })
        .then(data => {
          if (data.stats) setOutcomeStats(data.stats);
          else setOutcomeFailed(true);
        })
        .catch(() => setOutcomeFailed(true))
        .finally(() => setOutcomeLoading(false));
    }
  }, [activeTab, user]);

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'var(--success)';
    if (score >= 45) return 'var(--warning)';
    return 'var(--danger)';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 65) return 'On Track';
    if (score >= 45) return 'Building';
    if (score >= 25) return 'Getting Started';
    return 'Just Starting';
  };

  // Moved loading/error into main render return

  const scoreCircumference = 2 * Math.PI * 54;
  const scoreOffset = scoreCircumference - ((profile?.healthScore ?? 0) / 100) * scoreCircumference;

  // The real bands from computeHealthBands. `?? []` covers a twin persisted
  // before the band breakdown existed — we render nothing rather than invent it.
  const healthBands = profile?.healthBands ?? [];
  // A rating derived from one measured group out of four is not a rating, and
  // neither is one derived from four groups that are mostly unmeasured. The
  // test is shared with the main dashboard so the two screens cannot disagree
  // about whether this user's score means anything — see career-twin-client.
  const { measuredBands: measuredBandCount, ratingIsSupported: basisSupportsRating } = healthScoreBasis(healthBands);
  // And a verdict on a job search needs a job search. Same two conditions as
  // the main dashboard, so the two screens cannot rate one account differently.
  const searchHasStarted = (profile?.pipeline?.appliedApps ?? 0) > 0;
  const ratingIsSupported = basisSupportsRating && searchHasStarted;
  /*
   * Red/amber/green is a verdict. Withholding the rating word while painting
   * the same number red says the quiet part anyway — a brand-new account, the
   * exact case this pass exists for, was getting a large red 0. When the rating
   * is not supported the ring is neutral ink and carries no judgement.
   */
  /*
   * The Outcomes insight card used to take its colour and its tone from
   * `responseRate >= 20`. Response rate counts rejections — an employer
   * writing back to say no is still an employer writing back — so it measures
   * contact, not success, and a wall of rejections would have been painted
   * green with a trending-up arrow. Tone comes from outcomes that actually
   * moved forward; the rate keeps its own tile and states itself plainly.
   */
  const outcomesMovedForward = (outcomeStats?.callbackCount || 0)
    + (outcomeStats?.interviewCount || 0)
    + (outcomeStats?.offerCount || 0);
  const outcomeInsightColor = outcomesMovedForward > 0 ? 'var(--success)' : 'var(--warning)';

  const ratedColor = getScoreColor(profile?.healthScore ?? 0);
  const scoreColor = ratingIsSupported ? ratedColor : 'var(--text-secondary)';

  return (
    <SuiteToolShell variant="standard">
      <SuiteToolHeader tool="intelligence">
        <div className="mt-3 flex w-full gap-1 overflow-x-auto scrollbar-hide rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1 sm:w-fit">
          {([
            { key: 'overview' as IntelTab, label: 'Overview', icon: 'neurology' },
            { key: 'pulse' as IntelTab, label: 'Weekly Pulse', icon: 'monitor_heart' },
            { key: 'analytics' as IntelTab, label: 'Analytics', icon: 'bar_chart' },
            { key: 'outcomes' as IntelTab, label: 'Outcomes', icon: 'fact_check' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 ${
                activeTab === tab.key
                  ? 'border border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="material-symbols-rounded text-[18px]">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </SuiteToolHeader>

      {/* Signed out is not a failed load, and it is not a property of one tab.
          This used to live inside the overview branch, so switching tabs
          dropped a signed-out visitor back into data-less content. The tab
          strip stays clickable; what it switches between is nothing until
          there is an account to read. `loading` is already false here — the
          load effect returns early when there is no user. */}
      {/* SuiteSignedOut, not SuiteUnmeasured. SuiteUnmeasured is the evidence
          primitive for "this number was never measured" — a dashed muted
          advisory sized to sit inside a grid of results. Here it was the whole
          page, which put the only route forward inside a footnote. The shared
          component is the same shape app/suite/agent/queue/page.tsx:1883 and
          app/suite/network/page.tsx:1441 already use, and three other routes
          with this exact problem now use it too. */}
      {!loading && !user && (
        <SuiteSignedOut
          title="Sign in to read your Career Intelligence"
          description="This view is built from the resume, applications and checks saved to your account. There is nothing to read until there is an account to read it from."
        />
      )}

      {/* Pulse Tab */}
      {activeTab === 'pulse' && user && <PulseTab />}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && user && <AnalyticsTab />}

      {/* Outcomes Tab */}
      {activeTab === 'outcomes' && user && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {outcomeLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
              ))}
            </div>
          ) : outcomeStats && outcomeStats.totalApplied > 0 ? (
            <>
              {/* KPI Cards. Every rate here is null until it has a denominator;
                  `?? 0` would print four undefined ratios as measured zeros,
                  which is what this tab used to do on a brand-new account. */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {[
                  { label: 'Response Rate', value: pctOrDash(outcomeStats.responseRate), icon: 'reply', desc: `Of ${outcomeStats.totalApplied} sent` },
                  { label: 'Ghost Rate', value: pctOrDash(outcomeStats.ghostRate), icon: 'visibility_off', desc: `Of ${outcomeStats.totalReported} reported` },
                  { label: 'Avg Response', value: outcomeStats.avgDaysToResponse ? `${outcomeStats.avgDaysToResponse}d` : '—', icon: 'schedule', desc: 'Days until first response' },
                  { label: 'Interview Rate', value: pctOrDash(outcomeStats.interviewRate), icon: 'groups', desc: `Of ${outcomeStats.totalApplied} sent` },
                  { label: 'Offer Rate', value: pctOrDash(outcomeStats.offerRate), icon: 'celebration', desc: `Of ${outcomeStats.totalApplied} sent` },
                ].map((kpi, i) => (
                  <motion.div
                    key={kpi.label}
                    className="min-w-0"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <SuiteMetricCard icon={kpi.icon} label={kpi.label} value={kpi.value} description={kpi.desc} />
                  </motion.div>
                ))}
              </div>

              {/* Outcome Breakdown Bar Chart */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
              >
                <SuitePanel>
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                  <span className="material-symbols-rounded text-base text-[var(--text-muted)]">donut_large</span>
                  Outcome Breakdown
                </h3>
                {(() => {
                  const outcomes = [
                    { key: 'callback', label: 'Callback', count: outcomeStats.callbackCount || 0, color: 'var(--accent)' },
                    { key: 'interview', label: 'Interview', count: outcomeStats.interviewCount || 0, color: 'var(--accent)' },
                    { key: 'offer', label: 'Offer', count: outcomeStats.offerCount || 0, color: 'var(--success)' },
                    { key: 'rejection', label: 'Rejected', count: outcomeStats.rejectionCount || 0, color: 'var(--danger)' },
                    { key: 'ghosted', label: 'Ghosted', count: outcomeStats.ghostedCount || 0, color: 'var(--text-muted)' },
                  ];
                  const maxCount = Math.max(...outcomes.map(o => o.count), 1);
                  const totalOutcomes = outcomes.reduce((s, o) => s + o.count, 0);

                  return totalOutcomes > 0 ? (
                    <div className="space-y-3">
                      {outcomes.filter(o => o.count > 0).map((outcome, i) => (
                        <div key={outcome.key}>
                          <div className="mb-1 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: outcome.color }} />
                              <span className="text-xs font-semibold text-[var(--text-secondary)]">{outcome.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black tabular-nums" style={{ color: outcome.color }}>{outcome.count}</span>
                              <span className="text-[11px] text-[var(--text-muted)]">
                                ({Math.round((outcome.count / totalOutcomes) * 100)}%)
                              </span>
                            </div>
                          </div>
                          <div className="h-3 overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: outcome.color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${(outcome.count / maxCount) * 100}%` }}
                              transition={{ delay: i * 0.1, duration: 0.6 }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 text-center">
                      <span className="material-symbols-rounded mb-2 block text-[28px] text-[var(--text-muted)]">fact_check</span>
                      <p className="text-xs text-[var(--text-muted)]">No outcomes reported yet. Report outcomes from the Applications page.</p>
                    </div>
                  );
                })()}
                </SuitePanel>
              </motion.div>

              {/* Insight Card */}
              {outcomeStats.totalReported > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="flex items-start gap-3 rounded-[16px] p-4"
                  style={{
                    background: `color-mix(in srgb, ${outcomeInsightColor} 8%, var(--bg-surface))`,
                    border: `1px solid color-mix(in srgb, ${outcomeInsightColor} 30%, transparent)`,
                  }}
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]"
                    style={{ background: `color-mix(in srgb, ${outcomeInsightColor} 15%, transparent)` }}
                  >
                    <span className="material-symbols-rounded text-lg" style={{ color: outcomeInsightColor }}>
                      {outcomesMovedForward > 0 ? 'trending_up' : 'lightbulb'}
                    </span>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: outcomeInsightColor }}>
                      Outcome Insight
                    </p>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                      {outcomesMovedForward > 0
                        ? `${outcomesMovedForward} of ${outcomeStats.totalReported} reported outcome${outcomeStats.totalReported === 1 ? '' : 's'} moved forward — a callback, an interview or an offer.`
                        : (outcomeStats.ghostRate || 0) > 60
                          ? `${outcomeStats.ghostRate}% of your applications went silent. Consider following up 7-10 days after applying, and use ATS Preview to optimize keyword matching.`
                          : `You've reported ${outcomeStats.totalReported} outcome${outcomeStats.totalReported === 1 ? '' : 's'}. None have moved forward yet.`
                      }
                    </p>
                  </div>
                </motion.div>
              )}
            </>
          ) : (
            /* Two different facts, two different sentences. The failure branch
               must not claim anything about the user's data — the request that
               would have told us did not come back. */
            <SuiteEmptyState
              icon={outcomeFailed ? 'cloud_off' : 'fact_check'}
              title={outcomeFailed ? 'Outcomes could not be loaded' : 'No outcome data yet'}
              description={outcomeFailed
                ? 'This tab could not read your outcomes just now, so nothing here is a statement about your applications. Try again in a moment.'
                : 'Conversion rates are counted from applications you have marked as sent. None are marked yet, so there is no rate to show — not a rate of zero.'}
              action={
                <button
                  type="button"
                  onClick={() => (outcomeFailed ? window.location.reload() : router.push('/suite/applications'))}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <span className="material-symbols-rounded text-[18px]">{outcomeFailed ? 'refresh' : 'open_in_new'}</span>
                  {outcomeFailed ? 'Retry' : 'Go to Applications'}
                </button>
              }
            />
          )}
        </motion.div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (<>

      {loading && (
        <div className="space-y-4">
          <div className="h-36 rounded-2xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-48 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
            ))}
          </div>
          <div className="h-32 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
        </div>
      )}

      {!loading && user && !profile && (
        <div className="space-y-4">
          <SuiteEmptyState
            icon="neurology"
            title="Unable to load intelligence"
            description="Start using the suite tools — upload a resume, track applications, log debriefs — and your career profile will build here."
            action={
              <button type="button" onClick={loadIntelligence} className="btn-primary inline-flex items-center gap-2">
                <span className="material-symbols-rounded text-[18px]">refresh</span>
                Try Again
              </button>
            }
          />
          <CareerTwinMemoryPanel
            twin={null}
            exporting={false}
            onExport={handleExportTwin}
            onOpenAction={(path) => router.push(path)}
            onAskSona={askSonaAboutTwin}
          />
        </div>
      )}

      {profile && (<>
      {/* ── Health Score Hero ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <SuitePanel className="flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
        {/* Animated Ring — a ring of the measured healthScore. It stays neutral
            ink until the rating is actually supported, so the number appears
            without a red/amber/green verdict it has not earned. */}
        {profile.healthScore != null && profile.healthScore > 0 ? (
        <div className="relative h-24 w-24 flex-shrink-0 sm:h-32 sm:w-32">
          <svg viewBox="0 0 120 120" className="h-24 w-24 -rotate-90 sm:h-32 sm:w-32">
            <circle cx="60" cy="60" r="54" fill="none" strokeWidth="6" stroke="var(--border-subtle)" />
            <motion.circle
              cx="60" cy="60" r="54" fill="none" strokeWidth="6" strokeLinecap="round"
              stroke={scoreColor}
              strokeDasharray={scoreCircumference}
              initial={{ strokeDashoffset: scoreCircumference }}
              animate={{ strokeDashoffset: scoreOffset }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              className="text-3xl font-black"
              style={{ color: scoreColor }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >{profile.healthScore}</motion.span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Health</span>
          </div>
        </div>
        ) : (
          <div className="flex h-24 w-24 flex-shrink-0 flex-col items-center justify-center rounded-full border border-dashed border-[var(--border-subtle)] text-center sm:h-32 sm:w-32">
            <span className="text-2xl font-black text-[var(--text-muted)]">—</span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Not scored</span>
          </div>
        )}

        {/* Score Context. The rating word is only shown when at least three of
            the four bands are measured — a label derived from one group out of
            four describes that group, not the search. */}
        <div className="min-w-0 flex-1 sm:min-w-[200px]">
          <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
            {ratingIsSupported && (
              <span className="text-lg font-bold" style={{ color: scoreColor }}>{getScoreLabel(profile.healthScore)}</span>
            )}
            <span className="whitespace-nowrap rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--text-secondary)]">
              {profile.daysActive}d active
            </span>
          </div>
          <p className="premium-copy-wrap text-xs text-[var(--text-secondary)]">
            {healthBands.length === 0
              ? 'Score breakdown is not available for this profile yet.'
              : ratingIsSupported
                ? `Scored on ${measuredBandCount} of ${healthBands.length} measured groups. Unmeasured groups are left out of the total rather than counted as zero.`
                : !searchHasStarted
                  ? 'No applications have been sent yet, so this number describes your groundwork, not how a search is going.'
                  : `Only ${measuredBandCount} of ${healthBands.length} ${healthBands.length === 1 ? 'group has' : 'groups have'} anything measured, so this is a partial picture, not a rating.`}
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2 text-center sm:gap-3">
          {[
            { label: 'Apps', value: profile.pipeline.totalApps, icon: 'send' },
            // Debriefs, not interviews. `totalDebriefs` counts documents in
            // users/{uid}/debriefs — interviews you sat and then wrote up.
            { label: 'Debriefs', value: profile.interviews.totalDebriefs, icon: 'groups' },
            { label: 'Stories', value: profile.stories.totalStories, icon: 'auto_stories' },
            { label: 'Skills', value: profile.skills.confirmed.length, icon: 'code' },
          ].map(s => (
            <div key={s.label} className="rounded-[12px] bg-[var(--bg-elevated)] px-3 py-2">
              <span className="material-symbols-rounded text-[14px] text-[var(--text-muted)]">{s.icon}</span>
              <p className="text-lg font-bold text-[var(--text-primary)]">{s.value}</p>
              <p className="text-[11px] text-[var(--text-muted)]">{s.label}</p>
            </div>
          ))}
        </div>
        </SuitePanel>
      </motion.div>

      {/* ── Health breakdown ──
          The four real bands from computeHealthBands. These used to be the one
          health number multiplied by 0.3 / 0.35 / 0.2 / 0.15, so all four bars
          moved together and none of them told you anything. */}
      {healthBands.length > 0 && (
        <SuitePanel>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <span className="material-symbols-rounded text-base text-[var(--text-muted)]">insights</span>
            What the score is made of
          </h3>
          <p className="premium-copy-wrap mb-4 text-xs text-[var(--text-muted)]">
            Each group scores only what has been measured. Nothing is counted as zero because it is unknown.
          </p>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {healthBands.map(bandItem => {
              const measuredItems = bandItem.items.filter(i => i.measured);
              const pct = bandItem.available > 0
                ? Math.round((bandItem.earned / bandItem.available) * 100)
                : 0;

              if (bandItem.available === 0) {
                return (
                  <SuiteUnmeasured
                    key={bandItem.key}
                    label={bandItem.label}
                    reason={HEALTH_BAND_REASON[bandItem.key] ?? 'Nothing in this group has been measured yet.'}
                    density="compact"
                  />
                );
              }

              return (
                <div key={bandItem.key} className="min-w-0">
                  <div className="flex min-w-0 items-baseline justify-between gap-3">
                    <span className="premium-heading-wrap min-w-0 text-xs font-semibold text-[var(--text-primary)]">
                      {bandItem.label}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
                      {bandItem.earned}/{bandItem.available}
                    </span>
                  </div>
                  {/* Track is --border-subtle, not --bg-elevated: in light
                      theme --bg-elevated is #EEF2FA sitting on a near-white
                      panel, so the unfilled part of the bar disappeared. */}
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full"
                    style={{ background: 'var(--border-subtle)' }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: 'var(--accent)' }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                    />
                  </div>
                  <p className="premium-copy-wrap mt-1 text-[11px] leading-4 text-[var(--text-muted)]">
                    {measuredItems.length} of {bandItem.items.length} measured
                    {bandItem.available < bandItem.max
                      ? ` — ${bandItem.max - bandItem.available} points not on the table yet`
                      : ''}
                  </p>
                </div>
              );
            })}
          </div>
        </SuitePanel>
      )}

      <CareerTwinMemoryPanel
        twin={twin}
        exporting={exportingTwin}
        onExport={handleExportTwin}
        onOpenAction={(path) => router.push(path)}
        onAskSona={askSonaAboutTwin}
      />

      {/* ── Recommendations ── */}
      {recommendations.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <span className="material-symbols-rounded text-base text-[var(--text-muted)]">lightbulb</span>
            Smart Recommendations ({recommendations.length})
          </h2>
          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <motion.div
                key={rec.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.06 }}
                className="group flex cursor-pointer items-start gap-3 rounded-[16px] p-4 elevation-interactive"
                style={{
                  background: 'var(--bg-surface)',
                  border: `1px solid ${rec.priority === 'critical' ? 'var(--danger)' : 'var(--border-subtle)'}`,
                }}
                onClick={() => router.push(rec.actionPath)}
              >
                <span className="icon-shell-neutral inline-grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border" aria-hidden="true">
                  <span className="material-symbols-rounded icon-neutral text-lg leading-none">{rec.icon}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{rec.title}</p>
                    {rec.priority === 'critical' && (
                      <span className="rounded-full border border-[var(--danger)] px-1.5 py-0.5 text-[11px] font-black uppercase text-[var(--danger)]">
                        Critical
                      </span>
                    )}
                  </div>
                  <p className="mb-1.5 text-xs text-[var(--text-secondary)]">{rec.description}</p>
                  <span className="text-[11px] font-bold text-[var(--accent)] group-hover:underline">
                    {rec.action} →
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Pipeline Funnel ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <motion.div
          className="h-full"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        >
          <SuitePanel className="h-full">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <span className="material-symbols-rounded text-base text-[var(--text-muted)]">filter_alt</span>
            Pipeline Funnel
          </h3>
          {/* Every value here is a count the graph produced, not a count
              back-derived from a rate. `Offers` used to be
              `round(totalApps * offerConversion / 10000)` — applications
              multiplied by a ratio of interviews — which showed 0 offers to a
              user with 50 apps, 4 interviews and 1 offer. And each conversion
              caption now names its own denominator instead of borrowing the
              stage above it. */}
          {/* `bar` is the width, and it is deliberately NOT `pct ?? something`.
              'Applied' is the base of the funnel rather than a conversion: it
              has no percentage of its own, and its bar is the full width every
              stage below is a share of — empty when nothing has been sent. The
              three conversion rows below it are null exactly when they are not
              measurable, so their bar is EMPTY. Reading a fallback into those
              nulls is how "Not measurable" ended up captioning a solid
              full-width bar next to the count 0. */}
          {[
            { label: 'Applied', value: profile.pipeline.appliedApps, pct: null, bar: profile.pipeline.appliedApps > 0 ? 100 : 0, basis: '', color: 'var(--accent)' },
            { label: 'Responded', value: profile.pipeline.responded, pct: profile.pipeline.responseRate, bar: profile.pipeline.responseRate ?? 0, basis: 'of applications sent', color: 'var(--accent)' },
            { label: 'Interviews', value: profile.pipeline.interviews, pct: profile.pipeline.interviewConversion, bar: profile.pipeline.interviewConversion ?? 0, basis: 'of responses', color: 'var(--accent)' },
            { label: 'Offers', value: profile.pipeline.offers, pct: profile.pipeline.offerConversion, bar: profile.pipeline.offerConversion ?? 0, basis: 'of interviews', color: 'var(--success)' },
          ].map((stage, i) => (
            <div key={stage.label} className="mb-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">{stage.label}</span>
                <span className="text-xs font-bold tabular-nums text-[var(--text-primary)]">{stage.value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
                {/* No 2% floor. A visible sliver at zero reads as a small
                    measured value; an empty track reads as nothing, which is
                    what it is. */}
                <motion.div className="h-full rounded-full" style={{ background: stage.color }}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${Math.max(0, Math.min(100, stage.bar))}%`,
                  }}
                  transition={{ duration: 0.8, delay: 0.5 + i * 0.1 }}
                />
              </div>
              {i > 0 && (
                <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
                  {stage.pct === null ? `Not measurable — no ${stage.basis.replace('of ', '')} yet` : `${stage.pct}% ${stage.basis}`}
                </span>
              )}
            </div>
          ))}
          </SuitePanel>
        </motion.div>

        {/* ── Interview Radar ── */}
        <motion.div
          className="h-full"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        >
          <SuitePanel className="h-full">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <span className="material-symbols-rounded text-base text-[var(--text-muted)]">psychology</span>
            Interview Readiness
          </h3>
          {profile.interviews.totalDebriefs === 0 ? (
            <div className="py-6 text-center">
              <span className="material-symbols-rounded mb-2 block text-[32px] text-[var(--text-muted)]">mic</span>
              <p className="text-xs text-[var(--text-muted)]">Log debriefs to see your interview readiness</p>
            </div>
          ) : (
            <>
              {/* avgConfidence and passRate are averaged from the confidence and
                  outcome the user logged per debrief — measured values, shown
                  only once at least one debrief exists. */}
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{profile.interviews.avgConfidence}%</p>
                  <p className="text-[11px] text-[var(--text-muted)]">Avg Confidence</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1">
                    <span
                      className="material-symbols-rounded text-sm"
                      style={{
                        color: profile.interviews.confidenceTrend === 'improving' ? 'var(--success)'
                          : profile.interviews.confidenceTrend === 'declining' ? 'var(--danger)' : 'var(--warning)',
                      }}
                    >
                      {profile.interviews.confidenceTrend === 'improving' ? 'trending_up'
                        : profile.interviews.confidenceTrend === 'declining' ? 'trending_down' : 'trending_flat'}
                    </span>
                    <span className="text-xs capitalize text-[var(--text-secondary)]">{profile.interviews.confidenceTrend}</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">{profile.interviews.passRate}% pass rate</p>
                </div>
              </div>

              {/* Category bars */}
              <div className="space-y-2">
                {[...profile.interviews.strongCategories.slice(0, 2), ...profile.interviews.weakCategories.slice(0, 2)]
                  .sort((a, b) => b.avgConfidence - a.avgConfidence)
                  .map((cat, i) => {
                    const catColor = cat.avgConfidence >= 70 ? 'var(--success)' : cat.avgConfidence >= 50 ? 'var(--warning)' : 'var(--danger)';
                    return (
                    <div key={cat.category} className="flex items-center gap-2">
                      <span className="w-24 truncate text-[11px] text-[var(--text-secondary)]">{cat.category}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
                        <motion.div className="h-full rounded-full"
                          style={{ background: catColor }}
                          initial={{ width: 0 }}
                          animate={{ width: `${cat.avgConfidence}%` }}
                          transition={{ duration: 0.6, delay: 0.6 + i * 0.1 }}
                        />
                      </div>
                      <span className="w-8 text-right text-[11px] font-bold" style={{ color: catColor }}>
                        {cat.avgConfidence}%
                      </span>
                    </div>
                    );
                  })}
              </div>
            </>
          )}
          </SuitePanel>
        </motion.div>
      </div>

      {/* ── Skill Landscape ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <SuitePanel>
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <span className="material-symbols-rounded text-base text-[var(--text-muted)]">hub</span>
          Skill Landscape
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Confirmed */}
          <div>
            <p className="mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--success)]" /> Confirmed ({profile.skills.confirmed.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {profile.skills.confirmed.slice(0, 10).map((s, index) => (
                <span key={`${s || 'confirmed-skill'}-${index}`} className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{ background: 'color-mix(in srgb, var(--success) 12%, transparent)', color: 'var(--success)', border: '1px solid color-mix(in srgb, var(--success) 24%, transparent)' }}>{s}</span>
              ))}
              {profile.skills.confirmed.length > 10 && (
                <span className="text-[11px] text-[var(--text-muted)]">+{profile.skills.confirmed.length - 10} more</span>
              )}
            </div>
          </div>

          {/* Market Hot — a market signal, not a verdict on the user, so these
              are neutral tags rather than a success/warning/danger colour. */}
          <div>
            <p className="mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--text-muted)]" /> In Demand ({profile.skills.marketHot.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {profile.skills.marketHot.slice(0, 8).map((s, index) => (
                <span key={`${s || 'market-skill'}-${index}`} className="wrap-natural rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">{s}</span>
              ))}
            </div>
          </div>

          {/* Gaps — three states, not two. An empty `gap` array means "compared
              you against N roles and found nothing missing" OR "never compared
              you against anything". The second is not a clean bill of health. */}
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: profile.skills.fitAnalysisCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}
              />
              Gaps{profile.skills.fitAnalysisCount > 0 ? ` (${profile.skills.gap.length})` : ''}
            </p>
            {profile.skills.fitAnalysisCount === 0 ? (
              <SuiteUnmeasured
                label="No job-fit analysis on record"
                reason="Gaps are the skills a job description asks for that your resume does not show. Nothing has been compared yet, so there is nothing to report — this is not a clean bill of health."
                density="compact"
              />
            ) : profile.skills.gap.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {profile.skills.gap.map((s, index) => (
                  <span key={`${s || 'skill-gap'}-${index}`} className="wrap-natural rounded-full px-2 py-0.5 text-[11px]"
                    style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--danger) 24%, transparent)' }}>{s}</span>
                ))}
              </div>
            ) : (
              <p className="premium-copy-wrap flex min-w-0 items-start gap-1 text-[11px] leading-4 text-[var(--text-secondary)]">
                <span className="material-symbols-rounded shrink-0 text-[12px] text-[var(--text-muted)]">remove</span>
                <span className="min-w-0">
                  No gaps found across {profile.skills.fitAnalysisCount} analyzed{' '}
                  {profile.skills.fitAnalysisCount === 1 ? 'role' : 'roles'}
                </span>
              </p>
            )}
          </div>
        </div>
        </SuitePanel>
      </motion.div>

      {/* ── Wellbeing + Search pace ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Morale */}
        <motion.div
          className="h-full"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
        >
          <SuitePanel className="h-full">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <span className="material-symbols-rounded text-base text-[var(--text-muted)]">self_improvement</span>
            Wellbeing
          </h3>
          {/* Morale is self-reported on the Weekly Pulse tab. With no check-in
              there is no score, no trend and no burnout risk — we do not tell a
              stranger how they feel. */}
          {profile.morale.current === null ? (
            <SuiteUnmeasured
              label="No morale check-ins yet"
              reason="Morale is something you report, not something we infer. Check in on the Weekly Pulse tab and it shows up here."
              action={
                <button
                  type="button"
                  onClick={() => setActiveTab('pulse')}
                  className="btn-secondary inline-flex min-h-11 items-center gap-1.5 px-3 py-2 text-xs font-semibold"
                >
                  <span className="material-symbols-rounded text-[14px]">monitor_heart</span>
                  Check in on Weekly Pulse
                </button>
              }
            />
          ) : (
          <div className="flex min-w-0 items-center gap-4">
            <span
              className="material-symbols-rounded shrink-0 text-[36px]"
              style={{ color: ['var(--danger)', 'var(--warning)', 'var(--text-muted)', 'var(--success)', 'var(--success)'][profile.morale.current - 1] || 'var(--text-muted)' }}
            >{['sentiment_very_dissatisfied', 'sentiment_dissatisfied', 'sentiment_neutral', 'sentiment_satisfied', 'sentiment_very_satisfied'][profile.morale.current - 1] || 'sentiment_neutral'}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{profile.morale.current}/5 Morale</p>
              {profile.morale.trend && (
                <p className="text-xs capitalize text-[var(--text-secondary)]">{profile.morale.trend} trend</p>
              )}
              {profile.morale.burnoutRisk && (
                <p
                  className="mt-0.5 text-[11px]"
                  style={{
                    color: profile.morale.burnoutRisk === 'low' ? 'var(--success)'
                      : profile.morale.burnoutRisk === 'moderate' ? 'var(--warning)' : 'var(--danger)',
                  }}
                >Burnout risk: {profile.morale.burnoutRisk}</p>
              )}
            </div>
          </div>
          )}
          {profile.morale.history.length > 0 && (
            <div className="mt-3 flex h-8 items-end gap-0.5">
              {profile.morale.history.map((m, i) => (
                <motion.div key={m.week} className="flex-1 rounded-t-sm"
                  initial={{ height: 0 }}
                  animate={{ height: `${m.score * 20}%` }}
                  transition={{ delay: 0.8 + i * 0.05 }}
                  style={{
                    background: m.score >= 4 ? 'var(--success)' : m.score >= 3 ? 'var(--warning)' : 'var(--danger)',
                    opacity: 0.6,
                  }}
                />
              ))}
            </div>
          )}
          </SuitePanel>
        </motion.div>

        {/* Search pace — counted, never projected. There is no honest weeks-to-offer
            number without the user's own offer conversion, which needs an offer. */}
        <motion.div
          className="h-full"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
        >
          <SuitePanel className="h-full">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <span className="material-symbols-rounded text-base text-[var(--text-muted)]">speed</span>
            Search pace
          </h3>
          {profile.pipeline.appliedApps > 0 ? (
            <div className="min-w-0">
              {/* Velocity carries one decimal. Rounded to an integer, one
                  application three weeks old printed "0 apps / week" directly
                  above "Applications tracked: 1". */}
              <p className="whitespace-nowrap text-3xl font-bold tabular-nums text-[var(--text-primary)]">
                {profile.pipeline.velocity}{' '}
                <span className="text-sm font-normal text-[var(--text-muted)]">sent / week</span>
              </p>
              <dl className="mt-3 space-y-1.5 text-xs">
                {[
                  { term: 'Applications tracked', value: `${profile.pipeline.totalApps}` },
                  { term: 'Marked as sent', value: `${profile.pipeline.appliedApps}` },
                  { term: 'Days active', value: `${profile.daysActive}` },
                  {
                    term: 'Responded',
                    value: `${profile.pipeline.responded} of ${profile.pipeline.appliedApps}`,
                  },
                ].map(row => (
                  <div key={row.term} className="flex min-w-0 items-baseline justify-between gap-3">
                    <dt className="min-w-0 text-[var(--text-secondary)]">{row.term}</dt>
                    <dd className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-[var(--text-primary)]">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="premium-copy-wrap mt-3 text-[11px] leading-4 text-[var(--text-muted)]">
                Counted from what you have tracked here. No timeline is projected from it.
              </p>
            </div>
          ) : (
            <SuiteUnmeasured
              label="No pace to report"
              reason={profile.pipeline.totalApps > 0
                ? `Pace counts applications you have marked as sent. ${profile.pipeline.totalApps} ${profile.pipeline.totalApps === 1 ? 'record is' : 'records are'} tracked but none are marked sent yet, so there is nothing to count.`
                : 'Pace is counted from the applications you track. None are tracked yet, so there is nothing to count.'}
              action={
                <button
                  type="button"
                  onClick={() => router.push('/suite/applications')}
                  className="btn-secondary inline-flex min-h-11 items-center gap-1.5 px-3 py-2 text-xs font-semibold"
                >
                  <span className="material-symbols-rounded text-[14px]">add</span>
                  Track an application
                </button>
              }
            />
          )}
          </SuitePanel>
        </motion.div>
      </div>

      </>)}
      </>)}
    </SuiteToolShell>
  );
}
