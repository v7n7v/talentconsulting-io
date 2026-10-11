'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { TalentConsultingWordmark } from '@/components/BrandLogo';
import AssistantPicksCapture from '@/components/assistant/AssistantPicksCapture';
import SeoTrackedLink from '@/components/seo/SeoTrackedLink';

const FEATURES = [
  { icon: 'bolt', title: 'AI-Powered Writing', desc: 'Generate professional bullet points from raw job descriptions. Just paste and go.' },
  { icon: 'target', title: 'ATS Score in Real-Time', desc: 'Live scoring against ATS algorithms. See your compatibility percentage before you apply.' },
  { icon: 'description', title: '20 Signature Templates', desc: 'Three free and 17 Standard designs, each with an explicit ATS posture and linear Word companion.' },
  { icon: 'key', title: 'Keyword Optimization', desc: 'AI extracts critical keywords from job postings and weaves them into your resume naturally.' },
  { icon: 'upload_file', title: 'Export with Intent', desc: 'Download a designed, selectable-text PDF or a deliberately linear DOCX companion.' },
  { icon: 'lock', title: 'Private & Secure', desc: 'Your resume data never leaves your account. End-to-end encryption on all uploads.' },
];

const STEPS = [
  { num: '01', title: 'Upload or Start Fresh', desc: 'Import your existing resume (PDF/DOCX) or build from scratch with our guided editor.' },
  { num: '02', title: 'AI Enhances Your Content', desc: 'Paste a job description. Our AI rewrites your bullet points to match the role\'s requirements.' },
  { num: '03', title: 'Check Your ATS Score', desc: 'Real-time scoring shows how well your resume matches the job. Fix gaps before applying.' },
  { num: '04', title: 'Export & Apply', desc: 'Choose a designed PDF or linear DOCX based on the employer’s submission workflow.' },
];

const COMPARISONS = [
  { feature: 'AI-powered bullet point writing', us: true, others: false },
  { feature: 'Real-time ATS compatibility score', us: true, others: false },
  { feature: 'Job description keyword matching', us: true, others: false },
  { feature: 'Resume parsing (PDF/DOCX upload)', us: true, others: true },
  { feature: 'Multiple export formats', us: true, others: true },
  { feature: 'Free tier available', us: true, others: true },
  { feature: 'No watermarks on free exports', us: true, others: false },
  { feature: 'Integrated AI Humanizer', us: true, others: false },
];

const FAQS = [
  { q: 'Is the AI resume builder free?', a: 'Yes, you can build and export one resume for free. The Standard plan unlocks unlimited resumes, advanced AI features, and all premium templates.' },
  { q: 'Will my resume pass ATS screening?', a: 'No template can guarantee every ATS outcome. The real-time score is guidance, and each template states whether it is ATS-first, ATS-conscious, or Human-first.' },
  { q: 'What AI model powers the resume builder?', a: 'We use Google\'s Gemini AI, fine-tuned for career content. It generates professional, industry-specific bullet points that sound human-written.' },
  { q: 'Can I upload my existing resume?', a: 'Yes, upload any PDF or DOCX. Our parser extracts your content into the editor where you can enhance it with AI.' },
  { q: 'Is my data private?', a: 'Absolutely. Your resume data is encrypted and stored in your private vault. We never share, sell, or use your content for training.' },
];

export default function ResumeBuilderLanding() {
  return (
    <div className="premium-brand-page mobile-app-page min-h-dvh bg-[var(--bg-deep)] text-[var(--text-primary)]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-deep)_86%,transparent)] backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" aria-label="TalentConsulting.io home" className="inline-flex min-w-0 items-center">
            <TalentConsultingWordmark className="w-[min(210px,48vw)]" />
          </Link>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/templates" className="hidden text-xs sm:inline-flex sm:min-h-[44px] sm:items-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Templates</Link>
            <Link href="/tools/ats-analyzer" className="hidden text-xs sm:inline-flex sm:min-h-[44px] sm:items-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">ATS Analyzer</Link>
            <SeoTrackedLink href="/suite/resume" eventName="seo_resume_builder_click" className="inline-flex min-h-[44px] items-center rounded-lg bg-[var(--accent)] px-4 text-xs font-medium text-[var(--accent-on)] transition-colors hover:bg-[var(--accent-active)]">
              Start Building →
            </SeoTrackedLink>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Hero */}
        <section className="premium-brand-hero my-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="premium-brand-kicker inline-block text-xs font-medium px-3 py-1 mb-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--accent-dim)] text-[var(--accent)]">
              AI-Powered Resume Builder
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-5 leading-[1.1] text-[var(--text-primary)]">
              Build a resume that proves the right work.
            </h1>
            <p className="text-base md:text-lg max-w-2xl mb-8 text-[var(--text-secondary)]">
              Upload your resume or start fresh. Talent Studio helps shape specific, ATS-readable proof without turning your experience into generic AI copy.
            </p>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
              <SeoTrackedLink href="/suite/resume" eventName="seo_resume_builder_click" className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--accent-on)] elevation-card transition-all hover:bg-[var(--accent-active)]">
                Build Your Resume Free →
              </SeoTrackedLink>
              <Link href="/templates" className="inline-flex min-h-[44px] items-center justify-center px-6 py-3 text-sm font-medium rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-all">
                Browse Templates
              </Link>
            </div>
          </motion.div>
        </section>

        <section className="pb-20">
          <AssistantPicksCapture sourcePath="resume_builder_landing" />
        </section>

        {/* Features */}
        <section className="pb-20">
          <h2 className="text-2xl font-bold text-center mb-10 text-[var(--text-primary)]">
            Everything you need to land the job
          </h2>
          <div className="mobile-card-rail grid md:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6 elevation-card"
              >
                <span className="material-symbols-rounded icon-neutral text-2xl mb-3 block">{f.icon}</span>
                <h3 className="font-semibold text-sm mb-1 text-[var(--text-primary)]">{f.title}</h3>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section className="pb-20">
          <h2 className="text-2xl font-bold text-center mb-10 text-[var(--text-primary)]">
            How it works
          </h2>
          <div className="mobile-card-rail grid md:grid-cols-4 gap-4">
            {STEPS.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6 elevation-card"
              >
                <div className="text-xs font-bold text-[var(--accent)] mb-3">{s.num}</div>
                <h3 className="font-semibold text-sm mb-1 text-[var(--text-primary)]">{s.title}</h3>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Comparison Table */}
        <section className="pb-20">
          <h2 className="text-2xl font-bold text-center mb-10 text-[var(--text-primary)]">
            Why TalentConsulting.io vs others
          </h2>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left p-4 font-medium text-[var(--text-muted)]">Feature</th>
                  <th className="p-4 font-medium text-center text-[var(--accent)]">TalentConsulting.io</th>
                  <th className="p-4 font-medium text-center text-[var(--text-muted)]">Others</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISONS.map((c, i) => (
                  <tr key={i} className="border-b last:border-b-0 border-[var(--border-subtle)]">
                    <td className="p-4 text-[var(--text-secondary)]">{c.feature}</td>
                    <td className="p-4 text-center text-[var(--accent)] text-lg">{c.us ? '✓' : '—'}</td>
                    <td className="p-4 text-center text-lg text-[var(--text-muted)]">{c.others ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="pb-20">
          <h2 className="text-2xl font-bold text-center mb-8 text-[var(--text-primary)]">
            Resume guides people use next
          </h2>
          <div className="mobile-card-rail grid gap-4 md:grid-cols-3">
            {[
              { href: '/resume-examples/software-engineer', icon: 'code', title: 'Software Engineer Example', desc: 'See ATS-ready structure, skills, and bullets.' },
              { href: '/resume-keywords/software-engineering', icon: 'key', title: 'Software Keywords', desc: 'Find keywords that match engineering job posts.' },
              { href: '/tools/ats-analyzer', icon: 'analytics', title: 'ATS Analyzer', desc: 'Check fit before you submit the application.' },
            ].map((guide) => (
              <Link
                key={guide.href}
                href={guide.href}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 transition-all hover:scale-[1.01] hover:border-[var(--border)] elevation-interactive"
              >
                <span className="material-symbols-rounded icon-neutral text-2xl mb-3 block">{guide.icon}</span>
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">{guide.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{guide.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="pb-20">
          <h2 className="text-2xl font-bold text-center mb-8 text-[var(--text-primary)]">
            Frequently Asked Questions
          </h2>
          <div className="max-w-2xl mx-auto space-y-2">
            {FAQS.map((faq, i) => (
              <details key={i} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <summary className="font-medium cursor-pointer text-sm text-[var(--text-primary)]">{faq.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="pb-20">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6 elevation-card">
            <h2 className="text-lg font-bold mb-2 text-[var(--text-primary)]">Source context</h2>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              Use resume guidance with current occupation context from the{' '}
              <a href="https://www.bls.gov/ooh/" rel="noopener noreferrer" target="_blank" className="text-[var(--accent)] hover:underline">
                Bureau of Labor Statistics Occupational Outlook Handbook
              </a>.
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="pb-20">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--accent-dim)] p-10 text-center">
            <h2 className="text-2xl font-bold mb-3 text-[var(--text-primary)]">
              Ready to build a resume that works?
            </h2>
            <p className="text-sm mb-6 max-w-lg mx-auto text-[var(--text-secondary)]">
              Twenty signature templates, an ATS score as you type, and a designed PDF with a linear Word companion. Free to start, no credit card required.
            </p>
            <SeoTrackedLink href="/suite/resume" eventName="seo_resume_builder_click" className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--accent-on)] elevation-card transition-all hover:bg-[var(--accent-active)]">
              Build Your Resume Free →
            </SeoTrackedLink>
          </div>
        </section>
      </div>
    </div>
  );
}
