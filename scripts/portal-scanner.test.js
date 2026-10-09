const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { buildSync } = require("esbuild");
const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "portal-scanner-")),
  "scanner.cjs",
);
buildSync({
  entryPoints: [path.join(__dirname, "..", "lib", "portal-scanner.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
  logLevel: "silent",
});
const scanner = require(outfile);
const oldFetch = global.fetch;
function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
test.after(() => {
  global.fetch = oldFetch;
});
test(
  "503 boards fail, valid empty boards succeed, malformed payloads fail",
  { concurrency: false },
  async () => {
    global.fetch = async () => response({}, 503);
    const failed = await scanner.scanCompanyPortals("fail-case");
    assert.equal(failed.boardsFailed, 3);
    assert.equal(failed.boardsSucceeded, 0);
    assert.equal(failed.status, "unavailable");
    global.fetch = async () => response({ jobs: [] });
    const empty = await scanner.searchAshby("empty-case");
    assert.equal(empty.status, "empty");
    global.fetch = async () => response({ nope: [] });
    const bad = await scanner.searchAshby("malformed-case");
    assert.equal(bad.status, "malformed");
  },
);
test(
  "Greenhouse preserves decoded long description and unknown publication time",
  { concurrency: false },
  async () => {
    const description =
      "&amp;lt;p&amp;gt;Overview&amp;lt;/p&amp;gt;" +
      "x".repeat(700) +
      "&amp;lt;p&amp;gt;Must know Python and SQL&amp;lt;/p&amp;gt;";
    global.fetch = async () =>
      response({
        name: "GH",
        jobs: [
          {
            id: 1,
            title: "Analyst",
            content: description,
            absolute_url: "https://example.com/job",
          },
        ],
      });
    const r = await scanner.searchGreenhouse("gh-long");
    const j = r.jobs[0];
    assert.match(j.description, /Must know Python and SQL/);
    assert.equal(j.descriptionPreview.length, 500);
    assert.equal(j.ingestion.descriptionTruncated, false);
    assert.equal(j.postedDate, "");
  },
);
test(
  "Lever includes lists and structured pay, commitment, work mode, locations and apply URL",
  { concurrency: false },
  async () => {
    let requested = "";
    global.fetch = async (url) => {
      requested = String(url);
      return response([
        {
          id: "l1",
          text: "Engineer",
          hostedUrl: "https://jobs.example/l1",
          applyUrl: "https://apply.example/l1",
          descriptionPlain: "Intro",
          description: "DUPLICATE INTRO",
          lists: [
            {
              text: "Requirements",
              content: "<ul><li>Python</li><li>SQL</li></ul>",
            },
          ],
          additionalPlain: "Closing text",
          additional: "DUPLICATE CLOSING",
          categories: {
            commitment: "Part-time",
            location: "Berlin",
            allLocations: ["Berlin", "Remote"],
          },
          workplaceType: "hybrid",
          salaryRange: { min: 30, max: 50, currency: "EUR", interval: "hour" },
        },
        {
          id: "l2",
          text: "Engineer with malformed list object",
          hostedUrl: "https://jobs.example/l2",
          descriptionPlain: "Still usable",
          lists: { malformed: true },
        },
        {
          id: "l3",
          text: "Engineer with null list entry",
          hostedUrl: "https://jobs.example/l3",
          descriptionPlain: "Also usable",
          lists: [null, { text: "Requirements", content: "Python" }],
        },
      ]);
    };
    const result = await scanner.searchLever(
      "lever-case",
      "engineer",
      50,
      "eu",
    );
    assert.equal(result.status, "success");
    assert.equal(result.jobs.length, 3);
    assert.match(result.jobs[1].description, /Still usable/);
    assert.match(result.jobs[2].description, /Python/);
    const j = result.jobs[0];
    assert.match(j.description, /SQL/);
    assert.equal(j.description.includes("DUPLICATE"), false);
    assert.equal(j.employmentType, "Part-time");
    assert.equal(j.remoteMode, "hybrid");
    assert.equal(j.salary.interval, "hour");
    assert.equal(j.applyUrl, "https://apply.example/l1");
    assert.equal(j.locations.length, 2);
    assert.match(requested, /api.eu.lever.co/);
  },
);
test(
  "Ashby excludes unlisted roles and retains base compensation only",
  { concurrency: false },
  async () => {
    global.fetch = async (url) => {
      assert.match(url, /includeCompensation=true/);
      return response({
        organizationName: "Ashby Co",
        jobs: [
          {
            id: "hidden",
            title: "Hidden",
            jobUrl: "https://jobs.ashbyhq.com/a/hidden",
            isListed: false,
          },
          {
            id: "shown",
            title: "Visible",
            jobUrl: "https://jobs.ashbyhq.com/a/shown",
            publishedAt: "invalid",
            isListed: true,
            descriptionPlain: "Plain text",
            descriptionHtml: "<p>duplicate</p>",
            isRemote: true,
            employmentType: "PartTime",
            location: "London",
            address: { postalAddress: { addressCountry: "GB" } },
            secondaryLocations: [{ location: "Dublin" }],
            compensation: {
              summaryComponents: [
                {
                  compensationType: "EquityPercentage",
                  interval: "NONE",
                  currencyCode: null,
                  minValue: 0.5,
                  maxValue: 1.75,
                },
                {
                  compensationType: "Salary",
                  interval: "1 YEAR",
                  currencyCode: "USD",
                  minValue: 81000,
                  maxValue: 87000,
                },
                {
                  compensationType: "Bonus",
                  interval: "1 YEAR",
                  currencyCode: "USD",
                  minValue: 100,
                  maxValue: 200,
                },
              ],
              compensationTiers: [
                {
                  components: [
                    {
                      compensationType: "Salary",
                      interval: "1 YEAR",
                      currencyCode: "USD",
                      minValue: 90000,
                      maxValue: 95000,
                    },
                    {
                      compensationType: "Bonus",
                      interval: "1 YEAR",
                      currencyCode: "USD",
                      minValue: 1,
                      maxValue: 2,
                    },
                  ],
                },
              ],
            },
          },
        ],
      });
    };
    const r = await scanner.searchAshby("ashby-case");
    assert.equal(r.jobs.length, 1);
    const j = r.jobs[0];
    assert.equal(j.postedDate, "");
    assert.equal(j.remoteMode, "remote");
    assert.equal(j.country, "GB");
    assert.equal(j.employmentType, "Part-time");
    assert.equal(j.salary.min, 81000);
    assert.equal(j.salary.max, 87000);
    assert.equal(j.salary.interval, "year");
    assert.deepEqual(j.locations, ["London", "Dublin"]);
    assert.equal(j.description, "Plain text");
  },
);
test(
  "Ashby uses salary tier components when summary components are absent",
  { concurrency: false },
  async () => {
    global.fetch = async () =>
      response({
        jobs: [
          {
            id: "tiered",
            title: "Tiered",
            jobUrl: "https://jobs.ashbyhq.com/tiered",
            compensation: {
              summaryComponents: [],
              compensationTiers: [
                {
                  components: [
                    {
                      compensationType: "Salary",
                      currencyCode: "EUR",
                      interval: "1 YEAR",
                      minValue: 50000,
                      maxValue: 60000,
                    },
                    {
                      compensationType: "Bonus",
                      currencyCode: "EUR",
                      minValue: 1,
                      maxValue: 9,
                    },
                  ],
                },
                {
                  components: [
                    {
                      compensationType: "Salary",
                      currencyCode: "EUR",
                      interval: "1 YEAR",
                      minValue: 70000,
                      maxValue: 80000,
                    },
                  ],
                },
              ],
            },
          },
        ],
      });
    const job = (await scanner.searchAshby("tier-fallback")).jobs[0];
    assert.deepEqual(job.salary, {
      min: 50000,
      max: 80000,
      currency: "EUR",
      interval: "year",
    });
  },
);
test(
  "raw board cache is shared across query and limit and concurrent requests coalesce",
  { concurrency: false },
  async () => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return response({
        jobs: [
          {
            id: 1,
            title: "Data Analyst",
            absolute_url: "https://example.com/1",
            content: "Python",
          },
          {
            id: 2,
            title: "Engineer",
            absolute_url: "https://example.com/2",
            content: "Go",
          },
        ],
      });
    };
    const [a, b] = await Promise.all([
      scanner.searchGreenhouse("cache-case", "analyst", 1),
      scanner.searchGreenhouse("cache-case", "python", 2),
    ]);
    assert.equal(calls, 1);
    assert.equal(a.jobs.length, 1);
    assert.equal(b.jobs.length, 1);
    const c = await scanner.searchGreenhouse("cache-case", "engineer", 2);
    assert.equal(calls, 1);
    assert.equal(c.jobs[0].id, "gh-2");
  },
);
test(
  "all known boards expose failures in aggregate diagnostics",
  { concurrency: false },
  async () => {
    global.fetch = async () => response({}, 503);
    const r = await scanner.searchAllKnownBoards("zz-no-match", 3);
    assert.equal(r.boardsSucceeded, 0);
    assert.equal(r.boardsFailed, Object.keys(scanner.KNOWN_BOARDS).length);
    assert.equal(r.status, "unavailable");
  },
);
test(
  "rejects bad rows individually, invalid credential URLs, and unsafe slugs",
  { concurrency: false },
  async () => {
    global.fetch = async () =>
      response({
        jobs: [
          null,
          4,
          { id: "bad", title: "No URL", absolute_url: "http://bad.test" },
          {
            id: "good",
            title: "Good",
            absolute_url: "https://user:pass@bad.test/job",
          },
          { id: "ok", title: "Okay", absolute_url: "https://good.test/job" },
        ],
      });
    const r = await scanner.searchGreenhouse("mixed-rows");
    assert.equal(r.status, "success");
    assert.equal(r.jobs.length, 1);
    assert.equal(r.diagnostics[0].rejectedRows, 4);
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return response({ jobs: [] });
    };
    const unsafe = await scanner.searchAshby("../unsafe");
    assert.equal(unsafe.status, "malformed");
    assert.equal(calls, 0);
  },
);
test(
  "preserves 429 and timeout outcomes and aggregates valid empty as empty",
  { concurrency: false },
  async () => {
    global.fetch = async () => response({}, 429);
    const limited = await scanner.searchGreenhouse("rate-limit-case");
    assert.equal(limited.status, "rate_limited");
    global.fetch = async () => {
      const e = new Error("timeout");
      e.name = "TimeoutError";
      throw e;
    };
    const timed = await scanner.searchLever("timeout-case");
    assert.equal(timed.status, "timeout");
    global.fetch = async (url) =>
      String(url).includes("lever.co") ? response([]) : response({ jobs: [] });
    const empty = await scanner.scanCompanyPortals("aggregate-empty");
    assert.equal(empty.status, "empty");
    assert.equal(empty.boardsSucceeded, 3);
  },
);
test(
  "cache callers cannot mutate another caller and large aggregate limits retain late boards",
  { concurrency: false },
  async () => {
    let calls = 0;
    global.fetch = async (url) => {
      calls++;
      const u = String(url);
      if (u.includes("spotify"))
        return response([
          {
            id: "late",
            text: "Late Role",
            hostedUrl: "https://jobs.test/late",
          },
        ]);
      return response({
        name: "Earlier",
        jobs: Array.from({ length: 80 }, (_, i) => ({
          id: i,
          title: `Role ${i}`,
          absolute_url: `https://jobs.test/${i}`,
        })),
      });
    };
    const a = await scanner.searchGreenhouse("mutation-case");
    a.jobs[0].locations.push("CORRUPTED");
    const b = await scanner.searchGreenhouse("mutation-case");
    assert.deepEqual(b.jobs[0].locations, []);
    const result = await scanner.searchAllKnownBoards("role", 1000);
    assert.ok(result.jobs.some((j) => j.sourceJobId === "late"));
    assert.ok(result.jobs.length > 60);
    assert.equal(calls > 1, true);
  },
);
