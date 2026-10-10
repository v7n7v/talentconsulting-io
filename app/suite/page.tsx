'use client';

import PageHelp from '@/components/PageHelp';
import { useToolGuidance, ToolGuidanceInvitation } from '@/components/guidance/ToolGuidanceProvider';
import { buildToolStory, storyStep } from '@/lib/tool-story-adapters';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { authFetch } from '@/lib/auth-fetch';
import { useUserTier } from '@/hooks/use-user-tier';
import { getPlanIdentity } from '@/lib/plan-identity';
import { PlanBadge } from '@/components/plan/PlanIdentity';
import JobFeedWidget from '@/components/JobFeedWidget';
import DashboardActionInbox from '@/components/dashboard/DashboardActionInbox';
import PhaseOneCommandCenter from '@/components/dashboard/PhaseOneCommandCenter';
import { SuitePanel, SuiteToolIcon, SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import {
  healthScoreBasis,
  normalizeCareerTwinSummary,
  type CareerTwinSummary,
  type HealthScoreBand,
} from '@/lib/career-twin-client';

type DashboardTwinProfile = {
  healthScore?: number;
  /** The bands the score was computed from. Needed to know if it can be rated. */
  healthBands?: HealthScoreBand[];
  skills?: { confirmed?: string[] };
  pipeline?: {
    velocity?: number;
    /** Records actually sent. `totalApps` includes never-sent morph records. */
    appliedApps?: number;
    /** Null when nothing has been sent. Never render it as 0%. */
    responseRate?: number | null;
  };
  interviews?: {
    totalDebriefs?: number;
  };
};

type DashboardTwinData = CareerTwinSummary & {
  profile?: DashboardTwinProfile;
};

// Tool groups matching sidebar organization
const toolGroups = [
  {
    label: 'Build',
    tools: [
      {
        id: 'resume', name: 'Resume Studio', description: 'AI-powered resume builder. Morph your resume for any JD.',
        path: '/suite/resume', iconName: 'auto_awesome',
      },
      {
        id: 'ats-analyzer', name: 'ATS Analyzer', description: 'See what Greenhouse, Lever, and Workday recruiters see.',
        path: '/suite/ats-analyzer', iconName: 'scanner',
      },
      {
        id: 'writing-toolkit', name: 'Writing Toolkit', description: 'Cover letters, LinkedIn profiles, AI humanizer, and recruiter-ready message utilities.',
        path: '/suite/gallery', iconName: 'widgets',
      },
    ],
  },
  {
    label: 'Search and Apply',
    tools: [
      {
        id: 'job-search', name: 'Job Search', description: 'Opportunity radar, fit scoring, and saved searches.',
        path: '/suite/job-search', iconName: 'radar',
      },
      {
        id: 'oracle', name: 'Market Oracle', description: 'Dual-AI JD decoder: fit score, salary intel, red flags, bridge skills.',
        path: '/suite/market-oracle', iconName: 'troubleshoot',
      },
      {
        id: 'applications', name: 'Applications', description: 'Track applications, interview stages, and follow-ups.',
        path: '/suite/applications', iconName: 'work',
      },
      {
        id: 'network', name: 'Network CRM', description: 'Contact Tracker and relationship management.',
        path: '/suite/network', iconName: 'contacts',
      },
      {
        id: 'agent-queue', name: 'Agent Queue', description: 'AI-prepared applications ready for review.',
        path: '/suite/agent/queue', iconName: 'smart_toy',
      },
    ],
  },
  {
    label: 'Prepare',
    tools: [
      {
        id: 'interview-sim', name: 'Interview Studio', description: 'Taco mock interviews, avatar mode, whiteboard, and saved debriefs.',
        path: '/suite/interview-sim', iconName: 'interpreter_mode',
      },
      {
        id: 'debrief', name: 'Interview Debrief', description: 'Log every interview. Track patterns and build confidence.',
        path: '/suite/interview-debrief', iconName: 'rate_review',
      },
      {
        id: 'stories', name: 'Story Bank', description: 'Your STAR stories. Auto-answers behavioral screening questions.',
        path: '/suite/agent/stories', iconName: 'auto_stories',
      },
      {
        id: 'skill-bridge', name: 'Skill Bridge', description: 'AI-generated learning paths. From resume gaps to ready.',
        path: '/suite/skill-bridge', iconName: 'route',
      },
    ],
  },
  {
    label: 'Grow',
    tools: [
      {
        id: 'intelligence', name: 'Career Intelligence', description: 'Health score, skill gaps, pipeline metrics, and AI recommendations.',
        path: '/suite/intelligence', badge: '2.5', iconName: 'neurology',
      },
      {
        id: 'pulse', name: 'Career Pulse', description: 'Pipeline health, velocity, stale alerts, and morale tracking.',
        path: '/suite/pulse', iconName: 'monitor_heart',
      },
      {
        id: 'analytics', name: 'Analytics', description: 'Pipeline insights, response rates, and conversion funnels.',
        path: '/suite/analytics', iconName: 'analytics',
      },
    ],
  },
];

// Dynamic greeting based on Twin intelligence
function getSmartGreeting(firstName: string, twinData: DashboardTwinData | null): { greeting: string; subtitle: string } {
  const hour = new Date().getHours();
  const timeGreet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (!twinData) {
    return { greeting: `${timeGreet}, ${firstName}`, subtitle: 'Your career intelligence hub. Every tool, one place.' };
  }

  const { completeness, behavioralBank, background } = twinData;
  const score = twinData.profile?.healthScore || 0;
  const basis = healthScoreBasis(twinData.profile?.healthBands);
  const sentApplications = twinData.profile?.pipeline?.appliedApps ?? 0;

  if (completeness?.score < 40) {
    const next = completeness.missing?.[0] || 'Resume uploaded';
    return { greeting: `${timeGreet}, ${firstName}`, subtitle: `Profile ${completeness.score}% complete. Next: ${next}.` };
  }
  if (behavioralBank?.coverageScore < 25 && behavioralBank?.totalStories < 3) {
    return { greeting: `${timeGreet}, ${firstName}`, subtitle: `Add STAR stories to cover ${behavioralBank.uncoveredCategories?.slice(0, 2).join(' & ') || 'key areas'}.` };
  }
  /*
   * Before any score-derived line, two facts that outrank it.
   *
   * healthScore is earned/available across measured items, so a user the
   * product has barely observed can score high on a thin slice of evidence.
   * `basis.ratingIsSupported` is the shared test for whether the number can
   * carry a word at all — see lib/career-twin-client.ts.
   *
   * And "keep the momentum going" needs momentum. A user with a resume,
   * debriefs and good morale but zero applications sent scored 85 here and was
   * congratulated on a search that has not started. Applications sent is not
   * an opinion.
   */
  if (sentApplications === 0) {
    return { greeting: `${timeGreet}, ${firstName}`, subtitle: `No applications sent yet. That is the next step.` };
  }
  if (!basis.ratingIsSupported) {
    return { greeting: `${timeGreet}, ${firstName}`, subtitle: `Tracking ${sentApplications} sent application${sentApplications === 1 ? '' : 's'}. More signal, sharper guidance.` };
  }
  if (score >= 70) {
    return { greeting: `${timeGreet}, ${firstName}`, subtitle: `You're in strong shape. Keep the momentum going.` };
  }
  if (score >= 45) {
    return { greeting: `${timeGreet}, ${firstName}`, subtitle: `${background?.targetRoles?.[0] ? `Progressing toward ${background.targetRoles[0]}.` : 'Room to grow. Keep pushing.'}` };
  }
  return { greeting: `${timeGreet}, ${firstName}`, subtitle: `Let's build your pipeline. Start with a resume upload.` };
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('') || 'TC';
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useStore();
  const { tier, loading: tierLoading, error: tierError, refetch: retryTier } = useUserTier();
  const userId = user?.uid || null;
  const [vaultStats, setVaultStats] = useState<{ owner: string | undefined; total: number; bridge: number; interview: number; flashcards: number } | null>(null);
  const [loadedTwin, setTwinData] = useState<DashboardTwinData | null>(null);
  const [contextOwner, setContextOwner] = useState<string | null>(null);
  const [contextState, setContextState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [contextRetry, setContextRetry] = useState(0);
  const twinData = userId && contextOwner === userId ? loadedTwin : null;
  const visibleContextState = !userId ? 'ready' : contextOwner === userId ? contextState : 'loading';
  const [activityRows, setRecentActivity] = useState<{ owner: string | undefined; icon: string; text: string; time: string; path: string }[]>([]);
  const recentActivity = activityRows.filter(row => row.owner === user?.uid);

  useEffect(() => {
    let active = true;
    const owner = user?.uid;
    if (!owner) return;
    authFetch('/api/vault/list?limit=20')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!active || useStore.getState().user?.uid !== owner || !data?.notes) return;
        const notes = data.notes as { type: string; title?: string; topic?: string; createdAt?: string }[];
        setVaultStats({
          owner,
          total: notes.length,
          bridge: notes.filter(n => n.type === 'skill-bridge').length,
          interview: notes.filter(n => n.type === 'interview').length,
          flashcards: notes.filter(n => n.type === 'flashcards').length,
        });
        // Build recent vault activity
        const typeMap: Record<string, { icon: string; label: string; path: string }> = {
          'skill-bridge': { icon: 'route', label: 'Skill Bridge memory saved', path: '/suite/skill-bridge?view=memory' },
          'interview': { icon: 'mic', label: 'Interview notes saved', path: '/suite/skill-bridge?view=memory' },
          'flashcards': { icon: 'edit_document', label: 'Flashcard session saved', path: '/suite/skill-bridge?view=memory' },
        };
        const vaultActivity = notes.slice(0, 3).map(n => {
          const cfg = typeMap[n.type] || { icon: 'note', label: 'Memory saved', path: '/suite/skill-bridge?view=memory' };
          return {
            owner,
            icon: cfg.icon,
            text: (n.title || n.topic) ? `${cfg.label}: ${n.title || n.topic}` : cfg.label,
            time: n.createdAt ? new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
            path: cfg.path,
          };
        });
        setRecentActivity(prev => [...prev.filter(row => row.owner === owner), ...vaultActivity].slice(0, 5));
      })
      .catch(() => { });
    return () => { active = false; };
  }, [user?.uid]);

  useEffect(() => {
    let active = true;
    const owner = userId;
    // This effect synchronizes the authenticated account with an external API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContextState(owner ? 'loading' : 'ready');
    setContextOwner(owner);
    setTwinData(null);
    if (!owner) return;
    authFetch('/api/agent/intelligence')
      .then(response => {
        if (!response.ok) throw new Error('Context unavailable');
        return response.json();
      })
      .then(data => {
        if (!active || (useStore.getState().user?.uid || null) !== owner) return;
        const twin = normalizeCareerTwinSummary(data?.twin);
        setTwinData(twin ? { ...twin, profile: data.profile } : null);
        setContextState('ready');
      })
      .catch(() => {
        if (active && (useStore.getState().user?.uid || null) === owner) setContextState('error');
      });
    return () => { active = false; };
  }, [userId, contextRetry]);

  // Fetch recent debriefs for activity feed
  useEffect(() => {
    let active = true;
    const owner = user?.uid;
    if (!owner) return;
    authFetch('/api/agent/debriefs')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!active || useStore.getState().user?.uid !== owner || !data?.debriefs) return;
        const debriefActivity = (data.debriefs as { company?: string; role?: string; created_at?: any }[]).slice(0, 2).map(d => ({
          owner,
          icon: 'rate_review',
          text: `Interview debrief${d.company ? `: ${d.company}` : ''}${d.role ? ` - ${d.role}` : ''}`,
          time: d.created_at ? new Date(typeof d.created_at === 'object' && d.created_at.seconds ? d.created_at.seconds * 1000 : d.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
          path: '/suite/interview-debrief',
        }));
        setRecentActivity(prev => [...debriefActivity, ...prev.filter(row => row.owner === owner)].slice(0, 5));
      })
      .catch(() => { });
    return () => { active = false; };
  }, [user?.uid]);

  const firstName = user?.displayName || user?.email?.split('@')[0] || 'there';
  const fullName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const initials = getInitials(fullName);
  const { greeting, subtitle } = getSmartGreeting(firstName, twinData);
  const plan = getPlanIdentity(tier);
  const targetRoles = twinData?.background?.targetRoles || [];
  const currentTitle = twinData?.background?.currentTitle || '';
  const trajectoryText = currentTitle && targetRoles.length
    ? `${currentTitle} to ${targetRoles[0]}`
    : currentTitle || targetRoles[0] || subtitle;

  useToolGuidance(buildToolStory({
    toolId: 'dashboard', title: 'Home', contextKey: 'home',
    purpose: 'Orient to the current account snapshot and choose real work to continue.',
    pending: visibleContextState === 'loading', failed: visibleContextState === 'error',
    work: [storyStep('next', 'Read the next useful action', 'The current context explains a suggested priority or the missing prerequisite. Opening a task is your choice.', 'home-next-action'), storyStep('tools', 'Find the tool you need', 'Open More tools yourself to browse the existing destinations. Guidance does not rearrange navigation or start work.', 'home-tools'), storyStep('history', 'Return to actual activity', 'Recent activity reopens recorded work when available. An empty history is not a career-progress score.', 'home-history', 'Recent activity appears when this account has loaded recorded activity.')],
    recovery: [storyStep('retry', 'Refresh account context', 'The next-action area retains its named retry. Choose it yourself; no new priority is implied until the read succeeds.', 'home-next-action')],
  }));

  const nextActionBlock = <PhaseOneCommandCenter twin={twinData} state={visibleContextState} onRetry={() => setContextRetry(value => value + 1)} className="taco-home-next-action" />;
  const todayBlock = user
    ? <DashboardActionInbox key={user.uid} className="taco-home-today" />
    : null;

  return (
    <SuiteToolShell variant="standard" contentClassName="gap-0 taco-home-shell">
      <header className="relative taco-home-greeting mb-4 flex min-w-0 items-start gap-3" aria-labelledby="suite-command-center-title">
        <div className="grid h-11 w-11 shrink-0 place-items-center border border-[var(--workspace-ink)] bg-[var(--bg-surface)] text-sm font-bold text-[var(--text-primary)] elevation-card">
          {initials}
        </div>
        <div className="min-w-0 flex-1 pr-12">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 id="suite-command-center-title" className="text-2xl font-bold leading-tight text-[var(--text-primary)]">{greeting}</h1>
            {tierLoading ? (
              <span className="text-xs text-[var(--text-secondary)]" role="status">Checking plan…</span>
            ) : tierError ? (
              <button type="button" onClick={retryTier} className="min-h-11 text-xs text-[var(--text-secondary)] underline underline-offset-2" title={tierError}>
                Plan unavailable · Retry
              </button>
            ) : <PlanBadge tier={tier} active={plan.id !== 'free'} />}
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-[var(--text-secondary)]">{trajectoryText}</p>
          <ToolGuidanceInvitation toolId="dashboard" />
        </div>
        <div className="absolute right-0 top-0"><PageHelp toolId="dashboard" /></div>
      </header>
      <div data-guide="home-next-action">{nextActionBlock}</div>
      {todayBlock}

      {/* ── Opportunity Radar Widget ── */}
      {user && <div className="taco-home-opportunities"><JobFeedWidget /></div>}

      {/* ── Grouped Tool Grid ── */}
      <details className="taco-home-tools mb-5 rounded-[4px] border border-[var(--workspace-ink)] bg-[var(--bg-surface)] elevation-card">
        <summary data-guide="home-tools" className="flex min-h-11 cursor-pointer items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)]">
          More tools
          <span className="material-symbols-rounded text-[18px]" aria-hidden="true">expand_more</span>
        </summary>
        <div className="border-t border-[var(--border-subtle)] p-4">
        {toolGroups.map((group) => (
        <section key={group.label} className="taco-home-tools mb-5 last:mb-0" aria-labelledby={`suite-tools-${group.label.toLowerCase().replace(/\s+/g, '-')}`}>
          <h2
            id={`suite-tools-${group.label.toLowerCase().replace(/\s+/g, '-')}`}
            className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]"
          >
            {group.label}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.tools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => router.push(tool.path)}
                className="group flex min-h-[124px] min-w-0 flex-col rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] elevation-interactive p-4 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <SuiteToolIcon icon={tool.iconName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="premium-heading-wrap min-w-0 flex-1 text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
                        {tool.name}
                      </h3>
                      {tool.badge && (
                        <span className="shrink-0 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                          {tool.badge}
                        </span>
                      )}
                    </div>
                    <p className="premium-copy-wrap mt-2 text-[13px] leading-5 text-[var(--text-secondary)]">
                      {tool.description}
                    </p>
                  </div>
                </div>
                <span className="mt-auto pt-3 text-[11px] font-medium text-[var(--text-muted)] group-hover:text-[var(--text-primary)]">
                  Open
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
        </div>
      </details>

      {/* ── Recent Activity ── */}
      {recentActivity.length > 0 && (
        <div data-guide="home-history" className="taco-home-recent mb-2 mt-4">
          <div className="elevation-card rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            <h2 className="text-xs font-medium text-[var(--text-secondary)] mb-3 flex items-center gap-2">
              <span className="material-symbols-rounded icon-neutral text-[14px]">history</span>
              Recent Activity
            </h2>
            <div className="space-y-1">
              {recentActivity.map((activity, i) => (
                <button
                  key={i}
                  onClick={() => router.push(activity.path)}
                  className="w-full flex min-h-11 items-center gap-3 px-2 py-1.5 rounded-lg text-left hover:bg-[var(--bg-hover)] transition-colors duration-100 group"
                >
                  <span className="material-symbols-rounded icon-neutral text-[14px]">{activity.icon}</span>
                  <span className="flex-1 text-[12px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate transition-colors">{activity.text}</span>
                  {activity.time && <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">{activity.time}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Skill Bridge Memory Strip ── */}
      {vaultStats && vaultStats.owner === user?.uid && vaultStats.total > 0 && (
        <div className="taco-home-memory mt-3">
          <button
            type="button"
            onClick={() => router.push('/suite/skill-bridge?view=memory')}
            className="group flex min-h-11 w-full min-w-0 items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] elevation-interactive px-4 py-3 text-left transition-colors duration-100 hover:border-[var(--border)] hover:bg-[var(--bg-hover)]"
          >
            <span className="material-symbols-rounded icon-neutral text-[18px]" aria-hidden="true">inventory_2</span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <span className="text-xs text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">{vaultStats.total}</span> saved prep item{vaultStats.total !== 1 ? 's' : ''} in Skill Bridge Memory
              </span>
              {vaultStats.bridge > 0 && (
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                  {vaultStats.bridge} Skill Bridge
                </span>
              )}
              {vaultStats.interview > 0 && (
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                  {vaultStats.interview} Interview
                </span>
              )}
              {vaultStats.flashcards > 0 && (
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                  {vaultStats.flashcards} Flashcards
                </span>
              )}
            </div>
            <span className="material-symbols-rounded text-[14px] text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-primary)]" aria-hidden="true">arrow_forward</span>
          </button>
        </div>
      )}
    </SuiteToolShell>
  );
}
