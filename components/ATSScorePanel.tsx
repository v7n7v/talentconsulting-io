'use client';

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
}

// ── Helpers ──

function getScoreColor(score: number) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
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

function buildProofEngineReport(result: ATSScoreResult, resumeText: string, jdText: string): ProofEngineReportData {
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
    score: result.overallScore,
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
        detail: `${result.breakdown.experienceRelevance}% experience relevance based on overlap with the job description.`,
        tone: result.breakdown.experienceRelevance >= 70 ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
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
          className="text-white/5"
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
        <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest mt-0.5">
          ATS Score
        </span>
      </div>
    </div>
  );
}

// ── Mini Bar Chart ──

function BreakdownBar({ label, score, icon, delay = 0 }: { label: string; score: number; icon: string; delay?: number }) {
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
          <span className="text-xs font-bold" style={{ color }}>{score}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
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
    matched: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', icon: 'check_circle' },
    partial: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', icon: 'radio_button_partial' },
    missing: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', icon: 'cancel' },
  };

  const config = statusConfig[kw.status];

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all hover:scale-105 cursor-default ${config.bg} ${config.border} ${config.text}`}
      title={kw.resumeContext || `${kw.keyword} (${getCategoryLabel(kw.category)})`}
    >
      <span className="material-symbols-rounded text-[12px]">{config.icon}</span>
      <span>{kw.keyword}</span>
      <span className="opacity-50 text-[9px]">{getCategoryLabel(kw.category)}</span>
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

  useEffect(() => {
    if (!resumeText && kitContext.resumeText) setResumeText(kitContext.resumeText);
    if (!resumeText && kitContext.resumeSnapshot) setResumeText(resumeSnapshotToText(kitContext.resumeSnapshot));
    if (!jdText && kitContext.jobDescription) setJdText(kitContext.jobDescription);
    if (!result && kitContext.atsResult?.data?.overallScore) setResult(kitContext.atsResult.data as ATSScoreResult);
  }, [kitContext.updatedAt]);

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
      showToast(`ATS Score: ${data.overallScore}/100`, 'analytics');
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
                  className="px-3 py-1.5 glass-card rounded-lg text-xs text-[var(--text-secondary)] outline-none focus:ring-1 focus:ring-cyan-500/30 max-w-[200px]"
                >
                  <option value="">-- Load Saved Resume --</option>
                  {savedResumes.map(r => (
                    <option key={r.id} value={r.id}>{r.version_name || (r.content as any)?.name}</option>
                  ))}
                </select>
              )}
            </div>
            <textarea
              value={resumeText}
              onChange={e => { setResumeText(e.target.value); updateContext({ resumeText: e.target.value }); }}
              placeholder="Paste your resume text here..."
              rows={6}
              className="w-full px-4 py-3 rounded-xl glass-card text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30 resize-none font-mono"
            />
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              {resumeText.split(/\s+/).filter(Boolean).length} words
            </p>
          </div>

          {/* JD Input */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] mb-2">
              <span className="material-symbols-rounded text-sm">work</span>
              Job Description
            </label>
            <textarea
              value={jdText}
              onChange={e => { setJdText(e.target.value); updateContext({ jobDescription: e.target.value }); }}
              placeholder="Paste the target job description here..."
              rows={6}
              className="w-full px-4 py-3 rounded-xl glass-card text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30 resize-none font-mono"
            />
          </div>

          {/* Analyze Button */}
          <button
            onClick={runAnalysis}
            disabled={isLoading || !resumeText.trim() || !jdText.trim()}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-sm hover:shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-5"
          >
            {/* Score + Breakdown Header */}
            <div className="rounded-2xl glass-card p-6 relative overflow-hidden">
              {/* Background glow */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div
                  className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-20"
                  style={{ backgroundColor: getScoreColor(result.overallScore) }}
                />
              </div>

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
                  <p className="text-xs text-[var(--text-secondary)] mb-4">
                    {result.stats.totalKeywords} keywords analyzed
                  </p>

                  {/* Quick Stats */}
                  <div className="flex items-center justify-center md:justify-start gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-xs text-emerald-400 font-medium">{result.stats.matched} matched</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="text-xs text-amber-400 font-medium">{result.stats.partial} partial</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <span className="text-xs text-red-400 font-medium">{result.stats.missing} missing</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Breakdown Bars */}
              <div className="relative z-10 mt-6 pt-5 border-t border-white/5 space-y-3">
                <BreakdownBar label="Hard Skills" score={result.breakdown.hardSkillsScore} icon="code" delay={0.1} />
                <BreakdownBar label="Soft Skills" score={result.breakdown.softSkillsScore} icon="psychology" delay={0.2} />
                <BreakdownBar label="Tools & Tech" score={result.breakdown.toolsScore} icon="build" delay={0.3} />
                <BreakdownBar label="Formatting" score={result.breakdown.formattingScore} icon="format_align_left" delay={0.4} />
                <BreakdownBar label="Experience Relevance" score={result.breakdown.experienceRelevance} icon="trending_up" delay={0.5} />
              </div>
            </div>

            {proofReport && <ProofEngineReport report={proofReport} />}

            {/* Keyword Gap Analysis */}
            <div className="rounded-2xl glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <span className="material-symbols-rounded text-base">key</span>
                  Keyword Gap Analysis
                </h4>
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] mb-4">
                {([
                  { key: 'all', label: `All (${result.keywords.length})` },
                  { key: 'matched', label: `Matched (${result.stats.matched})` },
                  { key: 'partial', label: `Partial (${result.stats.partial})` },
                  { key: 'missing', label: `Missing (${result.stats.missing})` },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveFilter(tab.key)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      activeFilter === tab.key
                        ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20'
                        : 'text-[var(--text-secondary)] hover:bg-white/5'
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
              <div className="rounded-2xl glass-card p-5">
                <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-3">
                  <span className="material-symbols-rounded text-base text-amber-400">lightbulb</span>
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
                      <span className="material-symbols-rounded text-xs text-amber-400/60 mt-0.5 shrink-0">
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
                onClick={() => { setResult(null); setActiveFilter('all'); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl glass-card text-sm font-medium text-[var(--text-secondary)] hover:bg-white/5 transition-all"
              >
                <span className="material-symbols-rounded text-base">refresh</span>
                Re-analyze
              </button>
              <a
                href="/suite/resume"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-bold hover:shadow-lg hover:shadow-cyan-500/25 transition-all"
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
