const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const JSZip = require('jszip');
const mammoth = require('mammoth');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'lib', 'resume-templates', 'catalog.ts');
const builderPath = path.join(root, 'lib', 'resume-signature-docx.ts');

const expectedIds = [
  'executive-ledger',
  'strategy-brief',
  'product-signal',
  'engineering-core',
  'data-evidence',
  'finance-standard',
  'legal-brief',
  'healthcare-precision',
  'academic-profile',
  'public-service',
  'mission-impact',
  'career-pivot',
  'emerging-professional',
  'sales-momentum',
  'creative-director',
  'architectural-grid',
  'editorial-signature',
];

function loadCatalog() {
  const source = fs.readFileSync(catalogPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(output, {
    module: loadedModule,
    exports: loadedModule.exports,
    require,
    console,
    Map,
    Set,
    Object,
  });
  return loadedModule.exports;
}

function loadBuilder() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-signature-docx-'));
  const outfile = path.join(outdir, 'resume-signature-docx.cjs');
  buildSync({
    entryPoints: [builderPath],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    logLevel: 'silent',
  });
  return require(outfile);
}

const catalog = loadCatalog();
const builder = loadBuilder();

function fullResume() {
  return {
    name: 'Amina Rivera',
    title: 'Principal Platform Engineer',
    email: 'amina.rivera@example.com',
    phone: '+1 212 555 0142',
    location: 'New York, NY',
    linkedin: 'linkedin.com/in/amina-rivera',
    website: 'aminarivera.dev',
    summary: 'Platform leader translating distributed-systems complexity into reliable customer outcomes.',
    experience: [
      {
        company: 'Northstar Systems',
        role: 'Principal Platform Engineer',
        duration: '2022 - Present',
        achievements: [
          'Reduced deployment recovery time by 41 percent across twelve services.',
          'Established an architecture review practice used by seven product teams.',
        ],
      },
      {
        company: 'Beacon Commerce',
        role: 'Staff Software Engineer',
        duration: '2018 - 2022',
        achievements: [
          'Led a payment migration that preserved every customer transaction.',
          'Mentored nine engineers through promotion-ready technical plans.',
        ],
      },
      {
        company: 'Cedar Labs',
        role: 'Software Engineer',
        duration: '2015 - 2018',
        achievements: [
          'Built the first automated service-health checks for the operations team.',
        ],
      },
    ],
    education: [
      {
        degree: 'MS Computer Science',
        institution: 'Columbia University',
        year: '2015',
        details: 'Distributed systems concentration',
      },
      {
        degree: 'BS Computer Engineering',
        institution: 'Rutgers University',
        year: '2013',
        details: 'Magna cum laude',
      },
    ],
    skills: [
      { category: 'Architecture', items: ['Distributed systems', 'Event-driven design'] },
      { category: 'Delivery', items: ['Kubernetes', 'Terraform', 'Continuous delivery'] },
      { category: 'Leadership', items: ['Technical strategy', 'Engineering mentorship'] },
    ],
    certifications: [
      'AWS Certified Solutions Architect - Professional',
      'Certified Kubernetes Administrator',
    ],
  };
}

function sparseResume() {
  return {
    name: 'Jordan Lee',
    title: '',
    email: 'jordan.lee@example.org',
    phone: '',
    location: '',
    linkedin: undefined,
    website: undefined,
    summary: '',
    experience: [
      {
        company: '',
        role: 'Community Program Fellow',
        duration: '',
        achievements: ['Coordinated a neighborhood listening session.'],
      },
    ],
    education: [
      {
        degree: '',
        institution: 'Lakeview Community College',
        year: '',
      },
    ],
    skills: [
      { category: 'Community engagement', items: ['Facilitation'] },
    ],
    certifications: [],
  };
}

function longResume() {
  const resume = fullResume();
  return {
    ...resume,
    name: 'Dr. Priya Nanduri',
    title: 'Director of Clinical Analytics and Responsible Artificial Intelligence',
    summary: [
      'Clinical analytics leader connecting evidence, operations, and responsible artificial intelligence.',
      'Builds durable measurement systems while keeping patient safety, interpretability, and frontline adoption visible.',
      'Partners with clinical, engineering, legal, and executive teams to turn complex findings into accountable decisions.',
    ].join(' '),
    experience: Array.from({ length: 6 }, (_, index) => ({
      company: `Evidence Health Network ${index + 1}`,
      role: `Clinical Analytics Leadership Role ${index + 1}`,
      duration: `${2012 + index * 2} - ${2014 + index * 2}`,
      achievements: [
        `Designed longitudinal evidence workflow ${index + 1} with transparent review checkpoints and documented ownership.`,
        `Improved clinical reporting cycle ${index + 1} while preserving source definitions, denominators, and exclusions.`,
        `Guided multidisciplinary adoption program ${index + 1} across clinicians, analysts, engineers, and operators.`,
      ],
    })),
    education: [
      {
        degree: 'PhD Biomedical Informatics',
        institution: 'Mid-Atlantic Research University',
        year: '2012',
        details: 'Dissertation on interpretable longitudinal risk models',
      },
      {
        degree: 'MPH Epidemiology',
        institution: 'Commonwealth School of Public Health',
        year: '2008',
        details: 'Health outcomes and biostatistics',
      },
    ],
    skills: [
      {
        category: 'Clinical evidence',
        items: ['Longitudinal analysis', 'Causal inference', 'Outcomes measurement'],
      },
      {
        category: 'Responsible AI',
        items: ['Model governance', 'Interpretability', 'Bias evaluation'],
      },
      {
        category: 'Leadership',
        items: ['Clinical partnership', 'Portfolio strategy', 'Change management'],
      },
    ],
    certifications: [
      'Certified Professional in Healthcare Quality',
      'Epic Clinical Analytics Accreditation',
    ],
  };
}

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function relativeLuminance(hex) {
  const channels = hex.replace('#', '').match(/.{2}/g);
  assert.equal(channels?.length, 3, `valid six-digit hex color: ${hex}`);
  const [red, green, blue] = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function expectedInventory(resume) {
  const values = [];
  const add = (value) => {
    if (typeof value === 'string' && value.trim()) values.push(value);
  };
  [
    resume.name,
    resume.title,
    resume.email,
    resume.phone,
    resume.location,
    resume.linkedin,
    resume.website,
    resume.summary,
  ].forEach(add);
  for (const experience of resume.experience) {
    [experience.company, experience.role, experience.duration].forEach(add);
    experience.achievements.forEach(add);
  }
  for (const education of resume.education) {
    [education.degree, education.institution, education.year, education.details].forEach(add);
  }
  for (const group of resume.skills) {
    add(group.category);
    group.items.forEach(add);
  }
  resume.certifications.forEach(add);
  return values;
}

async function inspectDocx(buffer, resume, templateId) {
  assert.ok(Buffer.isBuffer(buffer), `${templateId} returns a Buffer`);
  assert.equal(buffer.subarray(0, 2).toString('ascii'), 'PK', `${templateId} is a ZIP`);

  const zip = await JSZip.loadAsync(buffer);
  for (const requiredPart of [
    '[Content_Types].xml',
    '_rels/.rels',
    'word/document.xml',
    'word/styles.xml',
    'word/numbering.xml',
  ]) {
    assert.ok(zip.file(requiredPart), `${templateId} contains ${requiredPart}`);
  }

  const partNames = Object.keys(zip.files);
  assert.equal(
    partNames.some((name) => /^word\/(?:header|footer)\d+\.xml$/i.test(name)),
    false,
    `${templateId} has no header/footer content parts`,
  );
  assert.equal(
    partNames.some((name) => name.startsWith('word/media/')),
    false,
    `${templateId} has no media parts`,
  );

  const documentXml = await zip.file('word/document.xml').async('string');
  assert.doesNotMatch(
    documentXml,
    /<w:(?:tbl|txbxContent)\b|<w:(?:drawing|pict)\b|<wp:(?:anchor|inline)\b/i,
    `${templateId} remains linear body-flow OOXML`,
  );
  assert.match(documentXml, /<w:p\b/, `${templateId} uses paragraphs`);
  if (resume.experience.some((item) => item.achievements.some((value) => value.trim()))
    || resume.certifications.some((value) => value.trim())) {
    assert.match(documentXml, /<w:numPr>/, `${templateId} uses real list numbering`);
  }

  const { value: rawText } = await mammoth.extractRawText({ buffer });
  const extracted = normalizeText(rawText);
  for (const canonicalValue of builder.collectCanonicalContentInventory(resume)) {
    assert.ok(
      extracted.includes(normalizeText(canonicalValue)),
      `${templateId} preserves canonical text: ${canonicalValue.slice(0, 72)}`,
    );
  }
  assert.doesNotMatch(
    extracted,
    /\b(?:undefined|null|tbd|lorem ipsum|not provided|placeholder)\b/i,
    `${templateId} does not emit placeholders`,
  );

  const contactValues = [
    resume.email,
    resume.phone,
    resume.location,
    resume.linkedin,
    resume.website,
  ].filter((value) => typeof value === 'string' && value.trim());
  let priorContactIndex = -1;
  for (const value of contactValues) {
    const index = extracted.indexOf(normalizeText(value));
    assert.ok(index > priorContactIndex, `${templateId} keeps an accessible contact-line order`);
    priorContactIndex = index;
  }

  let priorExperienceIndex = -1;
  for (const experience of resume.experience) {
    const chronologyAnchor = experience.role || experience.company || experience.achievements[0];
    if (!chronologyAnchor) continue;
    const index = extracted.indexOf(normalizeText(chronologyAnchor));
    assert.ok(index > priorExperienceIndex, `${templateId} preserves experience chronology`);
    priorExperienceIndex = index;
  }
}

test('profile map explicitly and exclusively covers the 17 curated catalog companions', () => {
  const profileIds = Object.keys(builder.CURATED_SIGNATURE_DOCX_PROFILE_MAP);
  assert.deepEqual(profileIds, expectedIds);
  assert.equal(Object.isFrozen(builder.CURATED_SIGNATURE_DOCX_PROFILE_MAP), true);
  assert.deepEqual([...catalog.NEW_SIGNATURE_TEMPLATE_IDS], expectedIds);

  const serializedProfiles = new Set();
  for (const id of expectedIds) {
    const profile = builder.getCuratedSignatureDocxProfile(id);
    const template = catalog.getRegisteredTemplate(id);
    assert.equal(profile.id, id);
    assert.equal(profile.linearDocxCompanionKey, `${id}:linear-docx`);
    assert.equal(profile.linearDocxCompanionKey, template.linearDocxCompanionKey);
    assert.equal(profile.linearDocxCompanionKey, template.rendererKeys.docx);
    assert.equal(template.exportProfile.docx, 'linear');
    assert.deepEqual([...profile.sectionOrder], [...template.structure.sectionOrder]);
    serializedProfiles.add(JSON.stringify(profile));
  }
  assert.equal(serializedProfiles.size, 17, 'each DOCX profile is intentional and distinct');
});

test('canonical content inventory is complete, exact, and chronological', () => {
  for (const resume of [fullResume(), sparseResume(), longResume()]) {
    assert.deepEqual(
      builder.collectCanonicalContentInventory(resume),
      expectedInventory(resume),
    );
  }

  const duplicateResume = sparseResume();
  duplicateResume.skills = [{ category: 'Repeated proof', items: ['Repeated proof'] }];
  assert.equal(
    builder.collectCanonicalContentInventory(duplicateResume)
      .filter((value) => value === 'Repeated proof').length,
    2,
    'repeated canonical values are not deduplicated',
  );
});

test('unknown curated IDs throw instead of falling back', async () => {
  assert.throws(
    () => builder.getCuratedSignatureDocxProfile('editorial-authority'),
    /Unsupported curated signature DOCX template/,
  );
  await assert.rejects(
    builder.buildCuratedSignatureDocx(fullResume(), 'unknown-template'),
    /Unsupported curated signature DOCX template/,
  );
});

test('all 17 DOCX companions preserve full, sparse, and long canonical fixtures', async () => {
  const fixtures = [fullResume(), sparseResume(), longResume()];
  for (const templateId of expectedIds) {
    for (const resume of fixtures) {
      const buffer = await builder.buildCuratedSignatureDocx(resume, templateId);
      await inspectDocx(buffer, resume, templateId);
    }
  }
});

test('all 17 DOCX companions sanitize dark-canvas text colors for a white Word page', async () => {
  const adversarialDarkPalette = {
    primary: '#ffffff',
    accent: '#ffffff',
    text: '#fefefe',
    background: '#000000',
  };

  for (const templateId of expectedIds) {
    const buffer = await builder.buildCuratedSignatureDocx(
      fullResume(),
      templateId,
      adversarialDarkPalette,
    );
    const zip = await JSZip.loadAsync(buffer);
    const [documentXml, stylesXml, numberingXml] = await Promise.all([
      zip.file('word/document.xml').async('string'),
      zip.file('word/styles.xml').async('string'),
      zip.file('word/numbering.xml').async('string'),
    ]);
    const meaningfulRunColors = [documentXml, stylesXml, numberingXml]
      .flatMap((xml) => [...xml.matchAll(/<w:color\b[^>]*\bw:val="([0-9a-f]{6})"/gi)])
      .map((match) => `#${match[1].toLowerCase()}`);
    const profile = builder.getCuratedSignatureDocxProfile(templateId);

    assert.ok(
      meaningfulRunColors.length >= 8,
      `${templateId} exposes meaningful run colors in OOXML styles`,
    );
    assert.ok(
      meaningfulRunColors.includes(profile.palette.primary.toLowerCase()),
      `${templateId} falls back to its catalog primary on Word white`,
    );
    assert.ok(
      meaningfulRunColors.includes(profile.palette.text.toLowerCase()),
      `${templateId} falls back to its catalog text on Word white`,
    );
    for (const color of meaningfulRunColors) {
      assert.notEqual(color, '#ffffff', `${templateId} does not emit white meaningful text`);
      assert.ok(
        contrastRatio(color, '#ffffff') >= 4.5,
        `${templateId} keeps ${color} meaningful text at 4.5:1 or better on Word white`,
      );
    }

    if (profile.sectionRule !== 'none') {
      assert.match(
        stylesXml,
        /<w:(?:top|bottom)\b[^>]*\bw:color="FFFFFF"/i,
        `${templateId} retains the white accent only as a decorative section rule`,
      );
    }
  }
});
