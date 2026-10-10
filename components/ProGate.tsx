'use client';

/**
 * ProGate — Explains the paid workflow for Pro tools.
 * Shows an upgrade wall with benefit highlights and a CTA to /suite/upgrade.
 * Usage: wrap paid workflow content with <ProGate feature="Skill Bridge">...</ProGate>
 */
import { useRouter } from 'next/navigation';
import { useUserTier } from '@/hooks/use-user-tier';
import { motion } from 'framer-motion';
import { UPGRADE_COPY } from '@/lib/product-copy';
import { getPlanIdentity } from '@/lib/plan-identity';
import { PlanBadge, PlanFeatureList } from '@/components/plan/PlanIdentity';

interface ProGateProps {
  feature: string;
  description?: string;
  children: React.ReactNode;
}

export default function ProGate({ feature, description, children }: ProGateProps) {
  const { isPro, loading } = useUserTier();
  const router = useRouter();
  const proPlan = getPlanIdentity('pro');

  // Still loading tier — render nothing to avoid flash
  if (loading) return null;

  // Pro/GOD — render children normally
  if (isPro) return <>{children}</>;

  // Free user — show upgrade wall
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full text-center"
      >
        {/* Lock icon */}
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
          style={{ color: proPlan.accentText, boxShadow: 'var(--elevation-card)' }}
        >
          <span className="material-symbols-rounded text-[32px]">lock</span>
        </div>

        {/* Headline */}
        <PlanBadge tier="pro" active size="md" className="mb-4" />

        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          Unlock {feature}
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-8 leading-relaxed">
          {description || `${feature} joins your resume, role, and application context in Talent Standard.`}
        </p>

        {/* Benefits */}
        <div className="mb-8 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 text-left">
          <PlanFeatureList tier="pro" />
        </div>

        {/* CTA */}
        <button
          onClick={() => router.push('/suite/upgrade')}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: proPlan.accent, color: proPlan.buttonText, boxShadow: 'var(--elevation-card)' }}
        >
          <span className="material-symbols-rounded text-[18px]">bolt</span>
          {UPGRADE_COPY.primaryCta}
        </button>

        <p className="text-[11px] text-[var(--text-muted)] mt-3">
          Cancel anytime · No hidden fees · Billed via Stripe
        </p>
      </motion.div>
    </div>
  );
}
