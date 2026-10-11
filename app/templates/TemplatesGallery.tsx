'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { TalentConsultingWordmark } from '@/components/BrandLogo';
import { CuratedTemplateMiniature } from '@/components/resume-templates/curated';
import SeoTrackedLink from '@/components/seo/SeoTrackedLink';
import {
  NEW_SIGNATURE_TEMPLATE_IDS,
  getSelectableTemplates,
  type ResumeTemplateMetadata,
} from '@/lib/resume-templates';

const TEMPLATES = getSelectableTemplates();

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'leadership', label: 'Leadership' },
  { id: 'technical', label: 'Technical' },
  { id: 'professional', label: 'Specialist' },
  { id: 'career', label: 'Career paths' },
  { id: 'creative', label: 'Creative' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

const CATEGORY_GROUPS: Record<Exclude<CategoryId, 'all'>, string[]> = {
  leadership: ['executive', 'strategy', 'product', 'nonprofit', 'sales'],
  technical: ['technical', 'data'],
  professional: ['finance', 'legal', 'healthcare', 'academic', 'public-sector'],
  career: ['transition', 'early-career'],
  creative: ['creative', 'design', 'editorial'],
};

function matchesCategory(template: ResumeTemplateMetadata, category: CategoryId) {
  return category === 'all' || CATEGORY_GROUPS[category].includes(template.category);
}

function TemplatePreview({ template }: { template: ResumeTemplateMetadata }) {
  if (template.thumbnail) {
    return (
      <img
        src={template.thumbnail}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover object-top"
      />
    );
  }

  if (NEW_SIGNATURE_TEMPLATE_IDS.includes(template.id as (typeof NEW_SIGNATURE_TEMPLATE_IDS)[number])) {
    return <CuratedTemplateMiniature template={template} />;
  }

  return null;
}

function TemplateCard({ template }: { template: ResumeTemplateMetadata }) {
  const href = `/suite/resume?template=${encodeURIComponent(template.slug)}`;
  const isPro = template.tier === 'pro';
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      className="elevation-interactive group overflow-hidden rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)] transition-all hover:-translate-y-1 hover:border-[var(--border)]"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-[var(--paper)]">
        <TemplatePreview template={template} />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-secondary)]">
            {template.atsClassification}
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
            isPro
              ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
          }`}>
            {isPro ? 'STANDARD' : 'FREE'}
          </span>
        </div>
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-center opacity-100 transition-opacity md:inset-0 md:bg-[var(--bg-deep)]/70 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <SeoTrackedLink
            href={href}
            eventName="seo_template_click"
            className="btn-primary inline-flex min-h-[44px] items-center rounded-xl px-5 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-dim)]"
          >
            {isPro ? 'Preview in Studio' : 'Use this template'} →
          </SeoTrackedLink>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {template.category.replace(/-/g, ' ')}
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">
              {template.name}
            </h2>
          </div>
          {/* Per-template identity hue is template DATA (like plan-identity brand
              colours), not a hardcoded literal in this component. */}
          <span className="material-symbols-rounded text-[20px]" style={{ color: template.colors.primary }}>
            {template.icon}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          {template.description}
        </p>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Built for {template.audience.join(' and ')}.
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {template.filterTags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-muted)]"
            >
              {tag.replace(/-/g, ' ')}
            </span>
          ))}
        </div>
      </div>
    </motion.article>
  );
}

export default function TemplatesGallery() {
  const [filter, setFilter] = useState<CategoryId>('all');
  const filtered = TEMPLATES.filter(template => matchesCategory(template, filter));

  return (
    <main className="min-h-dvh bg-[var(--bg-deep)]">
      <nav className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 sm:px-6">
          <Link href="/" aria-label="TalentConsulting.io home" className="inline-flex min-w-0 items-center">
            <TalentConsultingWordmark className="w-[min(210px,48vw)]" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/#pricing-section" className="inline-flex min-h-[44px] items-center text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
              Pricing
            </Link>
            <SeoTrackedLink
              href="/suite/resume"
              eventName="seo_template_click"
              className="btn-primary inline-flex min-h-[44px] items-center rounded-lg px-4 text-xs font-semibold"
            >
              Open Studio
            </SeoTrackedLink>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-5 pb-10 pt-16 text-center sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">TalentConsulting Signature Collection</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
          {TEMPLATES.length} resume formats for different professional signals
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)]">
          Three foundational templates are free and the curated signature designs are available with Standard.
          Every design keeps real text, includes a linear Word companion, and states its ATS posture honestly.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-xs leading-relaxed text-[var(--text-muted)]">
          ATS behavior varies by employer and software; no template can guarantee compatibility with every system.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-2" role="group" aria-label="Filter resume templates">
          {CATEGORIES.map(category => (
            <button
              key={category.id}
              type="button"
              onClick={() => setFilter(category.id)}
              aria-pressed={filter === category.id}
              className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-xs font-semibold outline-none transition focus-visible:ring-4 focus-visible:ring-[var(--accent-dim)] ${
                filter === category.id
                  ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text-primary)]'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-6" aria-live="polite">
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-sm text-[var(--text-muted)]">
            {filtered.length} {filtered.length === 1 ? 'template' : 'templates'}
          </p>
          <p className="text-xs text-[var(--text-muted)]">PDF + linear DOCX companion</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(template => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] py-16 text-center">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Ready to shape the right first impression?</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-[var(--text-secondary)]">
          Bring your real experience. The Studio preserves your content while you compare structure, hierarchy, and export behavior.
        </p>
        <SeoTrackedLink
          href="/suite/resume"
          eventName="seo_template_click"
          className="btn-primary mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-6 text-sm font-semibold"
        >
          Build your resume →
        </SeoTrackedLink>

        <div className="mx-auto mt-12 grid max-w-4xl gap-4 px-5 text-left md:grid-cols-3">
          {[
            { href: '/resume-examples/project-manager', title: 'Project Manager Example', desc: 'Use metrics, scope, and delivery language.' },
            { href: '/resume-keywords/marketing', title: 'Marketing Keywords', desc: 'Match acquisition, lifecycle, and analytics terms.' },
            { href: '/tools/ats-analyzer', title: 'ATS Analyzer', desc: 'Check keyword fit before applying.' },
          ].map(guide => (
            <Link
              key={guide.href}
              href={guide.href}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 transition hover:border-[var(--border)] hover:bg-[var(--bg-hover)]"
            >
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{guide.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{guide.desc}</p>
            </Link>
          ))}
        </div>

        <div className="mx-auto mt-14 max-w-2xl space-y-4 px-5 text-left text-[var(--text-secondary)]">
          <h3 className="mb-4 text-center text-lg font-bold text-[var(--text-primary)]">
            Frequently Asked Questions
          </h3>
          {[
            {
              q: 'Which resume templates are free?',
              a: 'Editorial Authority, Technical Signal, and Brutalist Voltage are free. The new curated signature designs require Standard.',
            },
            {
              q: 'Are the templates guaranteed to work with every ATS?',
              a: 'No template can guarantee compatibility with every employer or system. Each design is labeled ATS-first, ATS-conscious, or Human-first so you can choose deliberately.',
            },
            {
              q: 'Can I customize the templates?',
              a: 'Yes. Your verified resume content stays intact while you compare structures, palettes, hierarchy, and export behavior in Resume Studio.',
            },
            {
              q: 'What file formats can I download?',
              a: 'Each design includes a styled, selectable-text PDF and a deliberately linear Word companion for easier editing and conservative parsing workflows.',
            },
          ].map(faq => (
            <details
              key={faq.q}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4"
            >
              <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)]">
                {faq.q}
              </summary>
              <p className="mt-2 text-sm leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
