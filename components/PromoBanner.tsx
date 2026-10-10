'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { promoConfig, isPromoActive } from '@/lib/promo-config';

/**
 * Slim announcement banner that sits at the top of every page.
 * Dismissible — stores state in localStorage so it doesn't nag.
 * Controlled entirely by lib/promo-config.ts.
 */
export default function PromoBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isPromoActive()) return;

    // Check if user already dismissed this specific promo
    const dismissedCode = localStorage.getItem('tc_promo_dismissed');
    if (dismissedCode === promoConfig.code) return;

    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem('tc_promo_dismissed', promoConfig.code);
    setVisible(false);
  };

  return (
    <div
      className="relative z-10 w-full py-2.5 px-4 text-center text-sm font-medium"
      style={{
        background: 'var(--taco-coral-soft)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <span className="text-gray-200">
          {promoConfig.headline}
        </span>

        {/* Promo code pill */}
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider"
          style={{
            background: 'var(--taco-coral-soft)',
            border: '1px solid var(--taco-coral)',
            color: 'var(--accent)',
          }}
        >
          {promoConfig.automatic ? 'AUTO-APPLIED' : promoConfig.code}
        </span>

        {/* CTA */}
        <Link
          href={promoConfig.ctaUrl}
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-black transition-all hover:scale-105"
          style={{ background: promoConfig.accentColor, color: 'var(--taco-action-ink)' }}
        >
          {promoConfig.ctaText}
          <svg className="ml-1 w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      </div>

      {/* Dismiss button */}
      <button
        onClick={dismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
        aria-label="Dismiss promotion"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
