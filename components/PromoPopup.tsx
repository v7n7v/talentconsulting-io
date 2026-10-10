'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

interface PromoData {
  active: boolean;
  headline: string;
  code: string;
  ctaText: string;
  automatic?: boolean;
}

/**
 * Promo popup that appears every 30s on the landing page.
 * - Fetches state from Firestore via /api/admin/promo
 * - Dismissible with X (won't reappear for this session)
 * - Shows once, then every 30s until dismissed
 */
export default function PromoPopup() {
  const [promo, setPromo] = useState<PromoData | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Fetch promo state on mount
  useEffect(() => {
    // Don't show if already dismissed this session
    if (sessionStorage.getItem('tc_promo_popup_dismissed')) {
      setDismissed(true);
      return;
    }

    fetch('/api/promo')
      .then(r => r.json())
      .then(data => {
        if (data.active) {
          setPromo(data);
          // First popup after 5 seconds
          setTimeout(() => setVisible(true), 5000);
        }
      })
      .catch(() => {});
  }, []);

  // Recurring popup every 30s after dismiss (close hides it, timer re-shows)
  useEffect(() => {
    if (!promo?.active || dismissed) return;
    if (visible) return; // Already showing

    const timer = setTimeout(() => {
      setVisible(true);
    }, 30000);

    return () => clearTimeout(timer);
  }, [promo, dismissed, visible]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    // Permanent dismiss for this browser session
    setDismissed(true);
    sessionStorage.setItem('tc_promo_popup_dismissed', 'true');
  }, []);

  const handleClose = useCallback(() => {
    // Temporary close — will reappear in 30s
    setVisible(false);
  }, []);

  if (!promo?.active || dismissed) return null;

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 backdrop-blur-sm z-[100]"
            style={{ background: 'color-mix(in srgb, var(--bg-deep) 70%, transparent)' }}
            onClick={handleClose}
          />

          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90vw] max-w-md"
          >
            <div
              className="elevation-raised relative rounded-3xl p-8 text-center overflow-hidden border border-[var(--border-subtle)] bg-[var(--card-bg)]"
            >
              {/* Glow effects */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-[var(--accent-dim)] rounded-full blur-3xl" />
              <div className="absolute bottom-0 right-0 w-48 h-48 bg-[var(--accent-dim)] rounded-full blur-3xl" />

              {/* Close X */}
              <button
                onClick={handleClose}
                className="absolute top-3 right-3 h-11 w-11 rounded-full bg-[var(--bg-hover)] hover:bg-[var(--bg-surface)] flex items-center justify-center transition-colors group"
                aria-label="Close"
              >
                <svg className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Don't show again */}
              <button
                onClick={handleDismiss}
                className="absolute top-3 left-3 inline-flex min-h-[44px] items-center px-2 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                Don&apos;t show again
              </button>

              {/* Content */}
              <div className="relative z-10">
                {/* Sparkle icon */}
                <div className="icon-shell-neutral w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto mb-5">
                  <span className="material-symbols-rounded icon-neutral text-3xl">local_offer</span>
                </div>

                <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                  {promo.headline}
                </h3>

                <p className="text-sm text-[var(--text-secondary)] mb-5">
                  Founding members keep the discounted rate while their subscription stays active. Available to eligible new subscribers through October 31.
                </p>

                {/* Code pill */}
                <div
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl mb-6 group border border-dashed border-[var(--accent)] bg-[var(--accent-dim)]"
                >
                  <span className="text-lg font-bold tracking-widest text-[var(--accent)]">
                    {promo.automatic ? 'AUTO-APPLIED' : promo.code}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {promo.automatic ? 'in secure checkout' : 'at checkout'}
                  </span>
                </div>

                {/* CTA */}
                <div className="flex flex-col gap-3">
                  <Link
                    href="/suite/upgrade"
                    onClick={handleClose}
                    className="btn-primary w-full py-3 rounded-xl font-semibold text-sm text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {promo.ctaText} →
                  </Link>

                  <p className="text-[11px] text-[var(--text-muted)]">
                    Eligible new subscribers get a 7-day trial · Cancel anytime
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
