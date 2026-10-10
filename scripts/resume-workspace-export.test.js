const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const pdfSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'pdf-templates.tsx'), 'utf8');
const signatureSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'resume-signature-pdf.tsx'), 'utf8');

test('export contract retains additional sections, links, page size, and source symbols', () => {
  assert.match(pdfSource, /buildResumePDFArtifact/);
  assert.match(pdfSource, /pageSize\?: 'A4' \| 'LETTER'/);
  assert.match(pdfSource, /PDFAdditionalSections/);
  assert.match(pdfSource, /additionalSections/);
  assert.match(pdfSource, /resume\.linkedin/);
  assert.match(pdfSource, /resume\.website/);
  assert.match(signatureSource, /AdditionalSectionsSection/);
  assert.match(signatureSource, /size=\{props\.pageSize \|\| 'A4'\}/);
});

test('the artifact helper bundles with local PDF dependencies', () => {
  const outfile = path.join(__dirname, '.resume-workspace-export.tmp.cjs');
  try {
    buildSync({ entryPoints: [path.join(__dirname, '..', 'lib', 'pdf-templates.tsx')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', external: ['next/*'] });
    assert.ok(fs.statSync(outfile).size > 10_000);
  } finally { try { fs.unlinkSync(outfile); } catch {} }
});

test('legacy free PDF templates render real long artifacts with extras, links, Unicode, and pagination', async () => {
  const outfile = path.join(__dirname, '.resume-workspace-pdf.tmp.cjs');
  try {
    buildSync({ entryPoints: [path.join(__dirname, '..', 'lib', 'pdf-templates.tsx')], outfile, bundle: true, platform: 'node', format: 'cjs', target: 'node20', jsx: 'automatic', alias: { '@': path.join(__dirname, '..') }, external: ['next/*', 'react', 'react/jsx-runtime', 'react-dom'], logLevel: 'silent' });
    const renderer = require('@react-pdf/renderer');
    const originalRegister = renderer.Font.register;
    renderer.Font.register = () => {};
    const pdfModule = require(outfile);
    renderer.Font.register = originalRegister;
    renderer.Font.register({ family: 'Inter', fonts: [
      { src: path.join(__dirname, '..', 'public/fonts/Inter-Regular.ttf'), fontWeight: 'normal' },
      { src: path.join(__dirname, '..', 'public/fonts/Inter-Bold.ttf'), fontWeight: 'bold' },
      { src: path.join(__dirname, '..', 'public/fonts/Inter-Italic.ttf'), fontStyle: 'italic' },
    ] });
    const pdfParse = require('pdf-parse');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const longResume = {
      name: 'Zoë 🚀 Résumé', title: 'Principal Systems Designer', email: 'zoe@example.test', phone: '+1 212 555 0123', location: 'New York, NY',
      links: ['https://research.example.test/work'], linkedin: 'https://linkedin.com/in/zoe', website: 'https://zoe.example.test', summary: 'A long Unicode safe summary — preserved exactly for review.',
      experience: Array.from({ length: 12 }, (_, index) => ({ company: `Company ${index + 1}`, role: `Role ${index + 1}`, duration: `20${10 + index}–20${11 + index}`, achievements: Array.from({ length: 5 }, (_, item) => `Achievement ${index + 1}.${item + 1} — improved systems by ${item + 1}%`) })),
      education: [{ degree: 'MSc Design & Systems', institution: 'Université de Montréal', year: '2010', details: 'Research and practice.' }],
      skills: [{ category: 'Languages', items: ['TypeScript', 'Python', 'Café'] }], certifications: ['Certified Systems Architect'],
      additionalSections: [{ id: 'community', title: 'Community', items: ['Mentor — open source contributors', 'Volunteer coordinator'] }],
    };
    for (const templateId of ['editorial-authority', 'technical-signal', 'brutalist-voltage']) {
      const rendered = await renderer.renderToBuffer(pdfModule.ResumePDFDocument({ resume: longResume, templateId, pageSize: 'LETTER' }));
      const parsed = await pdfParse(Buffer.from(rendered));
      assert.ok(parsed.numpages > 1, `${templateId} paginates long content`);
      for (const value of ['https://research.example.test/work', 'Zoë', 'zoe@example.test', 'https://linkedin.com/in/zoe', 'https://zoe.example.test', 'A long Unicode safe summary', 'Company 12', 'Achievement 12.5', 'MSc Design & Systems', 'Université de Montréal', 'Certified Systems Architect', 'Community', 'Volunteer coordinator']) assert.match(parsed.text, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${templateId} preserves ${value}`);
      assert.ok(parsed.text.toLowerCase().lastIndexOf('achievement 12.5') < parsed.text.toLowerCase().lastIndexOf('community'), `${templateId} appends additional sections after main content`);
      const letterDocument = await pdfjs.getDocument({ data: new Uint8Array(rendered) }).promise;
      const letterViewport = (await letterDocument.getPage(1)).getViewport({ scale: 1 });
      await letterDocument.destroy();
      const a4 = await renderer.renderToBuffer(pdfModule.ResumePDFDocument({ resume: longResume, templateId, pageSize: 'A4' }));
      const a4Document = await pdfjs.getDocument({ data: new Uint8Array(a4) }).promise;
      const a4Viewport = (await a4Document.getPage(1)).getViewport({ scale: 1 });
      await a4Document.destroy();
      assert.notEqual(Math.round(letterViewport.width), Math.round(a4Viewport.width), `${templateId} exposes distinct LETTER and A4 geometry`);
    }
    const sparse = { name: 'Amina Patel', title: 'Product designer', email: 'amina@example.test', phone: '', location: '', linkedin: '', website: '', summary: '', experience: [], education: [], skills: [], certifications: [], additionalSections: [{ id: 'projects', title: 'Community Projects', items: ['Designed a volunteer scheduling tool.'] }] };
    const sparseBuffer = await renderer.renderToBuffer(pdfModule.ResumePDFDocument({ resume: sparse, templateId: 'editorial-authority', pageSize: 'A4' }));
    const sparseDocument = await pdfjs.getDocument({ data: new Uint8Array(sparseBuffer) }).promise;
    const sparsePage = await sparseDocument.getPage(1);
    const sparseItems = (await sparsePage.getTextContent()).items.filter((item) => typeof item.str === 'string');
    const xFor = (needle) => sparseItems.find((item) => item.str.toLowerCase().includes(needle.toLowerCase()))?.transform?.[4];
    assert.ok(Number(xFor('Amina')) < Number(xFor('Community')), 'editorial rail identity remains left of flowing additional content');
    await sparseDocument.destroy();
  } finally { try { fs.unlinkSync(outfile); } catch {} }
});
