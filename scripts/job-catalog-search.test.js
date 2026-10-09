const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build, buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
const NOW = '2026-10-08T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const ENV_KEYS = ['JOB_CATALOG_ENABLED', 'JOB_CATALOG_ORIGINS', 'EVER_JOBS_ENABLED', 'EVER_JOBS_API_URL', 'EVER_JOBS_API_KEY', 'EVER_JOBS_SAFE_SOURCES', 'ADZUNA_LICENSED'];

function loadCatalog() {
  const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'taco-job-catalog-')), 'catalog.cjs');
  buildSync({ entryPoints: [path.join(repoRoot, 'lib/job-catalog.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  return require(outfile);
}

function loadPolicy() {
  const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'taco-job-source-policy-')), 'policy.cjs');
  buildSync({ entryPoints: [path.join(repoRoot, 'lib/job-source-policy.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  return require(outfile);
}

function loadIngestion() {
  const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'taco-job-ingestion-')), 'ingestion.cjs');
  buildSync({ entryPoints: [path.join(repoRoot, 'lib/job-ingestion.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  return require(outfile);
}

async function loadRecommendation() {
  const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'taco-catalog-search-')), 'platform.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib/job-recommendation-platform.ts')],
    outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
    external: ['firebase-admin', 'firebase-admin/*', 'next', 'next/*', 'react', 'react-dom'],
    plugins: [{
      name: 'catalog-search-fixtures',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^\.\/job-catalog$/ }, args => {
          if (args.importer.endsWith('/lib/job-recommendation-platform.ts')) return { path: 'job-catalog-reader', namespace: 'taco-fixture' };
        });
        buildApi.onResolve({ filter: /^@\/lib\// }, args => {
          if (args.path === '@/lib/job-search-api' || args.path === '@/lib/portal-scanner') return { path: args.path.slice('@/lib/'.length), namespace: 'taco-fixture' };
          const base = path.join(repoRoot, args.path.slice('@/'.length));
          const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts')];
          const resolved = candidates.find(candidate => fs.existsSync(candidate));
          return resolved ? { path: resolved } : undefined;
        });
        buildApi.onLoad({ filter: /.*/, namespace: 'taco-fixture' }, args => {
          if (args.path === 'job-catalog-reader') return { loader: 'js', contents: 'export async function readJobCatalogSupply(){ if (globalThis.__TACO_CATALOG_ERROR__) throw new Error("fixture catalog error"); return globalThis.__TACO_CATALOG_RESULT__ || {jobs:[],diagnostic:{provider:"job_catalog",status:"empty"}}; }' };
          if (args.path === 'job-search-api') return { loader: 'js', contents: 'export async function searchJobs(){ return globalThis.__TACO_LEGACY_RESULT__ || {jobs:[],status:"disabled",diagnostics:[]}; } export function calculateFitScore(){return 0} export function extractSkillsFromDescription(){return []}' };
          if (args.path === 'portal-scanner') return { loader: 'js', contents: 'export const KNOWN_BOARDS={}; export async function searchAllKnownBoards(){return globalThis.__TACO_PORTAL_RESULT__ || {jobs:[],status:"empty",diagnostics:[]}} export async function searchCompanyJobs(){return {jobs:[],status:"empty",diagnostics:[]}}' };
          return { errors: [{ text: `Unexpected fixture module ${args.path}` }] };
        });
      },
    }],
  });
  return require(outfile);
}

async function withEnv(values, callback) {
  const previous = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  const oldFetch = global.fetch;
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try { return await callback(); }
  finally {
    global.fetch = oldFetch;
    for (const key of ENV_KEYS) previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key];
  }
}

function providerJob(overrides = {}) {
  return {
    provider: 'fantastic', providerJobId: '41002', sourceJobId: '41002', origin: 'greenhouse',
    title: 'Platform Engineer', company: 'Example Labs', url: 'https://job-boards.greenhouse.io/example/jobs/41002',
    description: 'Build reliable platform services with Python and Kubernetes. '.repeat(12), locations: ['New York, New York, United States'],
    country: 'United States', remoteMode: 'unknown', salary: { min: 125000, max: 155000, currency: 'USD', interval: 'year' },
    employmentType: 'Full-time', publishedAt: '2026-10-07T15:00:00.000Z', discoveredAt: '2026-10-07T15:14:00.000Z',
    observedAt: NOW, inferredFields: ['ai_salary_min_value', 'ai_work_arrangement'], ...overrides,
  };
}

function fakeStore(byProvider) {
  return {
    async eligible(provider) {
      const value = byProvider[provider];
      if (value instanceof Error) throw value;
      return value || [];
    },
  };
}

test('catalog revalidation rejects vendor identity masquerading as an origin and unknown URLs', async () => {
  const { acceptedCatalogJob } = loadCatalog();
  const origins = ['greenhouse'];
  assert.equal(acceptedCatalogJob(providerJob({ origin: 'fantastic' }), origins), false);
  assert.equal(acceptedCatalogJob(providerJob({ url: 'https://fantastic.jobs/jobs/41002' }), origins), false);
  assert.equal(acceptedCatalogJob(providerJob({ url: 'https://jobs.example.test/41002' }), origins), false);
  assert.equal(acceptedCatalogJob(providerJob(), origins), true);
});

test('job boards require explicit origin enablement while native ATS catalog defaults remain available', async () => {
  await withEnv({ JOB_CATALOG_ENABLED: 'true' }, async () => {
    const { catalogOriginIds, isJobSourceEnabled } = loadPolicy();
    assert.equal(isJobSourceEnabled('linkedin'), false);
    assert.deepEqual(catalogOriginIds(), ['greenhouse', 'lever', 'ashby', 'workday']);
  });
  await withEnv({ JOB_CATALOG_ENABLED: 'true', JOB_CATALOG_ORIGINS: 'linkedin' }, async () => {
    const { catalogOriginIds, isJobSourceEnabled } = loadPolicy();
    assert.equal(isJobSourceEnabled('linkedin'), true);
    assert.deepEqual(catalogOriginIds(), ['linkedin']);
  });
});

test('readJobCatalogSupply filters stale, closed, expired, and untrusted rows while retaining successful providers', async () => {
  await withEnv({ JOB_CATALOG_ENABLED: 'true', JOB_CATALOG_ORIGINS: 'greenhouse' }, async () => {
    const { readJobCatalogSupply } = loadCatalog();
    const jobs = [
      providerJob({ providerJobId: 'fresh' }),
      providerJob({ providerJobId: 'closed', closed: true }),
      providerJob({ providerJobId: 'old', observedAt: '2026-10-04T11:59:59.999Z' }),
      providerJob({ providerJobId: 'expired', validThrough: '2026-10-08T11:00:00.000Z' }),
      providerJob({ providerJobId: 'bad-origin', origin: 'fantastic' }),
    ];
    const result = await readJobCatalogSupply({ store: fakeStore({ fantastic: new Error('partial read failure'), brightdata: jobs }), now: NOW_MS });
    assert.deepEqual(result.jobs.map(job => job.providerJobId), ['fresh']);
    assert.equal(result.diagnostic.status, 'success');
    assert.equal(result.diagnostic.rejectedRows, 4);
  });
});

test('providerJobToTalent preserves full description, dates, source salary and inferred-field evidence', async () => {
  const api = await loadRecommendation();
  await withEnv({ JOB_CATALOG_ENABLED: 'true', JOB_CATALOG_ORIGINS: 'greenhouse' }, async () => {
    const source = providerJob();
    const talent = api.providerJobToTalent(source);
    assert.equal(talent.description, source.description);
    assert.equal(talent.descriptionPreview, source.description.slice(0, 500));
    assert.equal(talent.postedDate, source.publishedAt);
    assert.equal(talent.discoveredAt, source.discoveredAt);
    assert.deepEqual(talent.salary, { min: 125000, max: 155000, currency: 'USD', interval: 'year', isPredicted: false });
    assert.deepEqual(talent.providerEvidence, [{ provider: 'fantastic', providerJobId: '41002' }]);
    assert.deepEqual(talent.ingestion.inferredFields, ['ai_salary_min_value', 'ai_work_arrangement']);
    assert.equal(talent.ingestion.providerJobId, '41002');
  });
});

test('predicted salary is preserved as predicted but is not considered verified annual USD pay', async () => {
  const api = await loadRecommendation();
  const { comparableAnnualSalary } = loadIngestion();
  await withEnv({ JOB_CATALOG_ENABLED: 'true', JOB_CATALOG_ORIGINS: 'greenhouse' }, async () => {
    const predicted = api.providerJobToTalent(providerJob({ salary: { min: 200000, max: 240000, currency: 'USD', interval: 'year', isPredicted: true } }));
    assert.equal(predicted.salary.isPredicted, true);
    assert.equal(comparableAnnualSalary(predicted.salary), null);
  });
});

test('catalog integration deduplicates native ATS jobs while keeping provider evidence; search itself does no paid-provider fetch', async () => {
  const api = await loadRecommendation();
  let fetchCalls = 0;
  const source = providerJob();
  const native = {
    id: '41002', title: source.title, company: source.company, location: source.locations[0],
    description: 'Build platform services.', url: source.url, postedDate: source.publishedAt,
    employmentType: 'Full-time', source: 'greenhouse', sourceJobId: source.sourceJobId,
  };
  globalThis.__TACO_CATALOG_RESULT__ = { jobs: [source, providerJob({ providerJobId: 'other', sourceJobId: 'other', title: 'Platform Engineer', company: 'Other Labs', url: 'https://job-boards.greenhouse.io/other/jobs/other' }), providerJob({ providerJobId: 'irrelevant', title: 'Data Analyst', company: 'Other Corp', description: 'Finance reporting.' })], diagnostic: { provider: 'job_catalog', status: 'success' } };
  globalThis.__TACO_PORTAL_RESULT__ = { jobs: [native], status: 'success', diagnostics: [] };
  await withEnv({ JOB_CATALOG_ENABLED: 'true', JOB_CATALOG_ORIGINS: 'greenhouse', EVER_JOBS_ENABLED: 'false' }, async () => {
    global.fetch = async () => { fetchCalls += 1; throw new Error('search must use only local catalog and fixture portal'); };
    const result = await api.searchTalentJobSupply({ query: 'platform engineer', page: 1, resultsPerPage: 20, country: 'us' });
    assert.equal(result.jobs.filter(job => job.company === 'Example Labs').length, 1);
    const duplicate = result.jobs.find(job => job.company === 'Example Labs');
    assert.deepEqual(duplicate.providerEvidence, [{ provider: 'fantastic', providerJobId: '41002' }]);
    assert.ok(result.jobs.some(job => job.company === 'Other Labs'));
    assert.equal(result.jobs.some(job => job.company === 'Other Corp'), false);
    assert.equal(fetchCalls, 0);
  });
  delete globalThis.__TACO_CATALOG_RESULT__;
  delete globalThis.__TACO_PORTAL_RESULT__;
});

test('a catalog read failure does not discard available native ATS jobs', async () => {
  const api = await loadRecommendation();
  let fetchCalls = 0;
  globalThis.__TACO_CATALOG_ERROR__ = true;
  globalThis.__TACO_PORTAL_RESULT__ = { jobs: [{
    id: 'native-1', title: 'Platform Engineer', company: 'Native Co', location: 'Remote',
    description: 'Build platform tools.', url: 'https://job-boards.greenhouse.io/native/jobs/1',
    postedDate: '2026-10-07T00:00:00Z', source: 'greenhouse', sourceJobId: '1', employmentType: 'Full-time',
  }], status: 'success', diagnostics: [] };
  await withEnv({ JOB_CATALOG_ENABLED: 'true', JOB_CATALOG_ORIGINS: 'greenhouse', EVER_JOBS_ENABLED: 'false' }, async () => {
    global.fetch = async () => { fetchCalls += 1; throw new Error('unexpected network'); };
    const result = await api.searchTalentJobSupply({ query: 'platform engineer', page: 1, resultsPerPage: 20, country: 'us' });
    assert.ok(result.jobs.some(job => job.company === 'Native Co'));
    assert.equal(result.providerStatus.catalog, 'error');
    assert.equal(fetchCalls, 0);
  });
  delete globalThis.__TACO_CATALOG_ERROR__;
  delete globalThis.__TACO_PORTAL_RESULT__;
});
