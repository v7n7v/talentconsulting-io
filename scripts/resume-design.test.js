const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const root = path.resolve(__dirname, '..');
const resume = {
  name: 'Jordan Example', title: 'Staff Engineer', email: 'jordan@example.test', phone: '555-0100',
  location: 'Boston, MA', linkedin: 'linkedin.test/jordan', website: 'jordan.test', links: ['code.test/jordan'],
  summary: 'Builds durable systems.',
  experience: [
    { id: 'role-a', company: 'Northstar', role: 'Staff Engineer', duration: '2022–2025', achievements: ['Cut latency by 35%.', 'Led platform migration.'] },
    { id: 'role-b', company: 'Fieldwork', role: 'Engineer', duration: '2019–2022', achievements: ['Built search.'] },
  ],
  education: [{ id: 'edu-a', degree: 'BS Computer Science', institution: 'State University', year: '2019', details: 'Honors' }],
  skills: [{ id: 'skill-a', category: 'Languages', items: ['TypeScript', 'Go'] }],
  certifications: ['Cloud Architect'],
  additionalSections: [
    { id: 'same', title: 'Projects', items: ['Migration toolkit', 'Search service'] },
    { id: 'same', title: 'Volunteer Service', items: ['Mentored students'] },
    { id: 'pubs', title: 'Publications', items: ['A useful paper'] },
  ],
};

async function loadDesign() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-resume-design-'));
  const outfile = path.join(dir, 'design.cjs');
  await build({
    entryPoints: [path.join(root, 'lib/resume-design/index.ts')], outfile, bundle: true,
    platform: 'node', format: 'cjs', logLevel: 'silent', alias: { '@': root },
  });
  const result = require(outfile);
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

const designPromise = loadDesign();

test('all twenty version 2 presets create readable designs with stable IDs', async () => {
  const { RESUME_DESIGN_PRESETS, createResumeDesign } = await designPromise;
  assert.equal(Object.keys(RESUME_DESIGN_PRESETS).length, 20);
  for (const id of Object.keys(RESUME_DESIGN_PRESETS)) {
    const design = createResumeDesign(id, resume);
    assert.equal(design.templateId, id);
    assert.ok(design.typography.bodySize >= 10, `${id} body default should remain readable`);
    assert.ok(design.sections.some(section => section.id === 'experience'));
  }
});

test('normalization clamps finite settings, rejects malformed values, and preserves valid roles', async () => {
  const { createResumeDesign, normalizeResumeDesign } = await designPromise;
  const input = createResumeDesign('technical-signal', resume);
  input.typography.bodySize = Infinity;
  input.typography.lineHeight = -5;
  input.layout.railWidth = 500;
  input.layout.margins.top = NaN;
  input.layout.sectionGap = 1000;
  input.colors.ink = 'papaya';
  input.sections[0].region = 'unknown';
  const normalized = normalizeResumeDesign(input, input.templateId, resume);
  assert.equal(normalized.typography.bodySize, 10.5);
  assert.equal(normalized.typography.bodyWeight, 400);
  assert.equal(normalized.typography.headingWeight, 700);
  assert.equal(normalized.typography.roleSize, 10.5);
  assert.equal(normalized.typography.lineHeight, 1);
  assert.equal(normalized.layout.railWidth, 45);
  assert.equal(normalized.layout.margins.top, 16);
  assert.equal(normalized.layout.sectionGap, 30);
  assert.match(normalized.colors.ink, /^#[0-9a-f]{6}$/);
  assert.ok(Number.isFinite(normalized.typography.bodySize));
});

test('legacy, null, and future renderer records do not load as version 2', async () => {
  const { createResumeDesign, readResumeDesign } = await designPromise;
  const valid = createResumeDesign('technical-signal', resume);
  assert.equal(readResumeDesign(null), null);
  assert.equal(readResumeDesign({ templateId: 'technical-signal' }), null);
  assert.equal(readResumeDesign({ ...valid, rendererVersion: 999 }), null);
  assert.equal(readResumeDesign({ ...valid, schemaVersion: 2 }), null);
  assert.equal(readResumeDesign(valid, resume).templateId, 'technical-signal');
  const olderDraft = structuredClone(valid);
  delete olderDraft.typography.bodyWeight;
  delete olderDraft.typography.headingWeight;
  delete olderDraft.typography.roleSize;
  const normalizedOlder = readResumeDesign(olderDraft, resume);
  assert.equal(normalizedOlder.typography.bodyWeight, 400);
  assert.equal(normalizedOlder.typography.headingWeight, 700);
  assert.equal(normalizedOlder.typography.roleSize, 10.5);
});

test('document plan maps source fields, contact details, and achievements to their originating role', async () => {
  const { buildResumeDocumentPlan, createResumeDesign } = await designPromise;
  const plan = buildResumeDocumentPlan(resume, createResumeDesign('technical-signal', resume));
  assert.equal(plan.name, resume.name);
  assert.equal(plan.title, resume.title);
  assert.deepEqual(plan.contact, [resume.email, resume.phone, resume.location, resume.linkedin, resume.website, ...resume.links]);
  const experience = plan.sections.find(section => section.kind === 'experience');
  assert.equal(experience.entries[0].id, 'experience:role-a');
  assert.equal(experience.entries[0].title, 'Staff Engineer');
  assert.equal(experience.entries[0].subtitle, 'Northstar');
  assert.deepEqual(experience.entries[0].bullets, resume.experience[0].achievements);
  assert.equal(experience.entries[1].subtitle, 'Fieldwork');
  assert.equal(plan.sections.find(section => section.kind === 'education').entries[0].text, 'Honors');
  assert.equal(plan.sections.find(section => section.kind === 'skills').entries[0].text, 'TypeScript, Go');
  assert.ok(plan.sections.some(section => section.kind === 'certifications'));
});

test('hidden sections remain recoverable and excluded inventory is explicit', async () => {
  const { buildResumeDocumentPlan, createResumeDesign, normalizeResumeDesign } = await designPromise;
  const config = createResumeDesign('technical-signal', resume);
  const hidden = normalizeResumeDesign({ ...config, sections: config.sections.map(section => section.id === 'experience' ? { ...section, visible: false, title: 'Career record' } : section) }, config.templateId, resume);
  const plan = buildResumeDocumentPlan(resume, hidden);
  assert.ok(!plan.sections.some(section => section.id === 'experience'));
  assert.deepEqual(plan.excluded, ['Career record']);
  assert.equal(plan.source.experience[0].achievements[0], 'Cut latency by 35%.');
  assert.equal(resume.experience.length, 2);
});

test('additional sections preserve duplicate IDs with distinct stable references and configured order', async () => {
  const { buildResumeDocumentPlan, createResumeDesign } = await designPromise;
  const design = createResumeDesign('technical-signal', resume);
  const extras = design.sections.filter(section => section.id.startsWith('additional:'));
  assert.equal(extras.length, 3);
  assert.equal(new Set(extras.map(section => section.id)).size, 3);
  const reordered = { ...design, sections: [...design.sections].reverse() };
  const plan = buildResumeDocumentPlan(resume, reordered);
  const additional = plan.sections.filter(section => section.kind === 'additional');
  assert.deepEqual(additional.map(section => section.title), ['Publications', 'Volunteer Service', 'Projects']);
  assert.deepEqual(additional[1].entries.map(entry => entry.text), ['Mentored students']);
  assert.deepEqual(additional[2].entries.map(entry => entry.text), ['Migration toolkit', 'Search service']);
});

test('section typography overrides survive normalization and attach to the planned section', async () => {
  const { buildResumeDocumentPlan, createResumeDesign, normalizeResumeDesign } = await designPromise;
  const design = createResumeDesign('technical-signal', resume);
  const changed = normalizeResumeDesign({ ...design, sections: design.sections.map(section => section.id === 'experience' ? { ...section, typography: { bodySize: 9.5, headingSize: 15, bodyWeight: 700, headingWeight: 400, roleSize: 13 } } : section) }, design.templateId, resume);
  const section = buildResumeDocumentPlan(resume, changed).sections.find(item => item.id === 'experience');
  assert.equal(section.typography.bodySize, 9.5);
  assert.equal(section.typography.headingSize, 15);
  assert.equal(section.typography.bodyWeight, 700);
  assert.equal(section.typography.headingWeight, 400);
  assert.equal(section.typography.roleSize, 13);
});

test('template switching carries hidden sections, custom titles, style, and sensible type defaults', async () => {
  const { createResumeDesign, switchResumeDesignTemplate } = await designPromise;
  const old = createResumeDesign('technical-signal', resume);
  old.sections = old.sections.map(section => section.id === 'experience' ? { ...section, visible: false, title: 'Selected career history' } : section);
  old.typography.bodySize = 11.25;
  const switched = switchResumeDesignTemplate(old, 'editorial-authority', resume, true);
  const experience = switched.sections.find(section => section.id === 'experience');
  assert.equal(experience.visible, false);
  assert.equal(experience.title, 'Selected career history');
  assert.equal(switched.typography.bodySize, 11.25);
  assert.ok(switched.typography.bodySize >= 10);
  assert.equal(switched.layout.columns, 2);
});

test('all six font families have bundled assets and a redistribution license', async () => {
  const { RESUME_FONTS } = await designPromise;
  const licenseFiles = ['Inter-LICENSE.txt', 'Liberation-LICENSE.txt', 'DejaVu-LICENSE.txt'];
  for (const filename of licenseFiles) assert.ok(fs.statSync(path.join(root, 'public/fonts/resume', filename)).isFile());
  for (const font of RESUME_FONTS) {
    assert.ok(fs.statSync(path.join(root, 'public/fonts/resume', `${font.file}-Regular.ttf`)).isFile(), `${font.label} regular asset`);
    assert.ok(fs.statSync(path.join(root, 'public/fonts/resume', `${font.file}-Bold.ttf`)).isFile(), `${font.label} bold asset`);
  }
});

test('design signature changes when presentation changes with identical source content', async () => {
  const { createResumeDesign, resumeDesignSignature } = await designPromise;
  const first = createResumeDesign('technical-signal', resume);
  const second = { ...first, typography: { ...first.typography, bodySize: 12 } };
  assert.notEqual(resumeDesignSignature(resume, first.templateId, first.colors, first.pageSize, first), resumeDesignSignature(resume, second.templateId, second.colors, second.pageSize, second));
});


test('clearing a section override restores inheritance for later global changes', async () => {
  const { createResumeDesign, normalizeResumeDesign, buildResumeDocumentPlan } = await designPromise;
  const config = createResumeDesign('technical-signal', resume);
  config.sections.find(section => section.id === 'experience').typography = { bodySize: undefined, headingFont: undefined, lineHeight: undefined };
  const normalized = normalizeResumeDesign(config, config.templateId, resume);
  assert.equal(normalized.sections.find(section => section.id === 'experience').typography, undefined);
  normalized.typography.bodySize = 12;
  assert.equal(buildResumeDocumentPlan(resume, normalized).design.typography.bodySize, 12);
});
