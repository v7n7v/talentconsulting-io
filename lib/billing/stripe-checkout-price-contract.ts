export type StripeCheckoutPlan = 'pro' | 'studio';
export type StripeCheckoutInterval = 'month' | 'year';

export interface StripeCheckoutPriceEvidence {
  id: string;
  active: boolean;
  type: string;
  interval: string | null;
  currency: string;
  unitAmount: number | null;
}

export function validateStripeCheckoutPriceContract(input: {
  plan: StripeCheckoutPlan;
  interval: StripeCheckoutInterval;
  selectedPriceId: string;
  pro: StripeCheckoutPriceEvidence;
  studio: StripeCheckoutPriceEvidence;
}) {
  const expected = input.plan === 'studio' ? input.studio : input.pro;
  if (input.pro.id === input.studio.id) {
    return { valid: false as const, reason: 'duplicate_tier_price' as const };
  }
  if (expected.id !== input.selectedPriceId) {
    return { valid: false as const, reason: 'selected_price_mismatch' as const };
  }
  for (const price of [input.pro, input.studio]) {
    if (price.type !== 'recurring' || price.interval !== input.interval || price.unitAmount == null || price.unitAmount <= 0) {
      return { valid: false as const, reason: 'invalid_price_evidence' as const };
    }
  }
  if (input.pro.currency.toLowerCase() !== input.studio.currency.toLowerCase()) {
    return { valid: false as const, reason: 'tier_currency_mismatch' as const };
  }
  if (input.studio.unitAmount! <= input.pro.unitAmount!) {
    return { valid: false as const, reason: 'tier_price_order_invalid' as const };
  }
  if (!expected.active) {
    return { valid: false as const, reason: 'selected_price_inactive' as const };
  }
  return { valid: true as const, reason: 'verified' as const };
}
