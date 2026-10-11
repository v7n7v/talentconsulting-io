const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

function loadAgentHarness() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-agent-harness-'));
  const outfile = path.join(outdir, 'agent-harness.cjs');
  const resolveRootImport = importPath => {
    const base = path.join(repoRoot, importPath.slice(2));
    const candidates = [
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      `${base}.jsx`,
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
      path.join(base, 'index.js'),
      base,
    ];
    const found = candidates.find(candidate => fs.existsSync(candidate));
    return found || base;
  };

  return build({
    entryPoints: [path.join(repoRoot, 'lib', 'assistant', 'agent-harness.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    external: [
      'firebase-admin',
      'next',
      'next/*',
    ],
    plugins: [
      {
        name: 'alias-root',
        setup(build) {
          build.onResolve({ filter: /^@\/lib\/firebase-admin$/ }, () => ({
            path: 'firebase-admin-stub',
            namespace: 'stub',
          }));
          build.onLoad({ filter: /^firebase-admin-stub$/, namespace: 'stub' }, () => ({
            contents: `
              exports.getAdminDb = function getAdminDb() {
                throw new Error('getAdminDb is stubbed in sona-agent-harness.test');
              };
              exports.getAdminAuth = function getAdminAuth() {
                throw new Error('getAdminAuth is stubbed in sona-agent-harness.test');
              };
            `,
            loader: 'js',
          }));
          build.onResolve({ filter: /^@\// }, args => ({
            path: resolveRootImport(args.path),
          }));
        },
      },
    ],
  }).then(() => require(outfile));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSnapshot(id, data) {
  return {
    id,
    exists: Boolean(data),
    data: () => deepClone(data || {}),
  };
}

function createFakeFirestore(seed = {}) {
  const docs = new Map(Object.entries(seed).map(([key, value]) => [key, deepClone(value)]));
  const writes = [];
  let transactionTail = Promise.resolve();

  function collectionPath(parentPath, name) {
    return parentPath ? `${parentPath}/${name}` : name;
  }

  function createDocRef(docPath) {
    const id = docPath.split('/').pop();
    return {
      id,
      async get() {
        return createSnapshot(id, docs.get(docPath));
      },
      async set(data, options = {}) {
        const current = options.merge && docs.has(docPath) ? docs.get(docPath) : {};
        const next = options.merge ? { ...current, ...deepClone(data) } : deepClone(data);
        docs.set(docPath, next);
        writes.push({ type: 'set', path: docPath, data: deepClone(data), options });
      },
      collection(name) {
        return createCollectionRef(collectionPath(docPath, name));
      },
    };
  }

  function createCollectionRef(pathName) {
    let limitCount = null;
    const ref = {
      doc(id = `doc_${writes.length + 1}`) {
        return createDocRef(collectionPath(pathName, id));
      },
      async add(data) {
        const id = `add_${writes.length + 1}`;
        const docPath = collectionPath(pathName, id);
        docs.set(docPath, deepClone(data));
        writes.push({ type: 'add', path: docPath, id, data: deepClone(data) });
        return { id };
      },
      orderBy() {
        return ref;
      },
      limit(count) {
        limitCount = count;
        return ref;
      },
      async get() {
        const prefix = `${pathName}/`;
        const rows = [];
        for (const [docPath, data] of docs.entries()) {
          const rest = docPath.startsWith(prefix) ? docPath.slice(prefix.length) : '';
          if (rest && !rest.includes('/')) {
            rows.push(createSnapshot(rest, data));
          }
        }
        const limited = typeof limitCount === 'number' ? rows.slice(0, limitCount) : rows;
        return {
          empty: limited.length === 0,
          docs: limited,
        };
      },
    };
    return ref;
  }

  return {
    writes,
    docs,
    runTransaction(callback) {
      const run = transactionTail.then(() => callback({
        get: ref => ref.get(),
        set: (ref, data, options) => ref.set(data, options),
      }));
      transactionTail = run.then(() => undefined, () => undefined);
      return run;
    },
    collection(name) {
      return createCollectionRef(name);
    },
  };
}

const resume = {
  name: 'Candidate One',
  title: 'Security Engineer',
  summary: 'Security engineer with NIST, incident response, and wireless systems experience.',
  skills: ['NIST', 'incident response', 'wireless systems', 'Python'],
  experience: [
    {
      role: 'Security Analyst',
      company: 'ExampleCo',
      bullets: ['Monitored wireless systems and reduced incident response time.'],
    },
  ],
  education: [
    {
      degree: 'Bachelor of Science',
      institution: 'State University',
      year: '2022',
    },
  ],
};

const job = {
  title: 'Security Engineer',
  company: 'Lockheed Martin',
  location: 'Moorestown, NJ',
  url: 'https://boards.greenhouse.io/lockheedmartin/jobs/security-engineer',
  description: 'Hybrid security engineering role using NIST, incident response, wireless systems, Python, and audit controls.',
  skills: ['NIST', 'incident response', 'wireless systems', 'Python'],
  salary: { min: 121000, max: 132000, currency: 'USD', interval: 'year' },
  source: 'Greenhouse',
  remoteMode: 'hybrid',
  employmentType: 'Full-time',
  // This fixture exercises a fresh, preparation-eligible posting on any run date.
  postedDate: new Date(Date.now() - 2 * 86400000).toISOString(),
  sourceMeta: {
    sourceType: 'direct_ats',
    sourceName: 'Greenhouse',
    sourceConfidence: 'high',
    directApplyUrl: 'https://boards.greenhouse.io/lockheedmartin/jobs/security-engineer',
    canonicalUrl: 'https://boards.greenhouse.io/lockheedmartin/jobs/security-engineer',
    firstSeenAt: '2026-07-08T00:00:00.000Z',
    lastSeenAt: '2026-07-09T00:00:00.000Z',
  },
  dedupeKey: 'lockheed martin|security engineer|moorestown nj',
  matchScore: 88,
  ghostRisk: {
    risk: 'low',
    score: 8,
    reasons: [],
    fresh: true,
  },
};

function healthyPrimarySupply() {
  return {
    enabled: true,
    configured: true,
    preparationConfigured: true,
    serviceHost: 'ever-jobs.internal',
    hasApiKey: true,
    safeSources: ['greenhouse'],
    unsafeSources: [],
    missing: [],
    status: 'healthy',
    preparationReady: true,
    checkedAt: '2026-07-10T05:00:00.000Z',
    latencyMs: 12,
    endpoint: '/health',
    message: 'Ever Jobs primary supply is healthy.',
  };
}

test('runSonaAgentHarness writes a prepared packet with fit, risk and source evidence', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({
    'users/user-123': {
      email: 'candidate@example.com',
      fullName: 'Candidate One',
    },
  });
  const groqCalls = [];
  const ledgerWrites = [];

  const result = await runSonaAgentHarness(db, 'user-123', {
    userRequest: 'I want a $120k hybrid security engineer job in New Jersey.',
    mode: 'prepare',
    tier: 'studio',
    notify: false,
    maxPackets: 1,
  }, {
    getUserTier: async () => 'studio',
    loadJobPreferences: async () => ({
      targetRoles: ['Security Engineer'],
      preferredCities: ['New Jersey'],
      salaryMin: 120000,
      remotePref: 'hybrid',
    }),
    getLatestResumeForUser: async () => ({
      resume,
      source: 'resume_versions',
      id: 'resume-active',
      updatedAt: '2026-07-09T00:00:00.000Z',
    }),
    probeJobSupplyHealth: async () => healthyPrimarySupply(),
    interpretGoal: async () => ({
      targetRole: 'Security Engineer',
      location: 'New Jersey',
      salaryTarget: 120000,
      remotePreference: 'hybrid',
      keywords: ['NIST', 'wireless'],
      confidence: 0.94,
    }),
    searchTalentJobSupply: async () => ({
      jobs: [job],
      totalCount: 1,
      source: 'mock',
      providerStatus: {
        everJobs: 'success',
        fallbackUsed: false,
        sources: ['Greenhouse'],
      },
    }),
    loadRecommendationLedger: async () => new Map(),
    getResumeMorphConsentForUser: async () => ({
      unlocked100: false,
      acceptedAt: null,
      consentVersion: null,
    }),
    groqJSONCompletion: async systemPrompt => {
      groqCalls.push(systemPrompt);
      if (systemPrompt.includes('Morph this resume')) {
        return {
          morphedResume: {
            ...resume,
            summary: 'Security engineer focused on NIST, incident response, and wireless systems for hybrid defense roles.',
          },
        };
      }
      return {
        coverLetter: 'I am interested in this security engineering role because it matches my NIST and wireless systems background.',
      };
    },
    upsertRecommendationLedger: async (_db, uid, queuedJob, status, opts) => {
      ledgerWrites.push({ uid, title: queuedJob.title, status, opts });
    },
    invalidateTwin: async () => {},
  });

  assert.equal(result.success, true);
  assert.equal(result.status, 'prepared');
  assert.equal(result.entitlement.plan, 'max');
  assert.equal(result.entitlement.maxPreparedPackets, 1);
  assert.equal(result.entitlement.costEnvelope.modelCallsMax, 3);
  assert.equal(result.queuedCount, 1);
  assert.equal(result.queued[0].packetStatus, 'prepared');
  assert.equal(result.queued[0].title, 'Security Engineer');
  assert.equal(result.queued[0].fitSignals.some(signal => signal.includes('Security Engineer')), true);
  assert.equal(result.queued[0].sourceNotes.some(note => note.includes('Direct ATS')), true);
  assert.equal(result.notification.emailSent, false);
  assert.equal(result.notification.emailSkippedReason, 'Notification disabled for this run');

  const queueWrite = db.writes.find(write => write.type === 'add' && write.path.includes('/agent_queue/'));
  assert.ok(queueWrite, 'expected an agent_queue write');
  assert.equal(queueWrite.data.job_title, 'Security Engineer');
  assert.equal(queueWrite.data.company, 'Lockheed Martin');
  assert.equal(queueWrite.data.packetStatus, 'prepared');
  assert.equal(queueWrite.data.sourceMeta.sourceName, 'Greenhouse');
  assert.equal(queueWrite.data.morphed_resume.education[0].institution, 'State University');
  assert.equal(queueWrite.data.cover_letter.includes('security engineering role'), true);
  assert.equal(Array.isArray(queueWrite.data.fitSignals), true);
  assert.equal(queueWrite.data.fitSignals.length > 0, true);
  assert.equal(Array.isArray(queueWrite.data.riskSignals), true);
  assert.equal(queueWrite.data.nextAction.includes('Review Taco'), true);
  assert.equal(queueWrite.data.goal.salaryTarget, 120000);

  const versionWrite = db.writes.find(write => write.type === 'add' && write.path.includes('/resume_versions/'));
  assert.ok(versionWrite, 'expected a prepared resume version write');
  assert.equal(versionWrite.data.morph_effective_percentage, 80);

  assert.equal(ledgerWrites.length, 1);
  assert.equal(ledgerWrites[0].status, 'prepared');
  assert.equal(groqCalls.length, 2);

  const finalRunWrite = db.writes
    .filter(write => write.type === 'set' && write.path.includes('/agent_runs/'))
    .at(-1);
  assert.equal(finalRunWrite.data.economics.actual.searchQueries, 1);
  assert.equal(finalRunWrite.data.economics.actual.rankedRoles, 1);
  assert.equal(finalRunWrite.data.economics.actual.resumeMorphAttempts, 1);
  assert.equal(finalRunWrite.data.economics.actual.coverLetterAttempts, 1);
  assert.equal(finalRunWrite.data.economics.actual.emailDigestChecks, 0);
  assert.equal(finalRunWrite.data.economics.actual.emailDigestsSent, 0);
  assert.equal(finalRunWrite.data.economics.attribution.status, 'recorded');
  assert.equal(finalRunWrite.data.economics.attribution.usefulOutcome, 'prepared_packet');
  assert.equal(finalRunWrite.data.economics.attribution.firstUsefulOutcome, true);
  assert.ok(db.docs.get(`sona_economics_events/${result.runId}`));
});

test('Max keeps a weak recommendation review-only without spending packet model calls', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/weak-fit': { email: 'weak@example.com' } });
  let packetModelCalls = 0;
  const weakJob = {
    ...job,
    id: 'weak-job',
    title: 'Marketing Director',
    description: 'Brand strategy, paid media, demand generation, and campaign leadership.',
    skills: ['Brand Strategy', 'Paid Media', 'Demand Generation'],
    url: 'https://careers.example.com/marketing-director',
    sourceMeta: {
      ...job.sourceMeta,
      directApplyUrl: 'https://careers.example.com/marketing-director',
      canonicalUrl: 'https://careers.example.com/marketing-director',
    },
    dedupeKey: 'lockheed martin|marketing director|moorestown nj',
    identityKey: 'lockheed martin|marketing director|moorestown nj',
    keywordScore: null,
    matchScore: 99,
  };

  const result = await runSonaAgentHarness(db, 'weak-fit', {
    userRequest: 'Prepare a security engineer packet in New Jersey.',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    mode: 'prepare',
    tier: 'studio',
    notify: false,
  }, {
    loadJobPreferences: async () => ({}),
    getLatestResumeForUser: async () => ({ resume, source: 'resume_versions', id: 'resume-weak', updatedAt: null }),
    probeJobSupplyHealth: async () => healthyPrimarySupply(),
    interpretGoal: async () => ({
      targetRole: 'Security Engineer', location: 'New Jersey', salaryTarget: 0,
      remotePreference: 'hybrid', keywords: [], confidence: 0.9,
    }),
    searchTalentJobSupply: async () => ({
      jobs: [weakJob], totalCount: 1, source: 'Ever Jobs',
      providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
    }),
    loadRecommendationLedger: async () => new Map(),
    getResumeMorphConsentForUser: async () => ({ unlocked100: false, acceptedAt: null, consentVersion: null }),
    groqJSONCompletion: async () => { packetModelCalls += 1; return {}; },
    upsertRecommendationLedger: async () => {},
    invalidateTwin: async () => {},
  });

  assert.equal(result.success, true);
  assert.equal(result.status, 'scouted');
  assert.equal(result.queuedCount, 1);
  assert.equal(result.queued[0].packetStatus, 'needs_review');
  assert.equal(result.queued[0].resumeVersionId, null);
  assert.equal(packetModelCalls, 0);
  assert.equal(result.warnings.some(warning => warning.includes('packet threshold')), true);
  assert.equal(db.writes.some(write => write.path.includes('/resume_versions/')), false);
});

test('Max preparation fails closed before quota, search, model or queue work when primary supply is unavailable', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/supply-blocked': { email: 'blocked@example.com' } });
  const calls = { reserve: 0, interpret: 0, search: 0, model: 0 };

  const result = await runSonaAgentHarness(db, 'supply-blocked', {
    userRequest: 'Prepare a hybrid security engineer packet in New Jersey.',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    mode: 'prepare',
    tier: 'studio',
    notify: true,
  }, {
    getUserTier: async () => 'studio',
    loadJobPreferences: async () => ({}),
    getLatestResumeForUser: async () => ({ resume, source: 'resume_versions', id: 'resume-safe', updatedAt: null }),
    probeJobSupplyHealth: async () => ({
      ...healthyPrimarySupply(),
      enabled: false,
      configured: false,
      preparationConfigured: false,
      hasApiKey: false,
      status: 'disabled',
      preparationReady: false,
      endpoint: null,
      latencyMs: null,
      message: 'Ever Jobs is disabled.',
    }),
    reservePaidWorkloadRun: async () => {
      calls.reserve += 1;
      return { allowed: true, reason: null, used: 0, cap: 40, resetsAt: '2026-07-11T00:00:00.000Z' };
    },
    interpretGoal: async () => {
      calls.interpret += 1;
      throw new Error('goal interpretation must not run');
    },
    searchTalentJobSupply: async () => {
      calls.search += 1;
      throw new Error('job supply search must not run');
    },
    groqJSONCompletion: async () => {
      calls.model += 1;
      throw new Error('model generation must not run');
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'PRIMARY_JOB_SUPPLY_UNAVAILABLE');
  assert.equal(result.canScout, true);
  assert.equal(result.canPrepareAssets, false);
  assert.equal(result.queuedCount, 0);
  assert.equal(result.notification.emailSent, false);
  assert.deepEqual(calls, { reserve: 0, interpret: 0, search: 0, model: 0 });
  assert.equal(db.writes.length, 0);
});

test('Max preparation stops when a healthy probe degrades to fallback during the actual search', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/fallback-race': { email: 'race@example.com' } });
  let modelCalls = 0;

  const result = await runSonaAgentHarness(db, 'fallback-race', {
    userRequest: 'Prepare a hybrid security engineer packet in New Jersey.',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    mode: 'prepare',
    tier: 'studio',
    notify: true,
  }, {
    loadJobPreferences: async () => ({}),
    getLatestResumeForUser: async () => ({ resume, source: 'resume_versions', id: 'resume-race', updatedAt: null }),
    probeJobSupplyHealth: async () => healthyPrimarySupply(),
    interpretGoal: async () => ({
      targetRole: 'Security Engineer',
      location: 'New Jersey',
      salaryTarget: 0,
      remotePreference: 'hybrid',
      keywords: [],
      confidence: 0.9,
    }),
    searchTalentJobSupply: async () => ({
      jobs: [job],
      totalCount: 1,
      source: 'Talent fallback',
      providerStatus: { everJobs: 'error', fallbackUsed: true, sources: ['Adzuna'] },
    }),
    loadRecommendationLedger: async () => new Map(),
    groqJSONCompletion: async () => {
      modelCalls += 1;
      throw new Error('generation must not run');
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'PRIMARY_JOB_SUPPLY_UNAVAILABLE');
  assert.equal(result.canScout, true);
  assert.equal(result.canPrepareAssets, false);
  assert.equal(result.queuedCount, 0);
  assert.equal(modelCalls, 0);
  assert.equal(db.writes.some(write => write.path.includes('/agent_queue/')), false);
  assert.equal(db.writes.some(write => write.path.includes('/resume_versions/')), false);
  assert.equal(db.writes.some(write => write.path.includes('/agent_notifications/')), false);
  const usage = db.docs.get('users/fallback-race/usage/sona_daily');
  assert.equal(usage.runsReserved, 1);
  assert.equal(usage.modelCallsReserved, 1);
  assert.equal(usage.preparedPacketsReserved, 0);
  assert.equal(usage.runningRunId, null);
});

test('a failed fallback-race reconciliation retries lock release and reports the unresolved allowance', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/reconcile-failure': { email: 'reconcile@example.com' } });
  let releaseCalls = 0;
  let modelCalls = 0;

  const result = await runSonaAgentHarness(db, 'reconcile-failure', {
    userRequest: 'Prepare a security engineer packet in New Jersey.',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    mode: 'prepare',
    tier: 'studio',
    notify: false,
  }, {
    loadJobPreferences: async () => ({}),
    getLatestResumeForUser: async () => ({ resume, source: 'resume_versions', id: 'resume-reconcile', updatedAt: null }),
    probeJobSupplyHealth: async () => healthyPrimarySupply(),
    interpretGoal: async () => ({
      targetRole: 'Security Engineer', location: 'New Jersey', salaryTarget: 0,
      remotePreference: 'hybrid', keywords: [], confidence: 0.9,
    }),
    searchTalentJobSupply: async () => ({
      jobs: [job], totalCount: 1, source: 'Talent fallback',
      providerStatus: { everJobs: 'error', fallbackUsed: true, sources: ['Adzuna'] },
    }),
    loadRecommendationLedger: async () => new Map(),
    cancelPaidWorkloadRun: async () => { throw new Error('transaction unavailable'); },
    releasePaidWorkloadRun: async () => { releaseCalls += 1; },
    groqJSONCompletion: async () => { modelCalls += 1; return {}; },
  });

  assert.equal(result.code, 'PRIMARY_JOB_SUPPLY_UNAVAILABLE');
  assert.equal(result.workloadReconciled, false);
  assert.equal(releaseCalls, 1);
  assert.equal(modelCalls, 0);
  assert.equal(result.warnings.some(warning => warning.includes('reconcile')), true);
  assert.equal(db.writes.some(write => write.path.includes('/agent_queue/')), false);
});

test('free users receive one three-role scout without prepared application assets', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({
    'users/free-user': {
      email: 'free@example.com',
      fullName: 'Free Candidate',
    },
  });
  const ledgerWrites = [];
  let interpretCalls = 0;
  let searchCalls = 0;

  const scoutJobs = [
    job,
    {
      ...job,
      id: 'job-two',
      title: 'Cybersecurity Engineer',
      company: 'Princeton Systems',
      url: 'https://careers.example.com/cybersecurity-engineer',
      sourceMeta: {
        ...job.sourceMeta,
        directApplyUrl: 'https://careers.example.com/cybersecurity-engineer',
        canonicalUrl: 'https://careers.example.com/cybersecurity-engineer',
      },
      dedupeKey: 'princeton systems|cybersecurity engineer|moorestown nj',
    },
    {
      ...job,
      id: 'job-three',
      title: 'Product Security Engineer',
      company: 'Garden State Labs',
      url: 'https://careers.example.com/product-security-engineer',
      sourceMeta: {
        ...job.sourceMeta,
        directApplyUrl: 'https://careers.example.com/product-security-engineer',
        canonicalUrl: 'https://careers.example.com/product-security-engineer',
      },
      dedupeKey: 'garden state labs|product security engineer|moorestown nj',
    },
  ];
  const deps = {
    getUserTier: async () => 'free',
    loadJobPreferences: async () => ({}),
    getLatestResumeForUser: async () => ({
      resume,
      source: 'resume_versions',
      id: 'resume-free',
      updatedAt: '2026-07-09T00:00:00.000Z',
    }),
    interpretGoal: async () => {
      interpretCalls += 1;
      return {
        targetRole: 'Security Engineer',
        location: 'New Jersey',
        salaryTarget: 120000,
        remotePreference: 'hybrid',
        keywords: ['NIST'],
        confidence: 0.95,
      };
    },
    searchTalentJobSupply: async () => {
      searchCalls += 1;
      return {
        jobs: scoutJobs,
        totalCount: scoutJobs.length,
        source: 'mock',
        providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
      };
    },
    loadRecommendationLedger: async () => new Map(),
    getResumeMorphConsentForUser: async () => ({ unlocked100: false, acceptedAt: null, consentVersion: null }),
    maybeSendDigest: async () => ({ sent: false, reason: 'Notification disabled for this run' }),
    upsertRecommendationLedger: async (_db, uid, queuedJob, status, opts) => {
      ledgerWrites.push({ uid, queuedJob, status, opts });
    },
    invalidateTwin: async () => {},
  };

  const first = await runSonaAgentHarness(db, 'free-user', {
    userRequest: 'Find a $120k hybrid security engineer job in New Jersey.',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    salaryTarget: 120000,
    remotePreference: 'hybrid',
    mode: 'scout',
    tier: 'free',
    notify: false,
  }, deps);

  assert.equal(first.success, true);
  assert.equal(first.status, 'scouted');
  assert.equal(first.entitlement.plan, 'free');
  assert.equal(first.entitlement.maxRankedRoles, 3);
  assert.equal(first.entitlement.maxPreparedPackets, 0);
  assert.equal(first.canPrepareAssets, false);
  assert.equal(first.queuedCount, 3);
  assert.equal(first.queued.every(item => item.packetStatus === 'needs_review'), true);
  assert.equal(first.queued.every(item => item.resumeVersionId === null), true);
  assert.equal(ledgerWrites.length, 3);
  assert.equal(ledgerWrites.every(write => write.status === 'queued'), true);
  assert.equal(db.writes.some(write => write.path.includes('/resume_versions/')), false);
  assert.equal(Boolean(db.docs.get('users/free-user/settings/sonaFreeScout')?.completedAt), true);

  const second = await runSonaAgentHarness(db, 'free-user', {
    userRequest: 'Run that scout again.',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    tier: 'free',
    notify: false,
  }, deps);

  assert.equal(second.success, false);
  assert.equal(second.queuedCount, 0);
  assert.match(second.error, /free Taco scout is complete/i);
  assert.equal(interpretCalls, 1, 'the rejected second scout must not call goal interpretation');
  assert.equal(searchCalls, 1, 'the rejected second scout must not call job supply');
});

test('a writable stored email cannot elevate an internal harness call', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({
    'users/untrusted-email': { email: 'alula2006@gmail.com', fullName: 'Untrusted Profile' },
  });
  let generatedAssets = 0;

  const result = await runSonaAgentHarness(db, 'untrusted-email', {
    userRequest: 'Prepare security engineer packets in New Jersey.',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    mode: 'prepare',
    maxPackets: 8,
    notify: false,
  }, {
    getUserTier: async () => 'god',
    loadJobPreferences: async () => ({}),
    getLatestResumeForUser: async () => ({ resume, source: 'resume_versions', id: 'resume-untrusted', updatedAt: null }),
    interpretGoal: async () => ({
      targetRole: 'Security Engineer', location: 'New Jersey', salaryTarget: 0,
      remotePreference: 'any', keywords: [], confidence: 0.9,
    }),
    searchTalentJobSupply: async () => ({
      jobs: [job], totalCount: 1, source: 'mock',
      providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
    }),
    loadRecommendationLedger: async () => new Map(),
    getResumeMorphConsentForUser: async () => ({ unlocked100: false, acceptedAt: null, consentVersion: null }),
    groqJSONCompletion: async () => {
      generatedAssets += 1;
      return {};
    },
    upsertRecommendationLedger: async () => {},
    maybeSendDigest: async () => ({ sent: false, reason: 'Notification disabled for this run' }),
    invalidateTwin: async () => {},
  });

  assert.equal(result.tier, 'free');
  assert.equal(result.entitlement.plan, 'free');
  assert.equal(result.mode, 'scout');
  assert.equal(result.canPrepareAssets, false);
  assert.equal(generatedAssets, 0);
});

test('an incomplete target brief is blocked without inventing a role or location', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/brief-user': { email: 'brief@example.com' } });
  const resumeWithoutTarget = { ...resume, title: '', location: '' };
  let interpreted = false;

  const result = await runSonaAgentHarness(db, 'brief-user', {
    userRequest: 'Find something good for me.',
    tier: 'free',
    notify: false,
  }, {
    getUserTier: async () => 'free',
    loadJobPreferences: async () => ({}),
    getLatestResumeForUser: async () => ({
      resume: resumeWithoutTarget,
      source: 'resume_versions',
      id: 'resume-brief',
      updatedAt: '2026-07-09T00:00:00.000Z',
    }),
    interpretGoal: async () => {
      interpreted = true;
      throw new Error('interpretGoal should not run for an incomplete brief');
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.needsTargetBrief, true);
  assert.deepEqual(result.missingTargetFields, ['target role', 'location']);
  assert.equal(result.goal.targetRole, '');
  assert.equal(result.goal.location, '');
  assert.equal(interpreted, false);
  assert.equal(db.writes.length, 0);
});

test('a terminal harness failure records incurred economics before surfacing the error', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/failed-run-user': { fullName: 'Failed Run' } });

  await assert.rejects(() => runSonaAgentHarness(db, 'failed-run-user', {
    userRequest: 'Find security engineer roles in New Jersey.',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    tier: 'pro',
    notify: false,
  }, {
    loadJobPreferences: async () => ({}),
    getLatestResumeForUser: async () => ({
      resume,
      source: 'resume_versions',
      id: 'resume-failed-run',
      updatedAt: '2026-07-10T00:00:00.000Z',
    }),
    interpretGoal: async () => {
      throw new Error('provider failed after request start');
    },
    invalidateTwin: async () => {},
  }), /provider failed after request start/);

  const failedEvent = [...db.docs.entries()]
    .find(([docPath]) => docPath.startsWith('sona_economics_events/'))?.[1];
  assert.ok(failedEvent);
  assert.equal(failedEvent.terminalStatus, 'failed');
  assert.equal(failedEvent.usefulOutcome, null);
  assert.equal(failedEvent.estimatedCostMicros, 700);
  assert.equal(failedEvent.actual.rankedRoles, 0);
});

test('a verified resume can provide a safe starting role and location', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/resume-default-user': { email: 'resume-default@example.com' } });
  const resumeWithLocation = { ...resume, location: 'New Jersey' };
  let searched = false;

  const result = await runSonaAgentHarness(db, 'resume-default-user', {
    userRequest: 'Find a good next role for me.',
    tier: 'free',
    notify: false,
  }, {
    getUserTier: async () => 'free',
    loadJobPreferences: async () => ({}),
    getLatestResumeForUser: async () => ({
      resume: resumeWithLocation,
      source: 'resume_versions',
      id: 'resume-default',
      updatedAt: '2026-07-09T00:00:00.000Z',
    }),
    interpretGoal: async () => ({
      targetRole: 'Security Engineer',
      location: 'New Jersey',
      salaryTarget: 0,
      remotePreference: 'any',
      keywords: [],
      confidence: 0.8,
    }),
    searchTalentJobSupply: async () => {
      searched = true;
      return {
        jobs: [job],
        totalCount: 1,
        source: 'mock',
        providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
      };
    },
    loadRecommendationLedger: async () => new Map(),
    getResumeMorphConsentForUser: async () => ({ unlocked100: false, acceptedAt: null, consentVersion: null }),
    upsertRecommendationLedger: async () => {},
    maybeSendDigest: async () => ({ sent: false, reason: 'Notification disabled for this run' }),
  });

  assert.equal(result.needsTargetBrief, undefined);
  assert.equal(result.goal.targetRole, 'Security Engineer');
  assert.equal(result.goal.location, 'New Jersey');
  assert.equal(searched, true);
});

test('the harness uses the selected verified resume instead of a newer default', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/selected-resume-user': { email: 'selected@example.com' } });
  let latestCalls = 0;
  let selectedCalls = 0;
  const selectedResume = {
    ...resume,
    title: 'Selected Security Engineer',
    skills: ['Selected Resume Skill', 'NIST'],
  };

  const result = await runSonaAgentHarness(db, 'selected-resume-user', {
    userRequest: 'Find security engineer roles in New Jersey.',
    resumeVersionId: 'selected-resume-42',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    mode: 'scout',
    tier: 'free',
    notify: false,
  }, {
    loadJobPreferences: async () => ({}),
    getVerifiedResumeForUserById: async (_db, uid, resumeId) => {
      selectedCalls += 1;
      assert.equal(uid, 'selected-resume-user');
      assert.equal(resumeId, 'selected-resume-42');
      return { resume: selectedResume, source: 'resume_versions', id: resumeId, updatedAt: null };
    },
    getLatestResumeForUser: async () => {
      latestCalls += 1;
      throw new Error('latest resume must not replace the selected resume');
    },
    interpretGoal: async () => ({
      targetRole: 'Security Engineer', location: 'New Jersey', salaryTarget: 0,
      remotePreference: 'any', keywords: [], confidence: 0.9,
    }),
    searchTalentJobSupply: async () => ({
      jobs: [job], totalCount: 1, source: 'Ever Jobs',
      providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
    }),
    loadRecommendationLedger: async () => new Map(),
    getResumeMorphConsentForUser: async () => ({ unlocked100: false, acceptedAt: null, consentVersion: null }),
    upsertRecommendationLedger: async () => {},
    maybeSendDigest: async () => ({ sent: false, reason: 'Notification disabled for this run' }),
    invalidateTwin: async () => {},
  });

  assert.equal(result.success, true);
  assert.equal(result.resume.id, 'selected-resume-42');
  assert.equal(result.resume.skillsUsed, 2);
  assert.equal(selectedCalls, 1);
  assert.equal(latestCalls, 0);
  const runWrite = db.writes.find(write => write.type === 'set' && write.path.includes('/agent_runs/'));
  assert.equal(runWrite.data.sourceResume.id, 'selected-resume-42');
  assert.equal(runWrite.data.sourceResume.explicitlySelected, true);
  assert.match(runWrite.data.sourceResume.hash, /^[a-f0-9]{64}$/);
  const queueWrite = db.writes.find(write => write.type === 'add' && write.path.includes('/agent_queue/'));
  assert.equal(queueWrite.data.source_resume_id, 'selected-resume-42');
  assert.equal(queueWrite.data.source_resume_type, 'resume_versions');
  assert.match(queueWrite.data.source_resume_hash, /^[a-f0-9]{64}$/);
});

test('the harness blocks an invalid selected resume without default-resume fallback', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/invalid-selected-resume': { email: 'invalid@example.com' } });
  let latestCalls = 0;
  let searchCalls = 0;
  const result = await runSonaAgentHarness(db, 'invalid-selected-resume', {
    userRequest: 'Find security engineer roles in New Jersey.',
    resumeVersionId: 'invalid-selected-resume',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    mode: 'scout',
    tier: 'free',
    notify: false,
  }, {
    loadJobPreferences: async () => ({}),
    getVerifiedResumeForUserById: async () => ({ resume: null, source: null, id: null, updatedAt: null }),
    getLatestResumeForUser: async () => {
      latestCalls += 1;
      return { resume, source: 'resume_versions', id: 'newer-default', updatedAt: null };
    },
    searchTalentJobSupply: async () => {
      searchCalls += 1;
      throw new Error('must not search');
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.needsResume, true);
  assert.equal(result.resume.id, null);
  assert.equal(latestCalls, 0);
  assert.equal(searchCalls, 0);
  assert.equal(db.writes.length, 0);
});

test('a selected resume lookup outage returns a retryable stop without fallback or provider spend', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/resume-outage-user': { email: 'outage@example.com' } });
  let latestCalls = 0;
  let searchCalls = 0;

  const result = await runSonaAgentHarness(db, 'resume-outage-user', {
    userRequest: 'Find security engineer roles in New Jersey.',
    resumeVersionId: 'selected-resume-outage',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    mode: 'scout',
    tier: 'free',
    notify: false,
  }, {
    loadJobPreferences: async () => ({}),
    getVerifiedResumeForUserById: async () => {
      throw new Error('temporary Firestore outage');
    },
    getLatestResumeForUser: async () => {
      latestCalls += 1;
      return { resume, source: 'resume_versions', id: 'latest-resume', updatedAt: null };
    },
    searchTalentJobSupply: async () => {
      searchCalls += 1;
      throw new Error('must not search while resume identity is unresolved');
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'RESUME_LOOKUP_UNAVAILABLE');
  assert.equal(result.retryable, true);
  assert.equal(result.needsResume, undefined);
  assert.equal(result.resume.id, null);
  assert.equal(result.jobsFound, 0);
  assert.equal(result.queuedCount, 0);
  assert.equal(latestCalls, 0);
  assert.equal(searchCalls, 0);
  assert.equal(db.writes.length, 0);
  assert.match(result.error, /selected resume/i);
  assert.match(result.approvalRequired[0], /no search.*queue item.*external application/i);
});

test('a valid empty Free scout consumes the one-time workload without repeat provider spend', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/empty-free': { email: 'empty@example.com' } });
  let interpretCalls = 0;
  let searchCalls = 0;
  const deps = {
    getUserTier: async () => 'free',
    loadJobPreferences: async () => ({}),
    getLatestResumeForUser: async () => ({ resume, source: 'resume_versions', id: 'resume-empty', updatedAt: null }),
    interpretGoal: async () => {
      interpretCalls += 1;
      return {
        targetRole: 'Security Engineer',
        location: 'New Jersey',
        salaryTarget: 0,
        remotePreference: 'any',
        keywords: [],
        confidence: 0.9,
      };
    },
    searchTalentJobSupply: async () => {
      searchCalls += 1;
      return {
        jobs: [],
        totalCount: 0,
        source: 'mock',
        providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
      };
    },
    loadRecommendationLedger: async () => new Map(),
    getResumeMorphConsentForUser: async () => ({ unlocked100: false, acceptedAt: null, consentVersion: null }),
    upsertRecommendationLedger: async () => {},
    maybeSendDigest: async () => ({ sent: false, reason: 'Notification disabled for this run' }),
    invalidateTwin: async () => {},
  };
  const input = {
    userRequest: 'Find security engineer roles in New Jersey.',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    mode: 'scout',
    notify: false,
  };

  const first = await runSonaAgentHarness(db, 'empty-free', input, deps);
  const second = await runSonaAgentHarness(db, 'empty-free', input, deps);

  assert.equal(first.success, true);
  assert.equal(first.queuedCount, 0);
  assert.equal(second.success, false);
  assert.match(second.error, /free Taco scout is complete/i);
  assert.equal(interpretCalls, 1);
  assert.equal(searchCalls, 1);
  assert.equal(db.docs.get('users/empty-free/settings/sonaFreeScout')?.status, 'completed');
});

test('concurrent free scout requests reserve the one-time entitlement atomically', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/concurrent-user': { email: 'concurrent@example.com' } });
  const deps = {
    getUserTier: async () => 'free',
    loadJobPreferences: async () => ({}),
    getLatestResumeForUser: async () => ({ resume, source: 'resume_versions', id: 'resume-concurrent', updatedAt: null }),
    interpretGoal: async () => ({
      targetRole: 'Security Engineer',
      location: 'New Jersey',
      salaryTarget: 120000,
      remotePreference: 'hybrid',
      keywords: [],
      confidence: 0.9,
    }),
    searchTalentJobSupply: async () => ({
      jobs: [job],
      totalCount: 1,
      source: 'mock',
      providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
    }),
    loadRecommendationLedger: async () => new Map(),
    getResumeMorphConsentForUser: async () => ({ unlocked100: false, acceptedAt: null, consentVersion: null }),
    upsertRecommendationLedger: async () => {},
    maybeSendDigest: async () => ({ sent: false, reason: 'Notification disabled for this run' }),
    invalidateTwin: async () => {},
  };
  const input = {
    userRequest: 'Find a $120k hybrid security engineer job in New Jersey.',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    salaryTarget: 120000,
    remotePreference: 'hybrid',
    maxPackets: 3,
    mode: 'scout',
    notify: false,
  };

  const results = await Promise.all([
    runSonaAgentHarness(db, 'concurrent-user', input, deps),
    runSonaAgentHarness(db, 'concurrent-user', input, deps),
  ]);

  assert.equal(results.filter(result => result.success).length, 1);
  assert.equal(results.filter(result => !result.success && /already running|complete/i.test(result.error || '')).length, 1);
});

test('paid Taco runs reject overlapping work before model or provider calls multiply', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/pro-concurrent': { email: 'pro@example.com' } });
  let interpretCalls = 0;
  let searchCalls = 0;
  const deps = {
    getUserTier: async () => 'pro',
    loadJobPreferences: async () => ({}),
    getLatestResumeForUser: async () => ({ resume, source: 'resume_versions', id: 'resume-pro', updatedAt: null }),
    interpretGoal: async () => {
      interpretCalls += 1;
      return {
        targetRole: 'Security Engineer', location: 'New Jersey', salaryTarget: 0,
        remotePreference: 'any', keywords: [], confidence: 0.9,
      };
    },
    searchTalentJobSupply: async () => {
      searchCalls += 1;
      return { jobs: [], totalCount: 0, source: 'mock', providerStatus: { everJobs: 'success', fallbackUsed: false, sources: [] } };
    },
    loadRecommendationLedger: async () => new Map(),
    getResumeMorphConsentForUser: async () => ({ unlocked100: false, acceptedAt: null, consentVersion: null }),
    upsertRecommendationLedger: async () => {},
    maybeSendDigest: async () => ({ sent: false, reason: 'Notification disabled for this run' }),
    invalidateTwin: async () => {},
  };
  const input = {
    userRequest: 'Scout security engineer roles in New Jersey.',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    tier: 'pro',
    notify: false,
  };

  const results = await Promise.all([
    runSonaAgentHarness(db, 'pro-concurrent', input, deps),
    runSonaAgentHarness(db, 'pro-concurrent', input, deps),
  ]);

  assert.equal(results.filter(result => result.success).length, 1);
  const blocked = results.find(result => result.workloadLimit?.reason === 'concurrent_run');
  assert.ok(blocked, 'expected one concurrent workload rejection');
  assert.equal(interpretCalls, 1);
  assert.equal(searchCalls, 1);
});

test('Pro daily workload stops the eleventh run before model or provider work', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/pro-daily': { email: 'daily@example.com' } });
  let interpretCalls = 0;
  let searchCalls = 0;
  const deps = {
    getUserTier: async () => 'pro',
    loadJobPreferences: async () => ({}),
    getLatestResumeForUser: async () => ({ resume, source: 'resume_versions', id: 'resume-pro-daily', updatedAt: null }),
    interpretGoal: async () => {
      interpretCalls += 1;
      return {
        targetRole: 'Security Engineer', location: 'New Jersey', salaryTarget: 0,
        remotePreference: 'any', keywords: [], confidence: 0.9,
      };
    },
    searchTalentJobSupply: async () => {
      searchCalls += 1;
      return { jobs: [], totalCount: 0, source: 'mock', providerStatus: { everJobs: 'success', fallbackUsed: false, sources: [] } };
    },
    loadRecommendationLedger: async () => new Map(),
    getResumeMorphConsentForUser: async () => ({ unlocked100: false, acceptedAt: null, consentVersion: null }),
    upsertRecommendationLedger: async () => {},
    maybeSendDigest: async () => ({ sent: false, reason: 'Notification disabled for this run' }),
    invalidateTwin: async () => {},
  };
  const input = {
    userRequest: 'Scout security engineer roles in New Jersey.',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    tier: 'pro',
    notify: false,
  };

  const completed = [];
  for (let index = 0; index < 10; index += 1) {
    completed.push(await runSonaAgentHarness(db, 'pro-daily', input, deps));
  }
  const blocked = await runSonaAgentHarness(db, 'pro-daily', input, deps);

  assert.equal(completed.every(result => result.success), true);
  assert.equal(blocked.success, false);
  assert.equal(blocked.workloadLimit?.reason, 'daily_run_cap');
  assert.equal(interpretCalls, 10);
  assert.equal(searchCalls, 10);
});

test('failed Max asset generation stays needs_attention instead of prepared', async () => {
  const { runSonaAgentHarness } = await loadAgentHarness();
  const db = createFakeFirestore({ 'users/max-failure': { email: 'max@example.com' } });

  const result = await runSonaAgentHarness(db, 'max-failure', {
    userRequest: 'Prepare a hybrid security engineer packet in New Jersey.',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    salaryTarget: 120000,
    remotePreference: 'hybrid',
    maxPackets: 1,
    mode: 'prepare',
    tier: 'studio',
    notify: false,
  }, {
    getUserTier: async () => 'studio',
    loadJobPreferences: async () => ({}),
    getLatestResumeForUser: async () => ({ resume, source: 'resume_versions', id: 'resume-max', updatedAt: null }),
    probeJobSupplyHealth: async () => healthyPrimarySupply(),
    interpretGoal: async () => ({
      targetRole: 'Security Engineer',
      location: 'New Jersey',
      salaryTarget: 120000,
      remotePreference: 'hybrid',
      keywords: [],
      confidence: 0.9,
    }),
    searchTalentJobSupply: async () => ({
      jobs: [job],
      totalCount: 1,
      source: 'mock',
      providerStatus: { everJobs: 'success', fallbackUsed: false, sources: ['Greenhouse'] },
    }),
    loadRecommendationLedger: async () => new Map(),
    getResumeMorphConsentForUser: async () => ({ unlocked100: false, acceptedAt: null, consentVersion: null }),
    groqJSONCompletion: async () => { throw new Error('provider unavailable'); },
    upsertRecommendationLedger: async () => {},
    maybeSendDigest: async () => ({ sent: false, reason: 'Notification disabled for this run' }),
    invalidateTwin: async () => {},
  });

  assert.equal(result.success, true);
  assert.equal(result.status, 'scouted');
  assert.equal(result.queuedCount, 1);
  assert.equal(result.queued[0].packetStatus, 'needs_attention');
  assert.equal(result.queued[0].resumeVersionId, null);
  assert.equal(result.warnings.length >= 2, true);
  assert.equal(db.writes.some(write => write.path.includes('/resume_versions/')), false);
});
