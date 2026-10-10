const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {transformSync,buildSync}=require('esbuild');
const compiled=buildSync({entryPoints:[path.join(__dirname,'../lib/resume-tracking-recovery.ts')],bundle:true,platform:'node',format:'cjs',write:false});
const recoveryModule={exports:{}};new Function('module','exports',compiled.outputFiles[0].text)(recoveryModule,recoveryModule.exports);
const recovery=recoveryModule.exports;
function storage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const source=fs.readFileSync(path.join(__dirname,'../app/suite/resume/page.tsx'),'utf8');
const start=source.indexOf('  const confirmSave = async () => {');
const handler=source.slice(start,source.indexOf('\n  const ',start+12)).replace('const confirmSave =','return');
function load(overrides={}){
 const saves=[];const applications=[];const notices=[];const errors=[];
 let valid=true;let attempt=0;
 const state={...recovery,user:{uid:'alice'},pageSize:'A4',targetPageCount:'auto',documentVersionId:'doc-a',workspaceSource:{contentHash:'source'},buildResume:{name:'Ada',title:'Engineer'},localStorage:storage(),resumeReview:{},trackingDraftSnapshot:()=>({originalResume:{name:'Ada',title:'Engineer'},jobDescription:'Job',mode:'morph',resumeReview:{},pageSize:'A4',targetPageCount:'auto',workspaceSource:{contentHash:'source'},documentVersionId:'doc-a',documentName:'Engineer',documentOrigin:'user_authored',documentManualEdits:false,proofData:null,guardrailReport:null}),isSaving:false,trackingBusyRef:{current:false},trackingSaveKeyRef:{current:null},savedTrackingRef:{current:null},saveCompanyName:'Target',saveVersionName:'Engineer',jobDescription:'Job',postingUrl:'',matchScore:0,morphPercentage:0,selectedTemplate:{id:'plain'},activePaletteId:'ink',selectedPalette:{colors:{}},captureOutbound:()=>()=>valid,getPreparedOutboundResume:()=>({resume:{name:'Ada',title:'Engineer'}}),requireEducationInstitutionBefore:()=>true,buildResumeVersionMetadata:x=>x,setTrackingError:x=>errors.push(x),setIsSaving(){},setSaveVersionName(){},setSaveCompanyName(){},setSaveSuccess(){},setShowSaveModal(){},clearDraft(){},loadVersions(){},showToast:x=>notices.push(x),saveResumeVersion:async(...args)=>{saves.push(args);return {success:true,data:{id:`handoff_${args[5].idempotencyKey}`,user_id:state.user.uid,metadata:{}}};},createJobApplication:async data=>{applications.push(data);return ++attempt===1?{success:false,error:'offline'}:{success:true,data:{id:'app1'}};},updateResumeVersion:async()=>({success:true}),...overrides};
 state.sourceParseMountedRef={current:true};
 const body=transformSync(`const {${Object.keys(state).join(',')}}=state; ${handler}`,{loader:'ts',target:'es2022'}).code;
 const fn=new Function('state','setTimeout','console',body)(state,()=>0,{log(){},warn(){},error(){}});
 return {fn,state,saves,applications,notices,errors,invalidate(){valid=false;}};
}
test('loaded Save & Track retries tracking with the same saved version and a stable save key',async()=>{
 const run=load();await run.fn();assert.equal(run.saves.length,1);assert.match(run.errors.at(-1),/Resume saved.*tracking failed/i);
 assert.match(run.saves[0][5].idempotencyKey,/^[a-f0-9]{40}$/);
 await run.fn();assert.equal(run.saves.length,1);assert.equal(run.applications.length,2);
 assert.equal(run.applications[0].resumeVersionId,run.saves[0][5].idempotencyKey.replace(/^/,'handoff_'));assert.equal(run.applications[1].resumeVersionId,run.applications[0].resumeVersionId);
});
test('loaded Save & Track cannot start cross-account tracking after a late resume save',async()=>{
 let resolve,started;const savingStarted=new Promise(r=>started=r);const saved=new Promise(r=>resolve=r);const run=load({saveResumeVersion:()=>{started();return saved;}});
 const request=run.fn();await savingStarted;run.invalidate();resolve({success:true,data:{id:'alice-resume'}});await request;
 assert.equal(run.applications.length,0);assert.equal(run.notices.length,0);
});
test('loaded Save & Track prevents same-tick duplicate save operations',async()=>{
 let resolve,started;const savingStarted=new Promise(r=>started=r);const saved=new Promise(r=>resolve=r);let calls=0;const run=load({saveResumeVersion:()=>{calls++;started();return saved;}});
 const first=run.fn();const second=run.fn();await savingStarted;assert.equal(calls,1);resolve({success:true,data:{id:'resume1'}});await Promise.all([first,second]);assert.equal(run.applications.length,1);
});

test('loaded handler remount restores exact owned recovery and skips the already saved resume',async()=>{
 const device=storage();const first=load({localStorage:device});await first.fn();
 const receipt=recovery.readResumeTrackingRecovery(device,'alice');assert.ok(receipt.version.id);assert.equal(receipt.company,'Target');
 const remount=load({localStorage:device});await remount.fn();assert.equal(remount.saves.length,0);assert.equal(remount.applications.length,1);
 assert.equal(remount.applications[0].resumeVersionId,receipt.version.id);
});
test('recovery cannot attach a saved version to a changed target or another owner',async()=>{
 const device=storage();const first=load({localStorage:device});await first.fn();const previous=recovery.readResumeTrackingRecovery(device,'alice');
 const changed=load({localStorage:device,saveCompanyName:'Different target'});await changed.fn();assert.equal(changed.saves.length,1);assert.notEqual(changed.applications[0].resumeVersionId,previous.version.id);
 assert.equal(recovery.readResumeTrackingRecovery(device,'bob'),null);
 const bob=load({localStorage:device,user:{uid:'bob'}});await bob.fn();assert.equal(bob.saves.length,1);assert.notEqual(bob.saves[0][5].idempotencyKey,previous.idempotencyKey);
});
test('unavailable recovery storage fails explicitly before either cloud mutation',async()=>{
 const run=load({localStorage:{getItem:()=>null,setItem(){throw new Error('quota');},removeItem(){}}});await run.fn();
 assert.equal(run.saves.length,0);assert.equal(run.applications.length,0);assert.match(run.errors.at(-1),/Recovery could not be saved/);
});
test('an interrupted save without a returned version reuses the durable idempotency key after remount',async()=>{
 const device=storage();let key;
 const first=load({localStorage:device,saveResumeVersion:async(...args)=>{key=args[5].idempotencyKey;return {success:false,error:'response lost'};}});await first.fn();
 assert.equal(recovery.readResumeTrackingRecovery(device,'alice').version,null);
 const remount=load({localStorage:device});await remount.fn();assert.equal(remount.saves[0][5].idempotencyKey,key);
});
