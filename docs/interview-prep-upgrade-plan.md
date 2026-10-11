# Interview prep: review and implementation plan

Reviewed September 28, 2026. Scope narrowed from the suite-wide review at the user's request. This is a researched implementation plan, not a claim that the changes below are built. Worktree: `Taco-upgrade`, branch `codex/taco-upgrade`.

## Product decision

Make Interview prep a repeatable learning workflow: **choose what to practise → answer → understand the feedback → retry → see what changed**. The first release should make that loop dependable before adding more presentation or specialist features.

Taco's opportunity is its connection to the person's confirmed Experience, the actual application, and their chosen stories. Keep those connections visible and accurate. More modes alone will not distinguish this product.

Recommended order:

1. Repair session identity, interruption/reopen, and the Experience handoff.
2. Simplify the first practice and turn feedback into a real next attempt.
3. Make feedback evidence-based and progress comparable.
4. Add adaptive mock interviews and dependable voice practice.
5. Deepen technical practice, study cards, and preparation for a scheduled interview.

Steps 1–3 are the first release. A working typed practice loop is useful across roles and is the foundation for voice and specialist modes.

## What the review actually covered

Inspected the current Interview Studio, question generation, session and grading APIs, live-token and audio lifecycle, practice receipts, draft recovery, source resolution, Story Bank and learning handoffs, and real-interview reflection ingestion. Read the prior implementation report first to avoid presenting resolved defects as new findings.

Browser review used a separate local tab at `/suite/interview-sim`: default populated setup, customization, whiteboard setup, mobile layout at 390 × 844, and a blocked Quick Drill start with a fictional Customer Success Manager role. Entered role survived the failure. The UI showed only “Could not create interview session,” losing the specific preview restriction. Viewport was reset afterward.

The isolated preview intentionally blocks interview session and story APIs. Its unavailable history/stories messages are **not evidence of broken production services**. Successful grading, real microphone use, provider quality/latency, and production persistence were not browser-tested here.

Controlled component probes reproduce six current defects; two additional route probes reproduce invalid grade acceptance and mood-derived ratings. The coordinator independently reran all eight probes and the 33-test focused suite successfully. These are separate from the passing existing regression suites: probe assertions establish current defects, not correct behavior. Their service/UI dependencies are mocked, and they do not prove real-device behavior. See [session evidence and runnable probe](audits/interview-prep-2026/session-audit.md) and [feedback evidence](audits/interview-prep-2026/feedback-audit.md).

## Current strengths to preserve

- Quick typed practice is the default and does not request microphone access.
- Session reservations and operation receipts prevent repeated charging for an ordinary same-session retry.
- Typed answers are persisted before advancing or grading; unfinished text is scoped to owner, session, and question.
- Evidence is resolved on the server, with owned Story Bank selection and exact source IDs rather than silently using the latest résumé.
- Invalid grade shapes do not silently become fabricated successful scores.
- Whole-session elapsed time is no longer displayed as candidate speaking speed.
- Real-interview reflections do not automatically turn generated answers into confirmed Experience.

These protections remain acceptance requirements for every upgrade below.

## Current findings, ranked

P1 means fix before releasing the affected workflow; P2 means a material usability or product limitation. The linked evidence reports contain exact source locations and reproduction details.

| Priority | Finding | User consequence | Required change |
|---|---|---|---|
| P1 | Live Exit → Start with unchanged setup reuses a creation request ID. | A new practice can inherit an old session/receipt and feedback rather than create a new attempt. | Explicit “new attempt” identity; reuse only for retrying the same operation. |
| P1 | A scheduled live connection can survive page unmount. | A connection can begin after the user has left the workspace. | Cancel the launch on unmount and invalidate pending work at every asynchronous boundary. |
| P1 | Mode changes during generation and competing saved-session opens lack a common operation guard. | The selected mode/session can be replaced by an older completion. | Bind UI state to a frozen session and reject responses from superseded operations. |
| P1 | Unfinished whiteboard sessions do not restore the board; they offer generic question generation. | Work cannot be continued reliably after leaving the page. | Persist board changes, reopen by mode, and retry its own grading operation. |
| P1 | “Blank or pasted JD” does not clear a selected application. | A supposedly independent practice retains the old application link. | Clear application identity and explicitly handle copied context. |
| P1 | The résumé picker offers documents that the new strict Experience resolver rejects. It nevertheless describes a selected document as linked proof. | A user can select a normal saved résumé and receive a generic start failure. | Separate submitted résumé context from confirmed Experience evidence. Resolve each through its proper contract. |
| P1 | A grade can pass shape validation while referring to a nonexistent answer or using inconsistent score dimensions. | Plausible-looking feedback is saved without matching what the person answered. | Validate answer IDs, evidence spans, rubric IDs, coverage, and server-derived aggregation. |
| P1 | Saved grades are not bound to immutable answer revisions; grading also truncates and overwrites long typed answers. | Feedback can refer to different content from the saved answer, and accepted text can be lost. | Preserve original content, enforce visible input limits, and bind grading receipts/completion to an exact input hash and revision. |
| P1 | Real-interview overall feeling is copied into every question's confidence when individual ratings are absent. | Career insights can mistake mood for measured per-skill performance. | Keep self-reported feeling, self-assessed answers, and assessed practice distinct; missing ratings stay unknown. |
| P2 | Quick Drill generation omits parts of its saved context; Full Mock forces mixed categories; cards do not use all the displayed context. | Controls and context imply personalization that is not consistently delivered. | Define a mode capability matrix, use every enabled setting, and hide irrelevant settings. |
| P2 | “Next drill” opens a generic assistant prompt instead of creating a drill tied to the feedback. | The learner has to reconstruct what to practise and cannot compare attempts. | Save a structured drill prescription and start it directly. |
| P2 | Readiness panels, two Start actions, context, mode tabs, persona, and intelligence compete on entry. | Starting a short practice looks like completing a large form. | One primary action, optional context details, and progressive setup. |
| P2 | History has limited reach and no complete exact-session URL continuation. | Older work and direct links are harder to find and resume. | Stable cursor pagination, filters, and owner-checked session deep links. |

The mobile document did not overflow horizontally in the inspected state. However, the mode rail required horizontal scrolling, and its later options were hidden initially. The existing paper/grid, ink, coral, folded-A identity should remain; hierarchy and interaction need improvement more than decoration.

## Competitive reference, as of this review

These are capabilities described on current official pages, not hands-on competitor benchmarks or proof of hiring outcomes. A feature page can describe a capability without establishing its quality. Published performance or placement multipliers are not adopted here.

| Reference | Published capability relevant to Taco | Implementation implication |
|---|---|---|
| [Teal Interview Practice](https://www.tealhq.com/tools/ai-interview-practice) | Practice from saved job descriptions, multiple interview formats, transcripts/recordings, feedback, and progress history. | Application context should carry forward without re-entry; returning to an earlier answer must be easy. |
| [Yoodli Interview Scenarios](https://yoodli.ai/feature-announcements/your-secret-weapon-for-interview-prep-interview-scenarios) | Role/company scenarios, job-context import, a question bank, and custom questions. Announcement dated December 17, 2024, still available at review. | Add practice on the user's own question and reusable target briefs. Do not put every scenario setting in the first-use path. |
| [Big Interview PracticeAI](https://www.biginterview.com/news/big-interview-launches-practiceai-the-most-realistic-interview-preparation-yet) | Resume/JD-informed voice practice with response-dependent follow-ups and feedback. Launch announcement dated September 10, 2025. | A full mock should probe the candidate's answer, with separate coaching and simulation behavior. |
| [Hello Interview AI Coding Practice](https://www.hellointerview.com/practice/ai-coding) | In-browser codebase tasks assessed against tests, plus local open-ended work followed by debrief questions. | Taco's current structured text board should not imply executable coding assessment. Build and label technical modes to match their actual capabilities. |
| [Aced / formerly Exponent practice](https://www.tryexponent.com/practice) | Peer practice and AI practice/feedback alongside specialist interview preparation. | Evaluate Taco against task-specific rubrics and human review, not just a general chat response. |

Research supports investigating a more reflective loop. [Conversate](https://arxiv.org/abs/2410.05570) describes adaptive simulation, transcript annotations, and dialogue about feedback. [Technical think-aloud practice research](https://arxiv.org/abs/2507.14418) explores conversational support for explaining reasoning. These studies motivate design choices; they do not demonstrate that Taco improves hiring outcomes.

**Interpretation:** role relevance, realistic follow-ups, reviewable answers, and a useful retry are the practical benchmark. Taco can compete through trustworthy connected context and visible improvement. Video/avatar polish is a later option, not the first investment.

## Proposed experience

### Entry: three clear destinations

- **Practice:** one question, a short mock, or technical practice. Default to one question. Type by default; speaking is an explicit choice.
- **Your interviews:** select an existing application or enter a target. Show the next scheduled interview when its date is known. Keep general practice available without a job description.
- **History:** continue unfinished work, review feedback, and compare attempts. Study cards and Story Bank remain reachable as preparation resources rather than peer interview modes.

Use the same paper background, compact bordered surfaces, dark type, coral primary button, and folded-A mark as the approved workspace. One dominant action per state. Keep optional context in a disclosure; a missing résumé, story, or JD must not look like a failed readiness test when the exercise works without it.

For first use, ask only what the person wants to practise. Offer a sensible starter such as “Tell me about yourself,” role-relevant question generation, or “Use my own question.” Show the selected target and evidence as concise chips with Change actions. Advanced settings hold interview stage, category, duration/question budget, challenge level, and coaching style. Prefer neutral styles such as supportive, direct, and probing over employer-branded personas.

### Practice room

One question and one answer surface. Show question progress, the save state, and a clear way to pause/finish. Optional coaching hints are available during drills and off during a mock until review. Hints must not count as an unassisted attempt.

Freeze the mode and context once a session begins. “Change setup” saves or abandons the current session explicitly before returning to setup. During generation, the interface cannot silently reinterpret a pending Quick Drill as a whiteboard or live session.

Provide separate actions for **Continue this session**, **Retry a failed operation**, and **Start a new attempt**. They have different identity and charging semantics even if their visual language is consistent.

### Feedback and retry

Lead with one useful observation, followed by the exact answer excerpt that supports it. Show a specific improvement and an action to retry that question. Keep strengths visible; avoid a wall of generic advice.

Example: “Your contribution is unclear” → quote “we improved onboarding” → prompt “What did you personally change?” → **Try this answer again**. If a number or result was not supplied, ask for it or suggest a nonnumeric description; never invent it.

Use stable rubric dimensions suitable for the question. Behavioral answers might assess relevance, personal contribution, reasoning, and outcome/reflection. Technical reasoning, case analysis, and screening answers need their own rubrics. Do not force STAR onto every question.

After a retry, show the earlier and new answer, the changed evidence, and comparable rubric dimensions. Preserve both attempts. A new exercise targeting the same weakness is distinct from retrying the same question and should be labelled accordingly.

### Voice and technical modes

Voice begins with an explicit device check, visible listening state, and tested cancellation. Offer a typed fallback. Separate candidate speech duration from total elapsed time before adding pace metrics; do not infer confidence, competence, or personality from accent or delivery alone. Raw audio recording/storage needs an explicit product decision and retention implementation; it is not part of the first release.

Initially label the whiteboard as structured technical reasoning practice. Give coding, system design, and case work different prompts and fields. A future code runner must use isolated execution, resource limits, deterministic tests, and an explicit language/runtime list. Do not retrofit arbitrary execution into the existing grading endpoint.

## Data and API contracts

Evolve the existing session service rather than creating a parallel interview database. Retain legacy reads; add an explicit schema version and migration adapter.

| Contract | Required fields / behavior |
|---|---|
| `PracticeBrief` | `id`, owner, revision, application ID if selected, role/company/JD snapshot, interview stage/category, selected source references, optional user question, focus. Optional context remains optional. |
| `EvidenceSnapshot` | Separate confirmed Experience revision/hash, submitted résumé ID/revision/hash as a document, and selected Story Bank IDs/revisions. Store the bounded content actually used and source timestamps. Never treat document prose as confirmed facts automatically. |
| `PracticeSession` v2 | Immutable session ID, brief snapshot, exercise kind, channel, question budget, state, revision, generation configuration, rubric version, created/updated times. Mode-specific state must be discriminated, not overloaded in `rubric`. |
| `PracticeTurn` | Stable turn/question IDs, parent question ID for follow-ups, role, answer revision, text, source of input, timestamps, hint usage. Optional measured speech interval only when genuinely captured. |
| `PracticeAttempt` | ID, parent attempt if retry, exact question/rubric/evidence snapshot, answer revision, state. New attempts remain separate from retries of a network operation. |
| `PracticeFeedback` | Answer revision/hash, rubric/model/prompt versions, criterion IDs, anchored evidence spans, supported strengths/improvements, unknown/unassessable state, coverage, server-derived summary band. Reference only present answers. |
| `DrillPrescription` | Origin feedback/attempt IDs, criterion, exercise/question specification, success criterion, original context references, and completion attempt. A button starts this object directly. |
| `InterviewReflection` | Actual interview/application link; overall self-reported feeling separate from optional per-answer self-ratings. Practice assessment and self-report retain different provenance in insights. |

Proposed state transitions: `draft → preparing → ready → in_progress → submitted → grading → completed`; recoverable `generation_failed`, `save_failed`, and `grading_failed` states preserve the last durable artifact. `paused` and `abandoned` are explicit. Channel-specific live connection status is separate from this durable session state.

Server commands must enforce owner, expected revision, legal state transition, and operation idempotency. Keep the existing session route for compatibility while introducing explicit commands such as `start`, `append-turn`, `pause`, `complete`, and `retry-attempt`. Return structured error codes and the appropriate recovery action. Validate model output semantically before saving it, not just against JSON shape.

At generation start, freeze the source snapshot used by the operation. A source edited afterward must not silently change an in-progress session. Offer a new brief revision or a new attempt if the learner wants updated evidence. Changes made in another tab require a revision conflict rather than last-write-wins overwriting of answers.

## Build milestones and acceptance

| Milestone | Bounded implementation | Acceptance evidence |
|---|---|---|
| **M0 — reliability and source integration** | Extract the session controller from the large page. Fix start/retry identity, mode/reopen races, launch cleanup, blank application selection, mode-specific recovery. Bind saves/grades to revisions and preserve original long answers. Split confirmed Experience and submitted résumé resolution. Preserve detailed errors. Correct reflection provenance. | Convert every reproduced defect into a desired-behavior regression; test double-click, delayed A/B responses, concurrent unequal answers/stale grades, boundary-length content, account switch/unmount, new-versus-retry receipts, unsupported/foreign sources, and whiteboard exact reload. A normal saved résumé can be used as context with an independently confirmed source or clearly labelled no-source practice. |
| **M1 — focused entry and durable attempts** | Add Practice / Your interviews / History navigation; collapse optional setup; add custom-question drills; implement v2 mode-specific sessions and attempts; history pagination and `sessionId` links. Keep old URLs working. | New user reaches a first question without JD/story/resume. Context for a selected application is visible and correct. Refresh restores question, answer, board, and mode. Older sessions past the first page remain reachable. Mobile/keyboard actions work. |
| **M2 — trustworthy feedback and real retry** | Versioned rubrics, stable question/answer IDs, evidence-span validation, deterministic aggregation, per-answer feedback, drill prescriptions, retry comparison, provenance-aware insights. Wire actual source/context settings consistently. | Reject q999 for a one-answer session, fabricated quotes, duplicate/missing criterion IDs, unsupported score dimensions, out-of-range scores and stale answer revisions. Next drill opens the prescribed exercise. Retry preserves first attempt and uses a comparable rubric. Missing reflection confidence remains unknown. |
| **M3 — adaptive mock and voice** | Response-dependent follow-ups with bounded turn budget; separate interviewer/coaching behavior; mic/device preflight, interruption/reconnect, durable transcript checkpoints, typed fallback. | Controlled provider tests plus real-device staging across permission denial, disconnect, tab leave, device loss, and reconnect. Follow-ups reference an actual answer and stop at budget. No late mic connection or duplicate turn/charge. |
| **M4 — deeper preparation** | Scheduled-interview brief, story-to-competency coverage, self-tested cards with missed-card review, distinct technical templates, optional learning-task handoff. Design a separate executable coding service only if prioritized later. | Cards record recall rather than merely page traversal. Learning handoffs retain originating weakness/attempt. Technical grading uses the selected rubric and saved board. No execution or source-verification claims beyond implemented behavior. |

Suggested component boundaries: `InterviewPrepWorkspace`, `PracticeSetup`, `PracticeContextPicker`, `PracticeRoom`, `PracticeFeedback`, `AttemptComparison`, `PracticeHistory`, plus mode-specific rooms. Shared pure libraries should own contracts, transitions, evidence resolution, feedback validation, and error mapping. The current page is roughly 2,200 lines; split by behavior while preserving the existing API adapters and tests.

Parallel implementation can safely separate: (a) contracts/server lifecycle, (b) setup/room/history UI against the agreed contract, and (c) rubric evaluation and fixtures. Integrate M0 before independently building M1/M2. Voice must consume the same lifecycle; it must not grow another private session model.

## Evaluation, accessibility, and release gates

Create an evaluation set before tuning prompts: behavioral, screening, leadership, technical reasoning, and case answers; short/incomplete responses; clear but non-STAR answers; non-native phrasing; unsupported metrics; answers that contradict a selected document; missing evidence; and prompt injection inside a pasted JD. Include several roles beyond software engineering. Use fictional or explicitly permitted examples.

For deterministic integrity checks, require zero accepted nonexistent answer references, invalid evidence spans, cross-owner reads, silent source substitutions, or invented stored ratings. These are release requirements, not statistical aspirations.

For coaching quality, use a proposed pilot of 40 varied answer/question pairs and 10 multistep mock sessions. Have two independent reviewers assess question relevance, factual restraint, feedback specificity, usefulness of the next action, and scoring disagreement. Agree the rubric and thresholds before seeing results. This is a pilot design, not a powered efficacy study or an achieved benchmark. Compare repeat assessments under a fixed rubric before exposing progress trends.

Conduct fresh-user tasks: general practice, job-linked practice, feedback retry, interrupted resume, and finding a past attempt. Observe task completion, hesitation, incorrect context selection, and whether the person can explain what to improve. A proposed usability target is first-question access in under a minute for an ordinary returning user; measure it rather than claiming it now.

Instrument operational events without raw answer/JD text: start requested, question ready, answer durably saved, feedback ready, retry started/completed, recovery attempted/succeeded, and abandonment. Track failure rate, time to first question, answer-loss incidents, latency percentiles, feedback-to-retry conversion, and same-rubric changes. Practice scores are not hiring probabilities or validated skill credentials.

Keyboard focus must move to the active question and return sensibly after dialogs. Save/error status should be announced. Avoid color-only grades; support reduced motion, 200% zoom, narrow screens and screen-reader use. Verify form labels and speech controls with actual interaction, not only automated scans.

Production gates: regression and contract suites; targeted rules/emulator ownership tests; TypeScript/build; local desktop/mobile review; isolated authenticated staging for source intake/session persistence and real provider behavior; real-device voice checks before enabling upgraded voice. Keep specialist modes on the old safe path or unavailable until their own gate passes.

Roll out the new session schema behind a server-controlled flag. Read legacy records without inventing missing provenance, and never rewrite old grades into the new rubric. Start with internal synthetic accounts, then a small cohort. Roll back the UI/creation flag without deleting sessions. Plan rollback for rules/index compatibility separately from Hosting/SSR traffic.

## Decisions and scope boundaries

Proceed on these implementation assumptions: general practice needs no JD; typed mode remains the default; both confirmed Experience and a submitted résumé may be selected with different roles; no automatic promotion of practice answers into Experience; no avatar/camera work in M0–M2; no inference that interview mood equals measured capability.

Preserve current plan entitlements and allowance amounts during M0–M2. The current policy charges for a start even if later generation fails. A fairer reserve/commit/release policy deserves a separate product decision and atomic accounting design; do not quietly change charging while fixing idempotency. Retrying an existing operation remains uncharged under the existing contract.

First build slice: **M0, then one complete Quick Drill → feedback → retry path from M1/M2**. Semantic grading validation from M2 is a release gate even when the broader feedback UI is staged later. This delivers a reviewable improvement before expanding the rest of the tool. No application changes were made by this planning pass.

## Deployment instruction

The user requested deploying when weekly allowance reaches **5% remaining**, not immediately. The final check during this review was 15% remaining; no deployment occurred. A quiet thread heartbeat checks the condition every 15 minutes. See [deployment readiness](audits/interview-prep-2026/deployment-readiness.md). A successful static environment preflight is not a passed staging release gate, and the current interview P1 findings must be resolved or the affected paths excluded before release.
