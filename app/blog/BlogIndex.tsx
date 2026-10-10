'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { TacoWordmark } from '@/components/BrandLogo';
import { BLOG_POSTS } from './posts';
import type { BlogPost } from './posts';

export default function BlogIndex() {
  return (
    <div className="min-h-dvh bg-[var(--bg-deep)]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl border-b bg-[color-mix(in_srgb,var(--bg-deep)_80%,transparent)] border-[var(--border-subtle)]">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" aria-label="TalentConsulting.io home" className="inline-flex min-w-0 items-center">
            <TacoWordmark className="w-[min(210px,48vw)]" />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/templates" className="inline-flex items-center min-h-[44px] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Templates</Link>
            <Link href="/tools/ai-detector" className="inline-flex items-center min-h-[44px] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">AI Detector</Link>
            <Link href="/tools/resume-builder" className="inline-flex items-center min-h-[44px] text-xs font-medium text-[var(--accent-on)] bg-[var(--accent)] hover:bg-[var(--accent-active)] px-4 py-1.5 rounded-lg transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3 text-[var(--text-primary)]">
            Career Intelligence Blog
          </h1>
          <p className="text-base max-w-lg mx-auto text-[var(--text-secondary)]">
            Actionable career advice backed by data. Resume optimization, interview strategies, and AI tools for the modern job seeker.
          </p>
        </div>

        <div className="space-y-4">
          {BLOG_POSTS.map((post, i) => (
            <motion.div
              key={post.slug}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                href={`/blog/${post.slug}`}
                className="block rounded-2xl border p-6 transition-all hover:scale-[1.01] group bg-[var(--card-bg)] border-[var(--border-subtle)] elevation-interactive"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 shrink-0 rounded-xl bg-[var(--accent-dim)] border border-[var(--border-subtle)] flex items-center justify-center">
                    <span className="material-symbols-rounded text-xl text-[var(--text-secondary)]">{post.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-[var(--border-subtle)] text-[var(--text-muted)]">{post.category}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{post.readTime} read</span>
                    </div>
                    <h2 className="text-lg font-bold mb-1 transition-colors text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                      {post.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                      {post.description}
                    </p>
                    <p className="text-[11px] mt-2 text-[var(--text-muted)]">{post.date}</p>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border p-6 bg-[var(--card-bg)] border-[var(--border-subtle)] elevation-card">
          <h2 className="text-lg font-bold mb-4 text-[var(--text-primary)]">Popular job seeker guides</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { href: '/resume-examples/software-engineer', title: 'Resume examples' },
              { href: '/resume-keywords/software-engineering', title: 'Resume keywords' },
              { href: '/interview-questions/product-manager', title: 'Interview questions' },
            ].map((guide) => (
              <Link
                key={guide.href}
                href={guide.href}
                className="rounded-xl border px-4 py-3 text-sm font-medium transition border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border)]"
              >
                {guide.title}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border p-5 bg-[var(--card-bg)] border-[var(--border-subtle)] elevation-card">
          <h2 className="text-base font-bold mb-2 text-[var(--text-primary)]">Source context</h2>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            For labor market and occupation context, compare this guidance with the{' '}
            <a href="https://www.bls.gov/ooh/" rel="noopener noreferrer" target="_blank" className="text-[var(--accent)] hover:underline">
              Bureau of Labor Statistics Occupational Outlook Handbook
            </a>.
          </p>
        </div>

        {/* Newsletter CTA */}
        <div className="mt-12 rounded-2xl border p-8 text-center bg-[var(--accent-dim)] border-[var(--border-subtle)]">
          <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">Get career tips in your inbox</h3>
          <p className="text-sm mb-4 text-[var(--text-secondary)]">Weekly resume tips, interview strategies, and job market insights. No spam.</p>
          <div className="flex max-w-sm mx-auto gap-2">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl text-base border focus:outline-none bg-[var(--card-bg)] border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)]"
            />
            <button className="min-h-[44px] px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-active)] text-[var(--accent-on)] text-xs font-semibold rounded-xl transition-colors whitespace-nowrap">
              Subscribe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
