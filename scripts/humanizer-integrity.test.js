const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');const os=require('node:os');const {build}=require('esbuild');
const root=path.resolve(__dirname,'..');
const state={docs:new Map(),calls:0,result:null,options:[],queue:Promise.resolve(),errorPaths:[]};global.__writingIntegrity=state;
function ref(location){return {path:location,collection:n=>ref(location+'/'+n),doc:n=>ref(location+'/'+n),async get(){if(state.errorPaths.includes(location))throw Error('Injected storage outage');const d=state.docs.get(location);return {exists:!!d,data:()=>d}},async set(value,opt){const next=opt?.merge?{...state.docs.get(location)}:{};for(const [key,v] of Object.entries(value))next[key]=v?.__increment!==undefined?Number(next[key]||0)+v.__increment:v;state.docs.set(location,next)},async update(value){return this.set(value,{merge:true})}}}
state.db={collection:n=>ref(n),runTransaction(fn){const task=state.queue.then(()=>fn({get:r=>r.get(),set:(r,d,o)=>r.set(d,o),update:(r,d)=>r.update(d)}));state.queue=task.catch(()=>{});return task;}};
const usage='users/owner/usage/writing_monthly',life='users/owner/usage/lifetime';const receipt=id=>usage+'/receipts/'+id;let m;
const source='I wrote tests for the release and documented defects so my colleagues could review the changes.';
const result=rewritten=>({rewritten,changes:[],stats:{sentenceLengthStdDev:2,bannedWordsRemoved:0,burstinessRange:2}});
test.before(async()=>{const outfile=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'writing-integrity-')),'modules.cjs');await build({stdin:{contents:"export * from './lib/usage-tracker'; export * from './lib/writing-quality'; export {detectAI} from './lib/ai-detection'; export {POST as humanize} from './app/api/writing/humanize/route'; export {POST as deepScan} from './app/api/writing/deep-detect/route'; export {POST as publicHumanize} from './app/api/writing/humanize-free/route';",resolveDir:root},outfile,bundle:true,platform:'node',format:'cjs',plugins:[{name:'controlled-io',setup(b){b.onResolve({filter:/^(next\/server|firebase-admin\/firestore|@\/lib\/(firebase-admin|api-auth|monitor|pricing-tiers|rate-limit|turnstile))$/},a=>({path:a.path,namespace:'mock'}));b.onResolve({filter:/^\.\/(groq-client|openrouter-client)$/},a=>({path:a.path,namespace:'provider'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='next/server'?'export const NextResponse={json:(data,init)=>new Response(JSON.stringify(data),init)}':a.path==='firebase-admin/firestore'?'export const FieldValue={increment:n=>({__increment:n}),serverTimestamp:()=>new Date().toISOString()}':a.path.endsWith('firebase-admin')?'export function getAdminDb(){return global.__writingIntegrity.db}':a.path.endsWith('api-auth')?'export async function authenticateRequest(){return {uid:"owner",email:"owner@example.test"}} export async function guardApiRoute(req,options){global.__writingIntegrity.options.push(options);return {user:{uid:"owner",tier:"free"}}}':a.path.endsWith('pricing-tiers')?'export async function getUserTier(){return "free"}':a.path.endsWith('rate-limit')?'export async function checkRateLimit(){return {allowed:true}}':a.path.endsWith('turnstile')?'export async function verifyTurnstile(){return true}':'export const monitor={critical(){},info(){},warn(){}}'}));b.onLoad({filter:/.*/,namespace:'provider'},()=>({contents:'export const GROQ_MODEL="mock";export const WRITING_MODELS={verifier:"mock1",premiumFallback:"mock2",qwenFallback:"mock3"};async function run(){const s=global.__writingIntegrity;s.calls++;if(s.result instanceof Error)throw s.result;return typeof s.result==="function"?s.result():s.result} export const groqJSONCompletion=run;export const openRouterJSONCompletion=run;'}));}}]});m=require(outfile);});
test.beforeEach(()=>{state.docs.clear();state.calls=0;state.result=result(source);state.options=[];state.queue=Promise.resolve();state.errorPaths=[];});
const request=(payload)=>new Request('http://localhost/api/writing/humanize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
const id='11111111-1111-4111-8111-111111111111';
const month=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};

test('atomic reservations enforce concurrent word boundary and free run boundary',async()=>{
 let values=await Promise.all(['request01','request02'].map(v=>m.reserveWritingWords('owner','free',300,v,v)));assert.equal(values.filter(v=>v.allowed).length,1);assert.equal(state.docs.get(usage).usedWords,300);
 state.docs.clear();values=await Promise.all(['request01','request02','request03','request04'].map(v=>m.reserveWritingWords('owner','free',10,v,v)));assert.equal(values.filter(v=>v.allowed).length,3);assert.equal(state.docs.get(life).writingTools,3);
});
test('exact successful route replay works at cap without another provider call or charge',async()=>{
 state.docs.set(usage,{month:month(),usedWords:500-m.countWords(source)});state.docs.set(life,{writingTools:2});
 const first=await m.humanize(request({text:source,requestId:id}));assert.equal(first.status,200);const payload=await first.json();const calls=state.calls;
 const second=await m.humanize(request({text:source,requestId:id}));assert.equal(second.status,200);assert.deepEqual(await second.json(),payload);assert.equal(state.calls,calls);assert.equal(state.docs.get(usage).usedWords,500);assert.equal(state.docs.get(life).writingTools,3);assert(state.options.every(value=>value.skipUsageCap));
});
test('receipt payload binding rejects reused id and does not refund successful work',async()=>{
 assert.equal((await m.humanize(request({text:source,requestId:id}))).status,200);const charged=state.docs.get(usage).usedWords;
 assert.equal((await m.humanize(request({text:source+' Extra context.',requestId:id}))).status,409);assert.equal(state.docs.get(usage).usedWords,charged);assert.equal(state.docs.get(receipt(id)).status,'success');
});
test('invalid target indices reject before reserving or invoking a provider',async()=>{
 const response=await m.humanize(request({text:source,rewriteScope:'flagged_paragraphs',paragraphIndices:[3],requestId:id}));assert.equal(response.status,400);assert.equal(state.docs.size,0);assert.equal(state.calls,0);
});
test('failed provider refunds words and runs; retry same payload succeeds once',async()=>{
 state.result=Error('Controlled unavailable');assert.equal((await m.humanize(request({text:source,requestId:id}))).status,500);assert.equal(state.docs.get(usage).usedWords,0);assert.equal(state.docs.get(life).writingTools,0);
 state.result=result(source);assert.equal((await m.humanize(request({text:source,requestId:id}))).status,200);assert.equal(state.docs.get(usage).usedWords,m.countWords(source));assert.equal(state.docs.get(life).writingTools,1);
});
test('prior month failure cannot refund current usage; retry charges in current month',async()=>{
 const first=await m.reserveWritingWords('owner','free',40,'monthly01','same');state.docs.get(receipt('monthly01')).month='2000-01';state.docs.set(usage,{month:month(),usedWords:100});await m.settleWritingWords('owner','monthly01','failed',undefined,first.leaseToken);assert.equal(state.docs.get(usage).usedWords,100);
 const retried=await m.reserveWritingWords('owner','free',40,'monthly01','same');assert.equal(retried.allowed,true);assert.equal(state.docs.get(usage).usedWords,140);
});
test('expired lease recovers without double charge and old worker cannot settle replacement',async()=>{
 const first=await m.reserveWritingWords('owner','free',40,'expired01','same');state.docs.get(receipt('expired01')).leaseExpiresAt=0;
 const second=await m.reserveWritingWords('owner','free',40,'expired01','same');assert.equal(second.allowed,true);assert.notEqual(second.leaseToken,first.leaseToken);assert.equal(state.docs.get(usage).usedWords,40);assert.equal(state.docs.get(life).writingTools,1);
 await assert.rejects(m.settleWritingWords('owner','expired01','success',{},first.leaseToken),/LEASE_LOST/);await m.settleWritingWords('owner','expired01','success',{exact:'saved'},second.leaseToken);
});
test('full scope rejects patches-only and missing stats; targeted scope rejects outside or missing patches',async()=>{
 for(const bad of [{patches:[{paragraphIndex:0,rewritten:source,reason:'edit'}],changes:[],stats:result(source).stats},{rewritten:source,changes:[]}]){state.result=bad;assert.equal((await m.humanize(request({text:source,requestId:id}))).status,500);assert.equal(state.docs.get(usage).usedWords,0);}
 state.result={patches:[{paragraphIndex:1,rewritten:source,reason:'edit'}],changes:[],stats:result(source).stats};assert.equal((await m.humanize(request({text:source,rewriteScope:'flagged_paragraphs',paragraphIndices:[0],requestId:'22222222-2222-4222-8222-222222222222'}))).status,500);assert.equal(state.docs.get(usage).usedWords,0);
});
test('targeted rewrite preserves unselected source bytes including spaces smart quotes and injection-like prose',async()=>{
 const original='  “The system:  records tests,” I said, with care.  \r\n\r\n'+source+'\r\n\r\n  Final  untouched paragraph.  ';
 state.result={patches:[{paragraphIndex:1,rewritten:source,reason:'Preserve source'}],changes:[],stats:result(source).stats};
 const response=await m.humanize(request({text:original,rewriteScope:'flagged_paragraphs',paragraphIndices:[1],requestId:id}));assert.equal(response.status,200);assert.equal((await response.json()).rewritten,original);
});
test('seven harmful semantic corpus rewrites never return all-clear',()=>{
 const cases=[['I did not lead the migration because my role focused on testing and documenting defects.','I led the migration because my role focused on testing and documenting defects.'],['I reduced deployment failures by 12% through careful testing and clearer release instructions.','I reduced deployment failures by 92% through careful testing and clearer release instructions.'],['I reduced request latency from 120 ms to 80 ms after fixing a database query.','I reduced request latency from 920 ms to 10 ms after fixing a database query.'],['The report states "no causal effect was demonstrated" after reviewing the trial data [1].','The report states "a strong causal effect was demonstrated" after reviewing the trial data [1].'],['I mentored Jane Smith while Alex Jones managed the release and reviewed every production change.','I mentored Alex Jones while Jane Smith managed the release and reviewed every production change.'],['I used Python at Microsoft to write tests and maintain internal tools for colleagues.','I used Java at Google to write tests and maintain internal tools for colleagues.'],['I saved $10 by reviewing monthly charges and cancelling a service our team never used.','I saved $100 by reviewing monthly charges and cancelling a service our team never used.']];
 for(const [originalText,rewrittenText] of cases){const quality=m.evaluateHumanizationQuality({originalText,rewrittenText,protectedTerms:m.extractProtectedTerms(originalText),lengthMode:'exact',originalDetection:m.detectAI(originalText),finalDetection:m.detectAI(rewrittenText)});assert.notEqual(quality.decision,'accepted');assert.equal(quality.gates.find(g=>g.id==='meaning_review').status,'warn');}
 assert(m.extractProtectedTerms('Reduced errors by 35% while saving costs.').includes('35%'));assert.deepEqual(m.missingProtectedTerms('$100',['$10']),['$10']);
});
test('unusable deep scan responses produce no confidence and never charge',async()=>{
 const text='I wrote detailed tests for the release before it went live. My colleagues reviewed every change and recorded each known defect. We kept the notes together so another engineer could repeat the checks.';
 for(const completions of [[],['one'],['','',''],['...','***','___']]){state.result={completions};const response=await m.deepScan(request({text}));const body=await response.json();assert.equal(response.status,503);assert.equal(body.humanConfidence,null);assert.equal(state.docs.has(life),false);}
});


test('public authenticated Humanizer replays the final free run exactly at cap',async()=>{
 state.docs.set(usage,{month:month(),usedWords:500-m.countWords(source)});state.docs.set(life,{writingTools:2});
 const first=await m.publicHumanize(request({text:source,requestId:id}));assert.equal(first.status,200);const body=await first.json(),calls=state.calls;
 const second=await m.publicHumanize(request({text:source,requestId:id}));assert.equal(second.status,200);assert.deepEqual(await second.json(),body);assert.equal(state.calls,calls);assert.equal(state.docs.get(life).writingTools,3);
});
test('settlement read outage retains recoverable lease and retry does not double charge',async()=>{
 state.result=()=>{state.errorPaths=[receipt(id)];return result(source)};
 assert.equal((await m.humanize(request({text:source,requestId:id}))).status,500);assert.equal(state.docs.get(receipt(id)).status,'reserved');
 state.errorPaths=[];state.docs.get(receipt(id)).leaseExpiresAt=0;state.result=result(source);
 assert.equal((await m.humanize(request({text:source,requestId:id}))).status,200);assert.equal(state.docs.get(usage).usedWords,m.countWords(source));assert.equal(state.docs.get(life).writingTools,1);
});
test('pending replay does not release the active workers reservation',async()=>{
 const payload={text:source,requestId:id};let unblock,started;const ready=new Promise(resolve=>started=resolve);state.result=()=>new Promise(resolve=>{unblock=()=>resolve(result(source));started()});
 const first=m.humanize(request(payload));await ready;const second=await m.humanize(request(payload));assert.equal(second.status,409);assert.equal(state.docs.get(receipt(id)).status,'reserved');unblock();assert.equal((await first).status,200);assert.equal(state.docs.get(life).writingTools,1);
});
