const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');

async function loadPricingOptions() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'sona-pricing-options-'));
  const outfile = path.join(outdir, 'pricing-options.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'sona', 'pricing-options-memo.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'alias-root',
      setup(builder) {
        builder.onResolve({ filter: /^@\// }, args => {
          const target = path.join(repoRoot, args.path.slice(2));
          const resolved = [target, `${target}.ts`, `${target}.tsx`].find(candidate => fs.existsSync(candidate));
          return { path: resolved || target };
        });
      },
    }],
  });
  return require(outfile);
}

function price(interval, unitAmount, identity) {
  return {
    identityFingerprint: `sha256:${identity.repeat(24)}`,
    unitAmount,
    currency: 'usd',
    interval,
    sourceInterval: interval,
    active: true,
    display: `$${unitAmount / 100}`,
    effectiveMonthlyDisplay: '',
    savingsLabel: '',
    sourceStatus: 'verified',
  };
}

function currentCatalogue() {
  return {
    updatedAt: '2026-07-11T23:30:00.000Z',
    plans: {
      pro: {
        month: price('month', 499, 'a'),
        year: price('year', 4_999, 'b'),
      },
      studio: {
        month: price('month', 999, 'c'),
        year: price('year', 8_999, 'd'),
      },
    },
    checkout: {
      available: false,
      status: 'blocked',
      code: 'CHECKOUT_CONFIGURATION_BLOCKED',
      message: '',
      options: {
        pro: { month: false, year: false },
        studio: { month: false, year: false },
      },
    },
  };
}

test('memo compares current offer with explicit workload-led and price-led alternatives', async () => {
  const { buildSonaPricingOptionsMemo } = await loadPricingOptions();
  const memo = buildSonaPricingOptionsMemo(currentCatalogue(), {
    reviewedPromotionDiscountPercent: 50,
    promotionEvidence: { verified: true, activeCodeCount: 2, maxObservedPercent: 50 },
  });

  assert.equal(memo.status, 'ready_for_review');
  assert.equal(memo.readyForHumanReview, true);
  assert.equal(memo.currentOfferPasses, false);
  assert.match(memo.evidenceFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(memo.scenarios.map(item => [item.id, item.status]), [
    ['current_offer', 'watch'],
    ['protect_workload', 'pass'],
    ['protect_price', 'pass'],
  ]);

  const protectWorkload = memo.scenarios.find(item => item.id === 'protect_workload');
  assert.equal(protectWorkload.promotionDiscountPercent, 20);
  assert.equal(protectWorkload.plans[0].intervals.month.displayPrice, '$7.99/mo');
  assert.equal(protectWorkload.plans[1].intervals.month.displayPrice, '$22.99/mo');
  assert.ok(protectWorkload.plans.every(plan =>
    plan.intervals.month.firstCycleMarginPercent >= 70
    && plan.intervals.year.firstCycleMarginPercent >= 70));

  const protectPrice = memo.scenarios.find(item => item.id === 'protect_price');
  assert.equal(protectPrice.promotionDiscountPercent, 0);
  assert.equal(protectPrice.plans.find(plan => plan.plan === 'pro').runsPerDayMax, 8);
  assert.equal(protectPrice.plans.find(plan => plan.plan === 'studio').runsPerDayMax, 1);
  assert.equal(protectPrice.plans.find(plan => plan.plan === 'studio').preparedPacketsPerDayMax, 5);
});

test('memo fingerprint changes when bound price or promotion evidence changes', async () => {
  const { buildSonaPricingOptionsMemo } = await loadPricingOptions();
  const base = buildSonaPricingOptionsMemo(currentCatalogue(), {
    reviewedPromotionDiscountPercent: 50,
    promotionEvidence: { verified: true, activeCodeCount: 2, maxObservedPercent: 50 },
  });
  const changedPrice = currentCatalogue();
  changedPrice.plans.pro.month.unitAmount = 599;
  const repriced = buildSonaPricingOptionsMemo(changedPrice, {
    reviewedPromotionDiscountPercent: 50,
    promotionEvidence: { verified: true, activeCodeCount: 2, maxObservedPercent: 50 },
  });
  const changedPromotion = buildSonaPricingOptionsMemo(currentCatalogue(), {
    reviewedPromotionDiscountPercent: 50,
    promotionEvidence: { verified: true, activeCodeCount: 3, maxObservedPercent: 50 },
  });

  assert.notEqual(repriced.evidenceFingerprint, base.evidenceFingerprint);
  assert.notEqual(changedPromotion.evidenceFingerprint, base.evidenceFingerprint);
});

test('memo blocks human review when price or promotion evidence is incomplete', async () => {
  const { buildSonaPricingOptionsMemo } = await loadPricingOptions();
  const prices = currentCatalogue();
  prices.plans.studio.year.sourceStatus = 'retrieval_error';
  const memo = buildSonaPricingOptionsMemo(prices, {
    reviewedPromotionDiscountPercent: 50,
    promotionEvidence: { verified: false, activeCodeCount: 0, maxObservedPercent: null },
  });

  assert.equal(memo.status, 'blocked');
  assert.equal(memo.readyForHumanReview, false);
  assert.equal(memo.requiresHumanApproval, true);
  assert.equal(memo.noAutomaticPricingChange, true);
  assert.equal(memo.noAutomaticPromotionChange, true);
  assert.equal(memo.noAutomaticEntitlementChange, true);
  assert.match(memo.reason, /Verify the complete recurring-price ladder/i);

  const nonUsd = currentCatalogue();
  nonUsd.plans.pro.month.currency = 'eur';
  assert.equal(buildSonaPricingOptionsMemo(nonUsd, {
    reviewedPromotionDiscountPercent: 50,
    promotionEvidence: { verified: true, activeCodeCount: 2, maxObservedPercent: 50 },
  }).readyForHumanReview, false);

  const inactive = currentCatalogue();
  inactive.plans.pro.year.active = false;
  assert.equal(buildSonaPricingOptionsMemo(inactive, {
    reviewedPromotionDiscountPercent: 50,
    promotionEvidence: { verified: true, activeCodeCount: 2, maxObservedPercent: 50 },
  }).readyForHumanReview, false);
});

test('Admin Finance exposes a mobile-safe read-only options memo with no mutation action', () => {
  const route = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'admin', 'costs', 'route.ts'), 'utf8');
  const page = fs.readFileSync(path.join(repoRoot, 'app', 'suite', 'admin', 'page.tsx'), 'utf8');
  const memo = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'pricing-options-memo.ts'), 'utf8');

  const service = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'admin-plan-economics.ts'), 'utf8');
  assert.match(route, /buildAdminPlanEconomics/);
  assert.match(service, /buildSonaPricingOptionsMemo/);
  assert.match(service, /verified:\s*promotionAudit\.status === 'verified'/);
  assert.match(page, /title="Pricing Options Memo"/);
  assert.match(page, /grid min-w-0 gap-4 p-5 md:p-6 lg:grid-cols/);
  assert.match(page, /No price, promotion, trial, or entitlement change is authorized here\./);
  assert.doesNotMatch(memo, /stripe\.(prices|promotionCodes|subscriptions)\.(create|update|del)/);
  assert.doesNotMatch(page, /Apply pricing scenario|Approve pricing change/);
});
