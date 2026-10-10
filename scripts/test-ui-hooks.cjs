const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {build}=require('esbuild');
// Load the real component bodies. Imported service/UI boundaries are replaced,
// while all local handlers, state transitions and view calculations run intact.
async function loadBodies(file,extra='') {
 const outfile=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'application-ui-')),'component.cjs');
 const source=fs.readFileSync(file,'utf8').replace(/^import\s[\s\S]*?;\n/gm,'');
 await build({stdin:{contents:`import {useState,useRef,useEffect,useMemo,useCallback} from 'react';\n${source}\n${extra}`,loader:'tsx',resolveDir:process.cwd()},outfile,jsx:'automatic',bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'hooks',setup(api){api.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:a.path,namespace:'mock'}));api.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='react'?`export const useState=(...a)=>globalThis.__appUi.useState(...a),useRef=(...a)=>globalThis.__appUi.useRef(...a),useEffect=(...a)=>globalThis.__appUi.useEffect(...a),useMemo=(...a)=>globalThis.__appUi.useMemo(...a),useCallback=(fn,deps)=>globalThis.__appUi.useMemo(()=>fn,deps);`:`export const jsx=(type,props)=>({type,props}),jsxs=jsx,Fragment='fragment';`,loader:'js'}));}}]});return require(outfile);
}
function runtime(Component,props={}) {
 const slots=[];let cursor=0,dirty=true,effects=[],tree;const cleanups=[];const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const ui={props,user:{uid:'alice'},toasts:[],storage:new Map(),fetch:async()=>{throw Error('Unexpected fetch')},
 useState(v){const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return[slots[i],next=>{next=typeof next==='function'?next(slots[i]):next;if(!Object.is(slots[i],next)){slots[i]=next;dirty=true}}]},
 useRef(v){const i=cursor++;return slots[i]||(slots[i]={current:v})},useMemo(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value},
 useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]={deps};effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}},
 flush(){globalThis.__appUi=ui;let count=0;do{if(++count>30)throw Error('Render loop');dirty=false;cursor=0;tree=Component(ui.props);const run=effects;effects=[];run.forEach(fn=>fn())}while(dirty);return tree},
 async settle(){for(let i=0;i<5;i++)await Promise.resolve();ui.flush()},unmount(){cleanups.forEach(fn=>fn?.())},
 nodes(){const result=[];const walk=n=>{if(Array.isArray(n))return n.forEach(walk);if(n?.props){result.push(n);walk(n.props.children);walk(n.props.actions)}};walk(tree);return result},
 find(fn){const result=ui.nodes().find(fn);assert.ok(result,'Expected UI node');return result},text(){return JSON.stringify(tree,(_,value)=>typeof value==='function'?value.name:value)},
 };
 globalThis.__appUi=ui;globalThis.useStore=Object.assign(selector=>selector?selector({user:ui.user}):{user:ui.user},{getState:()=>({user:ui.user})});
 globalThis.authFetch=(...args)=>ui.fetch(...args);globalThis.showToast=(...args)=>ui.toasts.push(args);globalThis.useUserTier=()=>({tier:'pro',loading:false,isPro:true});
 globalThis.localStorage={getItem:key=>ui.storage.get(key)||null,setItem:(key,value)=>ui.storage.set(key,value),removeItem:key=>ui.storage.delete(key)};
 globalThis.window={location:{search:'',pathname:'/suite/applications',hash:''},history:{replaceState(){}},confirm:()=>true,requestAnimationFrame:fn=>fn(),addEventListener(){},removeEventListener(){},setTimeout:()=>1,clearTimeout(){}};globalThis.confirm=()=>true;
 globalThis.document={activeElement:{isConnected:true,focus(){}},getElementById:()=>null,querySelector:()=>null};
 globalThis.motion=new Proxy({},{get:(_,name)=>name});globalThis.AnimatePresence='presence';
 for(const name of ['Link','TacoName','TacoText','ManualApplicationForm','MobileStickyActionBar','AssistantThinkingTile','AssistantMark','SuitePanel','SuiteToolHeader','SuiteToolIcon','SuiteToolShell','ApplicationsContext','PacketResumeDocument'])globalThis[name]=name;
 globalThis.offerInputSignature=details=>JSON.stringify(details??null);
 globalThis.createApplicationsLifecycleGuard=()=>{let mounted=false,generation=0,owner;return{setup(value){mounted=true;owner=value},cleanup(){mounted=false;generation++},begin(value){owner=value;return ++generation},isCurrent(token,value){return mounted&&token===generation&&owner===value}}};
 return ui;
}

module.exports={loadBodies,runtime};
