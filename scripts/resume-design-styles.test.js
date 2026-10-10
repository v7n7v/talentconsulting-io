const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const root = path.resolve(__dirname, '..');
const resume = {
  name: 'Private Candidate', title: 'Research Lead', email: 'private@example.test', phone: '555-0101', location: 'Chicago',
  summary: 'Source details should not be saved with a style.', experience: [{ id: 'private-role-id', company: 'Private Employer', role: 'Research Lead', duration: '2022–2025', achievements: ['Confidential outcome'] }],
  education: [], skills: [], certifications: [], additionalSections: [{ id: 'private-project-id', title: 'Private Projects', items: ['Private item'] }],
};

async function loadStyles() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-resume-design-styles-'));
  const outfile = path.join(dir, 'styles.cjs');
  await build({ entryPoints: [path.join(root, 'lib/resume-design/styles.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', alias: { '@': root } });
  const result = require(outfile);
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

const styleApi = loadStyles();

test('style serialization roundtrips bounded style-only design tokens without résumé content', async () => {
  const { createResumeDesignStyle, readResumeDesignStyles, serializeResumeDesignStyles } = await styleApi;
  // The resolver is loaded from the same source bundle for a repository-local, alias-aware test harness.
  const designBuild = await build({ entryPoints: [path.join(root, 'lib/resume-design/index.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent', alias: { '@': root } });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', designBuild.outputFiles[0].text)(mod, mod.exports, require);
  const design = mod.exports.createResumeDesign('technical-signal', resume);
  const saved = createResumeDesignStyle('Clear editorial', design, 'saved-1');
  const serialized = serializeResumeDesignStyles([saved]);
  const loaded = readResumeDesignStyles(serialized);
  assert.equal(loaded.error, null);
  assert.deepEqual(loaded.record.styles, [saved]);
  const oldStyle = structuredClone(saved);
  delete oldStyle.design.typography.roleSize;
  delete oldStyle.design.typography.bodyWeight;
  delete oldStyle.design.typography.headingWeight;
  assert.equal(readResumeDesignStyles(JSON.stringify({ version: 1, styles: [oldStyle] })).error, null);
  for (const privateValue of ['Private Candidate', 'private@example.test', 'private-role-id', 'Private Employer', 'Confidential outcome', 'private-project-id', 'Private item']) assert.equal(serialized.includes(privateValue), false);
  assert.deepEqual(Object.keys(saved.design).sort(), ['colors', 'continuationHeader', 'layout', 'pageSize', 'typography']);
});

test('reader rejects null, malformed JSON, unsupported versions, invalid font IDs, and content-bearing fields', async () => {
  const { createResumeDesignStyle, readResumeDesignStyles } = await styleApi;
  const built = await build({ entryPoints: [path.join(root, 'lib/resume-design/index.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent', alias: { '@': root } });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', built.outputFiles[0].text)(mod, mod.exports, require);
  const style = createResumeDesignStyle('Calm', mod.exports.createResumeDesign('technical-signal', resume), 'id-1');
  assert.equal(readResumeDesignStyles(null).record.styles.length, 0);
  assert.ok(readResumeDesignStyles('{broken').error);
  assert.match(readResumeDesignStyles(JSON.stringify({ version: 2, styles: [] })).error, /unsupported|invalid/i);
  const invalidFont = structuredClone(style);
  invalidFont.design.typography.bodyFont = 'system-ui';
  assert.ok(readResumeDesignStyles(JSON.stringify({ version: 1, styles: [invalidFont] })).error);
  const withContent = { ...style, design: { ...style.design, resumeName: 'private' } };
  assert.ok(readResumeDesignStyles(JSON.stringify({ version: 1, styles: [withContent] })).error);
});

test('style list is bounded to twenty and names require explicit replacement', async () => {
  const { addResumeDesignStyle, createResumeDesignStyle, readResumeDesignStyles, serializeResumeDesignStyles, MAX_RESUME_DESIGN_STYLES } = await styleApi;
  const built = await build({ entryPoints: [path.join(root, 'lib/resume-design/index.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent', alias: { '@': root } });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', built.outputFiles[0].text)(mod, mod.exports, require);
  const design = mod.exports.createResumeDesign('technical-signal', resume);
  let styles = [];
  for (let i = 0; i < MAX_RESUME_DESIGN_STYLES; i += 1) styles = addResumeDesignStyle(styles, createResumeDesignStyle(`Style ${i}`, design, `id-${i}`)).styles;
  assert.equal(styles.length, 20);
  assert.equal(addResumeDesignStyle(styles, createResumeDesignStyle('Overflow', design, 'id-overflow')).status, 'limit');
  assert.throws(() => serializeResumeDesignStyles([...styles, createResumeDesignStyle('Overflow', design, 'id-overflow')]), /up to 20/);
  const duplicate = createResumeDesignStyle('style 0', design, 'replacement-id');
  assert.equal(addResumeDesignStyle(styles, duplicate).status, 'duplicate');
  const replaced = addResumeDesignStyle(styles, duplicate, true);
  assert.equal(replaced.status, 'replaced');
  assert.equal(replaced.styles[0].id, 'id-0');
  assert.equal(readResumeDesignStyles(serializeResumeDesignStyles(replaced.styles)).record.styles.length, 20);
});

test('storage keys isolate signed-in owners and guests use only a session namespace', async () => {
  const { getResumeDesignStylesStorageKey } = await styleApi;
  assert.notEqual(getResumeDesignStylesStorageKey('user/one'), getResumeDesignStylesStorageKey('user?one'));
  assert.match(getResumeDesignStylesStorageKey('user/one'), /user%2Fone/);
  assert.match(getResumeDesignStylesStorageKey(null), /guest-session/);
  assert.equal(getResumeDesignStylesStorageKey(null).includes('undefined'), false);
});

test('applying a style changes presentation while preserving template and all current content references', async () => {
  const { applyResumeDesignStyle, createResumeDesignStyle } = await styleApi;
  const built = await build({ entryPoints: [path.join(root, 'lib/resume-design/index.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent', alias: { '@': root } });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', built.outputFiles[0].text)(mod, mod.exports, require);
  const current = mod.exports.createResumeDesign('academic-profile', resume);
  current.sections = current.sections.map((section, index) => ({ ...section, title: `Current ${index} ${section.title}`, visible: index !== 1, region: index % 2 ? 'rail' : 'main', breakBefore: index === 2 }));
  current.breakBeforeEntries = ['experience:private-role-id', 'additional:private-project-id:0'];
  const references = { templateId: current.templateId, sections: structuredClone(current.sections), breaks: [...current.breakBeforeEntries] };
  const styleSource = mod.exports.createResumeDesign('brutalist-voltage', resume);
  styleSource.typography.bodySize = 12;
  styleSource.layout.columns = 1;
  styleSource.layout.railSide = 'left';
  const applied = applyResumeDesignStyle(current, createResumeDesignStyle('Bold', styleSource, 'bold'));
  assert.equal(applied.templateId, references.templateId);
  assert.deepEqual(applied.sections, references.sections);
  assert.deepEqual(applied.breakBeforeEntries, references.breaks);
  assert.equal(applied.typography.bodySize, 12);
  assert.equal(applied.layout.columns, 1);
  assert.equal(applied.layout.railSide, 'left');
});
