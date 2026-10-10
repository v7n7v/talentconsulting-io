const test=require('node:test');const assert=require('node:assert/strict');const {build}=require('esbuild');const Module=require('node:module');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const root=process.cwd();let api;
test.before(async()=>{
 const bundled=await build({stdin:{contents:"export * from './lib/resume-design'; export * from './lib/resume-design/flagship'; export * from './lib/resume-workspace'; export * from './lib/resume-workflow'; export * from './lib/resume-templates/persistence'; export {ResumeTemplate} from './components/resume-templates'; export {buildResumePDFArtifact} from './lib/pdf-templates';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':root},loader:{'.css':'empty'},external:['react','react-dom/server','react/jsx-runtime','@react-pdf/renderer','pdfjs-dist/legacy/build/pdf.mjs'],logLevel:'silent'});
 const m=new Module(root+'/flagship-integration-memory.cjs',module);m.filename=root+'/flagship-integration-memory.cjs';m.paths=module.paths;m._compile(bundled.outputFiles[0].text,m.filename);api=m.exports;
});
const resume={name:'Amina Rivera',title:'Engineer',email:'amina@example.invalid',phone:'',location:'Boston',summary:'Builds reliable services.',experience:[{id:'job',company:'Example',role:'Engineer',duration:'2026',achievements:['Improved reliability by 20%.']}],education:[],skills:[],certifications:[]};
test('explicit Signature opt-in persists/reopens without changing source or old v2 records',async()=>{
 const v2=api.createResumeDesign('technical-signal',resume);const snapshot=structuredClone(v2);const before=structuredClone(resume);const v3=api.createResumeFlagshipDesign(resume,v2);
 assert.equal(v3.rendererVersion,3);assert.equal(v3.composition,'taco-signature');assert.deepEqual(v2,snapshot);assert.deepEqual(api.readResumeDesign(v2,resume),v2);
 const metadata=api.createWorkspaceMetadata({kind:'resume',origin:'user_authored',content:resume,contentHash:await api.stableWorkspaceContentHash(resume),presentation:{template:v3.templateId,pageSize:v3.pageSize,design:v3}});
 const loaded=api.readWorkspaceVersion(JSON.parse(JSON.stringify({id:'signature',content:resume,metadata:{workspace:metadata}})));
 assert.deepEqual(loaded.presentation.design,v3);assert.deepEqual(loaded.candidate,resume);assert.deepEqual(resume,before);
 const carrier={template:'technical-signal',metadata:{template:'technical-signal',workspace:{presentation:{design:v3}}}};
 assert.equal(api.getPersistedResumeDesign(carrier,resume).rendererVersion,3);
 assert.equal(api.getPersistedResumeDesign({...carrier,template:'other',metadata:{...carrier.metadata,template:'other'}},resume),null);
});
test('version dispatch rejects ambiguous/future compositions; switching template is explicit',()=>{
 const v2=api.createResumeDesign('technical-signal',resume);const v3=api.createResumeFlagshipDesign(resume,v2);
 assert.equal(api.readResumeDesign({...v3,composition:undefined},resume),null);assert.equal(api.readResumeDesign({...v3,composition:'future'},resume),null);assert.equal(api.readResumeDesign({...v3,rendererVersion:4},resume),null);assert.equal(api.readResumeDesign({...v2,composition:'taco-signature'},resume),null);
 const switched=api.switchResumeDesignTemplate(v3,'editorial-signature',resume,true);assert.equal(switched.rendererVersion,2);assert.equal(switched.composition,undefined);
 const signature=api.resumeDesignSignature(resume,v2.templateId,{},'A4',v2);assert.notEqual(signature,api.resumeDesignSignature(resume,v3.templateId,{},'A4',v3));assert.notEqual(signature,api.resumeDesignSignature(resume,v2.templateId,{},'A4',v2,'designed','flagship-experiment'));
});
test('saved generation keeps composition separate from generated-content identity',()=>{
 const design=api.createResumeFlagshipDesign(resume);const inputs={source:resume,jobDescription:'Build systems',role:'Engineer',company:'Example',postingUrl:'',percentage:50,targetPageCount:'auto',unlocked100:false};
 const restored=api.restoreResumeGeneration({schemaVersion:2,id:'generation',createdAt:'2026-10-08T00:00:00Z',inputs,effectivePercentage:50,candidate:resume,review:{decisions:{}},presentation:{templateId:design.templateId,paletteId:'classic',pageSize:'A4',design}});
 assert.equal(restored.presentation.design.rendererVersion,3);const key=api.resumeGenerationKey(restored.inputs);restored.presentation.design.typography.bodySize=12;assert.equal(api.resumeGenerationKey(restored.inputs),key);
});
test('real HTML and downloadable PDF dispatch to the opted-in saved composition',async()=>{
 const design=api.createResumeFlagshipDesign(resume);const html=renderToStaticMarkup(React.createElement(api.ResumeTemplate,{resume,templateId:design.templateId,colors:{primary:'#000000',accent:'#444444',text:'#000000'},design}));assert.match(html,/resume-flagship-page/);
 const v2=api.createResumeDesign('technical-signal',resume);const oldHtml=renderToStaticMarkup(React.createElement(api.ResumeTemplate,{resume,templateId:v2.templateId,colors:{primary:'#000000',accent:'#444444',text:'#000000'},design:v2}));assert.doesNotMatch(oldHtml,/resume-flagship-page/);
 const artifact=await api.buildResumePDFArtifact(resume,undefined,design.templateId,'A4',design);const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const doc=await pdfjs.getDocument({data:await artifact.blob.arrayBuffer(),standardFontDataUrl:root+'/node_modules/pdfjs-dist/standard_fonts/'}).promise;
 const meta=await doc.getMetadata();assert.equal(meta.info.Subject,'Taco Signature résumé');assert.equal(doc.numPages,artifact.pageCount);await doc.destroy();
 await assert.rejects(api.buildResumePDFArtifact({...resume,name:'李明'},undefined,design.templateId,'A4',design),/cannot render.*Name/s);
});

test('accent text contrast is visible before export without changing the chosen colors',()=>{
 const design=api.createResumeFlagshipDesign(resume);design.colors.accent='#ffffff';const before=structuredClone(design);
 assert.ok(api.getResumeDesignWarnings(design,resume).some(warning=>warning.startsWith('Accent text contrast')));
 assert.deepEqual(design,before);
 design.colors.railInk='#ffffff';design.colors.accent='#4a626b';
 assert.ok(!api.getResumeDesignWarnings(design,resume).some(warning=>warning.startsWith('Rail')),'unused rail colors do not warn in this one-column composition');
});
