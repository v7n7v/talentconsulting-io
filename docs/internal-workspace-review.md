# Review the internal workspace

Implementation workspace: `/home/xwingace/Documents/Projects/Taco-upgrade`.
The original `/home/xwingace/Documents/Projects/Taco` remains the reference checkout.

## Start tomorrow

From the upgrade directory:

```bash
npm run preview:workspace
```

Open **http://127.0.0.1:3101/suite**. The lime notice identifies fictional local data. The selector provides a new account, an active search, drafts and next actions, and a partial-data failure. Stop with Ctrl+C. No login is needed for this explicit development preview.

This command is deliberately local and development-only. Preview API routes return fixtures or an explicit disabled-action response before normal server handlers run. Browser connections are restricted to loopback. It does not exercise live generation, emails, billing or external submission. Never use the demo flags for a deployment. Production disables the fixture bypass even if both flags are present.

The regular landing remains at `/`. Its existing design and animations are preserved. `npm run build` builds the real authenticated application without preview flags. Do not build while the development server is running.

## Review path

1. Home: one next action, Today, opportunities and a collapsed secondary tool directory. Check the partial-data example: it retains useful work and offers a retry.
2. Your experience: upload/select a resume, correct extracted facts, then confirm. For the editable source fixture, visit `/suite/resume?sourceConfirmDemo=1`; this helper is disabled in production.
3. Find roles: select the source, set a target, search, inspect the evidence and role detail. Unscored fit and unverified posting links stay unknown. Full prepared packets require Max; independently entitled writing/resume tools remain available.
4. Applications: Tracking and Needs review connect the saved records. Exact application and packet links retain their context. Review and manual submission are separate actions.
5. Interview prep: enter from an application’s Practice action to keep its employer and role context, then continue into debrief.
6. More tools: the existing writing, networking, learning and analysis routes remain accessible through desktop, mobile and command navigation.

The isolated preview blocks operations that need live providers. Packet generation, concurrency, review freshness and ownership are instead exercised by actual endpoint tests with controlled providers/database transactions and real local Firestore/Auth emulator rules tests.

## Implementation contracts

- **Source confirmation:** parser output stays staged. Explicit confirmation saves the reviewed facts. Cancelling, replacing, changing account or unmounting invalidates late results. Save retries reuse their intake identity; landing handoffs retain their original identity. Onboarding cannot certify a skipped/unconfirmed draft.
- **Review:** `/api/agent/packet-review` derives a revision from owner, source, job snapshot and exact resume/letter/proof content. Approval is transactional. Changed inputs invalidate the old receipt. Tracking is idempotent and starts as `not_applied`.
- **Generation:** a stable job URL with changed description requires new artifacts. An old artifact cannot be relabeled as matching the new job during a failed generation attempt. Source changes and expired/taken-over generation leases are checked.
- **Access:** server packet preparation is Max-only, consistent with the assistant workload policy. Unknown plan checks are recoverable errors. Standard’s existing specialist tools keep their own access rules.
- **Ownership:** protected source/artifact/review fields and server-origin tracker links cannot be forged by browser writes. Status changes for manually tracked applications still work.
- **Compatibility:** old status strings alone do not establish human approval. Legacy/chat packets without the required proof remain blocked for fresh preparation. Existing URLs and query shortcuts remain represented in the shared navigation model.

## Visual boundary and rollback

Workspace tokens apply to user-facing suite chrome and shared controls. Employer-facing resume templates and the admin workspace keep their own styling.

For a local comparison, stop the preview and run:

```bash
NEXT_PUBLIC_TACO_WORKSPACE_DESIGN=legacy npm run preview:workspace
```

This disables the paper workspace skin. It retains the reorganized navigation and all source, entitlement and review safeguards; it is not a rollback of the service contracts. Restart normally for the paper skin. No destructive migration or backend deployment is included.

## Verification

- `npm run test:workspace`: **248 passed**, including route parity, actual hook lifecycle, intake controller, full document rendering, controlled packet-generation/review endpoints, entitlement, export truth and application context. Some checks are source-contract assertions; this is not a claim of 248 browser scenarios.
- `npm run test:upgrade`: **52 passed**, preserving the landing and existing proof/export contracts.
- `npm run test:workspace:rules`: **10 passed** against actual loopback Auth/Firestore emulators, including ownership, immutable proof, review receipt forgery and server-origin tracker protection.
- `npx tsc --noEmit --incremental false`: passed.
- Scoped ESLint for the new/shared navigation, preview, intake review, state helpers and review endpoint: passed. Full legacy lint is not clean; see the baseline comparison below.
- `node scripts/design-audit.js --ci` and `git diff --check`: passed. The audit explicitly recognizes the new scoped token file and paper grid; other ratchet baselines were retained.
- Browser: Home and Find roles at 320/390/430/768/1024/1440px; packet drawer across those widths; source edit and explicit confirmation; new/active/partial states; application direct-link/reload/close; linked interview context; mobile menu; keyboard command search into Writing; light/dark visual inspection. No horizontal page overflow in the measured states. A React sibling-update warning discovered during this pass was fixed and did not recur after reload.
- All **1,251 original baseline files** match the clone baseline byte-for-byte. A worker briefly targeted the original Job Search file; its exact patch was transferred to the clone, reversed from the original, and two accidental helper files removed before the integrity check.

`npm run build` passed with preview flags absent and **189 static pages** generated. The new query-aware workspace wrapper has an enclosing Suspense boundary for production prerendering. Production landing smoke: wordmark assets loaded, no preview banner, no horizontal overflow and no browser errors. `npm run preview:workspace` was then started exactly as documented; Home loaded in a fresh browser tab with the fixture notice and zero console errors.

The full legacy-page lint gate is **not clean**. A bounded comparison against baseline found the large Resume, Job Search, Writing, Interview and JobFeed files retain their hook/effect diagnostics. Applications also reports the new URL/account synchronization effects and existing callback-dependency patterns. The new shared components/helpers and the selected shell/Home/navigation/API scope pass ESLint; do not interpret this as repository-wide lint compliance. Runtime lifecycle and direct-link checks cover the changed state paths.

Remaining release validation: real authenticated staging with isolated provider credentials; live upload/generation/billing behavior; every specialist mode; OS reduced-motion and 200% zoom; comprehensive screen-reader/contrast audit; performance budgets; usability and conversion research. Reduced-motion CSS and lifecycle paths were source reviewed, but browser preference emulation was unavailable. These are explicit release limits, not simulated successful checks.

No production data, emails, billing, external applications or deployments were changed. Source and Firestore rule changes are saved locally for review; the database rules have not been deployed.


## Saved handoff

All implementation files are in the independent `codex/taco-upgrade` branch. The original checkout and unrelated admin brainstorm remain preserved. Temporary preview servers are stopped before the requested normal PC shutdown; nothing needs to keep running overnight. After powering on, run `npm run preview:workspace` from the upgrade directory and open the local URL above. No automatic deployment or startup service was created.
