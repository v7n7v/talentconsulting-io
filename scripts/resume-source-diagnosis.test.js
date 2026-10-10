const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/resume-source-diagnosis.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const sandbox = { exports: {}, require: () => ({}) };
vm.runInNewContext(compiled, sandbox);
const { deriveSourceDiagnosis } = sandbox.exports;

const resume = overrides => ({
  name: 'Rae Example', title: 'Designer', email: 'rae@example.com', phone: '', location: '', summary: '',
  experience: [{ role: 'Designer', company: 'Studio', duration: '2020–2024', achievements: [] }],
  education: [], skills: [{ category: 'Tools', items: ['Figma', 'Figma', 'Research'] }],
  ...overrides,
});

test('parsed resume reports observed counts and incomplete sections without blocking status', () => {
  const result = deriveSourceDiagnosis({ resume: resume({}), warnings: ['One line was skipped.'] });
  assert.equal(result.status, 'parsed');
  assert.equal(result.roleCount, 1);
  assert.equal(result.skillCount, 2);
  assert.deepEqual(Array.from(result.missing), ['Phone', 'Education']);
  assert.deepEqual(Array.from(result.warnings), ['One line was skipped.']);
});

test('partial parse remains useful and flags absent contact and work history', () => {
  const result = deriveSourceDiagnosis({ resume: resume({ name: '', email: '', experience: [], skills: [] }) });
  assert.equal(result.status, 'parsed');
  assert.deepEqual(Array.from(result.missing), ['Name', 'Email', 'Phone', 'Experience', 'Education']);
  assert.equal(result.roleCount, 0);
  assert.equal(result.skillCount, 0);
});

test('unreadable source gives retry guidance without claiming a scan was detected', () => {
  const result = deriveSourceDiagnosis({ resume: null, error: 'Unsupported document.' });
  assert.equal(result.status, 'failed');
  assert.match(result.message, /another file or paste/);
  assert.doesNotMatch(result.message, /scan|image/i);
  assert.deepEqual(Array.from(result.missing), []);
});

test('structuring failure with extracted text says the text is retained for review', () => {
  const result = deriveSourceDiagnosis({ resume: null, rawText: 'Rae Example\nDesigner\nStudio, 2020–2024', error: 'Quota blocked structuring.' });
  assert.equal(result.status, 'failed');
  assert.equal(result.hasReadableText, true);
  assert.equal(result.statusLabel, 'Text extracted; structuring unavailable');
  assert.match(result.message, /Text was extracted and is retained below/);
  assert.match(result.message, /review or edit/);
  assert.doesNotMatch(result.message, /could not be read|scanned image/i);
});

test('processing takes precedence while preserving parser warnings', () => {
  const result = deriveSourceDiagnosis({ resume: null, error: 'temporary', isProcessing: true, warnings: ['Earlier parser note'] });
  assert.equal(result.status, 'processing');
  assert.deepEqual(Array.from(result.warnings), ['Earlier parser note']);
});
