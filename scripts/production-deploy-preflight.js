const fs = require('fs');
const path = require('path');
const { createPrivateKey } = require('crypto');

const PUBLIC_BUILD_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
];

const OPTIONAL_PUBLIC_BUILD_KEYS = ['NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'];
const ALLOWED_BUILD_KEYS = [...PUBLIC_BUILD_KEYS, ...OPTIONAL_PUBLIC_BUILD_KEYS];

const STRIPE_PRICE_KEYS = [
  'STRIPE_PRO_PRICE_ID',
  'STRIPE_PRO_ANNUAL_PRICE_ID',
  'STRIPE_STUDIO_PRICE_ID',
  'STRIPE_STUDIO_ANNUAL_PRICE_ID',
];

function cleanValue(value = '') {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseDotEnv(content) {
  return Object.fromEntries(content.split(/\r?\n/).flatMap(line => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) return [];
    const separator = line.indexOf('=');
    return [[line.slice(0, separator), cleanValue(line.slice(separator + 1))]];
  }));
}

function parseFlatYaml(content) {
  return Object.fromEntries(content.split(/\r?\n/).flatMap(line => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*:/.test(line)) return [];
    const separator = line.indexOf(':');
    return [[line.slice(0, separator), cleanValue(line.slice(separator + 1))]];
  }));
}

function usable(value, prefix, minimumLength = prefix.length + 8) {
  return typeof value === 'string'
    && value.length >= minimumLength
    && value.startsWith(prefix)
    && !/(?:your[_-]?|replace[_-]?|change[_-]?me|placeholder|example|todo|\$\{)/i.test(value);
}

function strongSecret(value) {
  return typeof value === 'string'
    && value.length >= 32
    && !/(?:change[_-]?me|replace[_-]?me|placeholder|example|todo|secret123|password)/i.test(value);
}

function validateProductionDeploy(buildEnv, runtimeEnv) {
  const errors = [];
  for (const key of Object.keys(buildEnv)) {
    if (!ALLOWED_BUILD_KEYS.includes(key)) errors.push(`build:${key}:not_public_allowlisted`);
  }
  for (const key of PUBLIC_BUILD_KEYS) {
    if (!buildEnv[key]) errors.push(`build:${key}:missing`);
    if (!runtimeEnv[key]) errors.push(`runtime:${key}:missing`);
    if (buildEnv[key] && runtimeEnv[key] && buildEnv[key] !== runtimeEnv[key]) {
      errors.push(`public:${key}:mismatch`);
    }
  }
  if (runtimeEnv.NODE_ENV !== 'production') errors.push('runtime:NODE_ENV:must_be_production');
  if (runtimeEnv.STAGING_HOSTNAME) errors.push('runtime:STAGING_HOSTNAME:must_be_absent');
  if (!usable(runtimeEnv.STRIPE_SECRET_KEY, 'sk_live_', 20)) errors.push('stripe:secret_key:live_required');
  if (!usable(runtimeEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, 'pk_live_', 20)) errors.push('stripe:publishable_key:live_required');
  if (!usable(runtimeEnv.STRIPE_WEBHOOK_SECRET, 'whsec_')) errors.push('stripe:webhook_secret:missing_or_placeholder');
  for (const key of STRIPE_PRICE_KEYS) {
    if (!usable(runtimeEnv[key], 'price_')) errors.push(`stripe:${key}:missing_or_placeholder`);
  }
  const prices = STRIPE_PRICE_KEYS.map(key => runtimeEnv[key]).filter(Boolean);
  if (new Set(prices).size !== prices.length) errors.push('stripe:price_ids:must_be_unique');
  if (!runtimeEnv.FIREBASE_SERVICE_ACCOUNT_JSON) {
    errors.push('runtime:FIREBASE_SERVICE_ACCOUNT_JSON:missing');
  } else {
    try {
      const normalizedServiceAccount = runtimeEnv.FIREBASE_SERVICE_ACCOUNT_JSON
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
      const serviceAccount = JSON.parse(normalizedServiceAccount);
      if (!serviceAccount.project_id || serviceAccount.project_id !== runtimeEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
        errors.push('runtime:FIREBASE_SERVICE_ACCOUNT_JSON:project_mismatch');
      }
      let credentialShapeValid = typeof serviceAccount.client_email === 'string'
        && /^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(serviceAccount.client_email);
      try {
        createPrivateKey(serviceAccount.private_key);
      } catch {
        credentialShapeValid = false;
      }
      if (!credentialShapeValid) {
        errors.push('runtime:FIREBASE_SERVICE_ACCOUNT_JSON:invalid_shape');
      }
    } catch {
      errors.push('runtime:FIREBASE_SERVICE_ACCOUNT_JSON:invalid_json');
    }
  }
  if (!strongSecret(runtimeEnv.CRON_SECRET)) errors.push('runtime:CRON_SECRET:weak_or_missing');
  return { ready: errors.length === 0, errors };
}

function loadProductionDeployEnvironment(mode, root = process.cwd()) {
  const buildEnv = parseDotEnv(fs.readFileSync(path.join(root, '.env.production'), 'utf8'));
  const runtimePath = mode === 'cloudrun' ? '.env.cloudrun.yaml' : '.env.local';
  const runtimeContent = fs.readFileSync(path.join(root, runtimePath), 'utf8');
  const runtimeEnv = mode === 'cloudrun' ? parseFlatYaml(runtimeContent) : parseDotEnv(runtimeContent);
  if (mode === 'firebase' && !runtimeEnv.NODE_ENV) runtimeEnv.NODE_ENV = 'production';
  return { buildEnv, runtimeEnv, runtimePath };
}

function main() {
  const mode = process.argv[2];
  if (!['cloudrun', 'firebase'].includes(mode)) {
    throw new Error('Usage: node scripts/production-deploy-preflight.js cloudrun|firebase');
  }
  const { buildEnv, runtimeEnv, runtimePath } = loadProductionDeployEnvironment(mode);
  const result = validateProductionDeploy(buildEnv, runtimeEnv);
  if (!result.ready) {
    console.error(`Production deploy preflight failed for ${mode}:`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Production deploy preflight passed for ${mode}: public build/runtime values match; live Stripe, Firebase Admin and cron configuration are present in ${runtimePath}.`);
}

if (require.main === module) main();

module.exports = {
  PUBLIC_BUILD_KEYS,
  ALLOWED_BUILD_KEYS,
  STRIPE_PRICE_KEYS,
  parseDotEnv,
  parseFlatYaml,
  validateProductionDeploy,
};
