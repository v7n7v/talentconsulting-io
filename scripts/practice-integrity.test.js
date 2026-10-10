const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
async function load(entry, extra = {}) {
 const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'practice-')), 'test.cjs');
 const mocks = {
  '@/lib/firebase-admin': `export const getAdminDb=()=>globalThis.practiceDB;`,
  '@/lib/usage-tracker': `export const FREE_CAPS={gauntlets:3,flashcards:3};`,
  '@/lib/server-resume': `export async function getVerifiedResumeForUserById(db,uid,id){ return {resume:globalThis.practiceSources[uid+'/'+id] || null}; }`,
  '@/lib/story-bank': `export async function getStoryBankStory(uid,id){return globalThis.practiceSources[uid+'/'+id] || null;}`,
  '@/lib/api-auth': `export async function guardApiRoute(){return {user:{uid:'alice',tier:'free'}}}`,
  '@/lib/ai/groq-client': `export async function groqJSONCompletion(){if(globalThis.practiceGrade instanceof Error)throw globalThis.practiceGrade;return globalThis.practiceGrade;}`,
  '@/lib/monitor': `export const monitor={critical(){},warn(){}}`,
  'next/server': `export class NextResponse extends Response{static json(body,init){return new Response(JSON.stringify(body),init)}}`, ...extra,
 };
 for (const key of Object.keys(mocks)) if (mocks[key] === null) delete mocks[key];
 await build({entryPoints:[path.join(__dirname,'..',entry)],outfile,bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'mocks',setup(b){for(const [id,contents]of Object.entries(mocks)){b.onResolve({filter:new RegExp('^'+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')},()=>({path:id,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({contents:mocks[path],loader:'js'}));}}}]});return require(outfile);
}
function db(seed={}) {
 const docs=new Map(Object.entries(seed)); let queue=Promise.resolve();
 const ref=p=>({path:p,id:p.split('/').pop(),collection:k=>ref(p+'/'+k),doc:k=>ref(p+'/'+k),get:async()=>({exists:docs.has(p),data:()=>docs.get(p)}),set:async(v)=>{docs.set(p,{...docs.get(p),...v})}});
 return {docs,collection:k=>ref(k),runTransaction(fn){const run=queue.then(()=>fn({get:r=>r.get(),set:(r,v)=>{docs.set(r.path,{...docs.get(r.path),...v})}}));queue=run.catch(()=>{});return run;}};
}
const helper=load('lib/practice-session-server.ts');
const gradeRoute=load('app/api/interview/session-grade/route.ts');
test('atomic allowance reserves exactly three concurrent free starts; paid stays unlimited',async()=>{
 const h=await helper;globalThis.practiceDB=db(Object.fromEntries(Array.from({length:6},(_,i)=>['users/alice/interview_sessions/s'+i,{mode:'quick_drill'}])));
 const runs=await Promise.allSettled(Array.from({length:4},(_,i)=>h.claimPractice('alice','s'+i,'free','generation')));
 assert.equal(runs.filter(x=>x.status==='fulfilled').length,3);assert.equal(globalThis.practiceDB.docs.get('users/alice/usage/lifetime').gauntlets,3);
 await h.claimPractice('alice','s4','pro','generation');await h.claimPractice('alice','s5','studio','generation');
});
test('retry releases lease without refund; same session cached output costs one use; cards separate',async()=>{
 const h=await helper;globalThis.practiceDB=db({'users/alice/interview_sessions/a':{mode:'quick_drill'},'users/alice/interview_sessions/b':{mode:'study_cards'}});
 const first=await h.claimPractice('alice','a','free','generation');await assert.rejects(h.claimPractice('alice','a','free','generation'),/BUSY/);
 await h.releasePractice(first,'generation');const retry=await h.claimPractice('alice','a','free','generation');await h.finishPractice(retry,'generation',{questions:['q']},{rubric:['q']});
 assert.deepEqual((await h.claimPractice('alice','a','free','generation')).cached,{questions:['q']});assert.equal(globalThis.practiceDB.docs.get('users/alice/usage/lifetime').gauntlets,1);
 await h.claimPractice('alice','b','free','generation');assert.equal(globalThis.practiceDB.docs.get('users/alice/usage/lifetime').flashcards,1);
});
test('lease expiry recovers interrupted start; stale worker cannot persist',async()=>{
 const h=await helper;globalThis.practiceDB=db({'users/alice/interview_sessions/a':{mode:'quick_drill'}});const old=await h.claimPractice('alice','a','free','generation');globalThis.practiceDB.docs.get('users/alice/practice_receipts/a').generation.expiresAt=0;
 const fresh=await h.claimPractice('alice','a','free','generation');await assert.rejects(h.finishPractice(old,'generation',{},{}),/STALE/);await h.finishPractice(fresh,'generation',{questions:['fresh']},{});assert.equal(globalThis.practiceDB.docs.get('users/alice/usage/lifetime').gauntlets,1);
});
test('grade requires owned server receipt, rejects malformed output, retains transcript on outage',async()=>{
 const route=await gradeRoute;const request=body=>({json:async()=>body});globalThis.practiceSources={};globalThis.practiceDB=db({'users/alice/interview_sessions/a':{mode:'quick_drill',usageReserved:true}});
 assert.equal((await route.POST(request({transcript:[{role:'user',text:'answer'}]}))).status,400);
 assert.equal((await route.POST(request({sessionId:'a',transcript:[{role:'user',text:'answer'}]}))).status,403);
 await (await helper).claimPractice('alice','a','free','generation');globalThis.practiceGrade=new Error('offline');assert.equal((await route.POST(request({sessionId:'a',transcript:[{role:'user',text:'answer'}]}))).status,503);
 assert.equal(globalThis.practiceDB.docs.get('users/alice/interview_sessions/a').transcript[0].text,'answer');globalThis.practiceGrade={score:88,summary:'bad incomplete response'};assert.equal((await route.POST(request({sessionId:'a',transcript:[{role:'user',text:'answer'}]}))).status,503);
});
test('source resolver loads owner content and rejects foreign ids',async()=>{
 const h=await helper;globalThis.practiceSources={'alice/r':{summary:'Confirmed resume'},'alice/s':{title:'My story',action:'Built API',result:'Reduced time'}};
 const actual=await h.resolvePracticeEvidence('alice',{resumeVersionId:'r',selectedStoryIds:['s']});assert.equal(actual.resume.summary,'Confirmed resume');assert.equal(actual.stories[0].action,'Built API');await assert.rejects(h.resolvePracticeEvidence('bob',{resumeVersionId:'r'}),/UNAVAILABLE/);
});
const storyMocks={
 '@/lib/story-bank':null,
 '@/lib/ai/writing-model-router':`export async function writingJSONCompletion(){if(globalThis.storyOutput instanceof Error)throw globalThis.storyOutput;return {result:globalThis.storyOutput}}`,
};
const storyQuality=load('app/api/agent/stories/quality/route.ts',storyMocks);
const storyExtract=load('app/api/agent/stories/extract/route.ts',storyMocks);
const vaultItem=load('app/api/vault/item/[id]/route.ts');
test('real story quality helper is owner-scoped and fallback is explicitly not factual verification',async()=>{
 globalThis.practiceDB=db({'users/alice/agent_stories/a':{title:'Shipping',situation:'Release blocked',action:'I fixed the build pipeline',task:'Restore the release',result:'Saved 3 hours'},'users/bob/agent_stories/private':{title:'Private story',situation:'secret'}});
 globalThis.storyOutput=new Error('provider unavailable');const route=await storyQuality;
 assert.equal((await route.POST({json:async()=>({storyId:'private'})})).status,404);
 const response=await route.POST({json:async()=>({storyId:'a'})});assert.equal(response.status,200);const value=await response.json();assert.match(value.provenance,/not factual verification/);assert.ok(Array.isArray(value.report.suggestedImprovements));
});
test('real extraction helper returns review drafts without creating stories and rejects malformed model output',async()=>{
 globalThis.practiceDB=db({});globalThis.storyOutput={stories:[{title:'Release',situation:'Blocked deploy',task:'Restore',action:'Fixed pipeline',result:'Saved 3 hours',confidence:0}]};const route=await storyExtract;
 let response=await route.POST({json:async()=>({sourceType:'debrief',text:'I fixed a pipeline; saved 3 hours.'})});assert.equal(response.status,200);const value=await response.json();assert.equal(value.saved,false);assert.equal(value.stories[0].confidence,0);assert.equal(globalThis.practiceDB.docs.size,0);
 globalThis.storyOutput={stories:[{title:{malformed:true}}]};response=await route.POST({json:async()=>({text:'A real accomplishment'})});assert.equal(response.status,503);
});
test('vault detail returns exact saved owned content and rejects another owner',async()=>{
 globalThis.practiceDB=db({'study_vault/a':{userId:'alice',title:'Saved deck',content:'Exact saved content',type:'flashcards'},'study_vault/b':{userId:'bob',title:'Private',content:'secret'}});const route=await vaultItem;
 const allowed=await route.GET({}, {params:Promise.resolve({id:'a'})});assert.equal(allowed.status,200);assert.match(JSON.stringify(await allowed.json()),/Exact saved content/);
 assert.equal((await route.GET({}, {params:Promise.resolve({id:'b'})})).status,404);
});
