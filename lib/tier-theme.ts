/**
 * Tier Theme Engine — Mode-Neutral Color System
 *
 * Provides curated accent palettes for Free / Pro / Studio tiers.
 * Uses dual accent text colors (light-safe & dark-safe) to guarantee
 * readability in both modes without any forceDark hacks.
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
  label: 'FREE' | 'PRO' | 'MAX';
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
