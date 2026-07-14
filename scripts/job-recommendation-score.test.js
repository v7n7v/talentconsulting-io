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

async function loadRecommendationModule() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-job-score-'));
  const outfile = path.join(outdir, 'job-score.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'job-recommendation-platform.ts')],
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

const recommendationModule = loadRecommendationModule();

function makeJob(overrides = {}) {
  return {
    id: 'job-1',
    title: 'Senior Security Engineer',
    company: 'Verified Systems',
    location: 'Newark, NJ',
    salary: { min: 120000, max: 145000, currency: 'USD' },
    description: 'NIST incident response and cloud security.',
    skills: ['NIST', 'Incident Response', 'Cloud Security'],
    url: 'https://boards.greenhouse.io/verifiedsystems/jobs/security-engineer',
    postedDate: '2026-07-09T00:00:00.000Z',
    employmentType: 'Full-time',
    source: 'Greenhouse',
    remoteMode: 'hybrid',
    sourceMeta: {
      sourceType: 'direct_ats',
      sourceName: 'Greenhouse',
      sourceConfidence: 'high',
      directApplyUrl: 'https://boards.greenhouse.io/verifiedsystems/jobs/security-engineer',
      canonicalUrl: 'https://boards.greenhouse.io/verifiedsystems/jobs/security-engineer',
      firstSeenAt: '2026-07-09T00:00:00.000Z',
      lastSeenAt: '2026-07-10T00:00:00.000Z',
    },
    dedupeKey: 'verified-systems|senior-security-engineer|newark-nj|url-a',
    identityKey: 'verified-systems|senior-security-engineer|newark-nj',
    keywordScore: 82,
    matchScore: 12,
    ghostRisk: { risk: 'low', score: 8, reasons: [], fresh: true },
    ...overrides,
  };
}

const context = {
  userSkills: ['NIST', 'Incident Response', 'Cloud Security'],
  targetRoles: ['Senior Security Engineer'],
  preferredCities: ['Newark, NJ'],
  remotePref: 'hybrid',
  salaryMin: 120000,
  ledger: new Map(),
};

test('the calibrated Talent Fit weights form one complete score', async () => {
  const { TALENT_FIT_SCORE_POLICY } = await recommendationModule;
  const total = Object.values(TALENT_FIT_SCORE_POLICY).reduce((sum, weight) => sum + weight, 0);
  assert.ok(Math.abs(total - 1) < Number.EPSILON * 10);
});

test('job supply health distinguishes a valid empty search from provider failure', async () => {
  const { isJobSupplyOperational } = await recommendationModule;

  assert.equal(isJobSupplyOperational({
    everJobs: 'empty',
    fallbackUsed: true,
    fallbackStatus: 'empty',
    sources: [],
  }), true);
  assert.equal(isJobSupplyOperational({
    everJobs: 'error',
    fallbackUsed: true,
    fallbackStatus: 'error',
    sources: [],
  }), false);
  assert.equal(isJobSupplyOperational({
    everJobs: 'disabled',
    fallbackUsed: true,
    fallbackStatus: 'success',
    sources: ['Adzuna'],
  }), true);
});

test('an unsupported Ever Jobs success payload cannot become a healthy empty search', async () => {
  const { isJobSupplyOperational, searchTalentJobSupply } = await recommendationModule;
  const originalFetch = global.fetch;
  const previousEnv = {
    enabled: process.env.EVER_JOBS_ENABLED,
    url: process.env.EVER_JOBS_API_URL,
    key: process.env.EVER_JOBS_API_KEY,
    sources: process.env.EVER_JOBS_SAFE_SOURCES,
  };
  process.env.EVER_JOBS_ENABLED = 'true';
  process.env.EVER_JOBS_API_URL = 'https://ever-jobs.test';
  process.env.EVER_JOBS_API_KEY = 'test-key';
  process.env.EVER_JOBS_SAFE_SOURCES = 'greenhouse';
  let everJobsRequest = null;
  global.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith('https://ever-jobs.test')) {
      everJobsRequest = JSON.parse(init.body);
      return new Response(JSON.stringify({ status: 'ok', payloadVersion: 'unexpected' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 500, statusText: 'Unavailable' });
  };

  try {
    const result = await searchTalentJobSupply({
      query: 'Security Engineer',
      location: 'New Jersey',
      country: 'us',
      remote: true,
      page: 1,
      resultsPerPage: 10,
      sortBy: 'relevance',
    });
    assert.equal(result.providerStatus.everJobs, 'error');
    assert.equal(result.providerStatus.fallbackStatus, 'error');
    assert.equal(isJobSupplyOperational(result.providerStatus), false);
    assert.deepEqual(everJobsRequest.siteType, ['greenhouse']);
    assert.equal(everJobsRequest.isRemote, true);
  } finally {
    global.fetch = originalFetch;
    if (previousEnv.enabled === undefined) delete process.env.EVER_JOBS_ENABLED;
    else process.env.EVER_JOBS_ENABLED = previousEnv.enabled;
    if (previousEnv.url === undefined) delete process.env.EVER_JOBS_API_URL;
    else process.env.EVER_JOBS_API_URL = previousEnv.url;
    if (previousEnv.key === undefined) delete process.env.EVER_JOBS_API_KEY;
    else process.env.EVER_JOBS_API_KEY = previousEnv.key;
    if (previousEnv.sources === undefined) delete process.env.EVER_JOBS_SAFE_SOURCES;
    else process.env.EVER_JOBS_SAFE_SOURCES = previousEnv.sources;
  }
});

test('oversized Ever Jobs batches are source-balanced and capped before normalization', async () => {
  const { selectEverJobsRowsForNormalization } = await recommendationModule;
  const row = (source, index, host) => ({
    id: `${source}-${index}`,
    title: `Engineer ${index}`,
    companyName: `${source} company`,
    location: 'Remote',
    site: source,
    jobUrl: `https://${host}/jobs/${index}`,
  });
  const rows = [
    ...Array.from({ length: 8 }, (_, index) => row('himalayas', index, 'himalayas.app')),
    ...Array.from({ length: 8 }, (_, index) => row('remoteok', index, 'remoteok.com')),
    ...Array.from({ length: 8 }, (_, index) => row('remotive', index, 'remotive.com')),
    row('linkedin', 1, 'linkedin.com'),
    row('remoteok', 0, 'remoteok.com'),
  ];
  const selected = selectEverJobsRowsForNormalization(
    rows,
    ['remoteok', 'remotive', 'himalayas'],
    6,
  );
  assert.equal(selected.length, 6);
  assert.deepEqual(selected.map(item => item.site), [
    'remoteok',
    'remotive',
    'himalayas',
    'remoteok',
    'remotive',
    'himalayas',
  ]);
  assert.equal(selected.some(item => item.site === 'linkedin'), false);
  assert.equal(new Set(selected.map(item => `${item.site}:${item.id}`)).size, selected.length);

  const qualityOrdered = selectEverJobsRowsForNormalization([
    row('himalayas', 20, 'himalayas.app'),
    row('greenhouse', 20, 'boards.greenhouse.io'),
  ], ['himalayas', 'greenhouse'], 2);
  assert.deepEqual(qualityOrdered.map(item => item.site), ['greenhouse', 'himalayas']);

  const source = fs.readFileSync(path.join(repoRoot, 'lib/job-recommendation-platform.ts'), 'utf8');
  assert.ok(
    source.indexOf('selectEverJobsRowsForNormalization(rows, sources, requestedLimit)')
      < source.indexOf('selectedRows.map((job: any) => toTalentJob'),
    'Ever Jobs rows must be capped before full Talent job normalization',
  );
});

test('the search adapter never sends its API key to an unvalidated HTTP service URL', async () => {
  const { searchTalentJobSupply } = await recommendationModule;
  const originalFetch = global.fetch;
  const envKeys = [
    'EVER_JOBS_ENABLED',
    'EVER_JOBS_API_URL',
    'EVER_JOBS_API_KEY',
    'EVER_JOBS_SAFE_SOURCES',
    'EVER_JOBS_ALLOW_PRIVATE_HTTP',
  ];
  const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  process.env.EVER_JOBS_ENABLED = 'true';
  process.env.EVER_JOBS_API_URL = 'http://ever-jobs.example:3001';
  process.env.EVER_JOBS_API_KEY = 'must-not-leak';
  process.env.EVER_JOBS_SAFE_SOURCES = 'remoteok';
  delete process.env.EVER_JOBS_ALLOW_PRIVATE_HTTP;
  const requests = [];
  global.fetch = async (input, init = {}) => {
    requests.push({ url: String(input), headers: init.headers || {} });
    return new Response('{}', { status: 500, statusText: 'Unavailable' });
  };

  try {
    const result = await searchTalentJobSupply({
      query: 'Security Engineer',
      location: 'Remote',
      country: 'us',
      page: 1,
      resultsPerPage: 10,
      sortBy: 'relevance',
    });
    assert.equal(result.providerStatus.everJobs, 'disabled');
    assert.equal(requests.some(request => request.url.startsWith('http://ever-jobs.example:3001')), false);
    assert.equal(JSON.stringify(requests).includes('must-not-leak'), false);
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
});

test('composite scoring is stable and never feeds its previous matchScore back into skills', async () => {
  const { finalizeTalentRecommendations, TALENT_FIT_SCORE_VERSION } = await recommendationModule;
  const first = finalizeTalentRecommendations([makeJob()], context)[0];
  const second = finalizeTalentRecommendations([first], context)[0];

  assert.equal(first.fitScore.skills, 82);
  assert.equal(first.fitScore.overall, second.fitScore.overall);
  assert.equal(first.matchScore, first.fitScore.overall);
  assert.equal(first.matchMethod, 'hybrid');
  assert.equal(first.fitScore.scoreVersion, TALENT_FIT_SCORE_VERSION);
});

test('strong evidence can be high confidence while weak sources and high ghost risk are capped', async () => {
  const { finalizeTalentRecommendations, isPreparationEligibleRecommendation } = await recommendationModule;
  const strong = finalizeTalentRecommendations([makeJob()], context)[0];
  const weakSource = finalizeTalentRecommendations([makeJob({
    source: 'Unknown aggregator',
    sourceMeta: {
      ...makeJob().sourceMeta,
      sourceType: 'aggregator',
      sourceName: 'Unknown aggregator',
      sourceConfidence: 'low',
    },
  })], context)[0];
  const ghostRisk = finalizeTalentRecommendations([makeJob({
    ghostRisk: { risk: 'high', score: 92, reasons: ['Posting appears stale.'], fresh: false },
  })], context)[0];

  assert.equal(strong.fitScore.confidence, 'high');
  assert.ok(strong.fitScore.evidenceCoverage >= 75);
  assert.equal(strong.preparationEligible, true);
  assert.equal(isPreparationEligibleRecommendation(strong), true);
  assert.equal(weakSource.fitScore.confidence, 'low');
  assert.ok(weakSource.fitScore.overall <= 68);
  assert.equal(weakSource.nextAction, 'Verify source first');
  assert.equal(weakSource.preparationEligible, false);
  assert.equal(isPreparationEligibleRecommendation(weakSource), false);
  assert.equal(ghostRisk.fitScore.confidence, 'low');
  assert.ok(ghostRisk.fitScore.overall <= 64);
  assert.equal(ghostRisk.preparationEligible, false);
  assert.equal(isPreparationEligibleRecommendation(ghostRisk), false);
});

test('source trust requires an exact approved provider and its real host', async () => {
  const { resolveTalentSourceTrust, finalizeTalentRecommendations, isPreparationEligibleRecommendation } = await recommendationModule;
  const approved = resolveTalentSourceTrust('Greenhouse', 'https://boards.greenhouse.io/verifiedsystems/jobs/123');
  const spoofedLabel = resolveTalentSourceTrust('clever-jobs', 'https://jobs.lever.co/example/123');
  const spoofedHost = resolveTalentSourceTrust('Greenhouse', 'https://jobs.example.com/123');

  assert.deepEqual(
    { approved: approved.approved, sourceType: approved.sourceType, sourceConfidence: approved.sourceConfidence },
    { approved: true, sourceType: 'direct_ats', sourceConfidence: 'high' },
  );
  assert.equal(spoofedLabel.approved, false);
  assert.equal(spoofedLabel.sourceConfidence, 'low');
  assert.equal(spoofedHost.approved, false);

  const forged = finalizeTalentRecommendations([makeJob({
    source: 'clever-jobs',
    url: 'https://jobs.lever.co/example/123',
    sourceMeta: {
      ...makeJob().sourceMeta,
      sourceName: 'clever-jobs',
      directApplyUrl: 'https://jobs.lever.co/example/123',
      canonicalUrl: 'https://jobs.lever.co/example/123',
    },
  })], context)[0];
  assert.equal(isPreparationEligibleRecommendation(forged), false);
});

test('missing resume-skill evidence cannot produce a confident prepare recommendation', async () => {
  const { finalizeTalentRecommendations, isPreparationEligibleRecommendation } = await recommendationModule;
  const job = makeJob({ keywordScore: null, matchScore: 98 });
  const ranked = finalizeTalentRecommendations([job], { ...context, userSkills: [] })[0];

  assert.equal(ranked.fitScore.skills, 55);
  assert.equal(ranked.fitScore.confidence, 'low');
  assert.ok(ranked.fitScore.overall <= 74);
  assert.equal(ranked.nextAction, 'Verify fit evidence');
  assert.match(ranked.recommendationReason, /confidence is low/i);
  assert.equal(ranked.preparationEligible, false);
  assert.equal(isPreparationEligibleRecommendation(ranked), false);
});

test('missing posting-risk evidence stays low confidence and cannot authorize packet work', async () => {
  const { finalizeTalentRecommendations, isPreparationEligibleRecommendation } = await recommendationModule;
  const ranked = finalizeTalentRecommendations([makeJob({ ghostRisk: undefined })], context)[0];

  assert.equal(ranked.fitScore.confidence, 'low');
  assert.ok(ranked.fitScore.overall <= 76);
  assert.equal(isPreparationEligibleRecommendation(ranked), false);
  assert.equal(ranked.nextAction, 'Verify fit evidence');
});

test('location and seniority factors measure their named evidence', async () => {
  const { buildTalentFitBreakdown } = await recommendationModule;
  const aligned = buildTalentFitBreakdown(makeJob(), context);
  const wrongState = buildTalentFitBreakdown(makeJob({ location: 'Austin, TX' }), context);
  const wrongSeniority = buildTalentFitBreakdown(makeJob({ title: 'Junior Security Engineer' }), context);

  assert.ok(aligned.location > wrongState.location);
  assert.ok(aligned.titleSeniority > wrongSeniority.titleSeniority);
  assert.ok(aligned.location >= 88, 'New Jersey should match Newark, NJ after state normalization');
});

test('cross-provider dedupe keeps the strongest source despite harmless identity formatting differences', async () => {
  const { dedupeTalentJobs } = await recommendationModule;
  const aggregator = makeJob({
    id: 'aggregator',
    title: 'Sr. Security Engineer',
    company: 'Verified Systems, Inc.',
    location: 'Newark, NJ (Hybrid)',
    source: 'Aggregator',
    sourceMeta: {
      ...makeJob().sourceMeta,
      sourceType: 'aggregator',
      sourceName: 'Aggregator',
      sourceConfidence: 'low',
    },
  });
  const direct = makeJob({ id: 'direct' });

  const deduped = dedupeTalentJobs([aggregator, direct]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, 'direct');
  assert.equal(deduped[0].sourceMeta.sourceConfidence, 'high');
});

test('dedupe preserves distinct direct requisitions while merging an aggregator copy', async () => {
  const { dedupeTalentJobs } = await recommendationModule;
  const first = makeJob({ id: 'direct-a', sourceJobId: 'req-100', category: 'Platform Security' });
  const second = makeJob({ id: 'direct-b', sourceJobId: 'req-200', category: 'Product Security' });
  const aggregatorCopy = makeJob({
    id: 'aggregator-copy',
    sourceJobId: undefined,
    category: undefined,
    source: 'Aggregator',
    sourceMeta: {
      ...makeJob().sourceMeta,
      sourceType: 'aggregator',
      sourceName: 'Aggregator',
      sourceConfidence: 'low',
    },
  });

  const deduped = dedupeTalentJobs([aggregatorCopy, first, second]);
  assert.equal(deduped.length, 2);
  assert.deepEqual(new Set(deduped.map(job => job.id)), new Set(['direct-a', 'direct-b']));
});

test('same-provider API-board posting ids remain distinct recommendation identities', async () => {
  const { dedupeTalentJobs, normalizeJobIdentity } = await recommendationModule;
  const sourceMeta = {
    ...makeJob().sourceMeta,
    sourceType: 'api_board',
    sourceName: 'Adzuna',
    sourceConfidence: 'medium',
    canonicalUrl: 'https://www.adzuna.com/details/100',
    directApplyUrl: 'https://www.adzuna.com/details/100',
  };
  const first = makeJob({ id: 'adzuna-a', source: 'Adzuna', sourceJobId: '100', sourceMeta });
  const second = makeJob({
    id: 'adzuna-b',
    source: 'Adzuna',
    sourceJobId: '200',
    sourceMeta: {
      ...sourceMeta,
      canonicalUrl: 'https://www.adzuna.com/details/200',
      directApplyUrl: 'https://www.adzuna.com/details/200',
    },
  });

  assert.notEqual(normalizeJobIdentity(first), normalizeJobIdentity(second));
  assert.equal(dedupeTalentJobs([first, second]).length, 2);
  assert.notEqual(
    normalizeJobIdentity({ ...first, sourceJobId: 'REQ-123' }),
    normalizeJobIdentity({ ...first, sourceJobId: 'req_123' }),
  );

  const unprofiledMeta = {
    ...sourceMeta,
    sourceName: 'Regional Careers',
    sourceType: 'aggregator',
    sourceConfidence: 'low',
  };
  assert.equal(dedupeTalentJobs([
    makeJob({ id: 'regional-a', sourceJobId: 'A-1', sourceMeta: unprofiledMeta }),
    makeJob({ id: 'regional-b', sourceJobId: 'B-1', sourceMeta: unprofiledMeta }),
  ]).length, 2);
});

test('manual digest evidence ignores browser scores and requires the current trusted contract', async () => {
  const {
    finalizeTalentRecommendations,
    resolveRecommendationDigestEvidence,
  } = await recommendationModule;
  const ranked = finalizeTalentRecommendations([makeJob()], context)[0];
  const entry = {
    jobKey: ranked.identityKey,
    status: 'shown',
    feedbackTags: [],
    score: ranked.fitScore.overall,
    scoreBreakdown: ranked.fitScore,
    title: ranked.title,
    company: ranked.company,
    location: ranked.location,
    url: ranked.url,
    sourceMeta: ranked.sourceMeta,
    recommendationReason: ranked.recommendationReason,
    nextAction: ranked.nextAction,
    lastSeenAt: new Date().toISOString(),
  };
  const request = { ...ranked, acceptanceChance: 1, recommendationReason: 'Forged browser reason' };
  const resolved = resolveRecommendationDigestEvidence(new Map([[ranked.identityKey, entry]]), request);

  assert.equal(resolved.talentFitScore, ranked.fitScore.overall);
  assert.equal(resolved.reason, ranked.recommendationReason);
  assert.equal(resolved.sourceConfidence, 'high');
  assert.equal(resolveRecommendationDigestEvidence(new Map([[ranked.identityKey, {
    ...entry,
    score: 99,
  }]]), request), null);
  assert.equal(resolveRecommendationDigestEvidence(new Map([[ranked.identityKey, {
    ...entry,
    scoreBreakdown: { ...ranked.fitScore, scoreVersion: 'stale-score' },
  }]]), request), null);
  assert.equal(resolveRecommendationDigestEvidence(new Map([[ranked.identityKey, {
    ...entry,
    lastSeenAt: new Date(Date.now() - (25 * 60 * 60 * 1000)).toISOString(),
  }]]), request), null);
});

test('outbound job links require an approved provider, matching metadata and HTTPS', async () => {
  const { finalizeTalentRecommendations, getTrustedTalentJobApplyUrl } = await recommendationModule;
  assert.equal(getTrustedTalentJobApplyUrl(makeJob()), makeJob().url);
  assert.equal(getTrustedTalentJobApplyUrl(makeJob({
    url: 'https://attacker.example/jobs/1',
    sourceMeta: {
      ...makeJob().sourceMeta,
      directApplyUrl: 'https://attacker.example/jobs/1',
    },
  })), null);
  assert.equal(getTrustedTalentJobApplyUrl(makeJob({
    url: 'http://boards.greenhouse.io/verifiedsystems/jobs/1',
    sourceMeta: {
      ...makeJob().sourceMeta,
      canonicalUrl: 'http://boards.greenhouse.io/verifiedsystems/jobs/1',
      directApplyUrl: 'http://boards.greenhouse.io/verifiedsystems/jobs/1',
    },
  })), null);
  const trusted = finalizeTalentRecommendations([makeJob()], context)[0];
  const untrusted = finalizeTalentRecommendations([makeJob({
    url: 'https://attacker.example/jobs/1',
    sourceMeta: { ...makeJob().sourceMeta, directApplyUrl: 'https://attacker.example/jobs/1' },
  })], context)[0];
  assert.equal(trusted.outboundLinkVerified, true);
  assert.equal(trusted.url, makeJob().url);
  assert.equal(untrusted.outboundLinkVerified, false);
  assert.equal(untrusted.url, '');
});

test('search and automated preparation paths use the versioned composite contract', () => {
  const searchRoute = fs.readFileSync(path.join(repoRoot, 'app/api/jobs/search/route.ts'), 'utf8');
  const suggestionsRoute = fs.readFileSync(path.join(repoRoot, 'app/api/jobs/suggestions/route.ts'), 'utf8');
  const harness = fs.readFileSync(path.join(repoRoot, 'lib/sona/agent-harness.ts'), 'utf8');
  const cron = fs.readFileSync(path.join(repoRoot, 'app/api/cron/agent-pipeline/route.ts'), 'utf8');
  const weeklyCron = fs.readFileSync(path.join(repoRoot, 'app/api/cron/weekly-suggestions/route.ts'), 'utf8');
  const jobSearchPage = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/page.tsx'), 'utf8');
  const ledgerRoute = fs.readFileSync(path.join(repoRoot, 'app/api/jobs/ledger/route.ts'), 'utf8');
  const notifyRoute = fs.readFileSync(path.join(repoRoot, 'app/api/jobs/notify/route.ts'), 'utf8');
  const emailTemplates = fs.readFileSync(path.join(repoRoot, 'lib/email-templates.ts'), 'utf8');
  const weeklyPicks = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/WeeklyPicksSection.tsx'), 'utf8');

  assert.doesNotMatch(searchRoute, /matchScore:\s*evidenceScore/);
  assert.match(searchRoute, /scoreVersion: TALENT_FIT_SCORE_VERSION/);
  assert.match(suggestionsRoute, /scoreVersion: TALENT_FIT_SCORE_VERSION/);
  assert.ok(harness.indexOf('isPreparationEligibleRecommendation(job)') < harness.indexOf('Morph this resume for the target job'));
  assert.ok(cron.indexOf('isPreparationEligibleRecommendation(job)') < cron.indexOf('generateGuardedMorphDraft({'));
  assert.match(harness, /dedupeTalentJobs\(rawJobs\)/);
  assert.match(cron, /dedupeTalentJobs\(allJobs\)/);
  assert.match(jobSearchPage, /sourceJobId:\s*job\.sourceJobId/);
  assert.match(jobSearchPage, /category:\s*job\.category/);
  assert.match(ledgerRoute, /preserveEvidence: true/);
  assert.doesNotMatch(ledgerRoute, /matchScore:\s*typeof job\.matchScore|fitBreakdown:\s*job\.fitBreakdown|sourceMeta:\s*job\.sourceMeta/);
  assert.match(notifyRoute, /resolveRecommendationDigestEvidence\(ledger, job\)/);
  assert.doesNotMatch(notifyRoute, /Math\.max\(\.\.\.jobs\.map\(j => j\.acceptanceChance\)\)/);
  assert.match(notifyRoute, /RECOMMENDATION_EVIDENCE_STALE/);
  assert.match(notifyRoute, /isJobEmailDeliveryLockActive\(latestPrefs\.jobAlertsDeliveryLockUntil\)/);
  assert.match(suggestionsRoute, /outboundLinkVerified: Boolean\(trustedApplyUrl\)/);
  assert.match(weeklyCron, /getTrustedTalentJobApplyUrl\(job\)/);
  assert.match(emailTemplates, /trustedJobDigestUrl\(job\.sourceName, job\.viewUrl \|\| job\.url\)/);
  assert.doesNotMatch(emailTemplates, /safeHttpUrl\(viewUrl\)/);
  assert.match(weeklyPicks, /jobs\.filter\(job => job\.outboundLinkVerified && job\.url\)/);
});
