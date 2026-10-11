'use client';

import { TacoName } from '@/components/BrandLogo';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface DocSection {
    id: string;
    title: string;
    icon: string;
    description: string;
    content: {
        title: string;
        steps: string[];
        tips?: string[];
    }[];
}

const docs: DocSection[] = [
    { id: 'dashboard', title: 'Home & Career insights', icon: 'home', description: 'Resume work and review your recorded progress.', content: [
        { title: 'Home', steps: ['Use Home to return to recent work and review suggested next actions.', 'Open Find roles to discover roles or adjust your search preferences.', 'Career Picks email is optional and requires an explicit opt-in.'] },
        { title: 'Career insights', steps: ['Open Career insights for your overview, application results, and weekly review.', 'Application results describe recorded activity. Missing measurements remain unmeasured.', 'Weekly review includes an optional morale check-in; it is not a live salary or market-data feed.'] },
    ]},
    { id: 'talent-suite', title: 'Career workspace', icon: 'auto_awesome', description: 'Your experience, roles, applications, and interview preparation.', content: [
        { title: 'Your experience', steps: ['Open Your experience to import or edit a resume.', 'Choose a confirmed source and target job description before tailoring.', 'Review changes against your actual achievements, then save or export the chosen version.'] },
        { title: 'Applications', steps: ['Use Track an application to record an externally submitted role or an unsent tracker.', 'Open Needs review to inspect prepared packets before approving them.', 'Update status and notes in an application’s details. Approval and tracking do not submit an application for you.'] },
        { title: 'Role analysis', steps: ['Open Find roles → Role analysis.', 'Choose your resume source and supply the target job description.', 'Review source-based role coverage and suggestions. Unsupported market and salary estimates are not benchmarks.'] },
    ]},
    { id: 'general', title: 'Settings & navigation', icon: 'settings', description: 'Profile, display, notifications, and account requests.', content: [
        { title: 'Profile & display', steps: ['Open Settings to edit your display name, phone, and bio.', 'Unsaved profile edits are retained on this device when storage is available. Save to update your account.', 'Choose Light, Dark, or System under Display.'] },
        { title: 'Navigation', steps: ['Use the sidebar to open a workspace.', 'On smaller screens, use the menu button and the destination bar at the top of the page.'] },
        { title: 'Account requests', steps: ['Data & Privacy offers a confirmed optional-email pause and a deletion request.', 'Pausing optional email does not disable sign-in.', 'A confirmed deletion request is queued for processing; confirmation is not completion.'] },
    ]},
];

const quickStartLinks = [
    {
        href: '/tools/resume-builder',
        title: 'Build a resume',
        body: 'Learn about the resume builder, then open the workspace to create or edit a draft.',
    },
    {
        href: '/tools/ats-analyzer',
        title: 'Check ATS fit',
        body: 'Paste a job description and resume text to see parser risk, keyword gaps, and wording that needs stronger evidence.',
    },
    {
        href: '/tools/interview-prep',
        title: 'Prepare for interviews',
        body: 'Learn about interview preparation, then open the workspace to practice with your own experience.',
    },
    {
        href: '/templates',
        title: 'Choose a template',
        body: 'Start from ATS-friendly layouts before tailoring each version to the role, company, and hiring screen.',
    },
];

export default function HelpPage() {
    const router = useRouter();
    const [selectedDoc, setSelectedDoc] = useState<DocSection | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredDocs = docs.filter(doc =>
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.content.some(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="relative min-h-dvh overflow-hidden bg-[var(--bg-deep)] text-[var(--text-primary)]">
            <div className="relative z-10 mx-auto max-w-7xl px-6 py-12">
                {/* Header */}
                <div className="mb-12 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-block"
                    >
                        <div className="icon-shell-neutral mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border">
                            <span className="material-symbols-rounded icon-neutral text-4xl">menu_book</span>
                        </div>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="mb-4 text-4xl font-bold text-[var(--text-primary)]"
                    >
                        How can we help you?
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mx-auto max-w-2xl text-lg text-[var(--text-secondary)]"
                    >
                        Explore practical guides for resumes, ATS checks, interview practice, application tracking, billing, and <TacoName /> workflows.
                    </motion.p>

                    {/* Search Bar */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="mx-auto mt-8 max-w-xl"
                    >
                        <div className="group relative">
                            <div className="relative flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-1 transition-all focus-within:border-[var(--accent)]">
                                <span className="pl-4 text-[var(--text-muted)]">
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search for tools, features, or guides..."
                                    className="w-full border-none bg-transparent px-4 py-3 text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
                                />
                            </div>
                        </div>
                    </motion.div>
                </div>

                <section className="mb-12 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6 text-left">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
                        <div>
                            <h2 className="text-2xl font-bold text-[var(--text-primary)]">Start with the workflow you need today</h2>
                            <div className="mt-4 space-y-4 text-sm leading-7 text-[var(--text-secondary)]">
                                <p>
                                    The help center is organized around the core job-search loop: prepare a reliable resume, compare it with a role, improve the application packet, track follow-ups, and rehearse the interview. Each guide focuses on a practical outcome instead of a feature tour.
                                </p>
                                <p>
                                    If you are new to TalentConsulting.io, start with the free public tools below. They explain the resume builder, ATS checks, interview practice, and templates, with links into the workspace. The writing-pattern detector includes an interactive preview.
                                </p>
                                <p>
                                    <TacoName /> can prepare drafts and recommendations, but external actions stay under your review. Use these guides when you want to understand what the product saves, what it only previews, and where you need to approve work before sending it anywhere.
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-3">
                            {quickStartLinks.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 transition hover:border-[var(--border)] hover:bg-[var(--bg-hover)]"
                                >
                                    <span className="block text-sm font-bold text-[var(--text-primary)]">{item.title}</span>
                                    <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{item.body}</span>
                                </Link>
                            ))}
                            <Link
                                href="/for-teams"
                                className="rounded-xl border border-[var(--accent)] bg-[var(--accent-dim)] p-4 transition hover:border-[var(--accent-active)]"
                            >
                                <span className="block text-sm font-bold text-[var(--accent)]">Help for teams</span>
                                <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">Review enterprise and education workflows for career centers, HR teams, and workforce programs.</span>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Categories Grid */}
                <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredDocs.map((doc, index) => (
                        <motion.button
                            key={doc.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 + index * 0.1 }}
                            onClick={() => setSelectedDoc(doc)}
                            className="group relative h-full text-left"
                        >
                            <div className="elevation-card absolute inset-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] transition-all group-hover:border-[var(--border)]" />

                            <div className="relative flex h-full flex-col p-6">
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--accent-dim)] transition-transform duration-300 group-hover:scale-110">
                                    <span className="material-symbols-rounded text-2xl text-[var(--accent)]">{doc.icon}</span>
                                </div>

                                <h3 className="mb-2 text-xl font-bold text-[var(--text-primary)]">
                                    {doc.title}
                                </h3>

                                <p className="mb-6 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                                    {doc.description}
                                </p>

                                <div className="flex items-center text-sm font-medium text-[var(--text-secondary)] transition-all group-hover:translate-x-1 group-hover:text-[var(--text-primary)]">
                                    View Guides
                                    <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                    </svg>
                                </div>
                            </div>
                        </motion.button>
                    ))}
                </div>

                {/* Back Button */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="text-center"
                >
                    <button
                        onClick={() => router.back()}
                        className="mx-auto flex min-h-[44px] items-center justify-center gap-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back to Dashboard
                    </button>
                </motion.div>
            </div>

            {/* Detail Modal */}
            <AnimatePresence>
                {selectedDoc && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedDoc(null)}
                            className="absolute inset-0 bg-[var(--modal-backdrop)] backdrop-blur-sm"
                        />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="elevation-raised relative flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)]"
                        >
                            {/* Modal Header */}
                            <div className="relative z-10 shrink-0 border-b border-[var(--border-subtle)] p-8 pb-6">
                                <div className="absolute left-0 top-0 h-[2px] w-full bg-[var(--accent)]" />
                                <button
                                    onClick={() => setSelectedDoc(null)}
                                    aria-label="Close"
                                    className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                >
                                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>

                                <div className="flex items-center gap-4">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--accent-dim)]">
                                        <span className="material-symbols-rounded text-3xl text-[var(--accent)]">{selectedDoc.icon}</span>
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{selectedDoc.title}</h2>
                                        <p className="text-[var(--text-secondary)]">{selectedDoc.description}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Content */}
                            <div className="custom-scrollbar overflow-y-auto p-8">
                                <div className="space-y-12">
                                    {selectedDoc.content.map((section, idx) => (
                                        <div key={idx} className="relative">
                                            <h3 className="mb-6 flex items-center gap-3 text-xl font-bold text-[var(--text-primary)]">
                                                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--accent-dim)] text-sm text-[var(--accent)]">
                                                    {idx + 1}
                                                </span>
                                                {section.title}
                                            </h3>

                                            <div className="ml-4 space-y-6 border-l-2 border-[var(--border-subtle)] pl-4">
                                                <div className="space-y-4">
                                                    {section.steps.map((step, stepIdx) => (
                                                        <div key={stepIdx} className="flex gap-4">
                                                            <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />
                                                            <p className="leading-relaxed text-[var(--text-secondary)]"
                                                                dangerouslySetInnerHTML={{
                                                                    __html: step.replace(/\*\*(.*?)\*\*/g, '<strong class="font-medium text-[var(--text-primary)]">$1</strong>')
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>

                                                {section.tips && section.tips.length > 0 && (
                                                    <div className="mt-4 flex gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                                                        <span className="material-symbols-rounded icon-neutral text-xl">lightbulb</span>
                                                        <div className="text-sm text-[var(--text-secondary)]">
                                                            {section.tips.map((tip, tipIdx) => (
                                                                <p key={tipIdx}>{tip}</p>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Easter Egg */}
            <motion.div
                className="pointer-events-auto absolute bottom-4 right-6 cursor-default"
                initial={{ opacity: 0.3 }}
                whileHover={{ opacity: 1, scale: 1.05 }}
            >
                <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-muted)]">
                    made with love for <TacoName />
                    <motion.span
                        className="inline-block text-[var(--accent)]"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{
                            repeat: Infinity,
                            duration: 0.8,
                            ease: "easeInOut"
                        }}
                    >
                        ❤️
                    </motion.span>
                </p>
            </motion.div>
        </div>
    );
}
