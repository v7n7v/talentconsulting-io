const test=require('node:test');const assert=require('node:assert/strict');
const {loadBodies,runtime}=require('./test-ui-hooks.cjs');
const {build}=require('esbuild');const Module=require('node:module');
const root=process.cwd();let components,api;
test.before(async()=>{
 const bundled=await build({stdin:{contents:"export * from './lib/resume-design'; export * from './lib/resume-design/source-breaks';",resolveDir:root,loader:'ts'},write:false,bundle:true,platform:'node',format:'cjs',alias:{'@':root},logLevel:'silent'});
 const m=new Module(root+'/workbench-test-memory.cjs',module);m.filename=root+'/workbench-test-memory.cjs';m.paths=module.paths;m._compile(bundled.outputFiles[0].text,m.filename);api=m.exports;
 components=await loadBodies('components/resume-studio/ResumeDesignWorkbench.tsx');
});
const resume={name:'Amina',title:'Engineer',email:'amina@example.invalid',phone:'',location:'',summary:'Builds reliable systems.',experience:[{id:'job',role:'Engineer',company:'Example',duration:'2026',achievements:['Built a service.']}],education:[],skills:[],certifications:['First certificate','Second certificate']};
function setup(){const original=structuredClone(resume);const d=api.createResumeDesign('technical-signal',resume);const changes=[];let ui;
 ui=runtime(components.ResumeDesignWorkbench,{resume:original,value:d,title:'Signature',renderDocument:()=>null,onChange:value=>{changes.push(value);ui.props={...ui.props,value};}});
 Object.assign(globalThis,api,{ResumeDesignPanel:'design-panel',requestAnimationFrame:fn=>fn()});ui.flush();return{ui,changes,original};}
function button(ui,label){return ui.find(n=>n.type==='button' && (n.props['aria-label']===label || (Array.isArray(n.props.children) ? n.props.children.join('') : n.props.children)===label));}
function select(ui,id){ui.find(n=>n.type==='select'&&n.props.children[0]?.props?.children==='Global design').props.onChange({target:{value:id}});ui.flush();}
test('context and global edits share undo/redo without mutating candidate facts',()=>{
 const {ui,original}=setup();const snapshot=structuredClone(original);const panel=ui.find(n=>n.type==='design-panel');panel.props.onChange({...ui.props.value,typography:{...ui.props.value.typography,bodySize:11}});ui.flush();
 select(ui,'experience');const title=ui.find(n=>n.type==='input'&&n.props.value==='Experience');title.props.onChange({target:{value:'Selected experience'}});ui.flush();
 button(ui,'Undo design change').props.onClick();ui.flush();assert.equal(ui.props.value.sections.find(s=>s.id==='experience').title,'Experience');assert.equal(ui.props.value.typography.bodySize,11);
 button(ui,'Undo design change').props.onClick();ui.flush();assert.equal(ui.props.value.typography.bodySize,10.5);button(ui,'Redo design change').props.onClick();ui.flush();assert.equal(ui.props.value.typography.bodySize,11);assert.deepEqual(original,snapshot);
});
test('hiding retains section overrides, returns to global controls, restores stable section and focus',()=>{
 const {ui}=setup();select(ui,'experience');const d=structuredClone(ui.props.value);d.sections.find(s=>s.id==='experience').typography={bodySize:12};ui.props={...ui.props,value:d};ui.flush();select(ui,'experience');let focus=0;document.getElementById=id=>({focus:()=>{assert.equal(id,'rdw-restore-experience');focus++;}});
 button(ui,'Hide Experience').props.onClick();ui.flush();assert.equal(focus,1);assert.ok(ui.nodes().some(n=>n.type==='design-panel'));assert.equal(ui.props.value.sections.find(s=>s.id==='experience').typography.bodySize,12);
 button(ui,'Restore Experience').props.onClick();ui.flush();assert.ok(ui.nodes().some(n=>n.props['aria-label']==='Experience design controls'));assert.equal(ui.props.value.sections.find(s=>s.id==='experience').visible,true);
});
test('source replacement clears selection and invalidates reordered positional entry breaks',()=>{
 const {ui}=setup();const d={...ui.props.value,breakBeforeEntries:['certifications:0']};ui.props={...ui.props,value:d};ui.flush();select(ui,'experience');const next=structuredClone(ui.props.resume);next.certifications.reverse();ui.props={...ui.props,resume:next};ui.flush();
 assert.equal(ui.props.value.breakBeforeEntries.length,0);assert.ok(ui.nodes().some(n=>n.type==='design-panel'));assert.match(ui.text(),/moved or replaced records were cleared/);button(ui,'Undo design change').props.onClick();ui.flush();assert.equal(ui.props.value.breakBeforeEntries.length,0,'reset history cannot resurrect a reassigned break');
});

test('global reset uses the shared history and can be undone',()=>{
 const {ui}=setup();ui.props={...ui.props,onReset:()=>api.createResumeDesign('technical-signal',resume)};ui.flush();
 ui.find(n=>n.type==='design-panel').props.onChange({...ui.props.value,typography:{...ui.props.value.typography,nameSize:35}});ui.flush();
 ui.find(n=>n.type==='design-panel').props.onReset();ui.flush();assert.equal(ui.props.value.typography.nameSize,27);button(ui,'Undo design change').props.onClick();ui.flush();assert.equal(ui.props.value.typography.nameSize,35);
});
