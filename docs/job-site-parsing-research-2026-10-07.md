# Taco job-site parsing research

Reviewed October 7, 2026. Scope: current local code, official provider documentation, isolated parser reproductions, and existing supply tests. Application code was not changed. Production configuration and live board availability were not verified.

Taco has working API adapters, but loses useful job evidence during normalization. Improve description preservation, structured fields, and failure reporting before expanding source coverage.

## Current implementation

| Path | Behavior |
|---|---|
| `lib/portal-scanner.ts` | Direct public JSON adapters for Greenhouse, Lever, and Ashby; 10-minute process-local cache; 8-second fetch timeout. |
| `KNOWN_BOARDS` in that file | 16 configured employers: 9 Greenhouse, 6 Ashby, 1 Lever. Embedded posting counts are historical comments, not current measurements. |
| `searchAllKnownBoards` | Fetches up to 2,000 retained jobs per board, matches query terms, then returns the first 60 matches. |
| `lib/job-recommendation-platform.ts` | Searches Ever Jobs and direct boards concurrently; normalizes, checks source/host trust, deduplicates, and ranks jobs. |
| `lib/job-search-api.ts` | Legacy fallback: Adzuna requires `ADZUNA_LICENSED=true` plus credentials; Remotive returns an empty disabled result. Header comments claiming an always-working fallback are stale. |
| `app/api/jobs/search/route.ts` | Main search and recommendation endpoint. |
| `app/api/jobs/portal/route.ts` | Company-specific direct-board lookup. |
| `docs/browser-extension-plan.md` | Planned user-activated job clipper for LinkedIn, Indeed, Greenhouse, Lever, and Workday. No implemented extension parser was located in this review. |

Workday is allowed through Ever Jobs; there is no native Workday adapter in the portal scanner. The staging Compose file pins Ever Jobs to `a9f0bb58f8da2cad56fce3d0190b3fa3182de7de`; current upstream documentation does not establish the behavior of that deployed revision.

## Findings and priorities

| Priority | Finding | Evidence and effect |
|---|---|---|
| High | Descriptions are truncated before analysis | `portal-scanner.ts:65`, `:121`, `:176` retain 500 characters. A fixture with an introduction followed by Python/SQL requirements lost both requirements. Company-specific description search and downstream skill/fit analysis therefore operate on incomplete text. |
| High | Lever requirements are omitted | `portal-scanner.ts:121` reads only `descriptionPlain`/`description`. Lever also supplies `lists` and closing content. A fixture with requirements in `lists` returned only the opening sentence. |
| High | Board failures become successful empty scans | Adapters catch errors and return empty results; `portal-scanner.ts:345` counts every fulfilled result as success. A fixture returning HTTP 503 for every request produced **16 succeeded, 0 failed, 0 jobs**. |
| High | Structured facts are discarded or replaced | `PortalJob` has no compensation, workplace type, or employment-type fields. `job-recommendation-platform.ts:651` labels every direct-board job Full-time. `:627` infers work mode from text rather than explicit provider flags. This can mislabel contract, part-time, hybrid, or remote roles. |
| High | Ashby listing visibility is ignored | `searchAshby` maps every returned job without checking `isListed`. Official documentation says false means direct-link-only. Exclude those rows from broad discovery. |
| Medium | Ranking happens after a biased shortlist | `portal-scanner.ts:362` takes the first 60 matches in configured board order; composite ranking occurs later. An early employer can crowd out better matches from later boards. |
| Medium | Filters and pagination are incomplete for direct boards | `searchCompanyPortalMatches` forwards the query only. Location becomes a ranking preference later; page/fullTime do not filter direct-board results, and finalization always sorts by match score. A page or salary/date sort request does not consistently govern the merged result. |
| Medium | HTML decoding is incomplete | `portal-scanner.ts:373` strips tags before decoding entities. A fixture beginning `&lt;p&gt;` retained literal `<p>` in the supposedly plain description. This is a text-quality finding, not an established XSS vulnerability. |
| Medium | Skill extraction uses substring matching | `job-search-api.ts:95` uses `includes`. The sentence “We react quickly to goals.” produces `Go` and `React`. Word boundaries help with Go, but ambiguous words also need context. |
| Medium | Posting time is confused with observation/update time | Greenhouse maps `updated_at` to `postedDate`; missing dates become the current time. Freshness and ghost-job analysis cannot distinguish publication, update, and first observation. |
| Medium | Source controls differ between paths | Adzuna and Remotive are gated/disabled in the legacy adapter but remain in Ever Jobs defaults. Host validation alone does not enforce the same product policy across both ingestion paths. |

## Provider-specific implementation direction

**Greenhouse:** Keep the existing public Job Board API. Preserve the complete decoded description and separate publication/update timestamps. Its detail endpoint exposes `first_published` and can return pay ranges with `pay_transparency=true`; use detail enrichment when needed. See [official Greenhouse documentation](https://docs.greenhouse.io/job-board.html).

**Lever:** Assemble the body, requirements/benefits lists, and closing text without duplicating the opening. Retain `categories.commitment`, `allLocations`, `workplaceType`, `salaryRange` including interval/currency, and both listing/apply URLs. Support the documented EU API host where applicable. See [official Lever postings API](https://github.com/lever/postings-api).

**Ashby:** Prefer supplied plain text, preserve work mode/employment type/secondary locations, filter unlisted jobs from discovery, and request `includeCompensation=true`. Preserve compensation components rather than treating equity or bonuses as base salary. See [official Ashby postings API](https://developers.ashbyhq.com/docs/public-job-posting-api).

**Ever Jobs:** Keep a versioned contract fixture for the pinned service. Preserve structured `isRemote` and compensation interval instead of re-inferring or discarding them. Current upstream documents paginated requests through query parameters; Taco sends `page` in the JSON body, so verify against the pinned revision before claiming pagination support. See [upstream API documentation](https://github.com/ever-jobs/ever-jobs#api-usage).

**Browser import:** Treat this as a separate feature from search supply. Recommended extraction order: recognized ATS API, structured JobPosting data, host-specific visible-page parser, then user paste when extraction fails. Preserve the existing plan's user activation and review flow. No general-purpose URL-to-job parser was located in the reviewed code.

## Recommended implementation order

1. Introduce a normalized job contract with full description plus separate preview, employment type, workplace type, multiple locations, compensation currency/interval, distinct timestamps, and extraction provenance. Preserve unknown values explicitly.
2. Repair the three direct adapters, with fixtures for late requirements, Lever lists, encoded HTML, Ashby visibility, part-time roles, and hourly compensation.
3. Represent provider outcomes explicitly: success, empty, disabled, timeout, rate-limited, malformed, and unavailable. Carry direct-board outcomes into overall supply health.
4. Apply requested filters and sorting to a sufficiently broad merged candidate set, then paginate. Replace the early first-60 cutoff with a bounded selection strategy that considers all boards.
5. Centralize source enablement and add a shared ingestion/cache layer with request coalescing as traffic grows. Expand employer coverage and browser imports after data quality is reliable.

## Validation performed

Isolated Node/esbuild fixtures executed the current source with mocked HTTP responses and confirmed four cases: description truncation/encoded markup, omitted Lever lists, incorrect all-board success counts, and substring skill false positives. These were temporary research probes, not added production tests.

Ran:

```sh
node --test scripts/job-recommendation-score.test.js scripts/job-supply-health.test.js scripts/ever-jobs-staging-canary.test.js
```

Result: **34 passed, 1 failed**. The failure is `an unsupported Ever Jobs success payload cannot become a healthy empty search`, at `scripts/job-recommendation-score.test.js:146`: fallback status is `empty` where the test expects `error`. The unsupported Ever Jobs response is correctly classified as an error, but the disabled legacy fallback becomes a healthy empty result. Reconcile disabled fallback status and failed direct-board status rather than merely changing the assertion.

No live production search, authenticated end-to-end flow, source-license assessment, or current employer-board census was performed.
