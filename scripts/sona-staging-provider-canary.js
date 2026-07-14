const { readSelectedStagingEnvFile } = require('./staging-env-file');

const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/key';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const REQUIRED_GROQ_MODEL = 'openai/gpt-oss-120b';
const REQUIRED_OPENROUTER_MODEL = 'qwen/qwen3.6-plus';

function argument(name, fallback = '') {
  const direct = process.argv.find(value => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function operational(value, prefix = '') {
  const normalized = String(value || '').trim();
  return normalized.length >= Math.max(8, prefix.length + 4)
    && normalized.startsWith(prefix)
    && !/(?:your[_-]?|replace[_-]?|change[_-]?me|placeholder|example|todo|\$\{)/i.test(normalized);
}

function validateUpstashUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const valid = url.protocol === 'https:'
      && url.hostname.endsWith('.upstash.io')
      && !url.username
      && !url.password
      && !url.port
      && (url.pathname === '/' || url.pathname === '')
      && !url.search
      && !url.hash;
    return { valid, origin: valid ? url.origin : null };
  } catch {
    return { valid: false, origin: null };
  }
}

function assessSonaStagingProviderConfiguration(env) {
  const upstash = validateUpstashUrl(env.UPSTASH_REDIS_REST_URL);
  const errors = [];
  if (env.NODE_ENV !== 'production' || !/staging/i.test(String(env.STAGING_HOSTNAME || ''))) {
    errors.push('environment:staging_required');
  }
  if (!operational(env.GROQ_API_KEY, 'gsk_')) errors.push('groq:key_missing_or_invalid');
  if (!operational(env.OPENROUTER_API_KEY, 'sk-or-')) errors.push('openrouter:key_missing_or_invalid');
  if (!upstash.valid) errors.push('upstash:url_invalid');
  if (!operational(env.UPSTASH_REDIS_REST_TOKEN)) errors.push('upstash:token_missing_or_invalid');
  return {
    ready: errors.length === 0,
    errors,
    upstashOrigin: upstash.origin,
  };
}

async function getJson(url, headers) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json', ...headers },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function modelIds(payload) {
  if (!payload || !Array.isArray(payload.data)) return [];
  return payload.data.map(item => String(item?.id || '')).filter(Boolean);
}

async function runReadOnlySonaProviderCanary({ env, readJson = getJson }) {
  const configuration = assessSonaStagingProviderConfiguration(env);
  if (!configuration.ready) {
    return { configuration, assessment: null, readOperations: [] };
  }
  const readOperations = [
    'groq.models.list',
    'openrouter.key.get',
    'openrouter.models.list',
    'upstash.ping',
  ];
  const [groq, openrouterKey, openrouter, upstash] = await Promise.all([
    readJson(GROQ_MODELS_URL, { authorization: `Bearer ${env.GROQ_API_KEY}` }).catch(() => null),
    readJson(OPENROUTER_KEY_URL, { authorization: `Bearer ${env.OPENROUTER_API_KEY}` }).catch(() => null),
    readJson(OPENROUTER_MODELS_URL, { authorization: `Bearer ${env.OPENROUTER_API_KEY}` }).catch(() => null),
    readJson(`${configuration.upstashOrigin}/ping`, { authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }).catch(() => null),
  ]);
  const groqReady = modelIds(groq).includes(REQUIRED_GROQ_MODEL);
  const openrouterKeyReady = Boolean(openrouterKey?.data && typeof openrouterKey.data === 'object');
  const openrouterReady = modelIds(openrouter).includes(REQUIRED_OPENROUTER_MODEL);
  const upstashReady = String(upstash?.result || '').toUpperCase() === 'PONG';
  const errors = [];
  if (!groqReady) errors.push('groq:required_model_unavailable');
  if (!openrouterKeyReady) errors.push('openrouter:key_verification_failed');
  if (!openrouterReady) errors.push('openrouter:required_model_unavailable');
  if (!upstashReady) errors.push('upstash:ping_failed');
  return {
    configuration,
    assessment: {
      ready: errors.length === 0,
      errors,
      groqModelReady: groqReady,
      openRouterKeyReady: openrouterKeyReady,
      openRouterModelReady: openrouterReady,
      upstashPingReady: upstashReady,
      providerReadsAttempted: readOperations.length,
      providerWritesAttempted: 0,
    },
    readOperations,
  };
}

async function main() {
  const selectedEnvPath = argument('--staging-env-file', '');
  const selected = readSelectedStagingEnvFile(selectedEnvPath);
  if (!selected.env) {
    console.error('Sona staging provider canary blocked before provider reads:');
    console.error(`- ${selected.error}`);
    console.error('Provider reads attempted: 0');
    console.error('Provider writes attempted: 0');
    process.exitCode = 1;
    return;
  }
  const result = await runReadOnlySonaProviderCanary({ env: selected.env });
  if (!result.configuration.ready) {
    console.error('Sona staging provider canary blocked before provider reads:');
    for (const error of result.configuration.errors) console.error(`- ${error}`);
    console.error('Provider reads attempted: 0');
    console.error('Provider writes attempted: 0');
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(result.assessment, null, 2));
  if (!result.assessment.ready) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(() => {
    console.error('Sona staging provider canary failed: provider_read_failed');
    console.error('Provider writes attempted: 0');
    process.exitCode = 1;
  });
}

module.exports = {
  GROQ_MODELS_URL,
  OPENROUTER_KEY_URL,
  OPENROUTER_MODELS_URL,
  REQUIRED_GROQ_MODEL,
  REQUIRED_OPENROUTER_MODEL,
  assessSonaStagingProviderConfiguration,
  modelIds,
  readSelectedStagingEnvFile,
  runReadOnlySonaProviderCanary,
  validateUpstashUrl,
};
