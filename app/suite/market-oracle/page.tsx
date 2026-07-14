'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import FileUploadDropzone from '@/components/FileUploadDropzone';
import ResumeLibraryPicker from '@/components/ResumeLibraryPicker';
import SonaThinkingTile from '@/components/SonaThinkingTile';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader, SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import { authFetch } from '@/lib/auth-fetch';
import { createJobApplication, type ResumeVersion } from '@/lib/database-suite';
import { useStore } from '@/lib/store';
import {
  inferCompanyFromJobDescription,
  inferRoleFromJobDescription,
  loadApplicationKitContext,
  mergeApplicationKitContext,
  resumeSnapshotToText,
  resumeVersionToApplicationKitContext,
} from '@/lib/application-kit';
import {
  buildOracleV2Report,
  extractOracleSkills,
  type OracleV2Report,
  type OracleVerdict,
} from '@/lib/oracle-v2';
import type { MarketAnalysis, JobStar } from './Scene';

const OracleScene = dynamic(() => import('./Scene'), { ssr: false });
const DynamicCanvas = dynamic(() => import('./CanvasWrapper').then(mod => mod.default), { ssr: false });

type Step = 'ready' | 'analyzing' | 'report';
type IntelTab = 'decode' | 'salary' | 'risks' | 'company' | 'packet' | 'map';
type PacketStatus = 'idle' | 'preparing' | 'ready' | 'failed' | 'tracked';
type ResumeInputMode = 'upload' | 'paste' | 'build';

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
  bridgeSkills: Array<{ skill: string; impact: number; salaryIncrease: number }>;
  marketTrends: Array<{ skill: string; growth: number }>;
  industryInsights: string[];
}

const ANALYSIS_STAGES = [
  { label: 'Parsing JD', detail: 'Extracting role, seniority, compensation, and screen signals.', icon: 'content_paste' },
  { label: 'Comparing Resume', detail: 'Checking proof strength against must-have requirements.', icon: 'difference' },
  { label: 'Checking Market', detail: 'Looking for role context and source confidence.', icon: 'travel_explore' },
  { label: 'Assessing Risk', detail: 'Separating role risk, posting risk, and candidate proof risk.', icon: 'shield' },
  { label: 'Building Packet Plan', detail: 'Preparing next moves for resume, cover letter, LinkedIn, and tracker.', icon: 'fact_check' },
];

const verdictCopy: Record<OracleVerdict, { label: string; icon: string; color: string; bg: string }> = {
  apply: { label: 'Apply', icon: 'verified', color: '#059669', bg: 'rgba(16,185,129,0.1)' },
  prepare_first: { label: 'Prepare First', icon: 'auto_fix_high', color: '#0284c7', bg: 'rgba(14,165,233,0.1)' },
  watch: { label: 'Watch', icon: 'visibility', color: '#d97706', bg: 'rgba(245,158,11,0.1)' },
  skip: { label: 'Skip', icon: 'block', color: '#dc2626', bg: 'rgba(239,68,68,0.1)' },
};

function scoreTone(score: number) {
  if (score >= 78) return '#059669';
  if (score >= 62) return '#0284c7';
  if (score >= 45) return '#d97706';
  return '#dc2626';
}

function displaySalary(min?: number, max?: number) {
  if (!min && !max) return 'Unknown';
  if (min && max) return `$${Math.round(min / 1000)}K - $${Math.round(max / 1000)}K`;
  return `$${Math.round((min || max || 0) / 1000)}K`;
}

function formatResumeToText(content: any) {
  return resumeSnapshotToText(content);
}

function buildMapAnalysis(report: OracleV2Report | null, legacy: LegacyAnalysis | null, jobs: JobStar[]): MarketAnalysis & { jobDataSource: string } {
  const fit = report?.decision.fitScore || legacy?.fitScore || 50;
  const currentPosition: [number, number, number] = [0, 0, (fit / 100) * 6 - 3];
  const bridgeSkills = (legacy?.bridgeSkills || report?.packetPlan.linkedinKeywords.slice(0, 3).map((skill, index) => ({
    skill,
    impact: 4 + index,
    salaryIncrease: 5000 + index * 2500,
  })) || []).slice(0, 3).map((skill, index) => ({
    ...skill,
    newPosition: [index * 1.8 - 1.8, 1 + index * 0.8, currentPosition[2] + 1.5 + index * 0.4] as [number, number, number],
    newFitScore: Math.min(0.95, (fit + skill.impact * 3) / 100),
  }));

  return {
    currentPosition,
    talentDensityPercentile: fit,
    topSkills: report?.breakdown.keywordMap.found || legacy?.matchedSkills || [],
    missingSkills: report?.breakdown.keywordMap.missing || legacy?.gapSkills || [],
    bridgeSkills,
    jobs,
    marketTrends: legacy?.marketTrends || [],
    industryInsights: legacy?.industryInsights || [],
    jobDataSource: jobs.length > 0 ? `${jobs.length} live roles` : 'Analysis map only',
  };
}

function CommandMetric({ icon, label, value, tone = 'text-[var(--text-primary)]' }: { icon: string; label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-rounded text-[18px] text-cyan-600 dark:text-cyan-300">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</span>
      </div>
      <p className={`mt-1 truncate text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function ScoreRing({ score, label, icon }: { score: number; label: string; icon: string }) {
  const color = scoreTone(score);
  return (
    <div className="min-w-[150px] rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-normal text-[var(--text-muted)]">{label}</p>
          <p className="mt-2 whitespace-nowrap text-[2.15rem] font-semibold leading-none tracking-normal text-[var(--text-primary)] tabular-nums">{score}</p>
        </div>
        <div className="relative grid h-14 w-14 shrink-0 place-items-center">
          <svg className="absolute inset-0 h-14 w-14 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="6" className="text-[var(--border-subtle)]" />
            <circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${Math.max(0, Math.min(100, score)) * 1.63} 163`} />
          </svg>
          <span className="material-symbols-rounded text-[20px]" style={{ color }}>{icon}</span>
        </div>
      </div>
    </div>
  );
}

function FactorRow({ label, value }: { label: string; value: number }) {
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

function Pill({ children, tone = 'cyan' }: { children: React.ReactNode; tone?: 'cyan' | 'emerald' | 'amber' | 'red' | 'muted' }) {
  const styles = {
    cyan: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    red: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300',
    muted: 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)]',
  }[tone];
  return <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-5 ${styles}`}><span className="min-w-0 wrap-anywhere">{children}</span></span>;
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
  const [legacyAnalysis, setLegacyAnalysis] = useState<LegacyAnalysis | null>(null);
  const [oracleReport, setOracleReport] = useState<OracleV2Report | null>(null);
  const [marketJobs, setMarketJobs] = useState<JobStar[]>([]);
  const [packetStatus, setPacketStatus] = useState<PacketStatus>('idle');
  const [packetStage, setPacketStage] = useState(0);
  const [packetResult, setPacketResult] = useState<any>(null);
  const [error, setError] = useState('');

  const resumeSkills = useMemo(() => extractOracleSkills(resumeText), [resumeText]);
  const inferredRole = useMemo(() => targetRole || inferRoleFromJobDescription(jdText), [targetRole, jdText]);
  const inferredCompany = useMemo(() => company || inferCompanyFromJobDescription(jdText), [company, jdText]);
  const mapAnalysis = useMemo(() => buildMapAnalysis(oracleReport, legacyAnalysis, marketJobs), [oracleReport, legacyAnalysis, marketJobs]);
  const canAnalyze = resumeText.trim().length > 100 && (jdText.trim().length > 120 || targetRole.trim().length > 1);

  useEffect(() => {
    const kit = loadApplicationKitContext();
    if (kit.resumeText) setResumeText(kit.resumeText);
    if (kit.resumeVersionId) setSelectedResumeId(kit.resumeVersionId);
    if (kit.resumeVersionName) setSelectedResumeName(kit.resumeVersionName);
    if (kit.resumeSnapshot) setSelectedResumeSnapshot(kit.resumeSnapshot);
    if (kit.jobDescription) setJdText(kit.jobDescription);
    if (kit.company) setCompany(kit.company);
    if (kit.jobTitle || kit.targetRole) setTargetRole(kit.jobTitle || kit.targetRole || '');
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
      oracleResult: oracleReport ? { status: 'success', data: oracleReport, updatedAt: new Date().toISOString() } : { status: 'idle' },
      ...patch,
    });
  }, [inferredCompany, inferredRole, jdText, oracleReport, resumeText, selectedResumeId, selectedResumeName, selectedResumeSnapshot]);

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

  const searchMarketJobs = useCallback(async (report: OracleV2Report) => {
    try {
      const params = new URLSearchParams({
        query: report.session.role || inferredRole || 'software engineer',
        location,
        country: 'us',
        limit: '18',
        sortBy: 'relevance',
      });
      if (salaryTarget > 0) params.set('salaryMin', String(salaryTarget));
      if (resumeSkills.length > 0) params.set('userSkills', JSON.stringify(resumeSkills));
      const res = await authFetch(`/api/jobs/search?${params}`);
      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.jobs)) return [];
      const salaries = data.jobs.map((job: any) => job.salary?.max || job.salary?.min || 120000);
      const minSal = Math.min(...salaries);
      const maxSal = Math.max(...salaries);
      const range = Math.max(1, maxSal - minSal);
      return data.jobs.slice(0, 18).map((job: any, index: number) => {
        const fit = (job.fitScore?.overall || job.matchScore || report.decision.fitScore || 55) / 100;
        const salary = job.salary?.max || job.salary?.min || 120000;
        const x = fit * 12 - 6 + (index % 3) * 0.35;
        const y = ((salary - minSal) / range) * 10 - 5;
        const z = -((1 - fit) * 5) + (index % 4) * 0.25;
        return {
          id: job.id || `market-${index}`,
          title: job.title,
          company: job.company,
          salary: Math.round(salary),
          skills: job.skills || [],
          fitScore: fit,
          position: [x, y, z] as [number, number, number],
          color: fit > 0.78 ? '#06d6a0' : fit > 0.62 ? '#0ea5e9' : fit > 0.45 ? '#f59e0b' : '#6b7280',
          isConstellation: fit > 0.62,
          url: job.url,
          location: job.location,
          description: job.description,
          isReal: true,
          source: job.sourceMeta?.sourceName || job.source,
        } satisfies JobStar;
      });
    } catch {
      return [];
    }
  }, [inferredRole, location, resumeSkills, salaryTarget]);

  const analyzeOracle = async () => {
    if (!canAnalyze) {
      showToast('Add a resume and either a JD or target role first', 'info');
      return;
    }
    setStep('analyzing');
    setError('');
    setLegacyAnalysis(null);
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
          jdText,
          targetRole: inferredRole,
          location,
          salaryTarget,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Oracle analysis failed');
      const legacy = data.analysis as LegacyAnalysis;
      const report = (data.oracleV2 || buildOracleV2Report({
        session: { resumeText, jdText, role: inferredRole, company: inferredCompany, location, salaryTarget, source: 'manual' },
        legacy,
      })) as OracleV2Report;
      const jobs = await searchMarketJobs(report);
      const marketDataMode: OracleV2Report['sourceQuality']['marketData'] = jobs.length >= 8 ? 'live_jobs' : 'limited_live_jobs';
      const finalReport = jobs.length > 0
        ? { ...report, sourceQuality: { ...report.sourceQuality, marketData: marketDataMode } }
        : report;
      setLegacyAnalysis(legacy);
      setOracleReport(finalReport);
      setMarketJobs(jobs);
      mergeApplicationKitContext({
        resumeVersionId: selectedResumeId,
        resumeVersionName: selectedResumeName,
        resumeSnapshot: selectedResumeSnapshot,
        resumeText,
        jobDescription: jdText,
        company: inferredCompany || finalReport.session.company,
        jobTitle: inferredRole || finalReport.session.role,
        targetRole: inferredRole || finalReport.session.role,
        oracleResult: { status: 'success', data: finalReport, updatedAt: new Date().toISOString() },
      });
      setStageIndex(ANALYSIS_STAGES.length - 1);
      setStep('report');
      showToast('Oracle decision brief ready', 'verified');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Oracle analysis failed';
      setError(message);
      setStep('ready');
      showToast(message, 'cancel');
    } finally {
      if (interval) window.clearInterval(interval);
    }
  };

  const prepareApplication = async () => {
    if (!oracleReport) return;
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
          resumeVersionId: selectedResumeId,
          fitScore: { overall: oracleReport.decision.fitScore },
          prepareOnly: true,
          sourceMeta: { sourceName: 'Market Oracle', sourceType: 'oracle', sourceConfidence: oracleReport.decision.confidence },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Packet preparation failed');
      setPacketResult(data);
      setPacketStage(6);
      setPacketStatus('ready');
      mergeApplicationKitContext({
        oracleResult: { status: 'success', data: oracleReport, updatedAt: new Date().toISOString() },
        atsResult: data.atsResult ? { status: 'success', data: data.atsResult, updatedAt: new Date().toISOString() } : undefined,
        coverLetterResult: data.coverLetter ? { status: 'success', data: { coverLetter: data.coverLetter }, updatedAt: new Date().toISOString() } : undefined,
        resumeVersionId: data.morphedVersionId || selectedResumeId,
      });
      showToast('Application packet ready for review', 'task_alt');
    } catch (err) {
      setPacketStatus('failed');
      showToast(err instanceof Error ? err.message : 'Packet failed', 'cancel');
    } finally {
      window.clearInterval(progress);
    }
  };

  const trackApplication = async () => {
    if (!oracleReport) return;
    persistContext();
    const result = await createJobApplication({
      companyName: oracleReport.session.company || inferredCompany || 'Target company',
      jobTitle: oracleReport.session.role || inferredRole,
      jobDescription: jdText,
      resumeVersionId: packetResult?.morphedVersionId || selectedResumeId || undefined,
      morphedResumeName: `${oracleReport.session.company || inferredCompany || 'Target company'} - ${oracleReport.session.role || inferredRole}`,
      talentDensityScore: oracleReport.decision.fitScore,
      gapAnalysis: oracleReport,
      applicationLink: jobUrl,
    });
    if (result.success) {
      setPacketStatus('tracked');
      showToast('Tracker draft created', 'work');
    } else {
      showToast(result.error || 'Sign in to save the tracker draft', 'info');
    }
  };

  const routeWithContext = (path: string) => {
    persistContext();
    router.push(path);
  };

  const readinessItems = [
    { label: 'Resume evidence', ready: resumeText.trim().length > 100, detail: resumeText ? `${resumeText.length.toLocaleString()} characters ready` : 'Load a saved resume, upload, or paste context' },
    { label: 'Role target', ready: Boolean(inferredRole), detail: inferredRole || 'Add a role or paste a JD to infer it' },
    { label: 'Company context', ready: Boolean(inferredCompany), detail: inferredCompany || 'Optional, but useful for strategy' },
    { label: 'Job description', ready: jdText.trim().length > 120, detail: jdText ? `${jdText.length.toLocaleString()} characters captured` : 'Paste the JD for proof gaps and screen signals' },
  ];

  return (
    <SuiteToolShell variant="standard">
        <SuiteToolHeader
          tool="market-oracle"
          subtitle="Decide whether a role is worth your time, how to position yourself, and what Sona should prepare before you apply."
        />

        <section className="min-w-0 max-w-full rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm md:p-5">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Evidence Dock</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--text-primary)]">Choose the evidence Oracle should trust</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                Resume context, role details, salary target, and job evidence in one calm decision surface.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ResumeLibraryPicker
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
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${resumeInputMode === mode ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
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
            <CommandMetric icon="payments" label="Salary Target" value={salaryTarget ? `$${Math.round(salaryTarget / 1000)}K+` : 'Open'} />
            <CommandMetric icon="hub" label="Source" value={oracleReport?.sourceQuality.marketData?.replaceAll('_', ' ') || 'Ready'} />
          </div>

          <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <input value={targetRole} onChange={e => setTargetRole(e.target.value)} placeholder="Target role" className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-3 text-sm outline-none transition focus:border-cyan-500/40" />
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company" className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-3 text-sm outline-none transition focus:border-cyan-500/40" />
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location or remote" className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-3 text-sm outline-none transition focus:border-cyan-500/40" />
            <input value={jobUrl} onChange={e => setJobUrl(e.target.value)} placeholder="Job URL optional" className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-3 text-sm outline-none transition focus:border-cyan-500/40" />
          </div>

          <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.35fr)]">
            <div className="min-w-0 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Resume source</p>
                  <h3 className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{resumeText ? 'Resume context ready' : 'Add resume evidence'}</h3>
                </div>
                <Pill tone={resumeText ? 'emerald' : 'muted'}>{resumeText ? `${resumeSkills.length} skills` : 'Needed'}</Pill>
              </div>

              {resumeText ? (
                <div className="mt-4 rounded-[16px] border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="material-symbols-rounded shrink-0 text-emerald-700 dark:text-emerald-300">verified</span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-emerald-800 dark:text-emerald-200">{selectedResumeName || 'Pasted resume context'}</p>
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
                      className="shrink-0 text-xs font-semibold text-red-600 dark:text-red-300"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : resumeInputMode === 'paste' || resumeInputMode === 'build' ? (
                <textarea
                  value={resumeText}
                  onChange={e => {
                    setResumeText(e.target.value);
                    setSelectedResumeId(null);
                    setSelectedResumeSnapshot(null);
                    setSelectedResumeName(e.target.value.trim() ? 'Pasted resume context' : '');
                  }}
                  rows={8}
                  placeholder={resumeInputMode === 'build' ? 'Build a quick context: title, strongest skills, target experience, and proof points.' : 'Paste resume text here when a PDF is not cooperating.'}
                  className="mt-4 w-full resize-none rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-3 text-sm leading-6 outline-none transition focus:border-cyan-500/40"
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
                    onChange={setResumeText}
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
                      type="button"
                      onClick={() => setSalaryTarget(value)}
                      className={`rounded-[12px] border px-2 py-2.5 text-xs font-semibold transition ${salaryTarget === value ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
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
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Job Description</p>
                  <h3 className="mt-1 text-sm font-semibold text-[var(--text-primary)]">Paste the role brief</h3>
                </div>
                <Pill tone={jdText.length > 1200 ? 'emerald' : jdText.length > 120 ? 'cyan' : 'muted'}>{jdText.length ? `${jdText.length.toLocaleString()} chars` : 'Needed'}</Pill>
              </div>
              <textarea
                value={jdText}
                onChange={e => {
                  setJdText(e.target.value);
                  if (!targetRole) setTargetRole(inferRoleFromJobDescription(e.target.value));
                  if (!company) setCompany(inferCompanyFromJobDescription(e.target.value));
                }}
                rows={9}
                placeholder="Paste the full job description. Oracle will separate real requirements, likely screen signals, compensation clarity, and proof gaps."
                className="mt-4 w-full resize-none rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-3 text-sm leading-6 outline-none transition focus:border-cyan-500/40"
              />
              <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {readinessItems.map(item => (
                    <span key={item.label} className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${item.ready ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'}`} title={item.detail}>
                      <span className="material-symbols-rounded text-[14px]">{item.ready ? 'check_circle' : 'radio_button_unchecked'}</span>
                      {item.label}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={analyzeOracle}
                  disabled={!canAnalyze || step === 'analyzing'}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[14px] bg-[var(--text-primary)] px-5 py-3 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="material-symbols-rounded text-base">query_stats</span>
                  Run Oracle Analysis
                </button>
              </div>
              {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
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
                <SonaThinkingTile
                  variant="oracle"
                  icon={ANALYSIS_STAGES[stageIndex].icon}
                  label="Sona is analyzing"
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
                      <div key={stage.label} className={`rounded-[16px] border p-4 transition ${active ? 'border-cyan-500/25 bg-cyan-500/10' : 'border-[var(--border-subtle)] bg-[var(--card-bg)] opacity-60'}`}>
                        <span className="material-symbols-rounded text-xl text-cyan-600 dark:text-cyan-300">{active && index < stageIndex ? 'check_circle' : stage.icon}</span>
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
              <section className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm sm:p-5 lg:p-6">
                <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(460px,1fr)_minmax(300px,380px)]">
                  <div className="min-w-0">
                    <span className="inline-grid h-12 w-12 place-items-center rounded-[16px] border border-cyan-500/20 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">
                      <span className="material-symbols-rounded">radar</span>
                    </span>
                    <p className="mt-5 text-[10px] font-semibold uppercase tracking-normal text-[var(--text-muted)]">Decision brief awaits</p>
                    <h2 className="premium-heading-wrap mt-2 text-[clamp(1.35rem,2.1vw,1.85rem)] font-semibold leading-[1.16] text-[var(--text-primary)]">
                      Oracle will answer the job-search question that matters.
                    </h2>
                    <p className="premium-copy-wrap mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                      Load resume evidence and a JD to get an apply verdict, proof gaps, salary confidence, risks, and the exact packet Sona should prepare.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Pill tone={resumeText ? 'emerald' : 'muted'}>{resumeText ? 'resume ready' : 'resume needed'}</Pill>
                      <Pill tone={jdText.length > 120 ? 'emerald' : 'muted'}>{jdText.length > 120 ? 'JD ready' : 'JD needed'}</Pill>
                      <span className="min-w-0 max-w-full">
                        <Pill tone={inferredRole ? 'cyan' : 'muted'}>{inferredRole || 'role pending'}</Pill>
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Readiness checklist</p>
                    <div className="mt-3 space-y-2">
                      {readinessItems.map(item => (
                        <div key={item.label} className="flex min-w-0 items-start gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                          <span className={`material-symbols-rounded shrink-0 text-[18px] ${item.ready ? 'text-emerald-600 dark:text-emerald-300' : 'text-[var(--text-muted)]'}`}>{item.ready ? 'check_circle' : 'radio_button_unchecked'}</span>
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
                <section className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: `${verdictCopy[oracleReport.decision.verdict].color}33`, background: verdictCopy[oracleReport.decision.verdict].bg, color: verdictCopy[oracleReport.decision.verdict].color }}>
                          <span className="material-symbols-rounded text-[15px]">{verdictCopy[oracleReport.decision.verdict].icon}</span>
                          {verdictCopy[oracleReport.decision.verdict].label}
                        </span>
                        <Pill tone="muted">{oracleReport.decision.confidence} confidence</Pill>
                        <Pill tone={oracleReport.sourceQuality.salary === 'listed' ? 'emerald' : oracleReport.sourceQuality.salary === 'unknown' ? 'amber' : 'cyan'}>
                          salary {oracleReport.sourceQuality.salary.replaceAll('_', ' ')}
                        </Pill>
                      </div>
                      <h2 className="premium-heading-wrap mt-4 text-[clamp(1.25rem,2vw,1.75rem)] font-semibold leading-[1.16] text-[var(--text-primary)]">{oracleReport.session.role || inferredRole}</h2>
                      <p className="mt-1 wrap-natural text-sm font-medium leading-6 text-cyan-700 dark:text-cyan-300">{oracleReport.session.company || inferredCompany || 'Target company'}</p>
                      <p className="premium-copy-wrap mt-4 text-sm leading-6 text-[var(--text-secondary)]">{oracleReport.decision.summary}</p>
                    </div>
                    <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 xl:w-[560px] xl:shrink-0">
                      <ScoreRing score={oracleReport.decision.fitScore} label="Fit" icon="verified" />
                      <ScoreRing score={oracleReport.decision.readinessScore} label="Ready" icon="fact_check" />
                      <ScoreRing score={100 - oracleReport.decision.riskScore} label="Risk" icon="shield" />
                    </div>
                  </div>
                  <div className="mt-5 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-normal text-[var(--text-muted)]">Recommended next action</p>
                    <div className="mt-2 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(170px,220px)] xl:items-start">
                      <p className="min-w-0 wrap-natural text-sm font-medium leading-6 text-[var(--text-primary)]">{oracleReport.decision.recommendedNextAction}</p>
                      <div className="flex min-w-0 flex-wrap gap-2 xl:flex-col">
                        <button onClick={prepareApplication} className="rounded-[12px] bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-deep)]">Prepare Application</button>
                        <button onClick={() => routeWithContext('/suite/resume')} className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)]">Resume Studio</button>
                        <button onClick={trackApplication} className="rounded-[12px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Track</button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-normal text-[var(--text-muted)]">Interview Yield Lens</p>
                    <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{oracleReport.decision.interviewYield.score}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{oracleReport.decision.interviewYield.rationale}</p>
                  </div>
                  <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Proof Gap Detector</p>
                    <div className="mt-3 space-y-2">
                      {oracleReport.breakdown.proofGaps.slice(0, 3).map(gap => <p key={gap} className="rounded-[12px] border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">{gap}</p>)}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Apply Strategy</p>
                    <p className="mt-2 text-xl font-semibold capitalize text-[var(--text-primary)]">{oracleReport.decision.applyStrategy.replaceAll('_', ' ')}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Strategy is based on fit, proof strength, posting risk, and packet readiness.</p>
                  </div>
                </section>

                <section className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Why this score?</p>
                      <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">Factor-weighted fit</h3>
                    </div>
                    <Pill tone="cyan">Sona analyzed this role</Pill>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {Object.entries(oracleReport.breakdown.factorScores).map(([key, value]) => (
                      <FactorRow key={key} label={key.replace(/([A-Z])/g, ' $1')} value={value} />
                    ))}
                  </div>
                </section>
              </>
            )}
          </main>

          <aside className="min-w-0 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-hidden">
            <div className="border-b border-[var(--border-subtle)] p-4">
              <div className="grid grid-cols-3 gap-1 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-1">
                {([
                  ['decode', 'JD'],
                  ['salary', 'Salary'],
                  ['risks', 'Risks'],
                  ['company', 'Company'],
                  ['packet', 'Packet'],
                  ['map', 'Map'],
                ] as Array<[IntelTab, string]>).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-[10px] px-2 py-2 text-xs font-semibold transition ${activeTab === tab ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[calc(100dvh-120px)] overflow-y-auto p-4">
              {!oracleReport ? (
                <EmptyCard icon="fact_check" title="Intelligence panel" body="Run Oracle to unlock JD decode, salary confidence, risks, packet plan, and Market Map." />
              ) : (
                <>
                  {activeTab === 'decode' && (
                    <div className="space-y-4">
                      <div>
                        <p className="mb-2 text-xs font-semibold text-[var(--text-primary)]">Covered requirements</p>
                        <div className="space-y-2">
                          {oracleReport.breakdown.coveredRequirements.slice(0, 6).map(item => <p key={item} className="rounded-[12px] border border-emerald-500/15 bg-emerald-500/5 px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">{item}</p>)}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold text-[var(--text-primary)]">Missing requirements</p>
                        <div className="flex flex-wrap gap-1.5">
                          {oracleReport.breakdown.keywordMap.missing.map(item => <Pill key={item} tone="amber">{item}</Pill>)}
                        </div>
                      </div>
                      {oracleReport.breakdown.hiddenScreenSignals.length > 0 && (
                        <div className="rounded-[15px] border border-cyan-500/15 bg-cyan-500/5 p-4">
                          <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">Likely screen signals</p>
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
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Compensation read</p>
                        <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{displaySalary(legacyAnalysis?.salaryIntel?.min, legacyAnalysis?.salaryIntel?.max)}</p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Confidence: {oracleReport.sourceQuality.salary.replaceAll('_', ' ')}.</p>
                      </div>
                      <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                        <p className="text-xs font-semibold text-[var(--text-primary)]">Bridge upside</p>
                        <div className="mt-3 space-y-2">
                          {(legacyAnalysis?.bridgeSkills || []).slice(0, 4).map(skill => (
                            <div key={skill.skill} className="flex items-center justify-between rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
                              <span className="text-xs text-[var(--text-secondary)]">{skill.skill}</span>
                              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">+${Math.round(skill.salaryIncrease / 1000)}K</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'risks' && (
                    <div className="space-y-3">
                      {oracleReport.breakdown.risks.length === 0 ? (
                        <EmptyCard icon="shield" title="No major risks found" body="Oracle did not detect obvious role, posting, company, or candidate risk signals." />
                      ) : oracleReport.breakdown.risks.map(risk => (
                        <div key={`${risk.category}-${risk.title}`} className={`rounded-[15px] border p-4 ${risk.severity === 'high' ? 'border-red-500/20 bg-red-500/5' : risk.severity === 'medium' ? 'border-amber-500/20 bg-amber-500/5' : 'border-[var(--border-subtle)] bg-[var(--card-bg)]'}`}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{risk.title}</p>
                            <Pill tone={risk.severity === 'high' ? 'red' : risk.severity === 'medium' ? 'amber' : 'muted'}>{risk.severity}</Pill>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{risk.explanation}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === 'company' && (
                    <div className="space-y-4">
                      <EmptyCard icon="apartment" title={oracleReport.session.company || 'Company unknown'} body="Company intelligence will become richer when this role is opened from Job Search or a job URL with source metadata." />
                      {legacyAnalysis?.industryInsights?.map(insight => <p key={insight} className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 text-sm leading-6 text-[var(--text-secondary)]">{insight}</p>)}
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
                        <button onClick={prepareApplication} className="rounded-[13px] bg-[var(--text-primary)] px-3 py-2.5 text-xs font-semibold text-[var(--bg-deep)]">Prepare</button>
                        <button onClick={() => routeWithContext('/suite/cover-letter')} className="rounded-[13px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2.5 text-xs font-semibold text-[var(--text-primary)]">Cover Letter</button>
                        <button onClick={() => routeWithContext('/suite/linkedin')} className="rounded-[13px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2.5 text-xs font-semibold text-[var(--text-primary)]">LinkedIn</button>
                        <button onClick={() => routeWithContext('/suite/interview-sim')} className="rounded-[13px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2.5 text-xs font-semibold text-[var(--text-primary)]">Interview</button>
                      </div>
                      {packetStatus !== 'idle' && (
                        <div className="rounded-[16px] border border-cyan-500/20 bg-cyan-500/5 p-4">
                          <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                            {packetStatus === 'preparing' ? `Preparing packet - stage ${packetStage + 1}/7` : packetStatus === 'ready' ? 'Packet ready for review' : packetStatus === 'tracked' ? 'Tracker draft saved' : 'Packet failed'}
                          </p>
                          {packetResult?.atsResult && <p className="mt-2 text-xs text-[var(--text-secondary)]">ATS score: {packetResult.atsResult.overallScore || packetResult.matchScore || '--'}</p>}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'map' && (
                    <div className="space-y-3">
                      <p className="text-xs leading-5 text-[var(--text-secondary)]">Market Map is optional and uses live roles when available. It never blocks the decision brief.</p>
                      {prefersReducedMotion ? (
                        <EmptyCard icon="motion_photos_off" title="Map paused for reduced motion" body="The decision console remains fully available without 3D motion." />
                      ) : (
                        <div className="h-[420px] overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-slate-950">
                          <DynamicCanvas className="h-full w-full" camera={{ position: [0, 5, 45], fov: 55 }}>
                            <Suspense fallback={null}>
                              <OracleScene
                                analysis={mapAnalysis}
                                selectedJob={null}
                                setSelectedJob={() => {}}
                                showBridge={false}
                                activeBridgeSkill={null}
                                visibleTiers={new Set(['elite', 'strong', 'decent', 'low'])}
                              />
                            </Suspense>
                          </DynamicCanvas>
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
