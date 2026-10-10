const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {loadBodies,runtime}=require('./test-ui-hooks.cjs');let component;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
test.before(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'resume-preview-state-'));const file=path.join(dir,'component.tsx');
 // Replace only the asynchronous PDF.js service boundary. The component handlers/effects run unchanged.
 fs.writeFileSync(file,fs.readFileSync('components/resume-studio/ResumeExportPreview.tsx','utf8').replace('await import("pdfjs-dist/legacy/build/pdf.mjs")','await __previewPdfjs()'));
 component=(await loadBodies(file)).ResumeExportPreview;fs.rmSync(dir,{recursive:true,force:true});
});
function setup(){
 const artifacts=[];const ui=runtime(component,{resume:{name:'Amina'},templateId:'technical-signal',pageSize:'A4',onArtifact:a=>artifacts.push(a)});
 globalThis.useLayoutEffect=(...args)=>globalThis.__appUi.useEffect(...args);
 globalThis.resumeDesignSignature=(...args)=>JSON.stringify(args);globalThis.buildResumePDFArtifact=async()=>({blob:new Blob(['reviewed bytes']),pageCount:1});
 globalThis.__previewPdfjs=async()=>({GlobalWorkerOptions:{workerSrc:'test'},getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getViewport:()=>({width:600,height:800}),render:()=>({promise:Promise.resolve()}),cleanup(){}}),destroy:async()=>{}}),destroy:async()=>{}})});
 window.document={createElement:()=>({setAttribute(){},getContext:()=>({})})};ui.flush();
 const host={children:[],replaceChildren(){this.children=[]},appendChild(c){this.children.push(c)}};
 ui.find(n=>n.props['aria-label']==='Rendered PDF pages').props.ref.current=host;
 return{ui,host,artifacts};
}
const build=ui=>ui.find(n=>n.type==='button').props.onClick();
test('an obsolete build cannot publish bytes after content or composition changes',async()=>{
 const {ui,artifacts,host}=setup();const pending=deferred();buildResumePDFArtifact=()=>pending.promise;const work=build(ui);ui.flush();
 ui.props={...ui.props,resume:{name:'Other'},composition:'flagship-experiment'};ui.flush();pending.resolve({blob:new Blob(['old']),pageCount:1});await work;ui.flush();
 assert.equal(artifacts.filter(Boolean).length,0);assert.equal(host.children.length,0);assert.equal(ui.nodes().filter(n=>n.type==='a').length,0);
});
test('download becomes available only when the current PDF canvas has rendered',async()=>{
 const {ui,artifacts,host}=setup();const rendering=deferred();__previewPdfjs=async()=>({GlobalWorkerOptions:{workerSrc:'test'},getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getViewport:()=>({width:600,height:800}),render:()=>({promise:rendering.promise}),cleanup(){}}),destroy:async()=>{}}),destroy:async()=>{}})});
 const work=build(ui);await ui.settle();assert.equal(artifacts.filter(Boolean).length,0);assert.equal(ui.nodes().filter(n=>n.type==='a').length,0);
 rendering.resolve();await work;ui.flush();assert.equal(host.children.length,1);assert.equal(artifacts.filter(Boolean).length,1);assert.equal(ui.find(n=>n.type==='a').props.href,artifacts.at(-1).url);
 ui.unmount();
});
test('failed preview clears partial pages and exposes a retry without losing the source',async()=>{
 const {ui,artifacts,host}=setup();const source=ui.props.resume;__previewPdfjs=async()=>{throw Error('Temporary preview failure')};await build(ui);ui.flush();assert.match(ui.text(),/Temporary preview failure/);assert.equal(host.children.length,0);assert.equal(artifacts.filter(Boolean).length,0);assert.equal(ui.props.resume,source);assert.equal(ui.find(n=>n.type==='button').props.disabled,false);
 __previewPdfjs=async()=>({GlobalWorkerOptions:{workerSrc:'test'},getDocument:()=>({promise:Promise.resolve({numPages:0,destroy:async()=>{}}),destroy:async()=>{}})});await build(ui);ui.flush();assert.equal(ui.nodes().filter(n=>n.props.role==='alert').length,0);assert.equal(artifacts.filter(Boolean).length,1);ui.unmount();
});
test('unmount blocks a late artifact completion',async()=>{
 const {ui,artifacts}=setup();const pending=deferred();buildResumePDFArtifact=()=>pending.promise;const work=build(ui);ui.flush();ui.unmount();pending.resolve({blob:new Blob(['old']),pageCount:1});await work;assert.equal(artifacts.filter(Boolean).length,0);
});
