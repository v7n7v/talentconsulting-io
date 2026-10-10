const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
async function load(entry, extra = {}) {
  const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'writing-contract-')), 'entry.cjs');
  const mocks = {
    'next/server': `export class NextResponse extends Response { static json(body, options={}) { return new Response(JSON.stringify(body), {...options, headers:{'content-type':'application/json'}}); } }`,
    '@/lib/api-auth': `export async function guardApiRoute(request, options) { globalThis.__writing.guardOptions = options; return globalThis.__writing.guard; } export async function incrementUsage(uid, feature) { globalThis.__writing.usage.push([uid,feature]); }`,
    '@/lib/firebase-admin': `export function getAdminDb() { return globalThis.__writing.db; }`,
    '@/lib/ai/groq-client': `export async function groqJSONCompletion(system, user, options) { globalThis.__writing.calls.push({system,user,options}); return globalThis.__writing.output; }`,
    '@/lib/monitor': `export const monitor = { critical() {} };`,
    '@/lib/sanitize': `export const sanitizeForAI = value => value;`,
    ...extra,
  };
  await build({ entryPoints:[path.resolve(entry)], outfile, bundle:true, platform:'node', format:'cjs', logLevel:'silent', plugins:[{name:'writing-mocks',setup(api) {
    api.onResolve({filter:/.*/},args => args.path in mocks ? {path:args.path,namespace:'mock'} : undefined);
    api.onLoad({filter:/.*/,namespace:'mock'}, args => ({contents:mocks[args.path],loader:'js'}));
  }}] });
  return require(outfile);
}
const sessionRoute = load('app/api/writing/sessions/route.ts');
const galleryRoute = load('app/api/gallery/run/route.ts');
const jdRoute = load('app/api/jd/generate/route.ts');
const contracts = load('lib/gallery-contracts.ts');
function fakeDb() {
  const docs = new Map(); let seq=0, tail=Promise.resolve();
  function collection(prefix) { return { doc(id=`server-${++seq}`) { const key=`${prefix}/${id}`; return { id,key,collection:name=>collection(`${key}/${name}`),get:async()=>snapshot(key,id) }; }, orderBy() { return this; }, limit() { return this; }, async get() { return { docs:[...docs].filter(([key])=>key.startsWith(prefix+'/')).map(([key])=>snapshot(key,key.split('/').at(-1))) }; } }; }
  function snapshot(key,id) { return { id, exists:docs.has(key), data:()=>docs.get(key) }; }
  return { docs, collection, runTransaction(fn) { const work=tail.then(()=>fn({get:ref=>ref.get(),set:(ref,data)=>docs.set(ref.key,data),delete:ref=>docs.delete(ref.key)})); tail=work.catch(()=>{}); return work; } };
}
function reset(uid='alice', tier='free') { return globalThis.__writing={ guard:{user:{uid,tier}}, usage:[], calls:[], db:fakeDb(), output:{} }; }
const request = (body, id) => ({ url:`http://local/api/writing/sessions${id ? '?id='+encodeURIComponent(id) : ''}`, json:async()=>body });
const draft = overrides => ({id:'draft-1',version:0,title:'My draft',inputText:'  Exact input\nwith whitespace.\n',finalText:'Exact output\n',domain:'general',tone:'professional',lengthMode:'exact',mode:'safe_polish',step:'export',metadata:{intensity:'deep',qualityMode:'best',protectedTermsText:'ACME, 37%'},...overrides});

test('loaded session handlers recover exact text/settings; retries update one owner-scoped record', async()=>{
  const route=await sessionRoute, state=reset();
  let response=await route.POST(request(draft())); assert.equal(response.status,200);
  let saved=(await response.json()).session; assert.equal(saved.version,1); assert.equal(saved.user_id,undefined); assert.equal(saved.content_hash,undefined);
  response=await route.POST(request(draft())); assert.equal((await response.json()).session.version,1); assert.equal(state.db.docs.size,1);
  response=await route.POST(request(draft({version:1,finalText:'Edited exactly\n\n'}))); assert.equal((await response.json()).session.version,2); assert.equal(state.db.docs.size,1);
  response=await route.GET(request(null,'draft-1')); saved=(await response.json()).sessions;
  assert.equal(saved.input_text,draft().inputText); assert.equal(saved.final_text,'Edited exactly\n\n'); assert.deepEqual(saved.metadata,{...draft().metadata,voiceSample:'',hasOutput:true,revisions:[]});
  state.guard.user.uid='bob'; assert.equal((await route.GET(request(null,'draft-1'))).status,404);
  await route.POST(request(draft({title:'Bob draft'}))); assert.equal(state.db.docs.size,2);
  state.guard.user.uid='alice'; await route.DELETE(request(null,'draft-1')); assert.equal(state.db.docs.size,1); assert.equal(state.db.docs.get('users/bob/writing_sessions/draft-1').title,'Bob draft');
});
test('concurrent different edits conflict; late stale save cannot overwrite accepted version', async()=>{
  const route=await sessionRoute; reset(); await route.POST(request(draft()));
  const results=await Promise.all(['first','second'].map(inputText=>route.POST(request(draft({version:1,inputText})))));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await route.POST(request(draft({inputText:'stale'})))).status,409);
  const stored=(await (await route.GET(request(null,'draft-1'))).json()).sessions; assert.equal(stored.input_text,'first'); assert.equal(stored.version,2);
});
test('session handlers reject path IDs, oversize input and strip untrusted metadata/ownership fields', async()=>{
  const route=await sessionRoute, state=reset();
  assert.equal((await route.GET(request(null,'../../bob'))).status,400);
  assert.equal((await route.POST(request(draft({inputText:'x'.repeat(50001)})))).status,400);
  await route.POST(request(draft({user_id:'bob',metadata:{...draft().metadata,arbitrarySecret:'hidden',id:'fake'}})));
  const stored=state.db.docs.get('users/alice/writing_sessions/draft-1'); assert.equal(stored.user_id,'alice'); assert.equal(stored.metadata.arbitrarySecret,undefined);
  stored.id='forged'; stored.arbitrarySecret='hidden'; const saved=(await (await route.GET(request(null,'draft-1'))).json()).sessions; assert.equal(saved.id,'draft-1'); assert.equal(saved.arbitrarySecret,undefined);
});
const validGallery = {
 'grammar-checker':{correctedText:'I work here.',corrections:[],overallScore:90,summary:'Clear'},
 'citation-machine':{citations:{apa:'A',mla:'M',chicago:'C',harvard:'H'},inText:{apa:'A',mla:'M',chicago:'C',harvard:'H'}},
 paraphraser:{variations:['formal','casual','concise'].map(style=>({style,text:'Same facts.'}))},
 'tone-analyzer':{primaryTone:'formal',secondaryTones:[],formality:50,sentiment:0,readabilityGrade:9,suggestions:[]},
 summarizer:{oneLiner:'Summary.',brief:'Brief summary.',detailed:'A longer summary.',bulletPoints:['Fact'],wordCount:{original:999,brief:999,detailed:999}},
 'email-composer':{subject:'Hello',body:'Dear recruiter',variations:[{tone:'formal',body:'Hello recruiter'}]},
 'thesis-generator':{thesisStatements:['argumentative','analytical','expository'].map(type=>({type,statement:'Proposal.',strength:'moderate'})),outlineHints:[]},
};
test('all paid Gallery IDs reject guest/free direct requests before provider or usage; paid tier succeeds',async()=>{
 const route=await galleryRoute;
 for(const tool of ['paraphraser','email-composer','thesis-generator']) {
  for(const uid of ['anon:demo','alice']) { const state=reset(uid); const response=await route.POST(request({tool,input:'Some sufficient source material.'})); assert.equal(response.status,403,tool); assert.equal(state.calls.length,0); assert.equal(state.usage.length,0); }
  const state=reset('alice','pro'); state.output=validGallery[tool]; assert.equal((await route.POST(request({tool,input:'Some sufficient source material.'}))).status,200);
 }
});
test('every generated Gallery result is schema validated; malformed output never consumes generation',async()=>{
 const route=await galleryRoute;
 for(const [tool,output] of Object.entries(validGallery)) {
  const state=reset('alice','pro'); state.output={}; assert.equal((await route.POST(request({tool,input:'Some sufficient source material.'}))).status,502,tool);
  assert.equal(state.usage.length,0); state.output=output;
  const response=await route.POST(request({tool,input:'Some sufficient source material.'})); assert.equal(response.status,200,tool);
  if(tool==='summarizer') assert.deepEqual((await response.json()).result.wordCount,{original:4,brief:2,detailed:3});
 }
});
test('shared deterministic counter handles empty text, unicode and top words without provider usage',async()=>{
 const {runWordCounter}=await contracts; assert.equal(runWordCounter('').words,0); assert.equal(runWordCounter('').readingTimeMinutes,0);
 const input='Résumé résumé.\n\nHello world!'; const result=runWordCounter(input); assert.equal(result.words,4); assert.equal(result.paragraphs,2); assert.deepEqual(result.topWords[0],{word:'résumé',count:2});
 const state=reset(); const response=await (await galleryRoute).POST(request({tool:'word-counter',input})); assert.equal(response.status,200); assert.deepEqual((await response.json()).result,result); assert.equal(state.calls.length,0); assert.equal(state.usage.length,0);
});
const jdOutput={roleTitle:'Engineer',missionStatement:'Proposed mission',overview:'Proposed role',first90Days:[],coreRequirements:[],niceToHave:[],culturePulse:[{trait:'Invented',description:'Fake culture'}],talentDensity:'Proposed',growthPath:['Invented promotion'],compensation:'Invented equity',benefits:['Invented pension']};
const jdInput={roleTitle:'Engineer',department:'Engineering',seniority:'Senior',style:'startup',includeCompensation:false,salaryRange:'PRIVATE COMPENSATION',usageFeature:'other'};
test('dedicated JD handler enforces opt-out and server meter, omits unsupported company sections',async()=>{
 const route=await jdRoute,state=reset();state.output=jdOutput;
 const response=await route.POST(request(jdInput));assert.equal(response.status,200);const {result}=await response.json();
 assert.equal(result.compensation,undefined);assert.deepEqual(result.benefits,[]);assert.deepEqual(result.culturePulse,[]);assert.deepEqual(result.growthPath,[]);
 assert.equal(state.calls[0].user.includes('PRIVATE COMPENSATION'),false);assert.equal(state.calls[0].user.includes('usageFeature'),false);
 assert.equal(state.guardOptions.feature,'jdGenerations');assert.deepEqual(state.usage,[['alice','jdGenerations']]);
});
test('JD compensation remains exact supplied text; invalid provider or input never counts',async()=>{
 const route=await jdRoute,state=reset();state.output={};assert.equal((await route.POST(request(jdInput))).status,502);assert.equal(state.usage.length,0);
 state.output=jdOutput;const response=await route.POST(request({...jdInput,includeCompensation:true,salaryRange:'$90,000–$110,000'}));assert.equal((await response.json()).result.compensation,'$90,000–$110,000');
 assert.equal((await route.POST(request({...jdInput,style:'arbitrary'}))).status,400);assert.equal(state.calls.length,2);
});

test('loaded owner storage updates JD templates and saves notes without replaying stale status',async()=>{
 const mock = `
 export const doc=(...args)=>{const parts=args[0]?.path ? [args[0].path,'new-template'] : args.slice(1);const path=parts.join('/');return {path,id:path.split('/').at(-1)}};
 export const collection=(_, ...parts)=>({path:parts.join('/')});
 export const runTransaction=async(_,fn)=>fn({get:async ref=>({exists:()=>globalThis.__jdDocs.has(ref.path),data:()=>globalThis.__jdDocs.get(ref.path)}),set:(ref,value)=>globalThis.__jdDocs.set(ref.path,value)});
 export const getDocs=async ref=>({docs:[...globalThis.__jdDocs].filter(([key])=>key.startsWith(ref.path+'/')).map(([key,value])=>({id:key.split('/').at(-1),data:()=>value}))});
 export const getDoc=async ref=>({id:ref.id,data:()=>globalThis.__jdDocs.get(ref.path)}); export const updateDoc=async(ref,value)=>{globalThis.__notesPatch=value;globalThis.__jdDocs.set(ref.path,{...globalThis.__jdDocs.get(ref.path),...value})}; export const setDoc=()=>{},deleteDoc=()=>{},addDoc=()=>{},query=()=>{},where=()=>{},limit=()=>{},deleteField=()=>{};
 `;
 globalThis.__jdAuth={currentUser:{uid:'alice'}};globalThis.__jdDocs=new Map();
 const db=await load('lib/database-suite.ts',{
  './firebase':`export const auth=globalThis.__jdAuth;export const db={};`,
  './demo-mode':`export const isDemoModeEnabled=()=>false;export const DEMO_USER_ID='demo';${['createDemoApplicationFromQueue','createDemoJobApplication','deleteDemoCoverLetter','deleteDemoJobApplication','getDemoAgentQueue','getDemoCoverLetters','getDemoJobApplications','getDemoResumeVersions','getDemoStudyProgress','getDemoUserProfile','saveDemoCoverLetter','saveDemoResumeVersion','updateDemoResumeVersion','updateDemoJobApplication','updateDemoQueueItem','updateDemoStudyProgress'].map(name=>`export const ${name}=()=>{};`).join('')}`,
  'firebase/firestore':mock,
  './auth-fetch':`export const authFetch=()=>{};`,
 });
 const first=await db.saveJDTemplate('First','Exact initial text',{first_90_days:[{day:'30',milestone:'Proposal'}]});assert.equal(first.success,true);const id=first.data.id,created=first.data.created_at;
 const updated=await db.saveJDTemplate('Edited','Edited current text',{first_90_days:first.data.first_90_days},id);assert.equal(updated.success,true);assert.equal(updated.data.id,id);assert.equal(updated.data.created_at,created);assert.equal(globalThis.__jdDocs.size,1);
 const reopened=await db.getJDTemplates();assert.equal(reopened.data[0].content,'Edited current text');
 globalThis.__jdAuth.currentUser.uid='bob';const denied=await db.saveJDTemplate('Other','overwrite',{},id);assert.equal(denied.success,false);assert.equal(globalThis.__jdDocs.get(`users/alice/jd_templates/${id}`).content,'Edited current text');
 globalThis.__jdAuth.currentUser.uid='alice'; globalThis.__jdDocs.set('users/alice/applications/a',{status:'interviewed',notes:'old'});
 const notes=await db.updateApplicationNotes('a','New notes exactly.'); assert.equal(notes.success,true); assert.equal(globalThis.__jdDocs.get('users/alice/applications/a').status,'interviewed'); assert.equal(globalThis.__notesPatch.status,undefined); assert.equal(globalThis.__notesPatch.notes,'New notes exactly.');

});
