import type Stripe from 'stripe';

export const STRIPE_CHECKOUT_PRICE_READ_TIMEOUT_MS = 5_000;
export const STRIPE_CHECKOUT_PRICE_READ_MAX_NETWORK_RETRIES = 0;

type StripeCheckoutPriceReader = {
  prices: {
    retrieve(
      id: string,
      options: Stripe.RequestOptions,
    ): Promise<Stripe.Price>;
  };
};

export async function retrieveStripeCheckoutTierPrices(
  stripe: StripeCheckoutPriceReader,
  proPriceId: string,
  studioPriceId: string,
) {
  const requestOptions: Stripe.RequestOptions = {
    timeout: STRIPE_CHECKOUT_PRICE_READ_TIMEOUT_MS,
    maxNetworkRetries: STRIPE_CHECKOUT_PRICE_READ_MAX_NETWORK_RETRIES,
  };
  const [proPrice, studioPrice] = await Promise.all([
    stripe.prices.retrieve(proPriceId, requestOptions),
    stripe.prices.retrieve(studioPriceId, requestOptions),
  ]);
  return { proPrice, studioPrice };
}
