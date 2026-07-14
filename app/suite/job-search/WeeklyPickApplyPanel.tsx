'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authFetch } from '@/lib/auth-fetch';
import { showToast } from '@/components/Toast';
import { mergeApplicationKitContext } from '@/lib/application-kit';

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════
interface SuggestedJob {
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
  acceptanceChance: number;
  acceptanceReason: string;
}

interface PipelineResult {
  matchScore: number;
  coverLetter: string;
  applicationId: string;
  hasResume: boolean;
  morphedVersionId: string | null;
  // Scores from the parallel scoring calls
  atsScore: number;
  keywordMatch: number;
  overallGrade: string;
  strengths: string[];
  issues: string[];
}

type PanelState = 'idle' | 'preparing' | 'done' | 'error';

// ═══════════════════════════════════════
// SCORE RING
// ═══════════════════════════════════════
function ScoreRing({ value, label, color, size = 56, strokeWidth = 4 }: {
  value: number; label: string; color: string; size?: number; strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={`${color}20`} strokeWidth={strokeWidth} />
          <motion.circle
            cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round" strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-extrabold" style={{ color }}>{Math.round(value)}%</span>
        </div>
      </div>
      <span className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ═══════════════════════════════════════
// PROGRESS STEPS
// ═══════════════════════════════════════
const PIPELINE_STEPS = [
  { key: 'resume', label: 'Fetching resume', icon: 'description' },
  { key: 'morph', label: 'Preparing resume draft', icon: 'auto_fix_high' },
  { key: 'cover', label: 'Drafting cover letter', icon: 'edit_document' },
  { key: 'score', label: 'Running ATS analysis', icon: 'analytics' },
  { key: 'save', label: 'Saving draft to tracker', icon: 'save' },
];

function flattenResumeToText(resume: any): string {
  if (!resume) return '';
  const parts: string[] = [];
  if (resume.name) parts.push(resume.name);
  if (resume.title) parts.push(resume.title);
  if (resume.summary) parts.push(resume.summary);
  if (resume.experience && Array.isArray(resume.experience)) {
    for (const exp of resume.experience) {
      if (exp.role) parts.push(exp.role);
      if (exp.company) parts.push(exp.company);
      if (exp.description) parts.push(exp.description);
      if (exp.bullets && Array.isArray(exp.bullets)) parts.push(...exp.bullets);
    }
  }
  if (resume.skills && Array.isArray(resume.skills)) parts.push(resume.skills.join(', '));
  return parts.join('\n');
}

function getGradeColor(grade: string): string {
  if (grade === 'A+' || grade === 'A') return '#10b981';
  if (grade === 'B+' || grade === 'B') return '#3b82f6';
  if (grade === 'C') return '#f59e0b';
  return '#ef4444';
}

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════
export default function WeeklyPickApplyPanel({ job, onClose, isLight }: {
  job: SuggestedJob;
  onClose: () => void;
  isLight: boolean;
}) {
  const [state, setState] = useState<PanelState>('idle');
  const [activeStep, setActiveStep] = useState(0);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState('');

  // ── REVIEW-FIRST PACKET PIPELINE ──
  const runPipeline = useCallback(async () => {
    setState('preparing');
    setActiveStep(0);
    setError('');

    try {
      // Step 1: Call the apply-pipeline (does resume fetch + morph + cover letter + save)
      setActiveStep(0); // Fetching resume
      await new Promise(r => setTimeout(r, 300)); // Brief visual pause
      setActiveStep(1); // Morphing

      const pipelineRes = await authFetch('/api/agent/apply-pipeline', {
        method: 'POST',
        body: JSON.stringify({
          jobTitle: job.title,
          company: job.company,
          jobDescription: job.description || `${job.title} at ${job.company}`,
          jobUrl: job.url,
          jobId: job.id,
          sourceMeta: {
            source: 'weekly_pick',
            postedDate: job.postedDate || null,
            employmentType: job.employmentType || null,
            acceptanceChance: job.acceptanceChance ?? null,
          },
        }),
      });

      const pipelineData = await pipelineRes.json();

      if (!pipelineRes.ok) {
        if (pipelineData.upgrade) {
          showToast('Upgrade to Pro for application packets', 'lock');
          setState('idle');
          return;
        }
        throw new Error(pipelineData.error || 'Pipeline failed');
      }

      setActiveStep(2); // Cover letter done

      // Step 2: Run ATS scoring in parallel (the pipeline already morphed the resume)
      setActiveStep(3); // Scoring

      const jd = job.description || `${job.title} at ${job.company}`;
      const resumeText = pipelineData.morphedResume
        ? flattenResumeToText(pipelineData.morphedResume)
        : '';

      let atsScore = 0;
      let keywordMatch = 0;
      let overallGrade = 'B';
      let strengths: string[] = [];
      let issues: string[] = [];

      if (resumeText) {
        const [atsResult, checkResult] = await Promise.allSettled([
          authFetch('/api/resume/ats-score', {
            method: 'POST',
            body: JSON.stringify({ resumeText, jobDescription: jd }),
          }).then(r => r.json()),
          authFetch('/api/resume/check', {
            method: 'POST',
            body: JSON.stringify({ resumeText, targetJD: jd }),
          }).then(r => r.json()),
        ]);

        const ats = atsResult.status === 'fulfilled' ? atsResult.value : null;
        const check = checkResult.status === 'fulfilled' ? checkResult.value : null;

        atsScore = ats?.score ?? check?.atsScore ?? pipelineData.atsResult?.overallScore ?? pipelineData.matchScore ?? 0;
        keywordMatch = check?.keywordMatch ?? ats?.score ?? pipelineData.atsResult?.overallScore ?? 0;
        overallGrade = check?.overallGrade ?? 'B';
        strengths = check?.strengths ?? [];
        issues = check?.issues ?? [];
      } else {
        atsScore = pipelineData.atsResult?.overallScore ?? pipelineData.matchScore ?? 0;
        keywordMatch = pipelineData.atsResult?.overallScore ?? 0;
        issues = Array.isArray(pipelineData.keywordGaps)
          ? pipelineData.keywordGaps.map((keyword: string) => `Review proof for ${keyword}`)
          : [];
      }

      setActiveStep(4); // Saving done
      mergeApplicationKitContext({
        applicationId: pipelineData.applicationId,
        applicationUrl: job.url,
        jobDescription: jd,
        jobTitle: job.title,
        targetRole: job.title,
        company: job.company,
        resumeVersionId: pipelineData.morphedVersionId || null,
        resumeSnapshot: pipelineData.morphedResume || undefined,
        resumeSource: 'job_search',
        resumeText: resumeText || undefined,
        atsResult: atsScore ? {
          status: 'success',
          data: {
            overallScore: atsScore,
            keywords: [],
            suggestions: issues,
            stats: { totalKeywords: 0, matched: 0, partial: 0, missing: 0 },
          },
          updatedAt: new Date().toISOString(),
        } : undefined,
        coverLetterResult: pipelineData.coverLetter ? {
          status: 'success',
          data: { coverLetter: pipelineData.coverLetter },
          updatedAt: new Date().toISOString(),
        } : undefined,
      });

      setResult({
        matchScore: pipelineData.matchScore || 0,
        coverLetter: pipelineData.coverLetter || '',
        applicationId: pipelineData.applicationId,
        hasResume: pipelineData.hasResume,
        morphedVersionId: pipelineData.morphedVersionId,
        atsScore,
        keywordMatch,
        overallGrade,
        strengths,
        issues,
      });

      setState('done');
      showToast(`Packet saved as a draft for ${job.company}. Submit manually from the posting.`, 'check_circle');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setState('error');
    }
  }, [job]);

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-3 rounded-2xl border overflow-hidden"
      style={{
        background: isLight
          ? 'linear-gradient(180deg, rgba(6,182,212,0.02), rgba(255,255,255,1))'
          : 'linear-gradient(180deg, rgba(6,182,212,0.04), rgba(0,0,0,0))',
        borderColor: isLight ? 'rgba(6,182,212,0.12)' : 'rgba(6,182,212,0.15)',
      }}
    >
      {/* ── Panel Header ── */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #06b6d4, #10b981)' }}>
            <span className="material-symbols-rounded text-white text-lg">work</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] leading-tight truncate">{job.title}</h3>
            <p className="text-[11px] text-cyan-500 font-medium">{job.company} • {job.location}</p>
          </div>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)' }}>
          <span className="material-symbols-rounded text-sm text-[var(--text-tertiary)]">close</span>
        </button>
      </div>

      {/* ── IDLE: Review packet button ── */}
      {state === 'idle' && (
        <div className="px-4 pb-4">
          <p className="text-[11px] text-[var(--text-secondary)] mb-3 leading-relaxed">
            Prepare a review packet. TalentConsulting.io saves it as a draft and never submits the application for you.
          </p>
          <button
            onClick={runPipeline}
            className="w-full px-4 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2.5 text-white transition-all hover:scale-[1.01] active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
              boxShadow: '0 4px 20px rgba(99,102,241,0.25)',
            }}
          >
            <span className="material-symbols-rounded text-base">auto_awesome</span>
            Prepare packet
          </button>
          <button
            onClick={() => window.open(job.url, '_blank', 'noopener,noreferrer')}
            className="w-full mt-2 px-3 py-2 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all"
            style={{
              color: 'var(--text-secondary)',
              background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <span className="material-symbols-rounded text-xs">open_in_new</span>
            Open posting without prep
          </button>
        </div>
      )}

      {/* ── PREPARING: Live Pipeline Progress ── */}
      {state === 'preparing' && (
        <div className="px-4 pb-4">
          <div className="p-4 rounded-xl space-y-2.5" style={{
            background: isLight ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.015)',
            border: `1px solid ${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'}`,
          }}>
            {PIPELINE_STEPS.map((s, i) => {
              const isDone = i < activeStep;
              const isActive = i === activeStep;
              const isPending = i > activeStep;

              return (
                <div key={s.key} className="flex items-center gap-3">
                  {/* Status icon */}
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{
                    background: isDone ? 'rgba(16,185,129,0.12)' : isActive ? 'rgba(6,182,212,0.12)' : 'rgba(0,0,0,0.03)',
                  }}>
                    {isDone && (
                      <span className="material-symbols-rounded text-xs text-emerald-500">check</span>
                    )}
                    {isActive && (
                      <div className="w-3.5 h-3.5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                    )}
                    {isPending && (
                      <span className="material-symbols-rounded text-xs text-[var(--text-tertiary)]">{s.icon}</span>
                    )}
                  </div>

                  {/* Label */}
                  <span className={`text-xs font-medium ${
                    isDone ? 'text-emerald-500' : isActive ? 'text-cyan-500' : 'text-[var(--text-tertiary)]'
                  }`}>
                    {isDone ? s.label.replace(/ing/, 'ed').replace(/Writing/, 'Wrote').replace(/Fetching/, 'Fetched').replace(/Running/, 'Ran').replace(/Saving/, 'Saved') : s.label}
                    {isActive && '...'}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-center text-[10px] text-[var(--text-tertiary)] mt-2 animate-pulse">
            Sona is preparing a draft packet for your review...
          </p>
        </div>
      )}

      {/* ── ERROR STATE ── */}
      {state === 'error' && (
        <div className="px-4 pb-4">
          <div className="p-4 rounded-xl text-center" style={{
            background: 'rgba(239,68,68,0.04)',
            border: '1px solid rgba(239,68,68,0.12)',
          }}>
            <span className="material-symbols-rounded text-2xl text-red-500 mb-1 block">error</span>
            <p className="text-xs text-red-500 font-semibold mb-1">{error}</p>
            <button
              onClick={runPipeline}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-cyan-500 hover:bg-cyan-500/5 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* ── DONE: Scores + Apply ── */}
      <AnimatePresence>
        {state === 'done' && result && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">

              {/* Score dashboard */}
              <div className="p-4 rounded-xl" style={{
                background: isLight ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.015)',
                border: `1px solid ${isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'}`,
              }}>
                {/* Score rings */}
                <div className="flex items-center justify-around mb-4">
                  <ScoreRing value={job.acceptanceChance} label="Talent fit" color="#2563eb" />
                  <ScoreRing value={result.atsScore} label="ATS" color="#10b981" />
                  <ScoreRing value={result.keywordMatch} label="Keywords" color="#f59e0b" />
                </div>

                {/* Grade */}
                <div className="flex items-center justify-center gap-2 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Overall Grade</span>
                  <span className="text-lg font-black px-2.5 py-0.5 rounded-lg" style={{
                    color: getGradeColor(result.overallGrade),
                    background: `${getGradeColor(result.overallGrade)}12`,
                  }}>
                    {result.overallGrade}
                  </span>
                </div>

                {/* Strengths */}
                {result.strengths.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <span className="material-symbols-rounded text-[11px]">check_circle</span>
                      Strengths
                    </p>
                    <div className="space-y-0.5">
                      {result.strengths.slice(0, 3).map((s, i) => (
                        <p key={i} className="text-[11px] text-[var(--text-secondary)] leading-snug pl-4">• {s}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gaps */}
                {result.issues.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <span className="material-symbols-rounded text-[11px]">lightbulb</span>
                      Gaps
                    </p>
                    <div className="space-y-0.5">
                      {result.issues.slice(0, 3).map((s, i) => (
                        <p key={i} className="text-[11px] text-[var(--text-secondary)] leading-snug pl-4">• {s}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* What was prepared */}
              <div className="flex items-center gap-2 flex-wrap">
                {result.hasResume ? (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-medium bg-emerald-500/8 text-emerald-500 border border-emerald-500/15">
                    <span className="material-symbols-rounded text-[11px]">check</span>
                    Resume draft prepared
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-medium bg-amber-500/8 text-amber-500 border border-amber-500/15">
                    <span className="material-symbols-rounded text-[11px]">priority_high</span>
                    Add resume before submitting
                  </span>
                )}
                {result.coverLetter && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-medium bg-emerald-500/8 text-emerald-500 border border-emerald-500/15">
                    <span className="material-symbols-rounded text-[11px]">check</span>
                    Cover letter
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-medium bg-emerald-500/8 text-emerald-500 border border-emerald-500/15">
                  <span className="material-symbols-rounded text-[11px]">check</span>
                  Draft saved to tracker
                </span>
              </div>

              {/* Manual submit handoff */}
              <div className="flex gap-2">
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 text-white transition-all hover:scale-[1.01] active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, #06b6d4, #10b981)',
                    boxShadow: '0 3px 16px rgba(6,182,212,0.2)',
                  }}
                >
                  <span className="material-symbols-rounded text-base">open_in_new</span>
                  Open posting
                </a>
                <a
                  href="/suite/applications?status=not_applied"
                  className="px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                  style={{
                    background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span className="material-symbols-rounded text-sm">folder_open</span>
                  Review draft
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
