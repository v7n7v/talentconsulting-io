'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import mammoth from 'mammoth';
import { useStore } from '@/lib/store';
import { showToast } from '@/components/Toast';
import { authFetch } from '@/lib/auth-fetch';
import { SuiteToolHeader } from '@/components/suite/SuiteToolChrome';
import { MobileStickyActionBar } from '@/components/mobile/MobileWorkbench';
import AssistantThinkingTile from '@/components/assistant/AssistantThinkingTile';
import { useAuthGate } from '@/hooks/useAuthGate';
import { detectAI, type DetectionResult, type ParagraphScore } from '@/lib/ai-detection';
import { exportDocument, downloadBlob, type ExportFormat } from '@/lib/doc-export';
import { saveWritingSession } from '@/lib/database-suite';
import type { HumanizeTone, LengthMode, WritingDomain } from '@/lib/writing-prompts';
import {
  WRITING_TRUST_DRAFT_KEY,
  REWRITE_MODES,
  buildSessionTitle,
  buildTrustReport,
  countWords,
  getTrustColor,
  mapModeToSettings,
  type PipelineStep,
  type RewriteMode,
  type WritingTrustReport,
} from '@/lib/writing-pipeline';

interface HumanizeResult {
  rewritten: string;
  changes: Array<{ original: string; rewritten: string; reason: string }>;
  stats?: { sentenceLengthStdDev?: number; bannedWordsRemoved?: number; burstinessRange?: number };
  wordUsage?: { inputWords: number; outputWords: number; remaining: number; cap: number };
  recheck?: { humanScore: number; verdict: string; flaggedCount: number };
  retryCount?: number;
  engine?: string;
  model?: string;
  fallbackCount?: number;
  latencyMs?: number;
  qualityDecision?: string;
  qualityMode?: QualityMode;
  qualityGates?: Array<{ id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }>;
  protectedTerms?: string[];
  patches?: Array<{ original: string; rewritten: string; paragraphIndex: number; reason: string; riskReduced?: number }>;
  warnings?: string[];
  targetedParagraphs?: number[];
  trustReportAfter?: WritingTrustReport;
}

type QualityMode = 'fast' | 'best';

interface UniquenessResult {
  uniquenessScore: number;
  verdict: 'highly_unique' | 'mostly_unique' | 'some_overlap' | 'needs_revision';
  analysis: Array<{ paragraphIndex: number; score: number; concern: string | null; suggestion: string | null }>;
  summary: string;
}

interface DeepScanResult {
  success?: boolean;
  aiProbability?: number;
  confidence?: number;
  summary?: string;
  recommendations?: string[];
}

const DOMAINS: Array<{ value: WritingDomain; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'academic', label: 'Academic' },
  { value: 'resume', label: 'Resume/CV' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'creative', label: 'Creative' },
];

const TONES: Array<{ value: HumanizeTone; label: string }> = [
  { value: 'professional', label: 'Professional' },
  { value: 'confident', label: 'Confident' },
  { value: 'casual', label: 'Natural' },
  { value: 'academic', label: 'Academic' },
  { value: 'creative', label: 'Creative' },
];

const LENGTHS: Array<{ value: LengthMode; label: string }> = [
  { value: 'exact', label: 'Same Length' },
  { value: 'condense', label: 'Condense' },
  { value: 'expand', label: 'Expand' },
];

const INTENSITIES: Array<{ value: 'light' | 'balanced' | 'deep'; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'deep', label: 'Deep' },
];

const QUALITY_MODES: Array<{ value: QualityMode; label: string; description: string; icon: string }> = [
  { value: 'fast', label: 'Fast', description: 'Starts with Taco Speed and escalates only if quality gates need more polish.', icon: 'bolt' },
  { value: 'best', label: 'Best', description: 'Starts with Taco Deep Polish for slower, higher-touch rewrites.', icon: 'diamond' },
];

const ACTIONS: Array<{ step: PipelineStep; label: string; icon: string }> = [
  { step: 'scan', label: 'Scan', icon: 'radar' },
  { step: 'diagnose', label: 'Diagnose', icon: 'troubleshoot' },
  { step: 'humanize', label: 'Humanize', icon: 'auto_fix_high' },
  { step: 'verify', label: 'Verify', icon: 'verified' },
  { step: 'export', label: 'Export', icon: 'download' },
];

function formatVerdict(report: WritingTrustReport | null) {
  if (!report) return 'Not scanned';
  if (report.confidenceBand === 'Not enough text') return 'Not enough text';
  return report.trustLabel;
}

function scoreTone(score: number) {
  if (score >= 72) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 45) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const color = getTrustColor(score);
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg className="-rotate-90" width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="var(--border-subtle)" strokeWidth="7" opacity="0.8" />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (score / 100) * circumference}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tracking-tight" style={{ color }}>{score}</span>
        <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      </div>
    </div>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2">
      <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
      <p className={`mt-1 text-sm font-medium ${tone || 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="min-w-0 flex-1">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value as T)}
        className="h-10 w-full rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-cyan-500/25"
      >
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ActionRail({
  step,
  loading,
  canScan,
  hasReport,
  hasOutput,
  onScan,
  onDeepScan,
  onHumanize,
  onVerify,
  onExport,
}: {
  step: PipelineStep;
  loading: string | null;
  canScan: boolean;
  hasReport: boolean;
  hasOutput: boolean;
  onScan: () => void;
  onDeepScan: () => void;
  onHumanize: () => void;
  onVerify: () => void;
  onExport: () => void;
}) {
  const getState = (actionStep: PipelineStep) => {
    if (loading === actionStep) return 'loading';
    if (actionStep === 'scan') return hasReport ? 'done' : canScan ? 'ready' : 'blocked';
    if (actionStep === 'diagnose') return hasReport ? 'ready' : 'blocked';
    if (actionStep === 'humanize') return hasReport ? 'ready' : 'blocked';
    if (actionStep === 'verify') return hasOutput ? 'ready' : 'blocked';
    return hasOutput ? 'ready' : 'blocked';
  };

  const handlers: Record<PipelineStep, () => void> = {
    scan: onScan,
    diagnose: onDeepScan,
    humanize: onHumanize,
    verify: onVerify,
    export: onExport,
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Writing pipeline actions">
      {ACTIONS.map(action => {
        const state = getState(action.step);
        const active = action.step === step;
        return (
          <button
            key={action.step}
            onClick={handlers[action.step]}
            disabled={state === 'blocked' || !!loading}
            className={`flex min-h-[58px] items-center gap-3 rounded-[12px] border px-3 py-2 text-left transition ${
              active
                ? 'border-cyan-400/50 bg-cyan-500/10'
                : state === 'done'
                  ? 'border-emerald-500/30 bg-emerald-500/10'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border)] hover:bg-[var(--bg-hover)]'
            } disabled:cursor-not-allowed disabled:opacity-45`}
          >
            <span className="material-symbols-rounded text-[19px] text-[var(--text-secondary)]">
              {state === 'loading' ? 'progress_activity' : state === 'done' ? 'check_circle' : action.icon}
            </span>
            <span className="text-xs font-medium text-[var(--text-primary)]">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PipelineWorkingPanel({
  stage,
  intensity,
  qualityMode,
}: {
  stage: string;
  intensity: 'light' | 'balanced' | 'deep';
  qualityMode: QualityMode;
}) {
  const stages: Record<string, { title: string; description: string; icon: string; steps: string[] }> = {
    scan: {
      title: 'Taco is reading the signal map',
      description: 'Checking rhythm, phrase residue, paragraph risk, and trust indicators.',
      icon: 'radar',
      steps: ['Sentence rhythm', 'Phrase residue', 'Paragraph risk', 'Trust score'],
    },
    diagnose: {
      title: 'Taco is running a deeper diagnosis',
      description: 'Sampling predictability and looking for sections that need a closer pass.',
      icon: 'troubleshoot',
      steps: ['Masking samples', 'Testing endings', 'Ranking signals', 'Preparing guidance'],
    },
    humanize: {
      title: 'Taco is polishing the draft',
      description: qualityMode === 'fast'
        ? 'Taco is drafting fast, then escalating only if quality gates need more polish.'
        : 'Taco is running a deeper polish pass, then checking facts, tone, and trust movement.',
      icon: 'auto_fix_high',
      steps: ['Protecting facts', 'Rewriting sections', 'Checking tone', 'Quality gates'],
    },
    verify: {
      title: 'Taco is verifying originality',
      description: 'Reviewing uniqueness, readability, and whether the final draft still sounds like you.',
      icon: 'verified',
      steps: ['Originality', 'Readability', 'Claims check', 'Final signal'],
    },
    export: {
      title: 'Taco is preparing your export',
      description: 'Packaging the final text into a clean document you can use immediately.',
      icon: 'download',
      steps: ['Formatting', 'Naming file', 'Generating document', 'Ready'],
    },
    save: {
      title: 'Taco is saving your session',
      description: 'Keeping the draft, settings, trust signals, and final version together.',
      icon: 'save',
      steps: ['Draft', 'Metadata', 'Scores', 'Library'],
    },
    file: {
      title: 'Taco is reading your file',
      description: 'Extracting readable text and preparing it for the writing pipeline.',
      icon: 'upload_file',
      steps: ['Upload', 'Extract', 'Clean text', 'Ready'],
    },
  };
  const current = stages[stage] || stages.humanize;
  const stageLabel = stage === 'file' ? 'reading file' : stage;

  return (
    <AssistantThinkingTile
      variant="writing"
      icon={current.icon}
      title={current.title}
      description={current.description}
      activeStage={stageLabel}
      stages={stage === 'humanize' ? [...current.steps, `${qualityMode === 'fast' ? 'fast pass' : 'best pass'} · ${intensity}`] : current.steps}
    />
  );
}

function ParagraphDiagnostics({
  paragraphs,
  onFix,
  disabled,
}: {
  paragraphs: ParagraphScore[];
  onFix: (index: number) => void;
  disabled: boolean;
}) {
  const flagged = paragraphs.filter(p => p.score < 68).slice(0, 6);
  if (flagged.length === 0) {
    return (
      <div className="rounded-[14px] border border-emerald-500/20 bg-emerald-500/10 p-4">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">No priority paragraph flags.</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">This is still an indicator, not proof. Use Verify for an originality pass.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {flagged.map(paragraph => (
        <div key={paragraph.index} className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-sm font-semibold ${scoreTone(paragraph.score)}`}>Paragraph {paragraph.index + 1} · {paragraph.score}/100</p>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-[var(--text-secondary)]">{paragraph.text}</p>
            </div>
            <button
              onClick={() => onFix(paragraph.index)}
              disabled={disabled}
              className="shrink-0 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              Fix section
            </button>
          </div>
          {paragraph.flags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {paragraph.flags.slice(0, 3).map((flag, index) => (
                <span key={`${paragraph.index}-${index}-${flag}`} className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">{flag}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function WritingToolsPage() {
  const { user } = useStore();
  const { handleApiError, renderAuthModal } = useAuthGate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const [inputText, setInputText] = useState('');
  const [documentName, setDocumentName] = useState('Untitled writing session');
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [domain, setDomain] = useState<WritingDomain>('general');
  const [tone, setTone] = useState<HumanizeTone>('professional');
  const [lengthMode, setLengthMode] = useState<LengthMode>('exact');
  const [rewriteMode, setRewriteMode] = useState<RewriteMode>('safe_polish');
  const [intensity, setIntensity] = useState<'light' | 'balanced' | 'deep'>('balanced');
  const [qualityMode, setQualityMode] = useState<QualityMode>('fast');
  const [protectedTermsText, setProtectedTermsText] = useState('');
  const [step, setStep] = useState<PipelineStep>('scan');
  const [saveStatus, setSaveStatus] = useState('Draft saved locally');
  const [loading, setLoading] = useState<string | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [originalDetection, setOriginalDetection] = useState<DetectionResult | null>(null);
  const [humanizeResult, setHumanizeResult] = useState<HumanizeResult | null>(null);
  const [uniqueness, setUniqueness] = useState<UniquenessResult | null>(null);
  const [deepScan, setDeepScan] = useState<DeepScanResult | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const activeText = humanizeResult?.rewritten || inputText;
  const wordCount = useMemo(() => countWords(inputText), [inputText]);
  const activeWordCount = useMemo(() => countWords(activeText), [activeText]);
  const trustReport = useMemo(() => {
    if (!detection) return null;
    return buildTrustReport(activeText, detection, deepScan ? {
      confidence: deepScan.confidence,
      summary: deepScan.summary,
      recommendations: deepScan.recommendations,
    } : null);
  }, [activeText, detection, deepScan]);

  const recommendedAction = useMemo(() => {
    if (!inputText.trim()) return 'Paste or upload a document';
    if (!detection) return 'Run Scan';
    if (trustReport?.confidenceBand === 'Needs deep scan' && !deepScan) return 'Run Diagnose';
    if (!humanizeResult && detection.humanScore < 72) return 'Humanize priority sections';
    if (humanizeResult && !uniqueness) return 'Verify originality';
    return 'Export or save';
  }, [deepScan, detection, humanizeResult, inputText, trustReport, uniqueness]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(WRITING_TRUST_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { text?: string; source?: string; documentName?: string };
      if (draft.text?.trim()) {
        setInputText(draft.text);
        setDocumentName(draft.documentName || buildSessionTitle(draft.text));
        setSourceFileName(draft.source || 'Public tool draft');
        setSaveStatus('Imported from public tool');
        sessionStorage.removeItem(WRITING_TRUST_DRAFT_KEY);
      }
    } catch {
      sessionStorage.removeItem(WRITING_TRUST_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    if (!inputText.trim()) return;
    const nextTitle = buildSessionTitle(inputText, sourceFileName);
    setDocumentName(prev => prev === 'Untitled writing session' || !prev.trim() ? nextTitle : prev);
    setSaveStatus(user ? 'Draft saved locally' : 'Needs sign-in to save everywhere');
  }, [inputText, sourceFileName, user]);

  const resetAnalysis = useCallback(() => {
    setDetection(null);
    setOriginalDetection(null);
    setHumanizeResult(null);
    setUniqueness(null);
    setDeepScan(null);
    setStep('scan');
  }, []);

  const processFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['txt', 'doc', 'docx'].includes(ext)) {
      showToast('Upload TXT, DOC, or DOCX. PDF support lives in Resume Studio.', 'cancel');
      return;
    }
    setLoading('file');
    try {
      let text = '';
      if (ext === 'txt') {
        text = await file.text();
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      }
      if (countWords(text) < 10) throw new Error('The file did not contain enough readable text');
      setInputText(text);
      setSourceFileName(file.name);
      setDocumentName(buildSessionTitle(text, file.name));
      resetAnalysis();
      showToast(`Loaded ${file.name}`, 'upload_file');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not read that file', 'cancel');
    } finally {
      setLoading(null);
    }
  }, [resetAnalysis]);

  const runDetection = useCallback(() => {
    if (countWords(inputText) < 10) {
      showToast('Add at least 10 words to scan', 'cancel');
      return;
    }
    setLoading('scan');
    window.setTimeout(() => {
      const result = detectAI(inputText);
      setDetection(result);
      setOriginalDetection(prev => prev || result);
      setStep('diagnose');
      setLoading(null);
      showToast(`${buildTrustReport(inputText, result).trustLabel}: ${result.humanScore}/100`, 'radar');
    }, prefersReducedMotion ? 0 : 300);
  }, [inputText, prefersReducedMotion]);

  const runDeepScan = useCallback(async () => {
    if (!detection) {
      showToast('Run Scan first', 'cancel');
      return;
    }
    setLoading('diagnose');
    try {
      const res = await authFetch('/api/writing/deep-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: activeText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (handleApiError(err)) return;
        throw new Error(err.error || 'Deep scan failed');
      }
      const result: DeepScanResult = await res.json();
      setDeepScan(result);
      setStep('diagnose');
      showToast('Deep scan added', 'troubleshoot');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Deep scan failed', 'cancel');
    } finally {
      setLoading(null);
    }
  }, [activeText, detection, handleApiError]);

  const runHumanize = useCallback(async (paragraphIndices?: number[]) => {
    if (!detection) {
      showToast('Run Scan first', 'cancel');
      return;
    }
    const modeSettings = mapModeToSettings(rewriteMode);
    setLoading('humanize');
    try {
      const targetParagraphs = paragraphIndices || detection.paragraphScores.filter(p => p.score < 62).map(p => p.index).slice(0, 5);
      const protectedTerms = protectedTermsText
        .split(/[\n,]/)
        .map(term => term.trim())
        .filter(Boolean);
      const res = await authFetch('/api/writing/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: activeText,
          domain: modeSettings.domain || domain,
          tone: modeSettings.tone || tone,
          lengthMode: modeSettings.lengthMode || lengthMode,
          mode: rewriteMode,
          intensity,
          qualityMode,
          protectedTerms,
          rewriteScope: targetParagraphs.length > 0 ? 'flagged_paragraphs' : 'full',
          paragraphIndices: targetParagraphs.length > 0 ? targetParagraphs : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (handleApiError(err)) return;
        throw new Error(err.error || 'Humanization failed');
      }
      const result: HumanizeResult = await res.json();
      setHumanizeResult(result);
      const nextDetection = detectAI(result.rewritten);
      setDetection(nextDetection);
      setStep('verify');
      setSaveStatus(user ? 'Ready to save to library' : 'Needs sign-in to save everywhere');
      showToast(`Trust score now ${nextDetection.humanScore}/100`, 'auto_fix_high');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Humanization failed', 'cancel');
    } finally {
      setLoading(null);
    }
  }, [activeText, detection, domain, handleApiError, intensity, lengthMode, protectedTermsText, qualityMode, rewriteMode, tone, user]);

  const runUniquenessCheck = useCallback(async () => {
    if (countWords(activeText) < 20) {
      showToast('Verify needs at least 20 words', 'cancel');
      return;
    }
    setLoading('verify');
    try {
      const res = await authFetch('/api/writing/uniqueness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: activeText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (handleApiError(err)) return;
        throw new Error(err.error || 'Verification failed');
      }
      const result: UniquenessResult = await res.json();
      setUniqueness(result);
      setStep('export');
      showToast(`Originality signal: ${result.uniquenessScore}/100`, 'verified');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Verification failed', 'cancel');
    } finally {
      setLoading(null);
    }
  }, [activeText, handleApiError]);

  const saveSession = useCallback(async () => {
    if (!user) {
      showToast('Sign in to save writing sessions', 'lock');
      setSaveStatus('Needs sign-in to save everywhere');
      return;
    }
    setLoading('save');
    const settings = mapModeToSettings(rewriteMode);
    try {
      const res = await saveWritingSession({
        title: documentName || buildSessionTitle(inputText, sourceFileName),
        sourceFileName,
        inputText,
        finalText: humanizeResult?.rewritten || '',
        domain: settings.domain || domain,
        tone: settings.tone || tone,
        lengthMode: settings.lengthMode || lengthMode,
        mode: rewriteMode,
        step,
        originalScore: originalDetection?.humanScore ?? detection?.humanScore ?? null,
        finalScore: detection?.humanScore ?? null,
        uniquenessScore: uniqueness?.uniquenessScore ?? null,
        metadata: {
          confidenceBand: trustReport?.confidenceBand,
          trustLabel: trustReport?.trustLabel,
          flaggedParagraphs: detection?.paragraphScores.filter(p => p.score < 62).map(p => p.index) || [],
          intensity,
          qualityMode,
          protectedTerms: humanizeResult?.protectedTerms || [],
          model: humanizeResult?.model,
          engine: humanizeResult?.engine,
          qualityDecision: humanizeResult?.qualityDecision,
        },
      });
      if (!res.success) throw new Error(res.error || 'Could not save');
      setSaveStatus('Saved to library');
      showToast('Writing session saved', 'save');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save', 'cancel');
    } finally {
      setLoading(null);
    }
  }, [detection, documentName, domain, humanizeResult, inputText, intensity, lengthMode, originalDetection, qualityMode, rewriteMode, sourceFileName, step, tone, trustReport, uniqueness, user]);

  const exportText = useCallback(async (format: ExportFormat) => {
    if (!activeText.trim()) return;
    setLoading('export');
    try {
      const { blob, filename } = await exportDocument(activeText, {
        format,
        title: documentName || 'Writing Trust Document',
        author: user?.displayName || user?.email || 'Talent Studio',
      });
      downloadBlob(blob, filename);
      setStep('export');
      showToast(`${format.toUpperCase()} downloaded`, 'download');
    } catch {
      showToast('Export failed', 'cancel');
    } finally {
      setLoading(null);
    }
  }, [activeText, documentName, user]);

  const copyText = useCallback(async () => {
    await navigator.clipboard.writeText(activeText);
    showToast('Copied to clipboard', 'content_copy');
  }, [activeText]);

  const clearAll = useCallback(() => {
    setInputText('');
    setDocumentName('Untitled writing session');
    setSourceFileName(null);
    resetAnalysis();
    setSaveStatus(user ? 'Draft saved locally' : 'Needs sign-in to save everywhere');
  }, [resetAnalysis, user]);

  const visibleText = showOriginal ? inputText : activeText;
  const mobilePrimary = humanizeResult
    ? { label: 'Export Word', icon: 'description', action: () => exportText('docx'), disabled: !activeText.trim() }
    : detection
      ? { label: 'Humanize', icon: 'auto_fix_high', action: () => runHumanize(), disabled: !inputText.trim() }
      : { label: 'Scan trust', icon: 'radar', action: runDetection, disabled: wordCount < 10 };

  return (
    <div className="mobile-app-content min-h-dvh px-4 py-3 text-[var(--text-primary)] md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* First child, not last. UsageLimitGate is an in-flow section, not an
            overlay, so calling this after </main> put a cap block below a
            full-height two-column workspace - the spinner stopped and nothing
            visible happened. Gallery and ATSScorePanel already render it first. */}
        {renderAuthModal()}
        <SuiteToolHeader
          tool="gallery"
          title="Writing Trust Studio"
          subtitle="Scan trust signals, humanize with control, verify originality, and export without leaving the suite workflow."
          icon="verified_user"
          pageHelpId="writing-tools"
          actions={
              <button
                onClick={saveSession}
                disabled={!inputText.trim() || loading === 'save'}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border)] transition-all disabled:opacity-45"
              >
                <span className="material-symbols-rounded text-[15px]">{loading === 'save' ? 'progress_activity' : 'save'}</span>
                Save
              </button>
          }
        />

        <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1.25fr_0.75fr_0.75fr_0.75fr_auto] lg:items-end">
            <label>
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Document</span>
              <input
                value={documentName}
                onChange={event => setDocumentName(event.target.value)}
                className="h-10 w-full rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-cyan-500/25"
              />
            </label>
            <SelectField label="Domain" value={domain} options={DOMAINS} onChange={setDomain} />
            <SelectField label="Tone" value={tone} options={TONES} onChange={setTone} />
            <SelectField label="Length" value={lengthMode} options={LENGTHS} onChange={setLengthMode} />
            <div className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2">
              <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Status</p>
              <p className="mt-1 whitespace-nowrap text-xs font-medium text-[var(--text-primary)]">{saveStatus}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Rewrite mode</span>
            {REWRITE_MODES.map(mode => (
              <button
                key={mode.value}
                onClick={() => {
                  setRewriteMode(mode.value);
                  const settings = mapModeToSettings(mode.value);
                  setDomain(settings.domain);
                  setTone(settings.tone);
                  setLengthMode(settings.lengthMode);
                }}
                className={`inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-xs font-medium transition ${
                  rewriteMode === mode.value
                    ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                    : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text-primary)]'
                }`}
                title={mode.description}
              >
                <span className="material-symbols-rounded text-sm">{mode.icon}</span>
                {mode.label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_0.9fr_1.4fr]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Intensity</span>
              {INTENSITIES.map(option => (
                <button
                  key={option.value}
                  onClick={() => setIntensity(option.value)}
                  className={`rounded-[10px] border px-3 py-2 text-xs font-medium transition ${
                    intensity === option.value
                      ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                      : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Pace</span>
              {QUALITY_MODES.map(option => (
                <button
                  key={option.value}
                  onClick={() => setQualityMode(option.value)}
                  className={`inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-xs font-medium transition ${
                    qualityMode === option.value
                      ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                      : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text-primary)]'
                  }`}
                  title={option.description}
                >
                  <span className="material-symbols-rounded text-sm">{option.icon}</span>
                  {option.label}
                </button>
              ))}
            </div>
            <label>
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Protected terms</span>
              <input
                value={protectedTermsText}
                onChange={event => setProtectedTermsText(event.target.value)}
                placeholder="Optional: names, metrics, citations, URLs, tools"
                className="h-10 w-full rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-cyan-500/25"
              />
            </label>
          </div>
        </section>

        <div className="hidden lg:block">
          <ActionRail
            step={step}
            loading={loading}
            canScan={wordCount >= 10}
            hasReport={!!detection}
            hasOutput={!!humanizeResult}
            onScan={runDetection}
            onDeepScan={runDeepScan}
            onHumanize={() => runHumanize()}
            onVerify={runUniquenessCheck}
            onExport={() => exportText('docx')}
          />
        </div>
        {loading && <PipelineWorkingPanel stage={loading} intensity={intensity} qualityMode={qualityMode} />}

        <main className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.82fr)]">
          <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Document editor</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {sourceFileName ? sourceFileName : 'Paste text or upload a Word/TXT document'} · {activeWordCount.toLocaleString()} words
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.doc,.docx"
                  className="hidden"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) processFile(file);
                    event.target.value = '';
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!!loading}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)] disabled:opacity-45"
                >
                  <span className="material-symbols-rounded text-base">{loading === 'file' ? 'progress_activity' : 'upload_file'}</span>
                  Upload
                </button>
                {humanizeResult && (
                  <button
                    onClick={() => setShowOriginal(prev => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)]"
                  >
                    <span className="material-symbols-rounded text-base">compare_arrows</span>
                    {showOriginal ? 'Show Final' : 'Show Original'}
                  </button>
                )}
                <button onClick={clearAll} className="rounded-[10px] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:text-rose-500">
                  Clear
                </button>
              </div>
            </div>

            <textarea
              value={visibleText}
              onChange={event => {
                if (showOriginal) setShowOriginal(false);
                setInputText(event.target.value);
                resetAnalysis();
              }}
              aria-describedby="writing-editor-help"
              placeholder="Paste a resume summary, cover letter, essay, LinkedIn post, recruiter email, or any high-stakes writing here..."
              className="min-h-[320px] w-full resize-y rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-input)] p-4 text-sm leading-7 text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-cyan-500/25 sm:min-h-[480px] sm:p-5"
            />
            <div id="writing-editor-help" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]" aria-live="polite">
              <span>{wordCount.toLocaleString()} original words · {activeWordCount.toLocaleString()} current words</span>
              <span>Keyboard path: tab to Upload, Scan, Humanize, Verify, Export.</span>
            </div>

            {humanizeResult && (
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <MetricTile label="Targeted" value={`${humanizeResult.targetedParagraphs?.length || 0} sections`} />
                <MetricTile label="Agent" value="Taco writing engine" />
                <MetricTile label="Quality" value={humanizeResult.qualityDecision?.replace(/_/g, ' ') || 'Accepted'} />
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Trust Cockpit</p>
                  <h2 className="mt-1 text-[18px] font-semibold tracking-tight">{formatVerdict(trustReport)}</h2>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Indicator, not proof. Scores near thresholds deserve a deeper look.</p>
                </div>
                {trustReport ? (
                  <ScoreRing score={trustReport.humanScore} label="Trust" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)]">
                    Awaiting scan
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MetricTile label="Confidence" value={trustReport?.confidenceBand || 'Not scanned'} />
                <MetricTile label="Originality" value={uniqueness ? `${uniqueness.uniquenessScore}/100` : 'Verify pending'} tone={uniqueness ? scoreTone(uniqueness.uniquenessScore) : undefined} />
                <MetricTile label="Readability" value={trustReport ? `${trustReport.readability.averageSentenceLength} w/sentence` : 'Pending'} />
                <MetricTile label="Flags" value={trustReport ? `${trustReport.flags.length}` : '0'} />
              </div>

              <div className="mt-5 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Next best action</p>
                <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">{recommendedAction}</p>
                {deepScan?.summary && <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{deepScan.summary}</p>}
              </div>
              {humanizeResult?.qualityGates && (
                <div className="mt-4 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Quality gates</p>
                  <div className="mt-3 space-y-2">
                    {humanizeResult.qualityGates.slice(0, 5).map(gate => (
                      <div key={gate.id} className="flex items-start justify-between gap-3 text-xs">
                        <span className="font-medium text-[var(--text-secondary)]">{gate.label}</span>
                        <span className={gate.status === 'pass' ? 'text-emerald-600 dark:text-emerald-400' : gate.status === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}>
                          {gate.status}
                        </span>
                      </div>
                    ))}
                  </div>
                  {humanizeResult.warnings && humanizeResult.warnings.length > 0 && (
                    <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">{humanizeResult.warnings[0]}</p>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Priority fixes</p>
                  <h3 className="mt-1 text-base font-semibold">Paragraph signals</h3>
                </div>
                {detection && <span className="rounded-[9px] bg-[var(--card-bg)] border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">{detection.paragraphScores.length} checked</span>}
              </div>
              {detection ? (
                <ParagraphDiagnostics paragraphs={detection.paragraphScores} onFix={index => runHumanize([index])} disabled={!!loading} />
              ) : (
                <div className="rounded-[14px] border border-dashed border-[var(--border-subtle)] p-6 text-center">
                  <span className="material-symbols-rounded text-3xl text-[var(--text-muted)]">radar</span>
                  <p className="mt-2 text-sm font-medium">Run Scan to see paragraph-level guidance.</p>
                </div>
              )}
            </section>

            <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Export station</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => exportText('docx')}
                  disabled={!activeText.trim() || !!loading}
                  className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 py-3 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 disabled:opacity-45"
                >
                  <span className="material-symbols-rounded text-base">description</span>
                  Word
                </button>
                <button
                  onClick={() => exportText('txt')}
                  disabled={!activeText.trim() || !!loading}
                  className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)] disabled:opacity-45"
                >
                  <span className="material-symbols-rounded text-base">article</span>
                  TXT
                </button>
                <button
                  onClick={copyText}
                  disabled={!activeText.trim()}
                  className="col-span-2 inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)] disabled:opacity-45"
                >
                  <span className="material-symbols-rounded text-base">content_copy</span>
                  Copy final text
                </button>
              </div>
              {uniqueness && <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">{uniqueness.summary}</p>}
            </section>
          </aside>
        </main>
      </div>
      <MobileStickyActionBar
        className="mobile-sticky-actionbar--with-appbar"
        primaryLabel={mobilePrimary.label}
        primaryIcon={mobilePrimary.icon}
        onPrimary={mobilePrimary.action}
        disabled={mobilePrimary.disabled || !!loading}
        loading={!!loading}
        secondaryActions={[
          { label: 'Save', icon: 'save', onClick: saveSession, disabled: !inputText.trim() || loading === 'save' },
          { label: 'Copy', icon: 'content_copy', onClick: copyText, disabled: !activeText.trim() },
        ]}
      />
    </div>
  );
}
