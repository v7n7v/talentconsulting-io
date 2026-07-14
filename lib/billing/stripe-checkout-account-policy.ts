export const STRIPE_CHECKOUT_MAX_ASSOCIATED_CUSTOMERS = 20;

export function uniqueStripeCheckoutAssociatedCustomerIds(input: {
  uidCustomerIds: string[];
  selectedCustomerId?: string | null;
  localCustomerId?: string | null;
}) {
  const ids = new Set(input.uidCustomerIds.filter(Boolean));
  if (input.selectedCustomerId) ids.add(input.selectedCustomerId);
  if (input.localCustomerId) ids.add(input.localCustomerId);
  return [...ids];
}
