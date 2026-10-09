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

## Local release checkpoint — October 8, 2026

The isolated branch `codex/job-catalog-release` starts at `e8c5b3473083f9d1def42653be5e15c94fa8b162`. It contains the parser, provider/catalog and search integration, the narrow salary/date display changes, and A4/Letter propagation through the PDF renderers. Unrelated design, dashboard and evidence-factor work in the original checkout is excluded. The source checkout and its existing changes are preserved. This is a local review checkpoint, not approval to deploy.

The focused runtime/source regression run passes 143 tests. Type-check, production build, release-safety, assistant harness, admin-command-grid, email-system and observability pass. SEO CI passes with zero critical/high issues. Provider responses and Firestore writes in the job tests are fixtures; the PDF tests inspect real rendered A4/Letter dimensions and wrapped pages. No vendor API or live Firestore database was used.

Independent review confirmed and corrected two integration defects: predicted pay now includes an explicit estimate label; suggestions compare a salary floor only against verified annual USD, retaining hourly, foreign, predicted and unknown pay. Suggestions honor structured remote mode even when the display location is a city. Runtime tests execute the actual suggestions route with mocked auth/database/supply. Mutation checks remove each protection, observe a failing regression test, and restore the original bytes. The salary display also keeps currency, period and estimate qualification visible on narrow result cards and the detail panel.

The job-search core result state was exercised in real Chromium at 320/390/430/768/1024/1440px in dark and light themes using browser-only job fixtures. Interactions cover search, salary/date sorting, structured remote filtering and mobile disclosure. There are no console errors, clipped text or horizontal overflow in those checks. Desktop/tablet checks are clean; the mobile verifier still reports five undersized shared-shell controls (four sidebar group headings and PageHelp). Those shared components are unchanged from the base commit. The browser run validates rendering and local interactions; it does not validate live job quality or authenticated dashboard widget results. Local screenshots and reports are retained under `.ui-verify/` and `.security-cve/`, outside Git.

**Release remains held on existing baseline failures:**

- Design CI reports 21 undefined tokens against the committed baseline of 20. An independent audit of an archived untouched `HEAD` produces identical metrics. No design baseline or audit rule was changed.
- CVE CI reports 38 new high/critical advisories (3 critical, 35 high). Dependency declarations/overrides and the lockfile are identical to the base commit; an independent base-commit audit returns the same advisory IDs. No CVE baseline was weakened or risk accepted.
- Mobile browser CI fails the shared-shell touch targets above. No auth/console allowlist was broadened.

Dependency remediation is a separate work package. Compatible Next/Firebase and transitive patches address many findings, but a no-force lock-only simulation still leaves high findings, including the pinned grpc/brace-expansion/js-yaml/sharp overrides and `braces`. The [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no published patched version as checked October 8. Both Tailwind 3 and Next's ESLint tooling reach it, so a Tailwind migration alone would not clear the gate. Review the tooling replacement or maintained patch and run the full release/browser checks before lifting this hold. This checkpoint does not make dependency or global design migrations implicitly approved.

The seven staging-preflight tests cover protected files, expected identity, source aliases, pilot caps and secret-free output. The local preflight reports missing staging configuration and performs zero provider/deployment I/O. No provider credentials, cron schedule, TTL policy, deployment, push or live canary was created. Live quality, actual billing and deployed storage behavior remain unverified.
