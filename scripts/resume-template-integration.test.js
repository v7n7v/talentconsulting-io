const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function loadBundledModule(relative, prefix) {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const outfile = path.join(outdir, 'module.cjs');
  buildSync({
    entryPoints: [path.join(root, relative)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    logLevel: 'silent',
  });
  try {
    delete require.cache[require.resolve(outfile)];
    return require(outfile);
  } finally {
    fs.rmSync(outdir, { recursive: true, force: true });
  }
}

function loadPersistence() {
  return loadBundledModule(
    path.join('lib', 'resume-templates', 'persistence.ts'),
    'tc-resume-persistence-',
  );
}

function loadCatalog() {
  return loadBundledModule(
    path.join('lib', 'resume-templates', 'catalog.ts'),
    'tc-resume-catalog-',
  );
}

function loadRegistry() {
  return loadBundledModule(
    path.join('lib', 'resume-templates', 'registry.ts'),
    'tc-resume-registry-',
  );
}

test('Studio consumes the canonical catalog and exposes focusable entitlement-aware cards', () => {
  const page = read('app/suite/resume/page.tsx');
  // ALL_TEMPLATES was an alias nothing read - tsc --noUnusedLocals confirmed it. The
  // real contract, that the Studio reads the canonical catalog rather than a local
  // array, is the assertion below and is unaffected by the alias going away.
  assert.match(page, /const TEMPLATES = getSelectableTemplates\(\);/);
  assert.doesNotMatch(page, /FEATURED_TEMPLATE_IDS/);
  assert.match(page, /recommendTemplateIds\(signalText, 3\)/);
  assert.match(page, /CuratedTemplateMiniature/);
  assert.equal((page.match(/tabIndex=\{0\}/g) || []).length, 1);
  assert.match(page, /searchParams\.get\('template'\)/);
  assert.match(page, /requested\.tier === 'pro' && !isPro/);
  assert.match(page, /resume-template-card-\$\{requestedLockedTemplateId\}/);
  assert.match(page, /resolveEntitledReplacementTemplate\(draft\.selectedTemplateId, isPro\)/);
  assert.match(page, /resolveEntitledReplacementTemplate\(versionTemplateId, isPro\)/);
  assert.match(page, /resolveInitialResumeTemplateId\(/);
  assert.match(page, /requestedQueryTemplateId/);
  assert.match(page, /draft\.selectedTemplateId && !requestedQueryTemplateId/);
  assert.match(page, /requireSelectedTemplateEntitlementBefore\('PDF export'\)/);
  assert.match(page, /requireSelectedTemplateEntitlementBefore\('Word export'\)/);
  // The contrast gate moved with the colourways into lib/resume-templates/palettes.ts.
  // The contract is unchanged - no palette reaches a render without passing through it -
  // so the assertion follows the code rather than being deleted.
  assert.match(read('lib/resume-templates/palettes.ts'), /getContrastSafeTemplateColors\(/);
  assert.doesNotMatch(page, /TEMPLATE_PALETTE_GROUPS\s*[:=]/,
    'colourways belong in lib/resume-templates, not inline in the page');
  assert.match(page, /const PAID_TEMPLATE_PLAN_LABEL = PLAN_IDENTITIES\.pro\.label;/);
  assert.ok((page.match(/\{PAID_TEMPLATE_PLAN_LABEL\}/g) || []).length >= 2);
  assert.match(page, /selectedTemplate\.tier === 'pro' \? PAID_TEMPLATE_PLAN_LABEL/);
  assert.doesNotMatch(page, /template\.tier === 'pro'[^<]*<span[^>]*>PRO<\/span>/);
  assert.doesNotMatch(page, /isLocked && <span[^>]*>PRO<\/span>/);
  assert.doesNotMatch(page, />3<\/p>\s*<p[^>]*>Audiences</);
});

test('all three export surfaces explicitly integrate the curated registries', () => {
  const html = read('components/resume-templates/index.tsx');
  const pdf = read('lib/pdf-templates.tsx');
  const studio = read('app/suite/resume/page.tsx');
  const applications = read('app/suite/applications/page.tsx');
  assert.match(html, /\.\.\.CURATED_HTML_TEMPLATE_MAP/);
  assert.match(pdf, /\.\.\.CURATED_PDF_PAGE_MAP/);
  assert.match(pdf, /NEW_SIGNATURE_TEMPLATE_IDS\.map/);
  assert.match(studio, /buildCuratedSignatureDocxBlob/);
  assert.match(applications, /buildCuratedSignatureDocxBlob/);
  assert.match(applications, /downloadResumePDF\(linkedResume\.content as any, colors, undefined, templateId, undefined, design\?\.pageSize \|\| 'A4', design \|\| undefined\)/);
  assert.match(applications, /getPersistedResumeDesign\(linkedResume, normalizeResume/);
  assert.match(applications, /buildResumeDesignDocxBlob/);
  assert.match(applications, /isResumeTemplateSelectionEntitled\(templateId, isPro\)/);
  assert.equal(
    (applications.match(/isResumeTemplateSelectionEntitled\(templateId, isPro\)/g) || []).length,
    2,
    'Applications guards both PDF and Word exports',
  );
  assert.ok(
    (applications.match(/if \(tierLoading\)/g) || []).length >= 2,
    'Applications waits for tier resolution before either export',
  );
  assert.equal(
    (applications.match(/getPersistedResumePaletteColors\(linkedResume\)/g) || []).length,
    2,
    'Applications sanitizes persisted colors before PDF and curated DOCX export',
  );
  assert.match(html, /requireResumeTemplateRegistryEntry\(TEMPLATE_MAP, templateId, 'html'\)/);
  assert.match(pdf, /requireResumeTemplateRegistryEntry\(PDF_TEMPLATE_MAP, templateId, 'pdf'\)/);
  assert.doesNotMatch(html, /TEMPLATE_MAP\[templateId\]\s*\|\|/);
  assert.doesNotMatch(pdf, /PDF_TEMPLATE_MAP\[templateId\]\s*\|\|/);
});

test('public renderer registry helper fails closed at runtime', () => {
  const { requireResumeTemplateRegistryEntry } = loadRegistry();
  const known = () => 'known';
  assert.equal(requireResumeTemplateRegistryEntry({ known }, 'known', 'html'), known);
  assert.throws(
    () => requireResumeTemplateRegistryEntry({ known }, 'missing', 'html'),
    /Unknown html resume template: missing/,
  );
  assert.throws(
    () => requireResumeTemplateRegistryEntry({ missing: undefined }, 'missing', 'pdf'),
    /Missing pdf resume template renderer: missing/,
  );
});

test('entitlement resolver rejects Pro persistence and preserves free or paid selections', () => {
  const catalog = loadCatalog();
  assert.equal(catalog.resolveEntitledTemplateIdForSelection('sales-momentum', false), 'editorial-authority');
  assert.equal(catalog.isResumeTemplateSelectionEntitled('sales-momentum', false), false);
  assert.equal(catalog.resolveEntitledTemplateIdForSelection('sales-momentum', true), 'sales-momentum');
  assert.equal(catalog.isResumeTemplateSelectionEntitled('sales-momentum', true), true);
  assert.equal(catalog.resolveEntitledTemplateIdForSelection('technical-signal', false), 'technical-signal');
  for (const id of catalog.LEGACY_TEMPLATE_IDS) {
    assert.equal(
      catalog.isResumeTemplateSelectionEntitled(id, false),
      false,
      `${id} raw persisted Standard tier is denied to free/lapsed access`,
    );
    assert.notEqual(
      catalog.resolveEntitledTemplateIdForSelection(id, false),
      id,
      `${id} cannot survive as a free selection`,
    );
    assert.equal(catalog.isResumeTemplateSelectionEntitled(id, true), true, `${id} remains available to paid saved resumes`);
  }
  assert.equal(catalog.resolveEntitledTemplateIdForSelection('missing-id', false), 'editorial-authority');
  assert.equal(catalog.isResumeTemplateSelectionEntitled('missing-id', false), true);
  assert.equal(
    catalog.resolveInitialResumeTemplateId('sales-momentum', 'technical-signal'),
    'sales-momentum',
    'recognized query selection wins over draft selection',
  );
  assert.equal(
    catalog.resolveInitialResumeTemplateId('missing-id', 'technical-signal'),
    'technical-signal',
    'unknown query safely leaves draft compatibility intact',
  );
});

test('public gallery is catalog-backed, deep-linked, tier truthful, and avoids universal ATS claims', () => {
  const gallery = read('app/templates/TemplatesGallery.tsx');
  const metadata = read('app/templates/page.tsx');
  assert.match(gallery, /const TEMPLATES = getSelectableTemplates\(\);/);
  assert.match(gallery, /\/suite\/resume\?template=\$\{encodeURIComponent\(template\.slug\)\}/);
  assert.match(gallery, /template\.atsClassification/);
  assert.match(gallery, /template\.tier === 'pro'/);
  assert.doesNotMatch(`${gallery}\n${metadata}`, /parse correctly through Applicant Tracking Systems|maximum compatibility|all templates are free/i);
  assert.match(`${gallery}\n${metadata}`, /not guaranteed/i);
  for (const href of ['/resume-examples/project-manager', '/resume-keywords/marketing', '/tools/ats-analyzer']) {
    assert.match(gallery, new RegExp(href.replace(/\//g, '\\/')));
  }
  assert.match(gallery, /Frequently Asked Questions/);
  assert.match(gallery, /Editorial Authority, Technical Signal, and Brutalist Voltage are free/i);
  assert.match(gallery, /The (?:\d+ )?new curated signature designs require Standard/i);
  assert.match(gallery, /opacity-100[^"]*md:opacity-0[^"]*md:group-hover:opacity-100[^"]*md:group-focus-within:opacity-100/);
});

test('resume guidance uses catalog ATS posture and avoids universal compatibility promises', () => {
  const studio = read('app/suite/resume/page.tsx');
  const help = read('components/PageHelp.tsx');
  const settings = read('app/suite/settings/page.tsx');
  const landing = read('app/tools/resume-builder/ResumeBuilderLanding.tsx');
  const serverLanding = read('app/tools/resume-builder/page.tsx');
  assert.match(studio, /ats: metadata\?\.atsClassification/);
  assert.match(studio, /metadata\.exportProfile\.pdf === 'designed'/);
  assert.doesNotMatch(
    `${studio}\n${help}\n${settings}\n${landing}\n${serverLanding}`,
    /parse correctly everywhere|perfectly formatted for every ATS|specifically designed to pass ATS parsing|ATS-compatible PDF|compatible with ATS systems|maximum ATS compatibility/i,
  );
  assert.match(`${help}\n${settings}\n${landing}\n${serverLanding}`, /not a guarantee|cannot guarantee|No (?:template|export) can guarantee/);
  assert.match(serverLanding, /Results vary by ATS vendor and configuration/);
});

test('persistence accessor recovers template truth from every historical storage location', () => {
  const persistence = loadPersistence();
  const catalog = loadCatalog();
  assert.equal(persistence.getPersistedResumeTemplateId({ metadata: { template: 'sales-momentum' } }), 'sales-momentum');
  assert.equal(persistence.getPersistedResumeTemplateId({ skill_graph: { template: 'architectural-grid' } }), 'architectural-grid');
  assert.equal(persistence.getPersistedResumeTemplateId({ template: 'technical-signal' }), 'technical-signal');
  assert.equal(persistence.getPersistedResumeTemplateId({ content: { template: 'creative-director' } }), 'creative-director');
  assert.equal(persistence.getPersistedResumeTemplateId({ metadata: { template: 'missing-id' } }), 'editorial-authority');
  assert.equal(
    persistence.getPersistedResumePaletteColors({
      metadata: {
        template: 'sales-momentum',
        paletteColors: { primary: '#111111', accent: '#222222', text: '#333333' },
      },
    }).primary,
    '#111111',
  );
  assert.equal(
    persistence.getPersistedResumePaletteColors({
      metadata: {
        template: 'sales-momentum',
        paletteColors: {
          primary: '#111111',
          accent: '#222222',
          text: '#333333',
          background: 'not-a-color',
        },
      },
    }).background,
    '#ffffff',
  );
  const whiteOnWhite = persistence.getPersistedResumePaletteColors({
    metadata: {
      template: 'sales-momentum',
      paletteColors: {
        primary: '#ffffff',
        accent: '#ffffff',
        text: '#ffffff',
        background: '#ffffff',
      },
    },
  });
  assert.ok(catalog.getContrastRatio(whiteOnWhite.primary, whiteOnWhite.background) >= 4.5);
  assert.ok(catalog.getContrastRatio(whiteOnWhite.text, whiteOnWhite.background) >= 4.5);
  assert.equal(whiteOnWhite.accent, '#ffffff', 'decorative accent is not unnecessarily rejected');

  const adversarialDark = persistence.getPersistedResumePaletteColors({
    metadata: {
      template: 'sales-momentum',
      paletteColors: {
        primary: '#111111',
        accent: '#121212',
        text: '#000000',
        background: '#111111',
      },
    },
  });
  assert.ok(catalog.getContrastRatio(adversarialDark.primary, adversarialDark.background) >= 4.5);
  assert.ok(catalog.getContrastRatio(adversarialDark.text, adversarialDark.background) >= 4.5);
  assert.equal(adversarialDark.accent, '#121212');
});

test('development visual harness covers direct IDs plus full, sparse, and long fixtures', () => {
  const route = read('app/resume-template-lab/page.tsx');
  const lab = read('components/resume-templates/curated/TemplateLabClient.tsx');
  const fixtures = read('lib/resume-templates/fixtures.ts');
  const globalCss = read('app/globals.css');
  assert.match(route, /process\.env\.NODE_ENV === 'production'/);
  assert.match(lab, /getSelectableTemplates\(\)/);
  assert.match(lab, /data-template-lab/);
  assert.match(lab, /ResizeObserver/);
  assert.match(lab, /PAGE_WIDTH\[design\.pageSize\]/);
  assert.match(lab, /ResumeDesignPanel/);
  assert.match(lab, /ResumeExportPreview/);
  assert.match(lab, /data-template-lab-scale/);
  assert.match(lab, /PLAN_IDENTITIES\.pro\.label/);
  assert.doesNotMatch(lab, /template\.tier\.toUpperCase\(\)/);
  assert.match(
    globalCss,
    /\[style\*="transform: scale"\]:not\(\.sona-mark-v2 \*\) \{[\s\S]*?transform: none !important;/,
    'global animation guard still cancels inline scale(...) transforms',
  );
  assert.doesNotMatch(
    lab,
    /transform:\s*`scale\(/,
    'template lab must not emit the inline scale(...) form cancelled by the global animation guard',
  );
  assert.match(
    lab,
    /transform:\s*`matrix\(\$\{previewScale\}, 0, 0, \$\{previewScale\}, 0, 0\)`/,
    'template lab uses an equivalent matrix transform that does not collide with the global selector',
  );
  for (const fixture of ['full', 'sparse', 'long']) {
    assert.match(fixtures, new RegExp(`${fixture}: \\{`));
  }
});

test('existing bespoke template implementations remain byte-identical to the pre-build baseline', () => {
  const expected = new Map([
    // Updated intentionally: the editorial renderer now preserves generic links[]
    // and additionalSections in the HTML companion.
    ['components/resume-templates/editorial-authority.tsx', '678CDFB49D10BE30191E1F0F730C439C2BD83BDB0808632AA48562E74A82338D'],
    // These bespoke renderers now preserve generic links[] and additionalSections.
    ['components/resume-templates/technical-signal.tsx', '05D77077CF6CA788F0FC975747A37D83C1EF80205EAB51793C8A7EADEDCA121D'],
    ['components/resume-templates/brutalist-voltage.tsx', '57B6218A31E9117A85353FDA0B4D7B3904B373E6A724BAD7FC019C7F7866D969'],
  ]);
  const crypto = require('node:crypto');
  for (const [relative, hash] of expected) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex').toUpperCase();
    assert.equal(actual, hash, relative);
  }
});
