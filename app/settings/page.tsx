'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { authHelpers } from '@/lib/firebase';
import { mfaEnrollmentEnabled, reportSanitizedAuthIssue } from '@/lib/auth-flow';

interface Toast {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}

// ============================================
// MFA ENROLLMENT COMPONENT (TOTP / Google Authenticator)
// ============================================
function MFASection({ addToast }: { addToast: (type: 'success' | 'error' | 'info', message: string) => void }) {
    const { user } = useStore();
    const [mfaStatus, setMfaStatus] = useState<{ enrolled: boolean; hints: any[] }>({ enrolled: false, hints: [] });
    const [step, setStep] = useState<'idle' | 'qr' | 'unenrolling'>('idle');
    const [totpSecret, setTotpSecret] = useState<any>(null);
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        refreshMFAStatus();
    }, [user]);

    const refreshMFAStatus = () => {
        const status = authHelpers.getMFAStatus();
        setMfaStatus(status);
    };

    const handleStartEnroll = async () => {
        setLoading(true);
        setError('');

        try {
            const result = await authHelpers.generateTOTPSecret();
            if (result.error) throw result.error;

            setTotpSecret(result.totpSecret);
            setSecretKey(result.secretKey || '');

            // Generate QR code as data URL. Dark modules on a transparent field so
            // the code sits on the always-white --paper well and stays scannable in
            // both themes (a white-module QR was invisible on the light surface).
            if (result.qrCodeUrl) {
                const QRCode = (await import('qrcode')).default;
                const dataUrl = await QRCode.toDataURL(result.qrCodeUrl, {
                    width: 200,
                    margin: 2,
                    color: { dark: '#151515', light: '#00000000' },
                });
                setQrDataUrl(dataUrl);
            }

            setStep('qr');
        } catch (err: any) {
            reportSanitizedAuthIssue('totp-enroll', err);
            setError(err.message || 'Failed to generate authenticator secret');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyEnroll = async () => {
        if (!verifyCode || verifyCode.length < 6) {
            setError('Please enter the 6-digit code from your authenticator app');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const { success, error } = await authHelpers.completeTOTPEnrollment(
                totpSecret,
                verifyCode,
                'Google Authenticator'
            );

            if (error) throw error;

            if (success) {
                addToast('success', 'Two-factor authentication enabled!');
                refreshMFAStatus();
                setStep('idle');
                setVerifyCode('');
                setTotpSecret(null);
                setQrDataUrl('');
                setSecretKey('');
            }
        } catch (err: any) {
            reportSanitizedAuthIssue('totp-verify', err);
            setError(err.message || 'Invalid verification code');
        } finally {
            setLoading(false);
        }
    };

    const handleUnenroll = async () => {
        setLoading(true);
        setError('');
        setStep('unenrolling');

        try {
            const { success, error } = await authHelpers.unenrollMFA();
            if (error) throw error;

            if (success) {
                addToast('success', 'Two-factor authentication disabled');
                refreshMFAStatus();
            }
        } catch (err: any) {
            reportSanitizedAuthIssue('totp-unenroll', err);
            setError(err.message || 'Failed to remove 2FA');
        } finally {
            setLoading(false);
            setStep('idle');
        }
    };

    const copySecret = () => {
        navigator.clipboard.writeText(secretKey);
        addToast('info', 'Secret key copied!');
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="elevation-card overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)]"
        >
            <div className="relative p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="icon-shell-neutral inline-grid h-12 w-12 shrink-0 place-items-center rounded-xl border">
                            <span className="material-symbols-rounded icon-neutral text-2xl">enhanced_encryption</span>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-[var(--text-primary)]">Two-Factor Authentication</h2>
                            <p className="text-sm text-[var(--text-secondary)]">Protect your account with Google Authenticator</p>
                        </div>
                    </div>
                    {mfaStatus.enrolled ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--success)] px-3 py-1 text-xs font-medium text-[var(--success)]">
                            <span className="material-symbols-rounded text-[15px] leading-none" aria-hidden="true">check_circle</span>
                            Enabled
                        </span>
                    ) : (
                        <span className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
                            Not Enrolled
                        </span>
                    )}
                </div>

                {mfaStatus.enrolled ? (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                            <div className="flex items-center gap-3">
                                <div className="inline-grid h-10 w-10 place-items-center rounded-full border border-[var(--success)]">
                                    <span className="material-symbols-rounded text-lg text-[var(--success)]">shield</span>
                                </div>
                                <div>
                                    <p className="font-medium text-[var(--text-primary)]">Authenticator App</p>
                                    <p className="text-sm text-[var(--text-secondary)]">
                                        {mfaStatus.hints[0]?.displayName || 'Google Authenticator'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleUnenroll}
                            disabled={loading}
                            className="w-full min-h-[44px] rounded-xl border border-[var(--danger)] bg-transparent px-6 py-3 font-medium text-[var(--danger)] transition-colors hover:bg-[var(--accent-dim)] disabled:opacity-50"
                        >
                            {loading && step === 'unenrolling' ? 'Removing...' : 'Remove 2FA'}
                        </motion.button>
                    </div>
                ) : step === 'qr' ? (
                    <div className="space-y-5">
                        {/* QR Code */}
                        <div className="flex flex-col items-center">
                            <p className="mb-4 text-center text-sm text-[var(--text-secondary)]">
                                Scan this QR code with <strong className="text-[var(--accent)]">Google Authenticator</strong> or any TOTP app
                            </p>
                            {qrDataUrl && (
                                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--paper)] p-4">
                                    <img src={qrDataUrl} alt="QR Code for authenticator" className="h-48 w-48" />
                                </div>
                            )}
                        </div>

                        {/* Manual key */}
                        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                            <p className="mb-1 text-xs text-[var(--text-muted)]">Can&apos;t scan? Enter this key manually:</p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 select-all break-all font-mono text-sm text-[var(--accent)]">{secretKey}</code>
                                <button
                                    onClick={copySecret}
                                    className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        {/* Verify */}
                        <div>
                            <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                                Enter code from app
                            </label>
                            <input
                                type="text"
                                value={verifyCode}
                                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-4 text-center font-mono text-2xl tracking-[0.3em] text-[var(--text-primary)] transition-all focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-dim)]"
                                placeholder="000000"
                                maxLength={6}
                                disabled={loading}
                                autoFocus
                            />
                        </div>

                        {error && (
                            <div className="rounded-xl border border-[var(--danger)] bg-[var(--bg-surface)] p-3">
                                <p className="text-sm text-[var(--danger)]">{error}</p>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleVerifyEnroll}
                                disabled={loading || verifyCode.length < 6}
                                className="btn-primary flex-1 min-h-[44px] rounded-xl px-6 py-3 font-medium disabled:opacity-50"
                            >
                                {loading ? 'Verifying...' : 'Verify & Enable'}
                            </motion.button>
                            <button
                                onClick={() => { setStep('idle'); setVerifyCode(''); setError(''); setTotpSecret(null); setQrDataUrl(''); }}
                                className="btn-secondary min-h-[44px] rounded-xl px-4 py-3"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-xs text-[var(--text-muted)]">
                            Use Google Authenticator, Authy, or any TOTP-compatible app to generate verification codes every time you sign in.
                        </p>
                        {error && (
                            <div className="rounded-xl border border-[var(--danger)] bg-[var(--bg-surface)] p-3">
                                <p className="text-sm text-[var(--danger)]">{error}</p>
                            </div>
                        )}
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleStartEnroll}
                            disabled={loading}
                            className="btn-primary w-full min-h-[44px] rounded-xl px-6 py-3 font-medium disabled:opacity-50"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Setting up...
                                </span>
                            ) : (
                                'Set Up Authenticator App'
                            )}
                        </motion.button>
                    </div>
                )}
            </div>
        </motion.div>
    );
}


export default function SettingsPage() {
    const router = useRouter();
    const { user } = useStore();
    const [toasts, setToasts] = useState<Toast[]>([]);

    // Email change state
    const [newEmail, setNewEmail] = useState('');
    const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

    // Password change state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [showPasswords, setShowPasswords] = useState(false);

    // Collapsible sections state
    const [isEmailSectionOpen, setIsEmailSectionOpen] = useState(false);
    const [isPasswordSectionOpen, setIsPasswordSectionOpen] = useState(false);

    const addToast = (type: Toast['type'], message: string) => {
        const id = Date.now().toString();
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 5000);
    };

    const handleEmailChange = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedEmail = newEmail.trim();

        if (!trimmedEmail) {
            addToast('error', 'Please enter a new email address');
            return;
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmedEmail)) {
            addToast('error', 'Please enter a valid email address');
            return;
        }

        if (trimmedEmail.toLowerCase() === user?.email?.toLowerCase()) {
            addToast('info', 'That is already your account email');
            return;
        }

        setIsUpdatingEmail(true);
        try {
            const { error } = await authHelpers.updateEmail(trimmedEmail);

            if (error) {
                addToast('error', error.message || 'Failed to send verification email');
            } else {
                addToast('success', `Verification email sent to ${trimmedEmail}. Open the link to finish the change.`);
                setNewEmail('');
            }
        } catch (err: any) {
            addToast('error', err.message || 'An unexpected error occurred');
        } finally {
            setIsUpdatingEmail(false);
        }
    };

    const getPasswordStrength = (password: string): { strength: number; label: string; color: string } => {
        if (!password) return { strength: 0, label: '', color: '' };

        let strength = 0;
        if (password.length >= 8) strength++;
        if (password.length >= 12) strength++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
        if (/\d/.test(password)) strength++;
        if (/[^a-zA-Z0-9]/.test(password)) strength++;

        if (strength <= 2) return { strength, label: 'Weak', color: 'bg-[var(--danger)]' };
        if (strength <= 3) return { strength, label: 'Medium', color: 'bg-[var(--warning)]' };
        return { strength, label: 'Strong', color: 'bg-[var(--success)]' };
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!currentPassword || !newPassword || !confirmPassword) {
            addToast('error', 'Please fill in all password fields');
            return;
        }

        if (newPassword !== confirmPassword) {
            addToast('error', 'Passwords do not match');
            return;
        }

        if (newPassword.length < 8) {
            addToast('error', 'Password must be at least 8 characters long');
            return;
        }

        setIsUpdatingPassword(true);
        try {
            // First, verify the current password
            const { isValid, error: verifyError } = await authHelpers.verifyPassword(
                user?.email || '',
                currentPassword
            );

            if (!isValid) {
                addToast('error', 'Current password is incorrect');
                setIsUpdatingPassword(false);
                return;
            }

            // If current password is valid, proceed with update
            const { data, error } = await authHelpers.updatePassword(newPassword);

            if (error) {
                addToast('error', error.message || 'Failed to update password');
            } else {
                addToast('success', 'Password updated successfully!');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            }
        } catch (err: any) {
            addToast('error', err.message || 'An unexpected error occurred');
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const passwordStrength = getPasswordStrength(newPassword);

    const toastIconColor = (type: Toast['type']) =>
        type === 'success' ? 'text-[var(--success)]' : type === 'error' ? 'text-[var(--danger)]' : 'text-[var(--accent)]';

    return (
        <div className="min-h-dvh p-6 lg:p-8">
            {/* Toast Notifications */}
            <div className="fixed top-4 right-4 z-50 space-y-2">
                <AnimatePresence>
                    {toasts.map((toast) => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, x: 100, scale: 0.8 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 100, scale: 0.8 }}
                            className="elevation-raised rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-3 text-[var(--text-primary)] backdrop-blur-xl"
                        >
                            <div className="flex items-center gap-2">
                                {toast.type === 'success' && <span className={`material-symbols-rounded text-base ${toastIconColor(toast.type)}`}>check_circle</span>}
                                {toast.type === 'error' && <span className={`material-symbols-rounded text-base ${toastIconColor(toast.type)}`}>error</span>}
                                {toast.type === 'info' && <span className={`material-symbols-rounded text-base ${toastIconColor(toast.type)}`}>info</span>}
                                <span className="text-sm font-medium">{toast.message}</span>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <button
                            onClick={() => router.back()}
                            className="group inline-grid min-h-[44px] min-w-[44px] place-items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            aria-label="Go back"
                        >
                            <svg className="h-6 w-6 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </button>
                        <div className="inline-grid h-12 w-12 place-items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--accent-dim)]">
                            <svg className="h-6 w-6 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Account Settings</h1>
                            <p className="text-sm text-[var(--text-secondary)]">Manage your account preferences and security</p>
                        </div>
                    </div>
                </motion.div>

                <div className="space-y-6">
                    {/* Account Information */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="elevation-card overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)]"
                    >
                        <div className="relative p-6">
                            <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
                                <span className="material-symbols-rounded text-xl text-[var(--accent)]">person</span>
                                Account Information
                            </h2>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                                    <div>
                                        <p className="text-sm text-[var(--text-muted)]">Full Name</p>
                                        <p className="font-medium text-[var(--text-primary)]">{user?.displayName || 'Not specified'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                                    <div>
                                        <p className="text-sm text-[var(--text-muted)]">Email Address</p>
                                        <p className="font-medium text-[var(--text-primary)]">{user?.email}</p>
                                    </div>
                                    <div className="inline-grid h-10 w-10 place-items-center rounded-full bg-[var(--accent)] text-lg font-bold text-[var(--accent-on)]">
                                        {user?.email?.[0].toUpperCase()}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                                    <p className="text-sm text-[var(--text-muted)]">Account Created</p>
                                    <p className="font-medium text-[var(--text-primary)]">
                                        {user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                        }) : 'Not available'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Change Email */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="elevation-card overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)]"
                    >
                        <div className="relative p-6">
                            <button
                                onClick={() => setIsEmailSectionOpen(!isEmailSectionOpen)}
                                className="group flex min-h-[44px] w-full items-center justify-between text-left"
                            >
                                <h2 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
                                    <span className="material-symbols-rounded text-xl text-[var(--accent)]">mail</span>
                                    Change Email Address
                                </h2>
                                <motion.svg
                                    animate={{ rotate: isEmailSectionOpen ? 180 : 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="h-5 w-5 text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-primary)]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </motion.svg>
                            </button>
                            <AnimatePresence>
                                {isEmailSectionOpen && (
                                    <motion.form
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.3 }}
                                        onSubmit={handleEmailChange}
                                        className="mt-4 space-y-4 overflow-hidden"
                                    >
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                                                New Email Address
                                            </label>
                                            <input
                                                type="email"
                                                value={newEmail}
                                                onChange={(e) => setNewEmail(e.target.value)}
                                                placeholder="Enter new email"
                                                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-3 text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-all focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-dim)]"
                                            />
                                            <p className="mt-2 text-xs text-[var(--text-muted)]">
                                                We will send a verification link. Your current email stays active until you confirm the new one.
                                            </p>
                                        </div>
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            type="submit"
                                            disabled={isUpdatingEmail}
                                            className="btn-primary w-full min-h-[44px] rounded-xl px-6 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {isUpdatingEmail ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                    </svg>
                                                    Sending link...
                                                </span>
                                            ) : (
                                                'Send verification link'
                                            )}
                                        </motion.button>
                                    </motion.form>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>

                    {/* Change Password */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="elevation-card overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)]"
                    >
                        <div className="relative p-6">
                            <button
                                onClick={() => setIsPasswordSectionOpen(!isPasswordSectionOpen)}
                                className="group flex min-h-[44px] w-full items-center justify-between text-left"
                            >
                                <h2 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
                                    <span className="material-symbols-rounded text-xl text-[var(--accent)]">lock</span>
                                    Change Password
                                </h2>
                                <motion.svg
                                    animate={{ rotate: isPasswordSectionOpen ? 180 : 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="h-5 w-5 text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-primary)]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </motion.svg>
                            </button>
                            <AnimatePresence>
                                {isPasswordSectionOpen && (
                                    <motion.form
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.3 }}
                                        onSubmit={handlePasswordChange}
                                        className="mt-4 space-y-4 overflow-hidden"
                                    >
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                                                Current Password
                                            </label>
                                            <input
                                                type={showPasswords ? 'text' : 'password'}
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                placeholder="Enter current password"
                                                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-3 text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-all focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-dim)]"
                                            />
                                            <p className="mt-2 text-xs text-[var(--text-muted)]">
                                                Required to verify your identity
                                            </p>
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                                                New Password
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type={showPasswords ? 'text' : 'password'}
                                                    value={newPassword}
                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                    placeholder="Enter new password"
                                                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-3 pr-12 text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-all focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-dim)]"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPasswords(!showPasswords)}
                                                    aria-label={showPasswords ? 'Hide password' : 'Show password'}
                                                    className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                                                >
                                                    {showPasswords ? (
                                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                                        </svg>
                                                    ) : (
                                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                            {newPassword && (
                                                <div className="mt-2">
                                                    <div className="mb-1 flex items-center justify-between">
                                                        <span className="text-xs text-[var(--text-muted)]">Password Strength:</span>
                                                        <span className={`text-xs font-medium ${passwordStrength.label === 'Weak' ? 'text-[var(--danger)]' :
                                                            passwordStrength.label === 'Medium' ? 'text-[var(--warning)]' :
                                                                'text-[var(--success)]'
                                                            }`}>
                                                            {passwordStrength.label}
                                                        </span>
                                                    </div>
                                                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-surface)]">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${(passwordStrength.strength / 5) * 100}%` }}
                                                            className={`h-full ${passwordStrength.color} transition-all duration-300`}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                                                Confirm New Password
                                            </label>
                                            <input
                                                type={showPasswords ? 'text' : 'password'}
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                placeholder="Confirm new password"
                                                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-3 text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-all focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-dim)]"
                                            />
                                            {confirmPassword && newPassword !== confirmPassword && (
                                                <p className="mt-2 text-xs text-[var(--danger)]">Passwords do not match</p>
                                            )}
                                        </div>
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            type="submit"
                                            disabled={isUpdatingPassword}
                                            className="btn-primary w-full min-h-[44px] rounded-xl px-6 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {isUpdatingPassword ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                    </svg>
                                                    Updating...
                                                </span>
                                            ) : (
                                                'Update Password'
                                            )}
                                        </motion.button>
                                    </motion.form>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>

                    {/* Enrollment remains hidden until Firebase MFA is enabled for this project. */}
                    {mfaEnrollmentEnabled && <MFASection addToast={addToast} />}
                </div>
            </div>
        </div>
    );
}
