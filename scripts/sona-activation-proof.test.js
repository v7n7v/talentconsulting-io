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

async function loadActivationProofModule() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-activation-proof-'));
  const outfile = path.join(outdir, 'activation-proof.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'sona', 'activation-proof.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    external: ['firebase-admin', 'next', 'next/*', 'react', 'react-dom'],
    plugins: [{
      name: 'alias-root',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^@\// }, args => ({ path: resolveRootImport(args.path) }));
      },
    }],
  });
  return require(outfile);
}

const activationProofModule = loadActivationProofModule();

async function loadPreflightRouteModule() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-activation-route-'));
  const outfile = path.join(outdir, 'activation-route.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'app', 'api', 'agent', 'harness', 'preflight', 'route.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'preflight-route-mocks',
      setup(buildApi) {
        const mockModules = new Map([
          ['next/server', `
            export class NextResponse {
              static json(body, init = {}) {
                return { body, status: init.status || 200, headers: init.headers || {} };
              }
            }
          `],
          ['@/lib/api-auth', `
            export async function authenticateRequest() {
              globalThis.__sonaPreflightRouteMocks.authCalls += 1;
              return globalThis.__sonaPreflightRouteMocks.authenticated;
            }
            export async function guardApiRoute(req, options) {
              globalThis.__sonaPreflightRouteMocks.guardCalls += 1;
              globalThis.__sonaPreflightRouteMocks.guardOptions = options;
              return globalThis.__sonaPreflightRouteMocks.guard;
            }
          `],
          ['@/lib/firebase-admin', `
            export function getAdminDb() {
              globalThis.__sonaPreflightRouteMocks.dbCalls += 1;
              return globalThis.__sonaPreflightRouteMocks.db;
            }
          `],
          ['@/lib/monitor', `export const monitor = { critical() {} };`],
          ['@/lib/rate-limit', `
            export async function checkRateLimitStrict() {
              return globalThis.__sonaPreflightRouteMocks.strictLimit;
            }
          `],
          ['@/lib/sona/activation-proof', `
            export async function runSonaActivationProof(db, uid, input) {
              globalThis.__sonaPreflightRouteMocks.proofCalls += 1;
              globalThis.__sonaPreflightRouteMocks.proofInput = input;
              return globalThis.__sonaPreflightRouteMocks.proofResult;
            }
          `],
          ['@/lib/sona/activation-receipt', `
            export function createSonaActivationReceipt(input) {
              globalThis.__sonaPreflightRouteMocks.receiptInput = input;
              return { token: 'signed-preflight-receipt', expiresAt: '2026-07-10T05:05:00.000Z' };
            }
          `],
        ]);
        for (const [specifier, contents] of mockModules) {
          const key = specifier.replace(/[^a-z0-9]/gi, '-');
          buildApi.onResolve({ filter: new RegExp('^' + specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }, () => ({ path: key, namespace: 'route-mock' }));
          buildApi.onLoad({ filter: new RegExp('^' + key + '$'), namespace: 'route-mock' }, () => ({ contents, loader: 'js' }));
        }
        buildApi.onResolve({ filter: /^@\// }, args => ({ path: resolveRootImport(args.path) }));
      },
    }],
  });
  return require(outfile);
}

const preflightRouteModule = loadPreflightRouteModule();

async function loadProvenanceModule() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-resume-provenance-'));
  const outfile = path.join(outdir, 'resume-provenance.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'resume-provenance.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const provenanceModule = loadProvenanceModule();

function makeJob(id, overrides = {}) {
  const title = overrides.title || `Security Engineer ${id}`;
  const company = overrides.company || `Verified Systems ${id}`;
  const location = overrides.location || 'Newark, NJ';
  const sourceName = overrides.sourceName || 'Greenhouse';
  const sourceType = overrides.sourceType || 'direct_ats';
  const confidence = overrides.confidence || 'high';
  const sourceHost = sourceName.toLowerCase().includes('adzuna')
    ? 'www.adzuna.com'
    : sourceName.toLowerCase().includes('greenhouse')
      ? 'boards.greenhouse.io'
      : 'aggregator.example';
  const jobUrl = `https://${sourceHost}/jobs/${id}`;
  return {
    id,
    title,
    company,
    location,
    salary: { min: 125000, max: 150000, currency: 'USD' },
    description: 'NIST cloud security incident response and network engineering.',
    skills: ['NIST', 'Cloud Security', 'Incident Response'],
    url: jobUrl,
    postedDate: '2026-07-09T00:00:00.000Z',
    employmentType: 'Full-time',
    source: sourceName,
    remoteMode: 'hybrid',
    sourceMeta: {
      sourceType,
      sourceName,
      sourceConfidence: confidence,
      directApplyUrl: jobUrl,
      canonicalUrl: jobUrl,
      firstSeenAt: '2026-07-09T00:00:00.000Z',
      lastSeenAt: '2026-07-10T00:00:00.000Z',
    },
    dedupeKey: `${company}|${title}|${location}|${id}`.toLowerCase(),
    identityKey: `${company}|${title}|${location}`.toLowerCase(),
    matchScore: 82,
  };
}

function baseDeps(overrides = {}) {
  return {
    getLatestVerifiedResumeForUser: async () => ({
      resume: {
        title: 'Security Engineer',
        location: 'New Jersey',
        skills: ['NIST', 'Cloud Security', 'Incident Response'],
      },
      source: 'resume_versions',
      id: 'verified-resume-1',
      updatedAt: '2026-07-09T00:00:00.000Z',
      verification: { verified: true, kind: 'explicit_user_source', reason: 'test fixture' },
    }),
    extractResumeSkills: resume => resume.skills,
    loadRecommendationLedgerWithStatus: async () => ({ ledger: new Map(), complete: true, truncated: false, checkedCount: 0 }),
    getJobPreferences: async () => ({
      preferences: {
        targetRoles: ['Security Engineer'],
        preferredCities: ['New Jersey'],
        salaryMin: 120000,
        remotePref: 'hybrid',
      },
      complete: true,
    }),
    searchTalentJobSupply: async () => ({
      jobs: [makeJob('1'), makeJob('2'), makeJob('3')],
      totalCount: 3,
      source: 'Ever Jobs + Talent fallback',
      providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
    }),
    now: () => new Date('2026-07-10T05:00:00.000Z'),
    isGenerationConfigured: () => true,
    ...overrides,
  };
}

test('three trusted Ever Jobs picks produce a ready proof with no side effects', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'studio' }, baseDeps());

  assert.equal(result.status, 'ready');
  assert.equal(result.code, 'ACTIVATION_READY');
  assert.equal(result.activationReady, true);
  assert.equal(result.canScout, true);
  assert.equal(result.canPrepare, true);
  assert.equal(result.generation.preparationReady, true);
  assert.equal(result.topPicks.length, 3);
  assert.equal(result.supply.trustedTopPickRate, 100);
  assert.deepEqual(result.sideEffects, {
    quotaConsumed: false,
    runCreated: false,
    queueWritten: false,
    packetGenerated: false,
    resumeMutated: false,
    notificationSent: false,
    externalApplicationSubmitted: false,
  });
});

test('missing generation service degrades packet preparation without blocking scout picks', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'studio' }, baseDeps({
    isGenerationConfigured: () => false,
  }));

  assert.equal(result.status, 'degraded');
  assert.equal(result.code, 'ACTIVATION_DEGRADED');
  assert.equal(result.canScout, true);
  assert.equal(result.canPrepare, false);
  assert.equal(result.activationReady, false);
  assert.equal(result.generation.status, 'unavailable');
  assert.equal(result.generation.preparationReady, false);
  assert.match(result.message, /packet generation is unavailable/i);
  assert.match(result.nextAction, /review these picks now/i);
  assert.match(result.nextAction, /only after generation service access is restored/i);
  assert.doesNotMatch(result.nextAction, /start the scout/i);
  assert.equal(result.sideEffects.quotaConsumed, false);
  assert.equal(result.sideEffects.packetGenerated, false);
  assert.equal(result.sideEffects.externalApplicationSubmitted, false);
});

test('activation proof binds the explicitly selected verified resume without latest-resume fallback', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  let selectedCalls = 0;
  let latestCalls = 0;
  const result = await runSonaActivationProof({}, 'user-123', {
    tier: 'studio',
    resumeVersionId: 'selected-resume-42',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    remotePreference: 'hybrid',
  }, baseDeps({
    getVerifiedResumeForUserById: async (_db, uid, resumeId) => {
      selectedCalls += 1;
      assert.equal(uid, 'user-123');
      assert.equal(resumeId, 'selected-resume-42');
      return {
        resume: { title: 'Security Engineer', location: 'New Jersey', skills: ['Selected Resume Skill'] },
        source: 'resume_versions',
        id: resumeId,
        updatedAt: '2026-07-10T04:00:00.000Z',
        verification: { verified: true, kind: 'explicit_user_source', reason: 'selected upload' },
      };
    },
    getLatestVerifiedResumeForUser: async () => {
      latestCalls += 1;
      throw new Error('latest resume must not replace the selected resume');
    },
  }));

  assert.equal(result.status, 'ready');
  assert.equal(result.resume.id, 'selected-resume-42');
  assert.equal(result.resume.skillsUsed, 1);
  assert.equal(selectedCalls, 1);
  assert.equal(latestCalls, 0);
});

test('an invalid selected resume blocks activation instead of falling back to another resume', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  let latestCalls = 0;
  let searchCalls = 0;
  const result = await runSonaActivationProof({}, 'user-123', {
    tier: 'studio',
    resumeVersionId: 'unverified-resume',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    remotePreference: 'hybrid',
  }, baseDeps({
    getVerifiedResumeForUserById: async () => ({
      resume: null,
      source: null,
      id: null,
      updatedAt: null,
      verification: { verified: false, kind: 'unverified', reason: 'not a user source' },
    }),
    getLatestVerifiedResumeForUser: async () => {
      latestCalls += 1;
      return baseDeps().getLatestVerifiedResumeForUser();
    },
    searchTalentJobSupply: async () => {
      searchCalls += 1;
      throw new Error('must not search');
    },
  }));

  assert.equal(result.code, 'MISSING_VERIFIED_RESUME');
  assert.equal(result.resume.id, null);
  assert.equal(latestCalls, 0);
  assert.equal(searchCalls, 0);
});

test('missing verified resume blocks before any provider search', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  let searchCalls = 0;
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'pro' }, baseDeps({
    getLatestVerifiedResumeForUser: async () => ({
      resume: null,
      source: null,
      id: null,
      updatedAt: null,
      verification: { verified: false, kind: 'unverified', reason: 'missing' },
    }),
    searchTalentJobSupply: async () => {
      searchCalls += 1;
      throw new Error('must not search');
    },
  }));

  assert.equal(result.code, 'MISSING_VERIFIED_RESUME');
  assert.equal(result.status, 'blocked');
  assert.equal(searchCalls, 0);
});

test('missing role and location returns a typed target-brief block', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'free' }, baseDeps({
    getLatestVerifiedResumeForUser: async () => ({
      resume: { skills: ['NIST'] },
      source: 'vault',
      id: 'resume-2',
      updatedAt: null,
      verification: { verified: true, kind: 'explicit_user_source', reason: 'test fixture' },
    }),
    getJobPreferences: async () => ({ preferences: {}, complete: true }),
  }));

  assert.equal(result.code, 'MISSING_TARGET_BRIEF');
  assert.deepEqual(result.target.missingFields, ['targetRole', 'location']);
});

test('fallback supply is usable but explicitly degraded', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'studio' }, baseDeps({
    searchTalentJobSupply: async () => ({
      jobs: [
        makeJob('1', { sourceName: 'Adzuna', sourceType: 'api_board', confidence: 'medium' }),
        makeJob('2', { sourceName: 'Adzuna', sourceType: 'api_board', confidence: 'medium' }),
        makeJob('3', { sourceName: 'Adzuna', sourceType: 'api_board', confidence: 'medium' }),
      ],
      totalCount: 3,
      source: 'Talent fallback',
      providerStatus: { everJobs: 'disabled', fallbackUsed: true, sources: ['Adzuna'] },
    }),
  }));

  assert.equal(result.status, 'degraded');
  assert.equal(result.code, 'ACTIVATION_DEGRADED');
  assert.equal(result.activationReady, false);
  assert.equal(result.canScout, true);
  assert.equal(result.canPrepare, false);
  assert.equal(result.supply.trustedTopPickRate, 100);
});

test('cross-provider duplicates prefer the higher-confidence direct source', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  const duplicateAggregator = makeJob('aggregator', {
    title: 'Security Engineer',
    company: 'Same Company',
    sourceName: 'Aggregator',
    sourceType: 'aggregator',
    confidence: 'low',
  });
  const duplicateDirect = makeJob('direct', {
    title: 'Security Engineer',
    company: 'Same Company',
    sourceName: 'Greenhouse',
    sourceType: 'direct_ats',
    confidence: 'high',
  });
  duplicateDirect.identityKey = duplicateAggregator.identityKey;
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'studio' }, baseDeps({
    searchTalentJobSupply: async () => ({
      jobs: [duplicateAggregator, duplicateDirect, makeJob('2'), makeJob('3')],
      totalCount: 4,
      source: 'Ever Jobs + Talent fallback',
      providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Aggregator', 'Greenhouse'] },
    }),
  }));

  assert.equal(result.supply.duplicatesSuppressed, 1);
  assert.equal(result.topPicks.length, 3);
  const sameCompany = result.topPicks.find(pick => pick.company === 'Same Company');
  assert.equal(sameCompany.source.name, 'Greenhouse');
  assert.equal(sameCompany.source.confidence, 'high');
});

test('top-three review suppresses repeated company and title across nearby locations', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  const repeatedNewark = makeJob('newark', { title: 'Security Engineer', company: 'Same Company', location: 'Newark, NJ' });
  const repeatedJerseyCity = makeJob('jersey-city', { title: 'Security Engineer', company: 'Same Company', location: 'Jersey City, NJ' });
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'studio' }, baseDeps({
    searchTalentJobSupply: async () => ({
      jobs: [repeatedNewark, repeatedJerseyCity, makeJob('2'), makeJob('3')],
      totalCount: 4,
      source: 'Ever Jobs + Talent fallback',
      providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
    }),
  }));

  assert.equal(result.topPicks.length, 3);
  assert.equal(result.supply.reviewDuplicatesSuppressed, 1);
  assert.equal(result.topPicks.filter(pick => pick.company === 'Same Company').length, 1);
});

test('ledger decisions suppress repeated jobs before ranking', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  const jobs = [makeJob('1'), makeJob('2'), makeJob('3')];
  const dismissed = jobs[0];
  const dismissedIdentity = 'verified systems 1|security engineer 1|newark nj';
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'studio' }, baseDeps({
    loadRecommendationLedgerWithStatus: async () => ({
      ledger: new Map([[
        dismissedIdentity,
        { jobKey: dismissedIdentity, status: 'dismissed', feedbackTags: ['wrong_role'] },
      ]]),
      complete: true,
      truncated: false,
      checkedCount: 1,
    }),
    searchTalentJobSupply: async () => ({
      jobs,
      totalCount: 3,
      source: 'Ever Jobs + Talent fallback',
      providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
    }),
  }));

  assert.equal(result.supply.historySuppressed, 1);
  assert.equal(result.topPicks.some(pick => pick.title === dismissed.title && pick.company === dismissed.company), false);
  assert.equal(result.activationReady, false);
  assert.equal(result.status, 'degraded');
});

test('ambiguous resume provenance blocks before search', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  let searchCalls = 0;
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'studio' }, baseDeps({
    getLatestVerifiedResumeForUser: async () => ({
      resume: { title: 'Security Engineer', location: 'New Jersey', skills: ['NIST'] },
      source: 'vault',
      id: 'ambiguous',
      updatedAt: null,
      verification: { verified: false, kind: 'unverified', reason: 'ambiguous' },
    }),
    searchTalentJobSupply: async () => {
      searchCalls += 1;
      throw new Error('must not search');
    },
  }));

  assert.equal(result.code, 'MISSING_VERIFIED_RESUME');
  assert.equal(searchCalls, 0);
});

test('legacy active resume approval cannot satisfy the explicit activation proof', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  let searchCalls = 0;
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'studio' }, baseDeps({
    getLatestVerifiedResumeForUser: async () => ({
      resume: { title: 'Security Engineer', location: 'New Jersey', skills: ['NIST'] },
      source: 'resume_versions',
      id: 'legacy-active',
      updatedAt: null,
      verification: { verified: true, kind: 'legacy_user_approved', reason: 'legacy active' },
    }),
    searchTalentJobSupply: async () => {
      searchCalls += 1;
      throw new Error('must not search');
    },
  }));

  assert.equal(result.code, 'MISSING_VERIFIED_RESUME');
  assert.equal(searchCalls, 0);
});

test('ledger failure degrades scouting and blocks packet preparation', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'studio' }, baseDeps({
    loadRecommendationLedgerWithStatus: async () => ({ ledger: new Map(), complete: false, truncated: false, checkedCount: 0 }),
  }));

  assert.equal(result.status, 'degraded');
  assert.equal(result.supply.ledgerStatus, 'unavailable');
  assert.equal(result.canScout, true);
  assert.equal(result.canPrepare, false);
  assert.equal(result.activationReady, false);
});

test('unsafe apply URLs are removed and prevent preparation', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  const unsafe = makeJob('unsafe');
  unsafe.url = 'https://phishing.example/apply';
  unsafe.sourceMeta.directApplyUrl = 'https://phishing.example/apply';
  unsafe.sourceMeta.canonicalUrl = 'https://phishing.example/apply';
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'studio' }, baseDeps({
    searchTalentJobSupply: async () => ({
      jobs: [unsafe, makeJob('2'), makeJob('3')],
      totalCount: 3,
      source: 'Ever Jobs + Talent fallback',
      providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
    }),
  }));

  assert.equal(result.topPicks.find(pick => pick.title === unsafe.title).source.applyUrl, '');
  assert.equal(result.supply.verifiedApplyUrlCount, 2);
  assert.equal(result.canPrepare, false);
});

test('missing trusted canonical URL prevents preparation even with a safe apply URL', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  const missingCanonical = makeJob('canonical');
  missingCanonical.sourceMeta.canonicalUrl = 'https://phishing.example/canonical';
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'studio' }, baseDeps({
    searchTalentJobSupply: async () => ({
      jobs: [missingCanonical, makeJob('2'), makeJob('3')],
      totalCount: 3,
      source: 'Ever Jobs + Talent fallback',
      providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
    }),
  }));

  assert.equal(result.supply.verifiedApplyUrlCount, 3);
  assert.equal(result.supply.verifiedCanonicalUrlCount, 2);
  assert.equal(result.canPrepare, false);
});

test('unavailable preferences require confirmation before preparation', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'studio' }, baseDeps({
    getJobPreferences: async () => ({ preferences: {}, complete: false }),
  }));

  assert.equal(result.target.preferencesStatus, 'unavailable');
  assert.equal(result.target.confirmationRequired, true);
  assert.equal(result.canScout, true);
  assert.equal(result.canPrepare, false);
});

test('work-mode mismatch keeps results reviewable but blocks preparation', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  const jobs = [makeJob('1'), makeJob('2'), makeJob('3')].map(job => ({ ...job, remoteMode: 'onsite' }));
  const result = await runSonaActivationProof({}, 'user-123', {
    tier: 'studio',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    remotePreference: 'hybrid',
  }, baseDeps({
    searchTalentJobSupply: async () => ({
      jobs,
      totalCount: 3,
      source: 'Ever Jobs + Talent fallback',
      providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
    }),
  }));

  assert.equal(result.supply.workModeMatchCount, 0);
  assert.equal(result.canScout, true);
  assert.equal(result.canPrepare, false);
});

test('explicit target input wins over preferences and resume inference', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  let receivedSearch;
  const result = await runSonaActivationProof({}, 'user-123', {
    tier: 'studio',
    targetRole: 'Product Security Engineer',
    location: 'Jersey City, NJ',
    salaryTarget: 140000,
    remotePreference: 'onsite',
  }, baseDeps({
    searchTalentJobSupply: async params => {
      receivedSearch = params;
      return {
        jobs: [makeJob('1'), makeJob('2'), makeJob('3')],
        totalCount: 3,
        source: 'Ever Jobs + Talent fallback',
        providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
      };
    },
  }));

  assert.equal(result.target.role, 'Product Security Engineer');
  assert.equal(result.target.location, 'Jersey City, NJ');
  assert.equal(result.target.salaryTarget, 140000);
  assert.equal(result.target.remotePreference, 'onsite');
  assert.equal(receivedSearch.query, 'Product Security Engineer');
  assert.equal(receivedSearch.location, 'Jersey City, NJ');
});

test('only a complete saved role, location and work-mode brief counts as confirmed', async () => {
  const { hasCompleteJobPreferenceBrief } = await activationProofModule;
  assert.equal(hasCompleteJobPreferenceBrief({}), false);
  assert.equal(hasCompleteJobPreferenceBrief({ targetRoles: ['Security Engineer'] }), false);
  assert.equal(hasCompleteJobPreferenceBrief({
    targetRoles: ['Security Engineer'],
    preferredCities: ['New Jersey'],
    remotePref: 'hybrid',
  }), true);
});

test('generic resume saves cannot self-certify generated or unknown provenance', async () => {
  const { normalizeVerifiedResumeProvenance } = await provenanceModule;
  const now = '2026-07-10T05:00:00.000Z';
  assert.equal(normalizeVerifiedResumeProvenance(undefined, now), null);
  assert.equal(normalizeVerifiedResumeProvenance({ verified: true, origin: 'generated_review_draft' }, now), null);
  assert.deepEqual(normalizeVerifiedResumeProvenance({ verified: true, origin: 'user_upload' }, now), {
    verified: true,
    origin: 'user_upload',
    recordedAt: now,
  });
});

test('provider failure returns a safe typed block and side-effect receipt', async () => {
  const { runSonaActivationProof } = await activationProofModule;
  const result = await runSonaActivationProof({}, 'user-123', { tier: 'studio' }, baseDeps({
    searchTalentJobSupply: async () => { throw new Error('timeout'); },
  }));

  assert.equal(result.code, 'SAFE_SUPPLY_UNAVAILABLE');
  assert.equal(result.status, 'blocked');
  assert.equal(result.sideEffects.externalApplicationSubmitted, false);
  assert.equal(result.sideEffects.queueWritten, false);
});

test('preflight route cannot invoke the mutating harness or usage accounting', () => {
  const route = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'agent', 'harness', 'preflight', 'route.ts'), 'utf8');
  assert.doesNotMatch(route, /runSonaAgentHarness|incrementUsage|upsertRecommendationLedger/);
  assert.match(route, /skipUsageCap:\s*true/);
  assert.match(route, /unavailableSupply\s*\?\s*503/);
  assert.match(route, /noSafeResults\s*\?\s*422/);
  assert.match(route, /passLocalEmergencyLimit/);
  assert.match(route, /checkRateLimitStrict/);
  assert.match(route, /RATE_LIMIT_UNAVAILABLE/);
  assert.ok(route.indexOf('await authenticateRequest(req)') < route.indexOf('await checkRateLimitStrict'));
  assert.ok(route.indexOf('await checkRateLimitStrict') < route.indexOf('await guardApiRoute(req'));
  const proof = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'activation-proof.ts'), 'utf8');
  assert.match(proof, /isGenerationConfigured:\s*\(\) => isGroqConfigured\(\) && isOpenRouterConfigured\(\)/);
  const limiter = fs.readFileSync(path.join(repoRoot, 'lib', 'rate-limit.ts'), 'utf8');
  assert.match(limiter, /redis\.eval/);
  assert.match(limiter, /if ttl < 0/);
});

test('preflight route executes only the read-only proof after auth and strict limiting', async () => {
  const { POST } = await preflightRouteModule;
  global.__sonaPreflightRouteMocks = {
    authenticated: { uid: 'user-123', email: 'user@example.com' },
    authCalls: 0,
    guard: { user: { uid: 'user-123', email: 'user@example.com', tier: 'studio' } },
    guardCalls: 0,
    guardOptions: null,
    strictLimit: { allowed: true, remaining: 1, resetIn: 60000, unavailable: false },
    db: new Proxy({}, { get() { throw new Error('route must not write or query directly'); } }),
    dbCalls: 0,
    proofCalls: 0,
    proofResult: {
      status: 'ready', code: 'ACTIVATION_READY', canScout: true, canPrepare: true,
      resume: { id: 'selected-resume-42' },
      target: { role: 'Security Engineer', location: 'New Jersey', salaryTarget: 120000, remotePreference: 'hybrid' },
      generation: { status: 'ready', preparationReady: true },
    },
  };
  const response = await POST({ json: async () => ({
    resumeVersionId: 'selected-resume-42',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
  }) });

  assert.equal(response.status, 200);
  assert.equal(response.body.code, 'ACTIVATION_READY');
  assert.equal(response.body.activationReceipt.token, 'signed-preflight-receipt');
  assert.equal(global.__sonaPreflightRouteMocks.proofCalls, 1);
  assert.equal(global.__sonaPreflightRouteMocks.dbCalls, 1);
  assert.equal(global.__sonaPreflightRouteMocks.authCalls, 1);
  assert.equal(global.__sonaPreflightRouteMocks.guardCalls, 1);
  assert.equal(global.__sonaPreflightRouteMocks.guardOptions.skipUsageCap, true);
  assert.equal(global.__sonaPreflightRouteMocks.proofInput.resumeVersionId, 'selected-resume-42');
  assert.equal(global.__sonaPreflightRouteMocks.receiptInput.uid, 'user-123');
  assert.equal(global.__sonaPreflightRouteMocks.receiptInput.resumeVersionId, 'selected-resume-42');
});

test('preflight does not issue a launch receipt while generation is unavailable', async () => {
  const { POST } = await preflightRouteModule;
  global.__sonaPreflightRouteMocks = {
    authenticated: { uid: 'user-no-model', email: 'user@example.com' },
    authCalls: 0,
    guard: { user: { uid: 'user-no-model', email: 'user@example.com', tier: 'studio' } },
    guardCalls: 0,
    guardOptions: null,
    strictLimit: { allowed: true, remaining: 1, resetIn: 60000, unavailable: false },
    db: {},
    dbCalls: 0,
    proofCalls: 0,
    receiptInput: null,
    proofResult: {
      status: 'degraded', code: 'ACTIVATION_DEGRADED', canScout: true, canPrepare: false,
      resume: { id: 'selected-resume-42' },
      target: { role: 'Security Engineer', location: 'New Jersey', salaryTarget: 120000, remotePreference: 'hybrid' },
      generation: { status: 'unavailable', preparationReady: false },
    },
  };
  const response = await POST({ json: async () => ({
    resumeVersionId: 'selected-resume-42',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
  }) });

  assert.equal(response.status, 200);
  assert.equal(response.body.code, 'ACTIVATION_DEGRADED');
  assert.equal(response.body.activationReceipt, undefined);
  assert.equal(global.__sonaPreflightRouteMocks.receiptInput, null);
});

test('strict limiter failure blocks before Firestore and provider proof work', async () => {
  const { POST } = await preflightRouteModule;
  global.__sonaPreflightRouteMocks = {
    authenticated: { uid: 'user-rate-limit', email: 'user@example.com' },
    authCalls: 0,
    guard: { user: { uid: 'user-rate-limit', email: 'user@example.com', tier: 'studio' } },
    guardCalls: 0,
    guardOptions: null,
    strictLimit: { allowed: false, remaining: 0, resetIn: 60000, unavailable: true },
    db: {},
    dbCalls: 0,
    proofCalls: 0,
    proofResult: null,
  };
  const response = await POST({ json: async () => ({ targetRole: 'Security Engineer', location: 'New Jersey' }) });

  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'RATE_LIMIT_UNAVAILABLE');
  assert.equal(global.__sonaPreflightRouteMocks.dbCalls, 0);
  assert.equal(global.__sonaPreflightRouteMocks.proofCalls, 0);
  assert.equal(global.__sonaPreflightRouteMocks.guardCalls, 0);
});

test('missing authentication blocks before strict limiter, tier lookup and proof work', async () => {
  const { POST } = await preflightRouteModule;
  global.__sonaPreflightRouteMocks = {
    authenticated: null,
    authCalls: 0,
    guard: null,
    guardCalls: 0,
    guardOptions: null,
    strictLimit: { allowed: true, remaining: 1, resetIn: 60000, unavailable: false },
    db: {},
    dbCalls: 0,
    proofCalls: 0,
    proofResult: null,
  };
  const response = await POST({ json: async () => ({}) });

  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'AUTH_REQUIRED');
  assert.equal(global.__sonaPreflightRouteMocks.authCalls, 1);
  assert.equal(global.__sonaPreflightRouteMocks.guardCalls, 0);
  assert.equal(global.__sonaPreflightRouteMocks.dbCalls, 0);
  assert.equal(global.__sonaPreflightRouteMocks.proofCalls, 0);
});

test('malformed JSON returns 400 before database and proof work', async () => {
  const { POST } = await preflightRouteModule;
  global.__sonaPreflightRouteMocks = {
    authenticated: { uid: 'user-malformed', email: 'user@example.com' },
    authCalls: 0,
    guard: { user: { uid: 'user-malformed', email: 'user@example.com', tier: 'studio' } },
    guardCalls: 0,
    guardOptions: null,
    strictLimit: { allowed: true, remaining: 1, resetIn: 60000, unavailable: false },
    db: {},
    dbCalls: 0,
    proofCalls: 0,
    proofResult: null,
  };
  const response = await POST({ json: async () => { throw new SyntaxError('bad json'); } });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'INVALID_TARGET_BRIEF');
  assert.equal(global.__sonaPreflightRouteMocks.guardCalls, 1);
  assert.equal(global.__sonaPreflightRouteMocks.dbCalls, 0);
  assert.equal(global.__sonaPreflightRouteMocks.proofCalls, 0);
});
