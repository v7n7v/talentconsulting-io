'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { TalentConsultingWordmark } from '@/components/BrandLogo';
import { useTheme } from '@/components/ThemeProvider';
import SeoTrackedLink from '@/components/seo/SeoTrackedLink';

const TEMPLATES = [
  {
    id: 'executive',
    name: 'Executive',
    category: 'Professional',
    description: 'Clean, authoritative layout for senior professionals and leadership roles. Optimized for executive recruiters and ATS parsing.',
    tags: ['ATS-Optimized', 'Senior', 'Leadership'],
    color: 'from-slate-500 to-slate-700',
    accent: '#475569',
    sections: ['Professional Summary', 'Executive Experience', 'Board Memberships', 'Education', 'Certifications'],
  },
  {
    id: 'modern-clean',
    name: 'Modern Clean',
    category: 'Modern',
    description: 'Minimalist, contemporary layout with strong typography. Perfect for tech, design, and creative roles that value clarity.',
    tags: ['ATS-Optimized', 'Tech', 'Design'],
    color: 'from-emerald-500 to-teal-600',
    accent: '#10b981',
    sections: ['Summary', 'Experience', 'Skills Grid', 'Education', 'Projects'],
  },
  {
    id: 'ats-classic',
    name: 'ATS Classic',
    category: 'ATS-First',
    description: 'Maximum ATS compatibility. Zero-graphics, single-column layout that every applicant tracking system can parse perfectly.',
    tags: ['Max ATS Score', 'Single Column', 'Universal'],
    color: 'from-blue-500 to-indigo-600',
    accent: '#3b82f6',
    sections: ['Objective', 'Experience', 'Skills', 'Education', 'References'],
  },
  {
    id: 'two-column',
    name: 'Two Column',
    category: 'Modern',
    description: 'Efficient two-column layout that maximizes space. Sidebar for skills and contact, main column for experience.',
    tags: ['ATS-Optimized', 'Space-Efficient', 'Visual'],
    color: 'from-violet-500 to-purple-600',
    accent: '#8b5cf6',
    sections: ['Profile', 'Experience', 'Skills Sidebar', 'Education', 'Languages'],
  },
  {
    id: 'creative-bold',
    name: 'Creative Bold',
    category: 'Creative',
    description: 'Stand out with bold typography and strategic color accents. Ideal for marketing, media, and creative agencies.',
    tags: ['Creative', 'Marketing', 'Bold'],
    color: 'from-rose-500 to-pink-600',
    accent: '#f43f5e',
    sections: ['Brand Statement', 'Portfolio Highlights', 'Experience', 'Skills', 'Education'],
  },
  {
    id: 'tech-minimal',
    name: 'Tech Minimal',
    category: 'Tech',
    description: 'Developer-focused layout with dedicated sections for tech stack, GitHub projects, and contributions.',
    tags: ['ATS-Optimized', 'Engineering', 'Developer'],
    color: 'from-cyan-500 to-blue-600',
    accent: '#06b6d4',
    sections: ['Summary', 'Tech Stack', 'Experience', 'Open Source', 'Education'],
  },
  {
    id: 'academic',
    name: 'Academic CV',
    category: 'Professional',
    description: 'Comprehensive CV format for academia, research, and medical professions. Includes publications and grants sections.',
    tags: ['CV Format', 'Research', 'Medical'],
    color: 'from-amber-500 to-orange-600',
    accent: '#f59e0b',
    sections: ['Research Interests', 'Publications', 'Teaching', 'Grants', 'Education'],
  },
  {
    id: 'entry-level',
    name: 'Entry Level',
    category: 'Entry',
    description: 'Designed for recent graduates and career changers. Emphasizes education, skills, and potential over extensive work history.',
    tags: ['New Grad', 'Career Change', 'ATS-Optimized'],
    color: 'from-green-500 to-emerald-600',
    accent: '#22c55e',
    sections: ['Objective', 'Education', 'Skills', 'Projects', 'Volunteer Work'],
  },
];

const CATEGORIES = ['All', 'Professional', 'Modern', 'ATS-First', 'Creative', 'Tech', 'Entry'];

function TemplateCard({ template, isLight }: { template: typeof TEMPLATES[0]; isLight: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={`group rounded-2xl overflow-hidden border transition-all hover:scale-[1.02] hover:shadow-xl ${
        isLight ? 'bg-white border-gray-200 shadow-sm' : 'bg-white/[0.03] border-white/[0.06]'
      }`}
    >
      {/* Template Preview */}
      <div className={`relative h-64 bg-gradient-to-br ${template.color} p-6 overflow-hidden`}>
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative z-10 h-full flex flex-col justify-between">
          {/* Mini resume preview lines */}
          <div className="space-y-2">
            <div className="h-3 w-32 bg-white/30 rounded" />
            <div className="h-2 w-48 bg-white/20 rounded" />
            <div className="mt-4 space-y-1.5">
              <div className="h-1.5 w-full bg-white/15 rounded" />
              <div className="h-1.5 w-4/5 bg-white/15 rounded" />
              <div className="h-1.5 w-3/4 bg-white/15 rounded" />
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="h-1.5 w-full bg-white/10 rounded" />
              <div className="h-1.5 w-5/6 bg-white/10 rounded" />
            </div>
          </div>
          <div className="flex gap-1.5">
            {template.tags.map(tag => (
              <span key={tag} className="text-[9px] px-2 py-0.5 rounded-full bg-white/20 text-white font-medium">{tag}</span>
            ))}
          </div>
        </div>
        {/* Hover CTA */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <SeoTrackedLink
            href="/suite/resume"
            eventName="seo_template_click"
            className="px-5 py-2.5 bg-white text-gray-900 rounded-xl text-sm font-semibold hover:bg-gray-100 transition-colors"
          >
            Use This Template →
          </SeoTrackedLink>
        </div>
      </div>

      {/* Info */}
      <div className="p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className={`text-lg font-bold ${isLight ? 'text-gray-900' : 'text-white/90'}`}>{template.name}</h3>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isLight ? 'bg-gray-100 text-gray-600' : 'bg-white/[0.06] text-white/40'}`}>
            {template.category}
          </span>
        </div>
        <p className={`text-sm leading-relaxed mb-3 ${isLight ? 'text-gray-600' : 'text-white/40'}`}>
          {template.description}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {template.sections.map(section => (
            <span key={section} className={`text-[10px] px-2 py-0.5 rounded-md ${isLight ? 'bg-gray-50 text-gray-500 border border-gray-100' : 'bg-white/[0.04] text-white/25'}`}>
              {section}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function TemplatesGallery() {
  const [filter, setFilter] = useState('All');
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const filtered = filter === 'All' ? TEMPLATES : TEMPLATES.filter(t => t.category === filter);

  return (
    <div className={`min-h-dvh ${isLight ? 'bg-gray-50' : 'bg-[#0a0a0b]'}`}>
      {/* Nav */}
      <nav className={`sticky top-0 z-50 backdrop-blur-xl border-b ${isLight ? 'bg-white/80 border-gray-200' : 'bg-[#0a0a0b]/80 border-white/[0.04]'}`}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" aria-label="TalentConsulting.io home" className="inline-flex min-w-0 items-center">
            <TalentConsultingWordmark className="w-[min(210px,48vw)]" />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/#pricing-section" className={`text-xs ${isLight ? 'text-gray-500 hover:text-gray-900' : 'text-white/30 hover:text-white/60'} transition-colors`}>Pricing</Link>
            <SeoTrackedLink href="/suite/resume" eventName="seo_template_click" className="text-xs font-medium text-black bg-gradient-to-r from-emerald-400 to-teal-400 px-4 py-1.5 rounded-lg hover:from-emerald-300 hover:to-teal-300 transition-all">
              Build Resume
            </SeoTrackedLink>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-10 text-center">
        <h1 className={`text-3xl md:text-4xl font-bold tracking-tight mb-3 ${isLight ? 'text-gray-900' : 'text-white/90'}`}>
          Free ATS Resume Templates
        </h1>
        <p className={`text-base max-w-xl mx-auto mb-8 ${isLight ? 'text-gray-500' : 'text-white/30'}`}>
          Professional resume templates designed to pass applicant tracking systems. Pick a template, customize with AI, and download in PDF or Word.
        </p>

        {/* Category Filter */}
        <div className="flex flex-wrap justify-center gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === cat
                  ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25'
                  : isLight
                    ? 'bg-gray-100 text-gray-500 hover:bg-gray-200 border border-transparent'
                    : 'bg-white/[0.04] text-white/30 hover:bg-white/[0.08] border border-transparent'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* Grid */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(template => (
            <TemplateCard key={template.id} template={template} isLight={isLight} />
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className={`border-t py-16 text-center ${isLight ? 'border-gray-200 bg-white' : 'border-white/[0.04] bg-white/[0.01]'}`}>
        <h2 className={`text-2xl font-bold mb-3 ${isLight ? 'text-gray-900' : 'text-white/80'}`}>
          Ready to build your resume?
        </h2>
        <p className={`text-sm mb-6 max-w-md mx-auto ${isLight ? 'text-gray-500' : 'text-white/25'}`}>
          Our AI morphs your resume to match any job description. ATS-optimized, recruiter-approved. Free to start.
        </p>
        <SeoTrackedLink href="/suite/resume" eventName="seo_template_click" className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-black text-sm font-semibold rounded-xl hover:from-emerald-400 hover:to-teal-400 transition-all">
          Start Building Free →
        </SeoTrackedLink>

        <div className="mx-auto mt-12 grid max-w-4xl gap-4 text-left md:grid-cols-3">
          {[
            { href: '/resume-examples/project-manager', title: 'Project Manager Example', desc: 'Use metrics, scope, and delivery language.' },
            { href: '/resume-keywords/marketing', title: 'Marketing Keywords', desc: 'Match acquisition, lifecycle, and analytics terms.' },
            { href: '/tools/ats-analyzer', title: 'ATS Analyzer', desc: 'Check keyword fit before applying.' },
          ].map((guide) => (
            <Link
              key={guide.href}
              href={guide.href}
              className={`rounded-xl border p-4 transition-all ${isLight ? 'bg-gray-50 border-gray-200 hover:bg-white' : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'}`}
            >
              <h3 className={`text-sm font-semibold ${isLight ? 'text-gray-900' : 'text-white/70'}`}>{guide.title}</h3>
              <p className={`mt-2 text-xs leading-relaxed ${isLight ? 'text-gray-500' : 'text-white/30'}`}>{guide.desc}</p>
            </Link>
          ))}
        </div>

        {/* FAQ Schema content */}
        <div className={`max-w-2xl mx-auto mt-16 text-left space-y-4 ${isLight ? 'text-gray-600' : 'text-white/30'}`}>
          <h3 className={`text-lg font-bold mb-4 text-center ${isLight ? 'text-gray-900' : 'text-white/60'}`}>Frequently Asked Questions</h3>
          {[
            { q: 'Are these resume templates free?', a: 'Yes! All templates are free to use. You can build, preview, and customize your resume at no cost. Download as PDF or Word with a free account.' },
            { q: 'Are the templates ATS-compatible?', a: 'Absolutely. Every template is designed to parse correctly through Applicant Tracking Systems like Workday, Lever, Greenhouse, and iCIMS. Our ATS Classic template achieves maximum compatibility scores.' },
            { q: 'Can I customize the templates?', a: 'Yes. Once you select a template, our AI-powered editor lets you customize every section. You can also use our AI Morph feature to automatically tailor your resume to match a specific job description.' },
            { q: 'What file formats can I download?', a: 'You can download your resume as a styled PDF (retains the template design) or as a Word .docx file (ATS-optimized, plain formatting for maximum scanner compatibility).' },
          ].map((faq, i) => (
            <details key={i} className={`rounded-xl border p-4 ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-white/[0.02] border-white/[0.06]'}`}>
              <summary className={`font-medium cursor-pointer text-sm ${isLight ? 'text-gray-900' : 'text-white/60'}`}>{faq.q}</summary>
              <p className="mt-2 text-sm leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
