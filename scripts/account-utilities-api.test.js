const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

async function loadRoute(entry, mocks, prefix) {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  const outfile = path.join(outdir, 'route.cjs');
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', plugins: [{
    name: `${prefix}-mocks`, setup(api) {
      for (const [specifier, contents] of Object.entries(mocks)) {
        const key = `${prefix}-${specifier.replace(/[^a-z0-9]/gi, '-')}`;
        const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        api.onResolve({ filter: new RegExp(`^${escaped}$`) }, () => ({ path: key, namespace: 'mock' }));
        api.onLoad({ filter: new RegExp(`^${key}$`), namespace: 'mock' }, () => ({ contents, loader: 'js' }));
      }
    },
  }] });
  return require(outfile);
}

const profileRoute = loadRoute('app/api/profile/route.ts', {
  'next/server': `export class NextResponse extends Response { static json(v, i={}) { return new Response(JSON.stringify(v), { ...i, headers: {'Content-Type':'application/json'} }); } }`,
  '@/lib/api-auth': `export async function guardApiRoute() { return globalThis.__accountMocks.guard; }`,
  '@/lib/firebase-admin': `export function getAdminDb() { return globalThis.__accountMocks.db; }`,
}, 'profile-route');

function responseBody(response) { return response.json(); }
function profileRequest(body = {}) { return { json: async () => body }; }
function profileDb(initial = {}, fail = false) {
  const docs = new Map(Object.entries(initial));
  return { collection: () => ({ doc: (uid) => ({
    async get() { if (fail) throw new Error('read failed'); return { data: () => docs.get(uid) }; },
    async set(value) { if (fail) throw new Error('write failed'); docs.set(uid, { ...(docs.get(uid) || {}), ...value }); },
  }) }), docs };
}

test('profile API reads and writes only the authenticated owner record', async () => {
  const route = await profileRoute;
  const db = profileDb({ alice: { phone: '111', bio: 'A' }, bob: { phone: '222', bio: 'B' } });
  globalThis.__accountMocks = { db, guard: { error: null, user: { uid: 'alice' } } };
  let response = await route.GET(profileRequest());
  assert.deepEqual(await responseBody(response), { profile: { phone: '111', bio: 'A' } });
  globalThis.__accountMocks.guard.user.uid = 'bob';
  response = await route.PATCH(profileRequest({ phone: '999', bio: 'updated' }));
  assert.equal(response.status, 200);
  assert.equal(db.docs.get('alice').phone, '111');
  assert.equal(db.docs.get('bob').phone, '999');
});

test('profile API rejects oversized fields and reports persistence failures', async () => {
  const route = await profileRoute;
  globalThis.__accountMocks = { db: profileDb(), guard: { error: null, user: { uid: 'alice' } } };
  let response = await route.PATCH(profileRequest({ phone: 'x'.repeat(101) }));
  assert.equal(response.status, 400);
  response = await route.PATCH(profileRequest({ bio: 'x'.repeat(2001) }));
  assert.equal(response.status, 400);
  globalThis.__accountMocks.db = profileDb({}, true);
  response = await route.PATCH(profileRequest({ phone: '555' }));
  assert.equal(response.status, 503);
  assert.match((await responseBody(response)).error, /could not be saved/i);
});


const feedbackRoute = loadRoute('app/api/feedback/route.ts', {
  'next/server': `export class NextResponse extends Response { static json(v, i={}) { return new Response(JSON.stringify(v), { ...i, headers: {'Content-Type':'application/json'} }); } } export function after() {}`,
  '@/lib/api-auth': `export async function guardApiRoute() { return globalThis.__accountMocks.guard; }`,
  '@/lib/firebase-admin': `export function getAdminDb() { return globalThis.__accountMocks.db; }`,
  '@/lib/monitor': `export const monitor = { info(){}, critical(){} };`,
  '@/lib/email/outbox': `export async function enqueueEmail() { if (globalThis.__accountMocks.emailFailure) throw new Error('queue failed'); return {created:true}; }`,
  '@/lib/observability/recorder': `export async function recordObservabilitySafely() {}`,
  '@/lib/observability/config': `export function observabilityNoticeVersion() { return 'notice'; } export function observabilitySurfaceAvailable() { return false; }`,
  '@/lib/observability/diagnostics': `export function prepareDiagnosticCase() { return null; }`,
}, 'feedback-route');
function feedbackDb(fail=false) {
  const writes=[]; let sequence=0;
  const collection = path => ({ doc: (id=String(++sequence)) => ({ id, path: path+'/'+id, collection: name => collection(path+'/'+id+'/'+name) }) });
  return { writes, collection, async runTransaction(callback) { if(fail) throw new Error('store failed'); return callback({ create(ref,data){writes.push({path:ref.path,data});} }); } };
}

test('loaded feedback handler preserves 2000, 2001, and 5000 characters in every canonical record', async () => {
  delete process.env.DISCORD_FEEDBACK_WEBHOOK_URL;
  const route=await feedbackRoute;
  for(const length of [2000,2001,5000]) {
    const db=feedbackDb();
    globalThis.__accountMocks={ db, guard:{user:{uid:'alice',email:'alice@example.test',tier:'pro'}} };
    const message='x'.repeat(length);
    const response=await route.POST(profileRequest({message,category:'general'}));
    assert.equal(response.status,200);
    assert.equal(db.writes.length,3);
    for(const write of db.writes) assert.equal(write.data.message,message);
    assert.ok((await response.json()).caseId);
  }
});

test('feedback handler rejects oversize reports and handles saved feedback/email failure as partial success', async () => {
  const route=await feedbackRoute;
  const db=feedbackDb();
  globalThis.__accountMocks={db,emailFailure:true,guard:{user:{uid:'alice',email:'alice@example.test',tier:'pro'}}};
  let response=await route.POST(profileRequest({message:'x'.repeat(5001)}));
  assert.equal(response.status,400); assert.equal(db.writes.length,0);
  response=await route.POST(profileRequest({message:'Full bug report',category:'bug',diagnosticsRequested:true,diagnosticsNoticeVersion:'notice'}));
  const result=await response.json();
  assert.equal(response.status,200); assert.equal(result.success,true); assert.equal(result.emailQueued,false);
  assert.equal(result.diagnosticsAttached,false); assert.match(result.deliveryWarning,/saved/);
  assert.equal(db.writes[0].data.diagnosticsState,'unavailable');
  globalThis.__accountMocks.db=feedbackDb(true);
  response=await route.POST(profileRequest({message:'A valid report'}));
  assert.equal(response.status,503);
});
