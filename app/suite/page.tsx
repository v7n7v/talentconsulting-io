'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { authFetch } from '@/lib/auth-fetch';
import { useUserTier } from '@/hooks/use-user-tier';
import { getPlanIdentity } from '@/lib/plan-identity';
import { PlanBadge, PlanFeatureList, PlanStatusStrip } from '@/components/plan/PlanIdentity';
import JobFeedWidget from '@/components/JobFeedWidget';
import DashboardActionInbox from '@/components/dashboard/DashboardActionInbox';
import PhaseOneCommandCenter from '@/components/dashboard/PhaseOneCommandCenter';
import { SuitePanel, SuiteToolIcon, SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import {
  healthScoreBasis,
  normalizeCareerTwinSummary,
  percentOrDash,
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

const suiteQuickActions = [
  {
    label: 'Resume proof',
    description: 'Check ATS evidence before tailoring.',
    path: '/suite/resume',
    iconName: 'description',
  },
  {
    label: 'Job match',
    description: 'Rank roles against proof and preferences.',
    path: '/suite/job-search',
    iconName: 'radar',
  },
  {
    label: 'Review queue',
    description: 'Approve prepared packets before anything leaves.',
    path: '/suite/agent/queue',
    iconName: 'fact_check',
  },
  {
    label: 'Ask Taco',
    description: 'Prepare the next move with context.',
    path: '/suite/agent',
    iconName: 'auto_awesome',
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
  const { tier } = useUserTier();
  const [vaultStats, setVaultStats] = useState<{ total: number; bridge: number; interview: number; flashcards: number } | null>(null);
  const [healthData, setHealthData] = useState<{
    // `number | null`, because the API returns null for a rate with no
    // denominator. Declaring it `number` did not make it one — the profile
    // arrives from `r.json()`, so TypeScript never saw the null and the tile
    // printed a measured "0%" to users who had sent nothing.
    score: number; velocity: number; responseRate: number | null;
    bands: HealthScoreBand[];
    /** Applications actually sent. Not `totalApps`, which counts morph records. */
    appliedApps: number;
    debriefs: number; topRec: { title: string; actionPath: string; color: string; icon: string } | null;
    sonaBrief: { title: string; actionUrl: string; priority: 'high' | 'medium' | 'low' } | null;
  } | null>(null);
  const [twinData, setTwinData] = useState<DashboardTwinData | null>(null);
  const [recentActivity, setRecentActivity] = useState<{ icon: string; text: string; time: string; path: string }[]>([]);
  const [alertsSubscribed, setAlertsSubscribed] = useState<boolean | null>(null);
  const [alertsFrequency, setAlertsFrequency] = useState<'daily' | 'weekly'>('weekly');
  const [alertsDismissed, setAlertsDismissed] = useState(false);
  const [alertsSubscribing, setAlertsSubscribing] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [twinExporting, setTwinExporting] = useState(false);

  useEffect(() => {
    authFetch('/api/vault/list?limit=20')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.notes) return;
        const notes = data.notes as { type: string; title?: string; topic?: string; createdAt?: string }[];
        setVaultStats({
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
            icon: cfg.icon,
            text: (n.title || n.topic) ? `${cfg.label}: ${n.title || n.topic}` : cfg.label,
            time: n.createdAt ? new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
            path: cfg.path,
          };
        });
        setRecentActivity(prev => [...prev, ...vaultActivity].slice(0, 5));
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    authFetch('/api/agent/intelligence')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.profile) return;
        const p = data.profile;
        const topRec = data.recommendations?.[0] || null;
        setHealthData({
          score: p.healthScore || 0,
          velocity: p.pipeline?.velocity || 0,
          // `?? null`, not `|| 0`. A null response rate means there is no
          // denominator; zero means every employer stayed silent.
          responseRate: typeof p.pipeline?.responseRate === 'number' ? p.pipeline.responseRate : null,
          bands: Array.isArray(p.healthBands) ? p.healthBands : [],
          appliedApps: p.pipeline?.appliedApps || 0,
          debriefs: p.interviews?.totalDebriefs || 0,
          topRec: topRec ? { title: topRec.title, actionPath: topRec.actionPath, color: topRec.color, icon: topRec.icon } : null,
          sonaBrief: data.sonaBrief ? { title: data.sonaBrief.title, actionUrl: data.sonaBrief.actionUrl, priority: data.sonaBrief.priority } : null,
        });
        if (data.twin) {
          const normalizedTwin = normalizeCareerTwinSummary(data.twin);
          if (normalizedTwin) setTwinData({ ...normalizedTwin, profile: p });
        }
      })
      .catch(() => { });
  }, []);

  // Fetch recent debriefs for activity feed
  useEffect(() => {
    authFetch('/api/agent/debriefs')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.debriefs) return;
        const debriefActivity = (data.debriefs as { company?: string; role?: string; created_at?: any }[]).slice(0, 2).map(d => ({
          icon: 'rate_review',
          text: `Interview debrief${d.company ? `: ${d.company}` : ''}${d.role ? ` - ${d.role}` : ''}`,
          time: d.created_at ? new Date(typeof d.created_at === 'object' && d.created_at.seconds ? d.created_at.seconds * 1000 : d.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
          path: '/suite/interview-debrief',
        }));
        setRecentActivity(prev => [...debriefActivity, ...prev].slice(0, 5));
      })
      .catch(() => { });
  }, []);

  // Check job alerts subscription + localStorage dismiss
  useEffect(() => {
    const dismissed = localStorage.getItem('tc_alerts_dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 14 * 24 * 60 * 60 * 1000) {
      setAlertsDismissed(true);
    }
    authFetch('/api/jobs/subscribe')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setAlertsSubscribed(data.subscribed || false);
          setAlertsFrequency(data.frequency === 'daily' ? 'daily' : 'weekly');
        }
      })
      .catch(() => { });
  }, []);

  const firstName = user?.displayName || user?.email?.split('@')[0] || 'there';
  const fullName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const initials = getInitials(fullName);
  const { greeting, subtitle } = getSmartGreeting(firstName, twinData);
  const score = healthData?.score || 0;
  /*
   * "Strong" / "Watch" / "Needs setup" are verdicts, and the number they read
   * is earned/available across MEASURED items — not progress towards 100. A
   * user measured on one thin slice can score high without the product knowing
   * anything about their search, so the word is withheld until the same test
   * the Intelligence page uses says the score can carry one.
   */
  const healthBasis = healthScoreBasis(healthData?.bands);
  // ...and a verdict on a job search needs a job search. A user with a resume,
  // good debriefs and good morale but nothing sent scored 73 and wore a green
  // "Strong" badge. The badge and the greeting below now refuse on the same
  // two conditions, so they cannot say different things about one account.
  const searchHasStarted = (healthData?.appliedApps ?? 0) > 0;
  const healthStatus = !searchHasStarted
    ? { label: 'Nothing sent yet', icon: 'outbox', className: 'icon-neutral', color: 'var(--text-muted)' }
    : !healthBasis.ratingIsSupported
      ? { label: 'Partial picture', icon: 'pending', className: 'icon-neutral', color: 'var(--text-muted)' }
      : score >= 70
        ? { label: 'Strong', icon: 'check_circle', className: 'icon-status-success', color: 'var(--success)' }
        : score >= 45
          ? { label: 'Watch', icon: 'error', className: 'icon-status-warning', color: 'var(--warning)' }
          : { label: 'Needs setup', icon: 'priority_high', className: 'icon-status-danger', color: 'var(--danger)' };
  const completeness = twinData?.completeness?.score ?? null;
  const memberSince = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;
  const currentTitle = twinData?.background?.currentTitle || null;
  const targetRoles = twinData?.background?.targetRoles || [];
  const allConfirmedSkills: string[] = twinData?.profile?.skills?.confirmed?.length
    ? twinData.profile.skills.confirmed
    : twinData?.memory?.confirmedFacts?.skills || [];
  const confirmedSkills = allConfirmedSkills.slice(0, 8);
  const nextMissing = twinData?.completeness?.missing?.[0] || null;
  const alertsFrequencyText = alertsFrequency === 'daily'
    ? 'daily weekday delivery'
    : 'weekly delivery every Monday';
  const plan = getPlanIdentity(tier);
  const trajectoryText = currentTitle && targetRoles.length
    ? `${currentTitle} to ${targetRoles[0]}`
    : currentTitle || targetRoles[0] || subtitle;

  const handleManageBilling = async () => {
    setBillingLoading(true);
    try {
      const res = await authFetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
    } catch {
      // Settings is the safe fallback when Stripe portal is unavailable.
    }
    setBillingLoading(false);
    router.push('/suite/settings?tab=subscription');
  };

  const handleExportTwin = async () => {
    setTwinExporting(true);
    try {
      const res = await authFetch('/api/agent/intelligence?export=true');
      if (!res.ok) throw new Error('Unable to export Career Twin');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'talent-consulting-career-twin.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      router.push('/suite/intelligence');
    } finally {
      setTwinExporting(false);
    }
  };

  return (
    <SuiteToolShell variant="standard" contentClassName="gap-0">

      <section className="mb-6 pt-12 lg:pt-0" aria-labelledby="suite-command-center-title">
        <SuitePanel className="overflow-hidden p-0">
          <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 p-4 md:p-5 lg:p-6">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-lg font-semibold text-[var(--text-primary)]">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h1
                        id="suite-command-center-title"
                        className="premium-heading-wrap text-2xl font-bold leading-tight text-[var(--text-primary)]"
                      >
                        {greeting}
                      </h1>
                      <PlanBadge tier={tier} active={plan.id !== 'free'} />
                    </div>
                    <p className="premium-copy-wrap mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                      {trajectoryText}
                    </p>
                    {memberSince && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                        <span className="material-symbols-rounded icon-neutral text-[14px]" aria-hidden="true">
                          calendar_month
                        </span>
                        Since {memberSince}
                      </p>
                    )}
                  </div>
                </div>

                {healthData && (
                  <div className="flex shrink-0 items-center gap-3 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2">
                    <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90" aria-hidden="true">
                      <circle cx="18" cy="18" r="14.5" fill="none" strokeWidth="2.5" stroke="var(--border-subtle)" />
                      <circle
                        cx="18"
                        cy="18"
                        r="14.5"
                        fill="none"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        stroke={healthStatus.color}
                        strokeDasharray={`${score * 0.91} ${91 - score * 0.91}`}
                      />
                    </svg>
                    <div>
                      <p className="whitespace-nowrap text-lg font-bold tabular-nums text-[var(--text-primary)]">{score}</p>
                      <p className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)]">
                        <span className={`material-symbols-rounded text-[13px] ${healthStatus.className}`} aria-hidden="true">
                          {healthStatus.icon}
                        </span>
                        {healthStatus.label}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {suiteQuickActions.map((action) => (
                  <button
                    key={action.path}
                    type="button"
                    onClick={() => router.push(action.path)}
                    className="group min-h-[106px] min-w-0 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <SuiteToolIcon icon={action.iconName} size="sm" />
                      <div className="min-w-0">
                        <p className="premium-heading-wrap text-sm font-semibold text-[var(--text-primary)]">
                          {action.label}
                        </p>
                        <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                          {action.description}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-5 flex min-w-0 flex-col gap-3 border-t border-[var(--border-subtle)] pt-4 sm:flex-row sm:items-center">
                {completeness !== null && (
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span className="material-symbols-rounded icon-neutral shrink-0 text-[15px]" aria-hidden="true">
                      person
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      Twin
                    </span>
                    <div className="h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
                        style={{ width: `${completeness}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--text-primary)]">
                      {completeness}%
                    </span>
                    {nextMissing && (
                      <span className="hidden min-w-0 truncate text-xs text-[var(--text-muted)] md:inline">
                        Next: {nextMissing}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                  {confirmedSkills.map((skill, index) => (
                    <span
                      key={`${skill || 'skill'}-${index}`}
                      className="max-w-[180px] truncate rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]"
                      title={skill}
                    >
                      {skill}
                    </span>
                  ))}
                  {allConfirmedSkills.length > 8 && (
                    <span className="text-[11px] text-[var(--text-muted)]">
                      +{allConfirmedSkills.length - 8}
                    </span>
                  )}
                  {twinData?.exportable && (
                    <button
                      type="button"
                      onClick={() => void handleExportTwin()}
                      disabled={twinExporting}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-60"
                      aria-label="Export Career Twin"
                      title="Export Career Twin"
                    >
                      <span className={`material-symbols-rounded text-[16px] ${twinExporting ? 'animate-spin' : ''}`} aria-hidden="true">
                        {twinExporting ? 'progress_activity' : 'download'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <aside className="min-w-0 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 md:p-5 lg:border-l lg:border-t-0">
              <PlanStatusStrip
                tier={tier}
                title={plan.id === 'free' ? 'Free workspace' : `${plan.displayName} active`}
                caption={plan.id === 'free' ? plan.description : plan.activeDescription}
                className="min-w-0"
              />
              <div className="mt-4">
                <PlanFeatureList tier={tier} compact limit={3} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {plan.id === 'free' && (
                  <button
                    type="button"
                    onClick={() => router.push('/suite/upgrade')}
                    className="min-h-9 flex-1 rounded-[12px] px-3 py-2 text-xs font-semibold transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    style={{ background: plan.accent, color: plan.buttonText }}
                  >
                    View Standard / Max
                  </button>
                )}
                {plan.id === 'pro' && (
                  <>
                    <button
                      type="button"
                      onClick={handleManageBilling}
                      disabled={billingLoading}
                      className="min-h-9 flex-1 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-60"
                    >
                      {billingLoading ? 'Opening...' : 'Manage billing'}
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push('/suite/upgrade?plan=studio')}
                      className="min-h-9 flex-1 rounded-[12px] px-3 py-2 text-xs font-semibold transition hover:brightness-105"
                      style={{ background: getPlanIdentity('studio').accent, color: getPlanIdentity('studio').buttonText }}
                    >
                      Explore Max
                    </button>
                  </>
                )}
                {plan.id === 'studio' && (
                  <button
                    type="button"
                    onClick={handleManageBilling}
                    disabled={billingLoading}
                    className="min-h-9 flex-1 rounded-[12px] px-3 py-2 text-xs font-semibold transition hover:brightness-105 disabled:opacity-60"
                    style={{ background: plan.accent, color: plan.buttonText }}
                  >
                    {billingLoading ? 'Opening...' : 'Manage billing'}
                  </button>
                )}
              </div>

              {healthData && (
                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[var(--border-subtle)] pt-4">
                  {[
                    { label: 'Apps/week', value: healthData.velocity, icon: 'speed' },
                    // percentOrDash, not `${x}%`. An em dash reads as "we do
                    // not know"; "0%" reads as "every employer ignored you".
                    { label: 'Response', value: percentOrDash(healthData.responseRate), icon: 'mark_email_read' },
                    { label: 'Debriefs', value: healthData.debriefs, icon: 'rate_review' },
                  ].map((metric) => (
                    <div key={metric.label} className="min-w-0">
                      <span className="material-symbols-rounded icon-neutral text-[15px]" aria-hidden="true">
                        {metric.icon}
                      </span>
                      <p className="mt-1 whitespace-nowrap text-sm font-bold tabular-nums text-[var(--text-primary)]">
                        {metric.value}
                      </p>
                      <p className="truncate text-[10px] text-[var(--text-muted)]">{metric.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {healthData?.sonaBrief && (
                <button
                  type="button"
                  onClick={() => router.push(healthData.sonaBrief?.actionUrl || '/suite/intelligence')}
                  className="mt-4 flex w-full min-w-0 items-start gap-2 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-hover)]"
                >
                  <span className="material-symbols-rounded icon-neutral mt-0.5 text-[17px]" aria-hidden="true">
                    auto_awesome
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-[var(--text-primary)]">Taco next action</span>
                    <span className="premium-copy-wrap mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">
                      {healthData.sonaBrief.title}
                    </span>
                  </span>
                </button>
              )}
            </aside>
          </div>
        </SuitePanel>
      </section>

      {user && <DashboardActionInbox key={user.uid} />}

      <PhaseOneCommandCenter twin={twinData} />

      {/* ── Opportunity Radar Widget ── */}
      {user && <JobFeedWidget />}

      {/* ── Job Alerts Subscribe Card ── */}
      {user && alertsSubscribed === false && !alertsDismissed && (
        <SuitePanel className="mb-6 p-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <SuiteToolIcon icon="mail" size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Career Picks by Taco</p>
                <p className="premium-copy-wrap mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">
                  Get weekly crafted jobs in your inbox with fit reasons and prep links.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('tc_alerts_dismissed', String(Date.now()));
                  setAlertsDismissed(true);
                }}
                className="min-h-9 rounded-[12px] border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                Maybe later
              </button>
              <button
                type="button"
                onClick={async () => {
                  setAlertsSubscribing(true);
                  try {
                    const res = await authFetch('/api/jobs/subscribe', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        enabled: true,
                        frequency: 'weekly',
                        consentAcknowledged: true,
                        source: 'suite_dashboard',
                      }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      setAlertsSubscribed(true);
                      setAlertsFrequency(data.frequency === 'daily' ? 'daily' : 'weekly');
                    }
                  } catch { /* silent */ }
                  setAlertsSubscribing(false);
                }}
                disabled={alertsSubscribing}
                className="min-h-9 rounded-[12px] bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-deep)] transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {alertsSubscribing ? 'Enabling...' : 'Enable Career Picks by Taco'}
              </button>
            </div>
          </div>
        </SuitePanel>
      )}

      {/* Subscribed confirmation */}
      {user && alertsSubscribed === true && (
        <div className="mb-6 flex items-center gap-2 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
          <span className="material-symbols-rounded icon-status-success text-sm" aria-hidden="true">check_circle</span>
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">Career Picks by Taco enabled, {alertsFrequencyText}</span>
        </div>
      )}

      {/* ── Grouped Tool Grid ── */}
      {toolGroups.map((group) => (
        <section key={group.label} className="mb-6" aria-labelledby={`suite-tools-${group.label.toLowerCase().replace(/\s+/g, '-')}`}>
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
                className="group flex min-h-[124px] min-w-0 flex-col rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <SuiteToolIcon icon={tool.iconName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="premium-heading-wrap min-w-0 flex-1 text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
                        {tool.name}
                      </h3>
                      {tool.badge && (
                        <span className="shrink-0 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
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

      {/* ── Recent Activity ── */}
      {recentActivity.length > 0 && (
        <div className="mb-2 mt-4">
          <div className="rounded-xl border border-[var(--border-subtle)] p-4">
            <h2 className="text-xs font-medium text-[var(--text-secondary)] mb-3 flex items-center gap-2">
              <span className="material-symbols-rounded icon-neutral text-[14px]">history</span>
              Recent Activity
            </h2>
            <div className="space-y-1">
              {recentActivity.map((activity, i) => (
                <button
                  key={i}
                  onClick={() => router.push(activity.path)}
                  className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left hover:bg-[var(--bg-hover)] transition-colors duration-100 group"
                >
                  <span className="material-symbols-rounded icon-neutral text-[14px]">{activity.icon}</span>
                  <span className="flex-1 text-[12px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate transition-colors">{activity.text}</span>
                  {activity.time && <span className="text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">{activity.time}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Start ── */}
      <SuitePanel className="mt-2 p-4">
        <h2 className="mb-3 text-xs font-medium text-[var(--text-secondary)]">Start here</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => router.push('/suite/resume')}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-left text-[12px] text-[var(--text-secondary)] transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <span className="material-symbols-rounded icon-neutral text-[15px]" aria-hidden="true">description</span>
            Upload a resume
          </button>
          <button
            type="button"
            onClick={() => router.push('/suite/interview-sim')}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-left text-[12px] text-[var(--text-secondary)] transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <span className="material-symbols-rounded icon-neutral text-[15px]" aria-hidden="true">interpreter_mode</span>
            Practice interviews
          </button>
          <button
            type="button"
            onClick={() => router.push('/suite/agent')}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-left text-[12px] text-[var(--text-secondary)] transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <span className="material-symbols-rounded icon-neutral text-[15px]" aria-hidden="true">auto_awesome</span>
            Ask Taco anything
          </button>
        </div>
      </SuitePanel>

      {/* ── Skill Bridge Memory Strip ── */}
      {vaultStats && vaultStats.total > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => router.push('/suite/skill-bridge?view=memory')}
            className="group flex w-full min-w-0 items-center gap-3 rounded-xl border border-[var(--border-subtle)] px-4 py-3 text-left transition-colors duration-100 hover:border-[var(--border)] hover:bg-[var(--bg-hover)]"
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
