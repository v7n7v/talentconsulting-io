export type JobSupplyHealthStatus = 'healthy' | 'disabled' | 'misconfigured' | 'unhealthy' | 'unreachable';

export interface JobSupplyConfiguration {
  enabled: boolean;
  configured: boolean;
  preparationConfigured: boolean;
  serviceHost: string | null;
  hasApiKey: boolean;
  safeSources: string[];
  unsafeSources: string[];
  missing: string[];
}

export interface JobSupplyHealthResult extends JobSupplyConfiguration {
  status: JobSupplyHealthStatus;
  preparationReady: boolean;
  apiKeyProtectionVerified: boolean;
  checkedAt: string;
  latencyMs: number | null;
  endpoint: '/health' | '/ping' | null;
  message: string;
}

interface ProbeOptions {
  fetchImpl?: typeof fetch;
  force?: boolean;
  timeoutMs?: number;
  now?: () => number;
}

interface PrimaryJobSearchStatus {
  everJobs: 'disabled' | 'success' | 'empty' | 'error';
  fallbackUsed: boolean;
}

const APPROVED_SAFE_SOURCES = [
  'greenhouse',
  'lever',
  'ashby',
  'workday',
  'remoteok',
  'remotive',
  'jobicy',
  'himalayas',
  'weworkremotely',
  'usajobs',
  'adzuna',
];
const APPROVED_SAFE_SOURCE_SET = new Set(APPROVED_SAFE_SOURCES);
const HEALTH_CACHE_MS = 30_000;
let healthCache: { expiresAt: number; value: JobSupplyHealthResult } | null = null;

export function isVerifiedPrimaryJobSearch(status: PrimaryJobSearchStatus | null | undefined) {
  return status?.everJobs === 'success' && status.fallbackUsed === false;
}

function configuredSources() {
  const raw = process.env.EVER_JOBS_SAFE_SOURCES || '';
  return Array.from(new Set(raw.split(',').map(source => source.trim().toLowerCase()).filter(Boolean)));
}

function serviceUrl() {
  const raw = String(process.env.EVER_JOBS_API_URL || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const privateDockerHttp =
      process.env.EVER_JOBS_ALLOW_PRIVATE_HTTP === 'true'
      && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(url.hostname)
      && url.hostname !== 'localhost';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (loopback || privateDockerHttp))) return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function getJobSupplyServiceUrl() {
  return serviceUrl()?.toString() || null;
}

export function getJobSupplyConfiguration(): JobSupplyConfiguration {
  const enabled = process.env.EVER_JOBS_ENABLED === 'true';
  const url = serviceUrl();
  const hasApiKey = Boolean(String(process.env.EVER_JOBS_API_KEY || '').trim());
  const safeSources = configuredSources();
  const unsafeSources = safeSources.filter(source => !APPROVED_SAFE_SOURCE_SET.has(source));
  const missing: string[] = [];
  if (enabled && !url) missing.push('EVER_JOBS_API_URL');
  if (enabled && !hasApiKey) missing.push('EVER_JOBS_API_KEY');
  if (enabled && safeSources.length === 0) missing.push('EVER_JOBS_SAFE_SOURCES');
  if (unsafeSources.length > 0) missing.push('safe source policy');
  const configured = enabled && Boolean(url) && hasApiKey && safeSources.length > 0;

  return {
    enabled,
    configured,
    preparationConfigured: configured && unsafeSources.length === 0,
    serviceHost: url?.host || null,
    hasApiKey,
    safeSources,
    unsafeSources,
    missing,
  };
}

function baseResult(
  configuration: JobSupplyConfiguration,
  status: JobSupplyHealthStatus,
  message: string,
  checkedAt: string,
): JobSupplyHealthResult {
  return {
    ...configuration,
    status,
    preparationReady: status === 'healthy' && configuration.preparationConfigured,
    apiKeyProtectionVerified: false,
    checkedAt,
    latencyMs: null,
    endpoint: null,
    message,
  };
}

function responseLooksHealthy(body: unknown, endpoint: '/health' | '/ping') {
  if (!body || typeof body !== 'object') return false;
  const result = body as { status?: unknown; ok?: unknown; healthy?: unknown; success?: unknown };
  if (result.ok === false || result.healthy === false || result.success === false) return false;
  const status = String(result.status || '').toLowerCase();
  return endpoint === '/health' ? status === 'healthy' : status === 'pong';
}

async function readHealthResponse(response: Response) {
  const text = (await response.text()).slice(0, 16_000);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { status: text.slice(0, 120) };
  }
}

export async function probeJobSupplyHealth(options: ProbeOptions = {}): Promise<JobSupplyHealthResult> {
  const now = options.now || Date.now;
  const checkedAt = new Date(now()).toISOString();
  const configuration = getJobSupplyConfiguration();
  if (!configuration.enabled) {
    return baseResult(configuration, 'disabled', 'Ever Jobs is disabled. Scout fallback may run, but packet preparation is blocked.', checkedAt);
  }
  if (!configuration.preparationConfigured) {
    return baseResult(configuration, 'misconfigured', 'Ever Jobs configuration or safe-source policy is incomplete.', checkedAt);
  }
  if (!options.force && !options.fetchImpl && healthCache && healthCache.expiresAt > now()) {
    return healthCache.value;
  }

  const url = serviceUrl()!;
  const fetchImpl = options.fetchImpl || fetch;
  const startedAt = now();
  const headers = {
    Accept: 'application/json',
    'x-api-key': process.env.EVER_JOBS_API_KEY!,
  };

  try {
    let endpoint: '/health' | '/ping' = '/health';
    let response = await fetchImpl(new URL(endpoint, url).toString(), {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(options.timeoutMs || 5_000),
      cache: 'no-store',
    });
    if (response.status === 404) {
      endpoint = '/ping';
      response = await fetchImpl(new URL(endpoint, url).toString(), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(options.timeoutMs || 5_000),
        cache: 'no-store',
      });
    }
    const body = await readHealthResponse(response);
    const serviceHealthy = response.ok && responseLooksHealthy(body, endpoint);
    let apiKeyProtectionVerified = false;
    if (serviceHealthy) {
      const unauthenticatedResponse = await fetchImpl(new URL('/health', url).toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(options.timeoutMs || 5_000),
        cache: 'no-store',
      });
      apiKeyProtectionVerified = unauthenticatedResponse.status === 401 || unauthenticatedResponse.status === 403;
    }
    const healthy = serviceHealthy && apiKeyProtectionVerified;
    const result: JobSupplyHealthResult = {
      ...configuration,
      status: healthy ? 'healthy' : 'unhealthy',
      preparationReady: healthy,
      apiKeyProtectionVerified,
      checkedAt,
      latencyMs: Math.max(0, now() - startedAt),
      endpoint,
      message: healthy
        ? 'Ever Jobs primary supply is healthy, API-key protected, and safe-source preparation is enabled.'
        : serviceHealthy
          ? 'Ever Jobs responded, but API-key protection could not be verified.'
          : `Ever Jobs health check failed with HTTP ${response.status}.`,
    };
    if (!options.fetchImpl) healthCache = { expiresAt: now() + HEALTH_CACHE_MS, value: result };
    return result;
  } catch {
    const result: JobSupplyHealthResult = {
      ...configuration,
      status: 'unreachable',
      preparationReady: false,
      apiKeyProtectionVerified: false,
      checkedAt,
      latencyMs: Math.max(0, now() - startedAt),
      endpoint: '/health',
      message: 'Ever Jobs did not respond before the health timeout.',
    };
    if (!options.fetchImpl) healthCache = { expiresAt: now() + HEALTH_CACHE_MS, value: result };
    return result;
  }
}
