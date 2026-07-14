export type StripeRuntimeMode = 'test' | 'live' | 'missing' | 'unknown';

const compiledStripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

type StripeRuntimeEnvironment = {
  NODE_ENV?: string;
  STAGING_HOSTNAME?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_BUILD_PUBLISHABLE_KEY?: string;
  STRIPE_PRO_PRICE_ID?: string;
  STRIPE_PRO_ANNUAL_PRICE_ID?: string;
  STRIPE_STUDIO_PRICE_ID?: string;
  STRIPE_STUDIO_ANNUAL_PRICE_ID?: string;
};

function usable(value: string | undefined, prefix: string, minimumLength = prefix.length + 8) {
  const normalized = value?.trim() || '';
  return normalized.length >= minimumLength
    && normalized.startsWith(prefix)
    && !/(?:your[_-]?|replace[_-]?|change[_-]?me|placeholder|example|todo|\$\{)/i.test(normalized);
}

function keyMode(value: string | undefined, kind: 'secret' | 'publishable'): StripeRuntimeMode {
  const normalized = value?.trim() || '';
  if (!normalized) return 'missing';
  if (normalized.length < 20) return 'unknown';
  if (/(?:your[_-]?|replace[_-]?|change[_-]?me|placeholder|example|todo|\$\{)/i.test(normalized)) {
    return 'unknown';
  }
  if (kind === 'secret' && normalized.startsWith('sk_test_')) return 'test';
  if (kind === 'secret' && normalized.startsWith('sk_live_')) return 'live';
  if (kind === 'publishable' && normalized.startsWith('pk_test_')) return 'test';
  if (kind === 'publishable' && normalized.startsWith('pk_live_')) return 'live';
  return 'unknown';
}

export function getStripeRuntimeReadiness(
  env: StripeRuntimeEnvironment = process.env as StripeRuntimeEnvironment,
) {
  const environment = env.STAGING_HOSTNAME
    ? 'staging' as const
    : env.NODE_ENV === 'production'
      ? 'production' as const
      : 'development' as const;
  const secretKeyMode = keyMode(env.STRIPE_SECRET_KEY, 'secret');
  const publishableKeyMode = keyMode(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, 'publishable');
  const buildPublishableKey = env.STRIPE_BUILD_PUBLISHABLE_KEY || compiledStripePublishableKey;
  const buildPublishableKeyMode = keyMode(buildPublishableKey, 'publishable');
  const browserBuildAligned = publishableKeyMode !== 'missing'
    && publishableKeyMode !== 'unknown'
    && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() === buildPublishableKey?.trim();
  const webhookConfigured = usable(env.STRIPE_WEBHOOK_SECRET, 'whsec_');
  const prices = {
    proMonth: usable(env.STRIPE_PRO_PRICE_ID, 'price_'),
    proYear: usable(env.STRIPE_PRO_ANNUAL_PRICE_ID, 'price_'),
    maxMonth: usable(env.STRIPE_STUDIO_PRICE_ID, 'price_'),
    maxYear: usable(env.STRIPE_STUDIO_ANNUAL_PRICE_ID, 'price_'),
  };
  const priceCount = Object.values(prices).filter(Boolean).length;
  const configuredPriceIds = [
    env.STRIPE_PRO_PRICE_ID,
    env.STRIPE_PRO_ANNUAL_PRICE_ID,
    env.STRIPE_STUDIO_PRICE_ID,
    env.STRIPE_STUDIO_ANNUAL_PRICE_ID,
  ].map(value => value?.trim()).filter((value): value is string => !!value);
  const priceIdsUnique = new Set(configuredPriceIds).size === configuredPriceIds.length;
  const requiredMode = environment === 'staging'
    ? 'test' as const
    : environment === 'production'
      ? 'live' as const
      : null;
  const keysAligned = secretKeyMode === publishableKeyMode
    && (secretKeyMode === 'test' || secretKeyMode === 'live');
  const modeSafe = keysAligned && (!requiredMode || secretKeyMode === requiredMode);
  const configurationReady = modeSafe
    && browserBuildAligned
    && webhookConfigured
    && priceCount === 4
    && priceIdsUnique;
  const allMissing = secretKeyMode === 'missing'
    && publishableKeyMode === 'missing'
    && buildPublishableKeyMode === 'missing'
    && !webhookConfigured
    && priceCount === 0;
  const missing: string[] = [];
  if (secretKeyMode === 'missing') missing.push('secret_key');
  if (publishableKeyMode === 'missing') missing.push('publishable_key');
  if (buildPublishableKeyMode === 'missing') missing.push('browser_build_key');
  if (!browserBuildAligned && publishableKeyMode !== 'missing') missing.push('browser_build_alignment');
  if (!webhookConfigured) missing.push('webhook_secret');
  for (const [key, configured] of Object.entries(prices)) {
    if (!configured) missing.push(key);
  }
  if (!keysAligned && !allMissing) missing.push('key_mode_alignment');
  if (keysAligned && requiredMode && secretKeyMode !== requiredMode) missing.push(`${requiredMode}_mode_required`);
  if (!priceIdsUnique) missing.push('price_ids_unique');

  return {
    status: configurationReady ? 'configured' as const : allMissing ? 'not_configured' as const : 'blocked' as const,
    environment,
    requiredMode,
    configurationReady,
    secretKeyMode,
    publishableKeyMode,
    buildPublishableKeyMode,
    browserBuildAligned,
    webhookConfigured,
    pricesConfigured: priceCount,
    pricesRequired: 4,
    missing: [...new Set(missing)],
    message: configurationReady
      ? `Local ${requiredMode || secretKeyMode} Stripe configuration is complete for ${environment}. Provider ownership is verified during checkout.`
      : allMissing
        ? `Stripe checkout is not configured for ${environment}.`
        : `Stripe checkout is blocked until keys, webhook and prices are complete and mode-aligned for ${environment}.`,
  };
}

export function getStripeWebhookReadiness(
  env: StripeRuntimeEnvironment = process.env as StripeRuntimeEnvironment,
) {
  const environment = env.STAGING_HOSTNAME
    ? 'staging' as const
    : env.NODE_ENV === 'production'
      ? 'production' as const
      : 'development' as const;
  const requiredMode = environment === 'staging'
    ? 'test' as const
    : environment === 'production'
      ? 'live' as const
      : null;
  const secretKeyMode = keyMode(env.STRIPE_SECRET_KEY, 'secret');
  const webhookConfigured = usable(env.STRIPE_WEBHOOK_SECRET, 'whsec_');
  const modeSafe = (secretKeyMode === 'test' || secretKeyMode === 'live')
    && (!requiredMode || secretKeyMode === requiredMode);
  const configurationReady = modeSafe && webhookConfigured;
  const missing: string[] = [];
  if (secretKeyMode === 'missing') missing.push('secret_key');
  if (secretKeyMode === 'unknown') missing.push('secret_key_mode');
  if (!webhookConfigured) missing.push('webhook_secret');
  if (requiredMode && secretKeyMode !== requiredMode) missing.push(`${requiredMode}_mode_required`);

  return {
    status: configurationReady
      ? 'configured' as const
      : secretKeyMode === 'missing' && !webhookConfigured
        ? 'not_configured' as const
        : 'blocked' as const,
    environment,
    requiredMode,
    configurationReady,
    secretKeyMode,
    webhookConfigured,
    missing: [...new Set(missing)],
  };
}
