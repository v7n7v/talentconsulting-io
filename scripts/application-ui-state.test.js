const test=require('node:test');const assert=require('node:assert/strict');
const {build}=require('esbuild');
const {loadBodies,runtime}=require('./test-ui-hooks.cjs');
const manual=loadBodies('components/suite/ManualApplicationForm.tsx');
const apps=(async()=>{
 const [component,adapter]=await Promise.all([
  loadBodies('app/suite/applications/page.tsx','export {ApplicationsWorkspace,OfferCoachSection,ApplicationDrawer};'),
  build({entryPoints:['lib/tool-story-adapters.ts'],bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'}),
 ]);
 const module={exports:{}};new Function('module','exports',adapter.outputFiles[0].text)(module,module.exports);
 // These business-state fixtures keep registration inert, but use the real authored
 // adapter and native focus mechanism rather than replacing either implementation.
 Object.assign(globalThis,module.exports,{useToolGuidance:()=>{},PageHelp:'PageHelp'});
 return component;
})();
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
function edit(ui,index,value){ui.nodes().filter(n=>n.type==='input')[index].props.onChange({target:{value}});ui.flush()}
const submit=ui=>ui.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});

test('manual application recovery uses one ID for exact retries and fresh ID after payload edit',async()=>{
 const saved=[],ui=runtime((await manual).default,{applications:[],onSaved:app=>saved.push(app)});ui.flush();edit(ui,0,'Acme');edit(ui,1,'Engineer');
 const requests=[];ui.fetch=async(_,options)=>{requests.push(JSON.parse(options.body));return response({error:'temporary failure'},503)};await submit(ui);ui.flush();await submit(ui);ui.flush();assert.equal(requests[0].requestId,requests[1].requestId);assert.equal(ui.nodes().filter(n=>n.type==='input')[0].props.value,'Acme');
 edit(ui,1,'Lead');await submit(ui);ui.flush();assert.notEqual(requests[2].requestId,requests[1].requestId);assert.equal(requests[2].role,'Lead');
 const draft=JSON.parse(ui.storage.get('taco:manual-application:alice'));assert.equal(draft.requestId,requests[2].requestId);assert.equal(draft.role,'Lead');assert.equal(saved.length,0);
});
test('manual unmount/account change ignores a late successful save',async()=>{
 let count=0;const ui=runtime((await manual).default,{applications:[],onSaved:()=>count++});ui.flush();edit(ui,0,'Acme');edit(ui,1,'Engineer');const pending=deferred();ui.fetch=()=>pending.promise;const work=submit(ui);ui.unmount();ui.user={uid:'bob'};pending.resolve(response({success:true,data:{id:'old'}}));await work;assert.equal(count,0);
});
const app={id:'a',company_name:'Acme',job_title:'Engineer',status:'offer',created_at:'2026-09-01',offer_details:{base:100,currency:'EUR',period:'month'}};
test('offer UI hides legacy market claims, labels actual currency/period, preserves edits through saved-prop refresh',async()=>{
 const ui=runtime((await apps).OfferCoachSection,{app:{...app,negotiation_brief:{verdict:'below_market',emailScript:'Unsupported legacy claim'}},onInputChange(){},onSave:async()=>app,onGenerate:async()=>({}),onStatus(){}});ui.flush();assert.equal(ui.text().includes('Unsupported legacy claim'),false);assert.match(ui.text(),/lacks current input provenance/);
 ui.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Edit offer')).props.onClick();ui.flush();const base=ui.find(n=>n.type?.name==='OfferInput'&&n.props.label.startsWith('Base'));assert.equal(base.props.label,'Base salary (EUR / month)');base.props.onChange('150');ui.flush();
 ui.props={...ui.props,app:{...app,offer_details:{...app.offer_details,base:120},negotiation_brief:{emailScript:'New brief'}}};ui.flush();assert.equal(ui.find(n=>n.type?.name==='OfferInput'&&n.props.label.startsWith('Base')).props.value,'150');
});
test('offer save and generation cannot overlap; editing invalidates delayed completion without hiding current inputs',async()=>{
 const pending=deferred();let saves=0,generations=0,invalidations=0;const ui=runtime((await apps).OfferCoachSection,{app,onInputChange(){invalidations++},onSave:async()=>{saves++;return pending.promise},onGenerate:async()=>{generations++;return{}},onStatus(){}});ui.flush();const save=ui.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Save offer')).props.onClick();ui.flush();
 await ui.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Evaluate offer')).props.onClick();assert.equal(saves,1);assert.equal(generations,0);
 ui.find(n=>n.type?.name==='OfferInput'&&n.props.label.startsWith('Base')).props.onChange('160');ui.flush();pending.resolve(app);await save;ui.flush();assert.equal(invalidations,1);assert.equal(ui.find(n=>n.type?.name==='OfferInput'&&n.props.label.startsWith('Base')).props.value,'160');
});
async function workspace(){const rows=[{...app,status:'applied',offer_details:null},{...app,id:'b',company_name:'Other',status:'applied',offer_details:null}];globalThis.getJobApplications=async()=>({success:true,data:rows});globalThis.getAllStudyProgress=async()=>({success:true,data:[]});globalThis.getResumeVersions=async()=>({success:true,data:[]});const ui=runtime((await apps).ApplicationsWorkspace);ui.flush();await ui.settle();return{ui,rows}}
const drawer=ui=>ui.find(n=>n.type?.name==='ApplicationDrawer');
const open= (ui,app)=>ui.find(n=>n.props.onOpen).props.onOpen(app);
test('Applications A→B→A prevents old followup from populating reopened drawer',async()=>{
 const {ui,rows}=await workspace();await open(ui,rows[0]);ui.flush();const pending=deferred();ui.fetch=()=>pending.promise;const work=drawer(ui).props.onFollowUp('a');await open(ui,rows[1]);ui.flush();await open(ui,rows[0]);ui.flush();pending.resolve(response({success:true,subject:'STALE SUBJECT',body:'old'}));await work;ui.flush();assert.equal(ui.text().includes('STALE SUBJECT'),false);assert.equal(drawer(ui).props.followUpLoading,false);
});
test('notes edits and drawer changes suppress late notes and outcome completion',async()=>{
 const {ui,rows}=await workspace();await open(ui,rows[0]);ui.flush();drawer(ui).props.setEditingNotes('first notes');ui.flush();const pending=deferred();globalThis.updateApplicationNotes=()=>pending.promise;const work=drawer(ui).props.onNotesSave();drawer(ui).props.setEditingNotes('new notes');ui.flush();pending.resolve({success:true});await work;ui.flush();assert.equal(drawer(ui).props.editingNotes,'new notes');assert.equal(ui.toasts.some(([message])=>message==='Notes saved'),false);
 const delayed=deferred();globalThis.reportApplicationOutcome=()=>delayed.promise;const outcome=drawer(ui).props.onOutcome('interview');await open(ui,rows[1]);ui.flush();delayed.resolve({success:true});await outcome;ui.flush();assert.equal(drawer(ui).props.app.id,'b');assert.equal(drawer(ui).props.outcomeLoading,false);assert.equal(ui.toasts.some(([message])=>message==='Outcome: Interview'),false);
});

test('status and delete completions cannot change a newly selected drawer or produce stale success',async()=>{
 const {ui,rows}=await workspace();await open(ui,rows[0]);ui.flush();let pending=deferred();globalThis.updateApplicationStatus=()=>pending.promise;const status=drawer(ui).props.onStatusUpdate(rows[0],'screening');await open(ui,rows[1]);ui.flush();pending.resolve({success:true,data:{status:'screening'}});await status;ui.flush();assert.equal(drawer(ui).props.app.id,'b');assert.equal(ui.toasts.length,0);
 await open(ui,rows[0]);ui.flush();pending=deferred();globalThis.deleteJobApplication=()=>pending.promise;const deletion=drawer(ui).props.onDelete('a');await open(ui,rows[1]);ui.flush();pending.resolve({success:true});await deletion;ui.flush();assert.equal(drawer(ui).props.app.id,'b');assert.equal(ui.toasts.length,0);
});
test('offer generation stops before provider on failed save or input edit while saving',async()=>{
 const {ui,rows}=await workspace();await open(ui,rows[0]);ui.flush();let calls=0;ui.fetch=async()=>{calls++;return response({success:true})};globalThis.updateApplicationOffer=async()=>({success:false,error:'Save failed'});
 await assert.rejects(drawer(ui).props.onGenerateOfferBrief(rows[0],app.offer_details),/Save the offer/);assert.equal(calls,0);
 const pending=deferred();globalThis.updateApplicationOffer=()=>pending.promise;const generation=drawer(ui).props.onGenerateOfferBrief(rows[0],app.offer_details);drawer(ui).props.onOfferInputChange();pending.resolve({success:true,data:{...rows[0],offer_details:app.offer_details}});await assert.rejects(generation,/Save the offer|changed/);assert.equal(calls,0);
});
test('drawer native keyboard loop wraps first and last DOM controls and cleans up on close',async()=>{
 const ui=runtime((await apps).ApplicationDrawer,{app,initialAction:null,initialOutcomeConfirmation:null,skillSummary:{skills:[],completedDays:0,totalDays:0,percent:null},closeRef:{current:null},onClose(){},onOfferInputChange(){}});
 let firstFocus=0,lastFocus=0,prevented=0;
 const first={getClientRects:()=>[1],focus:()=>firstFocus++},last={getClientRects:()=>[1],focus:()=>lastFocus++};
 const listeners=new Map(),added=[],removed=[];
 const surface={ownerDocument:document,querySelectorAll:()=>[first,last],addEventListener(type,handler){added.push([type,handler]);listeners.set(type,handler)},removeEventListener(type,handler){removed.push([type,handler]);if(listeners.get(type)===handler)listeners.delete(type)}};
 // The synthetic hook runtime has no DOM commit phase. Attach the actual JSX ref
 // before its real effect executes, as React does when mounting the drawer.
 const useEffect=ui.useEffect;
 ui.useEffect=(run,deps)=>useEffect(()=>{
  const aside=ui.nodes().find(node=>node.type==='aside');
  if(aside?.props.ref)aside.props.ref.current=surface;
  return run();
 },deps);
 ui.flush();assert.equal(added.length,1);assert.equal(added[0][0],'keydown');assert.equal(ui.find(node=>node.type==='aside').props.onKeyDown,undefined);
 const event={key:'Tab',defaultPrevented:false,shiftKey:false,preventDefault:()=>prevented++};document.activeElement=last;listeners.get('keydown')(event);assert.equal(firstFocus,1);document.activeElement=first;listeners.get('keydown')({...event,shiftKey:true});assert.equal(lastFocus,1);assert.equal(prevented,2);
 ui.props={...ui.props,app:null};ui.flush();assert.equal(listeners.has('keydown'),false);assert.deepEqual(removed,added);
 ui.unmount();assert.equal(added.length,1,'Closing the drawer must not trap the page');
});
