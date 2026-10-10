'use client';

import { useToolGuidance } from '@/components/guidance/ToolGuidanceProvider';
import { buildToolStory, storyStep } from '@/lib/tool-story-adapters';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authFetch } from '@/lib/auth-fetch';
import { showToast } from '@/components/Toast';
import { useAuthGate } from '@/hooks/useAuthGate';
import { useStore } from '@/lib/store';
import AssistantThinkingTile from '@/components/assistant/AssistantThinkingTile';
import { getResumeVersions, type ResumeVersion } from '@/lib/database-suite';
import { useApplicationKitContext } from '@/hooks/useApplicationKitContext';
import { resumeSnapshotToText, resumeVersionToApplicationKitContext } from '@/lib/application-kit';
import { getATSProofScore } from '@/lib/ats-score';
import {
  ProofEngineReport,
  type ProofCheckTone,
  type ProofEngineReportData,
  type ProofRequirementStatus,
} from '@/components/suite/ProofEngineReport';

// ── Types ──

interface KeywordMatch {
  keyword: string;
  category: 'hard_skill' | 'soft_skill' | 'tool' | 'certification' | 'domain' | 'action_verb';
  status: 'matched' | 'partial' | 'missing';
  resumeContext?: string;
}

interface ATSScoreResult {
  overallScore: number;
  breakdown: {
    hardSkillsScore: number;
    softSkillsScore: number;
    toolsScore: number;
    formattingScore: number;
    experienceRelevance: number;
  };
  keywords: KeywordMatch[];
  suggestions: string[];
  stats: {
    totalKeywords: number;
    matched: number;
    partial: number;
    missing: number;
  };
  assessment?: {
    hardSkills: 'assessed' | 'unassessed';
    softSkills: 'assessed' | 'unassessed';
    tools: 'assessed' | 'unassessed';
    experienceRelevance: 'assessed' | 'unassessed';
    overall: 'assessed' | 'unassessed';
  };
}

// ── Helpers ──

function getScoreColor(score: number) {
  if (score >= 80) return 'var(--success)';
  if (score >= 60) return 'var(--warning)';
  if (score >= 40) return 'var(--warning)';
  return 'var(--danger)';
}

function getScoreLabel(score: number) {
  if (score >= 80) return 'Excellent Match';
  if (score >= 60) return 'Good Match';
  if (score >= 40) return 'Needs Work';
  return 'Poor Match';
}

function getCategoryIcon(cat: KeywordMatch['category']) {
  switch (cat) {
    case 'hard_skill': return 'code';
    case 'soft_skill': return 'psychology';
    case 'tool': return 'build';
    case 'certification': return 'verified';
    case 'domain': return 'domain';
    case 'action_verb': return 'bolt';
  }
}

function getCategoryLabel(cat: KeywordMatch['category']) {
  switch (cat) {
    case 'hard_skill': return 'Hard Skill';
    case 'soft_skill': return 'Soft Skill';
    case 'tool': return 'Tool/Tech';
    case 'certification': return 'Certification';
    case 'domain': return 'Domain';
    case 'action_verb': return 'Action Verb';
  }
}

function hasEmail(text: string) {
  return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(text);
}

function hasPhone(text: string) {
  return /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/.test(text);
}

function hasDateEvidence(text: string) {
  return /\b(19|20)\d{2}\b/.test(text) || /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}\b/i.test(text);
}

function hasMetricEvidence(text: string) {
  return /\$[\d,.]+|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s?(?:x|hours?|days?|weeks?|months?|users?|customers?|clients?|projects?|people)\b/i.test(text);
}

function requirementStatus(status: KeywordMatch['status']): ProofRequirementStatus {
  if (status === 'matched') return 'matched';
  if (status === 'partial') return 'partial';
  return 'missing';
}

function requirementEvidence(keyword: KeywordMatch) {
  if (keyword.status === 'matched') return keyword.resumeContext || 'The resume contains this requirement.';
  if (keyword.status === 'partial') return keyword.resumeContext || 'The resume has related language, but the evidence is not direct.';
  return 'No direct evidence was found in the resume text.';
}

function buildPreservedFacts(resumeText: string, result: ATSScoreResult) {
  return [
    {
      label: 'Source text locked',
      detail: 'This report checks the pasted resume text and does not rewrite work history, dates, employers, or education.',
      tone: 'success' as ProofCheckTone,
    },
    {
      label: hasEmail(resumeText) || hasPhone(resumeText) ? 'Contact facts detected' : 'Contact facts need review',
      detail: hasEmail(resumeText) || hasPhone(resumeText)
        ? 'The resume includes contact evidence that should stay unchanged during tailoring.'
        : 'Add standard contact details before using this resume in an application packet.',
      tone: hasEmail(resumeText) || hasPhone(resumeText) ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
    },
    {
      label: hasDateEvidence(resumeText) ? 'Timeline evidence present' : 'Timeline evidence missing',
      detail: hasDateEvidence(resumeText)
        ? 'Dates or years appear in the resume, so future edits should preserve the timeline.'
        : 'Add role dates before tailoring. Taco should not infer dates from the job description.',
      tone: hasDateEvidence(resumeText) ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
    },
    {
      label: hasMetricEvidence(resumeText) ? 'Outcome proof present' : 'Outcome proof needed',
      detail: hasMetricEvidence(resumeText)
        ? 'The resume includes measurable proof that can support stronger role-specific bullets.'
        : 'Add real numbers before claiming impact, such as time saved, revenue protected, users supported, or risk reduced.',
      tone: hasMetricEvidence(resumeText) ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
    },
    {
      label: 'Keyword coverage counted',
      detail: `${result.stats.matched} matched, ${result.stats.partial} partial, and ${result.stats.missing} missing JD requirements were checked.`,
      tone: result.stats.missing > 0 ? 'warning' as ProofCheckTone : 'success' as ProofCheckTone,
    },
  ];
}

export function buildProofEngineReport(result: ATSScoreResult, resumeText: string, jdText: string): ProofEngineReportData {
  const sortedRequirements = [...result.keywords].sort((a, b) => {
    const order = { missing: 0, partial: 1, matched: 2 };
    return order[a.status] - order[b.status];
  });
  const missing = result.keywords.filter(keyword => keyword.status === 'missing');
  const matched = result.keywords.filter(keyword => keyword.status === 'matched');
  const certificationGaps = missing.filter(keyword => keyword.category === 'certification');
  const blockedClaims = certificationGaps.length > 0
    ? certificationGaps.slice(0, 4)
    : missing.slice(0, 3);
  const topChanges = missing.slice(0, 3);
  const suggestions = result.suggestions.slice(0, 4);

  return {
    title: 'Proof report for this job description',
    description: 'This report turns ATS scoring into review-first evidence: what matched, what is missing, what must stay true, and what Taco should not invent.',
    score: getATSProofScore(result),
    scoreLabel: 'JD match',
    sourceLabel: jdText.trim() ? 'Pasted job description' : 'Job description',
    requirements: sortedRequirements.slice(0, 12).map(keyword => ({
      label: keyword.keyword,
      status: requirementStatus(keyword.status),
      evidence: requirementEvidence(keyword),
      source: getCategoryLabel(keyword.category),
    })),
    preservedFacts: buildPreservedFacts(resumeText, result),
    rejectedClaims: blockedClaims.map(keyword => ({
      claim: keyword.keyword,
      reason: keyword.category === 'certification'
        ? 'This looks like a certification requirement. Do not add it unless it is already true.'
        : 'This requirement was not found in the resume text.',
      decision: 'Block from generated drafts until the user provides proof',
    })),
    changes: topChanges.length > 0 ? topChanges.map(keyword => ({
      before: `The resume does not show direct evidence for "${keyword.keyword}".`,
      after: `Add "${keyword.keyword}" only by tying it to a real project, tool, credential, or result already in your background.`,
      rationale: 'The Proof Engine can recommend where evidence is missing, but it should not create new experience.',
    })) : matched.slice(0, 3).map(keyword => ({
      before: `The resume already contains "${keyword.keyword}".`,
      after: `Keep this fact and place it near the role-specific achievement it supports.`,
      rationale: 'Strong matched evidence should be preserved and made easier for reviewers and ATS systems to find.',
    })),
    formattingChecks: [
      {
        label: 'Formatting score',
        detail: `${result.breakdown.formattingScore}% ATS formatting score from the current resume text.`,
        tone: result.breakdown.formattingScore >= 70 ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
      },
      {
        label: 'Experience relevance',
        detail: result.assessment?.experienceRelevance === 'unassessed'
          ? 'Experience relevance was not assessed because the job description provided no domain or certification requirements.'
          : `${result.breakdown.experienceRelevance}% experience relevance based on overlap with the job description.`,
        tone: result.assessment?.experienceRelevance === 'unassessed'
          ? 'neutral' as ProofCheckTone
          : result.breakdown.experienceRelevance >= 70 ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
      },
      {
        label: 'Suggestion review',
        detail: suggestions[0] || 'No formatting suggestions were returned by this scan.',
        tone: suggestions.length > 0 ? 'warning' as ProofCheckTone : 'success' as ProofCheckTone,
      },
      {
        label: 'No-invention guard',
        detail: 'Missing keywords are treated as proof gaps. They are not facts until the user confirms evidence.',
        tone: missing.length > 0 ? 'warning' as ProofCheckTone : 'success' as ProofCheckTone,
      },
    ],
    reportKind: 'scoring-only',
  };
}

// ── Score Ring ──

function ScoreRing({ score, size = 160 }: { score: number; size?: number }) {
  const radius = (size - 20) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="currentColor" strokeWidth="8"
          className="text-[var(--border-subtle)]"
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - progress }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6 }}
          className="text-4xl font-black" style={{ color }}
        >
          {score}
        </motion.span>
        <span className="text-[11px] text-[var(--text-secondary)] uppercase tracking-widest mt-0.5">
          ATS Score
        </span>
        <span className="text-[11px] text-[var(--text-muted)] lowercase tracking-normal">
          estimate
        </span>
      </div>
    </div>
  );
}

// ── Mini Bar Chart ──

function BreakdownBar({ label, score, assessed = true, icon, delay = 0 }: { label: string; score: number; assessed?: boolean; icon: string; delay?: number }) {
  const color = getScoreColor(score);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex items-center gap-3"
    >
      <span className="material-symbols-rounded text-sm" style={{ color }}>
        {icon}
      </span>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-[var(--text-secondary)]">{label}</span>
          <span className="text-xs font-bold" style={{ color }}>{assessed ? `${score}%` : 'Unassessed'}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: assessed ? `${score}%` : '0%' }}
            transition={{ duration: 1, delay: delay + 0.3, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// ── Keyword Pill ──

function KeywordPill({ kw }: { kw: KeywordMatch }) {
  const statusConfig = {
    matched: { className: 'border-[var(--success)] text-[var(--success)]', icon: 'check_circle' },
    partial: { className: 'border-[var(--warning)] text-[var(--warning)]', icon: 'radio_button_partial' },
    missing: { className: 'border-[var(--danger)] text-[var(--danger)]', icon: 'cancel' },
  };

  const config = statusConfig[kw.status];

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-transform hover:scale-105 cursor-default ${config.className}`}
      title={kw.resumeContext || `${kw.keyword} (${getCategoryLabel(kw.category)})`}
    >
      <span className="material-symbols-rounded text-[12px]">{config.icon}</span>
      <span>{kw.keyword}</span>
      <span className="text-[11px] text-[var(--text-muted)]">{getCategoryLabel(kw.category)}</span>
    </div>
  );
}

// ══════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════

interface ATSScorePanelProps {
  resumeText?: string;
  onClose?: () => void;
}

export default function ATSScorePanel({ resumeText: initialResumeText, onClose }: ATSScorePanelProps) {
  const { user } = useStore();
  const { handleApiError, renderAuthModal } = useAuthGate();
  const { context: kitContext, updateContext } = useApplicationKitContext();

  const [resumeText, setResumeText] = useState(initialResumeText || '');
  const [jdText, setJdText] = useState('');
  const [result, setResult] = useState<ATSScoreResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'matched' | 'partial' | 'missing'>('all');

  // Saved Resumes integration
  const [savedResumes, setSavedResumes] = useState<ResumeVersion[]>([]);

  useToolGuidance(buildToolStory({
    toolId: 'ats-analyzer', title: 'Resume match check', contextKey: JSON.stringify(['score', kitContext.scopeId, kitContext.resumeVersionId]),
    purpose: 'Compare resume text with a posting and inspect supported keyword and structural observations.',
    pending: isLoading, hasResult: Boolean(result), failed: kitContext.atsResult?.status === 'error', stale: kitContext.atsResult?.status === 'stale',
    work: [storyStep('tab', 'Choose the check you need', 'Match Score compares text to a posting. ATS Preview performs educational checks on structured fields; neither runs a vendor ATS.', 'ats-tabs', 'Use the current Match Score panel; the check selector is shown in ATS Analyzer.'), storyStep('source', 'Bring the real resume', 'Load a saved resume or paste its text. Selecting a saved version changes the source for this check.', 'ats-score-source', 'Inputs appear when starting a new analysis; the current report retains its context.'), storyStep('posting', 'Bring the target posting', 'Paste the actual job description. Missing text cannot establish a match.', 'ats-score-posting', 'Choose Analyze again yourself to return to the inputs.'), storyStep('run', 'Run this comparison', 'Choose Calculate when ready. Help never calculates, saves or spends an allowance.', 'ats-score-run', 'The current report is already shown; use Analyze again to begin another check.')],
    result: [storyStep('report', 'Inspect observations and evidence', 'Read supported, partial and missing keywords with the report limitations. A text-coverage score is not a hiring probability or universal ATS pass.', 'ats-score-result'), storyStep('next', 'Choose the next edit', 'Use the report to decide edits or explicitly start another check. Reading this guide does not confirm a resume change.', 'ats-score-again')],
    recovery: [storyStep('retry', 'Keep your source and retry', 'The existing check error is retained in the application context. Confirm the text and choose Calculate yourself when ready.', 'ats-score-run', 'The input controls appear when there is no retained report. Choose Analyze again to return to them.')],
  }));

  // Hydrate once when the persisted Application Kit context changes. This is an
  // intentional external-store-to-local-form sync; adding the local fields to
  // dependencies would turn each user keystroke into a hydration pass.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!resumeText && kitContext.resumeText) setResumeText(kitContext.resumeText);
    if (!resumeText && kitContext.resumeSnapshot) setResumeText(resumeSnapshotToText(kitContext.resumeSnapshot));
    if (!jdText && kitContext.jobDescription) setJdText(kitContext.jobDescription);
    if (!result && kitContext.atsResult?.data?.overallScore) setResult(kitContext.atsResult.data as ATSScoreResult);
  }, [kitContext.updatedAt]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  /* Only with an account. getResumeVersions throws "Not authenticated" out of
     getUserId (lib/database-suite.ts:42) and logs it with console.error, and
     this panel is now a signed-out destination - the landing's Job Match card
     opens /suite/ats-analyzer?tab=score. Firing a personal read at a visitor
     who has no account put two red console errors on the first screen a
     stranger sees, for a list the panel then hides anyway (the picker is
     behind `savedResumes.length > 0`). */
  useEffect(() => {
    if (!user) return;
    const loadSavedResumes = async () => {
      const res = await getResumeVersions();
      if (res.success && res.data) setSavedResumes(res.data);
    };
    loadSavedResumes();
  }, [user]);

  const handleSelectSavedResume = (resumeId: string) => {
    if (!resumeId) return;
    const rv = savedResumes.find(r => r.id === resumeId);
    if (rv && rv.content) {
      const c = rv.content as any;
      setResumeText(resumeSnapshotToText(c));
      updateContext(resumeVersionToApplicationKitContext(rv));
      showToast(`Loaded: ${rv.version_name || c.name || 'Resume'}`, 'check_circle');
    }
  };

  const filteredKeywords = useMemo(() => {
    if (!result) return [];
    if (activeFilter === 'all') return result.keywords;
    return result.keywords.filter(k => k.status === activeFilter);
  }, [result, activeFilter]);
  const proofReport = useMemo(() => {
    if (!result) return null;
    return buildProofEngineReport(result, resumeText, jdText);
  }, [result, resumeText, jdText]);

  const runAnalysis = async () => {
    if (!resumeText.trim() || !jdText.trim()) {
      showToast('Paste both your resume and the job description', 'cancel');
      return;
    }

    setIsLoading(true);
    updateContext({
      resumeText,
      jobDescription: jdText,
      atsResult: { status: 'loading', updatedAt: new Date().toISOString() },
    });
    try {
      const res = await authFetch('/api/resume/ats-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText, jobDescription: jdText }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (handleApiError(err)) { setIsLoading(false); return; }
        throw new Error(err.error || 'Analysis failed');
      }

      const data: ATSScoreResult = await res.json();
      setResult(data);
      updateContext({
        resumeText,
        jobDescription: jdText,
        atsResult: { status: 'success', data, updatedAt: new Date().toISOString() },
      });
      showToast(
        getATSProofScore(data) == null ? 'ATS scan complete; no JD coverage score was assessed.' : `ATS Score: ${data.overallScore}/100`,
        'analytics',
      );
    } catch (error) {
      console.error('ATS Score error:', error);
      updateContext({
        atsResult: { status: 'error', error: error instanceof Error ? error.message : 'Analysis failed', updatedAt: new Date().toISOString() },
      });
      showToast(error instanceof Error ? error.message : 'Analysis failed', 'cancel');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {renderAuthModal()}

      {/* Input Section */}
      {!result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Resume Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
                <span className="material-symbols-rounded text-sm">description</span>
                Your Resume Text
              </label>
              {savedResumes.length > 0 && (
                <select
                  onChange={(e) => handleSelectSavedResume(e.target.value)}
                  className="min-h-11 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] text-base text-[var(--text-secondary)] outline-none focus:ring-1 focus:ring-[var(--accent)] max-w-[200px]"
                >
                  <option value="">-- Load Saved Resume --</option>
                  {savedResumes.map(r => (
                    <option key={r.id} value={r.id}>{r.version_name || (r.content as any)?.name}</option>
                  ))}
                </select>
              )}
            </div>
            <textarea data-guide="ats-score-source"
              value={resumeText}
              onChange={e => { setResumeText(e.target.value); updateContext({ resumeText: e.target.value }); }}
              placeholder="Paste your resume text here..."
              rows={6}
              className="w-full px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none font-mono"
            />
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              {resumeText.split(/\s+/).filter(Boolean).length} words
            </p>
          </div>

          {/* JD Input */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] mb-2">
              <span className="material-symbols-rounded text-sm">work</span>
              Job Description
            </label>
            <textarea data-guide="ats-score-posting"
              value={jdText}
              onChange={e => { setJdText(e.target.value); updateContext({ jobDescription: e.target.value }); }}
              placeholder="Paste the target job description here..."
              rows={6}
              className="w-full px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none font-mono"
            />
          </div>

          {/* Analyze Button */}
          <button
            data-guide="ats-score-run"
            onClick={runAnalysis}
            disabled={isLoading || !resumeText.trim() || !jdText.trim()}
            className="btn-primary w-full flex min-h-11 items-center justify-center gap-2 px-6 py-3.5 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-[var(--accent-on)] border-t-transparent rounded-full animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <span className="material-symbols-rounded text-lg">analytics</span>
                Calculate ATS Match Score
              </>
            )}
          </button>

          {isLoading && (
            <AssistantThinkingTile
              variant="jobs"
              icon="analytics"
              title="Taco is scoring ATS fit"
              description="Parsing the resume, matching JD requirements, and building the fix list."
              activeStage="analyzing"
              stages={['Parse', 'Keywords', 'Coverage', 'Fix list']}
              compact
            />
          )}
        </motion.div>
      )}

      {/* Results Section */}
      <AnimatePresence>
        {result && (
          <motion.div data-guide="ats-score-result"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-5"
          >
            {/* Score + Breakdown Header */}
            <div className="rounded-2xl elevation-card border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6 relative overflow-hidden">
              {typeof result.overallScore === 'number' && result.assessment?.overall !== 'unassessed' ? (
              <>
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
                {/* Score Ring */}
                <ScoreRing score={result.overallScore} />

                {/* Verdict + Stats */}
                <div className="flex-1 text-center md:text-left">
                  <h3
                    className="text-xl font-bold mb-1"
                    style={{ color: getScoreColor(result.overallScore) }}
                  >
                    {getScoreLabel(result.overallScore)}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mb-1">
                    {result.stats.totalKeywords} keywords analyzed
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mb-4">
                    Estimated match, not a measured outcome.
                  </p>

                  {/* Quick Stats */}
                  <div className="flex items-center justify-center md:justify-start gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[var(--success)]" />
                      <span className="text-xs text-[var(--success)] font-medium">{result.stats.matched} matched</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[var(--warning)]" />
                      <span className="text-xs text-[var(--warning)] font-medium">{result.stats.partial} partial</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[var(--danger)]" />
                      <span className="text-xs text-[var(--danger)] font-medium">{result.stats.missing} missing</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Breakdown Bars */}
              <div className="relative z-10 mt-6 pt-5 border-t border-[var(--border-subtle)] space-y-3">
                <BreakdownBar label="Hard Skills" score={result.breakdown.hardSkillsScore} assessed={result.assessment?.hardSkills !== 'unassessed'} icon="code" delay={0.1} />
                <BreakdownBar label="Soft Skills" score={result.breakdown.softSkillsScore} assessed={result.assessment?.softSkills !== 'unassessed'} icon="psychology" delay={0.2} />
                <BreakdownBar label="Tools & Tech" score={result.breakdown.toolsScore} assessed={result.assessment?.tools !== 'unassessed'} icon="build" delay={0.3} />
                <BreakdownBar label="Formatting" score={result.breakdown.formattingScore} icon="format_align_left" delay={0.4} />
                <BreakdownBar label="Experience Relevance" score={result.breakdown.experienceRelevance} assessed={result.assessment?.experienceRelevance !== 'unassessed'} icon="trending_up" delay={0.5} />
              </div>
              </>
              ) : (
                <div className="relative z-10 rounded-xl border border-dashed border-[var(--border-subtle)] p-5 text-center">
                  <p className="text-sm font-medium text-[var(--text-muted)]">No ATS score available</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">This scan did not return a match score. Re-run the analysis to compute one.</p>
                </div>
              )}
            </div>

            {proofReport && <ProofEngineReport report={proofReport} />}

            {/* Keyword Gap Analysis */}
            <div className="rounded-2xl elevation-card border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <span className="material-symbols-rounded text-base">key</span>
                  Keyword Gap Analysis
                </h4>
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-surface)] mb-4">
                {([
                  { key: 'all', label: `All (${result.keywords.length})` },
                  { key: 'matched', label: `Matched (${result.stats.matched})` },
                  { key: 'partial', label: `Partial (${result.stats.partial})` },
                  { key: 'missing', label: `Missing (${result.stats.missing})` },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveFilter(tab.key)}
                    className={`flex-1 min-h-11 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activeFilter === tab.key
                        ? 'bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Keyword Pills */}
              <div className="flex flex-wrap gap-2">
                {filteredKeywords.map((kw, i) => (
                  <motion.div
                    key={`${kw.keyword}-${i}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <KeywordPill kw={kw} />
                  </motion.div>
                ))}
                {filteredKeywords.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)] py-4 w-full text-center">
                    No keywords in this category
                  </p>
                )}
              </div>
            </div>

            {/* Suggestions */}
            {result.suggestions.length > 0 && (
              <div className="rounded-2xl elevation-card border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5">
                <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                  <span className="material-symbols-rounded icon-status-warning text-base">lightbulb</span>
                  Suggestions
                </h4>
                <ul className="space-y-2">
                  {result.suggestions.map((s, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-start gap-2 text-xs text-[var(--text-secondary)]"
                    >
                      <span className="material-symbols-rounded text-xs text-[var(--text-muted)] mt-0.5 shrink-0">
                        arrow_right
                      </span>
                      {s}
                    </motion.li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                data-guide="ats-score-again"
                onClick={() => { setResult(null); setActiveFilter('all'); }}
                className="btn-secondary flex-1 flex min-h-11 items-center justify-center gap-2 px-4 py-3 text-sm font-medium"
              >
                <span className="material-symbols-rounded text-base">refresh</span>
                Re-analyze
              </button>
              <a
                href="/suite/resume"
                className="btn-primary flex-1 flex min-h-11 items-center justify-center gap-2 px-4 py-3 text-sm font-bold"
              >
                <span className="material-symbols-rounded text-base">transform</span>
                Morph Resume
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
