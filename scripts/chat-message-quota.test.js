const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSync } = require('esbuild');
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chat-quota-')), 'quota.cjs');
buildSync({entryPoints:[path.join(__dirname,'../lib/assistant/chat-message-quota.ts')],outfile:file,bundle:true,platform:'node',format:'cjs'});
const quota = require(file);
const operations = new WeakMap();
async function reserve(db, ...args) { const result = await quota.reserveChatMessage(db, ...args); if(result.operationId) { if(!operations.has(db)) operations.set(db,new Map()); operations.get(db).set(args[0]+'/'+args[2],result.operationId); } return result; }
async function finish(db, uid, id, response, charge=true, operationId) { return quota.finishChatMessage(db,uid,id,response,charge,operationId || operations.get(db)?.get(uid+'/'+id)); }
function database(){
 const rows=new Map();let queue=Promise.resolve();
 const ref=p=>({path:p,collection:n=>ref(p+'/'+n),doc:n=>ref(p+'/'+n)});
 return {rows,collection:n=>ref(n),runTransaction(fn){const run=queue.then(async()=>{const writes=[];const result=await fn({get:async r=>({exists:rows.has(r.path),data:()=>structuredClone(rows.get(r.path))}),set(r,v,o){writes.push([r.path,v,o]);}});for(const [p,v,o] of writes) rows.set(p,o?.merge?{...rows.get(p),...structuredClone(v)}:structuredClone(v));return result;});queue=run.catch(()=>{});return run;}};
}
test('concurrent final pro slot grants one provider operation; retry replays once without recharging',async()=>{
 const db=database();let calls=0;
 async function request(id){const result=await reserve(db,'a','pro',id,'same');if(result.kind==='reserved'){calls++;await finish(db,'a',id,{body:'answer',status:200});}return result;}
 const results=await Promise.all([request('request1'),request('request2')]);
 assert.equal(results.filter(r=>r.kind==='reserved').length,1);assert.equal(calls,1);
 const replay=await request('request1');assert.equal(replay.kind,'replay');assert.equal(replay.response.body,'answer');assert.equal(calls,1);
 assert.equal(db.rows.get('users/a/usage/sona').weeklyCount,1);
});
test('failed work releases reservation; same request retries and counts only success',async()=>{
 const db=database();assert.equal((await reserve(db,'a','pro','request1','same')).kind,'reserved');
 assert.equal((await reserve(db,'a','pro','request1','same')).kind,'pending');
 await finish(db,'a','request1',null);
 assert.equal((await reserve(db,'a','pro','request1','same')).kind,'reserved');
 await finish(db,'a','request1',{body:'ok',status:200});await finish(db,'a','request1',{body:'ok',status:200});
 assert.equal(db.rows.get('users/a/usage/sona').weeklyCount,1);assert.deepEqual(db.rows.get('users/a/usage/sona').messageReservations,{});
});
test('receipt identity is owner-bound and rejects changed input; free cap remains two',async()=>{
 const db=database();await reserve(db,'a','free','request1','one');
 assert.equal((await reserve(db,'a','free','request1','two')).kind,'conflict');
 assert.equal((await reserve(db,'b','free','request1','two')).kind,'reserved');
 assert.equal((await reserve(db,'a','free','request2','two')).kind,'reserved');
 assert.equal((await reserve(db,'a','free','request3','three')).kind,'denied');
});
test('unsuccessful harness result is cached but does not consume a message; unlimited stays unlimited',async()=>{
 const db=database();await reserve(db,'a','pro','request1','one');await finish(db,'a','request1',{body:'unsuccessful',status:200},false);
 assert.equal((await reserve(db,'a','pro','request1','one')).kind,'replay');assert.equal((await reserve(db,'a','pro','request2','two')).kind,'reserved');
 for(let i=0;i<5;i++){await reserve(db,'max','studio','request'+i,''+i);await finish(db,'max','request'+i,{body:'ok',status:200});}
 assert.equal(db.rows.get('users/max/usage/sona').lifetimeCount,undefined);
});
const vm=require('node:vm');
const {transformSync}=require('esbuild');
function loadPost(db, handler){
 const source=fs.readFileSync(path.join(__dirname,'../app/api/agent/chat/route.ts'),'utf8');
 const start=source.indexOf('export async function POST(');const end=source.indexOf('\nasync function handleChatMessage',start);
 const code=transformSync(source.slice(start,end).replace('export async function','async function')+'\nglobalThis.loadedPost=POST;', {loader:'ts',target:'es2022'}).code;
 const env={Response,console:{error(){}},guardApiRoute:async()=>({user:{uid:'a',tier:'pro'}}),randomUUID:()=> 'generated-request',getAdminDb:()=>db,reserveChatMessage:reserve,finishChatMessage:finish,stageChatResponse:quota.stageChatResponse,chatRequestFingerprint:require(file).chatRequestFingerprint,handleChatMessage:handler};
 vm.createContext(env);vm.runInContext(code,env);return env.loadedPost;
}
const request=(id,text='hello')=>({json:async()=>({requestId:id,messages:[{role:'user',content:text}]})});
test('loaded POST suppresses provider on denied quota and pending duplicate, then replays exact response',async()=>{
 const db=database();let calls=0,release,started;
 const gate=new Promise(r=>release=r),ready=new Promise(r=>started=r);
 const post=loadPost(db,async()=>{calls++;started();await gate;return Response.json({message:'answer',conversationId:'saved-conversation'});});
 const first=post(request('request1'));await ready;
 assert.equal((await post(request('request1'))).status,409);
 assert.equal((await post(request('request2'))).status,403);assert.equal(calls,1);
 release();assert.equal((await first).status,200);
 const replay=await post(request('request1'));assert.equal(replay.status,200);assert.equal((await replay.json()).conversationId,'saved-conversation');assert.equal(calls,1);
 assert.equal((await post(request('request1','changed'))).status,409);
});
test('loaded POST provider failure releases quota and same-ID retry succeeds',async()=>{
 const db=database();let calls=0;
 const post=loadPost(db,async()=>++calls===1?Response.json({error:'Provider unavailable'},{status:503}):Response.json({message:'recovered'}));
 assert.equal((await post(request('request1'))).status,503);
 assert.equal((await post(request('request1'))).status,200);assert.equal(calls,2);
 assert.equal(db.rows.get('users/a/usage/sona').weeklyCount,1);
});
function expire(db,uid,id){
 const usage=db.rows.get(`users/${uid}/usage/sona`);usage.messageReservations[id].expiresAt=Date.now()-1;
 db.rows.get(`users/${uid}/usage/sona/requests/${id}`).expiresAt=Date.now()-1;
}
test('orphan lease releases capacity but same request never starts tools again',async()=>{
 const db=database();const old=await reserve(db,'a','pro','orphan-request','one');expire(db,'a','orphan-request');
 let calls=0;const post=loadPost(db,async()=>{calls++;return Response.json({message:'new'});});
 // Matching input digest is required independently of expiration.
 db.rows.get('users/a/usage/sona/requests/orphan-request').fingerprint=quota.chatRequestFingerprint({messages:[{role:'user',content:'hello'}]});
 const interrupted=await post(request('orphan-request'));assert.equal(interrupted.status,409);assert.equal((await interrupted.json()).code,'MESSAGE_INTERRUPTED');assert.equal(calls,0);
 assert.equal((await post(request('new-request'))).status,200);assert.equal(calls,1);
 assert.equal(await quota.finishChatMessage(db,'a','orphan-request',{body:'late',status:200},true,old.operationId),false);
 assert.equal(db.rows.get('users/a/usage/sona').weeklyCount,1);
});
test('expired staged response replays safely without tools, late worker cannot overwrite it',async()=>{
 const db=database();const lease=await reserve(db,'a','pro','request1','one');
 assert.equal(await quota.stageChatResponse(db,'a','request1',lease.operationId,{body:'saved answer',status:200}),true);
 expire(db,'a','request1');
 const recovered=await reserve(db,'a','pro','request1','one');assert.equal(recovered.kind,'replay');assert.equal(recovered.response.body,'saved answer');
 assert.equal(await quota.stageChatResponse(db,'a','request1',lease.operationId,{body:'late overwrite',status:200}),false);
 assert.equal((await reserve(db,'a','pro','request2','two')).kind,'reserved');
});
test('operation ownership prevents old attempt finalizing a successful same-ID retry',async()=>{
 const db=database();const first=await reserve(db,'a','pro','request1','one');await quota.finishChatMessage(db,'a','request1',null,false,first.operationId);
 const second=await reserve(db,'a','pro','request1','one');assert.notEqual(second.operationId,first.operationId);
 assert.equal(await quota.finishChatMessage(db,'a','request1',{body:'old',status:200},true,first.operationId),false);
 assert.equal(await quota.finishChatMessage(db,'a','request1',{body:'new',status:200},true,second.operationId),true);
 assert.equal((await reserve(db,'a','pro','request1','one')).response.body,'new');
});
