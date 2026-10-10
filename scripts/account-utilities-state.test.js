const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const source = fs.readFileSync(path.join(__dirname, '../app/suite/settings/page.tsx'), 'utf8');
const profile = source.slice(source.indexOf('function ProfileTab('), source.indexOf('// =====', source.indexOf('function ProfileTab(')));
const fixture = build({ stdin: { contents: `import {useState,useEffect,useRef} from 'react'; import {readProfileDraft,persistProfileDraft,restoreProfileDraft} from '../lib/profile-draft'; import {buildToolStory,storyStep} from '../lib/tool-story-adapters'; const useToolGuidance=()=>{}; const {auth,authHelpers,authFetch,showToast}=globalThis.__profileDeps; const motion=new Proxy({},{get:(_,key)=>key}); const AnimatePresence='presence'; export ${profile}`, loader:'tsx', resolveDir:__dirname }, bundle:true, platform:'node', format:'cjs', write:false, jsx:'automatic', plugins:[{name:'hooks',setup(api){ api.onResolve({filter:/^react(?:\/jsx-runtime)?$/},args=>({path:args.path,namespace:'hooks'}));api.onLoad({filter:/.*/,namespace:'hooks'},({path})=>({loader:'js',contents:path==='react'?'export const useState=(...a)=>globalThis.__hooks.useState(...a); export const useEffect=(...a)=>globalThis.__hooks.useEffect(...a); export const useRef=(...a)=>globalThis.__hooks.useRef(...a);':'export function jsx(type,props){return {type,props}} export const jsxs=jsx; export const Fragment="fragment";'}));}}] });
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
async function setup(loadResponse, nameUpdate) {
 const storage=new Map(); globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 let saveResponse;
 const calls=[]; const values=[]; const effects=[]; let cursor=0; let pending=[];
 globalThis.__hooks={
  useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value;}];},
  useRef(initial){const i=cursor++;if(!(i in values))values[i]={current:initial};return values[i];},
  useEffect(run,deps){const i=cursor++;if(!effects[i]||deps.some((v,n)=>v!==effects[i].deps[n])){pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:run()};});}},
 };
 const auth={currentUser:{uid:'alice'}};
 globalThis.__profileDeps={auth,authHelpers:{updateProfile:async()=>nameUpdate ? nameUpdate.promise : {success:true}},authFetch:async(url,options)=>{calls.push({url,options});return options?(saveResponse || new Response('{}')):(typeof loadResponse === 'function' ? loadResponse() : loadResponse instanceof Response ? loadResponse.clone() : loadResponse);},showToast(){}};
 const result=await fixture;const module={exports:{}};new Function('module','exports',result.outputFiles[0].text)(module,module.exports);
 const props={user:{uid:'alice',displayName:'Alice'},setUser(){}};
 function render(){cursor=0;const tree=module.exports.ProfileTab(props);const work=pending;pending=[];work.forEach(run=>run());return tree;}
 return {render,auth,props,calls,storage,setLoad(value){loadResponse=value;},setSaveResponse(value){saveResponse=value;},remount(){effects.forEach(effect=>effect?.cleanup?.());values.splice(0);effects.splice(0);pending=[];},unmount(){effects.forEach(effect=>effect?.cleanup?.());}};
}
function nodes(tree,predicate,out=[]){if(!tree||typeof tree!=='object')return out;if(Array.isArray(tree)){tree.forEach(node=>nodes(node,predicate,out));return out;}if(predicate(tree))out.push(tree);nodes(tree.props?.children,predicate,out);return out;}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function button(tree,label){return nodes(tree,node=>node.type==='button'&&JSON.stringify(node.props.children).includes(label))[0];}

test('loaded ProfileTab cannot overwrite cloud profile after a failed load, and offers retry',async()=>{
 const state=await setup(new Response('{}',{status:503}));state.render();await settle();let tree=state.render();
 button(tree,'Edit Profile').props.onClick();tree=state.render();
 const save=button(tree,'Save Profile');assert.equal(save.props.disabled,true);await save.props.onClick();
 assert.equal(state.calls.filter(call=>call.options?.method==='PATCH').length,0);
 assert.ok(button(tree,'Retry'));state.unmount();
});

test('loaded ProfileTab stops the second save step when account changes during name update',async()=>{
 const nameUpdate=deferred();const state=await setup(new Response(JSON.stringify({profile:{phone:'111',bio:'Alice bio'}})),nameUpdate);
 state.render();await settle();let tree=state.render();button(tree,'Edit Profile').props.onClick();tree=state.render();
 const saving=button(tree,'Save Profile').props.onClick();state.auth.currentUser={uid:'bob'};nameUpdate.resolve({success:true});await saving;
 assert.equal(state.calls.filter(call=>call.options?.method==='PATCH').length,0);state.unmount();
});

test('loaded ProfileTab ignores a late load after unmount',async()=>{
 const load=deferred();const response={ok:true,json:()=>load.promise};const state=await setup(response);state.render();state.unmount();
 load.resolve({profile:{phone:'private Alice number',bio:'private Alice biography'}});await settle();
 const tree=state.render();assert.equal(JSON.stringify(tree).includes('private Alice'),false);
});


test('ProfileTab remount restores dirty fields while refreshing untouched server fields',async()=>{
 const state=await setup(new Response(JSON.stringify({profile:{phone:'111',bio:'Server bio'}})));
 state.render();await settle();let tree=state.render();button(tree,'Edit Profile').props.onClick();tree=state.render();
 nodes(tree,node=>node.type==='textarea')[0].props.onChange({target:{value:'Unsaved personal bio'}});state.render();state.render();
 assert.equal(JSON.parse(state.storage.get('taco:profile-draft:alice')).values.bio,'Unsaved personal bio');
 state.setLoad(new Response(JSON.stringify({profile:{phone:'222',bio:'Updated server bio'}})));state.remount();state.render();await settle();tree=state.render();state.render();
 assert.equal(nodes(tree,node=>node.type==='textarea')[0].props.value,'Unsaved personal bio');assert.equal(nodes(tree,node=>node.type==='input'&&node.props.type==='tel')[0].props.value,'222');
 state.unmount();
});
test('ProfileTab retains edits across blocked-storage remount, failed reload, and failed save',async()=>{
 const state=await setup(new Response(JSON.stringify({profile:{phone:'111',bio:'Initial bio'}})));
 state.render();await settle();let tree=state.render();button(tree,'Edit Profile').props.onClick();tree=state.render();
 globalThis.localStorage.setItem=()=>{throw Error('blocked')};
 nodes(tree,node=>node.type==='textarea')[0].props.onChange({target:{value:'Retained in memory'}});state.render();tree=state.render();assert.match(JSON.stringify(tree),/Device storage is unavailable/);
 state.remount();state.render();await settle();tree=state.render();assert.equal(nodes(tree,node=>node.type==='textarea')[0].props.value,'Retained in memory');
 state.setSaveResponse(new Response(JSON.stringify({error:'Write failed'}),{status:503}));await button(tree,'Save Profile').props.onClick();tree=state.render();assert.equal(nodes(tree,node=>node.type==='textarea')[0].props.value,'Retained in memory');assert.match(JSON.stringify(tree),/Write failed/);
 state.setLoad(new Response('{}',{status:503}));state.remount();state.render();await settle();tree=state.render();button(tree,'Edit Profile').props.onClick();tree=state.render();assert.equal(button(tree,'Save Profile').props.disabled,true);state.setLoad(new Response(JSON.stringify({profile:{phone:'999',bio:'Latest server'}})));button(tree,'Retry').props.onClick();state.render();await settle();tree=state.render();assert.equal(nodes(tree,node=>node.type==='textarea')[0].props.value,'Retained in memory');assert.equal(nodes(tree,node=>node.type==='input'&&node.props.type==='tel')[0].props.value,'999');state.unmount();
});
