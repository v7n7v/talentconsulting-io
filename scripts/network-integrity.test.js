const test=require('node:test');const assert=require('node:assert/strict');const {build}=require('esbuild');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
async function load(entry){const outfile=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'network-')),'test.cjs');const mocks={
 'next/server':`export class NextResponse extends Response{static json(body,init){return new Response(JSON.stringify(body),init)}}`,
 '@/lib/api-auth':`export async function guardApiRoute(){return {user:{uid:globalThis.networkOwner||'alice'}}}`,
 '@/lib/firebase-admin':`export function getAdminDb(){return globalThis.networkDB}`,
 'firebase-admin/firestore':`export const FieldPath={documentId:()=> '__name__'};export const FieldValue={serverTimestamp:()=> 'now'}`,
 '@/lib/monitor':`export const monitor={critical(){}}`,
};await build({entryPoints:[path.join(__dirname,'..',entry)],outfile,bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'mocks',setup(b){for(const id of Object.keys(mocks)){b.onResolve({filter:new RegExp('^'+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')},()=>({path:id,namespace:'mock'}));}b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({contents:mocks[path],loader:'js'}));}}]});return require(outfile);}
function db(seed={}){const docs=new Map(Object.entries(seed));let queue=Promise.resolve();let fail=false;
 const ref=(p,cursor='',limit=Infinity)=>({path:p,id:p.split('/').pop(),collection:k=>ref(p+'/'+k),doc:k=>ref(p+'/'+k),orderBy:()=>ref(p,cursor,limit),startAfter:k=>ref(p,k,limit),limit:n=>ref(p,cursor,n),get:async()=>{if(docs.has(p))return {exists:true,id:p.split('/').pop(),data:()=>docs.get(p)};return {exists:false,data:()=>undefined,docs:[...docs.entries()].filter(([key])=>key.startsWith(p+'/')&&!key.slice(p.length+1).includes('/')&&key.slice(p.length+1)>cursor).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([key,value])=>({id:key.split('/').pop(),data:()=>value}))};},update:async v=>{if(fail)throw Error('write failed');docs.set(p,{...docs.get(p),...v})},delete:async()=>docs.delete(p)});
 return {docs,collection:k=>ref(k),set fail(v){fail=v},runTransaction(fn){const run=queue.then(()=>fn({get:r=>r.get(),update:(r,v)=>{if(fail)throw Error('write failed');docs.set(r.path,{...docs.get(r.path),...v})}}));queue=run.catch(()=>{});return run;}};
}
const route=load('app/api/agent/network/route.ts');const client=load('lib/network-client-state.ts');
const request=body=>({json:async()=>body});
test('failed interaction keeps exact note; concurrent retries save once and changed retry conflicts',async()=>{
 const api=await route;globalThis.networkDB=db({'users/alice/network_contacts/a':{name:'A',interactions:[]}});const body={action:'log_interaction',id:'a',requestId:'stable-key',interactionType:'note',note:'  Important\nexact note  ',followUpDate:'2026-10-01'};
 globalThis.networkDB.fail=true;assert.equal((await api.POST(request(body))).status,500);globalThis.networkDB.fail=false;
 const responses=await Promise.all([api.POST(request(body)),api.POST(request(body))]);assert.ok(responses.every(r=>r.status===200));const saved=globalThis.networkDB.docs.get('users/alice/network_contacts/a').interactions;assert.equal(saved.length,1);assert.equal(saved[0].note,body.note);
 assert.equal((await api.POST(request({...body,note:'changed'}))).status,409);
});
test('stable document cursor discovers contact 101 even when earlier contact is updated',async()=>{
 const api=await route;const records=Object.fromEntries(Array.from({length:101},(_,i)=>['users/alice/network_contacts/c'+String(i).padStart(3,'0'),{name:'Contact '+i,updated_at:i}]));records['users/bob/network_contacts/private']={name:'Secret'};globalThis.networkDB=db(records);
 const first=await (await api.GET({nextUrl:new URL('https://fixture/api/agent/network')})).json();assert.equal(first.contacts.length,100);assert.equal(first.nextCursor,'c099');globalThis.networkDB.docs.get('users/alice/network_contacts/c000').updated_at=9999;
 const second=await (await api.GET({nextUrl:new URL('https://fixture/api/agent/network?cursor='+first.nextCursor)})).json();assert.equal(second.contacts.length,1);assert.equal(second.contacts[0].id,'c100');assert.equal(second.nextCursor,null);
});
test('owner namespace and date/link validation reject foreign or invalid changes',async()=>{
 const api=await route;globalThis.networkDB=db({'users/bob/network_contacts/private':{name:'Secret',interactions:[]}});
 assert.equal((await api.POST(request({action:'log_interaction',id:'private',requestId:'r',note:'x'}))).status,404);
 for(const bad of [{followUpDate:'2026-02-30'},{linkedin:'javascript:alert(1)'},{linkedin:'https://linkedin.com.evil.test/a'}])assert.equal((await api.POST(request({action:'create',name:'A',...bad}))).status,400);
});
test('deferred client saves preserve failed or edited notes and ignore old owner/selection',async()=>{
 const {networkRequestIsCurrent,saveNetworkDraft}=await client;assert.equal(networkRequestIsCurrent({owner:'a',selection:'1'},{owner:'a',selection:'2'}),false);assert.equal(networkRequestIsCurrent({owner:'a'},{owner:'b'}),false);
 let draft={note:'exact text'};let resolve;const failed=saveNetworkDraft({...draft},()=>new Promise(r=>resolve=r),()=>draft,()=>{draft={note:''}});resolve(false);await failed;assert.equal(draft.note,'exact text');
 const pending=saveNetworkDraft({...draft},()=>new Promise(r=>resolve=r),()=>draft,()=>{draft={note:''}});draft={note:'edited while saving'};resolve(true);await pending;assert.equal(draft.note,'edited while saving');
 const ok=await saveNetworkDraft({...draft},async()=>true,()=>draft,()=>{draft={note:''}});assert.equal(ok,true);assert.equal(draft.note,'');
});
