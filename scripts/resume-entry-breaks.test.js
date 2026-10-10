const assert=require('node:assert/strict');
const test=require('node:test');
const {build}=require('esbuild');
const Module=require('node:module');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
let api;
async function load(){
 if(api)return api;
 const out=await build({stdin:{contents:"export {reconcileResumeEntryBreaks} from './lib/resume-design/source-breaks'; export {createResumeDesign} from './lib/resume-design';",loader:'ts',resolveDir:root},write:false,bundle:true,platform:'node',format:'cjs',alias:{'@':root},logLevel:'silent'});
 const m=new Module(path.join(root,'break-test-memory.cjs'),module);m.filename=path.join(root,'break-test-memory.cjs');m.paths=module.paths;m._compile(out.outputFiles[0].text,m.filename);return api=m.exports;
}
const resume={name:'Example',title:'',email:'',phone:'',location:'',summary:'',experience:[{id:'stable-a',company:'Example Co',role:'Engineer',duration:'2026',achievements:['First achievement.']}],education:[],skills:[],certifications:['First certificate','Second certificate'],additionalSections:[{id:'projects',title:'Projects',items:['First project','Second project']}]};
test('reordering positional records invalidates breaks rather than transferring them',async()=>{
 const {createResumeDesign,reconcileResumeEntryBreaks}=await load();const d=createResumeDesign('technical-signal',resume);d.breakBeforeEntries=['certifications:0','additional:projects:0','experience:stable-a'];
 const next=structuredClone(resume);next.certifications.reverse();next.additionalSections[0].items.reverse();
 const result=reconcileResumeEntryBreaks(resume,next,d);
 assert.deepEqual(result.invalidated,['certifications:0','additional:projects:0']);assert.deepEqual(result.design.breakBeforeEntries,['experience:stable-a']);assert.deepEqual(d.breakBeforeEntries,['certifications:0','additional:projects:0','experience:stable-a']);
});
test('deletion and same-position replacement clear ambiguous references, stable role edits retain theirs',async()=>{
 const {createResumeDesign,reconcileResumeEntryBreaks}=await load();const d=createResumeDesign('technical-signal',resume);d.breakBeforeEntries=['certifications:1','additional:projects:0','experience:stable-a'];
 const next=structuredClone(resume);next.certifications.pop();next.additionalSections[0].items[0]='Different project';next.experience[0].achievements.push('New source fact.');
 const result=reconcileResumeEntryBreaks(resume,next,d);assert.deepEqual(result.design.breakBeforeEntries,['experience:stable-a']);
});
test('unchanged source and untouched records retain their breaks',async()=>{
 const {createResumeDesign,reconcileResumeEntryBreaks}=await load();const d=createResumeDesign('technical-signal',resume);d.breakBeforeEntries=['certifications:0','additional:projects:1'];
 const next=structuredClone(resume);next.experience[0].duration='2025–2026';assert.equal(reconcileResumeEntryBreaks(resume,next,d).design,d);
});
