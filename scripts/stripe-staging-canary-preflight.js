const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Stripe = require('stripe');
const { build } = require('esbuild');
const { readSelectedStagingEnvFile } = require('./staging-env-file');

const repoRoot = path.resolve(__dirname, '..');
const PRICE_SLOTS = {
  pro: {
    month: 'STRIPE_PRO_PRICE_ID',
    year: 'STRIPE_PRO_ANNUAL_PRICE_ID',
  },
  studio: {
    month: 'STRIPE_STUDIO_PRICE_ID',
    year: 'STRIPE_STUDIO_ANNUAL_PRICE_ID',
  },
};
const CANARY_ENV_KEYS = [
  'NODE_ENV',
  'STAGING_HOSTNAME',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_BUILD_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT',
  ...Object.values(PRICE_SLOTS).flatMap(intervals => Object.values(intervals)),
];

function argument(name, fallback = '') {
  const direct = process.argv.find(value => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function aliasRootPlugin() {
  return {
    name: 'alias-root',
    setup(builder) {
      builder.onResolve({ filter: /^@\// }, args => {
        const target = path.join(repoRoot, args.path.slice(2));
        const resolved = [target, `${target}.ts`, `${target}.tsx`].find(candidate => fs.existsSync(candidate));
        return { path: resolved || target };
      });
    },
  };
}

async function loadCanaryContract() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-canary-'));
  const outfile = path.join(outdir, 'stripe-staging-canary.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib/billing/stripe-staging-canary.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [aliasRootPlugin()],
  });
  return require(outfile);
}

function toPriceEvidence(price) {
  return {
    id: price.id,
    active: price.active === true,
    type: price.type,
    interval: price.recurring?.interval || null,
    currency: price.currency || '',
    unitAmount: price.unit_amount ?? null,
  };
}

async function getJson(url, timeoutMs = 10_000) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function runReadOnlyCanary({ env, baseUrl, contract, stripe, readJson = getJson }) {
  const configuration = contract.assessStripeStagingCanaryConfiguration(env, baseUrl);
  if (!configuration.ready) return { configuration, assessment: null, readOperations: [] };

  const readOperations = [];
  let promotionPagesRead = 0;
  const promotionReader = {
    promotionCodes: {
      async list(input) {
        promotionPagesRead += 1;
        readOperations.push(`stripe.promotion_codes.list:page_${promotionPagesRead}`);
        return stripe.promotionCodes.list(input);
      },
    },
  };
  const promotionResult = await contract.auditStripePromotionDiscountCeiling(
    promotionReader,
    configuration.reviewedPromotionCeiling,
  );
  const promotionAudit = { ...promotionResult, pagesRead: promotionPagesRead };
  const entries = Object.entries(PRICE_SLOTS).flatMap(([plan, intervals]) =>
    Object.entries(intervals).map(([interval, key]) => ({ plan, interval, key })),
  );
  const retrieved = await Promise.all(entries.map(async entry => {
    readOperations.push(`stripe.price.retrieve:${entry.plan}:${entry.interval}`);
    return {
      ...entry,
      price: toPriceEvidence(await stripe.prices.retrieve(env[entry.key])),
    };
  }));
  const prices = { pro: {}, studio: {} };
  for (const item of retrieved) prices[item.plan][item.interval] = item.price;

  const pricingUrl = `${configuration.origin}/api/billing/prices`;
  const healthUrl = `${configuration.origin}/api/health`;
  readOperations.push('http.get:billing_prices', 'http.get:health');
  const [publicPricing, health] = await Promise.all([
    readJson(pricingUrl),
    readJson(healthUrl),
  ]);
  return {
    configuration,
    assessment: contract.buildStripeStagingCanaryAssessment({
      env,
      baseUrl,
      prices,
      promotionAudit,
      publicPricing,
      health,
    }),
    readOperations,
  };
}

async function main() {
  const selected = readSelectedStagingEnvFile(argument('--staging-env-file', ''));
  if (!selected.env) {
    console.error('Stripe staging canary preflight blocked before provider calls:');
    console.error(`- ${selected.error}`);
    console.error('Writes attempted: 0');
    process.exitCode = 1;
    return;
  }
  const fileEnv = selected.env;
  const env = Object.fromEntries(CANARY_ENV_KEYS.flatMap(key => (
    Object.prototype.hasOwnProperty.call(fileEnv, key) ? [[key, fileEnv[key]]] : []
  )));
  env.STRIPE_BUILD_PUBLISHABLE_KEY ||= env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const baseUrl = argument('--base-url', env.STAGING_HOSTNAME ? `https://${env.STAGING_HOSTNAME}` : '');
  const contract = await loadCanaryContract();
  const configuration = contract.assessStripeStagingCanaryConfiguration(env, baseUrl);
  if (!configuration.ready) {
    console.error('Stripe staging canary preflight blocked before provider calls:');
    for (const error of configuration.errors) console.error(`- ${error}`);
    console.error('Writes attempted: 0');
    process.exitCode = 1;
    return;
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' });
  const { assessment } = await runReadOnlyCanary({ env, baseUrl, contract, stripe });
  if (!assessment.ready) {
    console.error('Stripe staging canary preflight failed:');
    for (const error of assessment.errors) console.error(`- ${error}`);
    console.error('Writes attempted: 0');
    process.exitCode = 1;
    return;
  }

  console.log('Stripe staging canary preflight passed:');
  console.log('- environment: staging test mode');
  console.log('- Stripe promotion inventory: reviewed ceiling verified');
  console.log('- Stripe price objects: four verified recurring prices');
  console.log('- Pro/Max ladders: monthly and annual contracts valid');
  console.log('- deployed checkout: browser/runtime pricing aligned');
  console.log('- staging health: ok');
  console.log('- writes attempted: 0');
  console.log('Ready for one operator-reviewed Pro checkout and one operator-reviewed Max checkout.');
}

if (require.main === module) {
  main().catch(() => {
    console.error('Stripe staging canary preflight failed: provider_or_network_read_failed');
    console.error('Writes attempted: 0');
    process.exitCode = 1;
  });
}

module.exports = {
  CANARY_ENV_KEYS,
  PRICE_SLOTS,
  argument,
  getJson,
  runReadOnlyCanary,
  toPriceEvidence,
};
