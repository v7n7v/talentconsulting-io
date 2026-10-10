/**
 * Tier Theme Engine — Mode-Neutral Color System
 *
 * Provides mode-aware shared accent tokens for Free / Standard / Max tiers.
 * Tier identity comes from labels and features while the palette stays
 * consistent across light and dark modes.
 */

import { getPlanIdentity } from './plan-identity';

export interface TierTheme {
  /** Primary accent — avatar gradient start, badge bg, progress bar */
  accent: string;
  /** Secondary accent — avatar gradient end, orb color */
  accentAlt: string;
  /** Light-mode safe accent for text (darker shade, reads on white) */
  accentText: string;
  /** Dark-mode accent for text (brighter shade, reads on dark) */
  accentTextDark: string;
  /** Display label */
  label: 'FREE' | 'STANDARD' | 'MAX';
  /** Visual intensity multiplier — controls orb opacity, border glow, shadow spread */
  intensity: number;
  /** Whether to show shimmer animation on badge */
  shimmer: boolean;
}

export function getTierTheme(tier: string): TierTheme {
  const plan = getPlanIdentity(tier);
  return {
    accent: plan.accent,
    accentAlt: plan.accentAlt,
    accentText: plan.accentText,
    accentTextDark: plan.accentTextDark,
    label: plan.label,
    intensity: plan.id === 'studio' ? 2 : plan.id === 'pro' ? 1.5 : 1,
    shimmer: plan.shimmer,
  };
}
