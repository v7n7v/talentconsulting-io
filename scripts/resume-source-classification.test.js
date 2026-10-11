const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {build}=require('esbuild');
const compiled=build({entryPoints:[path.join(__dirname,'../lib/server-resume.ts')],outfile:path.join(fs.mkdtempSync(path.join(os.tmpdir(),'resume-classifier-')),'module.cjs'),bundle:true,format:'cjs',platform:'node',metafile:true,logLevel:'silent'}).then(result=>require(path.resolve(Object.keys(result.metafile.outputs)[0])));
test('confirmed-source classifier rejects generated optimize/morph markers even on active or explicitly marked versions',async()=>{
 const {classifyResumeVerification}=await compiled;
 for(const marker of [{source:'resume_studio_optimize'},{metadata:{savedFrom:'resume_studio_optimize'}},{metadata:{guardrailReport:{version:'v1'}}},{skill_graph:{guardrailReport:{}}},{source:'agent_tailored_resume'},{source:'resume_morph'}]){
  assert.equal(classifyResumeVerification({is_active:true,provenance:{verified:true,origin:'user_upload'},...marker},'resume_versions').verified,false,JSON.stringify(marker));
 }
});
test('confirmed-source classifier retains explicit user sources and narrow legacy active source support',async()=>{
 const {classifyResumeVerification}=await compiled;
 assert.equal(classifyResumeVerification({provenance:{verified:true,origin:'user_upload'}},'resume_versions').verified,true);
 assert.equal(classifyResumeVerification({source:'sona_upload',provenance:{verified:true,origin:'sona_upload'}},'resume_versions').verified,true);
 assert.equal(classifyResumeVerification({is_active:true},'resume_versions').kind,'legacy_user_approved');
 assert.equal(classifyResumeVerification({is_active:false},'resume_versions').verified,false);
});
test('malformed workspace lineage cannot fall through to legacy or explicit provenance',async()=>{
 const {classifyResumeVerification}=await compiled;
 const result=classifyResumeVerification({is_active:true,provenance:{verified:true,origin:'user_upload'},metadata:{workspace:{schemaVersion:1,kind:'experience',origin:'tailored'}}},'resume_versions');
 assert.equal(result.verified,false);
 assert.match(result.reason,/malformed|unavailable|generated/i);
});
test('sealed role-search sources require the top-level receipt and resume_versions namespace',async()=>{
 const {classifyResumeVerification}=await compiled;
 const id='source_'+ 'a'.repeat(64), hash='b'.repeat(64), confirmedAt='2026-10-10T12:00:00.000Z';
 const workspace={schemaVersion:2,kind:'source',purpose:'role_search',origin:'user_upload',sourceVersionId:id,sourceHash:hash,contentHash:hash,sourceConfirmedAt:confirmedAt};
 const receipt={schemaVersion:1,ownerId:'alice',sourceId:id,requestId:'8a0c59b0-72f4-457b-b77b-12892d1ea83c',contentHash:hash,packetHash:'c'.repeat(64),payloadHash:'d'.repeat(64),confirmedAt,contentHashEncoding:'sha256-stable-json-v1',hashEncoding:'sha256-json-stringify-v1'};
 const valid={id,user_id:'alice',content:{name:'Amina'},metadata:{workspace},source_confirmation_receipt:receipt};
 assert.equal(classifyResumeVerification(valid,'resume_versions').verified,true);
 assert.equal(classifyResumeVerification({...valid,source_confirmation_receipt:undefined,metadata:{workspace,source_confirmation_receipt:receipt}},'resume_versions').verified,false);
 assert.equal(classifyResumeVerification(valid,'vault').verified,false);
 assert.equal(classifyResumeVerification({...valid,metadata:{workspace:{...workspace,schemaVersion:1}}},'resume_versions').verified,false);
});
