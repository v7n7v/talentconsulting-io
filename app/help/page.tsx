'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface DocSection {
    id: string;
    title: string;
    icon: string;
    description: string;
    color: string;
    borderColor: string;
    content: {
        title: string;
        steps: string[];
        tips?: string[];
    }[];
}

const docs: DocSection[] = [
    {
        id: 'dashboard',
        title: 'Hub & Dashboard',
        icon: 'home',
        description: 'Master your command center with AI-powered insights.',
        color: 'from-[#EC4899] to-[#8B5CF6]',
        borderColor: 'border-[#EC4899]/30',
        content: [
            {
                title: 'AI Pulse Dashboard',
                steps: [
                    'The Dashboard automatically generates real-time insights based on your role.',
                    'Data is fetched from your database or simulated by AI if no data exists.',
                    'Click **Refresh AI Insights** in the top right to generate a new analysis.'
                ],
                tips: ['The "Generating Insights..." animation means the AI is currently analyzing your profile or candidates.']
            },
            {
                title: 'AI Insights',
                steps: [
                    'The Dashboard automatically generates real-time insights for your job search.',
                    'Data is fetched from your database or simulated by AI if no data exists.',
                    'Click **Refresh AI Insights** in the top right to generate a new analysis.'
                ],
                tips: ['The "Generating Insights..." animation means the AI is currently analyzing your profile.']
            },
            {
                title: 'Interactive Widgets',
                steps: [
                    '**Discovery Spotlight**: Shows top candidates or jobs. Click to view full details in the Detective/Search suite.',
                    '**Career Roadmap**: Visualizes skill gaps. Click to access the Market Oracle for deep analysis.',
                    '**Market Pulse**: Live market trends. Click to explore salary data and demand heatmaps.'
                ]
            }
        ]
    },
    {
        id: 'talent-suite',
        title: 'Talent Suite',
        icon: 'auto_awesome',
        description: 'Tools for job seekers to optimize their applications.',
        color: 'from-[#0070F3] to-[#0070F3]/60',
        borderColor: 'border-[#0070F3]/30',
        content: [
            {
                title: 'Liquid Resume',
                steps: [
                    'Navigate to **Talent Suite > Liquid Resume**.',
                    'Import your existing resume (PDF/DOCX) or start from scratch.',
                    'Use the **Morph** feature to tailor your resume for a specific Job Description.',
                    'View your **Skill Graph** to see how your skills connect to market demands.'
                ],
                tips: ['Keep your "Master Resume" updated; the AI uses it as a base for all variations.']
            },
            {
                title: 'Job Applications',
                steps: [
                    'Go to **Talent Suite > Applications**.',
                    'Use the **Kanban Board** to drag and drop applications across stages (Wishlist -> Applied -> Interview -> Offer).',
                    'Click on any card to add notes, interview dates, or specific documents.'
                ]
            },
            {
                title: 'Market Oracle',
                steps: [
                    'Access **Talent Suite > Market Oracle**.',
                    'Analyze current market trends for your role.',
                    'View salary data, demand heatmaps, and skill gaps.'
                ]
            },

        ]
    },
    {
        id: 'general',
        title: 'General & Settings',
        icon: 'settings',
        description: 'Account management and platform configuration.',
        color: 'from-white/20 to-white/5',
        borderColor: 'border-white/20',
        content: [
            {
                title: 'Profile & Settings',
                steps: [
                    'Click your avatar in the sidebar bottom menu.',
                    'Select **Settings**.',
                    'Update your personal information, notification preferences, and API keys.',
                    'You can also change your password here.'
                ]
            },
            {
                title: 'Navigation',
                steps: [
                    'Use the sidebar to navigate between Talent Suite tools.',
                    'Use **Cmd+K** to quickly jump to any tool or page.'
                ]
            }
        ]
    }
];

const quickStartLinks = [
    {
        href: '/tools/resume-builder',
        title: 'Build a resume',
        body: 'Use the public resume builder when you need a clean first draft or a safer structure before moving into the full suite.',
    },
    {
        href: '/tools/ats-analyzer',
        title: 'Check ATS fit',
        body: 'Paste a job description and resume text to see parser risk, keyword gaps, and wording that needs stronger evidence.',
    },
    {
        href: '/tools/interview-prep',
        title: 'Prepare for interviews',
        body: 'Practice common prompts, shape STAR stories, and turn resume bullets into answers you can actually use.',
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
        <div className="tc-dark-surface help-dark-page min-h-dvh bg-black text-white relative overflow-hidden">
            {/* Background Ambience - subtle */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-[#0070F3]/5 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-[#0070F3]/5 rounded-full blur-[100px] translate-x-1/3 translate-y-1/3" />
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
                {/* Header */}
                <div className="mb-12 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-block"
                    >
                        <div className="icon-shell-neutral w-20 h-20 mx-auto mb-6 rounded-2xl border flex items-center justify-center">
                            <span className="material-symbols-rounded text-4xl">menu_book</span>
                        </div>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-4xl font-bold mb-4 text-white"
                    >
                        How can we help you?
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-silver max-w-2xl mx-auto text-lg"
                    >
                        Explore practical guides for resumes, ATS checks, interview practice, application tracking, billing, and Taco workflows.
                    </motion.p>

                    {/* Search Bar */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="mt-8 max-w-xl mx-auto"
                    >
                        <div className="relative group">
                            <div className="relative glass-card rounded-xl flex items-center p-1 focus-within:border-white/20 transition-all">
                                <span className="pl-4 text-silver">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search for tools, features, or guides..."
                                    className="w-full bg-transparent border-none text-white px-4 py-3 focus:outline-none placeholder-silver/50"
                                />
                            </div>
                        </div>
                    </motion.div>
                </div>

                <section className="mb-12 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
                        <div>
                            <h2 className="text-2xl font-bold text-white">Start with the workflow you need today</h2>
                            <div className="mt-4 space-y-4 text-sm leading-7 text-silver">
                                <p>
                                    The help center is organized around the core job-search loop: prepare a reliable resume, compare it with a role, improve the application packet, track follow-ups, and rehearse the interview. Each guide focuses on a practical outcome instead of a feature tour.
                                </p>
                                <p>
                                    If you are new to TalentConsulting.io, start with the free public tools below. They let you test the resume builder, ATS analyzer, interview practice, and templates before moving into the signed-in suite for saved history, Taco memory, and application tracking.
                                </p>
                                <p>
                                    Taco can prepare drafts and recommendations, but external actions stay under your review. Use these guides when you want to understand what the product saves, what it only previews, and where you need to approve work before sending it anywhere.
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-3">
                            {quickStartLinks.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className="rounded-xl border border-white/10 bg-black/20 p-4 transition hover:border-white/25 hover:bg-white/[0.04]"
                                >
                                    <span className="block text-sm font-bold text-white">{item.title}</span>
                                    <span className="mt-1 block text-xs leading-5 text-silver">{item.body}</span>
                                </Link>
                            ))}
                            <Link
                                href="/for-teams"
                                className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 transition hover:border-cyan-400/40"
                            >
                                <span className="block text-sm font-bold text-cyan-200">Help for teams</span>
                                <span className="mt-1 block text-xs leading-5 text-cyan-50/70">Review enterprise and education workflows for career centers, HR teams, and workforce programs.</span>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Categories Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                    {filteredDocs.map((doc, index) => (
                        <motion.button
                            key={doc.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 + index * 0.1 }}
                            onClick={() => setSelectedDoc(doc)}
                            className="relative group text-left h-full"
                        >
                            <div className={`absolute inset-0 bg-[var(--theme-bg-card)] rounded-2xl border ${doc.borderColor} group-hover:border-opacity-60 transition-all`} />

                            <div className="relative p-6 h-full flex flex-col">
                                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${doc.color} flex items-center justify-center text-2xl mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                                    <span className="material-symbols-rounded text-2xl">{doc.icon}</span>
                                </div>

                                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-white/90 transition-colors">
                                    {doc.title}
                                </h3>

                                <p className="text-silver text-sm leading-relaxed mb-6 flex-1">
                                    {doc.description}
                                </p>

                                <div className="flex items-center text-sm font-medium text-silver group-hover:text-white group-hover:translate-x-1 transition-all">
                                    View Guides
                                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        className="text-silver hover:text-white transition-colors flex items-center justify-center gap-2 mx-auto"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-4xl max-h-[85vh] glass-card rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                        >
                            {/* Modal Header */}
                            <div className="relative p-8 pb-6 border-b border-white/10 z-10 shrink-0">
                                <div className={`absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r ${selectedDoc.color}`} />
                                <button
                                    onClick={() => setSelectedDoc(null)}
                                    className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/5 text-silver hover:text-white transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>

                                <div className="flex items-center gap-4">
                                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${selectedDoc.color} flex items-center justify-center text-3xl shadow-lg`}>
                                        <span className="material-symbols-rounded text-3xl">{selectedDoc.icon}</span>
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-white">{selectedDoc.title}</h2>
                                        <p className="text-silver">{selectedDoc.description}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Content */}
                            <div className="p-8 overflow-y-auto custom-scrollbar">
                                <div className="space-y-12">
                                    {selectedDoc.content.map((section, idx) => (
                                        <div key={idx} className="relative">
                                            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                                                <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${selectedDoc.color} flex items-center justify-center text-sm`}>
                                                    {idx + 1}
                                                </span>
                                                {section.title}
                                            </h3>

                                            <div className="pl-4 border-l-2 border-white/10 ml-4 space-y-6">
                                                <div className="space-y-4">
                                                    {section.steps.map((step, stepIdx) => (
                                                        <div key={stepIdx} className="flex gap-4">
                                                            <div className="w-1.5 h-1.5 mt-2 rounded-full bg-silver/50 shrink-0" />
                                                            <p className="text-silver leading-relaxed"
                                                                dangerouslySetInnerHTML={{
                                                                    __html: step.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-medium">$1</strong>')
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>

                                                {section.tips && section.tips.length > 0 && (
                                                    <div className="mt-4 p-4 rounded-xl glass-card flex gap-4">
                                                        <span className="material-symbols-rounded icon-neutral text-xl">lightbulb</span>
                                                        <div className="text-sm text-silver">
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
                className="absolute bottom-4 right-6 pointer-events-auto cursor-default"
                initial={{ opacity: 0.3 }}
                whileHover={{ opacity: 1, scale: 1.05 }}
            >
                <motion.p
                    className="text-xs font-bold bg-gradient-to-r from-pink-300 via-purple-300 to-cyan-300 bg-clip-text text-transparent flex items-center gap-1.5"
                    whileHover={{
                        textShadow: "0px 0px 8px rgba(244, 114, 182, 0.8), 0px 0px 15px rgba(168, 85, 247, 0.6)",
                        x: [0, -2, 2, -1, 1, 0],
                        transition: {
                            x: { repeat: Infinity, duration: 0.2 },
                            textShadow: { duration: 0.2 }
                        }
                    }}
                >
                    made with love for Taco
                    <motion.span
                        className="inline-block text-pink-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{
                            repeat: Infinity,
                            duration: 0.8,
                            ease: "easeInOut"
                        }}
                    >
                        ❤️
                    </motion.span>
                </motion.p>
            </motion.div>
        </div>
    );
}
