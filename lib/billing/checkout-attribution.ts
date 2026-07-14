export const CHECKOUT_ATTRIBUTION_SOURCES = [
  'resume_upgrade_modal',
  'upgrade_page',
  'direct',
] as const;

export type CheckoutAttributionSource = typeof CHECKOUT_ATTRIBUTION_SOURCES[number];

export function normalizeCheckoutAttributionSource(value: unknown): CheckoutAttributionSource {
  return CHECKOUT_ATTRIBUTION_SOURCES.includes(value as CheckoutAttributionSource)
    ? value as CheckoutAttributionSource
    : 'direct';
}
