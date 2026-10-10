const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');
const {MockPacketFirestore} = require('./helpers/mock-packet-firestore');
const root=path.resolve(__dirname,'..');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'taco-packet-generation-'));
test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
const route=build({entryPoints:[path.join(root,'app/api/agent/apply-pipeline/route.ts')],outfile:path.join(directory,'route.cjs'),bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'isolated-generation',setup(builder){
  const mocks={
    'next/server':'export class NextRequest {} export const NextResponse={json:(value,init)=>Response.json(value,init)};',
    '@/lib/api-auth':'export async function guardApiRoute(){return {user:{uid:"generation-owner",tier:"studio"}};}',
    '@/lib/usage-tracker':'export async function checkUsageAllowed(){return {allowed:true};} export async function incrementUsage(){globalThis.__generation.usage++;}',
    '@/lib/ai/groq-client':'export async function groqJSONCompletion(){throw new Error("Provider must be mocked by guarded generation");}',
    '@/lib/firebase-admin':'export function getAdminDb(){return globalThis.__generation.db;}',
    '@/lib/monitor':'export const monitor={critical(){},info(){},error(){}};',
    '@/lib/career-twin':'export async function invalidateTwin(){}',
    '@/lib/server-resume':'export async function getLatestVerifiedResumeForUser(){return globalThis.__generation.source;} export async function getVerifiedResumeForUserById(){return globalThis.__generation.source;}',
    '@/lib/resume-morph-consent-server':'export async function getResumeMorphConsentForUser(){return {unlocked100:false};}',
    '@/lib/assistant/morph-draft-generation':`import {applyResumeMorphGuardrails} from '@/lib/resume-morph-guardrails'; export async function generateGuardedMorphDraft(input){const state=globalThis.__generation;state.generations++;if(state.duringGeneration)await state.duringGeneration();if(state.failProvider)throw new Error('Fixture provider unavailable');return applyResumeMorphGuardrails(input.resume,input.resume,input.access);}`,
    '@/lib/job-recommendation-platform':'export function getTrustedTalentJobApplyUrl(input){return input.url;} export async function loadRecommendationCalibrationEvidenceFromImpression(){return null;}',
  };
  builder.onResolve({filter:/^(?:@\/|next\/server$)/},args=>mocks[args.path]?{path:args.path,namespace:'mock'}:{path:path.join(root,args.path.slice(2)+'.ts')});
  builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
}}]}).then(()=>require(path.join(directory,'route.cjs')));
const userPath='users/generation-owner';
const sourcePath=`${userPath}/resume_versions/source`;
const input={jobTitle:'Designer',company:'Acme',jobDescription:'Design useful products with research.',jobId:'job-1',jobUrl:'https://example.test/careers/designer',sourceMeta:{canonicalUrl:'https://example.test/careers/designer',sourceName:'fixture'}};
function fixture(){
 const db=new MockPacketFirestore(); const resume={name:'Fixture person',title:'Designer',summary:'Research and product design.',skills:['Research'],experience:[{role:'Designer',company:'Example',bullets:['Improved an onboarding form.']}],education:[]};
 db.put(sourcePath,{content:resume,provenance:{verified:true,origin:'user_upload'}});
 const state={db,source:{resume,id:'source',source:'resume_versions'},generations:0,usage:0,failProvider:false,duringGeneration:null};globalThis.__generation=state;return state;
}
async function generate(overrides={}){const response=await(await route).POST({json:async()=>({...input,...overrides})});return {response,body:await response.json()};}

test('same URL, source and JD reuse the current packet without generation or usage twice',async()=>{
 const state=fixture(); const first=await generate(); assert.equal(first.response.status,200);assert.equal(first.body.packetStatus,'ready_for_review');
 const second=await generate();assert.equal(second.body.idempotent,true);assert.equal(second.body.applicationId,first.body.applicationId);assert.equal(state.generations,1);assert.equal(state.usage,1);
});

test('changed JD at the same stable URL makes a new revision and invalidates human review',async()=>{
 const state=fixture(); const first=await generate();const appPath=`${userPath}/applications/${first.body.applicationId}`;const old=state.db.records.get(appPath);
 state.db.put(appPath,{...old,human_review:{decision:'approved',revision:'old-review'},status:'applied',applied_at:'2026-09-25'});
 const second=await generate({jobDescription:'Build a different product with accessibility research.'});
 assert.equal(second.response.status,200);assert.equal(second.body.idempotent,undefined);assert.equal(second.body.applicationId,first.body.applicationId);assert.equal(state.generations,2);
 const next=state.db.records.get(appPath);assert.notEqual(next.packet_revision,old.packet_revision);assert.notEqual(next.packet_job_description_hash,old.packet_job_description_hash);assert.equal(next.human_review,null);assert.equal(next.status,'applied');assert.equal(next.applied_at,'2026-09-25');
});

test('a changed JD cannot recycle an earlier tailored draft after provider failure',async()=>{
 const state=fixture();const first=await generate();state.failProvider=true;
 const second=await generate({jobDescription:'A materially different job description'});
 assert.equal(second.body.applicationId,first.body.applicationId);assert.equal(second.body.packetStatus,'needs_attention');
 const record=state.db.records.get(`${userPath}/applications/${first.body.applicationId}`);assert.equal(record.morph_succeeded,false);assert.equal(record.resume_version_id,null);assert.equal(record.packet_generation_owner,null);
});

test('provider failure preserves a non-ready packet and releases its generation lease',async()=>{
 const state=fixture();state.failProvider=true;const result=await generate();
 assert.equal(result.response.status,200);assert.equal(result.body.packetStatus,'needs_attention');
 const record=state.db.records.get(`${userPath}/applications/${result.body.applicationId}`);assert.equal(record.packet_generation_owner,null);assert.equal(record.packet_generation_state,'needs_attention');
 state.failProvider=false;assert.equal((await generate()).body.packetStatus,'ready_for_review');
});

test('a newer generation owner cannot be overwritten or unlocked by the old request',async()=>{
 const state=fixture();state.duringGeneration=()=>{
  const appPath=[...state.db.records.keys()].find(key=>key.includes('/applications/'));
  state.db.put(appPath,{...state.db.records.get(appPath),packet_generation_owner:'newer-owner',packet_revision:'newer-revision'});
 };
 const result=await generate();assert.equal(result.response.status,500);
 const record=[...state.db.records.entries()].find(([key])=>key.includes('/applications/'))[1];
 assert.equal(record.packet_generation_owner,'newer-owner');assert.equal(record.packet_revision,'newer-revision');assert.equal(record.packet_status,'needs_attention');
});

test('source edits during generation leave the result blocked for fresh preparation',async()=>{
 const state=fixture();state.duringGeneration=()=>state.db.put(sourcePath,{...state.db.records.get(sourcePath),content:{...state.source.resume,summary:'Changed while preparing'}});
 const result=await generate();assert.equal(result.body.packetStatus,'needs_attention');
 const record=state.db.records.get(`${userPath}/applications/${result.body.applicationId}`);assert.equal(record.packet_generation_owner,null);assert.equal(record.human_review,null);
});

test('an active lease refuses a concurrent generation and an expired lease can recover',async()=>{
 const state=fixture();let release;const pause=new Promise(resolve=>{release=resolve;});let entered;const started=new Promise(resolve=>{entered=resolve;});
 state.duringGeneration=async()=>{entered();await pause;};
 const firstPromise=generate();await started;
 const second=await generate();assert.equal(second.response.status,409);assert.equal(second.body.code,'packet_busy');
 release();await firstPromise;
 const appPath=[...state.db.records.keys()].find(key=>key.includes('/applications/'));
 state.db.put(appPath,{...state.db.records.get(appPath),packet_status:'needs_attention',packet_generation_state:'running',packet_generation_owner:'expired-owner',packet_generation_lease_expires_at:'2020-01-01T00:00:00Z'});
 state.duringGeneration=null;assert.equal((await generate()).body.packetStatus,'ready_for_review');
});


test('a failure before artifact persistence cannot relabel old artifacts with the new JD',async()=>{
 const state=fixture();const first=await generate();const appPath=`${userPath}/applications/${first.body.applicationId}`;const previous=state.db.records.get(appPath);
 const originalDoc=state.db.doc.bind(state.db);let failRead=true;
 state.db.doc=key=>{const ref=originalDoc(key);if(key.endsWith(`/resume_versions/${previous.resume_version_id}`)){const get=ref.get;ref.get=async()=>{if(failRead){failRead=false;throw new Error('Fixture artifact read failed');}return get();};}return ref;};
 const changed={jobDescription:'A different set of duties'};
 assert.equal((await generate(changed)).response.status,500);
 assert.equal(state.db.records.get(appPath).packet_generation_owner,null);
 assert.equal(state.db.records.get(appPath).packet_job_description_hash,previous.packet_job_description_hash);
 state.failProvider=true;
 const retry=await generate(changed);assert.equal(retry.body.packetStatus,'needs_attention');
 assert.equal(state.db.records.get(appPath).resume_version_id,null);
});
