// Read-only synthetic execution of the current page handlers; no Firebase/provider calls.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {transformSync, buildSync} = require('esbuild');
const root = path.resolve(__dirname, '../../..');
const page = fs.readFileSync(path.join(root, 'app/suite/resume/page.tsx'), 'utf8');
function handler(name, state) {
  const start = page.indexOf(`  const ${name} =`);
  const end = page.indexOf('\n  const ', start + 12);
  const source = page.slice(start, end).replace(`const ${name} =`, 'return');
  return new Function('state', transformSync(`const {${Object.keys(state).join(',')}} = state; ${source}`, {loader:'ts', target:'es2022'}).code)(state);
}
(async () => {
 const values = {candidate:{name:'Candidate A'}, jd:'Company A job', review:{decisions:{old:'accepted'}}, score:91};
 const template = {id:'plain'};
 const state = {tierLoading:false,showToast(){},normalizeResume:x=>x,isPro:true,canUseTemplatePalettes:true,
 getPersistedResumeTemplateId:()=> 'plain',resolveReplacementTemplate:()=>template,resolveEntitledReplacementTemplate:()=>template,
 getTemplatePalette:()=>({id:'ink'}),getPersistedResumePaletteId:()=> 'ink',getDefaultPaletteId:()=> 'ink',
 setOriginalResume:x=>values.original=x,setSelectedTemplate(){},setSelectedPaletteId(){},setTemplatePaletteSelections(){},setRequestedLockedTemplateId(){},setTemplateFilter(){},setSourceResumeMeta:x=>values.meta=x,setShowSourceConfirmation(){},setMode:x=>values.mode=x,setStep:x=>values.step=x,
 setMorphedResume:x=>values.candidate=x,setJobDescription:x=>values.jd=x,setResumeReview:x=>values.review=x,setMatchScore:x=>values.score=x};
 handler('loadVersionToMorph',state)({id:'b',version_name:'B tailored',content:{name:'Candidate B'},metadata:{jobDescription:'Company B job'}});
 assert.equal(values.original.name,'Candidate B');assert.equal(values.candidate.name,'Candidate A');assert.equal(values.jd,'Company A job');assert.equal(values.step,'jd');assert.equal(values.score,91);
 console.log('REPRO 1: opening B retains A candidate, target, review, score; enters jd.');
 const metadata = handler('buildResumeVersionMetadata',{getDisplayResume:()=>({title:'Source engineer'}),hasResumeData:Boolean,morphedResume:null,mode:'morph',sourceResumeMeta:{fileName:'source.pdf',sourceType:'direct'},applicationData:{},originalResume:{},saveCompanyName:'',matchScore:null,selectedTemplate:template,activePaletteId:'ink',selectedPalette:{label:'Ink',colors:{}},morphPercentage:50,targetPageCount:2,jobDescription:'Job'})({savedFrom:'resume_studio_optimize',autoSaved:true});
 assert.equal(metadata.resumeProvenance.origin,'user_upload');
 console.log('REPRO 2: first morph closure metadata labels optimized output user_upload (server classifier still rejects savedFrom optimize).');
 let saves=0;const links=[];
 const modal={applicationData:{companyName:'Company',jobTitle:'Engineer',notes:'Keep my note'},user:{uid:'alice'},setShowDownloadAuth(){},showToast(){},setIsLoading(){},getPreparedOutboundResume:()=>({resume:{name:'Ada'}}),requireEducationInstitutionBefore:()=>true,matchScore:80,selectedTemplate:template,activePaletteId:'ink',selectedPalette:{colors:{}},morphPercentage:50,buildResumeVersionMetadata:x=>x,saveResumeVersion:async()=>({success:true,data:{id:`version${++saves}`}}),jobDescription:'Job',postingUrl:'',createJobApplication:async input=>{links.push(input);return {success:false,error:'Response lost'};},updateResumeVersion(){},clearDraft(){},loadVersions(){},setShowApplicationModal(){},setApplicationData(){}};
 const track=handler('handleCreateApplication',modal);await track();await track();
 assert.equal(saves,2);assert.notEqual(links[0].resumeVersionId,links[1].resumeVersionId);assert.equal(links[0].notes,undefined);
 console.log('REPRO 3: alternate Track Application retry saves new versions; notes state is not sent (no notes input currently rendered).');
 const bundle=buildSync({entryPoints:[path.join(root,'lib/server-resume.ts')],absWorkingDir:root,bundle:true,platform:'node',format:'cjs',write:false});
 const module={exports:{}};new Function('module','exports',bundle.outputFiles[0].text)(module,module.exports);
 const savedFinal={is_active:true,source:'resume_studio',mode:'technical',metadata:{savedFrom:'resume_studio',sourceType:'direct',optimizationStrength:50},skill_graph:{morphPercentage:50},content:{name:'Ada'}};
 assert.equal(module.exports.classifyResumeVerification(savedFinal,'resume_versions').kind,'legacy_user_approved');
 console.log('REPRO 4: current final-save envelope of a tailored candidate is classified legacy_user_approved, unlike the auto-save envelope.');
})().catch(error=>{console.error(error);process.exitCode=1;});
