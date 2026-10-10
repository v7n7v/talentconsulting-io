const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
// Execute the actual client component functions with deterministic React hook
// scheduling and mock services. These tests cover state transitions, not layout.
async function loadPage(entry) {
 const outfile=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'writing-state-')),'page.cjs');
 const mocks={
  react:`export const useState=(...a)=>globalThis.__ui.useState(...a); export const useRef=(...a)=>globalThis.__ui.useRef(...a); export const useEffect=(...a)=>globalThis.__ui.useEffect(...a); export const useLayoutEffect=(...a)=>globalThis.__ui.useEffect(...a); export const useMemo=(...a)=>globalThis.__ui.useMemo(...a); export const useCallback=(fn,deps)=>globalThis.__ui.useMemo(()=>fn,deps);`,
  'react/jsx-runtime':`export const jsx=(type,props)=>({type,props}); export const jsxs=jsx; export const Fragment='fragment';`,
  'framer-motion':`export const motion=new Proxy({}, {get:(_,name)=>name}); export const AnimatePresence='presence'; export const useReducedMotion=()=>true;`,
  mammoth:`export default {extractRawText:async()=>({value:'document text'})};`,
  'next/navigation':`export const useRouter=()=>({push(){}}); export const useSearchParams=()=>globalThis.__ui.searchParams;`,
  '@/lib/store':`export const useStore=()=>({user:globalThis.__ui.user});`,
  '@/lib/auth-fetch':`export const authFetch=(...args)=>globalThis.__ui.fetch(...args);`,
  '@/components/Toast':`export const showToast=(...args)=>globalThis.__ui.toasts.push(args);`,
  '@/components/suite/SuiteToolChrome':`export const SuiteToolHeader='header',SuiteToolShell='shell',SuiteOutputPanel='panel',SuiteUnmeasured='unmeasured';`,
  // Guidance is an imported presentation boundary here; its real controller,
  // modal ownership and no-action behavior run in tool-guidance-provider.test.js.
  '@/components/guidance/ToolGuidanceProvider':`export const useToolGuidance=()=>({start(){},close(){},isOpen:false});`,
  '@/components/mobile/MobileWorkbench':`export const MobileStickyActionBar='sticky';`,
  '@/components/assistant/AssistantThinkingTile':`export default 'thinking';`,
  '@/hooks/useAuthGate':`export const useAuthGate=()=>globalThis.__ui.gate;`,
  '@/hooks/use-user-tier':`export const useUserTier=()=>({tier:'pro',loading:false});`,
  '@/lib/doc-export':`export async function exportDocument(text){return {blob:text,filename:'draft.txt'}};export function downloadBlob(...args){globalThis.__ui.downloads.push(args)}`,
 };
 await build({entryPoints:[path.resolve(entry)],outfile,bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'ui',setup(api){api.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);api.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}));}}]});
 return require(outfile).default;
}
const Writing=loadPage('app/suite/writing-tools/page.tsx');
const Gallery=loadPage('app/suite/gallery/page.tsx');
function harness(Page,storage=new Map()) {
 const slots=[]; let cursor=0,dirty=true,effects=[],tree;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const ui={user:null,toasts:[],downloads:[],timers:[],fetch:async()=>{throw new Error('Unexpected request')},searchParams:{get:()=>null},gate:{handleApiError:()=>false,renderAuthModal:()=>null,setAuthModal(){},setUsageLimit(){},revealUsageLimit(){}},
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{const next=typeof value==='function'?value(slots[i]):value;if(!Object.is(next,slots[i])){slots[i]=next;dirty=true;}}]},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
  useMemo(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value},
  useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]={deps};effects.push(fn)}},
  flush(){globalThis.__ui=ui;let turns=0;do{if(++turns>30)throw Error('Component render/effect loop');dirty=false;cursor=0;tree=Page();const run=effects;effects=[];run.forEach(fn=>fn());}while(dirty);return tree},
  nodes(){const list=[];function walk(n){if(!n)return;if(Array.isArray(n)){n.forEach(walk);return}if(typeof n==='object'&&n.props){list.push(n);walk(n.props.children);walk(n.props.actions)}}walk(tree);return list},
  find(predicate){const found=ui.nodes().find(predicate);assert.ok(found,'Expected component node');return found},
  text(){return JSON.stringify(tree,(_,v)=>typeof v==='function'?v.name:v)},
 };
 globalThis.__ui=ui;globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 globalThis.window={setTimeout:fn=>ui.timers.push(fn),location:{reload(){}},confirm:()=>true};
 return ui;
}
const key='talent-writing-trust-draft';
const long='One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
const response=body=>({ok:true,json:async()=>body});
const editor=ui=>ui.nodes().find(n=>n.type==='textarea'&&n.props['aria-label']==='Writing draft') || ui.find(n=>n.type==='textarea');
const rail=ui=>ui.find(n=>n.type?.name==='ActionRail');
const click= (ui,label)=>ui.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes(label)).props.onClick();

test('actual writing page recovers exact full draft/settings without hydration overwrite or loop',async()=>{
 const draft={text:' original\n\n',source:'source.txt',documentName:'Named draft',domain:'academic',tone:'academic',lengthMode:'condense',rewriteMode:'academic_integrity',intensity:'deep',qualityMode:'best',protectedTermsText:'123, ACME',step:'export',humanizeResult:{rewritten:' final\n\n',changes:[]},sessionId:'session-a',cloudVersion:7,draftIdentity:'draft-a'};
 const storage=new Map([[`${key}:alice`,JSON.stringify(draft)]]),ui=harness(await Writing,storage);ui.user={uid:'alice'};ui.flush();
 assert.equal(editor(ui).props.value,draft.humanizeResult.rewritten);const persisted=JSON.parse(storage.get(`${key}:alice`));for(const [field,value]of Object.entries(draft))assert.deepEqual(persisted[field],value,field);
 ui.user={uid:'bob'};ui.flush();assert.equal(editor(ui).props.value,'');assert.equal(JSON.parse(storage.get(`${key}:alice`)).text,draft.text);
 ui.user={uid:'alice'};ui.flush();assert.equal(editor(ui).props.value,draft.humanizeResult.rewritten);
});
test('clear persists empty draft and allocates a fresh cloud identity; blocked storage never claims saved',async()=>{
 const storage=new Map([[`${key}:guest`,JSON.stringify({text:long,draftIdentity:'old',sessionId:'cloud-old',cloudVersion:5})]]),ui=harness(await Writing,storage);ui.flush();click(ui,'Clear');ui.flush();
 const draft=JSON.parse(storage.get(`${key}:guest`));assert.equal(draft.text,'');assert.equal(draft.sessionId,null);assert.notEqual(draft.draftIdentity,'old');assert.equal(draft.cloudVersion,0);
 globalThis.localStorage.setItem=()=>{throw Error('blocked')};editor(ui).props.onChange({target:{value:'unsaved'}});ui.flush();assert.match(ui.text(),/Device storage unavailable/);assert.equal(editor(ui).props.value,'unsaved');
});
test('rewrite uses visible settings, invalidates old verification, and ignores completion after edit/account switch',async()=>{
 const ui=harness(await Writing,new Map([[`${key}:guest`,JSON.stringify({text:long})]]));ui.flush();rail(ui).props.onScan();ui.timers.splice(0).forEach(fn=>fn());ui.flush();
 ui.find(n=>n.type?.name==='SelectField'&&n.props.label==='Tone').props.onChange('casual');ui.flush();
 let pending=deferred(),payload;ui.fetch=async(_,options)=>{payload=JSON.parse(options.body);return pending.promise};const work=rail(ui).props.onHumanize();assert.equal(payload.tone,'casual');
 editor(ui).props.onChange({target:{value:'new draft stays'}});ui.flush();pending.resolve(response({rewritten:'late old output',changes:[]}));await work;ui.flush();assert.equal(editor(ui).props.value,'new draft stays');
 editor(ui).props.onChange({target:{value:long}});ui.flush();rail(ui).props.onScan();ui.timers.splice(0).forEach(fn=>fn());ui.flush();
 pending=deferred();const work2=rail(ui).props.onHumanize();ui.user={uid:'bob'};ui.flush();pending.resolve(response({rewritten:'guest output',changes:[]}));await work2;ui.flush();assert.equal(editor(ui).props.value,'');
});
test('editing rewritten output keeps original source and invalidates checks; cloud save response cannot attach after Clear',async()=>{
 const storage=new Map([[`${key}:alice`,JSON.stringify({text:long,humanizeResult:{rewritten:'Current rewritten version',changes:[]},uniqueness:{uniquenessScore:88},deepScan:{summary:'old check'},draftIdentity:'old'})]]),ui=harness(await Writing,storage);ui.user={uid:'alice'};ui.flush();
 editor(ui).props.onChange({target:{value:'Edited output'}});ui.flush();let draft=JSON.parse(storage.get(`${key}:alice`));assert.equal(draft.text,long);assert.equal(draft.humanizeResult.rewritten,'Edited output');assert.equal(draft.uniqueness,null);assert.equal(draft.deepScan,null);
 const pending=deferred();ui.fetch=()=>pending.promise;const work=click(ui,'Save');click(ui,'Clear');ui.flush();pending.resolve(response({session:{id:'old',version:1}}));await work;ui.flush();draft=JSON.parse(storage.get(`${key}:alice`));assert.equal(draft.sessionId,null);assert.equal(draft.cloudVersion,0);assert.equal(draft.text,'');
});
test('public handoff is consumed only after owner draft persistence, guest drafts stay separate',async()=>{
 const storage=new Map([['talent-writing-trust-handoff:v2',JSON.stringify({owner:'alice',accepted:true,createdAt:Date.now(),draft:{text:'Public handoff'}})],[`${key}:guest`,JSON.stringify({text:'Guest private draft'})]]),ui=harness(await Writing,storage);ui.user={uid:'alice'};ui.flush();
 assert.equal(editor(ui).props.value,'Public handoff');assert.equal(storage.has('talent-writing-trust-handoff:v2'),false);assert.equal(JSON.parse(storage.get(`${key}:guest`)).text,'Guest private draft');assert.equal(JSON.parse(storage.get(`${key}:alice`)).text,'Public handoff');
});
test('Gallery deep link settles once; typing preserves source and delayed results cannot overwrite edited source',async()=>{
 const ui=harness(await Gallery);ui.searchParams={get:()=> 'grammar-checker'};ui.flush();editor(ui).props.onChange({target:{value:'Draft one'}});ui.flush();assert.equal(editor(ui).props.value,'Draft one');
 const pending=deferred();ui.fetch=()=>pending.promise;
 const runButton=ui.nodes().find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Run '));assert.ok(runButton,'Run tool button');
 const work=runButton.props.onClick();editor(ui).props.onChange({target:{value:'Draft two'}});ui.flush();pending.resolve(response({result:{summary:'stale result'}}));await work;ui.flush();assert.equal(editor(ui).props.value,'Draft two');assert.equal(ui.text().includes('stale result'),false);
});

test('Gallery switching tools preserves distinct source and result per tool',async()=>{
 const ui=harness(await Gallery);ui.searchParams={get:()=> 'word-counter'};ui.flush();editor(ui).props.onChange({target:{value:'One two three.'}});ui.flush();
 let button=ui.nodes().find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Run '));await button.props.onClick();ui.flush();assert.match(ui.text(),/"words":3/);
 ui.searchParams={get:()=> 'grammar-checker'};ui.flush();assert.equal(editor(ui).props.value,'');editor(ui).props.onChange({target:{value:'Separate grammar draft'}});ui.flush();
 ui.searchParams={get:()=> 'word-counter'};ui.flush();assert.equal(editor(ui).props.value,'One two three.');assert.match(ui.text(),/"words":3/);
 ui.searchParams={get:()=> 'grammar-checker'};ui.flush();assert.equal(editor(ui).props.value,'Separate grammar draft');
});


test('legacy ownerless and foreign handoff text are quarantined on sign-in', async () => {
 const storage=new Map([[key,JSON.stringify({text:'Legacy private'})],['talent-writing-trust-handoff:v2',JSON.stringify({owner:'bob',accepted:true,createdAt:Date.now(),draft:{text:'Foreign private'}})]]);
 const ui=harness(await Writing,storage);ui.user={uid:'alice'};ui.flush();assert.equal(editor(ui).props.value,'');assert.equal(storage.has(key),true);
});

test('Humanizer runs directly without Scan and binds retries to the same exact request',async()=>{
 const ui=harness(await Writing,new Map([[`${key}:guest`,JSON.stringify({text:long})]]));ui.flush();
 const calls=[];ui.fetch=async(_,options)=>{calls.push(JSON.parse(options.body));throw Error('Connection lost')};
 await rail(ui).props.onHumanize();ui.flush();await rail(ui).props.onHumanize();ui.flush();
 assert.equal(calls.length,2);assert.equal(calls[0].rewriteScope,'full');assert.equal(calls[0].requestId,calls[1].requestId);assert.equal(calls[0].text,long);
 editor(ui).props.onChange({target:{value:long+' Changed.'}});ui.flush();await rail(ui).props.onHumanize();assert.notEqual(calls[2].requestId,calls[0].requestId);
});

test('empty final stays empty and edits cannot retain a passing quality approval',async()=>{
 const storage=new Map([[`${key}:alice`,JSON.stringify({text:long,humanizeResult:{rewritten:'Current output',checkedText:'Current output',qualityDecision:'accepted',qualityGates:[{id:'preserve',status:'pass',label:'Facts'}],changes:[]}})]]);
 const ui=harness(await Writing,storage);ui.user={uid:'alice'};ui.flush();editor(ui).props.onChange({target:{value:''}});ui.flush();
 assert.equal(editor(ui).props.value,'');const saved=JSON.parse(storage.get(`${key}:alice`));assert.equal(saved.text,long);assert.equal(saved.humanizeResult.rewritten,'');assert.equal(saved.humanizeResult.qualityGates,undefined);assert.equal(saved.humanizeResult.qualityDecision,'review_required');
 assert.equal(rail(ui).props.hasOutput,false);await rail(ui).props.onExport();assert.equal(ui.downloads.length,0);
 const reopened=harness(await Writing,storage);reopened.user={uid:'alice'};reopened.flush();assert.equal(editor(reopened).props.value,'');
});

test('returned changes are reviewable and rejection restores only its paragraph',async()=>{
 const source=long+'\n\nSecond source paragraph remains unchanged.';
 const ui=harness(await Writing,new Map([[`${key}:guest`,JSON.stringify({text:source})]]));ui.flush();
 ui.fetch=async()=>response({rewritten:long.replace('One','First')+'\n\nSecond source paragraph remains unchanged.',changes:[{original:'One',rewritten:'First',reason:'A clearer opening'}],qualityDecision:'review_required'});
 await rail(ui).props.onHumanize();ui.flush();assert.match(ui.text(),/Review changes/);assert.match(ui.text(),/A clearer opening/);
 click(ui,'Use original');ui.flush();assert.equal(editor(ui).props.value,source);assert.match(ui.text(),/Original restored/);
 click(ui,'Keep change');ui.flush();assert.equal(editor(ui).props.value,long.replace('One','First')+'\n\nSecond source paragraph remains unchanged.');
});

test('restored cloud output has no implicit approval, including intentionally empty output',async()=>{
 const ui=harness(await Writing);ui.user={uid:'alice'};ui.flush();
 ui.fetch=async url=>url.includes('?id=')?response({sessions:{id:'saved',version:1,input_text:long,final_text:'',metadata:{hasOutput:true},title:'Saved example'}}):response({sessions:[{id:'saved',title:'Saved example'}]});
 await click(ui,'Library');ui.flush();await click(ui,'Saved example');ui.flush();assert.equal(editor(ui).props.value,'');assert.match(ui.text(),/Review required/);assert.doesNotMatch(ui.text(),/"Accepted"/);
});

test('request identity is durably written before dispatch and survives owner-scoped reload',async()=>{
 const storage=new Map([[`${key}:alice`,JSON.stringify({text:long})]]);let firstId;
 const first=harness(await Writing,storage);first.user={uid:'alice'};first.flush();
 first.fetch=async(_,options)=>{firstId=JSON.parse(options.body).requestId;assert.equal(JSON.parse(storage.get(`${key}:alice:rewrite-request`)).id,firstId);throw Error('Lost response')};
 await rail(first).props.onHumanize();first.flush();
 const next=harness(await Writing,storage);next.user={uid:'alice'};next.flush();let secondId;
 next.fetch=async(_,options)=>{secondId=JSON.parse(options.body).requestId;return response({rewritten:long,changes:[],qualityDecision:'accepted_with_warnings'})};
 await rail(next).props.onHumanize();next.flush();assert.equal(secondId,firstId);assert.equal(storage.has(`${key}:alice:rewrite-request`),false);
 const other=harness(await Writing,storage);other.user={uid:'bob'};other.flush();editor(other).props.onChange({target:{value:long}});other.flush();let otherId;
 other.fetch=async(_,options)=>{otherId=JSON.parse(options.body).requestId;throw Error('Lost response')};await rail(other).props.onHumanize();assert.notEqual(otherId,firstId);
});
test('retry checkpoint failure is labeled honestly while mounted retries retain their id',async()=>{
 const storage=new Map([[`${key}:alice`,JSON.stringify({text:long})]]),ui=harness(await Writing,storage);ui.user={uid:'alice'};ui.flush();const originalSet=localStorage.setItem;
 localStorage.setItem=(name,value)=>{if(name.endsWith(':rewrite-request'))throw Error('blocked checkpoint');return originalSet(name,value)};
 const ids=[];ui.fetch=async(_,options)=>{ids.push(JSON.parse(options.body).requestId);throw Error('Lost response')};await rail(ui).props.onHumanize();ui.flush();assert.match(ui.text(),/retry recovery unavailable/i);assert.equal(editor(ui).props.value,long);
 await rail(ui).props.onHumanize();ui.flush();assert.equal(ids[0],ids[1]);assert(ui.toasts.some(toast=>/Keep this tab open/.test(toast[0])));
});
test('completed quality checks are bound to current policy as well as exact output text',async()=>{
 const ui=harness(await Writing,new Map([[`${key}:guest`,JSON.stringify({text:long})]]));ui.flush();
 ui.fetch=async()=>response({rewritten:long,changes:[],qualityDecision:'accepted_with_warnings',qualityGates:[{id:'protected_terms',label:'Protected terms',status:'pass',detail:'0 retained'}]});
 await rail(ui).props.onHumanize();ui.flush();assert.match(ui.text(),/Checks completed/);assert.match(ui.text(),/Quality gates/);
 ui.find(n=>n.type==='input'&&n.props.placeholder?.startsWith('Optional: names')).props.onChange({target:{value:'New protected company'}});ui.flush();assert.match(ui.text(),/Review required/);assert.doesNotMatch(ui.text(),/Quality gates/);assert.equal(editor(ui).props.value,long);
 ui.find(n=>n.type==='input'&&n.props.placeholder?.startsWith('Optional: names')).props.onChange({target:{value:''}});ui.flush();assert.match(ui.text(),/Checks completed/);
 ui.find(n=>n.type?.name==='SelectField'&&n.props.label==='Length').props.onChange('expand');ui.flush();assert.doesNotMatch(ui.text(),/Checks completed/);
});
test('unavailable deep scan removes a prior scan and never renders null as confidence',async()=>{
 const ui=harness(await Writing,new Map([[`${key}:guest`,JSON.stringify({text:long,deepScan:{success:true,status:'analyzed',confidence:72,summary:'Prior sample result'}})]]));ui.flush();assert.match(ui.text(),/Prior sample result/);
 ui.fetch=async()=>({ok:false,json:async()=>({success:false,status:'unavailable',humanConfidence:null,error:'No sample available'})});await rail(ui).props.onDeepScan();ui.flush();assert.doesNotMatch(ui.text(),/Prior sample result/);assert(ui.toasts.some(toast=>toast[0]==='No sample available'));
 ui.fetch=async()=>response({success:false,status:'unavailable',confidence:null,humanConfidence:null});await rail(ui).props.onDeepScan();ui.flush();assert(ui.toasts.some(toast=>/did not produce a usable result/.test(toast[0])));assert.doesNotMatch(ui.text(),/null%|100% human/);
});


test('every quality gate exposes its detail including meaning review beyond the fifth gate',async()=>{
 const ui=harness(await Writing,new Map([[`${key}:guest`,JSON.stringify({text:long})]]));ui.flush();
 const gates=Array.from({length:5},(_,i)=>({id:`gate-${i}`,label:`Observation ${i}`,status:'pass',detail:`Detail ${i}`}));gates.push({id:'meaning_review',label:'Meaning review',status:'warn',detail:'Compare names and responsibilities with the source; meaning is not verified.'});
 ui.fetch=async()=>response({rewritten:long,changes:[],qualityDecision:'accepted_with_warnings',qualityGates:gates,warnings:['A different first warning']});
 await rail(ui).props.onHumanize();ui.flush();assert.match(ui.text(),/meaning is not verified/);for(let i=0;i<5;i++)assert(ui.text().includes(`Detail ${i}`));
});
