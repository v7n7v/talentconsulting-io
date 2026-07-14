const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');

async function loadPlanEconomics() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'sona-plan-economics-'));
  const outfile = path.join(outdir, 'plan-economics.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'sona', 'plan-economics.ts')],
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

function price(interval, unitAmount, active = true) {
  return {
    unitAmount,
    currency: 'usd',
    interval,
    sourceInterval: interval,
    active,
    display: unitAmount == null ? 'Unavailable' : `$${unitAmount / 100}`,
    effectiveMonthlyDisplay: '',
    savingsLabel: '',
  };
}

function prices(overrides = {}) {
  return {
    updatedAt: '2026-07-10T00:00:00.000Z',
    plans: {
      pro: {
        month: price('month', 2_000),
        year: price('year', 19_200),
      },
      studio: {
        month: price('month', 5_000),
        year: price('year', 48_000),
      },
      ...overrides,
    },
  };
}

test('worst-case workload cost is derived from the server-owned Pro and Max policies', async () => {
  const { buildSonaPlanEconomicsGate } = await loadPlanEconomics();
  const gate = buildSonaPlanEconomicsGate(prices());
  const pro = gate.plans.find(item => item.plan === 'pro');
  const max = gate.plans.find(item => item.plan === 'studio');

  assert.equal(pro.maxRunCostUsd, 0.0048);
  assert.equal(pro.maxMonthlyWorkloadCostUsd, 1.488);
  assert.equal(pro.runsPerDayMax, 10);
  assert.equal(max.maxRunCostUsd, 0.0473);
  assert.equal(max.maxMonthlyWorkloadCostUsd, 4.3989);
  assert.equal(max.preparedPacketsPerDayMax, 15);
  assert.equal(gate.targetMarginPercent, 70);
  assert.equal(gate.trialDays, 7);
  assert.equal(pro.intervals.month.firstCycleWorkloadCostUsd, 1.824);
  assert.equal(pro.intervals.month.firstCycleMarginPercent, 90.9);
  assert.equal(max.intervals.month.firstCycleWorkloadCostUsd, 5.3922);
  assert.equal(max.intervals.month.firstCycleMarginPercent, 89.2);
  assert.match(gate.scope, /provider workload plus trial/i);
});

test('active Stripe prices above the target produce a scale-ready gate', async () => {
  const { buildSonaPlanEconomicsGate } = await loadPlanEconomics();
  const gate = buildSonaPlanEconomicsGate(prices());

  assert.equal(gate.status, 'pass');
  assert.equal(gate.readyToScale, true);
  assert.equal(gate.plans[0].intervals.month.workloadMarginPercent, 92.6);
  assert.equal(gate.plans[1].intervals.year.monthlyRevenueEquivalentUsd, 40);
});

test('missing or inactive Stripe prices block the gate instead of becoming zero revenue', async () => {
  const { buildSonaPlanEconomicsGate } = await loadPlanEconomics();
  const gate = buildSonaPlanEconomicsGate(prices({
    pro: {
      month: price('month', null, false),
      year: price('year', 19_200, false),
    },
    studio: {
      month: price('month', 5_000),
      year: price('year', 48_000),
    },
  }));
  const pro = gate.plans.find(item => item.plan === 'pro');

  assert.equal(gate.status, 'blocked');
  assert.equal(gate.readyToScale, false);
  assert.equal(pro.intervals.month.monthlyRevenueEquivalentUsd, null);
  assert.equal(pro.intervals.month.workloadMarginPercent, null);
  assert.match(pro.intervals.month.reason, /unavailable/i);
  assert.match(pro.intervals.year.reason, /inactive/i);
});

test('a valid but underpriced option is a watch state and identifies the interval', async () => {
  const { buildSonaPlanEconomicsGate } = await loadPlanEconomics();
  const gate = buildSonaPlanEconomicsGate(prices({
    pro: {
      month: price('month', 200),
      year: price('year', 2_400),
    },
    studio: {
      month: price('month', 500),
      year: price('year', 6_000),
    },
  }));
  const max = gate.plans.find(item => item.plan === 'studio');

  assert.equal(gate.status, 'watch');
  assert.equal(gate.readyToScale, false);
  assert.equal(max.intervals.month.status, 'watch');
  assert.ok(max.intervals.month.workloadMarginPercent < 70);
  assert.match(max.intervals.month.reason, /review price, promotion ceiling, or entitlement/i);
});

test('a non-USD price is blocked rather than compared with the USD cost basis', async () => {
  const { buildSonaPlanEconomicsGate } = await loadPlanEconomics();
  const euroMonth = { ...price('month', 5_000), currency: 'eur' };
  const gate = buildSonaPlanEconomicsGate(prices({
    pro: {
      month: price('month', 2_000),
      year: price('year', 19_200),
    },
    studio: {
      month: euroMonth,
      year: price('year', 48_000),
    },
  }));
  const maxMonth = gate.plans.find(item => item.plan === 'studio').intervals.month;

  assert.equal(maxMonth.status, 'blocked');
  assert.equal(maxMonth.priceAvailable, true);
  assert.equal(maxMonth.currency, 'eur');
  assert.equal(maxMonth.monthlyRevenueEquivalentUsd, null);
  assert.equal(maxMonth.workloadMarginPercent, null);
  assert.match(maxMonth.reason, /cost basis is USD/i);
});

test('a Stripe price bound to the wrong recurrence blocks the gate', async () => {
  const { buildSonaPlanEconomicsGate } = await loadPlanEconomics();
  const mismatchedAnnual = { ...price('year', 48_000), sourceInterval: 'month' };
  const gate = buildSonaPlanEconomicsGate(prices({
    pro: {
      month: price('month', 2_000),
      year: price('year', 19_200),
    },
    studio: {
      month: price('month', 5_000),
      year: mismatchedAnnual,
    },
  }));
  const maxYear = gate.plans.find(item => item.plan === 'studio').intervals.year;

  assert.equal(maxYear.status, 'blocked');
  assert.equal(maxYear.workloadMarginPercent, null);
  assert.equal(maxYear.monthlyRevenueEquivalentUsd, null);
  assert.match(maxYear.reason, /recurrence is month/i);
});

test('an inactive price never displays a positive margin', async () => {
  const { buildSonaPlanEconomicsGate } = await loadPlanEconomics();
  const gate = buildSonaPlanEconomicsGate(prices({
    pro: {
      month: price('month', 2_000, false),
      year: price('year', 19_200),
    },
    studio: {
      month: price('month', 5_000),
      year: price('year', 48_000),
    },
  }));
  const proMonth = gate.plans.find(item => item.plan === 'pro').intervals.month;

  assert.equal(proMonth.status, 'blocked');
  assert.equal(proMonth.workloadMarginPercent, null);
  assert.match(proMonth.reason, /inactive/i);
});

test('enabled promotion codes block scale readiness without a reviewed discount ceiling', async () => {
  const { buildSonaPlanEconomicsGate } = await loadPlanEconomics();
  const gate = buildSonaPlanEconomicsGate(prices(), {
    promotionCodesEnabled: true,
    promotionDiscountPercent: null,
  });
  assert.equal(gate.status, 'blocked');
  assert.equal(gate.readyToScale, false);
  assert.equal(gate.promotionDiscountPercent, null);
  assert.equal(gate.plans[0].intervals.month.firstCycleRevenueUsd, null);
  assert.match(gate.plans[0].intervals.month.reason, /maximum discount is not reviewed/i);
});

test('reviewed promotion stress uses discounted first-cycle cash plus trial workload', async () => {
  const { buildSonaPlanEconomicsGate } = await loadPlanEconomics();
  const gate = buildSonaPlanEconomicsGate(prices(), {
    promotionCodesEnabled: true,
    promotionDiscountPercent: 50,
  });
  const proMonth = gate.plans.find(item => item.plan === 'pro').intervals.month;
  const maxMonth = gate.plans.find(item => item.plan === 'studio').intervals.month;
  assert.equal(gate.status, 'pass');
  assert.equal(proMonth.firstCycleRevenueUsd, 10);
  assert.equal(proMonth.firstCycleMarginPercent, 81.8);
  assert.equal(maxMonth.firstCycleRevenueUsd, 25);
  assert.equal(maxMonth.firstCycleMarginPercent, 78.4);

  const aggressive = buildSonaPlanEconomicsGate(prices(), {
    promotionCodesEnabled: true,
    promotionDiscountPercent: 80,
  });
  assert.equal(aggressive.status, 'watch');
  assert.equal(aggressive.readyToScale, false);
});

test('zero-cash and out-of-range promotions block the scale gate', async () => {
  const { buildSonaPlanEconomicsGate } = await loadPlanEconomics();
  const freeFirstCycle = buildSonaPlanEconomicsGate(prices(), {
    promotionCodesEnabled: true,
    promotionDiscountPercent: 100,
  });
  assert.equal(freeFirstCycle.gateVersion, 'sona-plan-economics-v3-2026-07-11');
  assert.equal(freeFirstCycle.status, 'blocked');
  assert.equal(freeFirstCycle.readyToScale, false);
  assert.equal(freeFirstCycle.plans[0].intervals.month.firstCycleRevenueUsd, 0);
  assert.match(freeFirstCycle.plans[0].intervals.month.reason, /first-cycle cash to zero/i);

  for (const invalidDiscount of [-1, 101, Number.NaN]) {
    const invalid = buildSonaPlanEconomicsGate(prices(), {
      promotionCodesEnabled: true,
      promotionDiscountPercent: invalidDiscount,
    });
    assert.equal(invalid.status, 'blocked');
    assert.equal(invalid.readyToScale, false);
    assert.equal(invalid.plans[0].intervals.month.promotionDiscountPercent, null);
    assert.match(invalid.plans[0].intervals.month.reason, /supported 0% to 100% range/i);
  }
});

test('Admin Finance enables promotion stress and reads a bounded reviewed ceiling', () => {
  const route = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'admin', 'costs', 'route.ts'), 'utf8');
  const service = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'admin-plan-economics.ts'), 'utf8');
  assert.match(service, /STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT/);
  assert.match(service, /promotionCodesEnabled:\s*true/);
  assert.match(service, /promotionDiscountPercent:\s*verifiedCeiling/);
  assert.ok((route.match(/await buildAdminPlanEconomics\(billingPrices\)/g) || []).length >= 2);
});

test('Admin Finance explains acquisition margin instead of showing only steady-state margin', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'app', 'suite', 'admin', 'page.tsx'), 'utf8');
  assert.match(page, />Steady workload</);
  assert.match(page, />First cycle</);
  assert.match(page, /interval\.firstCycleRevenueUsd === 0/);
  assert.match(page, /interval\.firstCycleMarginPercent/);
  assert.match(page, /interval\.firstCycleWorkloadCostUsd/);
  assert.match(page, /promotion ceiling unverified/);
  assert.match(page, /Promotion audit:/);
  assert.match(page, /A fixed-amount promotion needs a separate economics review/);
  assert.match(page, /active promotion exceeds the reviewed discount ceiling/i);
  assert.match(page, /Stripe promotion audit is temporarily unavailable/);
  assert.match(page, /Stripe promotion review timed out/);
  assert.match(page, /sm:grid-cols-2/);
  assert.match(page, /failingInterval\?\.reason \|\| plan\.intervals\.month\.reason/);
  assert.doesNotMatch(page, /included runs daily remain above/);
});
