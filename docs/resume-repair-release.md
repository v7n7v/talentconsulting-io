# Resume upload repair and release — September 28, 2026

Status: deployed and verified at 2026-09-29T02:10:06.046Z. Live URL: https://talentconsulting.io/suite/resume?view=resumes. The user-authorized computer shutdown has been scheduled.

The user reported that uploading a résumé kept loading indefinitely, asked for a résumé-first Your Experience workflow, authorized deployment, and requested shutdown after successful deployment. This supersedes the earlier allowance-triggered deployment timing; that automation was paused.

## Repair

- Re-arm the upload component's mounted ref during effect setup. React StrictMode's setup/cleanup/setup replay previously prevented both success and failure from clearing the loading state.
- Bound upload/extraction and AI structuring waits, expose cancellation and useful inline errors, allow the same file to be retried, and retain extracted source text for retry or manual editing.
- Put the upload control on the first résumé screen. Review an import, continue to the editor, choose a design, and export without being forced to publish a separate Experience record. Saving Experience remains an explicit option.
- Replace the local preview's fabricated import with actual bounded local file extraction. Its endpoint is disabled outside isolated development preview.
- Replace the worker's legacy PDF engine after a valid PDF failed only inside a fresh worker. Package the modern PDF engine and its local assets explicitly so production does not rely on development dependencies.

## Evidence

- Resume regression suite: 194 passed.
- Workspace regression suite: 249 passed.
- Experience suite: 43 passed.
- Upload lifecycle, transport and local import checks: 100 passed. These overlap other suite counts.
- Firestore/Auth emulator integration: 19 passed, including the actual learning progress client shape and denial of client-forged derived fields. The suspected compatibility mismatch was disproved by checking the cloud payload; rules were not broadened.
- Deployment safety and resume smoke contract checks: 25 passed.
- Browser: actual pasted fictional source reached review, editing, account-library save in isolated preview, template choice, and a one-page generated PDF preview. Native file-picker automation was unavailable; actual binary extraction is checked through worker and HTTP tests.
- Packaged standalone production server: real PDF, DOCX and TXT uploads, AI structuring/source preservation, resume page and disabled-preview boundary all passed. AI parse returned HTTP 200.
- Actual binary worker regression: 3 passed, including PDF line preservation, malformed/textless input, truncation, and page limit.
- Authenticated live precheck: healthy site, anonymous admin denial, authorized owner session and readable audit.
- Deployment wrapper plus safety checks: 23 passed. The first release attempt stopped before publishing because Firebase injected an incompatible Sharp range. The runner now verifies pinned Firebase CLI 15.24.0 and applies the existing Sharp 0.35.3 pin in memory; no cached CLI files are changed and no dependency pin was downgraded.

## Release scope and limits

This worktree contains the previously authorized suite, branding, Humanizer, market/career, and Experience upgrades, plus this repair. The source manifest records the candidate's runtime/configuration changes against base `806ac3c06292bb7f4a728de3575fa59790efd5be`; this is not a claim that only résumé files differ from that old base. Original checkout remains untouched. Incidental docs and temporary files are excluded from deployment packaging.

The previously documented interview redesign remains deferred. The candidate retains its existing requirement for real provider grading and server practice receipts; provider outages produce an explicit error. Voice/device/reconnect behavior, broad office-runtime compatibility, OCR, and a full multilingual/accessibility certification are not certified by these résumé checks. No bulk data migration runs.

Canonical release: `npm run deploy`, Firebase project `talent-consulting-acf16`, SSR service `ssrtalentconsultingacf1` in `us-east1`, public origin https://talentconsulting.io. The release captures Hosting and SSR traffic rollback, publishes Hosting/Firestore, then checks real resume uploads plus public/authenticated admin behavior. Application rollback does not restore Firestore rules or data; the rules are additive collections/security constraints verified by the emulator tests, with no destructive data migration.

## Verified production outcome

- Serving revision: `ssrtalentconsultingacf1-00169-fuy`.
- Actual PDF, DOCX and TXT multipart uploads passed against `https://talentconsulting.io`.
- Real AI structuring returned HTTP 200 with the supplied synthetic identity and original source retained.
- Resume page, disabled local-preview endpoint, public smoke, anonymous admin denial, authenticated owner session and audit access all passed.
- A second release attempt correctly rolled back when the smoke hit an older traffic-pinned revision. Direct testing proved the new revision's PDF extraction worked. The permanent deploy runner now promotes the exact ACTIVE Cloud Function revision before verification; it retains the original rollback traffic for failures. Wrapper/deployment tests: 25 passed.
- Final publication reused the exact reviewed Hosting artifact and the already verified cloud revision. It did not rebuild application code or modify user resumes. The finalize script, artifact checksums, rollback capture and verified receipt are in `.codex/releases/resume-repair-20260928/`.
- Cloud Build: `e2d96b03-27f2-4367-a61a-e78250b808c6`, successful.
- Admin aggregates refreshed with explicitly partial source evidence; no claim of complete analytics coverage.
- One pre-existing Firestore index absent from local config was preserved; no forced index deletion ran.

Production verification is complete. The user-authorized computer shutdown is scheduled only after the final handoff and traffic check are saved.

Shutdown command accepted: computer scheduled to power off one minute after 2026-09-29T02:11:34.922538+00:00.
