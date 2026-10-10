'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { TacoWordmark } from '@/components/BrandLogo';
import { MobileStickyActionBar } from '@/components/mobile/MobileWorkbench';
import { detectAI } from '@/lib/ai-detection';
import { useStore } from '@/lib/store';
import { getTrustLabel, WRITING_TRUST_HANDOFF_KEY } from '@/lib/writing-pipeline';

const SAMPLES: Record<string, string> = {
  ChatGPT: `In today's rapidly evolving landscape, it is important to note that artificial intelligence has significantly impacted various industries. Furthermore, the integration of AI-driven solutions has enabled organizations to streamline their operations and enhance overall efficiency. Moreover, the transformative potential of these technologies cannot be understated, as they continue to reshape how businesses approach complex challenges in an ever-changing environment. Additionally, it is worth noting that the paradigm shift brought about by these innovations has created unprecedented opportunities for growth and development across multiple sectors.`,
  Claude: `The relationship between technology and human creativity represents one of the most fascinating dynamics of our era. While AI tools have become increasingly sophisticated, they serve best as amplifiers of human intent rather than replacements for it. Consider how a skilled writer uses AI: not as a crutch, but as a collaborative partner that helps explore ideas more rapidly. The key distinction lies in the intentionality behind the output — human writers bring context, emotion, and lived experience that no model can replicate.`,
  Gemini: `Artificial intelligence is a multifaceted field that encompasses a wide range of technologies and applications. It is crucial to understand that the development of AI systems requires a holistic approach that considers both technical capabilities and ethical implications. The landscape of AI research is constantly evolving, with new breakthroughs occurring at an unprecedented pace. Leveraging these advancements effectively requires a comprehensive understanding of the underlying principles and a commitment to responsible innovation. In conclusion, the future of AI holds tremendous promise.`,
  Human: `I spent three years building backend systems at a fintech startup before I realized I actually liked the messy, people-facing side of engineering more. My manager thought I was crazy when I asked to move to a client-facing role. But honestly? Debugging a customer's workflow on a shared screen taught me more about building good software than any sprint retrospective ever did.`,
  Mixed: `I have over 8 years of experience in software development, with a proven track record of delivering high-quality solutions. In my last role, I cut our deploy pipeline from 45 minutes to 12 by rewriting the CI config — nothing fancy, just removed three redundant test suites nobody maintained. It is worth noting that my comprehensive background in full-stack development has enabled me to leverage cutting-edge technologies.`,
};

function analyzeText(text: string) {
  const result = detectAI(text);
  return { score: 100 - result.humanScore, verdict: getTrustLabel(result.humanScore),
    flags: result.flags.map(flag => ({ pattern: flag.message, severity: flag.type === 'critical' || flag.type === 'high' ? 'high' : flag.type === 'medium' ? 'medium' : 'low' })),
    wordCount: text.trim().split(/\s+/).filter(Boolean).length, sentenceCount: text.split(/[.!?]+/).filter(part => part.trim()).length };
}

function ScoreRing({ score, size = 116 }: { score: number; size?: number }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? 'var(--success)' : score >= 45 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth="6" opacity="0.5" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeLinecap="round" strokeDasharray={circ} initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }} transition={{ duration: 1.5, ease: [0.33, 1, 0.68, 1] }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="font-semibold tracking-tight" style={{ color, fontSize: size * 0.24, lineHeight: 1 }}
          initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5, ease: 'easeOut' }}
        >{score}</motion.span>
        <span className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>/ 100</span>
      </div>
    </div>
  );
}

export default function AIDetectorDemo() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ReturnType<typeof analyzeText> | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [handoffError, setHandoffError] = useState('');
  const [activeSample, setActiveSample] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const analysisRevision = useRef(0);

  const handleAnalyze = () => {
    if (text.trim().length < 50) return;
    setIsAnalyzing(true);
    const revision = ++analysisRevision.current;
    setTimeout(() => {
      if (revision !== analysisRevision.current) return;
      setResult(analyzeText(text));
      setIsAnalyzing(false);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }, 1200);
  };

  const loadSample = (key: string) => {
    analysisRevision.current += 1; setIsAnalyzing(false);
    setText(SAMPLES[key] || '');
    setResult(null);
    setActiveSample(key);
  };

  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  const trustScore = result ? 100 - result.score : 100;
  const scoreColor = trustScore >= 70 ? 'var(--success)' : trustScore >= 45 ? 'var(--warning)' : 'var(--danger)';
  const saveDraftForSuite = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!text.trim()) return;
    try { localStorage.setItem(WRITING_TRUST_HANDOFF_KEY, JSON.stringify({ owner: useStore.getState().user?.uid || 'guest', accepted: true, createdAt: Date.now(), draft: {
      text,
      source: 'Public AI trust check',
      documentName: 'Public trust check draft',
      createdAt: new Date().toISOString(),
    } })); setHandoffError(''); } catch { event.preventDefault(); setHandoffError('Device storage is blocked. Copy your text before opening the writing workspace.'); }
  };

  return (
    <div className="premium-brand-page mobile-app-page min-h-dvh" style={{ background: 'var(--bg-deep)', color: 'var(--text-primary)' }}>
      {handoffError && <p role="alert" className="p-4 text-sm">{handoffError}</p>}
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 backdrop-blur-2xl" style={{ background: 'color-mix(in srgb, var(--bg-deep) 85%, transparent)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" aria-label="TalentConsulting.io home" className="inline-flex min-w-0 items-center">
            <TacoWordmark className="w-[min(210px,48vw)]" />
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <Link href="/tools/ai-humanizer" className="text-xs transition-colors" style={{ color: 'var(--text-muted)' }}>Humanizer</Link>
            <Link href="/templates" className="hidden text-xs transition-colors sm:inline" style={{ color: 'var(--text-muted)' }}>Templates</Link>
            <Link
              href="/suite/writing-tools"
              onClick={saveDraftForSuite}
              className="inline-flex min-h-[44px] items-center rounded-[10px] px-4 py-2 text-xs font-semibold transition hover:opacity-90"
              style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}
            >
              Open Suite →
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="px-4 py-8 sm:px-6 sm:py-10">
        <div className="premium-brand-hero glass-card relative mx-auto max-w-5xl overflow-hidden rounded-2xl p-6 md:p-8">
          <div className="premium-brand-kicker mb-5 inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
            Free Writing Pattern Check
          </div>
          <h1 className="mb-4 text-4xl font-semibold tracking-tight md:text-5xl" style={{ color: 'var(--text-primary)' }}>
            Read the trust signals before you send it.
          </h1>
          <p className="max-w-2xl text-sm leading-6 md:text-base" style={{ color: 'var(--text-secondary)' }}>
            Paste any text below. We'll scan <strong style={{ color: 'var(--text-secondary)' }}>100+ linguistic patterns</strong> for writing-pattern and readability suggestions. Scores cannot establish authorship, originality, or factual accuracy.
          </p>

          {/* Sample pills */}
          <div className="mobile-segmented-control mt-8">
            <span className="mr-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>Try:</span>
            {Object.keys(SAMPLES).map(key => (
              <button key={key} onClick={() => loadSample(key)}
                className="inline-flex min-h-[44px] items-center rounded-[10px] px-3.5 py-2 text-[11px] font-medium transition duration-200"
                style={{
                  background: activeSample === key ? 'var(--accent-hover)' : 'transparent',
                  border: `1px solid ${activeSample === key ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  color: activeSample === key ? 'var(--accent)' : 'var(--text-muted)',
                }}>
                {key}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main workspace ── */}
      <div className="mx-auto max-w-6xl px-6 pb-12">
        <div className={`flex flex-col ${result ? 'lg:flex-row' : ''} gap-5`}>

          {/* Textarea card */}
          <div className={`${result ? 'lg:w-[58%]' : 'max-w-4xl mx-auto w-full'} transition-all duration-700`}>
            <div className="overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] elevation-card">
              <textarea
                value={text}
                onChange={(e) => {
                  const w = e.target.value.split(/\s+/).filter(w => w.length > 0);
                  if (w.length <= 500) { analysisRevision.current += 1; setIsAnalyzing(false); setText(e.target.value); setResult(null); setActiveSample(null); }
                }}
                placeholder="Paste your resume, cover letter, essay, or any text here..."
                className="ai-detector-textarea w-full resize-none bg-transparent p-6 text-base leading-7 focus:outline-none"
                style={{ color: 'var(--text-primary)', height: result ? 380 : 400, caretColor: 'var(--accent)' }}
              />
              {/* Toolbar */}
              <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--card-bg)' }}>
                <div className="flex items-center gap-4">
                  <span className="text-[11px] font-mono tabular-nums" style={{ color: wordCount > 450 ? 'var(--warning)' : 'var(--text-muted)' }}>
                    {wordCount}<span style={{ color: 'var(--border)' }}>/500</span>
                  </span>
                  {text.length > 0 && (
                    <button onClick={() => { setText(''); setResult(null); setActiveSample(null); }}
                      className="inline-flex min-h-[44px] items-center px-2 text-[11px] font-medium transition-colors hover:underline"
                      style={{ color: 'var(--text-muted)' }}>Clear</button>
                  )}
                </div>
                <button onClick={handleAnalyze} disabled={text.trim().length < 50 || isAnalyzing}
                  className="relative inline-flex min-h-[44px] items-center justify-center rounded-[12px] px-7 py-2.5 text-[13px] font-semibold transition disabled:opacity-35"
                  style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}>
                  {isAnalyzing ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" /><path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
                      Scanning…
                    </span>
                  ) : 'Scan Text'}
                </button>
              </div>
            </div>
            <p className="text-center text-[11px] mt-3" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
              By scanning, you agree to our <Link href="/privacy" className="underline">Privacy Policy</Link> and <Link href="/terms" className="underline">Terms</Link>
            </p>
          </div>

          {/* Results panel */}
          <AnimatePresence>
            {result && (
              <motion.div ref={resultsRef}
                initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4 lg:w-[42%]">

                {/* Score card */}
                <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center elevation-card">
                  <div className="flex justify-center mb-4">
                    <ScoreRing score={trustScore} />
                  </div>
                  <p className="text-sm font-bold mb-1" style={{ color: scoreColor }}>{result.verdict}</p>
                  <div className="flex justify-center gap-5 mt-4">
                    {[
                      { label: 'Words', val: result.wordCount },
                      { label: 'Sentences', val: result.sentenceCount },
                      { label: 'Flags', val: result.flags.length },
                    ].map(s => (
                      <div key={s.label} className="text-center">
                        <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{s.val}</div>
                        <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Flags */}
                {result.flags.length > 0 && (
                  <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                    <h3 className="mb-3 text-[12px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
                      Writing Signals
                    </h3>
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                      {result.flags.map((flag, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-start gap-2.5 rounded-[12px] px-3 py-2.5 text-[12px]"
                          style={{ background: 'var(--card-bg)' }}>
                          <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full" style={{
                            background: flag.severity === 'high' ? 'var(--danger)' : 'var(--warning)',
                          }} />
                          <span style={{ color: 'var(--text-secondary)' }}>{flag.pattern}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cross-sell */}
                <div className="relative overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                  <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Mixed signals? Open the studio.</p>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Rewrite risky sections with controlled presets while preserving meaning and voice.</p>
                  <Link href="/suite/writing-tools" onClick={saveDraftForSuite}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] px-5 py-2 text-xs font-semibold transition hover:opacity-90"
                    style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}>
                    Continue in Studio <span className="text-sm">→</span>
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Trust bar */}
      <div className="py-5" style={{ borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-center gap-6">
          <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="material-symbols-rounded icon-neutral text-base">verified</span>
            100+ heuristic patterns analyzed
          </span>
          <span className="hidden sm:block text-xs" style={{ color: 'var(--border-subtle)' }}>•</span>
          <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="material-symbols-rounded icon-neutral text-base">speed</span>
            Results in under 2 seconds
          </span>
          <span className="hidden sm:block text-xs" style={{ color: 'var(--border-subtle)' }}>•</span>
          <Link href="/suite/writing-tools" className="text-xs font-medium transition-colors text-[var(--accent)] hover:opacity-80">
            Full suite →
          </Link>
        </div>
      </div>

      {/* SEO Content */}
      <div className="max-w-3xl mx-auto px-4 py-16 sm:px-6">
        <section className="space-y-10">
          {[
            { title: 'How The Writing Pattern Check Works', body: 'Our heuristic engine analyzes over 100 linguistic patterns commonly associated with AI-assisted writing, including sentence uniformity, cliché phrase density, transition overuse, and statistical rhythm. Treat the result as an indicator, not proof.' },
            { title: 'Why This Matters for Career Writing', body: 'Recruiters and schools increasingly use automated writing signals, but detectors can be wrong. The safer workflow is to review patterns, preserve your real voice, and make the document clearer and more specific.' },
            { title: 'Free vs Standard Trust Studio', body: 'The free version provides a 500-word trust preview. The suite adds deep scan, paragraph fixes, verification, exports, and saved writing sessions.' },
          ].map((s, i) => (
            <div key={i}>
              <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{s.title}</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{s.body}</p>
            </div>
          ))}
          <div>
            <h3 className="mb-4 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>FAQ</h3>
            {[
              { q: 'Is this AI detector free?', a: 'Yes — completely free with a 500-word limit. No account required.' },
              { q: 'Can AI detectors be wrong?', a: 'Yes, no detector is 100% accurate. Heuristic analysis provides indicators, not proof.' },
              { q: 'What models can it detect?', a: 'It looks for model-like writing signals common across ChatGPT, Claude, Gemini, Llama, and other systems, but it cannot prove authorship.' },
              { q: 'How do I improve trust signals?', a: 'Vary sentence lengths, avoid cliché phrases, add specific context, and revise only the sections that need it.' },
            ].map((faq, i) => (
              <details key={i} className="mb-2 rounded-xl overflow-hidden group" style={{ border: '1px solid var(--border-subtle)' }}>
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium flex items-center justify-between" style={{ color: 'var(--text-secondary)', background: 'var(--bg-surface)' }}>
                  {faq.q}
                  <span className="material-symbols-rounded text-base transition-transform group-open:rotate-180" style={{ color: 'var(--text-muted)' }}>expand_more</span>
                </summary>
                <div className="px-4 pb-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>{faq.a}</div>
              </details>
            ))}
          </div>
        </section>
        <div className="mt-10 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 elevation-card">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">Use the trust check with these tools</h2>
          <div className="mobile-card-rail mt-4 grid gap-3 md:grid-cols-3">
            {[
              { href: '/tools/ai-humanizer', title: 'AI Humanizer', desc: 'Rewrite flagged sections without losing meaning.' },
              { href: '/tools/resume-builder', title: 'Resume Builder', desc: 'Improve resume bullets after checking trust signals.' },
              { href: '/tools/ats-analyzer', title: 'ATS Analyzer', desc: 'Pair writing trust with keyword fit.' },
            ].map((link) => (
              <Link key={link.href} href={link.href} className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 transition hover:border-[var(--border)]">
                <span className="block text-sm font-semibold text-[var(--text-primary)]">{link.title}</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{link.desc}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 elevation-card">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">Source context</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Use detector-style feedback as a signal, not proof. For responsible AI context, see the{' '}
            <a href="https://www.nist.gov/itl/ai-risk-management-framework" rel="noopener noreferrer" target="_blank" className="font-medium text-[var(--accent)] hover:underline">
              NIST AI Risk Management Framework
            </a>.
          </p>
        </div>
      </div>
      <MobileStickyActionBar
        primaryLabel="Analyze text"
        primaryIcon="radar"
        onPrimary={handleAnalyze}
        disabled={text.trim().length < 50 || isAnalyzing}
        loading={isAnalyzing}
        secondaryActions={[
          { label: 'Sample', icon: 'article', onClick: () => loadSample('Mixed') },
        ]}
      />
    </div>
  );
}
