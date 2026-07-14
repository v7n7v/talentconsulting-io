'use client';

import { useRouter } from 'next/navigation';
import { SuitePanel, SuiteToolIcon } from '@/components/suite/SuiteToolChrome';
import {
  careerTwinPromptMetadata,
  clampScore,
  compactList,
  metricValue,
  normalizeCareerTwinSummary,
  type CareerTwinSummary,
} from '@/lib/career-twin-client';
import {
  ApplicationPacketReview,
  ProofChecklist,
  ReviewStateRail,
  type ProofItem,
  type ReviewArtifact,
  type ReviewStateItem,
} from '@/components/suite/ReviewFirstWorkflow';

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} aria-hidden="true">{name}</span>;
}

function openSona(prompt: string, contextLabel: string, twin?: CareerTwinSummary | null) {
  window.dispatchEvent(new CustomEvent('sona:open', {
    detail: {
      prompt,
      contextLabel,
      context: {
        source: 'suite-command-center',
        approvalRequired: true,
        metadata: careerTwinPromptMetadata(twin || null),
      },
    },
  }));
}

const reviewStates: ReviewStateItem[] = [
  { label: 'Empty', description: 'Show what Sona needs before a packet can exist.', status: 'empty' },
  { label: 'Preparing', description: 'Use skeleton-style progress while evidence loads.', status: 'loading' },
  { label: 'Blocked', description: 'Stop when proof is missing or approval is required.', status: 'blocked' },
  { label: 'Approved', description: 'Only then move to manual submit or tracking.', status: 'approved' },
];

export default function PhaseOneCommandCenter({ twin }: { twin?: CareerTwinSummary | null }) {
  const router = useRouter();
  const normalizedTwin = normalizeCareerTwinSummary(twin);
  const memory = normalizedTwin?.memory;
  const activeSearch = memory?.activeSearch;
  const completeness = normalizedTwin ? clampScore(normalizedTwin.completeness?.score) : 0;
  const missing = normalizedTwin?.completeness?.missing || [];
  const targetRoles = memory?.goals?.targetRoles?.length ? memory.goals.targetRoles : normalizedTwin?.background?.targetRoles;
  const targetRoleText = compactList(targetRoles, 'Target role not set', 2);
  const topAction = memory?.nextBestActions?.[0] || null;
  const confirmedSkills = memory?.confirmedFacts?.skills || [];
  const skillGaps = activeSearch?.skillGaps || [];
  const queuedApplications = activeSearch?.queuedApplications || 0;
  const totalApplications = activeSearch?.totalApplications || 0;
  const staleApplications = activeSearch?.staleApplications || 0;
  const hasResume = Boolean(memory?.confirmedFacts?.hasResume);
  const nextActionTitle = topAction?.label || (queuedApplications > 0 ? 'Review prepared packets.' : 'Build a review queue from saved jobs.');
  const nextActionDescription = topAction?.reason || (
    queuedApplications > 0
      ? `${queuedApplications} packet${queuedApplications === 1 ? '' : 's'} should be checked for proof, risk, and approval before submission.`
      : 'Start with prepared packets. Keep blind auto-apply out of the default path.'
  );
  const sonaPrompt = topAction
    ? `Use my Career Twin to prepare this next action: ${topAction.label}. Explain the evidence, risks, missing facts, and approval steps. Do not submit anything externally.`
    : 'Prepare a review-first application queue from my saved jobs. Show evidence, risks, and what needs my approval before anything is submitted.';
  const summaryCards = [
    {
      label: 'Target',
      body: targetRoleText,
      icon: 'track_changes',
    },
    {
      label: 'Search',
      body: `${metricValue(totalApplications)} apps, ${metricValue(queuedApplications)} queued`,
      icon: 'work',
    },
    {
      label: 'Gaps',
      body: skillGaps[0] || missing[0] || 'No open proof gaps',
      icon: 'rule',
    },
  ];
  const packetArtifacts: ReviewArtifact[] = [
    {
      label: 'Career Twin',
      description: normalizedTwin ? `${completeness}% complete for ${targetRoleText}` : 'Needs resume, goals, and search context',
      status: normalizedTwin ? 'ready' : 'empty',
      icon: 'neurology',
      meta: normalizedTwin ? 'source of truth' : 'setup first',
    },
    {
      label: 'Resume proof',
      description: hasResume ? 'Resume evidence is available for packet drafts' : 'Upload or confirm a resume before packet drafting',
      status: hasResume ? 'ready' : 'blocked',
      icon: 'description',
      meta: hasResume ? `${metricValue(memory?.confirmedFacts?.resumeVersionCount)} version${memory?.confirmedFacts?.resumeVersionCount === 1 ? '' : 's'}` : 'required',
    },
    {
      label: 'Application queue',
      description: queuedApplications > 0 ? `${queuedApplications} packet${queuedApplications === 1 ? '' : 's'} waiting` : 'No queued packets yet',
      status: queuedApplications > 0 ? 'needs_review' : 'empty',
      icon: 'pending_actions',
      meta: staleApplications > 0 ? `${staleApplications} stale` : 'approval required',
    },
  ];
  const proofItems: ProofItem[] = [
    {
      label: 'Facts preserved',
      description: confirmedSkills.length > 0
        ? `${confirmedSkills.slice(0, 3).join(', ')}${confirmedSkills.length > 3 ? ` +${confirmedSkills.length - 3}` : ''} stay grounded in Career Twin memory.`
        : 'Titles, dates, metrics, and employers stay locked before Sona drafts.',
      tone: confirmedSkills.length > 0 ? 'success' : 'neutral',
      icon: 'verified',
    },
    {
      label: 'Missing requirements',
      description: skillGaps.length > 0
        ? `${skillGaps[0]} needs proof before it appears in a packet.`
        : missing[0] ? `Next Career Twin gap: ${missing[0]}.` : 'Unproven requirements are shown before edits.',
      tone: skillGaps.length > 0 || missing.length > 0 ? 'warning' : 'success',
      icon: skillGaps.length > 0 || missing.length > 0 ? 'plagiarism' : 'check_circle',
    },
    {
      label: 'Risk notes',
      description: 'Sona marks claims that need evidence or user approval before anything leaves TalentConsulting.io.',
      tone: 'neutral',
      icon: 'shield',
    },
  ];

  return (
    <section className="mb-6 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
      <SuitePanel className="p-0">
        <div className="grid min-w-0 gap-0 2xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.78fr)]">
          <div className="min-w-0 p-5 md:p-6">
            <div className="flex min-w-0 items-start gap-3">
              <SuiteToolIcon icon="auto_awesome" size="md" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Sona context
                </p>
                <h2 className="premium-heading-wrap mt-1 text-xl font-bold text-[var(--text-primary)]">
                  Ask Sona to prepare the next move, then approve the packet.
                </h2>
                <p className="premium-copy-wrap mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  {normalizedTwin
                    ? `Career Twin is ${completeness}% complete for ${targetRoleText}. Sona should use this memory, saved jobs, and proof notes before drafting anything.`
                    : 'Sona should use your Career Twin, saved jobs, and proof notes before drafting anything. The user stays in control before submission.'}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {summaryCards.map(({ label, body, icon }) => (
                <div key={label} className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                  <Icon name={icon} className="icon-neutral text-[18px]" />
                  <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 md:p-6 2xl:border-l 2xl:border-t-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Next action
            </p>
            <h3 className="premium-heading-wrap mt-2 text-lg font-bold text-[var(--text-primary)]">
              {nextActionTitle}
            </h3>
            <p className="premium-copy-wrap mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {nextActionDescription}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => openSona(sonaPrompt, topAction ? 'Career Twin action' : 'Review queue', normalizedTwin)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <Icon name="auto_awesome" className="text-[18px]" />
                {topAction ? 'Prepare action' : 'Ask Sona'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/suite/agent/queue')}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
              >
                <Icon name="view_list" className="text-[18px]" />
                Open queue
              </button>
            </div>
          </div>
        </div>
      </SuitePanel>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1">
        <ApplicationPacketReview
          title={topAction ? 'Career Twin packet plan' : 'Review-first packet plan'}
          description={normalizedTwin ? 'Packet readiness now follows memory, resume proof, queued applications, and user approval.' : 'Each packet exposes artifact status before the user decides.'}
          artifacts={packetArtifacts}
          primaryAction={(
            <button
              type="button"
              onClick={() => router.push('/suite/agent/queue')}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
            >
              <Icon name="pending_actions" className="text-[18px]" />
              Review queue
            </button>
          )}
          secondaryAction={(
            <button
              type="button"
              onClick={() => router.push('/suite/applications')}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
            >
              <Icon name="work" className="text-[18px]" />
              Applications
            </button>
          )}
        />

        <ProofChecklist
          title="Evidence before output"
          description="Proof notes travel with resume, cover letter, and screening drafts."
          items={proofItems}
          action={(
            <button
              type="button"
              onClick={() => router.push('/suite/resume')}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
            >
              <Icon name="description" className="text-[18px]" />
              Open resume proof
            </button>
          )}
        />
      </div>

      <ReviewStateRail states={reviewStates} className="xl:col-span-2" />
    </section>
  );
}
