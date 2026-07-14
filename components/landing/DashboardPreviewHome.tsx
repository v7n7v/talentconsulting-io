'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TalentConsultingMark, TalentConsultingWordmark } from '@/components/BrandLogo';
import {
  CareerModeId,
  careerModes,
  careerSamples,
  commandModules,
  faqItems,
  heroProofPoints,
} from '@/components/landing/careerLandingContent';

interface DashboardPreviewHomeProps {
  onGetStarted: () => void;
  onShowLogin: () => void;
  onShowSignup: () => void;
  isAuthenticated: boolean;
}

interface WorkbenchResult {
  score: number;
  scoreLabel: string;
  contentType: string;
  summary: string;
  issues: string[];
  strengths: string[];
  recommendation: string;
  meta?: string;
  rewritten?: string;
}

type HumanizeResponse = {
  rewritten?: string;
  before?: { humanScore?: number };
  after?: { humanScore?: number };
  warnings?: string[];
  error?: string;
  requiresAuth?: boolean;
  limitReached?: boolean;
};

type TurnstileWindow = Window & {
  turnstile?: {
    render: (
      container: HTMLElement,
      options: {
        sitekey: string;
        callback: (token: string) => void;
        'expired-callback': () => void;
        size: 'invisible';
      },
    ) => void;
  };
  onDashboardHomeTurnstileLoad?: () => void;
};

const dashboardStats = [
  { label: 'Resume readiness', value: '86', detail: '+12 this week', tone: 'good' },
  { label: 'Role match', value: '74', detail: '3 proof gaps', tone: 'watch' },
  { label: 'Applications', value: '12', detail: '4 need follow-up', tone: 'neutral' },
];

const readinessRows = [
  { label: 'ATS structure', value: 88, icon: 'assignment_turned_in' },
  { label: 'Evidence density', value: 71, icon: 'bar_chart' },
  { label: 'Interview stories', value: 64, icon: 'forum' },
];

const pipelineRows = [
  { company: 'Northstar Labs', role: 'Product Operations', stage: 'Tailor resume', score: '92%' },
  { company: 'Atlas Cloud', role: 'Customer Success Lead', stage: 'Follow up', score: '84%' },
  { company: 'Meridian AI', role: 'Growth Analyst', stage: 'Prep stories', score: '78%' },
];

const nextActions = [
  'Add metrics to the Customer Success bullet.',
  'Send the Atlas follow-up before 3 PM.',
  'Practice the operations bottleneck story.',
];

const answerReadyPages = [
  { query: 'Free AI resume builder', page: '/tools/resume-builder', signal: 'Builder plus ATS review' },
  { query: 'Free ATS analyzer', page: '/tools/ats-analyzer', signal: 'Resume structure checks' },
  { query: 'AI interview practice', page: '/tools/interview-prep', signal: 'Story-based prep' },
  { query: 'Software engineer resume example', page: '/resume-examples/software-engineer', signal: 'Example-led guidance' },
];

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-rounded ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function sentenceCount(text: string) {
  return Math.max(1, text.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 0).length);
}

function scoreColor(score: number) {
  if (score >= 80) return '#059669';
  if (score >= 60) return '#0ea5e9';
  if (score >= 40) return '#d97706';
  return '#dc2626';
}

function detectContentType(text: string, mode: CareerModeId) {
  const lower = text.toLowerCase();
  if (mode === 'resume' || lower.includes('experience') || lower.includes('skills')) return 'Resume text';
  if (mode === 'job-match' || lower.includes('job description') || lower.includes('responsibilities')) return 'Resume and role';
  if (lower.includes('dear ') || lower.includes('hiring manager')) return 'Cover letter';
  if (lower.includes('thank you') || lower.includes('reaching out')) return 'Recruiter reply';
  return 'Career writing';
}

function splitJobMatchText(text: string) {
  const normalized = text.replace(/\r/g, '');
  const marker = normalized.search(/job description:|role:|requirements:|responsibilities:/i);

  if (marker > 80) {
    return {
      resumeText: normalized.slice(0, marker),
      jobText: normalized.slice(marker),
    };
  }

  const midpoint = Math.floor(normalized.length / 2);
  return {
    resumeText: normalized.slice(0, midpoint),
    jobText: normalized.slice(midpoint),
  };
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
  const { resumeText, jobText } = splitJobMatchText(text);
  const resumeWords = new Set(importantWords(resumeText));
  const jobWords = Array.from(new Set(importantWords(jobText)));
  const matched = jobWords.filter((word) => resumeWords.has(word));
  const missing = jobWords.filter((word) => !resumeWords.has(word)).slice(0, 5);
  const score = jobWords.length ? Math.min(94, Math.round((matched.length / jobWords.length) * 100) + 18) : 52;

  return {
    score,
    scoreLabel: 'Match signal',
    contentType: 'Resume and role',
    summary: 'This quick pass compares role language against the evidence already present in your draft.',
    issues: missing.length
      ? missing.map((word) => `Add honest proof for "${word}" if it reflects your experience.`)
      : ['Add a fuller job description to sharpen the role match.'],
    strengths: matched.length
      ? matched.slice(0, 4).map((word) => `Your draft already reflects "${word}".`)
      : ['The resume side has enough context to start tailoring.'],
    recommendation: 'Start with the top third of the resume, then use the cover letter to explain the closest proof.',
    meta: `${matched.length} matched role signals`,
  };
}

function runQuickReadability(text: string): WorkbenchResult {
  const words = countWords(text);
  const sentences = sentenceCount(text);
  const avgWords = Math.max(1, Math.round(words / sentences));
  const longSentences = text.split(/[.!?]+/).filter((sentence) => countWords(sentence) > 28).length;
  const vagueWords = ['leverage', 'utilize', 'various', 'multiple', 'dynamic', 'robust', 'comprehensive'].filter((word) =>
    text.toLowerCase().includes(word),
  );
  const score = Math.max(34, Math.min(92, 88 - longSentences * 8 - vagueWords.length * 5 + (avgWords < 19 ? 6 : 0)));

  return {
    score,
    scoreLabel: 'Clarity score',
    contentType: detectContentType(text, 'quick-polish'),
    summary: `${words} words, ${sentences} sentences, ${avgWords} average words per sentence.`,
    issues: [
      ...(longSentences ? [`Shorten ${longSentences} long sentence${longSentences > 1 ? 's' : ''}.`] : []),
      ...(vagueWords.length ? [`Replace vague terms: ${vagueWords.join(', ')}.`] : []),
      ...(words < 40 ? ['Add one concrete result, example, or detail so the draft carries proof.'] : []),
    ],
    strengths: [
      avgWords <= 20 ? 'Sentence length is easy to scan.' : 'The draft has enough substance for editing.',
      words >= 40 ? 'There is enough context to identify the next edit.' : 'Short enough to polish quickly.',
    ],
    recommendation: 'Use Quick Polish when you want the system to rewrite this; use this preview as a no-cost preflight.',
    meta: `${Math.max(1, Math.ceil(words / 238))} min read`,
  };
}

function normalizeList(value: unknown, fallback: string[], max = 5) {
  return Array.isArray(value) && value.length > 0 ? value.slice(0, max).map((item) => String(item)) : fallback;
}

function valueNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function ScoreDial({ score, label }: { score: number; label: string }) {
  const color = scoreColor(score);
  const circumference = 2 * Math.PI * 42;

  return (
    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="42" stroke="rgba(148, 163, 184, 0.24)" strokeWidth="8" fill="none" />
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
        <p className="text-2xl font-semibold tabular-nums" style={{ color }}>
          {score}
        </p>
        <p className="text-[10px] leading-none text-[var(--text-muted)]">{label}</p>
      </div>
    </div>
  );
}

function DashboardPreviewPanel() {
  return (
    <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 shadow-[0_24px_80px_rgba(15,23,42,0.14)]">
      <div className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 sm:p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TalentConsultingMark className="h-9 w-9 rounded-xl border border-[var(--border-subtle)] bg-white" />
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Talent Studio</p>
              <p className="text-xs text-[var(--text-muted)]">Career command center</p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.78fr_1.22fr]">
          <aside className="hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 lg:block">
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Workspace</p>
            <div className="mt-3 space-y-1.5">
              {commandModules.slice(0, 6).map((tool, index) => (
                <div
                  key={tool.title}
                  className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm ${
                    index === 0 ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100' : 'text-[var(--text-muted)]'
                  }`}
                >
                  <Icon name={tool.icon} className="text-[18px]" />
                  <span className="truncate">{tool.title}</span>
                </div>
              ))}
            </div>
          </aside>

          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {dashboardStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3">
                  <p className="text-xs text-[var(--text-muted)]">{stat.label}</p>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <p className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{stat.value}</p>
                    <p
                      className={`text-[11px] font-medium ${
                        stat.tone === 'good'
                          ? 'text-emerald-600 dark:text-emerald-300'
                          : stat.tone === 'watch'
                            ? 'text-amber-600 dark:text-amber-300'
                            : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {stat.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_0.9fr]">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Readiness</p>
                    <p className="text-xs text-[var(--text-muted)]">What needs proof before the next application.</p>
                  </div>
                  <Icon name="insights" className="text-[22px] text-emerald-600" />
                </div>
                <div className="mt-4 space-y-3">
                  {readinessRows.map((row) => (
                    <div key={row.label}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                          <Icon name={row.icon} className="text-[17px] text-[var(--text-muted)]" />
                          {row.label}
                        </span>
                        <span className="tabular-nums text-[var(--text-muted)]">{row.value}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200/70 dark:bg-white/10">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${row.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Next best action</p>
                  <Icon name="auto_awesome" className="text-[21px] text-sky-600" />
                </div>
                <div className="mt-4 space-y-3">
                  {nextActions.map((action, index) => (
                    <div key={action} className="flex gap-2 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[11px] font-semibold text-[var(--text-muted)]">
                        {index + 1}
                      </span>
                      <p className="leading-5 text-[var(--text-muted)]">{action}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Application pipeline</p>
                <span className="rounded-full bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-[var(--text-muted)]">3 active</span>
              </div>
              <div className="space-y-2">
                {pipelineRows.map((row) => (
                  <div
                    key={`${row.company}-${row.role}`}
                    className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">{row.company}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{row.role}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-[var(--text-primary)]">{row.stage}</p>
                      <p className="text-xs tabular-nums text-emerald-600 dark:text-emerald-300">{row.score}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function CareerCheckPanel({ onShowSignup }: { onShowSignup: () => void }) {
  const [modeId, setModeId] = useState<CareerModeId>('resume');
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<WorkbenchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [limitReached, setLimitReached] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  const mode = useMemo(() => careerModes.find((item) => item.id === modeId) || careerModes[0], [modeId]);
  const wordCount = countWords(inputText);
  const overLimit = mode.wordCap !== null && wordCount > mode.wordCap;
  const needsMoreText = inputText.trim().length > 0 && inputText.trim().length < 20 && mode.id !== 'quick-polish';
  const canRun = inputText.trim().length > 0 && !needsMoreText && !overLimit && !loading;

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey || typeof window === 'undefined') return;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;

    const browserWindow = window as TurnstileWindow;
    const renderWidget = () => {
      if (!turnstileRef.current || !browserWindow.turnstile) return;
      if (turnstileRef.current.childElementCount > 0) return;
      browserWindow.turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(null),
        size: 'invisible',
      });
    };

    browserWindow.onDashboardHomeTurnstileLoad = renderWidget;

    if (!document.getElementById('cf-turnstile-script')) {
      const script = document.createElement('script');
      script.id = 'cf-turnstile-script';
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onDashboardHomeTurnstileLoad';
      script.async = true;
      document.head.appendChild(script);
    } else {
      renderWidget();
    }
  }, []);

  const selectMode = (value: CareerModeId) => {
    setModeId(value);
    setResult(null);
    setError('');
    setLimitReached(false);
  };

  const applySample = (key: keyof typeof careerSamples) => {
    const sample = careerSamples[key];
    setModeId(sample.mode);
    setInputText(sample.text);
    setResult(null);
    setError('');
    setLimitReached(false);
  };

  const runCheck = async () => {
    if (!canRun) {
      if (!inputText.trim()) setError('Paste a resume, job description, or career draft first.');
      if (needsMoreText) setError('Add a little more text so the check has enough signal.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setLimitReached(false);

    if (mode.id === 'job-match') {
      window.setTimeout(() => {
        setResult(runClientJobMatch(inputText));
        setLoading(false);
      }, 250);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);

    try {
      if (mode.id === 'quick-polish') {
        const response = await fetch('/api/writing/humanize-free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            text: inputText,
            domain: 'resume',
            tone: 'confident',
            turnstileToken: turnstileToken || undefined,
          }),
        });
        const data: HumanizeResponse = await response.json();

        if (!response.ok) {
          setError(data.error || 'The polish preview could not run. Please try again.');
          if (data.requiresAuth || data.limitReached) setLimitReached(true);
          return;
        }

        setResult({
          score: data.after?.humanScore || 72,
          scoreLabel: 'Trust score',
          contentType: detectContentType(inputText, mode.id),
          summary: 'Your draft was polished for specificity, rhythm, and career credibility.',
          issues: data.warnings?.slice(0, 3) || ['Review the final text and confirm every claim is accurate.'],
          strengths: [
            `Before: ${data.before?.humanScore ?? 0} human score`,
            `After: ${data.after?.humanScore ?? 0} human score`,
          ],
          recommendation: 'Create a free account to save versions and continue with resume or cover letter tools.',
          rewritten: data.rewritten,
        });
        return;
      }

      if (mode.id === 'resume' || mode.id === 'writing-trust') {
        const tool = mode.id === 'resume' ? 'ats-score' : 'detect';
        const response = await fetch('/api/tools/free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ tool, text: inputText }),
        });
        const data: Record<string, unknown> & { error?: string; requiresAuth?: boolean; limitReached?: boolean } = await response.json();

        if (!response.ok) {
          setError(data.error || 'This career check could not run. Please try again.');
          if (data.requiresAuth || data.limitReached) setLimitReached(true);
          return;
        }

        if (mode.id === 'resume') {
          setResult({
            score: valueNumber(data.atsScore, valueNumber(data.score, 64)),
            scoreLabel: 'ATS signal',
            contentType: detectContentType(inputText, mode.id),
            summary: typeof data.summary === 'string' ? data.summary : 'Resume structure check complete.',
            issues: normalizeList(data.issues, ['Add measurable outcomes where possible.', 'Make section labels easy for ATS systems to parse.']),
            strengths: normalizeList(data.strengths, ['The resume has enough text for a useful first pass.'], 4),
            recommendation: 'Improve the highest-impact bullet first, then compare the resume against a specific role.',
            meta: `${wordCount} words checked`,
          });
        } else {
          setResult({
            score: valueNumber(data.humanScore, valueNumber(data.score, 58)),
            scoreLabel: 'Trust signal',
            contentType: detectContentType(inputText, mode.id),
            summary:
              typeof data.summary === 'string'
                ? data.summary
                : 'Writing trust scan complete. Treat the score as an editing signal, not proof of authorship.',
            issues: normalizeList(data.topIssues || data.issues, ['Replace generic phrasing with concrete career evidence.']),
            strengths: normalizeList(data.strengths, ['The draft can improve without changing the core meaning.'], 4),
            recommendation: 'Use Quick Polish on the weakest paragraph, then review the final text yourself.',
            meta: `${wordCount} words scanned`,
          });
        }
      }
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
      id="career-check"
      className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 shadow-[0_20px_70px_rgba(15,23,42,0.10)] sm:p-5"
      aria-labelledby="career-check-title"
    >
      <div ref={turnstileRef} className="hidden" aria-hidden="true" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Free career check</p>
          <h2 id="career-check-title" className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
            Paste once. Know the next move.
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(careerSamples).map(([key, sample]) => (
            <button
              key={key}
              type="button"
              onClick={() => applySample(key as keyof typeof careerSamples)}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:border-emerald-400 hover:text-[var(--text-primary)]"
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4" role="tablist" aria-label="Career check mode">
        {careerModes.map((item) => {
          const active = item.id === mode.id;

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectMode(item.id)}
              className={`min-h-20 rounded-2xl border p-3 text-left transition ${
                active
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-50'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon name={item.icon} className="text-[19px]" />
                {item.label}
              </span>
              <span className="mt-1 block text-xs leading-4">{item.limitLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <label htmlFor="career-check-input" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
            {mode.description}
          </label>
          <textarea
            id="career-check-input"
            value={inputText}
            onChange={(event) => {
              setInputText(event.target.value);
              setError('');
              setResult(null);
              setLimitReached(false);
            }}
            placeholder={mode.placeholder}
            className="min-h-[260px] w-full resize-y rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-sm leading-6 text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-xs ${overLimit ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>
              {wordCount} words
              {mode.wordCap ? ` / ${mode.wordCap}` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={runCheck}
                disabled={!canRun}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--text-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-deep)' }}
              >
                <Icon name={loading ? 'progress_activity' : mode.icon} className={`text-[19px] ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Checking...' : mode.cta}
              </button>
              <button
                type="button"
                onClick={onShowSignup}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-hover)]"
              >
                <Icon name="login" className="text-[19px]" />
                Save workflow
              </button>
            </div>
          </div>
          {needsMoreText && <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">Add a little more text for a useful signal.</p>}
          {overLimit && <p className="mt-2 text-xs text-red-500">This preview is over the free word limit for {mode.label}.</p>}
          {error && (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {error}{' '}
              {limitReached && (
                <button type="button" onClick={onShowSignup} className="font-semibold underline underline-offset-2">
                  Create a free account
                </button>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          {result ? (
            <div>
              <div className="flex items-center gap-4">
                <ScoreDial score={result.score} label={result.scoreLabel} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{result.contentType}</p>
                  <h3 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{result.summary}</h3>
                  {result.meta && <p className="mt-1 text-sm text-[var(--text-muted)]">{result.meta}</p>}
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3">
                  <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Fix first</p>
                  <ul className="space-y-2">
                    {result.issues.slice(0, 4).map((issue) => (
                      <li key={issue} className="flex gap-2 text-sm leading-5 text-[var(--text-muted)]">
                        <Icon name="priority_high" className="mt-0.5 text-[17px] text-amber-500" />
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3">
                  <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Already working</p>
                  <ul className="space-y-2">
                    {result.strengths.slice(0, 3).map((strength) => (
                      <li key={strength} className="flex gap-2 text-sm leading-5 text-[var(--text-muted)]">
                        <Icon name="check_circle" className="mt-0.5 text-[17px] text-emerald-500" />
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {result.rewritten && (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-50">
                  {result.rewritten}
                </div>
              )}

              <p className="mt-4 rounded-2xl bg-[var(--card-bg)] p-3 text-sm leading-6 text-[var(--text-muted)]">{result.recommendation}</p>
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col justify-between">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <Icon name="track_changes" className="text-[24px]" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">The dashboard starts with one useful signal.</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  Check a resume, compare a role, scan writing trust, or polish a short draft. No account is required for the first pass.
                </p>
              </div>
              <div className="mt-6 space-y-3">
                {heroProofPoints.map((point) => (
                  <div key={point.label} className="flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2">
                    <span className="text-sm text-[var(--text-muted)]">{point.label}</span>
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{point.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AnswerReadyBand() {
  return (
    <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-10 sm:px-6 lg:grid-cols-[0.88fr_1.12fr] lg:px-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Answer-ready pages</p>
        <h2 className="mt-3 text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">A dashboard front door that still answers search intent.</h2>
        <p className="mt-4 max-w-xl text-base leading-7 text-[var(--text-muted)]">
          The homepage can lead with product value while routing priority searches to clear, specific tool pages.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {answerReadyPages.map((item) => (
          <a
            key={item.query}
            href={item.page}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 transition hover:-translate-y-0.5 hover:border-emerald-400"
          >
            <p className="text-sm font-semibold text-[var(--text-primary)]">{item.query}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{item.signal}</p>
            <p className="mt-3 text-xs font-medium text-emerald-600 dark:text-emerald-300">{item.page}</p>
          </a>
        ))}
      </div>
    </section>
  );
}

function ToolBand({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section className="border-y border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">The suite</p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">One workspace from resume draft to interview day.</h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-[var(--text-muted)]">
            Resume checks, job matching, writing polish, tracking, and interview prep belong in one place because every step changes the next one.
          </p>
          <button
            type="button"
            onClick={onGetStarted}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--text-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
            style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-deep)' }}
          >
            <Icon name="arrow_forward" className="text-[19px]" />
            Open the dashboard
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {commandModules.map((tool) => (
            <a key={tool.title} href={tool.href} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--border-hover)]">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--bg-surface)]" style={{ color: tool.accent }}>
                <Icon name={tool.icon} className="text-[22px]" />
              </span>
              <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">{tool.title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{tool.text}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqBand() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Clear answers</p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">Useful before signup. Stronger after.</h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-[var(--text-muted)]">
          The homepage keeps the answer-first surface short, then sends deeper intent to focused pages.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {faqItems.slice(0, 4).map((item) => (
          <article key={item.q} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--bg-surface)] text-emerald-600 dark:text-emerald-300">
                <Icon name={item.icon} className="text-[21px]" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{item.q}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{item.a}</p>
                <p className="mt-3 text-xs font-medium text-[var(--text-muted)]">{item.tip}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function DashboardPreviewHome({
  onGetStarted,
  onShowLogin,
  onShowSignup,
  isAuthenticated,
}: DashboardPreviewHomeProps) {
  return (
    <div className="min-h-dvh bg-[var(--bg-deep)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-deep)]/86 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="/" aria-label="TalentConsulting.io home" className="flex min-w-0 items-center gap-2">
            <TalentConsultingWordmark className="w-[188px] max-w-[56vw]" />
          </a>
          <nav className="flex shrink-0 items-center gap-2" aria-label="Primary">
            <a href="#career-check" className="hidden rounded-full px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)] sm:inline-flex">
              Free check
            </a>
            <button
              type="button"
              onClick={onShowLogin}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-hover)]"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={onShowSignup}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
              style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-deep)' }}
            >
              Start free
            </button>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100dvh-10rem)] w-full max-w-7xl items-center gap-8 px-4 pb-8 pt-8 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:pb-10">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Dashboard-first career workspace
          </div>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.02] text-[var(--text-primary)] sm:text-6xl lg:text-7xl">
            Your career dashboard, ready before the next application.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--text-muted)]">
            Paste a resume, compare a role, polish the message, and turn the next step into a tracked workflow.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onGetStarted}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--text-primary)] px-6 py-3 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90"
              style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-deep)' }}
            >
              <Icon name={isAuthenticated ? 'dashboard' : 'arrow_forward'} className="text-[20px]" />
              {isAuthenticated ? 'Open dashboard' : 'Start free'}
            </button>
            <a
              href="#career-check"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-6 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-hover)]"
            >
              <Icon name="track_changes" className="text-[20px]" />
              Run a free check
            </a>
          </div>

          <div className="mt-8 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
            {heroProofPoints.map((point) => (
              <div key={point.label} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3">
                <p className="text-xl font-semibold text-[var(--text-primary)]">{point.value}</p>
                <p className="mt-1 text-xs leading-4 text-[var(--text-muted)]">{point.label}</p>
              </div>
            ))}
          </div>
        </div>

        <DashboardPreviewPanel />
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <CareerCheckPanel onShowSignup={onShowSignup} />
      </div>

      <AnswerReadyBand />
      <ToolBand onGetStarted={onGetStarted} />
      <FaqBand />
    </div>
  );
}
