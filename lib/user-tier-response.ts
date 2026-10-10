import type { PlanTier } from '@/lib/pricing-tiers';

/** A failed lookup is unknown access, never evidence that the account is Free. */
export async function readUserTierResponse(response: Response) {
  if (!response.ok) throw new Error('Your plan could not be checked. Please retry.');
  const data = await response.json();
  if (!['free', 'pro', 'studio', 'god'].includes(data?.tier)) {
    throw new Error('Your plan could not be checked. Please retry.');
  }
  return { ...data, tier: data.tier as PlanTier };
}
