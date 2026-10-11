'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { TalentConsultingWordmark } from '@/components/BrandLogo';
import AssistantPicksCapture from '@/components/assistant/AssistantPicksCapture';

const FEATURES = [
  { icon: 'shield', title: 'Trust Signal Coaching', desc: 'Review risk patterns with calibrated language and improve only the sections that need attention.' },
  { icon: 'theater_comedy', title: 'Preserve Your Voice', desc: 'Reshape cadence while protecting meaning, facts, and intent.' },
  { icon: 'monitoring', title: 'Readability & Originality', desc: 'See rhythm, originality, and paragraph-level signals before you export.' },
  { icon: 'work', title: 'Career-Specific Modes', desc: 'Resume, cover letter, and LinkedIn modes understand recruiter expectations.' },
  { icon: 'tune', title: 'Tone Control', desc: 'Adjust formality, confidence, and personality without losing clarity.' },
  { icon: 'bolt', title: 'Fast Workflow', desc: 'Paste, diagnose, humanize, verify, and export from one connected studio.' },
];

const BEFORE_AFTER = [
  {
    label: 'Resume Bullet Point',
    before: 'Leveraged cross-functional collaboration to drive strategic initiatives that resulted in significant improvements to operational efficiency and stakeholder satisfaction.',
    after: 'Led a 5-person team across sales and engineering to cut onboarding time from 3 weeks to 4 days, saving $120K/year in training costs.',
  },
  {
    label: 'Cover Letter Opening',
    before: 'I am writing to express my sincere interest in the Software Engineer position at your esteemed organization. With my comprehensive background in software development, I am confident that my skills align perfectly with your requirements.',
    after: 'Your job post mentioned you need someone who can ship production React code fast. I have done exactly that: 14 features deployed in my last 6 months, with zero rollbacks.',
  },
];

const TRUST_SIGNALS = [
  { name: 'Sentence rhythm', status: 'Measured' },
  { name: 'Voice consistency', status: 'Protected' },
  { name: 'Originality cues', status: 'Reviewed' },
  { name: 'Cliche density', status: 'Reduced' },
  { name: 'Readability', status: 'Improved' },
  { name: 'Paragraph risk', status: 'Targeted' },
];

const FAQS = [
  { q: 'How does the AI humanizer work?', a: 'It analyzes patterns that often create low-trust writing signals, then revises cadence and specificity while keeping the original meaning intact.' },
  { q: 'Is using an AI humanizer ethical?', a: 'It should be used like an editor: to make your own draft clearer, more specific, and more authentic. The studio avoids guaranteed bypass claims.' },
  { q: 'What makes this different from generic rewriters?', a: 'It is tuned for career writing, so it protects recruiter-friendly structure, quantified achievements, and ATS-readable language.' },
  { q: 'Can I humanize my resume with this?', a: 'Yes. Resume mode focuses on clarity, credibility, and formatting-safe improvements.' },
  { q: 'Can detectors still be wrong?', a: 'Yes. Detector scores are indicators, not proof. The safer goal is stronger writing, not a promise about authorship detection.' },
  { q: 'Is there a free version?', a: 'You can try the humanizer with limited usage. The suite adds saved sessions, deep scan, verification, and larger workflows.' },
];

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="btn-primary inline-flex min-h-[44px] items-center justify-center rounded-[12px] px-5 py-3 text-sm font-semibold transition hover:opacity-90"
    >
      {children}
    </Link>
  );
}

function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)]"
    >
      {children}
    </Link>
  );
}

export default function AIHumanizerLanding() {
  return (
    <div className="premium-brand-page mobile-app-page min-h-dvh bg-[var(--bg-deep)] text-[var(--text-primary)]">
      <nav className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-deep)_86%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="TalentConsulting.io home" className="inline-flex min-w-0 items-center">
            <TalentConsultingWordmark className="w-[min(170px,42vw)] sm:w-[210px]" />
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <Link href="/tools/ai-detector" className="hidden text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)] min-[440px]:inline">AI Detector</Link>
            <Link href="/tools/resume-builder" className="hidden text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)] sm:inline">Resume Builder</Link>
            <Link
              href="/suite/writing-tools"
              className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-[10px] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--accent-on)] transition hover:opacity-90 sm:px-4"
            >
              Open Trust Studio
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="py-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="premium-brand-hero glass-card overflow-hidden rounded-2xl p-6 md:p-8"
          >
            <div className="premium-brand-kicker mb-5 inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              Career-Grade Humanization
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
              Keep the useful draft. Remove the generic voice.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] md:text-base">
              Transform drafts into natural career writing with trust, originality, and readability guidance. Built for resumes, cover letters, LinkedIn, and recruiter communication.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <PrimaryLink href="/suite/writing-tools">Humanize Your Text</PrimaryLink>
              <SecondaryLink href="/tools/ai-detector">Check Trust Signals</SecondaryLink>
            </div>
          </motion.div>
        </section>

        <section className="pb-12">
          <AssistantPicksCapture sourcePath="ai_humanizer_landing" />
        </section>

        <section className="pb-12">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Trust system</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Responsible writing signals</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
              Detector results should be interpreted cautiously. The studio improves clarity and trust signals without claiming proof of authorship.
            </p>
          </div>
          <div className="mobile-card-rail grid grid-cols-2 gap-3 md:grid-cols-6">
            {TRUST_SIGNALS.map((d, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.96 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-center elevation-card"
              >
                <div className="text-sm font-semibold text-[var(--success)]">{d.status}</div>
                <div className="mt-1 text-[11px] text-[var(--text-muted)]">{d.name}</div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="pb-12">
          <div className="mb-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Capabilities</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Not just synonym swapping</h2>
          </div>
          <div className="mobile-card-rail grid gap-4 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 elevation-card"
              >
                <span className="material-symbols-rounded mb-3 block text-2xl text-[var(--accent)]">{f.icon}</span>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{f.title}</h3>
                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="pb-12">
          <div className="mb-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Preview</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">See the difference</h2>
          </div>
          <div className="space-y-4">
            {BEFORE_AFTER.map((ex, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] elevation-card"
              >
                <div className="border-b border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 py-3 text-xs font-medium text-[var(--text-secondary)]">
                  {ex.label}
                </div>
                <div className="grid md:grid-cols-2">
                  <div className="border-b border-[var(--border-subtle)] p-5 md:border-b-0 md:border-r">
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--danger)]">Low-trust draft</div>
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">{ex.before}</p>
                  </div>
                  <div className="p-5">
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--success)]">Voice-preserved rewrite</div>
                    <p className="text-sm leading-6 text-[var(--text-primary)]">{ex.after}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="pb-12">
          <div className="mb-5 text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">FAQ</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
          </div>
          <div className="mx-auto max-w-3xl space-y-2">
            {FAQS.map((faq, i) => (
              <details key={i} className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 elevation-card">
                <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)]">{faq.q}</summary>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="pb-12">
          <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 elevation-card">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">Use with your job-search workflow</h2>
            <div className="mobile-card-rail mt-4 grid gap-3 md:grid-cols-3">
              {[
                { href: '/tools/ai-detector', title: 'AI Detector', desc: 'Check trust signals before revising.' },
                { href: '/tools/resume-builder', title: 'Resume Builder', desc: 'Apply polished wording to your resume.' },
                { href: '/resume-keywords/marketing', title: 'Resume Keywords', desc: 'Pair stronger writing with the right terms.' },
              ].map((link) => (
                <Link key={link.href} href={link.href} className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 transition hover:border-[var(--border)]">
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">{link.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{link.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="pb-12">
          <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 elevation-card">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">Source context</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Use writing-trust signals as guidance, not authorship proof. For responsible AI context, see the{' '}
              <a href="https://www.nist.gov/itl/ai-risk-management-framework" rel="noopener noreferrer" target="_blank" className="font-medium text-[var(--accent)] hover:underline">
                NIST AI Risk Management Framework
              </a>.
            </p>
          </div>
        </section>

        <section className="pb-16">
          <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center elevation-card md:p-8">
            <h2 className="text-2xl font-semibold tracking-tight">Keep the useful parts. Lose the generic voice.</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
              Use the studio to polish resumes, cover letters, and profile text with control.
            </p>
            <div className="mt-6">
              <PrimaryLink href="/suite/writing-tools">Open Trust Studio</PrimaryLink>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
