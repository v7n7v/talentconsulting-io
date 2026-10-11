# Job catalog operations

## Current state

The authenticated trigger is available at `/api/cron/job-catalog`. It accepts `POST` and `GET`, requires `Authorization: Bearer <CRON_SECRET>` (or the existing `x-cron-secret` header convention), and accepts only a `provider` query parameter. Providers currently exposed by the contract are `fantastic`, `brightdata`, and `apify`; omitting the parameter selects `fantastic`.

No schedule, deployment, provider account, credentials, or live canary has been created by this change. The staging Compose template pins Ever Jobs to `a9f0bb58f8da2cad56fce3d0190b3fa3182de7de`, but the expected `deploy/staging/.env.staging` is absent from this checkout. The local pilot preflight reports configuration not ready and zero provider/deployment calls. Do not treat checked-in templates or code defaults as evidence that providers are configured.

## Fantastic.jobs staging preflight

Use a dedicated staging Firebase project and an explicitly selected staging hostname. The production Firebase project is rejected by the local check. Supply credentials through the staging secret store or the protected staging environment file, never through a chat message or broad file search.

Start with these collection settings alongside the staging runtime/Firebase configuration:

```dotenv
JOB_CATALOG_ENABLED=true
JOB_CATALOG_ORIGINS=greenhouse,lever,ashby,workday
FANTASTIC_JOBS_ENABLED=true
FANTASTIC_JOBS_SOURCES=greenhouse,lever.co,ashby,workday
JOB_INGEST_MAX_ITEMS=100
JOB_INGEST_MAX_REQUESTS=4
JOB_INGEST_DAILY_MAX_RECORDS=100
JOB_INGEST_DAILY_MAX_REQUESTS=10
JOB_INGEST_INTERVAL_SECONDS=3600
JOB_INGEST_QUERY=software engineer
JOB_INGEST_LOCATION=United States
```

Keep other paid collection adapters disabled. Provider billing must still be checked against the plan; these counters reserve requests/records conservatively. A capped pass can remain partial, which does not establish full market coverage or closure reconciliation.

Run the preflight against one explicit environment file with mode `0600`:

```sh
npm run jobs:catalog:preflight -- \
  --staging-env-file=deploy/staging/.env.staging \
  --expected-staging-hostname='<chosen-staging-hostname>' \
  --expected-firebase-project-id='<dedicated-staging-project-id>'
```

The script checks expected host/project against runtime configuration and service-account identity, cron/provider key presence, enabled flags, ATS origins/source aliases, query/location, and pilot budgets. It refuses symlinked or publicly readable environment files. Output contains only diagnostic codes and zero-I/O indicators. A passing preflight establishes local configuration consistency; it does not verify deployed identity, permissions, provider schemas, key validity or billing. No network request is made. Provision the staging runtime and deploy catalog rules/TTL configuration before the separate authenticated trigger.

## Manual invocation

The operator trigger requires an explicit HTTPS origin and a cron secret of at least 32 characters. It does not select a production origin by default, follow redirects, retry requests, or print credentials.

```sh
JOB_CATALOG_BASE_URL='https://<approved-staging-host>' \
JOB_CATALOG_PROVIDER='fantastic' \
node --env-file=deploy/staging/.env.staging scripts/job-catalog-trigger.js
```

Load the cron secret from the protected staging file after preflight, or inject it through the runtime secret store. Set `JOB_CATALOG_ENABLED=true` and the selected provider's server-side configuration when provisioned. Confirm `FIREBASE_SERVICE_ACCOUNT_JSON` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID` are available to the app runtime for Firestore writes. Do not add provider keys to client-exposed `NEXT_PUBLIC_*` variables. The script reports only the provider, sanitized status, completion flag, and record/request counts. `npm run jobs:catalog:trigger` runs the same manual script when its environment is injected.

| Provider | Required server configuration |
|---|---|
| Fantastic.jobs | `FANTASTIC_JOBS_ENABLED=true`, `FANTASTIC_JOBS_API_KEY`; optional supported ATS list `FANTASTIC_JOBS_SOURCES`. |
| Bright Data | `BRIGHT_DATA_JOBS_ENABLED=true`, `BRIGHT_DATA_API_KEY`, `BRIGHT_DATA_JOBS_DATASET_ID`, `BRIGHT_DATA_JOBS_INPUT_JSON` as a nonempty array of supported public board URL inputs. Use the input schema for the selected scraper dataset. |
| Apify Bebity | `APIFY_JOBS_ENABLED=true`, `APIFY_API_TOKEN`, `JOB_INGEST_QUERY`; optional `JOB_INGEST_LOCATION`. |

`JOB_CATALOG_ORIGINS` defaults to `greenhouse,lever,ashby,workday`. Add `linkedin`, `indeed`, or `glassdoor` explicitly for a board pilot after determining product-use fit; the vendor itself is never an approved publishing origin. Other ATS families are not supported by this delivery. Invalid URLs, credentials in URLs and unknown origin families fail the policy. Application paths can use another approved ATS family; unknown employer application hosts fall back to the verified listing link. Original provider application evidence stays in the server catalog. Existing preparation-readiness checks still require their original primary-provider evidence.

Fantastic.jobs uses ascending-ID cursor pagination from its first page, a fixed 24-hour indexing window, explicit text descriptions, and source filters. Title/location filters are saved with the cursor. Its internal job ID remains distinct from a proven ATS ID. Expired IDs are reconciled only against up to 500 eligible catalog IDs. Modified-job ingestion and historical backfill are not implemented. Changing source filters during an unfinished pass requires finishing that pass first or an explicit audited checkpoint reset.

Bright Data/Apify start one bounded remote run and resume polling/dataset retrieval through persisted cursors. Apify requests at most 500 results (100 by default), disables company/contact enrichment, and sets `maxTotalChargeUsd` (default $1, configurable up to $5). Bright Data bounds inputs and records per input; dataset-specific input behavior still needs a live contract check. Descriptions supplied only as summaries are marked truncated. Provider-estimated salary remains predicted and cannot become verified annual-pay evidence.

## Budgets and storage

Defaults in `env.example`: at most 100 items and four reserved HTTP steps per invocation; hard ceilings are 500 items and six steps. Daily per-provider caps are 100 requests and 1,000 reserved records, configurable within fixed ceilings. Budget reservations occur before HTTP and remain charged on ambiguous failures. Async scraper records are reserved once at remote start, not again for polls/downloads. Fantastic expiry cursor batches conservatively reserve a step even when draining already fetched IDs locally. These are collection safeguards, not exact vendor invoices; measure actual billed units in the pilot.

The runner holds a fenced 110-second lease and stops starting new steps after 75 seconds. Provider HTTP requests have a 15-second timeout, no redirects and an 8MiB response ceiling. Each Firestore transaction handles at most 20 full descriptions and rechecks lease ownership/expiry; a final checkpoint advances only after all page chunks persist. Partial committed chunks replay safely using deterministic provider/record IDs.

Server collections are `job_catalog/{provider}/items`, `job_catalog_state/{provider}` and `job_catalog_runs/{runId}`. Client Firestore access is explicitly denied. Run receipts contain only statuses, counts and times. Search reads at most 150 fresh records per provider (450 total) with a four-second read timeout; failures preserve native supply and expose a partial diagnostic. Counts describe the bounded fetched set. Stable sorting applies to that set; separate requests are not pinned to an immutable global snapshot.

Catalog records age out of search after 72 hours without observation, or at explicit source expiry/closure. Aging out does not assert that a job closed. A closed tombstone survives late active-row replays. Records carry a Firestore timestamp `deleteAt`: seven days for ordinary observations and 35 days for closure tombstones. Enable a Firestore TTL policy on the `items` collection group's `deleteAt` field during deployment to enforce deletion; no TTL policy has been installed by this local change. Replayed tombstones retain their closure state. This is a bounded fresh-job pilot, not a complete historical or active-vacancy census.

## Response handling

- `200 success` or `200 empty`: the provider pass completed; inspect the sanitized counts and run receipt before judging data quality.
- `200 disabled`: the feature is off; no ingestion was performed.
- `202 pending`, `busy`, `partial`, or `budget`: work is incomplete or held by a lease. Honor `Retry-After` when present. The manual trigger does not poll; check the run record and let the configured backoff/next operator invocation continue from its checkpoint.
- `503 unavailable`, `malformed`, `timeout`, or `rate_limited`: inspect the sanitized run diagnostic and provider configuration. Respect provider limits and `Retry-After`; do not loop retries or bypass a block with proxy rotation.
- `400`: the provider parameter or query string is invalid. Use exactly one supported `provider` parameter.

The endpoint returns only sanitized counts/statuses. It does not include provider payloads, exception messages, keys, or raw job descriptions. Credentials belong in the server runtime secret store; the request body is ignored.

## Checkpoint and closure safeguards

The ingestion runner owns the lease, run record, page writes, and checkpoint. A page checkpoint must advance only after all normalized records on that page have persisted. Deterministic record IDs make a replay safe after interruption. If a run is partial or its provider page is truncated, retain the checkpoint and do not mark omitted records closed. Only explicit provider closure evidence or a complete reconciliation pass may close a catalog record. If a checkpoint must be reset, first record the run/provider/reason and preserve the previous cursor for recovery; never reset it merely to force a clean-looking pass.

An initial async trigger is marked `triggerPending` before contacting the provider. If the process loses the start response or fails before saving its run ID, the worker reports unavailable and does not start another paid run automatically. Inspect the provider's run history, attach the recovered run cursor or explicitly clear the marker after confirming no run was created. Failed terminal remote runs likewise retain their cursor for investigation; do not repeatedly restart them without recording the reason. There is no claim of exactly-once external billing.

Disable `JOB_CATALOG_ENABLED` to remove catalog supply immediately. Disabling only a provider stops its new collection; previously observed eligible records remain until closure/expiry/aging. Native ATS and Ever Jobs integrations continue through their existing switches.

## Enabling scheduled operation

The existing `/api/cron/admin-aggregates` route and `.github/workflows/admin-aggregate-materialization.yml` show the repository pattern: an authenticated POST using `CRON_SECRET`, a bounded scheduled workflow, non-canceling concurrency, and an operator-visible failure summary. This route is schedulable through the same pattern, but no `job-catalog` schedule should be added until staging credentials, provider configuration, storage behavior, source policy, and a bounded canary have been reviewed. Start with one provider, one staging run, and a small page/request budget; measure complete descriptions, stable IDs, source URLs, partial-page handling, and replay behavior before enabling a recurring schedule.

## Local verification — October 8, 2026

The provider/catalog suite now passes 63 tests, including the seven staging preflight tests. It covers synthetic vendor responses, fake Firestore transactions, authorization, lease fencing, budgets, pagination, async recovery, closed-job replay, origin policy and catalog/native search merging. Existing parsing tests previously passed 43/43, recommendation pipeline tests 58/58, and assistant harness tests 329/329. These checks did not contact vendor APIs or a live Firestore database.

The subsequent PDF fix passes A4/Letter size through all resume renderers. `npm run type-check` and `npm run build` now pass. `npm run test:resume-pdf` passes 15/15: real artifact tests verify all registered templates at both sizes, wrapped pages and default A4; curated full/sparse/long content and identity tests also pass. The extended resume integration run has one pre-existing gallery copy assertion failure: it expects the literal phrase “17 new curated signature designs require Standard” while the current dirty UI uses “The new curated signature designs require Standard.” That UI/test remains outside this change.

The local staging preflight has seven synthetic-fixture tests, including secret-free output, protected files, expected identity, the documented Lever alias and pilot caps. The real local invocation reports missing staging configuration and performs zero provider/deployment I/O. Staging configuration and new provider keys remain absent, so live quality, actual billing and deployed storage behavior are unverified.
