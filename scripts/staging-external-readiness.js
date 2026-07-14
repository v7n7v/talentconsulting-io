const { readSelectedStagingEnvFile } = require('./staging-env-file');

function argument(name, fallback = '') {
  const direct = process.argv.find(value => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function operational(value) {
  const normalized = String(value || '').trim();
  return normalized.length >= 8
    && !/(?:your[_-]?|replace[_-]?|change[_-]?me|placeholder|example|todo|\$\{)/i.test(normalized);
}

function prefixed(value, prefix) {
  return operational(value) && String(value).trim().startsWith(prefix);
}

function track(id, checks, providerProofRequired = false) {
  const missing = checks.filter(check => !check.ready).map(check => check.code);
  return {
    id,
    configurationReady: missing.length === 0,
    providerProofRequired,
    missing,
  };
}

function buildStagingExternalReadiness(env) {
  const ceilingValue = String(env.STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT || '').trim();
  const ceiling = ceilingValue ? Number(ceilingValue) : Number.NaN;
  const core = track('core', [
    { code: 'NODE_ENV:production_required', ready: env.NODE_ENV === 'production' },
    { code: 'STAGING_HOSTNAME:missing', ready: operational(env.STAGING_HOSTNAME) },
    { code: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID:missing', ready: operational(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) },
    { code: 'FIREBASE_SERVICE_ACCOUNT_JSON:missing', ready: operational(env.FIREBASE_SERVICE_ACCOUNT_JSON) },
    {
      code: 'CRON_SECRET:missing_or_weak',
      ready: operational(env.CRON_SECRET) && String(env.CRON_SECRET).trim().length >= 32,
    },
  ]);
  const jobSupply = track('job_supply', [
    { code: 'EVER_JOBS_ENABLED:true_required', ready: env.EVER_JOBS_ENABLED === 'true' },
    { code: 'EVER_JOBS_API_URL:missing', ready: operational(env.EVER_JOBS_API_URL) },
    { code: 'EVER_JOBS_API_KEY:missing', ready: operational(env.EVER_JOBS_API_KEY) },
    { code: 'EVER_JOBS_SAFE_SOURCES:missing', ready: operational(env.EVER_JOBS_SAFE_SOURCES) },
  ], true);
  const sonaActivation = track('sona_activation', [
    { code: 'GROQ_API_KEY:missing', ready: operational(env.GROQ_API_KEY) },
    { code: 'OPENROUTER_API_KEY:missing', ready: operational(env.OPENROUTER_API_KEY) },
    { code: 'UPSTASH_REDIS_REST_URL:missing', ready: /^https:\/\//.test(String(env.UPSTASH_REDIS_REST_URL || '').trim()) },
    { code: 'UPSTASH_REDIS_REST_TOKEN:missing', ready: operational(env.UPSTASH_REDIS_REST_TOKEN) },
  ], true);
  const notifications = track('tracked_email', [
    { code: 'RESEND_API_KEY:missing', ready: prefixed(env.RESEND_API_KEY, 're_') },
    { code: 'RESEND_WEBHOOK_SECRET:missing', ready: prefixed(env.RESEND_WEBHOOK_SECRET, 'whsec_') },
  ], true);
  const billing = track('billing', [
    { code: 'STRIPE_SECRET_KEY:test_mode_required', ready: prefixed(env.STRIPE_SECRET_KEY, 'sk_test_') },
    { code: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:test_mode_required', ready: prefixed(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, 'pk_test_') },
    { code: 'STRIPE_WEBHOOK_SECRET:missing', ready: prefixed(env.STRIPE_WEBHOOK_SECRET, 'whsec_') },
    { code: 'STRIPE_PRO_PRICE_ID:missing', ready: prefixed(env.STRIPE_PRO_PRICE_ID, 'price_') },
    { code: 'STRIPE_PRO_ANNUAL_PRICE_ID:missing', ready: prefixed(env.STRIPE_PRO_ANNUAL_PRICE_ID, 'price_') },
    { code: 'STRIPE_STUDIO_PRICE_ID:missing', ready: prefixed(env.STRIPE_STUDIO_PRICE_ID, 'price_') },
    { code: 'STRIPE_STUDIO_ANNUAL_PRICE_ID:missing', ready: prefixed(env.STRIPE_STUDIO_ANNUAL_PRICE_ID, 'price_') },
    {
      code: 'STRIPE_MAX_PROMOTION_DISCOUNT_PERCENT:invalid',
      ready: Number.isFinite(ceiling) && ceiling >= 0 && ceiling <= 100,
    },
  ], true);
  const tracks = [core, jobSupply, sonaActivation, notifications, billing];
  return {
    environment: 'staging',
    tracks,
    readyForActivationSmoke: core.configurationReady
      && jobSupply.configurationReady
      && sonaActivation.configurationReady,
    readyForTrackedEmailCanary: core.configurationReady && notifications.configurationReady,
    readyForBillingCanary: core.configurationReady && billing.configurationReady,
    allConfigurationPresent: tracks.every(item => item.configurationReady),
    providerReadsAttempted: 0,
    providerWritesAttempted: 0,
  };
}

function main() {
  const selected = readSelectedStagingEnvFile(argument('--staging-env-file', ''));
  if (!selected.env) {
    console.error(`Staging external readiness blocked: ${selected.error}`);
    console.error('Provider reads attempted: 0');
    console.error('Provider writes attempted: 0');
    process.exitCode = 1;
    return;
  }
  const report = buildStagingExternalReadiness(selected.env);
  console.log(JSON.stringify(report, null, 2));
  if (!report.allConfigurationPresent) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  argument,
  buildStagingExternalReadiness,
  operational,
  prefixed,
};
