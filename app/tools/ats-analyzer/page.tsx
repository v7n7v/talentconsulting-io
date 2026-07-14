import type { Metadata } from 'next';
import Link from 'next/link';
import { TalentConsultingWordmark } from '@/components/BrandLogo';
import JsonLd from '@/components/seo/JsonLd';
import SeoTrackedLink from '@/components/seo/SeoTrackedLink';
import { RelatedLinks } from '@/components/seo/RelatedLinks';
import { breadcrumbJsonLd, buildMetadata, faqJsonLd, softwareApplicationJsonLd } from '@/lib/seo';

const FAQS = [
  {
    q: 'What does the ATS analyzer check?',
    a: 'It reviews resume and job-description fit, keyword coverage, formatting risk, and the gaps that can keep a resume from being surfaced.',
  },
  {
    q: 'Is an ATS score a guarantee?',
    a: 'No. ATS scores are useful indicators, not guarantees. The goal is to improve fit and readability before a recruiter reviews the application.',
  },
  {
    q: 'Can I use it before applying?',
    a: 'Yes. The best workflow is to check the job description, tailor your resume, then review the score again before submitting.',
  },
  {
    q: 'Does this replace a human resume review?',
    a: 'No. It catches machine-readable issues and keyword gaps, while your final resume still needs honest, specific proof of your work.',
  },
];

export const metadata: Metadata = buildMetadata({
  title: 'Free ATS Analyzer - Resume Score and Keyword Fit',
  description: 'Analyze your resume against a job description for ATS compatibility, keyword gaps, formatting issues, and fit signals before you apply.',
  path: '/tools/ats-analyzer',
  keywords: ['ATS analyzer', 'free ATS resume checker', 'ATS resume score', 'resume keyword checker', 'resume scanner'],
});

export default function ATSAnalyzerPage() {
  return (
    <main className="premium-brand-page mobile-app-page min-h-dvh bg-[var(--bg-deep)] text-[var(--text-primary)]">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Tools', path: '/tools/resume-builder' },
            { name: 'ATS Analyzer', path: '/tools/ats-analyzer' },
          ]),
          faqJsonLd(FAQS),
          softwareApplicationJsonLd({
            name: 'Talent Studio ATS Analyzer',
            description: 'Resume and job-description analyzer for ATS compatibility, keyword fit, and application readiness.',
            path: '/tools/ats-analyzer',
            features: ['ATS resume score', 'Keyword gap analysis', 'Formatting risk review', 'Job-description fit coaching'],
          }),
        ]}
      />
      <nav className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-deep)_88%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="TalentConsulting.io home" className="inline-flex min-w-0 items-center">
            <TalentConsultingWordmark className="w-[min(210px,48vw)]" />
          </Link>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/tools/resume-builder" className="hidden text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)] sm:inline">Resume Builder</Link>
            <Link href="/resume-keywords/software-engineering" className="hidden text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)] sm:inline">Keywords</Link>
            <Link href="/templates" className="hidden text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)] sm:inline">Templates</Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <section className="premium-brand-hero grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div>
            <p className="premium-brand-kicker inline-flex px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]">ATS Analyzer</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
              Check the role fit before the application disappears.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
              Compare your resume against the real posting, find missing proof, spot formatting risk, and decide what to fix before you submit.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <SeoTrackedLink
                href="/suite/ats-analyzer"
                eventName="seo_ats_analyzer_click"
                className="inline-flex items-center justify-center rounded-[12px] px-5 py-3 text-sm font-semibold transition hover:opacity-90"
                style={{ background: 'var(--text-primary)', color: 'var(--bg-deep)' }}
              >
                Run ATS analysis
              </SeoTrackedLink>
              <SeoTrackedLink
                href="/tools/resume-builder"
                eventName="seo_resume_builder_click"
                className="inline-flex items-center justify-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)]"
              >
                Build an ATS-ready resume
              </SeoTrackedLink>
            </div>
          </div>

          <aside className="premium-brand-panel rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">What you get</h2>
            <div className="mt-4 space-y-3">
              {['Keyword match and missing terms', 'Resume formatting risk signals', 'Fit score guidance before applying', 'Next-step edits for stronger alignment'].map((item) => (
                <div key={item} className="flex gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 text-sm text-[var(--text-secondary)]">
                  <span className="material-symbols-rounded text-xl text-[var(--accent)]">task_alt</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="mobile-card-rail grid gap-4 py-12 md:grid-cols-3">
          {[
            { title: 'Paste the job description', body: 'Use the actual posting so keywords, responsibilities, and knockout criteria come from the role.' },
            { title: 'Compare your resume', body: 'Check whether your experience is described in the same language recruiters and ATS filters expect.' },
            { title: 'Fix the right gaps', body: 'Improve missing skills, unclear bullets, and formatting issues without stuffing keywords.' },
          ].map((card) => (
            <div key={card.title} className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm">
              <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{card.title}</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{card.body}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-5 pb-12 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Frequently asked questions</h2>
            <div className="mt-5 space-y-2">
              {FAQS.map((faq) => (
                <details key={faq.q} className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                  <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)]">{faq.q}</summary>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
          <RelatedLinks />
        </section>
      </div>
    </main>
  );
}
