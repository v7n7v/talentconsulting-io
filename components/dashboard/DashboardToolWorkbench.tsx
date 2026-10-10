'use client';

import { TacoName } from '@/components/BrandLogo';
import { useEffect, useMemo, useState } from 'react';
import type { DashboardMode, DashboardToolId, GuestUsageSnapshot } from '@/lib/dashboard-types';
import {
  getGuestUsageForTool,
  markGuestToolExhausted,
  markGuestToolUsed,
  syncGuestToolRemaining,
} from '@/components/dashboard/guestUsage';

interface WorkbenchResult {
  /** null when the source returned no measured score. Never a fabricated fallback. */
  score: number | null;
  scoreLabel: string;
  title: string;
  summary: string;
  issues: string[];
  strengths: string[];
  recommendation: string;
  rewritten?: string;
  meta?: string;
}

interface ToolDefinition {
  id: DashboardToolId;
  label: string;
  icon: string;
  description: string;
  placeholder: string;
  cta: string;
  limitLabel: string;
  wordCap: number;
}

export const dashboardPreviewTools: ToolDefinition[] = [
  {
    id: 'resume-check',
    label: 'Resume Check',
    icon: 'description',
    description: 'Check structure, clarity, and recruiter-readable proof before you save a resume.',
    placeholder: 'Paste resume text, a summary, or a few bullet points you want to check...',
    cta: 'Check resume',
    limitLabel: '3/day',
    wordCap: 500,
  },
  {
    id: 'job-match',
    label: 'Job Match',
    icon: 'work_history',
    description: 'Compare your resume against a role without using paid credits.',
    placeholder: 'Paste resume text, then add the job description below it. Headings like Resume: and Job description: help.',
    cta: 'Analyze match',
    limitLabel: '3/day',
    wordCap: 1200,
  },
  {
    id: 'ats-analyzer',
    label: 'ATS Analyzer',
    icon: 'scanner',
    description: 'Preview ATS structure and missing resume signals before opening the full analyzer.',
    placeholder: 'Paste resume text or bullet points to check ATS-readable sections and keyword signals...',
    cta: 'Run ATS preview',
    limitLabel: '3/day',
    wordCap: 500,
  },
  {
    id: 'writing-trust',
    label: 'Writing Trust',
    icon: 'radar',
    description: 'Scan career writing for generic AI patterns and low-trust phrasing.',
    placeholder: 'Paste a cover letter, LinkedIn section, recruiter reply, or AI-assisted career draft...',
    cta: 'Scan trust',
    limitLabel: '5/hour',
    wordCap: 1500,
  },
  {
    id: 'quick-polish',
    label: 'Quick Polish',
    icon: 'auto_fix_high',
    description: 'Polish a short career draft while preserving facts, numbers, and intent.',
    placeholder: 'Paste a resume bullet, cover letter paragraph, or recruiter reply to polish...',
    cta: 'Polish draft',
    limitLabel: '3/day',
    wordCap: 300,
  },
];

const samples: Record<DashboardToolId, string> = {
  'resume-check': `Customer Success Manager

Managed enterprise customers and helped improve onboarding processes. Worked with sales, product, and support teams to resolve issues and increase customer satisfaction.

- Responsible for onboarding new customers and answering questions.
- Worked cross-functionally to improve customer workflows.
- Helped customers use product features and renew contracts.`,
  'job-match': `Resume:
Customer success manager with onboarding, renewal, workflow mapping, support handoffs, and product feedback experience. Led onboarding improvements and coached enterprise customers.

Job description:
Product operations role requiring workflow mapping, stakeholder communication, onboarding analytics, renewal support, and product feedback loops.`,
  'ats-analyzer': `Product Operations Manager

Experience
Acme Software - Product Operations
- Mapped customer onboarding handoffs across sales, support, and product.
- Reduced launch delays by 31% by improving weekly readiness reviews.
- Built dashboards for renewal risk and customer workflow blockers.

Skills
SQL, Salesforce, onboarding analytics, stakeholder communication`,
  'writing-trust': `Thank you for reaching out. I would be interested in learning more about the opportunity and discussing my qualifications. My background appears to align well with the responsibilities listed, and I am available for a conversation at your convenience.`,
  'quick-polish': `I am writing to express my interest in the Product Operations role. My background has allowed me to leverage cross-functional collaboration and strategic communication to drive meaningful improvements across business workflows.`,
};

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} aria-hidden="true">{name}</span>;
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function scoreColor(score: number) {
  if (score >= 80) return 'var(--success)';
  if (score >= 60) return 'var(--text-secondary)';
  if (score >= 40) return 'var(--warning)';
  return 'var(--danger)';
}

function normalizeList(value: unknown, fallback: string[], max = 5) {
  return Array.isArray(value) && value.length > 0 ? value.slice(0, max).map((item) => String(item)) : fallback;
}

/** A real, finite number or null. Never invents a fallback value. */
function measuredNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function importantWords(text: string) {
  const stop = new Set([
    'and',
    'the',
    'for',
    'with',
    'that',
    'this',
    'from',
    'you',
    'your',
    'are',
    'our',
    'have',
    'has',
    'was',
    'will',
    'job',
    'role',
    'work',
    'team',
    'skills',
    'experience',
    'description',
    'requirements',
    'responsibilities',
    'requiring',
    'required',
    'requires',
    'qualification',
    'qualifications',
    'candidate',
    'candidates',
    'ability',
    'including',
    'responsible',
    'using',
    'into',
    'about',
    'more',
    'their',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s+-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stop.has(word));
}

function runClientJobMatch(text: string): WorkbenchResult {
  const marker = text.search(/job description:|role:|requirements:|responsibilities:/i);
  const splitAt = marker > 80 ? marker : Math.floor(text.length / 2);
  const resumeText = text.slice(0, splitAt);
  const jobText = text.slice(splitAt);
  const resumeWords = new Set(importantWords(resumeText));
  const jobWords = Array.from(new Set(importantWords(jobText)));
  const matched = jobWords.filter((word) => resumeWords.has(word));
  const missing = jobWords.filter((word) => !resumeWords.has(word)).slice(0, 5);
  // Honest keyword-overlap ratio only. No inflation constant, no cap, no
  // fabricated fallback: with no role language to compare, there is no score.
  const score = jobWords.length ? Math.round((matched.length / jobWords.length) * 100) : null;

  return {
    score,
    scoreLabel: 'Keyword overlap',
    title: 'Resume and role match',
    summary: 'This local preview compares role language against proof already present in your draft.',
    issues: missing.length
      ? missing.map((word) => `Add honest proof for "${word}" if it reflects your experience.`)
      : ['Add a fuller job description for sharper role matching.'],
    strengths: matched.length
      ? matched.slice(0, 4).map((word) => `Your draft already reflects "${word}".`)
      : ['The resume has enough context to begin tailoring.'],
    recommendation: 'Start with the top third of the resume, then use the cover letter to explain the closest proof.',
    meta: `${matched.length} matched role signals`,
  };
}

function ScoreDial({ score, label }: { score: number; label: string }) {
  const color = scoreColor(score);
  const circumference = 2 * Math.PI * 42;

  return (
    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="42" stroke="var(--border-subtle)" strokeWidth="8" fill="none" />
        <circle
          cx="50"
          cy="50"
          r="42"
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
      </svg>
      <div className="text-center">
        <p className="text-2xl font-semibold tabular-nums" style={{ color }}>{score}</p>
        <p className="text-[11px] leading-none text-[var(--text-muted)]">{label}</p>
      </div>
    </div>
  );
}

function GuestUsagePill({ usage }: { usage: GuestUsageSnapshot }) {
  return (
    <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Guest preview</span>
        <span className={`text-xs font-semibold tabular-nums ${usage.exhausted ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
          {usage.remaining}/{usage.cap} left
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-hover)]">
        <div
          className="h-full rounded-full bg-[var(--success)]"
          style={{ width: `${Math.max(0, Math.min(100, (usage.remaining / usage.cap) * 100))}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">{usage.resetLabel}</p>
    </div>
  );
}

export default function DashboardToolWorkbench({
  mode,
  activeTool,
  onSelectTool,
  onShowSignup,
  variant = 'full',
}: {
  mode: DashboardMode;
  activeTool: DashboardToolId;
  onSelectTool: (tool: DashboardToolId) => void;
  onShowSignup: () => void;
  variant?: 'full' | 'minimal';
}) {
  const tool = useMemo(
    () => dashboardPreviewTools.find((item) => item.id === activeTool) || dashboardPreviewTools[0],
    [activeTool],
  );
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<WorkbenchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [limitReached, setLimitReached] = useState(false);
  const [usage, setUsage] = useState<GuestUsageSnapshot>(() => getGuestUsageForTool(activeTool));

  const wordCount = countWords(inputText);
  const overLimit = wordCount > tool.wordCap;
  const needsMoreText = inputText.trim().length > 0 && inputText.trim().length < 20 && tool.id !== 'quick-polish';
  const guestExhausted = mode === 'guest' && usage.exhausted;
  const canRun = inputText.trim().length > 0 && !needsMoreText && !overLimit && !loading && !guestExhausted;
  const minimal = variant === 'minimal';

  useEffect(() => {
    setInputText('');
    setResult(null);
    setError('');
    setLimitReached(false);
    setUsage(getGuestUsageForTool(activeTool));
  }, [activeTool]);

  const loadSample = () => {
    setInputText(samples[tool.id]);
    setResult(null);
    setError('');
    setLimitReached(false);
  };

  const updateUsageAfterSuccess = (remaining?: unknown) => {
    if (mode !== 'guest') return;
    if (typeof remaining === 'number') {
      setUsage(syncGuestToolRemaining(tool.id, remaining));
    } else {
      setUsage(markGuestToolUsed(tool.id));
    }
  };

  const runCheck = async () => {
    if (guestExhausted) {
      setLimitReached(true);
      setError('Guest previews for this tool are used up. Create a free account to keep working and save history.');
      return;
    }
    if (!canRun) {
      if (!inputText.trim()) setError('Paste a resume, job description, or career draft first.');
      if (needsMoreText) setError('Add a little more text so the check has enough signal.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setLimitReached(false);

    if (tool.id === 'job-match') {
      window.setTimeout(() => {
        setResult(runClientJobMatch(inputText));
        updateUsageAfterSuccess();
        setLoading(false);
      }, 250);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);

    try {
      if (tool.id === 'quick-polish') {
        const response = await fetch('/api/writing/humanize-free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ text: inputText, domain: 'resume', tone: 'confident' }),
        });
        const data: {
          rewritten?: string;
          before?: { humanScore?: number };
          after?: { humanScore?: number };
          warnings?: string[];
          error?: string;
          limitReached?: boolean;
          requiresAuth?: boolean;
        } = await response.json();

        if (!response.ok) {
          if (response.status === 429 || data.limitReached || data.requiresAuth) {
            setUsage(markGuestToolExhausted(tool.id));
            setLimitReached(true);
          }
          setError(data.error || 'The polish preview could not run. Create a free account if verification is required.');
          return;
        }

        const beforeScore = measuredNumber(data.before?.humanScore);
        const afterScore = measuredNumber(data.after?.humanScore);
        const polishStrengths: string[] = [];
        if (beforeScore !== null) polishStrengths.push(`Before: ${beforeScore} human score`);
        if (afterScore !== null) polishStrengths.push(`After: ${afterScore} human score`);
        if (polishStrengths.length === 0) polishStrengths.push('Polished draft is ready — review every claim yourself.');

        setResult({
          score: afterScore,
          scoreLabel: 'Trust (est.)',
          title: 'Polished career draft',
          summary: 'Your draft was polished for specificity, rhythm, and career credibility.',
          issues: data.warnings?.slice(0, 3) || ['Review the final text and confirm every claim is accurate.'],
          strengths: polishStrengths,
          recommendation: 'Create a free account to save versions and continue in the full writing toolkit.',
          rewritten: data.rewritten,
        });
        updateUsageAfterSuccess();
        return;
      }

      const apiTool = tool.id === 'writing-trust' ? 'detect' : 'ats-score';
      const response = await fetch('/api/tools/free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ tool: apiTool, text: inputText }),
      });
      const data: Record<string, unknown> & {
        error?: string;
        remaining?: number;
        limitReached?: boolean;
        requiresAuth?: boolean;
      } = await response.json();

      if (!response.ok) {
        if (response.status === 429 || data.limitReached || data.requiresAuth) {
          setUsage(markGuestToolExhausted(tool.id));
          setLimitReached(true);
        }
        setError(data.error || 'This preview could not run. Please try again or create a free account.');
        return;
      }

      if (tool.id === 'writing-trust') {
        setResult({
          score: measuredNumber(data.humanScore) ?? measuredNumber(data.score),
          scoreLabel: 'Trust (est.)',
          title: 'Writing trust scan',
          summary: 'Trust scan complete. Treat this as an editing signal, not proof of authorship.',
          issues: normalizeList(data.topIssues || data.issues, ['Replace generic phrasing with concrete career evidence.']),
          strengths: normalizeList(data.strengths, ['The draft can improve without changing the core meaning.'], 4),
          recommendation: 'Use Quick Polish on the weakest paragraph, then review every claim yourself.',
          meta: `${wordCount} words scanned`,
        });
      } else {
        setResult({
          score: measuredNumber(data.atsScore) ?? measuredNumber(data.score),
          scoreLabel: 'ATS (est.)',
          title: tool.id === 'resume-check' ? 'Resume readiness preview' : 'ATS analyzer preview',
          summary: typeof data.summary === 'string' ? data.summary : 'Resume structure check complete.',
          issues: normalizeList(data.issues, ['Add measurable outcomes where possible.', 'Make section labels easy for ATS systems to parse.']),
          strengths: normalizeList(data.strengths, ['The resume has enough text for a useful first pass.'], 4),
          recommendation: 'Open the full dashboard to save this check, compare roles, and keep versions.',
          meta: `${wordCount} words checked`,
        });
      }
      updateUsageAfterSuccess(data.remaining);
    } catch (requestError) {
      setError(
        requestError instanceof DOMException && requestError.name === 'AbortError'
          ? 'This check is taking longer than expected. Please try again in a moment.'
          : 'Network error. Please try again in a moment.',
      );
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  };

  return (
    <section
      className={`elevation-card rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] ${
        minimal ? 'p-4 md:p-5' : 'p-4 md:p-5'
      }`}
      aria-labelledby="dashboard-workbench-title"
    >
      {minimal ? (
        <div className="mb-4 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {mode === 'guest' ? 'Free tool workbench' : 'Workspace preview'}
              </p>
              <h2 id="dashboard-workbench-title" className="premium-heading-wrap mt-1 flex items-center gap-2 text-2xl font-black tracking-[-0.02em] text-[var(--text-primary)]">
                <Icon name={tool.icon} className="text-[24px] text-[var(--accent)]" />
                {tool.label}
              </h2>
              <p className="premium-copy-wrap mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                {tool.description} Public previews stay bounded; saved history and <TacoName /> memory unlock when you create an account.
              </p>
            </div>
            {mode === 'guest' && <GuestUsagePill usage={usage} />}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" role="tablist" aria-label="Free preview tool">
            {dashboardPreviewTools.map((item) => {
              const active = item.id === tool.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelectTool(item.id)}
                  className={`min-h-14 rounded-[14px] border px-3 py-2 text-left transition ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2 text-xs font-bold">
                    <Icon name={item.icon} className="text-[17px]" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="mt-1 block text-[11px] font-medium text-[var(--text-muted)]">{item.limitLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {mode === 'guest' ? 'Guest workbench' : 'Dashboard workbench'}
              </p>
              <h2 id="dashboard-workbench-title" className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
                Run a real preview before opening the full tool.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                Public previews stay bounded; save, export, history, and <TacoName /> memory unlock when you sign in.
              </p>
            </div>
            {mode === 'guest' && <GuestUsagePill usage={usage} />}
          </div>

          <div className="mt-5 grid gap-2 md:grid-cols-5" role="tablist" aria-label="Dashboard preview tool">
            {dashboardPreviewTools.map((item) => {
              const active = item.id === tool.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelectTool(item.id)}
                  className={`min-h-20 rounded-[16px] border p-3 text-left transition ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Icon name={item.icon} className="text-[19px]" />
                    {item.label}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--text-muted)]">{item.limitLabel}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className={`grid gap-4 ${minimal ? 'lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]' : 'mt-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]'}`}>
        <div className="min-w-0">
          <label htmlFor="dashboard-preview-input" className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">
            {minimal ? 'Paste text to preview' : tool.description}
          </label>
          <textarea
            id="dashboard-preview-input"
            value={inputText}
            onChange={(event) => {
              setInputText(event.target.value);
              setError('');
              setResult(null);
              setLimitReached(false);
            }}
            placeholder={tool.placeholder}
            className={`${minimal ? 'min-h-[220px]' : 'min-h-[270px]'} w-full resize-y rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 text-base leading-6 text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-dim)]`}
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={overLimit ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}>
                {wordCount} / {tool.wordCap} words
              </span>
              {needsMoreText && <span className="text-[var(--warning)]">Add more text for a useful signal.</span>}
              {guestExhausted && <span className="text-[var(--warning)]">Guest previews used.</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadSample}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)]"
              >
                <Icon name="science" className="text-[18px]" />
                Sample
              </button>
              <button
                type="button"
                onClick={limitReached || guestExhausted ? onShowSignup : runCheck}
                disabled={!limitReached && !guestExhausted && (!canRun || loading)}
                className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Icon name={loading ? 'progress_activity' : limitReached || guestExhausted ? 'person_add' : tool.icon} className={`text-[19px] ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Checking...' : limitReached || guestExhausted ? 'Create free account' : tool.cta}
              </button>
            </div>
          </div>
          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)]">
              <span className="material-symbols-rounded mt-0.5 shrink-0 text-[17px] text-[var(--warning)]" aria-hidden="true">warning</span>
              <span>
              {error}
              {(limitReached || guestExhausted) && (
                <button type="button" onClick={onShowSignup} className="ml-1 font-semibold underline underline-offset-2">
                  Sign up free
                </button>
              )}
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
          {result ? (
            <div>
              <div className="flex items-center gap-4">
                {result.score !== null ? (
                  <ScoreDial score={result.score} label={result.scoreLabel} />
                ) : (
                  <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border border-dashed border-[var(--border-subtle)] px-2 text-center">
                    <span className="material-symbols-rounded text-[24px] text-[var(--text-muted)]" aria-hidden="true">do_not_disturb_on</span>
                    <span className="mt-1 text-[11px] leading-tight text-[var(--text-muted)]">Not scored</span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{result.title}</p>
                  <h3 className="mt-1 text-lg font-bold leading-6 text-[var(--text-primary)]">{result.summary}</h3>
                  {result.meta && <p className="mt-1 text-sm text-[var(--text-muted)]">{result.meta}</p>}
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                  <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Fix first</p>
                  <ul className="space-y-2">
                    {result.issues.slice(0, 4).map((issue) => (
                      <li key={issue} className="flex gap-2 text-sm leading-5 text-[var(--text-secondary)]">
                        <Icon name="priority_high" className="mt-0.5 text-[17px] text-[var(--warning)]" />
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                  <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Already working</p>
                  <ul className="space-y-2">
                    {result.strengths.slice(0, 3).map((strength) => (
                      <li key={strength} className="flex gap-2 text-sm leading-5 text-[var(--text-secondary)]">
                        <Icon name="check_circle" className="mt-0.5 text-[17px] text-[var(--success)]" />
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {result.rewritten && (
                <div className="mt-3 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-sm leading-6 text-[var(--text-primary)]">
                  {result.rewritten}
                </div>
              )}
              <p className="mt-3 rounded-[16px] bg-[var(--bg-surface)] p-3 text-sm leading-6 text-[var(--text-secondary)]">
                {result.recommendation}
              </p>
            </div>
          ) : (
            <div className={minimal ? 'flex min-h-[260px] flex-col items-center justify-center text-center' : 'flex min-h-[430px] flex-col justify-between'}>
              <div className={minimal ? 'max-w-sm' : undefined}>
                <div className={`${minimal ? 'mx-auto h-10 w-10 rounded-[14px]' : 'h-12 w-12 rounded-[16px]'} flex items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--accent)]`}>
                  <Icon name={tool.icon} className={minimal ? 'text-[21px]' : 'text-[24px]'} />
                </div>
                <h3 className={`${minimal ? 'mt-3 text-base' : 'mt-4 text-xl'} font-bold text-[var(--text-primary)]`}>
                  {minimal ? 'Preview results appear here' : tool.label}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  {minimal
                    ? 'Use the sample or paste your own text. Sign in only when you want to save the result.'
                    : `${tool.description} Run a bounded preview here, then sign in to save results and connect the next step.`}
                </p>
              </div>
              {!minimal && (
                <div className="mt-6 grid gap-2">
                  {[
                    ['Real preview', 'Uses the same public limit logic'],
                    ['No saved history', 'Sign in to keep versions'],
                    ['Next step ready', 'Open the full suite when it matters'],
                  ].map(([label, body]) => (
                    <div key={label} className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
