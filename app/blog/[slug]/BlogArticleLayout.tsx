'use client';

import Link from 'next/link';
import { BLOG_POSTS } from '../posts';
import { notFound } from 'next/navigation';

// Article content registry
const ARTICLES: Record<string, { content: React.ReactNode }> = {};

export function registerArticle(slug: string, content: React.ReactNode) {
  ARTICLES[slug] = { content };
}

export default function BlogArticleLayout({ slug }: { slug: string }) {
  const post = BLOG_POSTS.find(p => p.slug === slug);

  if (!post) return notFound();

  const article = ARTICLES[slug];

  return (
    <div className="min-h-dvh bg-[var(--bg-deep)]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl border-b bg-[var(--bg-deep)]/80 border-[var(--border-subtle)]">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/blog" className="text-xs inline-flex items-center gap-1 min-h-[44px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            ← Back to Blog
          </Link>
          <Link href="/tools/resume-builder" className="text-xs font-medium inline-flex items-center min-h-[44px] text-[var(--accent-on)] bg-[var(--accent)] px-4 rounded-lg">
            Try Free →
          </Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-[var(--bg-surface)] text-[var(--text-muted)]">{post.category}</span>
            <span className="text-[11px] text-[var(--text-muted)]">{post.readTime} read · {post.date}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight leading-tight mb-4 text-[var(--text-primary)]">
            {post.title}
          </h1>
          <p className="text-base leading-relaxed text-[var(--text-secondary)]">
            {post.description}
          </p>
        </header>

        {/* Content */}
        <div className="prose max-w-none prose-sm
          [--tw-prose-body:var(--text-secondary)]
          [--tw-prose-headings:var(--text-primary)]
          [--tw-prose-links:var(--accent)]
          [--tw-prose-bold:var(--text-primary)]
          [--tw-prose-counters:var(--text-muted)]
          [--tw-prose-bullets:var(--border)]
          [--tw-prose-hr:var(--border-subtle)]
          [--tw-prose-quotes:var(--text-primary)]
          [--tw-prose-quote-borders:var(--border-subtle)]
          [--tw-prose-captions:var(--text-muted)]
          [--tw-prose-code:var(--text-primary)]
          [--tw-prose-pre-code:var(--text-secondary)]
          [--tw-prose-pre-bg:var(--bg-surface)]
          [--tw-prose-th-borders:var(--border)]
          [--tw-prose-td-borders:var(--border-subtle)]
          prose-headings:font-bold prose-headings:tracking-tight
          prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-3
          prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-2
          prose-p:leading-relaxed
          prose-a:no-underline hover:prose-a:underline
          prose-strong:font-semibold
          prose-ul:my-4 prose-li:my-1
        ">
          {article?.content || (
            <div className="p-8 rounded-2xl border text-center bg-[var(--card-bg)] border-[var(--border-subtle)]">
              <p className="text-sm text-[var(--text-muted)]">This article is coming soon.</p>
              <Link href="/blog" className="text-sm text-[var(--accent)] hover:underline mt-2 inline-flex items-center min-h-[44px]">← Browse other articles</Link>
            </div>
          )}
        </div>

        {/* Author + CTA */}
        <div className="mt-12 p-6 rounded-2xl border text-center bg-[var(--accent-dim)] border-[var(--border-subtle)]">
          <h3 className="text-base font-bold mb-2 text-[var(--text-primary)]">
            Build your resume with AI
          </h3>
          <p className="text-sm mb-4 text-[var(--text-secondary)]">
            Apply the tips from this article using our AI-powered resume builder. Free to start.
          </p>
          <Link href="/tools/resume-builder" className="inline-flex items-center justify-center min-h-[44px] px-5 bg-[var(--accent)] text-[var(--accent-on)] text-xs font-semibold rounded-lg">
            Start Building Free →
          </Link>
        </div>

        <div className="mt-6 rounded-2xl border p-5 bg-[var(--card-bg)] border-[var(--border-subtle)]">
          <h3 className="text-base font-bold mb-4 text-[var(--text-primary)]">Related tools and guides</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { href: '/tools/resume-builder', title: 'AI Resume Builder', desc: 'Turn the advice into an ATS-ready resume.' },
              { href: '/tools/ats-analyzer', title: 'ATS Analyzer', desc: 'Check keyword fit before you apply.' },
              { href: '/tools/interview-prep', title: 'Interview Prep', desc: 'Practice role-specific answers.' },
              { href: '/resume-keywords/software-engineering', title: 'Resume Keywords', desc: 'Browse keyword guides by industry.' },
            ].map((link) => (
              <Link key={link.href} href={link.href} className="rounded-xl border p-4 transition border-[var(--border-subtle)] hover:bg-[var(--bg-surface)]">
                <span className="block text-sm font-semibold text-[var(--text-primary)]">{link.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-[var(--text-muted)]">{link.desc}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border p-5 bg-[var(--card-bg)] border-[var(--border-subtle)]">
          <h3 className="text-base font-bold mb-2 text-[var(--text-primary)]">Source context</h3>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            Use this guidance with current labor market and hiring context from the{' '}
            <a href="https://www.bls.gov/ooh/" rel="noopener noreferrer" target="_blank" className="text-[var(--accent)] hover:underline">
              Bureau of Labor Statistics Occupational Outlook Handbook
            </a>{' '}
            and{' '}
            <a href="https://www.roberthalf.com/us/en/insights/research" rel="noopener noreferrer" target="_blank" className="text-[var(--accent)] hover:underline">
              Robert Half research
            </a>.
          </p>
        </div>
      </article>
    </div>
  );
}
