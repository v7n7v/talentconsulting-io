'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authHelpers } from '@/lib/firebase';
import { showToast } from '@/components/Toast';

// Separate component for the form logic that uses useSearchParams
function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            const { error } = await authHelpers.updatePassword(password);
            if (error) throw error;

            setSuccess(true);
            showToast('Password updated successfully!', '✅');

            setTimeout(() => {
                router.push('/');
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="glass-card p-12 text-center max-w-md">
                <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
                    <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Password Reset!</h2>
                <p className="text-slate-400">Your password has been updated. Redirecting...</p>
            </div>
        );
    }

    return (
        <div className="relative max-w-md w-full">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-cyan-500/20 rounded-3xl blur-3xl" />

            <div className="relative glass-card p-8">
                <div className="text-center mb-8">
                    <span className="text-6xl block mb-4">🔐</span>
                    <h1 className="text-2xl font-bold text-white mb-2">Reset Your Password</h1>
                    <p className="text-slate-400">Enter your new password below</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">New Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full rounded-xl px-4 py-3 bg-white/5 border border-white/10 text-white focus:outline-none focus:border-cyan-500/50"
                            placeholder="Min 6 characters"
                            disabled={loading}
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-slate-400 mb-2">Confirm Password</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full rounded-xl px-4 py-3 bg-white/5 border border-white/10 text-white focus:outline-none focus:border-cyan-500/50"
                            placeholder="Confirm your password"
                            disabled={loading}
                        />
                    </div>

                    {error && (
                        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                            <p className="text-sm text-red-300">{error}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-50"
                    >
                        {loading ? 'Updating...' : 'Update Password'}
                    </button>
                </form>
            </div>
        </div>
    );
}

import { Suspense } from 'react';

export default function ResetPasswordPage() {
    return (
        <div className="flex min-h-dvh items-center justify-center p-8">
            <Suspense fallback={
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400">Loading...</p>
                </div>
            }>
                <ResetPasswordForm />
            </Suspense>
        </div>
    );
}
