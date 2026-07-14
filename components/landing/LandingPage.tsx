'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { AnimatedShimmerBackground } from '@/components/AnimatedShimmerBackground';
import { TalentConsultingWordmark } from '@/components/BrandLogo';
import { useTheme } from '@/components/ThemeProvider';
import ThemeToggle from '@/components/ThemeToggle';
import { MobileSegmentedControl } from '@/components/mobile/MobileWorkbench';
import {
  allToolsList,
  beforeAfterExamples,
  careerJourney,
  careerModes,
  careerSamples,
  commandModules,
  dailyCareerUseCases,
  faqItems,
  heroProofPoints,
  pricingTeasers,
  sonaChatMessages,
  sonaMemoryTimeline,
  sonaMoments,
  workflowSteps,
  type CareerMode,
  type CareerModeId,
} from './careerLandingContent';

interface LandingPageProps {
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
  rewritten?: string;
  meta?: string;
}

interface HumanizeResult {
  rewritten: string;
  before: { humanScore: number; verdict: string };
  after: { humanScore: number; verdict: string };
  warnings?: string[];
}

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`}>{name}</span>;
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function sentenceCount(text: string) {
  return Math.max(1, text.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 0).length);
}

function getScoreColor(score: number) {
  if (score >= 78) return '#2563eb';
  if (score >= 58) return '#38bdf8';
  if (score >= 42) return '#f59e0b';
  return '#f43f5e';
}

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&';

function TextScramble({ text, className = '', durationMs = 1200 }: { text: string; className?: string; durationMs?: number }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? text : '');
  const hasRun = useRef(false);

  useEffect(() => {
    if (reduceMotion || hasRun.current) { setDisplay(text); return; }
    hasRun.current = true;
    const len = text.length;
    let start: number | null = null;

    const frame = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / durationMs, 1);
      let result = '';
      for (let i = 0; i < len; i++) {
        if (text[i] === ' ') { result += ' '; continue; }
        const threshold = (i / len) * 0.7 + 0.15;
        if (progress >= threshold) {
          result += text[i];
        } else {
          result += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
      }
      setDisplay(result);
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [text, durationMs, reduceMotion]);

  return <span className={className}>{display}</span>;
}

function ProofPointValue({ value, delay = 0 }: { value: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? value : '');
  const hasRun = useRef(false);

  useEffect(() => {
    if (reduceMotion || hasRun.current) { setDisplay(value); return; }
    hasRun.current = true;
    const timer = setTimeout(() => {
      const len = value.length;
      let start: number | null = null;
      const frame = (ts: number) => {
        if (!start) start = ts;
        const progress = Math.min((ts - start) / 800, 1);
        let result = '';
        for (let i = 0; i < len; i++) {
          if (value[i] === ' ') { result += ' '; continue; }
          const threshold = (i / len) * 0.6 + 0.2;
          if (progress >= threshold) {
            result += value[i];
          } else {
            result += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          }
        }
        setDisplay(result);
        if (progress < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay, reduceMotion]);

  return <span className="inline-block font-mono">{display}</span>;
}

function SpotlightCard({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative overflow-hidden ${className}`}
      style={{ isolation: 'isolate', ...style }}
    >
      {/* Spotlight overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] opacity-0 transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(280px circle at ${pos.x}px ${pos.y}px, rgba(37,99,235,0.10), transparent 60%)`,
        }}
      />
      {children}
    </div>
  );
}

function detectContentType(text: string, mode: CareerModeId) {
  const lower = text.toLowerCase();
  if (mode === 'resume' || lower.includes('experience') || lower.includes('skills')) return 'Resume text';
  if (lower.includes('dear ') || lower.includes('hiring manager')) return 'Cover letter';
  if (lower.includes('job description') || lower.includes('responsibilities')) return 'Role match';
  if (lower.includes('thank you') || lower.includes('reaching out')) return 'Recruiter reply';
  return 'Career writing';
}

function splitJobMatchText(text: string) {
  const normalized = text.replace(/\r/g, '');
  const jobMarker = normalized.search(/job description:|role:|requirements:|responsibilities:/i);

  if (jobMarker > 80) {
    return {
      resumeText: normalized.slice(0, jobMarker),
      jobText: normalized.slice(jobMarker),
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
    'and', 'the', 'for', 'with', 'that', 'this', 'from', 'you', 'your', 'are', 'our', 'have', 'has', 'was', 'will',
    'job', 'role', 'work', 'team', 'skills', 'experience', 'responsible', 'using', 'into', 'about', 'more', 'their',
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
  const missing = jobWords.filter((word) => !resumeWords.has(word)).slice(0, 6);
  const score = jobWords.length ? Math.min(94, Math.round((matched.length / jobWords.length) * 100) + 18) : 52;

  return {
    score,
    scoreLabel: 'Match signal',
    contentType: 'Resume and role',
    summary: 'This quick match compares repeated role language against the career evidence in your draft.',
    issues: missing.length
      ? missing.map((word) => `Add honest evidence for "${word}" if it reflects your real experience.`)
      : ['The pasted text has limited role language. Add a job description for sharper matching.'],
    strengths: matched.slice(0, 4).map((word) => `Your draft already reflects "${word}".`),
    recommendation: 'Tailor the top third of the resume first, then use the cover letter to explain the closest proof.',
    meta: `${matched.length} matched role signals`,
  };
}

function runQuickReadability(text: string): WorkbenchResult {
  const words = countWords(text);
  const sentences = sentenceCount(text);
  const avgWords = Math.round(words / sentences);
  const longSentences = text.split(/[.!?]+/).filter((sentence) => countWords(sentence) > 28).length;
  const vagueWords = ['leverage', 'utilize', 'various', 'multiple', 'dynamic', 'robust', 'comprehensive']
    .filter((word) => text.toLowerCase().includes(word));
  const score = Math.max(34, Math.min(92, 88 - longSentences * 8 - vagueWords.length * 5 + (avgWords < 19 ? 6 : 0)));

  return {
    score,
    scoreLabel: 'Clarity score',
    contentType: detectContentType(text, 'quick-polish'),
    summary: `${words} words, ${sentences} sentences, ${avgWords} average words per sentence.`,
    issues: [
      ...(longSentences ? [`Shorten ${longSentences} long sentence${longSentences > 1 ? 's' : ''}.`] : []),
      ...(vagueWords.length ? [`Replace vague terms: ${vagueWords.join(', ')}.`] : []),
      ...(words < 40 ? ['Add one concrete result, example, or detail so the draft has enough proof.'] : []),
    ],
    strengths: [
      avgWords <= 20 ? 'Sentence length is easy to scan.' : 'The draft has enough substance for editing.',
      words >= 40 ? 'There is enough context to identify the next edit.' : 'Short enough to polish quickly.',
    ],
    recommendation: 'Use this as a quick preflight, then run Writing Trust or Resume if this text is going into an application.',
    meta: `${Math.max(1, Math.ceil(words / 238))} min read`,
  };
}

function normalizeIssues(value: unknown, fallback: string[]) {
  return Array.isArray(value) && value.length > 0
    ? value.slice(0, 5).map((item) => String(item))
    : fallback;
}

function normalizeStrengths(value: unknown, fallback: string[]) {
  return Array.isArray(value) && value.length > 0
    ? value.slice(0, 4).map((item) => String(item))
    : fallback;
}

function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      animate={reduceMotion || isInView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const color = getScoreColor(score);
  return (
    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="42" stroke="var(--border-subtle)" strokeWidth="8" fill="none" />
        <motion.circle
          cx="50"
          cy="50"
          r="42"
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 42}`}
          initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
          animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - score / 100) }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="text-center">
        <p className="text-2xl font-semibold tabular-nums" style={{ color }}>{score}</p>
        <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      </div>
    </div>
  );
}

function CareerCheckWorkbench({ onShowSignup }: { onShowSignup: () => void }) {
  const [modeId, setModeId] = useState<CareerModeId>('resume');
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<WorkbenchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [limitReached, setLimitReached] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  const mode = careerModes.find((item) => item.id === modeId) || careerModes[0];
  const wordCount = countWords(inputText);
  const overLimit = mode.wordCap !== null && wordCount > mode.wordCap;
  const needsMoreText = inputText.trim().length > 0 && inputText.trim().length < 20 && mode.id !== 'quick-polish';
  const canRun = inputText.trim().length > 0 && !needsMoreText && !overLimit && !loading;

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey || typeof window === 'undefined') return;

    const renderWidget = () => {
      if (!turnstileRef.current || !(window as any).turnstile) return;
      if (turnstileRef.current.childElementCount > 0) return;
      (window as any).turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(null),
        size: 'invisible',
      });
    };

    (window as any).onLandingTurnstileLoad = renderWidget;

    if (!document.getElementById('cf-turnstile-script')) {
      const script = document.createElement('script');
      script.id = 'cf-turnstile-script';
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onLandingTurnstileLoad';
      script.async = true;
      document.head.appendChild(script);
    } else {
      renderWidget();
    }
  }, []);

  const applySample = (key: keyof typeof careerSamples) => {
    const sample = careerSamples[key];
    setModeId(sample.mode);
    setInputText(sample.text);
    setResult(null);
    setError('');
    setLimitReached(false);
  };

  const selectMode = (value: CareerModeId) => {
    setModeId(value);
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
      }, 360);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);

    try {
      if (mode.id === 'quick-polish') {
        const usageKey = 'tc_humanize_uses';
        const dateKey = 'tc_humanize_date';
        const today = new Date().toDateString();
        const storedDate = localStorage.getItem(dateKey);
        const usedCount = storedDate === today ? Number.parseInt(localStorage.getItem(usageKey) || '0', 10) : 0;

        if (usedCount >= 3) {
          setLimitReached(true);
          setError('Daily polish limit reached. Create a free account to keep working.');
          return;
        }

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
        const data: HumanizeResult & { error?: string; requiresAuth?: boolean; limitReached?: boolean } = await response.json();

        if (!response.ok) {
          setError(data.error || 'The polish preview could not run. Please try again.');
          if (data.requiresAuth || data.limitReached) setLimitReached(true);
          return;
        }

        localStorage.setItem(dateKey, today);
        localStorage.setItem(usageKey, String(usedCount + 1));
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
          recommendation: 'Save this workflow to keep versions, export drafts, and continue with resume or cover letter tools.',
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
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'This career check could not run. Please try again.');
          if (data.requiresAuth || data.limitReached) setLimitReached(true);
          return;
        }

        if (mode.id === 'resume') {
          setResult({
            score: data.atsScore || data.score || 64,
            scoreLabel: 'ATS signal',
            contentType: detectContentType(inputText, mode.id),
            summary: data.summary || 'Resume structure check complete. Use the next actions to strengthen recruiter readability.',
            issues: normalizeIssues(data.issues, ['Add measurable outcomes where possible.', 'Make section labels easy for ATS systems to parse.']),
            strengths: normalizeStrengths(data.strengths, ['The resume has enough text for a useful first pass.']),
            recommendation: 'Improve the highest-impact bullet first, then compare the resume against a specific job description.',
            meta: `${wordCount} words checked`,
          });
        } else {
          setResult({
            score: data.humanScore || data.score || 58,
            scoreLabel: 'Trust signal',
            contentType: detectContentType(inputText, mode.id),
            summary: data.summary || 'Writing trust scan complete. Treat the score as an editing signal, not proof of authorship.',
            issues: normalizeIssues(data.topIssues || data.issues, ['Replace generic phrasing with concrete career evidence.']),
            strengths: normalizeStrengths(data.strengths, ['The draft can be improved without changing the core meaning.']),
            recommendation: 'Use Quick Polish on the weakest paragraph, then review the final text yourself.',
            meta: `${wordCount} words scanned`,
          });
        }
      }
    } catch (requestError) {
      setError(requestError instanceof DOMException && requestError.name === 'AbortError'
        ? 'This check is taking longer than expected. Please try again in a moment.'
        : 'Network error. Please try again in a moment.');
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  };

  return (
    <section
      id="career-check"
      className="relative min-w-0 overflow-hidden rounded-[24px] border border-blue-400/25 bg-[color-mix(in_srgb,var(--card-bg)_91%,#2563eb_9%)] shadow-[0_24px_90px_rgba(37,99,235,0.14)]"
    >
      <div className="border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-deep)_82%,transparent)] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="icon-shell-neutral flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border">
              <Icon name="dashboard_customize" className="text-[22px]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Free Career Check</p>
              <p className="text-xs text-[var(--text-muted)]">Resume, role match, writing trust, and quick polish</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            Live workbench
          </div>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0 lg:grid-cols-[1fr_0.9fr]">
        <div className="min-w-0 border-b border-[var(--border-subtle)] p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <MobileSegmentedControl
            className="mb-3 sm:hidden"
            ariaLabel="Career check modes"
            value={modeId}
            onChange={(value) => selectMode(value as CareerModeId)}
            items={careerModes.map((item) => ({
              value: item.id,
              label: item.label,
              icon: item.icon,
              meta: item.limitLabel,
            }))}
          />

          <div className="mb-3 hidden flex-wrap gap-2 sm:flex">
            {careerModes.map((item) => {
              const active = item.id === modeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectMode(item.id)}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${active
                      ? 'border-[var(--border)] bg-[var(--bg-hover)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border)]'
                    }`}
                >
                  <Icon name={item.icon} className="text-[16px]" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="mb-3 hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 sm:block">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{mode.description}</p>
              <span className="rounded-full bg-[var(--bg-hover)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)]">
                {mode.limitLabel}
              </span>
            </div>
          </div>

          <textarea
            id="career-check-input"
            value={inputText}
            onChange={(event) => {
              setInputText(event.target.value);
              setResult(null);
              setError('');
              setLimitReached(false);
            }}
            placeholder={mode.placeholder}
            className="min-h-[240px] w-full resize-none rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-input)] p-4 text-base leading-6 text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/15 sm:text-sm"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
              <span className={overLimit ? 'font-semibold text-rose-400' : ''}>
                {wordCount}{mode.wordCap ? `/${mode.wordCap}` : ''} words
              </span>
              {Object.entries(careerSamples).map(([key, sample]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applySample(key as keyof typeof careerSamples)}
                  className="font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] underline-offset-4 hover:underline"
                >
                  {sample.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={limitReached ? onShowSignup : runCheck}
              disabled={!limitReached && (!canRun || loading)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-blue-400/55 bg-blue-500/12 px-5 text-sm font-semibold text-blue-200 transition hover:bg-blue-500/18 disabled:cursor-not-allowed disabled:border-[var(--border-subtle)] disabled:bg-[var(--bg-surface)] disabled:text-[var(--text-muted)] sm:w-auto"
            >
              {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name={limitReached ? 'person_add' : mode.icon} className="text-[18px]" />}
              {loading ? 'Checking' : limitReached ? 'Create free account' : mode.cta}
            </button>
          </div>

          {overLimit && (
            <p className="mt-3 rounded-[12px] border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              This free check is capped at {mode.wordCap} words. Create an account for larger saved workflows.
            </p>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-[12px] border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              <Icon name="warning" className="icon-status-danger mt-0.5 text-[15px]" />
              <span>
                {error}{' '}
                {limitReached ? (
                  <button type="button" onClick={onShowSignup} className="font-semibold underline underline-offset-4">
                    Sign up free
                  </button>
                ) : null}
              </span>
            </div>
          )}
        </div>

        <div className="min-h-[380px] min-w-0 p-4 sm:p-5">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex h-full min-h-[340px] flex-col justify-between rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
              >
                <div>
                  <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-blue-300">
                    <span className="h-3 w-3 animate-pulse rounded-full bg-blue-400" />
                    Building your career signal
                  </div>
                  {['Classifying content', 'Checking role evidence', 'Finding weak signals', 'Choosing next action'].map((step, index) => (
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.16 }}
                      className="mb-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-secondary)]">{step}</span>
                        <span className="text-blue-300">checking</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-hover)]">
                  <motion.div
                    className="h-full rounded-full bg-blue-400"
                    initial={{ width: '12%' }}
                    animate={{ width: ['12%', '68%', '92%'] }}
                    transition={{ duration: 2.1, ease: 'easeOut' }}
                  />
                </div>
              </motion.div>
            ) : result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                  <div className="flex items-center gap-4">
                    <ScoreRing score={result.score} label={result.scoreLabel} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-blue-400/25 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold text-blue-300">
                          {result.contentType}
                        </span>
                        {result.meta ? (
                          <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-muted)]">
                            {result.meta}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{result.summary}</p>
                    </div>
                  </div>
                </div>

                {result.rewritten ? (
                  <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                    <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Polished preview</p>
                    <p className="max-h-[150px] overflow-y-auto text-sm leading-6 text-[var(--text-secondary)]">{result.rewritten}</p>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <ResultList title="Fix next" icon="build" tone="warn" items={result.issues} />
                  <ResultList title="Working well" icon="verified" tone="good" items={result.strengths} />
                </div>

                <div className="rounded-[18px] border border-blue-400/25 bg-blue-500/10 p-4">
                  <p className="text-sm font-semibold text-blue-200">Recommended next action</p>
                  <p className="mt-1 text-xs leading-5 text-blue-100/75">{result.recommendation}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onShowSignup}
                      className="rounded-[12px] bg-blue-300 px-4 py-2 text-xs font-bold text-blue-950 transition hover:bg-blue-200"
                    >
                      Save my career workspace
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResult(null);
                        setInputText('');
                        setError('');
                      }}
                      className="rounded-[12px] border border-blue-400/25 px-4 py-2 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/10"
                    >
                      Check another draft
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex h-full min-h-[340px] flex-col justify-between rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Command center preview</p>
                  <div className="mt-4 space-y-3">
                    {[
                      ['Resume score', 'ATS structure, clarity, and missing proof.'],
                      ['Job match', 'Role language compared against your real evidence.'],
                      ['Writing trust', 'Generic AI patterns treated as editing signals.'],
                      ['Sona handoff', 'Your next step moves into the saved workspace.'],
                    ].map(([title, text], index) => (
                      <motion.div
                        key={title}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.08 }}
                        className="flex gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3"
                      >
                        <Icon name="data_usage" className="icon-neutral mt-0.5 text-[18px]" />
                        <div>
                          <p className="text-xs font-semibold text-[var(--text-primary)]">{title}</p>
                          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{text}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">
                  Talent Studio helps communicate your real experience clearly. It does not invent credentials, guarantee interviews, or promise detector outcomes.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div ref={turnstileRef} className="hidden" />

    </section>
  );
}

function ResultList({
  title,
  icon,
  tone,
  items,
}: {
  title: string;
  icon: string;
  tone: 'good' | 'warn';
  items: string[];
}) {
  const color = tone === 'good' ? 'text-[var(--success)]' : 'text-[var(--warning)]';
  const border = tone === 'good' ? 'border-blue-400/25 bg-blue-500/10' : 'border-amber-400/25 bg-amber-500/10';
  const iconClass = tone === 'good' ? 'icon-status-success' : 'icon-status-warning';

  return (
    <div className={`rounded-[14px] border p-3 ${border}`}>
      <p className={`mb-2 flex items-center gap-2 text-xs font-semibold ${color}`}>
        <Icon name={icon} className={`text-[15px] ${iconClass}`} />
        {title}
      </p>
      <div className="space-y-1.5">
        {items.slice(0, 4).map((item) => (
          <p key={item} className="text-xs leading-5 text-[var(--text-secondary)]">{item}</p>
        ))}
      </div>
    </div>
  );
}

function ToolsMarquee() {
  const doubled = [...allToolsList, ...allToolsList];

  return (
    <div className="relative overflow-hidden py-5">
      <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-20 bg-gradient-to-r from-[var(--bg-deep)] to-transparent" />
      <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-20 bg-gradient-to-l from-[var(--bg-deep)] to-transparent" />

      <motion.div
        className="flex gap-3"
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 35, repeat: Infinity, ease: 'linear' }}
      >
        {doubled.map((t, i) => (
          <div
            key={i}
            className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2"
          >
            <span className="material-symbols-rounded icon-neutral text-[15px] opacity-70">{t.icon}</span>
            <span className="text-xs font-medium text-[var(--text-secondary)]">{t.label}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function WorkflowAnimation() {
  const [activeStep, setActiveStep] = useState(0);
  const [morphScore, setMorphScore] = useState(0);
  const [morphSkills, setMorphSkills] = useState<string[]>([]);

  useEffect(() => {
    const interval = setInterval(() => setActiveStep((prev) => (prev + 1) % 4), 3500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeStep === 2) {
      setMorphScore(0);
      setMorphSkills([]);
      const skills = ['ATS Ready', 'Keywords', 'Clarity', 'Evidence', 'Tone'];
      skills.forEach((skill, i) => {
        setTimeout(() => setMorphSkills((prev) => [...prev, skill]), 300 + i * 300);
      });
      const target = 86 + Math.floor(Math.random() * 8);
      let cur = 0;
      const scoreInterval = setInterval(() => {
        cur += 3;
        if (cur >= target) { cur = target; clearInterval(scoreInterval); }
        setMorphScore(cur);
      }, 40);
      return () => clearInterval(scoreInterval);
    }
  }, [activeStep]);

  const stepContent = [
    <motion.div key="upload" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} className="flex h-[100px] flex-col items-center justify-center gap-2 p-4">
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}>
        <Icon name="description" className="icon-neutral text-3xl" />
      </motion.div>
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.4 }}
        className="flex items-center gap-2 rounded-lg border-2 border-dashed border-[var(--border-subtle)] bg-[var(--bg-hover)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)]"
      >
        <motion.span animate={{ y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>↑</motion.span>
        resume_v3.pdf uploaded
      </motion.div>
    </motion.div>,
    <motion.div key="check" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} className="flex h-[100px] flex-col items-center justify-center gap-2 p-4">
      <div className="flex items-center gap-3">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }} className="h-5 w-5 rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--text-secondary)]" />
        <span className="text-xs font-medium text-[var(--text-secondary)]">Scanning ATS signals</span>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {['Structure ✓', 'Keywords ✓', 'Sections ✓'].map((item, i) => (
          <motion.span key={item} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 + i * 0.3 }}
            className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]"
          >{item}</motion.span>
        ))}
      </div>
    </motion.div>,
    <motion.div key="morph" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} className="flex h-[100px] flex-col items-center justify-center gap-2 p-4">
      <div className="flex items-center gap-3">
        <div className="flex flex-wrap justify-center gap-1">
          {morphSkills.map((skill) => (
            <motion.span key={skill} initial={{ opacity: 0, scale: 0.5, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-2 py-0.5 text-[9px] font-medium text-[var(--text-secondary)]"
            >{skill}</motion.span>
          ))}
        </div>
        {morphScore > 0 && (
          <span className="text-lg font-bold tabular-nums text-[var(--text-primary)]">{morphScore}%</span>
        )}
      </div>
      <span className="text-[10px] text-[var(--text-muted)]">Polishing voice and evidence</span>
    </motion.div>,
    <motion.div key="apply" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} className="flex h-[100px] flex-col items-center justify-center gap-2 p-4">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
        <Icon name="check_circle" className="text-3xl text-[var(--text-primary)]" />
      </motion.div>
      <span className="text-xs font-semibold text-[var(--text-primary)]">Application ready</span>
      <span className="text-[10px] text-[var(--text-muted)]">Saved · Tracked · Sona following up</span>
    </motion.div>,
  ];

  return (
    <div className="mt-7 overflow-hidden rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[var(--text-primary)]">How it works</p>
        <span className="rounded-full bg-[var(--bg-hover)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)]">4 steps</span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {workflowSteps.map((ws, i) => {
          const isActive = activeStep === i;
          const isPast = activeStep > i;
          return (
            <button
              key={ws.id}
              type="button"
              onClick={() => setActiveStep(i)}
              className={`relative overflow-hidden rounded-[14px] border p-3 text-left transition-all ${isActive
                  ? 'border-[var(--border)] bg-[var(--bg-hover)]'
                  : isPast
                    ? 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                    : 'border-[var(--border-subtle)] bg-[var(--card-bg)]'
                }`}
            >
              <div className="absolute inset-x-0 top-0 h-[2px] bg-[var(--border-subtle)]">
                {isActive && (
                  <motion.div
                    className="h-full bg-[var(--text-primary)]"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 3.5, ease: 'linear' }}
                    key={`progress-${activeStep}-${i}`}
                  />
                )}
                {isPast && <div className="h-full w-full bg-[var(--border)]" />}
              </div>
              <p className={`text-[9px] font-bold uppercase tracking-widest ${isActive ? 'text-[var(--text-primary)]' : isPast ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}>{ws.step}</p>
              <p className={`mt-1 text-[11px] font-semibold ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>{ws.title}</p>
              <p className={`mt-0.5 text-[9px] ${isActive ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}>{ws.desc}</p>
              {isPast && (
                <div className="absolute right-2 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--bg-hover)]">
                  <Icon name="check" className="text-[10px] text-[var(--text-primary)]" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)]">
        <AnimatePresence mode="wait">
          {stepContent[activeStep]}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FreeCareerChecks({ onShowSignup }: { onShowSignup: () => void }) {
  return (
    <section id="career-tools" className="rounded-[26px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 lg:p-6">
      <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">Free Career Checks</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Useful before signup. Powerful when saved.
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
          The free tools create daily value. The account turns those checks into a career workspace with history, exports, tracking, and Sona context.
        </p>
      </Reveal>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {commandModules.map((tool, index) => (
          <Reveal key={tool.title} delay={index * 0.04}>
            <Link
              href={tool.href}
              className="group flex h-full min-w-0 flex-col justify-between rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 transition hover:border-[var(--border)]"
            >
              <span className="flex items-start gap-3">
                <span className="icon-shell-neutral flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border">
                  <Icon name={tool.icon} className="text-[23px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">{tool.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-[var(--text-secondary)]">{tool.text}</span>
                </span>
              </span>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-300">
                Open tool
                <Icon name="arrow_forward" className="text-[15px] transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </Reveal>
        ))}
      </div>

      <button
        type="button"
        onClick={onShowSignup}
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-blue-300 px-5 text-sm font-bold text-blue-950 transition hover:bg-blue-200"
      >
        <Icon name="person_add" className="text-[18px]" />
        Save my career workspace
      </button>
    </section>
  );
}

function CareerJourneySection() {
  return (
    <section>
      <Reveal className="mb-4 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Career workflow</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          One path from rough draft to confident application.
        </h2>
        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
          Talent Studio should feel like a guided route through the whole job search, not a drawer full of unrelated tools.
        </p>
      </Reveal>

      <div className="relative">
        <div className="absolute left-5 top-8 hidden h-[calc(100%-4rem)] w-px bg-gradient-to-b from-blue-400/40 via-cyan-400/30 to-transparent sm:block" />
        <div className="grid gap-3 lg:grid-cols-7">
          {careerJourney.map((step, index) => (
            <Reveal key={step.title} delay={index * 0.04}>
              <SpotlightCard className="h-full rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 transition-all duration-300 hover:-translate-y-1 hover:border-blue-400/20 hover:shadow-lg hover:shadow-blue-500/5">
                <div className="icon-shell-neutral flex h-11 w-11 items-center justify-center rounded-[14px] border">
                  <Icon name={step.icon} className="text-[22px]" />
                </div>
                <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">{step.title}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{step.text}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function CommandCenterSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const reduceMotion = useReducedMotion();

  type ProcessPhase = 'idle' | 'scanning' | 'writing' | 'fit' | 'complete';
  const phases: { id: ProcessPhase; label: string; icon: string; scoreTarget: number }[] = [
    { id: 'scanning', label: 'Scanning resume structure...', icon: 'assignment_turned_in', scoreTarget: 28 },
    { id: 'writing', label: 'Checking writing quality...', icon: 'auto_fix_high', scoreTarget: 55 },
    { id: 'fit', label: 'Evaluating job fit...', icon: 'troubleshoot', scoreTarget: 72 },
    { id: 'complete', label: 'Career readiness complete', icon: 'check_circle', scoreTarget: 82 },
  ];

  const statusResults = [
    { text: 'Resume evidence improved', icon: 'task_alt', phase: 'scanning' as ProcessPhase },
    { text: 'Cover letter needs role-specific opening', icon: 'warning', phase: 'writing' as ProcessPhase },
    { text: 'Interview story ready for practice', icon: 'task_alt', phase: 'fit' as ProcessPhase },
  ];

  const [currentPhase, setCurrentPhase] = useState<ProcessPhase>('idle');
  const [displayScore, setDisplayScore] = useState(0);
  const [visibleStatuses, setVisibleStatuses] = useState<number[]>([]);
  const scoreRef = useRef(0);
  const animFrameRef = useRef(0);
  const [cycle, setCycle] = useState(0);

  const phaseIdx = phases.findIndex(p => p.id === currentPhase);

  useEffect(() => {
    if (!isInView || reduceMotion) {
      setCurrentPhase('complete');
      setDisplayScore(82);
      setVisibleStatuses([0, 1, 2]);
      return;
    }

    setCurrentPhase('idle');
    setDisplayScore(0);
    setVisibleStatuses([]);
    scoreRef.current = 0;

    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setCurrentPhase('scanning'), 600));
    timers.push(setTimeout(() => setVisibleStatuses([0]), 2200));
    timers.push(setTimeout(() => setCurrentPhase('writing'), 2800));
    timers.push(setTimeout(() => setVisibleStatuses([0, 1]), 4400));
    timers.push(setTimeout(() => setCurrentPhase('fit'), 5000));
    timers.push(setTimeout(() => setVisibleStatuses([0, 1, 2]), 6600));
    timers.push(setTimeout(() => setCurrentPhase('complete'), 7200));

    // Restart cycle infinitely
    timers.push(setTimeout(() => setCycle(c => c + 1), 12000));

    return () => timers.forEach(clearTimeout);
  }, [isInView, reduceMotion, cycle]);

  // Smooth score counter — chases the current phase target
  useEffect(() => {
    if (reduceMotion) return;
    const target = currentPhase === 'idle' ? 0 : phases.find(p => p.id === currentPhase)?.scoreTarget ?? 0;

    const animate = () => {
      if (scoreRef.current < target) {
        scoreRef.current = Math.min(scoreRef.current + 1, target);
        setDisplayScore(scoreRef.current);
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [currentPhase, reduceMotion]);

  const scoreColor = displayScore >= 70 ? '#2563eb' : displayScore >= 45 ? '#f59e0b' : displayScore >= 1 ? '#38bdf8' : 'var(--border-subtle)';
  const circumference = 2 * Math.PI * 42;

  return (
    <section
      ref={sectionRef}
      className="overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 lg:p-6"
    >
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">Career Command Center</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          Humanizer is the magnet. The platform is the system.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
          The landing page now shows how writing polish connects to resumes, job matching, application tracking, interviews, and Sona.
        </p>
      </Reveal>

      <div className="mt-8 grid gap-4 lg:grid-cols-[0.9fr_1.2fr_0.9fr] lg:items-center">
        {/* Left tiles — slide from left */}
        <div className="space-y-4">
          {commandModules.slice(0, 3).map((tool, index) => (
            <motion.div
              key={tool.title}
              initial={reduceMotion ? false : { opacity: 0, x: -30 }}
              animate={isInView ? { opacity: 1, x: 0 } : undefined}
              transition={{ duration: 0.5, delay: 0.2 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              <CommandTile tool={tool} delay={0} />
            </motion.div>
          ))}
        </div>

        {/* Center — animated process card */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
          animate={isInView ? { opacity: 1, scale: 1 } : undefined}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative mx-auto max-w-md rounded-[28px] border border-blue-400/25 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.20),transparent_62%)] p-5">
            {/* Orbital rings */}
            <motion.div
              className="absolute inset-6 rounded-full border border-blue-400/15"
              animate={isInView ? { rotate: 360 } : { rotate: 0 }}
              transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
            />
            <motion.div
              className="absolute inset-12 rounded-full border border-cyan-400/15"
              animate={isInView ? { rotate: -360 } : { rotate: 0 }}
              transition={{ duration: 34, repeat: Infinity, ease: 'linear' }}
            />

            <div className="relative z-10 flex min-h-[340px] flex-col rounded-[24px] border border-blue-400/35 bg-[var(--card-bg)] p-5 shadow-[0_20px_80px_rgba(37,99,235,0.12)]">
              {/* Header with score ring */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Career readiness</p>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={currentPhase}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2 }}
                      className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]"
                    >
                      {currentPhase !== 'idle' && currentPhase !== 'complete' && (
                        <motion.span
                          className="inline-block h-3 w-3 rounded-full border-[1.5px] border-t-blue-400 border-r-transparent border-b-transparent border-l-transparent"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                        />
                      )}
                      {currentPhase === 'idle' && 'Starting analysis...'}
                      {currentPhase !== 'idle' && (phases.find(p => p.id === currentPhase)?.label ?? '')}
                    </motion.p>
                  </AnimatePresence>
                </div>

                {/* Score ring */}
                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                  <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                    <circle cx="50" cy="50" r="42" stroke="var(--border-subtle)" strokeWidth="8" fill="none" />
                    <circle
                      cx="50" cy="50" r="42"
                      stroke={scoreColor}
                      strokeWidth="8"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - displayScore / 100)}
                      style={{ transition: 'stroke-dashoffset 0.08s linear, stroke 0.4s ease' }}
                    />
                  </svg>
                  <div className="text-center">
                    <p className="text-2xl font-semibold tabular-nums" style={{ color: scoreColor }}>{displayScore}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {currentPhase === 'complete' ? 'ready' : 'scanning'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Phase progress bar */}
              <div className="mt-4 flex items-center gap-1">
                {phases.map((p, i) => (
                  <div key={p.id} className="flex-1">
                    <div className="h-1 overflow-hidden rounded-full bg-[var(--border-subtle)]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: i <= phaseIdx ? scoreColor : 'transparent' }}
                        initial={{ width: '0%' }}
                        animate={{ width: i < phaseIdx ? '100%' : i === phaseIdx ? '60%' : '0%' }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[8px] text-[var(--text-muted)]">
                <span>Resume</span>
                <span>Writing</span>
                <span>Fit</span>
                <span>Ready</span>
              </div>

              {/* Status items — appear as phases complete */}
              <div className="mt-auto min-h-[130px] space-y-2 pt-4">
                <AnimatePresence>
                  {statusResults.map((item, index) =>
                    visibleStatuses.includes(index) ? (
                      <motion.div
                        key={item.text}
                        initial={{ opacity: 0, height: 0, y: 8 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        className="flex items-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs text-[var(--text-secondary)]"
                      >
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 12, delay: 0.1 }}
                        >
                          <Icon
                            name={item.icon}
                            className={`text-[16px] ${item.icon === 'warning' ? 'icon-status-warning' : 'icon-status-success'}`}
                          />
                        </motion.div>
                        {item.text}
                      </motion.div>
                    ) : null
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right tiles — slide from right */}
        <div className="space-y-4">
          {commandModules.slice(3).map((tool, index) => (
            <motion.div
              key={tool.title}
              initial={reduceMotion ? false : { opacity: 0, x: 30 }}
              animate={isInView ? { opacity: 1, x: 0 } : undefined}
              transition={{ duration: 0.5, delay: 0.3 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              <CommandTile tool={tool} delay={0} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CommandTile({
  tool,
  delay,
}: {
  tool: { title: string; icon: string; text: string; accent: string; href: string };
  delay: number;
}) {
  return (
    <Reveal delay={delay}>
      <Link href={tool.href} className="block rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 transition hover:border-[var(--border)]">
        <div className="flex items-start gap-3">
          <span className="icon-shell-neutral flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border">
            <Icon name={tool.icon} className="text-[21px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--text-primary)]">{tool.title}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{tool.text}</span>
          </span>
        </div>
      </Link>
    </Reveal>
  );
}

function DailyUseCases() {
  return (
    <section>
      <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">Why people come back</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Career work happens in small daily moves.
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
          Retention comes from the job seeker returning with the next draft, next role, next follow-up, and next interview.
        </p>
      </Reveal>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {dailyCareerUseCases.map((item, index) => (
          <Reveal key={item.title} delay={index * 0.04}>
            <div className="min-h-[156px] rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
              <Icon name={item.icon} className="icon-neutral text-[26px]" />
              <h3 className="mt-4 text-base font-semibold text-[var(--text-primary)]">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function SonaSection({ onShowSignup }: { onShowSignup: () => void }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-60px' });
  const reduceMotion = useReducedMotion();
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const [msgIdx, setMsgIdx] = useState(0);
  const [chatPhase, setChatPhase] = useState<'idle' | 'typing_indicator' | 'typing'>('idle');
  const [charIdx, setCharIdx] = useState(0);

  // Which memory dots are lit (synced to message pairs: 0-1 → dot 0, 2-3 → dot 1, etc.)
  const litDots = Math.min(Math.floor(msgIdx / 2), sonaMemoryTimeline.length);

  useEffect(() => {
    if (!isInView) return;
    if (reduceMotion) {
      setMsgIdx(sonaChatMessages.length);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    const msg = sonaChatMessages[msgIdx];
    if (!msg) {
      // Cycle complete — hold 4s, then restart
      timer = setTimeout(() => {
        setMsgIdx(0);
        setChatPhase('idle');
        setCharIdx(0);
      }, 4000);
      return () => clearTimeout(timer);
    }

    if (chatPhase === 'idle') {
      timer = setTimeout(() => {
        if (msg.role === 'assistant') {
          setChatPhase('typing_indicator');
        } else {
          setChatPhase('typing');
          setCharIdx(0);
        }
      }, msgIdx === 0 ? 1200 : 500);
    } else if (chatPhase === 'typing_indicator') {
      timer = setTimeout(() => {
        setChatPhase('typing');
        setCharIdx(0);
      }, 1200);
    } else if (chatPhase === 'typing') {
      if (charIdx < msg.text.length) {
        const speed = msg.role === 'assistant' ? 14 : 28;
        timer = setTimeout(() => setCharIdx(c => c + 1), speed);
      } else {
        timer = setTimeout(() => {
          setMsgIdx(prev => prev + 1);
          setChatPhase('idle');
        }, 700);
      }
    }

    return () => clearTimeout(timer);
  }, [isInView, reduceMotion, msgIdx, chatPhase, charIdx]);

  // Auto-scroll chat container
  useEffect(() => {
    chatContainerRef.current?.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgIdx, charIdx]);

  return (
    <section
      ref={sectionRef}
      className="grid gap-4 rounded-[28px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 lg:grid-cols-[0.85fr_1.15fr] lg:p-6"
    >
      {/* Left — heading + memory timeline */}
      <Reveal>
        <div className="flex h-full flex-col">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Sona career agent</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Your AI career agent for the work between applications.
          </h2>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
            Sona remembers your goals, carries context forward, and surfaces the next move — so nothing falls through the cracks.
          </p>

          {/* Memory Timeline */}
          <div className="mt-6 flex-1">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Context memory</p>
            <div className="space-y-0">
              {sonaMemoryTimeline.map((item, i) => {
                const isLit = i < litDots;
                const isPulsing = i === litDots - 1 && msgIdx < sonaChatMessages.length;
                return (
                  <div key={item.label} className="flex items-stretch gap-3">
                    {/* Vertical line + dot */}
                    <div className="flex flex-col items-center">
                      <motion.div
                        className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-500 ${isLit
                            ? 'border-blue-400/40 bg-blue-500/15'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-hover)]'
                          }`}
                        animate={isPulsing ? { boxShadow: ['0 0 0 0 rgba(37,99,235,0)', '0 0 0 6px rgba(37,99,235,0.15)', '0 0 0 0 rgba(37,99,235,0)'] } : {}}
                        transition={isPulsing ? { duration: 1.5, repeat: Infinity } : {}}
                      >
                        <Icon
                          name={item.icon}
                          className="icon-neutral text-[14px] transition-colors duration-500"
                        />
                      </motion.div>
                      {i < sonaMemoryTimeline.length - 1 && (
                        <div className={`h-5 w-px transition-colors duration-500 ${isLit ? 'bg-blue-400/30' : 'bg-[var(--border-subtle)]'}`} />
                      )}
                    </div>
                    {/* Label + time */}
                    <div className="flex min-h-[44px] items-center">
                      <div>
                        <p className={`text-xs font-medium transition-colors duration-500 ${isLit ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                          {item.label}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)]">{item.time}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={onShowSignup}
            className="mt-6 inline-flex min-h-11 items-center gap-2 self-start rounded-[14px] border border-cyan-400/35 bg-cyan-500/10 px-5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/15"
          >
            <Icon name="auto_awesome" className="text-[18px]" />
            Save my career workspace
          </button>
        </div>
      </Reveal>

      {/* Right — Live chat simulation */}
      <Reveal delay={0.08}>
        <div className="overflow-hidden rounded-[22px] border border-cyan-400/20 bg-[var(--card-bg)]">
          {/* Chat header */}
          <div className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-sky-600">
              <span className="text-[11px] font-bold text-white">S</span>
            </div>
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">Sona</span>
            <span className="rounded-full border border-blue-400/25 bg-blue-500/10 px-2 py-0.5 text-[9px] font-semibold text-blue-300">
              AI Agent
            </span>
            <motion.div
              className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </div>

          {/* Chat messages */}
          <div ref={chatContainerRef} className="min-h-[300px] space-y-3 overflow-y-auto p-4" style={{ maxHeight: 340 }}>
            {/* Fully typed previous messages */}
            {sonaChatMessages.slice(0, msgIdx).map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 0.8, y: 0 }}
                transition={{ duration: 0.25 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-[14px] p-3 text-[12px] leading-relaxed ${msg.role === 'user'
                      ? 'border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                      : 'border border-blue-400/15 bg-blue-500/[0.06] text-[var(--text-secondary)]'
                    }`}
                >
                  {msg.text}
                </div>
              </motion.div>
            ))}

            {/* Typing indicator (bouncing dots) */}
            {msgIdx < sonaChatMessages.length && chatPhase === 'typing_indicator' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                <div className="flex gap-1.5 rounded-[14px] border border-blue-400/15 bg-blue-500/[0.06] px-4 py-3">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-blue-400/50"
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                      transition={{ duration: 0.8, delay: i * 0.15, repeat: Infinity }}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Currently typing message */}
            {msgIdx < sonaChatMessages.length && chatPhase === 'typing' && (
              <motion.div
                key={`typing-${msgIdx}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${sonaChatMessages[msgIdx].role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-[14px] p-3 text-[12px] leading-relaxed ${sonaChatMessages[msgIdx].role === 'user'
                      ? 'border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                      : 'border border-blue-400/15 bg-blue-500/[0.06] text-[var(--text-secondary)]'
                    }`}
                >
                  {sonaChatMessages[msgIdx].text.substring(0, charIdx)}
                  <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse rounded-full bg-blue-400/60 align-middle" />
                </div>
              </motion.div>
            )}

            {/* Cycle complete indicator */}
            {msgIdx >= sonaChatMessages.length && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-center pt-2"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/20 bg-blue-500/[0.06] px-3 py-1 text-[10px] font-medium text-blue-300">
                  <Icon name="check_circle" className="icon-status-success text-[12px]" />
                  Sona session complete — restarting
                </span>
              </motion.div>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function BeforeAfterSection() {
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState<'before' | 'highlight' | 'after'>('before');
  const reduceMotion = useReducedMotion();
  const cycleDuration = 4500;

  useEffect(() => {
    if (reduceMotion) { setPhase('after'); return; }

    setPhase('before');
    const t1 = setTimeout(() => setPhase('highlight'), 600);
    const t2 = setTimeout(() => setPhase('after'), 1400);
    const t3 = setTimeout(() => {
      setActive(prev => (prev + 1) % beforeAfterExamples.length);
    }, cycleDuration);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [active, reduceMotion]);

  const ex = beforeAfterExamples[active];

  const renderBefore = () => {
    if (phase !== 'highlight') return ex.before;
    let result = ex.before;
    for (const weak of ex.weakWords) {
      const idx = result.toLowerCase().indexOf(weak.toLowerCase());
      if (idx !== -1) {
        const original = result.slice(idx, idx + weak.length);
        result = result.slice(0, idx) + `<span class="ba-weak">${original}</span>` + result.slice(idx + weak.length);
      }
    }
    return result;
  };

  return (
    <section>
      <Reveal className="mb-4 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Before and after</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          Specific proof beats generic career language.
        </h2>
        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
          The examples show what changes: sharper evidence, less template language, and a clearer relationship to the role.
        </p>
      </Reveal>

      <Reveal delay={0.06}>
        <div className="overflow-hidden rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          {/* Tab row */}
          <div className="flex flex-wrap gap-1.5 border-b border-[var(--border-subtle)] px-4 py-3">
            {beforeAfterExamples.map((ex, i) => {
              const isActive = active === i;
              return (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${isActive
                      ? 'border border-blue-400/25 bg-blue-500/10 text-blue-300'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                >
                  {ex.label}
                  {/* Progress bar */}
                  {isActive && !reduceMotion && (
                    <motion.div
                      className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-gradient-to-r from-blue-500 to-sky-500"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: cycleDuration / 1000, ease: 'linear' }}
                      key={`progress-${active}`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="min-h-[260px] p-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                {/* Inline before → after */}
                <div className="space-y-3">
                  {/* Before block */}
                  <div className="rounded-xl border border-rose-400/10 bg-rose-500/[0.03] p-4">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-300">Before</span>
                    </div>
                    <p
                      className={`text-[13px] leading-relaxed text-[var(--text-secondary)] ${phase === 'after' ? 'line-through opacity-40' : ''}`}
                      style={{ transition: 'opacity 0.4s ease, text-decoration 0.3s ease' }}
                      dangerouslySetInnerHTML={{ __html: renderBefore() }}
                    />
                  </div>

                  {/* After block — fades in */}
                  <motion.div
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={phase === 'after' || reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-xl border border-blue-400/10 bg-blue-500/[0.03] p-4"
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300">After</span>
                      </div>
                      {phase === 'after' && (
                        <motion.span
                          initial={reduceMotion ? false : { scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                          className="rounded-full border border-blue-400/20 bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-blue-300"
                        >
                          {ex.metric}
                        </motion.span>
                      )}
                    </div>
                    <p className="text-[13px] leading-relaxed text-[var(--text-primary)]">
                      {ex.after.split(/(\d+%?)/g).map((seg, i) =>
                        /\d/.test(seg) ? (
                          <span key={i} className={phase === 'after' ? 'ba-evidence font-semibold' : 'font-semibold'}>{seg}</span>
                        ) : (
                          <span key={i}>{seg}</span>
                        )
                      )}
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function ResponsibleAISection() {
  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_1fr] lg:items-stretch">
      <Reveal>
        <div className="h-full rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Responsible AI career writing</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            Better career communication, not fake credentials.
          </h2>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
            Talent Studio should help users express real experience clearly. Scores are editing signals, not guarantees about detectors, interviews, or hiring outcomes.
          </p>
        </div>
      </Reveal>
      <Reveal delay={0.08}>
        <div className="grid h-full gap-3">
          {[
            ['Preserve facts', 'Names, numbers, dates, employers, claims, and achievements stay protected.'],
            ['Improve evidence', 'The workflow favors proof, role fit, and specific outcomes over polished vagueness.'],
            ['Review before sending', 'Users are prompted to read and own the final draft before using it.'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
              <div className="flex gap-3">
                <Icon name="verified_user" className="icon-neutral mt-0.5 text-[22px]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function PricingPreview({ onShowSignup }: { onShowSignup: () => void }) {
  return (
    <section id="pricing-section">
      <Reveal className="mb-4 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">Free to start</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          Start with a check. Stay for the workspace.
        </h2>
      </Reveal>
      <div className="grid gap-4 md:grid-cols-3">
        {pricingTeasers.map((plan, index) => (
          <Reveal key={plan.name} delay={index * 0.05}>
            <SpotlightCard
              className={`h-full rounded-[22px] border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${plan.name === 'Pro'
                  ? 'border-blue-400/35 bg-blue-500/10 hover:shadow-blue-500/10'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-blue-400/15 hover:shadow-blue-500/5'
                }`}
              style={plan.name === 'Pro' ? { animation: 'pricing-glow 3s ease-in-out infinite' } : undefined}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">{plan.name}</h3>
                <div className="flex items-center gap-2">
                  {plan.name === 'Pro' && (
                    <span className="rounded-full bg-blue-300 px-2 py-0.5 text-[9px] font-bold text-blue-950">Most popular</span>
                  )}
                  <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">{plan.label}</span>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{plan.text}</p>
              <button
                type="button"
                onClick={onShowSignup}
                className={`mt-5 rounded-[13px] px-4 py-2 text-xs font-semibold transition ${plan.name === 'Pro'
                    ? 'cta-shimmer bg-blue-300 text-blue-950 hover:bg-blue-200'
                    : 'border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text-primary)]'
                  }`}
              >
                {plan.name === 'Free' ? 'Start free' : 'Start free first'}
              </button>
            </SpotlightCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function FAQSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const reduceMotion = useReducedMotion();
  const [activeIdx, setActiveIdx] = useState(0);
  const [userInteracted, setUserInteracted] = useState(false);

  // Auto-advance if user hasn't clicked
  useEffect(() => {
    if (userInteracted || !isInView) return;
    const timer = setTimeout(() => {
      setActiveIdx(prev => (prev + 1) % faqItems.length);
    }, 5000);
    return () => clearTimeout(timer);
  }, [activeIdx, userInteracted, isInView]);

  const handleSelect = (i: number) => {
    setActiveIdx(i);
    setUserInteracted(true);
  };

  return (
    <section ref={ref}>
      <Reveal className="mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">FAQ</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
          Questions people ask before trusting a career platform.
        </h2>
      </Reveal>

      <Reveal delay={0.06}>
        <div className="overflow-hidden rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div className="grid lg:grid-cols-[1fr_1.2fr]">
            {/* Left — question list */}
            <div className="relative border-b border-[var(--border-subtle)] p-2 lg:border-b-0 lg:border-r">
              {faqItems.map((item, i) => {
                const isActive = activeIdx === i;
                return (
                  <motion.button
                    key={item.q}
                    type="button"
                    onClick={() => handleSelect(i)}
                    initial={reduceMotion ? false : { opacity: 0, x: -20 }}
                    animate={isInView ? { opacity: 1, x: 0 } : undefined}
                    transition={{ duration: 0.35, delay: i * 0.06 }}
                    className={`relative z-10 flex w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left text-[13px] font-medium transition-colors ${isActive
                        ? 'text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all ${isActive
                          ? 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/30'
                          : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'
                        }`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 truncate">{item.q}</span>
                  </motion.button>
                );
              })}

              {/* Sliding active backdrop */}
              <motion.div
                className="absolute left-2 right-2 z-0 rounded-[14px] border border-blue-400/15 bg-blue-500/[0.04]"
                animate={{ top: 8 + activeIdx * 48, height: 48 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                style={{ pointerEvents: 'none' }}
              />
            </div>

            {/* Right — answer panel */}
            <div className="flex min-h-[296px] flex-col justify-between p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeIdx}
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-1 flex-col"
                >
                  {/* Icon + question */}
                  <div className="mb-4 flex items-start gap-3">
                    <motion.div
                      initial={reduceMotion ? false : { scale: 0, rotate: -90 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
                      className="icon-shell-neutral flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border"
                    >
                      <Icon name={faqItems[activeIdx].icon} className="text-[20px]" />
                    </motion.div>
                    <p className="text-sm font-semibold leading-5 text-[var(--text-primary)]">
                      {faqItems[activeIdx].q}
                    </p>
                  </div>

                  {/* Answer */}
                  <p className="text-sm leading-7 text-[var(--text-secondary)]">
                    {faqItems[activeIdx].a}
                  </p>

                  {/* Tip callout */}
                  <motion.div
                    initial={reduceMotion ? false : { opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                    className="mt-4 flex items-start gap-2.5 rounded-[14px] border border-cyan-400/15 bg-cyan-500/[0.04] p-3"
                  >
                    <Icon name="lightbulb" className="icon-neutral mt-0.5 text-[16px]" />
                    <p className="text-xs leading-5 text-[var(--text-secondary)]">{faqItems[activeIdx].tip}</p>
                  </motion.div>

                  {/* Related tool badge + dots row */}
                  <div className="mt-auto flex items-center justify-between pt-5">
                    <motion.span
                      initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.15, type: 'spring', stiffness: 350, damping: 18 }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold text-blue-300"
                    >
                      <Icon name={faqItems[activeIdx].icon} className="icon-neutral text-[12px]" />
                      {faqItems[activeIdx].relatedTool}
                    </motion.span>

                    {/* Progress dots */}
                    <div className="flex items-center gap-1.5">
                      {faqItems.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleSelect(i)}
                          className={`h-1.5 rounded-full transition-all ${i === activeIdx ? 'w-5 bg-blue-400' : 'w-1.5 bg-[var(--border-subtle)] hover:bg-[var(--text-muted)]'
                            }`}
                          aria-label={`FAQ ${i + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export default function LandingPage({ onGetStarted, onShowLogin, onShowSignup, isAuthenticated }: LandingPageProps) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();


  const focusCareerCheck = () => {
    document.getElementById('career-check')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => document.getElementById('career-check-input')?.focus(), 350);
  };

  const exploreCareerTools = () => {
    document.getElementById('career-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  return (
    <div className="mobile-app-page relative min-h-dvh overflow-hidden bg-[var(--bg-deep)] text-[var(--text-primary)]">
      {/* Scroll progress indicator */}
      <motion.div
        className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-gradient-to-r from-blue-400 to-sky-400"
        style={{ scaleX: smoothProgress }}
      />
      <div className="pointer-events-none absolute inset-0 z-0">
        <AnimatedShimmerBackground />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--border-subtle) 1px, transparent 1px), linear-gradient(to bottom, var(--border-subtle) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      </div>


      <main className="relative z-10">
        {/* Header */}
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 pt-4 sm:px-6">
          <Link href="/" aria-label="TalentConsulting.io home" className="inline-flex min-w-0 items-center">
            <TalentConsultingWordmark className="w-[min(320px,56vw)]" />
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle size="sm" />
            <button
              type="button"
              onClick={onShowLogin}
              className="rounded-full px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={onShowSignup}
              className="cta-shimmer rounded-full border border-blue-400/25 bg-blue-500/10 px-5 py-2.5 text-sm font-black text-black transition hover:bg-blue-500/15 dark:text-blue-200"
            >
              Get started
            </button>
          </div>
        </div>

        <section className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 px-4 pb-10 pt-4 sm:px-6 lg:grid-cols-[0.84fr_1.16fr] lg:items-center lg:pb-10 lg:pt-6">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0 max-w-2xl"
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-200">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-300" />
              Free career checks, writing polish, job search workflows, and Sona
            </div>
            <h1 className="wrap-natural text-[32px] font-semibold leading-[1.06] tracking-tight text-[var(--text-primary)] sm:text-5xl lg:text-6xl">
              Build your next career move in one AI-powered workspace.
            </h1>
            <p className="wrap-natural mt-3 max-w-full text-base leading-7 text-[var(--text-secondary)] sm:max-w-xl sm:text-lg">
              Polish your resume, tailor every application, humanize career writing, track opportunities, and prepare for interviews with a platform built for modern job seekers.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={focusCareerCheck}
                className="cta-shimmer inline-flex min-h-12 items-center justify-center gap-2 rounded-[15px] bg-blue-300 px-5 text-sm font-bold text-blue-950 transition hover:scale-[1.02] hover:bg-blue-200 active:scale-[0.97]"
              >
                <Icon name="track_changes" className="text-[19px]" />
                Start free career check
              </button>
              <button
                type="button"
                onClick={exploreCareerTools}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)]"
              >
                <Icon name="widgets" className="text-[19px]" />
                Explore career tools
              </button>
            </div>

            <div className="mt-5 hidden grid-cols-2 gap-3 lg:grid lg:grid-cols-4">
              {heroProofPoints.map((item) => (
                <div key={item.label} className="rounded-[15px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                  <p className="text-xl font-semibold tabular-nums text-[var(--text-primary)]">{item.value}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="hidden lg:block">
              <WorkflowAnimation />
            </div>
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.75, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0"
          >
            <CareerCheckWorkbench onShowSignup={onShowSignup} />
          </motion.div>
        </section>

        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <ToolsMarquee />
          </Reveal>
        </div>

        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 pb-12 sm:px-6 lg:gap-10">
          <FreeCareerChecks onShowSignup={onShowSignup} />
          <div className="section-divider mx-auto w-4/5" />
          <CareerJourneySection />
          <div className="section-divider mx-auto w-4/5" />
          <CommandCenterSection />
          <div className="section-divider mx-auto w-3/5" />
          <SonaSection onShowSignup={onShowSignup} />
          <div className="section-divider mx-auto w-4/5" />
          <BeforeAfterSection />
          <div className="section-divider mx-auto w-3/5" />
          <PricingPreview onShowSignup={onShowSignup} />
          <div className="section-divider mx-auto w-2/5" />
          <FAQSection />
        </div>
      </main>

      <footer className="relative z-10 bg-[var(--bg-surface)]">
        {/* Gradient top border */}
        <div className="h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          {/* Top row: Logo + Link columns */}
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5">
                <TalentConsultingWordmark className="w-44" />
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
                AI career workspace for resumes, applications, interviews, and Sona.
              </p>
            </div>
            {/* Product */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Product</p>
              <div className="mt-3 flex flex-col gap-2">
                <button type="button" onClick={focusCareerCheck} className="text-left text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">Career Check</button>
                <button type="button" onClick={exploreCareerTools} className="text-left text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">Career Tools</button>
                <button type="button" onClick={onShowSignup} className="text-left text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">Sona Agent</button>
              </div>
            </div>
            {/* Company */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Company</p>
              <div className="mt-3 flex flex-col gap-2">
                <button type="button" onClick={onShowSignup} className="text-left text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">Pricing</button>
                <button type="button" onClick={onShowLogin} className="text-left text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">Sign in</button>
              </div>
            </div>
            {/* Legal */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Legal</p>
              <div className="mt-3 flex flex-col gap-2">
                <Link href="/privacy" className="text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">Privacy policy</Link>
                <Link href="/terms" className="text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">Terms of service</Link>
              </div>
            </div>
          </div>
          {/* Bottom row */}
          <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-6 sm:flex-row">
            <p className="text-[11px] text-[var(--text-muted)]">&copy; {new Date().getFullYear()} TalentConsulting.io. All rights reserved.</p>
            <p className="text-[10px] text-[var(--text-muted)]">Built with AI, for humans who want better careers.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
