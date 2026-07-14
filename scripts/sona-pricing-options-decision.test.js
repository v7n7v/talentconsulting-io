const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');

async function loadDecision() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'sona-pricing-options-decision-'));
  const outfile = path.join(outdir, 'decision.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'sona', 'pricing-options-decision.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

function validInput(fingerprint = 'a'.repeat(64)) {
  return {
    evidenceFingerprint: fingerprint,
    selectedScenarioId: 'protect_workload',
    rationale: 'This option preserves the paid Sona outcome while pricing research continues.',
    confirmationText: `RECORD ${fingerprint.slice(0, 8).toUpperCase()}`,
    acknowledgedNoStripeMutation: true,
    acknowledgedNoPromotionMutation: true,
    acknowledgedNoEntitlementMutation: true,
  };
}

function memo(fingerprint = 'a'.repeat(64)) {
  return {
    version: 'memo-v1',
    evidenceFingerprint: fingerprint,
    readyForHumanReview: true,
    scenarios: [{ id: 'protect_workload' }, { id: 'protect_price' }, { id: 'current_offer' }],
  };
}

test('decision input requires exact evidence, rationale, phrase, and all no-mutation attestations', async () => {
  const decision = await loadDecision();
  assert.deepEqual(decision.parseSonaPricingOptionsDecisionInput(validInput()), validInput());
  assert.equal(decision.parseSonaPricingOptionsDecisionInput({
    ...validInput(),
    acknowledgedNoStripeMutation: false,
  }), null);
  assert.equal(decision.parseSonaPricingOptionsDecisionInput({
    ...validInput(),
    confirmationText: 'RECORD WRONG',
  }), null);
  assert.equal(decision.parseSonaPricingOptionsDecisionInput({
    ...validInput(),
    rationale: 'Too short',
  }), null);
});

test('decision rejects stale or blocked evidence before producing a record', async () => {
  const decision = await loadDecision();
  const stale = decision.buildSonaPricingOptionsDecision(validInput(), memo('b'.repeat(64)), 'owner@example.com');
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'EVIDENCE_STALE');

  const blocked = decision.buildSonaPricingOptionsDecision(validInput(), {
    ...memo(),
    readyForHumanReview: false,
  }, 'owner@example.com');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'EVIDENCE_BLOCKED');
});

test('canonical decision is immutable, replay-safe, and authorizes no product mutation', async () => {
  const decision = await loadDecision();
  const input = validInput();
  const built = decision.buildSonaPricingOptionsDecision(
    input,
    memo(),
    'owner@example.com',
    '2026-07-11T23:55:00.000Z',
  );
  assert.equal(built.ok, true);
  assert.equal(built.record.selectedScenarioId, 'protect_workload');
  assert.deepEqual(built.record.selectedScenarioSnapshot, memo().scenarios[0]);
  assert.equal(built.record.noStripeMutation, true);
  assert.equal(built.record.priceChangeAuthorized, false);
  assert.equal(built.record.promotionChangeAuthorized, false);
  assert.equal(built.record.entitlementChangeAuthorized, false);

  const replay = decision.compareSonaPricingOptionsDecisionReplay(built.record, input, 'owner@example.com');
  assert.equal(replay.ok, true);
  assert.equal(replay.alreadyRecorded, true);
  const conflict = decision.compareSonaPricingOptionsDecisionReplay(
    built.record,
    { ...input, selectedScenarioId: 'protect_price' },
    'owner@example.com',
  );
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'DECISION_CONFLICT');
});

test('admin route recomputes fresh evidence before its one immutable write', () => {
  const route = fs.readFileSync(
    path.join(repoRoot, 'app', 'api', 'admin', 'billing', 'pricing-options-decision', 'route.ts'),
    'utf8',
  );
  const helper = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'pricing-options-decision.ts'), 'utf8');
  const page = fs.readFileSync(path.join(repoRoot, 'app', 'suite', 'admin', 'page.tsx'), 'utf8');
  const pricesAt = route.indexOf('await getBillingPrices({ force: true, skipCommercialReadiness: true })');
  const economicsAt = route.indexOf('await buildAdminPlanEconomics(prices)');
  const decisionAt = route.indexOf('buildSonaPricingOptionsDecision(input, economics.pricingOptionsMemo');
  const writeAt = route.indexOf('transaction.create(ref, decision.record)');
  assert.ok(pricesAt > 0 && pricesAt < economicsAt && economicsAt < decisionAt && decisionAt < writeAt);
  assert.match(route, /Cache-Control': 'private, no-store, max-age=0'/);
  assert.match(helper, /priceChangeAuthorized:\s*false/);
  assert.match(helper, /promotionChangeAuthorized:\s*false/);
  assert.match(helper, /entitlementChangeAuthorized:\s*false/);
  assert.doesNotMatch(route, /stripe\.(prices|promotionCodes|subscriptions)\.(create|update|del)/);
  assert.match(page, /Record scenario review/);
  assert.match(page, /Decision for this evidence snapshot/);
  assert.match(page, /Record review only/);
  assert.match(page, /min-h-11/);
  assert.match(page, /text-base font-normal/);
  assert.match(page, /acknowledgedNoStripeMutation/);
  assert.match(page, /acknowledgedNoPromotionMutation/);
  assert.match(page, /acknowledgedNoEntitlementMutation/);
  assert.doesNotMatch(page, /Apply selected pricing|Change Stripe price/);
});
