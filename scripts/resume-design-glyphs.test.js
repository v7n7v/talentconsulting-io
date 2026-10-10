const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');
const root = path.resolve(__dirname, '..');
const candidate = { name:'Ana Rodríguez', title:'Engineer', email:'ana@example.invalid', phone:'', location:'', summary:'Builds reliable systems.', experience:[], education:[], skills:[], certifications:[] };
let api;
test.before(async () => {
  fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
  const dir = fs.mkdtempSync(path.join(root,'tmp','.resume-glyphs-'));
  try {
    await build({entryPoints:[path.join(root,'lib/resume-design/glyph-coverage.ts')],outfile:path.join(dir,'glyph.cjs'),bundle:true,platform:'node',format:'cjs',alias:{'@':root},external:['@react-pdf/renderer'],logLevel:'silent'});
    await build({entryPoints:[path.join(root,'lib/resume-design/index.ts')],outfile:path.join(dir,'design.cjs'),bundle:true,platform:'node',format:'cjs',alias:{'@':root},logLevel:'silent'});
    await build({entryPoints:[path.join(root,'lib/pdf-templates.tsx')],outfile:path.join(dir,'artifact.cjs'),bundle:true,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':root},external:['@react-pdf/renderer','react','react/jsx-runtime','pdfjs-dist/legacy/build/pdf.mjs'],logLevel:'silent'});
    api = {...require(path.join(dir,'glyph.cjs')),...require(path.join(dir,'design.cjs')),...require(path.join(dir,'artifact.cjs'))};
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('actual bundled fonts accept accented Latin source without changing it', async () => {
  const snapshot = JSON.stringify(candidate);
  await api.assertResumeGlyphCoverage(candidate, api.createResumeDesign('technical-signal', candidate));
  assert.equal(JSON.stringify(candidate), snapshot);
});
test('missing glyphs stop designed and application exports with actionable field feedback', async () => {
  const resume = {...candidate, name:'李明 Ana'};
  const design = api.createResumeDesign('technical-signal', resume);
  for (const mode of ['designed','application']) {
    await assert.rejects(api.assertResumeGlyphCoverage(resume,design,mode),/cannot render.*Name.*original text has been kept/s);
  }
});
test('hidden text does not block an export but restoring it reruns coverage', async () => {
  const resume = {...candidate, summary:'中文内容'};
  const design = api.createResumeDesign('technical-signal',resume);
  design.sections.find(section=>section.id==='summary').visible = false;
  await api.assertResumeGlyphCoverage(resume,design);
  design.sections.find(section=>section.id==='summary').visible = true;
  await assert.rejects(api.assertResumeGlyphCoverage(resume,design),/cannot render.*Summary/s);
});
test('a supported font change resolves the same Cyrillic source without transliteration', async () => {
  const resume = {...candidate, summary:'Опыт работы'};
  const design = api.createResumeDesign('technical-signal',resume);
  design.typography.bodyFont = 'liberation-sans';
  await api.assertResumeGlyphCoverage(resume,design);
  assert.equal(resume.summary,'Опыт работы');
});
test('the real downloadable-artifact path rejects unsupported text before publishing bytes', async () => {
  const resume = {...candidate, name:'李明 Ana'};
  const design = api.createResumeDesign('technical-signal',resume);
  await assert.rejects(api.buildResumePDFArtifact(resume,undefined,'technical-signal','A4',design),/cannot render.*Name/s);
  assert.equal(resume.name,'李明 Ana');
});
