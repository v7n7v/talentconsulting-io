const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-packet-access-'));
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
const route = build({
  entryPoints: [path.join(root, 'app/api/agent/apply-pipeline/route.ts')],
  outfile: path.join(directory, 'route.cjs'), bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
  plugins: [{ name: 'isolated-packet-services', setup(builder) {
    const unavailable = name => `export function ${name}() { globalThis.__packetAccess.sideEffects++; throw new Error('Unexpected service: ${name}'); }`;
    const mocks = {
      'next/server': `export class NextRequest {} export const NextResponse = { json: (value, init) => Response.json(value, init) };`,
      '@/lib/api-auth': `export async function guardApiRoute() { return globalThis.__packetAccess.guard; }`,
      '@/lib/usage-tracker': `export async function checkUsageAllowed() { globalThis.__packetAccess.usageChecks++; return {allowed: globalThis.__packetAccess.allowed}; } ${unavailable('incrementUsage')}`,
      '@/lib/ai/groq-client': unavailable('groqJSONCompletion'),
      '@/lib/firebase-admin': unavailable('getAdminDb'),
      '@/lib/monitor': `export const monitor = { info() {}, error() {}, critical() {} };`,
      '@/lib/career-twin': unavailable('invalidateTwin'),
      '@/lib/server-resume': `${unavailable('getLatestVerifiedResumeForUser')} ${unavailable('getVerifiedResumeForUserById')}`,
      '@/lib/resume-morph-consent-server': unavailable('getResumeMorphConsentForUser'),
      '@/lib/assistant/morph-draft-generation': unavailable('generateGuardedMorphDraft'),
      '@/lib/job-recommendation-platform': `${unavailable('getTrustedTalentJobApplyUrl')} ${unavailable('loadRecommendationCalibrationEvidenceFromImpression')}`,
    };
    builder.onResolve({filter: /^(?:@\/|next\/server$)/}, args => mocks[args.path]
      ? {path: args.path, namespace: 'isolated'}
      : {path: path.join(root, args.path.slice(2) + '.ts')});
    builder.onLoad({filter: /.*/, namespace: 'isolated'}, args => ({contents: mocks[args.path], loader: 'js'}));
  }}],
}).then(() => require(path.join(directory, 'route.cjs')));

function state(tier, allowed = true) {
  globalThis.__packetAccess = {guard: {user: {uid: 'fixture-owner', tier}}, allowed, usageChecks: 0, sideEffects: 0};
  return globalThis.__packetAccess;
}

for (const tier of ['free', 'pro']) test(`${tier} cannot generate a prepared packet through the direct endpoint`, async () => {
  const calls = state(tier);
  const response = await (await route).POST({json: async () => ({jobTitle:'Designer', company:'Example'})});
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.code, 'packet_upgrade_required');
  assert.match(body.recovery.message, /Max/);
  assert.equal(calls.usageChecks, 0);
  assert.equal(calls.sideEffects, 0);
});

for (const tier of ['studio', 'god']) test(`${tier} reaches normal input validation without calling providers`, async () => {
  const calls = state(tier);
  const response = await (await route).POST({json: async () => ({})});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'packet_input_invalid');
  assert.equal(calls.usageChecks, 1);
  assert.equal(calls.sideEffects, 0);
});

test('Max usage exhaustion stays separate from plan access', async () => {
  const calls = state('studio', false);
  const response = await (await route).POST({json: async () => ({})});
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'packet_limit_reached');
  assert.equal(calls.sideEffects, 0);
});

test('authentication failure is preserved before any entitlement or service work', async () => {
  const calls = state('studio');
  calls.guard = {error: Response.json({requiresAuth: true}, {status: 401})};
  const response = await (await route).POST({json: async () => ({})});
  assert.equal(response.status, 401);
  assert.equal(calls.usageChecks, 0);
  assert.equal(calls.sideEffects, 0);
});
