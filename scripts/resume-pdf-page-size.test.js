const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
let modules;

async function loadModules() {
  const parent = path.join(root, 'tmp', 'pdfs');
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, 'page-size-'));
  const outfile = path.join(directory, 'fixture.cjs');
  try {
    await esbuild.build({
      stdin: {
        contents: [
          "export { ResumePDFDocument, buildResumePDFArtifact } from './lib/pdf-templates';",
          "export { CuratedSignaturePDF } from './lib/resume-signature-pdf';",
          "export { REGISTERED_TEMPLATE_IDS } from './lib/resume-templates/catalog';",
          "export { RESUME_TEMPLATE_FIXTURES } from './lib/resume-templates/fixtures';",
        ].join('\n'),
        resolveDir: root,
        loader: 'tsx',
      },
      outfile,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      jsx: 'automatic',
      external: ['@react-pdf/renderer', 'react', 'react/jsx-runtime', 'pdfjs-dist/*'],
      logLevel: 'silent',
      plugins: [{
        name: 'local-browser-fonts',
        setup(build) {
          build.onLoad({ filter: /[/\\]pdf-templates\.tsx$/ }, args => {
            let contents = fs.readFileSync(args.path, 'utf8');
            for (const name of ['Inter-Regular.ttf', 'Inter-Bold.ttf', 'Inter-Italic.ttf']) {
              contents = contents.replace(
                "'/fonts/" + name + "'",
                JSON.stringify(path.join(root, 'public', 'fonts', name)),
              );
            }
            return { contents, loader: 'tsx', resolveDir: path.dirname(args.path) };
          });
        },
      }],
    });
    return require(outfile);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function assertPageSizes(bytes, size, label) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true });
  const document = await loading.promise;
  const expected = size === 'LETTER' ? [612, 792] : [595.28, 841.89];
  try {
    assert.ok(document.numPages > 0, label + ' has pages');
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const [left, bottom, right, top] = page.view;
      assert.ok(Math.abs(right - left - expected[0]) < 0.1, label + ' page width');
      assert.ok(Math.abs(top - bottom - expected[1]) < 0.1, label + ' page height');
    }
    return document.numPages;
  } finally {
    await document.destroy();
  }
}

test('every registered resume template renders real A4 and Letter page dimensions', async () => {
  modules = await loadModules();
  const { renderToBuffer } = require('@react-pdf/renderer');
  for (const templateId of modules.REGISTERED_TEMPLATE_IDS) {
    for (const pageSize of ['A4', 'LETTER']) {
      const bytes = await renderToBuffer(modules.ResumePDFDocument({
        resume: modules.RESUME_TEMPLATE_FIXTURES.sparse, templateId, pageSize,
      }));
      await assertPageSizes(bytes, pageSize, templateId + '/' + pageSize);
    }
  }
});

test('artifact exports retain Letter dimensions on every wrapped page and report their page count', async () => {
  modules ||= await loadModules();
  for (const templateId of ['executive', 'executive-ledger']) {
    const artifact = await modules.buildResumePDFArtifact(
      modules.RESUME_TEMPLATE_FIXTURES.long, undefined, templateId, 'LETTER',
    );
    const count = await assertPageSizes(
      await artifact.blob.arrayBuffer(), 'LETTER', templateId + '/long',
    );
    assert.ok(count > 1, 'long fixture wraps');
    assert.equal(artifact.pageCount, count);
  }
});

test('omitted page size remains A4 for public resume and curated document entry points', async () => {
  modules ||= await loadModules();
  const { renderToBuffer } = require('@react-pdf/renderer');
  for (const [renderer, templateId] of [
    [modules.ResumePDFDocument, 'executive'],
    [modules.CuratedSignaturePDF, 'executive-ledger'],
  ]) {
    const bytes = await renderToBuffer(renderer({
      resume: modules.RESUME_TEMPLATE_FIXTURES.sparse, templateId,
    }));
    await assertPageSizes(bytes, 'A4', templateId + '/default');
  }
  const letter = await renderToBuffer(modules.CuratedSignaturePDF({
    resume: modules.RESUME_TEMPLATE_FIXTURES.sparse,
    templateId: 'executive-ledger',
    pageSize: 'LETTER',
  }));
  await assertPageSizes(letter, 'LETTER', 'curated/explicit-letter');
});
