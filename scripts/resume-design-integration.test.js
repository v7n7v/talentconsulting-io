const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');
const root = path.resolve(__dirname, '..');
async function load(entry) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'resume-design-integration-'));
  const outfile=path.join(dir,'module.cjs');
  try {
    await build({entryPoints:[path.join(root,'lib',entry)],outfile,bundle:true,platform:'node',format:'cjs',alias:{'@':root},logLevel:'silent'});
    return require(outfile);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
const resume={name:'Amina Patel',title:'Engineer',email:'amina@example.test',phone:'',location:'',summary:'Builds reliable systems.',experience:[{id:'job-a',company:'Northstar',role:'Engineer',duration:'2022–Present',achievements:['Reduced failures by 20%.']}],education:[],skills:[{category:'Systems',items:['TypeScript']}],certifications:[],additionalSections:[{id:'projects',title:'Projects',items:['Built a search service.']}]};

test('save/reopen preserves design while source/content hashes remain independent',async()=>{
  const {createResumeDesign,buildResumeDocumentPlan}=await load('resume-design/index.ts');
  const {createWorkspaceMetadata,readWorkspaceVersion,stableWorkspaceContentHash}=await load('resume-workspace.ts');
  const design=createResumeDesign('technical-signal',resume);
  design.pageSize='LETTER'; design.typography.bodySize=11.5; design.colors.heading='#123456';
  design.sections.find(s=>s.id==='skills').visible=false;
  design.sections.find(s=>s.id==='additional:projects').breakBefore=true;
  design.breakBeforeEntries=['experience:job-a'];
  const before=structuredClone(resume);
  const contentHash=await stableWorkspaceContentHash(resume);
  const envelope=createWorkspaceMetadata({kind:'resume',origin:'user_authored',content:resume,contentHash,presentation:{template:design.templateId,pageSize:'LETTER',design}});
  const stored=JSON.parse(JSON.stringify({id:'v2',content:resume,metadata:{workspace:envelope}}));
  const reopened=readWorkspaceVersion(stored);
  assert.deepEqual(reopened.presentation.design,design);
  const original=buildResumeDocumentPlan(resume,design), restored=buildResumeDocumentPlan(reopened.candidate,reopened.presentation.design);
  assert.deepEqual(restored.sections,original.sections);
  assert.deepEqual(restored.excluded,['Skills']);
  assert.equal(await stableWorkspaceContentHash(resume),contentHash);
  assert.deepEqual(resume,before);
  design.colors.heading='#654321';
  assert.equal(reopened.presentation.design.colors.heading,'#123456','saved snapshot is not mutated through the editor');
});

test('legacy and future designs never silently opt into the v2 renderer',async()=>{
  const {createWorkspaceMetadata,readWorkspaceVersion}=await load('resume-workspace.ts');
  const envelope=createWorkspaceMetadata({kind:'resume',origin:'user_authored',presentation:{template:'technical-signal'}});
  assert.equal(readWorkspaceVersion({content:resume,metadata:{workspace:envelope}}).presentation.design,null);
  const future=createWorkspaceMetadata({kind:'resume',origin:'user_authored',presentation:{template:'technical-signal',design:{schemaVersion:99,rendererVersion:3,templateId:'technical-signal'}}});
  assert.equal(future.presentation.design,null);
  assert.equal(future.presentation.template,'technical-signal');
});

test('linked exports use the saved matching design and reject mismatched template identities',async()=>{
  const {createResumeDesign}=await load('resume-design/index.ts');
  const {getPersistedResumeDesign}=await load('resume-templates/persistence.ts');
  const design=createResumeDesign('technical-signal',resume);
  design.layout.margins.left=23;
  const carrier={template:'technical-signal',metadata:{template:'technical-signal',workspace:{presentation:{design}}}};
  assert.equal(getPersistedResumeDesign(carrier,resume).layout.margins.left,23);
  assert.equal(getPersistedResumeDesign({...carrier,metadata:{...carrier.metadata,template:'creative-director'}},resume),null);
  assert.equal(getPersistedResumeDesign({template:'technical-signal'},resume),null);
});

test('restoring an AI generation retains presentation without changing generation identity',async()=>{
  const {createResumeDesign}=await load('resume-design/index.ts');
  const {restoreResumeGeneration,resumeGenerationKey}=await load('resume-workflow.ts');
  const design=createResumeDesign('emerging-professional',resume);
  const inputs={source:resume,jobDescription:'Build systems',role:'Engineer',company:'Northstar',postingUrl:'',percentage:50,targetPageCount:'auto',unlocked100:false};
  const generation={schemaVersion:2,id:'generation-a',createdAt:'2026-10-07T00:00:00Z',inputs,effectivePercentage:50,candidate:resume,review:{decisions:{}},presentation:{templateId:design.templateId,paletteId:'classic',pageSize:'A4',design}};
  const restored=restoreResumeGeneration(JSON.parse(JSON.stringify(generation)));
  assert.deepEqual(restored.presentation.design,design);
  const key=resumeGenerationKey(restored.inputs);
  restored.presentation.design.typography.nameSize=42;
  assert.equal(resumeGenerationKey(restored.inputs),key,'changing type does not invalidate generated content');
});
