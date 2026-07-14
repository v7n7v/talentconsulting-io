'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useUserTier } from '@/hooks/use-user-tier';
import { UPGRADE_COPY } from '@/lib/product-copy';

const featureDisplayNames: Record<string, { label: string; icon: string }> = {
  morphs: { label: 'Resume Morphs', icon: 'description' },
  jdGenerations: { label: 'JD Generation', icon: 'work' },
  gauntlets: { label: 'Gauntlet Runs', icon: 'school' },
  resumeChecks: { label: 'Resume Check', icon: 'auto_awesome' }
};

type UsageTone = 'healthy' | 'warning' | 'danger';

const usageToneClasses: Record<UsageTone, { text: string; bar: string; shadow: string }> = {
  healthy: {
    text: 'text-emerald-500',
    bar: 'bg-gradient-to-r from-emerald-400 to-green-500',
    shadow: 'shadow-[0_0_8px_rgba(34,197,94,0.28)]',
  },
  warning: {
    text: 'text-amber-500',
    bar: 'bg-gradient-to-r from-yellow-400 to-amber-500',
    shadow: 'shadow-[0_0_8px_rgba(245,158,11,0.30)]',
  },
  danger: {
    text: 'text-red-500',
    bar: 'bg-gradient-to-r from-rose-500 to-red-500',
    shadow: 'shadow-[0_0_8px_rgba(239,68,68,0.34)]',
  },
};

function getTotalUsageTone(totalUsed: number, totalCap: number): UsageTone {
  const remaining = Math.max(0, totalCap - totalUsed);
  const percentage = totalCap > 0 ? totalUsed / totalCap : 0;

  if (remaining <= 10) return 'danger';
  if (percentage >= 0.5) return 'warning';
  return 'healthy';
}

function getFeatureUsageTone(used: number, cap: number): UsageTone {
  const percentage = cap > 0 ? used / cap : 0;

  if (used >= cap) return 'danger';
  if (percentage >= 0.67) return 'warning';
  return 'healthy';
}

export default function UsageCounter({ compact, showUpgradeWhenExhausted = false }: { compact?: boolean; showUpgradeWhenExhausted?: boolean }) {
  const router = useRouter();
  const { isPro, usage, caps, loading } = useUserTier();

  // Hide the widget completely if the user is a Pro/God or if the data is loading
  if (isPro || loading || !caps) return null;

  const usageKeys = Object.keys(caps);
  const totalUsed = usageKeys.reduce((sum, key) => sum + (usage[key as keyof typeof usage] || 0), 0);
  const totalCap = usageKeys.reduce((sum, key) => sum + (caps[key] || 0), 0);
  const allExhausted = totalUsed >= totalCap;
  const totalTone = getTotalUsageTone(totalUsed, totalCap);
  const totalToneClass = usageToneClasses[totalTone];

  if (compact) {
    return (
      <div className="w-full px-3 py-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Free credits</span>
          <span
            className={`text-[10px] font-mono font-medium ${totalToneClass.text}`}
            title={`${Math.max(0, totalCap - totalUsed)} free runs remaining`}
          >
            {totalUsed}/{totalCap}
          </span>
        </div>
        <div className="h-1.5 w-full bg-[var(--bg-hover)] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${totalCap > 0 ? Math.min(100, (totalUsed / totalCap) * 100) : 0}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={`h-full rounded-full ${totalToneClass.bar} ${totalToneClass.shadow}`}
          />
        </div>
        {allExhausted && (
          <div className="mt-1.5 space-y-1.5">
            <p className="flex items-center gap-1 text-[10px] font-medium text-amber-500">
              <span className="material-symbols-rounded icon-status-warning text-[12px]">lock_clock</span>
              {UPGRADE_COPY.freeLimitTitle}
            </p>
            {showUpgradeWhenExhausted && (
              <button
                type="button"
                onClick={() => router.push('/suite/upgrade')}
                className="flex w-full items-center justify-center gap-1 rounded-[10px] bg-emerald-500 px-2 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/35"
              >
                <span className="material-symbols-rounded text-[14px]">bolt</span>
                {UPGRADE_COPY.primaryCta}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Free Credits</h4>
      </div>

      <div className="space-y-3">
        {Object.entries(featureDisplayNames).map(([key, { label, icon }]) => {
          const used = usage[key as keyof typeof usage] || 0;
          const cap = caps[key] || 1;
          const percentage = Math.min(100, Math.max(0, (used / cap) * 100));
          const featureToneClass = usageToneClasses[getFeatureUsageTone(used, cap)];
          
          return (
            <div key={key} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
                  <span className="material-symbols-rounded text-[14px] opacity-70">{icon}</span> {label}
                </span>
                <span className={`font-mono font-medium ${featureToneClass.text}`}>
                  {used}/{cap}
                </span>
              </div>
              <div className="h-1.5 w-full bg-[var(--bg-hover)] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className={`h-full rounded-full ${featureToneClass.bar} ${featureToneClass.shadow}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {allExhausted && (
        <button
          type="button"
          onClick={() => router.push('/suite/upgrade')}
          className="mt-1 flex w-full items-center justify-center gap-1 rounded-[10px] border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-500 transition hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
        >
          <span className="material-symbols-rounded text-[13px]">bolt</span>
          {UPGRADE_COPY.primaryCta}
        </button>
      )}
    </div>
  );
}
