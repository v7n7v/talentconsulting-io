const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { build } = require('esbuild');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { pdf } = require('@react-pdf/renderer');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');

const EVIDENCE_DIR = path.join(process.cwd(), 'docs/reviews/resume-flagship-2026-10-08/evidence/composition');
const TEMP_DIR = path.join(process.cwd(), 'tmp/resume-flagship-export');
let ResumeFlagshipPDFDocument;
let ResumeFlagshipHTML;
let ResumeDesignPDFPage;
let createResumeDesign;
let createResumeFlagshipPrototypeDesign;
let buildResumeDocumentPlan;
let FLAGSHIP_FIXTURES;

async function loadModules() {
  fsSync.mkdirSync(TEMP_DIR, { recursive: true });
  const outputDir = fsSync.mkdtempSync(path.join(TEMP_DIR, '.bundle-'));
  await build({
    entryPoints: {
      flagshipPdf: path.join(process.cwd(), 'lib/resume-design/flagship-pdf.tsx'),
      flagshipHtml: path.join(process.cwd(), 'components/resume-templates/flagship/index.tsx'),
      standardPdf: path.join(process.cwd(), 'lib/resume-design/pdf.tsx'),
      design: path.join(process.cwd(), 'lib/resume-design/index.ts'),
      flagshipDesign: path.join(process.cwd(), 'lib/resume-design/flagship.ts'),
      fixtures: path.join(process.cwd(), 'lib/resume-design/flagship-fixtures.ts'),
    },
    outdir: outputDir,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    external: ['@react-pdf/renderer', 'react', 'react/jsx-runtime'],
    loader: { '.css': 'empty' },
    alias: { '@': process.cwd() },
    logLevel: 'silent',
  });
  const requireBuilt = name => require(path.join(outputDir, `${name}.js`));
  return {
    ...requireBuilt('flagshipPdf'), ...requireBuilt('flagshipHtml'),
    ...requireBuilt('standardPdf'), ...requireBuilt('design'),
    ...requireBuilt('flagshipDesign'), ...requireBuilt('fixtures'),
  };
}

async function toBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function compact(value) { return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ''); }
function allPlanStrings(plan) {
  return [plan.name, plan.title, ...plan.contact, ...plan.sections.flatMap(section => [section.title, ...section.entries.flatMap(entry => [entry.title, entry.subtitle, entry.date, entry.text, ...entry.bullets])])]
    .filter(value => typeof value === 'string' && value.trim());
}

async function inspectPdf(buffer) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, standardFontDataUrl: path.join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/') }).promise;
  const pages = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push({
      width: viewport.width,
      height: viewport.height,
      styles: content.styles,
      items: content.items.filter(item => typeof item.str === 'string').map(item => ({ text: item.str, x: item.transform?.[4] || 0, y: item.transform?.[5] || 0, width: item.width || 0, height: item.height || 0, fontName: item.fontName })),
    });
    page.cleanup();
  }
  await doc.destroy();
  return pages;
}

function planOrderAssertions(plan, pages) {
  const pageText = pages.map(page => page.items.map(item => item.text).join(' ')).join(' ');
  const normalized = compact(pageText);
  for (const expected of allPlanStrings(plan)) {
    assert.ok(normalized.includes(compact(expected)), `PDF retains source string: ${expected.slice(0, 100)}`);
  }
  let cursor = 0;
  for (const section of plan.sections) {
    const at = normalized.indexOf(compact(section.title), cursor);
    assert.ok(at >= cursor, `section order retains ${section.title}`);
    cursor = at + compact(section.title).length;
    if (section.kind === 'experience') for (const entry of section.entries) {
      const role = compact(entry.title || entry.subtitle);
      const roleAt = normalized.indexOf(role, cursor);
      assert.ok(roleAt >= cursor, `role metadata remains ordered for ${entry.id}`);
      const bullet = entry.bullets[0] && compact(entry.bullets[0]);
      if (bullet) {
        const bulletAt = normalized.indexOf(bullet, roleAt + role.length);
        assert.ok(bulletAt > roleAt, `role metadata precedes its achievement for ${entry.id}`);
        cursor = bulletAt + bullet.length;
      } else cursor = roleAt + role.length;
    }
  }
}

function boundsAssertions(pages, design, label, continuationName) {
  const left = design.layout.margins.left * 72 / 25.4;
  const right = design.layout.margins.right * 72 / 25.4;
  const top = design.layout.margins.top * 72 / 25.4;
  const bottom = design.layout.margins.bottom * 72 / 25.4;
  for (const [index, page] of pages.entries()) {
    const expectedWidth = design.pageSize === 'LETTER' ? 612 : 595.276;
    const expectedHeight = design.pageSize === 'LETTER' ? 792 : 841.89;
    assert.ok(Math.abs(page.width - expectedWidth) < 0.5, `${label} page ${index + 1} size width`);
    assert.ok(Math.abs(page.height - expectedHeight) < 0.5, `${label} page ${index + 1} size height`);
    assert.ok(page.items.length > 0, `${label} page ${index + 1} has text`);
    for (const item of page.items) {
      if (!item.text.trim()) continue;
      assert.ok(item.x >= left - 1, `${label} page ${index + 1} left margin: ${JSON.stringify(item)}`);
      assert.ok(item.x + item.width <= page.width - right + 1, `${label} page ${index + 1} right margin: ${JSON.stringify(item)}`);
      const fontMetrics = page.styles[item.fontName] || {};
      const physicalBottom = item.y + (fontMetrics.descent || -0.25) * item.height;
      const physicalTop = item.y + (fontMetrics.ascent || 0.8) * item.height;
      assert.ok(physicalBottom >= bottom - 1, `${label} page ${index + 1} bottom margin: ${JSON.stringify({ ...item, physicalBottom })}`);
      const continuationNameWords = (continuationName || '').toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const identityBaseline = index > 0 ? page.items.find(candidate => continuationNameWords.includes(candidate.text.trim().toLocaleLowerCase()) && candidate.y > page.height - top + 1)?.y : undefined;
      const isContinuationIdentity = identityBaseline !== undefined && Math.abs(item.y - identityBaseline) < 1.5;
      assert.ok(physicalTop <= page.height - top + 1 || isContinuationIdentity, `${label} page ${index + 1} top margin: ${JSON.stringify({ ...item, physicalTop })}`);
    }
  }
}

function sourceFieldsPreserved(resume, before) {
  assert.equal(JSON.stringify(resume), before, 'PDF generation does not mutate the canonical source');
}

function gray(value) {
  const r = parseInt(value.slice(1, 3), 16); const g = parseInt(value.slice(3, 5), 16); const b = parseInt(value.slice(5, 7), 16);
  const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b).toString(16).padStart(2, '0');
  return `#${y}${y}${y}`;
}

async function renderEvidence(label, resume, design, mode, composition, outputFile) {
  const before = JSON.stringify(resume);
  const plan = buildResumeDocumentPlan(resume, design);
  const pdfBuffer = await toBuffer(await pdf(React.createElement(composition, { resume, design, mode })).toBuffer());
  sourceFieldsPreserved(resume, before);
  const pages = await inspectPdf(pdfBuffer);
  planOrderAssertions(plan, pages);
  boundsAssertions(pages, design, label, plan.name);
  if (pages.length > 1) for (const [index, page] of pages.entries()) if (index > 0) {
    const topMargin = design.layout.margins.top * 72 / 25.4;
    const bodyItems = page.items.filter(item => item.text.trim() && item.y < page.height - topMargin - 18);
    assert.ok(bodyItems.length > 0, `${label} continuation page ${index + 1} contains body content below its folio`);
    if (composition === ResumeFlagshipPDFDocument && design.continuationHeader) {
      const pageText = compact(page.items.map(item => item.text).join(' '));
      assert.ok(pageText.includes(compact(plan.name)), `${label} continuation page ${index + 1} retains candidate identity`);
      assert.ok(pageText.includes(`${index + 1}/${pages.length}`), `${label} continuation page ${index + 1} retains its folio`);
    }
  }
  await fs.writeFile(path.join(EVIDENCE_DIR, outputFile), pdfBuffer);
  return { label, mode, pageCount: pages.length, pages: pages.map((page, index) => ({ number: index + 1, width: page.width, height: page.height, text: page.items.map(item => item.text).join(' '), textItems: page.items.length, continuationMetadata: index > 0 ? page.items.filter(item => item.y > page.height - design.layout.margins.top * 72 / 25.4 + 1).map(item => ({ text: item.text, x: item.x, y: item.y, width: item.width, height: item.height })) : [] })), plan: { sections: plan.sections.map(section => ({ id: section.id, title: section.title, kind: section.kind, entryIds: section.entries.map(entry => entry.id) })), excluded: plan.excluded }, sourceSha256: require('node:crypto').createHash('sha256').update(pdfBuffer).digest('hex') };
}

test('Taco Signature original composition preserves source and paginates compared fixtures', { timeout: 300000 }, async () => {
  ({ ResumeFlagshipPDFDocument, ResumeFlagshipHTML, ResumeDesignPDFPage, createResumeDesign, createResumeFlagshipPrototypeDesign, buildResumeDocumentPlan, FLAGSHIP_FIXTURES } = await loadModules());
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  const results = [];
  const fixtures = ['full', 'sparse', 'long', 'graduate', 'academic', 'stress'];
  for (const fixtureName of fixtures) for (const pageSize of ['A4', 'LETTER']) {
    const resume = FLAGSHIP_FIXTURES[fixtureName];
    const flagship = createResumeFlagshipPrototypeDesign(resume, pageSize);
    const baseline = createResumeDesign('technical-signal', resume, undefined, pageSize);
    const suffix = `${fixtureName}-${pageSize.toLowerCase()}`;
    results.push(await renderEvidence(`flagship-${suffix}`, resume, flagship, 'designed', ResumeFlagshipPDFDocument, `flagship-${suffix}.pdf`));
    if (fixtureName === 'full') assert.equal(results.at(-1).pageCount, 1, `Default ${pageSize} must avoid an orphan supporting line on a second page`);
    results.push(await renderEvidence(`baseline-${suffix}`, resume, baseline, 'designed', ResumeDesignPDFPage, `baseline-${suffix}.pdf`));
    if (fixtureName === 'academic') for (const page of results.at(-2).pages) {
      if (compact(page.text).includes(compact('PUBLICATION'))) assert.ok(compact(page.text).includes(compact('Selected publications')), `${suffix} publication continuation retains section context: ${page.text.slice(0, 240)}`);
    }
  }
  for (const pageSize of ['A4', 'LETTER']) {
    const resume = FLAGSHIP_FIXTURES.full;
    const design = createResumeFlagshipPrototypeDesign(resume, pageSize);
    const result = await renderEvidence(`flagship-application-full-${pageSize.toLowerCase()}`, resume, design, 'application', ResumeFlagshipPDFDocument, `flagship-application-full-${pageSize.toLowerCase()}.pdf`);
    results.push(result);
    const pageContaining = value => result.pages.find(page => compact(page.text).includes(compact(value)));
    for (const education of resume.education) {
      const page = pageContaining(education.degree || education.institution || education.year);
      assert.ok(page, 'education record exists');
      for (const field of [education.degree, education.institution, education.year].filter(Boolean)) assert.ok(compact(page.text).includes(compact(field)), `${pageSize} keeps short education metadata together: ${field}`);
    }
    const credentialPage = pageContaining('Certifications');
    for (const credential of resume.certifications) assert.ok(compact(credentialPage?.text).includes(compact(credential)), `${pageSize} keeps a short credential list with its heading: ${credential}`);
    const plan = buildResumeDocumentPlan(resume, design);
    for (const section of plan.sections) {
      const page = pageContaining(section.title);
      const entry = section.entries[0];
      const opening = entry && (entry.title || entry.subtitle || entry.text || entry.bullets[0]);
      if (opening) assert.ok(compact(page?.text).includes(compact(opening)), `${pageSize} heading ${section.title} accompanies its opening record`);
    }
  }
  {
    const resume = FLAGSHIP_FIXTURES.full;
    const design = createResumeFlagshipPrototypeDesign(resume, 'A4');
    design.colors = Object.fromEntries(Object.entries(design.colors).map(([key, value]) => [key, gray(value)]));
    results.push(await renderEvidence('flagship-full-a4-grayscale', resume, design, 'designed', ResumeFlagshipPDFDocument, 'flagship-full-a4-grayscale.pdf'));
  }
  {
    const resume = FLAGSHIP_FIXTURES.graduate;
    const design = createResumeFlagshipPrototypeDesign(resume, 'A4');
    const project = design.sections.find(section => section.id.includes('projects'));
    assert.ok(project, 'graduate fixture has a project section');
    project.visible = false;
    const before = JSON.stringify(resume);
    const bytes = await toBuffer(await pdf(React.createElement(ResumeFlagshipPDFDocument, { resume, design, mode: 'designed' })).toBuffer());
    const pages = await inspectPdf(bytes);
    const pdfText = compact(pages.flatMap(page => page.items.map(item => item.text)).join(' '));
    assert.ok(pdfText.includes(compact('BSc Computer Science')));
    assert.ok(!pdfText.includes(compact('Transit Atlas')), 'hidden section is omitted from candidate pages');
    assert.ok(JSON.stringify(resume) === before, 'hiding a section leaves source content intact');
    assert.ok(resume.additionalSections.find(section => section.id === 'projects').items[0].includes('Transit Atlas'), 'hidden source item remains in canonical data');
    planOrderAssertions(buildResumeDocumentPlan(resume, design), pages);
    boundsAssertions(pages, design, 'flagship-hidden-project');
    await fs.writeFile(path.join(EVIDENCE_DIR, 'flagship-hidden-project.pdf'), bytes);
    results.push({ label: 'flagship-hidden-project', mode: 'designed', pageCount: pages.length, hiddenSectionRetainedInSource: true, sourceSha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex') });
  }
  {
    const resume = FLAGSHIP_FIXTURES.full;
    const design = createResumeFlagshipPrototypeDesign(resume, 'A4');
    design.sections.find(section => section.id === 'education').breakBefore = true;
    const bytes = await toBuffer(await pdf(React.createElement(ResumeFlagshipPDFDocument, { resume, design })).toBuffer());
    const pages = await inspectPdf(bytes);
    assert.ok(pages.length >= 2, 'manual section break creates a continuation page');
    assert.ok(!compact(pages[0].items.map(item => item.text).join(' ')).includes(compact('Master of Business Administration')));
    assert.ok(compact(pages.slice(1).flatMap(page => page.items.map(item => item.text)).join(' ')).includes(compact('Master of Business Administration')));
    boundsAssertions(pages, design, 'flagship-manual-section-break');
    await fs.writeFile(path.join(EVIDENCE_DIR, 'flagship-manual-section-break.pdf'), bytes);
    results.push({ label: 'flagship-manual-section-break', mode: 'designed', pageCount: pages.length, section: 'education', sourceSha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex') });
  }
  {
    const resume = FLAGSHIP_FIXTURES.full;
    const design = createResumeFlagshipPrototypeDesign(resume, 'A4');
    design.breakBeforeEntries = ['experience:0'];
    assert.ok(buildResumeDocumentPlan(resume, design).sections.find(section => section.kind === 'experience')?.entries.some(entry => design.breakBeforeEntries.includes(entry.id)), 'manual entry break targets an existing planned entry');
    const bytes = await toBuffer(await pdf(React.createElement(ResumeFlagshipPDFDocument, { resume, design })).toBuffer());
    const pages = await inspectPdf(bytes);
    assert.ok(pages.length >= 2, 'manual entry break creates a continuation page');
    assert.ok(!compact(pages[0].items.map(item => item.text).join(' ')).includes(compact('Northstar Systems')));
    assert.ok(compact(pages.slice(1).flatMap(page => page.items.map(item => item.text)).join(' ')).includes(compact('Northstar Systems')));
    boundsAssertions(pages, design, 'flagship-manual-entry-break');
    await fs.writeFile(path.join(EVIDENCE_DIR, 'flagship-manual-entry-break.pdf'), bytes);
    results.push({ label: 'flagship-manual-entry-break', mode: 'designed', pageCount: pages.length, entry: 'experience:0', sourceSha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex') });
  }
  {
    const resume = FLAGSHIP_FIXTURES.full;
    const design = createResumeFlagshipPrototypeDesign(resume, 'A4');
    const markup = renderToStaticMarkup(React.createElement(ResumeFlagshipHTML, { resume, design, selectedSectionId: 'experience', onSelectSection: id => { if (id !== 'experience') throw new Error('unexpected section ID'); } }));
    assert.match(markup, /aria-pressed="true"[^>]*aria-controls="flagship-section-experience-content"/);
    assert.match(markup, /Select Experience section for design controls/);
    assert.match(markup, /data-resume-section-id="experience"/);
    assert.match(markup, /<article class="resume-flagship-page[^>]*aria-label="Jordan Avery Morgan résumé document"/);
    assert.doesNotMatch(markup, /<main\b/, 'candidate page does not introduce a nested main landmark');
    assert.doesNotMatch(markup, /data-resume-section-id="experience"[^>]*aria-pressed/);
    assert.doesNotMatch(markup, /Taco|watermark/i, 'candidate output has no Taco mark or watermark');
    const applicationMarkup = renderToStaticMarkup(React.createElement(ResumeFlagshipHTML, { resume, design, mode: 'application' }));
    assert.match(applicationMarkup, /flagship-section-long-label/);
    results.push({ label: 'flagship-html-selection-contract', mode: 'interactive', buttonHasAriaPressed: true, documentHasNoBrandMark: true });
  }
  assert.ok(results.filter(result => result.label.startsWith('flagship-') && /-(a4|letter)$/.test(result.label)).length >= 12);
  assert.ok(results.filter(result => result.label.startsWith('baseline-')).length === 12);
  const evidence = {
    capturedAt: new Date().toISOString(),
    versions: { node: process.version, reactPdf: require('@react-pdf/renderer/package.json').version, pdfjs: require('pdfjs-dist/package.json').version },
    fixtureSources: Object.fromEntries(fixtures.map(key => [key, require('node:crypto').createHash('sha256').update(JSON.stringify(FLAGSHIP_FIXTURES[key])).digest('hex')])),
    sourceSha256: Object.fromEntries(['components/resume-templates/flagship/index.tsx', 'components/resume-templates/flagship/index.css', 'lib/resume-design/flagship-pdf.tsx', 'lib/resume-design/flagship.ts', 'lib/resume-design/text-layout.ts'].map(file => [file, require('node:crypto').createHash('sha256').update(fsSync.readFileSync(file)).digest('hex')])),
    renderCount: results.filter(result => result.sourceSha256).length,
    results,
  };
  await fs.writeFile(path.join(EVIDENCE_DIR, 'composition-manifest.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  assert.ok(results.filter(result => result.sourceSha256).length >= 28, 'retains a comparative 20–30 PDF evidence matrix');
});
