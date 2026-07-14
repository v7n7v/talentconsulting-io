const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Stripe = require('stripe');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');

function argument(name, fallback = '') {
  const direct = process.argv.find(value => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function stripeMode(secretKey) {
  if (secretKey.startsWith('sk_live_')) return 'live';
  if (secretKey.startsWith('sk_test_')) return 'test';
  return 'unknown';
}

function validateOperatorInput({ expectedMode, secretKey, ceilingValue }) {
  const errors = [];
  if (expectedMode !== 'live' && expectedMode !== 'test') errors.push('mode:live_or_test_required');
  if (!secretKey) errors.push('stripe:secret_key_missing');
  const actualMode = stripeMode(secretKey);
  if (secretKey && actualMode !== expectedMode) errors.push('stripe:mode_mismatch');
  const hasCeiling = typeof ceilingValue === 'string' && ceilingValue.trim().length > 0;
  const ceiling = hasCeiling ? Number(ceilingValue) : Number.NaN;
  if (!Number.isFinite(ceiling) || ceiling < 0 || ceiling > 100) errors.push('ceiling:invalid');
  return { errors, ceiling, actualMode };
}

async function loadPromotionAudit() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-promotions-'));
  const outfile = path.join(outdir, 'stripe-promotion-audit.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-promotion-audit.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile).auditStripePromotionDiscountCeiling;
}

async function runReadOnlyPromotionInventory({ stripe, audit, expectedMode, ceiling }) {
  let pagesRead = 0;
  const reader = {
    promotionCodes: {
      async list(input) {
        pagesRead += 1;
        return stripe.promotionCodes.list(input);
      },
    },
  };
  const result = await audit(reader, ceiling);
  return {
    stripeMode: expectedMode,
    reviewedCeilingPercent: ceiling,
    verified: result.verified,
    reason: result.reason,
    pagesRead,
    activeCodeCount: result.activeCodeCount,
    maxPercentDiscount: result.maxObservedPercent,
    writesAttempted: 0,
  };
}

async function main() {
  const expectedMode = argument('--mode');
  const ceilingValue = argument('--ceiling', process.env.STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT || '');
  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  const input = validateOperatorInput({ expectedMode, secretKey, ceilingValue });
  if (input.errors.length) {
    console.error('Stripe promotion inventory blocked before provider calls:');
    for (const error of input.errors) console.error(`- ${error}`);
    console.error('Writes attempted: 0');
    process.exitCode = 1;
    return;
  }

  const audit = await loadPromotionAudit();
  const stripe = new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });
  const summary = await runReadOnlyPromotionInventory({
    stripe,
    audit,
    expectedMode,
    ceiling: input.ceiling,
  });
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.verified) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(() => {
    console.error('Stripe promotion inventory failed: provider_or_network_read_failed');
    console.error('Writes attempted: 0');
    process.exitCode = 1;
  });
}

module.exports = {
  argument,
  runReadOnlyPromotionInventory,
  stripeMode,
  validateOperatorInput,
};
