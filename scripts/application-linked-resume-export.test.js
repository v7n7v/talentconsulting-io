const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { buildSync, transformSync } = require('esbuild');
const JSZip = require('jszip');
const actualDocx = require('docx');

// The override lets the proposed test run against a reviewed checkout before
// copying it. After copying into scripts/, its default is that checkout.
const root = process.env.TACO_LINKED_EXPORT_TEST_ROOT
  ? path.resolve(process.env.TACO_LINKED_EXPORT_TEST_ROOT)
  : path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/suite/applications/page.tsx'), 'utf8');
const importBoundaries = new Set(['@/lib/resume-design/docx', '@/lib/resume-signature-docx']);

function loadRealHelpers() {
  const imports = [
    ['resume-templates/persistence.ts', 'getPersistedResumeTemplateId, getPersistedResumePaletteColors, getPersistedResumeDesign'],
    ['resume-templates/catalog.ts', 'isResumeTemplateSelectionEntitled, NEW_SIGNATURE_TEMPLATE_IDS'],
    ['resume-normalizer.ts', 'normalizeResume'],
    ['resume-design/index.ts', 'createResumeDesign'],
  ].map(([file, names]) => 'export { ' + names + ' } from ' + JSON.stringify(path.join(root, 'lib', file)) + ';').join('\n');
  const output = buildSync({
    stdin: { contents: imports, loader: 'ts', resolveDir: root },
    bundle: true, write: false, platform: 'node', format: 'cjs',
    alias: { '@': root }, target: 'es2022', logLevel: 'silent',
  });
  const compiled = { exports: {} };
  new Function('module', 'exports', 'require', output.outputFiles[0].text)(compiled, compiled.exports, require);
  return compiled.exports;
}

const helpers = loadRealHelpers();
const sourceFile = ts.createSourceFile('applications.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const workspace = sourceFile.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ApplicationsWorkspace');
assert.ok(workspace?.body, 'ApplicationsWorkspace must exist in the real source');
const names = ['handleDownloadPDF', 'handleDownloadWord'];
const declarations = names.map(name => {
  const node = workspace.body.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(node?.body, name + ' must be a real ApplicationsWorkspace handler');
  return node;
});
const extracted = ts.factory.updateSourceFile(sourceFile, declarations);
const transformed = ts.transform(extracted, [context => {
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      assert.equal(node.arguments.length, 1);
      assert.ok(ts.isStringLiteral(node.arguments[0]));
      assert.ok(importBoundaries.has(node.arguments[0].text), 'Unreviewed dynamic import boundary');
      // Only imported adapters change. The guards, arguments, branches, error
      // handling and downloading transitions are the actual source body.
      return ts.factory.createCallExpression(ts.factory.createIdentifier('loadExportAdapter'), undefined, node.arguments);
    }
    return ts.visitEachChild(node, visit, context);
  };
  return node => ts.visitNode(node, visit);
}]);
const handlerCode = transformSync(ts.createPrinter().printFile(transformed.transformed[0]), { loader: 'ts', target: 'es2022' }).code;
transformed.dispose();

const resume = {
  name: 'Ada Lovelace', title: 'Research Engineer', email: 'ada@example.test', phone: '', location: 'London',
  summary: 'Builds reliable analytical systems.',
  experience: [{ id: 'job-a', company: 'Northstar', role: 'Engineer', duration: '2022–Present', achievements: ['Reduced failures by 20%.'] }],
  education: [{ id: 'education-a', institution: 'Example University', degree: 'BSc Computer Science', year: '2020' }],
  skills: [{ category: 'Systems', items: ['TypeScript'] }], certifications: [],
};
const palette = { primary: '#18354d', accent: '#c55136', text: '#151515', background: '#ffffff' };

function carrier({ templateId = 'executive-ledger', designed = true } = {}) {
  const content = structuredClone(resume);
  const metadata = { template: templateId, paletteColors: structuredClone(palette) };
  if (designed) {
    const design = helpers.createResumeDesign(templateId, helpers.normalizeResume(content));
    design.pageSize = 'LETTER';
    design.typography.bodyFont = 'dejavu-serif';
    design.typography.bodySize = 11.5;
    design.typography.bodyWeight = 700;
    design.colors.heading = '#123456';
    design.layout.margins.left = 23;
    design.sections.find(section => section.id === 'skills').visible = false;
    metadata.workspace = { presentation: { design } };
  }
  return { id: 'resume-a', content, template: templateId, metadata };
}

function harness({ linkedResume = carrier(), selectedApp = { id: 'application-a', resume_version_id: 'resume-a' }, tierLoading = false, isPro = true, failure, exportFailure, actualDocument = false } = {}) {
  const calls = { verify: [], pdf: [], designWord: [], curatedWord: [], pack: [], saves: [], imports: [], downloading: [], toasts: [], documents: [] };
  const blobs = { design: { kind: 'design-word-blob' }, curated: { kind: 'curated-word-blob' }, legacy: { kind: 'legacy-word-blob' } };
  function failAt(boundary) {
    if (failure?.boundary === boundary) throw failure.reason;
  }
  class TestDocument {
    constructor(options) { this.options = options; calls.documents.push(this); }
  }
  class TestParagraph { constructor(options) { this.options = options; } }
  class TestTextRun { constructor(options) { this.options = options; } }
  const Document = actualDocument ? actualDocx.Document : TestDocument;
  const Paragraph = actualDocument ? actualDocx.Paragraph : TestParagraph;
  const TextRun = actualDocument ? actualDocx.TextRun : TestTextRun;
  const state = {
    linkedResume, selectedApp, user: { uid: 'owner-a' }, tierLoading, isPro,
    mountedRef: { current: true }, selectedActionRef: { current: selectedApp?.id },
    selectedResumeLinkRef: { current: selectedApp?.resume_version_id }, linkedResumeIdRef: { current: linkedResume?.id },
    useStore: { getState: () => ({ user: { uid: 'owner-a' } }) },
    getPersistedResumeTemplateId: helpers.getPersistedResumeTemplateId,
    getPersistedResumePaletteColors: helpers.getPersistedResumePaletteColors,
    getPersistedResumeDesign: helpers.getPersistedResumeDesign,
    isResumeTemplateSelectionEntitled: helpers.isResumeTemplateSelectionEntitled,
    normalizeResume: helpers.normalizeResume,
    getResumeForExport: async () => {
      calls.verify.push({ applicationId: selectedApp?.id, source: selectedApp?.source });
      if (exportFailure) throw exportFailure;
      return { resume: linkedResume.content, isCurrent: () => true };
    },
    NEW_SIGNATURE_TEMPLATE_IDS: helpers.NEW_SIGNATURE_TEMPLATE_IDS,
    setDownloading: value => calls.downloading.push(value),
    showToast: (...args) => calls.toasts.push(args),
    downloadResumePDF: async (...args) => { calls.pdf.push(args); failAt('pdf'); },
    saveAs: (...args) => { failAt('save'); calls.saves.push(args); },
    Document, Paragraph, TextRun, HeadingLevel: actualDocument ? actualDocx.HeadingLevel : { HEADING_2: 'heading-2' },
    Packer: actualDocument ? actualDocx.Packer : { toBlob: async document => { calls.pack.push(document); failAt('pack'); return blobs.legacy; } },
  };
  const loadExportAdapter = async name => {
    calls.imports.push(name);
    failAt('import');
    if (name === '@/lib/resume-design/docx') return {
      buildResumeDesignDocxBlob: async (...args) => { calls.designWord.push(args); failAt('design'); return blobs.design; },
    };
    if (name === '@/lib/resume-signature-docx') return {
      buildCuratedSignatureDocxBlob: async (...args) => { calls.curatedWord.push(args); failAt('curated'); return blobs.curated; },
    };
    throw new Error('Unexpected export adapter ' + name);
  };
  const factory = new Function('state', 'loadExportAdapter',
    'const {' + Object.keys(state).join(',') + '} = state;\n' + handlerCode + '\nreturn { handleDownloadPDF, handleDownloadWord };');
  return { ...factory(state, loadExportAdapter), calls, blobs, linkedResume };
}

function assertNoExport(run) {
  for (const key of ['pdf', 'designWord', 'curatedWord', 'pack', 'saves', 'imports', 'downloading', 'documents']) {
    assert.deepEqual(run.calls[key], [], key + ' must remain untouched when export is refused');
  }
}

test('linked PDF passes saved custom LETTER design and sanitized palette without changing resume facts', async () => {
  const run = harness();
  const before = structuredClone(run.linkedResume);
  await run.handleDownloadPDF();
  assert.equal(run.calls.pdf.length, 1);
  assert.deepEqual(run.calls.pdf[0], [
    run.linkedResume.content, helpers.getPersistedResumePaletteColors(run.linkedResume), undefined,
    'executive-ledger', run.calls.pdf[0][4], 'LETTER', helpers.getPersistedResumeDesign(run.linkedResume, helpers.normalizeResume(run.linkedResume.content)),
  ]);
  assert.equal(run.calls.pdf[0][4](), true, 'the export boundary retains the captured selection guard');
  assert.strictEqual(run.calls.pdf[0][0], run.linkedResume.content, 'PDF receives the saved raw content');
  assert.deepEqual(run.calls.downloading, [true, false]);
  assert.deepEqual(run.calls.toasts, [['PDF downloaded', 'check_circle']]);
  assert.deepEqual(run.linkedResume, before);
});

test('linked Word custom design takes precedence over curated v1 and receives normalized saved design', async () => {
  const run = harness();
  const before = structuredClone(run.linkedResume);
  assert.ok(helpers.NEW_SIGNATURE_TEMPLATE_IDS.includes('executive-ledger'));
  await run.handleDownloadWord();
  assert.deepEqual(run.calls.imports, ['@/lib/resume-design/docx']);
  assert.deepEqual(run.calls.designWord, [[helpers.normalizeResume(run.linkedResume.content), helpers.getPersistedResumeDesign(run.linkedResume, helpers.normalizeResume(run.linkedResume.content))]]);
  assert.equal(run.calls.designWord[0][1].pageSize, 'LETTER');
  assert.deepEqual(run.calls.curatedWord, []);
  assert.deepEqual(run.calls.pack, []);
  assert.deepEqual(run.calls.saves, [[run.blobs.design, 'Ada_Lovelace.docx']]);
  assert.deepEqual(run.calls.downloading, [true, false]);
  assert.deepEqual(run.linkedResume, before);
});

test('legacy PDF keeps A4 and leaves v2 design undefined', async () => {
  const run = harness({ linkedResume: carrier({ designed: false }) });
  await run.handleDownloadPDF();
  assert.equal(run.calls.pdf.length, 1);
  assert.equal(run.calls.pdf[0][3], 'executive-ledger');
  assert.equal(run.calls.pdf[0][5], 'A4');
  assert.equal(run.calls.pdf[0][6], undefined);
  assert.deepEqual(run.calls.downloading, [true, false]);
});

test('legacy curated Word uses its saved template and palette rather than the v2 adapter', async () => {
  const run = harness({ linkedResume: carrier({ designed: false }) });
  await run.handleDownloadWord();
  assert.deepEqual(run.calls.curatedWord, [[helpers.normalizeResume(run.linkedResume.content), 'executive-ledger', helpers.getPersistedResumePaletteColors(run.linkedResume)]]);
  assert.deepEqual(run.calls.designWord, []);
  assert.deepEqual(run.calls.pack, []);
  assert.deepEqual(run.calls.saves, [[run.blobs.curated, 'Ada_Lovelace.docx']]);
  assert.deepEqual(run.calls.downloading, [true, false]);
});

test('legacy free Word constructs and packs the original linear document', async () => {
  const run = harness({ linkedResume: carrier({ templateId: 'technical-signal', designed: false }), isPro: false });
  await run.handleDownloadWord();
  assert.deepEqual(run.calls.imports, []);
  assert.equal(run.calls.documents.length, 1);
  assert.strictEqual(run.calls.pack[0], run.calls.documents[0]);
  const packed = JSON.stringify(run.calls.documents[0].options);
  for (const fact of ['Ada Lovelace', 'Research Engineer', 'Northstar', 'Example University', 'TypeScript']) assert.ok(packed.includes(fact), fact + ' reaches legacy document');
  assert.deepEqual(run.calls.saves, [[run.blobs.legacy, 'Ada_Lovelace.docx']]);
  assert.deepEqual(run.calls.downloading, [true, false]);
});

test('default application Word fallback retains every supported extended canonical field in the generated DOCX XML', async () => {
  const content = {
    ...structuredClone(resume),
    linkedin: 'https://linkedin.example.test/ada',
    website: 'https://ada.example.test',
    links: ['https://portfolio.example.test/work'],
    education: [{ id: 'education-a', institution: 'Example University', degree: 'BSc Computer Science', year: '2020', details: 'Capstone: ethical AI governance.' }],
    certifications: ['Security+ Credential'],
    additionalSections: [{ id: 'volunteer', title: 'Volunteer Leadership', items: ['Organized 12 community events.'] }],
  };
  const run = harness({ linkedResume: { ...carrier({ templateId: 'editorial-authority', designed: false }), content }, actualDocument: true });
  await run.handleDownloadWord();
  assert.equal(run.calls.saves.length, 1);
  const zip = await JSZip.loadAsync(await run.calls.saves[0][0].arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  const text = xml.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&');
  for (const field of [
    content.linkedin, content.website, ...content.links,
    content.certifications[0], content.additionalSections[0].title,
    content.additionalSections[0].items[0], content.education[0].details,
  ]) assert.ok(text.includes(field), `generated DOCX should retain ${field}`);
});

for (const handler of ['handleDownloadPDF', 'handleDownloadWord']) {
  test(handler + ' keeps the actual handler behind packet approval verification', async () => {
    const run = harness({ selectedApp: { id: 'application-a', source: 'apply_pipeline', resume_version_id: 'resume-a' }, exportFailure: new Error('Review the current packet before exporting.') });
    await run[handler]();
    assert.deepEqual(run.calls.verify, [{ applicationId: 'application-a', source: 'apply_pipeline' }]);
    for (const key of ['pdf', 'designWord', 'curatedWord', 'pack', 'saves', 'imports', 'documents']) assert.deepEqual(run.calls[key], [], key + ' must remain untouched when approval verification fails');
    assert.deepEqual(run.calls.downloading, [true, false]);
    assert.match(run.calls.toasts[0][0], /Review the current packet/);
  });
}

for (const handler of ['handleDownloadPDF', 'handleDownloadWord']) {
  test(handler + ' refuses missing content or missing/mismatched application links', async () => {
    for (const options of [
      { linkedResume: null },
      { linkedResume: { ...carrier(), content: null } },
      { selectedApp: null },
      { selectedApp: { id: 'application-a' } },
      { selectedApp: { id: 'application-a', resume_version_id: 'another-resume' } },
    ]) {
      const run = harness(options);
      await run[handler]();
      assertNoExport(run);
      if (options.selectedApp !== undefined) assert.match(run.calls.toasts[0][0], /linked resume changed/i);
    }
  });
  test(handler + ' refuses unresolved plan access before calling export adapters', async () => {
    const run = harness({ tierLoading: true });
    await run[handler]();
    assertNoExport(run);
    assert.deepEqual(run.calls.toasts, [['Your plan access is still loading. Try again in a moment.', 'hourglass_top']]);
  });
  test(handler + ' uses the real entitlement guard to refuse a Standard template', async () => {
    assert.equal(helpers.isResumeTemplateSelectionEntitled('executive-ledger', false), false);
    const run = harness({ isPro: false });
    await run[handler]();
    assertNoExport(run);
    assert.match(run.calls.toasts[0][0], /Standard template/);
    assert.equal(run.calls.toasts[0][1], 'workspace_premium');
  });
}

test('PDF adapter Error is reported and downloading resets', async () => {
  const run = harness({ failure: { boundary: 'pdf', reason: new Error('PDF adapter failed') } });
  await run.handleDownloadPDF();
  assert.deepEqual(run.calls.downloading, [true, false]);
  assert.deepEqual(run.calls.toasts, [['PDF failed: PDF adapter failed', 'cancel']]);
});

test('PDF null rejection also resets downloading and reports a usable failure', async () => {
  const run = harness({ failure: { boundary: 'pdf', reason: null } });
  await assert.doesNotReject(() => run.handleDownloadPDF());
  assert.deepEqual(run.calls.downloading, [true, false]);
  assert.equal(run.calls.toasts.length, 1);
  assert.equal(run.calls.toasts[0][1], 'cancel');
  assert.match(run.calls.toasts[0][0], /PDF failed: .+/);
  assert.doesNotMatch(run.calls.toasts[0][0], /undefined|null/);
});

for (const boundary of ['design', 'curated', 'pack', 'save', 'import']) {
  test('Word ' + boundary + ' failure resets downloading without saving or falling back', async () => {
    const linkedResume = boundary === 'curated' ? carrier({ designed: false })
      : boundary === 'pack' ? carrier({ templateId: 'technical-signal', designed: false }) : carrier();
    const run = harness({ linkedResume, failure: { boundary, reason: new Error(boundary + ' failed') } });
    await run.handleDownloadWord();
    assert.deepEqual(run.calls.downloading, [true, false]);
    assert.deepEqual(run.calls.saves, []);
    assert.deepEqual(run.calls.toasts, [[boundary + ' failed', 'cancel']]);
    if (boundary !== 'pack') assert.deepEqual(run.calls.pack, [], 'a failed adapter must not fall back to the legacy packer');
    if (boundary !== 'curated') assert.deepEqual(run.calls.curatedWord, []);
  });
}
