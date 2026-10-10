'use client';

import { useToolGuidance } from '@/components/guidance/ToolGuidanceProvider';
import { buildToolStory, storyStep } from '@/lib/tool-story-adapters';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import mammoth from 'mammoth';
import { useStore } from '@/lib/store';
import { showToast } from '@/components/Toast';
import { authFetch } from '@/lib/auth-fetch';
import { SuiteToolHeader, SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import { MobileStickyActionBar } from '@/components/mobile/MobileWorkbench';
import AssistantThinkingTile from '@/components/assistant/AssistantThinkingTile';
import { useAuthGate } from '@/hooks/useAuthGate';
import { detectAI, type DetectionResult, type ParagraphScore } from '@/lib/ai-detection';
import { exportDocument, downloadBlob, type ExportFormat } from '@/lib/doc-export';
import { appendWritingRevision, buildWritingReview, materializeWritingReview, paragraphIndicesForSelection, type WritingReviewPart, type WritingRevision } from '@/lib/writing-review';
import type { HumanizeTone, LengthMode, WritingDomain } from '@/lib/writing-prompts';
import {
  WRITING_TRUST_DRAFT_KEY, WRITING_TRUST_HANDOFF_KEY,
  REWRITE_MODES,
  buildSessionTitle,
  buildTrustReport,
  countWords,
  mapModeToSettings,
  type PipelineStep,
  type RewriteMode,
  type WritingTrustReport,
} from '@/lib/writing-pipeline';

interface HumanizeResult {
  rewritten: string;
  checkedText?: string;
  checkedPolicy?: string;
  reviewSource?: string;
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
  confidence?: number | null;
  humanConfidence?: number | null;
  status?: 'analyzed' | 'unavailable';
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
  { value: 'best', label: 'Thorough', description: 'Uses a more involved rewrite pass; results still need your review.', icon: 'diamond' },
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
  if (score >= 72) return 'text-[var(--success)]';
  if (score >= 45) return 'text-[var(--warning)]';
  return 'text-[var(--danger)]';
}

function trustColorVar(score: number) {
  if (score >= 72) return 'var(--success)';
  if (score >= 45) return 'var(--warning)';
  return 'var(--danger)';
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const color = trustColorVar(score);
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
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      </div>
    </div>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
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
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value as T)}
        className="h-11 w-full rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-base font-medium text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-[var(--accent)] md:h-10 md:text-xs"
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
    if (actionStep === 'diagnose') return canScan ? 'ready' : 'blocked';
    if (actionStep === 'humanize') return canScan ? 'ready' : 'blocked';
    if (actionStep === 'verify') return canScan ? 'ready' : 'blocked';
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
            aria-current={active ? 'step' : undefined}
            onClick={handlers[action.step]}
            disabled={state === 'blocked' || !!loading}
            className={`flex min-h-[58px] items-center gap-3 rounded-[12px] border px-3 py-2 text-left transition ${
              active
                ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                : state === 'done'
                  ? 'border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)]'
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
      steps: ['Sentence rhythm', 'Phrase residue', 'Paragraph risk', 'Pattern score'],
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
        : 'Taco is running a deeper polish pass, then checking protected terms, tone, and writing patterns.',
      icon: 'auto_fix_high',
      steps: ['Protecting facts', 'Rewriting sections', 'Checking tone', 'Quality gates'],
    },
    verify: {
      title: 'Taco is reviewing phrasing',
      description: 'Reviewing phrasing variety and readability. This does not verify authorship, plagiarism, or facts.',
      icon: 'verified',
      steps: ['Common phrases', 'Readability', 'Style suggestions', 'Phrasing summary'],
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
      <div className="rounded-[14px] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] p-4">
        <p className="text-sm font-medium text-[var(--success)]">No priority paragraph flags.</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">This is still an indicator, not proof. Review phrasing for style suggestions; no plagiarism database is searched.</p>
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
              className="min-h-[44px] shrink-0 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              Fix section
            </button>
          </div>
          {paragraph.flags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {paragraph.flags.slice(0, 3).map((flag, index) => (
                <span key={`${paragraph.index}-${index}-${flag}`} className="rounded-full bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] px-2 py-1 text-[11px] font-medium text-[var(--warning)]">{flag}</span>
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
  const [voiceSample, setVoiceSample] = useState('');
  const [reviewParts, setReviewParts] = useState<WritingReviewPart[]>([]);
  const [revisions, setRevisions] = useState<WritingRevision[]>([]);
  const [selectedParagraphs, setSelectedParagraphs] = useState<number[]>([]);
  const rewriteRequestRef = useRef<{ key: string; id: string } | null>(null);
  const [retryStorageAvailable, setRetryStorageAvailable] = useState(true);
  const [step, setStep] = useState<PipelineStep>('scan');
  const [saveStatus, setSaveStatus] = useState('Draft not saved');
  const [loading, setLoading] = useState<string | null>(null);
  const [storyFailure, setStoryFailure] = useState(false);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [originalDetection, setOriginalDetection] = useState<DetectionResult | null>(null);
  const [humanizeResult, setHumanizeResult] = useState<HumanizeResult | null>(null);
  const [uniqueness, setUniqueness] = useState<UniquenessResult | null>(null);
  const [deepScan, setDeepScan] = useState<DeepScanResult | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draftIdentity, setDraftIdentity] = useState(() => `draft_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`);
  const [library, setLibrary] = useState<Array<Record<string, any>>>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [hydratedOwner, setHydratedOwner] = useState<string | null>(null);
  const revisionRef = useRef(0);
  const [cloudVersion, setCloudVersion] = useState(0);
  const ownerRef = useRef(user?.uid || 'guest');
  const invalidate = () => { revisionRef.current += 1; setLoading(null); setStoryFailure(false); };
  const current = (revision: number, owner: string) => revision === revisionRef.current && owner === ownerRef.current;
  const ownerKey = user?.uid || 'guest';
  useLayoutEffect(() => { ownerRef.current = ownerKey; revisionRef.current += 1; }, [ownerKey]);
  const draftKey = `${WRITING_TRUST_DRAFT_KEY}:${ownerKey}`;
  const retryKey = `${draftKey}:rewrite-request`;

  const identityRef = useRef(sessionId || draftIdentity);
  useLayoutEffect(() => { identityRef.current = sessionId || draftIdentity; }, [sessionId, draftIdentity]);
  const activeText = humanizeResult ? humanizeResult.rewritten : inputText;
  const policyKey = JSON.stringify({ domain, tone, lengthMode, rewriteMode, intensity, qualityMode, protectedTermsText, voiceSample });
  const checksCurrent = humanizeResult?.checkedText === activeText && humanizeResult?.checkedPolicy === policyKey;
  const wordCount = useMemo(() => countWords(inputText), [inputText]);
  const activeWordCount = useMemo(() => countWords(activeText), [activeText]);
  const trustReport = useMemo(() => {
    if (!detection) return null;
    return buildTrustReport(activeText, detection, deepScan ? {
      confidence: typeof deepScan.confidence === 'number' ? deepScan.confidence : undefined,
      summary: deepScan.summary,
      recommendations: deepScan.recommendations,
    } : null);
  }, [activeText, detection, deepScan]);

  const recommendedAction = useMemo(() => {
    if (!activeText.trim()) return 'Paste or upload your writing';
    if (reviewParts.some(part => part.decision === 'pending')) return 'Review the proposed changes';
    if (humanizeResult) return 'Review facts, then copy or export';
    return 'Choose your tone and humanize. Scan is optional.';
  }, [activeText, humanizeResult, reviewParts]);

  useToolGuidance(buildToolStory({
    toolId: 'writing-tools', title: 'Humanizer', contextKey: sessionId || draftIdentity,
    purpose: 'Revise your own draft, compare proposed changes, and choose which wording to keep.',
    pending: Boolean(loading), hasResult: Boolean(humanizeResult), failed: storyFailure,
    work: [storyStep('draft', 'Bring your draft', 'Paste or upload your writing. The editor is the work; keep names, facts and protected terms accurate.', 'writing-editor'), storyStep('choices', 'Choose useful revision settings', 'Choose tone, purpose and protected terms. Scan, Diagnose and Verify are optional checks and do not prove authorship or factual accuracy.', 'writing-settings'), storyStep('humanize', 'Request a revision', 'Use Humanize yourself when ready. Help never runs a check or spends an allowance.', 'writing-actions')],
    recovery: [storyStep('retry', 'Keep your draft and choose recovery', 'The last import, check, rewrite or save failed. Review the existing message and retained text, then choose the relevant action yourself. A failed library save leaves the draft here.', 'writing-actions')],
    result: [storyStep('review', 'Compare changes', 'Keep or restore proposed wording yourself; automated checks do not confirm its meaning.', 'writing-review', 'No change comparison is needed when no differing proposals remain. Read the actual text in the editor.'), storyStep('final', 'Read the final text', 'Check facts in the editable text before copying or exporting.', 'writing-editor'), storyStep('copy', 'Choose the next use', 'Copy or export only when you are satisfied. The displayed save status separately identifies local or account storage.', 'writing-copy')],
  }));

  // Synchronize this owner's external storage before paint; never expose a prior owner's draft.
  /* eslint-disable react-hooks/set-state-in-effect -- Owner/storage hydration and persistence status synchronize external localStorage, not derived render state. */
  useLayoutEffect(() => {
    revisionRef.current += 1;
    setHydratedOwner(null); setLoading(null); setStoryFailure(false); setLibrary([]); setLibraryOpen(false); setLibraryLoading(false);
    setSessionId(null); setCloudVersion(0); setDraftIdentity(crypto.randomUUID());
    setInputText(''); setDocumentName('Untitled writing session'); setSourceFileName(null);
    setDomain('general'); setTone('professional'); setLengthMode('exact'); setRewriteMode('safe_polish');
    setIntensity('balanced'); setQualityMode('fast'); setProtectedTermsText(''); setShowOriginal(false);
    setVoiceSample(''); setReviewParts([]); setRevisions([]); setSelectedParagraphs([]); rewriteRequestRef.current = null;
    setDetection(null); setOriginalDetection(null); setHumanizeResult(null); setUniqueness(null); setDeepScan(null); setStep('scan');
    setSaveStatus('Draft not saved');
    setRetryStorageAvailable(true);
    try {
      const pending = JSON.parse(localStorage.getItem(retryKey) || 'null');
      if (pending && typeof pending.key === 'string' && typeof pending.id === 'string' && /^[0-9a-f-]{36}$/i.test(pending.id) && JSON.parse(pending.key).owner === ownerKey) rewriteRequestRef.current = pending;
    } catch { setRetryStorageAvailable(false); }
    try {
      // Public handoff is copied durably into this owner's draft before consumption.
      const envelopeRaw = localStorage.getItem(WRITING_TRUST_HANDOFF_KEY);
      const envelope = envelopeRaw ? JSON.parse(envelopeRaw) : null;
      const handoff = envelope?.owner === ownerKey && envelope?.accepted === true && Date.now() - envelope.createdAt < 15 * 60_000 ? JSON.stringify(envelope.draft) : null;
      const raw = handoff || localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (typeof draft.text !== 'string') throw new Error('Invalid draft');
        if (handoff) { localStorage.setItem(draftKey, raw); localStorage.removeItem(WRITING_TRUST_HANDOFF_KEY); }
        setInputText(draft.text); setDocumentName(draft.documentName || buildSessionTitle(draft.text));
        setSourceFileName(draft.source || null); setDomain(draft.domain || 'general'); setTone(draft.tone || 'professional');
        setLengthMode(draft.lengthMode || 'exact'); setRewriteMode(draft.rewriteMode || 'safe_polish');
        setVoiceSample(draft.voiceSample || ''); setRevisions(Array.isArray(draft.revisions) ? draft.revisions.slice(-5) : []);
        setReviewParts(Array.isArray(draft.reviewParts) ? draft.reviewParts : []);
        setIntensity(draft.intensity || 'balanced'); setQualityMode(draft.qualityMode || 'fast'); setProtectedTermsText(draft.protectedTermsText || '');
        setHumanizeResult(draft.humanizeResult || null); setDetection(draft.detection || null); setOriginalDetection(draft.originalDetection || null);
        setUniqueness(draft.uniqueness || null); setDeepScan(draft.deepScan || null); setStep(draft.step || 'scan');
        setSessionId(draft.sessionId || null); setCloudVersion(draft.cloudVersion || 0);
        if (draft.draftIdentity) setDraftIdentity(draft.draftIdentity);
        setSaveStatus('Recovered device draft');
      }
    } catch { setSaveStatus('Draft recovery unavailable'); }
    setHydratedOwner(ownerKey);
  }, [draftKey, ownerKey, retryKey]);

  useEffect(() => {
    if (hydratedOwner !== ownerKey) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ text: inputText, source: sourceFileName, documentName,
        domain, tone, lengthMode, rewriteMode, intensity, qualityMode, protectedTermsText, voiceSample, reviewParts, revisions, step,
        humanizeResult, detection, originalDetection, uniqueness, deepScan, sessionId, cloudVersion, draftIdentity }));
      setSaveStatus(retryStorageAvailable ? 'Draft saved on this device' : 'Draft saved; retry recovery unavailable — keep this tab open');
    } catch { setSaveStatus('Device storage unavailable — keep this tab open or save to library'); }
  }, [draftKey, hydratedOwner, ownerKey, retryStorageAvailable, inputText, sourceFileName, documentName, domain, tone, lengthMode, rewriteMode, intensity, qualityMode, protectedTermsText, voiceSample, reviewParts, revisions, step, humanizeResult, detection, originalDetection, uniqueness, deepScan, sessionId, cloudVersion, draftIdentity]);

  /* eslint-enable react-hooks/set-state-in-effect */

  const resetAnalysis = useCallback(() => {
    setStoryFailure(false);
    setDetection(null);
    setOriginalDetection(null);
    setHumanizeResult(null);
    setUniqueness(null);
    setDeepScan(null);
    setStep('scan'); setReviewParts([]); setSelectedParagraphs([]); rewriteRequestRef.current = null;
  }, []);

  const processFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['txt', 'docx'].includes(ext)) {
      showToast('Upload TXT or DOCX. Legacy DOC must first be converted to DOCX. PDF support lives in Resume Studio.', 'cancel');
      return;
    }
    if (file.size > 5 * 1024 * 1024) { showToast('Use a file smaller than 5 MB', 'cancel'); return; }
    setLoading('file'); setStoryFailure(false);
    const revision = revisionRef.current, owner = ownerRef.current;
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
      if (!current(revision, owner)) return;
      setInputText(text); setRevisions([]);
      revisionRef.current += 1; setLoading(null); setSessionId(null); setCloudVersion(0); setDraftIdentity(crypto.randomUUID());
      setSourceFileName(file.name);
      setDocumentName(buildSessionTitle(text, file.name));
      resetAnalysis();
      showToast(`Loaded ${file.name}`, 'upload_file');
    } catch (error) {
      if (!current(revision, owner)) return;
      setStoryFailure(true);
      showToast(error instanceof Error ? error.message : 'Could not read that file', 'cancel');
    } finally {
      if (current(revision, owner)) setLoading(null);
    }
  }, [resetAnalysis]);

  const runDetection = useCallback(() => {
    if (countWords(activeText) < 10) {
      showToast('Add at least 10 words to scan', 'cancel');
      return;
    }
    setLoading('scan'); setStoryFailure(false);
    const revision = revisionRef.current, owner = ownerRef.current;
    window.setTimeout(() => {
      if (!current(revision, owner)) return;
      const result = detectAI(activeText);
      setDetection(result);
      setOriginalDetection(prev => prev || result);
      setStep('diagnose');
      setLoading(null);
      showToast(countWords(activeText) < 50 ? 'Short text: review observations without a style score.' : `${buildTrustReport(activeText, result).trustLabel}. Style feedback only.`, 'radar');
    }, prefersReducedMotion ? 0 : 300);
  }, [activeText, prefersReducedMotion]);

  const runDeepScan = useCallback(async () => {
    if (countWords(activeText) < 10) { showToast('Add at least 10 words', 'cancel'); return; }
    setLoading('diagnose'); setStoryFailure(false);
    setDeepScan(null);
    const revision = revisionRef.current, owner = ownerRef.current;
    try {
      const res = await authFetch('/api/writing/deep-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: activeText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (!current(revision, owner)) return;
        if (handleApiError(err)) return;
        throw new Error(err.error || 'Deep scan failed');
      }
      const result: DeepScanResult = await res.json();
      if (!current(revision, owner)) return;
      if (result.status !== 'analyzed' || result.success !== true || typeof result.confidence !== 'number' || !Number.isFinite(result.confidence)) throw new Error('Deep scan did not produce a usable result. No confidence score is available.');
      setDeepScan(result);
      setStep('diagnose');
      showToast('Deep scan added', 'troubleshoot');
    } catch (error) {
      if (!current(revision, owner)) return;
      setStoryFailure(true);
      showToast(error instanceof Error ? error.message : 'Deep scan failed', 'cancel');
    } finally {
      if (current(revision, owner)) setLoading(null);
    }
  }, [activeText, handleApiError]);

  const runHumanize = useCallback(async (paragraphIndices?: number[]) => {
    if (countWords(activeText) < 10) { showToast('Add at least 10 words', 'cancel'); return; }
    setLoading('humanize'); setStoryFailure(false);
    const revision = revisionRef.current, owner = ownerRef.current;
    try {
      const targetParagraphs = paragraphIndices || [];
      const protectedTerms = protectedTermsText
        .split(/[\n,]/)
        .map(term => term.trim())
        .filter(Boolean);
      const requestKey = JSON.stringify({ owner, text: activeText, domain, tone, lengthMode, rewriteMode, intensity, qualityMode, protectedTerms, targetParagraphs, voiceSample });
      if (rewriteRequestRef.current?.key !== requestKey) rewriteRequestRef.current = { key: requestKey, id: crypto.randomUUID() };
      // Persist before dispatch: a reload after a lost response must replay the
      // same server receipt, including at a consumed allowance boundary.
      try {
        localStorage.setItem(retryKey, JSON.stringify(rewriteRequestRef.current));
        setRetryStorageAvailable(true);
      } catch {
        setRetryStorageAvailable(false);
        setSaveStatus('Retry recovery unavailable — keep this tab open to retry safely');
        showToast('Retry recovery unavailable on this device. Keep this tab open to retry safely.', 'info');
      }
      const res = await authFetch('/api/writing/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: activeText,
          requestId: rewriteRequestRef.current.id,
          voiceSample,
          domain,
          tone,
          lengthMode,
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
        if (!current(revision, owner)) return;
        if (handleApiError(err)) return;
        throw new Error(err.error || 'Humanization failed');
      }
      const result: HumanizeResult = await res.json();
      if (!current(revision, owner)) return;
      if (typeof result.rewritten !== 'string' || !result.rewritten.trim() || !Array.isArray(result.changes)) throw new Error('The rewrite was incomplete. Your draft is unchanged.');
      rewriteRequestRef.current = null;
      try { localStorage.removeItem(retryKey); setRetryStorageAvailable(true); } catch { setRetryStorageAvailable(false); }
      setRevisions(previous => appendWritingRevision(previous, activeText, 'Before rewrite'));
      setReviewParts(buildWritingReview(activeText, result.rewritten)); setSelectedParagraphs([]); setShowOriginal(false);
      setUniqueness(null); setDeepScan(null);
      setHumanizeResult({ ...result, checkedText: result.rewritten, checkedPolicy: policyKey, reviewSource: activeText });
      const nextDetection = detectAI(result.rewritten);
      setDetection(nextDetection);
      setStep('verify');
      setSaveStatus(user ? 'Ready to save to library' : 'Needs sign-in to save everywhere');
      showToast('Rewrite ready. Review what changed before using it.', 'auto_fix_high');
    } catch (error) {
      if (!current(revision, owner)) return;
      setStoryFailure(true);
      showToast(error instanceof Error ? error.message : 'Humanization failed', 'cancel');
    } finally {
      if (current(revision, owner)) setLoading(null);
    }
  }, [activeText, domain, handleApiError, intensity, lengthMode, protectedTermsText, qualityMode, rewriteMode, tone, user, voiceSample, policyKey, retryKey]);

  const runUniquenessCheck = useCallback(async () => {
    if (countWords(activeText) < 20) {
      showToast('Verify needs at least 20 words', 'cancel');
      return;
    }
    setLoading('verify'); setStoryFailure(false);
    const revision = revisionRef.current, owner = ownerRef.current;
    try {
      const res = await authFetch('/api/writing/uniqueness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: activeText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (!current(revision, owner)) return;
        if (handleApiError(err)) return;
        throw new Error(err.error || 'Verification failed');
      }
      const result: UniquenessResult = await res.json();
      if (!current(revision, owner)) return;
      setUniqueness(result);
      setStep('export');
      showToast(`Phrasing variety: ${result.uniquenessScore}/100`, 'verified');
    } catch (error) {
      if (!current(revision, owner)) return;
      setStoryFailure(true);
      showToast(error instanceof Error ? error.message : 'Verification failed', 'cancel');
    } finally {
      if (current(revision, owner)) setLoading(null);
    }
  }, [activeText, handleApiError]);

  const saveSession = useCallback(async () => {
    if (!user) {
      showToast('Sign in to save writing sessions', 'lock');
      setSaveStatus('Needs sign-in to save everywhere');
      return;
    }
    setLoading('save'); setStoryFailure(false);
    const revision = revisionRef.current, owner = ownerRef.current;
    try {
      const res = await authFetch('/api/writing/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        id: sessionId || draftIdentity, version: cloudVersion,
        title: documentName || buildSessionTitle(inputText, sourceFileName),
        sourceFileName,
        inputText,
        finalText: humanizeResult?.rewritten ?? '',
        domain,
        tone,
        lengthMode,
        mode: rewriteMode,
        step,
        originalScore: originalDetection?.humanScore ?? detection?.humanScore ?? null,
        finalScore: detection?.humanScore ?? null,
        uniquenessScore: uniqueness?.uniquenessScore ?? null,
        metadata: { intensity, qualityMode, protectedTermsText, voiceSample, hasOutput: humanizeResult !== null, revisions },
      }) });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || 'Could not save'); }
      const saved = await res.json();
      if (owner !== ownerRef.current) return;
      // A successful save still advances the base version when newer local edits exist.
      if (saved.session?.id !== identityRef.current) return;
      setCloudVersion(saved.session.version);
      setSessionId(saved.session.id);
      if (!current(revision, owner)) return;
      setSaveStatus(`Saved revision ${revisionRef.current} to library`);
      showToast('Writing session saved', 'save');
    } catch (error) {
      if (!current(revision, owner)) return;
      setStoryFailure(true);
      showToast(error instanceof Error ? error.message : 'Could not save', 'cancel');
    } finally {
      if (current(revision, owner)) setLoading(null);
    }
  }, [cloudVersion, protectedTermsText, detection, documentName, domain, draftIdentity, humanizeResult, inputText, intensity, lengthMode, originalDetection, qualityMode, rewriteMode, sessionId, sourceFileName, step, tone, uniqueness, user, voiceSample, revisions]);

  const loadLibrary = useCallback(async () => {
    if (!user) return;
    setLibraryOpen(true); setLibraryLoading(true);
    const revision = revisionRef.current, owner = ownerRef.current;
    try {
      const response = await authFetch('/api/writing/sessions');
      if (!response.ok) throw new Error('Library could not be loaded');
      const body = await response.json();
      if (!current(revision, owner)) return;
      setLibrary(Array.isArray(body.sessions) ? body.sessions : []);
    } catch (error) { if (!current(revision, owner)) return; showToast(error instanceof Error ? error.message : 'Library could not be loaded', 'cancel'); }
    finally { if (owner === ownerRef.current) setLibraryLoading(false); }
  }, [user]);

  const openLibrarySession = useCallback(async (id: string) => {
    const revision = ++revisionRef.current, owner = ownerRef.current;
    setLoading(null);
    try {
      const response = await authFetch(`/api/writing/sessions?id=${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error('Session could not be opened');
      const body = await response.json();
      const saved = body.sessions;
      if (!saved) throw new Error('Session is unavailable');
      if (!current(revision, owner)) return;
      revisionRef.current += 1;
      setCloudVersion(saved.version || 0); setIntensity(saved.metadata?.intensity || 'balanced'); setQualityMode(saved.metadata?.qualityMode || 'fast'); setProtectedTermsText(saved.metadata?.protectedTermsText || '');
      resetAnalysis(); setSessionId(saved.id); setInputText(saved.input_text || ''); setDocumentName(saved.title || 'Writing session');
      setVoiceSample(saved.metadata?.voiceSample || ''); setRevisions(saved.metadata?.revisions || []);
      setSourceFileName(saved.source_file_name || null); setDomain(saved.domain || 'general');
      setTone(saved.tone || 'professional'); setLengthMode(saved.length_mode || 'exact');
      setRewriteMode(saved.mode || 'safe_polish'); setStep(saved.step || 'scan');
      const hasFinal = saved.metadata?.hasOutput ?? Boolean(saved.final_text);
      setHumanizeResult(hasFinal ? { rewritten: saved.final_text ?? '', changes: [], qualityDecision: 'review_required' } : null);
      setReviewParts(hasFinal ? buildWritingReview(saved.input_text || '', saved.final_text ?? '') : []);
      if (saved.input_text) setOriginalDetection(detectAI(saved.input_text));
      const restoredText = hasFinal ? saved.final_text ?? '' : saved.input_text || '';
      if (restoredText.trim()) setDetection(detectAI(restoredText));
      setLibraryOpen(false); setSaveStatus('Opened from library');
    } catch (error) { if (!current(revision, owner)) return; showToast(error instanceof Error ? error.message : 'Session could not be opened', 'cancel'); }
  }, [resetAnalysis]);

  const exportText = useCallback(async (format: ExportFormat) => {
    if (!activeText.trim()) return;
    setLoading('export');
    const revision = revisionRef.current, owner = ownerRef.current;
    try {
      const { blob, filename } = await exportDocument(activeText, {
        format,
        title: documentName || 'Writing Trust Document',
        author: user?.displayName || user?.email || 'Talent Studio',
      });
      if (!current(revision, owner)) return;
      downloadBlob(blob, filename);
      setStep('export');
      showToast(`${format.toUpperCase()} downloaded`, 'download');
    } catch {
      if (!current(revision, owner)) return;
      showToast('Export failed', 'cancel');
    } finally {
      if (current(revision, owner)) setLoading(null);
    }
  }, [activeText, documentName, user]);

  const copyText = useCallback(async () => {
    try { await navigator.clipboard.writeText(activeText); showToast('Copied to clipboard', 'content_copy'); }
    catch { showToast('Clipboard unavailable. Select and copy the draft manually.', 'cancel'); }
  }, [activeText]);

  const clearAll = useCallback(() => {
    revisionRef.current += 1;
    setLoading(null); setSessionId(null); setCloudVersion(0); setDraftIdentity(crypto.randomUUID());
    setInputText(''); setRevisions([]);
    setDocumentName('Untitled writing session');
    setSourceFileName(null);
    resetAnalysis();
    setSaveStatus('New draft');
  }, [resetAnalysis]);

  const visibleText = showOriginal ? inputText : activeText;
  const editOutput = (text: string, label = 'Before editing') => {
    invalidate(); setShowOriginal(false); setSelectedParagraphs([]);
    setRevisions(previous => appendWritingRevision(previous, activeText, label));
    setHumanizeResult({ rewritten: text, changes: [], qualityDecision: 'review_required' });
    setDetection(null); setDeepScan(null); setUniqueness(null); setStep('humanize');
  };
  const decideChange = (index: number, decision: 'keep' | 'reject') => {
    const next = reviewParts.map((part, i) => i === index ? { ...part, decision } : part);
    if (decision === 'reject' || reviewParts[index].decision === 'reject') editOutput(materializeWritingReview(next), 'Before reviewing a change');
    setReviewParts(next);
  };


  return (
    <SuiteToolShell variant="editor" className="taco-writing-workspace" contentClassName="space-y-5">
        {/* First child, not last. UsageLimitGate is an in-flow section, not an
            overlay, so calling this after </main> put a cap block below a
            full-height two-column workspace - the spinner stopped and nothing
            visible happened. Gallery and ATSScorePanel already render it first. */}
        {renderAuthModal()}
        <SuiteToolHeader
          tool="gallery"
          title="Humanize writing"
          subtitle="Improve your writing, review every change, and keep your experience in your own words."
          icon="verified_user"
          pageHelpId="writing-tools"
          actions={
            <>
              {user && <button className="min-h-[44px] px-3 text-xs" onClick={() => {
                try { const guest = localStorage.getItem(`${WRITING_TRUST_DRAFT_KEY}:guest`); if (!guest) { showToast('No guest draft on this device', 'info'); return; }
                  const draft = JSON.parse(guest); draft.sessionId = null; draft.cloudVersion = 0; draft.draftIdentity = crypto.randomUUID();
                  localStorage.setItem(WRITING_TRUST_HANDOFF_KEY, JSON.stringify({ owner: ownerKey, accepted: true, createdAt: Date.now(), draft })); window.location.reload();
                } catch { showToast('Guest draft could not be imported. Device storage may be blocked.', 'cancel'); }
              }}>Import guest draft</button>}
              <button onClick={loadLibrary} disabled={!user} className="inline-flex min-h-[44px] items-center gap-1.5 px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[12px] font-medium text-[var(--text-secondary)] disabled:opacity-45">
                <span className="material-symbols-rounded text-[15px]">folder_open</span> Library
              </button>
              <button
                onClick={saveSession}
                disabled={!inputText.trim() || loading === 'save'}
                className="inline-flex min-h-[44px] items-center gap-1.5 px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border)] transition-all disabled:opacity-45"
              >
                <span className="material-symbols-rounded text-[15px]">{loading === 'save' ? 'progress_activity' : 'save'}</span>
                Save
              </button>
            </>
          }
        />

        {libraryOpen && (
          <section className="elevation-card rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Saved writing sessions</h2><button onClick={() => setLibraryOpen(false)} className="text-xs text-[var(--text-muted)]">Close</button></div>
            <input aria-label="Search writing library" value={librarySearch} onChange={event => setLibrarySearch(event.target.value)} placeholder="Search saved sessions" className="mb-3 w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-input)] p-2 text-sm" />
            {libraryLoading ? <p role="status">Loading saved sessions…</p> : library.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No saved sessions yet.</p> : <div className="grid gap-2 md:grid-cols-2">{library.filter(item => item.title.toLowerCase().includes(librarySearch.toLowerCase())).map(item => <div key={item.id} className="flex rounded-[10px] border border-[var(--border-subtle)] p-3"><button onClick={() => openLibrarySession(item.id)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium">{item.title}</span><span className="text-xs text-[var(--text-muted)]">{item.updated_at ? new Date(item.updated_at).toLocaleString() : 'Saved session'}</span></button><button aria-label={`Delete ${item.title}`} className="min-h-[44px] px-2 text-xs" onClick={async () => {
              if (!window.confirm(`Delete “${item.title}” from the cloud library? Your current device draft will remain.`)) return;
              const owner = ownerRef.current;
              try { const response = await authFetch(`/api/writing/sessions?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' }); if (!response.ok) throw new Error('Delete failed');
                if (owner !== ownerRef.current) return; setLibrary(previous => previous.filter(row => row.id !== item.id));
                if (identityRef.current === item.id) { setSessionId(null); setCloudVersion(0); setDraftIdentity(crypto.randomUUID()); }
              } catch { if (owner === ownerRef.current) showToast('Session could not be deleted', 'cancel'); }
            }}>Delete</button></div>)}</div>}

          </section>
        )}

        <details data-guide="writing-settings" className="elevation-card rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
          <summary className="cursor-pointer text-sm font-medium">Document settings · {tone} · {lengthMode} length</summary>
          <p className="my-3 text-xs text-[var(--text-muted)]">Modes initialize settings; your edits below control the next rewrite.</p>
          <div className="grid gap-3 lg:grid-cols-[1.25fr_0.75fr_0.75fr_0.75fr_auto] lg:items-end">
            <label>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Document</span>
              <input
                value={documentName}
                onChange={event => { invalidate(); setDocumentName(event.target.value); }}
                className="h-10 w-full rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-base font-medium text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <SelectField label="Domain" value={domain} options={DOMAINS} onChange={value => { invalidate(); setDomain(value); }} />
            <SelectField label="Tone" value={tone} options={TONES} onChange={value => { invalidate(); setTone(value); }} />
            <SelectField label="Length" value={lengthMode} options={LENGTHS} onChange={value => { invalidate(); setLengthMode(value); }} />
            <div className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Status</p>
              <p className="mt-1 whitespace-nowrap text-xs font-medium text-[var(--text-primary)]">{saveStatus}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Rewrite mode</span>
            {REWRITE_MODES.map(mode => (
              <button
                key={mode.value}
                aria-pressed={rewriteMode === mode.value}
                onClick={() => {
                  invalidate(); setRewriteMode(mode.value);
                  const settings = mapModeToSettings(mode.value);
                  setDomain(settings.domain);
                  setTone(settings.tone);
                  setLengthMode(settings.lengthMode);
                }}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] border px-3 py-2 text-xs font-medium transition ${
                  rewriteMode === mode.value
                    ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
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
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Intensity</span>
              {INTENSITIES.map(option => (
                <button
                  key={option.value}
                  aria-pressed={intensity === option.value}
                  onClick={() => { invalidate(); setIntensity(option.value); }}
                  className={`min-h-[44px] rounded-[10px] border px-3 py-2 text-xs font-medium transition ${
                    intensity === option.value
                      ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                      : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Pace</span>
              {QUALITY_MODES.map(option => (
                <button
                  key={option.value}
                  aria-pressed={qualityMode === option.value}
                  onClick={() => { invalidate(); setQualityMode(option.value); }}
                  className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] border px-3 py-2 text-xs font-medium transition ${
                    qualityMode === option.value
                      ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
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
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Protected terms</span>
              <input
                value={protectedTermsText}
                onChange={event => { invalidate(); setProtectedTermsText(event.target.value); }}
                placeholder="Optional: names, metrics, citations, URLs, tools"
                className="h-10 w-full rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-base text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
          </div>
          <label className="mt-4 block text-sm">Personal voice sample (optional)
            <textarea aria-label="Personal voice sample" value={voiceSample} maxLength={5000} onChange={event => { invalidate(); setVoiceSample(event.target.value); }} placeholder="Paste a short piece you wrote. Taco uses its tone, not its facts." className="mt-2 min-h-24 w-full rounded border border-[var(--border)] bg-[var(--bg-input)] p-3" />
          </label>
          <p className="mt-2 text-xs text-[var(--text-muted)]">English writing. Scan runs on this device. Humanize, Diagnose and Verify send the selected draft to AI providers; Save stores it in your account. Imports extract text, not page layout.</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Each Humanize request uses the input document’s word count, including a selected-paragraph rewrite; retries of the same request are charged once.</p>
        </details>

        <div>
          <div data-guide="writing-actions"><ActionRail
            step={step}
            loading={loading}
            canScan={activeWordCount >= 10}
            hasReport={!!detection}
            hasOutput={!!activeText.trim()}
            onScan={runDetection}
            onDeepScan={runDeepScan}
            onHumanize={() => runHumanize()}
            onVerify={runUniquenessCheck}
            onExport={() => exportText('docx')}
          /></div>
        </div>
        {loading && <PipelineWorkingPanel stage={loading} intensity={intensity} qualityMode={qualityMode} />}

        <main className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.82fr)]">
          <section className="elevation-card rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
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
                  accept=".txt,.docx"
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
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)] disabled:opacity-45"
                >
                  <span className="material-symbols-rounded text-base">{loading === 'file' ? 'progress_activity' : 'upload_file'}</span>
                  Upload
                </button>
                {humanizeResult && (
                  <button
                    aria-pressed={showOriginal}
                    onClick={() => setShowOriginal(prev => !prev)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)]"
                  >
                    <span className="material-symbols-rounded text-base">compare_arrows</span>
                    {showOriginal ? 'Show Final' : 'Show Original'}
                  </button>
                )}
                <button onClick={clearAll} className="min-h-[44px] rounded-[10px] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--danger)]">
                  Clear
                </button>
              </div>
            </div>

            <textarea data-guide="writing-editor"
              aria-label="Writing draft"
              value={visibleText}
              readOnly={showOriginal}
              onSelect={event => { if (!showOriginal) setSelectedParagraphs(paragraphIndicesForSelection(activeText, event.currentTarget.selectionStart, event.currentTarget.selectionEnd)); }}
              onChange={event => {
                if (showOriginal) setShowOriginal(false);
                invalidate();
                if (humanizeResult && !showOriginal) {
                  editOutput(event.target.value); setReviewParts([]);
                } else { setInputText(event.target.value); resetAnalysis(); }
              }}
              aria-describedby="writing-editor-help"
              placeholder="Paste a resume summary, cover letter, essay, LinkedIn post, recruiter email, or any high-stakes writing here..."
              className="min-h-[320px] w-full resize-y rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-input)] p-4 text-base leading-7 text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] sm:min-h-[480px] sm:p-5"
            />
            <div id="writing-editor-help" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]" aria-live="polite">
              <span>{wordCount.toLocaleString()} original words · {activeWordCount.toLocaleString()} current words</span>
              <span data-guide="writing-save-status" role="status">{saveStatus}</span>
            </div>

            {!!selectedParagraphs.length && !showOriginal && <button disabled={!!loading} onClick={() => runHumanize(selectedParagraphs)} className="mt-3 min-h-11 border border-[var(--accent)] px-4">Improve {selectedParagraphs.length} selected paragraph{selectedParagraphs.length === 1 ? '' : 's'}</button>}
            {revisions.length > 0 && <details className="mt-4 border-t border-[var(--border)] pt-3"><summary className="cursor-pointer text-sm">Revision history · {revisions.length} saved versions</summary><p className="mt-2 text-xs text-[var(--text-muted)]">Restoring a version clears its checks. Your original source is retained.</p>{revisions.map((revision, index) => <div key={`${revision.createdAt}-${index}`} className="mt-2 flex items-center justify-between gap-2"><span className="text-sm">{revision.label} · {new Date(revision.createdAt).toLocaleTimeString()}</span><button className="min-h-11 underline" onClick={() => { editOutput(revision.text, 'Before restoring a version'); setReviewParts([]); }}>Restore version {index + 1}</button></div>)}</details>}
            {reviewParts.some(part => part.original !== part.proposed) && <section data-guide="writing-review" className="mt-5 space-y-3" aria-label="Review changes"><h2 className="text-lg font-semibold">Review changes</h2><p className="text-xs text-[var(--text-muted)]">Compare the wording and facts. Keeping a change records your choice; automated checks do not verify meaning.</p>{reviewParts.map((part, index) => part.original === part.proposed ? null : <article key={index} className="border border-[var(--border)] p-3"><div className="grid gap-3 md:grid-cols-2"><div><h3 className="text-xs font-semibold">Before</h3><p className="mt-1 whitespace-pre-wrap text-sm"><del className="decoration-[var(--text-muted)]">{part.original || '(Empty)'}</del></p></div><div><h3 className="text-xs font-semibold">Proposed</h3><p className="mt-1 whitespace-pre-wrap text-sm"><ins className="decoration-[var(--accent)]">{part.proposed || '(Removed)'}</ins></p></div></div><div className="mt-3 flex flex-wrap gap-3"><button aria-pressed={part.decision === 'keep'} className="min-h-11 border border-[var(--border)] px-3" onClick={() => decideChange(index, 'keep')}>Keep change</button><button aria-pressed={part.decision === 'reject'} className="min-h-11 border border-[var(--border)] px-3" onClick={() => decideChange(index, 'reject')}>Use original</button><span role="status" className="self-center text-xs">{part.decision === 'pending' ? 'Awaiting your review' : part.decision === 'keep' ? 'Kept by you' : 'Original restored'}</span></div></article>)}</section>}
            {!!humanizeResult?.changes.length && <details className="mt-4"><summary className="cursor-pointer text-sm">Why these changes were suggested</summary><ul className="mt-2 space-y-2 text-sm">{humanizeResult.changes.map((change, index) => <li key={index}>{change.reason}</li>)}</ul></details>}
            {humanizeResult && (
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <MetricTile label="Targeted" value={`${humanizeResult.targetedParagraphs?.length || 0} sections`} />
                <MetricTile label="Agent" value="Taco writing engine" />
                <MetricTile label="Quality" value={checksCurrent ? 'Checks completed · review facts' : 'Review required'} />
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <section className="elevation-card rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Writing patterns</p>
                  <h2 className="mt-1 text-[18px] font-semibold tracking-tight">{formatVerdict(trustReport)}</h2>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Style signals, not proof of authorship or truth. Review every factual change. Verify reviews phrasing; it does not search a plagiarism database.</p>
                </div>
                {trustReport && activeWordCount >= 50 ? (
                  <ScoreRing score={trustReport.humanScore} label="Style" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)]">
                    {trustReport ? 'Short text · no score' : 'Optional scan'}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MetricTile label="Reading scope" value={trustReport?.confidenceBand || 'Not scanned'} />
                <MetricTile label="Phrasing variety" value={uniqueness ? `${uniqueness.uniquenessScore}/100` : 'Verify pending'} tone={uniqueness ? scoreTone(uniqueness.uniquenessScore) : undefined} />
                <MetricTile label="Readability" value={trustReport ? `${trustReport.readability.averageSentenceLength} w/sentence` : 'Pending'} />
                <MetricTile label="Flags" value={trustReport ? `${trustReport.flags.length}` : 'Not scanned'} />
              </div>

              <div className="mt-5 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Next best action</p>
                <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">{recommendedAction}</p>
                {deepScan?.summary && <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{deepScan.summary}</p>}
              </div>
              {checksCurrent && humanizeResult?.qualityGates && (
                <div className="mt-4 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Quality gates</p>
                  <div className="mt-3 space-y-2">
                    {humanizeResult.qualityGates.map(gate => (
                      <div key={gate.id} className="flex items-start justify-between gap-3 text-xs">
                        <div className="min-w-0"><span className="font-medium text-[var(--text-secondary)]">{gate.label}</span><p className="mt-1 leading-5 text-[var(--text-muted)]">{gate.detail}</p></div>
                        <span className={gate.status === 'pass' ? 'text-[var(--success)]' : gate.status === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--danger)]'}>
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

            <section className="elevation-card rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Priority fixes</p>
                  <h3 className="mt-1 text-base font-semibold">Paragraph signals</h3>
                </div>
                {detection && <span className="rounded-[9px] bg-[var(--card-bg)] border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">{detection.paragraphScores.length} checked</span>}
              </div>
              {detection ? (
                <ParagraphDiagnostics paragraphs={activeWordCount >= 50 ? detection.paragraphScores : []} onFix={index => runHumanize([index])} disabled={!!loading} />
              ) : (
                <div className="rounded-[14px] border border-dashed border-[var(--border-subtle)] p-6 text-center">
                  <span className="material-symbols-rounded text-3xl text-[var(--text-muted)]">radar</span>
                  <p className="mt-2 text-sm font-medium">Run Scan to see paragraph-level guidance.</p>
                </div>
              )}
            </section>

            <section className="elevation-card rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Export station</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => exportText('docx')}
                  disabled={!activeText.trim() || !!loading}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-[var(--text-primary)] px-4 py-3 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 disabled:opacity-45"
                >
                  <span className="material-symbols-rounded text-base">description</span>
                  Word
                </button>
                <button
                  onClick={() => exportText('txt')}
                  disabled={!activeText.trim() || !!loading}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)] disabled:opacity-45"
                >
                  <span className="material-symbols-rounded text-base">article</span>
                  TXT
                </button>
                <button
                  data-guide="writing-copy"
                  onClick={copyText}
                  disabled={!activeText.trim()}
                  className="col-span-2 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)] disabled:opacity-45"
                >
                  <span className="material-symbols-rounded text-base">content_copy</span>
                  Copy final text
                </button>
              </div>
              {uniqueness && <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">{uniqueness.summary}</p>}
            </section>
          </aside>
        </main>
      <MobileStickyActionBar
        className="mobile-sticky-actionbar--with-appbar"
        primaryLabel={humanizeResult ? 'Humanize again' : 'Humanize'}
        primaryIcon="auto_fix_high"
        onPrimary={() => runHumanize()}
        disabled={activeWordCount < 10 || !!loading}
        loading={!!loading}
        secondaryActions={[
          { label: 'Save', icon: 'save', onClick: saveSession, disabled: !inputText.trim() || loading === 'save' },
          { label: 'Copy', icon: 'content_copy', onClick: copyText, disabled: !activeText.trim() },
        ]}
      />
    </SuiteToolShell>
  );
}
