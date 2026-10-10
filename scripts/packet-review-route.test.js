const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');
const { MockPacketFirestore } = require('./helpers/mock-packet-firestore');
const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-packet-review-'));
test.after(() => fs.rmSync(directory, {recursive: true, force: true}));
const modules = Promise.all([
  ['route', 'app/api/agent/packet-review/route.ts'], ['review', 'lib/job-packet-review.ts'],
  ['guardrails', 'lib/resume-morph-guardrails.ts'], ['cover', 'lib/cover-letter-guardrails.ts'],
].map(async ([name, file]) => {
  const outfile = path.join(directory, `${name}.cjs`);
  await build({entryPoints: [path.join(root, file)], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', plugins: [{name:'mock-review-services',setup(builder) {
    const mocks = {
      'next/server': 'export class NextRequest {} export const NextResponse = {json: (value, init) => Response.json(value, init)};',
      '@/lib/api-auth': 'export async function guardApiRoute() { return globalThis.__reviewRoute.guard; }',
      '@/lib/firebase-admin': 'export function getAdminDb() { return globalThis.__reviewRoute.db; }',
    };
    builder.onResolve({filter:/^(?:@\/|next\/server$)/}, args => mocks[args.path] ? {path:args.path,namespace:'mock'} : {path:path.join(root,args.path.slice(2)+'.ts')});
    builder.onLoad({filter:/.*/,namespace:'mock'}, args=>({contents:mocks[args.path],loader:'js'}));
  }}]});
  return [name, require(outfile)];
})).then(Object.fromEntries);
const uid = 'review-owner';
const packetPath = `users/${uid}/agent_queue/packet`;
const sourcePath = `users/${uid}/resume_versions/source`;
const draftPath = `users/${uid}/resume_versions/draft`;

async function fixture() {
  const {guardrails, cover} = await modules;
  const db = new MockPacketFirestore();
  const source = {name:'Fixture person',title:'Designer',summary:'Research and product design.',skills:['Research'],experience:[{role:'Designer',company:'Example',bullets:['Improved an onboarding form.']}],education:[]};
  const hash = crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
  const access = guardrails.resolveResumeMorphAccess({requestedMorphPercentage:80,hasFullConsent:false,mode:'automated'});
  const draft = guardrails.applyResumeMorphGuardrails(source, source, access);
  const letter = cover.buildTruthLockedCoverLetter({resume:source,jobTitle:'Designer',company:'Acme',sourceResumeId:'source',sourceResumeHash:hash});
  db.put(sourcePath, {content:source,provenance:{verified:true,origin:'user_upload'}});
  db.put(draftPath, {content:draft.resume,guardrail_report:draft.report,source_resume_id:'source',source_resume_hash:hash});
  db.put(packetPath, {
    user_id:uid,job_title:'Designer',company:'Acme',job_url:'https://example.test/job',job_description:'Design products.',
    status:'pending',packetStatus:'prepared',generation_status:'prepared',source:'nightly_agent',
    morphed_resume:draft.resume,morph_guardrail_report:draft.report,morph_source_resume_id:'source',morph_source_resume_hash:hash,
    cover_letter:letter.content,cover_letter_succeeded:true,cover_letter_guardrail_report:letter.report,
    cover_letter_source_resume_id:'source',cover_letter_source_resume_hash:hash,resume_version_id:'draft',
    created_at:'2026-09-01T00:00:00Z',expires_at:'2099-01-01T00:00:00Z',
  });
  globalThis.__reviewRoute = {db,guard:{user:{uid,tier:'studio'}}};
  return db;
}
async function get(id='packet', kind='queue') {
  const response = await (await modules).route.GET({nextUrl:new URL(`http://localhost/api/agent/packet-review?kind=${kind}&id=${id}`)});
  return {response,body:await response.json()};
}
async function post(action, revision, extra={}) {
  const response = await (await modules).route.POST({json:async()=>({kind:'queue',id:'packet',action,revision,...extra})});
  return {response,body:await response.json()};
}

test('legacy approved flag has no review authority; current source-checked documents remain reviewable', async()=>{
  const db=await fixture(); db.put(packetPath,{...db.records.get(packetPath),status:'approved',packetStatus:'approved'});
  const {body}=await get();
  assert.equal(body.data[0].review_status,'needs_review'); assert.equal(body.data[0].status,'pending');
  assert.equal(body.data[0].review_ready,true); assert.deepEqual(body.data[0].review_resume,db.records.get(draftPath).content);
  assert.equal(db.records.get(packetPath).human_review,undefined);
});

test('actual approve endpoint saves exact binding once under concurrent requests',async()=>{
  const db=await fixture(); const revision=(await get()).body.data[0].review_revision;
  const results=await Promise.all([post('approve',revision),post('approve',revision)]);
  assert.ok(results.every(result=>result.response.status===200));
  assert.equal(results.filter(result=>result.body.idempotent).length,1);
  const receipt=db.records.get(packetPath).human_review;
  assert.equal(receipt.revision,revision); assert.equal(receipt.reviewed_by,uid);
  assert.equal(receipt.binding.source.id,'source');
  assert.equal((await get()).body.data[0].review_status,'approved');
});

for(const mutation of ['source','job','artifact','letter']) test(`${mutation} changes cannot inherit an earlier approval`,async()=>{
  const db=await fixture(); const revision=(await get()).body.data[0].review_revision;
  assert.equal((await post('approve',revision)).response.status,200);
  if(mutation==='source') db.put(sourcePath,{...db.records.get(sourcePath),content:{...db.records.get(sourcePath).content,summary:'Changed source'}});
  if(mutation==='job') db.put(packetPath,{...db.records.get(packetPath),job_description:'A different role description'});
  if(mutation==='artifact') db.put(draftPath,{...db.records.get(draftPath),content:{summary:'Different prepared draft'}});
  if(mutation==='letter') db.put(packetPath,{...db.records.get(packetPath),cover_letter:'Different letter'});
  const state=(await get()).body.data[0]; assert.equal(state.review_status,'stale'); assert.equal(state.status,'pending');
  const result=await post('track',revision); assert.equal(result.response.status,409); assert.equal(result.body.code,'review_stale');
  assert.equal(db.records.has(`users/${uid}/applications/agent_queue_packet`),false);
});

test('a source change racing approval is caught by transaction retry',async()=>{
  const db=await fixture(); const revision=(await get()).body.data[0].review_revision;
  db.beforeCommit=()=>{db.beforeCommit=null;db.put(sourcePath,{...db.records.get(sourcePath),content:{summary:'Changed concurrently'}});};
  const result=await post('approve',revision);
  assert.equal(result.response.status,409); assert.equal(result.body.code,'review_stale');
  assert.equal(db.records.get(packetPath).human_review,undefined);
});

test('tracking is atomic and idempotent, and preserves manual submission status',async()=>{
  const db=await fixture(); const revision=(await get()).body.data[0].review_revision;
  await post('approve',revision);
  const results=await Promise.all([post('track',revision),post('track',revision)]);
  assert.ok(results.every(result=>result.response.status===200));
  const appPath=`users/${uid}/applications/agent_queue_packet`;
  assert.equal(db.records.get(appPath).status,'not_applied'); assert.equal(db.records.get(appPath).applied_at,null);
  db.put(appPath,{...db.records.get(appPath),status:'applied',applied_at:'2026-09-25'});
  await post('track',revision);
  assert.equal(db.records.get(appPath).status,'applied'); assert.equal(db.records.get(appPath).applied_at,'2026-09-25');
});

test('failed or incomplete legacy packets cannot acquire a review receipt',async()=>{
  const db=await fixture(); db.put(packetPath,{...db.records.get(packetPath),cover_letter_guardrail_report:null});
  const state=(await get()).body.data[0]; assert.equal(state.review_ready,false);
  assert.equal((await post('approve',state.review_revision)).body.code,'packet_not_ready');
  assert.equal(db.records.get(packetPath).human_review,undefined);
});

test('protected actions require Max and owner scope while dismissal stays available',async()=>{
  const db=await fixture(); const revision=(await get()).body.data[0].review_revision;
  globalThis.__reviewRoute.guard.user.tier='pro';
  assert.equal((await post('approve',revision)).response.status,403);
  assert.equal((await post('dismiss')).response.status,200);
  globalThis.__reviewRoute.guard.user={uid:'someone-else',tier:'studio'};
  assert.equal((await post('approve',revision)).response.status,404);
  assert.equal(db.records.get(packetPath).status,'dismissed');
});

test('application review never changes its real-world application status',async()=>{
  const db=await fixture(); const queue=db.records.get(packetPath);
  db.put(`users/${uid}/applications/generated`,{...queue,company_name:queue.company,morph_succeeded:true,packet_status:'ready_for_review',ats_score:67,status:'applied'});
  const state=(await get('generated','application')).body.data[0];
  const result=await post('approve',state.review_revision,{kind:'application',id:'generated'});
  assert.equal(result.response.status,200);
  assert.equal(db.records.get(`users/${uid}/applications/generated`).status,'applied');
});

test('malformed and absent revisions cannot approve unseen documents',async()=>{
  await fixture();
  assert.equal((await post('approve')).body.code,'review_revision_required');
  assert.equal((await post('approve','a'.repeat(64))).body.code,'review_stale');
  assert.equal((await post('approve','a'.repeat(64),{id:'../other'})).response.status,400);
});
