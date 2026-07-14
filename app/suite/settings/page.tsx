'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { authHelpers } from '@/lib/firebase';
import { showToast } from '@/components/Toast';
import { useUserTier } from '@/hooks/use-user-tier';
import { useBillingPrices } from '@/hooks/use-billing-prices';
import { authFetch } from '@/lib/auth-fetch';
import { getPlanIdentity } from '@/lib/plan-identity';
import { PlanIdentityCard, PlanStatusStrip } from '@/components/plan/PlanIdentity';
import type { JobAlertsFrequency } from '@/lib/job-alerts';
import { useTheme } from '@/components/ThemeProvider';
import ThemeToggle from '@/components/ThemeToggle';
import {
    RESUME_MORPH_ACKNOWLEDGEMENTS,
    RESUME_MORPH_CONSENT_VERSION,
    RESUME_MORPH_DEFAULT_MAX,
    RESUME_MORPH_FULL_UNLOCK,
    type ResumeMorphConsentStatus,
} from '@/lib/resume-morph-safety';
import { stripeAccountReviewReceiptPresentation } from '@/lib/billing/stripe-account-review-receipt';

type SettingsTab = 'profile' | 'display' | 'ai-safety' | 'subscription' | 'security' | 'notifications' | 'help' | 'feedback' | 'sessions' | 'data-privacy';

const TABS: { id: SettingsTab; label: string; icon: string; description: string; color: string }[] = [
    { id: 'profile', label: 'Profile', icon: 'person', description: 'Personal info & avatar', color: 'text-cyan-500' },
    { id: 'display', label: 'Display', icon: 'palette', description: 'Theme & appearance', color: 'text-violet-500' },
    { id: 'ai-safety', label: 'AI Safety', icon: 'verified_user', description: 'Morph guardrails & consent', color: 'text-emerald-500' },
    { id: 'subscription', label: 'Subscription', icon: 'diamond', description: 'Plan & billing', color: 'text-amber-500' },
    { id: 'security', label: 'Security', icon: 'shield_person', description: 'Password, 2FA & login', color: 'text-emerald-500' },
    { id: 'notifications', label: 'Notifications', icon: 'notifications', description: 'Email & push alerts', color: 'text-purple-500' },
    { id: 'help', label: 'Help', icon: 'help', description: 'Guides, FAQs & Support', color: 'text-sky-500' },
    { id: 'feedback', label: 'Feedback', icon: 'rate_review', description: 'Requests & product notes', color: 'text-emerald-500' },
    { id: 'sessions', label: 'Sessions', icon: 'computer', description: 'Active devices', color: 'text-indigo-500' },
    { id: 'data-privacy', label: 'Data & Privacy', icon: 'database', description: 'Export, pause, or delete', color: 'text-rose-500' },
];

type VisibleJobAlertsFrequency = Extract<JobAlertsFrequency, 'daily' | 'weekly'>;

const SONA_PICK_CADENCES: Array<{ value: VisibleJobAlertsFrequency; label: string; icon: string; desc: string }> = [
    { value: 'weekly', label: 'Weekly', icon: 'calendar_month', desc: 'Curated Sona Picks arrive every Monday.' },
    { value: 'daily', label: 'Daily (weekdays)', icon: 'today', desc: 'Fresh Sona Picks arrive Monday through Friday.' },
];

export default function SettingsPage() {
    const router = useRouter();
    const { user, setUser } = useStore();
    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

    useEffect(() => {
        const tab = new URLSearchParams(window.location.search).get('tab') as SettingsTab | null;
        if (tab && TABS.some(item => item.id === tab)) setActiveTab(tab);
    }, []);

    return (
        <div className="mobile-app-content min-h-dvh px-4 py-3 md:p-6 lg:p-8">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-3xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-8 mb-8"
            >
                <div className="absolute inset-0 opacity-20">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/30 rounded-full blur-3xl" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl" />
                </div>
                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shadow-lg">
                        <span className="text-3xl"><span className="material-symbols-rounded align-middle">settings</span></span>
                    </div>
                    <div>
                        <h1 className="text-4xl font-bold">
                            <span className="bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                                Account Settings
                            </span>
                        </h1>
                        <p className="text-[var(--text-secondary)]">Manage your profile, security, and preferences</p>
                    </div>
                </div>
            </motion.div>

            {/* Tab Navigation + Content */}
            <div className="flex flex-col lg:flex-row gap-6 max-w-6xl">
                {/* Sidebar Tabs */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="lg:w-64 flex-shrink-0"
                >
                    <div className="lg:sticky lg:top-8 space-y-1.5 p-2 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)]">
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${activeTab === tab.id
                                    ? 'bg-[var(--theme-surface-active)] text-[var(--text-primary)] border border-[var(--theme-border)] shadow-lg'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--theme-surface-hover)] hover:text-[var(--text-primary)] border border-transparent'
                                    }`}
                            >
                                <span className="text-2xl mr-2 material-symbols-rounded align-middle">{tab.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium ${activeTab === tab.id ? 'text-[var(--text-primary)]' : ''}`}>{tab.label}</p>
                                    <p className="text-xs text-[var(--text-tertiary)] truncate">{tab.description}</p>
                                </div>
                                {activeTab === tab.id && (
                                    <motion.div
                                        layoutId="activeTab"
                                        className="w-1.5 h-8 rounded-full bg-emerald-500"
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                </motion.div>

                {/* Content Area */}
                <div className="flex-1">
                    <AnimatePresence mode="wait">
                        {activeTab === 'profile' && <ProfileTab key="profile" user={user} setUser={setUser} />}
                        {activeTab === 'display' && <DisplayTab key="display" />}
                        {activeTab === 'ai-safety' && <AISafetyTab key="ai-safety" />}
                        {activeTab === 'subscription' && <SubscriptionTab key="subscription" />}
                        {activeTab === 'security' && <SecurityTab key="security" user={user} />}
                        {activeTab === 'notifications' && <NotificationsTab key="notifications" />}
                        {activeTab === 'help' && <HelpTab key="help" />}
                        {activeTab === 'feedback' && <FeedbackTab key="feedback" />}
                        {activeTab === 'sessions' && <SessionsTab key="sessions" user={user} />}
                        {activeTab === 'data-privacy' && <DataPrivacyTab key="data-privacy" user={user} />}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

// ===== AI SAFETY TAB =====
function AISafetyTab() {
    const { user } = useStore();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<ResumeMorphConsentStatus>({
        unlocked100: false,
        acceptedAt: null,
        consentVersion: RESUME_MORPH_CONSENT_VERSION,
    });
    const [accepted, setAccepted] = useState<Record<number, boolean>>({});
    const [typedName, setTypedName] = useState('');

    const allAccepted = RESUME_MORPH_ACKNOWLEDGEMENTS.every((_, index) => accepted[index]);
    const canUnlock = Boolean(user) && allAccepted && typedName.trim().length >= 2 && !saving;

    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }

        const loadConsent = async () => {
            setLoading(true);
            try {
                const res = await authFetch('/api/resume/morph-consent');
                if (res.ok) {
                    const data = await res.json();
                    setStatus({
                        unlocked100: data.unlocked100 === true,
                        acceptedAt: data.acceptedAt || null,
                        consentVersion: data.consentVersion || RESUME_MORPH_CONSENT_VERSION,
                        disabledAt: data.disabledAt || null,
                    });
                }
            } catch {
                showToast('Could not load AI safety settings', 'cancel');
            } finally {
                setLoading(false);
            }
        };

        loadConsent();
    }, [user?.uid]);

    const unlockFullMorph = async () => {
        if (!canUnlock) return;
        setSaving(true);
        try {
            const res = await authFetch('/api/resume/morph-consent', {
                method: 'POST',
                body: JSON.stringify({
                    unlock100: true,
                    typedName: typedName.trim(),
                    acknowledgements: RESUME_MORPH_ACKNOWLEDGEMENTS,
                    consentVersion: RESUME_MORPH_CONSENT_VERSION,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to unlock 100% Morph');
            setStatus(data);
            showToast('100% Morph unlocked. Truth locks remain active.', 'verified_user');
        } catch (error: any) {
            showToast(error.message || 'Failed to unlock 100% Morph', 'cancel');
        } finally {
            setSaving(false);
        }
    };

    const disableFullMorph = async () => {
        setSaving(true);
        try {
            const res = await authFetch('/api/resume/morph-consent', {
                method: 'POST',
                body: JSON.stringify({ unlock100: false }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to disable 100% Morph');
            setStatus(data);
            setAccepted({});
            setTypedName('');
            showToast('100% Morph disabled. Resume Morph is capped at 80%.', 'shield');
        } catch (error: any) {
            showToast(error.message || 'Failed to disable 100% Morph', 'cancel');
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
        >
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-semibold">Resume Morph Guardrails</p>
                        <h3 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Truth locks stay on, even at maximum strength.</h3>
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
                            Talent Studio can rewrite phrasing, emphasis, and ordering. It cannot invent schools, degrees, certifications, licenses, employers, job titles, dates, or contact details.
                        </p>
                    </div>
                    <div className={`rounded-2xl border px-4 py-3 ${status.unlocked100 ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-amber-500/25 bg-amber-500/10'}`}>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Current limit</p>
                        <p className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
                            {loading ? 'Loading' : status.unlocked100 ? `${RESUME_MORPH_FULL_UNLOCK}% unlocked` : `${RESUME_MORPH_DEFAULT_MAX}% max`}
                        </p>
                        {status.acceptedAt && (
                            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                                Accepted {new Date(status.acceptedAt).toLocaleDateString()}
                            </p>
                        )}
                    </div>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-3">
                    {[
                        { icon: 'school', label: 'Education locked', detail: 'Schools, degrees, years, and details are restored from the original.' },
                        { icon: 'badge', label: 'Credentials locked', detail: 'Certifications and licenses cannot be added by the model.' },
                        { icon: 'work_history', label: 'Work facts locked', detail: 'Employers, titles, dates, and locations stay tied to the source resume.' },
                    ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface-hover)] p-4">
                            <span className="material-symbols-rounded text-[22px] text-[var(--text-secondary)]">{item.icon}</span>
                            <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{item.label}</p>
                            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{item.detail}</p>
                        </div>
                    ))}
                </div>
            </div>

            {!user ? (
                <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg-card)] p-6">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">Sign in required</h3>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">100% Morph unlock is tied to your account and consent record.</p>
                </div>
            ) : status.unlocked100 ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-semibold text-[var(--text-primary)]">100% Morph is enabled</h3>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">All workflows may use maximum rewrite strength. Protected facts still cannot change.</p>
                        </div>
                        <button
                            type="button"
                            onClick={disableFullMorph}
                            disabled={saving}
                            className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-card)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--theme-surface-hover)] disabled:opacity-60"
                        >
                            {saving ? 'Saving...' : 'Disable 100% Morph'}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg-card)] shadow-[var(--theme-shadow)] p-6">
                    <div className="flex items-start gap-3">
                        <span className="material-symbols-rounded text-[24px] text-amber-500">contract</span>
                        <div>
                            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Unlock 100% Morph</h3>
                            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
                                This unlock is for stronger rewriting only. It does not weaken the truth guardrails or allow fabricated credentials.
                            </p>
                        </div>
                    </div>

                    <div className="mt-5 space-y-3">
                        {RESUME_MORPH_ACKNOWLEDGEMENTS.map((text, index) => (
                            <label key={text} className="flex items-start gap-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-hover)] p-4 text-sm text-[var(--text-secondary)]">
                                <input
                                    type="checkbox"
                                    checked={accepted[index] === true}
                                    onChange={(event) => setAccepted(prev => ({ ...prev, [index]: event.target.checked }))}
                                    className="mt-0.5 h-4 w-4 rounded accent-emerald-600"
                                />
                                <span>{text}</span>
                            </label>
                        ))}
                    </div>

                    <div className="mt-5">
                        <label htmlFor="morph-consent-name" className="block text-sm font-medium text-[var(--text-primary)]">Type your name to attest</label>
                        <input
                            id="morph-consent-name"
                            value={typedName}
                            onChange={(event) => setTypedName(event.target.value)}
                            placeholder={user.displayName || user.email || 'Your name'}
                            className="mt-2 w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-hover)] px-4 py-3 text-[16px] text-[var(--text-primary)] outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={unlockFullMorph}
                        disabled={!canUnlock}
                        className={`mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
                            canUnlock
                                ? 'bg-[var(--text-primary)] text-[var(--bg-deep)] hover:opacity-90'
                                : 'border border-[var(--theme-border)] bg-[var(--theme-surface-hover)] text-[var(--text-tertiary)] cursor-not-allowed'
                        }`}
                    >
                        {saving ? 'Saving attestation...' : 'Unlock 100% Morph'}
                    </button>
                </div>
            )}
        </motion.div>
    );
}

// ===== SUBSCRIPTION TAB =====
function SubscriptionTab() {
    const { tier, isPro, loading } = useUserTier();
    const { prices } = useBillingPrices();
    const [billingNotice, setBillingNotice] = useState('');
    const [billingLoading, setBillingLoading] = useState(false);
    const [supportReceipt, setSupportReceipt] = useState<{
        status: 'none' | 'new' | 'reviewing' | 'resolved';
        updatedAt: string | null;
        resolvedAt: string | null;
    } | null>(null);
    const [supportReceiptLoading, setSupportReceiptLoading] = useState(true);
    const [supportReceiptError, setSupportReceiptError] = useState('');
    const router = useRouter();

    const loadSupportReceipt = useCallback(async () => {
        setSupportReceiptLoading(true);
        setSupportReceiptError('');
        try {
            const res = await authFetch('/api/billing/support-status');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Billing support status is unavailable.');
            setSupportReceipt({
                status: ['new', 'reviewing', 'resolved'].includes(data.status) ? data.status : 'none',
                updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
                resolvedAt: typeof data.resolvedAt === 'string' ? data.resolvedAt : null,
            });
        } catch (error: any) {
            setSupportReceipt(null);
            setSupportReceiptError(error.message || 'Billing support status is unavailable.');
        } finally {
            setSupportReceiptLoading(false);
        }
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('checkout') === 'success') {
            setBillingNotice('Your plan is being activated. Stripe will finish syncing the details in a moment.');
        } else if (params.get('checkout') === 'canceled') {
            setBillingNotice('Checkout was closed before a plan was started.');
        } else if (params.get('billing') === 'returned') {
            setBillingNotice('Billing changes are saved in Stripe. Your plan details may take a moment to refresh.');
        }
    }, []);

    useEffect(() => {
        void loadSupportReceipt();
    }, [loadSupportReceipt]);

    const plan = getPlanIdentity(tier);
    const currentPrice = plan.id === 'free' ? '$0' : 'Active plan';
    const currentBillingLine = plan.id === 'free'
        ? 'No billing connected. Pro connects active application work; Max adds Sona scouting and review-ready packets.'
        : 'Your billing interval, invoices, payment method, and cancellation are managed securely in Stripe.';

    const openUpgrade = (href = '/suite/upgrade') => router.push(href);

    const manageBilling = async () => {
        setBillingLoading(true);
        try {
            const res = await authFetch('/api/stripe/portal', { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.url) {
                window.location.href = data.url;
                return;
            }
            setBillingNotice('Could not open Stripe billing. You can try again in a moment.');
        } catch {
            setBillingNotice('Could not open Stripe billing. You can try again in a moment.');
        } finally {
            setBillingLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
        >
            <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
                    <span className="material-symbols-rounded icon-neutral align-middle">diamond</span>
                    Plan and billing
                </h3>
                <p className="text-sm text-[var(--text-secondary)]">
                    Choose Pro for hands-on application work or Max for Sona-led scouting and preparation. Billing stays in Stripe.
                </p>
            </div>

            {billingNotice && (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] px-4 py-3 text-sm text-[var(--text-primary)]">
                    {billingNotice}
                </div>
            )}

            {supportReceiptLoading && (
                <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-card)] p-4" role="status" aria-label="Loading billing support status">
                    <div className="h-4 w-40 animate-pulse rounded bg-[var(--theme-surface-hover)]" />
                    <div className="mt-3 h-3 w-full max-w-md animate-pulse rounded bg-[var(--theme-surface-hover)]" />
                </div>
            )}

            {!supportReceiptLoading && supportReceiptError && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-4" role="alert">
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-[var(--text-primary)]">Billing support status is unavailable</p>
                            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Your plan has not changed. Check the status again before starting another support request.</p>
                        </div>
                        <button
                            type="button"
                            onClick={loadSupportReceipt}
                            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 text-xs font-bold text-[var(--text-primary)]"
                        >
                            <span className="material-symbols-rounded text-[17px]" aria-hidden="true">refresh</span>
                            Check again
                        </button>
                    </div>
                </div>
            )}

            {!supportReceiptLoading && supportReceipt && supportReceipt.status !== 'none' && (() => {
                const presentation = stripeAccountReviewReceiptPresentation(supportReceipt.status);
                const timestamp = supportReceipt.status === 'resolved'
                    ? supportReceipt.resolvedAt
                    : supportReceipt.updatedAt;
                const timeLabel = timestamp && !Number.isNaN(new Date(timestamp).getTime())
                    ? new Date(timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                    : null;
                return (
                    <div className={`rounded-xl border p-4 ${
                        presentation.tone === 'ready'
                            ? 'border-blue-500/25 bg-blue-500/[0.07]'
                            : presentation.tone === 'working'
                                ? 'border-cyan-500/20 bg-cyan-500/[0.06]'
                                : 'border-amber-500/20 bg-amber-500/[0.07]'
                    }`} role="status">
                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                                <span className="material-symbols-rounded mt-0.5 text-[22px] text-blue-500" aria-hidden="true">
                                    {presentation.tone === 'ready' ? 'task_alt' : presentation.tone === 'working' ? 'manage_search' : 'schedule'}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-[var(--text-primary)]">{presentation.title}</p>
                                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{presentation.message}</p>
                                    {timeLabel && <p className="mt-1 text-[10px] text-[var(--text-muted)]">Updated {timeLabel}</p>}
                                </div>
                            </div>
                            {presentation.actionLabel && (
                                <button
                                    type="button"
                                    onClick={() => router.push('/suite/upgrade')}
                                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white transition hover:bg-blue-500"
                                >
                                    <span className="material-symbols-rounded text-[17px]" aria-hidden="true">arrow_forward</span>
                                    {presentation.actionLabel}
                                </button>
                            )}
                            {!presentation.actionLabel && (
                                <button
                                    type="button"
                                    onClick={loadSupportReceipt}
                                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 text-xs font-bold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
                                >
                                    <span className="material-symbols-rounded text-[17px]" aria-hidden="true">refresh</span>
                                    Check status
                                </button>
                            )}
                        </div>
                    </div>
                );
            })()}

            {loading ? (
                <div className="rounded-[22px] border border-[var(--theme-border)] bg-[var(--theme-bg-card)] p-6">
                    <div className="animate-pulse space-y-4">
                        <div className="h-10 w-10 rounded-2xl bg-[var(--theme-surface-hover)]" />
                        <div className="h-6 w-1/3 rounded-lg bg-[var(--theme-surface-hover)]" />
                        <div className="h-4 w-2/3 rounded-lg bg-[var(--theme-surface-hover)]" />
                        <div className="h-10 w-full rounded-xl bg-[var(--theme-surface-hover)]" />
                    </div>
                </div>
            ) : (
                <>
                    <PlanIdentityCard
                        tier={tier}
                        current
                        priceLabel={currentPrice}
                        billingLine={currentBillingLine}
                        statusLabel={isPro ? 'Active' : 'Free'}
                        primaryAction={isPro
                            ? { label: 'Manage billing', onClick: manageBilling, loading: billingLoading }
                            : { label: 'View Pro / Max', onClick: () => openUpgrade('/suite/upgrade') }}
                        secondaryAction={plan.id === 'pro'
                            ? { label: 'Explore Max', onClick: () => openUpgrade('/suite/upgrade?plan=studio') }
                            : plan.id === 'free'
                                ? { label: 'Start Pro', onClick: () => openUpgrade('/suite/upgrade?plan=pro') }
                                : undefined}
                    />

                    {plan.id === 'free' && (
                        <div className="space-y-3">
                            <div>
                                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Choose your next level</h4>
                                <p className="mt-1 text-xs text-[var(--text-secondary)]">Free proves the workflow. Pro connects an active search. Max brings ranked opportunities and prepared work back for your review. Monthly catalogue prices are shown below.</p>
                            </div>
                            <div className="overflow-x-auto pb-2 no-scrollbar">
                                <div className="grid min-w-[820px] grid-cols-3 gap-3 md:min-w-0">
                                    <PlanIdentityCard tier="free" compact current priceLabel="$0" statusLabel="Current" />
                                    <PlanIdentityCard
                                        tier="pro"
                                        compact
                                        priceLabel={prices.plans.pro.month.display}
                                        primaryAction={{ label: 'Start Pro', onClick: () => openUpgrade('/suite/upgrade?plan=pro') }}
                                    />
                                    <PlanIdentityCard
                                        tier="studio"
                                        compact
                                        priceLabel={prices.plans.studio.month.display}
                                        primaryAction={{ label: 'Unlock Max', onClick: () => openUpgrade('/suite/upgrade?plan=studio') }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {plan.id === 'pro' && (
                        <PlanIdentityCard
                            tier="studio"
                            compact
                            priceLabel={prices.plans.studio.month.display}
                            billingLine="Max adds proactive Sona scouting, ranked opportunities, truth-locked packets, and review-first alerts."
                            primaryAction={{ label: 'Explore Max', onClick: () => openUpgrade('/suite/upgrade?plan=studio') }}
                            secondaryAction={{ label: 'Manage Pro billing', onClick: manageBilling, loading: billingLoading }}
                        />
                    )}

                    {plan.id === 'studio' && (
                        <PlanStatusStrip
                            tier="studio"
                            title="Talent Max billing"
                            caption="Manage invoices, payment method, and cancellation in Stripe."
                            action={{ label: 'Manage', onClick: manageBilling, loading: billingLoading }}
                        />
                    )}
                </>
            )}
        </motion.div>
    );
}

// ===== PROFILE TAB =====
function ProfileTab({ user, setUser }: { user: any; setUser: any }) {
    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [phone, setPhone] = useState('');
    const [bio, setBio] = useState('');
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);

    const handleSaveProfile = async () => {
        setSaving(true);
        try {
            const { success, error } = await authHelpers.updateProfile({ displayName });
            if (success) {
                showToast('Profile updated!', 'check_circle');
                setEditing(false);
                setUser({ ...user, displayName });
            } else {
                showToast(error?.message || 'Failed to update', 'cancel');
            }
        } catch (e: any) {
            showToast(e.message || 'Error', 'cancel');
        }
        setSaving(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
        >
            {/* Avatar & Name */}
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] overflow-hidden">
                <div className="h-24 bg-emerald-500/10 border-b border-emerald-500/20 relative">
                    <div className="absolute -bottom-10 left-6">
                        <div className="w-20 h-20 rounded-2xl bg-[var(--theme-surface)] flex items-center justify-center text-3xl font-bold text-[var(--text-primary)] border-4 border-[var(--theme-bg)] shadow-xl">
                            {user?.email?.[0]?.toUpperCase() || '?'}
                        </div>
                    </div>
                </div>
                <div className="pt-14 px-6 pb-6">
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-[var(--text-primary)]">{user?.displayName || user?.email?.split('@')[0] || 'User'}</h2>
                            <p className="text-sm text-[var(--text-secondary)]">{user?.email || 'dev@talentconsulting.io'}</p>
                        </div>
                        <button
                            onClick={() => setEditing(!editing)}
                            className="px-4 py-2 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--theme-surface-active)] transition-all"
                        >
                            {editing ? 'Cancel' : <><span className="material-symbols-rounded align-middle mr-1">edit</span> Edit Profile</>}
                        </button>
                    </div>

                    <AnimatePresence>
                        {editing && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="space-y-4 overflow-hidden"
                            >
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Display Name</label>
                                    <input
                                        type="text"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        placeholder="Your full name"
                                        className="w-full px-4 py-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Phone Number</label>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="+1 (555) 000-0000"
                                        className="w-full px-4 py-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Bio</label>
                                    <textarea
                                        value={bio}
                                        onChange={(e) => setBio(e.target.value)}
                                        placeholder="Tell us about yourself..."
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 resize-none"
                                    />
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleSaveProfile}
                                    disabled={saving}
                                    className="w-full px-6 py-3 rounded-xl bg-emerald-500/10 border border-cyan-500/20 text-cyan-400 font-medium hover:bg-emerald-500/20 hover:border-cyan-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {saving ? 'Saving...' : <><span className="material-symbols-rounded align-middle mr-1">save</span> Save Profile</>}
                                </motion.button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Account Details Card */}
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                    <span><span className="text-xl align-middle"><span className="material-symbols-rounded">edit_document</span></span></span> Account Details
                </h3>
                <div className="space-y-3">
                    {[
                        { label: 'Email', value: user?.email || 'dev@talentconsulting.io', icon: 'mail' },
                        { label: 'User ID', value: user?.uid || user?.id || 'dev-user', icon: 'badge' },
                        { label: 'Member Since', value: user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Development Mode', icon: 'calendar_month' },
                        { label: 'Auth Provider', value: user?.providerData?.[0]?.providerId || 'Email/Password', icon: 'key' },
                    ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)]">
                            <div className="flex items-center gap-3">
                                <span className="text-xl mr-1 material-symbols-rounded align-middle">{item.icon}</span>
                                <span className="text-sm text-[var(--text-secondary)]">{item.label}</span>
                            </div>
                            <span className="text-sm text-[var(--text-primary)] font-medium truncate max-w-[200px]">{item.value}</span>
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

// ===== SECURITY TAB =====
function SecurityTab({ user }: { user: any }) {
    // Password
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [showPasswords, setShowPasswords] = useState(false);
    const [isPasswordOpen, setIsPasswordOpen] = useState(false);

    // Email
    const [newEmail, setNewEmail] = useState('');
    const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
    const [isEmailOpen, setIsEmailOpen] = useState(false);

    // MFA
    const [mfaStatus, setMfaStatus] = useState<{ enrolled: boolean; hints: any[] }>({ enrolled: false, hints: [] });
    const [mfaStep, setMfaStep] = useState<'idle' | 'qr' | 'unenrolling'>('idle');
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [totpSecret, setTotpSecret] = useState<any>(null);
    const [verifyCode, setVerifyCode] = useState('');
    const [mfaLoading, setMfaLoading] = useState(false);
    const [mfaError, setMfaError] = useState('');

    useEffect(() => {
        const status = authHelpers.getMFAStatus();
        setMfaStatus(status);
    }, [user]);

    const getPasswordStrength = (pw: string) => {
        if (!pw) return { strength: 0, label: '', color: '' };
        let s = 0;
        if (pw.length >= 8) s++;
        if (pw.length >= 12) s++;
        if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
        if (/\d/.test(pw)) s++;
        if (/[^a-zA-Z0-9]/.test(pw)) s++;
        if (s <= 2) return { strength: s, label: 'Weak', color: 'bg-red-500' };
        if (s <= 3) return { strength: s, label: 'Medium', color: 'bg-yellow-500' };
        return { strength: s, label: 'Strong', color: 'bg-green-500' };
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentPassword || !newPassword || !confirmPassword) return showToast('Fill all fields', 'cancel');
        if (newPassword !== confirmPassword) return showToast('Passwords don\'t match', 'cancel');
        if (newPassword.length < 8) return showToast('Min 8 characters', 'cancel');

        setIsUpdatingPassword(true);
        try {
            const { isValid } = await authHelpers.verifyPassword(user?.email || '', currentPassword);
            if (!isValid) { showToast('Current password incorrect', 'cancel'); setIsUpdatingPassword(false); return; }
            const { error } = await authHelpers.updatePassword(newPassword);
            if (error) { showToast(error.message || 'Failed', 'cancel'); }
            else { showToast('Password updated!', 'check_circle'); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }
        } catch (e: any) { showToast(e.message, 'cancel'); }
        setIsUpdatingPassword(false);
    };

    const handleEmailChange = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedEmail = newEmail.trim();
        if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return showToast('Enter a valid email address', 'cancel');
        if (trimmedEmail.toLowerCase() === user?.email?.toLowerCase()) return showToast('That is already your account email', 'info');

        setIsUpdatingEmail(true);
        try {
            const { error } = await authHelpers.updateEmail(trimmedEmail);
            if (error) showToast(error.message || 'Failed', 'cancel');
            else { showToast(`Verification email sent to ${trimmedEmail}. Open the link to finish the change.`, 'check_circle'); setNewEmail(''); }
        } catch (e: any) { showToast(e.message, 'cancel'); }
        setIsUpdatingEmail(false);
    };

    const handleStartMFA = async () => {
        setMfaLoading(true); setMfaError('');
        try {
            const result = await authHelpers.generateTOTPSecret();
            if (result.error) throw result.error;
            setTotpSecret(result.totpSecret);
            setSecretKey(result.secretKey || '');
            if (result.qrCodeUrl) {
                const QRCode = (await import('qrcode')).default;
                const dataUrl = await QRCode.toDataURL(result.qrCodeUrl, { width: 200, margin: 2, color: { dark: '#ffffff', light: '#00000000' } });
                setQrDataUrl(dataUrl);
            }
            setMfaStep('qr');
        } catch (err: any) { setMfaError(err.message || 'Failed'); }
        setMfaLoading(false);
    };

    const handleVerifyMFA = async () => {
        if (!verifyCode || verifyCode.length < 6) { setMfaError('Enter the 6-digit code'); return; }
        setMfaLoading(true); setMfaError('');
        try {
            const { success, error } = await authHelpers.completeTOTPEnrollment(totpSecret, verifyCode, 'Google Authenticator');
            if (error) throw error;
            if (success) { showToast('2FA enabled!', 'check_circle'); setMfaStatus({ enrolled: true, hints: [] }); setMfaStep('idle'); setVerifyCode(''); }
        } catch (err: any) { setMfaError(err.message || 'Invalid code'); }
        setMfaLoading(false);
    };

    const handleRemoveMFA = async () => {
        setMfaLoading(true); setMfaStep('unenrolling');
        try {
            const { success, error } = await authHelpers.unenrollMFA();
            if (error) throw error;
            if (success) { showToast('2FA disabled', 'check_circle'); setMfaStatus({ enrolled: false, hints: [] }); }
        } catch (err: any) { setMfaError(err.message || 'Failed'); }
        setMfaLoading(false); setMfaStep('idle');
    };

    const pwStrength = getPasswordStrength(newPassword);

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
            {/* Security Overview */}
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2"><span className="text-xl align-middle"><span className="material-symbols-rounded">lock</span></span> Security Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        { label: 'Password', status: 'Set', icon: 'key', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                        { label: '2FA', status: mfaStatus.enrolled ? 'Enabled' : 'Disabled', icon: 'shield_person', color: mfaStatus.enrolled ? 'text-emerald-400' : 'text-amber-400', bg: mfaStatus.enrolled ? 'bg-emerald-500/10' : 'bg-amber-500/10' },
                        { label: 'Last Login', status: user?.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleDateString() : 'Recently', icon: 'history', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
                    ].map((item, i) => (
                        <div key={i} className={`p-4 rounded-xl ${item.bg} border border-[var(--theme-border)]`}>
                            <div className="flex items-center gap-3">
                                <span className="text-2xl material-symbols-rounded">{item.icon}</span>
                                <div>
                                    <p className="text-sm text-[var(--text-secondary)]">{item.label}</p>
                                    <p className={`text-sm font-semibold ${item.color}`}>{item.status}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Change Password */}
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] overflow-hidden">
                <button onClick={() => setIsPasswordOpen(!isPasswordOpen)} className="w-full p-6 flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><span className="text-xl"><span className="material-symbols-rounded">lock</span></span></div>
                        <div className="text-left">
                            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Change Password</h3>
                            <p className="text-sm text-[var(--text-secondary)]">Update your account password</p>
                        </div>
                    </div>
                    <motion.svg animate={{ rotate: isPasswordOpen ? 180 : 0 }} className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></motion.svg>
                </button>
                <AnimatePresence>
                    {isPasswordOpen && (
                        <motion.form initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} onSubmit={handlePasswordChange} className="px-6 pb-6 space-y-4 overflow-hidden">
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Current Password</label>
                                <input type={showPasswords ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" className="w-full px-4 py-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">New Password</label>
                                <div className="relative">
                                    <input type={showPasswords ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" className="w-full px-4 py-3 pr-12 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20" />
                                    <button type="button" onClick={() => setShowPasswords(!showPasswords)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-sm"><span className="material-symbols-rounded text-lg">{showPasswords ? 'visibility_off' : 'visibility'}</span></button>
                                </div>
                                {newPassword && (
                                    <div className="mt-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-[var(--text-tertiary)]">Strength:</span>
                                            <span className={`text-xs font-medium ${pwStrength.label === 'Weak' ? 'text-red-400' : pwStrength.label === 'Medium' ? 'text-yellow-400' : 'text-green-400'}`}>{pwStrength.label}</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-[var(--theme-surface-hover)] rounded-full overflow-hidden">
                                            <motion.div initial={{ width: 0 }} animate={{ width: `${(pwStrength.strength / 5) * 100}%` }} className={`h-full ${pwStrength.color}`} />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Confirm Password</label>
                                <input type={showPasswords ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="w-full px-4 py-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20" />
                                {confirmPassword && newPassword !== confirmPassword && <p className="mt-1 text-xs text-red-400"><span className="material-symbols-rounded">warning</span> Passwords don't match</p>}
                            </div>
                            <button type="submit" disabled={isUpdatingPassword} className="w-full px-6 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all disabled:opacity-50">
                                {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                            </button>
                        </motion.form>
                    )}
                </AnimatePresence>
            </div>

            {/* Change Email */}
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] overflow-hidden">
                <button onClick={() => setIsEmailOpen(!isEmailOpen)} className="w-full p-6 flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><span className="text-xl"><span className="material-symbols-rounded">mail</span></span></div>
                        <div className="text-left">
                            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Change Email</h3>
                            <p className="text-sm text-[var(--text-secondary)]">Verify the new address before it replaces your current one</p>
                        </div>
                    </div>
                    <motion.svg animate={{ rotate: isEmailOpen ? 180 : 0 }} className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></motion.svg>
                </button>
                <AnimatePresence>
                    {isEmailOpen && (
                        <motion.form initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} onSubmit={handleEmailChange} className="px-6 pb-6 space-y-4 overflow-hidden">
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">New Email Address</label>
                                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@email.com" className="w-full px-4 py-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20" />
                                <p className="mt-2 text-xs text-[var(--text-tertiary)]"><span className="material-symbols-rounded text-sm align-middle mr-1">lock</span> We will send a verification link. Your current email stays active until you confirm the new one.</p>
                            </div>
                            <button type="submit" disabled={isUpdatingEmail} className="w-full px-6 py-3 rounded-xl bg-emerald-500/10 border border-cyan-500/20 text-cyan-400 font-medium hover:bg-emerald-500/20 hover:border-cyan-500/30 transition-all disabled:opacity-50">
                                {isUpdatingEmail ? 'Sending link...' : 'Send verification link'}
                            </button>
                        </motion.form>
                    )}
                </AnimatePresence>
            </div>

            {/* Two-Factor Authentication */}
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><span className="text-xl material-symbols-rounded">lock</span></div>
                        <div>
                            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Two-Factor Authentication</h3>
                            <p className="text-sm text-[var(--text-secondary)]">Google Authenticator / TOTP</p>
                        </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${mfaStatus.enrolled ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-slate-500/20 text-[var(--text-tertiary)] border-slate-500/30'}`}>
                        {mfaStatus.enrolled ? '✓ Enabled' : 'Not Enrolled'}
                    </span>
                </div>

                {mfaStatus.enrolled ? (
                    <div className="space-y-3">
                        <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20 flex items-center gap-3">
                            <span className="text-xl"><span className="material-symbols-rounded">shield_person</span></span>
                            <div>
                                <p className="text-[var(--text-primary)] font-medium">Authenticator Active</p>
                                <p className="text-sm text-[var(--text-secondary)]">{mfaStatus.hints[0]?.displayName || 'Google Authenticator'}</p>
                            </div>
                        </div>
                        <button onClick={handleRemoveMFA} disabled={mfaLoading} className="w-full px-6 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-medium hover:bg-red-500/20 transition-all disabled:opacity-50">
                            {mfaLoading && mfaStep === 'unenrolling' ? 'Removing...' : <><span className="material-symbols-rounded align-middle mr-1">delete</span> Remove 2FA</>}
                        </button>
                    </div>
                ) : mfaStep === 'qr' ? (
                    <div className="space-y-4">
                        {qrDataUrl && (
                            <div className="flex flex-col items-center">
                                <p className="text-[var(--text-secondary)] text-sm mb-3 text-center">Scan with <strong className="text-amber-400">Google Authenticator</strong></p>
                                <div className="p-4 rounded-2xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)]"><img src={qrDataUrl} alt="QR" className="w-48 h-48" /></div>
                            </div>
                        )}
                        <div className="p-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)]">
                            <p className="text-xs text-[var(--text-tertiary)] mb-1">Manual key:</p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 text-sm text-amber-400 font-mono break-all">{secretKey}</code>
                                <button onClick={() => { navigator.clipboard.writeText(secretKey); showToast('Copied!', 'content_paste'); }} className="px-2 py-1 rounded-lg bg-[var(--theme-surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xs">Copy</button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">6-digit code</label>
                            <input type="text" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full px-4 py-4 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] text-center text-2xl tracking-[0.3em] font-mono focus:outline-none focus:border-amber-500/50" placeholder="000000" maxLength={6} autoFocus />
                        </div>
                        {mfaError && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30"><p className="text-sm text-red-300">{mfaError}</p></div>}
                        <div className="flex gap-3">
                            <button onClick={handleVerifyMFA} disabled={mfaLoading || verifyCode.length < 6} className="flex-1 px-6 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-medium hover:bg-amber-500/20 transition-all disabled:opacity-50">{mfaLoading ? 'Verifying...' : 'Verify & Enable'}</button>
                            <button onClick={() => { setMfaStep('idle'); setVerifyCode(''); setMfaError(''); }} className="px-4 py-3 rounded-xl border border-[var(--theme-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancel</button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-xs text-[var(--text-tertiary)]">Use Google Authenticator, Authy, or any TOTP-compatible app for extra security.</p>
                        {mfaError && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30"><p className="text-sm text-red-300">{mfaError}</p></div>}
                        <button onClick={handleStartMFA} disabled={mfaLoading} className="w-full px-6 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-medium hover:bg-amber-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                            {mfaLoading ? 'Setting up...' : <><span className="material-symbols-rounded align-middle mr-1">lock</span> Set Up Authenticator</>}
                        </button>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// ===== NOTIFICATIONS TAB =====
function NotificationsTab() {
    const { user } = useStore();
    const { tier } = useUserTier();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [settings, setSettings] = useState({
        weeklyJobAlerts: false,
        jobAlertsFrequency: 'weekly' as JobAlertsFrequency,
        jobAlertsLastSentAt: '',
        jobAlertsLastJobCount: 0,
        studyReminders: false,
        emailApplications: true,
        emailInterviews: true,
        emailOffers: true,
        emailNewsletter: false,
        pushNewJobs: true,
        pushStatusUpdates: true,
        pushReminders: true,
    });
    const isMaxTier = tier === 'studio' || tier === 'god';

    // Load actual preferences from Firestore
    useEffect(() => {
        if (!user?.uid) { setLoading(false); return; }
        const loadPrefs = async () => {
            try {
                const res = await authFetch('/api/jobs/preferences');
                if (res.ok) {
                    const data = await res.json();
                    if (data.preferences) {
                        setSettings(prev => ({
                            ...prev,
                            weeklyJobAlerts: data.preferences.jobAlertsEnabled === true,
                            jobAlertsFrequency: data.preferences.jobAlertsFrequency === 'daily' ? 'daily' : 'weekly',
                            jobAlertsLastSentAt: data.preferences.jobAlertsLastSentAt || '',
                            jobAlertsLastJobCount: data.preferences.jobAlertsLastJobCount || 0,
                        }));
                    }
                }
            } catch { /* default values */ }
            setLoading(false);
        };
        loadPrefs();
    }, [user?.uid]);

    useEffect(() => {
        if (!isMaxTier && settings.jobAlertsFrequency !== 'weekly') {
            setSettings(prev => ({ ...prev, jobAlertsFrequency: 'weekly' }));
        }
    }, [isMaxTier, settings.jobAlertsFrequency]);

    const toggle = async (key: keyof typeof settings) => {
        const newValue = !settings[key];
        setSettings(prev => ({ ...prev, [key]: newValue }));
        setSaving(key);

        // Persist job alert toggle to Firestore
        if (key === 'weeklyJobAlerts') {
            try {
                const res = await authFetch('/api/jobs/preferences', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jobAlertsEnabled: newValue,
                        jobAlertsFrequency: isMaxTier ? settings.jobAlertsFrequency : 'weekly',
                        ...(newValue ? {
                            emailNotifications: true,
                            jobAlertsConsentAcknowledged: true,
                            jobAlertsConsentSource: 'settings_notifications',
                        } : {}),
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Failed to save');
                showToast(newValue ? 'Sona Picks enabled' : 'Sona Picks paused', 'check_circle');
            } catch {
                showToast('Failed to save', 'cancel');
                setSettings(prev => ({ ...prev, [key]: !newValue }));
            }
        } else {
            showToast('Preference saved', 'check_circle');
        }
        setSaving(null);
    };

    const saveJobAlertsFrequency = async (frequency: VisibleJobAlertsFrequency) => {
        if (!isMaxTier || frequency === settings.jobAlertsFrequency) return;
        const previous = settings.jobAlertsFrequency;
        setSettings(prev => ({ ...prev, jobAlertsFrequency: frequency }));
        setSaving('jobAlertsFrequency');
        try {
            const res = await authFetch('/api/jobs/preferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobAlertsEnabled: settings.weeklyJobAlerts,
                    jobAlertsFrequency: frequency,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to save');
            const normalized = data.preferences?.jobAlertsFrequency === 'daily' ? 'daily' : 'weekly';
            setSettings(prev => ({ ...prev, jobAlertsFrequency: normalized }));
            showToast('Sona Picks cadence saved', 'check_circle');
        } catch {
            setSettings(prev => ({ ...prev, jobAlertsFrequency: previous }));
            showToast('Failed to save', 'cancel');
        } finally {
            setSaving(null);
        }
    };

    const ToggleSwitch = ({ enabled, onChange, label, isSaving }: { enabled: boolean; onChange: () => void; label: string; isSaving?: boolean }) => (
        <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={label}
            onClick={onChange}
            disabled={isSaving}
            className={`relative grid h-11 min-w-[44px] w-12 shrink-0 place-items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${isSaving ? 'opacity-60' : ''}`}
        >
            <span className={`absolute h-7 w-12 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-[var(--theme-surface-active)]'}`} aria-hidden="true" />
            <motion.div
                animate={{ x: enabled ? 26 : 4 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="absolute left-0 h-5 w-5 rounded-full bg-white shadow-md"
                aria-hidden="true"
            />
        </button>
    );

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
            {/* Email Digest Notifications — wired to Firestore */}
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2"><span><span className="text-xl align-middle material-symbols-rounded">mail</span></span> Email Digests</h3>
                <p className="text-xs text-[var(--text-tertiary)] mb-4">Control which automated emails you receive from TalentConsulting.io.</p>
                {loading ? (
                    <div className="animate-pulse space-y-3">
                        <div className="h-14 bg-[var(--theme-surface-hover)] rounded-xl" />
                        <div className="h-14 bg-[var(--theme-surface-hover)] rounded-xl" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)]">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <span className="material-symbols-rounded text-xl text-cyan-400">radar</span>
                                    <div>
                                        <p className="text-sm font-medium text-[var(--text-primary)]">Sona Picks</p>
                                        <p className="text-xs text-[var(--text-secondary)]">Crafted job matches with fit reasons, salary signals, and application prep links.</p>
                                        <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                                            {settings.jobAlertsLastSentAt
                                                ? `Last sent ${new Date(settings.jobAlertsLastSentAt).toLocaleDateString()} with ${settings.jobAlertsLastJobCount || 0} jobs`
                                                : 'No digest sent yet'}
                                        </p>
                                    </div>
                                </div>
                                <ToggleSwitch enabled={settings.weeklyJobAlerts} onChange={() => toggle('weeklyJobAlerts')} label="Sona Picks email" isSaving={saving === 'weeklyJobAlerts'} />
                            </div>
                            {isMaxTier ? (
                                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                    {SONA_PICK_CADENCES.map(option => {
                                        const selected = settings.jobAlertsFrequency === option.value;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => saveJobAlertsFrequency(option.value)}
                                                disabled={saving === 'jobAlertsFrequency'}
                                                aria-pressed={selected}
                                                className={`rounded-xl border px-3 py-2 text-left transition disabled:opacity-60 ${selected ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-[var(--theme-border)] bg-[var(--theme-surface-hover)] hover:border-cyan-500/20'}`}
                                            >
                                                <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                                                    <span className="material-symbols-rounded text-[14px] text-cyan-500">{option.icon}</span>
                                                    {option.label}
                                                </span>
                                                <span className="mt-0.5 block text-[10px] leading-4 text-[var(--text-tertiary)]">{option.desc}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2">
                                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                                        <span className="material-symbols-rounded text-[14px] text-cyan-500">calendar_month</span>
                                        Weekly delivery
                                    </span>
                                    <span className="mt-0.5 block text-[10px] text-[var(--text-tertiary)]">Sona Picks sends every Monday when this toggle is enabled.</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)]">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-rounded text-xl text-emerald-400">route</span>
                                <div>
                                    <p className="text-sm font-medium text-[var(--text-primary)]">Study Reminders</p>
                                    <p className="text-xs text-[var(--text-secondary)]">Daily Skill Bridge progress emails</p>
                                </div>
                            </div>
                            <ToggleSwitch enabled={settings.studyReminders} onChange={() => toggle('studyReminders')} label="Study reminders" isSaving={saving === 'studyReminders'} />
                        </div>
                    </div>
                )}
            </div>

            {/* Other Email Notifications */}
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2"><span><span className="text-xl align-middle material-symbols-rounded">notifications</span></span> Activity Notifications</h3>
                <div className="space-y-4">
                    {[
                        { key: 'emailApplications' as const, label: 'Application Updates', desc: 'Status changes on your job applications' },
                        { key: 'emailInterviews' as const, label: 'Interview Reminders', desc: 'Upcoming interview alerts' },
                        { key: 'emailOffers' as const, label: 'Offer Notifications', desc: 'When you receive an offer' },
                        { key: 'emailNewsletter' as const, label: 'Product Newsletter', desc: 'Job market insights, product notes, and career tips' },
                    ].map((item) => (
                        <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)]">
                            <div>
                                <p className="text-sm font-medium text-[var(--text-primary)]">{item.label}</p>
                                <p className="text-xs text-[var(--text-secondary)]">{item.desc}</p>
                            </div>
                            <ToggleSwitch enabled={settings[item.key]} onChange={() => toggle(item.key)} label={item.label} />
                        </div>
                    ))}
                </div>
            </div>

            {/* Push Notifications */}
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2"><span><span className="material-symbols-rounded text-inherit align-middle">smartphone</span></span> Push Notifications</h3>
                <div className="space-y-4">
                    {[
                        { key: 'pushNewJobs' as const, label: 'New Job Matches', desc: 'Jobs matching your resume profile' },
                        { key: 'pushStatusUpdates' as const, label: 'Status Updates', desc: 'Real-time application status changes' },
                        { key: 'pushReminders' as const, label: 'Follow-up Reminders', desc: 'Reminders to follow up on applications' },
                    ].map((item) => (
                        <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)]">
                            <div>
                                <p className="text-sm font-medium text-[var(--text-primary)]">{item.label}</p>
                                <p className="text-xs text-[var(--text-secondary)]">{item.desc}</p>
                            </div>
                            <ToggleSwitch enabled={settings[item.key]} onChange={() => toggle(item.key)} label={item.label} />
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

// ===== FEEDBACK TAB =====
function FeedbackTab() {
    const { user } = useStore();
    const [category, setCategory] = useState('general');
    const [message, setMessage] = useState('');
    const [mood, setMood] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setCurrentPage(window.location.pathname);
        }
    }, []);

    const categories = [
        { id: 'bug', label: 'Bug', icon: 'bug_report', color: '#ef4444' },
        { id: 'feature', label: 'Feature', icon: 'lightbulb', color: '#3b82f6' },
        { id: 'general', label: 'General', icon: 'chat_bubble', color: '#10b981' },
        { id: 'other', label: 'Other', icon: 'help', color: '#6b7280' },
    ];

    const moods = [
        { value: 1, icon: 'sentiment_very_dissatisfied', label: 'Frustrated', color: '#ef4444' },
        { value: 3, icon: 'sentiment_neutral', label: 'Neutral', color: '#a3a3a3' },
        { value: 5, icon: 'sentiment_very_satisfied', label: 'Delighted', color: '#10b981' },
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            showToast('Please sign in to share feedback', 'lock');
            return;
        }
        if (message.trim().length < 5) {
            showToast('Please write at least a few words', 'cancel');
            return;
        }

        setSubmitting(true);
        try {
            const token = (user as any).accessToken || (user as any).stsTokenManager?.accessToken;
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ category, message: message.trim(), page: currentPage, mood }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to submit');
            }
            setMessage('');
            setMood(null);
            setCategory('general');
            showToast('Thank you for your feedback!', 'check_circle');
        } catch (err: any) {
            showToast(err.message || 'Failed to submit', 'cancel');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
        >
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                        <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                            <span className="material-symbols-rounded text-emerald-400">rate_review</span>
                            Feedback
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">
                            Share bugs, requests, or product notes. This now lives in Settings so the main sidebar stays focused.
                        </p>
                    </div>
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-400">
                        Product notes
                    </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                    {categories.map((cat) => {
                        const active = category === cat.id;
                        return (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setCategory(cat.id)}
                                className="flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all"
                                style={{
                                    borderColor: active ? `${cat.color}55` : 'var(--theme-border)',
                                    background: active ? `${cat.color}10` : 'var(--theme-surface-hover)',
                                }}
                            >
                                <span className="material-symbols-rounded text-[18px]" style={{ color: active ? cat.color : 'var(--text-tertiary)' }}>
                                    {cat.icon}
                                </span>
                                <span className="text-xs font-medium text-[var(--text-primary)]">{cat.label}</span>
                            </button>
                        );
                    })}
                </div>

                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                    What should we know?
                </label>
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={6}
                    maxLength={5000}
                    placeholder="Describe what happened, what you expected, or what would make Talent Studio better..."
                    className="w-full px-4 py-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 resize-none"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                        {message.length > 0 ? `${message.length}/5000` : 'Minimum 5 characters'}
                    </span>
                    <div className="flex items-center gap-1.5">
                        {moods.map((m) => (
                            <button
                                key={m.value}
                                type="button"
                                onClick={() => setMood(mood === m.value ? null : m.value)}
                                title={m.label}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border transition-all hover:scale-105"
                                style={{
                                    borderColor: mood === m.value ? `${m.color}55` : 'var(--theme-border)',
                                    background: mood === m.value ? `${m.color}10` : 'var(--theme-surface-hover)',
                                    color: mood === m.value ? m.color : 'var(--text-tertiary)',
                                }}
                            >
                                <span className="material-symbols-rounded text-[20px]">{m.icon}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <button
                type="submit"
                disabled={submitting}
                className="w-full px-6 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
                <span className="material-symbols-rounded text-[18px]">send</span>
                {submitting ? 'Sending...' : 'Send Feedback'}
            </button>
        </motion.form>
    );
}

// ===== SESSIONS TAB =====
function SessionsTab({ user }: { user: any }) {
    const sessions = [
        { device: 'This Device', browser: 'Chrome on macOS', ip: '127.0.0.1', lastActive: 'Active now', current: true, icon: 'computer' },
        { device: 'iPhone 15', browser: 'Safari on iOS', ip: '192.168.1.x', lastActive: '2 hours ago', current: false, icon: 'smartphone' },
    ];

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2"><span><span className="material-symbols-rounded text-inherit align-middle">computer</span></span> Active Sessions</h3>
                    <button className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-all" onClick={() => showToast('All other sessions will be signed out', 'info')}>
                        Sign Out All Others
                    </button>
                </div>
                <div className="space-y-3">
                    {sessions.map((session, i) => (
                        <div key={i} className={`p-4 rounded-xl border ${session.current ? 'bg-emerald-500/5 border-cyan-500/20' : 'bg-[var(--theme-surface-hover)] border-[var(--theme-border)]'}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl material-symbols-rounded flex-shrink-0">{session.icon}</span>
                                    <div>
                                        <p className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                                            {session.device}
                                            {session.current && <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-cyan-400 text-[10px]">Current</span>}
                                        </p>
                                        <p className="text-xs text-[var(--text-secondary)]">{session.browser} • {session.ip}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`text-xs font-medium ${session.current ? 'text-green-400' : 'text-[var(--text-secondary)]'}`}>{session.lastActive}</p>
                                    {!session.current && (
                                        <button className="text-xs text-red-400 hover:underline mt-1" onClick={() => showToast('Session revoked', 'check_circle')}>Revoke</button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Login History */}
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2"><span><span className="text-xl align-middle"><span className="material-symbols-rounded">content_paste</span></span></span> Login History</h3>
                <div className="space-y-2">
                    {[
                        { time: 'Today, 10:45 PM', method: 'Email/Password', location: 'Atlanta, GA', status: 'success' },
                        { time: 'Today, 8:12 AM', method: 'Email/Password', location: 'Atlanta, GA', status: 'success' },
                        { time: 'Yesterday, 11:30 PM', method: 'Email/Password', location: 'Atlanta, GA', status: 'success' },
                    ].map((entry, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[var(--theme-surface-hover)]">
                            <div className="flex items-center gap-3">
                                <span className={`w-2 h-2 rounded-full ${entry.status === 'success' ? 'bg-green-400' : 'bg-red-400'}`} />
                                <div>
                                    <p className="text-sm text-[var(--text-primary)]">{entry.time}</p>
                                    <p className="text-xs text-[var(--text-secondary)]">{entry.method} • {entry.location}</p>
                                </div>
                            </div>
                            <span className={`text-xs ${entry.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                                {entry.status === 'success' ? '✓ Success' : <><span className="material-symbols-rounded align-middle mr-1">close</span> Failed</>}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

// ===== DATA PRIVACY TAB =====
function DataPrivacyTab({ user }: { user: any }) {
    const [actionState, setActionState] = useState<'none' | 'deactivate' | 'delete'>('none');
    const [reason, setReason] = useState('');
    const [emailSent, setEmailSent] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleActionInitiation = async () => {
        setIsProcessing(true);

        try {
            const res = await authFetch('/api/account/lifecycle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: actionState,
                    reason,
                })
            });

            if (!res.ok) throw new Error('Failed to initiate action');

            setEmailSent(true);
        } catch (error) {
            console.error(error);
            showToast('Failed to initiate verification. Please try again.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-5 flex flex-col items-center justify-center text-center">
                    <span className="material-symbols-rounded text-3xl text-cyan-500 mb-2">description</span>
                    <h4 className="text-2xl font-bold text-[var(--text-primary)]">3</h4>
                    <p className="text-sm text-[var(--text-secondary)]">Saved Resumes</p>
                </div>
                <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-5 flex flex-col items-center justify-center text-center">
                    <span className="material-symbols-rounded text-3xl text-violet-500 mb-2">cases</span>
                    <h4 className="text-2xl font-bold text-[var(--text-primary)]">12</h4>
                    <p className="text-sm text-[var(--text-secondary)]">Tracked Applications</p>
                </div>
                <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-5 flex flex-col items-center justify-center text-center">
                    <span className="material-symbols-rounded text-3xl text-emerald-500 mb-2">person_search</span>
                    <h4 className="text-2xl font-bold text-[var(--text-primary)]">2</h4>
                    <p className="text-sm text-[var(--text-secondary)]">Active Personas</p>
                </div>
            </div>

            {/* Export Data */}
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2"><span className="material-symbols-rounded text-inherit align-middle">download</span> Export Your Data</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">Request a comprehensive zip file of all your stored data, resumes, and application tracking history.</p>
                <button
                    onClick={() => showToast('Data export is being prepared and will be emailed.', 'info')}
                    className="px-6 py-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] font-medium hover:bg-[var(--theme-surface-active)] transition-all flex items-center gap-2"
                >
                    <span className="material-symbols-rounded">archive</span> Request Export
                </button>
            </div>

            {/* Deactivate Account */}
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2"><span className="material-symbols-rounded text-inherit align-middle">pause_circle</span> Pause / Deactivate Account</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">Temporarily hide your profile and pause all email notifications. Your data remains safe until you return.</p>
                <button
                    onClick={() => setActionState('deactivate')}
                    className="px-6 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 font-medium hover:bg-amber-500/20 transition-all flex items-center gap-2"
                >
                    <span className="material-symbols-rounded">pause</span> Deactivate Account
                </button>
            </div>

            {/* Delete Account */}
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-rose-500/10 shadow-[var(--theme-shadow)] p-6">
                <h3 className="text-lg font-semibold text-rose-500 mb-2 flex items-center gap-2"><span className="material-symbols-rounded text-inherit align-middle">delete_forever</span> Permanent Deletion</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">Permanently remove your account, delete all uploaded resumes, and wipe your application tracking data.</p>
                <button
                    onClick={() => setActionState('delete')}
                    className="px-6 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 font-medium hover:bg-rose-500/20 transition-all flex items-center gap-2"
                >
                    <span className="material-symbols-rounded">delete</span> Delete Account
                </button>
            </div>

            {/* Action Modal */}
            <AnimatePresence>
                {actionState !== 'none' && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            className="w-full max-w-lg rounded-[24px] bg-[var(--theme-bg-card)] p-6 shadow-2xl border border-[var(--theme-border)]"
                        >
                            {!emailSent ? (
                                <>
                                    <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                                        {actionState === 'delete' ? 'Delete Account' : 'Deactivate Account'}
                                    </h2>
                                    <p className="text-[var(--text-secondary)] mb-6">
                                        We are sorry to see you go. Could you let us know why you are {actionState === 'delete' ? 'leaving' : 'pausing'}?
                                    </p>

                                    <select
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        className="w-full mb-4 px-4 py-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] focus:outline-none focus:border-cyan-500"
                                    >
                                        <option value="" disabled>Select a reason (optional)</option>
                                        <option value="found_job">I found a job!</option>
                                        <option value="taking_break">I'm taking a break from the job search.</option>
                                        <option value="too_expensive">It's too expensive.</option>
                                        <option value="too_complex">It's too complex to use.</option>
                                        <option value="privacy">Privacy concerns.</option>
                                        <option value="other">Other</option>
                                    </select>

                                    <div className="p-4 rounded-xl bg-[var(--theme-surface-hover)] mb-6">
                                        <div className="flex items-start gap-3">
                                            <span className="material-symbols-rounded text-cyan-500 mt-0.5">mail</span>
                                            <div>
                                                <h4 className="font-semibold text-[var(--text-primary)] text-sm">Email Verification Required</h4>
                                                <p className="text-xs text-[var(--text-secondary)] mt-1">
                                                    For security, we will send a verification link to your email to confirm this action.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3">
                                        <button
                                            onClick={() => setActionState('none')}
                                            className="px-5 py-2.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleActionInitiation}
                                            disabled={isProcessing}
                                            className={`px-5 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2 ${
                                                actionState === 'delete'
                                                    ? 'bg-rose-500 text-white hover:bg-rose-600'
                                                    : 'bg-amber-500 text-white hover:bg-amber-600'
                                            }`}
                                        >
                                            {isProcessing ? (
                                                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-transparent" /> Sending...</>
                                            ) : (
                                                'Send Verification Link'
                                            )}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-6">
                                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-cyan-500/10 mb-4">
                                        <span className="material-symbols-rounded text-3xl text-cyan-500">mark_email_read</span>
                                    </div>
                                    <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Check your email</h2>
                                    <p className="text-[var(--text-secondary)] mb-6">
                                        We have sent a secure link to your email address. Please click it to finalize your account {actionState}.
                                    </p>
                                    <button
                                        onClick={() => { setActionState('none'); setEmailSent(false); }}
                                        className="px-6 py-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] font-medium hover:bg-[var(--theme-surface-active)] transition-colors w-full"
                                    >
                                        Done
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </motion.div>
    );
}

// ===== DISPLAY TAB =====
const displayThemeOptions: {
  value: 'light' | 'dark' | 'system';
  label: string;
  description: string;
  iconName: string;
  swatches: string[];
  detail: string;
}[] = [
  {
    value: 'system',
    label: 'System',
    description: 'Follow your device automatically.',
    iconName: 'desktop_windows',
    swatches: ['#ffffff', '#131314', '#10b981'],
    detail: 'Switches between light and dark based on your OS preference.',
  },
  {
    value: 'light',
    label: 'Light',
    description: 'Bright surfaces for daytime focus.',
    iconName: 'light_mode',
    swatches: ['#f8f9fa', '#ffffff', '#1a73e8'],
    detail: 'Optimized for well-lit environments and screen glare reduction.',
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Low-glare console for deep work.',
    iconName: 'dark_mode',
    swatches: ['#0b0b0b', '#1a1a1b', '#a8c7fa'],
    detail: 'Reduces eye strain in dim lighting and saves battery on OLED.',
  },
];

function DisplayTab() {
    const { mode, theme, setMode } = useTheme();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
        >
            {/* Appearance */}
            <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                            <span className="material-symbols-rounded text-xl align-middle">palette</span> Appearance
                        </h3>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">Choose how Talent Studio looks to you.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
                            {theme === 'dark' ? 'Dark' : 'Light'} active
                        </span>
                        <ThemeToggle size="md" />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {displayThemeOptions.map((opt) => {
                        const isActive = mode === opt.value;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                aria-pressed={isActive}
                                onClick={() => setMode(opt.value)}
                                className={`group relative flex flex-col rounded-2xl border p-4 text-left transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 ${
                                    isActive
                                        ? 'border-cyan-500/30 bg-cyan-500/[0.07] shadow-lg shadow-cyan-500/5'
                                        : 'border-[var(--theme-border)] hover:border-[var(--theme-border-hover,var(--theme-border))] hover:bg-[var(--theme-surface-hover)]'
                                }`}
                            >
                                {/* Swatch preview */}
                                <div className="mb-3 flex h-10 w-full overflow-hidden rounded-xl border border-[var(--theme-border)]">
                                    {opt.swatches.map((swatch) => (
                                        <span
                                            key={swatch}
                                            className="h-full flex-1 transition-transform duration-200 group-hover:scale-[1.02]"
                                            style={{ backgroundColor: swatch }}
                                        />
                                    ))}
                                </div>

                                {/* Icon + Label */}
                                <div className="flex items-center gap-2.5 mb-1.5">
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
                                        isActive
                                            ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-400'
                                            : 'border-[var(--theme-border)] bg-[var(--theme-surface-hover)] text-[var(--text-secondary)]'
                                    }`}>
                                        <span className="material-symbols-rounded text-[18px]">{opt.iconName}</span>
                                    </span>
                                    <span className="text-sm font-semibold text-[var(--text-primary)]">{opt.label}</span>
                                    {isActive && (
                                        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-[var(--card-bg)]">
                                            <span className="material-symbols-rounded text-[14px]">check</span>
                                        </span>
                                    )}
                                </div>

                                {/* Description */}
                                <p className="text-xs leading-relaxed text-[var(--text-muted)]">{opt.description}</p>
                                <p className="mt-1.5 text-[10px] leading-4 text-[var(--text-tertiary)]">{opt.detail}</p>
                            </button>
                        );
                    })}
                </div>
            </div>
        </motion.div>
    );
}


// ===== HELP TAB =====
type HelpTab = 'guides' | 'faq' | 'shortcuts' | 'contact';

// ===== GUIDE DATA =====
const guides = [
    {
        id: 'liquid-resume',
        title: 'Liquid Resume',
        icon: <span className="material-symbols-rounded">description</span>,
        color: 'from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/20',
        description: 'Build and morph resumes for any job',
        sections: [
            {
                title: 'Getting Started',
                steps: [
                    'Navigate to **Liquid Resume** from the sidebar.',
                    'Choose between **Morph My Resume** (import + adapt) or **Build From Scratch**.',
                    'Morph mode: Upload your existing resume (PDF or DOCX), paste a job description, and let AI tailor it.',
                    'Build mode: Fill in your details section by section with AI-assisted suggestions.',
                ],
            },
            {
                title: 'Morph My Resume',
                steps: [
                    '**Step 1: Upload** — Drag and drop or click to upload your resume (PDF or Word supported).',
                    '**Step 2: Job Description** — Paste the target job description. The AI needs this to understand what to optimize for.',
                    '**Step 3: Morph** — Click "Morph Resume" and the AI will rewrite your resume, matching keywords, skills, and achievements to the JD.',
                    '**Step 4: Review** — Compare the original vs morphed version side by side. Edit any section you want.',
                    '**Step 5: Save & Track** — Enter the company name and save. This creates an application entry automatically.',
                ],
                tips: ['The more detailed the job description, the better the morph results. Include the full JD, not just the title.'],
            },
            {
                title: 'Build From Scratch',
                steps: [
                    'Enter your **name, title, email, phone, and location** in the header section.',
                    'Use **"<span className="material-symbols-rounded align-middle mr-1">auto_awesome</span> Generate Summary"** to create a professional summary based on your title.',
                    'Add **Experience** entries with company, role, duration, and achievements.',
                    'Click **"<span className="material-symbols-rounded align-middle mr-1">auto_awesome</span> Generate"** on any experience to get AI-suggested achievement bullets.',
                    'Add **Education** and **Skills** sections.',
                    'Choose a **template** from the template gallery to style your resume.',
                ],
                tips: ['Use the template picker at the bottom to see how your resume looks in different styles before downloading.'],
            },
            {
                title: 'Downloading Your Resume',
                steps: [
                    'Click **"<span className="material-symbols-rounded align-middle mr-1">move_to_inbox</span> Download PDF"** to get a styled PDF using your selected template.',
                    'Click **"<span className="material-symbols-rounded align-middle mr-1">description</span> Download Word"** for a `.docx` file compatible with ATS systems.',
                    'PDF files retain the visual template styling.',
                    'Word files are plain-formatted for maximum ATS compatibility.',
                ],
            },
            {
                title: 'Saving Versions',
                steps: [
                    'Click **"Save Version"** after morphing or building your resume.',
                    'Enter a **version name** (e.g., "Google SWE Resume") and the **company** you\'re applying to.',
                    'Saved versions are stored in the cloud and accessible from any device.',
                    'Each saved version automatically creates an entry in the **Application Tracker**.',
                    'You can load any saved version later to re-morph it for a different job.',
                ],
            },
        ],
    },
    {
        id: 'applications',
        title: 'Applications',
        icon: <span className="material-symbols-rounded">bar_chart</span>,
        color: 'from-indigo-500/20 to-violet-500/20 text-indigo-400 border border-indigo-500/20',
        description: 'Track applications, follow-ups, interviews, and offers',
        sections: [
            {
                title: 'Overview',
                steps: [
                    'Applications shows your saved jobs, status, follow-ups, interview prep, and offer work in one place.',
                    '**Today** shows follow-ups, prep, drafts, and offers that need review.',
                    'Switch between **Command**, **Grid**, **Board**, and **List** views using the toggle.',
                    'Use the **search bar** to find applications by company or position.',
                    'Use the **status filter** dropdown to show only specific statuses.',
                ],
            },
            {
                title: 'Managing Applications',
                steps: [
                    'Open any application to use the right-side detail drawer.',
                    'Change the status from the drawer: Applied, Screening, Interview, Offer, Accepted, and more.',
                    'Add **notes** in the notes field (e.g., interview prep, contact info, follow-up dates).',
                    'When an application reaches **Offer**, use Offer Coach to capture compensation details, prepare a counter, and record the decision.',
                    'Click **"Delete"** to permanently remove an application.',
                ],
            },
            {
                title: 'Resume Preview & Download',
                steps: [
                    'Each application links to the resume version you used when applying.',
                    'In the detail modal, you\'ll see the **"Saved Resume"** section.',
                    'Click **"Show Preview"** to expand an inline mini-resume viewer.',
                    'Click **"Download PDF"** or **"Download Word"** to download the resume anytime.',
                    'If no resume is linked, click the link to go to Liquid Resume and create one.',
                ],
                tips: ['You can download your saved resume even months after applying — it\'s stored in the cloud forever.'],
            },
            {
                title: 'Application Statuses',
                steps: [
                    '**Not Applied** — Saved but not yet submitted.',
                    '**Applied** — Application submitted.',
                    '**Screening** — Recruiter reviewing your application.',
                    '**Interview Scheduled** — Interview date set.',
                    '**Interviewed** — Completed interview(s).',
                    '**Offer Received** — Got an offer!',
                    '**Accepted** — You accepted the offer.',
                    '**Rejected** — Application was declined.',
                    '**Withdrawn** — You withdrew your application.',
                ],
            },
        ],
    },
    {
        id: 'jd-generator',
        title: 'JD Generator',
        icon: <span className="material-symbols-rounded">work</span>,
        color: 'from-cyan-500/20 to-teal-500/20 text-cyan-400 border border-cyan-500/20',
        description: 'Generate and analyze job descriptions',
        sections: [
            {
                title: 'How It Works',
                steps: [
                    'Navigate to **JD Generator** from the sidebar.',
                    'Enter a **job title** and optional details like industry, level, and skills.',
                    'Click **Generate** to create a comprehensive job description.',
                    'The AI produces a complete JD with responsibilities, qualifications, nice-to-haves, and compensation.',
                    'Copy the JD or use it directly in the Morph Resume flow.',
                ],
            },
        ],
    },
    {
        id: 'study-cards',
        title: 'Study Cards',
        icon: <span className="material-symbols-rounded">style</span>,
        color: 'from-rose-500/20 to-pink-500/20 text-rose-400 border border-rose-500/20',
        description: 'Flash cards for interview prep',
        sections: [
            {
                title: 'Using Study Cards',
                steps: [
                    'Navigate to **Study Cards** from the sidebar.',
                    'Choose a **category** (Behavioral, Technical, System Design, etc.).',
                    'Click on a card to flip it and see the answer.',
                    'Use the navigation arrows to move between cards.',
                    'Mark cards as **"Got it"** or **"Review again"** to track your progress.',
                ],
                tips: ['Study cards are great for interview prep. Review them on your phone while commuting!'],
            },
        ],
    },
    {
        id: 'market-oracle',
        title: 'Market Oracle',
        icon: <span className="material-symbols-rounded">query_stats</span>,
        color: 'from-purple-500/20 to-fuchsia-500/20 text-purple-400 border border-purple-500/20',
        description: 'AI-powered career intelligence',
        sections: [
            {
                title: 'Career Intelligence',
                steps: [
                    'Access **Market Oracle** from the sidebar.',
                    'View current **market trends** for your target role.',
                    'Analyze **salary data** across different regions and experience levels.',
                    'See **demand heatmaps** showing which skills are most in-demand.',
                    'Get **AI-recommended actions** to improve your career trajectory.',
                ],
            },
        ],
    },
    {
        id: 'settings',
        title: 'Account Settings',
        icon: <span className="material-symbols-rounded">settings</span>,
        color: 'from-slate-400/20 to-slate-500/20 text-[var(--text-secondary)] border border-slate-500/20',
        description: 'Manage your account and security',
        sections: [
            {
                title: 'Accessing Settings',
                steps: [
                    'Click your **avatar** at the bottom of the sidebar.',
                    'Select **"Settings"** from the popup menu.',
                    'Alternatively, navigate directly to the Settings page from the sidebar.',
                ],
            },
            {
                title: 'Profile',
                steps: [
                    'View and edit your **display name**, phone, and bio.',
                    'See your account details: email, user ID, member since, auth provider.',
                ],
            },
            {
                title: 'Security',
                steps: [
                    '**Change Password**: Enter current password, then new password with strength indicator.',
                    '**Change Email**: Enter a new email. Your current email stays active until you open the verification link.',
                    '**Two-Factor Auth**: Set up Google Authenticator or any TOTP app for extra security.',
                    'Scan the QR code with your authenticator app and enter the 6-digit code to verify.',
                ],
                tips: ['We strongly recommend enabling 2FA for maximum account security.'],
            },
            {
                title: 'Other Tabs',
                steps: [
                    '**Notifications**: Toggle email and push notification preferences.',
                    '**Sessions**: View active devices and login history. Revoke other sessions.',
                    '**Data & Privacy**: Export your data, temporarily pause your account, or permanently delete it securely.',
                ],
            },
        ],
    },
];

// ===== FAQ DATA =====
const faqs = [
    {
        category: 'Resume',
        icon: <span className="material-symbols-rounded mr-2 text-sm">description</span>,
        questions: [
            { q: 'What file formats can I upload?', a: 'We support PDF (.pdf) and Word (.docx) files. The system parses them automatically using AI to extract your information.' },
            { q: 'How does the Morph feature work?', a: 'Morph analyzes your existing resume and the target job description using AI. It rewrites your experience, skills, and summary to match the JD\'s keywords and requirements while preserving your actual achievements.' },
            { q: 'Will the morphed resume pass ATS systems?', a: 'Yes! Our AI is trained to optimize for Applicant Tracking Systems. The Word download format is specifically ATS-friendly with clean formatting.' },
            { q: 'Can I save multiple versions of my resume?', a: 'Absolutely. Each time you morph or build a resume, you can save it as a named version. All versions are stored in the cloud and can be accessed from any device.' },
            { q: 'How many resumes can I save?', a: 'There\'s no limit. Save as many versions as you need — one for each job application.' },
        ],
    },
    {
        category: 'Applications',
        icon: <span className="material-symbols-rounded mr-2 text-sm">bar_chart</span>,
        questions: [
            { q: 'How do applications get created?', a: 'Applications are automatically created when you save a resume version with a company name. You can also manually update statuses and add notes.' },
            { q: 'Can I download my saved resume from the Applications section?', a: 'Yes! Click "View Details" on any application card. You\'ll see the linked resume with PDF and Word download buttons, plus an inline preview.' },
            { q: 'What do the different statuses mean?', a: 'Statuses track your application journey: Not Applied → Applied → Screening → Interview → Offer → Accepted. You can also mark as Rejected or Withdrawn.' },
        ],
    },
    {
        category: 'Account & Security',
        icon: <span className="material-symbols-rounded mr-2 text-sm">lock</span>,
        questions: [
            { q: 'Where is my data stored?', a: 'All data is stored in Google Firebase Firestore cloud database. Your data is encrypted and accessible from any device you log into.' },
            { q: 'How do I enable two-factor authentication?', a: 'Go to Settings → Security → Two-Factor Authentication. Click "Set Up Authenticator", scan the QR code with Google Authenticator or Authy, and enter the 6-digit code.' },
            { q: 'Can I delete my account?', a: 'Yes. Go to Settings → Data & Privacy. You can pause your account or request permanent deletion. For security, we will send a confirmation link to your email.' },
            { q: 'How do I change my password?', a: 'Go to Settings → Security → Change Password. Enter your current password, then your new password. We show a strength meter to help you choose a strong one.' },
        ],
    },
    {
        category: 'General',
        icon: <span className="material-symbols-rounded mr-2 text-sm">public</span>,
        questions: [
            { q: 'Can I use this on my phone?', a: 'Yes! The platform is fully responsive and works on mobile browsers. Your data syncs across all devices.' },
            { q: 'Is there a dark mode?', a: 'The platform is dark mode by default — designed for reduced eye strain during long job search sessions.' },
            { q: 'What AI model powers the platform?', a: 'We use advanced proprietary AI models for resume morphing, summary generation, achievement suggestions, and career intelligence analysis.' },
            { q: 'Is my resume data used to train AI?', a: 'No. Your personal data is never used to train any AI models. It\'s only processed temporarily to generate your results.' },
        ],
    },
];

// ===== KEYBOARD SHORTCUTS =====
const shortcuts = [
    { category: 'Navigation', items: [
        { keys: ['keyboard_command_key', 'K'], desc: 'Open Command Palette / Quick Jump' },
        { keys: ['keyboard_command_key', 'B'], desc: 'Toggle sidebar' },
        { keys: ['Esc'], desc: 'Close modals and popups' },
    ]},
    { category: 'Resume Builder', items: [
        { keys: ['keyboard_command_key', 'S'], desc: 'Save current resume version' },
        { keys: ['keyboard_command_key', 'D'], desc: 'Download as PDF' },
        { keys: ['keyboard_command_key', 'Shift', 'D'], desc: 'Download as Word' },
    ]},
    { category: 'General', items: [
        { keys: ['keyboard_command_key', '/'], desc: 'Open Help page' },
        { keys: ['keyboard_command_key', ','], desc: 'Open Settings' },
        { keys: ['keyboard_command_key', 'Shift', 'L'], desc: 'Sign out' },
    ]},
];

const HELP_TABS: { id: HelpTab; label: string; icon: React.ReactNode }[] = [
    { id: 'guides', label: 'How-To Guides', icon: <span className="material-symbols-rounded text-xl mr-1 align-middle">menu_book</span> },
    { id: 'faq', label: 'FAQ', icon: <span className="text-xl mr-1"><span className="material-symbols-rounded align-middle">help</span></span> },
    { id: 'shortcuts', label: 'Shortcuts', icon: <span className="text-xl mr-1"><span className="material-symbols-rounded">keyboard</span></span> },
    { id: 'contact', label: 'Contact & Support', icon: <span className="material-symbols-rounded text-xl mr-1 align-middle">headset_mic</span> },
];


function HelpTab() {
    const [activeTab, setActiveTab] = useState<HelpTab>('guides');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
    const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
    const [contactForm, setContactForm] = useState({ name: '', email: '', category: 'general', message: '' });
    const [contactStatus, setContactStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [contactError, setContactError] = useState('');

    const filteredGuides = guides.filter(g =>
        g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.sections.some(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.steps.some(step => step.toLowerCase().includes(searchQuery.toLowerCase()))
        )
    );

    const filteredFaqs = faqs.map(cat => ({
        ...cat,
        questions: cat.questions.filter(q =>
            q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
            q.a.toLowerCase().includes(searchQuery.toLowerCase())
        ),
    })).filter(cat => cat.questions.length > 0);

    return (
        <div className="mobile-app-content min-h-dvh px-4 py-3 md:p-6 lg:p-8">


            {/* Tab Navigation */}
            <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
                {HELP_TABS.map((tab: any) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${activeTab === tab.id
                            ? 'bg-emerald-500/10 border border-cyan-500/20 text-cyan-400 shadow-lg'
                            : 'bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--theme-surface-hover)]'
                            }`}
                    >
                        <span>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <AnimatePresence mode="wait">
                {activeTab === 'guides' && (
                    <motion.div key="guides" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-4">
                        {/* Quick Start Banner */}
                        {!searchQuery && (
                            <div className="rounded-2xl bg-[var(--theme-bg-elevated)] border border-[var(--theme-border)] p-6 mb-6">
                                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2"><span className="material-symbols-rounded icon-neutral text-lg">rocket_launch</span> Quick Start</h3>
                                <div className="grid md:grid-cols-3 gap-4 text-sm">
                                    <div className="flex items-start gap-2">
                                        <span className="mt-0.5 text-amber-400 font-bold">1.</span>
                                        <p className="text-[var(--text-secondary)]">Upload your resume in <strong className="text-[var(--text-primary)]">Liquid Resume</strong></p>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="mt-0.5 text-amber-400 font-bold">2.</span>
                                        <p className="text-[var(--text-secondary)]">Paste a job description and click <strong className="text-[var(--text-primary)]">Morph</strong></p>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="mt-0.5 text-amber-400 font-bold">3.</span>
                                        <p className="text-[var(--text-secondary)]">Save, download, and track in <strong className="text-[var(--text-primary)]">Applications</strong></p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Guide Cards */}
                        {filteredGuides.map((guide) => (
                            <div key={guide.id} className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] overflow-hidden">
                                <button
                                    onClick={() => setExpandedGuide(expandedGuide === guide.id ? null : guide.id)}
                                    className="w-full p-6 flex items-center justify-between group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${guide.color} flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform`}>
                                            {guide.icon}
                                        </div>
                                        <div className="text-left">
                                            <h3 className="text-lg font-bold text-[var(--text-primary)]">{guide.title}</h3>
                                            <p className="text-sm text-[var(--text-secondary)]">{guide.description}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-[var(--text-secondary)] bg-[var(--theme-surface-hover)] px-2 py-1 rounded-lg">{guide.sections.length} guides</span>
                                        <motion.svg animate={{ rotate: expandedGuide === guide.id ? 180 : 0 }} className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </motion.svg>
                                    </div>
                                </button>

                                <AnimatePresence>
                                    {expandedGuide === guide.id && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="px-6 pb-6 space-y-6">
                                                {guide.sections.map((section, si) => (
                                                    <div key={si} className="relative">
                                                        <h4 className="text-base font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-3">
                                                            <span className={`w-7 h-7 rounded-lg bg-gradient-to-br ${guide.color} flex items-center justify-center text-xs text-[var(--text-primary)] font-bold`}>
                                                                {si + 1}
                                                            </span>
                                                            {section.title}
                                                        </h4>
                                                        <div className="pl-10 space-y-2">
                                                            {section.steps.map((step, stepI) => (
                                                                <div key={stepI} className="flex gap-3">
                                                                    <span className="w-1.5 h-1.5 mt-2 rounded-full bg-silver/40 flex-shrink-0" />
                                                                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed"
                                                                        dangerouslySetInnerHTML={{
                                                                            __html: step.replace(/\*\*(.*?)\*\*/g, '<strong class="text-[var(--text-primary)] font-medium">$1</strong>')
                                                                        }}
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {section.tips && section.tips.length > 0 && (
                                                            <div className="ml-10 mt-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-3">
                                                                <span className="material-symbols-rounded icon-neutral mt-0.5 text-base">lightbulb</span>
                                                                <div className="text-xs text-amber-200/80">
                                                                    {section.tips.map((tip, ti) => <p key={ti}>{tip}</p>)}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))}
                    </motion.div>
                )}

                {activeTab === 'faq' && (
                    <motion.div key="faq" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
                        {filteredFaqs.map((category) => (
                            <div key={category.category}>
                                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">{category.icon}{category.category}</h3>
                                <div className="space-y-2">
                                    {category.questions.map((faq, i) => {
                                        const faqKey = `${category.category}-${i}`;
                                        return (
                                            <div key={i} className="rounded-xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] overflow-hidden">
                                                <button
                                                    onClick={() => setExpandedFaq(expandedFaq === faqKey ? null : faqKey)}
                                                    className="w-full p-4 flex items-center justify-between text-left"
                                                >
                                                    <span className="text-sm font-medium text-[var(--text-primary)] pr-4">{faq.q}</span>
                                                    <motion.svg animate={{ rotate: expandedFaq === faqKey ? 180 : 0 }} className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </motion.svg>
                                                </button>
                                                <AnimatePresence>
                                                    {expandedFaq === faqKey && (
                                                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                                                            <div className="px-4 pb-4">
                                                                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{faq.a}</p>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </motion.div>
                )}

                {activeTab === 'shortcuts' && (
                    <motion.div key="shortcuts" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
                        {shortcuts.map((group) => (
                            <div key={group.category} className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                                    <span className="material-symbols-rounded">keyboard</span> {group.category}
                                </h3>
                                <div className="space-y-3">
                                    {group.items.map((shortcut, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)]">
                                            <span className="text-sm text-[var(--text-secondary)]">{shortcut.desc}</span>
                                            <div className="flex gap-1.5">
                                                {shortcut.keys.map((key, ki) => (
                                                    <kbd key={ki} className="px-2.5 py-1 rounded-lg bg-[#1a1a1a] border border-[var(--theme-border)] text-[var(--text-primary)] text-xs font-mono shadow-sm">
                                                        {key}
                                                    </kbd>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </motion.div>
                )}

                {activeTab === 'contact' && (
                    <motion.div key="contact" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
                        {/* Support Channels */}
                        <div className="grid md:grid-cols-3 gap-4">
                            {[
                                { icon: <span className="material-symbols-rounded">mail</span>, title: 'Email Support', desc: 'Get help within 24 hours', action: 'Use the form below', color: 'from-indigo-500/10 to-violet-500/10', border: 'border-indigo-500/20' },
                                { icon: <span className="material-symbols-rounded">chat_bubble</span>, title: 'Live Chat', desc: 'Chat with our AI assistant', action: 'Click the AI bubble →', color: 'from-emerald-500/10 to-teal-500/10', border: 'border-emerald-500/20' },
                                { icon: <span className="material-symbols-rounded">bug_report</span>, title: 'Report a Bug', desc: 'Help us improve', action: 'Select "Bug Report" below', color: 'from-red-500/10 to-rose-500/10', border: 'border-red-500/20' },
                            ].map((channel, i) => (
                                <div key={i} className={`rounded-2xl bg-gradient-to-br ${channel.color} border ${channel.border} p-6`}>
                                    <span className="text-2xl block mb-3 text-white/70">{channel.icon}</span>
                                    <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">{channel.title}</h3>
                                    <p className="text-sm text-[var(--text-secondary)] mb-3">{channel.desc}</p>
                                    <p className="text-sm text-cyan-400 font-medium">{channel.action}</p>
                                </div>
                            ))}
                        </div>

                        {/* Feedback Form */}
                        <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2"><span className="material-symbols-rounded">edit_document</span> Send Feedback</h3>
                            <div className="space-y-4">
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Your Name</label>
                                        <input type="text" placeholder="Enter your name" value={contactForm.name} onChange={(e) => setContactForm(f => ({ ...f, name: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-amber-500/50" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Email</label>
                                        <input type="email" placeholder="your@email.com" value={contactForm.email} onChange={(e) => setContactForm(f => ({ ...f, email: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-amber-500/50" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Category</label>
                                    <select value={contactForm.category} onChange={(e) => setContactForm(f => ({ ...f, category: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] focus:outline-none focus:border-amber-500/50">
                                        <option value="bug">Bug Report</option>
                                        <option value="feature">Feature Request</option>
                                        <option value="general">General Feedback</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Message</label>
                                    <textarea rows={4} placeholder="Tell us what's on your mind..." value={contactForm.message} onChange={(e) => setContactForm(f => ({ ...f, message: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-[var(--theme-surface-hover)] border border-[var(--theme-border)] text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-amber-500/50 resize-none" />
                                </div>
                                {contactStatus === 'error' && <p className="text-sm text-red-500">{contactError}</p>}
                                {contactStatus === 'sent' && <p className="text-sm text-emerald-500">✓ Feedback sent successfully. We'll get back to you soon.</p>}
                                <button
                                    disabled={contactStatus === 'sending'}
                                    onClick={async () => {
                                        setContactStatus('sending');
                                        setContactError('');
                                        try {
                                            const res = await fetch('/api/contact', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify(contactForm),
                                            });
                                            const data = await res.json();
                                            if (!res.ok) throw new Error(data.error || 'Failed to send');
                                            setContactStatus('sent');
                                            setContactForm({ name: '', email: '', category: 'general', message: '' });
                                        } catch (err: any) {
                                            setContactStatus('error');
                                            setContactError(err.message);
                                        }
                                    }}
                                    className="px-6 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 font-medium hover:bg-amber-500/20 hover:border-amber-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <span className="material-symbols-rounded">{contactStatus === 'sending' ? 'hourglass_empty' : contactStatus === 'sent' ? 'check_circle' : 'rocket_launch'}</span>
                                    {contactStatus === 'sending' ? 'Sending...' : contactStatus === 'sent' ? 'Sent!' : 'Send Feedback'}
                                </button>
                            </div>
                        </div>

                        {/* Platform Info */}
                        <div className="rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-[var(--theme-shadow)] p-6">
                            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2"><span className="material-symbols-rounded">info</span> Platform Info</h3>
                            <div className="grid md:grid-cols-2 gap-3">
                                {[
                                    { label: 'Version', value: 'Talent Suite v1.0' },
                                    { label: 'AI Engine', value: 'Proprietary AI' },
                                    { label: 'Cloud Storage', value: 'Firebase Firestore' },
                                    { label: 'Auth Provider', value: 'Firebase Auth' },
                                ].map((info, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[var(--theme-surface-hover)]">
                                        <span className="text-sm text-[var(--text-secondary)]">{info.label}</span>
                                        <span className="text-sm text-[var(--text-primary)] font-medium">{info.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
