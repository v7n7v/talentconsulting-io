const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

function loadGuardrails() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-resume-morph-guardrails-'));
  const outfile = path.join(outdir, 'resume-morph-guardrails.cjs');

  buildSync({
    entryPoints: [path.join(__dirname, '..', 'lib', 'resume-morph-guardrails.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });

  return require(outfile);
}

const {
  applyResumeMorphGuardrails,
  resolveResumeMorphAccess,
  RESUME_MORPH_PROTECTED_CONTRACT,
  RESUME_MORPH_PROTECTED_CONTRACT_HASH,
} = loadGuardrails();

test('protected contract fingerprint changes only through an intentional snapshot update', () => {
  const actualHash = createHash('sha256')
    .update(JSON.stringify(RESUME_MORPH_PROTECTED_CONTRACT))
    .digest('hex');
  assert.equal(actualHash, RESUME_MORPH_PROTECTED_CONTRACT_HASH);
});

test('large guardrail reports preserve the true total and mark evidence as truncated', () => {
  const original = { name: 'Amina Smith' };
  const attempted = { name: 'Amina Smith' };
  for (let index = 0; index < 150; index += 1) {
    attempted[`inventedField${index}`] = `Invented claim ${index}`;
  }

  const guarded = applyResumeMorphGuardrails(original, attempted, access());

  assert.equal(guarded.report.blockedChanges.length, 100);
  assert.equal(guarded.report.blockedChangeCount, 150);
  assert.equal(guarded.report.blockedChangesTruncated, true);
});

function access() {
  return resolveResumeMorphAccess({ requestedMorphPercentage: 80, hasFullConsent: false, mode: 'automated' });
}

test('guardrails keep education and skills exactly as supplied', () => {
  const original = {
    name: 'Alula Gebreegziabher',
    skills: ['NIST', 'LTE'],
    education: [{ degree: 'BS Cybersecurity', institution: 'Real University', year: '2022' }],
    experience: [],
  };
  const attempted = {
    ...original,
    skills: ['NIST', 'LTE', 'Kubernetes'],
    education: [{ degree: 'MS Computer Science', institution: 'Invented University', year: '2024' }],
  };

  const guarded = applyResumeMorphGuardrails(original, attempted, access());

  assert.deepEqual(guarded.resume.skills, original.skills);
  assert.deepEqual(guarded.resume.education, original.education);
  assert.ok(guarded.report.blockedChangeCount >= 2);
});

test('guardrails restore prose that introduces an unsupported metric', () => {
  const original = {
    summary: 'Wireless engineer who improved network reliability.',
    skills: ['LTE'],
    experience: [{ company: 'CityNet', role: 'Engineer', bullets: ['Improved network reliability across regional sites.'] }],
  };
  const attempted = {
    ...original,
    summary: 'Wireless engineer who improved network reliability by 47%.',
    experience: [{ company: 'CityNet', role: 'Engineer', bullets: ['Improved network reliability by 47% across 22 sites.'] }],
  };

  const guarded = applyResumeMorphGuardrails(original, attempted, access());

  assert.equal(guarded.resume.summary, original.summary);
  assert.deepEqual(guarded.resume.experience[0].bullets, original.experience[0].bullets);
  assert.ok(guarded.report.blockedChanges.some((change) => change.path === 'summary'));
});

test('guardrails keep existing metrics attached to their original claim and role', () => {
  const original = {
    summary: 'Reduced launch delays by 31%.',
    skills: ['SQL'],
    experience: [{ company: 'Acme', role: 'Operations Lead', bullets: ['Reduced launch delays by 31%.'] }],
  };
  const attempted = {
    ...original,
    summary: 'Cut launch delays by 31%.',
    experience: [{ company: 'Acme', role: 'Operations Lead', bullets: ['Reduced launch delays by 44%.'] }],
  };

  const guarded = applyResumeMorphGuardrails(original, attempted, access());

  assert.equal(guarded.resume.summary, original.summary);
  assert.deepEqual(guarded.resume.experience[0].bullets, original.experience[0].bullets);
});

test('guardrails reject qualitative skill and achievement inventions in prose', () => {
  const original = {
    summary: 'Security analyst focused on incident response.',
    skills: ['Incident response'],
    experience: [{
      company: 'Acme',
      role: 'Security Analyst',
      achievements: ['Reviewed alerts and documented incidents.'],
    }],
  };
  const attempted = {
    ...original,
    summary: 'Security analyst with Kubernetes and cloud architecture expertise.',
    experience: [{
      company: 'Acme',
      role: 'Security Analyst',
      achievements: ['Led a company-wide zero trust transformation.'],
    }],
  };

  const guarded = applyResumeMorphGuardrails(original, attempted, access());

  assert.equal(guarded.resume.summary, original.summary);
  assert.deepEqual(guarded.resume.experience[0].achievements, original.experience[0].achievements);
  assert.equal(guarded.resume.summary.includes('Kubernetes'), false);
});

test('guardrails preserve useful rewrites assembled only from source evidence', () => {
  const original = {
    summary: 'Security analyst focused on incident response. Documents investigations clearly.',
    skills: ['Incident response'],
    experience: [{
      company: 'Acme',
      role: 'Security Analyst',
      bullets: [
        'Reviewed alerts and documented incidents.',
        'Maintained incident records for the team.',
      ],
    }],
  };
  const attempted = {
    ...original,
    summary: 'Documents investigations clearly. Security analyst focused on incident response.',
    experience: [{
      company: 'Acme',
      role: 'Security Analyst',
      bullets: [
        'Maintained incident records for the team.',
        'Reviewed alerts and documented incidents.',
      ],
    }],
  };

  const guarded = applyResumeMorphGuardrails(original, attempted, access());

  assert.equal(guarded.resume.summary, attempted.summary);
  assert.deepEqual(guarded.resume.experience[0].bullets, attempted.experience[0].bullets);
  assert.equal(guarded.report.blockedChangeCount, 0);
});

test('guardrails reject negation removal and same-token claim recombination', () => {
  const original = {
    summary: 'Never managed security budgets. Reviewed security alerts.',
    experience: [{
      company: 'Acme',
      role: 'Security Analyst',
      bullets: ['Supported managers. Reviewed budgets for formatting errors.'],
    }],
  };
  const attempted = {
    ...original,
    summary: 'Managed security budgets. Reviewed security alerts.',
    experience: [{
      company: 'Acme',
      role: 'Security Analyst',
      bullets: ['Managed security budgets. Reviewed formatting errors.'],
    }],
  };

  const guarded = applyResumeMorphGuardrails(original, attempted, access());

  assert.equal(guarded.resume.summary, original.summary);
  assert.deepEqual(guarded.resume.experience[0].bullets, original.experience[0].bullets);
  assert.ok(guarded.report.blockedChangeCount >= 2);
});
