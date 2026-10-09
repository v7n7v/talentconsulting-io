const PROVIDERS = new Set(['fantastic', 'brightdata', 'apify']);
const REQUEST_TIMEOUT_MS = 110_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

function approvedOrigin(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('JOB_CATALOG_BASE_URL must be an explicit HTTPS origin.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new Error('JOB_CATALOG_BASE_URL must be an explicit HTTPS origin.');
  }
  return url.origin;
}

function selectedProvider(value) {
  const provider = String(value || 'fantastic').trim().toLowerCase();
  if (!PROVIDERS.has(provider)) throw new Error('JOB_CATALOG_PROVIDER is not supported.');
  return provider;
}

function safeReceipt(payload) {
  const statuses = new Set([
    'success', 'empty', 'disabled', 'pending', 'busy', 'partial', 'budget',
    'unavailable', 'malformed', 'timeout', 'rate_limited',
  ]);
  const status = statuses.has(payload?.status) ? payload.status : 'unavailable';
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return {
    provider: PROVIDERS.has(payload?.provider) ? payload.provider : 'unknown',
    status,
    enabled: payload?.enabled === true,
    complete: payload?.complete === true,
    records: count(payload?.records),
    closed: count(payload?.closed),
    requests: count(payload?.requests),
    ...(Number.isSafeInteger(payload?.retryAfterSeconds) && payload.retryAfterSeconds > 0
      ? { retryAfterSeconds: Math.min(86_400, payload.retryAfterSeconds) } : {}),
  };
}

async function triggerJobCatalog(options = {}) {
  const origin = approvedOrigin(options.baseUrl ?? process.env.JOB_CATALOG_BASE_URL);
  const provider = selectedProvider(options.provider ?? process.env.JOB_CATALOG_PROVIDER);
  const secret = String(options.secret ?? process.env.CRON_SECRET ?? '').trim();
  if (secret.length < 32) throw new Error('CRON_SECRET must contain at least 32 characters.');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable in this Node runtime.');

  let response;
  try {
    response = await fetchImpl(`${origin}/api/cron/job-catalog?provider=${encodeURIComponent(provider)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error('Job catalog trigger request failed.');
  }
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`Job catalog trigger failed (HTTP ${response.status}).`);
  }

  let text;
  try {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('response_body_missing');
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error('response_too_large');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    text = Buffer.concat(chunks).toString('utf8');
  } catch {
    throw new Error('Job catalog returned an unreadable response.');
  }
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error('Job catalog returned an invalid receipt.');
  }
  const receipt = safeReceipt(payload);
  if (receipt.status === 'unavailable'
    || receipt.status === 'malformed' || receipt.status === 'timeout' || receipt.status === 'rate_limited') {
    throw new Error(`Job catalog trigger failed (${receipt.status}; HTTP ${response.status}).`);
  }
  return receipt;
}

async function main() {
  const receipt = await triggerJobCatalog();
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Job catalog trigger failed.'}\n`);
    process.exitCode = 1;
  });
}

module.exports = { approvedOrigin, safeReceipt, selectedProvider, triggerJobCatalog };
