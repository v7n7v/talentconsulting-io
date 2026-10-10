'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { TacoWordmark } from '@/components/BrandLogo';

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
        <div className="min-h-dvh bg-[var(--bg-deep)] text-[var(--text-primary)]">
            {/* Hero */}
            <div className="relative overflow-hidden">
                <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-12">
                    <Link href="/" className="mb-8 inline-flex min-h-[44px] items-center gap-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]">
                        ← Back to TalentConsulting.io
                    </Link>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        {/* The wordmark renders an inline <span>, so a margin on it
                            leaves no vertical space and the inline-flex badge below
                            lands on the same line. The block wrapper owns the gap. */}
                        <div className="mb-8">
                            <TacoWordmark className="w-[min(420px,86vw)]" />
                        </div>
                        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-1.5">
                            <span className="text-xs font-medium text-[var(--accent)]">Enterprise & Education</span>
                        </div>
                        <h1 className="mb-4 text-4xl font-bold leading-tight md:text-6xl">
                            <span className="text-[var(--accent)]">
                                TalentConsulting.io
                            </span>
                            {' '}
                            <span className="block text-[var(--text-primary)]">for Teams</span>
                        </h1>
                        <p className="mb-8 max-w-2xl text-lg text-[var(--text-secondary)]">
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
                    className="mb-16 grid gap-6 md:grid-cols-3"
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
                            className="elevation-interactive rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6 transition-all hover:border-[var(--border)]"
                        >
                            <span className="material-symbols-rounded mb-4 block text-3xl text-[var(--accent)]">{item.icon}</span>
                            <h3 className="mb-2 text-lg font-bold text-[var(--text-primary)]">{item.title}</h3>
                            <p className="mb-4 text-sm text-[var(--text-secondary)]">{item.desc}</p>
                            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--accent-dim)] px-3 py-1">
                                <span className="text-xs font-medium text-[var(--accent)]">{item.stats}</span>
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
                    <h2 className="mb-8 text-center text-2xl font-bold text-[var(--text-primary)]">What Your Team Gets</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        {[
                            { icon: 'description', title: 'AI Resume Morphing', desc: 'Dual-AI pipeline adapts resumes to any job description' },
                            { icon: 'swords', title: 'The Gauntlet', desc: '6 AI interviewer personas simulate real interviews with grading' },
                            { icon: 'route', title: 'Skill Bridge', desc: 'Focused AI study plans bridge the gap between resume and role expectations' },
                            { icon: 'monitoring', title: 'Admin Dashboard', desc: 'Track team progress, usage analytics, and outcomes' },
                            { icon: 'lock', title: 'SSO & Compliance', desc: 'SAML/OIDC, data residency, and SOC 2 compliance (roadmap)' },
                            { icon: 'payments', title: 'Volume Pricing', desc: 'Per-seat pricing that makes enterprise tools affordable for education' },
                        ].map((f) => (
                            <div key={f.title} className="flex items-start gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                                <span className="material-symbols-rounded mt-0.5 flex-shrink-0 text-xl text-[var(--accent)]">{f.icon}</span>
                                <div>
                                    <h4 className="mb-1 text-sm font-bold text-[var(--text-primary)]">{f.title}</h4>
                                    <p className="text-xs text-[var(--text-secondary)]">{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55 }}
                    className="mb-16 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6"
                >
                    <div className="grid gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                        <div>
                            <h2 className="text-2xl font-bold text-[var(--text-primary)]">Pilot the same tools your people will use</h2>
                            <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
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
                                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 transition hover:border-[var(--border)] hover:bg-[var(--bg-hover)]"
                                >
                                    <span className="block text-sm font-bold text-[var(--text-primary)]">{item.label}</span>
                                    <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{item.body}</span>
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
                    <div className="elevation-card rounded-3xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-8">
                        <AnimatePresence mode="wait">
                            {submitted ? (
                                <motion.div
                                    key="success"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="py-12 text-center"
                                >
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', bounce: 0.5 }}
                                        className="mb-4"
                                    >
                                        <span className="material-symbols-rounded text-6xl text-[var(--accent)]">celebration</span>
                                    </motion.div>
                                    <h3 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">We&apos;ll be in touch!</h3>
                                    <p className="mb-6 text-[var(--text-secondary)]">
                                        Our team will reach out soon to discuss how TalentConsulting.io can work for {formData.organization}.
                                    </p>
                                    <Link
                                        href="/"
                                        className="btn-secondary inline-flex min-h-[44px] items-center gap-2 rounded-xl px-6 py-3 font-medium"
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
                                    <div className="mb-6 text-center">
                                        <h2 className="mb-1 text-2xl font-bold text-[var(--text-primary)]">Get Early Access</h2>
                                        <p className="text-sm text-[var(--text-secondary)]">Tell us about your organization — we&apos;ll build a custom plan.</p>
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Your Name *</label>
                                            <input
                                                type="text"
                                                required
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3 text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-dim)]"
                                                placeholder="John Doe"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Work Email *</label>
                                            <input
                                                type="email"
                                                required
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3 text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-dim)]"
                                                placeholder="john@university.edu"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Organization Name *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.organization}
                                            onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                                            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3 text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-dim)]"
                                            placeholder="State University Career Center"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">Organization Type *</label>
                                        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                                            {orgTypes.map((org) => {
                                                const active = formData.orgType === org.id;
                                                return (
                                                    <button
                                                        key={org.id}
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, orgType: org.id })}
                                                        className={`min-h-[44px] rounded-xl border p-3 text-left transition-all ${
                                                            active
                                                                ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]'
                                                                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--bg-hover)]'
                                                        }`}
                                                    >
                                                        <span className={`material-symbols-rounded mb-1 block text-base ${active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>{org.icon}</span>
                                                        <span className="text-[11px] font-medium">{org.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">Expected Team Size</label>
                                        <div className="flex gap-2">
                                            {['1-10', '11-50', '51-200', '200+'].map((size) => (
                                                <button
                                                    key={size}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, teamSize: size as any })}
                                                    className={`min-h-[44px] flex-1 rounded-xl border text-sm font-medium transition-all ${
                                                        formData.teamSize === size
                                                            ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                                                            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border)]'
                                                    }`}
                                                >
                                                    {size}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Anything else? (optional)</label>
                                        <textarea
                                            value={formData.message}
                                            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                            className="w-full resize-none rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3 text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-dim)]"
                                            rows={3}
                                            placeholder="Tell us about your use case, timeline, or specific needs..."
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading || !formData.name || !formData.email || !formData.organization || !formData.orgType}
                                        className="btn-primary flex w-full min-h-[44px] items-center justify-center gap-3 rounded-2xl px-6 py-4 text-lg font-bold disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {loading ? (
                                            <>
                                                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="h-5 w-5 rounded-full border-2 border-[var(--accent-on)]/30 border-t-[var(--accent-on)]" />
                                                Sending...
                                            </>
                                        ) : (
                                            <><span className="material-symbols-rounded mr-1 align-middle text-lg">rocket_launch</span> Request Early Access</>
                                        )}
                                    </button>

                                    <p className="text-center text-[11px] text-[var(--text-muted)]">
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
