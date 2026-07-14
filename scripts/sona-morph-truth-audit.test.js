const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-morph-truth-audit-'));
const outfile = path.join(outdir, 'resume-morph-guardrails.cjs');
buildSync({
  entryPoints: [path.join(repoRoot, 'lib', 'resume-morph-guardrails.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});

const {
  applyResumeMorphGuardrails,
  isCurrentResumeMorphGuardrailReport,
  resolveResumeMorphAccess,
  RESUME_MORPH_PROTECTED_CONTRACT_HASH,
  RESUME_MORPH_VALIDATOR_VERSION,
} = require(outfile);

const EXPECTED_CONTRACT_BY_VERSION = {
  '2026-07-10.6': 'db85e84bd5c5d2aa8a3f9aaed66cd7a2b35e32e317caccb8219b8c6054a5cb42',
  '2026-07-10.7': 'db85e84bd5c5d2aa8a3f9aaed66cd7a2b35e32e317caccb8219b8c6054a5cb42',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const sourceResume = {
  name: 'Jamie Rivera',
  title: 'Security Analyst',
  headline: 'Security analyst focused on incident response',
  currentRole: 'Security Analyst',
  email: 'jamie@example.com',
  phone: '555-0100',
  location: 'Newark, NJ',
  linkedin: 'linkedin.com/in/jamie-rivera',
  website: 'jamierivera.dev',
  address: 'Newark, New Jersey',
  city: 'Newark',
  state: 'NJ',
  country: 'USA',
  summary: 'Security analyst focused on incident response and documented investigations.',
  objective: 'Grow security operations responsibly.',
  about: 'I investigate alerts and communicate findings clearly.',
  professionalSummary: 'Security analyst with verified incident-response experience.',
  profile: 'Evidence-led analyst with telecommunications experience.',
  skills: ['NIST', 'Incident Response', 'LTE'],
  certifications: ['Security+'],
  licenses: ['FCC General Radiotelephone Operator License'],
  professionalLicenses: ['FCC GROL'],
  projects: [{ name: 'Alert triage guide', description: 'Documented the team triage process.' }],
  publications: ['Regional network reliability note'],
  awards: ['Service recognition award'],
  volunteer: ['Community technology mentor'],
  languages: ['English'],
  education: [{ degree: 'B.S. Information Systems', institution: 'State University', year: '2021' }],
  experience: [{
    company: 'Verified Systems',
    role: 'Security Analyst',
    duration: '2021-2025',
    location: 'Newark, NJ',
    description: 'Investigated alerts and documented incidents.',
    summary: 'Supported incident-response operations.',
    details: 'Worked from verified runbooks.',
    achievements: ['Reduced incident response time by 20%.'],
    bullets: ['Reviewed alerts and escalated confirmed incidents.'],
    responsibilities: ['Maintained incident documentation.'],
  }],
};

function invented(caseIndex, label) {
  return `Invented ${label} ${caseIndex}`;
}

const mutationFamilies = [
  (draft, i) => Object.assign(draft, { name: invented(i, 'Candidate'), title: invented(i, 'Executive') }),
  (draft, i) => Object.assign(draft, { headline: invented(i, 'Cloud Leader'), currentRole: invented(i, 'Director') }),
  (draft, i) => Object.assign(draft, { email: `fake${i}@example.com`, phone: `555-99${i}`, location: invented(i, 'City') }),
  (draft, i) => Object.assign(draft, { linkedin: invented(i, 'LinkedIn'), website: invented(i, 'Portfolio'), address: invented(i, 'Address') }),
  (draft, i) => Object.assign(draft, { summary: invented(i, 'CISSP cloud transformation leader') }),
  (draft, i) => Object.assign(draft, { objective: invented(i, 'zero trust objective'), about: invented(i, 'Kubernetes expert') }),
  (draft, i) => Object.assign(draft, { professionalSummary: invented(i, 'federal security leader'), profile: invented(i, 'clearance holder') }),
  (draft, i) => { draft.skills = [...draft.skills, invented(i, 'Skill')]; },
  (draft, i) => { draft.education = [{ degree: invented(i, 'Degree'), institution: invented(i, 'University'), year: '2026' }]; },
  (draft, i) => Object.assign(draft, { certifications: [invented(i, 'CISSP')], licenses: [invented(i, 'License')], professionalLicenses: [invented(i, 'Credential')] }),
  (draft, i) => { draft.projects = [{ name: invented(i, 'Project'), description: invented(i, 'Project result') }]; },
  (draft, i) => Object.assign(draft, { publications: [invented(i, 'Publication')], awards: [invented(i, 'Award')] }),
  (draft, i) => Object.assign(draft, { volunteer: [invented(i, 'Board role')], languages: [invented(i, 'Language')] }),
  (draft, i) => { draft.experience[0].company = invented(i, 'Employer'); },
  (draft, i) => { draft.experience[0].role = invented(i, 'Job title'); },
  (draft, i) => Object.assign(draft.experience[0], { duration: '2010-2026', location: invented(i, 'Work location') }),
  (draft, i) => Object.assign(draft.experience[0], { description: invented(i, 'Description'), summary: invented(i, 'Role summary'), details: invented(i, 'Role details') }),
  (draft, i) => { draft.experience[0].achievements = [invented(i, 'Achievement')]; },
  (draft, i) => Object.assign(draft.experience[0], { bullets: [`Saved $${i + 10}M and eliminated 99% of incidents.`], responsibilities: [invented(i, 'Responsibility')] }),
  (draft, i) => {
    draft.experience.push({ company: invented(i, 'Employer'), role: invented(i, 'Role'), duration: '2025-2026' });
    draft.credentials = [invented(i, 'Secret clearance')];
    draft.workHistory = [{ employer: invented(i, 'Alias employer') }];
  },
];

test('200 adversarial morph outputs preserve every audited source fact', () => {
  const access = resolveResumeMorphAccess({
    requestedMorphPercentage: 100,
    hasFullConsent: true,
    mode: 'automated',
  });
  let auditedOutputs = 0;
  let blockedChanges = 0;

  mutationFamilies.forEach((mutate, familyIndex) => {
    for (let variant = 0; variant < 10; variant += 1) {
      const caseIndex = familyIndex * 10 + variant + 1;
      const attempted = clone(sourceResume);
      mutate(attempted, caseIndex);
      const guarded = applyResumeMorphGuardrails(sourceResume, attempted, access);

      assert.deepEqual(
        guarded.resume,
        sourceResume,
        `Truth audit case ${caseIndex} allowed an unsupported change`,
      );
      assert.ok(guarded.report.blockedChangeCount > 0, `Truth audit case ${caseIndex} produced no guardrail evidence`);
      assert.equal(guarded.report.consentUsed, true);
      assert.equal(guarded.report.validatorVersion, RESUME_MORPH_VALIDATOR_VERSION);
      assert.equal(guarded.report.protectedContractHash, RESUME_MORPH_PROTECTED_CONTRACT_HASH);
      auditedOutputs += 1;
      blockedChanges += guarded.report.blockedChangeCount;
    }
  });

  assert.equal(auditedOutputs, 200);
  assert.ok(blockedChanges >= 200);
  assert.equal(
    RESUME_MORPH_PROTECTED_CONTRACT_HASH,
    EXPECTED_CONTRACT_BY_VERSION[RESUME_MORPH_VALIDATOR_VERSION],
    'Protected contract changed without an intentional validator-version snapshot update',
  );
});

test('native contact and employment aliases stay truth-locked', () => {
  const access = resolveResumeMorphAccess({ requestedMorphPercentage: 100, hasFullConsent: true, mode: 'automated' });
  const fixtures = [
    {
      contactKey: 'contact',
      historyKey: 'workHistory',
      resume: {
        contact: { email: 'jamie@example.com', phone: '555-0100', location: 'Newark, NJ' },
        workHistory: [{ employer: 'Verified Systems', title: 'Security Analyst', dates: '2021-2025', description: 'Reviewed alerts.' }],
      },
    },
    {
      contactKey: 'contactInfo',
      historyKey: 'workExperience',
      resume: {
        contactInfo: { email: 'jamie@example.com', city: 'Newark', state: 'NJ' },
        workExperience: [{ organization: 'Verified Systems', position: 'Security Analyst', period: '2021-2025', details: 'Reviewed alerts.' }],
      },
    },
    {
      contactKey: 'personalInfo',
      historyKey: 'employmentHistory',
      resume: {
        personalInfo: { email: 'jamie@example.com', address: 'Newark, NJ' },
        employmentHistory: [{ company: 'Verified Systems', jobTitle: 'Security Analyst', startDate: '2021', endDate: '2025', summary: 'Reviewed alerts.' }],
      },
    },
    {
      contactKey: 'personalDetails',
      historyKey: 'experience',
      resume: {
        personalDetails: { email: 'jamie@example.com', country: 'USA' },
        experience: [{ company: 'Verified Systems', role: 'Security Analyst', duration: '2021-2025', responsibilities: ['Reviewed alerts.'] }],
      },
    },
  ];

  for (const fixture of fixtures) {
    for (let variant = 0; variant < 10; variant += 1) {
      const attempted = clone(fixture.resume);
      for (const key of Object.keys(attempted[fixture.contactKey])) {
        attempted[fixture.contactKey][key] = invented(variant, `contact ${key}`);
      }
      const entry = attempted[fixture.historyKey][0];
      for (const key of Object.keys(entry)) {
        entry[key] = Array.isArray(entry[key])
          ? [invented(variant, `employment ${key}`)]
          : invented(variant, `employment ${key}`);
      }
      const guarded = applyResumeMorphGuardrails(fixture.resume, attempted, access);
      assert.deepEqual(guarded.resume, fixture.resume);
      assert.ok(guarded.report.blockedChangeCount > 0);
    }
  }
});

test('arbitrary nested source schemas cannot rewrite primitive facts', () => {
  const source = {
    basics: { name: 'Jamie Rivera', email: 'jamie@example.com', location: 'Newark, NJ' },
    educationHistory: [{ school: 'State University', degree: 'B.S. Information Systems', year: '2021' }],
    credentials: [{ name: 'Security+', issuer: 'CompTIA' }],
    sections: {
      experience: [{ employer: 'Verified Systems', title: 'Security Analyst', description: 'Reviewed alerts.' }],
    },
  };
  const attempted = clone(source);
  attempted.basics = { name: 'Invented Candidate', email: 'fake@example.com', location: 'Washington, DC' };
  attempted.educationHistory[0] = { school: 'Invented University', degree: 'Ph.D. AI', year: '2026' };
  attempted.credentials[0] = { name: 'CISSP', issuer: 'Invented Issuer' };
  attempted.sections.experience[0] = {
    employer: 'Invented Defense Lab',
    title: 'Chief Security Officer',
    description: 'Led a global zero-trust transformation.',
  };

  const guarded = applyResumeMorphGuardrails(
    source,
    attempted,
    resolveResumeMorphAccess({ requestedMorphPercentage: 100, hasFullConsent: true, mode: 'automated' }),
  );
  assert.deepEqual(guarded.resume, source);
  assert.ok(guarded.report.blockedChangeCount >= 10);
  assert.equal(isCurrentResumeMorphGuardrailReport(guarded.report), true);
  assert.equal(isCurrentResumeMorphGuardrailReport({ ...guarded.report, validatorVersion: 'stale' }), false);
  assert.equal(isCurrentResumeMorphGuardrailReport({ ...guarded.report, protectedContractHash: 'stale' }), false);
});

test('guarded resume output is deeply frozen before any writer receives it', () => {
  const access = resolveResumeMorphAccess({ requestedMorphPercentage: 80, hasFullConsent: false, mode: 'automated' });
  const guarded = applyResumeMorphGuardrails(sourceResume, clone(sourceResume), access);
  assert.equal(Object.isFrozen(guarded.resume), true);
  assert.equal(Object.isFrozen(guarded.resume.experience), true);
  assert.equal(Object.isFrozen(guarded.resume.experience[0]), true);
  assert.equal(Reflect.set(guarded.resume, 'summary', 'Fabricated after validation'), false);
  assert.equal(guarded.resume.summary, sourceResume.summary);
});

test('every production resume-morph entrypoint uses the shared truth guardrail', () => {
  const guardedMorph = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'guarded-resume-morph.ts'), 'utf8');
  const guardedGenerator = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'morph-draft-generation.ts'), 'utf8');
  const sonaHarness = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'agent-harness.ts'), 'utf8');
  const applyPipeline = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'agent', 'apply-pipeline', 'route.ts'), 'utf8');
  const resumeMorph = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'resume', 'morph', 'route.ts'), 'utf8');
  const autoFix = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'resume', 'auto-fix', 'route.ts'), 'utf8');
  const cronPipeline = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'cron', 'agent-pipeline', 'route.ts'), 'utf8');

  assert.match(guardedMorph, /generateGuardedMorphDraft/);
  assert.match(guardedGenerator, /applyResumeMorphGuardrails/);
  assert.match(resumeMorph, /generateGuardedMorphDraft/);
  assert.match(applyPipeline, /generateGuardedMorphDraft/);
  for (const source of [sonaHarness, autoFix]) {
    assert.match(source, /applyResumeMorphGuardrails/);
  }
  assert.match(cronPipeline, /generateGuardedMorphDraft/);
  assert.doesNotMatch(cronPipeline, /applyResumeMorphGuardrails/);

  const terminalMorphSection = resumeMorph.slice(resumeMorph.indexOf('const guarded = await generateGuardedMorphDraft'));
  assert.doesNotMatch(terminalMorphSection, /quickClean\(/);
  assert.match(terminalMorphSection, /const morphedData = guarded\.resume/);
  assert.match(terminalMorphSection, /morphedResume:\s*morphedData/);
});

test('Firestore keeps packet proof and guarded resume artifacts server-authoritative', () => {
  const rules = fs.readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf8');
  const mutableCollectionBlock = rules.slice(
    rules.indexOf('function isUserMutableCollection'),
    rules.indexOf('// Per-user root documents'),
  );
  assert.doesNotMatch(mutableCollectionBlock, /'applications'/);
  assert.doesNotMatch(mutableCollectionBlock, /'resume_versions'/);
  assert.match(rules, /match \/users\/\{userId\}\/applications\/\{document=\*\*\}/);
  assert.match(rules, /morph_guardrail_report/);
  assert.match(rules, /cover_letter_guardrail_report/);
  assert.match(rules, /cover_letter_source_resume_hash/);
  assert.match(rules, /packet_generation_owner/);
  assert.match(rules, /function hasServerMorphProof\(data\)/);
  assert.match(rules, /request\.resource\.data\.packet_status == 'tracker_draft'/);
  assert.match(rules, /hasServerMorphProof\(resource\.data\)/);
  assert.match(rules, /'resume_version_id'/);
  assert.match(rules, /'cover_letter'/);
  assert.match(rules, /match \/users\/\{userId\}\/resume_versions\/\{document=\*\*\}/);
  assert.match(rules, /guardrail_validator_version/);
  assert.match(rules, /source_resume_hash/);
  assert.match(rules, /allow delete: if isOwner\(userId\)[\s\S]*!resource\.data\.keys\(\)\.hasAny/);
});
