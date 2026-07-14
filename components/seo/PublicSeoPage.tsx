import Link from 'next/link';
import { TalentConsultingWordmark } from '@/components/BrandLogo';
import SeoTrackedLink from './SeoTrackedLink';
import { CORE_RELATED_LINKS, RelatedLinks } from './RelatedLinks';

type ContentBlock = {
  title: string;
  items: string[];
};

export default function PublicSeoPage({
  eyebrow,
  title,
  description,
  primaryCta,
  secondaryCta,
  blocks,
  calloutTitle,
  calloutBody,
}: {
  eyebrow: string;
  title: string;
  description: string;
  primaryCta: {
    label: string;
    href: string;
    eventName: 'seo_resume_builder_click' | 'seo_ats_analyzer_click' | 'seo_interview_prep_click';
  };
  secondaryCta: {
    label: string;
    href: string;
    eventName: 'seo_resume_builder_click' | 'seo_ats_analyzer_click' | 'seo_interview_prep_click' | 'seo_template_click' | 'seo_signup_click';
  };
  blocks: ContentBlock[];
  calloutTitle: string;
  calloutBody: string;
}) {
  return (
    <main className="min-h-dvh bg-[var(--bg-deep)] text-[var(--text-primary)]">
      <nav className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-deep)_88%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="TalentConsulting.io home" className="inline-flex min-w-0 items-center">
            <TalentConsultingWordmark className="w-[min(210px,48vw)]" />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/templates" className="text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">Templates</Link>
            <Link href="/tools/ats-analyzer" className="text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">ATS Analyzer</Link>
            <Link href="/blog" className="text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">Blog</Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          <Link href="/" className="hover:text-[var(--text-primary)]">Home</Link>
          <span>/</span>
          <span>{eyebrow}</span>
        </div>

        <section className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]">{eyebrow}</div>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">{title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">{description}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <SeoTrackedLink
                href={primaryCta.href}
                eventName={primaryCta.eventName}
                className="inline-flex items-center justify-center rounded-[12px] px-5 py-3 text-sm font-semibold transition hover:opacity-90"
                style={{ background: 'var(--text-primary)', color: 'var(--bg-deep)' }}
              >
                {primaryCta.label}
              </SeoTrackedLink>
              <SeoTrackedLink
                href={secondaryCta.href}
                eventName={secondaryCta.eventName}
                className="inline-flex items-center justify-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)]"
              >
                {secondaryCta.label}
              </SeoTrackedLink>
            </div>
          </div>

          <aside className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Use this guide with</h2>
            <div className="mt-4 space-y-3">
              {CORE_RELATED_LINKS.slice(0, 3).map((link) => (
                <Link key={link.href} href={link.href} className="flex gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 transition hover:border-[var(--border)]">
                  <span className="material-symbols-rounded text-xl text-[var(--accent)]">{link.icon}</span>
                  <span>
                    <span className="block text-sm font-medium text-[var(--text-primary)]">{link.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">{link.description}</span>
                  </span>
                </Link>
              ))}
            </div>
          </aside>
        </section>

        <section className="grid gap-4 py-8 md:grid-cols-3">
          {blocks.map((block) => (
            <div key={block.title} className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm">
              <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{block.title}</h2>
              <ul className="mt-4 space-y-3">
                {block.items.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-6 text-[var(--text-secondary)]">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{calloutTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{calloutBody}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <SeoTrackedLink
                href={primaryCta.href}
                eventName={primaryCta.eventName}
                className="inline-flex items-center justify-center rounded-[12px] px-5 py-3 text-sm font-semibold transition hover:opacity-90"
                style={{ background: 'var(--text-primary)', color: 'var(--bg-deep)' }}
              >
                {primaryCta.label}
              </SeoTrackedLink>
              <Link
                href="/tools/ai-humanizer"
                className="inline-flex items-center justify-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)]"
              >
                Polish career writing
              </Link>
              <SeoTrackedLink
                href="/suite"
                eventName="seo_signup_click"
                className="inline-flex items-center justify-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--border)] hover:text-[var(--text-primary)]"
              >
                Start free
              </SeoTrackedLink>
            </div>
          </div>
          <RelatedLinks />
        </section>

        <section className="pb-12">
          <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm">
            <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">Source context</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Use this guide with current occupation and labor market context from the{' '}
              <a
                href="https://www.bls.gov/ooh/"
                rel="noopener noreferrer"
                target="_blank"
                className="font-medium text-[var(--accent)] hover:underline"
              >
                Bureau of Labor Statistics Occupational Outlook Handbook
              </a>.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
