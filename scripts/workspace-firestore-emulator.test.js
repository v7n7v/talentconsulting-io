const assert = require('node:assert/strict');
const test = require('node:test');
const {initializeApp, deleteApp} = require('firebase/app');
const {getAuth, connectAuthEmulator, signInAnonymously} = require('firebase/auth');
const {getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc} = require('firebase/firestore');
const {initializeApp: initializeAdmin, deleteApp: deleteAdmin} = require('firebase-admin/app');
const {getFirestore: getAdminFirestore} = require('firebase-admin/firestore');

const projectId = 'demo-taco-workspace';
for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (!/^127\.0\.0\.1:\d+$/.test(process.env[name] || '')) throw new Error(`${name} must explicitly point to the local emulator`);
}
const denied = error => String(error.code || error.message).includes('permission-denied');
let app, admin, db, server, uid;
test.before(async () => {
  admin = initializeAdmin({projectId}, 'workspace-rules-admin');
  server = getAdminFirestore(admin);
  app = initializeApp({projectId, apiKey:'fixture-key', authDomain:'localhost'}, 'workspace-rules-owner');
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, {disableWarnings:true});
  uid = (await signInAnonymously(auth)).user.uid;
  db = getFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  await server.doc(`users/${uid}/resume_versions/guarded`).set({content:{name:'Fixture person'}, guardrail_report:{validatorVersion:'fixture'}, source_resume_id:'source'});
  await server.doc(`users/${uid}/applications/packet`).set({status:'not_applied', packet_status:'ready_for_review', morph_succeeded:true, morph_guardrail_report:{validatorVersion:'fixture'}, company_name:'Example'});
  await server.doc(`users/${uid}/agent_queue/packet`).set({status:'pending', packetStatus:'needs_review', company:'Example'});
  await server.doc(`users/${uid}/agent_queue/approved`).set({status:'approved', packetStatus:'approved', human_review:{revision:'server-revision'}});
  await server.doc('users/another-person/resume_versions/private').set({content:{name:'Private'}});
});
test.after(async () => {if (app) await deleteApp(app); if (admin) await deleteAdmin(admin);});
const own = suffix => doc(db, `users/${uid}/${suffix}`);

test('an owner can save an unguarded source and read it', async () => {
  await setDoc(own('resume_versions/source'), {content:{name:'Fixture person'}, version_name:'Confirmed source'});
  assert.equal((await getDoc(own('resume_versions/source'))).data().version_name, 'Confirmed source');
});
test('a guarded resume is readable but cannot be overwritten or unguarded', async () => {
  assert.equal((await getDoc(own('resume_versions/guarded'))).exists(), true);
  await assert.rejects(updateDoc(own('resume_versions/guarded'), {content:{name:'Changed'}}), denied);
  await assert.rejects(setDoc(own('resume_versions/guarded'), {content:{name:'Changed'}}), denied);
});
test('client cannot forge a guarded version', async () => {
  await assert.rejects(setDoc(own('resume_versions/forged'), {content:{name:'Fixture'}, guardrail_report:{passed:true}}), denied);
});
test('owner cannot read another person’s source', async () => {
  await assert.rejects(getDoc(doc(db,'users/another-person/resume_versions/private')), denied);
});
test('account lifecycle is owner-readable but only server writable', async () => {
  const lifecycle = own('settings/accountLifecycle');
  await assert.rejects(setDoc(lifecycle, {status:'active'}), denied);
  await server.doc(`users/${uid}/settings/accountLifecycle`).set({status:'deactivated',requestId:'fixture'});
  assert.deepEqual((await getDoc(lifecycle)).data(), {status:'deactivated',requestId:'fixture'});

  await assert.rejects(updateDoc(lifecycle, {status:'active'}), denied);
  await assert.rejects(deleteDoc(lifecycle), denied);

  const nestedLifecycle = own('settings/accountLifecycle/children/record');
  await server.doc(`users/${uid}/settings/accountLifecycle/children/record`).set({status:'deactivated'});
  assert.equal((await getDoc(nestedLifecycle)).data().status, 'deactivated');
  await assert.rejects(setDoc(nestedLifecycle, {status:'active'}), denied);
  await assert.rejects(updateDoc(nestedLifecycle, {status:'active'}), denied);
  await assert.rejects(deleteDoc(nestedLifecycle), denied);
});
test('account lifecycle records remain private to their owner', async () => {
  await server.doc('users/another-person/settings/accountLifecycle').set({status:'deletion_confirmed'});
  const otherLifecycle = doc(db, 'users/another-person/settings/accountLifecycle');
  await assert.rejects(getDoc(otherLifecycle), denied);
  await assert.rejects(setDoc(otherLifecycle, {status:'active'}), denied);
  await assert.rejects(updateDoc(otherLifecycle, {status:'active'}), denied);
  await assert.rejects(deleteDoc(otherLifecycle), denied);
});
test('ordinary tracker state can change without forging packet proof', async () => {
  await updateDoc(own('applications/packet'), {status:'applied'});
  assert.equal((await getDoc(own('applications/packet'))).data().status, 'applied');
  await assert.rejects(updateDoc(own('applications/packet'), {morph_source_resume_hash:'forged'}), denied);
  await assert.rejects(updateDoc(own('applications/packet'), {cover_letter:'Replaced without review'}), denied);
});
test('client can create a manual tracker but cannot claim generated readiness', async () => {
  await setDoc(own('applications/manual'), {status:'not_applied', packet_status:'tracker_draft'});
  await assert.rejects(setDoc(own('applications/forged'), {status:'not_applied', packet_status:'ready_for_review'}), denied);
});
test('client cannot create or promote a tracker to server-origin provenance', async () => {
  for (const source of ['agent_queue', 'apply_pipeline']) {
    await assert.rejects(setDoc(own(`applications/forged-${source}`), {status:'not_applied', source}), denied);
    await assert.rejects(updateDoc(own('applications/manual'), {source}), denied);
  }
});

test('legacy clients cannot promote queue review or create a receipt', async () => {
  for (const patch of [
    {status:'approved',packetStatus:'approved'},
    {human_review:{revision:'forged'}},
    {application_id:'forged',packetStatus:'assist_apply'},
    {packet_revision:'forged'},
    {packet_job_description_hash:'forged'},
  ]) await assert.rejects(updateDoc(own('agent_queue/packet'), patch), denied);
});
test('approved packets retain feedback and retirement controls without weakening review', async () => {
  await updateDoc(own('agent_queue/approved'), {feedbackTags:['interested'],last_action_at:'fixture'});
  assert.equal((await getDoc(own('agent_queue/approved'))).data().human_review.revision,'server-revision');
  await updateDoc(own('agent_queue/packet'), {status:'dismissed',packetStatus:'dismissed',last_action_at:'fixture'});
});
test('ordinary application writes cannot forge a revision or review receipt', async () => {
  for (const patch of [{human_review:{revision:'forged'}},{packet_revision:'forged'},{packet_job_description_hash:'forged'}]) {
    await assert.rejects(updateDoc(own('applications/packet'), patch), denied);
  }
});

test('practice receipts and authoritative session scores cannot be forged by their owner', async () => {
  for (const [collection, value] of [
    ['practice_receipts', {feature:'gauntlets', reservedAt:'forged'}],
    ['interview_sessions', {usageReserved:true, scores:{score:100}}],
    ['skill_verifications', {score:100, verdict:'verified'}],
    ['skill_challenges', {prompt:'Trivial prompt', challengeType:'applied_challenge'}],
  ]) {
    await assert.rejects(setDoc(own(`${collection}/forged`), value), denied);
    await server.doc(`users/${uid}/${collection}/server-record`).set(value);
    await assert.rejects(updateDoc(own(`${collection}/server-record`), value), denied);
  }
  await assert.rejects(setDoc(own('usage/lifetime'), {gauntlets:0}), denied);
});

test('learning-day updates remain available without allowing proof or readiness forgery', async () => {
  await setDoc(own('study_progress/typescript'), {user_id:uid, skill:'TypeScript', skill_id:'typescript', category:'technical', total_days:4, completed_days:[], plan_data:{schedule:[]}, email_reminders:false, application_ids:[], job_title:null, company_name:null, started_at:'fixture', last_activity_at:'fixture'});
  await updateDoc(own('study_progress/typescript'), {completed_days:[1], last_activity_at:'later'});
  assert.deepEqual((await getDoc(own('study_progress/typescript'))).data().completed_days,[1]);
  for (const patch of [{readiness_score:100},{readiness_status:'verified'},{proof_level:'applied_challenge'},{best_readiness_score:100},{latest_verification_id:'forged'}]) await assert.rejects(updateDoc(own('study_progress/typescript'),patch),denied);
  await assert.rejects(setDoc(own('study_progress/forged'), {user_id:uid,skill:'Fake',readiness_status:'verified'}),denied);
  await server.doc(`users/${uid}/study_progress/typescript`).set({readiness_status:'verified',readiness_score:85},{merge:true});
  await updateDoc(own('study_progress/typescript'), {completed_days:[1,2]});
  assert.equal((await getDoc(own('study_progress/typescript'))).data().readiness_score,85);
});

test('the client study-progress create shape stays within the explicit rules contract', async () => {
  const clientShape = {
    user_id: uid,
    skill: 'Communication',
    skill_id: 'communication',
    category: 'soft',
    total_days: 4,
    completed_days: [],
    plan_data: { schedule: [] },
    email_reminders: false,
    application_ids: ['application-1'],
    job_title: 'Engineer',
    company_name: 'Example Co',
    started_at: 'fixture',
    last_activity_at: 'fixture',
  };
  await setDoc(own('study_progress/communication'), clientShape);
  assert.deepEqual((await getDoc(own('study_progress/communication'))).data(), clientShape);
  for (const field of ['readiness_status', 'readiness_score', 'proof_level', 'source_context', 'completed_task_ids', 'latest_verification_id']) {
    await assert.rejects(setDoc(own(`study_progress/forged-${field}`), { ...clientShape, [field]: field === 'readiness_score' ? 100 : 'forged' }), denied);
  }
});

test('real canonical reader includes mixed snake/camel/timestamp records across pages', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const {build} = require('esbuild');
  const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(),'application-reader-')), 'reader.cjs');
  globalThis.__workspaceRulesDb = server;
  await build({entryPoints:[path.join(__dirname,'../lib/application-records-server.ts')],outfile,bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'emulator-admin',setup(b){b.onResolve({filter:/^@\/lib\/firebase-admin$/},()=>({path:'admin',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getAdminDb = () => globalThis.__workspaceRulesDb;',loader:'js'}));}}]});
  const {readApplicationRecords} = require(outfile);
  const mixedUid = `${uid}-mixed`;
  const batch = server.batch();
  for (let index=0; index<252; index++) {
    const snake = index % 2 === 0;
    batch.set(server.doc(`users/${mixedUid}/applications/a${String(index).padStart(3,'0')}`), snake ? {company_name:`Snake${index}`,job_title:'Engineer',created_at:'2026-09-01T00:00:00.000Z',status:'applied',applied_at:'2026-09-27T12:00:00.000Z'} : {companyName:`Camel${index}`,jobTitle:'Designer',createdAt:new Date('2026-09-02T00:00:00.000Z'),status:'interviewing'});
  }
  await batch.commit();
  const all = await readApplicationRecords(mixedUid);
  assert.equal(all.records.length,252);assert.equal(all.complete,true);
  assert.equal(all.records.find(record=>record.id==='a001').company_name,'Camel1');
  assert.equal(all.records.find(record=>record.id==='a001').status,'interview_scheduled');
  assert.equal(all.records.find(record=>record.id==='a001').applied_at,undefined);
  assert.equal(all.records.find(record=>record.id==='a000').companyName,'Snake0');
  const partial = await readApplicationRecords(mixedUid,100);
  assert.equal(partial.records.length,100);assert.equal(partial.complete,false);
  assert.equal((await readApplicationRecords(`${uid}-empty`)).records.length,0);
});

test('real offer command transaction records one event for concurrent terminal retries', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path'); const {build}=require('esbuild');
  const outfile=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'offer-command-emulator-')),'route.cjs');
  globalThis.__workspaceRulesDb=server;globalThis.__workspaceRulesUid=uid;
  await build({entryPoints:[path.join(__dirname,'../app/api/applications/offer/route.ts')],outfile,bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'emulator-services',setup(b){
    b.onResolve({filter:/^@\/lib\/firebase-admin$/},()=>({path:'admin',namespace:'fixture'}));
    b.onResolve({filter:/^@\/lib\/api-auth$/},()=>({path:'auth',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='admin'?'export const getAdminDb=()=>globalThis.__workspaceRulesDb;':'export async function guardApiRoute(){return {user:{uid:globalThis.__workspaceRulesUid,tier:"pro"}}}',loader:'js'}));
  }}]});
  const route=require(outfile);await server.doc(`users/${uid}/applications/offer-atomic`).set({status:'offer',negotiation_status:'drafted'});
  const responses=await Promise.all([1,2,3].map(()=>route.POST({json:async()=>({applicationId:'offer-atomic',negotiationStatus:'accepted'})})));
  assert.ok(responses.every(response=>response.status===200));
  const saved=(await server.doc(`users/${uid}/applications/offer-atomic`).get()).data();
  assert.equal(saved.status,'accepted');assert.equal(saved.negotiation_status,'accepted');assert.equal(saved.offer_history.length,1);
});

test('resume-linked trackers deduplicate concurrent requests without merging different roles or losing history', async () => {
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {build}=require('esbuild');
  const outfile=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'tracker-command-emulator-')),'route.cjs');
  globalThis.__workspaceRulesDb=server;globalThis.__workspaceRulesUid=uid;
  await build({entryPoints:[path.join(__dirname,'../app/api/applications/from-resume/route.ts')],outfile,bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'emulator-services',setup(b){
    b.onResolve({filter:/^@\/lib\/firebase-admin$/},()=>({path:'admin',namespace:'fixture'}));
    b.onResolve({filter:/^@\/lib\/api-auth$/},()=>({path:'auth',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='admin'?'export const getAdminDb=()=>globalThis.__workspaceRulesDb;':'export async function guardApiRoute(){return {user:{uid:globalThis.__workspaceRulesUid,tier:"free"}}}',loader:'js'}));
  }}]});
  const {POST}=require(outfile);const invoke=data=>POST({json:async()=>data});
  await server.doc(`users/${uid}/resume_versions/tracker-source`).set({content:{name:'Fictional'}});
  const input={companyName:'Fictional Target',jobTitle:'Engineer',resumeVersionId:'tracker-source',morphedResumeName:'Fictional draft',talentDensityScore:0};
  const responses=await Promise.all([1,2,3].map(()=>invoke(input)));assert.ok(responses.every(response=>response.status===200));
  const results=await Promise.all(responses.map(response=>response.json()));assert.equal(new Set(results.map(result=>result.data.id)).size,1);
  const id=results[0].data.id;assert.equal(results[0].data.status,'not_applied');assert.equal(results[0].data.talent_density_score,0);
  const different=await (await invoke({...input,jobTitle:'Designer'})).json();assert.notEqual(different.data.id,id);
  await server.doc(`users/${uid}/applications/${id}`).update({status:'interviewed',outcome_history:[{outcome:'interview'}]});
  const retry=await (await invoke(input)).json();assert.equal(retry.data.status,'interviewed');assert.equal(retry.data.outcome_history.length,1);
  const legacy={...input,companyName:'Legacy employer'};
  await server.doc(`users/${uid}/applications/legacy-tracked`).set({company_name:legacy.companyName,job_title:legacy.jobTitle,resume_version_id:legacy.resumeVersionId,status:'applied'});
  assert.equal((await (await invoke(legacy)).json()).data.id,'legacy-tracked');
  assert.notEqual((await invoke({...input,resumeVersionId:'private-missing-source'})).status,200);
});


test('derived career twin and fit evidence are owner-readable but server-write-only', async () => {
  await setDoc(own('profile/main'), {full_name:'Fixture owner'});
  for (const path of ['profile/career_twin','fit_analyses/server-evidence']) {
    await assert.rejects(setDoc(own(path), {version:6,stale:false,healthScore:100}), denied);
    await server.doc(`users/${uid}/${path}`).set({version:6,stale:false,healthScore:20});
    assert.equal((await getDoc(own(path))).data().healthScore,20);
    await assert.rejects(updateDoc(own(path), {healthScore:100}), denied);
  }
});


test('writing monthly usage and nested receipts cannot be forged by owner clients', async () => {
 for (const path of ['usage/writing_monthly','usage/writing_monthly/receipts/request-fixture']) {
   await assert.rejects(setDoc(own(path), {usedWords:0,status:'success',response:{rewritten:'Forged'}}), denied);
   await server.doc(`users/${uid}/${path}`).set({usedWords:100,status:'reserved'});
   await assert.rejects(updateDoc(own(path), {usedWords:0,status:'failed'}), denied);
 }
});

test('actual writing transactions cap concurrent requests and replay settled output exactly', async () => {
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {build}=require('esbuild');
 const outfile=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'writing-meter-emulator-')),'usage.cjs');globalThis.__writingMeterEmulatorDb=server;
 await build({entryPoints:[path.join(__dirname,'../lib/usage-tracker.ts')],outfile,bundle:true,platform:'node',format:'cjs',logLevel:'silent',packages:'external',plugins:[{name:'local-admin',setup(b){
   b.onResolve({filter:/^@\/lib\/firebase-admin$/},()=>({path:'admin',namespace:'local'}));b.onLoad({filter:/.*/,namespace:'local'},()=>({contents:'export const getAdminDb=()=>globalThis.__writingMeterEmulatorDb;'}));
 }}]});
 // External Admin SDK resolves from the repository's dependency runtime.
 const Module=require('node:module');const previous=process.env.NODE_PATH;process.env.NODE_PATH=path.join(__dirname,'../node_modules');Module._initPaths();
 let meter;try{meter=require(outfile)}finally{if(previous===undefined)delete process.env.NODE_PATH;else process.env.NODE_PATH=previous;Module._initPaths()}
 const owner=`${uid}-writing-meter`;
 const results=await Promise.all(['request-one','request-two'].map(id=>meter.reserveWritingWords(owner,'free',300,id,id)));
 assert.equal(results.filter(result=>result.allowed).length,1);
 const active=results.find(result=>result.allowed);const expected={rewritten:'Exact fixture output',qualityDecision:'accepted_with_warnings'};
 await meter.settleWritingWords(owner,active.requestId,'success',expected,active.leaseToken);
 const repeated=await meter.reserveWritingWords(owner,'free',300,active.requestId,active.requestId);assert.equal(repeated.status,'success');assert.deepEqual(repeated.cachedResponse,expected);
 assert.equal((await server.doc(`users/${owner}/usage/writing_monthly`).get()).data().usedWords,300);
 assert.equal((await server.doc(`users/${owner}/usage/lifetime`).get()).data().writingTools,1);
});
