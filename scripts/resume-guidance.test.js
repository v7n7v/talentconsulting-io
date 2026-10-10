const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');

let adapter;
let contextKey;
test.before(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-resume-guidance-'));
  const outfile = path.join(directory, 'adapter.cjs');
  await build({ entryPoints: [path.join(__dirname, '../lib/resume-guidance.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  const module = require(outfile);
  adapter = module.createResumeGuidance;
  contextKey = module.resumeGuidanceContext;
  fs.rmSync(directory, { recursive: true, force: true });
});
const base = { contextKey: 'document:1', section: 'source', start: true, confirming: false, editing: false, reviewing: false,
  hasSource: false, hasJob: false, pending: false, sourceError: false, hasCandidate: false, stale: false, reviewRequired: false, templateAllowed: true };
const chapter = (config, id) => config.chapters.find(item => item.id === id);
const step = (config, chapterId, id) => chapter(config, chapterId).steps.find(item => item.id === id);

test('new documents start with content, not missing generated work', () => {
  const config = adapter(base);
  assert.equal(config.preferredChapterId, 'source');
  assert.equal(chapter(config, 'confirm').availability, 'waiting');
  assert.equal(chapter(config, 'review').availability, 'waiting');
  assert.equal(step(config, 'shape', 'generate').availability, 'blocked');
});
test('confirmation uses actual import state and never claims saved work', () => {
  const config = adapter({ ...base, confirming: true, start: false });
  assert.equal(config.preferredChapterId, 'confirm');
  assert.equal(chapter(config, 'confirm').availability, 'available');
  assert.equal(step(config, 'confirm', 'source-confirm').anchor, 'resume-source-confirm');
  assert.doesNotMatch(step(config, 'confirm', 'source-confirm').description, /already saved|saved to your account/i);
});
test('pending and failed intake keep honest recovery', () => {
  const pending = adapter({ ...base, pending: true });
  assert.equal(chapter(pending, 'source').availability, 'waiting');
  assert.match(chapter(pending, 'source').unavailableReason, /still processing/);
  const failure = adapter({ ...base, sourceError: true });
  assert.match(chapter(failure, 'source').description, /did not finish/);
});
test('a review requirement does not pretend review UI is open', () => {
  const config = adapter({ ...base, start: false, section: 'shape', hasSource: true, hasJob: true, hasCandidate: true, reviewRequired: true });
  assert.equal(config.preferredChapterId, 'shape');
  assert.equal(chapter(config, 'review').availability, 'waiting');
  assert.equal(step(config, 'shape', 'open-review').availability, 'available');
  const opened = adapter({ ...base, start: false, section: 'shape', reviewing: true, hasCandidate: true });
  assert.equal(opened.preferredChapterId, 'review');
});
test('stale work never becomes a fresh export through guidance', () => {
  const config = adapter({ ...base, start: false, section: 'ship', hasSource: true, hasCandidate: true, stale: true });
  assert.equal(step(config, 'ship', 'export').availability, 'stale');
  assert.equal(step(config, 'ship', 'save').availability, 'stale');
});
test('required review and unavailable template retain their boundaries', () => {
  const config = adapter({ ...base, start: false, section: 'ship', reviewRequired: true, templateAllowed: false });
  assert.equal(step(config, 'ship', 'save').availability, 'blocked');
  assert.equal(step(config, 'design', 'design-next').availability, 'blocked');
});
test('configuration is observational data with no executable actions', () => {
  const config = adapter({ ...base, contextKey: 'owned-document:revision2' });
  const visit = value => {
    assert.notEqual(typeof value, 'function');
    if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(config);
  assert.equal(config.contextKey, 'owned-document:revision2');
  assert.equal(new Set(config.chapters.map(item => item.id)).size, config.chapters.length);
});
test('replacing a locally imported source invalidates guidance identity', () => {
  const before = contextKey(null, null, 'source-a', 1);
  const replacement = contextKey(null, null, 'source-b', 1);
  assert.notEqual(before, replacement);
  assert.equal(before, contextKey(null, null, 'source-a', 1));
});
test('career details retain their separate optional story', () => {
  const config = adapter({ ...base, careerDetails: true, start: false });
  assert.equal(config.preferredChapterId, 'career');
  assert.match(chapter(config, 'career').steps[0].description, /separate from your existing resume/);
  assert.equal(chapter(config, 'career').steps[1].anchor, 'experience-save');
});
