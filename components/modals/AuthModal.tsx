'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authHelpers } from '@/lib/firebase';
import { useStore } from '@/lib/store';
import { showToast } from '@/components/Toast';
import { TalentConsultingMark } from '@/components/BrandLogo';
import { analytics } from '@/lib/analytics';
import { clearPendingAuthRedirect, isSafeLocalPath, setPendingAuthRedirect } from '@/lib/auth-redirect';
import { normalizeAuthError } from '@/lib/auth-flow';
import { readStoredAttribution } from '@/lib/attribution';
import type { MultiFactorResolver, User } from 'firebase/auth';

interface AuthModalProps {
  mode: 'login' | 'signup';
  onClose: () => void;
  onSwitchMode: () => void;
  postAuthRedirect?: string | null;
  returnFocusSelector?: string;
  /**
   * A sign-in or sign-up really completed. Fired once, immediately before the
   * modal closes, on every success path — email, MFA and Google.
   *
   * This is what the dead `[data-sona-resume-upload-trigger="true"]` selector
   * was badly approximating. The upload flow's biggest single win is
   * AUTH_REQUIRED → sign in → `controller.retry()` on the same in-memory File,
   * with no second pick and no re-upload; a host on that path passes this and
   * leaves `postAuthRedirect` null, because a navigation would throw the File
   * away.
   */
  onAuthSuccess?: () => void;
}

/* ── Shared modal shell (defined outside component to preserve identity across renders) ── */
function ModalShell({ children, onClose, titleId, returnFocusSelector }: {
  children: React.ReactNode;
  onClose: () => void;
  titleId: string;
  returnFocusSelector?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>(focusableSelector);
    window.setTimeout(() => firstFocusable?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        .filter(element => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      const explicitReturnTarget = returnFocusSelector
        ? document.querySelector<HTMLElement>(returnFocusSelector)
        : null;
      const returnTarget = explicitReturnTarget
        || (previousFocus && previousFocus !== document.body ? previousFocus : null);
      returnTarget?.focus({ preventScroll: true });
    };
  }, [onClose, returnFocusSelector]);

  return (
    <AnimatePresence>
      <motion.div
        key="auth-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
        onClick={onClose}
      />
      <div key="auth-modal-dialog" className="pointer-events-none fixed inset-0 z-[101] flex items-end justify-center p-0 sm:items-center sm:p-4">
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onClick={e => e.stopPropagation()}
          className="pointer-events-auto max-h-[100dvh] w-full max-w-md overflow-y-auto rounded-t-2xl shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {children}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function trackSocialAttributionSignup() {
  const attribution = readStoredAttribution();
  if (attribution?.utmSource) analytics.socialSignup(attribution.utmSource);
}

function sendWelcomeEmail(user: User, email: string | null | undefined, name: string | null | undefined) {
  void user.getIdToken()
    .then((token) => fetch('/api/email/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email, name }),
    }))
    .catch(() => {});
}

function navigateAfterAuth(path: string | null | undefined) {
  if (typeof window === 'undefined') return;
  if (!isSafeLocalPath(path)) return;
  window.location.assign(path);
}

const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED !== 'false';

export default function AuthModal({
  mode,
  onClose,
  onSwitchMode,
  postAuthRedirect,
  returnFocusSelector: requestedReturnFocusSelector,
  onAuthSuccess,
}: AuthModalProps) {
  const { setUser } = useStore();
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const isSonaUploadIntent = postAuthRedirect?.startsWith('/suite/agent') || false;
  const hasPendingResume = postAuthRedirect?.includes('pendingResume=1') || false;
  const authCompletedRef = useRef(false);
  const authPresentationTrackedRef = useRef(false);
  const modalTitle = mode === 'login'
    ? hasPendingResume ? 'Resume ready. Sign in to continue' : isSonaUploadIntent ? 'Sign in to upload your resume' : 'Welcome back'
    : hasPendingResume ? 'Resume ready. Create your account' : isSonaUploadIntent ? 'Create account to upload your resume' : 'Create Account';
  const modalSubtitle = mode === 'login'
    ? hasPendingResume ? 'Taco will save this resume, then open your target brief.' : isSonaUploadIntent ? 'Taco will use your saved resume context to scout job picks.' : 'Sign in to your account'
    : hasPendingResume ? 'Taco will save this resume, then open your target brief.' : isSonaUploadIntent ? 'Taco saves your resume context before scouting review-ready job picks.' : 'Get started with TalentConsulting.io';
  /* The '[data-sona-resume-upload-trigger="true"]' fallback that used to live here only ever
     matched components/dashboard/UnifiedDashboard.tsx, which had no importers and is deleted.
     Focus return is now purely the caller's to specify: with no fallback, a caller that passes
     no selector gets ModalShell's own restore to whatever had focus when the modal opened. */
  const returnFocusSelector = requestedReturnFocusSelector;

  useEffect(() => {
    if (!hasPendingResume || authPresentationTrackedRef.current) return;
    authPresentationTrackedRef.current = true;
    analytics.assistantResumeAuthPresented(mode);
  }, [hasPendingResume, mode]);

  const handleDismiss = useCallback(() => {
    if (loading || oauthLoading) return;
    if (hasPendingResume && !authCompletedRef.current) {
      analytics.assistantResumeAuthAbandoned(mode);
    }
    onClose();
  }, [hasPendingResume, loading, mode, oauthLoading, onClose]);

  // The single choke point for every success path — email, MFA, Google — which
  // is why onAuthSuccess is fired here rather than at four call sites. It runs
  // before onClose so a host can restart an upload it is still holding in
  // memory while the modal is on its way out.
  const completeAndClose = useCallback(() => {
    authCompletedRef.current = true;
    onAuthSuccess?.();
    onClose();
  }, [onAuthSuccess, onClose]);

  // MFA Challenge State (TOTP — Google Authenticator)
  const [showMFAChallenge, setShowMFAChallenge] = useState(false);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [totpCode, setTotpCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        if (!formData.name || !formData.email || !formData.password) {
          setError('Please fill in all fields');
          setLoading(false);
          return;
        }
        if (formData.password.length < 10) {
          setError('Password must be at least 10 characters');
          setLoading(false);
          return;
        }
        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        const { data, error } = await authHelpers.signUp(
          formData.email,
          formData.password,
          formData.name
        );

        if (error) throw error;

        if (data?.user) {
          setUser(data.user);
          analytics.signUp('email');
          analytics.authLifecycle('email', 'success');
          trackSocialAttributionSignup();
          showToast('Account created! Welcome!', 'check_circle');
          sendWelcomeEmail(data.user, formData.email, formData.name);
          completeAndClose();
          navigateAfterAuth(postAuthRedirect);
        }
      } else {
        if (!formData.email || !formData.password) {
          setError('Please fill in all fields');
          setLoading(false);
          return;
        }

        const { data, error, mfaResolver: resolver } = await authHelpers.signIn(
          formData.email,
          formData.password
        );

        // MFA required — show authenticator code input
        if (resolver) {
          setMfaResolver(resolver);
          setShowMFAChallenge(true);
          setLoading(false);
          return;
        }

        if (error) throw error;

        if (data?.user) {
          setUser(data.user);
          analytics.login('email');
          analytics.authLifecycle('email', 'success');
          showToast('Login successful!', 'check_circle');
          completeAndClose();
          navigateAfterAuth(postAuthRedirect);
        }
      }
    } catch (err: unknown) {
      const normalized = normalizeAuthError(err);
      analytics.authLifecycle('email', 'error', normalized.code);
      setError(normalized.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMFAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.length < 6) {
      setError('Please enter the 6-digit code from your authenticator app');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (!mfaResolver) throw new Error('MFA session expired. Please try again.');

      const { data, error } = await authHelpers.resolveTOTPSignIn(
        mfaResolver,
        totpCode,
        0
      );

      if (error) throw error;

      if (data?.user) {
        setUser(data.user);
        analytics.login('mfa');
        analytics.authLifecycle('mfa', 'success');
        showToast('Login successful!', 'check_circle');
        completeAndClose();
        navigateAfterAuth(postAuthRedirect);
      }
    } catch (err: unknown) {
      const normalized = normalizeAuthError(err);
      analytics.authLifecycle('mfa', 'error', normalized.code);
      setError(normalized.code === 'auth/unknown' ? 'Invalid or expired code' : normalized.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setOauthLoading(true);
    setError('');

    try {
      setPendingAuthRedirect(postAuthRedirect);
      const result = await authHelpers.signInWithGoogle();

      if (result.status === 'redirecting') {
        analytics.authLifecycle('google', 'redirecting');
        return;
      }

      clearPendingAuthRedirect();
      if (result.status === 'cancelled') {
        analytics.authLifecycle('google', 'cancelled');
        return;
      }
      if (result.status === 'error') {
        analytics.authLifecycle('google', 'error', result.error.code);
        setError(result.error.message);
        return;
      }

      setUser(result.user);
      analytics.authLifecycle('google', 'success');
      if (result.isNewUser) {
        analytics.signUp('google');
        trackSocialAttributionSignup();
        sendWelcomeEmail(result.user, result.user.email, result.user.displayName);
        showToast('Account created with Google!', 'check_circle');
      } else {
        analytics.login('google');
        showToast('Signed in with Google!', 'check_circle');
      }
      completeAndClose();
      navigateAfterAuth(postAuthRedirect);
    } catch {
      clearPendingAuthRedirect();
      analytics.authLifecycle('google', 'error', 'auth/unknown');
      setError('Google sign-in could not finish. Please try again.');
    } finally {
      setOauthLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error } = await authHelpers.resetPasswordForEmail(formData.email);
      if (error) throw error;

      setResetEmailSent(true);
      showToast('Password reset email sent!', 'mail');
    } catch (err: unknown) {
      setError(normalizeAuthError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full rounded-xl px-4 py-3 text-base outline-none transition-all sm:text-sm";
  const inputStyle = {
    background: 'var(--bg-input, var(--bg-hover))',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
  };

  // ── MFA VERIFICATION ──
  if (showMFAChallenge) {
    return (
      <ModalShell onClose={handleDismiss} titleId="auth-mfa-title" returnFocusSelector={returnFocusSelector}>
        <div className="p-6">
          <div className="text-center mb-6">
            <div className="icon-shell-neutral w-12 h-12 rounded-xl border flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-rounded text-2xl">lock</span>
            </div>
            <h2 id="auth-mfa-title" className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Two-Factor Verification
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Enter the 6-digit code from your <strong style={{ color: 'var(--accent)' }}>authenticator app</strong>
            </p>
          </div>

          <form onSubmit={handleMFAVerify} className="space-y-4">
            <input
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={`${inputClass} text-center text-2xl tracking-[0.3em] font-mono`}
              style={inputStyle}
              placeholder="000000"
              maxLength={6}
              autoComplete="one-time-code"
              disabled={loading}
              autoFocus
            />

            {error && (
              <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || totpCode.length < 6}
              className="w-full py-3 text-sm transition-all disabled:opacity-50 btn-primary"
            >
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>

            <button
              type="button"
              onClick={() => { setShowMFAChallenge(false); setTotpCode(''); setError(''); setMfaResolver(null); }}
              className="w-full text-sm font-medium transition-colors hover:underline"
              style={{ color: 'var(--text-secondary)' }}
            >
              ← Back to Login
            </button>
          </form>
        </div>
      </ModalShell>
    );
  }

  // ── PASSWORD RESET SENT ──
  if (resetEmailSent) {
    return (
      <ModalShell onClose={handleDismiss} titleId="auth-reset-sent-title" returnFocusSelector={returnFocusSelector}>
        <div className="p-6 text-center">
          <div className="icon-shell-neutral w-12 h-12 rounded-xl border flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-rounded text-2xl">mail</span>
          </div>
          <h2 id="auth-reset-sent-title" className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Check Your Email!</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            We've sent a password reset link to <strong style={{ color: 'var(--accent)' }}>{formData.email}</strong>
          </p>
          <button
            onClick={() => { setResetEmailSent(false); setShowForgotPassword(false); }}
            className="w-full py-2.5 rounded-xl text-sm font-medium"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          >
            Back to Login
          </button>
        </div>
      </ModalShell>
    );
  }

  // ── FORGOT PASSWORD ──
  if (showForgotPassword) {
    return (
      <ModalShell onClose={handleDismiss} titleId="auth-forgot-title" returnFocusSelector={returnFocusSelector}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="icon-shell-neutral w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-rounded text-lg">key</span>
            </div>
            <div>
              <h2 id="auth-forgot-title" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Reset Password</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Enter your email and we'll send you a reset link.</p>
            </div>
          </div>

          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={inputClass}
                style={inputStyle}
                placeholder="your@email.com"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm disabled:opacity-50 btn-primary"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <button
              type="button"
              onClick={() => setShowForgotPassword(false)}
              className="w-full text-sm font-medium transition-colors hover:underline"
              style={{ color: 'var(--text-secondary)' }}
            >
              ← Back to Login
            </button>
          </form>
        </div>
      </ModalShell>
    );
  }

  // ── MAIN LOGIN/SIGNUP ──
  return (
    <ModalShell onClose={handleDismiss} titleId="auth-main-title" returnFocusSelector={returnFocusSelector}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <TalentConsultingMark className="h-10 w-10 rounded-xl border border-[var(--border-subtle)]" />
          <div className="flex-1">
            <h2 id="auth-main-title" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {modalTitle}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {modalSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={loading || oauthLoading}
            aria-label="Close sign-in dialog"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-50"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span className="material-symbols-rounded text-lg">close</span>
          </button>
        </div>

        {googleAuthEnabled && (
          <>
            {/* OAuth */}
            <button
              onClick={handleGoogleAuth}
              disabled={oauthLoading}
              className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                background: 'var(--bg-input, var(--bg-hover))',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {oauthLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2" style={{ borderColor: 'var(--border-subtle)', borderTopColor: 'var(--text-primary)' }} />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              Continue with Google
            </button>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full" style={{ borderTop: '1px solid var(--border-subtle)' }} />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>or continue with email</span>
              </div>
            </div>
          </>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <fieldset disabled={loading || oauthLoading} className="contents">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Full Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={inputClass}
                style={inputStyle}
                placeholder="John Doe"
                autoComplete="name"
                disabled={loading}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={inputClass}
              style={inputStyle}
              placeholder="your@email.com"
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className={inputClass}
              style={inputStyle}
              placeholder={mode === 'signup' ? 'Min 10 characters' : 'Enter password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              disabled={loading}
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Confirm Password</label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className={inputClass}
                style={inputStyle}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                disabled={loading}
              />
            </div>
          )}

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-xs font-medium hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              Forgot password?
            </button>
          )}

          {error && (
            <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 text-sm disabled:opacity-50 transition-all btn-primary"
            >
              {loading ? 'Processing...' : mode === 'login' ? 'Login' : 'Create Account'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={loading || oauthLoading}
              className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              Cancel
            </button>
          </div>
          </fieldset>
        </form>

        <p className="text-center text-xs mt-5" style={{ color: 'var(--text-muted)' }}>
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button disabled={loading || oauthLoading} onClick={onSwitchMode} className="font-medium hover:underline disabled:opacity-50" style={{ color: 'var(--accent)' }}>
            {mode === 'login' ? 'Sign up' : 'Login'}
          </button>
        </p>
      </div>
    </ModalShell>
  );
}
