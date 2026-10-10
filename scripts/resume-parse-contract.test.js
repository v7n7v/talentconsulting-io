const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { build } = require('esbuild');

const compiledPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'resume-contract-')), 'module.cjs');
const compiled = build({ entryPoints: [path.join(__dirname, '../lib/resume-parse-contract.ts')], outfile: compiledPath, bundle: true, format: 'cjs', platform: 'node', logLevel: 'silent' }).then(() => require(compiledPath));
const base = { isResume: true, name: 'Amina Noor', title: 'Engineer', email: '', phone: '', location: '', linkedin: '', website: '', summary: '', experience: [{ company: 'Northstar', role: 'Engineer', duration: '2020-2023', achievements: ['Reduced latency 20%'] }], education: [], skills: [{ category: 'Systems', items: ['Linux'] }], certifications: [], projects: [], languages: [], awards: [], volunteering: [], publications: [], links: [] };

test('runtime contract rejects empty or unclassified model output', async () => {
  const { validateResumeParseOutput } = await compiled;
  assert.throws(() => validateResumeParseOutput({}, 'Amina'));
  assert.throws(() => validateResumeParseOutput({ isResume: true }, 'Amina'));
});

test('contract accepts sparse records and flags claims absent from source', async () => {
  const { validateResumeParseOutput, findUnsupportedClaims } = await compiled;
  const record = validateResumeParseOutput(base, 'Amina Noor\nEngineer at Northstar\nLinux');
  assert.equal(record.isResume, true);
  const warnings = findUnsupportedClaims(record, 'Amina Noor\nEngineer at Northstar\nLinux');
  assert.ok(warnings.some(warning => warning.field.includes('achievements')));
});

test('source hash is stable for receipt comparison', async () => {
  const { makeSourceHash } = await compiled;
  assert.equal(makeSourceHash('same'), makeSourceHash('same'));
  assert.notEqual(makeSourceHash('same'), makeSourceHash('changed'));
});

test('invented metrics and changed negation are review warnings', async () => {
  const { validateResumeParseOutput, findUnsupportedClaims } = await compiled;
  const metric = validateResumeParseOutput({ ...base, experience: [{ ...base.experience[0], achievements: ['Increased revenue 90%'] }] }, 'Amina Noor\nEngineer at Northstar\nDid not increase revenue');
  const warnings = findUnsupportedClaims(metric, 'Amina Noor\nEngineer at Northstar\nDid not increase revenue');
  assert.ok(warnings.some(warning => warning.field.includes('achievements')));
});

test('evidence spans must match the immutable source', async () => {
  const { validateResumeParseOutput } = await compiled;
  assert.throws(() => validateResumeParseOutput({ ...base, evidence: [{ field: 'name', value: 'Invented', start: 0, end: 8 }] }, 'Amina Noor'));
});
