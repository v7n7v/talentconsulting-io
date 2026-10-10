const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {build}=require('esbuild');const {loadBodies,runtime}=require('./test-ui-hooks.cjs');
async function moduleFrom(file){const outfile=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'oracle-ui-')),'mod.cjs');await build({entryPoints:[file],outfile,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});return require(outfile)}
const oracle=loadBodies('app/suite/market-oracle/OracleContent.tsx');
const helpers=moduleFrom('lib/oracle-v2.ts');
const schemas=moduleFrom('lib/schemas.ts');
const source='I build TypeScript services and maintain Python tools for reporting. '.repeat(3),jd='Python required. TypeScript required. This role includes working with the software team on product features and documenting the engineering decisions.';
async function setup(kit={}){const h=await helpers;Object.assign(globalThis,h);globalThis.useReducedMotion=()=>true;globalThis.useRouter=()=>({push(){}});const ui=runtime((await oracle).default);ui.kit=kit;ui.writes=[];globalThis.loadApplicationKitContext=()=>ui.kit;globalThis.mergeApplicationKitContext=patch=>{ui.kit={...ui.kit,...patch};ui.writes.push(patch);return ui.kit};globalThis.ResumeLibraryPicker='picker';globalThis.FileUploadDropzone='dropzone';globalThis.handoffApplicationKitContext=x=>x;globalThis.window.setInterval=()=>1;globalThis.window.clearInterval=()=>{};ui.flush();return ui;}
const input=(ui,label)=>ui.find(n=>n.props?.['aria-label']===label);
const button=(ui,label)=>ui.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes(label));
const response=value=>({ok:true,json:async()=>value});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};

test('Oracle restores complete exact draft and preserves stale report status',async()=>{
 const report=(await helpers).buildOracleV2Report({session:{resumeText:source,jdText:jd,role:'Engineer'}});
 const ui=await setup({resumeText:source,jobDescription:jd,jobTitle:'Inferred role',company:'Inferred company',oracleDraft:{targetRole:'Exact title',company:'Exact company',location:'Boston',salaryTarget:120000,jobUrl:'https://example.com/job',analyzedInput:'older input',sourceBinding:null},oracleResult:{status:'stale',data:report}});
 assert.equal(input(ui,'Target role').props.value,'Exact title');assert.equal(input(ui,'Company').props.value,'Exact company');assert.equal(input(ui,'Location or remote').props.value,'Boston');assert.equal(input(ui,'Job posting URL').props.value,'https://example.com/job');assert.equal(button(ui,'Track').props.disabled,true);assert.equal(ui.kit.oracleResult.status,'stale');
});

test('Oracle displays and saves primary analysis before related jobs finish; failure stays separate',async()=>{
 const ui=await setup({resumeText:source,jobDescription:jd,jobTitle:'Engineer'}),jobs=deferred();
 const report=(await helpers).buildOracleV2Report({session:{resumeText:source,jdText:jd,role:'Engineer'}});
 ui.fetch=async url=>url==='/api/oracle/analyze'?response({success:true,analysis:{},oracleV2:report,sourceBinding:{resumeVersionId:'',sourceHash:'hash'}}):jobs.promise;
 const work=button(ui,'Run Oracle Analysis').props.onClick();await ui.settle();assert.equal(ui.kit.oracleResult.status,'success');assert.equal(ui.kit.oracleResult.data,report);assert.equal(button(ui,'Track').props.disabled,false);
 button(ui,'Related roles').props.onClick();ui.flush();assert.match(ui.text(),/Loading related roles/);
 jobs.resolve({ok:false,json:async()=>({error:'unavailable'})});await work;ui.flush();assert.match(ui.text(),/Related roles could not be loaded/);assert.equal(button(ui,'Track').props.disabled,false);
 const again=await setup(ui.kit);assert.equal(button(again,'Track').props.disabled,false);
});

test('Oracle edited inputs invalidate actions and ignored late related results',async()=>{
 const ui=await setup({resumeText:source,jobDescription:jd,jobTitle:'Engineer'}),jobs=deferred();const report=(await helpers).buildOracleV2Report({session:{resumeText:source,jdText:jd,role:'Engineer'}});
 ui.fetch=async url=>url==='/api/oracle/analyze'?response({success:true,analysis:{},oracleV2:report,sourceBinding:null}):jobs.promise;
 const work=button(ui,'Run Oracle Analysis').props.onClick();await ui.settle();input(ui,'Target role').props.onChange({target:{value:'Different'}});ui.flush();assert.equal(button(ui,'Track').props.disabled,true);
 jobs.resolve(response({success:true,jobs:[{id:'late',title:'Late role',company:'Example',url:'https://example.com'}]}));await work;ui.flush();assert.doesNotMatch(ui.text(),/Late role/);
});


test('Oracle omits blank optional posting URL and pasted sources cannot prepare packets',async()=>{
 const ui=await setup({resumeText:source,jobDescription:jd,jobTitle:'Engineer'});let sent;
 const report=(await helpers).buildOracleV2Report({session:{resumeText:source,jdText:jd,role:'Engineer'}});
 ui.fetch=async(url,options)=>{if(url==='/api/oracle/analyze'){sent=JSON.parse(options.body);assert.equal((await schemas).OracleAnalyzeSchema.safeParse(sent).success,true);return response({success:true,analysis:{},oracleV2:report,sourceBinding:{resumeVersionId:null,sourceHash:'hash'}})}return response({success:true,jobs:[]})};
 await button(ui,'Run Oracle Analysis').props.onClick();ui.flush();assert.equal(sent.jobUrl,undefined);assert.equal(button(ui,'Prepare packet').props.disabled,true);assert.equal(button(ui,'Track').props.disabled,false);
});
