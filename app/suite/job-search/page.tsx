'use client';

import { TacoName } from '@/components/BrandLogo';
import { readPreparedPacketResponse } from '@/lib/job-packet-recovery';
import Link from 'next/link';

import { useCallback, useEffect, useMemo, useRef, useState, type Ref, type MutableRefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import OracleContent from '@/app/suite/market-oracle/OracleContent';
import { workspaceCompatibilityHref } from '@/lib/workspace-compatibility';
import { motion } from 'framer-motion';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader, SuiteToolShell, SuiteUnmeasured } from '@/components/suite/SuiteToolChrome';
import { useStore } from '@/lib/store';
import { getResumeVersions, getUserProfile, updateApplicationStatus, type ResumeVersion } from '@/lib/database-suite';
import { authFetch } from '@/lib/auth-fetch';
import { mergeApplicationKitContext, resumeSnapshotToText, resumeVersionToApplicationKitContext } from '@/lib/application-kit';
import {
  classifyJobPacketFailure,
  packetIncompleteRecovery,
  readJobPacketRecovery,
  type JobPacketRecovery,
} from '@/lib/job-packet-recovery';
import AssistantThinkingTile from '@/components/assistant/AssistantThinkingTile';
import JobDiscoveryRecoveryPanel from '@/components/jobs/JobDiscoveryRecoveryPanel';
import {
  classifyJobDiscoveryFailure,
  classifyJobDiscoveryResponse,
  getJobResultIdentity,
  type JobDiscoveryRecovery,
} from '@/lib/job-discovery-recovery';
import { useAuthGate } from '@/hooks/useAuthGate';
import JobPreferencesPanel from './JobPreferencesPanel';
import { normalizeAlertTargetRole, SONA_ALERT_TARGET_ROLE_KEY } from '@/lib/assistant/alert-consent-handoff';
import { chooseJobSearchResumeSource, isEligibleJobSearchResume } from '@/lib/job-search-resume-source';
import ApplicationsContext from '@/components/workspace/ApplicationsContext';
import { jobSearchContentKey, jobSearchSourceKey, jobSearchInputsChanged, type JobSearchResultContext } from '@/lib/job-search-context';
import { useToolGuidance } from '@/components/guidance/ToolGuidanceProvider';
import { isGuidanceShortcutBlocked } from '@/lib/tool-guidance-shortcuts';

type SortOption = 'relevance' | 'salary' | 'date';
type FeedFilter = 'all' | 'strong' | 'fresh' | 'direct' | 'remote' | 'ready';
type PacketStatus = 'idle' | 'preparing' | 'ready' | 'needs_attention' | 'failed' | 'applied';

interface JobSearchPreferences {
  targetRoles?: string[];
  preferredCities?: string[];
  remotePref?: 'remote' | 'hybrid' | 'onsite' | 'any';
  salaryMin?: number;
  industries?: string[];
}

interface OpportunityFitScore {
  scoreVersion?: string;
  confidence?: 'high' | 'medium' | 'low';
  evidenceCoverage?: number;
  factorsMeasured?: boolean;
  overall: number;
  skills: number | null;
  titleSeniority: number | null;
  domain: number | null;
  location: number | null;
  salary: number | null;
  freshness: number | null;
  resumeCoverage: number | null;
  risk: number | null;
  preference: number | null;
  source?: number;
}

interface OpportunitySourceMeta {
  sourceType: 'direct_ats' | 'aggregator' | 'remote_board' | string;
  sourceName: string;
  sourceConfidence?: 'high' | 'medium' | 'low' | string;
  directApplyUrl?: string;
  canonicalUrl?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
}

interface OpportunityJob {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: { min: number | null; max: number | null; currency: string; isPredicted?: boolean };
  description: string;
  skills: string[];
  url: string;
  postedDate: string;
  employmentType: string;
  category?: string;
  source: string;
  matchScore: number | null;
  fitScore: OpportunityFitScore | null;
  sourceMeta: OpportunitySourceMeta;
  dedupeKey: string;
  identityKey?: string;
  sourceJobId?: string;
  ledgerStatus?: string | null;
  ledgerFeedbackTags?: string[];
  freshness: { isFresh: boolean; ghostRisk: 'low' | 'medium' | 'high' | 'unknown'; reasons: string[] };
  recommendationReason: string;
  fitReasons?: string[];
  riskNotes?: string[];
  sourceNotes?: string[];
  nextAction: string;
  preparationEligible: boolean;
  outboundLinkVerified: boolean;
}

interface ApplicationPacket {
  sourceKey?: string;
  jobDescriptionKey?: string;
  status: PacketStatus;
  stageIndex: number;
  applicationId?: string;
  morphedVersionId?: string | null;
  coverLetter?: string;
  atsScore?: number;
  keywordGaps?: string[];
  warnings?: string[];
  error?: string;
  recovery?: JobPacketRecovery;
  updatedAt: string;
}

const SEARCH_PREFS_KEY = 'talent-job-search-prefs';
const RESUME_STORAGE_KEY = 'talent-job-search-skills';
const PACKET_STORAGE_KEY = 'talent-job-packets-v3';
const RESUME_ID_STORAGE_KEY = 'talent-job-search-resume-id';

const FIND_ROLES_GUIDE_ANCHORS = Object.freeze({
  target: 'find-roles-target',
  location: 'find-roles-location',
  source: 'find-roles-source',
  search: 'find-roles-search',
  role: 'find-roles-role',
  evidence: 'find-roles-evidence',
  decisions: 'find-roles-decisions',
});

interface FindRolesGuidanceFacts {
  owner: string;
  sourceKey: string | null;
  hasSource: boolean;
  query: string;
  loading: boolean;
  resumeLoading: boolean;
  hasSearched: boolean;
  inputsChanged: boolean;
  totalResults: number;
  visibleResults: number;
  recovery: JobDiscoveryRecovery | null;
  selectedJob: OpportunityJob | null;
  packet?: ApplicationPacket;
}

function findRolesWorkState(facts: FindRolesGuidanceFacts) {
  if (facts.loading) return 'pending';
  if (facts.resumeLoading) return 'waiting';
  if (facts.inputsChanged && facts.totalResults > 0) return 'stale';
  if (facts.recovery) return facts.totalResults > 0 ? 'partial' : 'failure';
  if (facts.totalResults > 0 && facts.visibleResults === 0) return 'filtered-empty';
  if (facts.totalResults > 0) return 'results';
  return facts.hasSearched ? 'empty' : 'setup';
}

/** Observes existing work only. Guide position never authorizes a role action. */
function findRolesGuidance(facts: FindRolesGuidanceFacts): Parameters<typeof useToolGuidance>[0] {
  const state = findRolesWorkState(facts);
  const hasCurrentResults = state === 'results' || state === 'partial';
  const resultAvailability = state === 'stale' ? 'stale' : state === 'failure' ? 'blocked' : hasCurrentResults ? 'available' : 'waiting';
  const resultReason = state === 'pending'
    ? 'Your search is running. Help will wait for the current request; your inputs stay available.'
    : state === 'waiting'
      ? 'Resume sources are loading. Browsing will be available once loading finishes, including without a resume.'
      : state === 'stale'
        ? 'These roles belong to your earlier search settings. Run Search yourself to refresh them before continuing this chapter.'
        : state === 'failure'
          ? facts.recovery?.message || 'The search failed. Keep your inputs and use the search recovery action to retry.'
          : state === 'filtered-empty'
            ? 'Your search returned roles, but none match these filters. Clear filters yourself to review the existing results.'
            : state === 'empty'
              ? 'No roles found for this search. Edit the target or location, then run Search when you are ready.'
              : state === 'partial'
                ? 'The latest search failed. The earlier roles remain available to inspect; retry the affected search when ready.'
                : 'Run Search yourself to get roles. Next only moves through these explanations.';
  const decisionState = facts.packet?.status === 'preparing' ? 'waiting' : resultAvailability;
  const savedOutcome = facts.selectedJob?.ledgerStatus === 'saved'
    ? ' This role was successfully saved for later.'
    : facts.selectedJob?.ledgerStatus === 'dismissed' ? ' Your choice to skip this role was saved.' : '';
  const preparedOutcome = facts.packet?.status === 'ready' && facts.packet.applicationId && facts.packet.morphedVersionId
    ? ' Its prepared draft is available in Applications for your review; it has not been submitted.'
    : '';
  const decisionCopy = facts.packet?.status === 'ready' || facts.packet?.status === 'applied'
    ? 'Review the prepared work, save or skip this role, or open its verified posting where available. Record submission only after you actually submit on the job site.'
    : facts.packet?.status === 'failed' || facts.packet?.status === 'needs_attention'
      ? `Review the packet recovery message and its available next action. ${facts.packet.recovery?.message || 'Preparation did not finish; keep any saved work and retry only where offered.'}`
      : facts.selectedJob && !facts.selectedJob.preparationEligible
        ? `Save this role for review${facts.selectedJob.outboundLinkVerified && facts.selectedJob.url ? ' or open its verified source' : ''}. Review the source and evidence before any packet work.`
        : facts.hasSource
          ? 'Prepare a draft when the role is eligible and your plan allows it. Review every draft before using it. You can also keep exploring or pause.'
          : 'You can keep exploring. Preparation needs a confirmed resume source and measured fit; choose the source and search again when ready.';
  return {
    toolId: 'job-search',
    version: '1',
    title: 'Find roles',
    // Typing or a real search updates availability without closing assistance.
    // Changing the owner/source closes it; content stays out of guide storage.
    contextKey: `find-roles:${facts.owner}:${jobSearchContentKey(facts.sourceKey)}`,
    preferredChapterId: hasCurrentResults ? 'review-choices' : 'set-direction',
    chapters: [
      {
        id: 'set-direction',
        title: 'Set your direction',
        description: 'Choose the search you want to run. You remain in control of every action.',
        steps: [
          { id: 'target', title: 'Choose a target role', description: 'What role are you looking for? This defines the search.', anchor: FIND_ROLES_GUIDE_ANCHORS.target },
          { id: 'location', title: 'Choose where you would work', description: 'Set the location or work preference. Keep the constraints that matter to you.', anchor: FIND_ROLES_GUIDE_ANCHORS.location },
          { id: 'source', title: 'Choose your resume source', description: facts.hasSource ? 'Your confirmed source is selected. It supplies the resume evidence used to compare fit and prepare a draft.' : 'Use a confirmed resume to compare your experience and prepare a draft. You can still browse without one; resume fit stays unmeasured.', anchor: FIND_ROLES_GUIDE_ANCHORS.source, availability: facts.resumeLoading ? 'waiting' : 'available', unavailableReason: 'Resume sources are loading. Your search inputs are retained.' },
          { id: 'search', title: 'Run Search when you are ready', description: 'Use Search yourself. It keeps your inputs available for retry and returns roles to review. Help will not run it for you.', anchor: FIND_ROLES_GUIDE_ANCHORS.search, availability: facts.loading || facts.resumeLoading ? 'waiting' : !facts.query.trim() ? 'blocked' : 'available', unavailableReason: facts.loading ? 'Your current search is running.' : facts.resumeLoading ? 'Resume sources are loading.' : 'Add a target role to make Search available.' },
        ],
      },
      {
        id: 'review-choices',
        title: 'Review your choices',
        description: hasCurrentResults ? state === 'partial' ? resultReason : 'Inspect real role facts, their evidence, and your available decisions.' : resultReason,
        availability: resultAvailability,
        unavailableReason: resultReason,
        steps: [
          { id: 'role', title: 'Inspect an actual role', description: 'Select a role to inspect the posting and why it appeared. Selecting a role is your choice; Next does not select one.', anchor: FIND_ROLES_GUIDE_ANCHORS.role, availability: resultAvailability, unavailableReason: resultReason },
          { id: 'evidence', title: 'Review the basis and uncertainty', description: 'The Fit tab shows what the returned evidence supports and what is not measured. Missing evidence does not establish a lack of ability.', anchor: FIND_ROLES_GUIDE_ANCHORS.evidence, availability: hasCurrentResults && !facts.selectedJob ? 'waiting' : resultAvailability, unavailableReason: hasCurrentResults && !facts.selectedJob ? 'Select a role yourself to inspect its evidence.' : resultReason, targetUnavailableReason: 'Open the selected role’s Fit tab yourself to see the evidence. Help does not switch tabs.' },
          { id: 'decisions', title: 'Choose your next action', description: `The Packet tab shows this role’s available actions. ${decisionCopy}${savedOutcome}${preparedOutcome}`, anchor: FIND_ROLES_GUIDE_ANCHORS.decisions, availability: hasCurrentResults && !facts.selectedJob ? 'waiting' : decisionState, unavailableReason: facts.packet?.status === 'preparing' ? 'Your packet is being prepared. Wait for its actual result; reading Help does not finish it.' : hasCurrentResults && !facts.selectedJob ? 'Select a role yourself to see its available decisions.' : resultReason, targetUnavailableReason: 'Open the selected role’s Packet tab yourself to see its available decisions. Help does not switch tabs or start work.' },
        ],
      },
    ],
  };
}

function FindRolesGuidance({ config }: { config: Parameters<typeof useToolGuidance>[0] }) {
  useToolGuidance(config);
  return null;
}

function scopedJobStorageKey(base: string, uid: string) {
  return `${base}:${uid}`;
}

function jobCountKey(uid: string) {
  return `talent-job-curated-count:${uid}`;
}

const PACKET_STAGES = [
  'Reading resume',
  'Mapping job requirements',
  'Morphing resume',
  'Writing cover letter',
  'Running ATS check',
  'Saving packet',
  'Ready for review',
];

const FILTERS: Array<{ value: FeedFilter; label: string; icon: string }> = [
  { value: 'all', label: 'All', icon: 'view_list' },
  { value: 'strong', label: 'Strong', icon: 'verified' },
  { value: 'fresh', label: 'Fresh', icon: 'bolt' },
  { value: 'direct', label: 'Direct', icon: 'hub' },
  { value: 'remote', label: 'Remote', icon: 'home_work' },
  { value: 'ready', label: 'Ready', icon: 'fact_check' },
];

const SAVED_SEARCHES = ['Software Engineer', 'Data Engineer', 'Product Manager', 'AI Engineer', 'Solutions Architect'];

function extractResumeSkills(resume: any): string[] {
  if (!resume) return [];
  const rawSkills = Array.isArray(resume.skills)
    ? resume.skills.flatMap((skill: any) => {
        if (typeof skill === 'string') return [skill];
        if (Array.isArray(skill?.items)) return skill.items;
        return [skill?.name, skill?.label, skill?.title].filter(Boolean);
      })
    : [];
  const metadataSkills = Array.isArray(resume.metadata?.skills) ? resume.metadata.skills : [];
  const contentText = resumeSnapshotToText(resume);
  const inferred = [
    'JavaScript', 'TypeScript', 'Python', 'React', 'Next.js', 'Node.js', 'SQL', 'AWS', 'Docker',
    'Kubernetes', 'Machine Learning', 'Data Engineering', 'Product Management', 'Leadership',
    'Project Management', 'Salesforce', 'Excel', 'Tableau', 'Power BI',
  ].filter(skill => contentText.toLowerCase().includes(skill.toLowerCase()));
  return [...new Set([...rawSkills, ...metadataSkills, ...inferred].map(String).map(skill => skill.trim()).filter(Boolean))].slice(0, 40);
}

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function formatSalary(min: number | null, max: number | null, currency = "USD"): string {
  if (!min && !max) return 'Not listed';
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "";
  const fmt = (n: number) => code ? `${code} ${n >= 1000 ? `${Math.round(n / 1000)}k` : n}` : `${n.toLocaleString()} (currency unknown)`;
  if (min && max && min !== max) return `${fmt(min)} - ${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  if (max) return `Up to ${fmt(max)}`;
  return 'Not listed';
}

function timeAgo(dateString: string): string {
  const time = new Date(dateString).getTime();
  if (Number.isNaN(time)) return 'Unknown';
  const diff = Date.now() - time;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function scoreColor(score: number) {
  if (score >= 85) return 'var(--success)';
  if (score >= 70) return 'var(--accent)';
  if (score >= 55) return 'var(--warning)';
  return 'var(--danger)';
}

function scoreLabel(score: number | null) {
  if (score === null) return 'Fit not measured';
  if (score >= 85) return 'Strong fit';
  if (score >= 70) return 'Good fit';
  if (score >= 55) return 'Review fit';
  return 'Low fit';
}

function sourceTypeFrom(source = ''): OpportunitySourceMeta['sourceType'] {
  const lower = source.toLowerCase();
  if (lower.includes('greenhouse') || lower.includes('lever') || lower.includes('ashby')) return 'direct_ats';
  if (lower.includes('remotive')) return 'remote_board';
  return 'aggregator';
}

function sourceLabel(meta: OpportunitySourceMeta) {
  if (meta.sourceType === 'direct_ats') return 'Direct ATS';
  if (meta.sourceType === 'remote_board') return 'Remote board';
  return meta.sourceName || 'Aggregator';
}

function fitFromRaw(job: any): OpportunityFitScore | null {
  if (job.fitScore) return { ...job.fitScore, preference: job.fitScore.preference ?? null };
  if (job.fitBreakdown) return { ...job.fitBreakdown, preference: job.fitBreakdown.preference ?? null };
  const match = job.matchScore;
  if (match === null || match === undefined) return null;
  // Only an overall match score is available. Do NOT synthesize a per-factor
  // breakdown from it (project rule #1). Carry the real score and mark every
  // factor as not measured so the UI renders a labelled absence, not fake bars.
  return {
    overall: clampScore(match),
    factorsMeasured: false,
    skills: null,
    titleSeniority: null,
    domain: null,
    location: null,
    salary: null,
    freshness: null,
    resumeCoverage: null,
    risk: null,
    preference: null,
  };
}

function normalizeJob(job: any): OpportunityJob {
  const sourceName = job.sourceMeta?.sourceName || job.source || 'Unknown';
  const sourceMeta: OpportunitySourceMeta = {
    sourceType: job.sourceMeta?.sourceType || sourceTypeFrom(sourceName),
    sourceName,
    sourceConfidence: job.sourceMeta?.sourceConfidence || 'low',
    directApplyUrl: job.sourceMeta?.directApplyUrl || job.url,
    canonicalUrl: job.sourceMeta?.canonicalUrl || job.url,
    firstSeenAt: job.sourceMeta?.firstSeenAt || job.postedDate,
    lastSeenAt: job.sourceMeta?.lastSeenAt,
  };
  const dedupeKey = job.dedupeKey || `${job.company}|${job.title}|${job.location}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const freshness = job.freshness || {
    isFresh: job.ghostRisk?.fresh || false,
    ghostRisk: job.ghostRisk?.risk || 'unknown',
    reasons: job.ghostRisk?.reasons || [],
  };
  const fitScore = fitFromRaw(job);
  return {
    id: job.id,
    title: job.title || 'Untitled role',
    company: job.company || 'Unknown company',
    location: job.location || 'Not listed',
    salary: job.salary || { min: null, max: null, currency: 'USD' },
    description: job.description || '',
    skills: Array.isArray(job.skills) ? Array.from(new Set(job.skills.map(String))) : [],
    url: job.url || '',
    postedDate: job.postedDate || '',
    employmentType: job.employmentType || 'Not listed',
    category: job.category,
    source: sourceName,
    matchScore: job.matchScore ?? fitScore?.overall ?? null,
    fitScore,
    sourceMeta,
    dedupeKey,
    identityKey: job.identityKey,
    sourceJobId: job.sourceJobId,
    ledgerStatus: job.ledgerStatus || null,
    ledgerFeedbackTags: Array.isArray(job.ledgerFeedbackTags) ? job.ledgerFeedbackTags : [],
    freshness: {
      ...freshness,
      reasons: Array.from(new Set(Array.isArray(freshness.reasons) ? freshness.reasons.map(String) : [])),
    },
    recommendationReason: job.recommendationReason || (fitScore ? 'Role appears relevant based on your current skills and preferences.' : 'Fit has not been measured for this role yet. Review the source and role evidence before deciding.'),
    fitReasons: Array.isArray(job.fitReasons) ? job.fitReasons : [],
    riskNotes: Array.isArray(job.riskNotes) ? job.riskNotes : [],
    sourceNotes: Array.isArray(job.sourceNotes) ? job.sourceNotes : [],
    nextAction: job.nextAction || 'Review fit evidence',
    preparationEligible: job.preparationEligible === true,
    outboundLinkVerified: job.outboundLinkVerified === true,
  };
}

function createInitialPacket(): ApplicationPacket {
  return { status: 'idle', stageIndex: 0, updatedAt: new Date().toISOString() };
}

const STORED_PACKET_STATUSES = new Set<PacketStatus>(['idle', 'preparing', 'ready', 'needs_attention', 'failed', 'applied']);

function readStoredPackets(value: unknown): Record<string, ApplicationPacket> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const packets: Record<string, ApplicationPacket> = {};
  for (const [key, raw] of Object.entries(value).slice(0, 50)) {
    if (!key || key.length > 256 || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const candidate = raw as Partial<ApplicationPacket>;
    if (!STORED_PACKET_STATUSES.has(candidate.status as PacketStatus)) continue;
    const interrupted = candidate.status === 'preparing';
    const claimsComplete = candidate.status === 'ready' || candidate.status === 'applied';
    const validAtsScore = typeof candidate.atsScore === 'number' && Number.isFinite(candidate.atsScore) && candidate.atsScore >= 0 && candidate.atsScore <= 100;
    const hasCompleteArtifacts = readPreparedPacketResponse({ success: true, packetStatus: 'ready_for_review', applicationId: candidate.applicationId, morphedVersionId: candidate.morphedVersionId, coverLetter: candidate.coverLetter, atsResult: { overallScore: candidate.atsScore } }).ready;
    const incomplete = claimsComplete && !hasCompleteArtifacts;
    const fallbackRecovery = interrupted ? classifyJobPacketFailure('network interrupted') : null;
    const incompleteRecovery = incomplete ? packetIncompleteRecovery({
      morphSucceeded: typeof candidate.morphedVersionId === 'string' && Boolean(candidate.morphedVersionId),
      coverLetterSucceeded: typeof candidate.coverLetter === 'string' && Boolean(candidate.coverLetter.trim()),
      atsSucceeded: validAtsScore,
    }) : null;
    packets[key] = {
      jobDescriptionKey: typeof candidate.jobDescriptionKey === 'string' ? candidate.jobDescriptionKey.slice(0, 64) : undefined,
      sourceKey: typeof candidate.sourceKey === 'string' ? candidate.sourceKey.slice(0, 512) : undefined,
      status: interrupted ? 'failed' : incomplete ? 'needs_attention' : candidate.status as PacketStatus,
      stageIndex: Number.isFinite(candidate.stageIndex) ? Math.max(0, Math.min(PACKET_STAGES.length - 1, Number(candidate.stageIndex))) : 0,
      applicationId: typeof candidate.applicationId === 'string' ? candidate.applicationId.slice(0, 256) : undefined,
      morphedVersionId: typeof candidate.morphedVersionId === 'string' ? candidate.morphedVersionId.slice(0, 256) : null,
      coverLetter: typeof candidate.coverLetter === 'string' ? candidate.coverLetter.slice(0, 30_000) : undefined,
      atsScore: validAtsScore ? candidate.atsScore : undefined,
      keywordGaps: Array.isArray(candidate.keywordGaps)
        ? Array.from(new Set(candidate.keywordGaps.map(String))).slice(0, 24)
        : [],
      warnings: Array.isArray(candidate.warnings)
        ? Array.from(new Set(candidate.warnings.map(String))).slice(0, 12)
        : [],
      error: interrupted
        ? fallbackRecovery?.message
        : incomplete
          ? incompleteRecovery?.message
        : typeof candidate.error === 'string' ? candidate.error.slice(0, 600) : undefined,
      recovery: interrupted
        ? fallbackRecovery || undefined
        : incomplete
          ? incompleteRecovery || undefined
          : readJobPacketRecovery(candidate.recovery) || undefined,
      updatedAt: typeof candidate.updatedAt === 'string' && Number.isFinite(new Date(candidate.updatedAt).getTime())
        ? candidate.updatedAt
        : new Date().toISOString(),
    };
  }
  return packets;
}

function PacketStatusPill({ packet }: { packet?: ApplicationPacket }) {
  const status = packet?.status || 'idle';
  const config: Record<PacketStatus, { label: string; icon: string; className: string }> = {
    idle: { label: 'Not prepared', icon: 'radio_button_unchecked', className: 'border-[var(--border-subtle)] text-[var(--text-muted)] bg-[var(--card-bg)]' },
    preparing: { label: 'Preparing', icon: 'progress_activity', className: 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-dim)]' },
    ready: { label: 'Ready', icon: 'verified', className: 'border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)]' },
    needs_attention: { label: 'Needs attention', icon: 'error', className: 'border-[color-mix(in_srgb,var(--warning)_35%,transparent)] text-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)]' },
    failed: { label: 'Retry needed', icon: 'error', className: 'border-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]' },
    applied: { label: 'Applied', icon: 'done_all', className: 'border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)]' },
  };
  const item = config[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${item.className}`}>
      <span className={`material-symbols-rounded text-[12px] ${status === 'preparing' ? 'animate-spin' : ''}`}>{item.icon}</span>
      {item.label}
    </span>
  );
}

function RecommendationStatusPill({ status }: { status?: string | null }) {
  if (status !== 'saved' && status !== 'dismissed') return null;
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
      {status === 'saved' ? 'Saved role' : 'Skipped role'}
    </span>
  );
}

type ResumeDateFilter = 'all' | '30d' | '90d' | '180d';
type ResumeSort = 'newest' | 'name' | 'match';

function ResumeSourcePicker({
  resumes,
  selectedResumeId,
  selectedResumeName,
  onResumeSelect,
}: {
  resumes: ResumeVersion[];
  selectedResumeId: string | null;
  selectedResumeName: string;
  onResumeSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<ResumeDateFilter>('all');
  const [sortBy, setSortBy] = useState<ResumeSort>('newest');

  const selectedResume = resumes.find(resume => resume.id === selectedResumeId) || null;
  const eligibleResumes = useMemo(() => resumes.filter(isEligibleJobSearchResume), [resumes]);
  const visibleResumes = useMemo(() => {
    const now = Date.now();
    const maxAgeMs = dateFilter === '30d'
      ? 30 * 24 * 60 * 60 * 1000
      : dateFilter === '90d'
        ? 90 * 24 * 60 * 60 * 1000
        : dateFilter === '180d'
          ? 180 * 24 * 60 * 60 * 1000
          : null;

    return eligibleResumes
      .filter(resume => {
        const created = new Date(resume.created_at).getTime();
        const inRange = !maxAgeMs || (!Number.isNaN(created) && now - created <= maxAgeMs);
        const searchable = [
          resume.version_name,
          resume.mode,
          resume.metadata?.company,
          resume.metadata?.targetCompany,
          resume.metadata?.targetRole,
          resume.metadata?.sourceFileName,
        ].filter(Boolean).join(' ').toLowerCase();
        return inRange && searchable.includes(query.trim().toLowerCase());
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.version_name.localeCompare(b.version_name);
        if (sortBy === 'match') return (b.matchScore || b.metadata?.matchScore || 0) - (a.matchScore || a.metadata?.matchScore || 0);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [dateFilter, eligibleResumes, query, sortBy]);

  const filters: Array<{ value: ResumeDateFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: '30d', label: 'Last month' },
    { value: '90d', label: '3 months' },
    { value: '180d', label: '6 months' },
  ];
  const sorts: Array<{ value: ResumeSort; label: string; icon: string }> = [
    { value: 'newest', label: 'Newest', icon: 'schedule' },
    { value: 'name', label: 'Name', icon: 'sort_by_alpha' },
    { value: 'match', label: 'Match', icon: 'trending_up' },
  ];

  return (
    <div className="relative min-w-0 w-full">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Resume source</span>
      <button
        type="button"
        data-guide={FIND_ROLES_GUIDE_ANCHORS.source}
        onClick={() => setOpen(prev => !prev)}
        className={`flex h-11 min-w-0 w-full items-center justify-between gap-3 rounded-[12px] border px-3 text-left transition ${
          open || selectedResume
            ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-input)] hover:border-[var(--border)]'
        }`}
        aria-expanded={open}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className={`material-symbols-rounded text-[18px] ${selectedResume ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>description</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
              {selectedResumeName || selectedResume?.version_name || (eligibleResumes.length > 0 ? 'Choose resume' : 'No confirmed source resumes')}
            </span>
            <span className="block truncate text-[11px] text-[var(--text-muted)]">
              {selectedResume ? `${timeAgo(selectedResume.created_at)} · ${extractResumeSkills(selectedResume.content).length} skills` : `${eligibleResumes.length} eligible`}
            </span>
          </span>
        </span>
        <span className={`material-symbols-rounded text-[18px] text-[var(--text-muted)] transition ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] elevation-raised lg:min-w-80"
        >
          <div className="border-b border-[var(--border-subtle)] p-3">
            <div className="relative">
              <span aria-hidden="true" className="material-symbols-rounded pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-[var(--text-muted)]">search</span>
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                aria-label="Search resume versions"
                placeholder="Search resumes..."
                className="h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] !pl-11 pr-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {filters.map(filter => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setDateFilter(filter.value)}
                  className={`rounded-[9px] border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    dateFilter === filter.value
                      ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                      : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sorts.map(sort => (
                <button
                  key={sort.value}
                  type="button"
                  onClick={() => setSortBy(sort.value)}
                  className={`inline-flex items-center gap-1 rounded-[9px] border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    sortBy === sort.value
                      ? 'border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]'
                      : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="material-symbols-rounded text-[13px]">{sort.icon}</span>
                  {sort.label}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto p-2">
            {resumes.length > eligibleResumes.length && (
              <p className="px-2 pb-2 text-[11px] leading-4 text-[var(--text-muted)]">
                Generated packet versions stay out of source selection. Choose a confirmed source resume for fit and packet work.
              </p>
            )}
            {visibleResumes.length > 0 ? visibleResumes.map(resume => {
              const skills = extractResumeSkills(resume.content);
              const active = resume.id === selectedResumeId;
              return (
	                <button
	                  key={resume.id}
	                  type="button"
	                  onClick={() => {
	                    onResumeSelect(resume.id);
	                    setOpen(false);
	                    setQuery('');
	                  }}
	                  aria-pressed={active}
	                  aria-label={`${active ? 'Selected resume' : 'Select resume'}: ${resume.version_name}`}
	                  className={`mb-1 grid min-w-0 w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-[12px] border p-3 text-left transition ${
	                    active
	                      ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
	                      : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--card-bg)]'
	                  }`}
	                >
	                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${active ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'bg-[var(--card-bg)] text-[var(--text-muted)]'}`} aria-hidden="true">
	                    <span className="material-symbols-rounded text-[18px]">{active ? 'check_circle' : 'description'}</span>
	                  </span>
	                  <span className="min-w-0 flex-1">
	                    <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{resume.version_name}</span>
	                    <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
	                      {new Date(resume.created_at).toLocaleDateString()} · {resume.mode || 'technical'} · {skills.length} skills
	                    </span>
	                    {skills.length > 0 && (
	                      <span className="mt-2 flex flex-wrap gap-1">
	                        {Array.from(new Set(skills)).slice(0, 4).map((skill, index) => (
	                          <span key={`${skill}:${index}`} className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">{skill}</span>
	                        ))}
	                      </span>
	                    )}
	                  </span>
	                  <span className={`col-start-2 mt-0.5 inline-flex items-center justify-self-start gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${active ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]' : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)]'}`}>
	                    <span className="material-symbols-rounded text-[13px]" aria-hidden="true">{active ? 'check' : 'touch_app'}</span>
	                    {active ? 'Selected' : 'Use'}
	                  </span>
	                </button>
              );
            }) : (
              <div className="px-4 py-8 text-center">
                <span className="material-symbols-rounded text-3xl text-[var(--text-muted)]">folder_off</span>
                <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">No resumes in this view</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Try All time or clear the search.</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function JobSearchCommandStrip({
  query,
  location,
  loading,
  sourceHealth,
  userSkillsCount,
  packetCount,
  resumes,
  selectedResumeId,
  selectedResumeName,
  onQueryChange,
  onLocationChange,
  onSearch,
  onResumeSelect,
  resultContext,
  inputsChanged,
  resumeLoading,
}: {
  resultContext: JobSearchResultContext | null;
  inputsChanged: boolean;
  resumeLoading: boolean;
  query: string;
  location: string;
  loading: boolean;
  sourceHealth: { direct: number; aggregator: number; remote: number };
  userSkillsCount: number;
  packetCount: number;
  resumes: ResumeVersion[];
  selectedResumeId: string | null;
  selectedResumeName: string;
  onQueryChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onSearch: () => void;
  onResumeSelect: (id: string) => void;
}) {
  return (
    <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 elevation-card">
      <form
        onSubmit={event => {
          event.preventDefault();
          onSearch();
        }}
        className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1.2fr_0.8fr_auto] lg:items-end"
      >
        <ResumeSourcePicker
          resumes={resumes}
          selectedResumeId={selectedResumeId}
          selectedResumeName={selectedResumeName}
          onResumeSelect={onResumeSelect}
        />
        <label>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Target role</span>
          <input
            id="job-search-target-role"
            data-guide={FIND_ROLES_GUIDE_ANCHORS.target}
            aria-label="Target role"
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Software engineer, data analyst, product manager..."
            className="h-11 w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-base font-medium text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)]"
          />
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Location</span>
          <input
            data-guide={FIND_ROLES_GUIDE_ANCHORS.location}
            aria-label="Location or work preference"
            value={location}
            onChange={event => onLocationChange(event.target.value)}
            placeholder="Remote, New York, Austin..."
            className="h-11 w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-base text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)]"
          />
        </label>
        <button
          type="submit"
          data-guide={FIND_ROLES_GUIDE_ANCHORS.search}
          disabled={loading || resumeLoading || !query.trim()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-5 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 disabled:opacity-45"
        >
          <span className={`material-symbols-rounded text-[18px] ${loading ? 'animate-spin' : ''}`}>{loading ? 'progress_activity' : 'radar'}</span>
          {resumeLoading ? 'Loading resumes…' : loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      <div className="mt-3 min-w-0 border-t border-[var(--border-subtle)] pt-3 text-xs leading-5 text-[var(--text-secondary)]" aria-label="Search context" aria-live="polite">
        {resultContext ? (
          <>
            <p className="break-words"><strong className="text-[var(--text-primary)]">Results for {resultContext.query}</strong> · {resultContext.location || 'Any location'} · {resultContext.scoreResumeId ? `Resume source: ${resultContext.sourceName}` : 'Resume fit unmeasured'}</p>
            {inputsChanged && <p className="mt-1 text-[var(--warning)]">Search settings changed. Search again to update these results.</p>}
          </>
        ) : (
          <p className="break-words"><strong className="text-[var(--text-primary)]">{query.trim() || 'Choose your target role'}</strong> · {location.trim() || 'Any location'} · {selectedResumeId ? `Resume source: ${selectedResumeName}` : 'Browse without a resume; fit is unmeasured and preparation needs a confirmed source.'}</p>
        )}
        {loading && <p className="mt-1">Searching sources. Your inputs remain available.</p>}
      </div>
    </section>
  );
}

function JobSearchHeader() {
  return (
    <SuiteToolHeader
      tool="job-search"
      title="Find roles worth your time"
      eyebrow="Your next opportunity"
      subtitle="Choose your direction, inspect the evidence, then decide which roles deserve an application."
    />
  );
}

function SourceHealthPanel({ jobs }: { jobs: OpportunityJob[] }) {
  const direct = jobs.filter(job => job.sourceMeta.sourceType === 'direct_ats').length;
  const aggregator = jobs.filter(job => job.sourceMeta.sourceType === 'aggregator').length;
  const remote = jobs.filter(job => job.sourceMeta.sourceType === 'remote_board').length;
  const total = jobs.length;
  return (
    <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Source health</p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">Hybrid supply</p>
        </div>
        <span className="material-symbols-rounded text-[var(--accent)]">hub</span>
      </div>
      {total > 0 ? (
        <div className="mt-4 space-y-3">
          <SourceBar label="Direct ATS" value={direct} total={total} />
          <SourceBar label="Aggregator" value={aggregator} total={total} />
          <SourceBar label="Remote boards" value={remote} total={total} />
        </div>
      ) : (
        <SuiteUnmeasured
          className="mt-4"
          density="compact"
          label="No source mix yet"
          reason="Run a search to see how supply splits across direct ATS, aggregators, and remote boards."
        />
      )}
    </div>
  );
}

function SourceBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = Math.round((value / total) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium text-[var(--text-secondary)]">{label}</span>
        <span className="text-[var(--text-muted)]">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--card-bg)]">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function OpportunityIntelligenceBar({
  activeFilter,
  sortBy,
  matchThreshold,
  hideGhosts,
  showPrefs,
  suggestedTargetRole,
  hasPrefs,
  userSkills,
  jobs,
  onFilterChange,
  onSortChange,
  onThresholdChange,
  onHideGhostsChange,
  onSavedSearch,
  onPrefsToggle,
  onPrefsLoaded,
  onPrefsApplied,
  onPrefsClose,
}: {
  activeFilter: FeedFilter;
  sortBy: SortOption;
  matchThreshold: number;
  hideGhosts: boolean;
  showPrefs: boolean;
  suggestedTargetRole?: string;
  hasPrefs: boolean;
  userSkills: string[];
  jobs: OpportunityJob[];
  onFilterChange: (value: FeedFilter) => void;
  onSortChange: (value: SortOption) => void;
  onThresholdChange: (value: number) => void;
  onHideGhostsChange: (value: boolean) => void;
  onSavedSearch: (query: string) => void;
  onPrefsToggle: () => void;
  onPrefsLoaded: (prefs: any) => void;
  onPrefsApplied: (prefs: any) => void;
  onPrefsClose: () => void;
}) {
  const profileScore = [hasPrefs, userSkills.length > 0, matchThreshold >= 60, !hideGhosts].filter(Boolean).length;
  const directCount = jobs.filter(job => job.sourceMeta.sourceType === 'direct_ats').length;
  return (
    <section className="taco-suite-panel rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 elevation-card">
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">


        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {FILTERS.map(filter => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={activeFilter === filter.value}
              onClick={() => onFilterChange(filter.value)}
              className={`inline-flex items-center justify-center gap-1.5 min-h-11 rounded-[12px] border px-3 py-2 text-xs font-medium transition ${
                activeFilter === filter.value
                  ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                  : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="material-symbols-rounded text-sm">{filter.icon}</span>
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sortBy}
            onChange={event => onSortChange(event.target.value as SortOption)}
            className="h-11 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm font-semibold text-[var(--text-secondary)] outline-none"
            aria-label="Sort opportunities"
          >
            <option value="relevance">Relevance</option>
            <option value="salary">Salary</option>
            <option value="date">Date</option>
          </select>
          <button
            onClick={onPrefsToggle}
            className={`inline-flex h-11 items-center gap-1.5 rounded-[11px] border px-3 text-xs font-semibold transition ${
              showPrefs
                ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span className="material-symbols-rounded text-sm">{showPrefs ? 'expand_less' : 'tune'}</span>
            Controls
          </button>
        </div>
      </div>

      {showPrefs && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 border-t border-[var(--border-subtle)] pt-4"
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
            <JobPreferencesPanel
              visible={showPrefs}
              suggestedTargetRole={suggestedTargetRole}
              onPrefsLoaded={onPrefsLoaded}
              onPrefsApplied={onPrefsApplied}
              onClose={onPrefsClose}
            />
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
              <section className="rounded-[2px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Search profile</p>
                    <h2 className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{profileScore}/4 ready</h2>
                  </div>
                  <span className="material-symbols-rounded text-[var(--accent)]">checklist</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <ChecklistRow label="Preferences saved" done={hasPrefs} />
                  <ChecklistRow label="Resume skills loaded" done={userSkills.length > 0} />
                  <ChecklistRow label="Quality threshold set" done={matchThreshold >= 60} />
                  <ChecklistRow label="Ghost filter available" done />
                </div>
              </section>

              <section className="rounded-[2px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Role suggestions</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SAVED_SEARCHES.map(search => (
                    <button
                      key={search}
                      onClick={() => onSavedSearch(search)}
                      className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                      {search}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr]">
                  <label>
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Min fit</span>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={matchThreshold}
                        onChange={event => onThresholdChange(Number(event.target.value))}
                        className="w-full accent-[var(--accent)]"
                      />
                      <span className="rounded-full bg-[var(--accent-dim)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">{matchThreshold}%</span>
                    </div>
                  </label>
                  <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Hide high ghost risk</span>
                    <input
                      type="checkbox"
                      checked={hideGhosts}
                      onChange={event => onHideGhostsChange(event.target.checked)}
                      className="h-5 w-5 accent-[var(--accent)]"
                    />
                  </label>
                </div>
              </section>

              <SourceHealthPanel jobs={jobs} />
            </div>
          </div>
        </motion.div>
      )}
    </section>
  );
}

function ChecklistRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`material-symbols-rounded text-[16px] ${done ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>
        {done ? 'check_circle' : 'radio_button_unchecked'}
      </span>
      <span className={done ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>{label}</span>
    </div>
  );
}

function OpportunityFeed({
  jobs,
  selectedId,
  loading,
  hasSearched,
  recovery,
  packets,
  onSelect,
  onDetails,
  onPrepare,
  onEmptySearch,
  onRecoveryAction,
  onEditSearch,
  totalJobs,
  onResetFilters,
}: {
  totalJobs: number;
  onResetFilters: () => void;
  jobs: OpportunityJob[];
  selectedId: string | null;
  loading: boolean;
  hasSearched: boolean;
  recovery: JobDiscoveryRecovery | null;
  packets: Record<string, ApplicationPacket>;
  onSelect: (job: OpportunityJob) => void;
  onDetails: (job: OpportunityJob) => void;
  onPrepare: (job: OpportunityJob) => void;
  onEmptySearch: (query: string) => void;
  onRecoveryAction: () => void;
  onEditSearch: () => void;
}) {
  const [mobileReviewExpanded, setMobileReviewExpanded] = useState(false);
  const [isMobileReview, setIsMobileReview] = useState(false);
  const topThreeJobs = jobs.slice(0, 3);
  const remainingJobs = jobs.slice(3);
  const mobileReviewKey = `${topThreeJobs.map(getJobResultIdentity).join('|')}:${jobs.length}`;

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const sync = () => setIsMobileReview(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    setMobileReviewExpanded(false);
  }, [mobileReviewKey]);

  useEffect(() => {
    if (!isMobileReview || mobileReviewExpanded || topThreeJobs.length === 0) return;
    if (!topThreeJobs.some(job => getJobResultIdentity(job) === selectedId)) onSelect(topThreeJobs[0]);
  }, [isMobileReview, mobileReviewExpanded, mobileReviewKey, onSelect, selectedId]);

  if (loading) {
    return (
      <section className="taco-suite-panel flex min-h-[360px] flex-col items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center">
        <AssistantThinkingTile
          variant="jobs"
          icon="radar"
          title="Scanning sources and ranking roles"
          description="Taco is checking breadth, freshness, risk, and fit signals."
          activeStage="scanning"
          stages={['Sources', 'Freshness', 'Fit score', 'Risk']}
          className="w-full max-w-xl text-left"
        />
      </section>
    );
  }

  if (!hasSearched) {
    return (
      <section className="taco-suite-panel rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
        <div className="mx-auto max-w-2xl py-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[2px] border border-[var(--accent)] bg-[var(--accent-dim)]">
            <span className="material-symbols-rounded text-2xl text-[var(--accent)]">radar</span>
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight text-[var(--text-primary)]">Start with a role, then let <TacoName /> rank the market.</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Search across broad APIs and direct ATS boards. Fit scoring improves when your resume and preferences are loaded.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {SAVED_SEARCHES.map(search => (
              <button
                key={search}
                onClick={() => onEmptySearch(search)}
                className="min-h-11 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {search}
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (recovery && jobs.length === 0) {
    return (
      <section className="taco-suite-panel flex min-h-[420px] items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6">
        <div className="w-full max-w-xl">
          <JobDiscoveryRecoveryPanel recovery={recovery} onAction={onRecoveryAction} />
        </div>
      </section>
    );
  }

  if (jobs.length === 0) {
    return (
      <section className="taco-suite-panel flex min-h-[420px] flex-col items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center">
        <span className="material-symbols-rounded text-4xl text-[var(--text-muted)]">search_off</span>
        <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{totalJobs > 0 ? 'No roles matched these filters.' : 'No roles found for this search.'}</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">{totalJobs > 0 ? 'Your search returned roles. Clear the filters to see them.' : 'Try a broader role title or another location.'}</p>
        {totalJobs > 0 && <button type="button" onClick={onResetFilters} className="btn-secondary mt-4 min-h-11">Clear filters</button>}
        <button
          type="button"
          onClick={onEditSearch}
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <span className="material-symbols-rounded text-[16px]" aria-hidden="true">edit</span>
          Edit search
        </button>
      </section>
    );
  }

  const renderOpportunity = (job: OpportunityJob, index: number) => (
    <OpportunityCard
      key={getJobResultIdentity(job)}
      job={job}
      rank={index + 1}
      selected={selectedId === getJobResultIdentity(job)}
      guideTarget={selectedId === getJobResultIdentity(job) || (!jobs.some(candidate => getJobResultIdentity(candidate) === selectedId) && index === 0)}
      packet={packets[getJobResultIdentity(job)]}
      onSelect={() => onSelect(job)}
      onDetails={() => onDetails(job)}
      onPrepare={() => onPrepare(job)}
    />
  );

  return (
    <section className="min-w-0">
      {recovery && (
        <div className="mb-4">
          <JobDiscoveryRecoveryPanel recovery={recovery} onAction={onRecoveryAction} compact />
        </div>
      )}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{jobs.length} ranked roles</h2>
          {jobs.length > 3 && (
            <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)] lg:hidden">Reviewing the strongest three first.</p>
          )}
        </div>
        <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1 text-xs text-[var(--text-secondary)]">Review first</span>
      </div>
      <div className="grid gap-3">
        {topThreeJobs.map(renderOpportunity)}
      </div>
      {remainingJobs.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={mobileReviewExpanded}
            aria-controls="remaining-ranked-roles"
            onClick={() => {
              const nextExpanded = !mobileReviewExpanded;
              setMobileReviewExpanded(nextExpanded);
              if (!nextExpanded && !topThreeJobs.some(job => getJobResultIdentity(job) === selectedId)) onSelect(topThreeJobs[0]);
            }}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] lg:hidden"
          >
            <span className="material-symbols-rounded text-[17px]" aria-hidden="true">{mobileReviewExpanded ? 'collapse_all' : 'expand_all'}</span>
            {mobileReviewExpanded ? 'Show top 3 only' : `Show all ${jobs.length} roles`}
          </button>
          <div
            id="remaining-ranked-roles"
            className={`${mobileReviewExpanded ? 'mt-3 grid' : 'hidden'} gap-3 lg:mt-3 lg:grid`}
          >
            {remainingJobs.map((job, index) => renderOpportunity(job, index + 3))}
          </div>
        </>
      )}
    </section>
  );
}

function OpportunityCard({
  job,
  rank,
  selected,
  guideTarget,
  packet,
  onSelect,
  onDetails,
  onPrepare,
}: {
  job: OpportunityJob;
  rank?: number;
  selected: boolean;
  guideTarget: boolean;
  packet?: ApplicationPacket;
  onSelect: () => void;
  onDetails: () => void;
  onPrepare: () => void;
}) {
  const score = job.fitScore?.overall ?? job.matchScore;
  const color = score === null ? 'var(--text-muted)' : scoreColor(score);
  const canPrepare = job.preparationEligible;
  const packetNeedsRecovery = packet?.status === 'needs_attention' || packet?.status === 'failed';
  const canRetryPacket = packetNeedsRecovery && packet?.recovery?.action === 'retry_packet';
  const recoveryIcon = packet?.recovery?.action === 'upload_resume'
    ? 'description'
    : packet?.recovery?.action === 'upgrade'
      ? 'lock'
      : packet?.recovery?.action === 'open_applications'
        ? 'work'
        : packet?.recovery?.action === 'retry_packet'
          ? 'refresh'
          : 'fact_check';
  return (
    <article
      className={`rounded-[2px] border bg-[var(--bg-surface)] p-4 transition ${
        selected ? 'border-[var(--accent)] elevation-raised' : 'border-[var(--border-subtle)] elevation-card hover:border-[var(--accent)]'
      }`}
    >
      <button
        data-guide={guideTarget ? FIND_ROLES_GUIDE_ANCHORS.role : undefined}
        onClick={onSelect}
        aria-pressed={selected}
        aria-controls="opportunity-intelligence-panel"
        className="block w-full text-left"
      >
        <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {rank && (
                <span className="inline-flex min-h-6 items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2 text-[11px] font-semibold tabular-nums text-[var(--text-secondary)] lg:hidden">
                  Pick {rank}
                </span>
              )}
              <SourceBadge meta={job.sourceMeta} />
              <FreshnessBadge job={job} />
              <PacketStatusPill packet={packet} />
              <RecommendationStatusPill status={job.ledgerStatus} />
            </div>
            <h3 className="break-words text-[15px] font-semibold leading-snug text-[var(--text-primary)]">{job.title}</h3>
            <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">{job.company}</p>
          </div>
          <div className="min-w-0 shrink-0 text-right">
            <div className="flex items-center justify-between gap-3 rounded-[12px] border px-3 py-2 sm:block" style={{ borderColor: `color-mix(in srgb, ${color} 25%, transparent)`, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color }}>{scoreLabel(score)}</p>
              <p className="mt-0.5 text-xl font-semibold" style={{ color }}>{score === null ? '--' : `${score}%`}</p>
            </div>
          </div>
        </div>
        <p className="mt-3 min-w-0 break-words text-[11px] leading-5 text-[var(--text-secondary)]">{job.location} · {formatSalary(job.salary.min, job.salary.max, job.salary.currency)} · Posted {timeAgo(job.postedDate)}</p>
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{job.recommendationReason}</p>
        {(job.fitReasons || []).length > 0 && (
          <div className="mt-3 flex min-w-0 items-start gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2">
            <span className="material-symbols-rounded mt-0.5 text-[14px] text-[var(--accent)]" aria-hidden="true">fact_check</span>
            <p className="line-clamp-2 min-w-0 text-[11px] leading-5 text-[var(--text-secondary)]">{job.fitReasons?.[0]}</p>
          </div>
        )}
        {job.skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.skills.slice(0, 6).map((skill, index) => (
              <span key={`${skill}:${index}`} className="rounded-[8px] bg-[var(--card-bg)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]">{skill}</span>
            ))}
          </div>
        )}
      </button>
      <div className="mt-4 flex items-center gap-2">
        <button
          aria-controls={canPrepare ? undefined : 'opportunity-intelligence-panel'}
          onClick={event => {
            event.stopPropagation();
            if (canRetryPacket || (canPrepare && !packetNeedsRecovery)) onPrepare();
            else onDetails();
          }}
          disabled={packet?.status === 'preparing' || packet?.status === 'ready' || packet?.status === 'applied'}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-3 py-2.5 text-xs font-semibold text-[var(--bg-deep)] transition hover:opacity-90 disabled:opacity-45"
        >
          <span className="material-symbols-rounded text-sm">{packet?.status === 'preparing' ? 'progress_activity' : packetNeedsRecovery ? recoveryIcon : canPrepare ? 'auto_fix_high' : 'fact_check'}</span>
          {packet?.status === 'ready'
            ? 'Packet ready'
            : packet?.status === 'preparing'
              ? 'Preparing'
              : packetNeedsRecovery
                ? packet?.recovery?.nextAction || 'Review packet'
                : canPrepare ? 'Prepare' : job.nextAction}
        </button>
        {canPrepare && (
          <button
            onClick={event => {
              event.stopPropagation();
              onDetails();
            }}
            aria-controls="opportunity-intelligence-panel"
            className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            Review details
          </button>
        )}
      </div>
    </article>
  );
}

function MetaChip({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)]">
      <span className="material-symbols-rounded text-[13px] text-[var(--text-muted)]">{icon}</span>
      <span className="truncate">{text}</span>
    </span>
  );
}

function SourceBadge({ meta }: { meta: OpportunitySourceMeta }) {
  const direct = meta.sourceType === 'direct_ats';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${
      direct
        ? 'border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]'
        : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)]'
    }`}>
      <span className="material-symbols-rounded text-[12px]">{direct ? 'verified' : 'travel_explore'}</span>
      {sourceLabel(meta)}
    </span>
  );
}

function FreshnessBadge({ job }: { job: OpportunityJob }) {
  const risk = job.freshness.ghostRisk;
  const className = risk === 'high'
    ? 'border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]'
    : risk === 'medium'
      ? 'border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)]'
      : 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${className}`}>
      <span className="material-symbols-rounded text-[12px]">{job.freshness.isFresh ? 'bolt' : risk === 'high' ? 'warning' : 'schedule'}</span>
      {job.freshness.isFresh ? 'Fresh' : risk === 'high' ? 'Ghost risk' : 'Review freshness'}
    </span>
  );
}

function OpportunityIntelligencePanel({
  job,
  packet,
  userSkills,
  hasSource,
  onClose,
  onPrepare,
  onMarkApplied,
  onSaveLater,
  onSkip,
  onFeedback,
  panelRef,
}: {
  job: OpportunityJob | null;
  packet?: ApplicationPacket;
  userSkills: string[];
  hasSource: boolean;
  onClose: () => void;
  onPrepare: (job: OpportunityJob) => void;
  onMarkApplied: (job: OpportunityJob) => void;
  onSaveLater: (job: OpportunityJob) => void;
  onSkip: (job: OpportunityJob) => void;
  onFeedback: (job: OpportunityJob, tag: 'more_like_this' | 'wrong_role' | 'wrong_location' | 'salary_too_low') => Promise<boolean>;
  panelRef?: Ref<HTMLElement>;
}) {
  const [tab, setTab] = useState<'fit' | 'jd' | 'packet' | 'company'>('fit');
  const [feedbackTag, setFeedbackTag] = useState<string | null>(null);
  const [feedbackPending, setFeedbackPending] = useState<string | null>(null);
  const jobIdentity = job ? getJobResultIdentity(job) : null;
  const activeJobIdentityRef = useRef<string | null>(jobIdentity);
  activeJobIdentityRef.current = jobIdentity;

  useEffect(() => {
    setTab('fit');
    setFeedbackPending(null);
    setFeedbackTag(job?.ledgerFeedbackTags?.find(tag => [
      'more_like_this',
      'wrong_role',
      'wrong_location',
      'salary_too_low',
    ].includes(tag)) || null);
  }, [jobIdentity]);

  if (!job) {
    return (
      <aside id="opportunity-intelligence-panel" ref={panelRef} className="taco-suite-panel rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
        <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
          <span className="material-symbols-rounded text-4xl text-[var(--text-muted)]">ads_click</span>
          <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">Select a role to open the intelligence panel.</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Fit breakdown, packet status, and apply actions live here.</p>
        </div>
      </aside>
    );
  }

  const missingSkills = job.skills.filter(skill =>
    !userSkills.some(userSkill => userSkill.toLowerCase().includes(skill.toLowerCase()) || skill.toLowerCase().includes(userSkill.toLowerCase()))
  ).slice(0, 10);

  return (
    <aside id="opportunity-intelligence-panel" ref={panelRef} className="taco-suite-panel rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] elevation-card xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-hidden">
      <div className="border-b border-[var(--border-subtle)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <SourceBadge meta={job.sourceMeta} />
              <FreshnessBadge job={job} />
            </div>
            <h2 className="text-lg font-semibold leading-tight text-[var(--text-primary)]">{job.title}</h2>
            <p className="mt-1 text-sm font-medium text-[var(--accent)]">{job.company}</p>
          </div>
          <button aria-label="Close role details" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
            <span className="material-symbols-rounded text-base" aria-hidden="true">close</span>
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <PanelMetric label="Fit" value={job.fitScore ? `${job.fitScore.overall}%` : '--'} />
          <PanelMetric label="Posted" value={timeAgo(job.postedDate)} />
          <div className="col-span-2 min-w-0"><PanelMetric label="Salary" value={formatSalary(job.salary.min, job.salary.max, job.salary.currency)} /></div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-1 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1">
          {(['fit', 'jd', 'packet', 'company'] as const).map(item => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`min-h-11 rounded-[9px] px-2 py-2 text-xs font-semibold capitalize transition ${
                tab === item ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] elevation-card' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {item === 'jd' ? 'JD' : item}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[calc(100dvh-270px)] overflow-y-auto p-5">
        {tab === 'fit' && (
          <div data-guide={FIND_ROLES_GUIDE_ANCHORS.evidence} className="space-y-4">
            <p className="text-sm leading-6 text-[var(--text-secondary)]">{job.recommendationReason}</p>
            <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Tune future picks</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  ['more_like_this', 'More like this'],
                  ['wrong_role', 'Wrong role'],
                  ['wrong_location', 'Wrong location'],
                  ['salary_too_low', 'Salary too low'],
                ] as const).map(([tag, label]) => (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={feedbackTag === tag}
                    disabled={feedbackPending !== null}
                    onClick={async () => {
                      const feedbackJobIdentity = getJobResultIdentity(job);
                      setFeedbackPending(tag);
                      const saved = await onFeedback(job, tag);
                      if (activeJobIdentityRef.current !== feedbackJobIdentity) return;
                      if (saved) setFeedbackTag(tag);
                      setFeedbackPending(null);
                    }}
                    className={`min-h-11 rounded-[11px] border px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
                      feedbackTag === tag
                        ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {feedbackPending === tag ? 'Saving...' : label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3">
              <EvidenceNoteList
                title="Why this ranks"
                icon="verified"
                tone="blue"
                items={job.fitReasons || []}
                empty={hasSource ? 'Fit evidence has not been measured for this role yet.' : 'Add a confirmed resume and preferences to get stronger fit evidence.'}
              />
              <EvidenceNoteList
                title="Source confidence"
                icon="travel_explore"
                tone="neutral"
                items={job.sourceNotes || []}
                empty="No additional source notes were returned."
              />
              <EvidenceNoteList
                title="Checks before applying"
                icon="rule"
                tone="warning"
                items={(job.riskNotes || []).length ? job.riskNotes || [] : job.freshness.reasons}
                empty="Risk checks are unavailable. Verify the original posting before applying."
              />
            </div>
            <button
              onClick={() => {
                mergeApplicationKitContext({
                  jobDescription: job.description,
                  company: job.company,
                  jobTitle: job.title,
                  targetRole: job.title,
                });
                window.location.href = '/suite/market-oracle';
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[13px] border border-[var(--accent)] bg-[var(--accent-dim)] px-4 py-2.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-hover)]"
            >
              <span className="material-symbols-rounded text-base">troubleshoot</span>
              Deep Analyze in Market Oracle
            </button>
            {job.fitScore ? (
              job.fitScore.factorsMeasured === false ? (
                <SuiteUnmeasured
                  label="Fit breakdown not measured"
                  reason="Only an overall match score is available for this role. Add or refresh your resume so Taco can break fit down by factor."
                />
              ) : (
                <div className="space-y-3">
                  <FitRow label="Skills" value={job.fitScore.skills} />
                  <FitRow label="Seniority" value={job.fitScore.titleSeniority} />
                  <FitRow label="Domain" value={job.fitScore.domain} />
                  <FitRow label="Location" value={job.fitScore.location} />
                  <FitRow label="Freshness" value={job.fitScore.freshness} />
                  <FitRow label="Your signals" value={job.fitScore.preference} />
                  <FitRow label="Risk control" value={job.fitScore.risk} />
                </div>
              )
            ) : (
              <SuiteUnmeasured
                label="Fit not measured"
                reason={hasSource
                  ? 'This role has no measured fit score yet. Review the source and role evidence before deciding.'
                  : 'This search did not return resume fit evidence. Confirm your source and search again.'}
              />
            )}
            {hasSource && userSkills.length > 0 && missingSkills.length > 0 && (
              <div className="rounded-[14px] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)] p-4">
                <p className="text-xs font-semibold text-[var(--warning)]">Keyword gaps</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {missingSkills.map((skill, index) => (
                    <span key={`${skill}:${index}`} className="rounded-full bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-2 py-1 text-[11px] font-medium text-[var(--warning)]">{skill}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'jd' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <MetaChip icon="location_on" text={job.location} />
              <MetaChip icon="work" text={job.employmentType} />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Role description</p>
              <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">{job.description || 'No description was provided by the source.'}</p>
            </div>
          </div>
        )}

        {tab === 'packet' && (
          <div data-guide={FIND_ROLES_GUIDE_ANCHORS.decisions}>
            <ApplicationPacketBuilder
              job={job}
              packet={packet}
              onPrepare={() => onPrepare(job)}
              onMarkApplied={() => onMarkApplied(job)}
              onSaveLater={() => onSaveLater(job)}
              onSkip={() => onSkip(job)}
            />
          </div>
        )}

        {tab === 'company' && (
          <div className="space-y-4">
            <SetupNudge icon="apartment" title={job.company} body={`Source: ${sourceLabel(job.sourceMeta)}. Verify the role on the source page before investing interview prep time.`} />
            {job.freshness.reasons.length > 0 && (
              <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <p className="text-xs font-semibold text-[var(--text-primary)]">Risk notes</p>
                <ul className="mt-2 space-y-2 text-xs leading-5 text-[var(--text-secondary)]">
                  {job.freshness.reasons.map((reason, index) => <li key={`${reason}:${index}`}>{reason}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function PanelMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 tabular-nums whitespace-nowrap text-xs font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function EvidenceNoteList({
  title,
  icon,
  items,
  empty,
  tone,
}: {
  title: string;
  icon: string;
  items: string[];
  empty: string;
  tone: 'blue' | 'warning' | 'neutral';
}) {
  const toneClass = tone === 'blue'
    ? 'text-[var(--accent)]'
    : tone === 'warning'
      ? 'text-[var(--warning)]'
      : 'text-[var(--text-muted)]';
  const uniqueItems = Array.from(new Set(items.map(item => item.trim()).filter(Boolean)));
  const visible = uniqueItems.length ? uniqueItems.slice(0, 3) : [empty];
  return (
    <section className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <div className="flex items-center gap-2">
        <span className={`material-symbols-rounded text-[16px] ${toneClass}`} aria-hidden="true">{icon}</span>
        <p className="text-xs font-semibold text-[var(--text-primary)]">{title}</p>
      </div>
      <ul className="mt-3 space-y-2">
        {visible.map((item, index) => (
          <li key={`${title}-${index}-${item}`} className="flex gap-2 text-xs leading-5 text-[var(--text-secondary)]">
            <span className={`material-symbols-rounded mt-0.5 text-[13px] ${toneClass}`} aria-hidden="true">{items.length ? 'fiber_manual_record' : 'info'}</span>
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FitRow({ label, value }: { label: string; value: number | null }) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--text-secondary)]">{label}</span>
        <span className="font-medium text-[var(--text-tertiary)]">Not measured</span>
      </div>
    );
  }
  const color = scoreColor(value);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--text-secondary)]">{label}</span>
        <span className="font-semibold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--card-bg)]">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function SetupNudge({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <div className="flex gap-3">
        <span className="material-symbols-rounded mt-0.5 text-lg text-[var(--accent)]">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{body}</p>
        </div>
      </div>
    </div>
  );
}

function ApplicationPacketBuilder({
  job,
  packet,
  onPrepare,
  onMarkApplied,
  onSaveLater,
  onSkip,
}: {
  job: OpportunityJob;
  packet?: ApplicationPacket;
  onPrepare: () => void;
  onMarkApplied: () => void;
  onSaveLater: () => void;
  onSkip: () => void;
}) {
  const current = packet || createInitialPacket();
  if (current.status === 'preparing') {
    return (
      <div className="rounded-[12px] border border-[var(--accent)] bg-[var(--bg-surface)] p-4" role="status" aria-live="polite">
        <p className="text-sm font-semibold text-[var(--text-primary)]"><TacoName /> is preparing this packet</p>
        <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">Resume tailoring, cover letter and checks are pending. We will show the completed work when the server confirms it.</p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">Nothing has been submitted.</p>
      </div>
    );
  }

  if (current.status === 'ready' || current.status === 'applied') {
    const markedApplied = current.status === 'applied';
    return (
      <div className="space-y-4">
        <div className="rounded-[14px] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_6%,transparent)] p-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-rounded text-[var(--success)]">verified</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{markedApplied ? 'Application marked applied' : 'Packet ready for manual submit'}</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {markedApplied
                  ? 'The tracker now shows that you submitted this on the job site.'
                  : 'Resume, cover letter, ATS check, and tracker draft are ready. Open the posting and submit manually.'}
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PanelMetric label="ATS" value={Number.isFinite(current.atsScore) ? `${current.atsScore}%` : 'Needs check'} />
          <PanelMetric label="Gaps" value={Array.isArray(current.keywordGaps) ? `${current.keywordGaps.length}` : 'Not checked'} />
        </div>
        {current.coverLetter && (
          <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--text-primary)]">Cover letter preview</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(current.coverLetter || '');
                  showToast('Cover letter copied', 'content_copy');
                }}
                className="min-h-11 rounded-[8px] border border-[var(--border-subtle)] px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)] lg:min-h-0 lg:px-2 lg:py-1"
              >
                Copy
              </button>
            </div>
            <p className="line-clamp-6 text-xs leading-5 text-[var(--text-secondary)]">{current.coverLetter}</p>
          </div>
        )}
        {current.keywordGaps && current.keywordGaps.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Array.from(new Set(current.keywordGaps)).slice(0, 8).map((gap, index) => (
              <span key={`${gap}:${index}`} className="rounded-full bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-2 py-1 text-[11px] font-medium text-[var(--warning)]">{gap}</span>
            ))}
          </div>
        )}
        <div className="grid gap-2">
          {job.outboundLinkVerified && job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 py-3 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
            >
              <span className="material-symbols-rounded text-base">open_in_new</span>
              Open posting
            </a>
          )}
          {current.applicationId && (
            <a
              href={`/suite/applications?application=${encodeURIComponent(current.applicationId)}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--text-primary)]"
            >
              <span className="material-symbols-rounded text-base" aria-hidden="true">fact_check</span>
              Continue to review
            </a>
          )}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={onMarkApplied} disabled={markedApplied} className="min-h-11 min-w-0 rounded-[11px] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-2 py-2 text-xs font-semibold text-[var(--success)] disabled:opacity-50">{markedApplied ? 'Applied' : 'I submitted it'}</button>
            <button onClick={onSaveLater} className="min-h-11 min-w-0 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2 py-2 text-xs font-semibold text-[var(--text-secondary)]">Save</button>
            <button onClick={onSkip} className="min-h-11 min-w-0 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2 py-2 text-xs font-semibold text-[var(--text-secondary)]">Skip</button>
          </div>
        </div>
      </div>
    );
  }

  if (current.status === 'failed' || current.status === 'needs_attention') {
    const needsAttention = current.status === 'needs_attention';
    const recovery = current.recovery || classifyJobPacketFailure(current.error || 'Packet preparation failed');
    const recoveryHref = recovery.action === 'upload_resume'
      ? '/suite/resume'
      : recovery.action === 'upgrade'
        ? '/suite/upgrade?plan=studio'
        : recovery.action === 'open_applications'
          ? '/suite/applications'
          : null;
    return (
      <div className={`rounded-[14px] border p-4 ${needsAttention ? 'border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)]' : 'border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)]'}`} role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <span className={`material-symbols-rounded mt-0.5 text-[20px] ${needsAttention ? 'text-[var(--warning)]' : 'text-[var(--danger)]'}`} aria-hidden="true">
            {needsAttention ? 'pending_actions' : 'sync_problem'}
          </span>
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${needsAttention ? 'text-[var(--warning)]' : 'text-[var(--danger)]'}`}>{recovery.title}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{recovery.message}</p>
          </div>
        </div>
        {current.warnings && current.warnings.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-[var(--border-subtle)] pt-3 text-xs leading-5 text-[var(--text-secondary)]">
            {Array.from(new Set(current.warnings)).slice(0, 3).map((warning, index) => <li key={`${warning}:${index}`}>{warning}</li>)}
          </ul>
        )}
        {recovery.action === 'retry_packet' && (
          <button onClick={onPrepare} className="mt-4 min-h-11 rounded-[11px] bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-deep)]">
            {recovery.nextAction}
          </button>
        )}
        {recoveryHref && (
          <a href={recoveryHref} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[11px] bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-deep)]">
            {recovery.nextAction}
          </a>
        )}
      </div>
    );
  }

  if (!job.preparationEligible) {
    return (
      <div className="space-y-4">
        <SetupNudge
          icon="fact_check"
          title="Review required before packet work"
          body={`${job.nextAction}. Check the fit evidence and original posting before asking Taco to prepare materials.`}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onSaveLater}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 py-3 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
          >
            <span className="material-symbols-rounded text-base" aria-hidden="true">bookmark</span>
            Save for review
          </button>
          {job.outboundLinkVerified && job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              <span className="material-symbols-rounded text-base" aria-hidden="true">open_in_new</span>
              Verify source
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SetupNudge icon="auto_fix_high" title="Prepare without leaving Job Search" body="Taco prepares a resume draft, cover letter, ATS check and tracker draft. It does not submit the application." />
      <button
        onClick={onPrepare}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 py-3 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
      >
        <span className="material-symbols-rounded text-base">auto_fix_high</span>
        Prepare packet
      </button>
    </div>
  );
}

type PendingJobSearchIntent = { query: string; location: string; salaryMin: number; owner: string; accessToken: string };

function JobSearchWorkspace({ pendingSearchRef }: { pendingSearchRef?: MutableRefObject<PendingJobSearchIntent | null> } = {}) {
  const searchParams = useSearchParams();
  const user = useStore(state => state.user);
  const jobCountUserId = String((user as any)?.uid || '');
  const jobSearchAccessToken = String((user as any)?.accessToken || (user as any)?.stsTokenManager?.accessToken || '');
  const activeJobUserIdRef = useRef(jobCountUserId);
  activeJobUserIdRef.current = jobCountUserId;
  const { setAuthModal, renderAuthModal } = useAuthGate();
  const [jobs, setJobs] = useState<OpportunityJob[]>([]);
  const [selectedJobKey, setSelectedJobKey] = useState<string | null>(null);
  const [packets, setPackets] = useState<Record<string, ApplicationPacket>>({});
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchRecovery, setSearchRecovery] = useState<JobDiscoveryRecovery | null>(null);
  const [searchImpressionId, setSearchImpressionId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [salaryMin, setSalaryMin] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [activeFilter, setActiveFilter] = useState<FeedFilter>('all');
  const [matchThreshold, setMatchThreshold] = useState(50);
  const [hideGhosts, setHideGhosts] = useState(false);
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [selectedResumeName, setSelectedResumeName] = useState('');
  const [resumeLoadAttempt, setResumeLoadAttempt] = useState(0);
  const [resumeLoading, setResumeLoading] = useState(true);
  const [resultContext, setResultContext] = useState<JobSearchResultContext | null>(null);
  const sourceLoadRequestRef = useRef(0);
  const activeSourceKeyRef = useRef<string | null>(null);
  const resumeReadyOwnerRef = useRef("");
  const activeRoleContextRef = useRef<{ key: string | null; descriptionKey: string | null }>({ key: null, descriptionKey: null });
  const [resumeSourceRecovery, setResumeSourceRecovery] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [storageHydratedUserId, setStorageHydratedUserId] = useState('');
  const alertControlsRequested = searchParams.get('controls') === 'alerts' || searchParams.get('view') === 'preferences';
  const [alertSuggestedTargetRole] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const targetRole = normalizeAlertTargetRole(sessionStorage.getItem(SONA_ALERT_TARGET_ROLE_KEY));
      sessionStorage.removeItem(SONA_ALERT_TARGET_ROLE_KEY);
      return targetRole;
    } catch {
      return '';
    }
  });
  const focusedAlertControlsRef = useRef(false);

  useEffect(() => {
    setStorageHydratedUserId('');
    if (alertControlsRequested) setShowPrefs(true);
  }, [alertControlsRequested]);

  useEffect(() => {
    if (!alertControlsRequested || !showPrefs || focusedAlertControlsRef.current) return;
    const focusTimer = window.setTimeout(() => {
      document.getElementById('sona-picks-controls')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('sona-picks-controls')?.focus({ preventScroll: true });
      focusedAlertControlsRef.current = true;
    }, 250);
    return () => window.clearTimeout(focusTimer);
  }, [alertControlsRequested, showPrefs]);
  const [hasPrefs, setHasPrefs] = useState(false);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const workingRegionRef = useRef<HTMLElement | null>(null);
  const searchRequestIdRef = useRef(0);
  const packetRequestGenerationRef = useRef(0);
  const packetRequestRevisionsRef = useRef<Map<string, symbol>>(new Map());
  const restoredDraftRef = useRef({ query: false, location: false, salaryMin: false });
  const draftEditedRef = useRef(false);
  const draftInputsRef = useRef({ query, location, salaryMin });
  draftInputsRef.current = { query, location, salaryMin };
  useEffect(() => () => {
    searchRequestIdRef.current += 1;
    packetRequestGenerationRef.current += 1;
  }, []);
  const localPendingSearchRef = useRef<PendingJobSearchIntent | null>(null);
  const pendingSearchAfterAuthRef = pendingSearchRef || localPendingSearchRef;

  useEffect(() => {
    searchRequestIdRef.current += 1;
    packetRequestGenerationRef.current += 1;
    restoredDraftRef.current = { query: false, location: false, salaryMin: false };
    draftEditedRef.current = false;
    activeSourceKeyRef.current = null;
    sourceLoadRequestRef.current += 1;
    setResultContext(null);
    setJobs([]);
    setSelectedJobKey(null);
    setSearchImpressionId(null);
    setPackets({});
    setUserSkills([]);
    setResumes([]);
    setSelectedResumeId(null);
    setSelectedResumeName('');
    setResumeSourceRecovery(null);
    setQuery('');
    setLocation('');
    setSalaryMin(0);
    setMatchThreshold(50);
    setHasPrefs(false);
    setActiveFilter('all');
    setSortBy('relevance');
    setHideGhosts(false);
    setHasSearched(false);
    setSearchRecovery(null);
    try {
      localStorage.removeItem(SEARCH_PREFS_KEY);
      localStorage.removeItem(RESUME_STORAGE_KEY);
      localStorage.removeItem(RESUME_ID_STORAGE_KEY);
      sessionStorage.removeItem(PACKET_STORAGE_KEY);
      if (!jobCountUserId) return;

      const savedPrefs = localStorage.getItem(scopedJobStorageKey(SEARCH_PREFS_KEY, jobCountUserId));
      if (savedPrefs) {
        const parsed = JSON.parse(savedPrefs);
        restoredDraftRef.current = { query: Boolean(parsed?.query), location: Boolean(parsed?.location), salaryMin: Boolean(parsed?.salaryMin) };
        if (typeof parsed?.query === 'string') setQuery(parsed.query.slice(0, 160));
        if (typeof parsed?.location === 'string') setLocation(parsed.location.slice(0, 160));
        if (Number.isFinite(parsed?.threshold)) setMatchThreshold(Math.max(0, Math.min(100, Number(parsed.threshold))));
        if (Number.isFinite(parsed?.salaryMin)) setSalaryMin(Math.max(0, Math.min(10_000_000, Number(parsed.salaryMin))));
      }
      const savedPackets = sessionStorage.getItem(scopedJobStorageKey(PACKET_STORAGE_KEY, jobCountUserId));
      if (savedPackets) setPackets(readStoredPackets(JSON.parse(savedPackets)));
    } catch {
      // Ignore corrupted local session data.
    } finally {
      if (jobCountUserId) setStorageHydratedUserId(jobCountUserId);
    }
  }, [jobCountUserId]);

  useEffect(() => {
    const requestId = ++sourceLoadRequestRef.current;
    const requestedUserId = jobCountUserId;
    const isCurrent = () => sourceLoadRequestRef.current === requestId && activeJobUserIdRef.current === requestedUserId;
    resumeReadyOwnerRef.current = "";
    setResumeLoading(Boolean(user));
    if (!user) return;
    const failed = () => {
      if (!isCurrent()) return;
      activeSourceKeyRef.current = null;
      packetRequestGenerationRef.current += 1;
      searchRequestIdRef.current += 1;
      setLoading(false);
      setJobs([]);
      setResultContext(null);
      setSelectedJobKey(null);
      setHasSearched(false);
      setResumes([]);
      setSelectedResumeId(null);
      setSelectedResumeName('');
      setUserSkills([]);
      resumeReadyOwnerRef.current = requestedUserId;
      setResumeSourceRecovery('Your resumes could not be loaded. Retry to restore source selection and fit evidence. You can still browse roles without a resume.');
      setResumeLoading(false);
    };
    getResumeVersions().then(result => {
      if (!isCurrent()) return;
      if (!result.success || !result.data) { failed(); return; }
      const savedId = localStorage.getItem(scopedJobStorageKey(RESUME_ID_STORAGE_KEY, requestedUserId));
      const choice = chooseJobSearchResumeSource(result.data, savedId);
      const selected = choice.resume;
      const sourceKey = jobSearchSourceKey(selected);
      if (activeSourceKeyRef.current !== sourceKey) {
        packetRequestGenerationRef.current += 1;
        searchRequestIdRef.current += 1;
        setLoading(false);
        setJobs([]);
        setResultContext(null);
        setSelectedJobKey(null);
        setHasSearched(false);
      }
      activeSourceKeyRef.current = sourceKey;
      setResumes(result.data);
      setSelectedResumeId(selected?.id || null);
      setSelectedResumeName(selected?.version_name || '');
      const skills = selected ? extractResumeSkills(selected.content) : [];
      setUserSkills(skills);
      localStorage.setItem(scopedJobStorageKey(RESUME_STORAGE_KEY, requestedUserId), JSON.stringify(skills));
      if (selected) {
        localStorage.setItem(scopedJobStorageKey(RESUME_ID_STORAGE_KEY, requestedUserId), selected.id);
        mergeApplicationKitContext(resumeVersionToApplicationKitContext(selected));
      } else localStorage.removeItem(scopedJobStorageKey(RESUME_ID_STORAGE_KEY, requestedUserId));
      resumeReadyOwnerRef.current = requestedUserId;
      setResumeSourceRecovery(choice.recoveredFromId
        ? selected ? `Your saved source is unavailable. Using ${selected.version_name}.` : 'Add or confirm a resume to measure fit and prepare a packet.'
        : null);
      setResumeLoading(false);
    }).catch(failed);
    return () => { if (sourceLoadRequestRef.current === requestId) sourceLoadRequestRef.current += 1; };
  }, [jobCountUserId, user, resumeLoadAttempt]);

  useEffect(() => {
    if (!jobCountUserId || storageHydratedUserId !== jobCountUserId) return;
    localStorage.setItem(scopedJobStorageKey(SEARCH_PREFS_KEY, jobCountUserId), JSON.stringify({ query, location, threshold: matchThreshold, salaryMin }));
  }, [jobCountUserId, query, location, matchThreshold, salaryMin, storageHydratedUserId]);

  useEffect(() => {
    if (!jobCountUserId || storageHydratedUserId !== jobCountUserId) return;
    sessionStorage.setItem(scopedJobStorageKey(PACKET_STORAGE_KEY, jobCountUserId), JSON.stringify(packets));
  }, [jobCountUserId, packets, storageHydratedUserId]);

  useEffect(() => {
    if (!user || query) return;
    const requestedUserId = jobCountUserId;
    getUserProfile().then(({ data }) => {
      if (activeJobUserIdRef.current !== requestedUserId) return;
      if (!data || draftEditedRef.current) return;
      if (!restoredDraftRef.current.query && !draftInputsRef.current.query && data.target_roles?.[0]) setQuery(data.target_roles[0]);
      if (!restoredDraftRef.current.location && !draftInputsRef.current.location && data.location_preference) setLocation(data.location_preference);

    }).catch(() => {});
  }, [jobCountUserId, user]);

  useEffect(() => {
    if (!user) return;
    const requestedUserId = jobCountUserId;
    authFetch('/api/jobs/preferences')
      .then(response => response.json())
      .then(data => {
        if (activeJobUserIdRef.current !== requestedUserId) return;
        if (data.success && !data.isNew) {
          const prefs = data.preferences as JobSearchPreferences;
          setHasPrefs(Boolean(prefs?.targetRoles?.length || prefs?.preferredCities?.length || prefs?.salaryMin));
          if (!draftEditedRef.current && !restoredDraftRef.current.query && !draftInputsRef.current.query && prefs?.targetRoles?.[0]) setQuery(prefs.targetRoles[0]);
          if (!restoredDraftRef.current.location && !draftInputsRef.current.location && !draftEditedRef.current) {
            if (prefs?.preferredCities?.[0]) setLocation(prefs.preferredCities[0]);
            else if (prefs?.remotePref === 'remote') setLocation('Remote');
          }
          if (!restoredDraftRef.current.salaryMin && !draftInputsRef.current.salaryMin && !draftEditedRef.current && prefs?.salaryMin) setSalaryMin(prefs.salaryMin);
        }
      })
      .catch(() => {});
  }, [jobCountUserId, user]);

  const selectedResume = useMemo(() => resumes.find(resume => resume.id === selectedResumeId) || null, [resumes, selectedResumeId]);

  const sourceHealth = useMemo(() => ({
    direct: jobs.filter(job => job.sourceMeta.sourceType === 'direct_ats').length,
    aggregator: jobs.filter(job => job.sourceMeta.sourceType === 'aggregator').length,
    remote: jobs.filter(job => job.sourceMeta.sourceType === 'remote_board').length,
  }), [jobs]);

  const selectedSourceKey = useMemo(() => jobSearchSourceKey(selectedResume), [selectedResume]);
  const currentPackets = useMemo(() => Object.fromEntries(jobs.flatMap(job => {
    const key = getJobResultIdentity(job);
    const packet = packets[key];
    return selectedSourceKey && packet?.sourceKey === selectedSourceKey && packet.jobDescriptionKey === jobSearchContentKey(job.description) ? [[key, packet]] : [];
  })), [jobs, packets, selectedSourceKey]);
  const inputsChanged = resultContext ? jobSearchInputsChanged(resultContext, { query, location, salaryMin, sourceKey: selectedSourceKey }) : false;

  const packetCount = useMemo(() => Object.values(currentPackets).filter(packet => packet.status !== 'idle').length, [currentPackets]);

  const filteredJobs = useMemo(() => {
    let next = jobs.filter(job => {
      if (hideGhosts && job.freshness.ghostRisk === 'high') return false;
      if (job.fitScore && job.fitScore.overall < matchThreshold) return false;
      if (activeFilter === 'strong' && (!job.fitScore || job.fitScore.overall < 75)) return false;
      if (activeFilter === 'fresh' && !job.freshness.isFresh) return false;
      if (activeFilter === 'direct' && job.sourceMeta.sourceType !== 'direct_ats') return false;
      if (activeFilter === 'remote' && !job.location.toLowerCase().includes('remote')) return false;
      const packet = currentPackets[getJobResultIdentity(job)];
      if (activeFilter === 'ready' && packet?.status !== 'ready' && packet?.status !== 'applied') return false;
      return true;
    });
    if (sortBy === 'salary') {
      next = [...next].sort((a, b) => (b.salary.max || b.salary.min || 0) - (a.salary.max || a.salary.min || 0));
    } else if (sortBy === 'date') {
      next = [...next].sort((a, b) => new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime());
    } else {
      next = [...next].sort((a, b) => (b.fitScore?.overall || b.matchScore || 0) - (a.fitScore?.overall || a.matchScore || 0));
    }
    return next;
  }, [activeFilter, hideGhosts, jobs, matchThreshold, currentPackets, sortBy]);

  const selectedJob = useMemo(
    () => filteredJobs.find(job => getJobResultIdentity(job) === selectedJobKey) || null,
    [filteredJobs, selectedJobKey],
  );

  activeRoleContextRef.current = { key: selectedJob ? getJobResultIdentity(selectedJob) : null, descriptionKey: selectedJob ? jobSearchContentKey(selectedJob.description) : null };

  const selectJob = useCallback((job: OpportunityJob, options: { scrollToDetails?: boolean } = {}) => {
    activeRoleContextRef.current = { key: getJobResultIdentity(job), descriptionKey: jobSearchContentKey(job.description) };
    setSelectedJobKey(getJobResultIdentity(job));
    mergeApplicationKitContext({
      ...(selectedResume ? resumeVersionToApplicationKitContext(selectedResume) : {}),
      jobDescription: job.description,
      company: job.company,
      jobTitle: job.title,
      targetRole: job.title,
      applicationUrl: job.outboundLinkVerified ? job.url : undefined,
    });
    if (options.scrollToDetails) {
      window.requestAnimationFrame(() => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        detailPanelRef.current?.scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      });
    }
  }, [selectedResume]);

  const selectResume = useCallback((id: string) => {
    const resume = resumes.find(item => item.id === id);
    if (resume && !isEligibleJobSearchResume(resume)) {
      setResumeSourceRecovery('Generated packet versions cannot be used as a source resume. Choose a confirmed source instead.');
      return;
    }
    setResumeSourceRecovery(null);
    setSelectedResumeId(id || null);
    if (id !== selectedResumeId) {
      activeSourceKeyRef.current = jobSearchSourceKey(resume || null);
      packetRequestGenerationRef.current += 1;
      setPackets(previous => Object.fromEntries(Object.entries(previous).map(([key, packet]) => [key, packet.status === 'preparing' ? { ...packet, status: 'failed' as const, stageIndex: 0, error: 'The resume source changed during preparation. Open Applications for any saved work, or prepare again.', recovery: classifyJobPacketFailure('network interrupted') } : packet])));
      setResultContext(null);
      searchRequestIdRef.current += 1;
      setLoading(false);
      setJobs([]);
      setSelectedJobKey(null);
      setSearchImpressionId(null);
      setHasSearched(false);
    }
    if (!resume) {
      setSelectedResumeName('');
      setUserSkills([]);
      if (jobCountUserId) localStorage.removeItem(scopedJobStorageKey(RESUME_ID_STORAGE_KEY, jobCountUserId));
      return;
    }
    setSelectedResumeName(resume.version_name);
    if (jobCountUserId) localStorage.setItem(scopedJobStorageKey(RESUME_ID_STORAGE_KEY, jobCountUserId), resume.id);
    const skills = extractResumeSkills(resume.content);
    setUserSkills(skills);
    if (jobCountUserId) localStorage.setItem(scopedJobStorageKey(RESUME_STORAGE_KEY, jobCountUserId), JSON.stringify(skills));
    mergeApplicationKitContext(resumeVersionToApplicationKitContext(resume));
    showToast(`Using ${resume.version_name}`, 'description');
  }, [jobCountUserId, resumes, selectedResumeId]);

  const recordLedgerStatus = useCallback(async (job: OpportunityJob, status: string, feedbackTags: string[] = []) => {
    try {
      const response = await authFetch('/api/jobs/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: {
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location,
            url: job.url,
            postedDate: job.postedDate,
            employmentType: job.employmentType,
            source: job.source,
            salary: job.salary,
            category: job.category,
            dedupeKey: job.dedupeKey,
            identityKey: job.identityKey,
            sourceJobId: job.sourceJobId,
            sourceMeta: job.sourceMeta,
            matchScore: job.matchScore,
            fitScore: job.fitScore,
            fitBreakdown: job.fitScore,
            recommendationReason: job.recommendationReason,
            nextAction: job.nextAction,
          },
          status,
          feedbackTags,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  const applyPreferencesToSearch = useCallback((prefs: JobSearchPreferences | null | undefined) => {
    if (!prefs) return null;
    const nextQuery = (prefs.targetRoles?.[0] || prefs.industries?.[0] || query).trim();
    const nextLocation = (prefs.preferredCities?.[0] || (prefs.remotePref === 'remote' ? 'Remote' : location)).trim();
    const nextSalaryMin = prefs.salaryMin || 0;
    if (nextQuery) setQuery(nextQuery);
    setLocation(nextLocation);
    setSalaryMin(nextSalaryMin);
    setHasPrefs(Boolean(prefs.targetRoles?.length || prefs.preferredCities?.length || nextSalaryMin));
    return { query: nextQuery, location: nextLocation, salaryMin: nextSalaryMin };
  }, [location, query]);

  const fetchJobs = useCallback(async (page = 1, overrideQuery?: string, overrideLocation?: string, overrideSalaryMin?: number) => {
    const search = (overrideQuery || query).trim();
    if (!search || resumeLoading) return;
    const searchLocation = (overrideLocation ?? location).trim();
    const searchSalaryMin = overrideSalaryMin ?? salaryMin;
    const salaryMinDollars = searchSalaryMin > 0 ? (searchSalaryMin < 1000 ? searchSalaryMin * 1000 : searchSalaryMin) : 0;
    const requestedOwner = jobCountUserId;
    const requestedSourceKey = selectedSourceKey;
    const requestedSourceName = selectedResumeName;
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    setLoading(true);
    setHasSearched(true);
    setSearchRecovery(null);
    try {
      const params = new URLSearchParams({
        query: search,
        location: searchLocation,
        country: 'us',
        page: String(page),
        sortBy,
        limit: '24',
      });
      if (salaryMinDollars > 0) params.set('salaryMin', String(salaryMinDollars));
      const res = await authFetch(`/api/jobs/search?${params}`, {
        headers: selectedResumeId ? { 'x-talent-resume-id': selectedResumeId } : undefined,
      });
      const data = await res.json();
      if (requestId !== searchRequestIdRef.current || activeJobUserIdRef.current !== requestedOwner || activeSourceKeyRef.current !== requestedSourceKey) return;
      if (!res.ok || !data.success) {
        setSearchRecovery(classifyJobDiscoveryResponse(data, 'search', res.status));
        return;
      }
      const scoreResumeId = typeof data.scoreResumeId === 'string' ? data.scoreResumeId : null;
      const normalized = (Array.isArray(data.jobs) ? data.jobs : []).map((raw: unknown) => {
        const job = normalizeJob(raw);
        return job.preparationEligible && selectedResumeId && scoreResumeId !== selectedResumeId ? { ...job, preparationEligible: false, nextAction: 'Resume fit unavailable. Retry the search.' } : job;
      });
      setResultContext({ query: typeof data.query === 'string' ? data.query : search, location: typeof data.location === 'string' ? data.location : searchLocation, salaryMin: searchSalaryMin, sourceKey: requestedSourceKey, sourceName: scoreResumeId === selectedResumeId ? requestedSourceName : 'Server-selected source', scoreResumeId });
      setSearchRecovery(null);
      setJobs(normalized);
      setSearchImpressionId(typeof data.impressionId === 'string' ? data.impressionId : null);
      setSelectedJobKey(normalized[0] ? getJobResultIdentity(normalized[0]) : null);
      if (jobCountUserId) {
        localStorage.setItem(jobCountKey(jobCountUserId), normalized.filter((job: OpportunityJob) => (job.fitScore?.overall || 0) >= matchThreshold).length.toString());
      }
      window.dispatchEvent(new Event('job-count-updated'));
      if (normalized[0]) selectJob(normalized[0]);
    } catch (error) {
      if (requestId !== searchRequestIdRef.current || activeJobUserIdRef.current !== requestedOwner || activeSourceKeyRef.current !== requestedSourceKey) return;
      setSearchRecovery(classifyJobDiscoveryFailure(error, 'search'));
    } finally {
      if (requestId === searchRequestIdRef.current) setLoading(false);
    }
  }, [jobCountUserId, location, matchThreshold, query, salaryMin, selectJob, selectedResumeId, selectedSourceKey, selectedResumeName, resumeLoading, sortBy]);

  const editSearch = useCallback(() => {
    const input = document.getElementById('job-search-target-role') as HTMLInputElement | null;
    input?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    input?.focus({ preventScroll: true });
  }, []);

  const handleSearchRecoveryAction = useCallback(() => {
    if (!searchRecovery) return;
    if (searchRecovery.action === 'create_account' || searchRecovery.action === 'sign_in') {
      pendingSearchAfterAuthRef.current = { query, location, salaryMin, owner: jobCountUserId, accessToken: jobSearchAccessToken };
      setAuthModal(searchRecovery.action === 'create_account' ? 'signup' : 'login');
      return;
    }
    if (searchRecovery.action === 'upgrade') {
      window.location.assign('/suite/upgrade');
      return;
    }
    if (searchRecovery.action === 'open_preferences') {
      setShowPrefs(true);
      return;
    }
    fetchJobs(1);
  }, [fetchJobs, location, query, salaryMin, searchRecovery, setAuthModal, jobCountUserId, jobSearchAccessToken]);

  useEffect(() => {
    const pending = pendingSearchAfterAuthRef.current;
    if (!pending) return;
    if (pending.owner && jobCountUserId !== pending.owner) { pendingSearchAfterAuthRef.current = null; return; }
    if (!jobCountUserId || resumeLoading || resumeReadyOwnerRef.current !== jobCountUserId || pending.accessToken === jobSearchAccessToken) return;
    pendingSearchAfterAuthRef.current = null;
    void fetchJobs(1, pending.query, pending.location, pending.salaryMin);
  }, [fetchJobs, jobCountUserId, jobSearchAccessToken, resumeLoading]);

  const handlePreferencesApplied = useCallback((prefs: JobSearchPreferences | null | undefined) => {
    const applied = applyPreferencesToSearch(prefs);
    if (applied?.query) {
      showToast('Preferences applied. Searching matching roles...', 'tune');
      setShowPrefs(false);
      void fetchJobs(1, applied.query, applied.location, applied.salaryMin);
    } else {
      setHasPrefs(!!prefs);
      showToast('Preferences saved. Add a target role to search jobs.', 'info');
    }
  }, [applyPreferencesToSearch, fetchJobs]);

  const runSavedSearch = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
    void fetchJobs(1, nextQuery);
  }, [fetchJobs]);

  const updatePacket = useCallback((packetKey: string, patch: Partial<ApplicationPacket>) => {
    setPackets(prev => ({
      ...prev,
      [packetKey]: {
        ...(prev[packetKey] || createInitialPacket()),
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, []);

  const prepareApplication = useCallback(async (job: OpportunityJob) => {
    const requestUserId = jobCountUserId;
    const requestGeneration = packetRequestGenerationRef.current;
    const requestSourceKey = selectedSourceKey;
    const packetKey = getJobResultIdentity(job);
    const requestDescriptionKey = jobSearchContentKey(job.description);
    const requestRevision = Symbol('packet preparation');
    const sourceRequestIsCurrent = () => Boolean(requestUserId)
      && activeJobUserIdRef.current === requestUserId
      && packetRequestGenerationRef.current === requestGeneration
      && activeSourceKeyRef.current === requestSourceKey;
    const requestIsCurrent = () => sourceRequestIsCurrent()
      && packetRequestRevisionsRef.current.get(packetKey) === requestRevision;
    if (!sourceRequestIsCurrent()) {
      setAuthModal('login');
      return;
    }
    if (currentPackets[packetKey]?.status === 'preparing') return;
    if (!selectedResume || !requestSourceKey || resumeLoading || resultContext?.sourceKey !== requestSourceKey || resultContext?.scoreResumeId !== selectedResumeId) {
      showToast('Choose a loaded, confirmed resume before preparing a packet.', 'description');
      return;
    }
    if (!job.preparationEligible) {
      selectJob(job, { scrollToDetails: true });
      showToast(job.nextAction || 'Review fit evidence before preparing a packet.', 'fact_check');
      return;
    }
    // A new description or retry owns this slot; an older response cannot relabel its artifacts.
    packetRequestRevisionsRef.current.set(packetKey, requestRevision);
    selectJob(job);
    updatePacket(packetKey, { ...createInitialPacket(), sourceKey: requestSourceKey, jobDescriptionKey: requestDescriptionKey, status: 'preparing', applicationId: undefined, morphedVersionId: null, coverLetter: undefined, atsScore: undefined, keywordGaps: [], warnings: [], error: undefined, recovery: undefined });
    await recordLedgerStatus(job, 'queued', ['packet_requested']);
    if (!requestIsCurrent()) return;


    try {
      const res = await authFetch('/api/agent/apply-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          jobTitle: job.title,
          company: job.company,
          jobLocation: job.location,
          jobCategory: job.category,
          sourceJobId: job.sourceJobId,
          jobDescription: job.description,
          jobUrl: job.url,
          sourceMeta: job.sourceMeta,
          resumeVersionId: selectedResumeId,
          fitScore: job.fitScore,
          impressionId: searchImpressionId,
          prepareOnly: true,
        }),
      });
      const data = await res.json();
      if (!requestIsCurrent()) {
        return;
      }
      const atsScore = data.atsResult?.overallScore;
      const responseReady = readPreparedPacketResponse(data).ready;
      if (!res.ok) {
        const recovery = readJobPacketRecovery(data.recovery)
          || classifyJobPacketFailure(data.error || `Packet request failed with ${res.status}`);
        updatePacket(packetKey, {
          status: 'failed',
          stageIndex: 0,
          error: recovery.message,
          recovery,
          warnings: [],
        });
        showToast(recovery.title, data.upgrade ? 'lock' : 'sync_problem');
        return;
      }
      if (!responseReady) {
        const recovery = readJobPacketRecovery(data.recovery) || packetIncompleteRecovery({
          morphSucceeded: Boolean(data.morphedVersionId || data.morphedResume),
          coverLetterSucceeded: Boolean(data.coverLetter),
          atsSucceeded: Number.isFinite(atsScore),
        });
        updatePacket(packetKey, {
          status: data.applicationId ? 'needs_attention' : 'failed',
          stageIndex: Math.max(0, PACKET_STAGES.length - 2),
          applicationId: data.applicationId,
          morphedVersionId: data.morphedVersionId,
          coverLetter: data.coverLetter,
          atsScore: Number.isFinite(atsScore) ? atsScore : undefined,
          keywordGaps: data.keywordGaps || [],
          warnings: data.warnings || [],
          error: recovery.message,
          recovery,
        });
        if (data.applicationId && requestIsCurrent()) await recordLedgerStatus(job, 'queued', ['packet_needs_attention']);
        if (!requestIsCurrent()) return;
        showToast(recovery.title, 'pending_actions');
        return;
      }
      updatePacket(packetKey, {
        status: 'ready',
        stageIndex: PACKET_STAGES.length - 1,
        applicationId: data.applicationId,
        morphedVersionId: data.morphedVersionId,
        coverLetter: data.coverLetter,
        atsScore,
        keywordGaps: data.keywordGaps || [],
        warnings: data.warnings || [],
        error: undefined,
        recovery: undefined,
      });
      if (!requestIsCurrent()) return;
      await recordLedgerStatus(job, 'prepared', ['packet_prepared']);
      if (!requestIsCurrent()) return;
      if (activeRoleContextRef.current.key === packetKey && activeRoleContextRef.current.descriptionKey === requestDescriptionKey) {
        mergeApplicationKitContext({
          applicationId: data.applicationId,
          applicationUrl: job.outboundLinkVerified ? job.url : undefined,
          jobDescription: job.description,
          company: job.company,
          jobTitle: job.title,
          targetRole: job.title,
          resumeVersionId: data.morphedVersionId || null,
          resumeSnapshot: data.morphedResume || undefined,
          resumeSource: 'job_search',
          atsResult: data.atsResult ? { status: 'success', data: data.atsResult, updatedAt: new Date().toISOString() } : undefined,
          coverLetterResult: data.coverLetter ? { status: 'success', data: { coverLetter: data.coverLetter }, updatedAt: new Date().toISOString() } : undefined,
        });
      }
      showToast(`Packet ready for ${job.company}`, 'verified');
    } catch (error) {
      if (!requestIsCurrent()) return;
      const recovery = classifyJobPacketFailure(error);
      updatePacket(packetKey, {
        status: 'failed',
        stageIndex: 0,
        error: recovery.message,
        recovery,
        warnings: [],
      });
      showToast(recovery.title, 'sync_problem');
    }
  }, [jobCountUserId, currentPackets, resultContext, resumeLoading, selectedResume, selectedSourceKey, recordLedgerStatus, searchImpressionId, selectJob, selectedResumeId, setAuthModal, updatePacket]);

  const markApplied = useCallback(async (job: OpportunityJob) => {
    const requestUserId = jobCountUserId;
    const packetKey = getJobResultIdentity(job);
    const requestGeneration = packetRequestGenerationRef.current;
    const requestSourceKey = selectedSourceKey;
    const requestRevision = packetRequestRevisionsRef.current.get(packetKey);
    const isCurrent = () => activeJobUserIdRef.current === requestUserId
      && packetRequestGenerationRef.current === requestGeneration
      && activeSourceKeyRef.current === requestSourceKey
      && packetRequestRevisionsRef.current.get(packetKey) === requestRevision;
    const packet = currentPackets[packetKey];
    if (!packet?.applicationId) {
      showToast('Prepare a tracker draft before marking this applied.', 'cancel');
      return;
    }
    const confirmed = window.confirm('Mark this as applied only after you submitted it on the job site. TalentConsulting.io has not submitted it for you.');
    if (!confirmed) return;

    const result = await updateApplicationStatus(packet.applicationId, 'applied', { appliedAt: new Date() });
    if (!requestUserId || !isCurrent()) return;
    if (!result.success) {
      showToast(result.error || 'Could not mark this applied', 'cancel');
      return;
    }
    updatePacket(packetKey, { status: 'applied' });
    const learned = await recordLedgerStatus(job, 'applied', ['user_marked_applied']);
    if (!isCurrent()) return;
    showToast(
      learned ? `Marked applied after your manual submission to ${job.company}` : 'Application updated. Recommendation learning will retry later.',
      learned ? 'done_all' : 'sync_problem',
    );
  }, [jobCountUserId, currentPackets, selectedSourceKey, recordLedgerStatus, updatePacket]);

  const saveLater = useCallback(async (job: OpportunityJob) => {
    const requestUserId = jobCountUserId;
    const saved = await recordLedgerStatus(job, 'saved', ['saved_for_later']);
    if (!requestUserId || activeJobUserIdRef.current !== requestUserId) return false;
    if (!saved) {
      showToast('Could not save this preference. Please try again.', 'sync_problem');
      return false;
    }
    const jobKey = getJobResultIdentity(job);
    setJobs(previous => previous.map(item => getJobResultIdentity(item) === jobKey ? { ...item, ledgerStatus: 'saved' } : item));
    showToast('Saved for later', 'bookmark');
  }, [jobCountUserId, recordLedgerStatus]);

  const skipJob = useCallback(async (job: OpportunityJob) => {
    const requestUserId = jobCountUserId;
    const saved = await recordLedgerStatus(job, 'dismissed', ['user_skipped']);
    if (!requestUserId || activeJobUserIdRef.current !== requestUserId) return false;
    if (!saved) {
      showToast('Could not save this preference. Please try again.', 'sync_problem');
      return false;
    }
    const jobKey = getJobResultIdentity(job);
    setJobs(previous => previous.map(item => getJobResultIdentity(item) === jobKey ? { ...item, ledgerStatus: 'dismissed' } : item));
    showToast('Skipped role', 'block');
  }, [jobCountUserId, recordLedgerStatus]);

  const tuneRecommendation = useCallback(async (
    job: OpportunityJob,
    tag: 'more_like_this' | 'wrong_role' | 'wrong_location' | 'salary_too_low',
  ) => {
    const requestUserId = jobCountUserId;
    const positive = tag === 'more_like_this';
    const saved = await recordLedgerStatus(job, positive ? 'saved' : 'dismissed', [tag]);
    if (!requestUserId || activeJobUserIdRef.current !== requestUserId) return false;
    if (!saved) {
      showToast('Could not save this preference. Please try again.', 'sync_problem');
      return false;
    }
    const jobKey = getJobResultIdentity(job);
    setJobs(current => current.map(candidate => getJobResultIdentity(candidate) === jobKey
      ? { ...candidate, ledgerStatus: positive ? 'saved' : 'dismissed', ledgerFeedbackTags: [tag] }
      : candidate));
    showToast(positive ? 'Taco will look for more roles like this' : 'Taco will use this signal in future rankings', positive ? 'bookmark' : 'tune');
    return true;
  }, [jobCountUserId, recordLedgerStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!workingRegionRef.current || isGuidanceShortcutBlocked(event, workingRegionRef.current)) return;
      if (!filteredJobs.length) return;
      const currentIndex = Math.max(0, filteredJobs.findIndex(job => getJobResultIdentity(job) === selectedJobKey));
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectJob(filteredJobs[Math.min(filteredJobs.length - 1, currentIndex + 1)]);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectJob(filteredJobs[Math.max(0, currentIndex - 1)]);
      }
      if ((event.key === 'p' || event.key === 'P') && selectedJob) {
        event.preventDefault();
        void prepareApplication(selectedJob);
      }
      if ((event.key === 's' || event.key === 'S') && selectedJob) {
        event.preventDefault();
        void saveLater(selectedJob);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filteredJobs, prepareApplication, saveLater, selectJob, selectedJob, selectedJobKey]);

  return (
    <>
      <SuiteToolShell variant="workbench">
        <FindRolesGuidance config={findRolesGuidance({ owner: jobCountUserId || 'guest', sourceKey: selectedSourceKey, hasSource: Boolean(selectedResume), query, loading, resumeLoading, hasSearched, inputsChanged, totalResults: jobs.length, visibleResults: filteredJobs.length, recovery: searchRecovery, selectedJob, packet: selectedJob ? currentPackets[getJobResultIdentity(selectedJob)] : undefined })} />
        <ApplicationsContext active="search" context="Find roles and prepare review-ready work" />
        <JobSearchHeader />

            <JobSearchCommandStrip
              query={query}
              resultContext={resultContext}
              inputsChanged={inputsChanged}
              resumeLoading={resumeLoading}
              location={location}
              loading={loading}
              sourceHealth={sourceHealth}
              userSkillsCount={userSkills.length}
              packetCount={packetCount}
              resumes={resumes}
              selectedResumeId={selectedResumeId}
              selectedResumeName={selectedResumeName}
              onQueryChange={value => { draftEditedRef.current = true; setQuery(value); }}
              onLocationChange={value => { draftEditedRef.current = true; setLocation(value); }}
              onSearch={() => fetchJobs(1)}
              onResumeSelect={selectResume}
            />
            {resumeSourceRecovery && (
              <div className="mb-4 flex items-start gap-2 rounded-[12px] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-3 py-2.5 text-xs leading-5 text-[var(--text-secondary)]" role="status">
                <span className="material-symbols-rounded mt-0.5 text-[16px] text-[var(--warning)]" aria-hidden="true">info</span>
                <div className="min-w-0 flex-1"><p>{resumeSourceRecovery}</p>
                  <button type="button" disabled={resumeLoading} onClick={() => setResumeLoadAttempt(value => value + 1)} className="btn-secondary mt-2 min-h-11">{resumeLoading ? 'Loading resumes…' : 'Retry resume load'}</button>
                </div>
              </div>
            )}

            <OpportunityIntelligenceBar
              activeFilter={activeFilter}
              sortBy={sortBy}
              matchThreshold={matchThreshold}
              hideGhosts={hideGhosts}
              showPrefs={showPrefs}
              suggestedTargetRole={alertControlsRequested ? alertSuggestedTargetRole || query : undefined}
              hasPrefs={hasPrefs}
              userSkills={userSkills}
              jobs={jobs}
              onFilterChange={value => { setActiveFilter(value); setSearchImpressionId(null); }}
              onSortChange={value => { setSortBy(value); setSearchImpressionId(null); }}
              onThresholdChange={value => { setMatchThreshold(value); setSearchImpressionId(null); }}
              onHideGhostsChange={value => { setHideGhosts(value); setSearchImpressionId(null); }}
              onSavedSearch={runSavedSearch}
              onPrefsToggle={() => setShowPrefs(prev => !prev)}
              onPrefsLoaded={prefs => setHasPrefs(Boolean(prefs?.targetRoles?.length || prefs?.preferredCities?.length || prefs?.salaryMin))}
              onPrefsApplied={handlePreferencesApplied}
              onPrefsClose={() => setShowPrefs(false)}
            />

            <section ref={workingRegionRef} tabIndex={0} aria-label="Role results and decisions" className="grid gap-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] xl:grid-cols-[minmax(0,1fr)_430px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
              <OpportunityFeed
                jobs={filteredJobs}
                totalJobs={jobs.length}
                onResetFilters={() => { setActiveFilter("all"); setMatchThreshold(0); setHideGhosts(false); }}
                selectedId={selectedJobKey}
                loading={loading}
                hasSearched={hasSearched}
                recovery={searchRecovery}
                packets={currentPackets}
                onSelect={selectJob}
                onDetails={job => selectJob(job, { scrollToDetails: true })}
                onPrepare={prepareApplication}
                onEmptySearch={runSavedSearch}
                onRecoveryAction={handleSearchRecoveryAction}
                onEditSearch={editSearch}
              />

              <OpportunityIntelligencePanel
                job={selectedJob}
                packet={selectedJob ? currentPackets[getJobResultIdentity(selectedJob)] : undefined}
                userSkills={resultContext?.scoreResumeId === selectedResumeId ? userSkills : []}
                hasSource={Boolean(selectedResume && resultContext?.scoreResumeId === selectedResume.id)}
                onClose={() => setSelectedJobKey(null)}
                onPrepare={prepareApplication}
                onMarkApplied={markApplied}
                onSaveLater={saveLater}
                onSkip={skipJob}
                onFeedback={tuneRecommendation}
                panelRef={detailPanelRef}
              />
            </section>
      </SuiteToolShell>
      {renderAuthModal()}
    </>
  );
}


export default function JobSearchPage() {
  const searchParams = useSearchParams();
  const owner = useStore(state => state.user?.uid || 'guest');
  const pendingSearchRef = useRef<PendingJobSearchIntent | null>(null);
  const view = searchParams.get('view') || 'discover';
  const context = Object.fromEntries(searchParams.entries());
  return <>
    <nav aria-label="Find roles views" className="flex min-w-0 flex-wrap gap-2 px-4 pt-4 md:px-6">
      {[['discover', 'Discover'], ['analysis', 'Role analysis'], ['preferences', 'Preferences']].map(([value, label]) => (
        <Link
          key={value}
          aria-current={view === value ? 'page' : undefined}
          href={workspaceCompatibilityHref(`/suite/job-search?view=${value}`, context)}
          className={`inline-flex min-h-11 min-w-0 items-center justify-center rounded border border-[color:var(--text-primary)] px-4 py-2 text-sm font-semibold transition-colors ${
            view === value
              ? 'bg-[color:var(--text-primary)] text-[color:var(--bg-deep)]'
              : 'bg-[color:var(--bg-surface)] text-[color:var(--text-primary)] hover:bg-[color:var(--bg-hover)]'
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
    {view === 'analysis' ? <OracleContent key={owner} /> : <JobSearchWorkspace key={owner} pendingSearchRef={pendingSearchRef} />}
  </>;
}
