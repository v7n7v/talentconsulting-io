const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

function resolveRootImport(importPath) {
  const base = path.join(repoRoot, importPath.slice(2));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts')];
  return candidates.find(candidate => fs.existsSync(candidate)) || base;
}

async function loadModule(entryPoint, label) {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), `tc-${label}-`));
  const outfile = path.join(outdir, `${label}.cjs`);
  await build({
    entryPoints: [path.join(repoRoot, entryPoint)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    external: ['firebase-admin', 'next', 'next/*', 'react', 'react-dom'],
    plugins: [{
      name: 'alias-root',
      setup(build) {
        build.onResolve({ filter: /^@\/lib\/firebase-admin$/ }, () => ({
          path: 'firebase-admin-stub',
          namespace: 'stub',
        }));
        build.onLoad({ filter: /^firebase-admin-stub$/, namespace: 'stub' }, () => ({
          contents: `
            exports.getAdminDb = function getAdminDb() {
              throw new Error('getAdminDb must be injected in sona-guarded-resume-morph.test');
            };
          `,
          loader: 'js',
        }));
        build.onResolve({ filter: /^@\// }, args => ({ path: resolveRootImport(args.path) }));
      },
    }],
  });
  return require(outfile);
}

const guardedMorphModule = loadModule('lib/sona/guarded-resume-morph.ts', 'guarded-morph');
const verifiedResumeModule = loadModule('lib/server-resume.ts', 'verified-resume');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMorphDb(selectedVersions = {}) {
  const writes = [];
  const versions = clone(selectedVersions);
  const versionsCollection = {
    doc(id) {
      return {
        async get() {
          const data = versions[id];
          return { exists: Boolean(data), id, data: () => clone(data || {}) };
        },
      };
    },
    async add(data) {
      writes.push(clone(data));
      return { id: `saved-${writes.length}` };
    },
  };
  const db = {
    collection(name) {
      assert.equal(name, 'users');
      return {
        doc() {
          return {
            collection(collectionName) {
              assert.equal(collectionName, 'resume_versions');
              return versionsCollection;
            },
          };
        },
      };
    },
  };
  return { db, writes };
}

const verifiedResume = {
  name: 'Jamie Rivera',
  title: 'Security Analyst',
  email: 'jamie@example.com',
  phone: '555-0100',
  location: 'Newark, NJ',
  summary: 'Security analyst focused on incident response.',
  objective: 'Grow security operations responsibly.',
  skills: ['NIST', 'Incident Response'],
  experience: [{
    role: 'Security Analyst',
    company: 'Verified Systems',
    duration: '2021-2025',
    location: 'Newark, NJ',
    bullets: ['Reduced incident response time by 20%.'],
  }],
  education: [{ degree: 'B.S. Information Systems', institution: 'State University', year: '2021' }],
  certifications: ['Security+'],
};

test('Sona saves only the guarded resume when the model fabricates protected facts', async () => {
  const { runGuardedSonaResumeMorph } = await guardedMorphModule;
  const { db, writes } = createMorphDb();
  const result = await runGuardedSonaResumeMorph({
    uid: 'user-123',
    jobTitle: 'Senior Security Engineer',
    company: 'Target Corp',
    jobDescription: 'NIST incident response cloud security CISSP role.',
    requestedMorphPercentage: 100,
  }, {
    getAdminDb: () => db,
    getLatestExplicitResumeForUser: async () => ({
      resume: clone(verifiedResume),
      source: 'vault',
      id: 'verified-source',
      updatedAt: '2026-07-09T12:00:00.000Z',
      verification: { verified: true, kind: 'explicit_user_source', reason: 'Verified test source.' },
    }),
    getResumeMorphConsentForUser: async () => ({
      unlocked100: false,
      acceptedAt: null,
      consentVersion: 'test',
    }),
    groqJSONCompletion: async () => ({
      morphedResume: {
        ...clone(verifiedResume),
        title: 'Chief Security Officer',
        summary: 'Led a $10M security transformation.',
        objective: 'Managed ten engineers and doubled security output.',
        skills: ['NIST', 'CISSP', 'Cloud Security'],
        experience: [{
          role: 'Director of Security',
          company: 'Invented Defense Lab',
          duration: '2018-2026',
          location: 'Washington, DC',
          employerName: 'Another Invented Employer',
          bullets: ['Eliminated 99% of incidents and saved $10M.'],
        }],
        education: [{ degree: 'M.S. Cybersecurity', institution: 'Invented University', year: '2024' }],
        certifications: ['CISSP', 'Security+'],
        credentials: ['Secret clearance'],
        workHistory: [{ employer: 'Unsupported Corp' }],
      },
    }),
    now: () => new Date('2026-07-09T13:00:00.000Z'),
  });

  assert.equal(result.success, true);
  assert.equal(result.effectiveMorphPercentage, 80);
  assert.equal(result.resumeVersionId, 'saved-1');
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].content, verifiedResume);
  assert.equal(writes[0].is_active, false);
  assert.equal(writes[0].source_resume_id, 'verified-source');
  assert.equal(writes[0].source, 'sona_chat_morph');
  assert.match(writes[0].source_resume_hash, /^[a-f0-9]{64}$/);
  assert.equal(typeof writes[0].guardrail_validator_version, 'string');
  assert.ok(result.guardrailReport.blockedChangeCount >= 8);
  assert.ok(result.guardrailReport.blockedChanges.some(change => change.path.startsWith('education')));
  assert.ok(result.guardrailReport.blockedChanges.some(change => change.path.includes('experience') && change.path.endsWith('company')));
  assert.ok(result.guardrailReport.blockedChanges.some(change => change.path.startsWith('certifications')));
  assert.ok(result.guardrailReport.blockedChanges.some(change => change.path === 'credentials'));
  assert.ok(result.guardrailReport.blockedChanges.some(change => change.path === 'workHistory'));
  assert.ok(result.guardrailReport.blockedChanges.some(change => change.path === 'objective'));
});

test('Sona uses the explicitly selected resume and records it as the source', async () => {
  const { runGuardedSonaResumeMorph } = await guardedMorphModule;
  const { db, writes } = createMorphDb();
  const result = await runGuardedSonaResumeMorph({
    uid: 'user-123',
    resumeVersionId: 'selected',
    jobTitle: 'Security Engineer',
  }, {
    getAdminDb: () => db,
    getLatestExplicitResumeForUser: async () => {
      throw new Error('fallback should not be used');
    },
    getVerifiedResumeForUserById: async (_db, _uid, resumeId) => ({
      resume: clone(verifiedResume),
      source: 'resume_versions',
      id: resumeId,
      updatedAt: '2026-07-09T12:00:00.000Z',
      verification: { verified: true, kind: 'explicit_user_source', reason: 'Verified test source.' },
    }),
    getResumeMorphConsentForUser: async () => ({ unlocked100: false, acceptedAt: null, consentVersion: 'test' }),
    groqJSONCompletion: async () => ({ morphedResume: clone(verifiedResume) }),
    now: () => new Date('2026-07-09T13:00:00.000Z'),
  });

  assert.equal(result.success, true);
  assert.equal(result.sourceResumeId, 'selected');
  assert.equal(writes[0].source_resume_id, 'selected');
});

test('an invalid explicit selection never falls back to another resume', async () => {
  const { runGuardedSonaResumeMorph } = await guardedMorphModule;
  const { db, writes } = createMorphDb();
  let fallbackCalled = false;
  let modelCalled = false;
  const result = await runGuardedSonaResumeMorph({
    uid: 'user-123',
    resumeVersionId: 'missing-or-generated',
    jobTitle: 'Security Engineer',
  }, {
    getAdminDb: () => db,
    getLatestExplicitResumeForUser: async () => {
      fallbackCalled = true;
      return {
        resume: clone(verifiedResume),
        source: 'vault',
        id: 'different-resume',
        updatedAt: null,
        verification: { verified: true, kind: 'explicit_user_source', reason: 'Different source.' },
      };
    },
    getVerifiedResumeForUserById: async () => ({
      resume: null,
      source: null,
      id: null,
      updatedAt: null,
      verification: { verified: false, kind: 'unverified', reason: 'Selected resume is not a verified user source.' },
    }),
    groqJSONCompletion: async () => {
      modelCalled = true;
      return { morphedResume: clone(verifiedResume) };
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'selected_resume_unavailable');
  assert.match(result.message, /did not substitute another resume/i);
  assert.equal(result.sourceResumeId, null);
  assert.equal(fallbackCalled, false);
  assert.equal(modelCalled, false);
  assert.equal(writes.length, 0);
});

test('legacy active resume approval cannot cross the morph truth boundary', async () => {
  const { runGuardedSonaResumeMorph } = await guardedMorphModule;
  const { db, writes } = createMorphDb();
  let modelCalled = false;
  const result = await runGuardedSonaResumeMorph({
    uid: 'user-123',
    resumeVersionId: 'legacy-active',
    jobTitle: 'Security Engineer',
  }, {
    getAdminDb: () => db,
    getVerifiedResumeForUserById: async () => ({
      resume: clone(verifiedResume),
      source: 'resume_versions',
      id: 'legacy-active',
      updatedAt: '2026-07-09T12:00:00.000Z',
      verification: {
        verified: true,
        kind: 'legacy_user_approved',
        reason: 'Legacy active resume with no generated-output markers.',
      },
    }),
    groqJSONCompletion: async () => {
      modelCalled = true;
      return { morphedResume: clone(verifiedResume) };
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'selected_resume_unavailable');
  assert.equal(modelCalled, false);
  assert.equal(writes.length, 0);
});

test('a selected-resume lookup outage returns typed recovery before generation', async () => {
  const { runGuardedSonaResumeMorph } = await guardedMorphModule;
  const { db, writes } = createMorphDb();
  let modelCalled = false;
  const result = await runGuardedSonaResumeMorph({
    uid: 'user-123',
    resumeVersionId: 'selected',
    jobTitle: 'Security Engineer',
  }, {
    getAdminDb: () => db,
    getVerifiedResumeForUserById: async () => {
      throw new Error('temporary Firestore outage');
    },
    groqJSONCompletion: async () => {
      modelCalled = true;
      return { morphedResume: clone(verifiedResume) };
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'resume_lookup_unavailable');
  assert.equal(result.sourceResumeId, 'selected');
  assert.match(result.message, /could not verify the selected resume/i);
  assert.equal(modelCalled, false);
  assert.equal(writes.length, 0);
});

test('Sona returns a typed recovery without calling the model when no resume exists', async () => {
  const { runGuardedSonaResumeMorph } = await guardedMorphModule;
  const { db, writes } = createMorphDb();
  let modelCalled = false;
  const result = await runGuardedSonaResumeMorph({ uid: 'user-123', jobTitle: 'Security Engineer' }, {
    getAdminDb: () => db,
    getLatestExplicitResumeForUser: async () => ({
      resume: null,
      source: null,
      id: null,
      updatedAt: null,
      verification: { verified: false, kind: 'unverified', reason: 'No verified resume found.' },
    }),
    groqJSONCompletion: async () => {
      modelCalled = true;
      return {};
    },
  });

  assert.equal(result.code, 'needs_resume');
  assert.equal(result.success, false);
  assert.equal(modelCalled, false);
  assert.equal(writes.length, 0);
});

function createVerifiedResumeDb(versionDocs, vaultDocs = [], profileData = null) {
  const valueAtPath = (value, fieldPath) => fieldPath
    .split('.')
    .reduce((current, key) => current?.[key], value);
  const makeQuery = docs => ({
    orderBy() { return this; },
    limit(count) { return makeQuery(docs.slice(0, count)); },
    where(fieldPath, operator, expected) {
      assert.equal(operator, '==');
      return makeQuery(docs.filter(document => valueAtPath(document.data, fieldPath) === expected));
    },
    async get() {
      return {
        empty: docs.length === 0,
        docs: docs.map(({ id, data }) => ({ id, data: () => clone(data) })),
      };
    },
  });
  return {
    collection() {
      return {
        doc() {
          return {
            collection(name) {
              if (name === 'resume_versions') return makeQuery(versionDocs);
              if (name === 'vault') return makeQuery(vaultDocs);
              if (name === 'profile') return {
                doc: () => ({
                  get: async () => ({
                    exists: Boolean(profileData),
                    id: 'main',
                    data: () => clone(profileData || {}),
                  }),
                }),
              };
              throw new Error(`Unexpected collection ${name}`);
            },
          };
        },
      };
    },
  };
}

test('verified resume lookup skips newer generated review drafts', async () => {
  const { getLatestVerifiedResumeForUser } = await verifiedResumeModule;
  const generated = {
    id: 'generated',
    data: {
      content: { name: 'Generated Draft' },
      source: 'sona_harness',
      guardrail_report: { blockedChangeCount: 0 },
      morph_effective_percentage: 80,
      is_active: false,
      created_at: '2026-07-09T14:00:00.000Z',
    },
  };
  const uploaded = {
    id: 'uploaded',
    data: {
      content: { name: 'Verified Upload' },
      is_active: true,
      created_at: '2026-07-08T14:00:00.000Z',
    },
  };
  const result = await getLatestVerifiedResumeForUser(createVerifiedResumeDb([generated, uploaded]), 'user-123');

  assert.equal(result.id, 'uploaded');
  assert.equal(result.resume.name, 'Verified Upload');
  assert.equal(result.verification.verified, true);
});

test('explicit resume lookup skips a newer legacy-active record', async () => {
  const { getLatestExplicitResumeForUser } = await verifiedResumeModule;
  const legacy = Array.from({ length: 30 }, (_, index) => ({
    id: `legacy-active-${index}`,
    data: {
      content: { name: `Legacy Active ${index}` },
      is_active: true,
      created_at: new Date(Date.UTC(2026, 6, 10, 14, 0, index)).toISOString(),
    },
  }));
  const uploaded = {
    id: 'verified-upload',
    data: {
      content: clone(verifiedResume),
      source: 'sona_upload',
      provenance: {
        verified: true,
        origin: 'sona_upload',
        recordedAt: '2026-07-09T14:00:00.000Z',
      },
      created_at: '2026-07-09T14:00:00.000Z',
    },
  };

  const result = await getLatestExplicitResumeForUser(
    createVerifiedResumeDb([...legacy, uploaded]),
    'user-123',
  );

  assert.equal(result.id, 'verified-upload');
  assert.equal(result.resume.name, 'Jamie Rivera');
  assert.equal(result.verification.kind, 'explicit_user_source');
});

test('selected verified resume lookup preserves Firestore failures for typed recovery', async () => {
  const { getVerifiedResumeForUserById } = await verifiedResumeModule;
  const db = {
    collection() {
      return {
        doc() {
          return {
            collection() {
              return {
                doc() {
                  return {
                    async get() {
                      throw new Error('temporary Firestore outage');
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  await assert.rejects(
    () => getVerifiedResumeForUserById(db, 'user-123', 'selected-resume'),
    /temporary Firestore outage/,
  );
});

test('generated resume output stays unverified even if marked active', async () => {
  const { getLatestVerifiedResumeForUser } = await verifiedResumeModule;
  const generated = {
    id: 'generated-active',
    data: {
      content: { name: 'Generated Active Draft' },
      source: 'sona_chat_morph',
      is_active: true,
      created_at: '2026-07-10T02:00:00.000Z',
    },
  };
  const uploaded = {
    id: 'uploaded',
    data: {
      content: { name: 'Verified Upload' },
      source: 'resume_studio',
      is_active: true,
      created_at: '2026-07-09T02:00:00.000Z',
    },
  };
  const result = await getLatestVerifiedResumeForUser(createVerifiedResumeDb([generated, uploaded]), 'user-123');

  assert.equal(result.id, 'uploaded');
  assert.equal(result.resume.name, 'Verified Upload');
});

test('ambiguous vault records are rejected while onboarding uploads are verified', async () => {
  const { getLatestVerifiedResumeForUser } = await verifiedResumeModule;
  const ambiguous = {
    id: 'ambiguous-vault',
    data: {
      resume: { name: 'Ambiguous Resume' },
      createdAt: '2026-07-10T03:00:00.000Z',
    },
  };
  const rejected = await getLatestVerifiedResumeForUser(createVerifiedResumeDb([], [ambiguous]), 'user-123');
  assert.equal(rejected.resume, null);

  const onboarding = {
    id: 'onboarding-vault',
    data: {
      resume: { name: 'Onboarding Upload' },
      source: 'onboarding',
      provenance: {
        verified: true,
        origin: 'onboarding_upload',
        recordedAt: '2026-07-10T03:00:00.000Z',
      },
      createdAt: '2026-07-10T03:00:00.000Z',
    },
  };
  const verified = await getLatestVerifiedResumeForUser(createVerifiedResumeDb([], [ambiguous, onboarding]), 'user-123');
  assert.equal(verified.id, 'onboarding-vault');
  assert.equal(verified.verification.kind, 'explicit_user_source');
});

test('legacy source labels cannot substitute for explicit provenance', async () => {
  const { getLatestVerifiedResumeForUser } = await verifiedResumeModule;
  const sourceOnly = {
    id: 'source-only',
    data: {
      content: { name: 'Source Label Only' },
      source: 'resume_studio',
      is_active: true,
      created_at: '2026-07-10T03:00:00.000Z',
    },
  };
  const result = await getLatestVerifiedResumeForUser(createVerifiedResumeDb([sourceOnly]), 'user-123');

  assert.equal(result.id, 'source-only');
  assert.equal(result.verification.kind, 'legacy_user_approved');
});

test('validated Sona upload remains an explicit source of truth', async () => {
  const { getLatestVerifiedResumeForUser } = await verifiedResumeModule;
  const sonaUpload = {
    id: 'sona-upload',
    data: {
      content: { name: 'Sona Upload' },
      source: 'sona_upload',
      provenance: {
        verified: true,
        origin: 'sona_upload',
        recordedAt: '2026-07-10T03:00:00.000Z',
      },
      is_active: true,
      created_at: '2026-07-10T03:00:00.000Z',
    },
  };
  const result = await getLatestVerifiedResumeForUser(createVerifiedResumeDb([sonaUpload]), 'user-123');

  assert.equal(result.id, 'sona-upload');
  assert.equal(result.verification.kind, 'explicit_user_source');
});

test('profile resume requires explicit user-source provenance', async () => {
  const { getLatestVerifiedResumeForUser } = await verifiedResumeModule;
  const ambiguous = await getLatestVerifiedResumeForUser(createVerifiedResumeDb([], [], {
    base_resume_parsed: { name: 'Ambiguous Profile Resume' },
  }), 'user-123');
  assert.equal(ambiguous.resume, null);

  const invalidOrigin = await getLatestVerifiedResumeForUser(createVerifiedResumeDb([], [], {
    base_resume_parsed: { name: 'Generated Profile Resume' },
    resume_provenance: {
      verified: true,
      origin: 'generated_review_draft',
      recordedAt: '2026-07-10T00:00:00.000Z',
    },
  }), 'user-123');
  assert.equal(invalidOrigin.resume, null);

  const verified = await getLatestVerifiedResumeForUser(createVerifiedResumeDb([], [], {
    base_resume_parsed: { name: 'Verified Profile Resume' },
    resume_provenance: {
      verified: true,
      origin: 'onboarding_upload',
      recordedAt: '2026-07-10T00:00:00.000Z',
    },
  }), 'user-123');
  assert.equal(verified.resume.name, 'Verified Profile Resume');
  assert.equal(verified.verification.kind, 'explicit_user_source');
});
