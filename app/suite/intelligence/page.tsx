'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/components/ThemeProvider';
import { useStore } from '@/lib/store';
import { authFetch } from '@/lib/auth-fetch';
import { openSona } from '@/lib/assistant/execution-context';
import {
  careerTwinPromptMetadata,
  clampScore,
  compactList,
  formatSalaryFloor,
  metricValue,
  normalizeCareerTwinMemory,
  normalizeCareerTwinSummary,
  priorityClass,
  titleCase,
  type CareerTwinSummary,
} from '@/lib/career-twin-client';
import { SuitePanel, SuiteToolHeader, SuiteToolIcon, SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import dynamic from 'next/dynamic';

const PulseTab = dynamic(() => import('@/app/suite/pulse/PulseContent').then(m => ({ default: m.PulseContent })), {
  loading: () => <div className="h-64 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />,
});

const AnalyticsTab = dynamic(() => import('@/app/suite/analytics/AnalyticsContent').then(m => ({ default: m.AnalyticsContent })), {
  loading: () => <div className="h-64 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />,
});

type IntelTab = 'overview' | 'pulse' | 'analytics' | 'outcomes';

interface CareerProfile {
  healthScore: number;
  daysActive: number;
  estimatedWeeksToOffer: number | null;
  hasResume: boolean;
  resumeVersionCount: number;
  skills: {
    confirmed: string[]; growing: string[]; weak: string[];
    marketHot: string[]; gap: string[];
  };
  pipeline: {
    totalApps: number; thisWeekApps: number; velocity: number;
    responseRate: number; interviewConversion: number; offerConversion: number;
    ghostRate: number; topCompanies: string[];
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
    current: number; trend: string; burnoutRisk: string;
    history: { week: string; score: number }[];
  };
}

interface Recommendation {
  id: string; priority: string; icon: string; title: string;
  description: string; action: string; actionPath: string; color: string;
  category: string;
}

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
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
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
              className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
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
  const activeSearch = memory.activeSearch || {
    totalApplications: 0,
    responseRate: 0,
    velocity: 0,
    queuedApplications: 0,
    staleApplications: 0,
    skillGaps: [],
  };
  const completeness = clampScore(normalizedTwin.completeness.score);
  const coverage = clampScore(normalizedTwin.behavioralBank.coverageScore);
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
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
              >
                <Icon name="auto_awesome" className="text-[18px]" />
                Ask Taco
              </button>
              <button
                type="button"
                onClick={onExport}
                disabled={!normalizedTwin.exportable || exporting}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
              >
                <Icon name={exporting ? 'progress_activity' : 'download'} className={`text-[16px] ${exporting ? 'animate-spin' : ''}`} />
                {normalizedTwin.exportable ? 'Export JSON' : 'Export locked'}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MemoryFact label="Completeness" value={`${completeness}%`} icon="fact_check" />
            <MemoryFact label="Story coverage" value={`${coverage}% across ${normalizedTwin.behavioralBank.totalStories} stories`} icon="auto_stories" />
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
                <MemoryFact label="Response rate" value={metricValue(activeSearch.responseRate, '%')} icon="reply" />
                <MemoryFact label="Velocity" value={`${metricValue(activeSearch.velocity)}/week`} icon="speed" />
                <MemoryFact label="Stale apps" value={metricValue(activeSearch.staleApplications)} icon="schedule" />
                <MemoryFact label="Resume versions" value={metricValue(memory.confirmedFacts.resumeVersionCount)} icon="description" />
              </div>
              <div className="mt-4">
                <MemoryChipList
                  label="Skill gaps"
                  values={activeSearch.skillGaps}
                  empty="No skill gaps detected yet."
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
                      <span className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
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
                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
                  >
                    <Icon name="open_in_new" className="text-[15px]" />
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => onAskSona(`Prepare this Career Twin action for review: ${action.label}. Reason: ${action.reason}. Do not submit, message, or change anything externally.`, action.label)}
                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-3 text-xs font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
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
              <span className="text-xs font-bold tabular-nums text-[var(--text-primary)]">{completeness}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]" aria-label="Career Twin completeness">
              <div className="h-full rounded-full bg-[var(--text-primary)]" style={{ width: `${completeness}%` }} />
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
  const { theme } = useTheme();
  const isLight = theme === 'light';
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
      authFetch('/api/applications/outcome')
        .then(r => r.json())
        .then(data => {
          if (data.stats) setOutcomeStats(data.stats);
        })
        .catch(() => {})
        .finally(() => setOutcomeLoading(false));
    }
  }, [activeTab, user]);

  const cardBg = isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)';
  const cardBorder = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';

  const getScoreColor = (score: number) => {
    if (score >= 70) return '#22c55e';
    if (score >= 45) return '#f59e0b';
    return '#ef4444';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 65) return 'On Track';
    if (score >= 45) return 'Building';
    if (score >= 25) return 'Getting Started';
    return 'Just Starting';
  };

  // Moved loading/error into main render return

  const scoreColor = getScoreColor(profile?.healthScore ?? 0);
  const scoreCircumference = 2 * Math.PI * 54;
  const scoreOffset = scoreCircumference - ((profile?.healthScore ?? 0) / 100) * scoreCircumference;

  return (
    <SuiteToolShell variant="standard">
      <SuiteToolHeader tool="intelligence">
        <div className="flex gap-1 p-1 rounded-xl w-full sm:w-fit mt-3 overflow-x-auto scrollbar-hide" style={{
          background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
        }}>
          {([
            { key: 'overview' as IntelTab, label: 'Overview', icon: 'neurology' },
            { key: 'pulse' as IntelTab, label: 'Weekly Pulse', icon: 'monitor_heart' },
            { key: 'analytics' as IntelTab, label: 'Analytics', icon: 'bar_chart' },
            { key: 'outcomes' as IntelTab, label: 'Outcomes', icon: 'fact_check' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <span className="material-symbols-rounded text-[18px]">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </SuiteToolHeader>

      {/* Pulse Tab */}
      {activeTab === 'pulse' && <PulseTab />}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && <AnalyticsTab />}

      {/* Outcomes Tab */}
      {activeTab === 'outcomes' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {outcomeLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
              ))}
            </div>
          ) : outcomeStats ? (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: 'Response Rate', value: `${outcomeStats.responseRate || 0}%`, icon: 'reply', color: '#06b6d4', desc: 'Apps that got a reply' },
                  { label: 'Ghost Rate', value: `${outcomeStats.ghostRate || 0}%`, icon: 'visibility_off', color: '#6b7280', desc: 'No response after 14+ days' },
                  { label: 'Avg Response', value: outcomeStats.avgDaysToResponse ? `${outcomeStats.avgDaysToResponse}d` : '—', icon: 'schedule', color: '#f59e0b', desc: 'Days until first response' },
                  { label: 'Interview Rate', value: `${outcomeStats.interviewRate || 0}%`, icon: 'groups', color: '#8b5cf6', desc: 'Apps that led to interviews' },
                  { label: 'Offer Rate', value: `${outcomeStats.offerRate || 0}%`, icon: 'celebration', color: '#22c55e', desc: 'Apps that resulted in offers' },
                ].map((kpi, i) => (
                  <motion.div
                    key={kpi.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="rounded-xl p-4"
                    style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${kpi.color}15` }}>
                        <span className="material-symbols-rounded text-[16px]" style={{ color: kpi.color }}>{kpi.icon}</span>
                      </div>
                      <span className="text-[10px] text-[var(--text-tertiary)] font-medium">{kpi.label}</span>
                    </div>
                    <p className="text-2xl font-black text-[var(--text-primary)] tabular-nums mb-0.5">{kpi.value}</p>
                    <p className="text-[9px] text-[var(--text-muted)]">{kpi.desc}</p>
                  </motion.div>
                ))}
              </div>

              {/* Outcome Breakdown Bar Chart */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="rounded-2xl p-5"
                style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <span className="material-symbols-rounded text-base" style={{ color: '#06b6d4' }}>donut_large</span>
                  Outcome Breakdown
                </h3>
                {(() => {
                  const outcomes = [
                    { key: 'callback', label: 'Callback', count: outcomeStats.callbackCount || 0, color: '#3b82f6' },
                    { key: 'interview', label: 'Interview', count: outcomeStats.interviewCount || 0, color: '#8b5cf6' },
                    { key: 'offer', label: 'Offer', count: outcomeStats.offerCount || 0, color: '#22c55e' },
                    { key: 'rejection', label: 'Rejected', count: outcomeStats.rejectionCount || 0, color: '#ef4444' },
                    { key: 'ghosted', label: 'Ghosted', count: outcomeStats.ghostedCount || 0, color: '#6b7280' },
                  ];
                  const maxCount = Math.max(...outcomes.map(o => o.count), 1);
                  const totalOutcomes = outcomes.reduce((s, o) => s + o.count, 0);

                  return totalOutcomes > 0 ? (
                    <div className="space-y-3">
                      {outcomes.filter(o => o.count > 0).map((outcome, i) => (
                        <div key={outcome.key}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: outcome.color }} />
                              <span className="text-xs font-semibold text-[var(--text-secondary)]">{outcome.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black tabular-nums" style={{ color: outcome.color }}>{outcome.count}</span>
                              <span className="text-[10px] text-[var(--text-muted)]">
                                ({Math.round((outcome.count / totalOutcomes) * 100)}%)
                              </span>
                            </div>
                          </div>
                          <div className="h-3 rounded-full overflow-hidden" style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)' }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: `linear-gradient(90deg, ${outcome.color}, ${outcome.color}cc)` }}
                              initial={{ width: 0 }}
                              animate={{ width: `${(outcome.count / maxCount) * 100}%` }}
                              transition={{ delay: i * 0.1, duration: 0.6 }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <span className="material-symbols-rounded text-[28px] block mb-2" style={{ color: '#6b7280' }}>fact_check</span>
                      <p className="text-xs text-[var(--text-muted)]">No outcomes reported yet. Report outcomes from the Applications page.</p>
                    </div>
                  );
                })()}
              </motion.div>

              {/* Insight Card */}
              {outcomeStats.totalReported > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="rounded-2xl p-4 flex items-start gap-3"
                  style={{
                    background: `${(outcomeStats.responseRate || 0) >= 20 ? '#22c55e' : '#f59e0b'}08`,
                    border: `1px solid ${(outcomeStats.responseRate || 0) >= 20 ? '#22c55e' : '#f59e0b'}20`,
                  }}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{
                    background: `${(outcomeStats.responseRate || 0) >= 20 ? '#22c55e' : '#f59e0b'}15`,
                  }}>
                    <span className="material-symbols-rounded text-lg" style={{
                      color: (outcomeStats.responseRate || 0) >= 20 ? '#22c55e' : '#f59e0b',
                    }}>
                      {(outcomeStats.responseRate || 0) >= 20 ? 'trending_up' : 'lightbulb'}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{
                      color: (outcomeStats.responseRate || 0) >= 20 ? '#22c55e' : '#f59e0b',
                    }}>Outcome Insight</p>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                      {(outcomeStats.responseRate || 0) >= 20
                        ? `Your ${outcomeStats.responseRate}% response rate is across ${outcomeStats.totalReported} reported outcomes.`
                        : (outcomeStats.ghostRate || 0) > 60
                          ? `${outcomeStats.ghostRate}% of your applications went silent. Consider following up 7-10 days after applying, and use ATS Preview to optimize keyword matching.`
                          : `You've reported ${outcomeStats.totalReported} outcomes. Keep tracking to unlock deeper conversion insights and refine your strategy.`
                      }
                    </p>
                  </div>
                </motion.div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <div className="max-w-sm mx-auto rounded-2xl p-8 relative overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-emerald-500/5" />
                <div className="relative">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <span className="material-symbols-rounded text-3xl text-cyan-500">fact_check</span>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">No Outcome Data</h3>
                  <p className="text-sm text-[var(--text-tertiary)] mb-5">Report outcomes on your applications to see conversion metrics here.</p>
                  <button
                    onClick={() => router.push('/suite/applications')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #06b6d4, #10b981)', boxShadow: '0 4px 16px rgba(6,182,212,0.3)' }}
                  >
                    <span className="material-symbols-rounded text-sm">open_in_new</span>
                    Go to Applications
                  </button>
                </div>
              </div>
            </div>
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

      {!loading && !profile && (
        <div className="space-y-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-8">
            <div className="max-w-sm mx-auto rounded-2xl p-8 relative overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-indigo-500/5" />
              <div className="relative">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <span className="material-symbols-rounded text-3xl text-violet-500">neurology</span>
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Unable to Load Intelligence</h3>
                <p className="text-sm text-[var(--text-tertiary)] mb-5">Start using the suite tools to build your career profile.</p>
                <button onClick={loadIntelligence}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', boxShadow: '0 4px 16px rgba(139,92,246,0.3)' }}>
                  <span className="material-symbols-rounded text-sm">refresh</span>
                  Try Again
                </button>
              </div>
            </div>
          </motion.div>
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
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-8"
        style={{
          background: `linear-gradient(135deg, ${scoreColor}06, ${cardBg})`,
          border: `1px solid ${scoreColor}20`,
        }}
      >
        {/* Animated Ring */}
        <div className="relative w-24 h-24 sm:w-32 sm:h-32 flex-shrink-0">
          <svg viewBox="0 0 120 120" className="w-24 h-24 sm:w-32 sm:h-32 -rotate-90">
            <circle cx="60" cy="60" r="54" fill="none" strokeWidth="6"
              stroke={isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'} />
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
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Health</span>
          </div>
        </div>

        {/* Score Context */}
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg font-bold" style={{ color: scoreColor }}>{getScoreLabel(profile.healthScore)}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: `${scoreColor}15`, color: scoreColor, border: `1px solid ${scoreColor}25` }}>
              {profile.daysActive}d active
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            {profile.healthScore >= 70
              ? 'Your career search is in great shape. Keep the momentum going.'
              : profile.healthScore >= 45
                ? 'Solid foundation. Focus on the recommendations below to level up.'
                : 'You\'re just getting started. Each action you take builds your intelligence.'}
          </p>
          <div className="flex flex-wrap gap-3 sm:gap-4 text-[10px]">
            {[
              { label: 'Activity', score: Math.min(30, Math.round(profile.healthScore * 0.3)), max: 30, color: '#3b82f6' },
              { label: 'Performance', score: Math.min(35, Math.round(profile.healthScore * 0.35)), max: 35, color: '#22c55e' },
              { label: 'Preparedness', score: Math.min(20, Math.round(profile.healthScore * 0.2)), max: 20, color: '#f59e0b' },
              { label: 'Wellbeing', score: Math.min(15, Math.round(profile.healthScore * 0.15)), max: 15, color: '#8b5cf6' },
            ].map(dim => (
              <div key={dim.label}>
                <span className="text-[var(--text-muted)] block mb-0.5">{dim.label} ({dim.score}/{dim.max})</span>
                <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)' }}>
                  <motion.div className="h-full rounded-full" style={{ background: dim.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(dim.score / dim.max) * 100}%` }}
                    transition={{ duration: 1, delay: 0.3 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 text-center">
          {[
            { label: 'Apps', value: profile.pipeline.totalApps, icon: 'send' },
            { label: 'Interviews', value: profile.interviews.totalDebriefs, icon: 'groups' },
            { label: 'Stories', value: profile.stories.totalStories, icon: 'auto_stories' },
            { label: 'Skills', value: profile.skills.confirmed.length, icon: 'code' },
          ].map(s => (
            <div key={s.label} className="px-3 py-2 rounded-lg" style={{ background: cardBg }}>
              <span className="material-symbols-rounded text-[14px] text-[var(--text-muted)]">{s.icon}</span>
              <p className="text-lg font-bold text-[var(--text-primary)]">{s.value}</p>
              <p className="text-[9px] text-[var(--text-muted)]">{s.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

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
          <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <span className="material-symbols-rounded text-base" style={{ color: '#f59e0b' }}>lightbulb</span>
            Smart Recommendations ({recommendations.length})
          </h2>
          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <motion.div
                key={rec.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.06 }}
                className="flex items-start gap-3 p-4 rounded-xl cursor-pointer group"
                style={{
                  background: cardBg,
                  border: `1px solid ${rec.priority === 'critical' ? `${rec.color}30` : cardBorder}`,
                }}
                onClick={() => router.push(rec.actionPath)}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${rec.color}12`, border: `1px solid ${rec.color}20` }}>
                  <span className="material-symbols-rounded text-lg" style={{ color: rec.color }}>{rec.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{rec.title}</p>
                    {rec.priority === 'critical' && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase" style={{
                        background: `${rec.color}15`, color: rec.color,
                      }}>Critical</span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mb-1.5">{rec.description}</p>
                  <span className="text-[11px] font-bold group-hover:underline" style={{ color: rec.color }}>
                    {rec.action} →
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Pipeline Funnel ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="rounded-xl p-5"
          style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <span className="material-symbols-rounded text-base text-blue-500">filter_alt</span>
            Pipeline Funnel
          </h3>
          {[
            { label: 'Applied', value: profile.pipeline.totalApps, pct: 100, color: '#3b82f6' },
            { label: 'Responded', value: Math.round(profile.pipeline.totalApps * profile.pipeline.responseRate / 100), pct: profile.pipeline.responseRate, color: '#06b6d4' },
            { label: 'Interviews', value: profile.interviews.totalDebriefs, pct: profile.pipeline.interviewConversion, color: '#8b5cf6' },
            { label: 'Offers', value: Math.round(profile.pipeline.totalApps * profile.pipeline.offerConversion / 10000), pct: profile.pipeline.offerConversion, color: '#22c55e' },
          ].map((stage, i) => (
            <div key={stage.label} className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[var(--text-secondary)]">{stage.label}</span>
                <span className="text-xs font-bold text-[var(--text-primary)]">{stage.value}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)' }}>
                <motion.div className="h-full rounded-full" style={{ background: stage.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(2, Math.min(100, stage.pct))}%` }}
                  transition={{ duration: 0.8, delay: 0.5 + i * 0.1 }}
                />
              </div>
              {i > 0 && (
                <span className="text-[9px] mt-0.5 block" style={{ color: stage.color }}>{stage.pct}% conversion</span>
              )}
            </div>
          ))}
        </motion.div>

        {/* ── Interview Radar ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="rounded-xl p-5"
          style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <span className="material-symbols-rounded text-base text-purple-500">psychology</span>
            Interview Readiness
          </h3>
          {profile.interviews.totalDebriefs === 0 ? (
            <div className="text-center py-6">
              <span className="material-symbols-rounded text-[32px] block mb-2" style={{ color: '#6b7280' }}>mic</span>
              <p className="text-xs text-[var(--text-muted)]">Log debriefs to see your interview readiness</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{profile.interviews.avgConfidence}%</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Avg Confidence</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-rounded text-sm" style={{
                      color: profile.interviews.confidenceTrend === 'improving' ? '#22c55e'
                        : profile.interviews.confidenceTrend === 'declining' ? '#ef4444' : '#f59e0b',
                    }}>
                      {profile.interviews.confidenceTrend === 'improving' ? 'trending_up'
                        : profile.interviews.confidenceTrend === 'declining' ? 'trending_down' : 'trending_flat'}
                    </span>
                    <span className="text-xs capitalize text-[var(--text-secondary)]">{profile.interviews.confidenceTrend}</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)]">{profile.interviews.passRate}% pass rate</p>
                </div>
              </div>

              {/* Category bars */}
              <div className="space-y-2">
                {[...profile.interviews.strongCategories.slice(0, 2), ...profile.interviews.weakCategories.slice(0, 2)]
                  .sort((a, b) => b.avgConfidence - a.avgConfidence)
                  .map((cat, i) => (
                    <div key={cat.category} className="flex items-center gap-2">
                      <span className="text-[10px] w-24 text-[var(--text-secondary)] truncate">{cat.category}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)' }}>
                        <motion.div className="h-full rounded-full"
                          style={{ background: cat.avgConfidence >= 70 ? '#22c55e' : cat.avgConfidence >= 50 ? '#f59e0b' : '#ef4444' }}
                          initial={{ width: 0 }}
                          animate={{ width: `${cat.avgConfidence}%` }}
                          transition={{ duration: 0.6, delay: 0.6 + i * 0.1 }}
                        />
                      </div>
                      <span className="text-[10px] font-bold w-8 text-right"
                        style={{ color: cat.avgConfidence >= 70 ? '#22c55e' : cat.avgConfidence >= 50 ? '#f59e0b' : '#ef4444' }}>
                        {cat.avgConfidence}%
                      </span>
                    </div>
                  ))}
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* ── Skill Landscape ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
        className="rounded-xl p-5"
        style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
      >
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <span className="material-symbols-rounded text-base text-cyan-500">hub</span>
          Skill Landscape
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Confirmed */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Confirmed ({profile.skills.confirmed.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {profile.skills.confirmed.slice(0, 10).map((s, index) => (
                <span key={`${s || 'confirmed-skill'}-${index}`} className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: '#22c55e12', color: '#22c55e', border: '1px solid #22c55e20' }}>{s}</span>
              ))}
              {profile.skills.confirmed.length > 10 && (
                <span className="text-[10px] text-[var(--text-muted)]">+{profile.skills.confirmed.length - 10} more</span>
              )}
            </div>
          </div>

          {/* Market Hot */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-500" /> In Demand ({profile.skills.marketHot.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {profile.skills.marketHot.slice(0, 8).map((s, index) => (
                <span key={`${s || 'market-skill'}-${index}`} className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: '#f9731612', color: '#f97316', border: '1px solid #f9731620' }}>{s}</span>
              ))}
            </div>
          </div>

          {/* Gaps */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" /> Gaps ({profile.skills.gap.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {profile.skills.gap.map((s, index) => (
                <span key={`${s || 'skill-gap'}-${index}`} className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: '#ef444412', color: '#ef4444', border: '1px solid #ef444420' }}>{s}</span>
              ))}
              {profile.skills.gap.length === 0 && (
                <span className="text-[10px] text-emerald-500">No gaps detected ✓</span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Morale + Time to Offer ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Morale */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
          className="rounded-xl p-5"
          style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <span className="material-symbols-rounded text-base" style={{ color: '#ec4899' }}>self_improvement</span>
            Wellbeing
          </h3>
          <div className="flex items-center gap-4">
            <span className="material-symbols-rounded text-[36px]" style={{ color: ['#ef4444', '#f59e0b', '#6b7280', '#22c55e', '#10b981'][profile.morale.current - 1] || '#6b7280' }}>{['sentiment_very_dissatisfied', 'sentiment_dissatisfied', 'sentiment_neutral', 'sentiment_satisfied', 'sentiment_very_satisfied'][profile.morale.current - 1] || 'sentiment_neutral'}</span>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{profile.morale.current}/5 Morale</p>
              <p className="text-xs text-[var(--text-secondary)] capitalize">{profile.morale.trend} trend</p>
              <p className="text-[10px] mt-0.5" style={{
                color: profile.morale.burnoutRisk === 'low' ? '#22c55e'
                  : profile.morale.burnoutRisk === 'moderate' ? '#f59e0b' : '#ef4444',
              }}>Burnout risk: {profile.morale.burnoutRisk}</p>
            </div>
          </div>
          {profile.morale.history.length > 0 && (
            <div className="flex items-end gap-0.5 h-8 mt-3">
              {profile.morale.history.map((m, i) => (
                <motion.div key={m.week} className="flex-1 rounded-t-sm"
                  initial={{ height: 0 }}
                  animate={{ height: `${m.score * 20}%` }}
                  transition={{ delay: 0.8 + i * 0.05 }}
                  style={{
                    background: m.score >= 4 ? '#22c55e' : m.score >= 3 ? '#f59e0b' : '#ef4444',
                    opacity: 0.6,
                  }}
                />
              ))}
            </div>
          )}
        </motion.div>

        {/* Time to Offer */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
          className="rounded-xl p-5"
          style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <span className="material-symbols-rounded text-base text-blue-500">timer</span>
            Estimated Time to Offer
          </h3>
          {profile.estimatedWeeksToOffer ? (
            <div>
              <p className="text-3xl font-bold text-[var(--text-primary)]">
                ~{profile.estimatedWeeksToOffer} <span className="text-sm font-normal text-[var(--text-muted)]">weeks</span>
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                At {profile.pipeline.velocity} apps/week with {profile.pipeline.responseRate}% response rate
              </p>
                <span className="text-[10px] text-[var(--text-muted)] mt-2 flex items-center gap-1">
                  <span className="material-symbols-rounded text-[12px]">bar_chart</span> Based on: 40 apps → 8 responses → 3 interviews → 1 offer (industry avg)
                </span>
            </div>
          ) : (
            <div className="text-center py-4">
              <span className="material-symbols-rounded text-[28px] block mb-1" style={{ color: '#6b7280' }}>timer</span>
              <p className="text-xs text-[var(--text-muted)]">Apply to more jobs to estimate your timeline</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Your Edge ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
        className="rounded-xl overflow-hidden"
        style={{ border: `1px solid ${cardBorder}` }}
      >
        <div className="px-5 py-3.5 flex items-center gap-2" style={{
          background: isLight ? 'rgba(34,197,94,0.04)' : 'rgba(34,197,94,0.06)',
          borderBottom: `1px solid ${cardBorder}`,
        }}>
          <span className="material-symbols-rounded text-base" style={{ color: '#22c55e' }}>shield</span>
          <span className="text-sm font-bold text-[var(--text-primary)]">Your Edge vs. Mass Apply</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x" style={{ borderColor: cardBorder }}>
          {/* Your approach */}
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black" style={{ background: '#22c55e20', color: '#22c55e' }}>✓</span>
              <span className="text-xs font-bold text-[var(--text-primary)]">Your Approach</span>
            </div>
            {[
              { label: 'Tailored resumes per job', stat: `${profile.resumeVersionCount} morphed versions`, active: profile.resumeVersionCount > 0 },
              { label: 'Fit analysis before applying', stat: `${profile.pipeline.responseRate}% response rate`, active: profile.pipeline.responseRate > 0 },
              { label: 'Interview prep + debriefs', stat: `${profile.interviews.totalDebriefs} debriefs logged`, active: profile.interviews.totalDebriefs > 0 },
              { label: 'Story bank for answers', stat: `${profile.stories.totalStories} STAR stories`, active: profile.stories.totalStories > 0 },
              { label: 'Skill gap tracking', stat: `${profile.skills.gap.length} gaps identified`, active: true },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-2">
                <span className="material-symbols-rounded text-[14px] mt-0.5" style={{ color: item.active ? '#22c55e' : 'var(--text-muted)' }}>
                  {item.active ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                <div>
                  <p className="text-xs text-[var(--text-primary)]">{item.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{item.stat}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Industry average */}
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black" style={{ background: '#ef444420', color: '#ef4444' }}>✗</span>
              <span className="text-xs font-bold text-[var(--text-primary)]">Mass Apply Stats</span>
            </div>
            {[
              { label: 'Generic resume for every job', stat: '2-3% callback rate' },
              { label: 'No fit analysis', stat: '85% of apps are poor matches' },
              { label: 'No interview prep', stat: '60% ghost after first round' },
              { label: 'No answer preparation', stat: 'Winging behavioral questions' },
              { label: 'No post-interview reflection', stat: 'Repeat same mistakes' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-2">
                <span className="material-symbols-rounded text-[14px] mt-0.5" style={{ color: '#ef4444' }}>cancel</span>
                <div>
                  <p className="text-xs text-[var(--text-secondary)]">{item.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{item.stat}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom insight */}
        <div className="px-5 py-3 text-center" style={{
          background: isLight ? 'rgba(34,197,94,0.03)' : 'rgba(34,197,94,0.04)',
          borderTop: `1px solid ${cardBorder}`,
        }}>
          <p className="text-[11px] text-[var(--text-secondary)]">
            <span className="font-bold" style={{ color: '#22c55e' }}>Intelligence-first</span> applicants see{' '}
            <span className="font-bold text-[var(--text-primary)]">3-5x higher</span> response rates compared to spray-and-pray.
          </p>
        </div>
      </motion.div>
      </>)}
      </>)}
    </SuiteToolShell>
  );
}
