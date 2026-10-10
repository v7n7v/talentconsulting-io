const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {buildSync}=require('esbuild');
const ts=require('typescript');

function companyChangeHandler(page) {
 const source=ts.createSourceFile('cover-letter/page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let handler;
 const visit=node=>{
  if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))&&node.tagName.getText(source)==='input'){
   const attributes=node.attributes.properties.filter(ts.isJsxAttribute);
   const value=attributes.find(attribute=>attribute.name.getText(source)==='value');
   if(value?.initializer?.expression?.getText(source)==='company')handler=attributes.find(attribute=>attribute.name.getText(source)==='onChange')?.initializer?.expression;
  }
  ts.forEachChild(node,visit);
 };
 visit(source);assert.ok(handler,'The actual company input must expose its change handler');
 return handler.getText(source);
}

function fixture(){
 let owner='alice';let active;
 const values=new Map();const fakeWindow={location:{pathname:'/suite/cover-letter',search:''},sessionStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},addEventListener(){},removeEventListener(){}};
 const store=selector=>selector?selector({user:owner?{uid:owner}:null}):{user:owner?{uid:owner}:null};store.getState=()=>({user:owner?{uid:owner}:null});
 const depsEqual=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
 const hooks={
  useState(initial){const self=active,i=self.cursor++;if(!(i in self.slots))self.slots[i]=initial;return [self.slots[i],next=>{const value=typeof next==='function'?next(self.slots[i]):next;if(!Object.is(value,self.slots[i])){self.slots[i]=value;self.dirty=true;}}];},
  useRef(initial){const self=active,i=self.cursor++;return self.slots[i]||(self.slots[i]={current:initial});},
  useCallback(fn,deps){const self=active,i=self.cursor++;if(!depsEqual(self.slots[i]?.deps,deps))self.slots[i]={fn,deps};return self.slots[i].fn;},
  useEffect(run,deps){const self=active,i=self.cursor++;if(!depsEqual(self.slots[i]?.deps,deps)){self.effects.push(()=>{self.slots[i]?.cleanup?.();self.slots[i]={deps,cleanup:run()};});}},
  useSyncExternalStore(subscribe,getSnapshot){const self=active,i=self.cursor++;if(!self.slots[i])self.slots[i]={cleanup:subscribe(()=>{self.dirty=true;})};return getSnapshot();},
 };
 const page=fs.readFileSync(path.join(__dirname,'../app/suite/cover-letter/page.tsx'),'utf8');
 const start=page.indexOf('export default function CoverLetterPage() {');const stop=page.indexOf('  // Load saved cover letters',start);
 const consumer=page.slice(start,stop).replace('export default function CoverLetterPage','export function Consumer');
 const handler=companyChangeHandler(page);
 const contents=`import {useState,useEffect} from 'react';import {useStore} from '@/lib/store';import {useApplicationKitContext} from '@/hooks/useApplicationKitContext';import {buildToolStory,storyStep} from '@/lib/tool-story-adapters';export * as kit from '@/lib/application-kit';const useAuthGate=()=>({});const useToolGuidance=()=>{};${consumer} return {company,jobTitle,result,kitContext,updateContext,captureGuard,changeCompany:${handler}};}`;
 const build=buildSync({stdin:{contents,loader:'tsx',resolveDir:path.join(__dirname,'..')},bundle:true,platform:'node',format:'cjs',write:false,external:['react','next/navigation','@/lib/store'],logLevel:'silent'});
 const mod=new Module(__filename,module);mod.require=id=>id==='react'?hooks:id==='next/navigation'?{usePathname:()=>fakeWindow.location.pathname,useSearchParams:()=>fakeWindow.location.search}:id==='@/lib/store'?{useStore:store}:require(id);
 global.__kitHookWindow=fakeWindow;mod._compile(`const window=global.__kitHookWindow;${build.outputFiles[0].text}`,__filename);delete global.__kitHookWindow;
 const consumerInstance=()=>{const state={cursor:0,slots:[],effects:[],dirty:true,value:null};return {render(){let count=0;do{state.dirty=false;state.cursor=0;state.effects=[];active=state;state.value=mod.exports.Consumer();state.effects.forEach(fn=>fn());if(++count>20)throw Error('render loop');}while(state.dirty);return state.value;},unmount(){state.slots.forEach(slot=>slot?.cleanup?.());}};};
 return {kit:mod.exports.kit,create:consumerInstance,window:fakeWindow,setOwner(value){owner=value;}};
}

test('loaded hook and Cover Letter hydration preserve typing and synchronize two consumers',()=>{
 const f=fixture();f.kit.mergeApplicationKitContext({company:'Initial',jobTitle:'Engineer'});
 const first=f.create(),second=f.create();let a=first.render();second.render();
 a.changeCompany({target:{value:'Newly typed company'}});
 a=first.render();const b=second.render();assert.equal(a.company,'Newly typed company');assert.equal(b.company,'Newly typed company');assert.equal(a.jobTitle,'Engineer');
 a.updateContext({coverLetterResult:{status:'success',data:{coverLetter:'Draft'}}});
 assert.equal(first.render().company,'Newly typed company');assert.equal(second.render().result.coverLetter,'Draft');
 first.unmount();second.unmount();
});

test('loaded hook guards fail after unmount and owner/scope transitions cannot hydrate another draft',()=>{
 const f=fixture();f.kit.mergeApplicationKitContext({company:'Alice private'});const consumer=f.create();let current=consumer.render();const guard=current.captureGuard('coverLetterResult');consumer.unmount();assert.equal(guard(),false);
 f.setOwner('bob');const bob=f.create();assert.equal(bob.render().company,'');bob.unmount();
 f.setOwner('alice');f.window.location.search='?application=other';const other=f.create();assert.equal(other.render().company,'');other.unmount();
});
