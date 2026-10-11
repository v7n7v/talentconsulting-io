# Open-source job scrapers for Taco (2026-10-08)

## Recommendation

Keep Taco's direct Greenhouse, Lever, and Ashby adapters as the preferred path. Add coverage through the already deployed self-hosted Ever Jobs service, beginning with a narrow Workday canary for an explicit allowlist of public company boards. Taco already integrates with Ever Jobs and normalizes its results with source trust, cache, and outcome handling. JobSpy and generic crawler frameworks solve different problems and do not replace those direct adapters.

The Taco service pin is `a9f0bb58f8da2cad56fce3d0190b3fa3182de7de`. Its [upstream commit page](https://github.com/ever-jobs/ever-jobs/commit/a9f0bb58f8da2cad56fce3d0190b3fa3182de7de) identifies the commit as a Workable company-source pipeline foundation. That commit message and its included spec do not establish the full feature set in Taco's pinned deployment. Current `develop` docs describe more capabilities, but the exact pinned-source-to-current-upstream diff and deployment API response were not verified here. Ever Jobs has [no published GitHub releases](https://github.com/ever-jobs/ever-jobs/releases), so compare exact revisions and run Taco's existing staging canary before changing a pin.

## Options

| Project | Evidence and fit |
|---|---|
| [Ever Jobs](https://github.com/ever-jobs/ever-jobs) | TypeScript/NestJS service with independent source packages and REST/GraphQL interfaces; current upstream README lists 160+ sources and its [ATS guide](https://github.com/ever-jobs/ever-jobs/blob/develop/docs/ATS_INTEGRATIONS.md) lists 41 ATS adapters, including Workday, SmartRecruiters, SAP SuccessFactors, and iCIMS. Best fit because Taco already operates it. This is repository documentation, not a live test of each tenant or the pinned version. MIT software license. |
| [JobSpy](https://github.com/speedyapply/JobSpy) | Python >=3.10 library. README lists LinkedIn, Indeed, Glassdoor, ZipRecruiter, Bayt, Naukri, BDJobs, and Google; current code also maps a HelloWork scraper, which README omits. The [v1.2.0 release](https://github.com/speedyapply/JobSpy/releases/tag/v1.2.0) was issued October 2, 2026. The code registers Google, while its release note says Google currently returns no jobs because it requires JavaScript. Treat Google as present in code but unavailable in practice. A separate Python service is needed for Taco. MIT license. |
| [Crawlee](https://crawlee.dev/js/api/playwright-crawler) with Playwright/Cheerio | TypeScript crawler framework, not a job-source catalog. Playwright handles JS-rendered pages; Cheerio handles ordinary HTML over HTTP. It supplies queues/concurrency, but each ATS still needs a maintained adapter, pagination, field mapping, and failure policy. Use only when a source lacks a usable structured feed/API. |
| [Scrapy](https://docs.scrapy.org/en/latest/intro/overview.html) | Mature Python framework with spiders, selectors, request scheduling, and pagination patterns; no job adapters implied. It adds a second runtime alongside Taco and Ever Jobs. |
| [Firecrawl](https://github.com/firecrawl/firecrawl) | General extraction/crawl layer, not an ATS adapter or job discovery catalog. Self-hostable; main code is AGPL-3.0, with some separately licensed components. Requires separate review of AGPL obligations and operational stack. No paid hosted scraping is recommended. |

## Coverage and practical limits

JobSpy's [README](https://github.com/speedyapply/JobSpy/blob/main/README.md) documents `scrape_jobs()` returning a pandas dataframe, with search/location filters, `offset`, result limits, and optional `fetch_description`. The source set is general job boards, not targeted employer ATS adapters. It says description fetching adds one request per job where search results lack detail, results cap around 1,000 per source/query, and LinkedIn/Glassdoor rate-limit readily. Its proxy suggestions are operational notes, not a recommendation for Taco; back off or mark a blocked source unavailable. Fields such as salary, posted date, location, and description can be missing. Indeed's `hours_old` refers to board-added time while `date_posted` is the employer's date, so fields are not interchangeable across sources.

Ever Jobs is the strongest additive option, but “adapter exists” does not prove the public endpoint is unauthenticated or complete. Its current [ATS guide](https://github.com/ever-jobs/ever-jobs/blob/develop/docs/ATS_INTEGRATIONS.md) says Workday uses company-specific REST endpoints and bounds description/detail enrichment to 50 postings per search by default; other jobs may be list-level only. It says SuccessFactors can use OData, Career Site Builder, or native careersection HTML, depending on tenant. SAP's [public XML job feed documentation](https://userapps.support.sap.com/sap/support/knowledge/E/2428902) says the feed lists jobs on the default career site; filters depend on employer provisioning.

SmartRecruiters needs endpoint-level care: its [company posting-list endpoint](https://developers.smartrecruiters.com/reference/v1listpostings) lists public postings and documents the internal-read scope only for internal results. The separate [Posting API overview](https://developers.smartrecruiters.com/docs/posting-api) describes API-key/OAuth support, including an internal-postings scope. Do not infer that every SmartRecruiters endpoint is unauthenticated from the public career page. Recruitee's upstream Ever Jobs guide describes `{slug}.recruitee.com/api/offers`, but official [Careers Site API authentication docs](https://docs.recruitee.com/reference/authentication-1) set February 10, 2027 as the deadline to add a token for `/offers` and `/offers/:id`; verify the applicable endpoint/version before relying on it. iCIMS uses browser plus JSON gateway per Ever Jobs docs, making it a less simple first pilot.

Current Ever Jobs docs also warn that paginated requests can be separate crawls unless a complete cached result is reused; source caps can produce fewer rows than exist. Treat partial/failure diagnostics as operational evidence. Do not infer that an omitted job is closed from one partial or capped crawl. None of the tools guarantees full job text, salary, location granularity, or posted/updated date across every ATS.

## Narrow pilot

After comparing the exact deployed pin with current upstream and verifying the selected tenant's public endpoint and request policy, run one source only: Workday, for 5–10 explicitly selected public company boards, with a low result limit and a few representative searches. Stop on 403, 429, CAPTCHA, or site-owner restriction; do not use unattended login or proxy rotation. Compare the returned records with the original employer posting.

For each result, record stable ID, apply URL, title, location, full-description presence, compensation/currency, job type, posting date, pagination completeness, and source failure state. The pilot is useful if Taco preserves description and provenance, classifies the record as direct ATS/company evidence, and leaves unavailable fields unknown. No scraper was installed or executed and no live job-board scrape was performed; this is a research recommendation, not an integration test.

## Software license and job content

MIT or AGPL licenses cover the software under their terms; they do not grant rights to redistribute source-site job descriptions, logos, or personal data. Review each site's terms, robots directives, privacy obligations, and retention rules before expanding collection or display. Keep original source links and attribution.

## Primary sources

- [JobSpy README and MIT license](https://github.com/speedyapply/JobSpy) · [v1.2.0 release](https://github.com/speedyapply/JobSpy/releases/tag/v1.2.0)
- [JobSpy Python source registration](https://github.com/speedyapply/JobSpy/blob/main/jobspy/__init__.py) · [HelloWork scraper code](https://github.com/speedyapply/JobSpy/blob/main/jobspy/hellowork/__init__.py)
- [Ever Jobs pinned commit](https://github.com/ever-jobs/ever-jobs/commit/a9f0bb58f8da2cad56fce3d0190b3fa3182de7de) · [README](https://github.com/ever-jobs/ever-jobs) · [ATS guide](https://github.com/ever-jobs/ever-jobs/blob/develop/docs/ATS_INTEGRATIONS.md) · [releases](https://github.com/ever-jobs/ever-jobs/releases)
- [Workday API docs](https://developer.workday.com/documentation/GUID-7b3b1dd7-e3b0-4a34-846b-6e37673226e1-enHYPHENus/WorkdayAPIs) · [SAP XML job feed](https://userapps.support.sap.com/sap/support/knowledge/E/2428902)
- [SmartRecruiters public postings](https://developers.smartrecruiters.com/reference/v1listpostings) · [Posting API overview](https://developers.smartrecruiters.com/docs/posting-api)
- [Recruitee Careers API authentication](https://docs.recruitee.com/reference/authentication-1)
- [Crawlee docs](https://crawlee.dev/js/api/playwright-crawler) · [Scrapy overview](https://docs.scrapy.org/en/latest/intro/overview.html) · [Firecrawl repo/self-hosting](https://github.com/firecrawl/firecrawl)
