const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
const modal = fs.readFileSync(path.join(repoRoot, 'components', 'UpgradeModal.tsx'), 'utf8');
const banner = fs.readFileSync(path.join(repoRoot, 'components', 'UpgradeBanner.tsx'), 'utf8');
const gate = fs.readFileSync(path.join(repoRoot, 'components', 'ProGate.tsx'), 'utf8');
const planIdentity = fs.readFileSync(path.join(repoRoot, 'lib', 'plan-identity.ts'), 'utf8');
const productCopy = fs.readFileSync(path.join(repoRoot, 'lib', 'product-copy.ts'), 'utf8');

async function loadRequestSequencer() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-checkout-sequencer-'));
  const outfile = path.join(outdir, 'checkout-sequencer.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'billing', 'checkout-request-sequencer.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const requestSequencerModule = loadRequestSequencer();

test('in-workflow upgrade presents Standard and Max as outcome choices', () => {
  assert.match(modal, /type PlanOption = 'pro' \| 'studio'/);
  assert.match(modal, /\(\['pro', 'studio'\] as PlanOption\[\]\)\.map/);
  assert.match(modal, /aria-pressed=\{active\}/);
  assert.match(modal, /Standard gives you hands-on career tools\. Max adds proactive, review-first\s+(?:Taco|<TacoName\s*\/>)\s+preparation\./);
  assert.match(modal, /Tailor active applications/);
  assert.match(modal, /Let Taco scout/);
  assert.match(modal, /Nothing is submitted or sent without your approval\./);
});

test('checkout binds the selected Stripe plan and interval', () => {
  assert.match(modal, /prices\.plans\[selectedPlan\]\[interval\]/);
  assert.match(modal, /JSON\.stringify\(\{ plan, interval: selectedInterval, source: UPGRADE_SOURCE \}\)/);
  assert.match(modal, /createCheckoutSession\(selectedPlan, interval\)/);
  assert.match(modal, /return price\.active && price\.unitAmount != null && price\.sourceInterval === interval/);
  assert.match(modal, /foundingOffer\?\.display \|\| optionPrice\.display/);
  assert.match(modal, /selectedFoundingOffer\?\.display \|\| selectedPrice\.display/);
  assert.match(modal, /Founding price applied automatically/);
});

test('obsolete checkout requests cannot replace the current plan selection', async () => {
  const { createCheckoutRequestSequencer } = await requestSequencerModule;
  const requests = createCheckoutRequestSequencer();
  const proMonthly = requests.start();
  requests.invalidate();
  assert.equal(requests.isCurrent(proMonthly), false);
  const maxAnnual = requests.start();
  const newerSelection = requests.start();
  assert.equal(requests.isCurrent(maxAnnual), false);
  assert.equal(requests.isCurrent(newerSelection), true);
  assert.match(modal, /if \(!checkoutRequests\.isCurrent\(requestId\)\) return/);
});

test('upgrade packaging no longer leads with quotas or processing claims', () => {
  assert.doesNotMatch(modal, /Higher AI limits/i);
  assert.doesNotMatch(modal, /4K words\/mo/i);
  assert.doesNotMatch(modal, /3x faster AI processing/i);
});

test('shared upgrade gates describe outcomes instead of quota expansion', () => {
  const sharedSurfaces = [banner, gate, planIdentity, productCopy].join('\n');
  assert.doesNotMatch(sharedSurfaces, /higher limits|higher-limit|faster AI|larger caps/i);
  assert.match(productCopy, /primaryCta: 'View Standard \/ Max'/);
  assert.match(banner, /\{UPGRADE_COPY\.planChoice\}/);
  assert.match(productCopy, /planChoice: 'Standard connects your active search\. Max puts Taco to work scouting and preparing review-ready packets\.'/);
  assert.match(gate, /joins your resume, role, and application context in Talent Standard/);
  assert.match(planIdentity, /Tailor job-specific versions from your verified experience\./);
  assert.match(planIdentity, /Taco scouts, ranks, and prepares truth-locked application packets for your review\./);
  assert.match(planIdentity, /upgradeHref: '\/suite\/upgrade\?plan=pro'/);
  assert.match(planIdentity, /upgradeHref: '\/suite\/upgrade\?plan=studio'/);
});

test('checkout modal keeps keyboard focus inside a named dialog', () => {
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby="upgrade-modal-title"/);
  assert.match(modal, /aria-label="Close upgrade options"/);
  assert.match(modal, /if \(event\.key === 'Escape'\)/);
  assert.match(modal, /event\.key !== 'Tab'/);
  assert.match(modal, /textarea:not\(\[disabled\]\), iframe/);
  assert.match(modal, /!dialogRef\.current\.contains\(document\.activeElement\)/);
  assert.match(modal, /document\.addEventListener\('focusin', handleFocusIn\)/);
  assert.match(modal, /dialogRef\.current\.contains\(event\.target as Node\)/);
  assert.match(modal, /previouslyFocused\?\.focus\(\)/);
  assert.match(modal, /onCloseRef\.current = onClose/);
  assert.match(modal, /h-11 w-11/);
});
