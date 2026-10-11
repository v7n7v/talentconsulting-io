// Audit probes for CURRENT defects, not regression tests for desired behavior.
// Runs actual page component bodies with mocked service/UI boundaries. No network/browser.
// Run from any directory: node docs/audits/interview-prep-2026/session-probe.cjs
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../../..');
const {loadBodies,runtime}=require(root+'/scripts/test-ui-hooks.cjs');
const {buildSync}=require(root+'/node_modules/esbuild');const Module=require('module');
function loadLocal(file){const r=buildSync({entryPoints:[root+'/'+file],bundle:true,write:false,platform:'node',format:'cjs',logLevel:'silent'});const m=new Module(file,module);m._compile(r.outputFiles[0].text,file);return m.exports;}
Object.assign(globalThis,loadLocal('lib/practice-draft.ts'),loadLocal('lib/interview-context.ts'));
const tmp=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'interview-audit-')),'page.tsx');
fs.writeFileSync(tmp,fs.readFileSync(root+'/app/suite/interview-sim/page.tsx','utf8').replace(/const AvatarCanvas = dynamic\([^\n]+\);/,'const AvatarCanvas = "AvatarCanvas";'));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const reply=data=>({ok:true,json:async()=>data});
let Workspace;
function harness(query=''){
 const params=new URLSearchParams(query);globalThis.useSearchParams=()=>params;
 const requests=[],timers=new Map(),live={fullTranscript:[],isConnected:false,isConnecting:false,getTranscript:()=>[],disconnect(){live.disconnects++},connect(){live.connects++},connects:0,disconnects:0};
 globalThis.useGeminiLiveAvatar=()=>live;globalThis.normalizeCareerTwinSummary=()=>null;globalThis.getJobApplications=async()=>({success:true,data:[{id:'app-a',company_name:'Alpha',job_title:'Engineer',job_description:'JD A'}]});globalThis.getResumeVersions=async()=>({success:true,data:[]});
 globalThis.UPGRADE_COPY={primaryCta:'Upgrade'};globalThis.compactList=v=>v;for(const name of ['AnimatedToolIcon','AuthModal','TelemetryCard'])globalThis[name]=name;
 const ui=runtime(Workspace);globalThis.window.localStorage=globalThis.localStorage;globalThis.window.setTimeout=fn=>{const id=timers.size+1;timers.set(id,fn);return id};globalThis.window.clearTimeout=id=>timers.delete(id);
 ui.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):null;requests.push({url,method:options.method||'GET',body});if(options.method==='POST'&&url==='/api/interview/sessions')return reply({id:body.requestId});if(options.method==='PATCH')return reply({success:true});if(url==='/api/agent/stories')return reply({stories:[]});if(url==='/api/interview/sessions')return reply({sessions:[]});if(url==='/api/agent/intelligence')return reply({twin:null});throw Error('Unexpected request '+url)};
 return {ui,requests,timers,live};
}
const node=(ui,name)=>ui.find(n=>n.type?.name===name);
const mode=(ui,label)=>ui.find(n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children.includes(label));
const start=ui=>node(ui,'PracticeLauncher').props.onStart();
(async()=>{
 process.chdir(root);Workspace=(await loadBodies(tmp,'export {InterviewStudioWorkspace};')).InterviewStudioWorkspace;
 {const {ui,requests}=harness();ui.flush();await ui.settle();mode(ui,'Live Interview with Taco').props.onClick();ui.flush();await start(ui);ui.flush();await node(ui,'LiveRoom').props.onAbandon();ui.flush();await start(ui);ui.flush();const created=requests.filter(r=>r.method==='POST'&&r.url==='/api/interview/sessions');assert.equal(created.length,2);assert.equal(created[0].body.requestId,created[1].body.requestId);console.log('REPRODUCED live Exit -> Start with unchanged setup reuses same requestId:',created[0].body.requestId);}
 {const {ui,timers,live}=harness();ui.flush();await ui.settle();mode(ui,'Live Interview with Taco').props.onClick();ui.flush();await start(ui);ui.flush();assert.equal(timers.size,1);ui.unmount();assert.equal(timers.size,1);for(const fn of timers.values())fn();assert.equal(live.connects,1);console.log('REPRODUCED live launch timer survives workspace unmount and invokes connect afterward');}
 {const {ui}=harness();ui.flush();await ui.settle();let picker=node(ui,'CustomDropdown');picker.props.onChange('app-a');ui.flush();picker=node(ui,'CustomDropdown');assert.equal(picker.props.value,'app-a');picker.props.onChange('');ui.flush();assert.equal(node(ui,'CustomDropdown').props.value,'app-a');console.log('REPRODUCED selecting Blank or pasted JD retains app-a');}
 {const {ui}=harness();ui.flush();await ui.settle();const fallback=ui.fetch,wait=deferred();ui.fetch=(url,opts)=>url==='/api/gauntlet/generate'?wait.promise:fallback(url,opts);const pending=start(ui);await ui.settle();mode(ui,'Whiteboard').props.onClick();ui.flush();wait.resolve(reply({questions:[{text:'Quick question',type:'behavioral',context:'Context',difficulty:'standard'}]}));await pending;ui.flush();assert.ok(node(ui,'WhiteboardRoom'));console.log('REPRODUCED mode switch during pending quick generation opens WhiteboardRoom for the quick session');}
 {const {ui}=harness();ui.flush();await ui.settle();mode(ui,'Debrief Review').props.onClick();ui.flush();const saved={id:'whiteboard-saved',mode:'technical_whiteboard',status:'active',whiteboard:{mode:'coding',prompt:'Saved coding prompt',solution:'Saved solution'},transcript:[],rubric:[],scores:{}};const fallback=ui.fetch;ui.fetch=(url,opts)=>url.includes('?id=')?Promise.resolve(reply({session:saved})):fallback(url,opts);await node(ui,'SessionHistory').props.onOpenSession(saved.id);ui.flush();assert.ok(ui.nodes().some(n=>n.type==='button'&&n.props.children==='Retry saved session generation'));assert.ok(!ui.nodes().some(n=>n.type?.name==='WhiteboardRoom'));console.log('REPRODUCED unfinished saved whiteboard opens generic generation retry, no WhiteboardRoom');}
 {const {ui}=harness();ui.flush();await ui.settle();mode(ui,'Debrief Review').props.onClick();ui.flush();const a=deferred(),b=deferred(),fallback=ui.fetch;ui.fetch=(url,opts)=>url.endsWith('?id=a')?a.promise:url.endsWith('?id=b')?b.promise:fallback(url,opts);const open=node(ui,'SessionHistory').props.onOpenSession;const pa=open('a'),pb=open('b');const saved=id=>({id,mode:'quick_drill',scores:{summary:id,score:50},transcript:[]});b.resolve(reply({session:saved('b')}));await pb;ui.flush();a.resolve(reply({session:saved('a')}));await pa;ui.flush();assert.equal(node(ui,'DebriefPanel').props.grade.summary,'a');console.log('REPRODUCED slow earlier Open debrief A replaces later selected B');}
})().catch(e=>{console.error(e);process.exitCode=1});
