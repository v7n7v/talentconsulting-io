'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { TalentConsultingWordmark } from '@/components/BrandLogo';
import { useTheme } from '@/components/ThemeProvider';
import { BLOG_POSTS } from './posts';
import type { BlogPost } from './posts';

export default function BlogIndex() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div className={`min-h-dvh ${isLight ? 'bg-gray-50' : 'bg-[#0a0a0b]'}`}>
      {/* Nav */}
      <nav className={`sticky top-0 z-50 backdrop-blur-xl border-b ${isLight ? 'bg-white/80 border-gray-200' : 'bg-[#0a0a0b]/80 border-white/[0.04]'}`}>
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" aria-label="TalentConsulting.io home" className="inline-flex min-w-0 items-center">
            <TalentConsultingWordmark className="w-[min(210px,48vw)]" />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/templates" className={`text-xs ${isLight ? 'text-gray-500 hover:text-gray-900' : 'text-white/30 hover:text-white/60'} transition-colors`}>Templates</Link>
            <Link href="/tools/ai-detector" className={`text-xs ${isLight ? 'text-gray-500 hover:text-gray-900' : 'text-white/30 hover:text-white/60'} transition-colors`}>AI Detector</Link>
            <Link href="/tools/resume-builder" className="text-xs font-medium text-black bg-gradient-to-r from-emerald-400 to-teal-400 px-4 py-1.5 rounded-lg">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className={`text-3xl md:text-4xl font-bold tracking-tight mb-3 ${isLight ? 'text-gray-900' : 'text-white/90'}`}>
            Career Intelligence Blog
          </h1>
          <p className={`text-base max-w-lg mx-auto ${isLight ? 'text-gray-500' : 'text-white/30'}`}>
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
                className={`block rounded-2xl border p-6 transition-all hover:scale-[1.01] group ${
                  isLight ? 'bg-white border-gray-200 shadow-sm hover:shadow-md' : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br ${post.color} border flex items-center justify-center`}>
                    <span className={`material-symbols-rounded text-xl ${isLight ? 'text-gray-700' : 'text-white/50'}`}>{post.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isLight ? 'bg-gray-100 text-gray-500' : 'bg-white/[0.06] text-white/30'}`}>{post.category}</span>
                      <span className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-white/15'}`}>{post.readTime} read</span>
                    </div>
                    <h2 className={`text-lg font-bold mb-1 group-hover:text-emerald-500 transition-colors ${isLight ? 'text-gray-900' : 'text-white/80'}`}>
                      {post.title}
                    </h2>
                    <p className={`text-sm leading-relaxed ${isLight ? 'text-gray-500' : 'text-white/30'}`}>
                      {post.description}
                    </p>
                    <p className={`text-[10px] mt-2 ${isLight ? 'text-gray-400' : 'text-white/15'}`}>{post.date}</p>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        <div className={`mt-8 rounded-2xl border p-6 ${isLight ? 'bg-white border-gray-200 shadow-sm' : 'bg-white/[0.02] border-white/[0.06]'}`}>
          <h2 className={`text-lg font-bold mb-4 ${isLight ? 'text-gray-900' : 'text-white/80'}`}>Popular job seeker guides</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { href: '/resume-examples/software-engineer', title: 'Resume examples' },
              { href: '/resume-keywords/software-engineering', title: 'Resume keywords' },
              { href: '/interview-questions/product-manager', title: 'Interview questions' },
            ].map((guide) => (
              <Link
                key={guide.href}
                href={guide.href}
                className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${isLight ? 'border-gray-200 text-gray-700 hover:bg-gray-50' : 'border-white/[0.06] text-white/50 hover:bg-white/[0.04]'}`}
              >
                {guide.title}
              </Link>
            ))}
          </div>
        </div>

        <div className={`mt-6 rounded-2xl border p-5 ${isLight ? 'bg-white border-gray-200 shadow-sm' : 'bg-white/[0.02] border-white/[0.06]'}`}>
          <h2 className={`text-base font-bold mb-2 ${isLight ? 'text-gray-900' : 'text-white/80'}`}>Source context</h2>
          <p className={`text-sm leading-6 ${isLight ? 'text-gray-500' : 'text-white/30'}`}>
            For labor market and occupation context, compare this guidance with the{' '}
            <a href="https://www.bls.gov/ooh/" rel="noopener noreferrer" target="_blank" className="text-emerald-500 hover:underline">
              Bureau of Labor Statistics Occupational Outlook Handbook
            </a>.
          </p>
        </div>

        {/* Newsletter CTA */}
        <div className={`mt-12 rounded-2xl border p-8 text-center ${isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/[0.04] border-emerald-500/20'}`}>
          <h3 className={`text-xl font-bold mb-2 ${isLight ? 'text-gray-900' : 'text-white/70'}`}>Get career tips in your inbox</h3>
          <p className={`text-sm mb-4 ${isLight ? 'text-gray-500' : 'text-white/30'}`}>Weekly resume tips, interview strategies, and job market insights. No spam.</p>
          <div className="flex max-w-sm mx-auto gap-2">
            <input
              type="email"
              placeholder="your@email.com"
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm border focus:outline-none focus:border-emerald-500/50 ${isLight ? 'bg-white border-gray-200 text-gray-900' : 'bg-white/[0.04] border-white/[0.08] text-white/80'}`}
            />
            <button className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-black text-xs font-semibold rounded-xl hover:from-emerald-400 hover:to-teal-400 transition-all whitespace-nowrap">
              Subscribe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
