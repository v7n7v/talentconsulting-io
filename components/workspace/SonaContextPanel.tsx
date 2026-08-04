'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { authFetch } from '@/lib/auth-fetch';
import { useApplicationKitContext } from '@/hooks/useApplicationKitContext';
import { getSonaCapabilitiesForPath, type SonaCapability } from '@/lib/assistant/capabilities';
import {
  careerTwinPromptMetadata,
  clampScore,
  compactList,
  metricValue,
  normalizeCareerTwinMemory,
  normalizeCareerTwinSummary,
  percentOrDash,
  type CareerTwinSummary,
} from '@/lib/career-twin-client';
import {
  buildSonaCapabilityPrompt,
  createSonaExecutionContext,
  summarizeSonaContext,
  type SonaExecutionContext,
} from '@/lib/assistant/execution-context';
import { SonaMark } from '@/components/sona';
import SonaCapabilityDrawer from '@/components/sona/SonaCapabilityDrawer';

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} aria-hidden="true">{name}</span>;
}

function openSonaWithCapability(capability: SonaCapability, context: SonaExecutionContext) {
  window.dispatchEvent(new CustomEvent('assistant:open', {
    detail: {
      capabilityId: capability.id,
      context,
      contextLabel: capability.toolName,
      prompt: buildSonaCapabilityPrompt(capability, context),
    },
  }));
}

function openSonaPrompt(prompt: string, contextLabel: string, context: SonaExecutionContext) {
  window.dispatchEvent(new CustomEvent('assistant:open', {
    detail: {
      prompt,
      context,
      contextLabel,
    },
  }));
}

function TrustGate({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: string;
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'warning';
}) {
  const toneClass = tone === 'success'
    ? 'icon-status-success'
    : tone === 'warning'
      ? 'icon-status-warning'
      : 'icon-neutral';

  return (
    <div className="flex min-w-0 items-start gap-2 rounded-[14px] bg-[var(--bg-elevated)] px-3 py-2.5">
      <Icon name={icon} className={`${toneClass} mt-0.5 shrink-0 text-[17px]`} />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-[var(--text-primary)]">{label}</span>
        <span className="premium-copy-wrap block text-[10px] leading-4 text-[var(--text-muted)]">{value}</span>
      </span>
    </div>
  );
}

function TwinMiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2">
      <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      <span className="mt-0.5 block truncate text-xs font-bold text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function CareerTwinRail({
  userReady,
  twin,
  loading,
  error,
  onOpenIntelligence,
  onAskSona,
}: {
  userReady: boolean;
  twin: CareerTwinSummary | null;
  loading: boolean;
  error: boolean;
  onOpenIntelligence: () => void;
  onAskSona: (prompt: string, contextLabel: string) => void;
}) {
  if (!userReady) {
    return (
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Career Twin</h3>
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
          <p className="text-xs font-semibold text-[var(--text-primary)]">Memory locked</p>
          <p className="premium-copy-wrap mt-1 text-[10px] leading-4 text-[var(--text-muted)]">
            Sign in to let Taco use saved resume, goals, applications, and story context.
          </p>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section aria-busy="true" aria-label="Loading Career Twin memory">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Career Twin</h3>
        <div className="space-y-2">
          <div className="h-16 animate-pulse rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-12 animate-pulse rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
            <div className="h-12 animate-pulse rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
          </div>
        </div>
      </section>
    );
  }

  if (!twin) {
    return (
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Career Twin</h3>
          {error && (
            <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
              unavailable
            </span>
          )}
        </div>
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
          <p className="text-xs font-semibold text-[var(--text-primary)]">Add trusted career data</p>
          <p className="premium-copy-wrap mt-1 text-[10px] leading-4 text-[var(--text-muted)]">
            Upload a resume, set target roles, and track applications so Taco can work from memory.
          </p>
          <button
            type="button"
            onClick={onOpenIntelligence}
            className="mt-3 inline-flex min-h-8 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
          >
            <Icon name="memory" className="text-[15px]" />
            Open memory
          </button>
        </div>
      </section>
    );
  }

  const normalizedTwin = normalizeCareerTwinSummary(twin);

  if (!normalizedTwin) {
    return (
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Career Twin</h3>
          <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
            partial
          </span>
        </div>
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
          <p className="text-xs font-semibold text-[var(--text-primary)]">Memory is syncing</p>
          <p className="premium-copy-wrap mt-1 text-[10px] leading-4 text-[var(--text-muted)]">
            Taco is rebuilding missing career memory fields. You can keep working while this refreshes.
          </p>
          <button
            type="button"
            onClick={onOpenIntelligence}
            className="mt-3 inline-flex min-h-8 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
          >
            <Icon name="memory" className="text-[15px]" />
            Open memory
          </button>
        </div>
      </section>
    );
  }

  const memory = normalizeCareerTwinMemory(normalizedTwin.memory, normalizedTwin.background);
  const goals = memory.goals || {
    targetRoles: normalizedTwin.background.targetRoles || [],
    industries: normalizedTwin.background.industries || [],
    jobSearchStatus: '',
    salaryMin: null,
    remotePreference: 'any',
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
  const completeness = clampScore(normalizedTwin.completeness.score);
  const topAction = memory.nextBestActions?.[0];

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Career Twin</h3>
        <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
          {completeness}%
        </span>
      </div>

      <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
        <div className="flex min-w-0 items-start gap-2">
          <Icon name="memory" className="icon-neutral mt-0.5 shrink-0 text-[17px]" />
          <span className="min-w-0">
            <span className="premium-heading-wrap block text-xs font-bold text-[var(--text-primary)]">
              {compactList(goals.targetRoles, 'Target roles not set', 2)}
            </span>
            <span className="premium-copy-wrap mt-1 block text-[10px] leading-4 text-[var(--text-muted)]">
              {/* percentOrDash on the rate: it is null until something has
                  been sent, and "0% response rate" is a different claim. */}
              {metricValue(activeSearch.totalApplications)} applications ({metricValue(activeSearch.sentApplications)} sent), {metricValue(activeSearch.queuedApplications)} queued packets, {percentOrDash(activeSearch.responseRate)} response rate.
            </span>
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <TwinMiniMetric label="Stories" value={`${clampScore(normalizedTwin.behavioralBank.coverageScore)}% coverage`} />
          <TwinMiniMetric label="Velocity" value={`${metricValue(activeSearch.velocity)}/week`} />
          <TwinMiniMetric label="Skill gaps" value={metricValue(activeSearch.skillGaps.length)} />
          <TwinMiniMetric label="Stale apps" value={metricValue(activeSearch.staleApplications)} />
        </div>

        {topAction ? (
          <div className="mt-3 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5">
            <p className="premium-heading-wrap text-xs font-semibold text-[var(--text-primary)]">{topAction.label}</p>
            <p className="premium-copy-wrap mt-1 text-[10px] leading-4 text-[var(--text-muted)]">{topAction.reason}</p>
            <button
              type="button"
              onClick={() => onAskSona(`Prepare this Career Twin action for review: ${topAction.label}. Reason: ${topAction.reason}. Do not submit, message, or change anything externally.`, topAction.label)}
              className="mt-2 inline-flex min-h-8 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--text-primary)] px-3 text-xs font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
            >
              <Icon name="auto_awesome" className="text-[15px]" />
              Prepare action
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenIntelligence}
            className="mt-3 inline-flex min-h-8 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
          >
            <Icon name="open_in_new" className="text-[15px]" />
            Review memory
          </button>
        )}
      </div>
    </section>
  );
}

export default function SonaContextPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useStore((state) => state.user);
  const [twin, setTwin] = useState<CareerTwinSummary | null>(null);
  const [twinLoading, setTwinLoading] = useState(false);
  const [twinError, setTwinError] = useState(false);
  const { context: kitContext } = useApplicationKitContext();
  const capabilities = useMemo(() => getSonaCapabilitiesForPath(pathname), [pathname]);
  const primaryCapability = capabilities[0];
  const context = useMemo(() => createSonaExecutionContext({
    pathname,
    applicationKit: kitContext,
    sourceTool: primaryCapability?.toolName,
  }), [kitContext, pathname, primaryCapability?.toolName]);
  const twinContext = useMemo(() => ({
    ...context,
    metadata: {
      ...context.metadata,
      ...careerTwinPromptMetadata(twin),
    },
  }), [context, twin]);
  const contextLines = useMemo(() => summarizeSonaContext(context).slice(0, 4), [context]);

  const reviewCount = capabilities.filter(item => item.approval !== 'none').length;
  const artifactCount = capabilities.filter(item => item.createsArtifacts).length;
  const canBackground = capabilities.some(item => item.canRunInBackground);
  const pageLabel = context.pageLabel || 'Workspace';

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setTwin(null);
      setTwinLoading(false);
      setTwinError(false);
      return;
    }

    setTwinLoading(true);
    setTwinError(false);

    authFetch('/api/agent/intelligence')
      .then(async (res) => {
        if (!res.ok) throw new Error('Career Twin unavailable');
        const data = await res.json();
        if (!cancelled) setTwin(normalizeCareerTwinSummary(data?.twin));
      })
      .catch(() => {
        if (!cancelled) {
          setTwin(null);
          setTwinError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setTwinLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (pathname === '/suite/agent') return null;

  return (
    <aside
      className="fixed bottom-4 right-4 top-4 z-30 hidden w-[304px] flex-col overflow-hidden rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)] shadow-sm 2xl:flex"
      aria-label="Taco context panel"
    >
      <div className="border-b border-[var(--border-subtle)] p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <SonaMark size="sm" state={user ? 'idle' : 'locked'} />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Taco context
              </p>
              <h2 className="premium-heading-wrap mt-1 text-base font-bold text-[var(--text-primary)]">
                {pageLabel}
              </h2>
              <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                {user ? 'Next actions, evidence, and approval gates stay visible.' : 'Sign in to give Taco memory and saved workflow context.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/suite/agent')}
            className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)]"
            aria-label="Open full Taco agent"
          >
            <Icon name="open_in_full" className="text-[18px]" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Evidence loaded</h3>
            <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
              {contextLines.length || 0}
            </span>
          </div>
          {contextLines.length > 0 ? (
            <div className="space-y-1.5">
              {contextLines.map((line, index) => (
                <div key={`${line || 'context-line'}-${index}`} className="wrap-anywhere rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[10px] leading-4 text-[var(--text-secondary)]">
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--text-primary)]">No page evidence yet</p>
              <p className="premium-copy-wrap mt-1 text-[10px] leading-4 text-[var(--text-muted)]">
                Add a resume, role, job description, application, or story so Taco can ground the next action.
              </p>
            </div>
          )}
        </section>

        <SonaCapabilityDrawer
          capabilities={capabilities}
          context={twinContext}
          onRun={(capability) => openSonaWithCapability(capability, twinContext)}
        />

        <CareerTwinRail
          userReady={!!user}
          twin={twin}
          loading={twinLoading}
          error={twinError}
          onOpenIntelligence={() => router.push('/suite/intelligence')}
          onAskSona={(prompt, contextLabel) => openSonaPrompt(prompt, contextLabel, twinContext)}
        />

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Trust gates</h3>
          <div className="space-y-1.5">
            <TrustGate
              icon="verified"
              label="Facts preserved"
              value={context.resumeVersionName || context.resumeVersionId ? 'Resume evidence is available for grounded edits.' : 'Add a resume before Taco prepares application artifacts.'}
              tone={context.resumeVersionName || context.resumeVersionId ? 'success' : 'warning'}
            />
            <TrustGate
              icon="pending_actions"
              label="Review required"
              value={reviewCount > 0 ? `${reviewCount} move${reviewCount === 1 ? '' : 's'} need user review before completion.` : 'This page is currently analysis-first.'}
              tone={reviewCount > 0 ? 'warning' : 'neutral'}
            />
            <TrustGate
              icon="inventory_2"
              label="Artifacts"
              value={artifactCount > 0 ? `${artifactCount} move${artifactCount === 1 ? '' : 's'} can create drafts for review.` : 'No draft-producing moves on this page.'}
              tone={artifactCount > 0 ? 'success' : 'neutral'}
            />
            <TrustGate
              icon="lock"
              label="External actions"
              value="Taco can prepare drafts. Sending, submitting, or contacting people still needs approval."
              tone="success"
            />
          </div>
        </section>
      </div>

      <div className="border-t border-[var(--border-subtle)] p-4">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              if (primaryCapability) {
                openSonaWithCapability(primaryCapability, twinContext);
                return;
              }
              openSonaPrompt('Review my current Talent Studio context and tell me the next best action.', 'Taco context', twinContext);
            }}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
          >
            <SonaMark size="xs" state={canBackground ? 'thinking' : 'idle'} />
            Run next move
          </button>
          <button
            type="button"
            onClick={() => router.push('/suite/agent/queue')}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
          >
            <Icon name="view_list" className="text-[18px]" />
            Review packets
          </button>
        </div>
      </div>
    </aside>
  );
}
