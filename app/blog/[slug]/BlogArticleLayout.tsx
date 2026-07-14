'use client';

import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';
import { BLOG_POSTS } from '../posts';
import { notFound } from 'next/navigation';

// Article content registry
const ARTICLES: Record<string, { content: React.ReactNode }> = {};

export function registerArticle(slug: string, content: React.ReactNode) {
  ARTICLES[slug] = { content };
}

export default function BlogArticleLayout({ slug }: { slug: string }) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const post = BLOG_POSTS.find(p => p.slug === slug);

  if (!post) return notFound();

  const article = ARTICLES[slug];

  return (
    <div className={`min-h-dvh ${isLight ? 'bg-gray-50' : 'bg-[#0a0a0b]'}`}>
      {/* Nav */}
      <nav className={`sticky top-0 z-50 backdrop-blur-xl border-b ${isLight ? 'bg-white/80 border-gray-200' : 'bg-[#0a0a0b]/80 border-white/[0.04]'}`}>
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/blog" className={`text-xs flex items-center gap-1 ${isLight ? 'text-gray-500 hover:text-gray-900' : 'text-white/30 hover:text-white/60'} transition-colors`}>
            ← Back to Blog
          </Link>
          <Link href="/tools/resume-builder" className="text-xs font-medium text-black bg-gradient-to-r from-emerald-400 to-teal-400 px-4 py-1.5 rounded-lg">
            Try Free →
          </Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isLight ? 'bg-gray-100 text-gray-500' : 'bg-white/[0.06] text-white/30'}`}>{post.category}</span>
            <span className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-white/15'}`}>{post.readTime} read · {post.date}</span>
          </div>
          <h1 className={`text-2xl md:text-3xl font-bold tracking-tight leading-tight mb-4 ${isLight ? 'text-gray-900' : 'text-white/90'}`}>
            {post.title}
          </h1>
          <p className={`text-base leading-relaxed ${isLight ? 'text-gray-500' : 'text-white/35'}`}>
            {post.description}
          </p>
        </header>

        {/* Content */}
        <div className={`prose max-w-none ${isLight ? 'prose-gray' : 'prose-invert'} prose-sm
          prose-headings:font-bold prose-headings:tracking-tight
          prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-3
          prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-2
          prose-p:leading-relaxed
          prose-a:text-emerald-500 prose-a:no-underline hover:prose-a:underline
          prose-strong:font-semibold
          prose-ul:my-4 prose-li:my-1
        `}>
          {article?.content || (
            <div className={`p-8 rounded-2xl border text-center ${isLight ? 'bg-white border-gray-200' : 'bg-white/[0.02] border-white/[0.06]'}`}>
              <p className={`text-sm ${isLight ? 'text-gray-500' : 'text-white/30'}`}>This article is coming soon.</p>
              <Link href="/blog" className="text-sm text-emerald-500 hover:underline mt-2 inline-block">← Browse other articles</Link>
            </div>
          )}
        </div>

        {/* Author + CTA */}
        <div className={`mt-12 p-6 rounded-2xl border text-center ${isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/[0.04] border-emerald-500/20'}`}>
          <h3 className={`text-base font-bold mb-2 ${isLight ? 'text-gray-900' : 'text-white/70'}`}>
            Build your resume with AI
          </h3>
          <p className={`text-sm mb-4 ${isLight ? 'text-gray-500' : 'text-white/30'}`}>
            Apply the tips from this article using our AI-powered resume builder. Free to start.
          </p>
          <Link href="/tools/resume-builder" className="inline-block px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-black text-xs font-semibold rounded-lg">
            Start Building Free →
          </Link>
        </div>

        <div className={`mt-6 rounded-2xl border p-5 ${isLight ? 'bg-white border-gray-200' : 'bg-white/[0.02] border-white/[0.06]'}`}>
          <h3 className={`text-base font-bold mb-4 ${isLight ? 'text-gray-900' : 'text-white/70'}`}>Related tools and guides</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { href: '/tools/resume-builder', title: 'AI Resume Builder', desc: 'Turn the advice into an ATS-ready resume.' },
              { href: '/tools/ats-analyzer', title: 'ATS Analyzer', desc: 'Check keyword fit before you apply.' },
              { href: '/tools/interview-prep', title: 'Interview Prep', desc: 'Practice role-specific answers.' },
              { href: '/resume-keywords/software-engineering', title: 'Resume Keywords', desc: 'Browse keyword guides by industry.' },
            ].map((link) => (
              <Link key={link.href} href={link.href} className={`rounded-xl border p-4 transition ${isLight ? 'border-gray-200 hover:bg-gray-50' : 'border-white/[0.06] hover:bg-white/[0.04]'}`}>
                <span className={`block text-sm font-semibold ${isLight ? 'text-gray-900' : 'text-white/70'}`}>{link.title}</span>
                <span className={`mt-1 block text-xs leading-relaxed ${isLight ? 'text-gray-500' : 'text-white/30'}`}>{link.desc}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className={`mt-6 rounded-2xl border p-5 ${isLight ? 'bg-white border-gray-200' : 'bg-white/[0.02] border-white/[0.06]'}`}>
          <h3 className={`text-base font-bold mb-2 ${isLight ? 'text-gray-900' : 'text-white/70'}`}>Source context</h3>
          <p className={`text-sm leading-6 ${isLight ? 'text-gray-500' : 'text-white/30'}`}>
            Use this guidance with current labor market and hiring context from the{' '}
            <a href="https://www.bls.gov/ooh/" rel="noopener noreferrer" target="_blank" className="text-emerald-500 hover:underline">
              Bureau of Labor Statistics Occupational Outlook Handbook
            </a>{' '}
            and{' '}
            <a href="https://www.roberthalf.com/us/en/insights/research" rel="noopener noreferrer" target="_blank" className="text-emerald-500 hover:underline">
              Robert Half research
            </a>.
          </p>
        </div>
      </article>
    </div>
  );
}
