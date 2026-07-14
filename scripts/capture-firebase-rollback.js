const fs = require('node:fs');
const { GoogleAuth } = require('google-auth-library');

const PROJECT = 'talent-consulting-acf16';
const SITE = 'talent-consulting-acf16';
const REGION = 'us-east1';
const SERVICE = 'ssrtalentconsultingacf1';

function serviceAccount() {
  const source = fs.readFileSync('.env.local', 'utf8');
  const line = source.split(/\r?\n/).find(item => item.startsWith('FIREBASE_SERVICE_ACCOUNT_JSON='));
  if (!line) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing.');
  let value = line.slice(line.indexOf('=') + 1).trim();
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) value = value.slice(1, -1);
  const account = JSON.parse(value);
  if (account?.project_id !== PROJECT || account?.type !== 'service_account') throw new Error('Production service account project mismatch.');
  return account;
}

async function main() {
  const auth = new GoogleAuth({ credentials: serviceAccount(), scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const [hostingResult, serviceResult] = await Promise.allSettled([
    client.request({ url: `https://firebasehosting.googleapis.com/v1beta1/sites/${SITE}/releases?pageSize=1` }),
    client.request({ url: `https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/services/${SERVICE}` }),
  ]);
  if (hostingResult.status !== 'fulfilled') throw hostingResult.reason;
  const release = hostingResult.value.data?.releases?.[0] || null;
  const versionDetail = release?.version?.name
    ? await client.request({ url: `https://firebasehosting.googleapis.com/v1beta1/${release.version.name}` }).then(response => response.data)
    : null;
  const runRewrite = Array.isArray(versionDetail?.config?.rewrites)
    ? versionDetail.config.rewrites.find(rewrite => rewrite?.run)
    : null;
  const backend = serviceResult.status === 'fulfilled' ? serviceResult.value.data || {} : null;
  console.log(JSON.stringify({
    capturedAt: new Date().toISOString(),
    project: PROJECT,
    hosting: release ? {
      name: release.name || null,
      version: release.version?.name || null,
      releaseTime: release.releaseTime || null,
      runTarget: runRewrite?.run ? {
        serviceId: runRewrite.run.serviceId || null,
        region: runRewrite.run.region || null,
        pinTag: runRewrite.run.pinTag || null,
      } : null,
    } : null,
    backend: backend
      ? { service: backend.name || null, latestReadyRevision: backend.latestReadyRevision || null, latestCreatedRevision: backend.latestCreatedRevision || null, uri: backend.uri || null }
      : { service: `projects/${PROJECT}/locations/${REGION}/services/${SERVICE}`, latestReadyRevision: null, latestCreatedRevision: null, uri: null, captureStatus: 'permission_denied' },
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
