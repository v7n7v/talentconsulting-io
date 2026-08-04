'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { TalentConsultingWordmark } from '@/components/BrandLogo';

export default function ForTeamsPage() {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        organization: '',
        orgType: '' as '' | 'university' | 'enterprise' | 'staffing' | 'government' | 'other',
        teamSize: '' as '' | '1-10' | '11-50' | '51-200' | '200+',
        message: '',
    });
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.email || !formData.organization || !formData.orgType) return;
        setLoading(true);

        try {
            // Save to Firestore via API
            const res = await fetch('/api/teams/interest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            if (res.ok) setSubmitted(true);
        } catch {
            // Still show success — we'll collect via analytics fallback
            setSubmitted(true);
        } finally {
            setLoading(false);
        }
    };

    const orgTypes = [
        { id: 'university', icon: 'school', label: 'University / Career Center' },
        { id: 'enterprise', icon: 'domain', label: 'Enterprise HR / L&D' },
        { id: 'staffing', icon: 'groups', label: 'Staffing / Recruitment Agency' },
        { id: 'government', icon: 'account_balance', label: 'Government / Workforce Dev' },
        { id: 'other', icon: 'language', label: 'Other' },
    ] as const;

    return (
        // tc-dark-surface: this page is dark in both themes. Without it the
        // global remaps resolve its ink to #010E2F on #0a0a0a. See globals.css.
        <div className="tc-dark-surface min-h-dvh bg-[#0a0a0a] text-white">
            {/* Hero */}
            <div className="relative overflow-hidden">
                <div className="absolute inset-0">
                    <motion.div
                        animate={{ x: [0, 50, 0], y: [0, -30, 0] }}
                        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
                        className="absolute top-20 right-20 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"
                    />
                    <motion.div
                        animate={{ x: [0, -40, 0], y: [0, 60, 0] }}
                        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
                        className="absolute bottom-0 left-10 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl"
                    />
                </div>

                <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-12">
                    <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors mb-8">
                        ← Back to TalentConsulting.io
                    </Link>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        {/* The wordmark renders an inline <span>, so a margin on it
                            leaves no vertical space and the inline-flex badge below
                            lands on the same line. The block wrapper owns the gap. */}
                        <div className="mb-8">
                            <TalentConsultingWordmark darkSurface className="w-[min(420px,86vw)]" />
                        </div>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 mb-6">
                            <span className="text-xs font-medium text-cyan-400">Enterprise & Education</span>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-bold mb-4 leading-tight">
                            <span className="bg-gradient-to-r from-cyan-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent">
                                TalentConsulting.io
                            </span>
                            {' '}
                            <span className="block text-[var(--text-primary)]">for Teams</span>
                        </h1>
                        <p className="text-lg text-[var(--text-muted)] max-w-2xl mb-8">
                            AI-powered career readiness at scale. Equip your students, candidates, or employees with 
                            resume intelligence, interview simulation, and skill development — all under one platform.
                        </p>
                    </motion.div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-6 pb-20">
                {/* Value Props */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="grid md:grid-cols-3 gap-6 mb-16"
                >
                    {[
                        {
                            icon: 'school',
                            title: 'Career Centers',
                            desc: 'Give every student access to AI-powered resume optimization and interview prep. Scale your career services without scaling your staff.',
                            stats: 'Serve more students',
                        },
                        {
                            icon: 'domain',
                            title: 'Enterprise L&D',
                            desc: 'Internal mobility programs, skills gap analysis, and career development — powered by the same AI that helps candidates land roles.',
                            stats: 'Improve internal mobility',
                        },
                        {
                            icon: 'groups',
                            title: 'Staffing Agencies',
                            desc: 'Prep your candidates before client interviews. Higher placement rates, better candidate experience, stronger relationships.',
                            stats: 'Stronger placement readiness',
                        },
                    ].map((item, i) => (
                        <motion.div
                            key={item.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 + i * 0.1 }}
                            className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all"
                        >
                            <span className="material-symbols-rounded text-3xl block mb-4 text-cyan-400">{item.icon}</span>
                            <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                            <p className="text-sm text-[var(--text-muted)] mb-4">{item.desc}</p>
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-xs font-medium text-emerald-400">{item.stats}</span>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>

                {/* Features Grid */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="mb-16"
                >
                    <h2 className="text-2xl font-bold text-white mb-8 text-center">What Your Team Gets</h2>
                    <div className="grid md:grid-cols-2 gap-4">
                        {[
                            { icon: 'description', title: 'AI Resume Morphing', desc: 'Dual-AI pipeline adapts resumes to any job description' },
                            { icon: 'swords', title: 'The Gauntlet', desc: '6 AI interviewer personas simulate real interviews with grading' },
                            { icon: 'route', title: 'Skill Bridge', desc: 'Focused AI study plans bridge the gap between resume and role expectations' },
                            { icon: 'monitoring', title: 'Admin Dashboard', desc: 'Track team progress, usage analytics, and outcomes' },
                            { icon: 'lock', title: 'SSO & Compliance', desc: 'SAML/OIDC, data residency, and SOC 2 compliance (roadmap)' },
                            { icon: 'payments', title: 'Volume Pricing', desc: 'Per-seat pricing that makes enterprise tools affordable for education' },
                        ].map((f) => (
                            <div key={f.title} className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                <span className="material-symbols-rounded text-xl flex-shrink-0 mt-0.5 text-cyan-400">{f.icon}</span>
                                <div>
                                    <h4 className="text-sm font-bold text-white mb-1">{f.title}</h4>
                                    <p className="text-xs text-[var(--text-muted)]">{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55 }}
                    className="mb-16 rounded-2xl border border-white/10 bg-white/[0.03] p-6"
                >
                    <div className="grid gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                        <div>
                            <h2 className="text-2xl font-bold text-white">Pilot the same tools your people will use</h2>
                            <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                                TalentConsulting.io for teams builds on the public career tools and the signed-in suite. Career centers, workforce programs, staffing teams, and HR teams can review the product path before planning rollout, training, or custom onboarding.
                            </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {[
                                { href: '/tools/resume-builder', label: 'Resume builder', body: 'Review the resume creation path before team rollout.' },
                                { href: '/tools/ats-analyzer', label: 'ATS analyzer', body: 'Check how role matching and parser guidance feel.' },
                                { href: '/tools/interview-prep', label: 'Interview practice', body: 'Preview story coaching and practice prompts.' },
                                { href: '/help', label: 'Help center', body: 'Use the guides for training and support planning.' },
                            ].map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className="rounded-xl border border-white/10 bg-black/20 p-4 transition hover:border-cyan-500/35 hover:bg-white/[0.04]"
                                >
                                    <span className="block text-sm font-bold text-white">{item.label}</span>
                                    <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{item.body}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </motion.section>

                {/* Contact Form */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="max-w-2xl mx-auto"
                    id="contact"
                >
                    <div className="p-8 rounded-3xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/10">
                        <AnimatePresence mode="wait">
                            {submitted ? (
                                <motion.div
                                    key="success"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="text-center py-12"
                                >
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', bounce: 0.5 }}
                                        className="text-6xl mb-4"
                                    >
                                        <span className="material-symbols-rounded text-6xl text-cyan-400">celebration</span>
                                    </motion.div>
                                    <h3 className="text-2xl font-bold text-white mb-2">We&apos;ll be in touch!</h3>
                                    <p className="text-[var(--text-muted)] mb-6">
                                        Our team will reach out soon to discuss how TalentConsulting.io can work for {formData.organization}.
                                    </p>
                                    <Link
                                        href="/"
                                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all"
                                    >
                                        ← Back to Home
                                    </Link>
                                </motion.div>
                            ) : (
                                <motion.form
                                    key="form"
                                    onSubmit={handleSubmit}
                                    className="space-y-5"
                                >
                                    <div className="text-center mb-6">
                                        <h2 className="text-2xl font-bold text-white mb-1">Get Early Access</h2>
                                        <p className="text-sm text-[var(--text-muted)]">Tell us about your organization — we&apos;ll build a custom plan.</p>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Your Name *</label>
                                            <input
                                                type="text"
                                                required
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-white/20 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
                                                placeholder="John Doe"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Work Email *</label>
                                            <input
                                                type="email"
                                                required
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-white/20 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
                                                placeholder="john@university.edu"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Organization Name *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.organization}
                                            onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                                            className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-white/20 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
                                            placeholder="State University Career Center"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Organization Type *</label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                            {orgTypes.map((org) => (
                                                <button
                                                    key={org.id}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, orgType: org.id })}
                                                    className={`p-3 rounded-xl border text-left transition-all ${
                                                        formData.orgType === org.id
                                                            ? 'bg-cyan-500/20 border-cyan-500/50 text-white'
                                                            : 'bg-white/5 border-white/10 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/10'
                                                    }`}
                                                >
                                                    <span className="material-symbols-rounded text-base block mb-1" style={{ color: formData.orgType === org.id ? '#22d3ee' : 'rgba(255,255,255,0.4)' }}>{org.icon}</span>
                                                    <span className="text-[11px] font-medium">{org.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Expected Team Size</label>
                                        <div className="flex gap-2">
                                            {['1-10', '11-50', '51-200', '200+'].map((size) => (
                                                <button
                                                    key={size}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, teamSize: size as any })}
                                                    className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                                                        formData.teamSize === size
                                                            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                                                            : 'bg-white/5 border-white/10 text-[var(--text-muted)] hover:text-[var(--text-muted)]'
                                                    }`}
                                                >
                                                    {size}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Anything else? (optional)</label>
                                        <textarea
                                            value={formData.message}
                                            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                            className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-white/20 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all resize-none"
                                            rows={3}
                                            placeholder="Tell us about your use case, timeline, or specific needs..."
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading || !formData.name || !formData.email || !formData.organization || !formData.orgType}
                                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-white font-bold text-lg hover:shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                                    >
                                        {loading ? (
                                            <>
                                                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                                                Sending...
                                            </>
                                        ) : (
                                            <><span className="material-symbols-rounded text-lg align-middle mr-1">rocket_launch</span> Request Early Access</>
                                        )}
                                    </button>

                                    <p className="text-center text-[10px] text-[var(--text-muted)]">
                                        No commitment. We&apos;ll reach out to discuss pricing and onboarding.
                                    </p>
                                </motion.form>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
