# Resume repair deployment preflight

> Historical read-only preflight. Its dirty-tree authorization warning is superseded by the user's explicit deployment instruction, the reviewed source manifest/snapshot, and the actual verification recorded in [the release handoff](../resume-repair-release.md). The suspected learning progress mismatch was disproved against the cloud payload; 19 emulator checks now pass. Refer to the release handoff for deployment status.

Date: 2026-09-28

## Decision

The current shared worktree is not a deployable release candidate. The tree is broadly dirty (resume/upload work is mixed with interview, route, component, rules, and other production changes), so the exact release scope cannot be reviewed or proved from this checkout. Do not run the release command from this state. This is a scope and authorization blocker, not a finding that the resume repair itself must be abandoned.

The known interview findings can remain outside this release by retaining the existing production interview behavior and excluding interview changes from the reviewed candidate. They do not require implementing interview work as a prerequisite for a resume/upload release. The current checkout contains interview changes, however, so that exclusion must be demonstrated by an isolated clean candidate or an explicit reviewed file manifest before release.

## Canonical release target and command

The canonical Firebase release command is:

```text
npm run deploy
```

This invokes `node deploy-fix.js`, runs the Firebase production preflight, deploys Hosting and Firestore for Firebase project `talent-consulting-acf16`, primes the admin aggregates, and runs public and authenticated production smoke checks. The configured SSR service is `ssrtalentconsultingacf1` in `us-east1`. `deploy-cloudrun.sh` is an alternative path and is not the canonical release for this repair.

The read-only safety suite passed: `node --test scripts/production-deploy-safety.test.js` reported 21 passing tests and 0 failures. This verifies deployment guard behavior in tests; it does not authenticate a release or prove production permissions.

## Preflight and authentication status

The earlier configuration-only preflight loaded `.env.production` and `.env.local` without printing values and accepted aligned project IDs, public build/runtime values, live Stripe configuration, Firebase Admin credentials, cron configuration, and framework aliases. The installed release CLIs are Firebase CLI 15.25.1 and Google Cloud SDK 579.0.0.

Authentication and production authorization were not exercised during this read-only review. A release operator must run the complete `node scripts/production-deploy-preflight.js firebase` path in the isolated candidate and satisfy any live recovery-owner proof required when admin mutations are enabled. No credential, token, or environment value is recorded here.

## Environment and preview boundaries

`deploy-fix.js` stages a filtered temporary runtime environment and restores the original local files in `finally` blocks. It excludes Firebase/extension-reserved keys and local-only bypass or smoke values, including `NEXT_PUBLIC_DISABLE_AUTH_GATE`, smoke owner/token values, and the local aggregate-smoke base URL. Production runs with `NODE_ENV=production`; the local auth bypass must not enter the deployed build. No preview was started during this review. `npm run deploy:preview` is a separate Hosting-channel command and is not the production release.

## Rollback behavior and limits

Before deployment, the script clones live Hosting to the `admin-command-grid-rollback` channel and captures the positive-percent Cloud Run traffic split. If deployment, aggregate priming, or either post-deploy smoke fails, it restores Hosting from that rollback channel and restores the captured Cloud Run revision traffic. Firestore rules, indexes, documents, and other data migrations are not automatically rolled back; those changes therefore require backward-compatible rules/schema and an explicit recovery plan.

## Required release preparation

1. Isolate the intended resume/upload repair in a clean reviewed branch or worktree and record the exact file/commit manifest. Preserve existing production interview files so the known interview findings remain excluded.
2. Review the resulting diff for unrelated routes, rules, deletions, and environment changes; do not stage or reset the current shared dirty tree wholesale.
3. Run the complete Firebase preflight with the release operator's authenticated context, then run the applicable resume tests, build/deploy checks, and authenticated/public smoke checks.
4. Confirm the isolated candidate's Firestore rules and schema remain backward compatible, and retain the rollback channel and Cloud Run traffic evidence produced by `deploy-fix.js`.

No production change, commit, build, preview, or deployment was performed for this audit.
