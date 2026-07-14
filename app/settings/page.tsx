'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { authHelpers } from '@/lib/firebase';

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

            // Generate QR code as data URL
            if (result.qrCodeUrl) {
                const QRCode = (await import('qrcode')).default;
                const dataUrl = await QRCode.toDataURL(result.qrCodeUrl, {
                    width: 200,
                    margin: 2,
                    color: { dark: '#ffffff', light: '#00000000' },
                });
                setQrDataUrl(dataUrl);
            }

            setStep('qr');
        } catch (err: any) {
            console.error('TOTP enroll error:', err);
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
            console.error('TOTP verify error:', err);
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
            console.error('MFA unenroll error:', err);
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
            className="rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-800/50 border border-white/10 overflow-hidden relative"
        >
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-amber-500/10 to-orange-500/10 blur-3xl" />
            <div className="relative p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                            <span className="material-symbols-rounded text-2xl text-white">enhanced_encryption</span>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Two-Factor Authentication</h2>
                            <p className="text-slate-400 text-sm">Protect your account with Google Authenticator</p>
                        </div>
                    </div>
                    {mfaStatus.enrolled ? (
                        <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium border border-green-500/30">
                            ✓ Enabled
                        </span>
                    ) : (
                        <span className="px-3 py-1 rounded-full bg-slate-500/20 text-slate-400 text-xs font-medium border border-slate-500/30">
                            Not Enrolled
                        </span>
                    )}
                </div>

                {mfaStatus.enrolled ? (
                    <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                                    <span className="material-symbols-rounded text-lg text-green-400">shield</span>
                                </div>
                                <div>
                                    <p className="text-white font-medium">Authenticator App</p>
                                    <p className="text-sm text-slate-400">
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
                            className="w-full px-6 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-medium hover:bg-red-500/20 transition-all disabled:opacity-50"
                        >
                            {loading && step === 'unenrolling' ? 'Removing...' : 'Remove 2FA'}
                        </motion.button>
                    </div>
                ) : step === 'qr' ? (
                    <div className="space-y-5">
                        {/* QR Code */}
                        <div className="flex flex-col items-center">
                            <p className="text-slate-400 text-sm mb-4 text-center">
                                Scan this QR code with <strong className="text-amber-400">Google Authenticator</strong> or any TOTP app
                            </p>
                            {qrDataUrl && (
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                    <img src={qrDataUrl} alt="QR Code for authenticator" className="w-48 h-48" />
                                </div>
                            )}
                        </div>

                        {/* Manual key */}
                        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                            <p className="text-xs text-slate-500 mb-1">Can't scan? Enter this key manually:</p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 text-sm text-amber-400 font-mono break-all select-all">{secretKey}</code>
                                <button
                                    onClick={copySecret}
                                    className="px-2 py-1 rounded-lg bg-white/5 text-slate-400 hover:text-white text-xs transition-colors shrink-0"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        {/* Verify */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Enter code from app
                            </label>
                            <input
                                type="text"
                                value={verifyCode}
                                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="w-full rounded-xl px-4 py-4 bg-white/5 border border-white/10 text-white text-center text-2xl tracking-[0.3em] font-mono focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all"
                                placeholder="000000"
                                maxLength={6}
                                disabled={loading}
                                autoFocus
                            />
                        </div>

                        {error && (
                            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30">
                                <p className="text-sm text-red-300">{error}</p>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleVerifyEnroll}
                                disabled={loading || verifyCode.length < 6}
                                className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium hover:shadow-lg hover:shadow-amber-500/30 transition-all disabled:opacity-50"
                            >
                                {loading ? 'Verifying...' : 'Verify & Enable'}
                            </motion.button>
                            <button
                                onClick={() => { setStep('idle'); setVerifyCode(''); setError(''); setTotpSecret(null); setQrDataUrl(''); }}
                                className="px-4 py-3 rounded-xl border border-white/10 text-slate-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-xs text-slate-500">
                            Use Google Authenticator, Authy, or any TOTP-compatible app to generate verification codes every time you sign in.
                        </p>
                        {error && (
                            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30">
                                <p className="text-sm text-red-300">{error}</p>
                            </div>
                        )}
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleStartEnroll}
                            disabled={loading}
                            className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium hover:shadow-lg hover:shadow-amber-500/30 transition-all disabled:opacity-50"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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

        if (strength <= 2) return { strength, label: 'Weak', color: 'bg-red-500' };
        if (strength <= 3) return { strength, label: 'Medium', color: 'bg-yellow-500' };
        return { strength, label: 'Strong', color: 'bg-green-500' };
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
                            className={`px-4 py-3 rounded-xl shadow-lg border backdrop-blur-xl ${toast.type === 'success'
                                ? 'bg-green-500/20 border-green-500/30 text-green-100'
                                : toast.type === 'error'
                                    ? 'bg-red-500/20 border-red-500/30 text-red-100'
                                    : 'bg-blue-500/20 border-blue-500/30 text-blue-100'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                {toast.type === 'success' && <span className="material-symbols-rounded text-base">check_circle</span>}
                                {toast.type === 'error' && <span className="material-symbols-rounded text-base">error</span>}
                                {toast.type === 'info' && <span className="material-symbols-rounded text-base">info</span>}
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
                            className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white transition-colors group"
                        >
                            <svg className="w-6 h-6 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </button>
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white">Account Settings</h1>
                            <p className="text-slate-400 text-sm">Manage your account preferences and security</p>
                        </div>
                    </div>
                </motion.div>

                <div className="space-y-6">
                    {/* Account Information */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl"
                    >
                        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 blur-3xl" />
                        <div className="relative p-6">
                            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                                <span className="material-symbols-rounded text-xl text-cyan-400">person</span>
                                Account Information
                            </h2>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                                    <div>
                                        <p className="text-sm text-slate-500">Full Name</p>
                                        <p className="text-white font-medium">{user?.displayName || 'Not specified'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                                    <div>
                                        <p className="text-sm text-slate-500">Email Address</p>
                                        <p className="text-white font-medium">{user?.email}</p>
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-lg font-bold">
                                        {user?.email?.[0].toUpperCase()}
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                    <p className="text-sm text-slate-500">Account Created</p>
                                    <p className="text-white font-medium">
                                        {user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                        }) : 'N/A'}
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
                        className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl"
                    >
                        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 blur-3xl" />
                        <div className="relative p-6">
                            <button
                                onClick={() => setIsEmailSectionOpen(!isEmailSectionOpen)}
                                className="w-full flex items-center justify-between text-left group"
                            >
                                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                    <span className="material-symbols-rounded text-xl text-cyan-400">mail</span>
                                    Change Email Address
                                </h2>
                                <motion.svg
                                    animate={{ rotate: isEmailSectionOpen ? 180 : 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors"
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
                                        className="space-y-4 mt-4 overflow-hidden"
                                    >
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                                New Email Address
                                            </label>
                                            <input
                                                type="email"
                                                value={newEmail}
                                                onChange={(e) => setNewEmail(e.target.value)}
                                                placeholder="Enter new email"
                                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                                            />
                                            <p className="mt-2 text-xs text-slate-500">
                                                We will send a verification link. Your current email stays active until you confirm the new one.
                                            </p>
                                        </div>
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            type="submit"
                                            disabled={isUpdatingEmail}
                                            className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isUpdatingEmail ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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
                        className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl"
                    >
                        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 blur-3xl" />
                        <div className="relative p-6">
                            <button
                                onClick={() => setIsPasswordSectionOpen(!isPasswordSectionOpen)}
                                className="w-full flex items-center justify-between text-left group"
                            >
                                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                    <span className="material-symbols-rounded text-xl text-emerald-400">lock</span>
                                    Change Password
                                </h2>
                                <motion.svg
                                    animate={{ rotate: isPasswordSectionOpen ? 180 : 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors"
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
                                        className="space-y-4 mt-4 overflow-hidden"
                                    >
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                                Current Password
                                            </label>
                                            <input
                                                type={showPasswords ? 'text' : 'password'}
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                placeholder="Enter current password"
                                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                            />
                                            <p className="mt-2 text-xs text-slate-500">
                                                Required to verify your identity
                                            </p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                                New Password
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type={showPasswords ? 'text' : 'password'}
                                                    value={newPassword}
                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                    placeholder="Enter new password"
                                                    className="w-full px-4 py-3 pr-12 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPasswords(!showPasswords)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                                                >
                                                    {showPasswords ? (
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                                        </svg>
                                                    ) : (
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                            {newPassword && (
                                                <div className="mt-2">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs text-slate-500">Password Strength:</span>
                                                        <span className={`text-xs font-medium ${passwordStrength.label === 'Weak' ? 'text-red-400' :
                                                            passwordStrength.label === 'Medium' ? 'text-yellow-400' :
                                                                'text-green-400'
                                                            }`}>
                                                            {passwordStrength.label}
                                                        </span>
                                                    </div>
                                                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
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
                                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                                Confirm New Password
                                            </label>
                                            <input
                                                type={showPasswords ? 'text' : 'password'}
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                placeholder="Confirm new password"
                                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                            />
                                            {confirmPassword && newPassword !== confirmPassword && (
                                                <p className="mt-2 text-xs text-red-400">Passwords do not match</p>
                                            )}
                                        </div>
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            type="submit"
                                            disabled={isUpdatingPassword}
                                            className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium hover:shadow-lg hover:shadow-emerald-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isUpdatingPassword ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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

                    {/* 2FA Section */}
                    <MFASection addToast={addToast} />
                </div>
            </div>
        </div>
    );
}
