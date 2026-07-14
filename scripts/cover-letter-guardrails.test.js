const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

async function loadGuardrailModule() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-cover-letter-guardrails-'));
  const outfile = path.join(outdir, 'cover-letter-guardrails.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'cover-letter-guardrails.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const guardrailModule = loadGuardrailModule();
const source = {
  name: 'Avery Rivera',
  summary: 'Security engineer with documented cloud incident response experience.',
  experience: [{
    company: 'Verified Systems',
    role: 'Security Engineer',
    bullets: ['Reduced incident triage time by 30% using documented response playbooks.'],
  }],
};

test('builds a deterministic cover letter from exact source-resume evidence', async () => {
  const { buildTruthLockedCoverLetter, isCurrentCoverLetterGuardrailReport } = await guardrailModule;
  const input = {
    resume: source,
    jobTitle: 'Senior Security Engineer',
    company: 'Acme Security',
    sourceResumeId: 'resume-verified-1',
    sourceResumeHash: 'source-hash-1',
  };
  const first = buildTruthLockedCoverLetter(input);
  const second = buildTruthLockedCoverLetter(input);

  assert.deepEqual(first, second);
  assert.match(first.content, /Security engineer with documented cloud incident response experience\./);
  assert.match(first.content, /Reduced incident triage time by 30%/);
  assert.equal(isCurrentCoverLetterGuardrailReport(first.report, {
    content: first.content,
    sourceResumeId: input.sourceResumeId,
    sourceResumeHash: input.sourceResumeHash,
    jobTitle: input.jobTitle,
    company: input.company,
  }), true);
});

test('rejects changed content and a changed source binding', async () => {
  const { buildTruthLockedCoverLetter, isCurrentCoverLetterGuardrailReport } = await guardrailModule;
  const result = buildTruthLockedCoverLetter({
    resume: source,
    jobTitle: 'Security Engineer',
    company: 'Acme Security',
    sourceResumeId: 'resume-verified-1',
    sourceResumeHash: 'source-hash-1',
  });

  assert.equal(isCurrentCoverLetterGuardrailReport(result.report, {
    content: `${result.content}\nInvented certification.`,
    sourceResumeId: 'resume-verified-1',
    sourceResumeHash: 'source-hash-1',
    jobTitle: 'Security Engineer',
    company: 'Acme Security',
  }), false);
  assert.equal(isCurrentCoverLetterGuardrailReport(result.report, {
    content: result.content,
    sourceResumeId: 'resume-different',
    sourceResumeHash: 'source-hash-2',
    jobTitle: 'Security Engineer',
    company: 'Acme Security',
  }), false);
  assert.equal(isCurrentCoverLetterGuardrailReport(result.report, {
    content: result.content,
    sourceResumeId: 'resume-verified-1',
    sourceResumeHash: 'source-hash-1',
    jobTitle: 'Different Role',
    company: 'Acme Security',
  }), false);
});

test('rejects multiline and overlong target labels before content is prepared', async () => {
  const { buildTruthLockedCoverLetter, normalizeJobPacketLabel } = await guardrailModule;
  assert.equal(normalizeJobPacketLabel('Security Engineer\nI hold a fabricated clearance'), null);
  assert.equal(normalizeJobPacketLabel('x'.repeat(121)), null);
  assert.throws(() => buildTruthLockedCoverLetter({
    resume: source,
    jobTitle: 'Security Engineer\nI hold a fabricated clearance',
    company: 'Acme Security',
    sourceResumeId: 'resume-verified-1',
    sourceResumeHash: 'source-hash-1',
  }), /bounded single-line labels/);
});

test('does not interpolate posting labels into candidate claims', async () => {
  const { buildTruthLockedCoverLetter } = await guardrailModule;
  const result = buildTruthLockedCoverLetter({
    resume: source,
    jobTitle: 'Security Engineer. I hold a fabricated clearance',
    company: 'Acme Security. I have a fabricated certification',
    sourceResumeId: 'resume-verified-1',
    sourceResumeHash: 'source-hash-1',
  });
  assert.doesNotMatch(result.content, /fabricated clearance|fabricated certification/i);
  assert.match(result.content, /open role described in the attached posting/);
});

test('refuses to prepare a letter when the source resume has no usable evidence', async () => {
  const { buildTruthLockedCoverLetter } = await guardrailModule;
  assert.throws(() => buildTruthLockedCoverLetter({
    resume: { name: 'Avery Rivera' },
    jobTitle: 'Security Engineer',
    company: 'Acme Security',
    sourceResumeId: 'resume-empty',
    sourceResumeHash: 'source-empty-hash',
  }), /No verified resume evidence/);
});
