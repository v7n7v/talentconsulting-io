const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { test } = require('node:test');
const React = require('react');
const { pdf } = require('@react-pdf/renderer');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
const JSZip = require('jszip');
let ResumeDesignPDFPage;
let buildResumeDesignDocxBuffer;
let buildResumeDocumentPlan;
let createResumeDesign;
let getApplicationResumeDesign;
let shouldUseStackedResumeHeader;
let RESUME_TEMPLATE_FIXTURES;
let RESUME_DESIGN_PRESETS;
let RESUME_FONTS;

const OUT = path.join(process.cwd(), 'tmp/template-v2-verification');
const PDF_DIR = path.join(OUT, 'pdfs');
const DOCX_DIR = path.join(OUT, 'docx');
let TEMPLATE_IDS;
const MARKER_RE = /\b[A-Z0-9]+MARKER\b/g;
pdfjs.GlobalWorkerOptions.workerSrc = path.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');

async function loadResumeDesignAdapters() {
  // Compile the repository's TypeScript/TSX adapters inside this test so the
  // documented `node --test scripts/resume-design-export.test.js` command works directly.
  fssync.mkdirSync(OUT, { recursive: true });
  const tempDir = fssync.mkdtempSync(path.join(OUT, '.resume-design-export-'));
  try {
    await build({
      entryPoints: {
        pdf: path.join(process.cwd(), 'lib/resume-design/pdf.tsx'),
        docx: path.join(process.cwd(), 'lib/resume-design/docx.ts'),
        design: path.join(process.cwd(), 'lib/resume-design/index.ts'),
      },
      outdir: tempDir,
      outbase: path.join(process.cwd(), 'lib/resume-design'),
      bundle: true,
      format: 'cjs',
      platform: 'node',
      target: 'node20',
      jsx: 'automatic',
      external: ['@react-pdf/renderer', 'react', 'react/jsx-runtime', 'docx'],
      alias: { '@': process.cwd() },
      logLevel: 'silent',
    });
    const fixtureOut = path.join(tempDir, 'fixtures.cjs');
    await build({ entryPoints: [path.join(process.cwd(), 'lib/resume-templates/fixtures.ts')], outfile: fixtureOut, bundle: true, platform: 'node', format: 'cjs', target: 'node20', alias: { '@': process.cwd() }, logLevel: 'silent' });
    return {
      ...require(path.join(tempDir, 'pdf.js')),
      ...require(path.join(tempDir, 'docx.js')),
      ...require(path.join(tempDir, 'design.js')),
      ...require(fixtureOut),
    };
  } finally {
    fssync.rmSync(tempDir, { recursive: true, force: true });
  }
}

function resumeFull() {
  return {
    name: 'CANDIDATEMARKER Rivera-Smith', title: 'ENGINEERTITLEMARKER',
    email: 'EMAILMARKER@example.invalid', phone: '555-0142', location: 'Boston, MA',
    linkedin: 'LINKEDINMARKER.example/profile', website: 'WEBSITEMARKER.example',
    summary: 'SUMMARYMARKER leads reliable teams and ships measurable improvements.',
    experience: [
      { id: 'role-a', company: 'COMPANYALPHAMARKER', role: 'ROLEALPHAMARKER', duration: '2021–Present', achievements: ['BULLETALPHAMARKER reduced deployment time by 38%.'] },
      { id: 'role-b', company: 'COMPANYBETAMARKER', role: 'ROLEBETAMARKER', duration: '2017–2021', achievements: ['BULLETBETAMARKER improved service reliability across teams.'] },
    ],
    education: [{ id: 'school-a', degree: 'DEGREEMARKER Computer Science', institution: 'SCHOOLMARKER University', year: '2017', details: 'DETAILMARKER Distributed systems' }],
    skills: [{ id: 'skills-a', category: 'SKILLMARKER Engineering', items: ['TSMARKER TypeScript', 'PGMARKER PostgreSQL'] }],
    certifications: ['CERTMARKER Cloud Architecture'],
    additionalSections: [{ id: 'projects-a', title: 'PROJMARKER Selected Projects', items: ['PROJECTITEMMARKER Transit platform'] }],
  };
}

function resumeSparse() {
  return { ...resumeFull(), summary: '', experience: [], education: [], skills: [], certifications: [], additionalSections: [], links: [] };
}

function resumeLong() {
  const base = resumeFull();
  return {
    ...base,
    summary: `LONGSUMMARYMARKER ${Array(7).fill('Leads a complex cross-functional program with measurable operating impact and documents outcomes for partner teams.').join(' ')}`,
    experience: Array.from({ length: 9 }, (_, index) => ({
      id: `long-role-${index + 1}`,
      company: `LONGCOMPANYMARKER${index + 1}`,
      role: `LONGROLEMARKER${index + 1} Director of Engineering and Platform Reliability`,
      duration: `${2014 + index}–${2015 + index}`,
      achievements: Array.from({ length: 8 }, (_, bullet) => `LONGBULLETMARKER${index + 1}${bullet + 1} delivered a cross-functional improvement with measurable operating impact, clear ownership, and documented outcomes for partner teams.`),
    })),
    additionalSections: [{ id: 'projects-a', title: 'PROJMARKER Selected Projects', items: Array.from({ length: 5 }, (_, index) => `LONGPROJECTMARKER${index + 1} documented product platform improvement.`) }],
  };
}

function customDesign(templateId, resume, templateIndex, pageSize = 'A4') {
  const design = createResumeDesign(templateId, resume, undefined, pageSize);
  const bodyFont = RESUME_FONTS[templateIndex % RESUME_FONTS.length].id;
  const headingFont = RESUME_FONTS[(templateIndex + 2) % RESUME_FONTS.length].id;
  return {
    ...design,
    typography: {
      ...design.typography, bodyFont, headingFont,
      bodySize: [10, 10.5, 11][templateIndex % 3], headingSize: 12.5,
      bodyWeight: templateIndex % 2 ? 700 : 400, headingWeight: templateIndex % 2 ? 400 : 700, roleSize: 11.5 + (templateIndex % 2),
      nameSize: 27, contactSize: 9.5, lineHeight: 1.3, letterSpacing: 0.1,
      headingCase: templateIndex % 2 ? 'uppercase' : 'normal',
    },
    colors: { ...design.colors, ink: '#202936', heading: '#193b55', accent: '#315f83' },
    layout: { ...design.layout, sectionGap: 9 + (templateIndex % 3), entryGap: 6, bulletGap: 2, ruleWidth: 1.2, showMotif: templateIndex % 2 === 0 },
    sections: design.sections.map(section => section.id === 'experience'
      ? { ...section, typography: { bodySize: 10.75, headingSize: 12.25, bodyWeight: 700, headingWeight: 400, roleSize: 13, bodyFont, headingFont } }
      : section),
  };
}

async function toBuffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function normalizeText(value) {
  return value.replace(/-\s+(?=\p{L})/gu, '').replace(/\s+/g, ' ').trim();
}

function markersIn(value) {
  return [...String(value || '').matchAll(MARKER_RE)].map(match => match[0]);
}

function markersForSections(sections) {
  return sections.flatMap(section => section.entries.flatMap(entry => [
    entry.title, entry.subtitle, entry.date, entry.text, ...(entry.bullets || []),
  ].flatMap(markersIn)));
}

function expectedMarkerFlow(plan, design, mode) {
  let sections = plan.sections.filter(section => section.visible);
  if (mode === 'designed' && design.layout.columns === 2) {
    const rail = sections.filter(section => section.region === 'rail');
    const main = sections.filter(section => section.region === 'main');
    sections = design.layout.railSide === 'left' ? [...rail, ...main] : [...main, ...rail];
  }
  return markersForSections(sections);
}

async function inspectPdf(bytes, includeColors = false) {
  const loaded = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const pages = [];
  const pageItems = [];
  const colors = new Set();
  let text = '';
  for (let number = 1; number <= loaded.numPages; number += 1) {
    const page = await loaded.getPage(number);
    const content = await page.getTextContent();
    pageItems.push(content.items.filter(item => typeof item.str === 'string').map(item => ({
      str: item.str,
      x: item.transform?.[4] || 0,
      y: item.transform?.[5] || 0,
      height: item.height || 0,
      width: item.width || 0,
    })));
    if (includeColors && number === 1) {
      const operators = await page.getOperatorList();
      for (let index = 0; index < operators.fnArray.length; index += 1) {
        if (operators.fnArray[index] === pdfjs.OPS.setFillRGBColor) colors.add([...operators.argsArray[index]].map(value => Math.round(value).toString(16).padStart(2, '0')).join('').toUpperCase());
      }
    }
    const pageText = content.items.map(item => typeof item.str === 'string' ? item.str : '').join(' ');
    text += ` ${pageText}`;
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ width: viewport.width, height: viewport.height });
    page.cleanup();
  }
  await loaded.destroy();
  return { pageCount: pages.length, pages, pageItems, colors: [...colors], text: normalizeText(text) };
}

function assertHeaderGeometry(inspected, split, filename, nameMarker = 'CANDIDATEMARKER', contactMarker = 'EMAILMARKER') {
  const items = inspected.pageItems[0] || [];
  const name = items.find(item => item.str.includes(nameMarker));
  const contact = items.find(item => item.str.includes(contactMarker));
  assert.ok(name && contact, `${filename} first page exposes candidate name and contact text geometry`);
  if (split) {
    assert.ok(name.x + name.width <= contact.x + 1, `${filename} split header keeps identity left of contact`);
  } else {
    const nameBottom = name.y;
    const contactTop = contact.y + contact.height;
    assert.ok(nameBottom >= contactTop - 0.5, `${filename} candidate name sits above contact text without vertical overlap (name baseline ${nameBottom.toFixed(1)}, contact top ${contactTop.toFixed(1)})`);
  }
}

function normalizedSource(value) {
  return normalizeText(value).normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function sourceFields(resume) {
  return [resume.name, resume.title, resume.email, resume.phone, resume.location, resume.linkedin, resume.website, resume.summary,
    ...(resume.links || []), ...resume.experience.flatMap(entry => [entry.company, entry.role, entry.duration, ...entry.achievements]),
    ...resume.education.flatMap(entry => [entry.degree, entry.institution, entry.year, entry.details]),
    ...resume.skills.flatMap(entry => [entry.category, ...entry.items]), ...resume.certifications,
    ...(resume.additionalSections || []).flatMap(section => [section.title, ...section.items])].filter(value => typeof value === 'string' && value.trim());
}

function extractDocxText(xml) {
  const values = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(match => match[1]
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
  return normalizeText(values.join(' '));
}

function visibleContentStrings(resume, plan) {
  const fullText = JSON.stringify(resume);
  assert.match(fullText, /SKILLMARKER/);
  assert.ok(plan.sections.length > 0);
  return markersForSections(plan.sections);
}

test('v2 exports preserve the visible document plan across 100 PDFs and 20 Word companions', async () => {
  ({ ResumeDesignPDFPage, buildResumeDesignDocxBuffer, buildResumeDocumentPlan, createResumeDesign, getApplicationResumeDesign, shouldUseStackedResumeHeader, RESUME_DESIGN_PRESETS, RESUME_FONTS, RESUME_TEMPLATE_FIXTURES } = await loadResumeDesignAdapters());
  TEMPLATE_IDS = Object.keys(RESUME_DESIGN_PRESETS);
  await fs.mkdir(PDF_DIR, { recursive: true });
  await fs.mkdir(DOCX_DIR, { recursive: true });
  const full = resumeFull();
  const sparse = resumeSparse();
  const long = resumeLong();
  const metrics = { generatedAt: new Date().toISOString(), pdfs: [], docx: [], totalPages: 0 };

  for (const [index, templateId] of TEMPLATE_IDS.entries()) {
    const cases = [
      ['full-a4-designed', full, 'A4', 'designed'],
      ['sparse-a4-designed', sparse, 'A4', 'designed'],
      ['long-a4-designed', long, 'A4', 'designed'],
      ['full-letter-designed', full, 'LETTER', 'designed'],
      ['full-a4-application', full, 'A4', 'application'],
    ];
    for (const [label, resume, pageSize, mode] of cases) {
      const design = customDesign(templateId, resume, index, pageSize);
      const exportDesign = mode === 'application' && index === 0 ? { ...design, colors: { ...design.colors, paper: '#101010', ink: '#ffffff', heading: '#ffffff', accent: '#ffffff', rail: '#101010', railInk: '#ffffff' } } : design;
      const plan = buildResumeDocumentPlan(resume, exportDesign);
      const filename = `${templateId}__${label}.pdf`;
      const sourceBefore = JSON.stringify(resume);
      const bytes = await toBuffer(await pdf(React.createElement(ResumeDesignPDFPage, { resume, design: exportDesign, mode })).toBuffer());
      assert.equal(JSON.stringify(resume), sourceBefore, `${filename} export preserves source data`);
      const destination = path.join(PDF_DIR, filename);
      await fs.writeFile(destination, bytes);
      const inspected = await inspectPdf(bytes, mode === 'application' && index === 0);
      assert.ok(inspected.pageCount > 0, `${filename} has pages`);
      assertHeaderGeometry(inspected, mode !== 'application' && design.layout.headerStyle === 'split' && !shouldUseStackedResumeHeader(exportDesign, plan.name, plan.contact), filename);
      if (label.startsWith('sparse-')) assert.equal(inspected.pageCount, 1, `${filename} sparse page count`);
      if (label.startsWith('long-')) assert.ok(inspected.pageCount > 1, `${filename} long résumé should paginate`);
      if (pageSize === 'LETTER') {
        assert.ok(Math.abs(inspected.pages[0].width - 612) < 1 && Math.abs(inspected.pages[0].height - 792) < 1, `${filename} uses US Letter dimensions`);
      } else {
        assert.ok(Math.abs(inspected.pages[0].width - 595.28) < 1 && Math.abs(inspected.pages[0].height - 841.89) < 1, `${filename} uses A4 dimensions`);
      }
      assert.match(inspected.text, /CANDIDATEMARKER/);
      assert.match(inspected.text, /EMAILMARKER/);
      if (label === 'full-a4-designed' || label === 'full-a4-application') {
        const expected = expectedMarkerFlow(plan, exportDesign, mode);
        for (const marker of expected) assert.ok(inspected.text.replace(/\s+/g, '').includes(marker), `${filename} includes ${marker}`);
        // A bounded token may span text runs/lines. Keep punctuation intact and compare marker positions.
        const recovered = inspected.text.replace(/\s+/g, '');
        const found = expected.filter(marker => recovered.includes(marker)).sort((a, b) => recovered.indexOf(a) - recovered.indexOf(b));
        assert.deepEqual(found, expected, `${filename} preserves ${mode} section/rail order`);
        if (mode === 'application' && index === 0) {
          const safe = getApplicationResumeDesign(exportDesign);
          assert.equal(safe.colors.paper, '#ffffff');
          assert.notEqual(safe.colors.ink, '#ffffff');
          assert.notEqual(safe.colors.heading, '#ffffff');
          assert.notEqual(safe.colors.accent, '#ffffff');
          assert.ok(inspected.colors.includes('17212B'), 'application PDF body uses readable fallback ink');
          assert.ok(inspected.colors.includes('18354D'), 'application PDF headings use readable fallback ink');
          assert.ok(inspected.colors.includes('46535E'), 'application PDF accent uses readable fallback ink');
        }
      }
      if (label.startsWith('long-')) {
        for (const marker of markersForSections(plan.sections)) assert.ok(inspected.text.replace(/\s+/g, '').includes(marker), `${filename} includes long-form ${marker}`);
      }
      metrics.pdfs.push({ filename, bytes: bytes.length, pages: inspected.pageCount, pageSize, mode });
      metrics.totalPages += inspected.pageCount;
    }

    const wordDesign = customDesign(templateId, full, index, 'A4');
    const hiddenDesign = {
      ...wordDesign,
      sections: wordDesign.sections.map(section => ({
        ...section,
        visible: section.id === 'summary' ? false : section.visible,
        breakBefore: section.id === 'experience' ? true : section.breakBefore,
      })),
      breakBeforeEntries: ['experience:role-b'],
    };
    const wordPlan = buildResumeDocumentPlan(full, hiddenDesign);
    visibleContentStrings(full, wordPlan);
    const sourceSnapshot = JSON.stringify(full);
    const docxBytes = await buildResumeDesignDocxBuffer(full, hiddenDesign);
    assert.equal(JSON.stringify(full), sourceSnapshot, `${templateId} export leaves source unchanged`);
    const docxFilename = `${templateId}.docx`;
    await fs.writeFile(path.join(DOCX_DIR, docxFilename), docxBytes);
    const zip = await JSZip.loadAsync(docxBytes);
    const xml = await zip.file('word/document.xml').async('string');
    const docText = extractDocxText(xml);
    assert.match(docText, /CANDIDATEMARKER/);
    assert.doesNotMatch(docText, /SUMMARYMARKER/);
    assert.match(docText, /ROLEALPHAMARKER/);
    assert.match(docText, /ROLEBETAMARKER/);
    assert.match(docText, /BULLETALPHAMARKER/);
    assert.match(docText, /SKILLMARKER/);
    assert.match(docText, /TSMARKER/);
    assert.match(docText, /PROJECTITEMMARKER/);
    assert.doesNotMatch(docText, /LONGBULLETMARKER/);
    const expectedWord = markersForSections(wordPlan.sections);
    const foundWord = [...docText.matchAll(MARKER_RE)].map(match => match[0]).filter(marker => expectedWord.includes(marker));
    assert.deepEqual(foundWord, expectedWord, `${templateId} Word preserves visible source order`);
    assert.match(xml, /<w:pgSz[^>]*w:w="11906"/);
    assert.match(xml, /<w:pgMar[^>]*w:left="[0-9]+"/);
    assert.match(xml, /<w:spacing[^>]*w:before="[0-9]+"/);
    assert.match(xml, /<w:sz w:val="26"\/>/, `${templateId} Word honors the experience role size`);
    assert.match(xml, /<w:b\/>/, `${templateId} Word retains bold headings and role titles`);
    assert.ok((xml.match(/<w:pageBreakBefore\b/g) || []).length >= 2, `${templateId} Word carries section and entry breaks`);
    metrics.docx.push({ filename: docxFilename, bytes: docxBytes.length, textChars: docText.length });
  }

  const sourceLong = RESUME_TEMPLATE_FIXTURES.long;
  for (const templateId of ['editorial-authority', 'engineering-core', 'data-evidence', 'healthcare-precision', 'architectural-grid']) {
    const design = customDesign(templateId, sourceLong, TEMPLATE_IDS.indexOf(templateId), 'A4');
    const plan = buildResumeDocumentPlan(sourceLong, design);
    const bytes = await toBuffer(await pdf(React.createElement(ResumeDesignPDFPage, { resume: sourceLong, design })).toBuffer());
    const inspected = await inspectPdf(bytes);
    const filename = `${templateId}__original-long-source.pdf`;
    await fs.writeFile(path.join(PDF_DIR, filename), bytes);
    const normalizedPdf = normalizedSource(inspected.text);
    assert.ok(normalizedPdf.includes(normalizedSource(sourceLong.email)), `${templateId} preserves the complete long contact email`);
    for (const school of sourceLong.education) {
      for (const field of [school.degree, school.institution, school.year, school.details].filter(Boolean)) {
        assert.ok(normalizedPdf.includes(normalizedSource(field)), `${templateId} preserves complete education entry: ${field}`);
      }
    }
    assert.ok(shouldUseStackedResumeHeader(design, plan.name, plan.contact), `${templateId} uses a full-width header when split columns cannot fit long tokens`);
    assertHeaderGeometry(inspected, false, `${templateId} original long-source PDF`, 'Alexandrina', 'alexandrina.okafor');
    metrics.pdfs.push({ filename, bytes: bytes.length, pages: inspected.pageCount, pageSize: 'A4', mode: 'designed', source: 'long' });
    metrics.totalPages += inspected.pageCount;
  }

  const darkDesign = customDesign(TEMPLATE_IDS[0], full, 0, 'A4');
  const darkWord = { ...darkDesign, colors: { ...darkDesign.colors, paper: '#101010', ink: '#ffffff', heading: '#ffffff', accent: '#ffffff' } };
  const darkSource = JSON.stringify(full);
  const darkZip = await JSZip.loadAsync(await buildResumeDesignDocxBuffer(full, darkWord));
  const darkXml = await darkZip.file('word/document.xml').async('string');
  assert.equal(JSON.stringify(full), darkSource);
  assert.match(darkXml, /w:val="202124"/);
  assert.match(darkXml, /w:val="1F2937"/);
  assert.match(darkXml, /w:val="315C78"/);

  assert.equal(metrics.pdfs.length, 105);
  assert.equal(metrics.docx.length, 20);
  await fs.writeFile(path.join(OUT, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
  await fs.writeFile(path.join(OUT, 'metrics.txt'), `PDFs: ${metrics.pdfs.length}\nDOCX: ${metrics.docx.length}\nPDF pages: ${metrics.totalPages}\nLong-form PDFs: ${metrics.pdfs.filter(item => item.filename.includes('long-a4')).length}\n`);
  assert.equal(metrics.pdfs.reduce((total, item) => total + item.pages, 0), metrics.totalPages);
}, { timeout: 120000 });
