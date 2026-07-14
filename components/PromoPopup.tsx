'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

interface PromoData {
  active: boolean;
  headline: string;
  code: string;
  ctaText: string;
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

    fetch('/api/admin/promo')
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
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
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
              className="relative rounded-3xl p-8 text-center overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #0a1a14 0%, #0d2818 50%, #0a1a14 100%)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 80px rgba(16,185,129,0.1)',
              }}
            >
              {/* Glow effects */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-emerald-500/20 rounded-full blur-3xl" />
              <div className="absolute bottom-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl" />

              {/* Close X */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors group"
                aria-label="Close"
              >
                <svg className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Don't show again */}
              <button
                onClick={handleDismiss}
                className="absolute top-4 left-4 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                Don&apos;t show again
              </button>

              {/* Content */}
              <div className="relative z-10">
                {/* Sparkle icon */}
                <div className="icon-shell-neutral w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto mb-5">
                  <span className="material-symbols-rounded text-3xl">local_offer</span>
                </div>

                <h3 className="text-xl font-bold text-white mb-2">
                  {promo.headline}
                </h3>

                <p className="text-sm text-gray-400 mb-5">
                  Use code at checkout to save on your Pro subscription. Limited time offer.
                </p>

                {/* Code pill */}
                <div
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl mb-6 cursor-pointer group"
                  style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px dashed rgba(16, 185, 129, 0.3)',
                  }}
                  onClick={() => {
                    navigator.clipboard.writeText(promo.code);
                    const el = document.getElementById('promo-copied');
                    if (el) { el.textContent = 'Copied!'; setTimeout(() => { el.textContent = 'Click to copy'; }, 1500); }
                  }}
                >
                  <span className="text-lg font-bold tracking-widest text-emerald-400">
                    {promo.code}
                  </span>
                  <span id="promo-copied" className="text-[10px] text-emerald-500/60 group-hover:text-emerald-400 transition-colors">
                    Click to copy
                  </span>
                </div>

                {/* CTA */}
                <div className="flex flex-col gap-3">
                  <Link
                    href="/suite/upgrade"
                    onClick={handleClose}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold text-sm hover:shadow-lg hover:shadow-emerald-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {promo.ctaText} →
                  </Link>

                  <p className="text-[11px] text-gray-500">
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
