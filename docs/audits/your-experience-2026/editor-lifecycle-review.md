# Your Experience: editor and resume lifecycle review

Date: 2026-09-28. Scope: review and planning only; no application code changed. Product decision from the owner: career profile/experience and resume editing must remain equally prominent.

## Evidence and limits

Read the current `/suite/resume` component, review workbench/ledger, export truth preparation, persistence/recovery, source classification and Application Kit helpers. Executed real extracted page handlers with synthetic state and real source classifier; all services replaced with local stubs. No provider, account, microphone or production calls. This establishes state transitions and save envelopes, not browser rendering or Firestore transaction behavior. Root owns browser verification.

Reproduce from the repository root:

```sh
node docs/audits/your-experience-2026/editor-lifecycle-repro.cjs
node --test scripts/resume-save-track-state.test.js scripts/resume-review-ledger.test.js scripts/resume-export-truth.test.js scripts/resume-source-classification.test.js
```

Results: four defect reproductions; 31 existing tests pass, zero failures. The reproduction script derives its repository root from its own location. Its assertions deliberately demonstrate current defects, not desired acceptance behavior. Existing tests do not cover saved-version reopening or the alternate tracking handler.

## Findings

### R1 — P1: opening a saved version can combine two different resumes

**High confidence; executed handler reproduction 1.** `app/suite/resume/page.tsx:1742`–1781 loads version B into `originalResume`, but leaves version A's `morphedResume`, review decisions, score, proof, company/role, job description and posting URL intact. `getDisplayResume` at735–739 prefers that old candidate. The reproduction opens B after A and retains A's candidate, JD and score, while the source becomes B. The review/outbound safety checks now receive an unrelated source/candidate pair. This is not an assertion that every export invents facts: export guardrails may restore facts, but they cannot recover the intended version/context pairing.

**Acceptance:** opening any version atomically installs its exact candidate, source binding, target, presentation and review state, clears unrelated transient results, and preserves its ID. Opening B after A must never display, score, hand off, or save A. Same test after an interrupted operation and a page reload.

### R2 — P1: saved resumes cannot be opened directly for editing/design/export; source lineage is lost

**High confidence; source plus root browser observation.** `loadVersionToMorph` always sets `mode='morph'`, `step='jd'` at1773–1775. The target stage at3231 onward asks for another job description and optimization. The stage indicator (`components/resume-studio/ResumeStudioProgress.tsx:18`–46) is noninteractive. Review is rendered only for `step==='enhance'` at2994; the direct Review changes button at3481 exists only after reaching Design. There is no saved-version entry into either stage. Root observed an opened saved packet land at Target with a New resume/Candidate header; the generic header fallback is `ResumeStudioHeader.tsx:39`–40. The fallback wording alone does not prove saved content loss.

Version loading retains only file name/type and presentation; it does not preserve version ID, original source, parent/revision, saved target or review ledger. Metadata construction at1048–1078 persists no immutable source snapshot/ID or review ledger. A previously tailored version is installed as the new `originalResume`, so a subsequent workbench comparison cannot represent the true original.

**Acceptance:** equally prominent Experience and Resume entry points; open a saved resume at its document editor with visible saved name/version and direct Review, Design and Export. Retarget is an explicit separate action. Save original/master and tailored revisions distinctly, with immutable source ID/hash, parent revision, target and review record. Reopen must not relabel a tailored output as the historical original. Old records without lineage must show unavailable provenance, not fabricate it.

### R3 — P1: generated/source provenance differs between auto-save and final Save

**High confidence; reproductions 2 and 4.** `handleMorph` sets candidate state at1346, then calls the render-closure `buildResumeVersionMetadata` at1375. On the first morph that closure still sees `morphedResume=null`; the metadata function at1050–1076 marks the auto-saved generated output as verified `user_upload`. `lib/database-suite.ts:113`–127 promotes that metadata into top-level provenance/source. Mitigation: `lib/server-resume.ts:46`–75 checks `savedFrom`/guardrail markers first and rejects this optimized auto-save as generated.

However final Save at1497–1503 stores generic `savedFrom:'resume_studio'`, without guardrail report or explicit tailored provenance. All saved versions are `is_active:true` (`database-suite.ts:125`). A synthetic record matching this envelope is classified `legacy_user_approved` by `server-resume.ts:85`–86, despite its current optimizationStrength/morphPercentage metadata. Save & Track and the alternate tracking path similarly construct generic final-save envelopes. The source-versus-generated distinction therefore depends on which save button is used, not the actual document lifecycle. The classifier reproduction does not assert every downstream consumer accepts legacy records; strict explicit-source consumers may reject them.

**Acceptance:** provenance comes from explicit operation inputs, never a stale React closure. All tailored saves retain generated/tailored origin and immutable source linkage, including after reload/reopen. Source classifiers agree on the same envelope. A user-approved tailored draft remains a tailored draft; any promotion to master requires a separate explicit, attributable action.

### R4 — P1: alternate Track Application bypasses durable retry and async ownership protection

**High confidence; executed reproduction 3 and reachable UI at3893.** `handleCreateApplication` at1653–1726 saves a new resume every invocation, then creates an application using that fresh ID. It has no operation receipt, save reuse, synchronous busy guard, or `captureOutbound` check. A failed/uncertain create followed by Retry saves another version and submits another application identity. A response-lost scenario can duplicate applications as well as resume versions. A late save can proceed into a second remote operation after source/owner changes; the current server may reject a mismatched saved ID, but the client has no safe boundary check.

This differs from `confirmSave` at1518–1650, which already supplies durable owner-scoped recovery and deterministic operation IDs. The synthetic modal fixture has notes state, which is not sent, but the current modal has no notes field; that is not being claimed as current user-visible notes loss.

**Acceptance:** every tracking affordance delegates to one owner/payload-bound recoverable command. Test uncertain save/create responses, same-tick duplicate clicks, reload retry, owner/source changes during save, and retries that reuse exactly one resume/application pair. Keep remote partial success visible with a resumable action.

### R5 — P2: source/target changes while morphing can strand loading state

**High confidence in source; timing not browser-tested.** `handleMorph` at1323–1328 binds currentness to originalResume and jobDescription. The JD textarea remains editable while loading at3253–3258. Changing it invalidates the response, correctly preventing stale output, but the `finally` at1441 clears `isLoading` only if that same old request remains current. There is no input-change loading reset for morph (the effect at1261 resets only Blueprint). A valid edit can leave the optimize UI permanently busy until remount/reset. Request identity also omits strength/page-count changes.

**Acceptance:** request generation/abort state owns loading independently of result applicability. Edit JD, source, strength or page count during a delayed response: old output must not apply; current form must recover to a usable idle state. Test two overlapping attempts explicitly.

### R6 — P2: saved review state is incomplete and successful library save discards local workflow

**High confidence; source inspection.** Session draft at1011–1040 and tracking recovery snapshot at1254–1256 omit `targetPageCount`, proof and guardrail report. Reload restores match score but loses the associated detailed proof/guardrails; page count resets to auto (574). Review presentation depends on these missing values at3011–3015. Successful Save at1507 and tracking at1630 remove the local draft; library records do not persist the review ledger/source binding needed to reopen it. Thus cloud-save success can leave less recoverable editing context than the preceding unsaved tab.

**Acceptance:** versioned draft and cloud revision envelopes preserve the configuration and source/candidate review pair needed for exact reopening. Save must establish a reloadable current version before retiring recovery state. Deliberately transient checks should be invalidated and labeled unavailable, not leave an old score implying the entire report survived. Test auto page count versus explicit 1/2-page requests through reload and Save→reload.

### R7 — P2: library read failure looks like an empty/new workspace

**High confidence; source inspection.** `getResumeVersions` (`lib/database-suite.ts:161`–180) returns structured errors, but `loadVersions` (`page.tsx:1121`–1126) only handles success. Initial failure leaves the empty list shown under Recent resume versions (2855 onward), with no failed-load state or retry action. There is no pagination defect here: the helper retrieves the entire collection, although very large libraries remain unbounded reads.

**Acceptance:** distinguish loading, truly empty, failed read, and loaded versions; preserve already loaded records on refresh failure; provide retry without resetting the current editor.

### R8 — P2: handoff can retain stale saved-version identity before the explicit writing action

**Medium-high confidence; source inspection, not downstream end-to-end reproduction.** Parse at1197 and morph at1347 merge a new resume snapshot/text without clearing a preexisting `resumeVersionId`/name or application context. `lib/application-kit.ts:221`–224 is a shallow merge; it invalidates generated results but does not reconcile conflicting source identity. This can produce an Application Kit context whose ID refers to one document and snapshot to another. The explicit writing handoff at1466–1472 correctly clears `resumeVersionId`; that path is a strength, not part of the defect.

**Acceptance:** selecting or creating a source must atomically bind ID/hash/snapshot/name or explicitly mark an unsaved draft and clear incompatible IDs. Tests seed a saved application kit, parse/morph a different resume, then open each destination and assert one consistent source identity and intended application scope.

## Existing strengths to retain

- Owner-keyed workspace remount (`page.tsx:537`–539), account-scoped draft keys, mounted/request/owner guards on source parsing (`1185`–1195).
- Honest main-editor `Draft saved in this tab` and draft storage failure labels (`3040`); do not replace these with cloud-save wording.
- Hardened Save & Track path uses deterministic payload/owner IDs, storage write verification before mutation, durable partial-success recovery and stable saved-version reuse; seven focused tests pass.
- Review ledger uses content/path identities and conservative record-level reversions. Workbench requires all changes reviewed and unsupported changes reverted (`ResumeReviewWorkbench.tsx:194`–213); source absence is disclosed rather than invented (312).
- Export preparation reapplies truth guardrails and rejects missing source (`lib/resume-export-truth.ts:29`–83); school-name and template-entitlement gates run before outbound actions. PDF/Word handlers retain owner/input guards.
- Explicit Cover Letter/LinkedIn handoffs clear saved-version identity and send a prepared snapshot (`page.tsx:1466`–1472).

## Proposed implementation order / closure gates

1. Define the shared document lifecycle: Experience/master facts and resume revisions equally discoverable; immutable source binding, active revision and target; decide exact Open versus Retarget behavior. Fix R1/R2/R3 together so resetting UI does not merely hide incorrect provenance.
2. Unify save/tracking commands and operation ownership; fix R4/R5. Require controlled fault-injection tests, not only successful demo clicks.
3. Persist exact reopen state, expose library load failure and reconcile handoff identity (R6–R8).
4. Browser acceptance: fresh import, manual authoring, saved original, saved tailored revision, A→B switch, Save→reload, failed tracking→reload→retry, account switch during pending work, direct saved-version editing/design/export, keyboard navigation on both Experience and Resume entry points. Do not require AI regeneration merely to edit or download already saved work.

Not evaluated here: live extraction/morph quality, provider failures and quota charging, production Firestore rules, large-library latency, exported visual fidelity, responsive/assistive-technology behavior. Those remain explicit integration gates rather than inferred passes from the 31 local tests.
