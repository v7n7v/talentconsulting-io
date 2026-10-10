# Taco upgrade staging

Review URL: https://taco-upgrade-staging-1016393231808.us-east1.run.app/

Created October 9, 2026 with explicit owner approval. Project `talent-consulting-stg`, region `us-east1`, service `taco-upgrade-staging`. The original VPS staging deployment is separate and remains available. This service reuses the staging Firebase Auth/Firestore/Storage project; it does not use production Firebase.

The release receipt and sanitized source manifest are in `.codex/releases/new-staging-20261009/`. The fixed local snapshot is `/home/xwingace/Documents/Projects/Taco-staging-release-20261009`; do not substitute the live, changing clone or its `.next` directory for that release. The image was built with `deploy/staging/Dockerfile.cloudrun` using explicit public staging build arguments. Runtime access uses Cloud Run's attached `talent-staging-app` service identity and ADC, without an exported service-account key.

The service scales from zero to one instance (1 CPU, 2 GiB, concurrency 8). Both service hostnames are authorized in staging Firebase Auth. Payments, Resend email, AI-provider and job-provider credentials are unconfigured. No production keys were copied. Never run the root production-default deploy scripts for this service.

Verify `/api/health`, `/staging-build.json`, the Next build ID and the deployed image digest together. The existing Stripe-specific health fingerprint is null without a publishable Stripe key and is not this release's identity proof. Staging responses carry `X-Robots-Tag: noindex, nofollow, noarchive`.

Current deployment is a tested preview: core safety/type/build checks pass, while three existing design-baseline regressions and one previously accepted high dependency advisory remain recorded. Browser smoke covers the landing and sign-in dialog; authenticated AI workflows remain separate acceptance work. The isolated recovery experiment below does not exercise candidate data or paid providers.

For updates, make another fixed source snapshot, build with staging-only public configuration, run the gates, review it, then deploy its exact image digest to this service with the same explicit project/region. Record the prior and new revisions. No scheduled external actions, live payments, real-user email or job submissions are authorized by routine staging updates.

## October 9 P1 continuation

The reviewed chat queue containment is live at the same review URL, revision `taco-upgrade-staging-00003-f6p`. Fixed source: `/home/xwingace/Documents/Projects/Taco-staging-release-20261009-p1`, commit `aee254627d6764cb61cd61c0a5056d5786a22fa3`. Source digest `f4e74a41b1597fd686bc598b782708c7c92e6209665ca45f9db3e5f850fba3ea`. Receipt/build/HTTP evidence is under `.codex/releases/agentic-recovery-20261009/web/`. This changes chat preparation authority, not the visual dashboard. The lifecycle rules patch remains local, not part of the deployed rules.

The independent private service `taco-agentic-spike` hosts only deterministic synthetic fixtures. It has a separate named Firestore database (`taco-agentic-spike`), queue of the same name, and `taco-agentic-spike-v1/v2` Workflows. `taco-spike-worker` has database access conditional on that named DB plus Tasks enqueue/Workflows invocation and permission to attach `taco-spike-executor`; the executor only invokes the private worker. Both use managed identity, no key files. Cloud Run scales 0–2 at 1 CPU/512 MiB. There is no scheduled dispatcher; experiments run only when explicitly invoked.

Reproduce the cloud drill only against this private synthetic service:

```bash
python3 scripts/agentic-recovery-staging.py \
  --url=https://taco-agentic-spike-1016393231808.us-east1.run.app \
  --evidence=.codex/releases/agentic-recovery-20261009
```

The script uses the active gcloud account's identity token in memory. It refuses another endpoint and never loads application env files. The worker accepts bounded synthetic IDs/integers only. Its test fault endpoints are not product APIs; do not expose it publicly, repoint it at the default database, or reuse it for candidate processing. Two rounds passed 40/40 cases. Retain the receipt limitations: no authority-journal restore test, no complete exhausted-task recovery, no live AI benchmark. The implementation plan records why Workflows was selected for the first real pilot.
