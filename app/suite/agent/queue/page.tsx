'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/auth-fetch';
import { useStore } from '@/lib/store';
import {
  applyFromQueue,
  getAgentQueue,
  updateQueueFeedback,
  updateQueueItem,
  type AgentQueueItem,
} from '@/lib/database-suite';
import AnimatedToolIcon, { type ToolIconTone } from '@/components/AnimatedToolIcon';
import PageHelp from '@/components/PageHelp';
import AuthModal from '@/components/modals/AuthModal';
import { SonaMark } from '@/components/sona';
import {
  ApplicationPacketReview,
  ProofChecklist,
  type ProofItem,
  type ReviewArtifact,
} from '@/components/suite/ReviewFirstWorkflow';
import { SuiteToolIcon } from '@/components/suite/SuiteToolChrome';
import {
  ProofEngineReport,
  type ProofCheckTone,
  type ProofEngineReportData,
  type ProofRequirementStatus,
} from '@/components/suite/ProofEngineReport';
import {
  careerTwinPromptMetadata,
  clampScore,
  compactList,
  formatSalaryFloor,
  metricValue,
  normalizeCareerTwinSummary,
  titleCase,
  type CareerTwinSummary,
} from '@/lib/career-twin-client';
import SonaThinkingTile from '@/components/SonaThinkingTile';
import { showToast } from '@/components/Toast';
import { findDeepLinkedPacket, getSafeExternalUrl } from '@/lib/sona/top-picks';

type QueueView = 'command' | 'queue' | 'board' | 'history' | 'settings';
type StatusFilter = 'all' | AgentQueueItem['status'];
type QueueStats = {
  pending: number;
  approved: number;
  applied: number;
  dismissed: number;
  expired: number;
  highFit: number;
  expiring: number;
  risks: number;
  total: number;
};
type PacketReadinessStatus = 'ready' | 'review' | 'blocked' | 'approved';
type PacketReadinessItem = {
  label: string;
  description: string;
  icon: string;
  status: PacketReadinessStatus;
  statusLabel: string;
};
type PacketDraftItem = {
  label: string;
  description: string;
  icon: string;
  body: string;
  actionLabel: string;
  prompt: string;
};

const VIEW_CONFIG: Record<QueueView, { label: string; icon: string }> = {
  command: { label: 'Command', icon: 'auto_awesome' },
  queue: { label: 'Queue', icon: 'view_list' },
  board: { label: 'Board', icon: 'view_kanban' },
  history: { label: 'History', icon: 'history' },
  settings: { label: 'Settings', icon: 'tune' },
};

const STATUS_CONFIG: Record<AgentQueueItem['status'], { label: string; icon: string; tone: ToolIconTone }> = {
  pending: { label: 'Needs review', icon: 'pending_actions', tone: 'amber' },
  approved: { label: 'Approved', icon: 'task_alt', tone: 'emerald' },
  applied: { label: 'Tracked', icon: 'outgoing_mail', tone: 'blue' },
  dismissed: { label: 'Dismissed', icon: 'block', tone: 'slate' },
  expired: { label: 'Expired', icon: 'event_busy', tone: 'rose' },
};

const FEEDBACK_TAGS = [
  'More like this',
  'Less like this',
  'Wrong seniority',
  'Bad company',
  'Salary too low',
  'Not my role',
];
const READINESS_STATUS_CLASS: Record<PacketReadinessStatus, string> = {
  ready: 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]',
  review: 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]',
  blocked: 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]',
  approved: 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]',
};

function formatSalary(salary?: { min: number | null; max: number | null }) {
  if (!salary?.min && !salary?.max) return 'Salary not listed';
  const fmt = (v: number) => `$${Math.round(v / 1000)}k`;
  if (salary.min && salary.max) return `${fmt(salary.min)}-${fmt(salary.max)}`;
  return salary.min ? `${fmt(salary.min)}+` : `Up to ${fmt(salary.max || 0)}`;
}

function formatShortDate(value?: string) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntil(value?: string) {
  if (!value) return 99;
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return 99;
  return Math.ceil((date - Date.now()) / (1000 * 60 * 60 * 24));
}

function deriveNextAction(item: AgentQueueItem) {
  if (item.nextAction) return item.nextAction;
  if (hasApplicationTracker(item)) return 'Tracker draft created. Submit manually from the posting, then mark applied in Applications.';
  if (item.status === 'pending') return 'Review the packet and decide whether to approve it.';
  if (item.status === 'approved') return 'Open the job posting and submit manually when ready.';
  if (item.status === 'applied') return 'Tracker draft created. Confirm the manual submission in Applications.';
  if (item.status === 'dismissed') return 'Sona will learn from your feedback.';
  return 'Expired packet. Ask Sona to find fresh roles.';
}

function hasPacketApproval(item: AgentQueueItem) {
  return item.status === 'approved' || item.status === 'applied' || item.packetStatus === 'approved' || item.packetStatus === 'applied';
}

function hasApplicationTracker(item: AgentQueueItem) {
  return Boolean(item.application_id || item.packetStatus === 'assist_apply' || item.status === 'applied');
}

function isPacketApprovable(item: AgentQueueItem) {
  return item.status === 'pending' && item.source !== 'legacy_sona';
}

function isPacketTrackable(item: AgentQueueItem) {
  return item.status === 'approved' && !hasApplicationTracker(item);
}

function getPacketApprovalBlockers(
  item: AgentQueueItem,
  twin?: CareerTwinSummary | null,
  twinLoading = false,
  twinError = '',
) {
  const blockers = buildPacketReadiness(item, twin)
    .filter(entry => entry.status === 'blocked')
    .map(entry => entry.label);
  if (twinLoading) blockers.unshift('Career Twin loading');
  if (twinError) blockers.unshift('Career Twin context');
  return Array.from(new Set(blockers));
}

function formatPacketState(value?: string) {
  return titleCase(value || 'Not prepared');
}

function formatSourceType(value?: string) {
  return titleCase(String(value || 'Sona').replace(/_/g, ' '));
}

function getPacketSourceName(item: AgentQueueItem) {
  if (item.sourceMeta?.sourceName) return item.sourceMeta.sourceName;
  if (item.source) return formatSourceType(item.source);
  return 'Sona';
}

function formatPacketSource(item: AgentQueueItem) {
  const sourceName = getPacketSourceName(item);
  const confidence = item.sourceMeta?.sourceConfidence ? `${item.sourceMeta.sourceConfidence} confidence` : 'verify source';
  return `${sourceName} · ${confidence}`;
}

function getTwinTargetRoles(twin?: CareerTwinSummary | null) {
  return twin?.memory?.goals?.targetRoles?.length ? twin.memory.goals.targetRoles : twin?.background?.targetRoles;
}

function getTwinTargetText(twin?: CareerTwinSummary | null, fallback = 'Target roles not set') {
  return compactList(getTwinTargetRoles(twin), fallback, 2);
}

function buildPacketArtifacts(item: AgentQueueItem, twin?: CareerTwinSummary | null): ReviewArtifact[] {
  const approved = hasPacketApproval(item);
  const expired = item.status === 'expired';
  const hasResumeDraft = Boolean(item.morphed_resume?.summary || item.resume_version_id);
  const hasCoverLetter = Boolean(item.cover_letter?.trim());
  const riskCount = item.riskSignals?.length || 0;
  const completeness = twin ? clampScore(twin.completeness?.score) : 0;
  const skillGapCount = twin?.memory?.activeSearch?.skillGaps?.length || 0;

  return [
    {
      label: 'Career Twin fit',
      description: twin ? `${completeness}% memory loaded for ${getTwinTargetText(twin)}` : 'Career Twin memory is not loaded',
      status: twin ? 'ready' : 'empty',
      icon: 'neurology',
      meta: skillGapCount > 0 ? `${skillGapCount} proof gap${skillGapCount === 1 ? '' : 's'}` : 'source context',
    },
    {
      label: 'Tailored resume',
      description: hasResumeDraft ? 'Draft matched to this role' : 'Needs a resume tailoring pass',
      status: approved ? 'approved' : expired ? 'blocked' : hasResumeDraft ? 'ready' : 'needs_review',
      icon: 'description',
      meta: hasResumeDraft ? 'facts to confirm' : 'ask Sona',
    },
    {
      label: 'Cover letter',
      description: hasCoverLetter ? 'Company-specific draft available' : 'No cover draft yet',
      status: approved ? 'approved' : expired ? 'blocked' : hasCoverLetter ? 'needs_review' : 'empty',
      icon: 'article',
      meta: hasCoverLetter ? 'approval required' : 'optional',
    },
    {
      label: 'Screening answers',
      description: riskCount > 0 ? `${riskCount} check${riskCount === 1 ? '' : 's'} before submit` : 'Ready for manual review',
      status: approved ? 'approved' : expired ? 'blocked' : riskCount > 0 ? 'blocked' : 'ready',
      icon: 'rule',
      meta: 'no auto-submit',
    },
  ];
}

function buildPacketReadiness(item: AgentQueueItem, twin?: CareerTwinSummary | null): PacketReadinessItem[] {
  const approved = hasPacketApproval(item);
  const expired = item.status === 'expired';
  const hasResumeDraft = Boolean(item.morphed_resume?.summary || item.resume_version_id);
  const hasCoverLetter = Boolean(item.cover_letter?.trim());
  const riskCount = item.riskSignals?.length || 0;
  const skillGaps = twin?.memory?.activeSearch?.skillGaps || [];
  const confirmedSkills = twin?.memory?.confirmedFacts?.skills || [];

  return [
    {
      label: 'Resume proof',
      description: hasResumeDraft
        ? confirmedSkills.length > 0
          ? `${confirmedSkills.slice(0, 3).join(', ')} stay grounded in Career Twin memory.`
          : 'Draft exists. Confirm titles, dates, employers, and metrics.'
        : 'Ask Sona to tailor or attach a resume before approval.',
      icon: 'description',
      status: approved ? 'approved' : expired ? 'blocked' : hasResumeDraft ? 'review' : 'blocked',
      statusLabel: approved ? 'Approved' : hasResumeDraft ? 'Review' : 'Missing',
    },
    {
      label: 'Cover letter',
      description: hasCoverLetter
        ? 'Company-specific draft is ready for voice and proof review.'
        : 'No letter draft is attached yet.',
      icon: 'article',
      status: approved ? 'approved' : expired ? 'blocked' : hasCoverLetter ? 'review' : 'blocked',
      statusLabel: approved ? 'Approved' : hasCoverLetter ? 'Review' : 'Missing',
    },
    {
      label: 'Recruiter message',
      description: item.fitSignals?.length
        ? `${item.fitSignals.slice(0, 2).join(', ')} can anchor outreach.`
        : 'Use match reason and role details to draft outreach.',
      icon: 'forward_to_inbox',
      status: approved ? 'approved' : expired ? 'blocked' : 'review',
      statusLabel: approved ? 'Approved' : 'Drafted',
    },
    {
      label: 'Screening answers',
      description: riskCount > 0
        ? `${riskCount} proof check${riskCount === 1 ? '' : 's'} before using answers.`
        : 'Prepared as notes for manual paste and review.',
      icon: 'rule',
      status: approved ? 'approved' : expired ? 'blocked' : riskCount > 0 ? 'blocked' : 'ready',
      statusLabel: approved ? 'Approved' : riskCount > 0 ? 'Blocked' : 'Ready',
    },
    {
      label: 'Proof checklist',
      description: skillGaps.length > 0
        ? `${skillGaps[0]} is a Career Twin gap to keep out of claims.`
        : riskCount > 0
          ? 'Risk notes remain visible until the user decides.'
          : 'No proof gaps are attached to this packet.',
      icon: 'fact_check',
      status: approved ? 'approved' : expired ? 'blocked' : riskCount > 0 || skillGaps.length > 0 ? 'review' : 'ready',
      statusLabel: approved ? 'Approved' : riskCount > 0 || skillGaps.length > 0 ? 'Review' : 'Ready',
    },
    {
      label: 'Approval gate',
      description: expired
        ? 'Refresh the role before any external action.'
        : approved
          ? `Packet state is ${formatPacketState(item.packetStatus)}.`
          : 'Nothing leaves Talent Studio until the user approves it.',
      icon: 'approval_delegation',
      status: approved ? 'approved' : expired ? 'blocked' : 'review',
      statusLabel: approved ? 'Approved' : expired ? 'Expired' : 'Waiting',
    },
  ];
}

function buildRecruiterMessage(item: AgentQueueItem, twin?: CareerTwinSummary | null) {
  const proof = (item.fitSignals?.length ? item.fitSignals : twin?.memory?.confirmedFacts?.skills || [])
    .filter(Boolean)
    .slice(0, 2);
  const proofText = proof.length ? proof.join(' and ') : 'AI product delivery and full-stack execution';

  return `Hi ${item.company} team,

I am interested in the ${item.job_title} role because the work maps closely to ${proofText}. I would bring a product-engineering mindset, proof-first AI workflow judgment, and careful user-facing execution.

I have attached a tailored resume for review and can share concrete examples before any next step.`;
}

function buildScreeningAnswerNotes(item: AgentQueueItem, twin?: CareerTwinSummary | null) {
  const fitSignals = item.fitSignals?.length ? item.fitSignals.slice(0, 3).join('; ') : item.match_reason || 'Strong role fit';
  const risks = item.riskSignals?.length
    ? `Check before using: ${item.riskSignals.slice(0, 3).join('; ')}.`
    : 'No packet risk signals are attached. Still review each answer before pasting.';
  const goals = getTwinTargetText(twin, item.job_title);

  return `Why this role: ${item.company} is aligned with ${goals}.

Relevant proof to use: ${fitSignals}.

Guardrail: ${risks}

Manual step: paste only after the resume, cover letter, and proof report are approved.`;
}

function buildProofChecklistBrief(item: AgentQueueItem, twin?: CareerTwinSummary | null) {
  const hasResumeDraft = Boolean(item.morphed_resume?.summary || item.resume_version_id);
  const hasCoverLetter = Boolean(item.cover_letter?.trim());
  const risks = item.riskSignals || [];
  const gaps = twin?.memory?.activeSearch?.skillGaps || [];
  const lines = [
    hasResumeDraft ? 'Resume draft is attached.' : 'Resume draft is missing.',
    hasCoverLetter ? 'Cover letter draft is attached.' : 'Cover letter draft is missing.',
    risks.length > 0 ? `Resolve ${risks.length} packet risk signal${risks.length === 1 ? '' : 's'}.` : 'No packet risk signals attached.',
    gaps.length > 0 ? `Keep ${gaps.slice(0, 2).join(', ')} out of claims until proven.` : 'Career Twin has no extra gap flagged for this packet.',
  ];

  return lines.join('\n');
}

function buildPacketDrafts(item: AgentQueueItem, twin?: CareerTwinSummary | null): PacketDraftItem[] {
  return [
    {
      label: 'Recruiter message',
      description: 'Short outreach grounded in fit signals.',
      icon: 'forward_to_inbox',
      body: buildRecruiterMessage(item, twin),
      actionLabel: 'Refine outreach',
      prompt: `Draft a concise recruiter message for ${item.job_title} at ${item.company}. Use my Career Twin facts, fit signals, and truthful proof only. Do not submit or send anything.`,
    },
    {
      label: 'Screening answer notes',
      description: 'Manual-paste notes with proof guardrails.',
      icon: 'rule',
      body: buildScreeningAnswerNotes(item, twin),
      actionLabel: 'Draft answers',
      prompt: `Prepare screening-answer notes for ${item.job_title} at ${item.company}. Separate proven facts, missing proof, and risk notes. Keep everything review-first and manual-paste only.`,
    },
    {
      label: 'Proof checklist',
      description: 'What must be checked before approval.',
      icon: 'fact_check',
      body: buildProofChecklistBrief(item, twin),
      actionLabel: 'Resolve proof',
      prompt: `Resolve the packet proof checklist for ${item.job_title} at ${item.company}. Show resume, cover letter, recruiter message, screening answers, missing proof, and the approval gate.`,
    },
  ];
}

function buildProofItems(item: AgentQueueItem, twin?: CareerTwinSummary | null): ProofItem[] {
  const fitCount = item.fitSignals?.length || 0;
  const riskCount = item.riskSignals?.length || 0;
  const hasResumeDraft = Boolean(item.morphed_resume?.summary || item.resume_version_id);
  const expired = item.status === 'expired';
  const confirmedSkills = twin?.memory?.confirmedFacts?.skills || [];
  const skillGaps = twin?.memory?.activeSearch?.skillGaps || [];
  const hasTwinResume = Boolean(twin?.memory?.confirmedFacts?.hasResume);
  let factsDescription = 'Sona needs resume evidence before this can become a trustworthy packet.';

  if (hasResumeDraft && confirmedSkills.length > 0) {
    factsDescription = `${confirmedSkills.slice(0, 3).join(', ')}${confirmedSkills.length > 3 ? ` +${confirmedSkills.length - 3}` : ''} stay grounded in Career Twin memory.`;
  } else if (hasResumeDraft) {
    factsDescription = 'Confirm titles, dates, metrics, and employers before approving.';
  } else if (hasTwinResume) {
    factsDescription = 'Use the saved resume memory before approving this packet.';
  } else if (fitCount > 0) {
    factsDescription = `${fitCount} fit signal${fitCount === 1 ? '' : 's'} found. Add a resume draft before applying.`;
  }

  return [
    {
      label: 'Facts preserved',
      description: factsDescription,
      tone: hasResumeDraft || hasTwinResume ? 'success' : 'warning',
      icon: hasResumeDraft || hasTwinResume ? 'verified' : 'fact_check',
    },
    {
      label: 'Missing requirements',
      description: riskCount > 0
        ? `${riskCount} item${riskCount === 1 ? '' : 's'} need proof or a user decision.`
        : skillGaps.length > 0
          ? `${skillGaps[0]} needs proof before it appears in this packet.`
          : 'No missing requirement flags are attached to this packet.',
      tone: riskCount > 0 || skillGaps.length > 0 ? 'warning' : 'success',
      icon: riskCount > 0 || skillGaps.length > 0 ? 'plagiarism' : 'check_circle',
    },
    {
      label: 'Submission control',
      description: expired
        ? 'This packet is expired. Ask Sona for a fresher role before applying.'
        : item.status === 'pending'
          ? 'Nothing is submitted until you approve the packet.'
          : item.status === 'dismissed'
            ? 'Sona will use your feedback to avoid weaker matches.'
            : 'The packet has moved past review into the next manual step.',
      tone: expired ? 'danger' : item.status === 'dismissed' ? 'neutral' : 'success',
      icon: expired ? 'event_busy' : 'approval_delegation',
    },
  ];
}

function packetRequirementStatus(isReady: boolean, hasConcern = false): ProofRequirementStatus {
  if (hasConcern) return isReady ? 'partial' : 'missing';
  return isReady ? 'matched' : 'missing';
}

function buildQueueProofReport(item: AgentQueueItem, twin?: CareerTwinSummary | null): ProofEngineReportData {
  const score = clampScore(item.match_score || 0);
  const fitSignals = item.fitSignals || [];
  const riskSignals = item.riskSignals || [];
  const skillGaps = twin?.memory?.activeSearch?.skillGaps || [];
  const confirmedSkills = twin?.memory?.confirmedFacts?.skills || [];
  const hasResumeDraft = Boolean(item.morphed_resume?.summary || item.resume_version_id);
  const hasCoverLetter = Boolean(item.cover_letter?.trim());
  const hasTwinResume = Boolean(twin?.memory?.confirmedFacts?.hasResume);
  const isExpired = item.status === 'expired';
  const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
  const requirements: ProofEngineReportData['requirements'] = [
    {
      label: 'Role fit',
      status: score >= 75 ? 'matched' : score >= 55 ? 'partial' : 'missing',
      evidence: item.match_reason || `${score}% match score from the queued role.`,
      source: 'Sona fit score',
    },
    {
      label: 'Tailored resume draft',
      status: packetRequirementStatus(hasResumeDraft, !hasTwinResume),
      evidence: hasResumeDraft
        ? 'A resume draft or linked resume version is attached for review.'
        : 'Ask Sona to tailor a resume before using this packet.',
      source: hasTwinResume ? 'Career Twin resume memory' : 'Packet data',
    },
    {
      label: 'Cover letter draft',
      status: packetRequirementStatus(hasCoverLetter),
      evidence: hasCoverLetter
        ? 'A company-specific cover letter draft is attached and still needs approval.'
        : 'No cover letter draft is attached yet.',
      source: 'Application packet',
    },
    {
      label: 'Screening answer review',
      status: riskSignals.length > 0 ? 'partial' : 'matched',
      evidence: riskSignals.length > 0
        ? `${riskSignals.length} risk signal${riskSignals.length === 1 ? '' : 's'} must be checked before screening answers are pasted.`
        : 'No screening-answer risk signals are attached to this packet.',
      source: 'Review checklist',
    },
  ];

  fitSignals.slice(0, 4).forEach(signal => {
    requirements.push({
      label: signal,
      status: 'matched',
      evidence: 'Sona marked this as a fit signal. Keep it only where the packet has resume evidence.',
      source: 'Fit signal',
    });
  });

  riskSignals.slice(0, 4).forEach(signal => {
    requirements.push({
      label: signal,
      status: isExpired ? 'blocked' : 'missing',
      evidence: 'This remains a proof gap or user-decision item before approval.',
      source: 'Risk signal',
    });
  });

  skillGaps.slice(0, Math.max(0, 10 - requirements.length)).forEach(gap => {
    requirements.push({
      label: gap,
      status: 'missing',
      evidence: 'Career Twin marks this as a known skill gap. Do not claim it without user proof.',
      source: 'Career Twin gap',
    });
  });

  const rejectedClaims: ProofEngineReportData['rejectedClaims'] = [
    ...riskSignals.slice(0, 4).map(signal => ({
      claim: signal,
      reason: 'The packet cannot turn this risk note into a positive claim without evidence.',
      decision: 'Keep as a review item until the user confirms the facts',
    })),
    ...skillGaps.slice(0, 2).map(gap => ({
      claim: gap,
      reason: 'Career Twin lists this as a missing or weak requirement.',
      decision: 'Block from resume, cover letter, and screening answers until proof is added',
    })),
  ];

  if (!hasResumeDraft) {
    rejectedClaims.push({
      claim: 'Resume-specific achievements',
      reason: 'No tailored resume draft is attached to support role-specific claims.',
      decision: 'Ask Sona to prepare or link a resume before approving the packet',
    });
  }

  if (isExpired) {
    rejectedClaims.push({
      claim: 'Application-ready status',
      reason: 'The packet is expired.',
      decision: 'Refresh the role before applying or answering screening questions',
    });
  }

  const packetTone: ProofCheckTone = isExpired ? 'danger' : item.status === 'pending' ? 'warning' : 'success';

  return {
    title: `${item.company} packet proof report`,
    description: 'This report checks the queued resume, cover letter, screening-answer readiness, and approval controls before the user acts on the packet.',
    score,
    scoreLabel: 'Fit',
    sourceLabel: item.job_description?.trim() ? 'Queued job description' : 'Agent Queue packet',
    requirements: requirements.slice(0, 12),
    preservedFacts: [
      {
        label: 'Company and role locked',
        detail: `${item.company} and ${item.job_title} stay tied to this packet before any draft is approved.`,
        tone: 'success' as ProofCheckTone,
      },
      {
        label: 'Career Twin context',
        detail: twin
          ? `${clampScore(twin.completeness?.score)}% memory loaded for ${getTwinTargetText(twin)}.`
          : 'Career Twin memory is not loaded in this session.',
        tone: twin ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
      },
      {
        label: 'Resume evidence',
        detail: hasResumeDraft
          ? confirmedSkills.length > 0
            ? `${confirmedSkills.slice(0, 3).join(', ')}${confirmedSkills.length > 3 ? ` +${confirmedSkills.length - 3}` : ''} stay grounded in saved memory.`
            : 'A linked or morphed resume is available, but titles, dates, metrics, and employers still need review.'
          : 'No tailored resume evidence is attached yet.',
        tone: hasResumeDraft ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
      },
      {
        label: 'Review-first control',
        detail: 'Talent Studio opens or tracks the role only after the user approves the packet.',
        tone: 'success' as ProofCheckTone,
      },
    ],
    rejectedClaims: rejectedClaims.slice(0, 6),
    changes: [
      {
        before: 'A saved or queued role had fit signals, risks, and draft assets scattered across the packet.',
        after: `This packet is marked ${status.label.toLowerCase()} with resume, cover letter, and screening readiness shown together.`,
        rationale: 'The user can approve, dismiss, or ask Sona to revise with evidence in view.',
      },
      {
        before: hasCoverLetter ? 'The cover letter existed as a standalone draft.' : 'No cover letter draft was attached.',
        after: hasCoverLetter ? 'The cover letter is treated as an artifact that still needs user approval.' : 'Cover letter generation remains an open packet task.',
        rationale: 'Career writing should not leave the product just because Sona prepared it.',
      },
      {
        before: 'Screening answers could be treated as a generic checklist item.',
        after: riskSignals.length > 0
          ? 'Screening-answer review is tied to the packet risk signals before submission.'
          : 'Screening-answer review stays visible even when no risk signal is attached.',
        rationale: 'This keeps application questions review-first and prevents unsupported claims.',
      },
    ],
    formattingChecks: [
      {
        label: 'Manual approval required',
        detail: item.status === 'pending'
          ? 'This packet still requires user approval.'
          : `Current packet state is ${status.label.toLowerCase()}.`,
        tone: packetTone,
      },
      {
        label: 'No auto-submit',
        detail: 'The queue can prepare, explain, and open the job. It does not submit applications for the user.',
        tone: 'success' as ProofCheckTone,
      },
      {
        label: 'Cover letter review',
        detail: hasCoverLetter
          ? 'Copy, save, or revise the draft only after checking the proof report.'
          : 'Generate a cover letter before considering this packet complete.',
        tone: hasCoverLetter ? 'warning' as ProofCheckTone : 'neutral' as ProofCheckTone,
      },
      {
        label: 'Screening answer guard',
        detail: riskSignals.length > 0
          ? 'Risk notes must be resolved before screening answers are pasted into an external form.'
          : 'Screening answers still need manual review before use.',
        tone: riskSignals.length > 0 ? 'warning' as ProofCheckTone : 'success' as ProofCheckTone,
      },
    ],
  };
}

function buildEmptyQueueArtifacts(twin?: CareerTwinSummary | null, twinLoading = false): ReviewArtifact[] {
  const targetRoles = getTwinTargetRoles(twin);
  const hasTargets = Boolean(targetRoles?.length);
  const hasResume = Boolean(twin?.memory?.confirmedFacts?.hasResume);

  return [
    {
      label: 'Career Twin',
      description: twinLoading
        ? 'Loading saved goals and resume context'
        : twin ? `${clampScore(twin.completeness?.score)}% complete for ${getTwinTargetText(twin)}` : 'Sona needs goals, resume memory, or saved jobs',
      status: twinLoading ? 'loading' : twin ? 'ready' : 'empty',
      icon: 'neurology',
      meta: twin ? 'memory loaded' : 'setup first',
    },
    {
      label: 'Search preferences',
      description: hasTargets ? `${getTwinTargetText(twin)} are ready for matching` : 'Set target roles, locations, salary, and exclusions',
      status: hasTargets ? 'ready' : 'empty',
      icon: 'track_changes',
      meta: formatSalaryFloor(twin?.memory?.goals?.salaryMin),
    },
    {
      label: 'Resume proof',
      description: hasResume ? 'Resume memory can ground new packets' : 'Add a resume before packet drafting',
      status: hasResume ? 'ready' : 'blocked',
      icon: 'description',
      meta: hasResume ? `${metricValue(twin?.memory?.confirmedFacts?.resumeVersionCount)} version${twin?.memory?.confirmedFacts?.resumeVersionCount === 1 ? '' : 's'}` : 'required',
    },
    {
      label: 'User approval',
      description: 'Nothing leaves Talent Studio without your review',
      status: 'blocked',
      icon: 'approval_delegation',
      meta: 'no auto-submit',
    },
  ];
}

function buildEmptyQueueProof(twin?: CareerTwinSummary | null): ProofItem[] {
  const skillGaps = twin?.memory?.activeSearch?.skillGaps || [];
  const hasResume = Boolean(twin?.memory?.confirmedFacts?.hasResume);

  return [
    {
      label: 'Facts preserved',
      description: hasResume
        ? 'Resume claims stay grounded in saved Career Twin memory.'
        : 'Resume claims will stay grounded once a resume is added.',
      tone: hasResume ? 'success' : 'neutral',
      icon: 'verified',
    },
    {
      label: 'Missing requirements',
      description: skillGaps.length > 0
        ? `${skillGaps[0]} is already marked as a proof gap.`
        : 'Unproven role requirements will be flagged before a packet is approved.',
      tone: skillGaps.length > 0 ? 'warning' : 'neutral',
      icon: 'plagiarism',
    },
    {
      label: 'Review control',
      description: 'The approval step remains visible even when Sona prepares the work.',
      tone: 'success',
      icon: 'task_alt',
    },
  ];
}

function askSona(
  prompt: string,
  contextLabel = 'Agent Queue',
  twin?: CareerTwinSummary | null,
  metadata: Record<string, unknown> = {},
) {
  window.dispatchEvent(new CustomEvent('sona:open', {
    detail: {
      prompt,
      contextLabel,
      context: {
        source: 'agent-queue',
        approvalRequired: true,
        metadata: {
          ...careerTwinPromptMetadata(twin || null),
          ...metadata,
        },
      },
    },
  }));
}

function CareerTwinQueueContext({
  twin,
  loading,
  error,
  stats,
  onAskSona,
  onRetry,
}: {
  twin: CareerTwinSummary | null;
  loading: boolean;
  error?: string;
  stats: QueueStats;
  onAskSona: () => void;
  onRetry: () => void;
}) {
  const memory = twin?.memory;
  const completeness = twin ? clampScore(twin.completeness?.score) : 0;
  const targetText = getTwinTargetText(twin);
  const skillGaps = memory?.activeSearch?.skillGaps || [];
  const hasResume = Boolean(memory?.confirmedFacts?.hasResume);
  const resumeVersions = memory?.confirmedFacts?.resumeVersionCount || 0;
  const reviewRequired = memory?.constraints?.requiresReviewBeforeExternalAction !== false;
  const activeApplications = memory?.activeSearch?.totalApplications ?? stats.total;

  const rows = [
    {
      label: 'Memory',
      value: loading ? 'Loading' : twin ? `${completeness}%` : 'Not loaded',
      description: twin ? compactList(twin.completeness?.missing, 'Core facts ready', 2) : 'Sign in data or profile setup may be missing',
      icon: loading ? 'progress_activity' : 'neurology',
    },
    {
      label: 'Targets',
      value: targetText,
      description: `${titleCase(memory?.goals?.remotePreference)} preference`,
      icon: 'track_changes',
    },
    {
      label: 'Search',
      value: `${metricValue(stats.pending)} pending`,
      description: `${metricValue(activeApplications)} tracked, ${metricValue(stats.expiring)} expiring`,
      icon: 'work',
    },
    {
      label: 'Proof',
      value: hasResume ? `${metricValue(resumeVersions)} resume${resumeVersions === 1 ? '' : 's'}` : 'Resume needed',
      description: skillGaps[0] || (reviewRequired ? 'Review required before external action' : 'Review gate can be configured'),
      icon: hasResume ? 'verified' : 'description',
    },
  ];

  return (
    <section
      className="mb-5 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4"
      aria-busy={loading}
    >
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="icon-shell-neutral grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border">
            <span className={`material-symbols-rounded icon-neutral text-[22px] ${loading ? 'animate-spin' : ''}`} aria-hidden="true">
              {loading ? 'progress_activity' : 'neurology'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Career Twin context
            </p>
            <h2 className="premium-heading-wrap mt-1 text-lg font-bold text-[var(--text-primary)]">
              Packets use saved memory before Sona drafts or recommends.
            </h2>
            <p className="premium-copy-wrap mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
              The queue should check goals, resume proof, active search state, and review gates before a packet moves forward.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onAskSona}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
        >
          <SonaMark size="xs" state="listening" />
          Review memory
        </button>
      </div>

      {error && (
        <div role="status" className="mt-4 flex min-w-0 flex-col gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <span className="material-symbols-rounded icon-status-warning mt-0.5 shrink-0 text-[18px]" aria-hidden="true">warning</span>
            <p className="text-xs leading-5 text-[var(--text-secondary)]">{error}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
          >
            <span className="material-symbols-rounded text-[16px]" aria-hidden="true">refresh</span>
            Retry
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map(row => (
          <div key={row.label} className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`material-symbols-rounded icon-neutral shrink-0 text-[18px] ${loading && row.icon === 'progress_activity' ? 'animate-spin' : ''}`} aria-hidden="true">
                {row.icon}
              </span>
              <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {row.label}
              </p>
            </div>
            <p className="premium-heading-wrap mt-2 text-sm font-bold text-[var(--text-primary)]">{row.value}</p>
            <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">{row.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActionTile({
  icon,
  tone,
  label,
  value,
  description,
  onClick,
}: {
  icon: string;
  tone: ToolIconTone;
  label: string;
  value: number;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tone={tone}
      className="group flex min-w-0 items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 text-left transition-all hover:border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
    >
      <SuiteToolIcon icon={icon} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xl font-black tabular-nums text-[var(--text-primary)]">{value}</span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
        </div>
        <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>
      </div>
      <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)]">arrow_forward</span>
    </button>
  );
}

function QueueCard({
  item,
  twin,
  selected,
  onSelect,
  onApprove,
  onDismiss,
  onApply,
  loading,
  approvalBlockers = [],
}: {
  item: AgentQueueItem;
  twin?: CareerTwinSummary | null;
  selected: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onDismiss: () => void;
  onApply: () => void;
  loading: boolean;
  approvalBlockers?: string[];
}) {
  const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
  const expiringSoon = item.status === 'pending' && daysUntil(item.expires_at) <= 2;
  const trackable = isPacketTrackable(item);
  const approvalBlocked = approvalBlockers.length > 0;

  return (
    <article
      className={`rounded-[22px] border bg-[var(--card-bg)] p-4 transition-all hover:border-[var(--border)] ${
        selected ? 'border-[var(--border)] ring-2 ring-[var(--accent)]' : 'border-[var(--border-subtle)]'
      }`}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left focus:outline-none">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]">
            <span className="text-sm font-black tabular-nums">{Math.round(item.match_score || 0)}%</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 text-base font-bold leading-6 text-[var(--text-primary)]">{item.job_title}</h3>
              {expiringSoon && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-primary)]">
                  <span className="material-symbols-rounded icon-status-warning text-[13px]" aria-hidden="true">schedule</span>
                  Expiring
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm leading-5 text-[var(--text-secondary)]">{item.company} · {item.location}</p>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{item.match_reason}</p>
            {item.fitSignals?.[0] && (
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-primary)]">
                <span className="font-bold">Why: </span>{item.fitSignals[0]}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">{formatSalary(item.salary)}</span>
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">{formatPacketSource(item)}</span>
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">{status.label}</span>
          {item.packetStatus && <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">{item.packetStatus.replace(/_/g, ' ')}</span>}
          {item.cover_letter && <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">Cover draft</span>}
          {hasApplicationTracker(item) && <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)]">Tracked</span>}
          {approvalBlocked && <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)]"><span className="material-symbols-rounded icon-status-warning text-[13px]" aria-hidden="true">lock</span>Checks first</span>}
        </div>
      </button>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => askSona(
            `Explain this agent packet using my Career Twin before recommending next steps. Role: ${item.job_title}. Company: ${item.company}. Fit: ${Math.round(item.match_score || 0)}%. Show evidence, risks, missing proof, and the approval path.`,
            `${item.company} packet`,
            twin,
            {
              packetId: item.id,
              company: item.company,
              role: item.job_title,
              matchScore: item.match_score,
              status: item.status,
            },
          )}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition-all hover:bg-[var(--bg-hover)]"
        >
          <SonaMark size="xs" state="idle" />
          Ask Sona
        </button>
        {isPacketApprovable(item) && (
          <>
            <button
              type="button"
              onClick={onApprove}
              disabled={loading || approvalBlocked}
              title={approvalBlocked ? `Resolve before approval: ${approvalBlockers.slice(0, 3).join(', ')}` : undefined}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--text-primary)] px-3 py-2 text-xs font-semibold text-[var(--bg-deep)] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {approvalBlocked ? 'Resolve checks first' : 'Approve packet'}
            </button>
            <button type="button" onClick={onDismiss} disabled={loading} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-hover)] disabled:opacity-45">Dismiss</button>
          </>
        )}
        {trackable && (
          <button type="button" onClick={onApply} disabled={loading} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--text-primary)] px-3 py-2 text-xs font-semibold text-[var(--bg-deep)] transition-all hover:opacity-90 disabled:opacity-45">Track and open posting</button>
        )}
      </div>
    </article>
  );
}

function ActionFeedback({
  message,
  onDismiss,
}: {
  message?: string;
  onDismiss: () => void;
}) {
  if (!message) return null;

  return (
    <div role="alert" className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
      <div className="flex min-w-0 items-start gap-2">
        <span className="material-symbols-rounded icon-status-danger mt-0.5 shrink-0 text-[18px]" aria-hidden="true">error</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text-primary)]">Action needs attention</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{message}</p>
        </div>
        <button type="button" onClick={onDismiss} className="rounded-lg p-1 text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" aria-label="Dismiss action message">
          <span className="material-symbols-rounded text-[18px]" aria-hidden="true">close</span>
        </button>
      </div>
    </div>
  );
}

function PacketReadinessCockpit({
  item,
  twin,
}: {
  item: AgentQueueItem;
  twin?: CareerTwinSummary | null;
}) {
  const readiness = buildPacketReadiness(item, twin);
  const drafts = buildPacketDrafts(item, twin);
  const reviewCount = readiness.filter(entry => entry.status === 'review').length;
  const blockedCount = readiness.filter(entry => entry.status === 'blocked').length;
  const readyCount = readiness.filter(entry => entry.status === 'ready' || entry.status === 'approved').length;
  const readinessScore = Math.round(
    (readiness.reduce((sum, entry) => {
      if (entry.status === 'blocked') return sum;
      if (entry.status === 'review') return sum + 0.6;
      return sum + 1;
    }, 0) / readiness.length) * 100,
  );

  return (
    <section className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Packet cockpit</p>
          <h3 className="premium-heading-wrap mt-1 text-lg font-bold text-[var(--text-primary)]">Review-ready application packet</h3>
          <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            Resume, cover letter, outreach, screening notes, proof checks, and approval gate in one place. Current state: {formatPacketState(item.packetStatus)}.
          </p>
        </div>
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <span className="text-lg font-black tabular-nums text-[var(--text-primary)]">{readinessScore}%</span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {readiness.map(entry => (
          <div key={entry.label} className="min-w-0 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <span className="material-symbols-rounded icon-neutral mt-0.5 shrink-0 text-[18px]" aria-hidden="true">{entry.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)]">{entry.label}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{entry.description}</p>
                </div>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${READINESS_STATUS_CLASS[entry.status]}`}>
                {entry.status === 'blocked' && <span className="material-symbols-rounded icon-status-danger text-[13px]" aria-hidden="true">error</span>}
                {entry.status === 'review' && <span className="material-symbols-rounded icon-status-warning text-[13px]" aria-hidden="true">rate_review</span>}
                {entry.statusLabel}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <p className="text-xl font-black tabular-nums text-[var(--text-primary)]">{readyCount}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Ready</p>
        </div>
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <p className="text-xl font-black tabular-nums text-[var(--text-primary)]">{reviewCount}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Review</p>
        </div>
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <p className="text-xl font-black tabular-nums text-[var(--text-primary)]">{blockedCount}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Blocked</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {drafts.map(draft => (
          <article key={draft.label} className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <span className="material-symbols-rounded icon-neutral mt-0.5 shrink-0 text-[18px]" aria-hidden="true">{draft.icon}</span>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">{draft.label}</h4>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{draft.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => askSona(
                  draft.prompt,
                  `${item.company} ${draft.label}`,
                  twin,
                  { packetId: item.id, company: item.company, role: item.job_title },
                )}
                className="shrink-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
              >
                {draft.actionLabel}
              </button>
            </div>
            <div className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-xs leading-6 text-[var(--text-secondary)]">
              {draft.body}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PacketDrawer({
  item,
  twin,
  onClose,
  onApprove,
  onDismiss,
  onApply,
  onFeedback,
  actionLoading,
  actionError,
  onDismissActionError,
  approvalBlockers = [],
}: {
  item: AgentQueueItem;
  twin?: CareerTwinSummary | null;
  onClose: () => void;
  onApprove: () => void;
  onDismiss: () => void;
  onApply: () => void;
  onFeedback: (tag: string) => void;
  actionLoading: boolean;
  actionError?: string;
  onDismissActionError: () => void;
  approvalBlockers?: string[];
}) {
  const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
  const tags = item.feedbackTags || [];
  const packetArtifacts = buildPacketArtifacts(item, twin);
  const proofReport = buildQueueProofReport(item, twin);
  const approvalBlocked = approvalBlockers.length > 0;
  const safeJobUrl = getSafeExternalUrl(item.job_url);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 1023px)');
    if (!mobileQuery.matches) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;

      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter(element => !element.hasAttribute('hidden'));
      if (focusable.length === 0) {
        event.preventDefault();
        drawerRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[54] cursor-default bg-black/20 backdrop-blur-[1px] lg:hidden"
        onClick={onClose}
        aria-label="Close application packet"
        tabIndex={-1}
      />
      <aside
        ref={drawerRef}
        tabIndex={-1}
        className="fixed inset-x-3 bottom-3 top-[7.25rem] z-[55] overflow-hidden rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card-bg)] shadow-2xl outline-none lg:sticky lg:top-6 lg:z-auto lg:h-[calc(100dvh-3rem)] lg:w-[430px] lg:shrink-0"
        role="dialog"
        aria-modal="true"
        aria-label="Application packet"
      >
      <div className="flex h-full flex-col">
        <div className="border-b border-[var(--border-subtle)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <SuiteToolIcon icon={status.icon} size="sm" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Application Packet</p>
                <h2 className="mt-1 text-lg font-bold leading-6 text-[var(--text-primary)]">{item.job_title}</h2>
                <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{item.company} · {item.location}</p>
              </div>
            </div>
            <button ref={closeButtonRef} type="button" onClick={onClose} className="rounded-xl p-2 text-[var(--text-muted)] transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" aria-label="Close packet">
              <span className="material-symbols-rounded text-[20px]">close</span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              <p className="text-xl font-black tabular-nums text-[var(--text-primary)]">{Math.round(item.match_score || 0)}%</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Fit</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              <p className="text-sm font-bold text-[var(--text-primary)]">{formatShortDate(item.expires_at)}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Review by</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              <p className="text-sm font-bold text-[var(--text-primary)]">{status.label}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Status</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              <p className="truncate text-sm font-bold text-[var(--text-primary)]">{item.sourceMeta?.sourceType ? formatSourceType(item.sourceMeta.sourceType) : getPacketSourceName(item)}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Source</p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 pb-28">
          <ApplicationPacketReview
            title={`${item.company} packet`}
            description="Review every prepared artifact before this becomes an application."
            artifacts={packetArtifacts}
            primaryAction={(
              <button
                type="button"
                onClick={() => askSona(
                  `Review this packet against my Career Twin before I approve it. Role: ${item.job_title}. Company: ${item.company}. Check the resume, cover letter, screening answers, target roles, saved proof, risks, missing facts, and approval steps. Do not submit anything externally.`,
                  `${item.company} packet review`,
                  twin,
                  {
                    packetId: item.id,
                    company: item.company,
                    role: item.job_title,
                    matchScore: item.match_score,
                    status: item.status,
                    packetStatus: item.packetStatus,
                  },
                )}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <SonaMark size="xs" state="listening" />
                Ask Sona to review
              </button>
            )}
            secondaryAction={item.status === 'pending' ? (
              <button
                type="button"
                onClick={onApprove}
                disabled={actionLoading || item.source === 'legacy_sona' || approvalBlocked}
                title={approvalBlocked ? `Resolve before approval: ${approvalBlockers.slice(0, 3).join(', ')}` : undefined}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className="material-symbols-rounded text-[18px]" aria-hidden="true">{approvalBlocked ? 'lock' : 'task_alt'}</span>
                {approvalBlocked ? 'Resolve checks first' : 'Approve packet'}
              </button>
            ) : isPacketTrackable(item) ? (
              <button
                type="button"
                onClick={onApply}
                disabled={actionLoading}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)] disabled:opacity-45"
              >
                <span className="material-symbols-rounded text-[18px]" aria-hidden="true">open_in_new</span>
                Track and open posting
              </button>
            ) : undefined}
          />

          <ActionFeedback message={actionError} onDismiss={onDismissActionError} />

          <PacketReadinessCockpit item={item} twin={twin} />

          <ProofEngineReport report={proofReport} compact />
          <button
            type="button"
            onClick={() => askSona(
              `Resolve the proof checks for ${item.job_title} at ${item.company} using my Career Twin. Fit signals: ${(item.fitSignals || []).join('; ') || 'none'}. Risk signals: ${(item.riskSignals || []).join('; ') || 'none'}. Show what is proven, what is missing, and what I must approve before resume, cover letter, or screening answers are used.`,
              `${item.company} proof checks`,
              twin,
              {
                packetId: item.id,
                company: item.company,
                role: item.job_title,
                fitSignals: item.fitSignals || [],
                riskSignals: item.riskSignals || [],
              },
            )}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
          >
            <span className="material-symbols-rounded text-[18px]" aria-hidden="true">science</span>
            Resolve checks with Sona
          </button>

          <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                <span className="material-symbols-rounded icon-neutral text-[18px]" aria-hidden="true">travel_explore</span>
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Source confidence</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{formatPacketSource(item)}</p>
                {(item.sourceNotes || []).length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {(item.sourceNotes || []).slice(0, 3).map((note, index) => (
                      <li key={`${note || 'source-note'}-${index}`} className="flex gap-2 text-xs leading-5 text-[var(--text-secondary)]">
                        <span className="material-symbols-rounded icon-neutral mt-0.5 shrink-0 text-[15px]" aria-hidden="true">verified</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Why Sona queued it</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.match_reason || 'Sona identified this as a relevant opportunity based on your preferences.'}</p>
            <div className="mt-3 space-y-2">
              {(item.fitSignals || []).slice(0, 4).map((signal, index) => (
                <div key={`${signal || 'fit-signal'}-${index}`} className="flex gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
                  <span className="material-symbols-rounded icon-status-success text-[16px]">check_circle</span>
                  <span>{signal}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Next action</h3>
            <div className="mt-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
              <p className="text-sm leading-6 text-[var(--text-primary)]">{deriveNextAction(item)}</p>
              <button
                type="button"
                onClick={() => askSona(
                  `What should I do next for this application packet? Use my Career Twin, then rank the next step by proof, urgency, and approval risk. Role: ${item.job_title}. Company: ${item.company}. Match reason: ${item.match_reason}`,
                  `${item.company} next action`,
                  twin,
                  {
                    packetId: item.id,
                    company: item.company,
                    role: item.job_title,
                    nextAction: deriveNextAction(item),
                  },
                )}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-bold text-[var(--text-primary)]"
              >
                <SonaMark size="xs" state="listening" />
                Ask Sona for a plan
              </button>
            </div>
          </section>

          {(item.riskSignals || []).length > 0 && (
            <section>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Checks before submitting</h3>
              <div className="mt-2 space-y-2">
                {(item.riskSignals || []).slice(0, 5).map((signal, index) => (
                  <div key={`${signal || 'risk-signal'}-${index}`} className="flex gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
                    <span className="material-symbols-rounded icon-status-warning text-[16px]">info</span>
                    <span>{signal}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {item.cover_letter && (
            <section>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Cover letter draft</h3>
                <button
                  type="button"
                  onClick={() => askSona(
                    `Improve this cover letter for ${item.job_title} at ${item.company} using my Career Twin voice and facts. Preserve truthful claims only. Draft: ${item.cover_letter}`,
                    `${item.company} cover letter`,
                    twin,
                    { packetId: item.id, company: item.company, role: item.job_title },
                  )}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
                >
                  Improve
                </button>
              </div>
              <div className="mt-2 max-h-56 overflow-y-auto break-words rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-xs leading-6 text-[var(--text-secondary)] whitespace-pre-wrap">{item.cover_letter}</div>
            </section>
          )}

          {item.morphed_resume?.summary && (
            <section>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Tailored resume summary</h3>
              <div className="mt-2 break-words rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-xs leading-6 text-[var(--text-secondary)]">{item.morphed_resume.summary}</div>
            </section>
          )}

          <section>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Teach Sona</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {FEEDBACK_TAGS.map(tag => {
                const active = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onFeedback(tag)}
                    disabled={item.source === 'legacy_sona'}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-45 ${
                      active
                        ? 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </section>

          {item.job_description && (
            <section>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Posting details</h3>
              <div className="mt-2 max-h-64 overflow-y-auto break-words rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-xs leading-6 text-[var(--text-secondary)] whitespace-pre-wrap">{item.job_description}</div>
            </section>
          )}
        </div>

        <div className="border-t border-[var(--border-subtle)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {isPacketApprovable(item) && (
              <>
                <button
                  type="button"
                  onClick={onApprove}
                  disabled={actionLoading || approvalBlocked}
                  title={approvalBlocked ? `Resolve before approval: ${approvalBlockers.slice(0, 3).join(', ')}` : undefined}
                  className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--text-primary)] px-4 py-2.5 text-sm font-bold leading-tight text-[var(--bg-deep)] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {approvalBlocked ? 'Resolve checks first' : 'Approve packet'}
                </button>
                <button type="button" onClick={onDismiss} disabled={actionLoading} className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-bold text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-hover)] disabled:opacity-45">Dismiss</button>
              </>
            )}
            {isPacketTrackable(item) && (
              <button type="button" onClick={onApply} disabled={actionLoading} className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--text-primary)] px-4 py-2.5 text-sm font-bold text-[var(--bg-deep)] transition-all hover:opacity-90 disabled:opacity-45 sm:col-span-2">Track and open posting</button>
            )}
            {safeJobUrl && item.status === 'approved' && (
              <a href={safeJobUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-bold text-[var(--text-primary)] transition-all hover:bg-[var(--bg-hover)] sm:col-span-2">
                <span className="material-symbols-rounded text-[16px]">open_in_new</span>
                Posting
              </a>
            )}
          </div>
        </div>
      </div>
      </aside>
    </>
  );
}

function QueueErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section role="alert" className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <AnimatedToolIcon icon="error" tone="rose" size="sm" />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Agent Queue could not load</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{message}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
        >
          <span className="material-symbols-rounded text-[18px]" aria-hidden="true">refresh</span>
          Retry
        </button>
      </div>
    </section>
  );
}

function AgentQueueEmptyState({
  twin,
  twinLoading,
  onSetPreferences,
  onAskSona,
}: {
  twin?: CareerTwinSummary | null;
  twinLoading?: boolean;
  onSetPreferences: () => void;
  onAskSona: () => void;
}) {
  const artifacts = buildEmptyQueueArtifacts(twin, twinLoading);
  const proofItems = buildEmptyQueueProof(twin);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,1.05fr)]">
      <section className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <SonaMark size="md" state="thinking" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Review queue</p>
            <h2 className="premium-heading-wrap mt-1 text-xl font-bold text-[var(--text-primary)]">No packets yet</h2>
            <p className="premium-copy-wrap mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {twin
                ? `Career Twin is ready for ${getTwinTargetText(twin)}. Save roles or set searches so Sona can prepare packets, show the evidence, then wait for your approval.`
                : 'Set search preferences or save roles. Sona will prepare packets here, show the evidence, then wait for your approval.'}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {[
            ['1', 'Set role targets', 'Target roles, locations, salary, and exclusions.'],
            ['2', 'Let Sona prepare', 'Resume, letter, screening notes, and fit signals.'],
            ['3', 'Approve manually', 'Review proof before you open or track the application.'],
          ].map(([step, label, description]) => (
            <div key={step} className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              <p className="text-xs font-black tabular-nums text-[var(--text-primary)]">{step}</p>
              <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{label}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{description}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onSetPreferences}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
          >
            <span className="material-symbols-rounded text-[18px]" aria-hidden="true">tune</span>
            Set preferences
          </button>
          <button
            type="button"
            onClick={onAskSona}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)]"
          >
            <SonaMark size="xs" state="listening" />
            Ask Sona
          </button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
        <ApplicationPacketReview
          title="What Sona will prepare"
          description="The queue is designed around memory, packets, evidence, and user approval."
          artifacts={artifacts}
        />
        <ProofChecklist
          title="Trust gate before applying"
          description="Every packet should explain what is true, missing, and waiting on you."
          items={proofItems}
        />
      </div>
    </div>
  );
}

export default function AgentQueuePage() {
  const router = useRouter();
  const { user } = useStore();
  const [items, setItems] = useState<AgentQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<QueueView>('command');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AgentQueueItem | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [twin, setTwin] = useState<CareerTwinSummary | null>(null);
  const [twinLoading, setTwinLoading] = useState(false);
  const [twinError, setTwinError] = useState('');
  const [twinReloadNonce, setTwinReloadNonce] = useState(0);
  const [showAuth, setShowAuth] = useState<'login' | 'signup' | null>(null);
  const deepLinkHandledRef = useRef(false);
  const closeSelectedPacket = useCallback(() => {
    setSelected(null);
    setActionError('');
  }, []);

  const load = async () => {
    if (!user) {
      setLoading(false);
      setItems([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await getAgentQueue();
      if (res.success) {
        setItems(res.data || []);
      } else {
        setError(res.error || 'Could not load Agent Queue.');
      }
    } catch (error: any) {
      setError(error?.message || 'Could not load Agent Queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user]);

  useEffect(() => {
    if (loading || deepLinkHandledRef.current || items.length === 0) return;
    const packet = findDeepLinkedPacket(items, window.location.search);
    if (!new URLSearchParams(window.location.search).has('packet')) {
      deepLinkHandledRef.current = true;
      return;
    }
    if (!packet) {
      deepLinkHandledRef.current = true;
      setActionError('That packet is no longer available. Review the current queue instead.');
      return;
    }
    deepLinkHandledRef.current = true;
    setSelected(packet);
    setView(['applied', 'dismissed', 'expired'].includes(packet.status) ? 'history' : 'command');
    setActionError('');
  }, [items, loading]);

  useEffect(() => {
    let active = true;

    if (!user) {
      setTwin(null);
      setTwinLoading(false);
      return () => {
        active = false;
      };
    }

    setTwinLoading(true);
    setTwinError('');
    authFetch('/api/agent/intelligence')
      .then(res => {
        if (!res.ok) throw new Error('Career Twin context could not load. Proof checks may be incomplete until this is retried.');
        return res.json();
      })
      .then(data => {
        if (!active) return;
        setTwin(normalizeCareerTwinSummary(data?.twin));
      })
      .catch((error: any) => {
        if (!active) return;
        setTwin(null);
        setTwinError(error?.message || 'Career Twin context could not load. Proof checks may be incomplete until this is retried.');
      })
      .finally(() => {
        if (active) setTwinLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user, twinReloadNonce]);

  const stats = useMemo(() => {
    const pending = items.filter(i => i.status === 'pending');
    const approved = items.filter(i => i.status === 'approved');
    const highFit = items.filter(i => i.match_score >= 85 && ['pending', 'approved'].includes(i.status));
    const expiring = pending.filter(i => daysUntil(i.expires_at) <= 2);
    const risks = items.reduce((sum, item) => sum + (item.riskSignals?.length || 0), 0);
    return {
      pending: pending.length,
      approved: approved.length,
      applied: items.filter(hasApplicationTracker).length,
      dismissed: items.filter(i => i.status === 'dismissed').length,
      expired: items.filter(i => i.status === 'expired').length,
      highFit: highFit.length,
      expiring: expiring.length,
      risks,
      total: items.length,
    };
  }, [items]);

  const needsAttention = useMemo(() => {
    return items
      .filter(item => item.status === 'pending' || isPacketTrackable(item) || daysUntil(item.expires_at) <= 2)
      .sort((a, b) => {
        const aUrgency = (daysUntil(a.expires_at) <= 2 ? 100 : 0) + (a.match_score || 0);
        const bUrgency = (daysUntil(b.expires_at) <= 2 ? 100 : 0) + (b.match_score || 0);
        return bUrgency - aUrgency;
      })
      .slice(0, 5);
  }, [items]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(item => {
      const statusOk = statusFilter === 'all' || item.status === statusFilter;
      const queryOk = !q || [item.job_title, item.company, item.location, item.match_reason, item.employment_type]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q));
      const viewOk = view === 'history'
        ? ['applied', 'dismissed', 'expired'].includes(item.status)
        : view === 'command'
          ? ['pending', 'approved'].includes(item.status)
          : true;
      return statusOk && queryOk && viewOk;
    });
  }, [items, query, statusFilter, view]);

  const priorityItems = useMemo(() => {
    if (view !== 'command') return [];
    const visibleIds = new Set(visibleItems.map(item => item.id));
    return needsAttention.filter(item => visibleIds.has(item.id));
  }, [needsAttention, visibleItems, view]);

  const packetListItems = useMemo(() => {
    if (view !== 'command' || priorityItems.length === 0) return visibleItems;
    const priorityIds = new Set(priorityItems.map(item => item.id));
    return visibleItems.filter(item => !priorityIds.has(item.id));
  }, [priorityItems, visibleItems, view]);

  const approvalBlockersFor = (item: AgentQueueItem) => getPacketApprovalBlockers(item, twin, twinLoading, twinError);

  const selectPacket = (item: AgentQueueItem) => {
    setSelected(item);
    setActionError('');
  };

  const runAction = async (item: AgentQueueItem, action: 'approve' | 'dismiss') => {
    if (!isPacketApprovable(item)) {
      const message = 'Only pending review packets can be changed here.';
      setActionError(message);
      showToast(message, 'error');
      return;
    }

    if (action === 'approve') {
      const blockers = getPacketApprovalBlockers(item, twin, twinLoading, twinError);
      if (blockers.length > 0) {
        const message = `Resolve before approval: ${blockers.slice(0, 3).join(', ')}.`;
        setActionError(message);
        showToast(message, 'error');
        return;
      }
    }

    setActionLoading(item.id);
    setActionError('');
    try {
      const res = await updateQueueItem(item.id, action);
      if (res.success) {
        showToast(action === 'approve' ? 'Packet approved' : 'Packet dismissed', action === 'approve' ? 'check_circle' : 'block');
        await load();
        setSelected(null);
      } else {
        const message = res.error || 'Could not update packet.';
        setActionError(message);
        showToast(message, 'error');
      }
    } catch (error: any) {
      const message = error?.message || 'Could not update packet.';
      setActionError(message);
      showToast(message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const runApply = async (item: AgentQueueItem) => {
    if (!isPacketTrackable(item)) {
      const message = hasApplicationTracker(item)
        ? 'This packet already has a tracker entry.'
        : 'Approve the packet before tracking it.';
      setActionError(message);
      showToast(message, 'error');
      return;
    }

    setActionLoading(item.id);
    setActionError('');
    try {
      const res = await applyFromQueue(item.id);
      if (res.success) {
        showToast('Tracker entry created. Submit manually from the job posting when ready.', 'open_in_new');
        const safeJobUrl = getSafeExternalUrl(item.job_url);
        if (safeJobUrl) window.open(safeJobUrl, '_blank', 'noopener,noreferrer');
        await load();
        setSelected(null);
      } else {
        const message = res.error || 'Could not prepare tracker entry.';
        setActionError(message);
        showToast(message, 'error');
      }
    } catch (error: any) {
      const message = error?.message || 'Could not prepare tracker entry.';
      setActionError(message);
      showToast(message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleFeedback = async (item: AgentQueueItem, tag: string) => {
    const current = item.feedbackTags || [];
    const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag];
    setActionError('');
    try {
      const res = await updateQueueFeedback(item.id, next);
      if (res.success) {
        setItems(prev => prev.map(q => q.id === item.id ? { ...q, feedbackTags: next } : q));
        setSelected(prev => prev?.id === item.id ? { ...prev, feedbackTags: next } : prev);
      } else {
        const message = res.error || 'Could not save feedback.';
        setActionError(message);
        showToast(message, 'error');
      }
    } catch (error: any) {
      const message = error?.message || 'Could not save feedback.';
      setActionError(message);
      showToast(message, 'error');
    }
  };

  const groupedBoard = useMemo(() => {
    return (Object.keys(STATUS_CONFIG) as AgentQueueItem['status'][]).map(status => ({
      status,
      items: visibleItems.filter(item => item.status === status),
    }));
  }, [visibleItems]);

  if (!user && !loading) {
    return (
      <div className="mobile-app-content min-h-dvh px-4 py-3 md:p-6 lg:p-8">
        <div className="mx-auto grid max-w-5xl items-start gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <SonaMark size="md" state="idle" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Review-first automation</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">Sign in to review Sona job packets</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
                  Agent Queue stores Sona’s ranked roles, tailored resume drafts, cover letters, risk notes, and approval gates. Nothing leaves Talent Studio until you review it.
                </p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setShowAuth('signup')}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-5 text-sm font-bold text-[var(--bg-deep)] transition hover:opacity-90"
                  >
                    <span className="material-symbols-rounded text-[18px]">person_add</span>
                    Create free account
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAuth('login')}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 text-sm font-bold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
                  >
                    <span className="material-symbols-rounded text-[18px]">login</span>
                    Sign in
                  </button>
                </div>
              </div>
            </div>
          </section>

          <aside className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              ['Saved packets', 'Ranked roles, fit signals, and deadlines stay attached to your account.', 'inventory_2'],
              ['Truth gate', 'Resume facts, risk notes, and missing proof stay visible before approval.', 'verified_user'],
              ['Manual control', 'Sona prepares the next move. You decide what gets submitted.', 'approval_delegation'],
            ].map(([title, body, icon]) => (
              <div key={title} className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                  <span className="material-symbols-rounded text-[19px]">{icon}</span>
                </span>
                <p className="mt-3 text-sm font-bold text-[var(--text-primary)]">{title}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{body}</p>
              </div>
            ))}
          </aside>
        </div>
        {showAuth && (
          <AuthModal
            mode={showAuth}
            onClose={() => setShowAuth(null)}
            onSwitchMode={() => setShowAuth(showAuth === 'login' ? 'signup' : 'login')}
            postAuthRedirect="/suite/agent/queue"
          />
        )}
      </div>
    );
  }

  return (
    <div className="mobile-app-content min-h-dvh px-4 py-3 lg:p-8">
      <div className="relative mb-6 rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 lg:p-6">
        <div className="absolute right-4 top-4 lg:right-6 lg:top-6">
          <PageHelp toolId="agent-queue" />
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <SonaMark size="md" state={loading ? 'thinking' : 'idle'} title="Sona Agent" />
            <div className="min-w-0 pr-12 lg:pr-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Autonomous Agent</p>
              <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)] lg:text-3xl">Agent Queue</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">Sona scouts roles, prepares application packets, explains fit, and waits for your review before anything is submitted.</p>
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 lg:flex lg:min-w-[340px] lg:flex-nowrap lg:items-center lg:justify-end lg:pr-12">
            <button
              type="button"
              onClick={() => askSona(
                'Review my Agent Queue through my Career Twin. Tell me the highest-leverage next action, which packets need proof, and what I must approve before anything leaves the product.',
                'Agent Queue',
                twin,
                { queueTotal: stats.total, pending: stats.pending, risks: stats.risks },
              )}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-bold text-[var(--text-primary)] transition-all hover:bg-[var(--bg-hover)]"
            >
              <SonaMark size="xs" state="listening" />
              Ask Sona
            </button>
            <button
              type="button"
              onClick={() => router.push('/suite/job-search')}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-bold text-[var(--text-primary)] transition-all hover:bg-[var(--bg-hover)]"
            >
              <span className="material-symbols-rounded text-[18px]">tune</span>
              Preferences
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <SonaThinkingTile
          variant="agent"
          title="Sona is loading your queue"
          description="Checking prepared packets, review windows, and next actions."
          stages={['Packets', 'Signals', 'Actions']}
        />
      ) : error ? (
        <QueueErrorState message={error} onRetry={load} />
      ) : (
        <>
          <CareerTwinQueueContext
            twin={twin}
            loading={twinLoading}
            error={twinError}
            stats={stats}
            onAskSona={() => askSona(
              'Review my Career Twin context for Agent Queue. Check target roles, resume proof, skill gaps, stale applications, queued packets, and approval gates.',
              'Agent Queue memory',
              twin,
              { queueTotal: stats.total, pending: stats.pending, approved: stats.approved, risks: stats.risks },
            )}
            onRetry={() => setTwinReloadNonce(count => count + 1)}
          />

          <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <ActionTile icon="pending_actions" tone="amber" label="Need review" value={stats.pending} description="Packets waiting on your decision." onClick={() => { setView('command'); setStatusFilter('pending'); }} />
            <ActionTile icon="rocket_launch" tone="blue" label="High fit" value={stats.highFit} description="Strong matches Sona found." onClick={() => { setView('command'); setStatusFilter('all'); }} />
            <ActionTile icon="event_busy" tone="rose" label="Expiring" value={stats.expiring} description="Review windows closing soon." onClick={() => { setView('command'); setStatusFilter('pending'); }} />
            <ActionTile icon="task_alt" tone="emerald" label="Approved" value={stats.approved} description="Ready for manual apply." onClick={() => { setView('queue'); setStatusFilter('approved'); }} />
            <ActionTile
              icon="info"
              tone="slate"
              label="Checks"
              value={stats.risks}
              description="Items to inspect before submit."
              onClick={() => askSona(
                'Help me resolve the checks in my Agent Queue before I apply. Use my Career Twin and separate proven facts from missing proof.',
                'Agent checks',
                twin,
                { risks: stats.risks, pending: stats.pending },
              )}
            />
          </section>

          <section className="mb-5 overflow-hidden rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)]">
            <div className="flex gap-2 overflow-x-auto p-3" aria-label="Agent Queue status summary">
              {[
                { icon: 'inventory_2', label: 'Total', value: stats.total, action: () => { setView('queue'); setStatusFilter('all'); } },
                { icon: 'pending_actions', label: 'Pending', value: stats.pending, action: () => setStatusFilter('pending') },
                { icon: 'task_alt', label: 'Approved', value: stats.approved, action: () => setStatusFilter('approved') },
                { icon: 'outgoing_mail', label: 'Tracked', value: stats.applied, action: () => { setView('queue'); setStatusFilter('all'); } },
                { icon: 'block', label: 'Skipped', value: stats.dismissed + stats.expired, action: () => setView('history') },
              ].map(item => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.action}
                  className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-left transition hover:bg-[var(--bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  <span className="material-symbols-rounded icon-neutral text-[17px]" aria-hidden="true">{item.icon}</span>
                  <span className="text-sm font-black tabular-nums text-[var(--text-primary)]">{item.value}</span>
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">{item.label}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="mb-5 flex flex-col gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex overflow-x-auto rounded-xl bg-[var(--bg-surface)] p-1" role="group" aria-label="Agent Queue view">
              {(Object.keys(VIEW_CONFIG) as QueueView[]).map(key => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  aria-current={view === key ? 'page' : undefined}
                  onClick={() => { setView(key); setSelected(null); setActionError(''); }}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                    view === key ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="material-symbols-rounded text-[16px]">{VIEW_CONFIG[key].icon}</span>
                  {VIEW_CONFIG[key].label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 sm:w-72">
                <span className="material-symbols-rounded pointer-events-none absolute left-4 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center text-[20px] leading-none text-[var(--text-muted)]">search</span>
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search role, company, signal..."
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-2.5 pl-14 pr-3 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--border)] focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={event => setStatusFilter(event.target.value as StatusFilter)}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--border)] focus:ring-2 focus:ring-[var(--accent)]"
              >
                <option value="all">All statuses</option>
                {(Object.keys(STATUS_CONFIG) as AgentQueueItem['status'][]).map(status => (
                  <option key={status} value={status}>{STATUS_CONFIG[status].label}</option>
                ))}
              </select>
            </div>
          </div>

          {items.length === 0 ? (
            <AgentQueueEmptyState
              twin={twin}
              twinLoading={twinLoading}
              onSetPreferences={() => router.push('/suite/job-search')}
              onAskSona={() => askSona(
                'Help me set up Sona Agent for my job search using my Career Twin. Keep it review-first and show what evidence is needed before packets appear.',
                'Agent setup',
                twin,
                { queueTotal: 0 },
              )}
            />
          ) : visibleItems.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-8 text-center">
              <AnimatedToolIcon icon="filter_alt_off" tone="slate" size="md" />
              <h2 className="mt-4 text-xl font-bold text-[var(--text-primary)]">No packets match the current filters</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Clear the search or switch status to see the rest of the queue.</p>
            </div>
          ) : (
            <div className="flex gap-5">
              <main className="min-w-0 flex-1">
                {view === 'settings' ? (
                  <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6">
                    <div className="flex items-start gap-4">
                      <AnimatedToolIcon icon="tune" tone="blue" size="md" />
                      <div>
                        <h2 className="text-xl font-bold text-[var(--text-primary)]">Agent settings live in Job Search preferences</h2>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">Set target roles, cities, salary floor, autonomy level, nightly limits, minimum score, excluded companies, and the opt-in Sona digest email.</p>
                        <button
                          type="button"
                          onClick={() => router.push('/suite/job-search')}
                          className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-bold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
                        >
                          Open preferences
                        </button>
                      </div>
                    </div>
                  </div>
                ) : view === 'board' ? (
                  <div className="grid gap-4 xl:grid-cols-5">
                    {groupedBoard.map(group => (
                      <section key={group.status} className="min-w-0 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs font-bold text-[var(--text-primary)]">{STATUS_CONFIG[group.status].label}</span>
                          <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">{group.items.length}</span>
                        </div>
                        <div className="space-y-2">
                          {group.items.map(item => (
                            <button key={item.id} type="button" onClick={() => selectPacket(item)} className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-left transition-all hover:border-[var(--border)]">
                              <p className="line-clamp-2 text-sm font-bold leading-5 text-[var(--text-primary)]">{item.job_title}</p>
                              <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{item.company}</p>
                              <p className="mt-2 text-xs font-black tabular-nums text-[var(--text-primary)]">{item.match_score}%</p>
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-5">
                    {view === 'command' && priorityItems.length > 0 && (
                      <section>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h2 className="text-lg font-bold text-[var(--text-primary)]">Needs attention</h2>
                            <p className="text-sm text-[var(--text-secondary)]">Highest leverage packet decisions first.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => askSona(
                              'Prioritize my Agent Queue using my Career Twin. Sort by proof readiness, role fit, review deadline, and missing facts.',
                              'Agent priority',
                              twin,
                              { pending: stats.pending, expiring: stats.expiring, risks: stats.risks },
                            )}
                            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
                          >
                            Prioritize with Sona
                          </button>
                        </div>
                        <div className="grid gap-3 xl:grid-cols-2">
                          {priorityItems.map(item => (
                            <QueueCard key={item.id} item={item} twin={twin} selected={selected?.id === item.id} onSelect={() => selectPacket(item)} onApprove={() => runAction(item, 'approve')} onDismiss={() => runAction(item, 'dismiss')} onApply={() => runApply(item)} loading={actionLoading === item.id} approvalBlockers={approvalBlockersFor(item)} />
                          ))}
                        </div>
                      </section>
                    )}

                    {(view !== 'command' || packetListItems.length > 0) ? (
                    <section>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-bold text-[var(--text-primary)]">{view === 'history' ? 'Agent history' : view === 'command' ? 'Other packets' : 'Application packets'}</h2>
                          <p className="text-sm text-[var(--text-secondary)]">{packetListItems.length} packet{packetListItems.length === 1 ? '' : 's'} shown</p>
                        </div>
                      </div>
                      <div className="grid gap-3 xl:grid-cols-2">
                        {packetListItems.map(item => (
                          <QueueCard key={item.id} item={item} twin={twin} selected={selected?.id === item.id} onSelect={() => selectPacket(item)} onApprove={() => runAction(item, 'approve')} onDismiss={() => runAction(item, 'dismiss')} onApply={() => runApply(item)} loading={actionLoading === item.id} approvalBlockers={approvalBlockersFor(item)} />
                        ))}
                      </div>
                    </section>
                    ) : (
                      <section className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <h2 className="text-base font-bold text-[var(--text-primary)]">All visible packets are prioritized above</h2>
                            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">Use Command view for decisions first, or open Queue view when you want the full list without prioritization.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setView('queue')}
                            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
                          >
                            <span className="material-symbols-rounded text-[17px]" aria-hidden="true">view_list</span>
                            Open Queue
                          </button>
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </main>

              {selected && (
                <PacketDrawer
                  item={selected}
                  twin={twin}
                  onClose={closeSelectedPacket}
                  onApprove={() => runAction(selected, 'approve')}
                  onDismiss={() => runAction(selected, 'dismiss')}
                  onApply={() => runApply(selected)}
                  onFeedback={(tag) => toggleFeedback(selected, tag)}
                  actionLoading={actionLoading === selected.id}
                  actionError={actionError}
                  onDismissActionError={() => setActionError('')}
                  approvalBlockers={approvalBlockersFor(selected)}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
