const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const result = buildSync({
  absWorkingDir: root,
  entryPoints: ['lib/interview-context.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});
const compiled = new Module(path.join(root, 'interview-context-test.cjs'), module);
compiled.filename = path.join(root, 'interview-context-test.cjs');
compiled.paths = Module._nodeModulePaths(root);
compiled._compile(result.outputFiles[0].text, compiled.filename);
const context = compiled.exports;

test('application links reject oversized ids while preserving ordinary ids', () => {
  assert.equal(context.requestedInterviewApplicationId(' app-123 '), 'app-123');
  assert.equal(context.requestedInterviewApplicationId(''), null);
  assert.equal(context.requestedInterviewApplicationId('x'.repeat(201)), null);
});

test('application context carries company, role, job description, and selected source resume', () => {
  assert.deepEqual(context.interviewContextFromApplication({
    id: 'app-123',
    company_name: 'Northstar Labs',
    job_title: 'Product Manager',
    job_description: 'Build the roadmap.',
    resume_version_id: 'resume-9',
  }), {
    applicationId: 'app-123',
    company: 'Northstar Labs',
    role: 'Product Manager',
    jobDescription: 'Build the roadmap.',
    resumeVersionId: 'resume-9',
  });
});
