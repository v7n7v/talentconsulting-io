const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { build, buildSync } = require("esbuild");

const repoRoot = path.join(__dirname, "..");
const ENV_KEYS = [
  "EVER_JOBS_ENABLED",
  "EVER_JOBS_API_URL",
  "EVER_JOBS_API_KEY",
  "EVER_JOBS_SAFE_SOURCES",
  "EVER_JOBS_ALLOW_PRIVATE_HTTP",
  "ADZUNA_LICENSED",
  "ADZUNA_APP_ID",
  "ADZUNA_API_KEY",
];

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

async function loadRecommendationModule() {
  const outfile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "tc-job-supply-ingestion-")),
    "platform.cjs",
  );
  await build({
    entryPoints: [path.join(repoRoot, "lib", "job-recommendation-platform.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    logLevel: "silent",
    external: ["firebase-admin", "next", "next/*", "react", "react-dom"],
    plugins: [
      {
        name: "alias-root",
        setup(buildApi) {
          buildApi.onResolve({ filter: /^@\// }, (args) => ({
            path: resolveRootImport(args.path),
          }));
        },
      },
    ],
  });
  return require(outfile);
}

function loadSelectionModule() {
  const outfile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "tc-job-search-selection-")),
    "selection.cjs",
  );
  buildSync({
    entryPoints: [path.join(repoRoot, "lib", "job-search-selection.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    logLevel: "silent",
  });
  return require(outfile);
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function withIsolatedSearch(options, callback) {
  const previousEnv = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  const previousFetch = global.fetch;
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, options.env || {});
  global.fetch = options.fetch;
  try {
    const loadedModule = await loadRecommendationModule();
    return await callback(loadedModule);
  } finally {
    global.fetch = previousFetch;
    for (const key of ENV_KEYS) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

const params = (overrides = {}) => ({
  query: "Engineer",
  location: "",
  country: "",
  page: 1,
  resultsPerPage: 50,
  sortBy: "relevance",
  ...overrides,
});
const emptyPortals = async (input) => {
  const url = String(input);
  if (url.includes("api.lever.co")) return response([]);
  return response({ jobs: [] });
};

test(
  "Ever Jobs fields preserve remote, country, hourly non-USD salary, contract type, blank date, and separate canonical/apply URLs",
  { concurrency: false },
  async () => {
    const everUrl = "https://ever-ingestion.test";
    await withIsolatedSearch(
      {
        env: {
          EVER_JOBS_ENABLED: "true",
          EVER_JOBS_API_URL: everUrl,
          EVER_JOBS_API_KEY: "test-ever-secret",
          EVER_JOBS_SAFE_SOURCES: "greenhouse",
          ADZUNA_LICENSED: "false",
        },
        fetch: async (input, init = {}) => {
          if (String(input).startsWith(everUrl)) {
            return response({
              jobs: [
                {
                  id: "e-1",
                  title: "Engineer",
                  companyName: "Example Systems",
                  source: "greenhouse",
                  location: { city: "London", country: "GB" },
                  isRemote: true,
                  compensation: {
                    minAmount: 30,
                    maxAmount: 45,
                    currency: "EUR",
                    interval: "hour",
                  },
                  jobType: "contract",
                  datePosted: "not-a-date",
                  updatedAt: "2026-10-01T00:00:00Z",
                  jobUrl: "https://boards.greenhouse.io/example/jobs/123",
                  applyUrl: "https://boards.greenhouse.io/example/apply/123",
                },
              ],
            });
          }
          return emptyPortals(input);
        },
      },
      async ({ searchTalentJobSupply }) => {
        const result = await searchTalentJobSupply(params());
        const job = result.jobs.find(
          (candidate) => candidate.sourceJobId === "e-1",
        );
        assert.ok(job);
        assert.equal(job.remoteMode, "remote");
        assert.equal(job.country, "gb");
        assert.deepEqual(job.salary, {
          min: 30,
          max: 45,
          currency: "EUR",
          interval: "hour",
          isPredicted: false,
        });
        assert.equal(job.employmentType, "Contract");
        assert.equal(job.postedDate, "");
        assert.equal(job.updatedAt, "2026-10-01T00:00:00.000Z");
        assert.equal(
          job.applyUrl,
          "https://boards.greenhouse.io/example/apply/123",
        );
        assert.equal(job.url, "https://boards.greenhouse.io/example/jobs/123");
        assert.equal(
          job.sourceMeta.canonicalUrl,
          "https://boards.greenhouse.io/example/jobs/123",
        );
      },
    );
  },
);

test(
  "malformed Ever Jobs plus failed boards and disabled legacy is not operational",
  { concurrency: false },
  async () => {
    await withIsolatedSearch(
      {
        env: {
          EVER_JOBS_ENABLED: "true",
          EVER_JOBS_API_URL: "https://malformed-ever.test",
          EVER_JOBS_API_KEY: "key",
          EVER_JOBS_SAFE_SOURCES: "greenhouse",
        },
        fetch: async (input) =>
          String(input).startsWith("https://malformed-ever.test")
            ? response({ jobs: "not-an-array" })
            : response({}, 503),
      },
      async ({ searchTalentJobSupply, isJobSupplyOperational }) => {
        const result = await searchTalentJobSupply(params());
        assert.equal(result.providerStatus.everJobs, "error");
        assert.equal(result.providerStatus.portals, "error");
        assert.equal(result.providerStatus.fallbackStatus, "disabled");
        assert.equal(isJobSupplyOperational(result.providerStatus), false);
      },
    );
  },
);

test(
  "malformed optional company/description fields reject only that Ever row and ingestion metadata is bounded",
  { concurrency: false },
  async () => {
    const everUrl = "https://row-validation-ever.test";
    await withIsolatedSearch(
      {
        env: {
          EVER_JOBS_ENABLED: "true",
          EVER_JOBS_API_URL: everUrl,
          EVER_JOBS_API_KEY: "test-key",
          EVER_JOBS_SAFE_SOURCES: "greenhouse",
        },
        fetch: async (input) => {
          if (String(input).startsWith(everUrl)) {
            return response({
              jobs: [
                {
                  id: "bad-row",
                  title: "Malformed",
                  companyName: { displayName: "not a string" },
                  descriptionText: ["also invalid"],
                  source: "greenhouse",
                  url: "https://boards.greenhouse.io/example/jobs/bad",
                },
                {
                  id: "good-row",
                  title: "Engineer",
                  companyName: "Good Company",
                  descriptionText: "SQL and data systems.",
                  source: "greenhouse",
                  url: "https://boards.greenhouse.io/example/jobs/good",
                  ingestion: {
                    parserVersion: "p".repeat(150),
                    method: "unrecognized_method",
                    descriptionTruncated: "true",
                  },
                },
              ],
            });
          }
          return emptyPortals(input);
        },
      },
      async ({ searchTalentJobSupply }) => {
        const result = await searchTalentJobSupply(params());
        assert.equal(result.providerStatus.everJobs, "success");
        assert.deepEqual(
          result.jobs.map((job) => job.sourceJobId),
          ["good-row"],
        );
        assert.equal(result.jobs[0].company, "Good Company");
        assert.equal(result.jobs[0].description, "SQL and data systems.");
        assert.equal(result.jobs[0].ingestion.parserVersion.length, 100);
        assert.equal(result.jobs[0].ingestion.method, "service_api");
        assert.equal(result.jobs[0].ingestion.descriptionTruncated, false);
      },
    );
  },
);

test(
  "valid-empty boards are operational with Ever Jobs and legacy disabled",
  { concurrency: false },
  async () => {
    await withIsolatedSearch(
      { env: { EVER_JOBS_ENABLED: "false" }, fetch: emptyPortals },
      async ({ searchTalentJobSupply, isJobSupplyOperational }) => {
        const result = await searchTalentJobSupply(params());
        assert.equal(result.providerStatus.portals, "empty");
        assert.equal(result.providerStatus.fallbackStatus, "disabled");
        assert.equal(isJobSupplyOperational(result.providerStatus), true);
      },
    );
  },
);

test(
  "one usable board keeps supply operational while other boards fail",
  { concurrency: false },
  async () => {
    await withIsolatedSearch(
      {
        env: { EVER_JOBS_ENABLED: "false" },
        fetch: async (input) => {
          const url = String(input);
          if (url.includes("/boards/databricks/"))
            return response({
              name: "Databricks",
              jobs: [
                {
                  id: "db-1",
                  title: "Engineer",
                  absolute_url:
                    "https://boards.greenhouse.io/databricks/jobs/1",
                  location: { name: "Remote" },
                },
              ],
            });
          return response({}, 503);
        },
      },
      async ({ searchTalentJobSupply, isJobSupplyOperational }) => {
        const result = await searchTalentJobSupply(params());
        assert.ok(result.jobs.some((job) => job.company === "Databricks"));
        assert.equal(result.providerStatus.portals, "success");
        assert.equal(
          result.providerStatus.diagnostics.filter(
            (d) => d.status === "unavailable",
          ).length > 0,
          true,
        );
        assert.equal(isJobSupplyOperational(result.providerStatus), true);
      },
    );
  },
);

test(
  "normalized direct portal fields retain unknown values and secondary locations",
  { concurrency: false },
  async () => {
    await withIsolatedSearch(
      {
        env: { EVER_JOBS_ENABLED: "false" },
        fetch: async (input) => {
          const url = String(input);
          if (url.includes("/job-board/ramp?"))
            return response({
              jobs: [
                {
                  id: "r-1",
                  title: "Engineer",
                  jobUrl: "https://jobs.ashbyhq.com/ramp/r-1",
                  location: "London",
                  secondaryLocations: [{ location: "Dublin" }],
                  workplaceType: "mystery",
                  employmentType: "Seasonal-ish",
                  publishedAt: "not a date",
                  compensation: {
                    summaryComponents: [
                      {
                        compensationType: "Salary",
                        currencyCode: "GBP",
                        interval: "mystery",
                        minValue: 50,
                        maxValue: null,
                      },
                    ],
                  },
                },
              ],
            });
          return emptyPortals(input);
        },
      },
      async ({ searchTalentJobSupply }) => {
        const result = await searchTalentJobSupply(params());
        const job = result.jobs.find(
          (candidate) => candidate.sourceMeta.sourceName === "ashby",
        );
        assert.ok(job);
        assert.deepEqual(job.locations, ["London", "Dublin"]);
        assert.equal(job.remoteMode, "unknown");
        assert.equal(job.employmentType, "Seasonal-ish");
        assert.equal(job.postedDate, "");
        assert.deepEqual(job.salary, {
          min: 50,
          max: null,
          currency: "GBP",
          interval: "unknown",
          isPredicted: false,
        });
      },
    );
  },
);

test(
  "late Lever candidates survive a large candidate request after more than sixty Greenhouse matches",
  { concurrency: false },
  async () => {
    await withIsolatedSearch(
      {
        env: { EVER_JOBS_ENABLED: "false" },
        fetch: async (input) => {
          const url = String(input);
          if (url.includes("/boards/databricks/"))
            return response({
              name: "Databricks",
              jobs: Array.from({ length: 75 }, (_, i) => ({
                id: `early-${i}`,
                title: `Engineer ${i}`,
                absolute_url: `https://boards.greenhouse.io/databricks/jobs/${i}`,
                location: { name: "New York" },
              })),
            });
          if (url.includes("/v0/postings/spotify"))
            return response([
              {
                id: "late-1",
                text: "Senior Engineer",
                hostedUrl: "https://jobs.lever.co/spotify/late-1",
                categories: { location: "New York" },
              },
            ]);
          return emptyPortals(input);
        },
      },
      async ({ searchTalentJobSupply }) => {
        const result = await searchTalentJobSupply(
          params({ resultsPerPage: 50 }),
        );
        assert.ok(result.jobs.length > 60);
        assert.ok(
          result.jobs.some(
            (job) =>
              job.sourceMeta.sourceName === "lever" &&
              job.sourceJobId === "late-1",
          ),
        );
      },
    );
  },
);

test(
  "Ever source policy rejects unlicensed Remotive and Adzuna rows and never leaks credentials into diagnostics",
  { concurrency: false },
  async () => {
    const requests = [];
    const secret = "credential-must-not-leak";
    await withIsolatedSearch(
      {
        env: {
          EVER_JOBS_ENABLED: "true",
          EVER_JOBS_API_URL: "https://source-policy-ever.test",
          EVER_JOBS_API_KEY: secret,
          EVER_JOBS_SAFE_SOURCES: "greenhouse,remotive,adzuna",
          ADZUNA_LICENSED: "false",
        },
        fetch: async (input, init = {}) => {
          const url = String(input);
          requests.push({ url, headers: init.headers || {} });
          if (url.startsWith("https://source-policy-ever.test"))
            return response({
              jobs: [
                null,
                {
                  id: "invalid",
                  title: "",
                  source: "greenhouse",
                  url: "https://boards.greenhouse.io/example/jobs/invalid",
                },
                {
                  id: "blocked-r",
                  title: "Remote Engineer",
                  source: "remotive",
                  url: "https://remotive.com/remote-jobs/1",
                },
                {
                  id: "blocked-a",
                  title: "Analyst",
                  source: "adzuna",
                  url: "https://adzuna.com/jobs/1",
                },
                {
                  id: "allowed",
                  title: "Engineer",
                  company: "Trusted Board",
                  source: "greenhouse",
                  url: "https://boards.greenhouse.io/example/jobs/allowed",
                },
              ],
            });
          return emptyPortals(input);
        },
      },
      async ({ searchTalentJobSupply }) => {
        const result = await searchTalentJobSupply(params());
        assert.equal(result.providerStatus.everJobs, "success");
        assert.equal(
          result.jobs.some(
            (job) =>
              job.sourceJobId === "blocked-r" ||
              job.sourceJobId === "blocked-a",
          ),
          false,
        );
        assert.ok(result.jobs.some((job) => job.sourceJobId === "allowed"));
        assert.equal(
          requests.some((request) => /remotive|adzuna/i.test(request.url)),
          false,
        );
        const everRequest = requests.find((request) =>
          request.url.startsWith("https://source-policy-ever.test"),
        );
        assert.equal(everRequest.headers["x-api-key"], secret);
        assert.equal(
          JSON.stringify(result.providerStatus).includes(secret),
          false,
        );
        assert.equal(JSON.stringify(result).includes(secret), false);
      },
    );
  },
);

test("parseJobSearchQuery bounds valid inputs and rejects malformed controls", () => {
  const { parseJobSearchQuery } = loadSelectionModule();
  const parsed = parseJobSearchQuery(
    new URLSearchParams(
      "query=Engineer&page=2000&limit=100&salaryMin=0&remote=true&sortBy=date",
    ),
  );
  assert.equal(parsed.query, "Engineer");
  assert.equal(parsed.page, 1000);
  assert.equal(parsed.resultsPerPage, 50);
  assert.equal(parsed.remote, true);
  assert.equal(parsed.sortBy, "date");
  for (const raw of [
    "page=0",
    "limit=abc",
    "remote=yes",
    "sortBy=unknown",
    "salaryMin=-1",
  ]) {
    assert.throws(
      () => parseJobSearchQuery(new URLSearchParams(raw)),
      RangeError,
      raw,
    );
  }
});
