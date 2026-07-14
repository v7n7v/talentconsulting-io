'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { TalentConsultingWordmark } from '@/components/BrandLogo';
import { useTheme } from '@/components/ThemeProvider';
import SeoTrackedLink from '@/components/seo/SeoTrackedLink';

const FEATURES = [
  { icon: 'target', title: 'Role-Specific Questions', desc: 'AI generates questions tailored to your target job title, company, and industry. No generic "tell me about yourself" fluff.' },
  { icon: 'star', title: 'STAR Method Coaching', desc: 'Real-time feedback on your Situation, Task, Action, Result structure. Learn the framework interviewers expect.' },
  { icon: 'psychology', title: 'Behavioral + Technical', desc: 'Practice both behavioral and technical interview questions. Cover leadership scenarios, conflict resolution, and domain-specific challenges.' },
  { icon: 'monitoring', title: 'Score & Feedback', desc: 'Every answer is graded on structure, specificity, relevance, and impact. Get actionable tips to improve.' },
  { icon: 'mic', title: 'Natural Conversation', desc: 'Our AI interviewer follows up on your answers like a real interviewer would. No scripted Q&A — adaptive dialogue.' },
  { icon: 'summarize', title: 'Session Summaries', desc: 'After each session, get a detailed report: strengths, weaknesses, and exactly what to practice next.' },
];

const QUESTION_TYPES = [
  { type: 'Behavioral', examples: ['Tell me about a time you led a project under pressure', 'Describe a situation where you disagreed with your manager', 'How do you handle competing priorities?'], color: 'sky' },
  { type: 'Technical', examples: ['Walk me through your system design approach', 'How would you optimize a slow database query?', 'Explain your debugging methodology'], color: 'blue' },
  { type: 'Situational', examples: ['What would you do if a deadline was going to be missed?', 'How would you onboard a new team member remotely?', 'A stakeholder disagrees with your approach — what do you do?'], color: 'amber' },
];

const INDUSTRIES = [
  'Software Engineering', 'Product Management', 'Data Science',
  'Marketing', 'Finance', 'Healthcare',
  'Consulting', 'Sales', 'Operations',
  'Design', 'Human Resources', 'Legal',
];

const FAQS = [
  { q: 'How does AI interview practice work?', a: 'You select a target role and company. Our AI generates realistic interview questions, listens to your answers, and provides structured feedback based on the STAR method, answer specificity, and relevance to the role.' },
  { q: 'Is this like talking to a real interviewer?', a: 'Our AI adapts to your responses with follow-up questions, just like a real interviewer. It\'s not a static Q&A — it\'s a dynamic conversation designed to simulate actual interview pressure.' },
  { q: 'What roles are supported?', a: 'We cover 50+ industries and roles including software engineering, product management, data science, consulting, finance, healthcare, marketing, and more. If your role exists, we have questions for it.' },
  { q: 'Will this actually help me get a job?', a: 'Practice is the #1 predictor of interview performance. Candidates who do 5+ mock interviews are 3x more likely to receive offers. Our AI gives you unlimited, on-demand practice with expert-level feedback.' },
  { q: 'Is there a free version?', a: 'Yes — you get 3 free practice sessions. Pro unlocks unlimited sessions, advanced scoring analytics, session history, and priority question generation.' },
];

export default function InterviewPrepLanding() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div className={`premium-brand-page mobile-app-page min-h-dvh ${isLight ? 'bg-gray-50' : 'bg-[#0a0a0b]'}`}>
      {/* Nav */}
      <nav className={`sticky top-0 z-50 backdrop-blur-xl border-b ${isLight ? 'bg-white/80 border-gray-200' : 'bg-[#0a0a0b]/80 border-white/[0.04]'}`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" aria-label="TalentConsulting.io home" className="inline-flex min-w-0 items-center">
            <TalentConsultingWordmark className="w-[min(210px,48vw)]" />
          </Link>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/tools/resume-builder" className={`hidden text-xs sm:inline ${isLight ? 'text-gray-500 hover:text-gray-900' : 'text-white/30 hover:text-white/60'} transition-colors`}>Resume Builder</Link>
            <Link href="/tools/ai-humanizer" className={`hidden text-xs sm:inline ${isLight ? 'text-gray-500 hover:text-gray-900' : 'text-white/30 hover:text-white/60'} transition-colors`}>AI Humanizer</Link>
            <Link href="/suite/skill-bridge" className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white transition-all hover:bg-blue-500">
              Start Practicing →
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Hero */}
        <section className="premium-brand-hero my-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className={`premium-brand-kicker inline-block text-xs font-medium px-3 py-1 mb-6 ${isLight ? 'bg-blue-50 text-blue-700' : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'}`}>
              AI-Powered Interview Coaching
            </div>
            <h1 className={`text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-5 leading-[1.1] ${isLight ? 'text-gray-900' : 'text-white/90'}`}>
              Practice the story before the room tests it.
            </h1>
            <p className={`text-base md:text-lg max-w-2xl mb-8 ${isLight ? 'text-gray-500' : 'text-white/30'}`}>
              Rehearse with role-specific prompts, follow-ups, and proof-focused feedback so your answers sound prepared, specific, and calm under pressure.
            </p>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
              <SeoTrackedLink href="/suite/skill-bridge" eventName="seo_interview_prep_click" className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-500">
                Start Mock Interview →
              </SeoTrackedLink>
              <Link href="/blog/ai-interview-prep-star-method" className={`px-6 py-3 text-sm font-medium rounded-xl border ${isLight ? 'border-gray-200 text-gray-700 hover:bg-gray-100' : 'border-white/10 text-white/50 hover:bg-white/[0.04]'} transition-all`}>
                Learn STAR Method
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Question Types */}
        <section className="pb-20">
          <h2 className={`text-2xl font-bold text-center mb-10 ${isLight ? 'text-gray-900' : 'text-white/80'}`}>
            Practice every question type
          </h2>
          <div className="mobile-card-rail grid md:grid-cols-3 gap-4">
            {QUESTION_TYPES.map((qt, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`rounded-2xl border p-6 ${isLight ? 'bg-white border-gray-200' : 'bg-white/[0.02] border-white/[0.06]'}`}
              >
                <h3 className={`font-semibold text-sm mb-3 ${isLight ? 'text-gray-900' : 'text-white/70'}`}>{qt.type}</h3>
                <ul className="space-y-2">
                  {qt.examples.map((ex, j) => (
                    <li key={j} className={`text-xs leading-relaxed pl-3 border-l-2 ${
                      qt.color === 'sky' ? 'border-sky-500/30' :
                      qt.color === 'blue' ? 'border-blue-500/30' :
                      'border-amber-500/30'
                    } ${isLight ? 'text-gray-500' : 'text-white/25'}`}>
                      {ex}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="pb-20">
          <h2 className={`text-2xl font-bold text-center mb-10 ${isLight ? 'text-gray-900' : 'text-white/80'}`}>
            More than flashcards
          </h2>
          <div className="mobile-card-rail grid md:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`rounded-2xl border p-6 ${isLight ? 'bg-white border-gray-200' : 'bg-white/[0.02] border-white/[0.06]'}`}
              >
                <span className="material-symbols-rounded icon-neutral text-2xl mb-3 block">{f.icon}</span>
                <h3 className={`font-semibold text-sm mb-1 ${isLight ? 'text-gray-900' : 'text-white/70'}`}>{f.title}</h3>
                <p className={`text-xs leading-relaxed ${isLight ? 'text-gray-500' : 'text-white/25'}`}>{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Industries */}
        <section className="pb-20">
          <h2 className={`text-2xl font-bold text-center mb-3 ${isLight ? 'text-gray-900' : 'text-white/80'}`}>
            Tailored for your industry
          </h2>
          <p className={`text-sm text-center mb-8 ${isLight ? 'text-gray-500' : 'text-white/25'}`}>
            Our AI generates role-specific questions across 50+ industries
          </p>
          <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
            {INDUSTRIES.map((ind, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.03 }}
                className={`text-xs px-3 py-1.5 rounded-full ${isLight ? 'bg-gray-100 text-gray-600' : 'bg-white/[0.04] text-white/30 border border-white/[0.06]'}`}
              >
                {ind}
              </motion.span>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="pb-20">
          <h2 className={`text-2xl font-bold text-center mb-8 ${isLight ? 'text-gray-900' : 'text-white/80'}`}>
            Role-specific interview guides
          </h2>
          <div className="mobile-card-rail grid gap-4 md:grid-cols-3">
            {[
              { href: '/interview-questions/software-engineer', title: 'Software Engineer', desc: 'Practice debugging, tradeoff, and system questions.' },
              { href: '/interview-questions/product-manager', title: 'Product Manager', desc: 'Prepare for product sense and prioritization prompts.' },
              { href: '/interview-questions/customer-success-manager', title: 'Customer Success', desc: 'Practice renewal, onboarding, and escalation stories.' },
            ].map((guide) => (
              <Link
                key={guide.href}
                href={guide.href}
                className={`rounded-2xl border p-5 transition-all hover:scale-[1.01] ${isLight ? 'bg-white border-gray-200 hover:shadow-md' : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'}`}
              >
                <h3 className={`font-semibold text-sm ${isLight ? 'text-gray-900' : 'text-white/70'}`}>{guide.title}</h3>
                <p className={`mt-2 text-xs leading-relaxed ${isLight ? 'text-gray-500' : 'text-white/25'}`}>{guide.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="pb-20">
          <h2 className={`text-2xl font-bold text-center mb-8 ${isLight ? 'text-gray-900' : 'text-white/80'}`}>
            Frequently Asked Questions
          </h2>
          <div className="max-w-2xl mx-auto space-y-2">
            {FAQS.map((faq, i) => (
              <details key={i} className={`rounded-xl border p-4 ${isLight ? 'bg-white border-gray-200' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                <summary className={`font-medium cursor-pointer text-sm ${isLight ? 'text-gray-900' : 'text-white/60'}`}>{faq.q}</summary>
                <p className={`mt-2 text-sm leading-relaxed ${isLight ? 'text-gray-500' : 'text-white/25'}`}>{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="pb-20">
          <div className={`rounded-2xl border p-6 ${isLight ? 'bg-white border-gray-200 shadow-sm' : 'bg-white/[0.02] border-white/[0.06]'}`}>
            <h2 className={`text-lg font-bold mb-2 ${isLight ? 'text-gray-900' : 'text-white/80'}`}>Source context</h2>
            <p className={`text-sm leading-6 ${isLight ? 'text-gray-500' : 'text-white/30'}`}>
              Use interview practice guidance with role context from the{' '}
              <a href="https://www.bls.gov/ooh/" rel="noopener noreferrer" target="_blank" className="text-blue-600 dark:text-blue-300 hover:underline">
                Bureau of Labor Statistics Occupational Outlook Handbook
              </a>.
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="pb-20">
          <div className={`rounded-2xl border p-10 text-center ${isLight ? 'bg-blue-50 border-blue-100' : 'bg-blue-500/[0.04] border-blue-500/20'}`}>
            <h2 className={`text-2xl font-bold mb-3 ${isLight ? 'text-gray-900' : 'text-white/80'}`}>
              The best interview prep is practice
            </h2>
            <p className={`text-sm mb-6 max-w-lg mx-auto ${isLight ? 'text-gray-500' : 'text-white/30'}`}>
              Candidates who practice 5+ mock interviews are 3x more likely to get offers. Start your first session free — no credit card, no commitment.
            </p>
            <SeoTrackedLink href="/suite/skill-bridge" eventName="seo_interview_prep_click" className="inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-500">
              Start Mock Interview Free →
            </SeoTrackedLink>
          </div>
        </section>
      </div>
    </div>
  );
}
