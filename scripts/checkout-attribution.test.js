const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function loadAttributionContract() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-checkout-attribution-'));
  const outfile = path.join(outdir, 'checkout-attribution.cjs');
  buildSync({
    entryPoints: [path.join(repoRoot, 'lib', 'billing', 'checkout-attribution.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

test('checkout attribution accepts only the bounded product surfaces', () => {
  const { normalizeCheckoutAttributionSource } = loadAttributionContract();
  assert.equal(normalizeCheckoutAttributionSource('resume_upgrade_modal'), 'resume_upgrade_modal');
  assert.equal(normalizeCheckoutAttributionSource('upgrade_page'), 'upgrade_page');
  assert.equal(normalizeCheckoutAttributionSource('direct'), 'direct');
  assert.equal(normalizeCheckoutAttributionSource('user@example.com'), 'direct');
  assert.equal(normalizeCheckoutAttributionSource('utm_campaign=private-resume-text'), 'direct');
  assert.equal(normalizeCheckoutAttributionSource(null), 'direct');
});

test('approved source crosses UI, Stripe metadata and the webhook economics boundary', () => {
  const modal = read('components/UpgradeModal.tsx');
  const upgradePage = read('app/suite/upgrade/page.tsx');
  const subscribe = read('app/api/stripe/subscribe/route.ts');
  const hostedCheckout = read('app/api/stripe/checkout/route.ts');
  const webhook = read('app/api/stripe/webhook/route.ts');
  const economics = read('lib/sona/economics.ts');

  assert.match(modal, /source: UPGRADE_SOURCE/);
  assert.match(upgradePage, /source: 'upgrade_page'/);
  assert.match(subscribe, /checkoutSource: source/);
  assert.match(hostedCheckout, /checkoutSource: source/);
  assert.match(webhook, /normalizeCheckoutAttributionSource\(session\.metadata\?\.checkoutSource\)/);
  assert.match(webhook, /checkoutSource,/);
  assert.match(economics, /firstCheckoutSource: replacesFirstCheckout/);
  assert.match(economics, /latestCheckoutSource: replacesLatestCheckout/);
  assert.match(economics, /normalizeCheckoutAttributionSource\(summary\.firstCheckoutSource\)/);
});

test('checkout source is structured metadata and never accepts user content fields', () => {
  const schema = read('lib/schemas.ts');
  const contract = read('lib/billing/checkout-attribution.ts');
  assert.match(schema, /source: z\.enum\(CHECKOUT_ATTRIBUTION_SOURCES\)\.optional\(\)\.default\('direct'\)/);
  assert.doesNotMatch(contract, /email|resumeText|jobDescription|userRequest/);
});
