'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { showToast } from '@/components/Toast';
import AssistantThinkingTile from '@/components/assistant/AssistantThinkingTile';
import { AssistantMark } from '@/components/assistant';
import { SuiteToolHeader, SuiteToolShell, SuiteUnmeasured } from '@/components/suite/SuiteToolChrome';
import { useUserTier } from '@/hooks/use-user-tier';
import { authFetch } from '@/lib/auth-fetch';
import { openSona } from '@/lib/assistant/execution-context';
import { getPlanIdentity } from '@/lib/plan-identity';
import MemoryPanel from './MemoryPanel';
import {
  getAllStudyProgress,
  getSkillVerifications,
  markCourseComplete,
  markCourseIncomplete,
  markDayComplete,
  saveStudyProgress,
  unmarkDayComplete,
  type SkillVerification,
  type StudyProgress,
} from '@/lib/database-suite';

type SkillCategory = 'technical' | 'soft' | 'domain';
type BridgeView = 'command' | 'plans' | 'proofs' | 'memory' | 'settings';
type ChallengeType = 'quick_check' | 'applied_challenge';
type SkillStatusFilter = 'all' | 'due' | 'ready' | 'in_progress' | 'not_started' | 'verified';
type SkillCategoryFilter = 'all' | SkillCategory;
type SkillSortMode = 'next_action' | 'readiness' | 'skill';

interface SkillGap {
  skill: string;
  confidence: 'ai-added' | 'weak' | 'strong';
  category: SkillCategory;
  priority?: number;
  reason?: string;
}

interface SkillRecord {
  skill: string;
  category: SkillCategory;
  gap?: SkillGap;
  progress?: StudyProgress;
  proofs: SkillVerification[];
  completedDays: number[];
  totalDays: number;
  progressPct: number;
  schedule: any[];
  verified: boolean;
  readyToVerify: boolean;
  reviewDue: boolean;
  applicationLinked: boolean;
  highestProofScore: number;
  /**
   * Highest graded-proof score on record, 0-100 — or null when nothing has been
   * graded. Null renders as "Not proven yet", never as 0%.
   */
  readinessScore: number | null;
  sourceLabel: string;
  nextAction: string;
  nextActionDetail: string;
}

interface ProofDraft {
  challengeType: ChallengeType;
  prompt: string;
  response: string;
  loading?: 'generate' | 'grade' | 'vault';
  grade?: {
    score: number;
    verdict: string;
    summary?: string;
    strengths?: string[];
    gaps?: string[];
    recommendations?: string[];
    rubric?: { label: string; score: number; note: string }[];
  };
}

/*
 * There is deliberately no SAMPLE_GAPS constant here.
 *
 * Six invented gaps (Kubernetes, CI/CD, GraphQL, AWS, Leadership, System
 * Design) used to be seeded into every account with no `tc_skill_gaps` entry —
 * i.e. every new user — carrying invented reasons and labelled "Resume or JD
 * gap". A nurse was told she had a Kubernetes gap. Gaps come from a resume
 * morph (app/suite/resume/page.tsx:1876 and :3058) and nowhere else.
 */

const SKILL_COMPLEXITY: Record<string, number> = {
  Docker: 2, Git: 2, SQL: 2, Bash: 2, Linux: 2, 'REST API': 2,
  React: 4, TypeScript: 4, 'Next.js': 4, 'Node.js': 4, Python: 4,
  GraphQL: 4, 'CI/CD': 4, Kubernetes: 4, PostgreSQL: 4, MongoDB: 4,
  AWS: 5, Azure: 5, GCP: 5, 'Machine Learning': 5, 'System Design': 5,
  DevOps: 5, Cybersecurity: 5, Leadership: 3, Agile: 3, Communication: 3,
};

const VIEWS: { id: BridgeView; label: string; icon: string }[] = [
  { id: 'command', label: 'Command', icon: 'dashboard' },
  { id: 'plans', label: 'Plans', icon: 'route' },
  { id: 'proofs', label: 'Proofs', icon: 'verified' },
  { id: 'memory', label: 'Memory', icon: 'inventory_2' },
  { id: 'settings', label: 'Settings', icon: 'tune' },
];

const PROOF_LADDER = [
  { type: 'quick_check' as const, label: 'Quick Check', icon: 'quiz', description: 'Prove the fundamentals in a short scenario.' },
  { type: 'applied_challenge' as const, label: 'Applied Challenge', icon: 'psychology', description: 'Show role-ready judgment with trade-offs.' },
  { type: 'interview_drill' as const, label: 'Interview Drill', icon: 'record_voice_over', description: 'Practice the skill inside Interview Studio.' },
];

const INITIAL_QUEUE_LIMIT = 12;

const STATUS_FILTERS: { id: SkillStatusFilter; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: 'view_list' },
  { id: 'due', label: 'Due', icon: 'priority_high' },
  { id: 'ready', label: 'Ready', icon: 'verified' },
  { id: 'in_progress', label: 'In progress', icon: 'route' },
  { id: 'not_started', label: 'Not started', icon: 'add_task' },
  { id: 'verified', label: 'Verified', icon: 'workspace_premium' },
];

const CATEGORY_FILTERS: { id: SkillCategoryFilter; label: string }[] = [
  { id: 'all', label: 'All categories' },
  { id: 'technical', label: 'Technical' },
  { id: 'soft', label: 'Soft' },
  { id: 'domain', label: 'Domain' },
];

const SORT_OPTIONS: { id: SkillSortMode; label: string }[] = [
  { id: 'next_action', label: 'Next action' },
  { id: 'readiness', label: 'Readiness' },
  { id: 'skill', label: 'Skill A-Z' },
];

function getTrainingDays(skill: string, category: SkillCategory): number {
  if (SKILL_COMPLEXITY[skill]) return SKILL_COMPLEXITY[skill];
  if (category === 'soft') return 3;
  if (category === 'domain') return 5;
  return 4;
}

function daysSince(value?: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((Date.now() - time) / 86_400_000);
}

function isReviewDue(progress?: StudyProgress): boolean {
  if (!progress) return false;
  if (progress.next_review_at && new Date(progress.next_review_at) <= new Date()) return true;
  const completedAgo = daysSince(progress.completed_at);
  return completedAgo !== null && completedAgo >= 7;
}

function skillActionPriority(item: SkillRecord): number {
  return (
    (item.reviewDue ? 0 : 20) +
    (item.readyToVerify ? 1 : 10) +
    (!item.progress ? 2 : 0) +
    (item.verified ? 30 : 0) +
    (item.gap?.priority || 12)
  );
}

function matchesSkillStatus(record: SkillRecord, status: SkillStatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'due') return record.reviewDue;
  if (status === 'ready') return record.readyToVerify && !record.verified;
  if (status === 'in_progress') return Boolean(record.progress) && !record.verified;
  if (status === 'not_started') return !record.progress;
  return record.verified;
}

function searchableSkillText(record: SkillRecord, jobTitle: string, companyName: string): string {
  return [
    record.skill,
    record.category,
    record.sourceLabel,
    record.nextAction,
    record.nextActionDetail,
    record.gap?.reason || '',
    jobTitle,
    companyName,
  ].join(' ').toLowerCase();
}

function sortSkillRecords(records: SkillRecord[], sortMode: SkillSortMode): SkillRecord[] {
  return [...records].sort((a, b) => {
    if (sortMode === 'readiness') {
      // Unproven skills sort last rather than sorting as a zero-scored skill.
      const aProven = a.readinessScore !== null;
      const bProven = b.readinessScore !== null;
      if (aProven !== bProven) return aProven ? -1 : 1;
      const delta = (b.readinessScore ?? 0) - (a.readinessScore ?? 0);
      return delta || skillActionPriority(a) - skillActionPriority(b);
    }
    if (sortMode === 'skill') return a.skill.localeCompare(b.skill);
    return skillActionPriority(a) - skillActionPriority(b);
  });
}

function categoryShell(category: SkillCategory | 'proof' | 'review' | 'verified' | 'locked') {
  const shells = {
    technical: {
      bg: 'bg-cyan-100 dark:bg-cyan-500/14',
      border: 'border-cyan-200 dark:border-cyan-400/30',
      text: 'text-cyan-700 dark:text-cyan-300',
      icon: 'code',
    },
    soft: {
      bg: 'bg-amber-100 dark:bg-amber-500/14',
      border: 'border-amber-200 dark:border-amber-400/30',
      text: 'text-amber-700 dark:text-amber-300',
      icon: 'forum',
    },
    domain: {
      bg: 'bg-blue-100 dark:bg-blue-500/14',
      border: 'border-blue-200 dark:border-blue-400/30',
      text: 'text-blue-700 dark:text-blue-300',
      icon: 'public',
    },
    proof: {
      bg: 'bg-violet-100 dark:bg-violet-500/14',
      border: 'border-violet-200 dark:border-violet-400/30',
      text: 'text-violet-700 dark:text-violet-300',
      icon: 'verified',
    },
    review: {
      bg: 'bg-orange-100 dark:bg-orange-500/14',
      border: 'border-orange-200 dark:border-orange-400/30',
      text: 'text-orange-700 dark:text-orange-300',
      icon: 'replay',
    },
    verified: {
      bg: 'bg-emerald-100 dark:bg-emerald-500/14',
      border: 'border-emerald-200 dark:border-emerald-400/30',
      text: 'text-emerald-700 dark:text-emerald-300',
      icon: 'workspace_premium',
    },
    locked: {
      bg: 'bg-slate-100 dark:bg-slate-500/14',
      border: 'border-slate-200 dark:border-slate-400/24',
      text: 'text-slate-600 dark:text-slate-300',
      icon: 'lock',
    },
  };
  return shells[category];
}

function IconShell({ kind, icon, size = 'md' }: { kind: SkillCategory | 'proof' | 'review' | 'verified' | 'locked'; icon?: string; size?: 'sm' | 'md' | 'lg' }) {
  const shell = categoryShell(kind);
  const sizes = {
    sm: 'h-10 w-10 rounded-[14px]',
    md: 'h-12 w-12 rounded-[16px]',
    lg: 'h-16 w-16 rounded-[20px]',
  };
  return (
    <div className={`${sizes[size]} ${shell.bg} ${shell.border} ${shell.text} flex shrink-0 items-center justify-center border shadow-sm shadow-slate-900/5`}>
      <span className="material-symbols-rounded text-[1.45rem]">{icon || shell.icon}</span>
    </div>
  );
}

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'green' | 'blue' | 'amber' | 'violet' | 'red' }) {
  const tones = {
    neutral: 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300',
    blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300',
    violet: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300',
    red: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300',
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

function ProgressBar({ value, color = 'bg-emerald-500' }: { value: number; color?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      />
    </div>
  );
}

export default function SkillBridgePage() {
  const router = useRouter();
  const { isPro, loading: tierLoading, tier } = useUserTier();

  const [gaps, setGaps] = useState<SkillGap[]>([]);
  const [progress, setProgress] = useState<StudyProgress[]>([]);
  const [proofs, setProofs] = useState<SkillVerification[]>([]);
  const [view, setView] = useState<BridgeView>('command');
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [selectedGapSkills, setSelectedGapSkills] = useState<Set<string>>(new Set());
  const [loadingPlans, setLoadingPlans] = useState<Record<string, boolean>>({});
  const [proofDrafts, setProofDrafts] = useState<Record<string, ProofDraft>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [jobTitle, setJobTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [skillSearchQuery, setSkillSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SkillStatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<SkillCategoryFilter>('all');
  const [sortMode, setSortMode] = useState<SkillSortMode>('next_action');
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_QUEUE_LIMIT);

  const applicationId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('applicationId') : null;

  useEffect(() => {
    try {
      const stored = localStorage.getItem('tc_skill_gaps');
      if (stored) {
        const parsed = JSON.parse(stored);
        const gapData: SkillGap[] = (parsed.gaps || []).map((gap: any, index: number) => ({
          skill: String(gap.skill || '').trim(),
          confidence: gap.confidence || 'ai-added',
          category: gap.category || 'technical',
          priority: index + 1,
          reason: gap.reason || '',
        })).filter((gap: SkillGap) => gap.skill);
        if (parsed.jdTitle) setJobTitle(parsed.jdTitle);
        if (parsed.companyName) setCompanyName(parsed.companyName);
        if (parsed.jd) setJobDescription(parsed.jd);
        if (gapData.length > 0) {
          setGaps(gapData);
          setSelectedGapSkills(new Set(gapData.slice(0, 3).map(g => g.skill)));
        }
      }
    } catch {
      // Unreadable storage means we know nothing about this user's gaps.
      // The empty state is the honest answer; there is nothing to fall back to.
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [progressResult, proofResult] = await Promise.all([
        getAllStudyProgress(),
        getSkillVerifications(),
      ]);
      if (progressResult.success && progressResult.data) setProgress(progressResult.data);
      if (proofResult.success && proofResult.data) setProofs(proofResult.data);
    } catch {
      // The preview is still useful without an authenticated Firestore session.
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const records = useMemo<SkillRecord[]>(() => {
    const bySkill = new Map<string, SkillRecord>();

    const upsert = (skill: string, category: SkillCategory, patch: Partial<SkillRecord>) => {
      const existing = bySkill.get(skill);
      if (existing) {
        bySkill.set(skill, { ...existing, ...patch, category: existing.category || category });
        return;
      }
      bySkill.set(skill, {
        skill,
        category,
        proofs: [],
        completedDays: [],
        totalDays: getTrainingDays(skill, category),
        progressPct: 0,
        schedule: [],
        verified: false,
        readyToVerify: false,
        reviewDue: false,
        applicationLinked: false,
        highestProofScore: 0,
        readinessScore: null,
        sourceLabel: 'Manual',
        nextAction: 'Start bridge',
        nextActionDetail: 'Create a short plan and complete the first proof step.',
        ...patch,
      });
    };

    // The only writers of `tc_skill_gaps` are the two resume morph flows in
    // app/suite/resume/page.tsx (:1876 and :3058). 'ai-added' means the skill
    // appeared in the morphed resume and not in the original; 'weak' and
    // 'strong' both mean it was already on the resume, with different emphasis.
    // Neither is a "JD gap", which is what the label used to claim — and
    // 'strong' must not fall through to "Manual", which would be the same kind
    // of wrong label in a rarer case.
    gaps.forEach(gap => upsert(gap.skill, gap.category, {
      gap,
      sourceLabel: gap.confidence === 'ai-added'
        ? 'Added by a resume morph'
        : 'Already on your resume',
      applicationLinked: Boolean(applicationId),
    }));

    progress.forEach(item => {
      const category = (item.category || 'technical') as SkillCategory;
      const totalDays = item.total_days || getTrainingDays(item.skill, category);
      const completedDays = item.completed_days || [];
      const progressPct = totalDays > 0 ? Math.round((completedDays.length / totalDays) * 100) : 0;
      upsert(item.skill, category, {
        progress: item,
        completedDays,
        totalDays,
        progressPct,
        schedule: item.plan_data?.schedule || [],
        applicationLinked: Boolean(item.application_ids?.length || applicationId),
        sourceLabel: item.job_title || item.company_name ? `${item.job_title || 'Role'}${item.company_name ? ` at ${item.company_name}` : ''}` : 'Study progress',
      });
    });

    proofs.forEach(proof => {
      const category = (proof.category || 'technical') as SkillCategory;
      const existing = bySkill.get(proof.skill);
      upsert(proof.skill, category, {
        proofs: [...(existing?.proofs || []), proof],
      });
    });

    return Array.from(bySkill.values()).map(record => {
      const sortedProofs = [...record.proofs].sort((a, b) => b.score - a.score);
      const highestProofScore = sortedProofs[0]?.score || 0;
      const verified = record.progress?.readiness_status === 'verified' || sortedProofs.some(p => p.verdict === 'verified');
      const reviewDue = isReviewDue(record.progress);
      const readyToVerify = !verified && (record.progressPct >= 60 || highestProofScore >= 70 || record.progress?.readiness_status === 'ready_to_verify');
      /*
       * Readiness is a graded-proof number or it is nothing.
       *
       * `Math.round(record.progressPct * 0.72)` used to be folded in: 0.72 had
       * no derivation anywhere, and ticking your own study-plan checkboxes is
       * self-reported activity, not proven readiness.
       *
       * The `Math.max(85, ...)` floor on the verified branch is gone for the
       * same reason — it could only ever round a real 82 up to a fabricated 85.
       *
       * One caveat, so nobody reads a clean invariant here that does not exist
       * yet: `readiness_score` is written only from a graded score FROM NOW
       * ON. Scores the deleted `fallbackGrade` already wrote are still in
       * users/{uid}/study_progress, and verify/route.ts persists
       * `Math.max(existing, score)` — monotonic — so a pre-cutoff fabricated 78
       * is a floor a later genuine 55 cannot lower. Those rows need a one-off
       * cleanup; until then this number can still be inherited rather than
       * earned.
       */
      const gradedScores: number[] = [
        ...sortedProofs.map(p => p.score).filter((s): s is number => typeof s === 'number'),
        ...(typeof record.progress?.readiness_score === 'number' ? [record.progress.readiness_score] : []),
      ];
      const readinessScore: number | null = gradedScores.length ? Math.max(...gradedScores) : null;

      let nextAction = 'Create plan';
      let nextActionDetail = 'Generate a focused bridge plan before practicing.';
      if (verified) {
        nextAction = 'Maintain proof';
        nextActionDetail = 'Save the proof to Memory or review it before interviews.';
      } else if (reviewDue) {
        nextAction = 'Review due';
        nextActionDetail = 'Refresh the skill before it fades.';
      } else if (readyToVerify) {
        nextAction = 'Verify skill';
        nextActionDetail = 'Run an applied challenge to prove interview readiness.';
      } else if (record.progressPct > 0) {
        nextAction = 'Continue plan';
        nextActionDetail = 'Complete the next learning task, then verify.';
      }

      return {
        ...record,
        proofs: sortedProofs,
        highestProofScore,
        verified,
        reviewDue,
        readyToVerify,
        readinessScore,
        nextAction,
        nextActionDetail,
      };
    }).sort((a, b) => skillActionPriority(a) - skillActionPriority(b));
  }, [applicationId, gaps, progress, proofs]);

  const selectedRecord = records.find(r => r.skill === selectedSkill) || null;
  const activeRecords = records.filter(r => !r.verified);
  const verifiedRecords = records.filter(r => r.verified);
  const readyRecords = records.filter(r => r.readyToVerify);
  const reviewRecords = records.filter(r => r.reviewDue);
  const linkedRecords = records.filter(r => r.applicationLinked);
  // Average only the skills that actually have a graded proof. Averaging in the
  // unproven ones as zero would report a low readiness the data does not support.
  const provenRecords = records.filter((r): r is SkillRecord & { readinessScore: number } => r.readinessScore !== null);
  const provenRecordCount = provenRecords.length;
  const averageReadiness: number | null = provenRecordCount
    ? Math.round(provenRecords.reduce((sum, r) => sum + r.readinessScore, 0) / provenRecordCount)
    : null;
  // `interviewConfidence` is deleted. It was
  // min(96, avgReadiness*0.7 + verified*8 + ready*4) — four undocumented
  // constants, a 96 ceiling whose only job was to never read 100, and nothing
  // in the formula that touches an interview.
  const needsAttention = records.filter(r => r.reviewDue || r.readyToVerify || !r.progress || r.progressPct < 45).slice(0, 5);

  const baseVisibleRecords = view === 'plans'
    ? records.filter(r => r.progress || r.gap)
    : view === 'proofs'
      ? records.filter(r => r.readyToVerify || r.proofs.length || r.verified)
      : records;

  const statusCounts = useMemo(() => {
    return STATUS_FILTERS.reduce((acc, item) => {
      acc[item.id] = baseVisibleRecords.filter(record => matchesSkillStatus(record, item.id)).length;
      return acc;
    }, {} as Record<SkillStatusFilter, number>);
  }, [baseVisibleRecords]);

  const filteredRecords = useMemo(() => {
    const query = skillSearchQuery.trim().toLowerCase();
    const filtered = baseVisibleRecords.filter(record => {
      const matchesQuery = !query || searchableSkillText(record, jobTitle, companyName).includes(query);
      const matchesStatus = matchesSkillStatus(record, statusFilter);
      const matchesCategory = categoryFilter === 'all' || record.category === categoryFilter;
      return matchesQuery && matchesStatus && matchesCategory;
    });
    return sortSkillRecords(filtered, sortMode);
  }, [baseVisibleRecords, categoryFilter, companyName, jobTitle, skillSearchQuery, sortMode, statusFilter]);

  const displayedRecords = filteredRecords.slice(0, visibleLimit);

  const clearQueueFilters = useCallback(() => {
    setSkillSearchQuery('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setSortMode('next_action');
    setVisibleLimit(INITIAL_QUEUE_LIMIT);
  }, []);

  useEffect(() => {
    setVisibleLimit(INITIAL_QUEUE_LIMIT);
  }, [categoryFilter, skillSearchQuery, sortMode, statusFilter, view]);

  const requirePro = useCallback((message = 'Upgrade to Standard to unlock Skill Bridge verification and saved progress.') => {
    if (isPro) return true;
    showToast(message, 'lock');
    return false;
  }, [isPro]);

  const openUpgrade = () => router.push('/suite/upgrade');

  const askSona = (prompt: string, contextLabel = 'Skill Bridge') => {
    openSona({
      prompt,
      contextLabel,
      capabilityId: 'skill_bridge.plan_verify',
      context: {
        pathname: '/suite/skill-bridge',
        pageLabel: 'Skill Bridge',
        sourceTool: 'Skill Bridge',
        skill: selectedRecord?.skill || selectedSkill || undefined,
        selectedItemLabel: selectedRecord?.nextAction || undefined,
        metadata: {
          readinessScore: selectedRecord?.readinessScore,
          activeBridges: activeRecords.length,
          readyToVerify: readyRecords.length,
          proofsSaved: proofs.length,
        },
      },
    });
  };

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'memory') setView('memory');
    } catch {
      // Keep the default command view if URL state is unavailable.
    }
  }, []);

  const handleGeneratePlan = useCallback(async (record: SkillRecord) => {
    if (!requirePro('Upgrade to Standard to generate durable Skill Bridge plans.')) return false;
    setLoadingPlans(prev => ({ ...prev, [record.skill]: true }));
    try {
      const totalDays = getTrainingDays(record.skill, record.category);
      const res = await authFetch('/api/resume/study-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skills: [record.skill],
          totalDays,
          platforms: ['Official Docs', 'YouTube', 'Coursera', 'Hands-on Labs'],
          userContext: [
            jobTitle ? `Target role: ${jobTitle}` : '',
            companyName ? `Company: ${companyName}` : '',
            jobDescription ? `Job description: ${jobDescription.slice(0, 2000)}` : '',
          ].filter(Boolean).join('\n'),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      await saveStudyProgress(
        record.skill,
        record.category,
        data,
        applicationId || undefined,
        jobTitle || companyName ? { jobTitle, companyName } : undefined
      );
      showToast(`${record.skill} bridge plan created`, 'route');
      await loadData();
      return true;
    } catch (error: any) {
      showToast(error.message || 'Failed to create plan', 'cancel');
      return false;
    } finally {
      setLoadingPlans(prev => ({ ...prev, [record.skill]: false }));
    }
  }, [applicationId, companyName, jobDescription, jobTitle, loadData, requirePro]);

  const handleGenerateSelected = async () => {
    const selected = records.filter(r => selectedGapSkills.has(r.skill));
    if (!selected.length) {
      showToast('Select at least one skill to bridge', 'checklist');
      return;
    }
    for (const record of selected) {
      await handleGeneratePlan(record);
    }
  };

  const handleDayToggle = async (record: SkillRecord, day: number, isDone: boolean) => {
    if (!requirePro('Upgrade to Standard to save Skill Bridge progress.')) return;
    try {
      if (!record.progress) {
        await saveStudyProgress(
          record.skill,
          record.category,
          undefined,
          applicationId || undefined,
          jobTitle || companyName ? { jobTitle, companyName } : undefined
        );
      }
      const result = isDone ? await unmarkDayComplete(record.skill, day) : await markDayComplete(record.skill, day);
      if (result.success) {
        showToast(isDone ? `Day ${day} unmarked` : `Day ${day} complete`, isDone ? 'undo' : 'check_circle');
        await loadData();
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to update progress', 'cancel');
    }
  };

  const handleMarkComplete = async (record: SkillRecord, complete: boolean) => {
    if (!requirePro('Upgrade to Standard to save Skill Bridge progress.')) return;
    try {
      if (!record.progress) await saveStudyProgress(record.skill, record.category, undefined, applicationId || undefined);
      const result = complete
        ? await markCourseComplete(record.skill, record.totalDays)
        : await markCourseIncomplete(record.skill);
      if (result.success) {
        showToast(complete ? `${record.skill} marked complete` : `${record.skill} reopened`, complete ? 'check_circle' : 'replay');
        await loadData();
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to update course', 'cancel');
    }
  };

  const updateProofDraft = (skill: string, patch: Partial<ProofDraft>) => {
    const emptyDraft: ProofDraft = { challengeType: 'quick_check', prompt: '', response: '' };
    setProofDrafts(prev => ({
      ...prev,
      [skill]: {
        ...emptyDraft,
        ...(prev[skill] || {}),
        ...patch,
      },
    }));
  };

  const handleGenerateChallenge = async (record: SkillRecord) => {
    if (!requirePro('Upgrade to Standard to generate verification challenges.')) return;
    const draft = proofDrafts[record.skill] || { challengeType: 'quick_check', prompt: '', response: '' };
    updateProofDraft(record.skill, { loading: 'generate' });
    try {
      const res = await authFetch('/api/skill-bridge/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'generate',
          challengeType: draft.challengeType,
          skill: record.skill,
          category: record.category,
          applicationId,
          sourceContext: applicationId ? 'application' : 'resume',
          role: jobTitle,
          company: companyName,
          jobDescription,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate challenge');
      updateProofDraft(record.skill, { prompt: data.challenge?.prompt || '', response: '', grade: undefined, loading: undefined });
    } catch (error: any) {
      showToast(error.message || 'Failed to generate challenge', 'cancel');
      updateProofDraft(record.skill, { loading: undefined });
    }
  };

  const handleGradeChallenge = async (record: SkillRecord) => {
    if (!requirePro('Upgrade to Standard to grade and save proof attempts.')) return;
    const draft = proofDrafts[record.skill];
    if (!draft?.prompt || !draft.response.trim()) {
      showToast('Add a proof answer before grading', 'edit_note');
      return;
    }
    updateProofDraft(record.skill, { loading: 'grade' });
    try {
      const res = await authFetch('/api/skill-bridge/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'grade',
          challengeType: draft.challengeType,
          skill: record.skill,
          category: record.category,
          prompt: draft.prompt,
          response: draft.response,
          applicationId,
          sourceContext: applicationId ? 'application' : 'resume',
          role: jobTitle,
          company: companyName,
          jobDescription,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to grade proof');
      updateProofDraft(record.skill, { grade: data.grade, loading: undefined });
      showToast(data.grade?.verdict === 'verified' ? `${record.skill} verified` : 'Proof reviewed', 'verified');
      await loadData();
    } catch (error: any) {
      showToast(error.message || 'Failed to grade proof', 'cancel');
      updateProofDraft(record.skill, { loading: undefined });
    }
  };

  const handleSavePlanToVault = async (record: SkillRecord) => {
    if (!requirePro('Upgrade to Standard to save Skill Bridge plans to Memory.')) return;
    if (!record.schedule.length) {
      showToast('Generate a plan before saving to Memory', 'route');
      return;
    }
    try {
      const res = await authFetch('/api/vault/export-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill: record.skill,
          schedule: record.schedule,
          summary: record.progress?.plan_data?.summary || '',
          applicationId,
        }),
      });
      if (!res.ok) throw new Error('Failed to save plan');
      window.dispatchEvent(new CustomEvent('prep-memory:refresh'));
      showToast('Plan saved to Memory', 'inventory_2');
    } catch (error: any) {
      showToast(error.message || 'Failed to save plan', 'cancel');
    }
  };

  const handleSaveProofToVault = async (record: SkillRecord) => {
    if (!requirePro('Upgrade to Standard to save proof notes to Memory.')) return;
    const proof = record.proofs[0];
    if (!proof) {
      showToast('Complete a proof attempt first', 'verified');
      return;
    }
    updateProofDraft(record.skill, { loading: 'vault' });
    try {
      const res = await authFetch('/api/vault/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'skill-bridge',
          topic: `${record.skill} proof`,
          skill: record.skill,
          applicationId,
          sourceTool: 'skill-bridge',
          items: [proof],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save proof');
      window.dispatchEvent(new CustomEvent('prep-memory:refresh'));
      showToast('Proof note saved to Memory', 'inventory_2');
    } catch (error: any) {
      showToast(error.message || 'Failed to save proof', 'cancel');
    } finally {
      updateProofDraft(record.skill, { loading: undefined });
    }
  };

  const handlePractice = (record: SkillRecord) => {
    sessionStorage.setItem('tc_interview_setup', JSON.stringify({
      interviewType: 'quick-drill',
      drillCategory: record.category === 'soft' ? 'behavioral' : 'technical',
      drillRole: record.skill,
      targetRole: jobTitle,
      companyName,
      jobDescription,
    }));
    window.open(`/suite/interview-sim?mode=quick_drill&skill=${encodeURIComponent(record.skill)}`, '_blank');
  };

  return (
    <SuiteToolShell variant="workbench">
        <SuiteToolHeader
          tool="skill-bridge"
          subtitle="Close the gap, prove the skill, and walk into interviews ready to defend it."
          meta={
            <Pill tone={isPro ? 'green' : 'amber'}>
              <span className="material-symbols-rounded text-[14px]">{isPro ? 'workspace_premium' : 'lock'}</span>
              {tierLoading ? 'Checking' : isPro ? `${getPlanIdentity(tier).shortName} active` : 'Standard preview'}
            </Pill>
          }
          actions={
            <>
              <button
                type="button"
                onClick={() => askSona('Help me choose the highest leverage Skill Bridge gaps to verify this week.')}
                className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
              >
                <AssistantMark size="xs" state="idle" />
                Ask Taco
              </button>
              {!isPro && (
                <button
                  type="button"
                  onClick={openUpgrade}
                  className="inline-flex items-center gap-2 rounded-[14px] bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-[oklch(0.99_0.004_160)] transition-colors hover:bg-emerald-700"
                >
                  <span className="material-symbols-rounded text-[18px]">bolt</span>
                  Unlock proofs
                </button>
              )}
            </>
          }
        />

        {!isPro && !tierLoading && (
          <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <IconShell kind="locked" icon="lock" size="sm" />
                <div>
                  {/* This used to claim the page was "showing the full readiness
                      system". With the invented sample gaps gone, a free account
                      with no morph history sees an empty page — so it wasn't. */}
                  <p className="font-bold">You are on the free plan.</p>
                  <p className="mt-0.5 text-amber-800/80 dark:text-amber-100/70">Memory is yours to review. Standard unlocks new bridge plans, graded proofs, and saved progress.</p>
                </div>
              </div>
              <button type="button" onClick={openUpgrade} className="rounded-[12px] bg-amber-600 px-4 py-2 text-sm font-bold text-[oklch(0.99_0.004_80)] hover:bg-amber-700">
                Upgrade to Standard
              </button>
            </div>
          </div>
        )}

        {/* Both strips are counts OF the skill records. With no records they are
            not five zeros and three zeros — they are eight numbers about nothing.
            The empty state below is the honest surface. */}
        {records.length > 0 && (
          <>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <TodayTile icon="priority_high" label="Due today" value={reviewRecords.length} detail="Reviews and fading proofs" tone="amber" onClick={() => setView('command')} />
              <TodayTile icon="verified" label="Ready to prove" value={readyRecords.length} detail="Skills ready for a challenge" tone="violet" onClick={() => setView('proofs')} />
              <TodayTile icon="route" label="Active bridges" value={activeRecords.length} detail="Learning paths in motion" tone="blue" onClick={() => setView('plans')} />
              <TodayTile icon="workspace_premium" label="Verified" value={verifiedRecords.length} detail="Practice-proven skills" tone="green" onClick={() => setView('proofs')} />
              <TodayTile icon="work" label="Application linked" value={linkedRecords.length} detail="Gaps tied to jobs" tone="cyan" onClick={() => setView('command')} />
            </section>

            <section className="grid gap-3 md:grid-cols-2">
              <MetricCard
                icon="monitoring"
                label="Readiness score"
                value={averageReadiness === null ? 'Not proven yet' : `${averageReadiness}%`}
                detail={averageReadiness === null
                  ? `None of your ${records.length} ${records.length === 1 ? 'skill has' : 'skills have'} a graded proof yet`
                  : `Averaged over ${provenRecordCount} of ${records.length} ${records.length === 1 ? 'skill' : 'skills'} with a graded proof`}
                tone="green"
              />
              <MetricCard icon="inventory_2" label="Proof attempts" value={proofs.length} detail="Saved verification history" tone="violet" />
            </section>
          </>
        )}

        <div className="flex flex-col gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {VIEWS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`inline-flex items-center gap-2 rounded-[12px] px-3 py-2 text-sm font-semibold transition-colors ${
                  view === item.id
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] ring-1 ring-[var(--border)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className="material-symbols-rounded text-[18px]">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
          {/* Gated on records, like the tile strips above. Removing SAMPLE_GAPS
              left this as the page's only primary CTA on an empty account, and
              nothing on that screen is selectable — so its sole outcome was a
              toast telling the user to select a skill that does not exist. */}
          {records.length > 0 && view !== 'memory' && view !== 'settings' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGenerateSelected}
                disabled={Object.values(loadingPlans).some(Boolean)}
                className="inline-flex items-center gap-2 rounded-[12px] bg-emerald-600 px-3.5 py-2 text-sm font-bold text-[oklch(0.99_0.004_160)] hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="material-symbols-rounded text-[18px]">auto_awesome</span>
                Build selected
              </button>
            </div>
          )}
        </div>

        {loadingData ? (
          <AssistantThinkingTile
            variant="jobs"
            icon="route"
            title="Taco is checking your bridge"
            description="Loading gaps, progress, proof history, and review timing."
            activeStage="context"
            stages={['Gaps', 'Plans', 'Proofs', 'Next step']}
          />
        ) : (
          <main className={view === 'memory' ? 'grid gap-5' : 'grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]'}>
            <div className="min-w-0 space-y-5">
              {view === 'command' && (
                <NeedsAttention
                  records={needsAttention}
                  onOpen={setSelectedSkill}
                  onGeneratePlan={handleGeneratePlan}
                  onVerify={(record) => {
                    setSelectedSkill(record.skill);
                    setView('proofs');
                  }}
                />
              )}

              {view === 'command' && (
                <GapIntake
                  records={records}
                  selectedGapSkills={selectedGapSkills}
                  setSelectedGapSkills={setSelectedGapSkills}
                  onOpen={setSelectedSkill}
                />
              )}

              {view === 'memory' ? (
                <MemoryPanel
                  isPro={isPro}
                  onOpenSkill={(skill) => {
                    setSelectedSkill(skill);
                    setView('command');
                  }}
                />
              ) : view === 'settings' ? (
                <SettingsPanel isPro={isPro} onUpgrade={openUpgrade} />
              ) : baseVisibleRecords.length > 0 ? (
                <SkillQueue
                  title={view === 'proofs' ? 'Proof Ladder' : view === 'plans' ? 'Bridge Plans' : 'Skill Action Queue'}
                  description={view === 'proofs'
                    ? 'Search and verify what you can honestly defend in an interview.'
                    : 'Find the next skill action without scrolling through a card wall.'}
                  records={displayedRecords}
                  totalCount={baseVisibleRecords.length}
                  filteredCount={filteredRecords.length}
                  visibleLimit={visibleLimit}
                  searchQuery={skillSearchQuery}
                  statusFilter={statusFilter}
                  categoryFilter={categoryFilter}
                  sortMode={sortMode}
                  statusCounts={statusCounts}
                  selectedSkill={selectedSkill}
                  loadingPlans={loadingPlans}
                  onSearchChange={setSkillSearchQuery}
                  onStatusChange={setStatusFilter}
                  onCategoryChange={setCategoryFilter}
                  onSortChange={setSortMode}
                  onShowMore={() => setVisibleLimit(limit => limit + INITIAL_QUEUE_LIMIT)}
                  onClearFilters={clearQueueFilters}
                  onOpen={setSelectedSkill}
                  onGeneratePlan={handleGeneratePlan}
                  onPractice={handlePractice}
                  onVerify={(record) => {
                    setSelectedSkill(record.skill);
                    setView('proofs');
                  }}
                  onAskSona={(record) => askSona(`Help me study and verify ${record.skill}${jobTitle ? ` for ${jobTitle}` : ''}. Give me the next best action.`)}
                  onAskSonaEmpty={() => askSona('Help me find the right Skill Bridge action from my current filters and goals.')}
                />
              ) : (
                <EmptyBridgeState
                  onOpenResume={() => router.push('/suite/resume')}
                  onAskSona={() => askSona('Help me identify three Skill Bridge gaps from my current career goals.')}
                />
              )}
            </div>

            {view !== 'memory' && (
            <aside className="hidden xl:block">
              <div className="sticky top-5 space-y-4">
                <ProofLadderPreview isPro={isPro} onUpgrade={openUpgrade} />
                <SonaCoachPanel onAskSona={askSona} />
              </div>
            </aside>
            )}
          </main>
        )}


      <SkillDrawer
        record={selectedRecord}
        isPro={isPro}
        draft={selectedRecord ? proofDrafts[selectedRecord.skill] : undefined}
        onClose={() => setSelectedSkill(null)}
        onGeneratePlan={handleGeneratePlan}
        onDayToggle={handleDayToggle}
        onMarkComplete={handleMarkComplete}
        onGenerateChallenge={handleGenerateChallenge}
        onGradeChallenge={handleGradeChallenge}
        onUpdateDraft={updateProofDraft}
        onPractice={handlePractice}
        onAskSona={askSona}
        onSavePlanToVault={handleSavePlanToVault}
        onSaveProofToVault={handleSaveProofToVault}
        onUpgrade={openUpgrade}
        loadingPlan={selectedRecord ? !!loadingPlans[selectedRecord.skill] : false}
      />
    </SuiteToolShell>
  );
}

function TodayTile({ icon, label, value, detail, tone, onClick }: {
  icon: string; label: string; value: number; detail: string; tone: 'amber' | 'violet' | 'blue' | 'green' | 'cyan'; onClick: () => void;
}) {
  const toneMap = {
    amber: 'text-amber-700 bg-amber-100 border-amber-200 dark:text-amber-300 dark:bg-amber-500/12 dark:border-amber-500/25',
    violet: 'text-violet-700 bg-violet-100 border-violet-200 dark:text-violet-300 dark:bg-violet-500/12 dark:border-violet-500/25',
    blue: 'text-blue-700 bg-blue-100 border-blue-200 dark:text-blue-300 dark:bg-blue-500/12 dark:border-blue-500/25',
    green: 'text-emerald-700 bg-emerald-100 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/12 dark:border-emerald-500/25',
    cyan: 'text-cyan-700 bg-cyan-100 border-cyan-200 dark:text-cyan-300 dark:bg-cyan-500/12 dark:border-cyan-500/25',
  };
  return (
    <button type="button" onClick={onClick} className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-surface)]">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-[15px] border ${toneMap[tone]}`}>
          <span className="material-symbols-rounded text-[22px]">{icon}</span>
        </div>
        <span className="tabular-nums text-2xl font-black text-[var(--text-primary)]">{value}</span>
      </div>
      <p className="mt-3 text-sm font-bold text-[var(--text-primary)]">{label}</p>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{detail}</p>
    </button>
  );
}

function MetricCard({ icon, label, value, detail, tone }: { icon: string; label: string; value: string | number; detail: string; tone: 'green' | 'blue' | 'violet' }) {
  const kind = tone === 'green' ? 'verified' : tone === 'blue' ? 'domain' : 'proof';
  return (
    <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <div className="flex items-center gap-3">
        <IconShell kind={kind} icon={icon} size="sm" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--text-secondary)]">{label}</p>
          <p className="whitespace-nowrap tabular-nums text-2xl font-black text-[var(--text-primary)]">{value}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-[var(--text-secondary)]">{detail}</p>
    </div>
  );
}

function NeedsAttention({ records, onOpen, onGeneratePlan, onVerify }: {
  records: SkillRecord[];
  onOpen: (skill: string) => void;
  onGeneratePlan: (record: SkillRecord) => void;
  onVerify: (record: SkillRecord) => void;
}) {
  if (!records.length) return null;
  return (
    <section className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Needs Attention</h2>
          <p className="text-sm text-[var(--text-secondary)]">The shortest path from gap to proof today.</p>
        </div>
        <Pill tone="amber"><span className="material-symbols-rounded text-[14px]">priority_high</span>{records.length} actions</Pill>
      </div>
      <div className="space-y-2">
        {records.map(record => (
          <div key={record.skill} className="flex flex-col gap-3 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <IconShell kind={record.reviewDue ? 'review' : record.readyToVerify ? 'proof' : record.category} size="sm" />
              <div className="min-w-0">
                <p className="wrap-natural text-sm font-bold text-[var(--text-primary)]">{record.skill}</p>
                <p className="wrap-natural text-xs text-[var(--text-secondary)]">{record.nextActionDetail}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={record.reviewDue ? 'amber' : record.readyToVerify ? 'violet' : 'blue'}>{record.nextAction}</Pill>
              <button type="button" onClick={() => onOpen(record.skill)} className="rounded-[12px] border border-[var(--border-subtle)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Open</button>
              {record.readyToVerify ? (
                <button type="button" onClick={() => onVerify(record)} className="rounded-[12px] bg-violet-600 px-3 py-2 text-xs font-bold text-[oklch(0.99_0.004_300)] hover:bg-violet-700">Verify</button>
              ) : (
                <button type="button" onClick={() => onGeneratePlan(record)} className="rounded-[12px] bg-emerald-600 px-3 py-2 text-xs font-bold text-[oklch(0.99_0.004_160)] hover:bg-emerald-700">Build plan</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GapIntake({ records, selectedGapSkills, setSelectedGapSkills, onOpen }: {
  records: SkillRecord[];
  selectedGapSkills: Set<string>;
  setSelectedGapSkills: (skills: Set<string>) => void;
  onOpen: (skill: string) => void;
}) {
  const gapRecords = records.filter(record => record.gap).slice(0, 8);
  if (!gapRecords.length) return null;
  return (
    <section className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Gap Intake</h2>
        <p className="text-sm text-[var(--text-secondary)]">Select the gaps to turn into durable bridge plans.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {gapRecords.map(record => {
          const selected = selectedGapSkills.has(record.skill);
          return (
            <button
              key={record.skill}
              type="button"
              onClick={() => {
                const next = new Set(selectedGapSkills);
                if (selected) next.delete(record.skill);
                else next.add(record.skill);
                setSelectedGapSkills(next);
              }}
              onDoubleClick={() => onOpen(record.skill)}
              className={`text-left rounded-[18px] border p-4 transition-colors ${
                selected
                  ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border)]'
              }`}
            >
              <div className="flex items-start gap-3">
                <IconShell kind={record.category} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="wrap-natural text-sm font-bold text-[var(--text-primary)]">{record.skill}</p>
                    <span className="material-symbols-rounded text-[18px] text-emerald-600">{selected ? 'check_circle' : 'radio_button_unchecked'}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">{record.gap?.reason || record.sourceLabel}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SkillQueue({
  title,
  description,
  records,
  totalCount,
  filteredCount,
  visibleLimit,
  searchQuery,
  statusFilter,
  categoryFilter,
  sortMode,
  statusCounts,
  selectedSkill,
  loadingPlans,
  onSearchChange,
  onStatusChange,
  onCategoryChange,
  onSortChange,
  onShowMore,
  onClearFilters,
  onOpen,
  onGeneratePlan,
  onPractice,
  onVerify,
  onAskSona,
  onAskSonaEmpty,
}: {
  title: string;
  description: string;
  records: SkillRecord[];
  totalCount: number;
  filteredCount: number;
  visibleLimit: number;
  searchQuery: string;
  statusFilter: SkillStatusFilter;
  categoryFilter: SkillCategoryFilter;
  sortMode: SkillSortMode;
  statusCounts: Record<SkillStatusFilter, number>;
  selectedSkill: string | null;
  loadingPlans: Record<string, boolean>;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: SkillStatusFilter) => void;
  onCategoryChange: (value: SkillCategoryFilter) => void;
  onSortChange: (value: SkillSortMode) => void;
  onShowMore: () => void;
  onClearFilters: () => void;
  onOpen: (skill: string) => void;
  onGeneratePlan: (record: SkillRecord) => void;
  onPractice: (record: SkillRecord) => void;
  onVerify: (record: SkillRecord) => void;
  onAskSona: (record: SkillRecord) => void;
  onAskSonaEmpty: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
          <p className="text-sm text-[var(--text-secondary)]">{description}</p>
        </div>
        {/* With no filter applied, filteredCount === totalCount, and the old
            "12 of 47 matched · 47 total" printed the same number twice. */}
        <p className="whitespace-nowrap text-xs font-semibold tabular-nums text-[var(--text-muted)]">
          {filteredCount === totalCount
            ? `Showing ${Math.min(records.length, visibleLimit)} of ${totalCount}`
            : `Showing ${Math.min(records.length, visibleLimit)} of ${filteredCount} matched · ${totalCount} total`}
        </p>
      </div>

      <div className="sticky top-3 z-20 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)]/95 p-3 shadow-sm shadow-slate-900/5 backdrop-blur">
        <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_auto_auto] xl:items-center">
          <label className="relative block">
            <span className="sr-only">Search skills</span>
            <span className="material-symbols-rounded pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-[var(--text-muted)]">search</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search skill, action, role, source..."
              className="h-11 w-full rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-10 pr-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-emerald-500"
            />
          </label>

          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORY_FILTERS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => onCategoryChange(item.id)}
                className={`rounded-[11px] px-2.5 py-2 text-xs font-bold transition-colors ${
                  categoryFilter === item.id
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] ring-1 ring-[var(--border)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
            <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)]">sort</span>
            <span className="sr-only">Sort skills</span>
            <select
              value={sortMode}
              onChange={(event) => onSortChange(event.target.value as SkillSortMode)}
              className="min-w-[132px] bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none"
            >
              {SORT_OPTIONS.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onStatusChange(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-[11px] px-2.5 py-1.5 text-xs font-bold transition-colors ${
                statusFilter === item.id
                  ? 'bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="material-symbols-rounded text-[15px]">{item.icon}</span>
              {item.label}
              <span className="tabular-nums text-[var(--text-muted)]">{statusCounts[item.id] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      {filteredCount === 0 ? (
        <div className="rounded-[22px] border border-dashed border-[var(--border)] bg-[var(--card-bg)] p-8 text-center">
          <div className="mx-auto mb-3 flex justify-center">
            <IconShell kind="domain" icon="manage_search" size="md" />
          </div>
          <h3 className="text-lg font-bold text-[var(--text-primary)]">No skills match this search</h3>
          <p className="mx-auto mt-1 max-w-lg text-sm text-[var(--text-secondary)]">Clear the filters or ask Taco to help identify the next best skill action from your current goals.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={onClearFilters} className="rounded-[12px] border border-[var(--border-subtle)] px-4 py-2 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Clear filters</button>
            <button type="button" onClick={onAskSonaEmpty} className="inline-flex items-center gap-2 rounded-[12px] bg-emerald-600 px-4 py-2 text-sm font-bold text-[oklch(0.99_0.004_160)] hover:bg-emerald-700">
              <AssistantMark size="xs" state="idle" />
              Ask Taco
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(record => (
            <SkillQueueRow
              key={record.skill}
              record={record}
              selected={record.skill === selectedSkill}
              loadingPlan={!!loadingPlans[record.skill]}
              onOpen={() => onOpen(record.skill)}
              onGeneratePlan={() => onGeneratePlan(record)}
              onPractice={() => onPractice(record)}
              onVerify={() => onVerify(record)}
              onAskSona={() => onAskSona(record)}
            />
          ))}
        </div>
      )}

      {filteredCount > records.length && (
        <div className="flex justify-center pt-2">
          <button type="button" onClick={onShowMore} className="rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            Show 12 more
          </button>
        </div>
      )}
    </section>
  );
}

function SkillQueueRow({ record, selected, loadingPlan, onOpen, onGeneratePlan, onPractice, onVerify, onAskSona }: {
  record: SkillRecord;
  selected: boolean;
  loadingPlan: boolean;
  onOpen: () => void;
  onGeneratePlan: () => void;
  onPractice: () => void;
  onVerify: () => void;
  onAskSona: () => void;
}) {
  const primary = record.reviewDue
    ? { label: 'Review', icon: 'replay', onClick: onOpen, className: 'bg-orange-600 hover:bg-orange-700 text-[oklch(0.99_0.004_60)]' }
    : record.readyToVerify
      ? { label: 'Verify', icon: 'verified', onClick: onVerify, className: 'bg-violet-600 hover:bg-violet-700 text-[oklch(0.99_0.004_300)]' }
      : record.verified
        ? { label: 'Open proof', icon: 'workspace_premium', onClick: onOpen, className: 'bg-emerald-600 hover:bg-emerald-700 text-[oklch(0.99_0.004_160)]' }
        : record.progress
          ? { label: 'Continue', icon: 'play_arrow', onClick: onOpen, className: 'bg-blue-600 hover:bg-blue-700 text-[oklch(0.99_0.004_250)]' }
          : { label: loadingPlan ? 'Building' : 'Build plan', icon: 'route', onClick: onGeneratePlan, className: 'bg-emerald-600 hover:bg-emerald-700 text-[oklch(0.99_0.004_160)]' };

  return (
    <article className={`rounded-[18px] border bg-[var(--card-bg)] p-3 transition-colors ${selected ? 'border-emerald-400 ring-2 ring-emerald-500/15' : 'border-[var(--border-subtle)] hover:border-[var(--border)]'}`}>
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.3fr)_minmax(180px,0.8fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <IconShell kind={record.verified ? 'verified' : record.readyToVerify ? 'proof' : record.reviewDue ? 'review' : record.category} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="wrap-natural text-sm font-black text-[var(--text-primary)]">{record.skill}</h3>
              <Pill tone={record.verified ? 'green' : record.readyToVerify ? 'violet' : record.reviewDue ? 'amber' : 'neutral'}>{record.nextAction}</Pill>
            </div>
            <p className="mt-1 line-clamp-1 text-xs text-[var(--text-secondary)]">{record.sourceLabel}</p>
            {record.gap?.reason && <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--text-muted)]">{record.gap.reason}</p>}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase text-[var(--text-muted)]">Readiness</span>
            {/* No graded proof means no readiness. A 0% bar would claim we
                measured this skill and found nothing there. */}
            <span className="shrink-0 whitespace-nowrap text-xs font-black tabular-nums text-[var(--text-primary)]">
              {record.readinessScore === null ? <span className="font-semibold text-[var(--text-muted)]">Not proven yet</span> : `${record.readinessScore}%`}
            </span>
          </div>
          {record.readinessScore !== null && (
            <ProgressBar value={record.readinessScore} color={record.verified ? 'bg-emerald-500' : record.readyToVerify ? 'bg-violet-500' : record.reviewDue ? 'bg-orange-500' : 'bg-cyan-500'} />
          )}
          {/* `totalDays` falls back to getTrainingDays() — a per-skill table
              nobody sourced. That is a fine default length for a plan we are
              about to generate, but printed as "Tasks 0/4" on a skill with no
              plan it asserts this skill takes four days to bridge. With no
              plan there are no tasks. */}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <QueueStat label="Plan" value={record.progress ? `${record.progressPct}%` : 'None'} />
            <QueueStat label="Proof" value={record.highestProofScore ? `${record.highestProofScore}` : 'New'} />
            <QueueStat label="Tasks" value={record.progress ? `${record.completedDays.length}/${record.totalDays}` : '—'} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button
            type="button"
            onClick={primary.onClick}
            disabled={loadingPlan && !record.progress && !record.verified}
            className={`inline-flex min-w-[108px] items-center justify-center gap-1.5 rounded-[12px] px-3 py-2 text-xs font-black transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${primary.className}`}
          >
            <span className="material-symbols-rounded text-[16px]">{primary.icon}</span>
            {primary.label}
          </button>
          <button type="button" onClick={onOpen} className="rounded-[12px] border border-[var(--border-subtle)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Open</button>
          <button type="button" onClick={onPractice} className="rounded-[12px] border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">Practice</button>
          <button type="button" onClick={onAskSona} aria-label={`Ask Taco about ${record.skill}`} className="inline-flex items-center justify-center rounded-[12px] border border-[var(--border-subtle)] px-2 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            <AssistantMark size="xs" state="idle" />
          </button>
        </div>
      </div>
    </article>
  );
}

function QueueStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[10px] bg-[var(--bg-surface)] px-2 py-1.5 text-center">
      <p className="truncate text-xs font-black tabular-nums text-[var(--text-primary)]">{value}</p>
      <p className="truncate text-[9px] font-semibold text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-[var(--bg-surface)] p-2">
      <p className="whitespace-nowrap text-sm font-black tabular-nums text-[var(--text-primary)]">{value}</p>
      <p className="text-[10px] font-medium text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}

function ProofLadderPreview({ isPro, onUpgrade }: { isPro: boolean; onUpgrade: () => void }) {
  return (
    <section className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Proof Ladder</h2>
        {!isPro && <Pill tone="amber"><span className="material-symbols-rounded text-[14px]">lock</span>Standard</Pill>}
      </div>
      <div className="space-y-3">
        {PROOF_LADDER.map((step, index) => (
          <div key={step.type} className="flex gap-3">
            <div className="flex flex-col items-center">
              <IconShell kind={index === 2 ? 'review' : 'proof'} icon={step.icon} size="sm" />
              {index < PROOF_LADDER.length - 1 && <div className="mt-2 h-6 w-px bg-[var(--border-subtle)]" />}
            </div>
            <div className="min-w-0 pb-1">
              <p className="text-sm font-bold text-[var(--text-primary)]">{step.label}</p>
              <p className="text-xs text-[var(--text-secondary)]">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
      {!isPro && (
        <button type="button" onClick={onUpgrade} className="mt-4 w-full rounded-[12px] bg-emerald-600 px-4 py-2 text-sm font-bold text-[oklch(0.99_0.004_160)] hover:bg-emerald-700">
          Unlock proof engine
        </button>
      )}
    </section>
  );
}

function SonaCoachPanel({ onAskSona }: { onAskSona: (prompt: string) => void }) {
  const prompts = [
    'What Skill Bridge gap should I verify first?',
    'Help me explain my weakest skill in an interview.',
    'Create a 30 minute study sprint from my active gaps.',
  ];
  return (
    <section className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">Taco coaching</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Use Taco for study strategy, but Skill Bridge owns the proof record.</p>
      <div className="mt-3 space-y-2">
        {prompts.map(prompt => (
          <button key={prompt} type="button" onClick={() => onAskSona(prompt)} className="w-full rounded-[12px] border border-[var(--border-subtle)] px-3 py-2 text-left text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            {prompt}
          </button>
        ))}
      </div>
    </section>
  );
}

function SettingsPanel({ isPro, onUpgrade }: { isPro: boolean; onUpgrade: () => void }) {
  return (
    <section className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5">
      <div className="flex items-start gap-3">
        <IconShell kind="domain" icon="tune" />
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Bridge Settings</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">V1 uses your current resume gaps, applications, generated study plans, proof attempts, and review timing. Deeper reminder controls can plug into the existing study reminder system next.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SettingRow icon="schedule" title="Review rhythm" body="Verified skills are scheduled for a 7 day refresh." />
        <SettingRow icon="verified" title="Verification rule" body="Applied challenges need 80+ to become verified." />
        <SettingRow icon="lock" title="Access" body={isPro ? 'Plans and proofs are unlocked.' : 'Preview is visible. Durable work requires Standard.'} />
      </div>
      {!isPro && (
        <button type="button" onClick={onUpgrade} className="mt-5 rounded-[12px] bg-emerald-600 px-4 py-2 text-sm font-bold text-[oklch(0.99_0.004_160)] hover:bg-emerald-700">
          Unlock Skill Bridge
        </button>
      )}
    </section>
  );
}

function SettingRow({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <span className="material-symbols-rounded text-[22px] text-emerald-600">{icon}</span>
      <p className="mt-2 text-sm font-bold text-[var(--text-primary)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{body}</p>
    </div>
  );
}

/**
 * The only real sources of skill gaps are the two resume morph flows in
 * app/suite/resume/page.tsx (:1876 writes them from a JD morph, :3058 from an
 * improve pass). The previous CTA — "Open command view" — navigated to the view
 * the user was already on, which is why it never produced a single gap.
 */
function EmptyBridgeState({ onOpenResume, onAskSona }: { onOpenResume: () => void; onAskSona: () => void }) {
  return (
    <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-8 text-center md:p-10">
      <div className="mx-auto mb-4 flex justify-center">
        <IconShell kind="technical" icon="route" size="lg" />
      </div>
      <h2 className="premium-heading-wrap text-xl font-bold text-[var(--text-primary)]">No skill gaps on record</h2>
      <p className="premium-copy-wrap mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
        Gaps arrive from Resume Studio: morph your resume against a job description, and the
        skills the morph had to add — the ones your resume did not already show — land here.
        Nothing is guessed on your behalf.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onOpenResume} className="rounded-[12px] bg-emerald-600 px-4 py-2 text-sm font-bold text-[oklch(0.99_0.004_160)] hover:bg-emerald-700">
          Open Resume Studio
        </button>
        <button type="button" onClick={onAskSona} className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--border-subtle)] px-4 py-2 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
          <AssistantMark size="xs" state="idle" />
          Ask Taco
        </button>
      </div>
    </div>
  );
}

function SkillDrawer({
  record,
  isPro,
  draft,
  onClose,
  onGeneratePlan,
  onDayToggle,
  onMarkComplete,
  onGenerateChallenge,
  onGradeChallenge,
  onUpdateDraft,
  onPractice,
  onAskSona,
  onSavePlanToVault,
  onSaveProofToVault,
  onUpgrade,
  loadingPlan,
}: {
  record: SkillRecord | null;
  isPro: boolean;
  draft?: ProofDraft;
  onClose: () => void;
  onGeneratePlan: (record: SkillRecord) => void;
  onDayToggle: (record: SkillRecord, day: number, done: boolean) => void;
  onMarkComplete: (record: SkillRecord, complete: boolean) => void;
  onGenerateChallenge: (record: SkillRecord) => void;
  onGradeChallenge: (record: SkillRecord) => void;
  onUpdateDraft: (skill: string, patch: Partial<ProofDraft>) => void;
  onPractice: (record: SkillRecord) => void;
  onAskSona: (prompt: string, contextLabel?: string) => void;
  onSavePlanToVault: (record: SkillRecord) => void;
  onSaveProofToVault: (record: SkillRecord) => void;
  onUpgrade: () => void;
  loadingPlan: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!record) return;
    const t = setTimeout(() => closeRef.current?.focus(), 80);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, record]);

  if (!record) return null;
  const activeDraft = draft || { challengeType: 'quick_check' as const, prompt: '', response: '' };
  const isDone = record.progressPct >= 100;

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.aside
          role="dialog"
          aria-label={`${record.skill} Skill Bridge drawer`}
          aria-modal="true"
          initial={{ x: 420 }}
          animate={{ x: 0 }}
          exit={{ x: 420 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="flex h-full w-full max-w-[560px] flex-col border-l border-[var(--border-subtle)] bg-[var(--card-bg)] shadow-2xl"
        >
          <div className="border-b border-[var(--border-subtle)] p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <IconShell kind={record.verified ? 'verified' : record.readyToVerify ? 'proof' : record.category} size="md" />
                <div className="min-w-0">
                  <h2 className="wrap-natural text-xl font-bold text-[var(--text-primary)]">{record.skill}</h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{record.nextActionDetail}</p>
                </div>
              </div>
              <button ref={closeRef} type="button" onClick={onClose} aria-label="Close Skill Bridge drawer" className="rounded-[12px] p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniStat label="Readiness" value={record.readinessScore === null ? 'Not proven' : `${record.readinessScore}%`} />
              <MiniStat label="Proof score" value={record.highestProofScore ? `${record.highestProofScore}` : 'New'} />
              <MiniStat label="Plan" value={record.progress ? `${record.completedDays.length}/${record.totalDays}` : 'None yet'} />
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {!isPro && (
              <section className="rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
                <div className="flex items-start gap-3">
                  <IconShell kind="locked" size="sm" />
                  <div className="min-w-0">
                    <p className="font-bold">Proofs are locked in preview mode.</p>
                    <p className="mt-1 text-xs opacity-80">You can inspect the workflow, but generated plans and durable verification require Standard.</p>
                    <button type="button" onClick={onUpgrade} className="mt-3 rounded-[12px] bg-amber-600 px-3 py-2 text-xs font-bold text-[oklch(0.99_0.004_80)] hover:bg-amber-700">Upgrade</button>
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Next action</h3>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{record.nextActionDetail}</p>
                </div>
                <Pill tone={record.verified ? 'green' : record.readyToVerify ? 'violet' : 'blue'}>{record.nextAction}</Pill>
              </div>
              <div className="mt-4">
                {record.readinessScore === null ? (
                  <SuiteUnmeasured
                    label="No readiness score yet"
                    reason="Readiness comes from a graded proof. Nothing on this skill has been graded, so there is no score — not a score of zero."
                  />
                ) : (
                  <ProgressBar value={record.readinessScore} color={record.verified ? 'bg-emerald-500' : record.readyToVerify ? 'bg-violet-500' : 'bg-cyan-500'} />
                )}
              </div>
            </section>

            <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Bridge plan</h3>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{record.schedule.length ? 'Complete the plan, then prove the skill.' : 'Generate a focused plan from the current gap.'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onGeneratePlan(record)} disabled={loadingPlan} className="rounded-[12px] border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-500/15 disabled:opacity-60 dark:text-emerald-300">
                    {loadingPlan ? 'Building' : record.schedule.length ? 'Refresh' : 'Generate'}
                  </button>
                  <button type="button" onClick={() => onSavePlanToVault(record)} className="rounded-[12px] border border-[var(--border-subtle)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Save</button>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {record.schedule.length ? record.schedule.map((day: any, index: number) => {
                  const dayNum = Number(day.day || index + 1);
                  const done = record.completedDays.includes(dayNum);
                  return (
                    <div key={`${record.skill}-${dayNum}`} className="flex gap-3 rounded-[14px] bg-[var(--card-bg)] p-3">
                      <button type="button" onClick={() => onDayToggle(record, dayNum, done)} aria-label={`${done ? 'Unmark' : 'Mark'} day ${dayNum}`} className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] border ${done ? 'border-emerald-500 bg-emerald-500 text-[oklch(0.99_0.004_160)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}>
                        <span className="material-symbols-rounded text-[16px]">{done ? 'check' : 'radio_button_unchecked'}</span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`wrap-natural text-sm font-semibold ${done ? 'text-[var(--text-secondary)] line-through' : 'text-[var(--text-primary)]'}`}>Day {dayNum}: {day.focus || 'Focused practice'}</p>
                        {Array.isArray(day.tasks) && day.tasks.length > 0 && (
                          <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">{day.tasks.slice(0, 2).join(' ')}</p>
                        )}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-[14px] border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">No plan yet. Generate a focused bridge plan to create daily steps.</div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => onMarkComplete(record, !isDone)} className="rounded-[12px] border border-[var(--border-subtle)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
                  {isDone ? 'Reopen plan' : 'Mark complete'}
                </button>
                <button type="button" onClick={() => onPractice(record)} className="rounded-[12px] border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">Practice in Interview Studio</button>
              </div>
            </section>

            <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Verification</h3>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">Quick checks build confidence. Applied challenges can verify the skill.</p>
                </div>
                <div className="flex rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1">
                  {(['quick_check', 'applied_challenge'] as ChallengeType[]).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => onUpdateDraft(record.skill, { challengeType: type, grade: undefined })}
                      className={`rounded-[10px] px-2.5 py-1.5 text-xs font-bold ${activeDraft.challengeType === type ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                    >
                      {type === 'quick_check' ? 'Quick' : 'Applied'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <button type="button" onClick={() => onGenerateChallenge(record)} disabled={activeDraft.loading === 'generate'} className="rounded-[12px] border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-500/15 disabled:opacity-60 dark:text-violet-300">
                  {activeDraft.loading === 'generate' ? 'Generating challenge' : 'Generate challenge'}
                </button>
                <textarea
                  value={activeDraft.prompt}
                  onChange={(event) => onUpdateDraft(record.skill, { prompt: event.target.value })}
                  placeholder="Generate or paste a proof prompt."
                  className="min-h-[96px] w-full resize-y rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-emerald-500"
                />
                <textarea
                  value={activeDraft.response}
                  onChange={(event) => onUpdateDraft(record.skill, { response: event.target.value, grade: undefined })}
                  placeholder="Write the answer you would give an interviewer. Include the situation, steps, trade-offs, and result."
                  className="min-h-[148px] w-full resize-y rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-emerald-500"
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onGradeChallenge(record)} disabled={activeDraft.loading === 'grade'} className="rounded-[12px] bg-violet-600 px-3 py-2 text-xs font-bold text-[oklch(0.99_0.004_300)] hover:bg-violet-700 disabled:opacity-60">
                    {activeDraft.loading === 'grade' ? 'Grading proof' : 'Grade and save proof'}
                  </button>
                  <button type="button" onClick={() => onAskSona(`Help me improve my ${record.skill} proof answer before I submit it.`, 'Skill Bridge')} className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--border-subtle)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
                    <AssistantMark size="xs" state="idle" />
                    Ask Taco
                  </button>
                </div>
              </div>

              {activeDraft.grade && (
                <div className="mt-4 rounded-[16px] border border-violet-500/20 bg-violet-500/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[var(--text-primary)]">Proof reviewed</p>
                      <p className="text-xs text-[var(--text-secondary)]">{activeDraft.grade.summary || 'Taco reviewed your proof attempt.'}</p>
                    </div>
                    <Pill tone={activeDraft.grade.verdict === 'verified' ? 'green' : 'violet'}>{activeDraft.grade.score}%</Pill>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Proof history</h3>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{record.proofs.length ? 'Saved verification attempts for this skill.' : 'No proof attempts yet.'}</p>
                </div>
                <button type="button" onClick={() => onSaveProofToVault(record)} disabled={activeDraft.loading === 'vault'} className="rounded-[12px] border border-[var(--border-subtle)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-60">Save proof</button>
              </div>
              <div className="mt-3 space-y-2">
                {record.proofs.slice(0, 4).map(proof => (
                  <div key={proof.id} className="rounded-[14px] bg-[var(--card-bg)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-[var(--text-primary)]">{proof.challengeType === 'applied_challenge' ? 'Applied Challenge' : 'Quick Check'}</p>
                      <Pill tone={proof.verdict === 'verified' ? 'green' : proof.verdict === 'ready' ? 'violet' : 'amber'}>{proof.score}%</Pill>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">{proof.prompt}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
