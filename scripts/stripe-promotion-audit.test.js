const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-promotion-audit-'));
const outfile = path.join(outdir, 'stripe-promotion-audit.cjs');
const auditModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-promotion-audit.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
}).then(() => require(outfile));
const operator = require('./stripe-promotion-inventory');

function reader(pages) {
  const reads = [];
  return {
    reads,
    promotionCodes: {
      async list(input) {
        reads.push(input);
        return pages[reads.length - 1];
      },
    },
  };
}

const percentCode = (id, percent) => ({
  id,
  promotion: { coupon: { valid: true, percent_off: percent, amount_off: null } },
});

test('active percentage codes are fully paginated and verified against the ceiling', async () => {
  const { auditStripePromotionDiscountCeiling } = await auditModule;
  const stripe = reader([
    { data: [percentCode('promo_1', 20)], has_more: true },
    { data: [percentCode('promo_2', 50)], has_more: false },
  ]);
  const result = await auditStripePromotionDiscountCeiling(stripe, 50);
  assert.equal(result.verified, true);
  assert.equal(result.maxObservedPercent, 50);
  assert.equal(result.activeCodeCount, 2);
  assert.equal(stripe.reads[1].starting_after, 'promo_1');
  assert.deepEqual(stripe.reads[0].expand, ['data.promotion.coupon']);
});

test('larger, fixed-amount, and unexpanded coupons block verification', async () => {
  const { auditStripePromotionDiscountCeiling } = await auditModule;
  assert.equal((await auditStripePromotionDiscountCeiling(reader([
    { data: [percentCode('promo_big', 51)], has_more: false },
  ]), 50)).reason, 'ceiling_exceeded');
  assert.equal((await auditStripePromotionDiscountCeiling(reader([{
    data: [{ id: 'promo_fixed', promotion: { coupon: { valid: true, percent_off: null, amount_off: 500 } } }],
    has_more: false,
  }]), 50)).reason, 'fixed_amount_coupon');
  assert.equal((await auditStripePromotionDiscountCeiling(reader([{
    data: [{ id: 'promo_unexpanded', promotion: { coupon: 'coupon_id' } }],
    has_more: false,
  }]), 50)).reason, 'coupon_evidence_missing');
});

test('bounded audit times out and prevents follow-up page reads', async () => {
  const { auditStripePromotionDiscountCeilingWithTimeout } = await auditModule;
  let resolveFirstPage;
  let reads = 0;
  const stripe = {
    promotionCodes: {
      list() {
        reads += 1;
        return new Promise(resolve => {
          resolveFirstPage = resolve;
        });
      },
    },
  };

  const result = await auditStripePromotionDiscountCeilingWithTimeout(stripe, 50, 5);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'audit_timeout');
  assert.equal(reads, 1);

  resolveFirstPage({ data: [percentCode('promo_1', 20)], has_more: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1);
});

test('Admin Finance passes only provider-verified promotion ceilings into economics', () => {
  const route = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'admin', 'costs', 'route.ts'), 'utf8');
  const service = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'admin-plan-economics.ts'), 'utf8');
  assert.match(service, /auditStripePromotionDiscountCeilingWithTimeout/);
  assert.match(service, /ADMIN_PROMOTION_AUDIT_DEADLINE_MS = 6_000/);
  assert.match(service, /ADMIN_STRIPE_REQUEST_TIMEOUT_MS = 5_000/);
  assert.match(service, /maxNetworkRetries: 0/);
  assert.match(service, /if \(audit\.verified\) verifiedCeiling = reviewedCeiling/);
  assert.match(service, /promotionDiscountPercent:\s*verifiedCeiling/);
  assert.match(service, /reason: 'reviewed_ceiling_missing_or_invalid'/);
  assert.match(service, /reason: 'stripe_not_configured'/);
  assert.match(service, /reason: 'provider_unavailable'/);
  assert.match(service, /reason: audit\.reason/);
  assert.ok((route.match(/await buildAdminPlanEconomics\(billingPrices\)/g) || []).length >= 2);
});

test('deployment contract documents the server-owned promotion ceiling', () => {
  const exampleEnv = fs.readFileSync(path.join(repoRoot, '.env.example'), 'utf8');
  const deployScript = fs.readFileSync(path.join(repoRoot, 'deploy-cloudrun.sh'), 'utf8');

  assert.match(exampleEnv, /^STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT=50$/m);
  assert.match(deployScript, /--env-vars-file \.env\.cloudrun\.yaml/);
  assert.doesNotMatch(exampleEnv, /NEXT_PUBLIC_STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT/);
});

test('operator requires an explicit Stripe mode and a bounded ceiling', () => {
  assert.deepEqual(operator.validateOperatorInput({
    expectedMode: 'test',
    secretKey: 'sk_test_fixture',
    ceilingValue: '50',
  }), { errors: [], ceiling: 50, actualMode: 'test' });
  assert.deepEqual(operator.validateOperatorInput({
    expectedMode: 'test',
    secretKey: 'sk_live_fixture',
    ceilingValue: '101',
  }).errors, ['stripe:mode_mismatch', 'ceiling:invalid']);
  assert.deepEqual(operator.validateOperatorInput({
    expectedMode: 'test',
    secretKey: 'sk_test_fixture',
    ceilingValue: '',
  }).errors, ['ceiling:invalid']);
});

test('operator reports aggregate read-only evidence without promotion identifiers', async () => {
  const { auditStripePromotionDiscountCeiling } = await auditModule;
  const summary = await operator.runReadOnlyPromotionInventory({
    stripe: reader([{ data: [percentCode('secret_promo_id', 50)], has_more: false }]),
    audit: auditStripePromotionDiscountCeiling,
    expectedMode: 'live',
    ceiling: 50,
  });
  assert.deepEqual(summary, {
    stripeMode: 'live',
    reviewedCeilingPercent: 50,
    verified: true,
    reason: 'verified',
    pagesRead: 1,
    activeCodeCount: 1,
    maxPercentDiscount: 50,
    writesAttempted: 0,
  });
  assert.doesNotMatch(JSON.stringify(summary), /secret_promo_id/);
});

test('operator blocks missing credentials before provider calls and has no mutation path', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'stripe-promotion-inventory.js'), 'utf8');
  const result = spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts', 'stripe-promotion-inventory.js'),
    '--mode=live',
    '--ceiling=50',
  ], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH || '' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stripe:secret_key_missing/);
  assert.match(result.stderr, /Writes attempted: 0/);
  assert.doesNotMatch(source, /promotionCodes\.(create|update|delete)|coupons\.(create|update|delete)/);
});
