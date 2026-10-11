'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authFetch } from '@/lib/auth-fetch';
import { showToast } from '@/components/Toast';
import { mergeApplicationKitContext } from '@/lib/application-kit';
import { EvidenceBadge } from '@/components/suite/SuiteToolChrome';

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
// SCORE RING — renders a measured value only
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
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth}
            style={{ stroke: `color-mix(in srgb, ${color} 20%, transparent)` }}
          />
          <motion.circle
            cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth}
            strokeLinecap="round" strokeDasharray={circumference}
            style={{ stroke: color }}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-extrabold" style={{ color }}>{Math.round(value)}%</span>
        </div>
      </div>
      <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{label}</span>
    </div>
  );
}

// A score slot that renders the ring only when the value was actually measured.
// A missing score is a labelled absence — never a zero ring, never "0%".
function ScoreSlot({ value, label, color }: {
  value: number | null | undefined; label: string; color: string;
}) {
  const measured = typeof value === 'number' && Number.isFinite(value) && value > 0;

  if (!measured) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div
          className="flex items-center justify-center rounded-full border border-dashed border-[var(--border-subtle)]"
          style={{ width: 56, height: 56 }}
        >
          <span className="material-symbols-rounded text-lg text-[var(--text-muted)]" aria-hidden="true">remove</span>
        </div>
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          {label} · not scored
        </span>
      </div>
    );
  }

  return <ScoreRing value={value} label={label} color={color} />;
}

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

// Grade colour resolves to a token, never a hex literal.
function getGradeColor(grade: string): string {
  if (grade === 'A+' || grade === 'A') return 'var(--success)';
  if (grade === 'B+' || grade === 'B') return 'var(--accent)';
  if (grade === 'C') return 'var(--warning)';
  return 'var(--danger)';
}

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════
export default function WeeklyPickApplyPanel({ job, onClose }: {
  job: SuggestedJob;
  onClose: () => void;
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
          showToast('Upgrade to Standard for application packets', 'lock');
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
      // No fabricated default: an unmeasured grade stays empty and renders as absent.
      let overallGrade = '';
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
        overallGrade = check?.overallGrade ?? '';
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
      className="elevation-card mt-3 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)]"
    >
      {/* ── Panel Header ── */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-dim)]">
            <span className="material-symbols-rounded text-lg text-[var(--accent)]">work</span>
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold leading-tight text-[var(--text-primary)]">{job.title}</h3>
            <p className="text-[11px] font-medium text-[var(--text-secondary)]">{job.company} • {job.location}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--bg-hover)]"
        >
          <span className="material-symbols-rounded text-sm text-[var(--text-tertiary)]">close</span>
        </button>
      </div>

      {/* ── IDLE: Review packet button ── */}
      {state === 'idle' && (
        <div className="px-4 pb-4">
          <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            Prepare a review packet. TalentConsulting.io saves it as a draft and never submits the application for you.
          </p>
          <button
            onClick={runPipeline}
            className="btn-primary flex w-full items-center justify-center gap-2.5 px-4 py-3.5 text-sm font-bold"
          >
            <span className="material-symbols-rounded text-base">auto_awesome</span>
            Prepare packet
          </button>
          <button
            onClick={() => window.open(job.url, '_blank', 'noopener,noreferrer')}
            className="btn-secondary mt-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold"
          >
            <span className="material-symbols-rounded text-sm">open_in_new</span>
            Open posting without prep
          </button>
        </div>
      )}

      {/* ── PREPARING: Live Pipeline Progress ── */}
      {state === 'preparing' && (
        <div className="px-4 pb-4">
          <div className="space-y-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            {PIPELINE_STEPS.map((s, i) => {
              const isDone = i < activeStep;
              const isActive = i === activeStep;
              const isPending = i > activeStep;

              return (
                <div key={s.key} className="flex items-center gap-3">
                  {/* Status icon */}
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    isDone
                      ? 'bg-[color-mix(in_srgb,var(--success)_12%,transparent)]'
                      : isActive
                        ? 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]'
                        : 'bg-[var(--bg-hover)]'
                  }`}>
                    {isDone && (
                      <span className="material-symbols-rounded text-xs text-[var(--success)]">check</span>
                    )}
                    {isActive && (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[color-mix(in_srgb,var(--accent)_30%,transparent)] border-t-[var(--accent)]" />
                    )}
                    {isPending && (
                      <span className="material-symbols-rounded text-xs text-[var(--text-tertiary)]">{s.icon}</span>
                    )}
                  </div>

                  {/* Label */}
                  <span className={`text-xs font-medium ${
                    isDone ? 'text-[var(--success)]' : isActive ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'
                  }`}>
                    {isDone ? s.label.replace(/ing/, 'ed').replace(/Writing/, 'Wrote').replace(/Fetching/, 'Fetched').replace(/Running/, 'Ran').replace(/Saving/, 'Saved') : s.label}
                    {isActive && '...'}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="mt-2 animate-pulse text-center text-[11px] text-[var(--text-tertiary)]">
            Taco is preparing a draft packet for your review...
          </p>
        </div>
      )}

      {/* ── ERROR STATE ── */}
      {state === 'error' && (
        <div className="px-4 pb-4">
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] p-4 text-center">
            <span className="material-symbols-rounded mb-1 block text-2xl text-[var(--danger)]">error</span>
            <p className="mb-1 text-xs font-semibold text-[var(--danger)]">{error}</p>
            <button
              onClick={runPipeline}
              className="min-h-[44px] rounded-lg px-4 py-2 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-dim)]"
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
            <div className="space-y-3 px-4 pb-4">

              {/* Score dashboard */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                {/* Score rings — each renders only when its value was measured */}
                <div className="mb-4 flex items-center justify-around">
                  <ScoreSlot value={job.acceptanceChance} label="Talent fit" color="var(--accent)" />
                  <ScoreSlot value={result.atsScore} label="ATS" color="var(--success)" />
                  <ScoreSlot value={result.keywordMatch} label="Keywords" color="var(--warning)" />
                </div>

                {/* Grade — shown only when the check actually returned one */}
                {result.overallGrade && (
                  <div className="mb-3 flex items-center justify-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Overall Grade</span>
                    <span
                      className="rounded-lg px-2.5 py-0.5 text-lg font-black"
                      style={{
                        color: getGradeColor(result.overallGrade),
                        background: `color-mix(in srgb, ${getGradeColor(result.overallGrade)} 12%, transparent)`,
                      }}
                    >
                      {result.overallGrade}
                    </span>
                  </div>
                )}

                {/* Strengths */}
                {result.strengths.length > 0 && (
                  <div className="mb-2">
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[var(--success)]">
                      <span className="material-symbols-rounded text-[13px]">check_circle</span>
                      Strengths
                    </p>
                    <div className="space-y-0.5">
                      {result.strengths.slice(0, 3).map((s, i) => (
                        <p key={i} className="pl-4 text-[11px] leading-snug text-[var(--text-secondary)]">• {s}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gaps */}
                {result.issues.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[var(--warning)]">
                      <span className="material-symbols-rounded text-[13px]">lightbulb</span>
                      Gaps
                    </p>
                    <div className="space-y-0.5">
                      {result.issues.slice(0, 3).map((s, i) => (
                        <p key={i} className="pl-4 text-[11px] leading-snug text-[var(--text-secondary)]">• {s}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* What was prepared */}
              <div className="flex flex-wrap items-center gap-2">
                {result.hasResume ? (
                  <EvidenceBadge state="verified" label="Resume draft prepared" />
                ) : (
                  <EvidenceBadge state="missing" label="Add resume before submitting" />
                )}
                {result.coverLetter && (
                  <EvidenceBadge state="verified" label="Cover letter" />
                )}
                <EvidenceBadge state="verified" label="Draft saved to tracker" />
              </div>

              {/* Manual submit handoff */}
              <div className="flex gap-2">
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-bold"
                >
                  <span className="material-symbols-rounded text-base">open_in_new</span>
                  Open posting
                </a>
                <a
                  href="/suite/applications?status=not_applied"
                  className="btn-secondary flex min-h-[44px] items-center justify-center gap-1.5 px-4 py-3 text-xs font-bold"
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
