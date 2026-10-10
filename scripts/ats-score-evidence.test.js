const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-ats-'));
const outfile = path.join(directory, 'ats.cjs');
buildSync({ entryPoints: [path.join(repoRoot, 'lib/ats-score.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const { calculateATSScore, getATSProofScore } = require(outfile);
fs.rmSync(directory, { recursive: true, force: true });

function statuses(resume, jd) {
  return Object.fromEntries(calculateATSScore(resume, jd).keywords.map(item => [item.keyword.toLowerCase(), item.status]));
}

test('negative credentials and skills are not counted as affirmative matches', () => {
  const resume = 'Software Engineer. Built TypeScript and React interfaces and Node.js APIs. Used PostgreSQL and Git. No AWS certification and no Python experience.';
  const jd = 'Required: React, TypeScript, Node.js, PostgreSQL, Git. Preferred: AWS certification and Python.';
  const result = statuses(resume, jd);
  assert.equal(result.aws, 'missing');
  assert.equal(result.python, 'missing');
  assert.equal(result.react, 'matched');
  assert.equal(result.typescript, 'matched');
});

test('token boundaries distinguish Java from JavaScript and SQL from NoSQL', () => {
  const result = statuses('Built JavaScript services backed by NoSQL stores.', 'Required: Java and SQL. Preferred: JavaScript and NoSQL.');
  assert.equal(result.java, 'missing');
  assert.equal(result.sql, 'missing');
  assert.equal(result.javascript, 'matched');
  assert.equal(result.nosql, 'matched');
});

test('affirmative evidence survives an independent negative sentence', () => {
  const result = statuses('No Python experience. Built production services in Python for five years.', 'Required: Python.');
  assert.equal(result.python, 'matched');
});

test('suffix negation and punctuation remain negative', () => {
  assert.equal(statuses('AWS certification expired in 2023.', 'Required: AWS certification.')['aws certification'], 'missing');
  assert.equal(statuses('Python: no experience.', 'Required: Python.').python, 'missing');
});

test('comma clauses do not let a negation bleed into independent evidence', () => {
  const result = statuses('No Python experience, but built React applications for five years.', 'Required: Python and React.');
  assert.equal(result.python, 'missing');
  assert.equal(result.react, 'matched');
});

test('category assessment metadata marks absent categories unassessed', () => {
  const result = calculateATSScore('Built a product and collaborated with a team.', 'Required: React and Git.');
  assert.equal(result.assessment?.softSkills, 'unassessed');
  assert.equal(result.assessment?.hardSkills, 'unassessed');
  assert.equal(result.assessment?.tools, 'assessed');
  assert.equal(result.assessment?.overall, 'assessed');
});

test('job descriptions without extracted requirements mark the overall score unassessed', () => {
  const result = calculateATSScore('Built a product.', 'A role with broad responsibilities.');
  assert.equal(result.assessment?.overall, 'unassessed');
});

test('experience relevance does not average an absent certification category as neutral 70', () => {
  const result = calculateATSScore('A general resume with no matching evidence.', 'Required: 3 years experience in software engineering.');
  assert.equal(result.assessment?.experienceRelevance, 'assessed');
  assert.equal(result.breakdown.experienceRelevance, 0);
});

test('ATS proof score is null when overall coverage is unassessed', () => {
  assert.equal(getATSProofScore({ overallScore: 70, assessment: { overall: 'unassessed' } }), null);
  assert.equal(getATSProofScore({ overallScore: 70, assessment: { overall: 'assessed' } }), 70);
});
