# Interview prep: setup and session reliability audit

Date: September 28, 2026. Scope: the current dirty `Taco-upgrade` working tree, including the already implemented tool-upgrade work. Read-only product audit; only this report and its local probe were added. No browser, deployed service, provider, microphone, external account, or Firestore emulator was used here.

## Evidence and validation

- Read the previous `docs/tool-upgrade-implementation.md` and `docs/audits/tool-upgrade/02-interview-learning.md`, then inspected the actual page, generation/grading/token/session routes, draft/session/context helpers, live hook, and focused tests.
- `node --test scripts/practice-integrity.test.js scripts/practice-recovery.test.js scripts/interview-context.test.js`: **16 passed, 0 failed**. Three of these exercise adjacent story/vault functionality; this is not 16 end-to-end interview journeys. A dependency emitted the existing `punycode` deprecation warning.
- `node docs/audits/interview-prep-2026/session-probe.cjs`: **six current defects reproduced**. The probe runs actual page component bodies through the existing `scripts/test-ui-hooks.cjs` harness, with controlled service/UI boundaries. Its assertions deliberately establish current defects; they are **not** desired-behavior regression tests. It makes no network calls and does not prove real browser/audio behavior.
- No build or broad test suite was rerun. Source references below refer to this snapshot and will move as implementation changes.

## What already works

Quick typed practice remains the default (`app/suite/interview-sim/page.tsx:261`); unavailable avatar is absent from the visible mode list (`:98`). Confirmed resume and selected owned-story evidence is resolved server-side (`lib/practice-session-server.ts:62`). Generation is reserved atomically with a receipt, a lease, stale-worker rejection, and cached same-session retry (`lib/practice-session-server.ts:16`, `:39`); study cards use their own allowance. Successful generated questions/cards are persisted before returning (`app/api/gauntlet/generate/route.ts:93`, `:203`).

Typed answers are saved before advancing; an explicit local save failure is shown, and local unsent drafts are scoped to owner/session/question (`app/suite/interview-sim/page.tsx:320`, `:804`; `lib/practice-draft.ts:2`). The grading route saves the submitted transcript before calling the provider, rejects empty answers and incomplete grade schemas, and offers retry instead of a fabricated fallback score (`app/api/interview/session-grade/route.ts:44`, `:50`, `:90`). Owner-keyed workspace remounting exists (`app/suite/interview-sim/page.tsx:242`).

Live token cancellation, stale socket callbacks, late microphone permissions, microphone-denial cleanup, and reconnect resource disposal were materially improved (`hooks/useGeminiLiveAvatar.ts:125`, `:175`, `:359`, `:408`, `:443`). Existing tests verify several of these hook-level boundaries. The outstanding page launch issue below is outside those tested boundaries. Persona aliases now exist (`app/api/voice/live-token/route.ts:25`); the old universal-default persona bug should not be reported as unfixed.

## Current findings

### S1 — P1 — A delayed live launch can run after navigation unmounts the page

**Reproduced at the page-handler boundary.** Start Live, unmount the workspace within its 500 ms delay, then run the scheduled callback: `gemini.connect` is still invoked. The timeout is created at `app/suite/interview-sim/page.tsx:707` and stored at `:719`. Exit and the account effect clear it (`:866`, `:509`), but the workspace has no unmount cleanup. The callback only compares the old owner's ref. The hook's existing unmount cleanup increments its attempt counter (`hooks/useGeminiLiveAvatar.ts:121`); a *new* call to `connect` after that increments it again and can start a token request (`:125`).

**Impact:** navigating away promptly can still consume an allowance/start a socket and microphone flow. No actual device activation was attempted in this audit. **Implementation:** eliminate the arbitrary launch delay or own it in a cleanup-returning effect; use a mounted/session-generation guard in both page launch and hook connection. Acceptance must unmount before the timer, during token fetch, and during permission resolution, verifying no late token/socket/media acquisition and track cleanup where permission has already resolved.

### S2 — P1 — Fresh live starts reuse the old session identity

**Reproduced.** Live → Exit → Start with unchanged settings submits the same `requestId` twice. `createSession` retains an ID for equal payload fingerprints (`app/suite/interview-sim/page.tsx:566`). Questions and cards explicitly clear that attempt after success (`:619`, `:669`); live and whiteboard do not (`:692`, `:728`). Exit also leaves it intact (`:866`). The POST route correctly treats this ID as a retry and returns the existing record (`app/api/interview/sessions/route.ts:108`).

**Impact:** what appears to be a new interview can overwrite an abandoned/completed session, reuse its receipt/evidence, and—after a prior successful grade—return its old feedback, because grading returns any existing summary before inspecting the new answer (`app/api/interview/session-grade/route.ts:44`). Repeated live token minting under that ID does not consume another allowance. **Implementation:** separate an explicit creation operation from an existing session retry. Reset the creation operation when a launch is acknowledged, retain the session ID for reconnect/recovery, and require a new ID for “new practice.” Verify new/live/reconnect/retry independently. Audit the same whiteboard attempt code, although only live reuse was directly reproduced here.

### S3 — P1 — Pending page operations can replace the user's newer mode or session

**Two reproductions.** (a) Begin Quick Drill generation, switch to Whiteboard while it is pending, complete generation: the page renders `WhiteboardRoom` against the quick-drill session. Mode buttons remain enabled (`app/suite/interview-sim/page.tsx:956`), generation only checks owner (`:613`) and sets `phase=room` (`:627`), and rendering uses the now-current mode (`:1110`). (b) Open history session A, then B; resolve B before A: A replaces B. `openSavedSession` has an owner check but no request sequence (`:288`).

**Implementation:** make `activeSession` one typed state object, with immutable mode/configuration and an operation generation. All completion paths must match owner + session/operation generation. Make cancellation/exit explicit; disable conflicting launch controls while awaiting a start or invalidate the old operation before switching. Apply this to answer save, grading, history reads, and exit, not merely generation. Acceptance includes switch-during-start, exit-during-save, out-of-order open, and old failure arriving after a successful newer operation.

### S4 — P1 — Whiteboard recovery does not restore the saved work

**Reproduced reopen defect; draft loss is source-supported.** A saved active whiteboard with a prompt/solution opens an empty generic debrief and “Retry saved session generation,” rather than `WhiteboardRoom`. `openSavedSession` restores only a subset of fields and never reads `saved.whiteboard` (`app/suite/interview-sim/page.tsx:296`). It selects a room only for cards or an incomplete question rubric (`:306`); whiteboard sessions have neither. The generic retry sends whiteboards to interview-question generation (`:1194`).

Whiteboard edits only update component state (`app/suite/interview-sim/page.tsx:1866`); the start saves the initial object (`:737`) and the grading endpoint saves the answer later (`app/api/interview/whiteboard-grade/route.ts:33`). Reload before grading therefore loses current edits. **Implementation:** mode-specific persisted session schemas/reopen handlers, scoped whiteboard drafts or checked autosave, a visible save state, and an exact saved-answer grading retry. Opening unfinished work must never generate unrelated questions or consume a new allowance. Restore application, persona, interview type, selected stories and focus alongside the saved mode, rather than retaining whichever setup happened to be on screen.

### S5 — P1 — Saved answers and feedback are not bound to an exact revision

**Source-supported; concurrent provider completion not executed here.** Session PATCH writes transcript wholesale without an expected revision (`app/api/interview/sessions/route.ts:155`, `:176`). Session grading independently writes the transcript (`app/api/interview/session-grade/route.ts:50`), calls the provider, then writes scores (`:103`); it has no grading lease, input fingerprint, or final compare-and-set. Two tabs/retries can persist transcript B with feedback for A. Its cached grade is selected only by summary existence (`:44`). Whiteboard grading has a lease/cache but no answer hash, so a changed answer for a graded session replays old feedback (`app/api/interview/whiteboard-grade/route.ts:30`).

There is also deterministic content mismatch: typed input has no maximum (`app/suite/interview-sim/page.tsx:1826`), while grading truncates each entry to 6,000 characters and overwrites the saved transcript with that truncated copy (`app/api/interview/session-grade/route.ts:17`, `:50`). Whiteboard stores at most 8,000 solution characters but grades up to 10,000 (`app/api/interview/whiteboard-grade/route.ts:11`, `:33`, `:57`).

**Implementation:** immutable answer attempts/revisions, transcript/source hash, and grade receipts keyed to that revision. Check revision atomically at both submission and grade completion. Preserve the original answer; enforce documented client/server limits before submission or keep a distinct bounded model input. Test concurrent unequal submissions, stale grades, replay of identical requests, lost responses, and boundary-length answers. Distinguish intentional immutable completed attempts from editable drafts.

### S6 — P2 — Setup can display context or controls that do not govern generation

**Blank context reproduced; remaining points source-supported.** Selecting “Blank or pasted JD” retains the selected application because `applyApplication('')` returns immediately (`app/suite/interview-sim/page.tsx:435`, `:476`). Company, role and JD remain editable (`:992`), but a selected application makes session POST replace those edits with application values (`app/api/interview/sessions/route.ts:117`). The page ignores the returned canonical session object (`app/suite/interview-sim/page.tsx:570`), so the displayed brief can differ from the actual one.

The default Quick Drill prompt includes role/resume/stories but omits the supplied JD/company/persona (`app/api/gauntlet/generate/route.ts:159`). Full Mock forces a mixed question distribution instead of its selected interview type (`:152`). Cards omit selected-story context and practice-focus notes (`:53`), although these controls remain visible. Customization shows persona/type for every mode (`app/suite/interview-sim/page.tsx:1612`).

**Implementation:** give application context a real clear/detach action, explicit edit policy, and canonical brief preview; restore exactly the returned source snapshot. Define per-mode controls and an authoritative generation contract, and ensure the default one-question drill actually uses the visible role brief. Test request/prompt differences for each visible control. The blank-selector bug and duplicate/no-op launch controls are unresolved portions of the older audit, not newly introduced claims.

### S7 — P2 — Live recovery, quota errors, and transcript durability are incomplete

**Source-supported.** `LiveRoom` has Exit and End/debrief, but no mute, reconnect, device preflight, or typed fallback (`app/suite/interview-sim/page.tsx:1742`). Transcript lives in hook state until End/Exit (`:822`, `:876`); refresh/crash loses the live conversation. The normal socket-close handler provides no explanation (`hooks/useGeminiLiveAvatar.ts:189`). Permission denial cleans up correctly, but its allowance was claimed before socket/mic setup (`app/api/voice/live-token/route.ts:59`; hook `:285`).

Quota failure is now `PRACTICE_LIMIT`, but live-token catches it as HTTP 500/raw text without upgrade/limit metadata (`app/api/voice/live-token/route.ts:105`). The hook only exposes its upgrade action when `limitReached`/`upgrade` is present (`hooks/useGeminiLiveAvatar.ts:140`). General explanation exists, but no current remaining allowance is shown before starting (`app/suite/interview-sim/page.tsx:1205`). Whiteboard consumes its allowance only on grading (`app/api/interview/whiteboard-grade/route.ts:30`), unlike the blanket “starting consumes” copy.

**Implementation:** explicit live states and actionable errors; device test before a chargeable launch; deliberate same-session reconnect policy; local/server transcript checkpoints; mute and text fallback; structured shared quota errors and accurate per-mode charge timing. Real browser/device/provider validation remains a release gate, including the configured model's availability. Do not claim hook substitutes establish it.

### S8 — P2 — History and continuation remain partial

**Source-supported.** History stops at 50 with no cursor (`app/api/interview/sessions/route.ts:86`); the page reports this loaded set as “past sessions” (`app/suite/interview-sim/page.tsx:935`). The page reads mode, skill, role, company, story and application URL parameters, but has no session/deck-ID hydration (`:348`, `:452`, `:520`). Every history action is labeled “Open debrief” even when it resumes an unfinished question or cards (`:2144`). Cards always reopen at index zero (`:306`), have no saved review state, and completion ignores a non-OK PATCH response (`:1144`). Custom listbox lacks arrow-key/Escape/focus management (`:1322`).

**Implementation:** exact session links, cursor history with truthful loaded counts, state-aware Resume/View feedback/Review cards actions, checked completion saves, and clear card progress semantics. Use a native select or implement/test the complete keyboard interaction. Keep real-interview reflection separated from practice in the presentation as well as the data model.

## Implementation order and acceptance

1. **Session correctness first (S1–S5).** Introduce typed active-session/operation state, distinct new/retry/reconnect identities, cleanup on unmount, exact revision-bound answers/grades, mode-specific restoration, and whiteboard draft recovery. Convert the six audit probes into desired-behavior tests and add loaded-handler concurrency/long-answer tests. Keep the existing reservation and local-draft tests.
2. **Make the brief truthful (S6).** One target brief, an explicit source policy, and per-mode options. Apply the JD to default Quick Drill; validate Full Mock requirements before creating a dead-end session. Hydrate the server-returned brief. Reduce duplicate launch actions and remove “Start Debrief Review,” which is currently a no-op (`app/suite/interview-sim/page.tsx:886`, `:939`).
3. **Finish live and continuation (S7–S8).** Deliver device check, mute/reconnect/text fallback, transcript checkpoints, structured allowance states, exact saved-session URLs, full history and checked card completion. Validate microphone denial, device loss, normal/abnormal socket closure, token failure, quota exhaustion, reconnect and refresh with real browser/provider instrumentation before release.

Minimum end-to-end journeys: generic first drill; application drill whose canonical brief matches the screen; free final allowance followed by feedback retry; partial typed/whiteboard reload; slow mode/session switch; two concurrent tabs submitting different answers; new live practice after a completed one; navigate away during each live launch stage; interrupted live recovery; 51+ sessions; failed card completion save. These close demonstrated reliability gaps before expanding mode count or adding new coaching features.
