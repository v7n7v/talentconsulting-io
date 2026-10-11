# Conditional deployment readiness

September 28, 2026. Read-only preparation; nothing deployed.

The standing instruction is to deploy at **5% weekly Codex allowance remaining** (95% consumed). Final check during interview review: 85% consumed / 15% remaining. Zero reset credits were reported. Do not spend allowance merely to reach the threshold, redeem a reset, or shut down the machine as part of this deployment instruction.

A thread heartbeat, `taco-deployment-at-5-allowance`, is active and checks every 15 minutes. It stays quiet above the threshold, deploys only a recorded validated candidate, and reports a concrete blocker if the threshold arrives before readiness. It pauses after a threshold-triggered outcome. No deployment is scheduled unconditionally.

## Known target and release mechanism

- Worktree: `/home/xwingace/Documents/Projects/Taco-upgrade`, `codex/taco-upgrade`.
- Canonical package command: `npm run deploy` → `node deploy-fix.js`.
- Firebase project: `talent-consulting-acf16`; Hosting plus Firestore deployment.
- SSR service: `ssrtalentconsultingacf1`, region `us-east1`.
- Script captures Hosting into `admin-command-grid-rollback` and captures resolved SSR revision traffic before releasing. On deployment/aggregate/smoke failure it attempts restoration of Hosting and SSR traffic.
- The separate Cloud Run script targets `talent-studio`; do not substitute it for the canonical Firebase release without a reason grounded in the intended target.
- `firebase` and `gcloud` executables are present. Authentication and production permissions were not exercised by this static check.

## Checks performed

Loaded `.env.production` and `.env.local` in memory through the existing preflight parser, supplied the script's production NODE_ENV default, and ran `validateProductionDeploy` and `validateFirebaseFrameworkPackage`. Both returned ready with no errors. Configuration values and credentials were not printed. `.env.cloudrun.yaml` also exists; that alternative deployment was not selected or validated.

The full CLI preflight can additionally verify recovery owners against production when configured. It was not run in this read-only planning pass. The prior Your Experience build passed a production build and its recorded regression suites; that evidence does not resolve newly reproduced interview defects.

`node --test scripts/production-deploy-safety.test.js`: 21 passed. These controlled tests validate release-script contracts, not production authentication or an actual rollback.

## Current release gate

**Not release-ready on this review's evidence.** Interview audit reproduced session/continuation defects and grade-integrity problems. The previous suite reports also retain authenticated staging/provider/device verification gates. No reviewed immutable release candidate was created in this pass. The working tree already contains extensive previous authorized upgrades and unrelated pre-existing work; it must not be blanket-staged or reset.

Before threshold deployment:

1. Resolve or explicitly exclude the affected interview paths and record passing desired-behavior regressions. Complete relevant staging checks; do not equate mocked tests with provider/device verification.
2. Review the exact source scope, exclude temporary audit/test outputs and secrets from release material, and record a reproducible release commit or complete content manifest. No silent inclusion of unrelated work.
3. Run release safety checks and full deployment preflight with fresh credentials where needed. Preserve the current environment constraints; never disable guards to pass.
4. Stop only this worktree's local preview before the production build/deployment; Next dev and production must not share `.next` concurrently. Record the preview restart command (`npm run preview:workspace`).
5. Deploy with the canonical command when allowance is at or below 5% remaining and the candidate is ready. Capture release identifiers and retained rollback evidence; verify actual Hosting/SSR behavior plus the synthetic interview smoke journey.
6. On failure, verify rollback results. Do not repeatedly redeploy or claim success from a command launch. Restart local preview if still needed.

The existing rollback restores Hosting and SSR traffic. It does **not** establish a full rollback of deployed Firestore rules/indexes or data migrations. Require backward-compatible rules/schema and an explicit rules/index recovery plan before such changes enter the candidate.

If the threshold is reached before release readiness, report the concrete gate and preserve the build. The allowance condition is not a reason to ship known broken flows.
