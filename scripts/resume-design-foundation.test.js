const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');
const { test } = require('node:test');
const React = require('react');
const { pdf } = require('@react-pdf/renderer');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');

let ResumeDesignPDFPage;
let createResumeDesign;
let buildResumeDocumentPlan;

async function loadAdapters() {
  const result = await build({
    stdin: { contents: "export {ResumeDesignPDFPage} from './lib/resume-design/pdf'; export {createResumeDesign,buildResumeDocumentPlan} from './lib/resume-design';", resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['@react-pdf/renderer', 'react', 'react/jsx-runtime'],
    alias: { '@': process.cwd() }, logLevel: 'silent',
  });
  const Module = require('node:module');
  const compiled = new Module(`${process.cwd()}/foundation-memory.cjs`, module);
  compiled.filename = `${process.cwd()}/foundation-memory.cjs`;
  compiled.paths = module.paths;
  compiled._compile(result.outputFiles[0].text, compiled.filename);
  return compiled.exports;
}

async function pdfText(resume, design, mode) {
  const stream = await pdf(React.createElement(ResumeDesignPDFPage, { resume, design, mode })).toBuffer();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)), isEvalSupported: false, standardFontDataUrl: path.join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/') }).promise;
  const pages = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push({ width: viewport.width, height: viewport.height, items: content.items.filter(item => typeof item.str === 'string').map(item => ({
      str: item.str, x: item.transform?.[4] || 0, y: item.transform?.[5] || 0,
      width: item.width || 0, height: item.height || 0,
    })) });
  }
  await doc.destroy();
  return pages;
}

function sourceText(pages) { return pages.flatMap(page => page.items.map(item => item.str)).join(' ').replace(/\s+/gu, ' ').trim(); }
function dewrap(value) { return value.replace(/\s+/gu, ''); }

function baseResume(overrides = {}) {
  return {
    name: 'Maya Rivera-Smith', title: 'Research Engineer', email: 'maya@example.invalid', phone: '555-0134', location: 'Boston, MA',
    summary: '', experience: [], education: [], skills: [], certifications: [], ...overrides,
  };
}

function designFor(create, resume, pageSize = 'A4', nameSize = 27, template = 'editorial-authority', marginMm = 16) {
  const design = create(template, resume, undefined, pageSize);
  return { ...design, typography: { ...design.typography, nameSize }, layout: { ...design.layout, dates: 'inline', margins: { top: marginMm, right: marginMm, bottom: marginMm, left: marginMm } } };
}

test('PDF foundation preserves partial education dates and wraps oversized name/contact tokens', async () => {
  ({ ResumeDesignPDFPage, createResumeDesign, buildResumeDocumentPlan } = await loadAdapters());
  const longName = 'NarayanaVenkatasubramanianRamakrishnan';
  const longUrl = `https://portfolio.example.invalid/case-studies/${'longsegment'.repeat(12)}`;
  const resume = baseResume({
    name: longName,
    website: longUrl,
    education: [
      { id: 'complete', degree: 'B.S. Physics', institution: 'State University', year: '2020', details: 'Coursework' },
      { id: 'institution-only', degree: '', institution: 'Source University', year: 'YEAR2026MARKER', details: '' },
      { id: 'year-only', degree: '', institution: '', year: 'DATEONLY2025MARKER', details: '' },
      { id: 'institution-date', degree: '', institution: 'Partial College', year: 'PARTIALDATE2024MARKER', details: 'Details retained' },
    ],
  });
  const plan = buildResumeDocumentPlan(resume, designFor(createResumeDesign, resume));
  const educationPlanText = JSON.stringify(plan.sections.find(section => section.kind === 'education'));
  assert.match(educationPlanText, /YEAR2026MARKER/);
  assert.match(educationPlanText, /DATEONLY2025MARKER/);
  assert.match(educationPlanText, /PARTIALDATE2024MARKER/);

  for (const pageSize of ['A4', 'LETTER']) {
    for (const nameSize of [27, 48]) {
      for (const marginMm of [16, 30]) {
      const design = designFor(createResumeDesign, resume, pageSize, nameSize, 'editorial-authority', marginMm);
      const expectedWidth = pageSize === 'LETTER' ? 612 : 595.276;
      for (const mode of ['designed', 'application']) {
        const pages = await pdfText(resume, design, mode);
        const extracted = sourceText(pages);
        assert.ok(dewrap(extracted).includes(dewrap(longName)), `${pageSize}/${nameSize}/${mode}: full unbroken name recoverable: ${extracted}`);
        assert.ok(dewrap(extracted).includes(dewrap(longUrl)), `${pageSize}/${nameSize}/${mode}: full URL recoverable`);
        for (const marker of ['YEAR2026MARKER', 'DATEONLY2025MARKER', 'PARTIALDATE2024MARKER']) {
          assert.ok(dewrap(extracted).includes(dewrap(marker)), `${pageSize}/${nameSize}/${mode}: ${marker} extracted: ${extracted}`);
        }
        for (const page of pages) {
          assert.ok(Math.abs(page.width - expectedWidth) < 0.1, `${pageSize}/${mode} page width retained`);
          for (const item of page.items) {
            const leftInset = marginMm * 72 / 25.4;
            const topInset = marginMm * 72 / 25.4;
            const bottomInset = marginMm * 72 / 25.4;
            assert.ok(item.x >= leftInset - 1, `${pageSize}/${mode} text starts within the page content area: ${JSON.stringify(item)}`);
            assert.ok(item.x + item.width <= page.width - leftInset + 1, `${pageSize}/${mode} text ends within the page content area: ${JSON.stringify(item)}`);
            assert.ok(item.y - item.height >= bottomInset - 1, `${pageSize}/${mode} text stays above the bottom inset: ${JSON.stringify(item)}`);
            assert.ok(item.y <= page.height - topInset + 1, `${pageSize}/${mode} text stays below the top inset: ${JSON.stringify(item)}`);
          }
        }
      }
      assert.equal(design.typography.nameSize, nameSize, 'rendering does not silently shrink configured name type');
      }
    }
  }
});

test('ordinary name words stay intact and wrap between words', async () => {
  ({ ResumeDesignPDFPage, createResumeDesign } = await loadAdapters());
  const name = 'Alexandria Cassandra Maximilian Rivera Smith';
  const resume = baseResume({ name, website: '' });
  const design = designFor(createResumeDesign, resume, 'A4', 48, 'editorial-authority', 16);
  for (const mode of ['designed', 'application']) {
    const pages = await pdfText(resume, design, mode);
    const extracted = sourceText(pages);
    assert.ok(extracted.includes(name), `${mode}: ordinary name words remain whole and in order: ${extracted}`);
    for (const word of name.split(' ')) assert.ok(pages.flatMap(page => page.items).some(item => item.str.includes(word)), `${mode}: word ${word} is recoverable`);
  }
});

test('font-measured emergency wrapping preserves wide glyphs and narrow contact measures', async () => {
  ({ ResumeDesignPDFPage, createResumeDesign } = await loadAdapters());
  const longUrl = `https://portfolio.example.invalid/case-studies/${'longsegment'.repeat(12)}?project=source-preservation&revision=2026`;
  const cases = [
    { label: 'Inter bold W', name: 'W'.repeat(35), template: 'brutalist-voltage', pageSize: 'A4', margin: 40, configure: d => { d.typography.headingFont = 'inter'; d.typography.nameSize = 60; d.typography.headingWeight = 700; } },
    { label: 'DejaVu Sans bold M', name: 'M'.repeat(35), template: 'brutalist-voltage', pageSize: 'A4', margin: 40, configure: d => { d.typography.headingFont = 'dejavu-sans'; d.typography.nameSize = 48; d.typography.headingWeight = 700; } },
    { label: 'Liberation Mono bold W', name: 'W'.repeat(35), template: 'brutalist-voltage', pageSize: 'A4', margin: 40, configure: d => { d.typography.headingFont = 'liberation-mono'; d.typography.nameSize = 60; d.typography.headingWeight = 700; } },
    { label: 'hyphenated human name', name: 'Dr. Alexandra-Chiamaka Okafor-Rodríguez', template: 'brutalist-voltage', pageSize: 'A4', margin: 40, configure: d => { d.layout.railWidth = 20; } },
    { label: 'ordinary short name words', name: 'Dr. Ana Smith', template: 'brutalist-voltage', pageSize: 'A4', margin: 40, configure: d => {} },
    { label: 'bold mono narrow contact', name: 'Ana Test', email: `${'W'.repeat(64)}@example.invalid`, website: `https://example.invalid/${'M'.repeat(80)}`, template: 'brutalist-voltage', pageSize: 'LETTER', margin: 40, configure: d => { d.typography.bodyFont = 'liberation-mono'; d.typography.bodyWeight = 700; d.typography.contactSize = 16; } },
  ];
  for (const fixture of cases) {
    const resume = baseResume({ name: fixture.name, email: fixture.email || 'ana@example.invalid', website: fixture.website || longUrl });
    const design = designFor(createResumeDesign, resume, fixture.pageSize, 36, fixture.template, fixture.margin);
    fixture.configure(design);
    for (const mode of ['designed', 'application']) {
      const pages = await pdfText(resume, design, mode);
      const extracted = sourceText(pages);
      assert.ok(dewrap(extracted).includes(dewrap(resume.name)), `${fixture.label}/${mode}: complete name recoverable`);
      assert.ok(dewrap(extracted).includes(dewrap(resume.email)), `${fixture.label}/${mode}: complete email recoverable`);
      assert.ok(dewrap(extracted).includes(dewrap(resume.website)), `${fixture.label}/${mode}: complete URL recoverable`);
      const inset = fixture.margin * 72 / 25.4;
      for (const page of pages) for (const item of page.items) {
        assert.ok(item.x >= inset - 1, `${fixture.label}/${mode}: text stays inside left content bound (${item.x})`);
        assert.ok(item.x + item.width <= page.width - inset + 1, `${fixture.label}/${mode}: text stays inside right content bound (${item.x + item.width}/${page.width - inset})`);
      }
      if (fixture.label === 'ordinary short name words') {
        for (const word of resume.name.split(/\s+/u)) assert.ok(pages.flatMap(page => page.items).some(item => item.str.includes(word)), `${mode}: whole name word retained: ${word}`);
      }
    }
  }
});
