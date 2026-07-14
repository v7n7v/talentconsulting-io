'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader, SuiteToolShell } from '@/components/suite/SuiteToolChrome';
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
import SonaThinkingTile from '@/components/SonaThinkingTile';
import JobDiscoveryRecoveryPanel from '@/components/jobs/JobDiscoveryRecoveryPanel';
import {
  classifyJobDiscoveryFailure,
  classifyJobDiscoveryResponse,
  getJobResultIdentity,
  type JobDiscoveryRecovery,
} from '@/lib/job-discovery-recovery';
import { useAuthGate } from '@/hooks/useAuthGate';
import JobPreferencesPanel from './JobPreferencesPanel';
import { normalizeAlertTargetRole, SONA_ALERT_TARGET_ROLE_KEY } from '@/lib/sona/alert-consent-handoff';

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
  overall: number;
  skills: number;
  titleSeniority: number;
  domain: number;
  location: number;
  salary: number;
  freshness: number;
  resumeCoverage: number;
  risk: number;
  preference: number;
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
  freshness: { isFresh: boolean; ghostRisk: 'low' | 'medium' | 'high'; reasons: string[] };
  recommendationReason: string;
  fitReasons?: string[];
  riskNotes?: string[];
  sourceNotes?: string[];
  nextAction: string;
  preparationEligible: boolean;
  outboundLinkVerified: boolean;
}

interface ApplicationPacket {
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
  return Math.min(98, Math.max(0, Math.round(value)));
}

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return 'Not listed';
  const fmt = (n: number) => n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
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
  if (score >= 85) return '#059669';
  if (score >= 70) return '#0284c7';
  if (score >= 55) return '#d97706';
  return '#dc2626';
}

function scoreLabel(score: number | null) {
  if (score === null) return 'Needs resume';
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
  if (job.fitScore) return { ...job.fitScore, preference: job.fitScore.preference ?? 70 };
  if (job.fitBreakdown) return { ...job.fitBreakdown, preference: job.fitBreakdown.preference ?? 70 };
  const match = job.matchScore;
  if (match === null || match === undefined) return null;
  const ghostRisk = job.ghostRisk?.risk || job.freshness?.ghostRisk || 'low';
  const riskPenalty = ghostRisk === 'high' ? 25 : ghostRisk === 'medium' ? 10 : 0;
  const salaryScore = job.salary?.min || job.salary?.max ? 82 : 55;
  return {
    overall: clampScore(match),
    skills: clampScore(match),
    titleSeniority: clampScore(match + 2),
    domain: clampScore(match - 4),
    location: job.location?.toLowerCase().includes('remote') ? 88 : 72,
    salary: salaryScore,
    freshness: clampScore(84 - riskPenalty),
    resumeCoverage: clampScore(match),
    risk: clampScore(100 - riskPenalty),
    preference: 70,
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
    ghostRisk: job.ghostRisk?.risk || 'low',
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
    postedDate: job.postedDate || new Date().toISOString(),
    employmentType: job.employmentType || 'Full-time',
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
    recommendationReason: job.recommendationReason || (fitScore ? 'Role appears relevant based on your current skills and preferences.' : 'Add a resume or skills profile to unlock fit scoring.'),
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
    const hasCompleteArtifacts = typeof candidate.applicationId === 'string' && Boolean(candidate.applicationId)
      && typeof candidate.morphedVersionId === 'string' && Boolean(candidate.morphedVersionId)
      && typeof candidate.coverLetter === 'string' && Boolean(candidate.coverLetter.trim())
      && Number.isFinite(candidate.atsScore);
    const incomplete = claimsComplete && !hasCompleteArtifacts;
    const fallbackRecovery = interrupted ? classifyJobPacketFailure('network interrupted') : null;
    const incompleteRecovery = incomplete ? packetIncompleteRecovery({
      morphSucceeded: typeof candidate.morphedVersionId === 'string' && Boolean(candidate.morphedVersionId),
      coverLetterSucceeded: typeof candidate.coverLetter === 'string' && Boolean(candidate.coverLetter.trim()),
      atsSucceeded: Number.isFinite(candidate.atsScore),
    }) : null;
    packets[key] = {
      status: interrupted ? 'failed' : incomplete ? 'needs_attention' : candidate.status as PacketStatus,
      stageIndex: Number.isFinite(candidate.stageIndex) ? Math.max(0, Math.min(PACKET_STAGES.length - 1, Number(candidate.stageIndex))) : 0,
      applicationId: typeof candidate.applicationId === 'string' ? candidate.applicationId.slice(0, 256) : undefined,
      morphedVersionId: typeof candidate.morphedVersionId === 'string' ? candidate.morphedVersionId.slice(0, 256) : null,
      coverLetter: typeof candidate.coverLetter === 'string' ? candidate.coverLetter.slice(0, 30_000) : undefined,
      atsScore: Number.isFinite(candidate.atsScore) ? clampScore(Number(candidate.atsScore)) : undefined,
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
    preparing: { label: 'Preparing', icon: 'progress_activity', className: 'border-cyan-400/35 text-cyan-700 bg-cyan-500/10 dark:text-cyan-300' },
    ready: { label: 'Ready', icon: 'verified', className: 'border-emerald-400/35 text-emerald-700 bg-emerald-500/10 dark:text-emerald-300' },
    needs_attention: { label: 'Needs attention', icon: 'error', className: 'border-amber-400/35 text-amber-700 bg-amber-500/10 dark:text-amber-300' },
    failed: { label: 'Retry needed', icon: 'error', className: 'border-rose-400/35 text-rose-700 bg-rose-500/10 dark:text-rose-300' },
    applied: { label: 'Applied', icon: 'done_all', className: 'border-emerald-400/35 text-emerald-700 bg-emerald-500/10 dark:text-emerald-300' },
  };
  const item = config[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${item.className}`}>
      <span className={`material-symbols-rounded text-[12px] ${status === 'preparing' ? 'animate-spin' : ''}`}>{item.icon}</span>
      {item.label}
    </span>
  );
}

function RecommendationStatusPill({ status }: { status?: string | null }) {
  if (status !== 'saved' && status !== 'dismissed') return null;
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)]">
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
  const visibleResumes = useMemo(() => {
    const now = Date.now();
    const maxAgeMs = dateFilter === '30d'
      ? 30 * 24 * 60 * 60 * 1000
      : dateFilter === '90d'
        ? 90 * 24 * 60 * 60 * 1000
        : dateFilter === '180d'
          ? 180 * 24 * 60 * 60 * 1000
          : null;

    return resumes
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
  }, [dateFilter, query, resumes, sortBy]);

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
    <div className="relative">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Resume source</span>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={`flex h-11 w-full items-center justify-between gap-3 rounded-[12px] border px-3 text-left transition ${
          open || selectedResume
            ? 'border-cyan-400/40 bg-cyan-500/10'
            : 'border-[var(--border-subtle)] bg-[var(--bg-input)] hover:border-[var(--border)]'
        }`}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`material-symbols-rounded text-[18px] ${selectedResume ? 'text-cyan-700 dark:text-cyan-300' : 'text-[var(--text-muted)]'}`}>description</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
              {selectedResumeName || selectedResume?.version_name || (resumes.length > 0 ? 'Choose resume' : 'No saved resumes')}
            </span>
            <span className="block truncate text-[10px] text-[var(--text-muted)]">
              {selectedResume ? `${timeAgo(selectedResume.created_at)} · ${extractResumeSkills(selectedResume.content).length} skills` : `${resumes.length} available`}
            </span>
          </span>
        </span>
        <span className={`material-symbols-rounded text-[18px] text-[var(--text-muted)] transition ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
        >
          <div className="border-b border-[var(--border-subtle)] p-3">
            <div className="relative">
              <span className="material-symbols-rounded pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-[var(--text-muted)]">search</span>
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search resume versions..."
                className="h-10 w-full rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-input)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-cyan-500/20"
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
                      ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
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
                      ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
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
	                  className={`mb-1 flex w-full items-start gap-3 rounded-[12px] border p-3 text-left transition ${
	                    active
	                      ? 'border-cyan-400/40 bg-cyan-500/10'
	                      : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--card-bg)]'
	                  }`}
	                >
	                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${active ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300' : 'bg-[var(--card-bg)] text-[var(--text-muted)]'}`} aria-hidden="true">
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
	                          <span key={`${skill}:${index}`} className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">{skill}</span>
	                        ))}
	                      </span>
	                    )}
	                  </span>
	                  <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${active ? 'border-cyan-400/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)]'}`}>
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
}: {
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
    <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
      <form
        onSubmit={event => {
          event.preventDefault();
          onSearch();
        }}
        className="grid gap-3 lg:grid-cols-[1.2fr_1.2fr_0.8fr_auto] lg:items-end"
      >
        <ResumeSourcePicker
          resumes={resumes}
          selectedResumeId={selectedResumeId}
          selectedResumeName={selectedResumeName}
          onResumeSelect={onResumeSelect}
        />
        <label>
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Target role</span>
          <input
            id="job-search-target-role"
            aria-label="Target role"
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Software engineer, data analyst, product manager..."
            className="h-11 w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-cyan-500/25"
          />
        </label>
        <label>
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Location</span>
          <input
            value={location}
            onChange={event => onLocationChange(event.target.value)}
            placeholder="Remote, New York, Austin..."
            className="h-11 w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-cyan-500/25"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-5 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 disabled:opacity-45"
        >
          <span className={`material-symbols-rounded text-[18px] ${loading ? 'animate-spin' : ''}`}>{loading ? 'progress_activity' : 'radar'}</span>
          {loading ? 'Scanning' : 'Search'}
        </button>
      </form>

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        <CommandMetric icon="description" label="Resume" value={selectedResumeName || (userSkillsCount > 0 ? `${userSkillsCount} skills loaded` : 'Needs resume')} tone={selectedResumeId || userSkillsCount > 0 ? 'emerald' : 'muted'} />
        <CommandMetric icon="hub" label="Sources" value={`${sourceHealth.direct} direct / ${sourceHealth.aggregator} API`} tone={sourceHealth.direct > 0 ? 'cyan' : 'muted'} />
        <CommandMetric icon="fact_check" label="Packets" value={packetCount > 0 ? `${packetCount} active` : 'None prepared'} tone={packetCount > 0 ? 'emerald' : 'muted'} />
        <CommandMetric icon="visibility" label="Watchlist" value="Review first" tone="cyan" />
      </div>
    </section>
  );
}

function JobSearchHeader({
  resultCount,
  packetCount,
  strongCount,
}: {
  resultCount: number;
  packetCount: number;
  strongCount: number;
}) {
  return (
    <SuiteToolHeader
      tool="job-search"
      actions={
        <div className="grid w-full min-w-0 grid-cols-3 gap-2 sm:w-auto sm:flex sm:flex-wrap sm:justify-end">
          <HeaderStat label="Ranked" value={resultCount.toLocaleString()} />
          <HeaderStat label="Fits" value={strongCount.toLocaleString()} />
          <HeaderStat label="Packets" value={packetCount.toLocaleString()} />
        </div>
      }
    />
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2 py-2 sm:min-w-[92px] sm:px-3">
      <p className="truncate text-[8px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] sm:text-[9px] sm:tracking-[0.12em]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function CommandMetric({ icon, label, value, tone }: { icon: string; label: string; value: string; tone: 'cyan' | 'emerald' | 'muted' }) {
  const toneClass = tone === 'emerald'
    ? 'text-emerald-700 bg-emerald-500/10 border-emerald-400/25 dark:text-emerald-300'
    : tone === 'cyan'
      ? 'text-cyan-700 bg-cyan-500/10 border-cyan-400/25 dark:text-cyan-300'
      : 'text-[var(--text-secondary)] bg-[var(--card-bg)] border-[var(--border-subtle)]';
  return (
    <div className={`flex min-h-[58px] items-center gap-3 rounded-[14px] border px-3 py-2 ${toneClass}`}>
      <span className="material-symbols-rounded text-[20px]">{icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] opacity-70">{label}</p>
        <p className="mt-0.5 truncate text-xs font-semibold">{value}</p>
      </div>
    </div>
  );
}

function SourceHealthPanel({ jobs }: { jobs: OpportunityJob[] }) {
  const direct = jobs.filter(job => job.sourceMeta.sourceType === 'direct_ats').length;
  const aggregator = jobs.filter(job => job.sourceMeta.sourceType === 'aggregator').length;
  const remote = jobs.filter(job => job.sourceMeta.sourceType === 'remote_board').length;
  const total = Math.max(1, jobs.length);
  return (
    <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Source health</p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">Hybrid supply</p>
        </div>
        <span className="material-symbols-rounded text-cyan-600 dark:text-cyan-300">hub</span>
      </div>
      <div className="mt-4 space-y-3">
        <SourceBar label="Direct ATS" value={direct} total={total} />
        <SourceBar label="Aggregator" value={aggregator} total={total} />
        <SourceBar label="Remote boards" value={remote} total={total} />
      </div>
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
        <div className="h-full rounded-full bg-cyan-500/70" style={{ width: `${pct}%` }} />
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
  onPrefsClose: () => void;
}) {
  const profileScore = [hasPrefs, userSkills.length > 0, matchThreshold >= 60, !hideGhosts].filter(Boolean).length;
  const directCount = jobs.filter(job => job.sourceMeta.sourceType === 'direct_ats').length;
  return (
    <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-sm">
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:w-[560px]">
          <SignalTile icon="fact_check" label="Profile" value={`${profileScore}/4 ready`} done={profileScore >= 3} />
          <SignalTile icon="description" label="Resume" value={userSkills.length > 0 ? `${userSkills.length} skills` : 'Needed'} done={userSkills.length > 0} />
          <SignalTile icon="hub" label="Direct" value={`${directCount} roles`} done={directCount > 0} />
          <SignalTile icon="visibility" label="Mode" value="Review first" done />
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {FILTERS.map(filter => (
            <button
              key={filter.value}
              onClick={() => onFilterChange(filter.value)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] border px-3 py-2 text-xs font-medium transition ${
                activeFilter === filter.value
                  ? 'border-cyan-400/45 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
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
            className="h-10 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-xs font-semibold text-[var(--text-secondary)] outline-none"
            aria-label="Sort opportunities"
          >
            <option value="relevance">Relevance</option>
            <option value="salary">Salary</option>
            <option value="date">Date</option>
          </select>
          <button
            onClick={onPrefsToggle}
            className={`inline-flex h-10 items-center gap-1.5 rounded-[11px] border px-3 text-xs font-semibold transition ${
              showPrefs
                ? 'border-cyan-400/45 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
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
              onClose={onPrefsClose}
            />
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
              <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Search profile</p>
                    <h2 className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{profileScore}/4 ready</h2>
                  </div>
                  <span className="material-symbols-rounded text-cyan-600 dark:text-cyan-300">checklist</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <ChecklistRow label="Preferences saved" done={hasPrefs} />
                  <ChecklistRow label="Resume skills loaded" done={userSkills.length > 0} />
                  <ChecklistRow label="Quality threshold set" done={matchThreshold >= 60} />
                  <ChecklistRow label="Ghost filter available" done />
                </div>
              </section>

              <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Saved searches</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SAVED_SEARCHES.map(search => (
                    <button
                      key={search}
                      onClick={() => onSavedSearch(search)}
                      className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-cyan-400/35 hover:text-cyan-700 dark:hover:text-cyan-300"
                    >
                      {search}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr]">
                  <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Min fit</span>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={40}
                        max={95}
                        step={5}
                        value={matchThreshold}
                        onChange={event => onThresholdChange(Number(event.target.value))}
                        className="w-full accent-cyan-500"
                      />
                      <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">{matchThreshold}%</span>
                    </div>
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Hide high ghost risk</span>
                    <input
                      type="checkbox"
                      checked={hideGhosts}
                      onChange={event => onHideGhostsChange(event.target.checked)}
                      className="accent-cyan-500"
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

function SignalTile({ icon, label, value, done }: { icon: string; label: string; value: string; done: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-[12px] border px-3 py-2 ${
      done
        ? 'border-cyan-400/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
        : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)]'
    }`}>
      <span className="material-symbols-rounded text-[18px]">{icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] opacity-70">{label}</p>
        <p className="truncate text-xs font-semibold">{value}</p>
      </div>
    </div>
  );
}

function ChecklistRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`material-symbols-rounded text-[16px] ${done ? 'text-emerald-600 dark:text-emerald-300' : 'text-[var(--text-muted)]'}`}>
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
}: {
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
      <section className="flex min-h-[560px] flex-col items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center">
        <SonaThinkingTile
          variant="jobs"
          icon="radar"
          title="Scanning sources and ranking roles"
          description="Sona is checking breadth, freshness, risk, and fit signals."
          activeStage="scanning"
          stages={['Sources', 'Freshness', 'Fit score', 'Risk']}
          className="w-full max-w-xl text-left"
        />
      </section>
    );
  }

  if (!hasSearched) {
    return (
      <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
        <div className="mx-auto max-w-2xl py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] border border-cyan-400/20 bg-cyan-500/10">
            <span className="material-symbols-rounded text-2xl text-cyan-600 dark:text-cyan-300">radar</span>
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight text-[var(--text-primary)]">Start with a role, then let Sona rank the market.</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Search across broad APIs and direct ATS boards. Fit scoring improves when your resume and preferences are loaded.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {SAVED_SEARCHES.map(search => (
              <button
                key={search}
                onClick={() => onEmptySearch(search)}
                className="rounded-[11px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-cyan-400/35 hover:text-cyan-700 dark:hover:text-cyan-300"
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
      <section className="flex min-h-[420px] items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6">
        <div className="w-full max-w-xl">
          <JobDiscoveryRecoveryPanel recovery={recovery} onAction={onRecoveryAction} />
        </div>
      </section>
    );
  }

  if (jobs.length === 0) {
    return (
      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center">
        <span className="material-symbols-rounded text-4xl text-[var(--text-muted)]">search_off</span>
        <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">No roles matched these filters.</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">Lower the fit threshold or broaden the search location.</p>
        <button
          type="button"
          onClick={onEditSearch}
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-deep)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35"
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
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Opportunity feed</p>
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
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 lg:hidden"
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
  packet,
  onSelect,
  onDetails,
  onPrepare,
}: {
  job: OpportunityJob;
  rank?: number;
  selected: boolean;
  packet?: ApplicationPacket;
  onSelect: () => void;
  onDetails: () => void;
  onPrepare: () => void;
}) {
  const score = job.fitScore?.overall ?? job.matchScore;
  const color = score === null ? '#64748b' : scoreColor(score);
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
      className={`rounded-[16px] border bg-[var(--bg-surface)] p-4 transition ${
        selected ? 'border-cyan-400/45 shadow-[0_0_0_3px_rgba(34,211,238,0.08)]' : 'border-[var(--border-subtle)] hover:border-cyan-400/30'
      }`}
    >
      <button
        onClick={onSelect}
        aria-pressed={selected}
        aria-controls="opportunity-intelligence-panel"
        className="block w-full text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {rank && (
                <span className="inline-flex min-h-6 items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2 text-[10px] font-semibold tabular-nums text-[var(--text-secondary)] lg:hidden">
                  Pick {rank}
                </span>
              )}
              <SourceBadge meta={job.sourceMeta} />
              <FreshnessBadge job={job} />
              <PacketStatusPill packet={packet} />
              <RecommendationStatusPill status={job.ledgerStatus} />
            </div>
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-[var(--text-primary)]">{job.title}</h3>
            <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">{job.company}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="rounded-[12px] border px-3 py-2" style={{ borderColor: `${color}33`, background: `${color}10` }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color }}>{scoreLabel(score)}</p>
              <p className="mt-0.5 text-xl font-semibold" style={{ color }}>{score === null ? '--' : `${score}%`}</p>
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <MetaChip icon="location_on" text={job.location} />
          <MetaChip icon="payments" text={formatSalary(job.salary.min, job.salary.max)} />
          <MetaChip icon="schedule" text={timeAgo(job.postedDate)} />
        </div>
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{job.recommendationReason}</p>
        {(job.fitReasons || []).length > 0 && (
          <div className="mt-3 flex min-w-0 items-start gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2">
            <span className="material-symbols-rounded mt-0.5 text-[14px] text-blue-600 dark:text-blue-300" aria-hidden="true">fact_check</span>
            <p className="line-clamp-2 min-w-0 text-[11px] leading-5 text-[var(--text-secondary)]">{job.fitReasons?.[0]}</p>
          </div>
        )}
        {job.skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.skills.slice(0, 6).map((skill, index) => (
              <span key={`${skill}:${index}`} className="rounded-[8px] bg-[var(--card-bg)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)]">{skill}</span>
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
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${
      direct
        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
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
    ? 'border-rose-400/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
    : risk === 'medium'
      ? 'border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
      : 'border-cyan-400/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${className}`}>
      <span className="material-symbols-rounded text-[12px]">{job.freshness.isFresh ? 'bolt' : risk === 'high' ? 'warning' : 'schedule'}</span>
      {job.freshness.isFresh ? 'Fresh' : risk === 'high' ? 'Ghost risk' : timeAgo(job.postedDate)}
    </span>
  );
}

function OpportunityIntelligencePanel({
  job,
  packet,
  userSkills,
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
      <aside id="opportunity-intelligence-panel" ref={panelRef} className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
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
    <aside id="opportunity-intelligence-panel" ref={panelRef} className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-hidden">
      <div className="border-b border-[var(--border-subtle)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <SourceBadge meta={job.sourceMeta} />
              <FreshnessBadge job={job} />
            </div>
            <h2 className="text-lg font-semibold leading-tight text-[var(--text-primary)]">{job.title}</h2>
            <p className="mt-1 text-sm font-medium text-cyan-700 dark:text-cyan-300">{job.company}</p>
          </div>
          <button aria-label="Close role details" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] lg:h-8 lg:w-8">
            <span className="material-symbols-rounded text-base" aria-hidden="true">close</span>
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <PanelMetric label="Fit" value={job.fitScore ? `${job.fitScore.overall}%` : '--'} />
          <PanelMetric label="Salary" value={formatSalary(job.salary.min, job.salary.max)} />
          <PanelMetric label="Posted" value={timeAgo(job.postedDate)} />
        </div>
        <div className="mt-4 grid grid-cols-4 gap-1 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1">
          {(['fit', 'jd', 'packet', 'company'] as const).map(item => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`min-h-11 rounded-[9px] px-2 py-2 text-xs font-semibold capitalize transition ${
                tab === item ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {item === 'jd' ? 'JD' : item}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[calc(100dvh-270px)] overflow-y-auto p-5">
        {tab === 'fit' && (
          <div className="space-y-4">
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
                        ? 'border-blue-500/45 bg-blue-500/10 text-blue-700 dark:text-blue-300'
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
                empty="Add a resume and preferences to get stronger fit evidence."
              />
              <EvidenceNoteList
                title="Source confidence"
                icon="travel_explore"
                tone="neutral"
                items={job.sourceNotes || []}
                empty="Source metadata was not available."
              />
              <EvidenceNoteList
                title="Checks before applying"
                icon="rule"
                tone="warning"
                items={(job.riskNotes || []).length ? job.riskNotes || [] : job.freshness.reasons}
                empty="No major risk notes detected. Still verify the posting before applying."
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
              className="flex w-full items-center justify-center gap-2 rounded-[13px] border border-cyan-500/20 bg-cyan-500/10 px-4 py-2.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-500/15 dark:text-cyan-300"
            >
              <span className="material-symbols-rounded text-base">troubleshoot</span>
              Deep Analyze in Market Oracle
            </button>
            {job.fitScore ? (
              <div className="space-y-3">
                <FitRow label="Skills" value={job.fitScore.skills} />
                <FitRow label="Seniority" value={job.fitScore.titleSeniority} />
                <FitRow label="Domain" value={job.fitScore.domain} />
                <FitRow label="Location" value={job.fitScore.location} />
                <FitRow label="Freshness" value={job.fitScore.freshness} />
                <FitRow label="Your signals" value={job.fitScore.preference} />
                <FitRow label="Risk control" value={job.fitScore.risk} />
              </div>
            ) : (
              <SetupNudge icon="description" title="Add resume to unlock fit scoring" body="Upload or save a resume version so Sona can rank roles by actual evidence instead of broad search terms." />
            )}
            {missingSkills.length > 0 && (
              <div className="rounded-[14px] border border-amber-400/20 bg-amber-500/5 p-4">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Keyword gaps</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {missingSkills.map((skill, index) => (
                    <span key={`${skill}:${index}`} className="rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">{skill}</span>
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
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Role description</p>
              <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">{job.description || 'No description was provided by the source.'}</p>
            </div>
          </div>
        )}

        {tab === 'packet' && (
          <ApplicationPacketBuilder
            job={job}
            packet={packet}
            onPrepare={() => onPrepare(job)}
            onMarkApplied={() => onMarkApplied(job)}
            onSaveLater={() => onSaveLater(job)}
            onSkip={() => onSkip(job)}
          />
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
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">{value}</p>
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
    ? 'text-blue-600 dark:text-blue-300'
    : tone === 'warning'
      ? 'text-amber-700 dark:text-amber-300'
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

function FitRow({ label, value }: { label: string; value: number }) {
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
        <span className="material-symbols-rounded mt-0.5 text-lg text-cyan-600 dark:text-cyan-300">{icon}</span>
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
  const prefersReducedMotion = useReducedMotion();

  if (current.status === 'preparing') {
    return (
      <div className="relative overflow-hidden rounded-[16px] p-[1px]" role="status" aria-live="polite">
        <motion.div
          className="absolute left-1/2 top-1/2 h-[220%] w-[220%] -translate-x-1/2 -translate-y-1/2"
          style={{ background: 'conic-gradient(from 0deg, transparent 0deg, transparent 250deg, rgba(34,211,238,0.08) 286deg, rgba(34,211,238,0.78) 322deg, transparent 360deg)' }}
          animate={prefersReducedMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
        <div className="relative rounded-[15px] border border-cyan-400/25 bg-[var(--bg-surface)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
              <span className="material-symbols-rounded">auto_fix_high</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Sona is preparing this packet</p>
              <p className="text-xs text-[var(--text-secondary)]">{PACKET_STAGES[current.stageIndex] || 'Working'}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {PACKET_STAGES.map((stage, index) => {
              const done = index < current.stageIndex;
              const active = index === current.stageIndex;
              return (
                <div key={stage} className="flex items-center gap-3 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2">
                  <span className={`material-symbols-rounded text-[16px] ${done ? 'text-emerald-600 dark:text-emerald-300' : active ? 'text-cyan-600 dark:text-cyan-300' : 'text-[var(--text-muted)]'}`}>
                    {done ? 'check_circle' : active ? 'progress_activity' : 'radio_button_unchecked'}
                  </span>
                  <span className={`text-xs font-medium ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{stage}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (current.status === 'ready' || current.status === 'applied') {
    const markedApplied = current.status === 'applied';
    return (
      <div className="space-y-4">
        <div className="rounded-[14px] border border-emerald-400/25 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-rounded text-emerald-600 dark:text-emerald-300">verified</span>
            <div>
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
          <PanelMetric label="Gaps" value={`${current.keywordGaps?.length || 0}`} />
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
              <span key={`${gap}:${index}`} className="rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">{gap}</span>
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
          <div className="grid grid-cols-3 gap-2">
            <button onClick={onMarkApplied} disabled={markedApplied} className="min-h-11 min-w-0 rounded-[11px] border border-emerald-400/25 bg-emerald-500/10 px-2 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50 dark:text-emerald-300">{markedApplied ? 'Applied' : 'I submitted it'}</button>
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
        ? '/suite/upgrade?plan=pro'
        : recovery.action === 'open_applications'
          ? '/suite/applications'
          : null;
    return (
      <div className={`rounded-[14px] border p-4 ${needsAttention ? 'border-amber-400/25 bg-amber-500/5' : 'border-rose-400/25 bg-rose-500/5'}`} role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <span className={`material-symbols-rounded mt-0.5 text-[20px] ${needsAttention ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'}`} aria-hidden="true">
            {needsAttention ? 'pending_actions' : 'sync_problem'}
          </span>
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${needsAttention ? 'text-amber-800 dark:text-amber-200' : 'text-rose-700 dark:text-rose-300'}`}>{recovery.title}</p>
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
          body={`${job.nextAction}. Check the fit evidence and original posting before asking Sona to prepare materials.`}
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
      <SetupNudge icon="auto_fix_high" title="Prepare without leaving Job Search" body="Sona prepares a resume draft, cover letter, ATS check and tracker draft. It does not submit the application." />
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

export default function JobSearchPage() {
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
  const [showPrefs, setShowPrefs] = useState(false);
  const [storageHydratedUserId, setStorageHydratedUserId] = useState('');
  const alertControlsRequested = searchParams.get('controls') === 'alerts';
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
  const searchRequestIdRef = useRef(0);
  const packetRequestGenerationRef = useRef(0);
  const pendingSearchAfterAuthRef = useRef<{ query: string; location: string; salaryMin: number } | null>(null);

  useEffect(() => {
    searchRequestIdRef.current += 1;
    packetRequestGenerationRef.current += 1;
    setJobs([]);
    setSelectedJobKey(null);
    setSearchImpressionId(null);
    setPackets({});
    setUserSkills([]);
    setResumes([]);
    setSelectedResumeId(null);
    setSelectedResumeName('');
    setQuery('');
    setLocation('');
    setSalaryMin(0);
    setMatchThreshold(50);
    setHasPrefs(false);
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
        if (typeof parsed?.query === 'string') setQuery(parsed.query.slice(0, 160));
        if (typeof parsed?.location === 'string') setLocation(parsed.location.slice(0, 160));
        if (Number.isFinite(parsed?.threshold)) setMatchThreshold(Math.max(0, Math.min(100, Number(parsed.threshold))));
        if (Number.isFinite(parsed?.salaryMin)) setSalaryMin(Math.max(0, Math.min(10_000_000, Number(parsed.salaryMin))));
      }
      const savedSkills = localStorage.getItem(scopedJobStorageKey(RESUME_STORAGE_KEY, jobCountUserId));
      if (savedSkills) {
        const parsedSkills = JSON.parse(savedSkills);
        if (Array.isArray(parsedSkills)) setUserSkills(Array.from(new Set(parsedSkills.map(String))).slice(0, 100));
      }
      const savedResumeId = localStorage.getItem(scopedJobStorageKey(RESUME_ID_STORAGE_KEY, jobCountUserId));
      if (savedResumeId) setSelectedResumeId(savedResumeId);
      const savedPackets = sessionStorage.getItem(scopedJobStorageKey(PACKET_STORAGE_KEY, jobCountUserId));
      if (savedPackets) setPackets(readStoredPackets(JSON.parse(savedPackets)));
    } catch {
      // Ignore corrupted local session data.
    } finally {
      if (jobCountUserId) setStorageHydratedUserId(jobCountUserId);
    }
  }, [jobCountUserId]);

  useEffect(() => {
    if (!user) return;
    const requestedUserId = jobCountUserId;
    getResumeVersions().then(result => {
      if (activeJobUserIdRef.current !== requestedUserId) return;
      if (!result.success || !result.data) return;
      setResumes(result.data);
      const savedId = localStorage.getItem(scopedJobStorageKey(RESUME_ID_STORAGE_KEY, jobCountUserId));
      const selected = result.data.find(resume => resume.id === savedId) || result.data[0];
      if (selected) {
        setSelectedResumeId(selected.id);
        setSelectedResumeName(selected.version_name);
        const skills = extractResumeSkills(selected.content);
        if (skills.length > 0) {
          setUserSkills(skills);
          localStorage.setItem(scopedJobStorageKey(RESUME_STORAGE_KEY, jobCountUserId), JSON.stringify(skills));
        }
        mergeApplicationKitContext(resumeVersionToApplicationKitContext(selected));
      }
    }).catch(() => {});
  }, [jobCountUserId, user]);

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
      if (!data) return;
      if (data.target_roles?.[0]) setQuery(data.target_roles[0]);
      if (data.location_preference) setLocation(data.location_preference);
      if (!selectedResumeId && Array.isArray(data.skills) && data.skills.length > 0) {
        setUserSkills(data.skills);
        localStorage.setItem(scopedJobStorageKey(RESUME_STORAGE_KEY, jobCountUserId), JSON.stringify(data.skills));
      }
    }).catch(() => {});
  }, [jobCountUserId, selectedResumeId, user, query]);

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
          if (!query && prefs?.targetRoles?.[0]) setQuery(prefs.targetRoles[0]);
          if (!location) {
            if (prefs?.preferredCities?.[0]) setLocation(prefs.preferredCities[0]);
            else if (prefs?.remotePref === 'remote') setLocation('Remote');
          }
          if (prefs?.salaryMin) setSalaryMin(prefs.salaryMin);
        }
      })
      .catch(() => {});
  }, [jobCountUserId, location, query, user]);

  const selectedResume = useMemo(() => resumes.find(resume => resume.id === selectedResumeId) || null, [resumes, selectedResumeId]);

  const sourceHealth = useMemo(() => ({
    direct: jobs.filter(job => job.sourceMeta.sourceType === 'direct_ats').length,
    aggregator: jobs.filter(job => job.sourceMeta.sourceType === 'aggregator').length,
    remote: jobs.filter(job => job.sourceMeta.sourceType === 'remote_board').length,
  }), [jobs]);

  const packetCount = useMemo(() => Object.values(packets).filter(packet => packet.status !== 'idle').length, [packets]);
  const strongCount = useMemo(() => jobs.filter(job => (job.fitScore?.overall || job.matchScore || 0) >= 75).length, [jobs]);

  const filteredJobs = useMemo(() => {
    let next = jobs.filter(job => {
      if (hideGhosts && job.freshness.ghostRisk === 'high') return false;
      if (job.fitScore && job.fitScore.overall < matchThreshold) return false;
      if (activeFilter === 'strong' && (!job.fitScore || job.fitScore.overall < 75)) return false;
      if (activeFilter === 'fresh' && !job.freshness.isFresh) return false;
      if (activeFilter === 'direct' && job.sourceMeta.sourceType !== 'direct_ats') return false;
      if (activeFilter === 'remote' && !job.location.toLowerCase().includes('remote')) return false;
      const packet = packets[getJobResultIdentity(job)];
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
  }, [activeFilter, hideGhosts, jobs, matchThreshold, packets, sortBy]);

  const selectedJob = useMemo(
    () => filteredJobs.find(job => getJobResultIdentity(job) === selectedJobKey) || null,
    [filteredJobs, selectedJobKey],
  );

  const selectJob = useCallback((job: OpportunityJob, options: { scrollToDetails?: boolean } = {}) => {
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
    setSelectedResumeId(id || null);
    if (id !== selectedResumeId) {
      searchRequestIdRef.current += 1;
      setLoading(false);
      setJobs([]);
      setSelectedJobKey(null);
      setSearchImpressionId(null);
      setHasSearched(false);
    }
    if (!resume) {
      setSelectedResumeName('');
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
    if (!search) return;
    const searchLocation = (overrideLocation ?? location).trim();
    const searchSalaryMin = overrideSalaryMin ?? salaryMin;
    const salaryMinDollars = searchSalaryMin > 0 ? (searchSalaryMin < 1000 ? searchSalaryMin * 1000 : searchSalaryMin) : 0;
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
      if (requestId !== searchRequestIdRef.current) return;
      if (!res.ok || !data.success) {
        setSearchRecovery(classifyJobDiscoveryResponse(data, 'search', res.status));
        return;
      }
      const normalized = (data.jobs || []).map(normalizeJob);
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
      if (requestId !== searchRequestIdRef.current) return;
      setSearchRecovery(classifyJobDiscoveryFailure(error, 'search'));
    } finally {
      if (requestId === searchRequestIdRef.current) setLoading(false);
    }
  }, [jobCountUserId, location, matchThreshold, query, salaryMin, selectJob, selectedResumeId, sortBy]);

  const editSearch = useCallback(() => {
    const input = document.getElementById('job-search-target-role') as HTMLInputElement | null;
    input?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    input?.focus({ preventScroll: true });
  }, []);

  const handleSearchRecoveryAction = useCallback(() => {
    if (!searchRecovery) return;
    if (searchRecovery.action === 'create_account' || searchRecovery.action === 'sign_in') {
      pendingSearchAfterAuthRef.current = { query, location, salaryMin };
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
  }, [fetchJobs, location, query, salaryMin, searchRecovery, setAuthModal]);

  useEffect(() => {
    if (!jobCountUserId || !pendingSearchAfterAuthRef.current) return;
    const pending = pendingSearchAfterAuthRef.current;
    pendingSearchAfterAuthRef.current = null;
    void fetchJobs(1, pending.query, pending.location, pending.salaryMin);
  }, [fetchJobs, jobCountUserId, jobSearchAccessToken]);

  const handlePreferencesLoaded = useCallback((prefs: JobSearchPreferences | null | undefined) => {
    const applied = applyPreferencesToSearch(prefs);
    if (applied?.query) {
      showToast('Preferences applied. Searching matching roles...', 'tune');
      setShowPrefs(false);
      setTimeout(() => fetchJobs(1, applied.query, applied.location, applied.salaryMin), 0);
    } else {
      setHasPrefs(!!prefs);
      showToast('Preferences saved. Add a target role to search jobs.', 'info');
    }
  }, [applyPreferencesToSearch, fetchJobs]);

  const runSavedSearch = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
    setTimeout(() => fetchJobs(1, nextQuery), 0);
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
    const requestIsCurrent = () => Boolean(requestUserId)
      && activeJobUserIdRef.current === requestUserId
      && packetRequestGenerationRef.current === requestGeneration;
    if (!requestIsCurrent()) {
      setAuthModal('login');
      return;
    }
    const packetKey = getJobResultIdentity(job);
    if (packets[packetKey]?.status === 'preparing') return;
    if (!job.preparationEligible) {
      selectJob(job, { scrollToDetails: true });
      showToast(job.nextAction || 'Review fit evidence before preparing a packet.', 'fact_check');
      return;
    }
    selectJob(job);
    updatePacket(packetKey, { status: 'preparing', stageIndex: 0, error: undefined });
    await recordLedgerStatus(job, 'queued', ['packet_requested']);
    if (!requestIsCurrent()) return;

    let stage = 0;
    const interval = window.setInterval(() => {
      if (!requestIsCurrent()) {
        window.clearInterval(interval);
        return;
      }
      stage = Math.min(stage + 1, PACKET_STAGES.length - 2);
      updatePacket(packetKey, { status: 'preparing', stageIndex: stage });
    }, 900);

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
        window.clearInterval(interval);
        return;
      }
      const atsScore = data.atsResult?.overallScore;
      const responseReady = data.packetStatus === 'ready_for_review'
        && typeof data.applicationId === 'string' && Boolean(data.applicationId)
        && typeof data.morphedVersionId === 'string' && Boolean(data.morphedVersionId)
        && typeof data.coverLetter === 'string' && Boolean(data.coverLetter.trim())
        && Number.isFinite(atsScore);
      if (!res.ok) {
        window.clearInterval(interval);
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
        window.clearInterval(interval);
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
      window.clearInterval(interval);
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
      showToast(`Packet ready for ${job.company}`, 'verified');
    } catch (error) {
      window.clearInterval(interval);
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
  }, [jobCountUserId, packets, recordLedgerStatus, searchImpressionId, selectJob, selectedResumeId, setAuthModal, updatePacket]);

  const markApplied = useCallback(async (job: OpportunityJob) => {
    const requestUserId = jobCountUserId;
    const packetKey = getJobResultIdentity(job);
    const packet = packets[packetKey];
    if (!packet?.applicationId) {
      showToast('Prepare a tracker draft before marking this applied.', 'cancel');
      return;
    }
    const confirmed = window.confirm('Mark this as applied only after you submitted it on the job site. TalentConsulting.io has not submitted it for you.');
    if (!confirmed) return;

    const result = await updateApplicationStatus(packet.applicationId, 'applied', { appliedAt: new Date() });
    if (!requestUserId || activeJobUserIdRef.current !== requestUserId) return;
    if (!result.success) {
      showToast(result.error || 'Could not mark this applied', 'cancel');
      return;
    }
    updatePacket(packetKey, { status: 'applied' });
    const learned = await recordLedgerStatus(job, 'applied', ['user_marked_applied']);
    if (activeJobUserIdRef.current !== requestUserId) return;
    showToast(
      learned ? `Marked applied after your manual submission to ${job.company}` : 'Application updated. Recommendation learning will retry later.',
      learned ? 'done_all' : 'sync_problem',
    );
  }, [jobCountUserId, packets, recordLedgerStatus, updatePacket]);

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
    showToast(positive ? 'Sona will look for more roles like this' : 'Sona will use this signal in future rankings', positive ? 'bookmark' : 'tune');
    return true;
  }, [jobCountUserId, recordLedgerStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
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
      if ((event.key === 'p' || event.key === 'P') && selectedJob) prepareApplication(selectedJob);
      if ((event.key === 's' || event.key === 'S') && selectedJob) saveLater(selectedJob);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filteredJobs, prepareApplication, saveLater, selectJob, selectedJob, selectedJobKey]);

  return (
    <>
      <SuiteToolShell variant="workbench">
        <JobSearchHeader
          resultCount={jobs.length}
          packetCount={packetCount}
          strongCount={strongCount}
        />

            <JobSearchCommandStrip
              query={query}
              location={location}
              loading={loading}
              sourceHealth={sourceHealth}
              userSkillsCount={userSkills.length}
              packetCount={packetCount}
              resumes={resumes}
              selectedResumeId={selectedResumeId}
              selectedResumeName={selectedResumeName}
              onQueryChange={setQuery}
              onLocationChange={setLocation}
              onSearch={() => fetchJobs(1)}
              onResumeSelect={selectResume}
            />

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
              onPrefsLoaded={handlePreferencesLoaded}
              onPrefsClose={() => setShowPrefs(false)}
            />

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
              <OpportunityFeed
                jobs={filteredJobs}
                selectedId={selectedJobKey}
                loading={loading}
                hasSearched={hasSearched}
                recovery={searchRecovery}
                packets={packets}
                onSelect={selectJob}
                onDetails={job => selectJob(job, { scrollToDetails: true })}
                onPrepare={prepareApplication}
                onEmptySearch={runSavedSearch}
                onRecoveryAction={handleSearchRecoveryAction}
                onEditSearch={editSearch}
              />

              <OpportunityIntelligencePanel
                job={selectedJob}
                packet={selectedJob ? packets[getJobResultIdentity(selectedJob)] : undefined}
                userSkills={userSkills}
                onClose={() => setSelectedJobKey(null)}
                onPrepare={prepareApplication}
                onMarkApplied={markApplied}
                onSaveLater={saveLater}
                onSkip={skipJob}
                onFeedback={tuneRecommendation}
                panelRef={detailPanelRef}
              />
            </div>
      </SuiteToolShell>
      {renderAuthModal()}
    </>
  );
}
