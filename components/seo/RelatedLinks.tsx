import Link from 'next/link';

export type RelatedLink = {
  title: string;
  description: string;
  href: string;
  icon: string;
};

export const CORE_RELATED_LINKS: RelatedLink[] = [
  {
    title: 'AI Resume Builder',
    description: 'Build an ATS-ready resume and tailor it to a job description.',
    href: '/tools/resume-builder',
    icon: 'description',
  },
  {
    title: 'ATS Analyzer',
    description: 'Check resume fit, keyword gaps, and formatting risk before applying.',
    href: '/tools/ats-analyzer',
    icon: 'analytics',
  },
  {
    title: 'Interview Prep',
    description: 'Practice behavioral and role-specific questions with AI feedback.',
    href: '/tools/interview-prep',
    icon: 'record_voice_over',
  },
  {
    title: 'Resume Templates',
    description: 'Start from clean, ATS-friendly resume layouts.',
    href: '/templates',
    icon: 'view_quilt',
  },
];

export function RelatedLinks({
  title = 'Related tools and guides',
  links = CORE_RELATED_LINKS,
}: {
  title?: string;
  links?: RelatedLink[];
}) {
  return (
    <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-sm">
      <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">{title}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 transition hover:border-[var(--border)]"
          >
            <span className="material-symbols-rounded text-2xl text-[var(--accent)]">{link.icon}</span>
            <h3 className="mt-2 text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)]">
              {link.title}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{link.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
