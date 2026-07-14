'use client';

/**
 * UpgradeBanner — Pro plan upgrade prompt
 * Shows current plan, upgrade button, and manage subscription link.
 * Navigates to full-page /suite/upgrade instead of opening a modal.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAuth } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { UPGRADE_COPY } from '@/lib/product-copy';
import { getPlanIdentity } from '@/lib/plan-identity';
import { PlanFeatureList, PlanStatusStrip } from '@/components/plan/PlanIdentity';

interface UpgradeBannerProps {
  currentTier?: 'free' | 'pro' | 'studio' | 'god';
  compact?: boolean;
}

export default function UpgradeBanner({ currentTier = 'free', compact = false }: UpgradeBannerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const currentPlan = getPlanIdentity(currentTier);
  const proPlan = getPlanIdentity('pro');

  const handleUpgrade = () => {
    router.push('/suite/upgrade');
  };

  const handleManage = async () => {
    setLoading(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken();
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError('Could not open billing. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  // Paid user — show status + manage link
  if (currentPlan.id !== 'free') {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3">
        <PlanStatusStrip
          tier={currentTier}
          title={`${currentPlan.displayName} active`}
          caption="Manage billing, invoices, and cancellation in Stripe."
          compact
        />
        <button
          onClick={handleManage}
          disabled={loading}
          className="mt-2 text-[11px] font-semibold text-[var(--theme-text-tertiary)] underline underline-offset-2 transition-colors hover:text-[var(--theme-text-secondary)]"
        >
          {loading ? 'Opening...' : 'Manage billing'}
        </button>
      </div>
    );
  }

  // Free user — show upgrade CTA
  if (compact) {
    return (
      <button
        onClick={handleUpgrade}
        className="w-full rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all hover:brightness-105"
        style={{ background: proPlan.accent, color: proPlan.buttonText }}
      >
        <span className="material-symbols-rounded align-middle mr-1">bolt</span> {UPGRADE_COPY.primaryCta}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-card)] p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="icon-shell-neutral flex h-8 w-8 items-center justify-center rounded-[11px] border">
          <span className="material-symbols-rounded text-[17px]">bolt</span>
        </span>
        <span className="text-xs font-semibold text-[var(--text-primary)]">Choose your career workflow</span>
      </div>

      <p className="mb-3 text-xs leading-5 text-[var(--text-secondary)]">
        {UPGRADE_COPY.planChoice}
      </p>

      <div className="mb-3">
        <PlanFeatureList tier="pro" compact limit={3} />
      </div>

      <button
        onClick={handleUpgrade}
        className="flex w-full items-center justify-center gap-1 rounded-lg px-4 py-2 text-xs font-semibold transition-all hover:brightness-105"
        style={{ background: proPlan.accent, color: proPlan.buttonText }}
      >
        {UPGRADE_COPY.primaryCta}
      </button>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-[10px] text-red-400 mt-2 text-center"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <p className="text-[10px] text-[var(--theme-text-tertiary)] text-center mt-2">
        Secure billing by Stripe. Cancel anytime.
      </p>
    </div>
  );
}
