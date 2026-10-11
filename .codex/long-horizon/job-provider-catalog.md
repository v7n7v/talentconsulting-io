# Job provider catalog delivery

Objective: implement the October 8 scraper recommendations as local, testable server integrations. Preserve native ATS/Ever Jobs supply, dashboard rules and all existing UI/resume changes.

## Decisions

- Fantastic.jobs is the first maintained feed; Bright Data and Apify Bebity are separate asynchronous scraper comparisons. No purchases, accounts, deployment or external messages are part of this delivery.
- Reuse Firebase Admin/Firestore and authenticated cron patterns. Default all new collection/read switches off until configured. No provider HTTP calls during user search.
- Separate provider/run/record identity from origin identity. Explicit URL/source policy; existing Remotive/Adzuna gates remain.
- Page persistence and restart cursors commit under a fenced lease. Close only explicit provider IDs, never absence from a search or partial run. Freshness TTL limits stale supply.
- Existing project map inspected: provenance/fixtures is the next dependency-ready package, then catalog and provider adapters. The map is a snapshot, not a live watcher.

## Milestones

- [x] Provider contract, explicit origin policy and synthetic fixtures
- [x] Fantastic.jobs adapter and active/expired lifecycle
- [x] Bright Data/Apify asynchronous adapters
- [x] Firestore catalog, fenced checkpoint commits and authenticated worker route
- [x] Search merge, provenance retention and origin/application validation
- [x] Failure/recovery and integrated verification; runbook/configuration

## Evidence / limitations

Initial map: `.project-map/index.html`; primary research: `docs/job-scraper-options-2026-10-08.md`.
Local verification on October 8, 2026:

- Initial `npm run test:job-providers`: 56/56 passed, including synthetic provider HTTP fixtures, fake Firestore transactions, checkpoint replay, closure tombstones, bounded budgets, cron authorization and search integration; expanded follow-on suite now passes 63/63.
- `npm run test:job-parsing`: 43/43 passed.
- Recommendation learning/score/supply-health/canary/recovery/top-picks tests: 58/58 passed.
- `npm run test:assistant-harness`: 329/329 passed.
- Initial `npm run type-check`: blocked only by the pre-existing `lib/pdf-templates.tsx:1230` unsupported `pageSize` prop; cleared by the subsequent authorized PDF fix.
- Targeted tracked-file whitespace check passed. The project map was refreshed for the local delivery.

No live provider or Firestore canary was run. New provider keys are absent from the existing local/production environment files; provider and catalog switches default off. `deploy/staging/.env.staging` is absent. Ever Jobs' deployed pin remains verified in compose only, not in a live response. No schedule, deployment, purchase, account or Firestore TTL policy was created. Synthetic fixtures establish local behavior, not live provider quality or billing.

Known pilot limits: Fantastic indexes a fixed 24-hour window and reconciles explicit expiry IDs against up to 500 eligible records; modified ingestion and backfill are not implemented. Search reads up to 450 fresh catalog rows, without a global immutable snapshot. Dataset-specific Bright Data input and actual provider response schemas need live validation. Async start ambiguity is held for manual recovery rather than automatically starting another paid run.

## Authorized follow-on: build and pilot preparation

- PDF page size now reaches legacy and curated resume pages; omitted size remains A4. `npm run test:resume-pdf` passes 15/15. Real rendered artifacts verify both A4/Letter across all registered templates, wrapped Letter pages and artifact page counts.
- `npm run type-check` and optimized `npm run build` passed. The existing gallery integration copy assertion still fails independently of the PDF implementation; no unrelated gallery/dashboard edits were made.
- Added no-network Fantastic staging preflight with seven synthetic tests. It uses the secure explicit-file loader, expected host/project identity, original ATS/source checks and tighter pilot caps. The real local preflight reports not ready: selected staging file and host/project configuration are absent.
- During the read-only audit, an agent's broad search accidentally printed an existing Firebase service-account private key and cron secret from an ignored deployment environment file. Values were not repeated by the coordinator. User was informed that both require rotation before deployment; rotation/deployed credential changes have not been performed.
- User was asked for staging hostname and dedicated Firebase project ID only. No provider or deployed Firestore canary, schedule, deployment or purchase has been performed.

Next: obtain the chosen staging host/project identity, provision fresh credentials and the Fantastic.jobs server key, then run `jobs:catalog:preflight` against the protected staging configuration. Deploy catalog rules and `items.deleteAt` TTL policy to the confirmed staging project and run the bounded canary documented in `docs/job-catalog-operations.md`. Confirm source URLs, description completeness, freshness, closure handling, replay and actual billed units before scheduling collection.
