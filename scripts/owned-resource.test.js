const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const result = buildSync({ entryPoints:[path.join(__dirname,'../hooks/useOwnedResource.ts')], bundle:true, write:false, platform:'node', format:'cjs', external:['react','@/lib/store','@/lib/auth-fetch'],logLevel:'silent' });
function deferred() { let resolve; const promise=new Promise(r=>resolve=r);return {promise,resolve}; }
function setup() {
  let user={uid:'alice'}, cursor=0, pending=[], exposed; const slots=[];
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const requests=[]; const fetch=async(url,options)=>{const task=deferred();requests.push({url,options,...task});return task.promise;};
  const hooks={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
    useCallback(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,fn};return slots[i].fn;},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){const previous=slots[i];slots[i]={deps};pending.push(()=>{previous?.cleanup?.();slots[i].cleanup=fn();});}},
  };
  const store=selector=>selector({user});store.getState=()=>({user});
  const mod = new Module(__filename,module);mod.require=id=>id==='react'?hooks:id==='@/lib/store'?{useStore:store}:id==='@/lib/auth-fetch'?{authFetch:fetch}:require(id);
  mod._compile(result.outputFiles[0].text,__filename);
  const validate=value=>!!value&&typeof value.count==='number';
  return {requests,setUser:value=>{user=value;},render(runEffects=true){cursor=0;exposed=mod.exports.useOwnedResource('/api/fixture',validate);if(runEffects){const list=pending;pending=[];list.forEach(fn=>fn());}return exposed;},unmount(){slots.forEach(slot=>slot?.cleanup?.());}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const response=data=>({ok:true,json:async()=>data});
test('owner changes hide previous data synchronously and late requests cannot restore it',async()=>{
 const ui=setup();ui.render();ui.requests[0].resolve(response({count:7}));await settle();assert.equal(ui.render().data.count,7);
 const oldReload=ui.render().reload();ui.setUser({uid:'bob'});assert.equal(ui.render(false).data,null);ui.render();
 ui.requests[1].resolve(response({count:99}));await oldReload;assert.equal(ui.render().data,null);
 ui.requests[2].resolve(response({count:2}));await settle();assert.equal(ui.render().data.count,2);
 ui.setUser(null);assert.equal(ui.render(false).data,null);
});
test('a failed or malformed refresh retains last good data with a visible error',async()=>{
 const ui=setup();ui.render();ui.requests[0].resolve(response({count:7}));await settle();
 let retry=ui.render().reload();ui.requests[1].resolve({ok:false,status:503});await retry;assert.equal(ui.render().data.count,7);assert.ok(ui.render().error);
 retry=ui.render().reload();ui.requests[2].resolve(response({unexpected:true}));await retry;assert.equal(ui.render().data.count,7);assert.match(ui.render().error,/incomplete/);
 retry=ui.render().reload();ui.requests[3].resolve(response({count:0}));await retry;assert.equal(ui.render().data.count,0);assert.equal(ui.render().error,null);
});
test('latest request wins and unmount aborts outstanding work',async()=>{
 const ui=setup();ui.render();const older=ui.render().reload();const newest=ui.render().reload();
 assert.equal(ui.requests[1].options.signal.aborted,true);
 ui.requests[2].resolve(response({count:3}));await newest;ui.requests[1].resolve(response({count:2}));await older;assert.equal(ui.render().data.count,3);
 const last=ui.render().reload();ui.unmount();assert.equal(ui.requests[3].options.signal.aborted,true);ui.requests[3].resolve(response({count:4}));await last;assert.equal(ui.render(false).data.count,3);
});
