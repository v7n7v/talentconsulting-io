const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const modulePath = path.join(root, 'lib', 'resume-signature-pdf.tsx');
const catalogPath = path.join(root, 'lib', 'resume-templates', 'catalog.ts');
const fixturePath = path.join(root, 'lib', 'resume-templates', 'fixtures.ts');
const source = fs.readFileSync(modulePath, 'utf8');

function loadTranspiledModule(filePath) {
  const output = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require,
    console,
    Map,
    Set,
    Object,
  });
  return module.exports;
}

async function loadPDFModule() {
  const tempRoot = path.join(root, 'tmp', 'pdfs');
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(tempRoot, 'resume-signature-pdf-'));
  const outfile = path.join(tempDir, 'resume-signature-pdf.cjs');
  try {
    await esbuild.build({
      entryPoints: [modulePath],
      outfile,
      bundle: true,
      format: 'cjs',
      platform: 'node',
      target: 'node20',
      jsx: 'automatic',
      external: ['@react-pdf/renderer', 'react', 'react/jsx-runtime'],
      logLevel: 'silent',
    });
    return require(outfile);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const catalog = loadTranspiledModule(catalogPath);
const fixtures = loadTranspiledModule(fixturePath).RESUME_TEMPLATE_FIXTURES;
const expectedIds = [...catalog.NEW_SIGNATURE_TEMPLATE_IDS];
const fixtureIds = ['full', 'sparse', 'long'];

function normalized(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function parseWithStructuralEvidence(buffer) {
  const pdfParse = require('pdf-parse');
  const pageItems = [];
  const parsed = await pdfParse(Buffer.from(buffer), {
    pagerender: async (pageData) => {
      const content = await pageData.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });
      const items = content.items
        .filter((item) => typeof item.str === 'string')
        .map((item) => ({
          text: item.str,
          x: Number(item.transform?.[4] ?? 0),
          y: Number(item.transform?.[5] ?? 0),
          height: Number(item.height ?? item.transform?.[3] ?? 0),
          font: String(item.fontName ?? ''),
        }));
      pageItems[pageData.pageIndex ?? pageItems.length] = items;
      return items.map((item) => item.text).join(' ');
    },
  });
  return { parsed, pageItems };
}

async function extractWithModernPDFJS(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  const pageTexts = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({
        disableNormalization: false,
        includeMarkedContent: false,
      });
      pageTexts.push(
        content.items
          .filter((item) => typeof item.str === 'string')
          .map((item) => item.str)
          .join(' '),
      );
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
  return pageTexts.join('\n');
}

function identityWithoutWhitespace(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s/gu, '');
}

function assertCandidateIdentityIntegrity(extractedText, sourceName, templateId) {
  const expected = identityWithoutWhitespace(sourceName);
  const actual = identityWithoutWhitespace(extractedText);
  assert.ok(
    actual.includes(expected),
    `${templateId}/long modern pdfjs extraction preserves candidate identity without inserted punctuation`,
  );

  const punctuation = (value) => [...value.matchAll(/[^\p{L}\p{N}\s]/gu)]
    .map((match) => match[0])
    .join('');
  const sourceTokens = String(sourceName).normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? [];
  const firstToken = sourceTokens[0] ?? '';
  const lastToken = sourceTokens.at(-1) ?? '';
  const normalizedExtracted = String(extractedText).normalize('NFKC');
  const start = normalizedExtracted.indexOf(firstToken);
  const end = normalizedExtracted.indexOf(lastToken, Math.max(0, start));
  assert.ok(start >= 0 && end >= start, `${templateId}/long exposes the candidate name span`);
  const candidateSpan = normalizedExtracted.slice(start, end + lastToken.length);
  assert.equal(
    punctuation(candidateSpan),
    punctuation(String(sourceName).normalize('NFKC')),
    `${templateId}/long does not inject hyphens or other punctuation into the candidate name`,
  );
}

function artifactStructureFingerprint(evidence) {
  const geometry = evidence.pageItems.map((items) => items.map((item) => [
    Math.round(item.x * 10) / 10,
    Math.round(item.y * 10) / 10,
    Math.round(item.height * 10) / 10,
    item.font,
  ]));
  return JSON.stringify({
    pageItemCounts: evidence.pageItems.map((items) => items.length),
    geometry,
  });
}

function assertOrderedHeadings(text, metadata, templateId, fixtureId) {
  const labelFor = {
    Summary: 'Professional Summary',
    Experience: 'Experience',
    Skills: 'Skills',
    Education: 'Education',
  };
  const available = new Set([
    ...metadata.structure.sectionOrder
      .map((section) => labelFor[section])
      .filter((label) => label && text.includes(label)),
    ...(text.includes('Certifications') ? ['Certifications'] : []),
  ]);
  const expected = [
    ...metadata.structure.sectionOrder.map((section) => labelFor[section]),
    'Certifications',
  ].filter((label) => available.has(label));
  let previous = -1;
  for (const heading of expected) {
    const index = text.indexOf(heading);
    assert.ok(index > previous, `${templateId}/${fixtureId} preserves ${heading} order`);
    previous = index;
  }
}

function assertFixtureContent(text, resume, templateId, fixtureId) {
  const haystack = normalized(text);
  const values = [
    resume.name,
    resume.title,
    resume.summary,
    resume.experience[0]?.company,
    resume.experience[0]?.role,
    resume.education[0]?.institution,
    resume.education[0]?.degree,
    resume.skills[0]?.category,
    resume.skills[0]?.items[0],
    resume.certifications[0],
  ].map(normalized).filter(Boolean);
  for (const value of values) {
    const tokens = value.split(' ').filter((token) => token.length >= 3);
    const matchedTokens = tokens.filter((token) => haystack.includes(token));
    assert.ok(
      haystack.includes(value) || matchedTokens.length >= Math.max(1, Math.ceil(tokens.length * 0.7)),
      `${templateId}/${fixtureId} extracts "${value}"`,
    );
  }
}

test('registry and consumed structural profiles are explicit, exclusive, and unique for all 17 IDs', async () => {
  const pdfModule = await loadPDFModule();
  assert.equal(expectedIds.length, 17);
  assert.deepEqual(
    Object.keys(pdfModule.CURATED_SIGNATURE_PDF_MAP).sort(),
    [...expectedIds].sort(),
  );
  assert.deepEqual(
    Object.keys(pdfModule.CURATED_SIGNATURE_PDF_PROFILES).sort(),
    [...expectedIds].sort(),
  );
  assert.deepEqual(
    Object.keys(pdfModule.CURATED_SIGNATURE_FAMILY_BRANCHES).sort(),
    [...expectedIds].sort(),
  );
  assert.equal(new Set(Object.values(pdfModule.CURATED_SIGNATURE_PDF_MAP)).size, 17);
  assert.equal(new Set(Object.values(pdfModule.CURATED_SIGNATURE_FAMILY_BRANCHES)).size, 17);
  const profileSignatures = Object.values(pdfModule.CURATED_SIGNATURE_PDF_PROFILES)
    .map((profile) => JSON.stringify(profile));
  assert.equal(new Set(profileSignatures).size, 17);
  for (const id of expectedIds) {
    assert.equal(
      pdfModule.CURATED_SIGNATURE_FAMILY_BRANCHES[id],
      pdfModule.CURATED_SIGNATURE_PDF_PROFILES[id].structureKey,
      id,
    );
  }
  for (const consumedField of [
    'profile.header',
    'profile.treatment',
    'profile.fontFamily',
    'profile.nameFont',
    'profile.nameSize',
    'profile.pagePaddingTop',
    'profile.pagePaddingRight',
    'profile.pagePaddingLeft',
    'profile.companyFirst',
    'profile.skillsColumns',
    'profile.supportingSplit',
    'profile.accentMotif',
  ]) {
    assert.match(source, new RegExp(consumedField.replaceAll('.', '\\.')), consumedField);
  }
  const registryBlock = source.match(
    /export const CURATED_SIGNATURE_PDF_MAP:[\s\S]*?= Object\.freeze\(\{([\s\S]*?)\n\}\);/,
  );
  assert.ok(registryBlock);
  const registryValues = [...registryBlock[1].matchAll(/^\s*'[^']+': ([A-Za-z0-9]+),$/gm)]
    .map((match) => match[1]);
  assert.equal(registryValues.length, 17);
  assert.equal(new Set(registryValues).size, 17);
  assert.doesNotMatch(source, /CURATED_SIGNATURE_PDF_MAP\[[^\]]+\]\s*(?:\|\||\?\?)/);
  assert.throws(
    () => pdfModule.CuratedSignaturePDF({
      resume: fixtures.full,
      templateId: 'not-a-signature',
    }),
    /No curated signature PDF renderer registered/,
  );
});

test('ATS-first profiles stay one-column and preserve conventional catalog order', async () => {
  const pdfModule = await loadPDFModule();
  for (const id of expectedIds) {
    const metadata = catalog.getRegisteredTemplate(id);
    const profile = pdfModule.CURATED_SIGNATURE_PDF_PROFILES[id];
    assert.equal(metadata.rendererKeys.pdf, `${id}:pdf`);
    if (metadata.atsClassification === 'ATS-first') {
      assert.equal(metadata.structure.columns, 1, id);
      assert.deepEqual(
        [...metadata.structure.sectionOrder],
        ['Summary', 'Experience', 'Skills', 'Education'],
        id,
      );
      assert.equal(profile.skillsColumns, 1, id);
      assert.equal(profile.supportingSplit, false, id);
    }
  }
  assert.match(source, /metadata\.structure\.sectionOrder\.map/);
  assert.match(source, /ATS-first PDF profile/);
});

test('catalog PDF labels match consumed layout structure and every linear PDF is actually one-column', async () => {
  const pdfModule = await loadPDFModule();
  for (const id of expectedIds) {
    const metadata = catalog.getRegisteredTemplate(id);
    const profile = pdfModule.CURATED_SIGNATURE_PDF_PROFILES[id];
    const hasMaterialSplit = profile.skillsColumns === 2 || profile.supportingSplit;
    const expectedColumns = hasMaterialSplit ? 2 : 1;
    const expectedPDFMode = hasMaterialSplit ? 'designed' : 'linear';
    assert.equal(metadata.structure.columns, expectedColumns, `${id} catalog columns`);
    assert.equal(metadata.exportProfile.pdf, expectedPDFMode, `${id} PDF export label`);
    assert.equal(metadata.exportProfile.docx, 'linear', `${id} DOCX remains linear`);
    if (metadata.exportProfile.pdf === 'linear') {
      assert.equal(profile.skillsColumns, 1, `${id} linear PDF skills`);
      assert.equal(profile.supportingSplit, false, `${id} linear PDF split`);
    }
  }
});

test('content inventory is canonical, flow-safe, and omits empty sections', async () => {
  const pdfModule = await loadPDFModule();
  const inventory = pdfModule.PDF_CONTENT_INVENTORY;
  assert.equal(inventory.pageSize, 'A4');
  assert.equal(inventory.essentialContentPrimitive, 'Text');
  assert.equal(inventory.usesImages, false);
  assert.equal(inventory.usesFixedEssentialContent, false);
  assert.deepEqual([...inventory.standardHeadings], [
    'Professional Summary',
    'Experience',
    'Skills',
    'Education',
    'Certifications',
  ]);
  for (const field of [
    'name', 'title', 'email', 'phone', 'location', 'linkedin', 'website',
    'summary', 'experience.company', 'experience.role', 'experience.duration',
    'experience.achievements', 'skills.category', 'skills.items',
    'education.degree', 'education.institution', 'education.year',
    'education.details', 'certifications',
  ]) {
    assert.ok(inventory.canonicalFields.includes(field), field);
  }
  assert.deepEqual(
    [...pdfModule.getPDFContentInventory(fixtures.full).headings],
    [...inventory.standardHeadings],
  );
  assert.deepEqual(
    [...pdfModule.getPDFContentInventory({
      ...fixtures.sparse,
      summary: '',
      skills: [],
      education: [],
      certifications: [],
    }).headings],
    ['Experience'],
  );
  assert.doesNotMatch(source, /\bImage\b|<Image\b|\bSvg\b|<Svg\b|data:image|base64/);
  assert.doesNotMatch(source, /\bfixed(?:=|\s)/);
  assert.doesNotMatch(source, /position\s*:\s*['"]absolute['"]/);
  assert.doesNotMatch(source, /wrap=\{false\}/);
  assert.match(source, /size=\{props\.pageSize \|\| 'A4'\}/);
  assert.doesNotMatch(source, /fontSize\s*:\s*[0-6](?:\D|$)/);
  assert.match(source, /Omit<FlowTextProps, 'hyphenationCallback'>/);
  assert.match(source, /<PDFText \{\.\.\.props\} hyphenationCallback=\{NO_HYPHENATION\} \/>/);
  assert.equal(
    (source.match(/<PDFText\b/g) ?? []).length,
    1,
    'all rendered text flows through the no-hyphenation wrapper',
  );
});

test('accent stays decorative and every meaningful text role is contrast-safe', async () => {
  const pdfModule = await loadPDFModule();
  assert.doesNotMatch(source, /color:\s*colors\.accent/);
  assert.match(source, /backgroundColor:\s*colors\.accent/);
  assert.match(source, /border(?:Left|Right|Top|Bottom)?Color:\s*colors\.accent/);
  assert.match(source, /ensureReadableTextColor/);
  assert.match(source, /readableTextColor/);
  for (const id of expectedIds) {
    const metadata = catalog.getRegisteredTemplate(id);
    const resolved = pdfModule.resolveCuratedPDFColors(metadata, {
      primary: '#fefefe',
      text: '#eeeeee',
      accent: '#ffff00',
      background: '#ffffff',
    });
    assert.ok(pdfModule.getPDFContrastRatio(resolved.primary, resolved.background) >= 4.5, id);
    assert.ok(pdfModule.getPDFContrastRatio(resolved.text, resolved.background) >= 4.5, id);
    assert.equal(resolved.accent, '#ffff00');
  }
});

test('17 x full/sparse/long PDFs render and parse sequentially with repeat stability', async () => {
  const { renderToBuffer } = require('@react-pdf/renderer');
  const pdfModule = await loadPDFModule();
  const firstPass = new Map();
  const fullStructureFingerprints = new Map();
  let publicServiceSparseCount = 0;

  for (let pass = 1; pass <= 2; pass += 1) {
    for (const templateId of expectedIds) {
      const metadata = catalog.getRegisteredTemplate(templateId);
      for (const fixtureId of fixtureIds) {
        const resume = { ...fixtures[fixtureId], links: ['https://research.example.test/work'], additionalSections: [{ id: 'community', title: 'Community work', items: ['Community contributor fixture final marker'] }] };
        const artifactKey = `${templateId}/${fixtureId}`;
        const rendered = await renderToBuffer(
          pdfModule.CuratedSignaturePDF({ resume, templateId }),
        );
        const buffer = Buffer.from(rendered);
        assert.ok(buffer.length > 1500, `${artifactKey} pass ${pass} is non-trivial`);
        assert.ok(buffer.length <= 2_500_000, `${artifactKey} pass ${pass} stays <=2.5MB`);
        assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-', artifactKey);

        const evidence = await parseWithStructuralEvidence(Buffer.from(buffer));
        assert.ok(
          evidence.parsed.numpages >= 1 && evidence.parsed.numpages <= 4,
          `${artifactKey} pass ${pass} has 1-4 pages`,
        );
        assertFixtureContent(evidence.parsed.text, resume, templateId, fixtureId);
        assert.ok(evidence.parsed.text.includes('https://research.example.test/work'), `${artifactKey} preserves generic links`);
        assert.ok(evidence.parsed.text.includes('Community contributor fixture final marker'), `${artifactKey} preserves additional content`);
        assertOrderedHeadings(evidence.parsed.text, metadata, templateId, fixtureId);
        const structureFingerprint = artifactStructureFingerprint(evidence);
        assert.ok(
          JSON.parse(structureFingerprint).geometry.flat().length >= 12,
          `${artifactKey} has structural geometry evidence`,
        );

        const stableRecord = {
          pages: evidence.parsed.numpages,
          text: normalized(evidence.parsed.text),
          structureFingerprint,
        };
        if (pass === 1) {
          firstPass.set(artifactKey, stableRecord);
          if (fixtureId === 'full') fullStructureFingerprints.set(templateId, structureFingerprint);
        } else {
          assert.deepEqual(stableRecord, firstPass.get(artifactKey), `${artifactKey} repeats stably`);
        }
        if (templateId === 'public-service' && fixtureId === 'sparse') {
          publicServiceSparseCount += 1;
        }
      }
    }
  }

  assert.equal(firstPass.size, 51);
  assert.equal(publicServiceSparseCount, 2);
  assert.equal(
    new Set(fullStructureFingerprints.values()).size,
    17,
    'full PDFs expose 17 distinct artifact-level geometry fingerprints',
  );
});

test('modern pdfjs extraction preserves all 17 long-fixture candidate identities exactly', async () => {
  const { renderToBuffer } = require('@react-pdf/renderer');
  const pdfModule = await loadPDFModule();
  const resume = fixtures.long;

  for (const templateId of expectedIds) {
    const rendered = await renderToBuffer(
      pdfModule.CuratedSignaturePDF({ resume, templateId }),
    );
    const extractedText = await extractWithModernPDFJS(Buffer.from(rendered));
    assertCandidateIdentityIntegrity(extractedText, resume.name, templateId);
  }
});

test('modern pdfjs extraction preserves a legitimate astral name scalar through a reversible fallback', async () => {
  const { renderToBuffer } = require('@react-pdf/renderer');
  const pdfModule = await loadPDFModule();
  const astralName = `Sera ${String.fromCodePoint(0x10437)} Alvarez`;
  const encodedName = pdfModule.encodeUnsupportedAstralForPDF(astralName);
  assert.notEqual(encodedName, astralName);
  assert.match(encodedName, /\\u\{10437\}/);
  assert.equal(pdfModule.decodeUnsupportedAstralFromPDF(encodedName), astralName);

  const rendered = await renderToBuffer(
    pdfModule.CuratedSignaturePDF({
      resume: { ...fixtures.sparse, name: astralName },
      templateId: 'executive-ledger',
    }),
  );
  const extractedText = await extractWithModernPDFJS(Buffer.from(rendered));
  assert.ok(
    identityWithoutWhitespace(extractedText).includes(identityWithoutWhitespace(encodedName)),
    'the exported PDF contains the exact reversible fallback instead of deleting U+10437',
  );
  assert.equal(
    pdfModule.decodeUnsupportedAstralFromPDF(encodedName),
    astralName,
    'the fallback reconstructs the original candidate name exactly',
  );
  assert.doesNotMatch(source, /\.replace\(\/\[\\u\{10000\}-\\u\{10ffff\}\]\/gu,\s*''\)/);
});
