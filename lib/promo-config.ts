/**
 * Promo Configuration
 * Edit this file to change, enable, or disable promotions.
 * No rebuild needed if using next.config env vars, but for now
 * this is the single source of truth for promo state.
 *
 * Set `active: false` to hide the banner instantly.
 */

export interface PromoConfig {
  /** Is the promo currently active? */
  active: boolean;
  /** Promo code users should enter at checkout */
  code: string;
  /** Whether checkout applies the eligible plan-specific code automatically */
  automatic: boolean;
  /** Short headline for the banner */
  headline: string;
  /** CTA button text */
  ctaText: string;
  /** Where the CTA links to */
  ctaUrl: string;
  /** Emerald accent color (keep brand-consistent) */
  accentColor: string;
  /** Optional: expiry date (ISO string). Banner auto-hides after this. */
  expiresAt?: string;
}

export const promoConfig: PromoConfig = {
  // ═══════════════════════════════════════
  // ✏️  EDIT BELOW TO CHANGE PROMO
  // ═══════════════════════════════════════
  active: true,
  code: 'FOUNDING-2026',
  automatic: true,
  headline: 'Founding pricing — Standard $7.99/mo · Max $14.99/mo',
  ctaText: 'See founding prices',
  ctaUrl: '/suite/upgrade',
  accentColor: 'var(--taco-coral)',
  expiresAt: '2026-11-01T03:59:59Z',
};

/** Check if promo is currently valid */
export function isPromoActive(): boolean {
  if (!promoConfig.active) return false;
  if (promoConfig.expiresAt) {
    return new Date() < new Date(promoConfig.expiresAt);
  }
  return true;
}
