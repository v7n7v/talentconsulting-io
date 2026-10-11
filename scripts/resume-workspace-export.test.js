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

test('the artifact helper is bundled with its local font and PDF dependencies', () => {
  const outfile = path.join(__dirname, '.resume-workspace-export.tmp.cjs');
  try {
    buildSync({ entryPoints: [path.join(__dirname, '..', 'lib', 'pdf-templates.tsx')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', external: ['next/*'] });
    assert.ok(fs.statSync(outfile).size > 10_000);
  } finally {
    try { fs.unlinkSync(outfile); } catch {}
  }
});
