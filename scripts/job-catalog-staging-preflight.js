const { readSelectedStagingEnvFile } = require('./staging-env-file');

const PRODUCTION_FIREBASE_PROJECT_ID = 'talent-consulting-acf16';
const PILOT_ORIGINS = new Set(['greenhouse', 'lever', 'ashby', 'workday']);
const PLACEHOLDER = /(?:your[_-]?|replace[_-]?|change[_-]?me|placeholder|example|todo|dummy|sample|\$\{)/i;

function parseArguments(argv) {
  const allowed = new Set(['--staging-env-file', '--expected-staging-hostname', '--expected-firebase-project-id']);
  const values = {};
  const errors = [];
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    const equals = token.indexOf('=');
    const name = equals >= 0 ? token.slice(0, equals) : token;
    if (!allowed.has(name)) { errors.push('argument:unknown'); continue; }
    if (Object.hasOwn(values, name)) { errors.push('argument:duplicate'); continue; }
    const value = equals >= 0 ? token.slice(equals + 1) : argv[++index];
    if (typeof value !== 'string' || !value.trim() || value.startsWith('--')) {
      errors.push(`argument:${name.slice(2).replaceAll('-', '_')}:required`);
      continue;
    }
    values[name] = value.trim();
  }
  return { values, errors };
}

function operational(value, minLength = 1, maxLength = 4096) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length >= minLength && text.length <= maxLength && !PLACEHOLDER.test(text);
}

function normalizedHostname(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const host = value.trim().toLowerCase().replace(/\.$/, '');
  if (host.length > 253 || host.includes('/') || host.includes('@') || host.includes(':') || host.includes('?') || host.includes('#')) return '';
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return '';
  if (host === 'talentconsulting.io' || host === 'www.talentconsulting.io') return '';
  return host;
}

function csvValues(value) {
  if (typeof value !== 'string') return [];
  return [...new Set(value.split(',').map(item => item.trim().toLowerCase()).filter(Boolean))];
}

function safeInteger(value, min, max) {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

/** Local configuration check only. It never calls the provider or deployment. */
function buildJobCatalogStagingPreflight(env, { expectedStagingHostname, expectedFirebaseProjectId } = {}) {
  const missing = [];
  const errors = [];
  const addMissing = code => missing.push(code);
  const addError = code => errors.push(code);

  const expectedHost = normalizedHostname(expectedStagingHostname);
  if (!expectedStagingHostname) addMissing('argument:expected_staging_hostname:required');
  else if (!expectedHost) addError('argument:expected_staging_hostname:invalid_staging_hostname');

  const expectedProject = operational(expectedFirebaseProjectId, 1, 200) ? expectedFirebaseProjectId.trim() : '';
  if (!expectedFirebaseProjectId) addMissing('argument:expected_firebase_project_id:required');
  else if (!expectedProject) addError('argument:expected_firebase_project_id:invalid');
  if (expectedProject === PRODUCTION_FIREBASE_PROJECT_ID) addError('firebase:production_project_forbidden');

  if (env.NODE_ENV !== 'production') addError('runtime:node_env_must_be_production');
  const configuredHost = normalizedHostname(env.STAGING_HOSTNAME);
  if (!env.STAGING_HOSTNAME) addMissing('runtime:staging_hostname_missing');
  else if (!configuredHost) addError('runtime:staging_hostname_invalid');
  else if (expectedHost && configuredHost !== expectedHost) addError('runtime:staging_hostname_mismatch');

  const configuredProject = operational(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 1, 200)
    ? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID.trim() : '';
  if (!env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) addMissing('firebase:project_id_missing');
  else if (!configuredProject) addError('firebase:project_id_invalid');
  else if (configuredProject === PRODUCTION_FIREBASE_PROJECT_ID) addError('firebase:production_project_forbidden');
  else if (expectedProject && configuredProject !== expectedProject) addError('firebase:project_id_mismatch');

  const accountText = typeof env.FIREBASE_SERVICE_ACCOUNT_JSON === 'string' ? env.FIREBASE_SERVICE_ACCOUNT_JSON.trim() : '';
  if (!accountText) addMissing('firebase:service_account_missing');
  else if (PLACEHOLDER.test(accountText)) addError('firebase:service_account_placeholder');
  else {
    try {
      const account = JSON.parse(accountText);
      if (!account || typeof account !== 'object' || Array.isArray(account)
        || typeof account.project_id !== 'string' || !account.project_id.trim()
        || typeof account.client_email !== 'string' || !account.client_email.trim()
        || typeof account.private_key !== 'string' || !account.private_key.trim()) {
        addError('firebase:service_account_invalid');
      } else if (account.project_id === PRODUCTION_FIREBASE_PROJECT_ID) {
        addError('firebase:production_project_forbidden');
      } else if (expectedProject && account.project_id !== expectedProject) {
        addError('firebase:service_account_project_mismatch');
      }
    } catch {
      addError('firebase:service_account_invalid');
    }
  }

  const cronSecret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET.trim() : '';
  if (!cronSecret) addMissing('cron:secret_missing');
  else if (cronSecret.length < 32 || PLACEHOLDER.test(cronSecret)) addError('cron:secret_weak_or_placeholder');

  if (env.JOB_CATALOG_ENABLED !== 'true') addError('catalog:enabled_true_required');
  if (env.FANTASTIC_JOBS_ENABLED !== 'true') addError('fantastic:enabled_true_required');
  const providerKey = typeof env.FANTASTIC_JOBS_API_KEY === 'string' ? env.FANTASTIC_JOBS_API_KEY.trim() : '';
  if (!providerKey) addMissing('fantastic:api_key_missing');
  else if (!operational(providerKey, 8, 4096)) addError('fantastic:api_key_placeholder_or_invalid');

  const origins = csvValues(env.JOB_CATALOG_ORIGINS);
  const sources = csvValues(env.FANTASTIC_JOBS_SOURCES).map(value => value === 'lever.co' ? 'lever' : value);
  if (!origins.length) addMissing('catalog:origins_missing');
  if (!sources.length) addMissing('fantastic:sources_missing');
  if (origins.some(value => !PILOT_ORIGINS.has(value))) addError('catalog:origin_outside_pilot_allowlist');
  if (sources.some(value => !PILOT_ORIGINS.has(value))) addError('fantastic:source_outside_pilot_allowlist');
  const sortedOrigins = [...origins].sort();
  const sortedSources = [...sources].sort();
  if (origins.length && sources.length
    && (sortedOrigins.length !== sortedSources.length || sortedOrigins.some((value, index) => value !== sortedSources[index]))) {
    addError('catalog:origins_sources_mismatch');
  }

  for (const [name, min, max] of [
    ['JOB_INGEST_MAX_ITEMS', 50, 100],
    ['JOB_INGEST_MAX_REQUESTS', 1, 4],
    ['JOB_INGEST_DAILY_MAX_RECORDS', 1, 100],
    ['JOB_INGEST_DAILY_MAX_REQUESTS', 1, 10],
  ]) {
    if (env[name] === undefined || String(env[name]).trim() === '') addMissing(`pilot:${name.toLowerCase()}:missing`);
    else if (safeInteger(String(env[name]), min, max) === null) addError(`pilot:${name.toLowerCase()}:out_of_bounds`);
  }

  for (const [name, code] of [['JOB_INGEST_QUERY', 'pilot:query_missing_or_invalid'], ['JOB_INGEST_LOCATION', 'pilot:location_missing_or_invalid']]) {
    if (!operational(env[name], 2, 200)) {
      if (!env[name] || !String(env[name]).trim()) addMissing(code);
      else addError(code);
    }
  }

  const allIssues = [...new Set([...missing, ...errors])];
  return {
    environment: 'staging',
    provider: 'fantastic',
    configurationReady: allIssues.length === 0,
    missing: [...new Set(missing)],
    errors: [...new Set(errors)],
    providerReadsAttempted: 0,
    providerWritesAttempted: 0,
    deploymentCallsAttempted: 0,
    liveValidationPerformed: false,
  };
}

function argValue(values, name) {
  return values[`--${name}`];
}

function main(argv = process.argv.slice(2), io = console) {
  const parsed = parseArguments(argv);
  const issues = [...parsed.errors];
  const selectedPath = argValue(parsed.values, 'staging-env-file');
  if (!selectedPath) issues.push('argument:staging_env_file:required');
  const expectedStagingHostname = argValue(parsed.values, 'expected-staging-hostname');
  const expectedFirebaseProjectId = argValue(parsed.values, 'expected-firebase-project-id');

  const selected = selectedPath ? readSelectedStagingEnvFile(selectedPath) : { env: null, error: null };
  let report;
  if (!selected.env) {
    report = buildJobCatalogStagingPreflight({}, { expectedStagingHostname, expectedFirebaseProjectId });
    if (selectedPath) report.missing.push(selected.error === 'env_file:not_found'
      ? 'env_file:not_found' : 'env_file:unusable');
    report.errors.push(...issues);
    report.configurationReady = false;
  } else {
    report = buildJobCatalogStagingPreflight(selected.env, { expectedStagingHostname, expectedFirebaseProjectId });
    report.errors.push(...issues);
    report.errors = [...new Set(report.errors)];
    report.configurationReady = report.configurationReady && issues.length === 0;
  }
  io.log(JSON.stringify(report, null, 2));
  process.exitCode = report.configurationReady ? 0 : 1;
  return report;
}

if (require.main === module) main();

module.exports = { buildJobCatalogStagingPreflight, main, normalizedHostname, parseArguments };
