const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
const modal = fs.readFileSync(path.join(repoRoot, 'components', 'UpgradeModal.tsx'), 'utf8');
const upgradePage = fs.readFileSync(path.join(repoRoot, 'app', 'suite', 'upgrade', 'page.tsx'), 'utf8');
const billingPrices = fs.readFileSync(path.join(repoRoot, 'lib', 'billing-prices.ts'), 'utf8');

async function loadAnalytics() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-upgrade-analytics-'));
  const outfile = path.join(outdir, 'analytics.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'analytics.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile).analytics;
}

const analyticsModule = loadAnalytics();

test('upgrade funnel emits bounded plan and interval events without user content', async () => {
  const events = [];
  global.window = {
    gtag(command, event, params) {
      events.push({ command, event, params });
    },
  };
  const analytics = await analyticsModule;
  analytics.upgradeViewed('resume_upgrade_modal', 'pro', 'month');
  analytics.upgradePlanSelected('resume_upgrade_modal', 'studio', 'month');
  analytics.upgradeIntervalSelected('resume_upgrade_modal', 'studio', 'year');
  analytics.beginCheckout('studio', 89.99, { source: 'resume_upgrade_modal', interval: 'year', currency: 'usd' });
  analytics.checkoutSessionFailed('resume_upgrade_modal', 'studio', 'year', 'server_rejected');

  assert.deepEqual(events.map(item => item.event), [
    'upgrade_viewed',
    'upgrade_plan_selected',
    'upgrade_interval_selected',
    'begin_checkout',
    'checkout_session_failed',
  ]);
  for (const item of events) {
    assert.equal(item.command, 'event');
    assert.equal(item.params.send_to, 'G-8HXZDQQ3YJ');
    assert.equal('email' in item.params, false);
    assert.equal('resume' in item.params, false);
    assert.equal('job' in item.params, false);
    assert.equal('error' in item.params, false);
  }
  const checkout = events.find(item => item.event === 'begin_checkout');
  assert.equal(checkout.params.tier, 'studio');
  assert.equal(checkout.params.interval, 'year');
  assert.equal(checkout.params.value, 89.99);
  assert.equal(checkout.params.currency, 'USD');
  delete global.window;
});

test('checkout analytics omit unknown price and currency instead of inventing USD', async () => {
  const events = [];
  global.window = { gtag(command, event, params) { events.push({ command, event, params }); } };
  const analytics = await analyticsModule;
  analytics.beginCheckout('pro', undefined, { source: 'resume_upgrade_modal', interval: 'month' });
  assert.equal(events[0].event, 'begin_checkout');
  assert.equal('value' in events[0].params, false);
  assert.equal('currency' in events[0].params, false);
  delete global.window;
});

test('modal applies analytics only to the current checkout request', () => {
  const currentCheck = modal.indexOf('if (!checkoutRequests.isCurrent(requestId)) return;');
  const beginCheckout = modal.indexOf('analytics.beginCheckout(');
  const failedAnalytics = modal.indexOf('analytics.checkoutSessionFailed(');
  const catchBlock = modal.indexOf('} catch (err: any)');
  const catchCurrentCheck = modal.indexOf('if (!checkoutRequests.isCurrent(requestId)) return;', catchBlock);

  assert.ok(currentCheck > 0 && currentCheck < beginCheckout);
  assert.ok(catchCurrentCheck > catchBlock && catchCurrentCheck < failedAnalytics);
  assert.match(modal, /let failureReason = 'network_or_unknown'/);
  assert.match(modal, /failureReason = 'server_rejected'/);
  assert.match(modal, /failureReason = 'missing_client_secret'/);
  assert.doesNotMatch(modal, /checkoutSessionFailed\([^\n]*err\.message/);
});

test('one modal opening records one view while plan and interval choices record separately', () => {
  assert.match(modal, /upgradeViewTrackedRef\.current = false/);
  assert.match(modal, /else if \(!upgradeViewTrackedRef\.current\)/);
  assert.match(modal, /analytics\.upgradePlanSelected\(UPGRADE_SOURCE, plan, interval\)/);
  assert.match(modal, /analytics\.upgradeIntervalSelected\(UPGRADE_SOURCE, selectedPlan, newInterval\)/);
});

test('a failed display-price lookup blocks only the affected billing interval', () => {
  assert.match(billingPrices, /return unavailableBillingPrice\(interval, 'retrieval_error'\)/);
  assert.match(modal, /selectedPrice\.sourceStatus === 'retrieval_error'/);
  assert.match(modal, /const priceLookupResolved = !pricesLoading && !priceLookupFailed/);
  assert.match(modal, /const selectedCheckoutAvailable = checkout\.options\[selectedPlan\]\[interval\]/);
  assert.match(modal, /const checkoutDisabled = !selectedCheckoutAvailable[\s\S]*\|\| \(priceLookupResolved && !selectedPriceAvailable\)/);
  assert.doesNotMatch(modal, /Stripe will show the authoritative price before you confirm\./);
  assert.match(modal, /measuredPriceAvailable \? checkoutPrice\.currency : undefined/);
  assert.match(upgradePage, /selectedPrice\.sourceStatus === 'retrieval_error'/);
  assert.match(upgradePage, /const checkoutAvailable = checkout\.options\[selectedPlan\]\[interval\][\s\S]*&& \(priceLookupFailed \|\| priceIsAvailable\(planCfg\)\)/);
  assert.match(upgradePage, /measuredPriceAvailable \? selectedPrice\.currency : undefined/);
});
