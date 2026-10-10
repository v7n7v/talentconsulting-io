'use client';

import { TacoName } from '@/components/BrandLogo';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import FileUploadDropzone from '@/components/FileUploadDropzone';
import ResumeLibraryPicker from '@/components/ResumeLibraryPicker';
import AssistantThinkingTile from '@/components/assistant/AssistantThinkingTile';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader, SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import { readPreparedPacketResponse } from '@/lib/job-packet-recovery';
import { authFetch } from '@/lib/auth-fetch';
import { createJobApplication, type ResumeVersion } from '@/lib/database-suite';
import { useStore } from '@/lib/store';
import { useToolGuidance } from '@/components/guidance/ToolGuidanceProvider';
import { jobSearchContentKey } from '@/lib/job-search-context';
import {
  loadApplicationKitContext,
  handoffApplicationKitContext,
  mergeApplicationKitContext,
  resumeSnapshotToText,
  resumeVersionToApplicationKitContext,
} from '@/lib/application-kit';
import {
  buildOracleV2Report,
  extractOracleSkills,
  inferOracleCompany,
  inferOracleRole,
  type OracleV2Report,
  type OracleVerdict,
} from '@/lib/oracle-v2';
interface RelatedRole { id: string; title: string; company: string; location: string; url: string | null; fitScore: number | null; source: string }
function postingUrl(value: unknown) {
  try { const url = new URL(String(value)); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

type Step = 'ready' | 'analyzing' | 'report';
type IntelTab = 'decode' | 'salary' | 'risks' | 'company' | 'packet' | 'map';
type PacketStatus = 'idle' | 'preparing' | 'ready' | 'needs_attention' | 'failed' | 'tracked';
type ResumeInputMode = 'upload' | 'paste' | 'build';

const ROLE_ANALYSIS_GUIDE_ANCHORS = Object.freeze({
  source: 'role-analysis-source',
  posting: 'role-analysis-posting',
  analyze: 'role-analysis-run',
  evidence: 'role-analysis-evidence',
  decisions: 'role-analysis-decisions',
});

interface RoleAnalysisGuidanceFacts {
  owner: string;
  sourceId: string | null;
  sourceSnapshot: unknown;
  canAnalyze: boolean;
  pending: boolean;
  hasReport: boolean;
  freshReport: boolean;
  error: string;
  canPrepare: boolean;
  packetStatus: PacketStatus;
}

function roleAnalysisGuidance(facts: RoleAnalysisGuidanceFacts): Parameters<typeof useToolGuidance>[0] {
  const reportAvailability = facts.pending ? 'waiting' : facts.hasReport && !facts.freshReport ? 'stale' : facts.hasReport ? 'available' : facts.error ? 'blocked' : 'waiting';
  const reportReason = facts.pending
    ? 'Analysis is running for the current inputs. Wait for its actual response.'
    : facts.hasReport && !facts.freshReport
      ? 'Your inputs changed. The earlier report stays visible; run analysis yourself to refresh it.'
      : facts.error || 'Add your source and posting or target role, then run analysis yourself. Help will not run it.';
  return {
    toolId: 'market-oracle',
    version: '1',
    title: 'Role analysis',
    contextKey: `role-analysis:${facts.owner}:${facts.sourceId || 'manual'}:${facts.sourceId ? jobSearchContentKey(facts.sourceSnapshot) : 'editable'}`,
    preferredChapterId: facts.freshReport && !facts.pending ? 'review-analysis' : 'analysis-inputs',
    chapters: [
      {
        id: 'analysis-inputs', title: 'Choose source and posting',
        steps: [
          { id: 'source', title: 'Bring your real experience', description: 'Choose a confirmed source or supply resume text. Pasted or uploaded context can be analyzed; packet preparation requires a confirmed library source.', anchor: ROLE_ANALYSIS_GUIDE_ANCHORS.source },
          { id: 'posting', title: 'Bring the role requirements', description: 'Paste the posting for sourced requirement evidence, or use a target role for the supported analysis. Missing information remains unknown.', anchor: ROLE_ANALYSIS_GUIDE_ANCHORS.posting },
          { id: 'analyze', title: 'Run analysis when ready', description: 'Use Run Oracle Analysis yourself. Next moves through explanations without analyzing, preparing, tracking, or leaving this view.', anchor: ROLE_ANALYSIS_GUIDE_ANCHORS.analyze, availability: facts.pending ? 'waiting' : facts.canAnalyze ? 'available' : 'blocked', unavailableReason: facts.pending ? reportReason : 'Add enough resume text and a posting or target role to make analysis available.' },
        ],
      },
      {
        id: 'review-analysis', title: 'Review evidence and decide', availability: reportAvailability, unavailableReason: reportReason,
        steps: [
          { id: 'evidence', title: 'Inspect the sourced assessment', description: 'The JD tab separates supported, partial, and missing requirements and shows available posting and resume excerpts. These observations are not hiring predictions.', anchor: ROLE_ANALYSIS_GUIDE_ANCHORS.evidence, availability: reportAvailability, unavailableReason: reportReason, targetUnavailableReason: 'Open the JD tab yourself to inspect requirement evidence. Help does not change tabs.' },
          { id: 'decisions', title: 'Choose a real next action', description: facts.packetStatus === 'ready' ? 'A prepared packet is ready for review. Inspect the draft before using it; preparation does not submit an application.' : facts.packetStatus === 'tracked' ? 'The tracker draft was saved. Review your available next steps; tracking does not submit an application.' : facts.canPrepare ? 'Review the assessment, then choose preparation or tracking yourself. Any generated draft needs your review.' : 'Review the assessment and open questions. Packet preparation needs the same confirmed library source used for a fresh analysis.', anchor: ROLE_ANALYSIS_GUIDE_ANCHORS.decisions, availability: facts.packetStatus === 'preparing' ? 'waiting' : reportAvailability, unavailableReason: facts.packetStatus === 'preparing' ? 'Packet preparation is running. Help waits for its actual outcome.' : reportReason },
        ],
      },
    ],
  };
}

function RoleAnalysisGuidance({ facts }: { facts: RoleAnalysisGuidanceFacts }) {
  useToolGuidance(roleAnalysisGuidance(facts));
  return null;
}

interface LegacyAnalysis {
  fitScore: number;
  fitVerdict: string;
  overallAssessment: string;
  competitiveEdge: string;
  matchedSkills: string[];
  gapSkills: string[];
  keywordsToAdd: string[];
  salaryIntel: { min: number; max: number; userPosition: number; withBridgeSkills: number; currency: string };
  redFlags: Array<{ flag: string; severity: 'low' | 'medium' | 'high'; explanation: string }>;
  hiddenRequirements: Array<{ stated: string; actual: string }>;
  bridgeSkills: Array<{ skill: string }>;
  industryInsights: string[];
}

const ANALYSIS_STAGES = [
  { label: 'Parsing JD', detail: 'Extracting role, seniority, compensation, and screen signals.', icon: 'content_paste' },
  { label: 'Comparing Resume', detail: 'Checking proof strength against must-have requirements.', icon: 'difference' },
  { label: 'Checking Evidence', detail: 'Comparing the supplied posting with your source.', icon: 'travel_explore' },
  { label: 'Assessing Risk', detail: 'Separating role risk, posting risk, and candidate proof risk.', icon: 'shield' },
  { label: 'Building Packet Plan', detail: 'Preparing next moves for resume, cover letter, LinkedIn, and tracker.', icon: 'fact_check' },
];

const verdictCopy: Record<OracleVerdict, { label: string; icon: string; token: string }> = {
  apply: { label: 'Apply', icon: 'verified', token: '--success' },
  prepare_first: { label: 'Prepare First', icon: 'auto_fix_high', token: '--accent' },
  watch: { label: 'Watch', icon: 'visibility', token: '--warning' },
  skip: { label: 'Skip', icon: 'block', token: '--danger' },
};

// Fit/readiness/risk scores map to the status token ramp — never the blue accent,
// so hue keeps distinguishing evidence state from interaction. Mirrors the
// converted ProofCard scale (>=60 reads as success).
function scoreTone(score: number) {
  if (score >= 62) return 'var(--success)';
  if (score >= 45) return 'var(--warning)';
  return 'var(--danger)';
}

function formatResumeToText(content: any) {
  return resumeSnapshotToText(content);
}

function CommandMetric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3">
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <span className="material-symbols-rounded text-[16px]" aria-hidden="true">{icon}</span>
        <p className="text-[11px] font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-[var(--text-primary)]" title={value}>{value}</p>
    </div>
  );
}

function ScoreRing({ score, label, icon, inverse = false }: { score: number | null; label: string; icon: string; inverse?: boolean }) {
  // Unknown measurements stay distinct from a measured zero.
  if (score == null || !Number.isFinite(score) || score < 0) {
    return (
      <div className="min-w-[150px] rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-normal text-[var(--text-muted)]">{label}</p>
            <p className="mt-2 text-xs font-semibold leading-snug text-[var(--text-muted)]">Not computed</p>
          </div>
          <div className="relative grid h-14 w-14 shrink-0 place-items-center">
            <svg className="absolute inset-0 h-14 w-14" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="6" className="text-[var(--border-subtle)]" />
            </svg>
            <span className="material-symbols-rounded text-[20px] text-[var(--text-muted)]">{icon}</span>
          </div>
        </div>
      </div>
    );
  }
  const color = scoreTone(inverse ? 100 - score : score);
  return (
    <div className="min-w-[150px] rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-normal text-[var(--text-muted)]">{label}</p>
          <p className="mt-2 whitespace-nowrap text-[2.15rem] font-semibold leading-none tracking-normal text-[var(--text-primary)] tabular-nums">{score}</p>
        </div>
        <div className="relative grid h-14 w-14 shrink-0 place-items-center">
          <svg className="absolute inset-0 h-14 w-14 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="6" className="text-[var(--border-subtle)]" />
            <circle cx="32" cy="32" r="26" fill="none" style={{ stroke: color }} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${Math.max(0, Math.min(100, score)) * 1.63} 163`} />
          </svg>
          <span className="material-symbols-rounded text-[20px]" style={{ color }}>{icon}</span>
        </div>
      </div>
    </div>
  );
}

function FactorRow({ label, value }: { label: string; value: number | null }) {
  // A measured zero and an unavailable factor are distinct states.
  if (value == null || !Number.isFinite(value) || value < 0) {
    return (
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-medium text-[var(--text-secondary)]">{label}</span>
          <span className="font-semibold text-[var(--text-muted)]">Not scored</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--card-bg)]" />
      </div>
    );
  }
  const color = scoreTone(value);
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

function Pill({ children, tone = 'accent' }: { children: React.ReactNode; tone?: 'accent' | 'success' | 'warning' | 'danger' | 'muted' }) {
  const base = 'inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-5';
  if (tone === 'muted') {
    return (
      <span className={`${base} border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)]`}>
        <span className="min-w-0 wrap-anywhere">{children}</span>
      </span>
    );
  }
  const token = { accent: '--accent', success: '--success', warning: '--warning', danger: '--danger' }[tone];
  return (
    <span
      className={base}
      style={{
        borderColor: `color-mix(in srgb, var(${token}) 38%, transparent)`,
        background: `color-mix(in srgb, var(${token}) 12%, transparent)`,
        color: `var(${token})`,
      }}
    >
      <span className="min-w-0 wrap-anywhere">{children}</span>
    </span>
  );
}

function EmptyCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center">
      <span className="material-symbols-rounded text-4xl text-[var(--text-muted)]">{icon}</span>
      <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[var(--text-secondary)]">{body}</p>
    </div>
  );
}

export default function MarketOraclePage() {
  const { user } = useStore();
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [step, setStep] = useState<Step>('ready');
  const [activeTab, setActiveTab] = useState<IntelTab>('decode');
  const [stageIndex, setStageIndex] = useState(0);
  const [resumeText, setResumeText] = useState('');
  const [jdText, setJdText] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [salaryTarget, setSalaryTarget] = useState(0);
  const [jobUrl, setJobUrl] = useState('');
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [selectedResumeName, setSelectedResumeName] = useState('');
  const [selectedResumeSnapshot, setSelectedResumeSnapshot] = useState<any>(null);
  const [resumeInputMode, setResumeInputMode] = useState<ResumeInputMode>('upload');
  const [isUploading, setIsUploading] = useState(false);
  const [processingStage, setProcessingStage] = useState<'uploading' | 'extracting' | 'parsing' | null>(null);
  const [oracleReport, setOracleReport] = useState<OracleV2Report | null>(null);
  const [marketJobs, setMarketJobs] = useState<RelatedRole[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState('');
  const [packetStatus, setPacketStatus] = useState<PacketStatus>('idle');
  const [packetStage, setPacketStage] = useState(0);
  const [packetResult, setPacketResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [sourceBinding, setSourceBinding] = useState<{ resumeVersionId: string | null; sourceHash: string } | null>(null);
  const [analyzedInput, setAnalyzedInput] = useState('');
  const mounted = useRef(true); const operations = useRef(0); const packetBusy = useRef(false);
  const inputKey = JSON.stringify({ resumeText, jdText, targetRole, company, location, salaryTarget, selectedResumeId, jobUrl });
  const liveInput = useRef(inputKey);
  useEffect(() => { liveInput.current = inputKey; }, [inputKey]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; operations.current++; }; }, []);
  const freshReport = !!oracleReport && analyzedInput === inputKey;
  const canPrepare = freshReport && !!selectedResumeId && !!sourceBinding?.resumeVersionId && sourceBinding.resumeVersionId === selectedResumeId && packetStatus !== 'preparing';
  function captureOperation() {
    const owner = user?.uid; const input = liveInput.current; const operation = ++operations.current;
    return () => mounted.current && useStore.getState().user?.uid === owner && liveInput.current === input && operations.current === operation;
  }


  useEffect(() => {
    operations.current += 1;
    // A changed external request key cancels the in-flight workflow in one commit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(current => current === 'analyzing' ? 'ready' : current);
    setPacketStatus('idle'); setPacketResult(null);
    if (inputKey !== analyzedInput) setSourceBinding(null);
    setMarketLoading(false); setMarketError('');
    // Result publication changes analyzedInput; only actual input edits cancel work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);

  const resumeSkills = useMemo(() => extractOracleSkills(resumeText), [resumeText]);
  const inferredRole = useMemo(() => targetRole || (jdText.trim() ? inferOracleRole(jdText) : ''), [targetRole, jdText]);
  const inferredCompany = useMemo(() => company || inferOracleCompany(jdText), [company, jdText]);
  const canAnalyze = resumeText.trim().length > 100 && (jdText.trim().length > 120 || targetRole.trim().length > 1);

  useEffect(() => {
    const kit = loadApplicationKitContext();
    // Hydrate this editor from the owner-scoped device draft once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (kit.resumeText) setResumeText(kit.resumeText);
    if (kit.resumeVersionId) setSelectedResumeId(kit.resumeVersionId);
    if (kit.resumeVersionName) setSelectedResumeName(kit.resumeVersionName);
    if (kit.resumeSnapshot) setSelectedResumeSnapshot(kit.resumeSnapshot);
    if (kit.jobDescription) setJdText(kit.jobDescription);
    if (kit.company) setCompany(kit.company);
    if (kit.jobTitle || kit.targetRole) setTargetRole(kit.jobTitle || kit.targetRole || '');
    const draft = kit.oracleDraft;
    if (draft) { setTargetRole(draft.targetRole); setCompany(draft.company); setLocation(draft.location); setSalaryTarget(draft.salaryTarget); setJobUrl(draft.jobUrl); }
    else if (kit.applicationUrl) setJobUrl(kit.applicationUrl);
    if (kit.oracleResult?.data?.breakdown?.requirementEvidence && kit.oracleResult.data?.decision && kit.oracleResult.data?.packetPlan) {
      setOracleReport(kit.oracleResult.data as OracleV2Report); setStep('report');
      if (kit.oracleResult.status === 'success' && draft) { setAnalyzedInput(draft.analyzedInput); setSourceBinding(draft.sourceBinding); }
    }
  }, []);

  const persistContext = useCallback((patch: Record<string, any> = {}) => {
    mergeApplicationKitContext({
      resumeVersionId: selectedResumeId,
      resumeVersionName: selectedResumeName,
      resumeSnapshot: selectedResumeSnapshot,
      resumeText,
      jobDescription: jdText,
      company: inferredCompany,
      jobTitle: inferredRole,
      targetRole: inferredRole,
      applicationUrl: jobUrl,
      oracleDraft: { targetRole, company, location, salaryTarget, jobUrl, analyzedInput, sourceBinding },
      oracleResult: oracleReport ? { status: freshReport ? 'success' : 'stale', data: oracleReport, updatedAt: new Date().toISOString() } : { status: 'idle' },
      ...patch,
    });
  }, [inferredCompany, inferredRole, jdText, oracleReport, resumeText, selectedResumeId, selectedResumeName, selectedResumeSnapshot, freshReport, location, salaryTarget, jobUrl, targetRole, company, analyzedInput, sourceBinding]);

  const didHydrateContext = useRef(false);
  useEffect(() => {
    if (!didHydrateContext.current) { didHydrateContext.current = true; return; }
    persistContext();
  }, [persistContext]);

  const handleSelectResume = (rv: ResumeVersion) => {
    const text = formatResumeToText(rv.content);
    setResumeText(text);
    setSelectedResumeId(rv.id);
    setSelectedResumeName(rv.version_name);
    setSelectedResumeSnapshot(rv.content);
    setResumeInputMode('build');
    mergeApplicationKitContext(resumeVersionToApplicationKitContext(rv));
  };

  const handleResumeUploaded = (text: string, fileName: string) => {
    setResumeText(text.trim());
    setSelectedResumeName(fileName);
    setSelectedResumeId(null);
    setSelectedResumeSnapshot(null);
    setResumeInputMode('build');
    setIsUploading(false);
    setProcessingStage(null);
    showToast('Resume loaded into Oracle', 'check_circle');
  };

  const searchMarketJobs = useCallback(async (report: OracleV2Report): Promise<RelatedRole[]> => {
    const params = new URLSearchParams({ query: report.session.role || inferredRole || 'software engineer', location, country: 'us', limit: '18', sortBy: 'relevance' });
    if (salaryTarget > 0) params.set('salaryMin', String(salaryTarget));
    if (resumeSkills.length > 0) params.set('userSkills', JSON.stringify(resumeSkills));
    const res = await authFetch(`/api/jobs/search?${params}`, { headers: selectedResumeId ? { 'x-talent-resume-id': selectedResumeId } : {} });
    const data = await res.json();
    if (!res.ok || !data.success || !Array.isArray(data.jobs)) throw new Error('Related roles could not be loaded. Your analysis is still available.');
    return data.jobs.slice(0, 18).map((job: any, index: number) => {
      const fit = selectedResumeId ? (job.fitScore?.overall ?? job.matchScore) : null;
      return { id: String(job.id || `related-${index}`), title: typeof job.title === 'string' ? job.title : 'Role title not supplied', company: typeof job.company === 'string' ? job.company : 'Company not supplied', location: typeof job.location === 'string' ? job.location : '', url: postingUrl(job.url), fitScore: typeof fit === 'number' && Number.isFinite(fit) && fit >= 0 && fit <= 100 ? fit : null, source: job.sourceMeta?.sourceName || job.source || '' };
    });
  }, [inferredRole, location, salaryTarget, resumeSkills, selectedResumeId]);

  const analyzeOracle = async () => {
    if (!canAnalyze) {
      showToast('Add a resume and either a JD or target role first', 'info');
      return;
    }
    const current = captureOperation();
    const requestedInput = inputKey;
    setSourceBinding(null); setPacketStatus('idle'); setPacketResult(null);
    setStep('analyzing');
    setError('');
    setOracleReport(null);
    setMarketJobs([]);
    setActiveTab('decode');
    let interval: number | null = null;
    setStageIndex(0);
    if (!prefersReducedMotion) {
      interval = window.setInterval(() => setStageIndex(prev => Math.min(prev + 1, ANALYSIS_STAGES.length - 1)), 1200);
    }

    try {
      const res = await authFetch('/api/oracle/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText,
          resumeVersionId: selectedResumeId,
          jdText,
          targetRole: inferredRole,
          company: inferredCompany,
          jobUrl: jobUrl.trim() || undefined,
          location,
          salaryTarget,
        }),
      });
      const data = await res.json();
      if (!current()) return;
      if (!res.ok || !data.success) throw new Error(data.error || 'Oracle analysis failed');
      const legacy = data.analysis as LegacyAnalysis;
      const report = (data.oracleV2 || buildOracleV2Report({
        session: { resumeText, jdText, role: inferredRole, company: inferredCompany, location, salaryTarget, source: 'manual' },
        legacy,
      })) as OracleV2Report;
      if (!current()) return;
      setSourceBinding(data.sourceBinding || null);
      setAnalyzedInput(requestedInput);
      // Render the primary decision as soon as it is available. Related role
      // search is optional context and must never delay the report.
      setOracleReport(report);
      setStageIndex(ANALYSIS_STAGES.length - 1);
      setStep('report');
      mergeApplicationKitContext({
        resumeVersionId: selectedResumeId, resumeVersionName: selectedResumeName, resumeSnapshot: selectedResumeSnapshot,
        resumeText, jobDescription: jdText, company: inferredCompany || report.session.company,
        jobTitle: inferredRole || report.session.role, targetRole: inferredRole || report.session.role, applicationUrl: jobUrl,
        oracleDraft: { targetRole, company, location, salaryTarget, jobUrl, analyzedInput: requestedInput, sourceBinding: data.sourceBinding || null },
        oracleResult: { status: 'success', data: report, updatedAt: report.createdAt },
      });
      showToast('Role analysis ready for review', 'check_circle');
      setMarketJobs([]); setMarketLoading(true); setMarketError('');
      try { const jobs = await searchMarketJobs(report); if (current()) setMarketJobs(jobs); }
      catch (cause) { if (current()) setMarketError(cause instanceof Error ? cause.message : 'Related roles unavailable.'); }
      finally { if (current()) setMarketLoading(false); }

    } catch (err) {
      if (!current()) return;
      const message = err instanceof Error ? err.message : 'Oracle analysis failed';
      setError(message);
      setStep('ready');
      showToast(message, 'cancel');
    } finally {
      if (interval) window.clearInterval(interval);
    }
  };

  const prepareApplication = async () => {
    if (!oracleReport || packetBusy.current) return;
    if (!canPrepare || !sourceBinding) { setError('Select a confirmed resume from your library and run analysis again before preparing a packet.'); return; }
    packetBusy.current = true;
    const current = captureOperation();
    persistContext();
    setPacketStatus('preparing');
    setPacketStage(0);
    const progress = window.setInterval(() => setPacketStage(prev => Math.min(prev + 1, 5)), 900);
    try {
      const res = await authFetch('/api/agent/apply-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: oracleReport.session.role || inferredRole,
          company: oracleReport.session.company || inferredCompany || 'Target company',
          jobDescription: jdText,
          jobUrl,
          resumeVersionId: sourceBinding.resumeVersionId,
          expectedSourceHash: sourceBinding.sourceHash,
          fitScore: oracleReport.decision.fitScore == null ? undefined : { overall: oracleReport.decision.fitScore },
          prepareOnly: true,
          sourceMeta: { sourceName: 'Market Oracle', sourceType: 'oracle', sourceConfidence: oracleReport.decision.confidence, analysisId: oracleReport.analysisId },
        }),
      });
      const data = await res.json();
      if (!current()) return;
      if (!res.ok) throw new Error(data.error || (res.status === 403 ? 'Max is required to prepare a packet. Your inputs are preserved.' : 'Packet preparation failed'));
      const packet = readPreparedPacketResponse(data);
      if (!packet.ready) {
        setPacketResult(data); setPacketStatus('needs_attention'); setError(packet.recovery?.message || 'Partial work saved. Retry to finish the missing documents.');
        showToast('Packet needs attention; nothing was submitted', 'pending_actions'); return;
      }
      setPacketResult(data);
      setPacketStage(6);
      setPacketStatus('ready');
      mergeApplicationKitContext({
        oracleResult: { status: 'success', data: oracleReport, updatedAt: new Date().toISOString() },
        atsResult: data.atsResult ? { status: 'success', data: data.atsResult, updatedAt: new Date().toISOString() } : undefined,
        coverLetterResult: data.coverLetter ? { status: 'success', data: { coverLetter: data.coverLetter, subject: `Application: ${oracleReport.session.role || inferredRole}`, keyHighlights: [], wordCount: String(data.coverLetter).trim().split(/\s+/).length, toneScore: null }, updatedAt: new Date().toISOString() } : undefined,
        // The confirmed source remains selected; generated output is a separate artifact.
      });
      showToast('Application packet ready for review', 'task_alt');
    } catch (err) {
      if (!current()) return;
      setError(err instanceof Error ? err.message : 'Packet failed');
      setPacketStatus('failed');
      showToast(err instanceof Error ? err.message : 'Packet failed', 'cancel');
    } finally {
      packetBusy.current = false;
      window.clearInterval(progress);
    }
  };

  const trackApplication = async () => {
    if (!oracleReport || !freshReport) return;
    if (packetResult?.applicationId) { router.push(`/suite/applications?application=${encodeURIComponent(packetResult.applicationId)}`); return; }
    const current = captureOperation();
    persistContext();
    const result = await createJobApplication({
      companyName: oracleReport.session.company || inferredCompany || 'Target company',
      jobTitle: oracleReport.session.role || inferredRole,
      jobDescription: jdText,
      resumeVersionId: packetResult?.morphedVersionId || selectedResumeId || undefined,
      morphedResumeName: `${oracleReport.session.company || inferredCompany || 'Target company'} - ${oracleReport.session.role || inferredRole}`,
      talentDensityScore: oracleReport.decision.fitScore ?? undefined,
      gapAnalysis: oracleReport,
      applicationLink: jobUrl,
    });
    if (!current()) return;
    if (result.success) {
      setPacketResult({ applicationId: result.data?.id });
      setPacketStatus('tracked');
      showToast('Tracker draft created', 'work');
    } else {
      showToast(result.error || 'Sign in to save the tracker draft', 'info');
    }
  };

  const routeWithContext = (path: string) => {
    persistContext();
    router.push(handoffApplicationKitContext(path));
  };

  const readinessItems = [
    { label: 'Resume evidence', ready: resumeText.trim().length > 100, detail: resumeText ? `${resumeText.length.toLocaleString()} characters ready` : 'Load a saved resume, upload, or paste context' },
    { label: 'Role target', ready: Boolean(inferredRole), detail: inferredRole || 'Add a role or paste a JD to infer it' },
    { label: 'Company context', ready: Boolean(inferredCompany), detail: inferredCompany || 'Optional, but useful for strategy' },
    { label: 'Job description', ready: jdText.trim().length > 120, detail: jdText ? `${jdText.length.toLocaleString()} characters captured` : 'Paste the JD for proof gaps and screen signals' },
  ];

  return (
    <SuiteToolShell variant="standard">
        <RoleAnalysisGuidance facts={{ owner: user?.uid || 'guest', sourceId: selectedResumeId, sourceSnapshot: selectedResumeSnapshot, canAnalyze, pending: step === 'analyzing' || isUploading, hasReport: Boolean(oracleReport), freshReport, error, canPrepare, packetStatus }} />
        <SuiteToolHeader
          tool="market-oracle"
          title="Role analysis"
          subtitle="Compare the posting with your experience, review the evidence, and plan your next step."
        />

        <section className="elevation-card min-w-0 max-w-full rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Evidence Dock</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--text-primary)]">Your resume and role</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                Choose a confirmed resume or paste text, then compare the requirements in the posting. Each source can contain up to 12,000 characters; longer sources are rejected without partial analysis.
              </p>
            </div>
            <div data-guide={ROLE_ANALYSIS_GUIDE_ANCHORS.source} className="flex min-w-0 flex-wrap items-center gap-2">
              <ResumeLibraryPicker confirmedSourcesOnly
                onSelect={handleSelectResume}
                selectedId={selectedResumeId}
                selectedName={selectedResumeName}
                presentation="modal"
                triggerLabel="Use Saved Resume"
                showSearch
                showFilters
              />
              {(['upload', 'paste', 'build'] as ResumeInputMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setResumeInputMode(mode)}
                  aria-pressed={resumeInputMode === mode}
                  className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${resumeInputMode === mode ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]' : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                  <span className="material-symbols-rounded text-[16px]">{mode === 'upload' ? 'upload_file' : mode === 'paste' ? 'content_paste' : 'auto_fix_high'}</span>
                  {mode === 'upload' ? 'Upload' : mode === 'paste' ? 'Paste' : 'Build Context'}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <CommandMetric icon="description" label="Resume" value={selectedResumeName || (resumeText ? 'Pasted resume' : 'Not loaded')} />
            <CommandMetric icon="work" label="Role" value={inferredRole || 'Awaiting JD'} />
            <CommandMetric icon="apartment" label="Company" value={inferredCompany || 'Unknown'} />
            <CommandMetric icon="payments" label="Salary target (USD/year)" value={salaryTarget ? `$${Math.round(salaryTarget / 1000)}K+` : 'Open'} />
            <CommandMetric icon="hub" label="Source" value={selectedResumeId ? 'Confirmed resume' : resumeText.trim() ? 'Pasted / uploaded text' : 'Not loaded'} />
          </div>

          <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <input aria-label="Target role" value={targetRole} onChange={e => setTargetRole(e.target.value)} placeholder="Target role" className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-3 text-base outline-none transition focus:border-[var(--accent)]" />
            <input aria-label="Company" value={company} onChange={e => setCompany(e.target.value)} placeholder="Company" className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-3 text-base outline-none transition focus:border-[var(--accent)]" />
            <input aria-label="Location or remote" value={location} onChange={e => setLocation(e.target.value)} placeholder="Location or remote" className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-3 text-base outline-none transition focus:border-[var(--accent)]" />
            <input aria-label="Job posting URL" value={jobUrl} onChange={e => setJobUrl(e.target.value)} placeholder="Job URL optional" className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-3 text-base outline-none transition focus:border-[var(--accent)]" />
          </div>

          <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.35fr)]">
            <div className="min-w-0 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Resume source</p>
                  <h3 className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{resumeText ? 'Resume context ready' : 'Add resume evidence'}</h3>
                </div>
                <Pill tone={resumeText ? 'success' : 'muted'}>{resumeText ? `${resumeSkills.length} skills` : 'Needed'}</Pill>
              </div>

              {resumeText ? (
                <div className="mt-4 rounded-[16px] border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="material-symbols-rounded shrink-0 text-[var(--success)]">verified</span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-[var(--success)]">{selectedResumeName || 'Pasted resume context'}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{resumeText.length.toLocaleString()} characters ready for Oracle analysis.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setResumeText('');
                        setSelectedResumeId(null);
                        setSelectedResumeName('');
                        setSelectedResumeSnapshot(null);
                        setResumeInputMode('upload');
                      }}
                      className="shrink-0 min-h-[44px] px-3 py-2 text-xs font-semibold text-[var(--danger)]"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : resumeInputMode === 'paste' || resumeInputMode === 'build' ? (
                <textarea
                  aria-label="Resume text for role analysis"
                  value={resumeText}
                  onChange={e => {
                    setResumeText(e.target.value);
                    setSelectedResumeId(null);
                    setSelectedResumeSnapshot(null);
                    setSelectedResumeName(e.target.value.trim() ? 'Pasted resume context' : '');
                  }}
                  rows={8}
                  placeholder={resumeInputMode === 'build' ? 'Build a quick context: title, strongest skills, target experience, and proof points.' : 'Paste resume text here when a PDF is not cooperating.'}
                  className="mt-4 w-full resize-none rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-3 text-base leading-6 outline-none transition focus:border-[var(--accent)]"
                />
              ) : (
                <div className="mt-4">
                  <FileUploadDropzone
                    onUploadSuccess={handleResumeUploaded}
                    isUploading={isUploading}
                    setIsUploading={setIsUploading}
                    variant="compact"
                    processingStage={processingStage}
                    value={resumeText}
                    onChange={text => { setResumeText(text); setSelectedResumeId(null); setSelectedResumeSnapshot(null); setSelectedResumeName(text.trim() ? 'Pasted resume context' : ''); }}
                    placeholder="Drop resume or click to upload"
                    rows={5}
                  />
                </div>
              )}

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">Salary target</span>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">{salaryTarget ? `$${Math.round(salaryTarget / 1000)}K+` : 'Open'}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[0, 80000, 120000, 160000].map(value => (
                    <button
                      key={value}
                      aria-pressed={salaryTarget === value}
                      type="button"
                      onClick={() => setSalaryTarget(value)}
                      className={`min-h-[44px] rounded-[12px] border px-2 py-2.5 text-xs font-semibold transition ${salaryTarget === value ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                    >
                      {value ? `$${value / 1000}K` : 'Open'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Job Description</p>
                  <h3 className="mt-1 text-sm font-semibold text-[var(--text-primary)]">Paste the role brief</h3>
                </div>
                <Pill tone={jdText.length > 1200 ? 'success' : jdText.length > 120 ? 'accent' : 'muted'}>{jdText.length ? `${jdText.length.toLocaleString()} chars` : 'Needed'}</Pill>
              </div>
              <textarea
                aria-label="Job description for role analysis"
                data-guide={ROLE_ANALYSIS_GUIDE_ANCHORS.posting}
                value={jdText}
                onChange={e => {
                  setJdText(e.target.value);
                  if (!targetRole) setTargetRole(inferOracleRole(e.target.value));
                  if (!company) setCompany(inferOracleCompany(e.target.value));
                }}
                rows={9}
                placeholder="Paste the full job description. Oracle will separate real requirements, likely screen signals, compensation clarity, and proof gaps."
                className="mt-4 w-full resize-none rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-3 text-base leading-6 outline-none transition focus:border-[var(--accent)]"
              />
              <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {readinessItems.map(item => (
                    <span key={item.label} className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${item.ready ? 'border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'}`} title={item.detail}>
                      <span className="material-symbols-rounded text-[14px]">{item.ready ? 'check_circle' : 'radio_button_unchecked'}</span>
                      {item.label}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  data-guide={ROLE_ANALYSIS_GUIDE_ANCHORS.analyze}
                  onClick={analyzeOracle}
                  disabled={!canAnalyze || step === 'analyzing'}
                  className="btn-primary inline-flex shrink-0 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-rounded text-base">query_stats</span>
                  Run Oracle Analysis
                </button>
              </div>
              {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}
            </div>
          </div>
        </section>

        <AnimatePresence mode="wait">
          {step === 'analyzing' && (
            <motion.section
              key="analyzing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6"
            >
              <div className="mx-auto max-w-4xl">
                <AssistantThinkingTile
                  variant="oracle"
                  icon={ANALYSIS_STAGES[stageIndex].icon}
                  label="Taco is analyzing"
                  activeStage={ANALYSIS_STAGES[stageIndex].label}
                  title={ANALYSIS_STAGES[stageIndex].label}
                  description={ANALYSIS_STAGES[stageIndex].detail}
                  stages={ANALYSIS_STAGES.map(stage => stage.label)}
                  className="mb-6"
                />
                <div className="grid gap-3 md:grid-cols-5">
                  {ANALYSIS_STAGES.map((stage, index) => {
                    const active = index <= stageIndex;
                    return (
                      <div key={stage.label} className={`rounded-[16px] border p-4 transition ${active ? 'border-[var(--accent)] bg-[var(--accent-dim)]' : 'border-[var(--border-subtle)] bg-[var(--card-bg)] opacity-60'}`}>
                        <span className="material-symbols-rounded text-xl text-[var(--accent)]">{active && index < stageIndex ? 'check_circle' : stage.icon}</span>
                        <p className="mt-3 text-xs font-semibold text-[var(--text-primary)]">{stage.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <div className="grid min-w-0 max-w-full gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,430px)]">
          <main className="min-w-0 space-y-5">
            {!oracleReport ? (
              <section className="elevation-card rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 lg:p-6">
                <div className="grid min-w-0 gap-5 2xl:grid-cols-1">
                  <div className="min-w-0">
                    <span className="inline-grid h-12 w-12 place-items-center rounded-[16px] border border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]">
                      <span className="material-symbols-rounded">radar</span>
                    </span>
                    <p className="mt-5 text-[11px] font-semibold uppercase tracking-normal text-[var(--text-muted)]">Decision brief awaits</p>
                    <h2 className="premium-heading-wrap mt-2 text-[clamp(1.35rem,2.1vw,1.85rem)] font-semibold leading-[1.16] text-[var(--text-primary)]">
                      See what the posting asks for and what your resume supports.
                    </h2>
                    <p className="premium-copy-wrap mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                      Add your resume and the posting to review matching skill terms, exact requirement evidence, compensation text, and questions to resolve before applying.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Pill tone={resumeText ? 'success' : 'muted'}>{resumeText ? 'resume ready' : 'resume needed'}</Pill>
                      <Pill tone={jdText.length > 120 ? 'success' : 'muted'}>{jdText.length > 120 ? 'JD ready' : 'JD needed'}</Pill>
                      <span className="min-w-0 max-w-full">
                        <Pill tone={inferredRole ? 'accent' : 'muted'}>{inferredRole || 'role pending'}</Pill>
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Readiness checklist</p>
                    <div className="mt-3 space-y-2">
                      {readinessItems.map(item => (
                        <div key={item.label} className="flex min-w-0 items-start gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                          <span className={`material-symbols-rounded shrink-0 text-[18px] ${item.ready ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>{item.ready ? 'check_circle' : 'radio_button_unchecked'}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[var(--text-primary)]">{item.label}</p>
                            <p className="mt-0.5 wrap-anywhere text-[11px] leading-5 text-[var(--text-secondary)]">{item.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <>
                <section className="elevation-card rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: `color-mix(in srgb, var(${verdictCopy[oracleReport.decision.verdict].token}) 32%, transparent)`, background: `color-mix(in srgb, var(${verdictCopy[oracleReport.decision.verdict].token}) 12%, transparent)`, color: `var(${verdictCopy[oracleReport.decision.verdict].token})` }}>
                          <span className="material-symbols-rounded text-[15px]">{verdictCopy[oracleReport.decision.verdict].icon}</span>
                          {verdictCopy[oracleReport.decision.verdict].label}
                        </span>
                        <Pill tone="muted">{oracleReport.decision.confidence} confidence</Pill>
                        <Pill tone={oracleReport.sourceQuality.salary === 'listed' ? 'success' : oracleReport.sourceQuality.salary === 'unknown' ? 'warning' : 'accent'}>
                          salary {oracleReport.sourceQuality.salary.replaceAll('_', ' ')}
                        </Pill>
                      </div>
                      <h2 className="premium-heading-wrap mt-4 text-[clamp(1.25rem,2vw,1.75rem)] font-semibold leading-[1.16] text-[var(--text-primary)]">{oracleReport.session.role || inferredRole}</h2>
                      <p className="mt-1 wrap-natural text-sm font-medium leading-6 text-[var(--text-secondary)]">{oracleReport.session.company || inferredCompany || 'Target company'}</p>
                      <p className="premium-copy-wrap mt-4 text-sm leading-6 text-[var(--text-secondary)]">{oracleReport.decision.summary}</p>
                    </div>
                    <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 xl:w-[560px] xl:shrink-0">
                      <ScoreRing score={oracleReport.decision.fitScore} label="Skill coverage" icon="fact_check" />
                      {oracleReport.decision.readinessScore != null && <ScoreRing score={oracleReport.decision.readinessScore} label="Ready" icon="fact_check" />}
                      {oracleReport.decision.riskScore != null && <ScoreRing score={oracleReport.decision.riskScore} label="Risk" icon="shield" inverse />}
                    </div>
                  </div>
                  <div className="mt-5 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-normal text-[var(--text-muted)]">Recommended next action</p>
                    <div className="mt-2 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(170px,220px)] xl:items-start">
                      <p className="min-w-0 wrap-natural text-sm font-medium leading-6 text-[var(--text-primary)]">{oracleReport.decision.recommendedNextAction}</p>
                      <div data-guide={ROLE_ANALYSIS_GUIDE_ANCHORS.decisions} className="flex min-w-0 flex-wrap gap-2 xl:flex-col">
                        {!canPrepare && packetStatus !== 'preparing' && <p className="text-xs text-[var(--text-secondary)]">{!freshReport ? 'Inputs changed. Run analysis again to refresh this report.' : 'Packet preparation needs the same confirmed library source used for analysis. Confirm uploaded or pasted facts in Your experience first.'}</p>}
                        <button disabled={!canPrepare} onClick={prepareApplication} className="btn-primary px-4 py-2 text-xs font-semibold">Prepare packet</button>
                        <button onClick={() => routeWithContext('/suite/resume')} className="btn-secondary min-h-[44px] px-4 py-2 text-xs font-semibold">Resume Studio</button>
                        <button disabled={!freshReport} onClick={trackApplication} className="btn-secondary min-h-[44px] px-4 py-2 text-xs font-semibold">Track</button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-normal text-[var(--text-muted)]">Preparation priority</p>
                    <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{oracleReport.decision.interviewYield.score ?? 'Not scored'}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{oracleReport.decision.interviewYield.rationale}</p>
                  </div>
                  <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Proof Gap Detector</p>
                    <div className="mt-3 space-y-2">
                      {oracleReport.breakdown.proofGaps.slice(0, 3).map(gap => <p key={gap} className="rounded-[12px] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">{gap}</p>)}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Apply Strategy</p>
                    <p className="mt-2 text-xl font-semibold capitalize text-[var(--text-primary)]">{oracleReport.decision.applyStrategy.replaceAll('_', ' ')}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Review the source evidence and open questions before deciding whether to apply. This is a preparation suggestion, not a hiring prediction.</p>
                  </div>
                </section>

                <section className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Evidence scope</p>
                      <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">Measured factors</h3>
                    </div>
                    <Pill tone="accent"><TacoName /> analyzed this role</Pill>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {Object.entries(oracleReport.breakdown.factorScores).filter(([,value]) => value != null).map(([key, value]) => (
                      <FactorRow key={key} label={key === 'keywords' ? 'Literal skill-term coverage' : key.replace(/([A-Z])/g, ' $1')} value={value} />
                    ))}
                    <p className="text-xs leading-5 text-[var(--text-muted)]">Location eligibility, seniority, compensation fit and hiring chances are not scored from keyword matches.</p>
                  </div>
                </section>
              </>
            )}
          </main>

          <aside className="elevation-card min-w-0 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-hidden">
            <div className="border-b border-[var(--border-subtle)] p-4">
              <div className="grid grid-cols-3 gap-1 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1">
                {([
                  ['decode', 'JD'],
                  ['salary', 'Salary'],
                  ['risks', 'Risks'],
                  ['company', 'Company'],
                  ['packet', 'Packet'],
                  ['map', 'Related roles'],
                ] as Array<[IntelTab, string]>).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    aria-pressed={activeTab === tab}
                    className={`min-h-[44px] rounded-[10px] px-2 py-2 text-xs font-semibold transition ${activeTab === tab ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[calc(100dvh-120px)] overflow-y-auto p-4">
              {!oracleReport ? (
                <EmptyCard icon="fact_check" title="Intelligence panel" body="Run analysis to review requirements, quoted compensation, open questions, and preparation suggestions." />
              ) : (
                <>
                  {activeTab === 'decode' && (
                    <div className="space-y-4">
                      <section data-guide={ROLE_ANALYSIS_GUIDE_ANCHORS.evidence} aria-label="Requirement evidence" className="space-y-3"><h3 className="font-semibold">Requirements and their evidence</h3>{oracleReport.breakdown.requirementEvidence?.length ? oracleReport.breakdown.requirementEvidence.map((item,index) => <article key={index} className="border border-[var(--border)] p-3"><p className="text-sm font-medium">{item.requirement}</p><p className="mt-1 text-xs capitalize text-[var(--text-muted)]">{item.status.replaceAll('_',' ')}</p>{item.sourceSpan && <blockquote className="mt-2 border-l-2 border-[var(--accent)] pl-3 text-xs">Posting: “{item.sourceSpan.text}”</blockquote>}{item.resumeSourceSpan && <blockquote className="mt-2 border-l-2 border-[var(--border)] pl-3 text-xs">Resume: “{item.resumeSourceSpan.text}”</blockquote>}</article>) : <p className="text-xs text-[var(--text-muted)]">No explicit requirements could be grounded in this input. Add the complete posting.</p>}</section>
                      <div>
                        <p className="mb-2 text-xs font-semibold text-[var(--text-primary)]">Supported simple requirements</p>
                        <div className="space-y-2">
                          {oracleReport.breakdown.coveredRequirements.slice(0, 6).map(item => <p key={item} className="rounded-[12px] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">{item}</p>)}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold text-[var(--text-primary)]">Terms not evidenced in the resume</p>
                        <div className="flex flex-wrap gap-1.5">
                          {oracleReport.breakdown.keywordMap.missing.map(item => <Pill key={item} tone="warning">{item}</Pill>)}
                        </div>
                      </div>
                      {oracleReport.breakdown.hiddenScreenSignals.length > 0 && (
                        <div className="rounded-[15px] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[var(--accent-dim)] p-4">
                          <p className="text-xs font-semibold text-[var(--accent)]">Questions to clarify</p>
                          <div className="mt-3 space-y-3">
                            {oracleReport.breakdown.hiddenScreenSignals.map(signal => (
                              <div key={signal.signal}>
                                <p className="text-xs font-semibold text-[var(--text-primary)]">{signal.signal}</p>
                                <p className="text-[11px] leading-5 text-[var(--text-secondary)]">{signal.evidence}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'salary' && (
                    <div className="space-y-4">
                      <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Compensation read</p>
                        <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{oracleReport.sourceQuality.salaryContext ? `${oracleReport.sourceQuality.salaryContext.currency} ${oracleReport.sourceQuality.salaryContext.min.toLocaleString()}–${oracleReport.sourceQuality.salaryContext.max.toLocaleString()}` : 'No range parsed'}</p>
                        {oracleReport.sourceQuality.salaryContext && <p className="mt-1 text-xs text-[var(--text-secondary)]">Per {oracleReport.sourceQuality.salaryContext.period}. Values are copied from the posting.</p>}
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Use the original posting for currency, period and compensation details. No market benchmark is inferred.</p>
                      </div>
                      {/* Was "Bridge upside", listing each skill against a "+$NK"
                          figure. That number came from `5000 + index * 2500` or from
                          a language model asked to estimate dollars — nothing
                          measured it, and shown to a between-roles person it reads
                          as what the skill is worth. The skills themselves are real
                          gaps from the JD, so they stay; the money does not, and no
                          replacement number is invented to fill the space. */}
                      <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                        <p className="text-xs font-semibold text-[var(--text-primary)]">Skills this role asks for that your resume does not show</p>
                        <div className="mt-3 space-y-2">
                          {oracleReport.breakdown.keywordMap.missing.slice(0, 4).map(skill => (
                            <div key={skill} className="flex items-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
                              <span className="min-w-0 text-xs text-[var(--text-secondary)]">{skill}</span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 text-[11px] leading-5 text-[var(--text-muted)]">
                          These terms appear in the supplied posting and were not found in your resume. Term matching does not establish your qualifications or a skill’s salary value.
                        </p>
                      </div>
                    </div>
                  )}

                  {activeTab === 'risks' && (
                    <div className="space-y-3">
                      {oracleReport.breakdown.risks.length === 0 ? (
                        <EmptyCard icon="shield" title="No additional posting questions" body="This check covers the supplied text. It does not establish company quality or hiring conditions." />
                      ) : oracleReport.breakdown.risks.map(risk => (
                        <div key={`${risk.category}-${risk.title}`} className={`rounded-[15px] border p-4 ${risk.severity === 'high' ? 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]' : risk.severity === 'medium' ? 'border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]' : 'border-[var(--border-subtle)] bg-[var(--card-bg)]'}`}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{risk.title}</p>
                            <Pill tone={risk.severity === 'high' ? 'danger' : risk.severity === 'medium' ? 'warning' : 'muted'}>{risk.severity}</Pill>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{risk.explanation}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === 'company' && (
                    <div className="space-y-4">
                      <EmptyCard icon="apartment" title={oracleReport.session.company || 'Company not supplied'} body="Only information you supplied with this posting is available. Company culture and financial health have not been verified." />
                      {postingUrl(jobUrl) && <a className="inline-flex min-h-11 items-center underline" href={postingUrl(jobUrl)!} target="_blank" rel="noreferrer">Review the original posting</a>}
                    </div>
                  )}

                  {activeTab === 'packet' && (
                    <div className="space-y-4">
                      <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                        <p className="text-xs font-semibold text-[var(--text-primary)]">Readiness moves</p>
                        <div className="mt-3 space-y-2">
                          {oracleReport.packetPlan.readinessMoves.map(move => (
                            <div key={move.title} className="rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold text-[var(--text-primary)]">{move.title}</p>
                                <Pill tone="muted">{move.effort}</Pill>
                              </div>
                              <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{move.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {!canPrepare && packetStatus !== 'preparing' && <p className="text-xs text-[var(--text-secondary)]">{!freshReport ? 'Inputs changed. Run analysis again to refresh this report.' : 'Packet preparation needs the same confirmed library source used for analysis. Confirm uploaded or pasted facts in Your experience first.'}</p>}
                        <button disabled={!canPrepare} onClick={prepareApplication} className="btn-primary px-3 py-2.5 text-xs font-semibold">Prepare</button>
                        <button onClick={() => routeWithContext('/suite/cover-letter')} className="btn-secondary min-h-[44px] px-3 py-2.5 text-xs font-semibold">Cover Letter</button>
                        <button onClick={() => routeWithContext('/suite/linkedin')} className="btn-secondary min-h-[44px] px-3 py-2.5 text-xs font-semibold">LinkedIn</button>
                        <button onClick={() => routeWithContext('/suite/interview-sim')} className="btn-secondary min-h-[44px] px-3 py-2.5 text-xs font-semibold">Interview</button>
                      </div>
                      {packetStatus !== 'idle' && (
                        <div className="rounded-[16px] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[var(--accent-dim)] p-4">
                          <p className="text-xs font-semibold text-[var(--accent)]">
                            {packetStatus === 'preparing' ? `Preparing packet - stage ${packetStage + 1}/7` : packetStatus === 'ready' ? 'Packet ready for review' : packetStatus === 'tracked' ? 'Tracker draft saved' : packetStatus === 'needs_attention' ? 'Partial packet saved — needs attention' : 'Packet failed'}
                          </p>
                          {packetResult?.atsResult && <p className="mt-2 text-xs text-[var(--text-secondary)]">ATS score: {packetResult.atsResult.overallScore ?? packetResult.matchScore ?? '--'}</p>}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'map' && (
                    <div className="space-y-3">
                      <p className="text-xs leading-5 text-[var(--text-secondary)]">Related postings are optional context, not a market-wide sample. Open a posting to confirm its current details.</p>
                      {marketLoading && <p role="status">Loading related roles…</p>}
                      {marketError && <p role="alert" className="text-sm text-[var(--danger)]">{marketError}</p>}
                      {!marketLoading && !marketError && !marketJobs.length && <p>No related postings returned.</p>}
                      {marketJobs.length > 0 && (
                        <div className="overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)]">
                          <div className="border-b border-[var(--border-subtle)] px-4 py-3 text-xs font-semibold text-[var(--text-primary)]">Related roles</div>
                          <ul className="divide-y divide-[var(--border-subtle)]" aria-label="Related roles">
                            {[...marketJobs].sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1)).map(job => (
                              <li key={job.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                <div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--text-primary)]">{job.title}</p><p className="truncate text-xs text-[var(--text-secondary)]">{job.company}{job.location ? ` · ${job.location}` : ''}</p></div>
                                <a href={job.url || '#'} target={job.url ? '_blank' : undefined} rel={job.url ? 'noreferrer' : undefined} aria-label={job.url ? `Open ${job.title} at ${job.company}` : `${job.title} has no posting link`} className={`shrink-0 rounded-[10px] border px-3 py-2 text-xs font-semibold ${job.url ? 'border-[var(--accent)] text-[var(--accent)]' : 'cursor-not-allowed border-[var(--border-subtle)] text-[var(--text-muted)]'}`} onClick={event => { if (!job.url) event.preventDefault(); }}>{job.url ? 'Open posting' : 'No link'}</a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
    </SuiteToolShell>
  );
}
