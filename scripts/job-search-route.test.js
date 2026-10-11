const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { build } = require("esbuild");

const repoRoot = path.join(__dirname, "..");

function resolveRootImport(importPath) {
  const base = path.join(repoRoot, importPath.slice(2));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, "index.ts"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || base;
}

function writeFixture(dir, name, content) {
  const filename = path.join(dir, name);
  fs.writeFileSync(filename, content);
  return filename;
}

async function loadRoute() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tc-job-search-route-"));
  const stubs = {
    next: writeFixture(
      dir,
      "next-server.cjs",
      `exports.NextResponse = { json(body, init = {}) { return new Response(JSON.stringify(body), { status: init.status || 200, headers: { 'Content-Type': 'application/json' } }); } };`,
    ),
    auth: writeFixture(
      dir,
      "auth.cjs",
      `exports.guardApiRoute = async () => ({ user: { uid: 'route-user-1' } });`,
    ),
    admin: writeFixture(
      dir,
      "admin.cjs",
      `exports.getAdminDb = () => global.__JOB_SEARCH_ROUTE_FIXTURE__.db;`,
    ),
    monitor: writeFixture(
      dir,
      "monitor.cjs",
      `exports.monitor = { critical() {} };`,
    ),
    resume: writeFixture(
      dir,
      "resume.cjs",
      `exports.extractResumeSkills = () => ['SQL']; exports.getLatestVerifiedResumeForUser = async () => ({ id: 'resume-1', resume: { skills: ['SQL'] }, verification: { verified: true } }); exports.getVerifiedResumeForUserById = async () => ({ id: 'resume-1', resume: { skills: ['SQL'] }, verification: { verified: true } });`,
    ),
    jobSearch: writeFixture(
      dir,
      "job-search-api.cjs",
      `exports.calculateFitScore = () => 77;`,
    ),
    recoveryRoute: writeFixture(
      dir,
      "job-discovery-route-recovery.cjs",
      `exports.withJobDiscoveryRecovery = response => response;`,
    ),
    recommendation: writeFixture(
      dir,
      "recommendation.cjs",
      `
      exports.TALENT_FIT_SCORE_VERSION = 'test-score-v1';
      exports.searchTalentJobSupply = async () => { const f = global.__JOB_SEARCH_ROUTE_FIXTURE__; f.supplyCalls++; return f.result; };
      exports.isJobSupplyOperational = status => status.everJobs === 'success' || status.everJobs === 'empty' || status.fallbackStatus === 'success' || status.fallbackStatus === 'empty' || status.portals === 'success' || status.portals === 'empty' || status.sources.length > 0;
      exports.loadRecommendationLedger = async () => new Map();
      exports.suppressLedgerMatches = jobs => jobs;
      exports.finalizeTalentRecommendations = jobs => [...jobs].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
      exports.createRecommendationImpressionSession = async (_db, _uid, jobs, options) => { global.__JOB_SEARCH_ROUTE_FIXTURE__.sessionIds.push(jobs.map(job => job.id)); global.__JOB_SEARCH_ROUTE_FIXTURE__.sessionOptions.push(options); return 'impression-fixture'; };
      exports.recordRecommendationImpressions = async (_db, _uid, jobs) => { global.__JOB_SEARCH_ROUTE_FIXTURE__.recordedIds.push(jobs.map(job => job.id)); };
    `,
    ),
  };
  const outfile = path.join(dir, "route.cjs");
  await build({
    entryPoints: [path.join(repoRoot, "app/api/jobs/search/route.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    logLevel: "silent",
    plugins: [
      {
        name: "route-fixtures",
        setup(buildApi) {
          const aliases = {
            "next/server": stubs.next,
            "@/lib/api-auth": stubs.auth,
            "@/lib/firebase-admin": stubs.admin,
            "@/lib/monitor": stubs.monitor,
            "@/lib/server-resume": stubs.resume,
            "@/lib/job-search-api": stubs.jobSearch,
            "@/lib/job-discovery-route-recovery": stubs.recoveryRoute,
            "@/lib/job-recommendation-platform": stubs.recommendation,
          };
          buildApi.onResolve({ filter: /.*/ }, (args) => {
            if (aliases[args.path]) return { path: aliases[args.path] };
            if (args.path.startsWith("@/"))
              return { path: resolveRootImport(args.path) };
            return undefined;
          });
        },
      },
    ],
  });
  return require(outfile);
}

function fixture(result) {
  return {
    result,
    db: {},
    supplyCalls: 0,
    sessionIds: [],
    recordedIds: [],
    sessionOptions: [],
  };
}

function candidate(id, overrides = {}) {
  return {
    id,
    title: "Senior Data Engineer",
    company: `Company ${id}`,
    location: "New York, NY",
    locations: ["New York, NY"],
    country: "us",
    salary: { min: 100000, max: 120000, currency: "USD", interval: "year" },
    description:
      "Build production data systems with SQL, Python, and reliable cloud infrastructure for customer teams.",
    skills: ["SQL"],
    url: `https://boards.greenhouse.io/company/jobs/${id}`,
    postedDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    employmentType: "Full-time",
    source: "Greenhouse",
    remoteMode: "onsite",
    sourceMeta: {
      sourceName: "Greenhouse",
      canonicalUrl: `https://boards.greenhouse.io/company/jobs/${id}`,
      directApplyUrl: `https://boards.greenhouse.io/company/jobs/${id}`,
    },
    matchScore: 0,
    ...overrides,
  };
}

function request(url) {
  return new Request(`http://localhost${url}`);
}

async function runWithFixture(searchResult, url) {
  const state = fixture(searchResult);
  global.__JOB_SEARCH_ROUTE_FIXTURE__ = state;
  try {
    const { GET } = await loadRoute();
    const response = await GET(request(url));
    return { response, body: await response.json(), state };
  } finally {
    delete global.__JOB_SEARCH_ROUTE_FIXTURE__;
  }
}

const operationalStatus = {
  everJobs: "disabled",
  fallbackUsed: true,
  fallbackStatus: "disabled",
  portals: "success",
  sources: ["Greenhouse"],
};

test(
  "invalid page and sort return 400 without calling supply",
  { concurrency: false },
  async () => {
    for (const query of ["?page=0", "?sortBy=popularity"]) {
      const { response, body, state } = await runWithFixture(
        { jobs: [], providerStatus: operationalStatus },
        `/api/jobs/search${query}`,
      );
      assert.equal(response.status, 400);
      assert.equal(body.code, "invalid_search_parameters");
      assert.equal(state.supplyCalls, 0);
    }
  },
);

test(
  "unavailable supply returns the existing retryable 503 recovery response",
  { concurrency: false },
  async () => {
    const status = {
      everJobs: "error",
      fallbackUsed: true,
      fallbackStatus: "disabled",
      portals: "error",
      sources: [],
    };
    const { response, body, state } = await runWithFixture(
      { jobs: [], providerStatus: status },
      "/api/jobs/search?query=Engineer",
    );
    assert.equal(response.status, 503);
    assert.equal(body.success, false);
    assert.equal(body.code, "search_supply_unavailable");
    assert.equal(body.retryable, true);
    assert.equal(state.supplyCalls, 1);
    assert.deepEqual(state.sessionIds, []);
  },
);

test(
  "merged candidates rank before salary/date sorting and pagination side effects use only returned jobs",
  { concurrency: false },
  async () => {
    const pool = [
      candidate("high-salary", {
        salary: { min: 300000, max: 300000, currency: "USD", interval: "year" },
        postedDate: new Date(
          Date.now() - 4 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        matchScore: 10,
      }),
      candidate("mid-salary", {
        salary: { min: 200000, max: 200000, currency: "USD", interval: "year" },
        postedDate: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        matchScore: 90,
      }),
      candidate("low-salary", {
        salary: { min: 100000, max: 100000, currency: "USD", interval: "year" },
        postedDate: new Date(
          Date.now() - 1 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        matchScore: 50,
      }),
      candidate("ghost-high", {
        title: "Engineer",
        company: "Acme Staffing",
        salary: { min: 50000, max: 50000, currency: "USD", interval: "year" },
        postedDate: "",
        description: "Short description.",
        matchScore: 20,
      }),
    ];
    const result = {
      jobs: pool,
      totalCount: pool.length,
      source: "Ever Jobs + boards",
      providerStatus: operationalStatus,
    };
    const salaryPage = await runWithFixture(
      result,
      "/api/jobs/search?query=Engineer&sortBy=salary&page=2&limit=2",
    );
    assert.equal(salaryPage.response.status, 200);
    assert.deepEqual(
      salaryPage.body.jobs.map((job) => job.id),
      ["low-salary", "ghost-high"],
    );
    assert.equal(salaryPage.body.totalCount, 4);
    assert.equal(salaryPage.body.page, 2);
    assert.equal(salaryPage.body.pageSize, 2);
    assert.equal(salaryPage.body.hasMore, false);
    assert.equal(salaryPage.body.impressionId, "impression-fixture");
    assert.deepEqual(salaryPage.state.sessionIds[0], [
      "low-salary",
      "ghost-high",
    ]);
    assert.deepEqual(salaryPage.state.recordedIds[0], [
      "low-salary",
      "ghost-high",
    ]);
    assert.equal(salaryPage.body.ghostStats.high, 1);
    assert.equal(salaryPage.body.ghostStats.fresh, 1);
    assert.equal(salaryPage.state.sessionOptions[0].sortBy, "salary");

    const datePage = await runWithFixture(
      result,
      "/api/jobs/search?query=Engineer&sortBy=date&limit=2&page=1",
    );
    assert.equal(datePage.response.status, 200);
    assert.deepEqual(
      datePage.body.jobs.map((job) => job.id),
      ["low-salary", "mid-salary"],
    );
    assert.equal(datePage.body.totalCount, 4);
    assert.equal(datePage.body.hasMore, true);
    assert.deepEqual(datePage.state.sessionIds[0], [
      "low-salary",
      "mid-salary",
    ]);
    assert.deepEqual(datePage.state.recordedIds[0], [
      "low-salary",
      "mid-salary",
    ]);
    assert.equal(datePage.state.sessionOptions[0].sortBy, "date");

    const relevance = await runWithFixture(
      result,
      "/api/jobs/search?query=Engineer&sortBy=relevance&limit=2&page=1",
    );
    assert.deepEqual(
      relevance.body.jobs.map((job) => job.id),
      ["mid-salary", "low-salary"],
    );
  },
);
