const { readSelectedStagingEnvFile } = require('./staging-env-file');

const STAGING_SAFE_SOURCE_HOSTS = {
  remoteok: ['remoteok.com'],
  remotive: ['remotive.com'],
  jobicy: ['jobicy.com'],
  himalayas: ['himalayas.app'],
  weworkremotely: ['weworkremotely.com'],
};
const GENERIC_SEARCH_QUERY = 'engineer';

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

function usableJobField(value) {
  const normalized = String(value || '').trim();
  return normalized.length >= 2 && normalized.length <= 1_000;
}

function parseSafeSources(value) {
  return Array.from(new Set(String(value || '').split(',')
    .map(source => source.trim().toLowerCase())
    .filter(Boolean)));
}

function validateInternalServiceUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const valid = url.protocol === 'http:'
      && url.hostname === 'ever-jobs'
      && url.port === '3001'
      && !url.username
      && !url.password
      && (url.pathname === '/' || url.pathname === '')
      && !url.search
      && !url.hash;
    return { valid, origin: valid ? url.origin : null };
  } catch {
    return { valid: false, origin: null };
  }
}

function assessEverJobsStagingConfiguration(env) {
  const service = validateInternalServiceUrl(env.EVER_JOBS_API_URL);
  const safeSources = parseSafeSources(env.EVER_JOBS_SAFE_SOURCES);
  const unsupportedSources = safeSources.filter(source => !STAGING_SAFE_SOURCE_HOSTS[source]);
  const errors = [];
  if (env.NODE_ENV !== 'production' || !/staging/i.test(String(env.STAGING_HOSTNAME || ''))) {
    errors.push('environment:staging_required');
  }
  if (env.EVER_JOBS_ENABLED !== 'true') errors.push('ever_jobs:enabled_required');
  if (!service.valid) errors.push('ever_jobs:private_service_url_invalid');
  if (!operational(env.EVER_JOBS_API_KEY)) errors.push('ever_jobs:key_missing_or_invalid');
  if (safeSources.length === 0) errors.push('ever_jobs:safe_sources_missing');
  if (unsupportedSources.length > 0) errors.push('ever_jobs:safe_sources_unsupported');
  return {
    ready: errors.length === 0,
    errors,
    serviceOrigin: service.origin,
    safeSources,
  };
}

async function boundedJson(response, maxBytes = 5 * 1024 * 1024) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error('response_too_large');
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('response_too_large');
  return text ? JSON.parse(text) : null;
}

function resultRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload.jobs)) return payload.jobs;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && typeof payload.data === 'object' && Array.isArray(payload.data.jobs)) return payload.data.jobs;
  if (payload.data && typeof payload.data === 'object' && Array.isArray(payload.data.results)) return payload.data.results;
  return null;
}

function hostnameMatches(hostname, allowedHost) {
  const normalized = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return normalized === allowedHost || normalized.endsWith(`.${allowedHost}`);
}

function validateSafeSearchRows(rows, safeSources) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ready: false, validCount: 0, sourceCount: 0, error: 'ever_jobs:search_returned_no_jobs' };
  }
  const configured = new Set(safeSources);
  const observedSources = new Set();
  for (const row of rows) {
    const source = String(row?.source || row?.site || row?.provider || '').trim().toLowerCase();
    const urlValue = row?.url || row?.jobUrl || row?.applyUrl || row?.job_url || '';
    const hosts = STAGING_SAFE_SOURCE_HOSTS[source] || [];
    let url;
    try {
      url = new URL(String(urlValue));
    } catch {
      return { ready: false, validCount: 0, sourceCount: 0, error: 'ever_jobs:unsafe_result_evidence' };
    }
    const hasCoreFields = usableJobField(row?.title)
      && usableJobField(row?.company || row?.companyName)
      && usableJobField(row?.location);
    const trusted = configured.has(source)
      && url.protocol === 'https:'
      && hosts.some(host => hostnameMatches(url.hostname, host));
    if (!hasCoreFields || !trusted) {
      return { ready: false, validCount: 0, sourceCount: 0, error: 'ever_jobs:unsafe_result_evidence' };
    }
    observedSources.add(source);
  }
  return { ready: true, validCount: rows.length, sourceCount: observedSources.size, error: null };
}

function buildSearchBody(safeSources) {
  return {
    searchTerm: GENERIC_SEARCH_QUERY,
    query: GENERIC_SEARCH_QUERY,
    country: 'USA',
    siteType: safeSources,
    sources: safeSources,
    sites: safeSources,
    resultsWanted: 10,
    limit: 10,
    page: 1,
    sortBy: 'relevance',
    descriptionFormat: 'markdown',
  };
}

async function runEverJobsStagingCanary({ env, fetchImpl = fetch }) {
  const configuration = assessEverJobsStagingConfiguration(env);
  if (!configuration.ready) return { configuration, assessment: null, operations: [] };
  const operations = ['ever_jobs.health.authenticated', 'ever_jobs.health.unauthenticated', 'ever_jobs.search.safe_sources'];
  const authHeaders = { accept: 'application/json', 'x-api-key': env.EVER_JOBS_API_KEY };
  const [authenticatedHealth, unauthenticatedHealth, search] = await Promise.all([
    fetchImpl(`${configuration.serviceOrigin}/health`, {
      method: 'GET',
      headers: authHeaders,
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null),
    fetchImpl(`${configuration.serviceOrigin}/health`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null),
    fetchImpl(`${configuration.serviceOrigin}/api/jobs/search`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify(buildSearchBody(configuration.safeSources)),
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null),
  ]);
  const healthPayload = authenticatedHealth?.ok ? await boundedJson(authenticatedHealth).catch(() => null) : null;
  const authenticatedHealthReady = authenticatedHealth?.ok && healthPayload?.status === 'healthy';
  const apiKeyProtectionReady = unauthenticatedHealth?.status === 401 || unauthenticatedHealth?.status === 403;
  const searchPayload = search && (search.status === 200 || search.status === 201)
    ? await boundedJson(search).catch(() => null)
    : null;
  const rows = resultRows(searchPayload);
  const searchEvidence = validateSafeSearchRows(rows, configuration.safeSources);
  const errors = [];
  if (!authenticatedHealthReady) errors.push('ever_jobs:authenticated_health_failed');
  if (!apiKeyProtectionReady) errors.push('ever_jobs:api_key_protection_failed');
  if (!search || (search.status !== 200 && search.status !== 201)) errors.push('ever_jobs:search_request_failed');
  else if (!rows) errors.push('ever_jobs:search_contract_unsupported');
  else if (!searchEvidence.ready) errors.push(searchEvidence.error);
  return {
    configuration,
    assessment: {
      ready: errors.length === 0,
      errors,
      authenticatedHealthReady: Boolean(authenticatedHealthReady),
      apiKeyProtectionReady,
      safeSearchReady: searchEvidence.ready,
      resultCount: searchEvidence.validCount,
      observedSafeSourceCount: searchEvidence.sourceCount,
      providerRequestsAttempted: operations.length,
      productWritesAttempted: 0,
      externalApplicationsSubmitted: 0,
    },
    operations,
  };
}

async function main() {
  const selected = readSelectedStagingEnvFile(argument('--staging-env-file', ''));
  if (!selected.env) {
    console.error('Ever Jobs staging canary blocked before provider requests:');
    console.error(`- ${selected.error}`);
    console.error('Provider requests attempted: 0');
    console.error('Product writes attempted: 0');
    console.error('External applications submitted: 0');
    process.exitCode = 1;
    return;
  }
  const result = await runEverJobsStagingCanary({ env: selected.env });
  if (!result.configuration.ready) {
    console.error('Ever Jobs staging canary blocked before provider requests:');
    for (const error of result.configuration.errors) console.error(`- ${error}`);
    console.error('Provider requests attempted: 0');
    console.error('Product writes attempted: 0');
    console.error('External applications submitted: 0');
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(result.assessment, null, 2));
  if (!result.assessment.ready) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(() => {
    console.error('Ever Jobs staging canary failed: provider_request_failed');
    console.error('Product writes attempted: 0');
    console.error('External applications submitted: 0');
    process.exitCode = 1;
  });
}

module.exports = {
  GENERIC_SEARCH_QUERY,
  STAGING_SAFE_SOURCE_HOSTS,
  assessEverJobsStagingConfiguration,
  buildSearchBody,
  resultRows,
  runEverJobsStagingCanary,
  validateInternalServiceUrl,
  validateSafeSearchRows,
};
