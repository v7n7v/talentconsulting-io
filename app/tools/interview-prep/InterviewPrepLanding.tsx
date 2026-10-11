'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { TalentConsultingWordmark } from '@/components/BrandLogo';
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
  { q: 'What roles are supported?', a: 'Software engineering, product management, data science, marketing, finance, healthcare, consulting, sales, operations, design, human resources and legal. Pick the closest one and the questions adapt to the role you name.' },
  { q: 'What does a session actually give me?', a: 'Six interviewer personas, from a friendly HR screen to a FAANG lead to a structured case, and seven modes running from a quick drill to a full mock with a debrief afterwards. Feedback is structured on the STAR method, how specific your answer was, and how relevant it was to the role.' },
  { q: 'Is there a free version?', a: 'Yes — you get 3 free practice sessions. Standard unlocks unlimited sessions, advanced scoring analytics, session history, and priority question generation.' },
];

export default function InterviewPrepLanding() {
  return (
    <div className="mobile-app-page min-h-dvh bg-[var(--bg-deep)] text-[var(--text-primary)]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl border-b border-[var(--border-subtle)] bg-[var(--bg-deep)]/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" aria-label="TalentConsulting.io home" className="inline-flex min-w-0 items-center">
            <TalentConsultingWordmark className="w-[min(210px,48vw)]" />
          </Link>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/tools/resume-builder" className="hidden text-xs sm:inline-flex items-center min-h-[44px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Resume Builder</Link>
            <Link href="/tools/ai-humanizer" className="hidden text-xs sm:inline-flex items-center min-h-[44px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">AI Humanizer</Link>
            <Link href="/suite/interview-sim" className="inline-flex items-center min-h-[44px] rounded-lg bg-[var(--accent)] px-4 text-xs font-medium text-[var(--accent-on)] transition-all hover:bg-[var(--accent-active)]">
              Start Practicing →
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Hero */}
        <section className="my-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="elevation-card rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-8 md:p-12"
          >
            <div className="inline-block text-xs font-medium px-3 py-1 mb-6 rounded-md border border-[var(--border-subtle)] bg-[var(--accent-dim)] text-[var(--accent)]">
              AI-Powered Interview Coaching
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-5 leading-[1.1] text-[var(--text-primary)]">
              Practice the story before the room tests it.
            </h1>
            <p className="text-base md:text-lg max-w-2xl mb-8 text-[var(--text-secondary)]">
              Rehearse with role-specific prompts, follow-ups, and proof-focused feedback so your answers sound prepared, specific, and calm under pressure.
            </p>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
              <SeoTrackedLink href="/suite/interview-sim" eventName="seo_interview_prep_click" className="inline-flex items-center justify-center min-h-[44px] rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--accent-on)] elevation-card transition-all hover:bg-[var(--accent-active)]">
                Start Mock Interview →
              </SeoTrackedLink>
              <Link href="/blog/ai-interview-prep-star-method" className="inline-flex items-center justify-center min-h-[44px] px-6 py-3 text-sm font-medium rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-all">
                Learn STAR Method
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Question Types */}
        <section className="pb-20">
          <h2 className="text-2xl font-bold text-center mb-10 text-[var(--text-primary)]">
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
                className="elevation-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6"
              >
                <h3 className="font-semibold text-sm mb-3 text-[var(--text-primary)]">{qt.type}</h3>
                <ul className="space-y-2">
                  {qt.examples.map((ex, j) => (
                    <li key={j} className="text-xs leading-relaxed pl-3 border-l-2 border-[var(--border)] text-[var(--text-secondary)]">
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
          <h2 className="text-2xl font-bold text-center mb-10 text-[var(--text-primary)]">
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
                className="elevation-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6"
              >
                <span className="material-symbols-rounded icon-neutral text-2xl mb-3 block">{f.icon}</span>
                <h3 className="font-semibold text-sm mb-1 text-[var(--text-primary)]">{f.title}</h3>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Industries */}
        <section className="pb-20">
          <h2 className="text-2xl font-bold text-center mb-3 text-[var(--text-primary)]">
            Tailored for your industry
          </h2>
          <p className="text-sm text-center mb-8 text-[var(--text-secondary)]">
            Role-specific questions for each of these
          </p>
          <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
            {INDUSTRIES.map((ind, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.03 }}
                className="text-xs px-3 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
              >
                {ind}
              </motion.span>
            ))}
          </div>
        </section>

        {/* Role guides */}
        <section className="pb-20">
          <h2 className="text-2xl font-bold text-center mb-8 text-[var(--text-primary)]">
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
                className="elevation-interactive rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 transition-all hover:scale-[1.01] hover:border-[var(--border)]"
              >
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">{guide.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{guide.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="pb-20">
          <h2 className="text-2xl font-bold text-center mb-8 text-[var(--text-primary)]">
            Frequently Asked Questions
          </h2>
          <div className="max-w-2xl mx-auto space-y-2">
            {FAQS.map((faq, i) => (
              <details key={i} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <summary className="font-medium cursor-pointer text-sm text-[var(--text-primary)]">{faq.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Source context */}
        <section className="pb-20">
          <div className="elevation-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6">
            <h2 className="text-lg font-bold mb-2 text-[var(--text-primary)]">Source context</h2>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              Use interview practice guidance with role context from the{' '}
              <a href="https://www.bls.gov/ooh/" rel="noopener noreferrer" target="_blank" className="text-[var(--accent)] hover:underline">
                Bureau of Labor Statistics Occupational Outlook Handbook
              </a>.
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="pb-20">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--accent-dim)] p-10 text-center">
            <h2 className="text-2xl font-bold mb-3 text-[var(--text-primary)]">
              The best interview prep is practice
            </h2>
            <p className="text-sm mb-6 max-w-lg mx-auto text-[var(--text-secondary)]">
              Six interviewer personas, seven session modes, and a debrief after each one. Start your first session free — no credit card, no commitment.
            </p>
            <SeoTrackedLink href="/suite/interview-sim" eventName="seo_interview_prep_click" className="inline-flex items-center justify-center min-h-[44px] rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--accent-on)] elevation-card transition-all hover:bg-[var(--accent-active)]">
              Start Mock Interview Free →
            </SeoTrackedLink>
          </div>
        </section>
      </div>
    </div>
  );
}
