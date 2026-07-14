const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Stripe = require('stripe');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const APPROVED_POLICY_FILE = path.join(repoRoot, 'deploy/staging/stripe-provision-policy.json');
const DEPLOYMENT_IDENTITY_VERSION = 'staging-deployment-v1';
const POLICY_VERSION = 'stripe-staging-policy-v1';
const WEBHOOK_DESCRIPTION_PREFIX = 'talent-staging-webhook-sha256:';
const RUNTIME_KEYS = [
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRO_PRICE_ID',
  'STRIPE_PRO_ANNUAL_PRICE_ID',
  'STRIPE_STUDIO_PRICE_ID',
  'STRIPE_STUDIO_ANNUAL_PRICE_ID',
];
const BUNDLE_KEYS = [
  ...RUNTIME_KEYS,
  'STRIPE_WEBHOOK_ENDPOINT_ID',
  'STAGING_DEPLOYMENT_IDENTITY_FINGERPRINT',
];

function argument(name, fallback = '') {
  const direct = process.argv.find(value => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function expectedDeploymentIdentity(policy, publishableKey) {
  return digest([
    DEPLOYMENT_IDENTITY_VERSION,
    'production',
    policy.stagingHostname,
    policy.firebaseProjectId,
    policy.stripeTestAccountId,
    publishableKey,
  ].join('\0')).slice(0, 24);
}

function readProtectedBundle(filePath) {
  if (!filePath) return { text: null, errors: ['bundle_file:required'] };
  let descriptor;
  try {
    const resolved = path.resolve(filePath);
    const parent = fs.lstatSync(path.dirname(resolved));
    const file = fs.lstatSync(resolved);
    const errors = [];
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o022) !== 0) {
      errors.push('bundle_file:protected_parent_directory_required');
    }
    if (!file.isFile() || file.isSymbolicLink()) errors.push('bundle_file:regular_file_required');
    descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(descriptor);
    if ((stat.mode & 0o077) !== 0) errors.push('bundle_file:owner_only_permissions_required');
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) errors.push('bundle_file:owner_mismatch');
    if (stat.size <= 0 || stat.size > 16_384) errors.push('bundle_file:invalid_size');
    return { text: fs.readFileSync(descriptor, 'utf8'), errors: [...new Set(errors)] };
  } catch {
    return { text: null, errors: ['bundle_file:invalid_or_unreadable'] };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function topLevelJsonKeys(text) {
  const keys = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') {
        inString = false;
        if (depth === 1) {
          let cursor = index + 1;
          while (/\s/.test(text[cursor] || '')) cursor += 1;
          if (text[cursor] === ':') keys.push(JSON.parse(text.slice(start, index + 1)));
        }
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      start = index;
    } else if (character === '{' || character === '[') depth += 1;
    else if (character === '}' || character === ']') depth -= 1;
  }
  return keys;
}

function parseUniqueObjectJson(text) {
  let value;
  try { value = JSON.parse(text); } catch { return { value: null, errors: ['bundle:invalid_json'] }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { value: null, errors: ['bundle:json_object_required'] };
  }
  const keys = topLevelJsonKeys(text);
  if (new Set(keys).size !== keys.length) return { value: null, errors: ['bundle:duplicate_json_key'] };
  return { value, errors: [] };
}

function parseUniqueFlatJson(text) {
  const parsed = parseUniqueObjectJson(text);
  if (!parsed.value) return parsed;
  const value = parsed.value;
  if (Object.values(value).some(item => typeof item !== 'string')) {
    return { value: null, errors: ['bundle:string_values_required'] };
  }
  return { value, errors: [] };
}

function validatePolicy(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { policy: null, errors: ['policy:invalid'] };
  if (value.version !== POLICY_VERSION) errors.push('policy:version_mismatch');
  if (value.status !== 'approved') errors.push('policy:approved_test_account_required');
  if (value.stagingHostname !== 'talent-staging.187-77-8-98.nip.io') errors.push('policy:hostname_mismatch');
  if (value.firebaseProjectId !== 'talent-consulting-stg') errors.push('policy:firebase_project_mismatch');
  if (!/^acct_[A-Za-z0-9_]{6,}$/.test(value.stripeTestAccountId || '')) {
    errors.push('policy:stripe_test_account_required');
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(value.stripePublishableKeySha256 || '')) {
    errors.push('policy:publishable_key_hash_required');
  }
  return { policy: errors.length === 0 ? value : null, errors: [...new Set(errors)] };
}

function loadApprovedPolicy(file = APPROVED_POLICY_FILE) {
  try {
    const parsed = parseUniqueObjectJson(fs.readFileSync(file, 'utf8'));
    if (!parsed.value) {
      return {
        policy: null,
        errors: parsed.errors.map(error => error.replace(/^bundle:/, 'policy:')),
      };
    }
    return validatePolicy(parsed.value);
  }
  catch { return { policy: null, errors: ['policy:invalid_or_missing'] }; }
}

function usable(value, prefix, minimumLength = prefix.length + 8) {
  return typeof value === 'string'
    && value.length >= minimumLength
    && value.startsWith(prefix)
    && /^[A-Za-z0-9_]+$/.test(value)
    && !/(?:your[_-]?|replace[_-]?|change[_-]?me|placeholder|example|todo)/i.test(value);
}

function validateBundle(value, policy) {
  const errors = [];
  if (!policy) return { values: null, errors: ['policy:approved_test_account_required'] };
  for (const key of Object.keys(value || {})) if (!BUNDLE_KEYS.includes(key)) errors.push('bundle:unexpected_key');
  for (const key of BUNDLE_KEYS) if (typeof value?.[key] !== 'string') errors.push(`bundle:${key}:required`);
  if (!usable(value?.STRIPE_SECRET_KEY, 'sk_test_', 24)) errors.push('bundle:secret_test_mode_required');
  if (!usable(value?.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, 'pk_test_', 24)) {
    errors.push('bundle:publishable_test_mode_required');
  }
  if (!usable(value?.STRIPE_WEBHOOK_SECRET, 'whsec_', 20)) errors.push('bundle:webhook_secret_invalid');
  if (!usable(value?.STRIPE_WEBHOOK_ENDPOINT_ID, 'we_', 12)) errors.push('bundle:webhook_endpoint_invalid');
  for (const key of RUNTIME_KEYS.filter(key => key.endsWith('PRICE_ID'))) {
    if (!usable(value?.[key], 'price_', 14)) errors.push(`bundle:${key}:invalid`);
  }
  const priceIds = RUNTIME_KEYS.filter(key => key.endsWith('PRICE_ID')).map(key => value?.[key]);
  if (priceIds.every(Boolean) && new Set(priceIds).size !== priceIds.length) errors.push('bundle:price_ids_must_be_unique');
  if (value?.STAGING_DEPLOYMENT_IDENTITY_FINGERPRINT !== expectedDeploymentIdentity(
    policy,
    value?.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  )) errors.push('bundle:deployment_identity_mismatch');
  if (`sha256:${digest(value?.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')}` !== policy.stripePublishableKeySha256) {
    errors.push('bundle:publishable_key_not_approved');
  }
  return { values: errors.length === 0 ? value : null, errors: [...new Set(errors)] };
}

async function loadContracts() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-provision-'));
  const outfile = path.join(outdir, 'stripe-provision-contracts.cjs');
  await build({
    stdin: {
      contents: [
        "export * from './lib/billing/stripe-checkout-price-contract';",
        "export * from './lib/billing/stripe-webhook-events';",
      ].join('\n'),
      resolveDir: repoRoot,
      sourcefile: 'stripe-provision-contracts.ts',
      loader: 'ts',
    },
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

function priceEvidence(price) {
  return {
    id: price.id,
    active: price.active === true,
    type: price.type,
    interval: price.recurring?.interval || null,
    currency: price.currency || '',
    unitAmount: price.unit_amount ?? null,
  };
}

async function verifyResources({ values, policy, stripe, contracts }) {
  const errors = [];
  const readOperations = [];
  readOperations.push('stripe.account.retrieve');
  const account = await stripe.accounts.retrieve();
  if (account?.id !== policy.stripeTestAccountId) errors.push('stripe:approved_test_account_mismatch');
  const slots = {
    pro: { month: 'STRIPE_PRO_PRICE_ID', year: 'STRIPE_PRO_ANNUAL_PRICE_ID' },
    studio: { month: 'STRIPE_STUDIO_PRICE_ID', year: 'STRIPE_STUDIO_ANNUAL_PRICE_ID' },
  };
  const prices = { pro: {}, studio: {} };
  for (const [plan, intervals] of Object.entries(slots)) {
    for (const [interval, key] of Object.entries(intervals)) {
      readOperations.push(`stripe.price.retrieve:${plan}:${interval}`);
      const price = await stripe.prices.retrieve(values[key]);
      prices[plan][interval] = priceEvidence(price);
      if (price.id !== values[key]) errors.push(`stripe:${plan}:${interval}:id_mismatch`);
    }
  }
  for (const interval of ['month', 'year']) {
    for (const plan of ['pro', 'studio']) {
      const result = contracts.validateStripeCheckoutPriceContract({
        plan,
        interval,
        selectedPriceId: prices[plan][interval].id,
        pro: prices.pro[interval],
        studio: prices.studio[interval],
      });
      if (!result.valid) errors.push(`stripe:${plan}:${interval}:${result.reason}`);
    }
  }
  readOperations.push('stripe.webhook_endpoint.retrieve');
  const endpoint = await stripe.webhookEndpoints.retrieve(values.STRIPE_WEBHOOK_ENDPOINT_ID);
  const endpointEvents = endpoint.enabled_events || [];
  const allEventsEnabled = endpointEvents.includes('*')
    || contracts.STRIPE_WEBHOOK_HANDLED_EVENTS.every(event => endpointEvents.includes(event));
  const expectedDescription = `${WEBHOOK_DESCRIPTION_PREFIX}${digest(values.STRIPE_WEBHOOK_SECRET).slice(0, 24)}`;
  if (
    endpoint?.id !== values.STRIPE_WEBHOOK_ENDPOINT_ID
    || endpoint.status !== 'enabled'
    || endpoint.url !== `https://${policy.stagingHostname}/api/stripe/webhook`
    || endpoint.description !== expectedDescription
    || !allEventsEnabled
  ) errors.push('stripe:webhook_endpoint_mismatch');
  return { ready: errors.length === 0, errors: [...new Set(errors)], readOperations };
}

async function main() {
  const policyResult = loadApprovedPolicy();
  const bundleFile = readProtectedBundle(argument('--bundle-file'));
  const parsed = bundleFile.text === null ? { value: null, errors: [] } : parseUniqueFlatJson(bundleFile.text);
  const bundle = parsed.value ? validateBundle(parsed.value, policyResult.policy) : { values: null, errors: [] };
  const errors = [...policyResult.errors, ...bundleFile.errors, ...parsed.errors, ...bundle.errors];
  if (errors.length > 0) {
    console.error('Stripe staging bundle validation blocked before provider calls:');
    for (const error of [...new Set(errors)]) console.error(`- ${error}`);
    console.error('Configuration installed: no');
    process.exitCode = 1;
    return;
  }
  try {
    const contracts = await loadContracts();
    const stripe = new Stripe(bundle.values.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' });
    const proof = await verifyResources({
      values: bundle.values,
      policy: policyResult.policy,
      stripe,
      contracts,
    });
    if (!proof.ready) {
      console.error('Stripe staging bundle validation blocked:');
      for (const error of proof.errors) console.error(`- ${error}`);
      console.error('Configuration installed: no');
      process.exitCode = 1;
      return;
    }
    console.log('Stripe staging bundle validation passed.');
    console.log('- approved test account: verified');
    console.log('- prices: four recurring plan references verified');
    console.log('- webhook: complete handled-event contract verified');
    console.log('- provider reads: six');
    console.log('- configuration installed: no');
    console.log('- next action: operator-reviewed secret installation and staging rebuild');
  } catch {
    console.error('Stripe staging bundle validation blocked: provider_read_failed');
    console.error('Configuration installed: no');
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  APPROVED_POLICY_FILE,
  BUNDLE_KEYS,
  POLICY_VERSION,
  RUNTIME_KEYS,
  WEBHOOK_DESCRIPTION_PREFIX,
  argument,
  expectedDeploymentIdentity,
  loadApprovedPolicy,
  parseUniqueFlatJson,
  parseUniqueObjectJson,
  readProtectedBundle,
  usable,
  validateBundle,
  validatePolicy,
  verifyResources,
};
