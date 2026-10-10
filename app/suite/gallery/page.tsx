'use client';

import { useToolGuidance } from '@/components/guidance/ToolGuidanceProvider';
import { buildToolStory, storyStep } from '@/lib/tool-story-adapters';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { showToast } from '@/components/Toast';
import { runWordCounter } from '@/lib/gallery-contracts';
import { authFetch } from '@/lib/auth-fetch';
import { useAuthGate } from '@/hooks/useAuthGate';
import { useUserTier } from '@/hooks/use-user-tier';
import AnimatedToolIcon from '@/components/AnimatedToolIcon';
import { SuiteToolHeader, SuiteToolShell } from '@/components/suite/SuiteToolChrome';

// ── Tool Registry ──
interface GalleryTool {
  id: string;
  label: string;
  description: string;
  lane: 'Polish' | 'Communicate' | 'Research';
  output: string;
  icon: string;
  color: string;
  tier: 'free' | 'pro';
  placeholder: string;
}

interface CareerWritingTool {
  id: string;
  label: string;
  description: string;
  path: string;
  output: string;
  icon: string;
  color: string;
  badge?: string;
}

const CAREER_WRITING_TOOLS: CareerWritingTool[] = [
  {
    id: 'cover-letter',
    label: 'Cover Letter',
    description: 'Generate a tailored letter from your resume, target role, and job context.',
    path: '/suite/cover-letter',
    output: 'Role-specific letter',
    icon: 'edit_document',
    color: 'var(--accent)',
    badge: 'STANDARD',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Profile',
    description: 'Rewrite your headline, about section, and experience for the roles you want.',
    path: '/suite/linkedin',
    output: 'Profile-ready copy',
    icon: 'badge',
    color: 'var(--accent)',
    badge: 'STANDARD',
  },
  {
    id: 'ai-humanizer',
    label: 'AI Humanizer',
    description: 'Make AI-assisted writing sound credible, clear, and genuinely yours.',
    path: '/suite/writing-tools',
    output: 'Humanized draft + checks',
    icon: 'ink_pen',
    color: 'var(--accent)',
    badge: 'STANDARD',
  },
];

const TOOLS: GalleryTool[] = [
  {
    id: 'grammar-checker',
    label: 'Grammar Checker',
    description: 'Fix grammar, punctuation, and style issues instantly.',
    lane: 'Polish',
    output: 'Corrected draft + issue list',
    icon: 'spellcheck',
    color: 'var(--accent)',
    tier: 'free',
    placeholder: 'Paste your text to check for grammar and style issues...',
  },
  {
    id: 'word-counter',
    label: 'Word Counter',
    description: 'Get detailed text statistics: words, sentences, reading time.',
    lane: 'Polish',
    output: 'Stats, timing, top words',
    icon: 'calculate',
    color: 'var(--accent)',
    tier: 'free',
    placeholder: 'Paste text to get word count, reading time, and more...',
  },
  {
    id: 'citation-machine',
    label: 'Citation Machine',
    description: 'Format supplied source metadata. References are unverified.',
    lane: 'Research',
    output: 'References + in-text citations',
    icon: 'format_quote',
    color: 'var(--accent)',
    tier: 'free',
    placeholder: 'Enter source info: Author, Title, Year, Publisher, URL...',
  },
  {
    id: 'summarizer',
    label: 'Summarizer',
    description: 'Condense long text into key points and bullet summaries.',
    lane: 'Research',
    output: 'Brief, detailed, bullets',
    icon: 'compress',
    color: 'var(--accent)',
    tier: 'free',
    placeholder: 'Paste the article or text you want summarized...',
  },
  {
    id: 'tone-analyzer',
    label: 'Tone Analyzer',
    description: 'Analyze the emotional tone, formality, and sentiment.',
    lane: 'Polish',
    output: 'Tone, formality, suggestions',
    icon: 'sentiment_satisfied',
    color: 'var(--accent)',
    tier: 'free',
    placeholder: 'Paste text to analyze its tone and sentiment...',
  },
  {
    id: 'paraphraser',
    label: 'Paraphraser',
    description: 'Rewrite text in 3 styles: formal, casual, and concise.',
    lane: 'Polish',
    output: 'Style variations',
    icon: 'swap_horiz',
    color: 'var(--accent)',
    tier: 'pro',
    placeholder: 'Paste the text you want paraphrased...',
  },
  {
    id: 'email-composer',
    label: 'Email Composer',
    description: 'Draft polished professional emails from rough notes.',
    lane: 'Communicate',
    output: 'Subject + email body',
    icon: 'mail',
    color: 'var(--accent)',
    tier: 'pro',
    placeholder: 'Describe the email: recipient, purpose, key points...',
  },
  {
    id: 'thesis-generator',
    label: 'Thesis Generator',
    description: 'Generate strong, arguable thesis statements for essays.',
    lane: 'Research',
    output: 'Thesis options + outline hints',
    icon: 'school',
    color: 'var(--accent)',
    tier: 'pro',
    placeholder: 'Enter your essay topic and position...',
  },
];

const LANES: { label: GalleryTool['lane']; icon: string; description: string }[] = [
  { label: 'Polish', icon: 'auto_fix_high', description: 'Clean up, measure, and reshape text without losing intent.' },
  { label: 'Communicate', icon: 'outgoing_mail', description: 'Turn rough notes into recruiter-ready communication.' },
  { label: 'Research', icon: 'library_books', description: 'Summarize sources, cite properly, and shape arguments.' },
];

// ── Tool-Specific Result Renderers ──
function ToolResult({ toolId, result, color }: { toolId: string; result: any; color: string }) {
  // Word Counter — stats dashboard
  if (toolId === 'word-counter') {
    const stats = [
      { label: 'Words', value: result.words, icon: 'text_fields' },
      { label: 'Characters', value: result.characters, icon: 'abc' },
      { label: 'No Spaces', value: result.charactersNoSpaces, icon: 'space_bar' },
      { label: 'Sentences', value: result.sentences, icon: 'short_text' },
      { label: 'Paragraphs', value: result.paragraphs, icon: 'view_headline' },
      { label: 'Words/Sentence', value: result.avgWordsPerSentence, icon: 'functions' },
    ];
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {stats.map(s => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <span className="material-symbols-rounded text-lg block mb-1" style={{ color }}>{s.icon}</span>
              <p className="text-xl font-black text-[var(--text-primary)] tabular-nums">{s.value}</p>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <div className="flex-1 rounded-xl p-3 flex items-center gap-3" style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-subtle)' }}>
            <span className="material-symbols-rounded text-lg" style={{ color }}>schedule</span>
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">{result.readingTimeMinutes} min</p>
              <p className="text-[11px] text-[var(--text-tertiary)]">Reading time</p>
            </div>
          </div>
          <div className="flex-1 rounded-xl p-3 flex items-center gap-3" style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-subtle)' }}>
            <span className="material-symbols-rounded text-lg" style={{ color }}>mic</span>
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">{result.speakingTimeMinutes} min</p>
              <p className="text-[11px] text-[var(--text-tertiary)]">Speaking time</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Grammar Checker — corrections list
  if (toolId === 'grammar-checker') {
    const corrections = result.corrections || result.issues || [];
    const correctedText = result.correctedText || result.corrected || result.text || '';
    return (
      <div className="space-y-4">
        {correctedText && (
          <div className="p-4 rounded-xl text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            {correctedText}
          </div>
        )}
        {Array.isArray(corrections) && corrections.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Corrections Found</p>
            {corrections.map((c: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <span className="material-symbols-rounded text-sm mt-0.5 shrink-0" style={{ color }}>edit</span>
                <div className="flex-1 min-w-0">
                  {c.original && <span className="text-xs text-[var(--danger)] line-through mr-2">{c.original}</span>}
                  {(c.corrected || c.suggestion) && <span className="text-xs text-[var(--success)] font-medium">{c.corrected || c.suggestion}</span>}
                  {(c.explanation || c.reason) && <p className="text-[11px] text-[var(--text-tertiary)] mt-1">{c.explanation || c.reason}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
        {!correctedText && (!Array.isArray(corrections) || corrections.length === 0) && <GenericResult result={result} />}
      </div>
    );
  }

  // Citation Machine — formatted cards
  if (toolId === 'citation-machine') {
    const citationsRaw = result.citations || [];
    const citations = Array.isArray(citationsRaw)
      ? citationsRaw
      : Object.entries(citationsRaw).map(([format, formatted]) => ({ format, formatted }));
    const inTextRaw = result.inText || {};
    const inText = Object.entries(inTextRaw).map(([format, formatted]) => ({ format, formatted }));
    if (Array.isArray(citations) && citations.length > 0) {
      return (
        <div className="space-y-3">
          {citations.map((c: any, i: number) => (
            <div key={i} className="p-4 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider" style={{ background: 'var(--accent-dim)', color }}>{c.format || c.style || 'Citation'}</span>
                <button onClick={() => { navigator.clipboard.writeText(c.formatted || c.citation || ''); showToast('Copied!', 'content_copy'); }}
                  className="text-[11px] flex min-h-11 min-w-11 items-center justify-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                  <span className="material-symbols-rounded text-xs">content_copy</span>
                </button>
              </div>
              <p className="text-sm text-[var(--text-primary)] leading-relaxed">{c.formatted || c.citation || JSON.stringify(c)}</p>
            </div>
          ))}
          {inText.length > 0 && (
            <div className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">In-text citations</p>
              <div className="flex flex-wrap gap-2">
                {inText.map((c: any) => (
                  <span key={c.format} className="rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                    <span className="font-semibold uppercase text-[var(--text-primary)]">{c.format}</span>: {String(c.formatted)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    return <GenericResult result={result} />;
  }

  // Summarizer — bullet points
  if (toolId === 'summarizer') {
    const summary = result.summary || result.brief || result.detailed || result.oneLiner || result.text || '';
    const keyPoints = result.keyPoints || result.bullets || result.bulletPoints || result.points || [];
    return (
      <div className="space-y-4">
        {result.oneLiner && (
          <div className="rounded-xl p-3 text-sm font-semibold text-[var(--text-primary)]" style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-subtle)' }}>
            {result.oneLiner}
          </div>
        )}
        {summary && (
          <div className="p-4 rounded-xl text-sm leading-relaxed text-[var(--text-primary)]" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            {summary}
          </div>
        )}
        {Array.isArray(keyPoints) && keyPoints.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Key Points</p>
            <div className="space-y-1.5">
              {keyPoints.map((p: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="material-symbols-rounded text-sm mt-0.5 shrink-0" style={{ color }}>arrow_right</span>
                  {typeof p === 'string' ? p : JSON.stringify(p)}
                </div>
              ))}
            </div>
          </div>
        )}
        {!summary && (!Array.isArray(keyPoints) || keyPoints.length === 0) && <GenericResult result={result} />}
      </div>
    );
  }

  // Tone Analyzer — visual bars
  if (toolId === 'tone-analyzer') {
    const tones = result.tones || result.emotions || result.secondaryTones || [];
    const formality = result.formality ?? result.formalityScore;
    const sentiment = result.sentiment || result.overallSentiment || '';
    const sentimentKey = String(sentiment).toLowerCase();
    const primaryTone = result.primaryTone || result.tone || '';
    const sentimentColors: Record<string, string> = { positive: 'var(--success)', negative: 'var(--danger)', neutral: 'var(--text-muted)', mixed: 'var(--warning)' };
    return (
      <div className="space-y-4">
        {primaryTone && (
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <span className="material-symbols-rounded text-xl" style={{ color }}>record_voice_over</span>
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)] capitalize">{primaryTone}</p>
              <p className="text-[11px] text-[var(--text-tertiary)]">Primary tone</p>
            </div>
          </div>
        )}
        {sentiment && (
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <span className="material-symbols-rounded text-xl" style={{ color: sentimentColors[sentimentKey] || color }}>
              {sentimentKey === 'positive' ? 'sentiment_satisfied' : sentimentKey === 'negative' ? 'sentiment_dissatisfied' : 'sentiment_neutral'}
            </span>
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)] capitalize">{typeof sentiment === 'number' ? `${sentiment > 0 ? '+' : ''}${sentiment}` : sentiment}</p>
              <p className="text-[11px] text-[var(--text-tertiary)]">Overall sentiment</p>
            </div>
          </div>
        )}
        {formality !== undefined && (
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex justify-between mb-1.5">
              <span className="text-xs font-medium text-[var(--text-secondary)]">Formality</span>
              <span className="text-xs font-bold tabular-nums" style={{ color }}>{typeof formality === 'number' ? `${formality}%` : formality}</span>
            </div>
            {typeof formality === 'number' && (
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${formality}%`, background: 'var(--accent)' }} />
              </div>
            )}
          </div>
        )}
        {Array.isArray(tones) && tones.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Detected Tones</p>
            {tones.map((t: any, i: number) => {
              const name = typeof t === 'string' ? t : t.tone || t.name || '';
              const score = typeof t === 'object' ? (t.score || t.confidence || 0) : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-[var(--text-secondary)] w-24 truncate capitalize">{name}</span>
                  {score > 0 && (
                    <>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(score * 100, 100)}%`, background: color }} />
                      </div>
                      <span className="text-[11px] font-bold tabular-nums text-[var(--text-tertiary)] w-8 text-right">{Math.round(score * 100)}%</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!sentiment && !formality && (!Array.isArray(tones) || tones.length === 0) && <GenericResult result={result} />}
      </div>
    );
  }

  // Paraphraser — side-by-side styles
  if (toolId === 'paraphraser') {
    const styles = result.paraphrased || result.versions || result;
    const variationEntries: [string, string][] = Array.isArray(result.variations)
      ? result.variations.map((v: any) => [v.style || v.tone || 'variation', v.text || v.body || JSON.stringify(v)])
      : [];
    const styleEntries: [string, string][] = variationEntries.length > 0
      ? variationEntries
      : typeof styles === 'object' && !Array.isArray(styles)
      ? Object.entries(styles).filter(([, v]) => typeof v === 'string') as [string, string][]
      : [];
    if (styleEntries.length > 0) {
      const styleIcons: Record<string, string> = { formal: 'business_center', casual: 'chat', concise: 'compress', creative: 'palette' };
      return (
        <div className="space-y-3">
          {styleEntries.map(([style, text]) => (
            <div key={style} className="p-4 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-rounded text-sm" style={{ color }}>{styleIcons[style] || 'swap_horiz'}</span>
                  <span className="text-xs font-bold text-[var(--text-primary)] capitalize">{style}</span>
                </div>
                <button onClick={() => { navigator.clipboard.writeText(text as string); showToast('Copied!', 'content_copy'); }}
                  className="text-[11px] flex min-h-11 min-w-11 items-center justify-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                  <span className="material-symbols-rounded text-xs">content_copy</span>
                </button>
              </div>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{text as string}</p>
            </div>
          ))}
        </div>
      );
    }
    return <GenericResult result={result} />;
  }

  // Email Composer — subject + body
  if (toolId === 'email-composer') {
    const subject = result.subject || result.subjectLine || '';
    const body = result.email || result.body || result.content || '';
    return (
      <div className="space-y-3">
        {subject && (
          <div className="p-3 rounded-xl flex items-center justify-between" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <div>
              <p className="text-[11px] font-bold text-[var(--text-tertiary)] mb-0.5">SUBJECT</p>
              <p className="text-sm text-[var(--text-primary)]">{subject}</p>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(subject); showToast('Copied!', 'content_copy'); }}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all">
              <span className="material-symbols-rounded text-sm">content_copy</span>
            </button>
          </div>
        )}
        {body && (
          <div className="p-4 rounded-xl text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            {body}
          </div>
        )}
        {!subject && !body && <GenericResult result={result} />}
      </div>
    );
  }

  // Thesis Generator — statement + reasoning
  if (toolId === 'thesis-generator') {
    const thesisStatements = result.thesisStatements || [];
    const thesis = result.thesis || result.statement || result.thesisStatement || thesisStatements?.[0]?.statement || '';
    const reasoning = result.reasoning || result.explanation || '';
    const alternatives = result.alternatives || result.variations || thesisStatements.slice(1).map((t: any) => t.statement || t);
    const outlineHints = result.outlineHints || [];
    return (
      <div className="space-y-4">
        {thesis && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Thesis Statement</p>
            <p className="text-base font-medium text-[var(--text-primary)] leading-relaxed italic">"{thesis}"</p>
          </div>
        )}
        {reasoning && (
          <div className="p-3 rounded-xl text-sm text-[var(--text-secondary)] leading-relaxed" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-[11px] font-bold text-[var(--text-tertiary)] mb-1">WHY THIS WORKS</p>
            {reasoning}
          </div>
        )}
        {Array.isArray(alternatives) && alternatives.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Alternatives</p>
            <div className="space-y-2">
              {alternatives.map((alt: string, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl text-sm text-[var(--text-secondary)]" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <span className="text-[11px] font-bold tabular-nums mt-0.5 w-4 shrink-0" style={{ color }}>{i + 1}</span>
                  {typeof alt === 'string' ? alt : JSON.stringify(alt)}
                </div>
              ))}
            </div>
          </div>
        )}
        {Array.isArray(outlineHints) && outlineHints.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Outline Hints</p>
            <div className="space-y-2">
              {outlineHints.map((hint: string, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl text-sm text-[var(--text-secondary)]" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <span className="material-symbols-rounded mt-0.5 text-sm" style={{ color }}>notes</span>
                  {typeof hint === 'string' ? hint : JSON.stringify(hint)}
                </div>
              ))}
            </div>
          </div>
        )}
        {!thesis && !reasoning && <GenericResult result={result} />}
      </div>
    );
  }

  // Fallback — structured display instead of raw JSON
  return <GenericResult result={result} />;
}

// Generic fallback — renders object keys as labeled cards instead of raw JSON
function GenericResult({ result }: { result: any }) {
  if (typeof result === 'string') {
    return (
      <div className="p-4 rounded-xl text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
        {result}
      </div>
    );
  }
  if (typeof result !== 'object' || result === null) {
    return <p className="text-sm text-[var(--text-secondary)]">{String(result)}</p>;
  }
  const entries = Object.entries(result).filter(([, v]) => v !== null && v !== undefined);
  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="p-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
            {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}
          </p>
          {typeof value === 'string' ? (
            <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{value}</p>
          ) : Array.isArray(value) ? (
            <div className="space-y-1">
              {value.map((item, i) => (
                <p key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-1.5">
                  <span className="text-[var(--text-muted)] shrink-0">-</span>
                  {typeof item === 'string' ? item : JSON.stringify(item)}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-primary)] tabular-nums font-medium">{JSON.stringify(value)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──
export default function GalleryPage() {
  const { user } = useStore();
  const { handleApiError, renderAuthModal, setAuthModal, setUsageLimit, revealUsageLimit } = useAuthGate();
  const { tier, loading: tierLoading } = useUserTier();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedTool, setSelectedTool] = useState<GalleryTool | null>(null);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<any>(null);
  const [drafts, setDrafts] = useState<Record<string, { input: string; result: any }>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [storyFailure, setStoryFailure] = useState(false);

  const live = useRef({ owner: user?.uid || 'guest', tool: selectedTool?.id, input });
  const requestRevision = useRef(0);
  if (live.current.owner !== (user?.uid || 'guest') || live.current.tool !== selectedTool?.id || live.current.input !== input) requestRevision.current += 1;
  live.current = { owner: user?.uid || 'guest', tool: selectedTool?.id, input };
  const deepLink = useRef<string | null>(null);
  useEffect(() => { setDrafts({}); setInput(''); setResult(null); setIsLoading(false); setStoryFailure(false); }, [user?.uid]);
  const isPro = tier === 'pro' || tier === 'studio' || tier === 'god';

  /* A locked tool still opens. Refusing to open it left the visitor on a grid
     they did not ask for with a toast as the only explanation - the landing rail
     links straight at Paraphraser and Email Composer, both Standard - and a
     toast is the "block that looks like a bug" this pass removes. The panel is
     rendered by renderAuthModal() as the first child of the shell, so it is at
     the top of the page, and Run re-checks before it spends anything.

     Signed in only. use-user-tier.ts returns early for `!user` leaving
     {tier:'free', loading:false}, so a stranger following the landing rail's
     `?tool=paraphraser` used to be told "Available on a paid plan" - a claim
     about a plan they are not on - alongside "Nothing you entered has been
     lost", about input they never typed. A guest's next step is an account,
     not a checkout, and `guestLocked` below routes them there. */
  const isGuestOnPaidTool = useCallback(
    (tool: GalleryTool) => !user && tool.tier === 'pro',
    [user],
  );
  const isMemberLocked = useCallback(
    (tool: GalleryTool) => Boolean(user) && !tierLoading && tool.tier === 'pro' && !isPro,
    [user, tierLoading, isPro],
  );

  const showTierLock = useCallback((tool: GalleryTool) => {
    setUsageLimit({
      feature: tool.label,
      used: null,
      cap: null,
      upgradeUrl: '/suite/upgrade',
      variant: 'tier',
    });
  }, [setUsageLimit]);

  const selectTool = useCallback((tool: GalleryTool) => {
    setStoryFailure(false);
    requestRevision.current += 1; setIsLoading(false);
    if (selectedTool) setDrafts(prev => ({ ...prev, [selectedTool.id]: { input, result } }));
    setSelectedTool(tool);
    const draft = drafts[tool.id];
    setResult(draft?.result ?? null);
    setInput(draft?.input ?? '');
    // A guest gets no panel on arrival - a modal or a plan claim the moment a
    // link resolves is an ambush. The Run button carries the account ask.
    if (isMemberLocked(tool)) showTierLock(tool);
    else setUsageLimit(null);
  }, [drafts, input, isMemberLocked, result, setUsageLimit, showTierLock, selectedTool]);

  useEffect(() => {
    if (tierLoading) return;
    const toolId = searchParams.get('tool');
    const tool = toolId ? TOOLS.find(t => t.id === toolId) : undefined;
    if (tool && deepLink.current !== toolId) { deepLink.current = toolId; selectTool(tool); }
  }, [searchParams, tierLoading, selectTool]);

  // ── Run Tool ──
  const runTool = useCallback(async () => {
    if (!selectedTool) return;

    /* Both locks are checked before the empty-input nudge. The button stays
       live for a locked tool so the click has somewhere to go, and telling
       someone to type into a tool they cannot run is the wrong first answer. */
    if (isGuestOnPaidTool(selectedTool)) {
      setAuthModal('signup');
      return;
    }

    if (isMemberLocked(selectedTool)) {
      // Raise it if it is not already up, then take the user to it. selectTool
      // has usually raised an identical panel already, in which case setting
      // the same state repaints nothing and the aria-live region has no change
      // to announce - the reveal is the whole answer to the click.
      showTierLock(selectedTool);
      revealUsageLimit();
      return;
    }

    if (!input.trim()) {
      showToast('Enter some text first', 'cancel');
      return;
    }

    setIsLoading(true); setStoryFailure(false);
    const requestTool = selectedTool.id;
    const requestInput = input;
    const revision = ++requestRevision.current;
    const isCurrent = () => revision === requestRevision.current && live.current.tool === requestTool && live.current.input === requestInput;

    try {
      // ── Word counter (client-side, no API) ──
      if (selectedTool.id === 'word-counter') {
        setResult(runWordCounter(input));
        setIsLoading(false);
        return;
      }

      // ── Toolkit tools (dedicated route with tool-specific prompts) ──
      const res = await authFetch('/api/gallery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: selectedTool.id,
          input,
          options: { temperature: 0.25, maxTokens: 1800 },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (!isCurrent()) return;
        if (handleApiError(err)) { setIsLoading(false); return; }
        throw new Error(err.error || 'Tool execution failed');
      }

      const data = await res.json();
      let parsed = data.result ?? data;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { parsed = { result: parsed }; }
      }
      if (!isCurrent()) return;
      setResult(parsed);
      showToast(`${selectedTool.label} complete`, selectedTool.icon);
    } catch (error) {
      if (!isCurrent()) return;
      setStoryFailure(true);
      showToast('Tool execution failed', 'cancel');
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [selectedTool, input, handleApiError, showTierLock, isGuestOnPaidTool, isMemberLocked, setAuthModal, revealUsageLimit]);

  const closeTool = () => {
    requestRevision.current += 1; setIsLoading(false); setStoryFailure(false);
    if (selectedTool) setDrafts(prev => ({ ...prev, [selectedTool.id]: { input, result } }));
    setSelectedTool(null);
    setInput('');
    setResult(null);
    setUsageLimit(null);
  };

  /* Read once per render so the Run button and the click handler cannot
     disagree about whether this tool is runnable. */
  const guestLocked = selectedTool ? isGuestOnPaidTool(selectedTool) : false;
  const memberLocked = selectedTool ? isMemberLocked(selectedTool) : false;
  const runLocked = guestLocked || memberLocked;

  useToolGuidance(buildToolStory({
    toolId: 'gallery', title: selectedTool?.label || 'Writing Toolkit', contextKey: selectedTool?.id || 'tool-selection',
    purpose: selectedTool ? selectedTool.description : 'Choose a writing utility for the draft you have.',
    pending: isLoading, hasResult: Boolean(result), failed: storyFailure, blockedReason: runLocked ? (guestLocked ? 'This utility requires an account. The Run control opens the existing account step.' : 'This utility requires a paid plan. Review the existing plan message before choosing an action.') : undefined,
    work: selectedTool ? [storyStep('input', 'Bring the relevant text', selectedTool.placeholder, 'gallery-input'), storyStep('run', 'Choose the utility action', runLocked ? 'Review the account or plan prerequisite on this control. Help does not sign you in or launch checkout.' : 'Use Run yourself when ready. The word counter runs locally; other utilities use their existing service.', 'gallery-run')] : [storyStep('tool', 'Choose a utility', 'Open the utility that fits this task. Your separate drafts are retained while switching within this page.', 'gallery-tools')],
    recovery: [storyStep('retry', 'Keep the input and choose a retry', 'The last utility attempt failed. Your input is retained; use Run yourself when ready. No new output is confirmed.', 'gallery-run')],
    result: selectedTool ? [storyStep('review', 'Review the actual output', 'Check the observations or suggested wording for this utility. Citations, grammar and rewriting tools do not verify source facts.', 'gallery-result'), storyStep('copy', 'Choose what to copy', 'Copy keeps text on your clipboard; it does not save to an account, send an email or publish content.', 'gallery-copy')] : [],
  }));

  return (
    <SuiteToolShell variant="standard">
      {renderAuthModal()}

      <SuiteToolHeader
        tool="gallery"
        subtitle="Fast utilities for polishing drafts, writing recruiter messages, summarizing research, and preparing clean citations."
      />

      <div className="min-w-0">
        <AnimatePresence mode="wait">
          {!selectedTool ? (
            /* ── TOOL WORKBENCH ── */
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-5"
            >
              <section className="elevation-card rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-rounded text-[20px] text-[var(--accent)]">draw</span>
                      <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Career Writing</h2>
                    </div>
                    <p className="premium-copy-wrap mt-1 max-w-2xl text-xs leading-5 text-[var(--text-secondary)]">
                      High-stakes writing for applications, profiles, and AI-assisted drafts.
                    </p>
                  </div>
                  <span className="w-fit rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
                    {CAREER_WRITING_TOOLS.length} suites
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {CAREER_WRITING_TOOLS.map((tool, i) => (
                    <motion.button
                      key={tool.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => router.push(tool.path)}
                      className="group elevation-interactive relative min-h-[172px] overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 text-left transition-all hover:border-[var(--border)]"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <AnimatedToolIcon
                          icon={tool.icon}
                          color={tool.color}
                          size="md"
                          state="idle"
                        />
                        {tool.badge && (
                          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
                            {tool.badge}
                          </span>
                        )}
                      </div>
                      <h3 className="premium-heading-wrap text-sm font-semibold text-[var(--text-primary)]">{tool.label}</h3>
                      <p className="premium-copy-wrap mt-1.5 text-xs leading-5 text-[var(--text-secondary)]">{tool.description}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{tool.output}</p>
                        <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </section>

              <div className="grid gap-3 lg:grid-cols-3">
                {LANES.map((lane) => (
                  <div key={lane.label} className="elevation-card rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--accent)]">
                        <span className="material-symbols-rounded text-[22px]">{lane.icon}</span>
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{lane.label}</p>
                        <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">{lane.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {LANES.map((lane) => (
                <section key={lane.label} className="elevation-card rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-rounded text-[20px] text-[var(--accent)]">{lane.icon}</span>
                      <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">{lane.label}</h2>
                    </div>
                    <span className="rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
                      {TOOLS.filter(tool => tool.lane === lane.label).length} tools
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {TOOLS.filter(tool => tool.lane === lane.label).map((tool, i) => {
                      // The same two predicates the Run button reads, so the
                      // padlock on a card and the label on its button cannot
                      // disagree. `tier` reads 'free' until /api/usage answers,
                      // and isMemberLocked carries the tierLoading guard that
                      // stopped a paying user watching lock styling sit on
                      // tools they own for the length of that round trip.
                      const isLocked = isGuestOnPaidTool(tool) || isMemberLocked(tool);
                      return (
                        <motion.button
                          key={tool.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03 }}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          data-guide="gallery-tools"
                          onClick={() => selectTool(tool)}
                          className={`group elevation-interactive relative min-h-[166px] overflow-hidden rounded-[18px] border bg-[var(--card-bg)] p-4 text-left transition-all ${
                            isLocked ? 'border-[var(--border-subtle)] opacity-75' : 'border-[var(--border-subtle)] hover:border-[var(--border)]'
                          }`}
                        >
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <AnimatedToolIcon
                              icon={tool.icon}
                              color={tool.color}
                              size="md"
                              state={isLocked ? 'locked' : 'idle'}
                            />
                            <span className={`rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-2 py-0.5 text-[11px] font-bold ${
                              tool.tier === 'pro' && !tierLoading
                                ? isPro ? 'text-[var(--success)]' : 'text-[var(--warning)]'
                                : 'text-[var(--text-secondary)]'
                            }`}>
                              {tool.tier === 'pro' ? 'STANDARD' : 'FREE'}
                            </span>
                          </div>
                          <h3 className="premium-heading-wrap text-sm font-semibold text-[var(--text-primary)]">{tool.label}</h3>
                          <p className="premium-copy-wrap mt-1.5 text-xs leading-5 text-[var(--text-secondary)]">{tool.description}</p>
                          <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{tool.output}</p>
                          {isLocked && (
                            <div
                              className="absolute inset-0 flex items-center justify-center rounded-[18px] backdrop-blur-[1px]"
                              style={{ background: 'color-mix(in srgb, var(--bg-surface) 78%, transparent)' }}
                            >
                              <span className="material-symbols-rounded text-2xl text-[var(--warning)]">lock</span>
                            </div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </motion.div>
          ) : (
            /* ── TOOL EXECUTION PANEL ── */
            <motion.div
              key="panel"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Toolbar */}
              <div className="flex items-center gap-3">
                <button onClick={closeTool} className="flex min-h-11 items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                  <span className="material-symbols-rounded text-sm">arrow_back</span> Back to Toolkit
                </button>
                <div className="flex-1" />
                <div className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--accent-dim)] px-3 py-1.5">
                  <AnimatedToolIcon
                    icon={selectedTool.icon}
                    color={selectedTool.color}
                    size="xs"
                    state={isLoading ? 'thinking' : 'active'}
                  />
                  <span className="text-xs font-medium text-[var(--accent)]">{selectedTool.label}</span>
                </div>
              </div>

              {/* Input */}
              <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] elevation-card p-5">
                <textarea data-guide="gallery-input"
                  value={input}
                  onChange={e => { requestRevision.current += 1; setIsLoading(false); setResult(null); setInput(e.target.value); }}
                  placeholder={selectedTool.placeholder}
                  rows={6}
                  className="w-full p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-[var(--accent)] text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none transition-all text-base focus:outline-none"
                />
                <div className="flex justify-between items-center mt-3">
                  <span className="text-xs text-[var(--text-secondary)]">{input.trim().split(/\s+/).filter(Boolean).length} words</span>
                  {/* A locked tool no longer wears the Run styling. It keeps a
                      live button, because from down here that click is the only
                      route to the gate, but it says what it will do: open the
                      account step for a guest, or scroll to the plan panel for a
                      free member. Empty input does not disable it in that state
                      - there is nothing to type into a tool you cannot run. */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    data-guide="gallery-run"
                    onClick={runTool}
                    disabled={isLoading || (!runLocked && !input.trim())}
                    className={`flex min-h-11 min-w-0 items-center gap-2 whitespace-nowrap rounded-xl px-6 py-3 text-sm font-medium disabled:opacity-50 ${
                      runLocked
                        ? 'border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--warning)]'
                        : 'text-[var(--accent-on)]'
                    }`}
                    style={runLocked ? undefined : { background: 'var(--accent)' }}
                  >
                    {isLoading ? (
                      <>
                        <AnimatedToolIcon
                          icon={selectedTool.icon}
                          color={selectedTool.color}
                          size="xs"
                          state="thinking"
                          className="bg-[var(--card-bg)]"
                        />
                        Processing...
                      </>
                    ) : runLocked ? (
                      <>
                        <span className="material-symbols-rounded text-[18px]">lock</span>
                        {guestLocked ? 'Create a free account' : `Unlock ${selectedTool.label}`}
                      </>
                    ) : (
                      <>
                        <AnimatedToolIcon
                          icon={selectedTool.icon}
                          color={selectedTool.color}
                          size="xs"
                          state="active"
                        />
                        Run {selectedTool.label}
                      </>
                    )}
                  </motion.button>
                </div>
              </div>

              {/* Results */}
              {result && (
                <motion.div data-guide="gallery-result" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] elevation-card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-widest">Results</p>
                    <button data-guide="gallery-copy"
                      onClick={() => {
                        const text = selectedTool?.id === 'word-counter'
                          ? Object.entries(result).map(([k, v]) => `${k}: ${v}`).join('\n')
                          : typeof result === 'string' ? result
                          : result?.correctedText
                            || result?.summary
                            || result?.brief
                            || (Array.isArray(result?.citations) ? result.citations.map((c: any) => c.formatted || c.citation).join('\n') : '')
                            || (Array.isArray(result?.variations) ? result.variations.map((v: any) => `${v.style || 'Variation'}: ${v.text}`).join('\n\n') : '')
                            || result?.paraphrased?.formal
                            || result?.email
                            || result?.body
                            || result?.thesis
                            || result?.thesisStatement
                            || JSON.stringify(result, null, 2);
                        navigator.clipboard.writeText(text);
                        showToast('Copied to clipboard', 'content_copy');
                      }}
                      className="flex min-h-11 items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-3 py-1 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--border)]"
                    >
                      <span className="material-symbols-rounded text-sm">content_copy</span> Copy
                    </button>
                  </div>
                  <ToolResult toolId={selectedTool!.id} result={result} color={selectedTool!.color} />
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SuiteToolShell>
  );
}
