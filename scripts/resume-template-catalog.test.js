const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'lib', 'resume-templates', 'catalog.ts');
const pagePath = path.join(root, 'app', 'suite', 'resume', 'page.tsx');

function loadCatalog() {
  const source = fs.readFileSync(catalogPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(output, { module: loadedModule, exports: loadedModule.exports, require, console, Map, Set, Object });
  return loadedModule.exports;
}

const catalog = loadCatalog();
const expectedNew = [
  'executive-ledger', 'strategy-brief', 'product-signal', 'engineering-core',
  'data-evidence', 'finance-standard', 'legal-brief', 'healthcare-precision',
  'academic-profile', 'public-service', 'mission-impact', 'career-pivot',
  'emerging-professional', 'sales-momentum', 'creative-director',
  'architectural-grid', 'editorial-signature',
];
const currentSignatureIds = [
  'editorial-authority', 'technical-signal', 'brutalist-voltage',
];
const baselineRegisteredIds = [
  ...currentSignatureIds,
  'executive', 'modern', 'minimal', 'compact', 'technical', 'boardroom',
  'product-brief', 'creative', 'harvard', 'cascade', 'elegant', 'nordic',
  'ats-optimized', 'double-column', 'infographic', 'deloitte', 'faang',
  'startup', 'federal', 'academic', 'operator', 'data-signal',
  'finance-ledger', 'storyline', 'venture',
];

function assertMetadataEssentials(template) {
  assert.ok(template.paletteGroup.trim().length > 0, `${template.id} paletteGroup`);
  assert.ok(Array.isArray(template.aliases), `${template.id} aliases`);
  for (const format of ['html', 'pdf', 'docx']) {
    assert.ok(template.rendererKeys[format].trim().length > 0, `${template.id} ${format} renderer`);
  }
  assert.ok(template.linearDocxCompanionKey.trim().length > 0, `${template.id} linear companion`);
  assert.equal(template.rendererKeys.docx, template.linearDocxCompanionKey);
}

test('catalog registers the 28 source IDs and exactly 17 new signatures', () => {
  const page = fs.readFileSync(pagePath, 'utf8');
  // The ALL_TEMPLATES alias was removed as unused. What mattered was that the page
  // never re-declares the template list locally, which the negative assertion below
  // still guards - now for any local array, not just one named ALL_TEMPLATES.
  assert.doesNotMatch(page, /const (ALL_)?TEMPLATES = \[/);
  assert.equal(baselineRegisteredIds.length, 28);
  assert.deepEqual([...catalog.NEW_SIGNATURE_TEMPLATE_IDS], expectedNew);
  assert.equal(catalog.LEGACY_TEMPLATE_IDS.length, 25);
  assert.equal(catalog.REGISTERED_TEMPLATE_IDS.length, 45);
  assert.equal(new Set(catalog.REGISTERED_TEMPLATE_IDS).size, 45);
  assert.deepEqual(
    [...catalog.REGISTERED_TEMPLATE_IDS].filter((id) => baselineRegisteredIds.includes(id)).sort(),
    [...baselineRegisteredIds].sort(),
  );
});

test('selectability, tiers, releases, and feature flag follow the exposure contract', () => {
  assert.equal(catalog.ENABLE_NEW_RESUME_SIGNATURES_BY_DEFAULT, true);
  assert.equal(catalog.SELECTABLE_TEMPLATE_IDS.length, 20);
  assert.equal(catalog.getSelectableTemplates().length, 20);
  assert.deepEqual(
    Array.from(catalog.getSelectableTemplates(false), (template) => template.id),
    ['editorial-authority', 'technical-signal', 'brutalist-voltage'],
  );
  for (const id of currentSignatureIds) {
    const registered = catalog.getRegisteredTemplate(id);
    assert.equal(registered.tier, 'free', `${id} remains free`);
    assert.equal(registered.selectable, true, `${id} remains selectable`);
    assert.equal(registered.legacy, false, `${id} is not legacy`);
    assert.equal(catalog.getSelectableTemplates(true).find((item) => item.id === id), registered);
    assert.equal(catalog.getSelectableTemplates(false).find((item) => item.id === id), registered);
  }
  assert.equal(
    catalog.getSelectableTemplates(false).every((template) => (
      template.selectable && template.tier === 'free' && !template.legacy
    )),
    true,
  );
  for (const template of catalog.TEMPLATE_CATALOG) {
    if (expectedNew.includes(template.id)) {
      assert.equal(template.tier, 'pro');
      assert.equal(template.release, '2026.07');
      assert.equal(template.selectable, true);
      assert.equal(template.legacy, false);
    }
    if (catalog.LEGACY_TEMPLATE_IDS.includes(template.id)) {
      assert.equal(template.selectable, false);
      assert.equal(template.legacy, true);
      assert.equal(catalog.resolveTemplateForRender(template.id).id, template.id);
    }
  }
  assert.deepEqual(
    Array.from(
      catalog.TEMPLATE_CATALOG.filter((template) => template.release === '2026.07'),
      (template) => template.id,
    ).sort(),
    [...expectedNew].sort(),
  );
  assert.equal(catalog.REGISTERED_TEMPLATE_IDS.length, 45, 'flag never changes registration');
});

test('metadata schema is complete, closed, and uses supported ATS labels', () => {
  const keys = [
    'accentDecorativeOnly', 'aliases', 'atsClassification', 'atsLimitation',
    'audience', 'category', 'colors', 'description', 'exportProfile',
    'filterTags', 'icon', 'id', 'legacy', 'linearDocxCompanionKey', 'name',
    'palette', 'paletteGroup', 'recommendationSignals', 'release',
    'rendererKeys', 'roleFixture', 'selectable', 'slug', 'structure', 'tier',
  ];
  const optionalKeys = ['thumbnail'];
  const structureKeys = [
    'columns', 'contactTreatment', 'decorativeSystem', 'density',
    'experienceTreatment', 'family', 'headerGeometry', 'ruleSystem',
    'sectionOrder', 'skillsTreatment', 'typography',
  ];
  const atsLabels = new Set(['ATS-first', 'ATS-conscious', 'Human-first']);
  for (const template of catalog.TEMPLATE_CATALOG) {
    const actualKeys = Object.keys(template);
    assert.deepEqual(actualKeys.filter((key) => !optionalKeys.includes(key)).sort(), keys);
    assert.ok(actualKeys.every((key) => keys.includes(key) || optionalKeys.includes(key)));
    assert.deepEqual(Object.keys(template.structure).sort(), structureKeys);
    assert.ok(atsLabels.has(template.atsClassification));
    assert.equal(template.slug, template.id);
    assert.ok(template.roleFixture.length > 0);
    assert.ok(template.palette.colors === template.colors);
    assert.equal(template.accentDecorativeOnly, true);
    assert.equal(template.exportProfile.docx, 'linear');
    if (template.structure.columns === 2) {
      assert.equal(template.exportProfile.pdf, 'designed', `${template.id} two-column PDF`);
    }
    if (template.exportProfile.pdf === 'linear') {
      assert.equal(template.structure.columns, 1, `${template.id} linear PDF`);
    }
    assert.deepEqual(Object.keys(template.rendererKeys).sort(), ['docx', 'html', 'pdf']);
    assertMetadataEssentials(template);
  }
  const current = ['editorial-authority', 'technical-signal', 'brutalist-voltage']
    .map((id) => catalog.getRegisteredTemplate(id));
  assert.deepEqual(current.map((template) => template.release), ['signature-v1', 'signature-v1', 'signature-v1']);
  assert.deepEqual(current.map((template) => template.thumbnail), [
    '/resume-templates/editorial-authority-reference.png',
    '/resume-templates/technical-signal-reference.png',
    '/resume-templates/brutalist-voltage-reference.png',
  ]);
  assert.equal(catalog.getRegisteredTemplate('technical-signal').atsClassification, 'ATS-conscious');
});

test('new structural signatures are unique and ATS-first layouts are conventional', () => {
  const fresh = expectedNew.map((id) => catalog.getRegisteredTemplate(id));
  const signatures = fresh.map((template) => JSON.stringify(template.structure));
  assert.equal(new Set(signatures).size, 17);
  assert.ok(new Set(fresh.map((template) => template.structure.family)).size >= 8);
  for (let left = 0; left < fresh.length; left += 1) {
    for (let right = left + 1; right < fresh.length; right += 1) {
      const differingDimensions = Object.keys(fresh[left].structure).filter((key) => (
        JSON.stringify(fresh[left].structure[key]) !== JSON.stringify(fresh[right].structure[key])
      ));
      assert.ok(
        differingDimensions.length >= 2,
        `${fresh[left].id} and ${fresh[right].id} differ on only ${differingDimensions.join(', ')}`,
      );
    }
  }
  for (const template of fresh.filter((item) => item.atsClassification === 'ATS-first')) {
    assert.equal(template.structure.columns, 1);
    assert.deepEqual([...template.structure.sectionOrder], ['Summary', 'Experience', 'Skills', 'Education']);
  }
  const expectedAts = {
    'academic-profile': 'ATS-conscious', 'public-service': 'ATS-first',
    'mission-impact': 'ATS-first', 'career-pivot': 'ATS-conscious',
    'emerging-professional': 'ATS-first', 'sales-momentum': 'ATS-first',
    'creative-director': 'Human-first', 'architectural-grid': 'ATS-conscious',
    'editorial-signature': 'Human-first',
  };
  for (const id of expectedNew.slice(0, 8)) expectedAts[id] = 'ATS-first';
  for (const [id, label] of Object.entries(expectedAts)) {
    assert.equal(catalog.getRegisteredTemplate(id).atsClassification, label);
  }
});

test('new palettes meet WCAG AA contrast while accents remain decorative', () => {
  for (const id of expectedNew) {
    const template = catalog.getRegisteredTemplate(id);
    assert.ok(catalog.getContrastRatio(template.colors.text, template.colors.background) >= 4.5, `${id} text`);
    assert.ok(catalog.getContrastRatio(template.colors.primary, template.colors.background) >= 4.5, `${id} primary`);
    assert.equal(template.accentDecorativeOnly, true, `${id} accent is not a text-color promise`);
  }
});

test('slugs and aliases are globally collision-free', () => {
  const slugs = catalog.TEMPLATE_CATALOG.map((template) => template.slug);
  assert.equal(new Set(slugs).size, catalog.TEMPLATE_CATALOG.length);
  const identities = new Set(slugs);
  for (const template of catalog.TEMPLATE_CATALOG) {
    assertMetadataEssentials(template);
    assert.equal(new Set(template.aliases).size, template.aliases.length);
    for (const alias of template.aliases) {
      assert.equal(identities.has(alias), false, `${alias} collides with a slug or alias`);
      identities.add(alias);
    }
  }
});

test('replacement compatibility preserves current behavior without blocking legacy rendering', () => {
  const technical = ['technical', 'ats-optimized', 'faang', 'data-signal', 'operator', 'double-column'];
  const creative = ['modern', 'creative', 'cascade', 'infographic', 'startup', 'storyline', 'venture'];
  for (const id of technical) assert.equal(catalog.resolveTemplateIdForSelection(id), 'technical-signal');
  for (const id of creative) assert.equal(catalog.resolveTemplateIdForSelection(id), 'brutalist-voltage');
  for (const id of catalog.LEGACY_TEMPLATE_IDS.filter((id) => !technical.includes(id) && !creative.includes(id))) {
    assert.equal(catalog.resolveTemplateIdForSelection(id), 'editorial-authority');
  }
  assert.equal(catalog.resolveTemplateIdForSelection('unknown-template'), 'editorial-authority');
  assert.equal(catalog.resolveTemplateIdForSelection('executive-ledger'), 'executive-ledger');
  assert.equal(catalog.resolveSelectableTemplateDeepLinkId('executive-ledger'), 'executive-ledger');
  assert.equal(catalog.resolveSelectableTemplateDeepLinkId('executive'), undefined);
  assert.equal(catalog.resolveSelectableTemplateDeepLinkId('unknown-template'), undefined);
  assert.equal(
    catalog.resolveInitialResumeTemplateId('executive-ledger', 'technical-signal'),
    'executive-ledger',
  );
  assert.equal(
    catalog.resolveInitialResumeTemplateId('unknown-template', 'technical-signal'),
    'technical-signal',
  );
  assert.equal(catalog.resolveInitialResumeTemplateId(undefined, 'technical-signal'), 'technical-signal');
  assert.equal(catalog.resolveTemplateForRender('technical').id, 'technical');
  assert.equal(catalog.resolveTemplateForRender('unknown-template'), undefined);
});

test('recommendations deterministically cover every new named-role fixture', () => {
  for (const id of expectedNew) {
    const template = catalog.getRegisteredTemplate(id);
    assert.equal(catalog.recommendTemplateIds(template.roleFixture, 1)[0], id, id);
    assert.equal(
      JSON.stringify(catalog.recommendTemplateIds(template.roleFixture, 3)),
      JSON.stringify(catalog.recommendTemplateIds(template.roleFixture, 3)),
    );
  }
  assert.deepEqual(
    Array.from(catalog.recommendTemplateIds('unclassified role with no catalog vocabulary', 3)),
    ['editorial-authority', 'technical-signal', 'brutalist-voltage'],
  );
  assert.deepEqual(
    Array.from(catalog.recommendTemplateIds('engineer creative', 3)),
    ['technical-signal', 'brutalist-voltage', 'editorial-authority'],
    'equal signal weights use stable catalog order before fallback',
  );
  assert.deepEqual(
    Array.from(catalog.recommendTemplateIds('Corporate Strategy Director', 3)),
    ['strategy-brief', 'editorial-authority', 'technical-signal'],
    'an exact named-role fixture has a fixed recommendation order',
  );
});

test('negative controls prove essential metadata and collision checks reject corruption', () => {
  const original = catalog.getRegisteredTemplate('executive-ledger');
  const missingRenderer = {
    ...original,
    rendererKeys: { ...original.rendererKeys, pdf: '' },
  };
  assert.throws(() => assertMetadataEssentials(missingRenderer), /pdf renderer/);

  const missingPaletteGroup = { ...original, paletteGroup: '' };
  assert.throws(() => assertMetadataEssentials(missingPaletteGroup), /paletteGroup/);

  const collidingAliases = [
    { slug: 'alpha', aliases: [] },
    { slug: 'beta', aliases: ['alpha'] },
  ];
  assert.throws(() => {
    const identities = new Set(collidingAliases.map((item) => item.slug));
    for (const item of collidingAliases) {
      for (const alias of item.aliases) {
        assert.equal(identities.has(alias), false, `${alias} collides with a slug or alias`);
        identities.add(alias);
      }
    }
  }, /collides with a slug or alias/);
});
