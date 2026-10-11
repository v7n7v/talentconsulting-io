# Taco job scraper shortlist and integration plan

Research completed October 8, 2026 by three Luna agents covering managed scrapers, job-data APIs and open-source tools, followed by coordinator review of primary documentation and Taco's current code. Prices are published rates, not quotes. No scraper/API was run and no subscription was purchased; coverage, latency and record quality remain unmeasured. Firecrawl search was unavailable because of its account credit limit, so collection used web browsing.

## Decision

Keep native ATS adapters and Ever Jobs as the base. For added supply, the strongest candidates are **Fantastic.jobs for a maintained catalog**, and **Bright Data versus Apify Bebity for major-board scraping**. Evaluate them separately: collecting a search result does not establish a reliable stream of new, modified and closed jobs. These are research recommendations, not measured winners.

| Candidate | Best use in Taco | Published cost | Main qualification |
|---|---|---|---|
| [Ever Jobs](https://github.com/ever-jobs/ever-jobs) | Expand employer/ATS coverage through the existing service. | MIT software; hosting and maintenance remain. | Verify the deployed pin before assuming current upstream coverage. |
| [Fantastic.jobs](https://fantastic.jobs/api) | First paid feed pilot; periodically ingest into a local catalog. | **$95/month for 20k jobs**; **$175/50k** adds modified-job access. Request quotas also apply. | Prefer incremental ATS coverage; separate AI enrichment from source facts. |
| [Bright Data Jobs Scraper API](https://brightdata.com/products/web-scraper/jobs-scraper) | Provider-operated LinkedIn/Indeed/Glassdoor scraper pilot. | **$1.50/1,000 successful records**; advertised **5k free/month**. | Check complete descriptions/application paths and product-use terms. |
| [Apify Bebity LinkedIn](https://apify.com/bebity/linkedin-jobs-scraper) | Established community scraper for comparison with Bright Data. | **From $1/1,000 results**; optional enrichment costs extra. | Documented fields are untested; actor maintenance remains a dependency. |
| [JobSpy](https://github.com/speedyapply/JobSpy) | Open-source major-board comparator in a separate Python worker. | MIT software; worker/proxy/maintenance costs. | Google currently returns no jobs per its release note; other sources need testing. |
| [TheirStack](https://theirstack.com/en/pricing) | Broad-feed comparison with explicit public-display terms. | **$49/month for 1,500 credits**; **$169/10k**. One returned job uses one credit. | Judge additional usable jobs after dedupe, not catalog size. |
| [JSearch](https://www.openwebninja.com/api/jsearch) | Cheap query-time gap-filler. | **$25/month for 10k requests**; 200-request free tier. | Google-indexed results; requests are not records or a closure feed. |

Coresignal and JobsPikr remain alternatives where a sample/quote establishes fit. Crawlee, Scrapy and Firecrawl are extraction infrastructure requiring source-specific work. The cheaper new Apify Actors are useful benchmarks: `agenttoolworks` explicitly lacks the external employer application URL for LinkedIn, while `fetch_cat` Workday has little adoption. See the separate reports for those candidates and their primary sources.

Fantastic.jobs [terms](https://developer.fantastic.jobs/terms) address end-user job-board/matching use; TheirStack [terms](https://theirstack.com/en/docs/legal/terms-and-conditions) explicitly address public job display. Bright Data's [MSA](https://brightdata.com/license) limits competitive redistribution of Data Services data, leaving Taco's intended use a contract-fit question. Software licensing and permission to publish source content are distinct. This affects provider selection and retention design.

## What Taco needs to change

Current integration points are `lib/job-ingestion.ts`, `lib/job-source-policy.ts`, `lib/job-recommendation-platform.ts`, `lib/job-search-api.ts` and `lib/job-supply-health.ts`. Existing normalization, source trust, ranking and local pagination should consume the new supply.

**Separate transport from origin.** Bright Data, Apify and Fantastic.jobs describe how Taco obtained a job; LinkedIn, Workday or an employer URL describe its origin. Taco's source allowlist does not currently include LinkedIn or Indeed. A trusted vendor response must not silently pass that allowlist. Add explicit origin profiles and URL validation for selected sources, rather than trusting every hostname returned by a vendor. Keep Remotive disabled and the existing Adzuna license gate authoritative.

**Keep evidence intact.** Map full plain-text description, stable source ID, canonical and application URLs, locations, work mode, employment type, pay currency/interval, publication/update dates and observation time into the current contract. Add provider/run identity and field-level inference provenance where needed. Missing fields stay unknown; AI or location-derived claims cannot acquire source-fact confidence. Keep provider discovery time distinct from employer publication time.

**Move slow collection off the search request.** Use a scheduled worker and a persisted catalog for feeds and asynchronous scraping. Store run state, pagination cursor, completion status, timestamps and quota usage. Advance a feed checkpoint only after its pages are persisted; reruns must be idempotent. Users search a bounded catalog snapshot through the current merge/filter/rank/page path. This persistence and scheduler are proposed additions, not existing capabilities.

```mermaid
flowchart LR
  Worker[Scheduled provider worker] --> Map[Provider mapping and diagnostics]
  Map --> Policy[Origin policy and URL validation]
  Policy --> Catalog[Job catalog and run checkpoints]
  ATS[Existing direct ATS adapters] --> Search[Merge, dedupe, filter and rank]
  Catalog --> Search
  Search --> Page[Stable snapshot pagination]
```

**Track closure explicitly.** Keep provider IDs separate from cross-source identity, prefer the employer/ATS application path when verified, and retain contributing provenance. Use explicit expired/closed events or a complete documented reconciliation pass. Absence from a query, truncated scrape or failed run cannot mean closed. An ATS posting found by a feed should merge with the native record instead of producing a second card.

**Expose operational failures.** Reuse `ProviderDiagnostic` outcomes for timeout, rate limit, malformed data, unavailable source and healthy empty results. Add bounded job/request/run budgets and backoff, keep credentials on the server, and report partial completion independently of zero matches. Cached evidence can remain usable with its age visible when collection fails.

## Implementation sequence

1. **Contract fixtures first.** Create adapter fixtures from documented schemas, clearly labeled synthetic. Exercise missing descriptions, invalid dates/URLs, inferred work mode/pay, duplicate IDs, paginated responses and typed failures. Extend evidence/provider identity without enabling new sources. Acceptance: no fabricated metadata and no trust bypass.
2. **Existing-service canary.** Verify the exact Ever Jobs pin and API response; select 5–10 Workday employer boards. Measure detail completeness, pagination and overlap with current supply. Current upstream documentation is not evidence of deployed behavior.
3. **One feed adapter.** Implement Fantastic.jobs active/expired ingestion, explicit text descriptions, restartable cursors and catalog snapshots. Modified-job reconciliation requires the appropriate plan. Keep it disabled until configured; replay fixtures before live evaluation.
4. **Two scraper adapters.** Implement Bright Data trigger/result retrieval and Apify run/dataset retrieval behind the same worker contract. Record run costs and partial failures. Compare Bright Data and Bebity on the same LinkedIn queries, then evaluate Indeed/Glassdoor separately. Avoid live scraping inside Next.js request handlers.
5. **Select and stage.** Choose the provider by usable incremental jobs, cost and freshness. Enable one origin/provider combination in staging with a bounded collection budget. Rollback disables that adapter and retains the native ATS path; closed/unverified records do not remain eligible through stale catalog snapshots.

## Bounded pilot and acceptance evidence

Use six fixed searches: software engineer, data analyst and customer success, each in US-remote and London/GB, posted within seven days where supported. Request 50–100 records per query with a hard ceiling of 500 per provider; log unsupported filters. Compare the same source/query pairs, not a global feed against a single-board scraper. Also use selected employer boards with known postings and a small set of known closed roles.

Record valid IDs/titles/URLs, full-description presence, application destination, duplicate rate, new jobs beyond Taco's baseline, geographic/work-mode accuracy, explicit versus inferred fields, publication/observation lag, closure lag, partial runs and actual billed units. Manually compare a representative sample with the original postings.

Proposed thresholds: at least 95% usable ID/title/listing URL and 90% full descriptions; zero invented facts or source-policy bypasses in the audit sample. A missing employer application URL lowers usefulness but does not automatically invalidate a legitimate board application path. Report closure lag separately from new-job freshness. These thresholds are Taco's proposed targets, not provider promises. No live pilot results exist yet.

## Research files

- [Managed scraper report](job-scraper-research-managed-2026-10-08.md)
- [Job-data API report](job-scraper-research-apis-2026-10-08.md)
- [Open-source report](job-scraper-research-open-source-2026-10-08.md)
- [Existing parsing implementation plan](job-site-parsing-implementation-plan.md)

## Implementation checkpoint — October 8, 2026

The local delivery now includes Fantastic.jobs active/expired ingestion, Bright Data and Apify asynchronous adapters, a fenced Firestore catalog and authenticated worker, and catalog/native search merging with origin validation and retained provider evidence. New collection switches default off. The initial provider/catalog suite passed 56 tests; parsing, recommendation pipeline and assistant checks also passed. Fixtures are synthetic; no live provider comparison or deployed storage validation has been completed. The subsequent authorized PDF fix cleared the `pageSize` type error; type-check and production build now pass.

Start with the Fantastic.jobs staging canary before selecting a recurring provider. Server keys and staging configuration are still needed. See the [catalog operations runbook](job-catalog-operations.md) for configuration, budgets, recovery, storage retention and the bounded rollout procedure.
