const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {build} = require('esbuild');
const root = path.resolve(__dirname, '..');
const state = {data:new Map(),errors:[],queries:[],writes:[],beforeTransaction:null};
global.__careerIntegrity = state;
const prefix = 'users/owner/';
function ref(location) {
  let limit = Infinity, after = '';
  return {path:location,id:location.split('/').at(-1),collection:n=>ref(`${location}/${n}`),doc:n=>ref(`${location}/${n}`),orderBy(){return this},limit(n){limit=n;return this},startAfter(snapshot){after=snapshot.id;return this},
    async get(){state.queries.push(location);if(state.errors.includes(location))throw Error('Injected read outage');
      const direct=state.data.get(location);if(direct)return {id:this.id,exists:true,data:()=>direct};
      const docs=[...state.data].filter(([key])=>key.startsWith(location+'/')&&key.slice(location.length+1).indexOf('/')===-1).sort(([a],[b])=>a.localeCompare(b)).map(([key,data])=>({id:key.split('/').at(-1),exists:true,data:()=>data})).filter(doc=>doc.id>after).slice(0,limit);
      return {exists:false,data:()=>undefined,docs,size:docs.length,empty:!docs.length};
    },async set(data,options){state.data.set(location,options?.merge?{...state.data.get(location),...data}:data);state.writes.push(location)},async update(data){return this.set(data,{merge:true})}};
}
state.db={collection:n=>ref(n),async runTransaction(fn){if(state.beforeTransaction){const hook=state.beforeTransaction;state.beforeTransaction=null;await hook();}return fn({get:r=>r.get(),set:(r,d,o)=>r.set(d,o),update:(r,d)=>r.update(d)});}};
let m;
test.before(async()=>{const outfile=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'career-integrity-')),'modules.cjs');await build({stdin:{contents:"export * from './lib/career-graph'; export * from './lib/career-twin'; export * from './lib/career-recommendations'; export {GET as outcomeGET} from './app/api/applications/outcome/route'; export {GET as intelligenceGET} from './app/api/agent/intelligence/route';",resolveDir:root},outfile,bundle:true,platform:'node',format:'cjs',plugins:[{name:'controlled-io',setup(b){b.onResolve({filter:/^(next\/server|@\/lib\/(firebase-admin|api-auth|monitor|job-recommendation-platform|assistant\/context|demo-mode))$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='next/server'?'export const NextResponse={json:(data,init)=>new Response(JSON.stringify(data),init)}':a.path.endsWith('firebase-admin')?'export function getAdminDb(){return global.__careerIntegrity.db}':a.path.endsWith('api-auth')?'export async function guardApiRoute(){return {user:{uid:"owner"}}}':a.path.endsWith('monitor')?'export const monitor={critical(){},info(){}}':a.path.endsWith('context')?'export function buildSonaBrief(twin){return twin.computedAt}':a.path.endsWith('demo-mode')?'export const DEMO_USER_ID="demo";export function isDemoModeEnabled(){return false} export function getDemoIntelligenceResponse(){}':'export function upsertRecommendationLedgerInTransaction(){}'}));}}]});m=require(outfile);});
test.beforeEach(()=>{state.data.clear();state.errors=[];state.queries=[];state.writes=[];state.beforeTransaction=null;});
function seed(collection,id,data){state.data.set(prefix+collection+'/'+id,data);}
function application(id,data){seed('applications',id,{createdAt:'2026-01-01',...data});}
const story = tags=>({situation:'Worked on an actual release.',task:'My task was to test the release.',action:'I wrote integration tests for regressions.',result:'The team caught defects before release.',tags});

test('TTL refreshes changed applications; invalidation also refreshes before TTL',async()=>{
 const first=await m.getOrComputeTwin('owner');assert.equal(first.pipeline.offers,0);
 application('offer',{status:'offer',appliedAt:'2026-01-01'});
 state.data.get(prefix+'profile/career_twin').computedAt=new Date(Date.now()-m.TWIN_TTL_MS-1).toISOString();
 const second=await m.getOrComputeTwin('owner');assert.equal(second.pipeline.offers,1);assert.equal(second.cacheOrigin,'computed');
 application('second',{status:'offer',appliedAt:'2026-01-02'});await m.invalidateTwin('owner');assert.equal((await m.getOrComputeTwin('owner')).pipeline.offers,2);
});
test('source invalidation during computation prevents stale overwrite',async()=>{
 state.beforeTransaction=()=>m.invalidateTwin('owner');
 await assert.rejects(m.computeAndPersistTwin('owner'),/sources changed/);assert.equal(state.data.get(prefix+'profile/career_twin').stale,true);
});
test('preferences outage fails refresh and does not replace prior constraints',async()=>{
 seed('settings','jobPreferences',{agentExcludeCompanies:['Keep out']});await m.computeAndPersistTwin('owner');await m.invalidateTwin('owner');state.errors=[prefix+'settings/jobPreferences'];
 await assert.rejects(m.getOrComputeTwin('owner'),/outage/);assert.deepEqual(state.data.get(prefix+'profile/career_twin').memory.constraints.excludedCompanies,['Keep out']);assert.equal(state.data.get(prefix+'profile/career_twin').stale,true);
});
test('intelligence recommendations and summary update with the same invalidated snapshot',async()=>{
 const read=()=>m.intelligenceGET(new Request('http://localhost/api/agent/intelligence')).then(r=>r.json());const first=await read();assert(first.recommendations.some(r=>r.id==='no-resume'));
 seed('resume_versions','resume',{created_at:'2026-01-01',content:{skills:[]}});await m.invalidateTwin('owner');const second=await read();assert.equal(second.profile.hasResume,true);assert(!second.recommendations.some(r=>r.id==='no-resume'));assert.equal(second.dataVersion,6);assert.equal(second.computedAt,second.profile.computedAt);
});
test('empty recent debrief windows do not imply declining confidence or invent round scores',async()=>{
 for(let i=1;i<=4;i++)seed('debriefs',String(i),{createdAt:`2026-01-0${i}`,questions:i>2?[]:[{category:'leadership',confidence:80}]});
 const p=await m.computeCareerProfile('owner');assert.equal(p.interviews.confidenceTrend,null);assert.equal(p.interviews.roundTypeBreakdown[0].avgConf,80);assert(!m.generateRecommendations(p).some(r=>r.id==='confidence-declining'));
});
test('canonical fit analyses retain source IDs without claiming market frequency',async()=>{
 seed('fit_analyses','fit',{createdAt:'2026-01-01',schemaVersion:1,resumeVersionId:'resume',sourceHash:'hash',missingSkills:['rust','python','sql'],matchingSkills:[]});
 const p=await m.computeCareerProfile('owner');assert.equal(p.skills.fitAnalysisCount,1);assert.equal(p.skills.fitSources[0].id,'fit');assert.equal(p.skills.fitSources[0].sourceHash,'hash');assert(!m.generateRecommendations(p).find(r=>r.id==='skill-gaps').description.includes('frequently'));
});
test('identity pagination includes 251st story and excludes placeholder coverage',async()=>{
 for(let i=0;i<251;i++)seed('agent_stories',String(i).padStart(4,'0'),story([i===250?'leadership':'teamwork']));seed('agent_stories','placeholder',{...story(['creativity']),action:'(Fill in actions)'});
 const twin=await m.computeAndPersistTwin('owner');assert.equal(twin.stories.totalStories,251);assert(twin.behavioralBank.coveredCategories.includes('leadership'));assert(!twin.behavioralBank.coveredCategories.includes('creativity'));assert.equal(twin.sourceReads.agent_stories.count,252);
});
test('learning progress and latest versioned assessment retain distinct provenance',async()=>{
 seed('study_progress','python',{skill:'python',completed_days:[1]});seed('skill_verifications','current',{skill:'python',assessmentVersion:'skill-practice-v1',challengeType:'applied_challenge',score:90,createdAt:new Date().toISOString()});seed('skill_verifications','legacy',{skill:'python',score:100,createdAt:new Date().toISOString()});
 const p=await m.computeCareerProfile('owner');assert.deepEqual(p.skills.growing,['python']);assert.equal(p.skills.assessments[0].latestScore,90);assert.equal(p.skills.assessments[0].verified,true);assert.equal(p.skills.assessments[0].assessmentId,'current');assert.deepEqual(p.skills.confirmed,[]);
});
test('first response uses earliest recorded reply including zero-day replies',async()=>{
 application('a',{status:'rejected',applied_at:'2026-01-01',outcome_reported_at:'2026-01-21',outcome_response:'rejection',outcome_history:[{outcome:'callback',reportedAt:'2026-01-02'}]});let p=await m.computeCareerProfile('owner');assert.equal(p.pipeline.avgDaysToResponse,1);
 state.data.get(prefix+'applications/a').outcome_history[0].reportedAt='2026-01-01';p=await m.computeCareerProfile('owner');assert.equal(p.pipeline.avgDaysToResponse,0);
});
test('outcomes excludes drafts, reads camel dates and retains interview history',async()=>{
 application('saved',{status:'saved'});let body=await(await m.outcomeGET(new Request('http://localhost/outcome'))).json();assert.equal(body.stats.totalApplied,0);assert.equal(body.stats.responseRate,null);
 application('camel',{status:'applied',appliedAt:'2026-01-01',companyName:'Example',jobTitle:'Engineer'});body=await(await m.outcomeGET(new Request('http://localhost/outcome'))).json();assert.equal(body.pending.length,1);assert.equal(body.pending[0].company_name,'Example');
 application('rejected',{status:'rejected',appliedAt:'2026-01-01',outcome_response:'rejection',outcome_history:[{outcome:'interview',reportedAt:'2026-01-02'}]});body=await(await m.outcomeGET(new Request('http://localhost/outcome'))).json();assert.equal(body.stats.interviewCount,1);assert.equal(body.stats.interviewRate,50);
});

test('demo overview and Results derive funnel counts from the same application records',async()=>{
 const outfile=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'career-demo-')),'demo.cjs');
 await build({stdin:{contents:"export {getDemoIntelligenceResponse,getDemoJobApplications} from './lib/demo-mode'; export {computeApplicationMetrics} from './lib/application-records';",resolveDir:root},outfile,bundle:true,platform:'node',format:'cjs'});
 const demo=require(outfile);const records=demo.getDemoJobApplications();const metrics=demo.computeApplicationMetrics(records,[]);const {profile,twin}=demo.getDemoIntelligenceResponse();
 assert.equal(profile.pipeline.appliedApps,metrics.totalApplications);assert.equal(profile.pipeline.interviews,metrics.pipeline.interviewing);assert.equal(profile.pipeline.offers,metrics.pipeline.offer);assert.equal(twin.memory.activeSearch.sentApplications,metrics.totalApplications);
});
