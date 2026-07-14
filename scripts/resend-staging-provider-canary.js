const { readSelectedStagingEnvFile } = require('./staging-env-file');

const RESEND_DOMAINS_URL = 'https://api.resend.com/domains';
const RESEND_WEBHOOKS_URL = 'https://api.resend.com/webhooks';
const REQUIRED_SENDING_DOMAIN = 'talentconsulting.io';
const REQUIRED_RESEND_RECEIPT_EVENTS = [
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.failed',
  'email.suppressed',
  'email.complained',
];

function argument(name, fallback = '') {
  const direct = process.argv.find(value => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function operational(value, prefix) {
  const normalized = String(value || '').trim();
  return normalized.length >= prefix.length + 4
    && normalized.startsWith(prefix)
    && !/(?:your[_-]?|replace[_-]?|change[_-]?me|placeholder|example|todo|\$\{)/i.test(normalized);
}

function expectedWebhookEndpoint(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase();
  if (!normalized || !/^[a-z0-9.-]+$/.test(normalized) || !normalized.includes('staging')) return null;
  return `https://${normalized}/api/webhooks/resend`;
}

function assessResendStagingConfiguration(env) {
  const webhookEndpoint = expectedWebhookEndpoint(env.STAGING_HOSTNAME);
  const errors = [];
  if (env.NODE_ENV !== 'production' || !webhookEndpoint) errors.push('environment:staging_required');
  if (!operational(env.RESEND_API_KEY, 're_')) errors.push('resend:key_missing_or_invalid');
  if (!operational(env.RESEND_WEBHOOK_SECRET, 'whsec_')) errors.push('resend:webhook_secret_missing_or_invalid');
  return { ready: errors.length === 0, errors, webhookEndpoint };
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

function listData(payload) {
  return payload && Array.isArray(payload.data) ? payload.data : null;
}

async function runReadOnlyResendProviderCanary({ env, readJson = getJson }) {
  const configuration = assessResendStagingConfiguration(env);
  if (!configuration.ready) {
    return { configuration, assessment: null, readOperations: [] };
  }
  const readOperations = ['resend.domains.list', 'resend.webhooks.list'];
  const headers = { authorization: `Bearer ${env.RESEND_API_KEY}` };
  const [domainPayload, webhookPayload] = await Promise.all([
    readJson(RESEND_DOMAINS_URL, headers).catch(() => null),
    readJson(RESEND_WEBHOOKS_URL, headers).catch(() => null),
  ]);
  const domains = listData(domainPayload);
  const webhooks = listData(webhookPayload);
  const apiKeyReady = domains !== null;
  const sendingDomainReady = Boolean(domains?.some(domain => (
    String(domain?.name || '').toLowerCase() === REQUIRED_SENDING_DOMAIN
    && domain?.status === 'verified'
    && domain?.capabilities?.sending === 'enabled'
  )));
  const matchingWebhooks = webhooks?.filter(webhook => webhook?.endpoint === configuration.webhookEndpoint) || [];
  const webhook = matchingWebhooks.length === 1 ? matchingWebhooks[0] : null;
  const webhookEnabled = webhook?.status === 'enabled';
  const eventSet = new Set(Array.isArray(webhook?.events) ? webhook.events : []);
  const webhookEventsReady = REQUIRED_RESEND_RECEIPT_EVENTS.every(event => eventSet.has(event));
  const errors = [];
  if (!apiKeyReady) errors.push('resend:key_verification_failed');
  if (apiKeyReady && !sendingDomainReady) errors.push('resend:sending_domain_unavailable');
  if (webhooks === null) errors.push('resend:webhook_inventory_unavailable');
  if (webhooks !== null && matchingWebhooks.length === 0) errors.push('resend:webhook_endpoint_missing');
  if (matchingWebhooks.length > 1) errors.push('resend:webhook_endpoint_ambiguous');
  if (webhook && !webhookEnabled) errors.push('resend:webhook_disabled');
  if (webhook && !webhookEventsReady) errors.push('resend:webhook_events_incomplete');
  return {
    configuration,
    assessment: {
      readyForSendCanary: errors.length === 0,
      errors,
      apiKeyReady,
      sendingDomainReady,
      webhookEndpointReady: Boolean(webhook && webhookEnabled && webhookEventsReady),
      requiredReceiptEvents: REQUIRED_RESEND_RECEIPT_EVENTS.length,
      providerReadsAttempted: readOperations.length,
      providerWritesAttempted: 0,
      emailsSent: 0,
    },
    readOperations,
  };
}

async function main() {
  const selected = readSelectedStagingEnvFile(argument('--staging-env-file', ''));
  if (!selected.env) {
    console.error('Resend staging provider canary blocked before provider reads:');
    console.error(`- ${selected.error}`);
    console.error('Provider reads attempted: 0');
    console.error('Provider writes attempted: 0');
    console.error('Emails sent: 0');
    process.exitCode = 1;
    return;
  }
  const result = await runReadOnlyResendProviderCanary({ env: selected.env });
  if (!result.configuration.ready) {
    console.error('Resend staging provider canary blocked before provider reads:');
    for (const error of result.configuration.errors) console.error(`- ${error}`);
    console.error('Provider reads attempted: 0');
    console.error('Provider writes attempted: 0');
    console.error('Emails sent: 0');
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(result.assessment, null, 2));
  if (!result.assessment.readyForSendCanary) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(() => {
    console.error('Resend staging provider canary failed: provider_read_failed');
    console.error('Provider writes attempted: 0');
    console.error('Emails sent: 0');
    process.exitCode = 1;
  });
}

module.exports = {
  REQUIRED_RESEND_RECEIPT_EVENTS,
  REQUIRED_SENDING_DOMAIN,
  RESEND_DOMAINS_URL,
  RESEND_WEBHOOKS_URL,
  assessResendStagingConfiguration,
  expectedWebhookEndpoint,
  listData,
  runReadOnlyResendProviderCanary,
};
