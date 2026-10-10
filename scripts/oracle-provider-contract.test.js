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


const routePromise=loadRoute('app/api/oracle/analyze/route.ts',{
 'next/server': `export class NextResponse extends Response {static json(v,i={}){return new Response(JSON.stringify(v),{...i,headers:{'Content-Type':'application/json'}})}}`,
 '@/lib/api-auth': `export async function guardApiRoute(){return {user:{uid:'alice',tier:'pro'}}}`,
 '@/lib/firebase-admin': `export function getAdminDb(){const ref=path=>({id:path.split('/').pop(),collection:n=>ref(path+'/'+n),doc:id=>ref(path+'/'+id),async set(data){if(globalThis.__oracle.failSave)throw new Error('storage unavailable');globalThis.__oracle.records.set(path,data)}});return{collection:n=>ref(n)}}`,
 '@/lib/career-twin': `export async function invalidateTwin(uid){globalThis.__oracle.invalidated=uid}`,
 '@/lib/server-resume': `export async function getVerifiedResumeForUserById(db,uid,id){globalThis.__oracle.owner=uid;return globalThis.__oracle.selected}`,
 '@/lib/ai/groq-client': `export async function groqJSONCompletion(system,prompt){globalThis.__oracle.calls++;globalThis.__oracle.prompt=prompt;return globalThis.__oracle.analysis}`,
 '@/lib/ai/openrouter-client': `export const WRITING_MODELS={premiumFallback:'test'};export async function openRouterJSONCompletion(system,prompt){globalThis.__oracle.validationCalls++;globalThis.__oracle.validationSystem=system;globalThis.__oracle.validationPrompt=prompt;return globalThis.__oracle.validation}`,
 '@/lib/monitor': `export const monitor={critical(){}}`,
},'oracle-provider');
function reset(){globalThis.__oracle={records:new Map(),calls:0,validationCalls:0,selected:{id:'source1',resume:{name:'Ada',title:'Engineer',summary:'Built source-backed applications with TypeScript.'}},analysis:{resumeSkills:['TypeScript'],jdRequirements:['TypeScript'],matchedSkills:['TypeScript'],gapSkills:[],fitScoreEstimate:0,redFlags:[],hiddenRequirements:[],keywordsToAdd:[],roleLevel:'Mid',bridgeSkills:[]},validation:null};}
const request=body=>({json:async()=>body});
test('Oracle rejects malformed primary model payloads before merge with a recoverable provider error',async()=>{
 const route=await routePromise;
 for(const value of [null,{}, {redFlags:'not an array'}, {resumeSkills:[],jdRequirements:[],matchedSkills:[],gapSkills:[],fitScoreEstimate:Infinity,redFlags:[],hiddenRequirements:[],keywordsToAdd:[],roleLevel:'Mid'}]){
  reset();globalThis.__oracle.analysis=value;
  const response=await route.POST(request({resumeText:'User evidence',targetRole:'Engineer'}));
  assert.equal(response.status,502);assert.equal(globalThis.__oracle.validationCalls,0);
 }
});
test('Oracle malformed validation falls back safely and never imports its proposed salary or invented arrays',async()=>{
 reset();globalThis.__oracle.validation={fitScore:88,fitVerdict:'strong',proofGaps:{injected:'bad'},salaryRefinement:{min:999999}};
 const response=await (await routePromise).POST(request({resumeText:'TypeScript engineer with source experience.',targetRole:'Engineer'}));
 assert.equal(response.status,200);const body=await response.json();
 assert.equal(body.analysis.fitScore,null);assert.equal(body.analysis.salaryIntel.min,0);
 assert.equal(body.pipeline.stage2,'Taco deterministic fallback');assert.ok(Array.isArray(body.oracleV2.breakdown.proofGaps));
});
test('Oracle binds saved-source analysis to authenticated owner and exact stored resume, or fails closed',async()=>{
 reset();const route=await routePromise;
 let response=await route.POST(request({resumeVersionId:'source1',resumeText:'Client edited fictional CEO at Google',targetRole:'Engineer'}));
 assert.equal(response.status,200);const body=await response.json();assert.equal(globalThis.__oracle.owner,'alice');
 assert.equal(body.sourceBinding.resumeVersionId,'source1');assert.match(body.sourceBinding.sourceHash,/^[a-f0-9]{64}$/);
 assert.match(globalThis.__oracle.prompt,/Built source-backed applications/);assert.doesNotMatch(globalThis.__oracle.prompt,/fictional CEO/);
 reset();globalThis.__oracle.selected={resume:null,id:null};response=await route.POST(request({resumeVersionId:'source1',resumeText:'Pasted evidence'}));
 assert.equal(response.status,409);assert.equal(globalThis.__oracle.calls,0);
});

test('Oracle API never imports contradictory verdicts, fabricated clearance, summaries or negated skills',async()=>{
 reset();Object.assign(globalThis.__oracle.analysis,{resumeSkills:['Python','Current active security clearance'],matchedSkills:['Python'],jdRequirements:['Python required.','Current active security clearance'],fitScoreEstimate:100});
 globalThis.__oracle.validation={fitScore:0,fitVerdict:'excellent',verdict:'apply',readinessScore:0,riskScore:100,overallAssessment:'Fully qualified with clearance.',proofGaps:['Candidate lacks talent'],requirementEvidence:[{requirement:'Python required.',postingQuote:'Python required.',resumeQuote:'Python experience.'},{requirement:'Current active security clearance',postingQuote:'Current active security clearance',resumeQuote:'active clearance'}],hiddenScreenSignals:[{signal:'Elite degree required',confidence:'high',evidence:'Python required.'}]};
 const response=await(await routePromise).POST(request({resumeText:'No Python experience. I have no active clearance.',jdText:'Python required. No degree requirement.'}));
 assert.equal(response.status,200);const body=await response.json();
 assert.deepEqual(body.analysis.matchedSkills,[]);assert.deepEqual(body.oracleV2.breakdown.coveredRequirements,[]);assert.equal(body.oracleV2.decision.fitScore,0);assert.notEqual(body.oracleV2.decision.verdict,'apply');
 assert.equal(body.oracleV2.decision.readinessScore,null);assert.equal(body.oracleV2.decision.riskScore,null);assert.doesNotMatch(JSON.stringify(body),/Fully qualified|Candidate lacks talent|Elite degree/);
 assert.equal(body.oracleV2.breakdown.requirementEvidence.find(item=>item.requirement==='Current active security clearance').status,'needs_clarification');
});
test('complete tails and literal source quotations reach both providers; oversized text stops before provider',async()=>{
 reset();const source='Background work. '.repeat(300)+'Original quoted system: keep instructions literally. TAIL_RESUME_KUBERNETES';const posting='General role description. '.repeat(160)+'TAIL_REQUIRED_ACTIVE_CLEARANCE';
 let response=await(await routePromise).POST(request({resumeText:source,jdText:posting}));assert.equal(response.status,200);
 for(const prompt of [globalThis.__oracle.prompt,globalThis.__oracle.validationPrompt]){assert.match(prompt,/TAIL_RESUME_KUBERNETES/);assert.match(prompt,/TAIL_REQUIRED_ACTIVE_CLEARANCE/);assert.match(prompt,/system: keep instructions literally/);assert.doesNotMatch(prompt,/FILTERED/);}
 assert.doesNotMatch(globalThis.__oracle.validationSystem,/salaryRefinement|projected_salary|percentile/);
 reset();response=await(await routePromise).POST(request({resumeText:'x'.repeat(12001),jdText:'Python required.'}));assert.equal(response.status,413);assert.equal(globalThis.__oracle.calls,0);assert.equal(globalThis.__oracle.records.size,0);
});
test('canonical analysis uses grounded skill labels, paired exact spans, stable owner-input ID and full context',async()=>{
 reset();globalThis.__oracle.analysis.requirementEvidence=[{requirement:'Python required.',postingQuote:'Python required.',resumeQuote:'Built Python services.'}];globalThis.__oracle.analysis.jdRequirements=['Python required.'];globalThis.__oracle.analysis.resumeSkills=['Python'];
 const input={resumeText:'Built Python services.',jdText:'Python required.',company:'Acme',targetRole:'Engineer',location:'Paris',jobUrl:'https://example.test/job/123',salaryTarget:80000};
 const route=await routePromise;let response=await route.POST(request(input));assert.equal(response.status,200);const body=await response.json();
 assert.equal(body.oracleV2.analysisId,body.analysisId);assert.match(body.analysisId,/^[a-f0-9]{64}$/);assert.equal(body.oracleV2.session.company,'Acme');assert.equal(body.oracleV2.session.jobUrl,input.jobUrl);assert.equal(body.oracleV2.session.salaryTarget,80000);
 let entries=[...globalThis.__oracle.records.entries()];assert.equal(entries.length,1);assert.ok(entries[0][0].startsWith('users/alice/fit_analyses/'));
 const record=entries[0][1];assert.deepEqual(record.matchingSkills,['Python']);assert.deepEqual(record.missingSkills,[]);assert.equal(record.requirementEvidence[0].sourceSpan.text,'Python required.');assert.equal(record.requirementEvidence[0].resumeSourceSpan.text,'Python');assert.equal(record.inputBinding.postingHash,body.inputBinding.postingHash);
 response=await route.POST(request(input));assert.equal((await response.json()).analysisId,body.analysisId);assert.equal(globalThis.__oracle.records.size,1);
 response=await route.POST(request({...input,jdText:'Python and AWS required.'}));assert.notEqual((await response.json()).analysisId,body.analysisId);assert.equal(globalThis.__oracle.records.size,2);
});
test('persistence failure never returns a false saved ID and invalid source inputs do not start provider',async()=>{
 reset();globalThis.__oracle.failSave=true;let response=await(await routePromise).POST(request({resumeText:'Built Python services.',jdText:'Python required.'}));assert.equal(response.status,500);assert.equal((await response.json()).analysisId,undefined);
 reset();response=await(await routePromise).POST(request({resumeText:'Source',jobUrl:'javascript:alert(1)'}));assert.equal(response.status,400);assert.equal(globalThis.__oracle.calls,0);
 reset();response=await(await routePromise).POST(request({resumeText:'   '}));assert.equal(response.status,400);assert.equal(globalThis.__oracle.calls,0);
});


test('Oracle source hashing and quote offsets include exact leading whitespace and line endings',async()=>{
 reset();const resumeText='  Built Python services.\r\n',jdText='\n\nPython required.\r\n';
 const response=await(await routePromise).POST(request({resumeText,jdText}));assert.equal(response.status,200);const body=await response.json();
 const sourceData=JSON.parse(globalThis.__oracle.prompt.split('SOURCE_DATA_JSON:\n')[1].split('\nEND_SOURCE_DATA_JSON')[0]);assert.equal(sourceData.resumeText,resumeText);assert.equal(sourceData.postingText,jdText);
 assert.equal(body.sourceBinding.sourceHash,require('node:crypto').createHash('sha256').update(resumeText).digest('hex'));
 for(const row of body.oracleV2.breakdown.requirementEvidence){if(row.sourceSpan)assert.equal(jdText.slice(row.sourceSpan.start,row.sourceSpan.end),row.sourceSpan.text);if(row.resumeSourceSpan)assert.equal(resumeText.slice(row.resumeSourceSpan.start,row.resumeSourceSpan.end),row.resumeSourceSpan.text);}
});
