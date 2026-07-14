const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Stripe = require('stripe');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-envelope-'));

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

async function bundle(relative, name) {
  const outfile = path.join(outdir, `${name}.cjs`);
  await build({
    entryPoints: [path.join(repoRoot, relative)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [aliasRootPlugin()],
  });
  return require(outfile);
}

const envelopeModule = bundle('lib/billing/stripe-webhook-envelope.ts', 'envelope');
const contractModule = bundle('lib/sona/purchase-contract.ts', 'purchase-contract');
const checkoutEvidenceModule = bundle('lib/billing/stripe-checkout-webhook-evidence.ts', 'checkout-evidence');

const stripe = new Stripe('sk_test_envelope_regression_only', { apiVersion: '2026-02-25.clover' });
const webhookSecret = 'whsec_envelope_regression_only';

function eventPayload(overrides = {}) {
  return JSON.stringify({
    id: 'evt_envelope_test',
    object: 'event',
    api_version: '2026-02-25.clover',
    created: 1_789_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_envelope',
        object: 'checkout.session',
        client_reference_id: 'firebase-user-1',
        metadata: {},
      },
    },
    ...overrides,
  });
}

function signed(payload, secret = webhookSecret) {
  const timestamp = Math.floor(Date.now() / 1000);
  return stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
}

test('signed test-mode webhook envelope is accepted by a test key boundary', async () => {
  const { resolveExpectedStripeLiveMode, verifyStripeWebhookEnvelope } = await envelopeModule;
  const body = eventPayload();
  const result = verifyStripeWebhookEnvelope({
    stripe,
    body,
    signature: signed(body),
    webhookSecret,
    expectedLiveMode: resolveExpectedStripeLiveMode('sk_test_example'),
  });
  assert.equal(result.accepted, true);
  assert.equal(result.event.id, 'evt_envelope_test');
});

test('tampered payload and wrong webhook secret are rejected', async () => {
  const { verifyStripeWebhookEnvelope } = await envelopeModule;
  const body = eventPayload();
  const signature = signed(body);
  assert.throws(() => verifyStripeWebhookEnvelope({
    stripe,
    body: body.replace('firebase-user-1', 'attacker-user'),
    signature,
    webhookSecret,
    expectedLiveMode: false,
  }), /signature/i);
  assert.throws(() => verifyStripeWebhookEnvelope({
    stripe,
    body,
    signature,
    webhookSecret: 'whsec_wrong_secret',
    expectedLiveMode: false,
  }), /signature/i);
});

test('expired signed payload is rejected outside Stripe tolerance', async () => {
  const { verifyStripeWebhookEnvelope } = await envelopeModule;
  const body = eventPayload({ id: 'evt_expired_signature' });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: webhookSecret,
    timestamp: Math.floor(Date.now() / 1000) - 600,
  });
  assert.throws(() => verifyStripeWebhookEnvelope({
    stripe,
    body,
    signature,
    webhookSecret,
    expectedLiveMode: false,
  }), /timestamp|tolerance/i);
});

test('test and live webhook modes cannot cross environments', async () => {
  const { resolveExpectedStripeLiveMode, verifyStripeWebhookEnvelope } = await envelopeModule;
  const liveBody = eventPayload({ id: 'evt_live_in_test', livemode: true });
  const mismatch = verifyStripeWebhookEnvelope({
    stripe,
    body: liveBody,
    signature: signed(liveBody),
    webhookSecret,
    expectedLiveMode: resolveExpectedStripeLiveMode('sk_test_example'),
  });
  assert.equal(mismatch.accepted, false);
  assert.equal(mismatch.reason, 'mode_mismatch');
  assert.equal(resolveExpectedStripeLiveMode('sk_live_example'), true);
  assert.equal(resolveExpectedStripeLiveMode('  sk_test_example  '), false);
  assert.throws(() => resolveExpectedStripeLiveMode('rk_test_example'), /mode could not be resolved/i);
});

for (const fixture of [
  { plan: 'pro', interval: 'month', priceId: 'price_test_pro_month_20260711' },
  { plan: 'studio', interval: 'year', priceId: 'price_test_max_year_20260711' },
]) {
  test(`signed ${fixture.plan} checkout retains price authority and truth-locked Sona contract`, async () => {
    const { verifyStripeWebhookEnvelope } = await envelopeModule;
    const { buildSonaPurchaseContractMetadata } = await contractModule;
    const { resolveStripeCheckoutWebhookEvidence } = await checkoutEvidenceModule;
    const metadata = {
      plan: fixture.plan,
      interval: fixture.interval,
      ...buildSonaPurchaseContractMetadata(fixture.plan, fixture.interval),
    };
    const body = eventPayload({
      id: `evt_${fixture.plan}_signed`,
      data: {
        object: {
          id: `cs_test_${fixture.plan}`,
          object: 'checkout.session',
          client_reference_id: 'firebase-user-1',
          metadata,
        },
      },
    });
    const envelope = verifyStripeWebhookEnvelope({
      stripe,
      body,
      signature: signed(body),
      webhookSecret,
      expectedLiveMode: false,
    });
    assert.equal(envelope.accepted, true);

    const session = envelope.event.data.object;
    const evidence = resolveStripeCheckoutWebhookEvidence({
      sessionMetadata: session.metadata,
      subscription: {
        metadata,
        items: {
          data: [{
            price: {
              id: fixture.priceId,
              recurring: { interval: fixture.interval },
            },
          }],
        },
      },
      proPriceIds: ['price_test_pro_month_20260711', 'price_test_pro_year_20260711'],
      studioPriceIds: ['price_test_max_month_20260711', 'price_test_max_year_20260711'],
    });
    assert.equal(evidence.valid, true);
    assert.equal(evidence.plan, fixture.plan);
    assert.equal(evidence.planResolution.status, 'price_verified');
    assert.equal(evidence.purchaseContract.status, 'verified');
    assert.equal(evidence.purchaseContract.contract.reviewRequired, true);
    assert.equal(evidence.purchaseContract.contract.externalAutoApply, false);
  });
}

test('checkout evidence rejects missing, unknown and non-recurring subscription prices', async () => {
  const { resolveStripeCheckoutWebhookEvidence } = await checkoutEvidenceModule;
  const config = {
    sessionMetadata: { plan: 'pro' },
    proPriceIds: ['price_test_pro_month_20260711'],
    studioPriceIds: ['price_test_max_month_20260711'],
  };
  assert.equal(resolveStripeCheckoutWebhookEvidence({ ...config, subscription: null }).status, 'unknown_price');
  assert.equal(resolveStripeCheckoutWebhookEvidence({
    ...config,
    subscription: { metadata: {}, items: { data: [{ price: { id: 'price_unknown' } }] } },
  }).status, 'unknown_price');
  assert.equal(resolveStripeCheckoutWebhookEvidence({
    ...config,
    subscription: { metadata: {}, items: { data: [{ price: { id: config.proPriceIds[0] } }] } },
  }).status, 'invalid_interval');
});

test('verified subscription price remains authoritative over signed stale plan metadata', async () => {
  const { buildSonaPurchaseContractMetadata } = await contractModule;
  const { resolveStripeCheckoutWebhookEvidence } = await checkoutEvidenceModule;
  const contractMetadata = buildSonaPurchaseContractMetadata('studio', 'month');
  const evidence = resolveStripeCheckoutWebhookEvidence({
    sessionMetadata: { plan: 'pro', interval: 'month', ...contractMetadata },
    subscription: {
      metadata: { plan: 'pro', interval: 'month', ...contractMetadata },
      items: {
        data: [{ price: { id: 'price_test_max_month_20260711', recurring: { interval: 'month' } } }],
      },
    },
    proPriceIds: ['price_test_pro_month_20260711'],
    studioPriceIds: ['price_test_max_month_20260711'],
  });
  assert.equal(evidence.valid, true);
  assert.equal(evidence.plan, 'studio');
  assert.equal(evidence.planResolution.status, 'metadata_conflict');
  assert.equal(evidence.purchaseContract.status, 'verified');
});

test('webhook route verifies readiness, signature and mode before claiming work', () => {
  const route = fs.readFileSync(path.join(repoRoot, 'app/api/stripe/webhook/route.ts'), 'utf8');
  const readiness = route.indexOf('getStripeWebhookReadiness().configurationReady');
  const verification = route.indexOf('verifyStripeWebhookEnvelope({');
  const modeDecision = route.indexOf('if (!envelope.accepted)');
  const claim = route.indexOf('claimStripeEventProcessing(event)');
  assert.ok(readiness >= 0 && readiness < verification);
  assert.ok(verification < modeDecision);
  assert.ok(modeDecision < claim);
});
