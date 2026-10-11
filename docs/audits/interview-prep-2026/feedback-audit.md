# Interview prep: feedback and learning-loop audit

Date: 2026-09-28. Checkout: `/home/xwingace/Documents/Projects/Taco-upgrade`. This is a planning report, with no product source edits, external writes, browser activity, deployment, broad build, or live AI calls. The pre-existing dirty tree was preserved.

The implemented foundation is substantially better than the earlier tool audit: sessions reopen, typed answers save before grading, unavailable AI does not fabricate a fallback score, and selected source evidence reaches the main interview engine. The next upgrade should make feedback trustworthy and usable across repeated attempts. Current grading validates JSON shape but not its relationship to the answer; next-drill actions still lose their coaching focus; real-interview reflection creates answer-confidence numbers the user never reported.

Evidence labels: **source-confirmed** traces the current call path; **controlled reproduction** executes current route code with local provider/database fixtures; **design recommendation** is a proposed product behavior, not a user-research finding. P1 means a release blocker for the affected evidence/feedback promise, not necessarily the entire product. P2 is a material workflow limitation. No live-provider accuracy, accessibility, latency, Firestore transaction behavior, or microphone performance is established by this report.

## What is already solid

| Earlier concern | Current evidence and disposition |
| --- | --- |
| Generic fallback grades and speech judgments on typed answers | Removed from active grading. The prompt explicitly assesses content only (`app/api/interview/session-grade/route.ts:54`); provider failure returns 503 with saved-transcript recovery (`:85`); client sets telemetry to null (`app/suite/interview-sim/page.tsx:759`). `lib/interview-telemetry.ts` still exists but is not called by the active page. Do not re-report its old WPM behavior as active. |
| Grading consumes a second Free lifetime use | Session grading skips the usage cap (`app/api/interview/session-grade/route.ts:31`) and requires an owned reservation (`:40`). Reservation, feature selection and lease caching live in `lib/practice-session-server.ts:14`. Focused concurrent-start and retry tests pass. |
| No full saved debrief | Exact owner-scoped GET exists (`app/api/interview/sessions/route.ts:78`); history opens its ID (`app/suite/interview-sim/page.tsx:2141`), restores grade/transcript (`:297`) and displays answer feedback/rewrite tips (`:2030`). See remaining mode/context omissions below. |
| Typed answer lost when grade fails | Typed submit checks its save before clearing the local draft (`app/suite/interview-sim/page.tsx:804`); grading saves the transcript before calling AI (`app/api/interview/session-grade/route.ts:50`); the UI exposes Retry feedback and save (`app/suite/interview-sim/page.tsx:1195`). Draft keys isolate account/session/question, tested in `scripts/practice-recovery.test.js:10`. |
| Source evidence absent | Main question generation resolves owned evidence and saves the snapshot (`app/api/gauntlet/generate/route.ts:44`, `:203`); main grading includes that evidence (`app/api/interview/session-grade/route.ts:78`); live token prompt includes it (`app/api/voice/live-token/route.ts:63`). Story selection is explicit (`app/suite/interview-sim/page.tsx:563`; `lib/practice-draft.ts`). |
| Latest source substituted for chosen source | The current resolver reads the exact selected ID (`lib/server-resume.ts:310`) and rejects generated workspace resume documents (`:80`). It does **not** fall back to the latest source. The picker boundary below is the actual remaining defect. |
| Missing Story Bank assisted endpoints | Extract, match and quality routes now exist. Extraction always returns unsaved drafts (`app/api/agent/stories/extract/route.ts:22`); editable review precedes the separate save (`app/suite/agent/stories/page.tsx:300`). Quality is labeled completeness, not factual verification (`:440`). |
| Real reflection automatically becomes factual achievement | Automatic promotion is removed (`app/api/agent/debriefs/route.ts:165`), with a regression test. Keep this boundary. |
| Skill plans refresh while inheriting old completion | Immutable plan/task versions and archived progress exist (`lib/learning-plan.ts`; `scripts/learning-integrity.test.js:12`). Current Skill Bridge assessment distinguishes latest/best/legacy (`lib/skill-assessment.ts:1`); interview assessment should gain its own explicit version contract. |

## Current findings

### FB-01 — P1 — The source picker offers resume documents that the evidence resolver must reject

**Source-confirmed.** `getResumeVersions` reads every `resume_versions` document without a kind filter (`lib/database-suite.ts:235`). Interview prep stores the result unchanged (`app/suite/interview-sim/page.tsx:385`) and maps every entry into its resume picker (`:443`). Any selected item appears linked for proof checks (`:193`, `:199`). However, session creation calls `resolvePracticeEvidence` (`app/api/interview/sessions/route.ts:124`), which calls the strict source resolver (`lib/practice-session-server.ts:64`). That resolver correctly refuses `metadata.workspace.kind === 'resume'` as a factual source (`lib/server-resume.ts:80`). General/tailored resume documents created under the new Your experience contract are therefore offered as valid proof anchors, then fail session creation. The outer route returns 500 (`app/api/interview/sessions/route.ts:128`); the client discards the specific cause (`app/suite/interview-sim/page.tsx:569`). Application linking can automatically select the same incompatible document through `resume_version_id` (`app/api/interview/sessions/route.ts:121`).

**Implementation:** split `experienceSource` from `submittedResumeDocument`. Accept a selected application resume as employer-facing context, resolve its explicitly recorded Experience lineage where valid, and let the user see/choose that exact confirmed revision. Never make a generated document pass source verification to repair this mismatch. Reuse `WorkspaceMetadata.sourceVersionId`, `sourceSnapshot`, `sourceHash` and `sourceConfirmedAt` (`lib/resume-workspace.ts:41`). A source failure should return a typed 422 with a recoverable selector state, and generic practice should remain possible.

**Acceptance:** confirmed Experience starts; a tailored/general resume remains context only; missing/deleted/foreign lineage is explicit; an application's submitted document and underlying Experience revision are separately displayed; no latest-source substitution; selected source changes alter the question/grade input.

### FB-02 — P1 — Assessment validates shape, not evidence or rubric validity

**Source-confirmed and controlled reproduction.** The model is asked for a numeric score and freely named rubric rows without performance anchors, weights, required dimensions, or a version (`app/api/interview/session-grade/route.ts:56`). Runtime validation permits any positive `questionIndex`, duplicate/missing answer feedback, arbitrary rubric labels, empty strengths/improvements and inconsistent aggregate scores (`:90`). There is no question/answer ID or quoted span that makes a feedback assertion auditable, no relevance check against the actual question, and no coverage check against answered questions. Evidence is present in the input but output has no distinction among supported, contradicted and unassessable factual claims. A disclaimer is retained (`:99`), which is helpful but cannot supply those missing checks.

A controlled invocation of the actual POST route with one question and one answer accepted `{score:99, answerFeedback:[{questionIndex:999, score:100, ...}], rubric:[{label:'Arbitrary invented dimension', score:1, ...}]}` and returned HTTP 200 with `success:true,persisted:true`. Provider and database were mocked; this establishes schema acceptance, not that a live model commonly produces that output.

The same issue exists in specialist grading: broad criteria in one sentence and arbitrary rubric rows (`app/api/interview/whiteboard-grade/route.ts:34`, `:69`). The common UI reduces all modalities to the same bands (`app/suite/interview-sim/page.tsx:1989`) and shows only the first three rubric rows (`:2020`). There is no stored rubric version, model/prompt version, generation difficulty contract, assessment timestamp distinct from session completion, or evaluation corpus. Comparing these scores as progress would be unsupported.

**Implementation:** define mode/competency-specific rubric IDs with behaviorally described levels; give each generated question a stable ID, assessed competencies and intended difficulty. Grade an immutable answer attempt, require exactly one record per eligible answer, validate cited answer spans, reject nonexistent IDs, and calculate aggregate results server-side from applicable dimensions. Support `not_assessable` rather than forcing a score. Separate `contentAssessment` from optional delivery observations and separate a source-consistency flag from a factual-verification claim. Record assessment/rubric/prompt/model versions internally; show a concise human-readable provenance and confidence limitation externally.

**Acceptance:** wrong/duplicate/missing answer IDs fail, quotes must exist, unrelated material cannot earn relevance credit, missing evidence cannot count as proven experience, model-supplied totals cannot override server totals, short correct technical answers are not penalized for lacking STAR, and unsupported dimensions remain unscored. Human-calibrated fixture evaluations must cover concise versus verbose answers, fluent irrelevant answers, fabricated metrics, non-native phrasing, partial answers and equivalent paraphrases before progress bands are promoted as a product claim.

### FB-03 — P1 — Real-interview reflection manufactures per-question confidence from mood

**Source-confirmed and controlled reproduction.** The capture form asks overall feeling but sends no confidence per question; it also assigns every question category `Interview` and hardcodes the round to `behavioral` (`app/suite/interview-sim/page.tsx:2188`, `:2195`). The API fills missing question confidence with `normalizedFeeling * 20` (`app/api/agent/debriefs/route.ts:112`, `:117`). `computeInterviewIntelligence` then uses these numbers as category strengths/weaknesses, overall confidence and improving/declining trends (`lib/career-graph.ts:518`, `:533`, `:545`). More pasted questions duplicate the same inferred feeling into more observations.

Actual route fixture results, same two unrated questions:

```json
{"overallFeeling":1,"status":200,"storedConfidence":[20,20]}
{"overallFeeling":5,"status":200,"storedConfidence":[100,100]}
```

The user's mood is useful reflection data. It is not two independent ratings of database knowledge and conflict handling. No automatic story promotion now occurs, but this other evidence boundary remains broken.

**Implementation:** store absent answer confidence as null; store explicitly entered self-confidence with `measurementSource:'self_report'`. Keep overall feeling independent. Require an optional real round choice and editable question category instead of invented behavioral classification. Compute confidence summaries only from explicit self-reports with sample counts, and never combine them with AI practice grades. Migrate known imputed records to a legacy/derived bucket; do not silently relabel them as observed confidence.

**Acceptance:** changing mood alone does not change competency or readiness summaries; unrated questions never become zeros or 100s; counts represent actual ratings; retrospective date/round are editable; practice results cannot affect real employer pass rate.

### FB-04 — P2 — Feedback cannot produce a linked revision and retry

**Source-confirmed.** A Next drill card passes `drill.title || drill.focus`, dropping the focus whenever a title exists (`app/suite/interview-sim/page.tsx:2042`). The handler switches mode and opens assistant chat with a sentence (`:1187`), but never updates `practiceFocus`, records a source session/answer, creates a drill, or fixes the next question. Generation only gets persistent focus through session notes (`:562`; `app/api/gauntlet/generate/route.ts:190`). Ask Taco likewise carries a generic role sentence without the saved debrief ID or its contents (`app/suite/interview-sim/page.tsx:1186`). There is no edit-answer/retry-this-question flow, before/after comparison, or completion tracking for recommended drills.

Skill Bridge's outbound link now preserves skill/role/company/application (`app/suite/skill-bridge/page.tsx:764`) and interview prep reads the skill (`app/suite/interview-sim/page.tsx:352`), which fixes the old entirely lost handoff. It still lacks a challenge/plan/source-attempt ID and a return outcome; the visible return is a generic link (`:1205`). Story Bank's Practice action passes only `storyId`, dropping the matched question/answer variant (`app/suite/agent/stories/page.tsx:448`).

**Implementation:** make Retry this answer and Practice this feedback explicit actions. The first creates a new immutable answer attempt linked to its parent, same question and rubric; the second creates a planned drill with a structured competency/focus, source attempt, selected evidence and original role brief. A revised answer may acknowledge coaching assistance so comparisons are interpretable. Pass IDs to assistant review rather than asking it to guess the record. Preserve the source plan/challenge/story-question handoff and return an assessed-practice result, not a mastery certificate.

**Acceptance:** clicking a drill actually changes the next engine request; a new retry preserves the original answer/grade; same request retry is idempotent; before/after views show actual cited improvements; a learning handoff returns to its originating item and cannot mark a whole course complete.

### FB-05 — P1 — A stored grade is not bound to an immutable transcript revision

**Source-confirmed risk; concurrency not reproduced.** Main grading accepts the request transcript and overwrites the session before model evaluation (`app/api/interview/session-grade/route.ts:36`, `:50`). It returns any existing summary without comparing answer content (`:44`). Session PATCH remains able to replace transcript/whiteboard even on a completed graded session (`app/api/interview/sessions/route.ts:154`, `:173`). Main grading uses `requirePractice`, unlike the lease/owner transaction used by whiteboard, and separately writes grade after generation (`app/api/interview/session-grade/route.ts:40`, `:103`). Two overlapping grades or a later transcript write can leave a grade attached to different material; the existing response may then be cached permanently.

This is a record-integrity issue even when every request belongs to the correct user. Ownership and allowance idempotency alone do not make assessment idempotent.

**Implementation:** freeze an answer/transcript revision before assessment; hash its content and rubric/source snapshot; grade by saved attempt ID rather than free client transcript. Use a lease plus transactional compare-and-set for the grade, and cache by assessment input hash/version. Completed attempts are immutable; edits create child attempts. Preserve the existing rule that retrying a permitted session's failed feedback does not consume another lifetime allowance.

**Acceptance:** concurrent grading returns one authoritative result; stale workers cannot replace a newer answer revision; changed content cannot receive a cached old grade; network retry costs no extra allowance; no score becomes visible before its matching content is durably saved.

### FB-06 — P2 — Specialist debriefs and reopening omit the actual work

**Source-confirmed.** Whiteboard sessions store structured work at start (`app/suite/interview-sim/page.tsx:737`) and at grading (`app/api/interview/whiteboard-grade/route.ts:33`), but `openSavedSession` never restores `saved.whiteboard`, whiteboard mode or prompt (`app/suite/interview-sim/page.tsx:297`). A completed whiteboard opens its grade without its answer; a failed/ungraded whiteboard with no question rubric falls into the generic debrief. Its Retry saved session generation action chooses question generation for every non-card mode (`:1194`). The debrief renders transcript only (`:1196`) and drops `missedConsiderations` from the specialist grade schema. Inputs edited during a whiteboard room have no corresponding typed-draft recovery path (`:1882`).

The technical endpoint grades only body role/company and the structured response (`app/api/interview/whiteboard-grade/route.ts:50`), omitting saved JD, approved Experience/story evidence and practice focus. All three specialist choices share the default notification-system prompt (`app/suite/interview-sim/page.tsx:339`) and a common criteria list. The server correctly says it does not execute code (`app/api/interview/whiteboard-grade/route.ts:36`); correctness is still a model review, not a tested solution.

**Implementation:** discriminate specialist session detail and recovery by mode; restore/edit structured drafts, show the saved prompt/solution alongside feedback, render missed considerations/follow-up question, and retry the whiteboard grader on the same saved answer. Use separate coding, system design and business-case rubrics/templates. Keep textual coding review explicit; any code execution/judge would be a separately scoped subsystem with test cases, sandboxing and distinct execution results.

**Acceptance:** coding/design/case sessions reopen exact work after refresh, including failed grading; no technical session can enter generic generation on recovery; long code has consistent save/grade bounds (currently the saved solution uses the 8,000-character default at `whiteboard-grade/route.ts:33` while grading permits 10,000 at `:57`); the saved input and assessed input match.

### FB-07 — P2 — History is a recent list, not a comparable learning record

**Source-confirmed.** History lists the latest 50 sessions without pagination (`app/api/interview/sessions/route.ts:86`). Reopening restores role/company/JD/resume/mode/transcript/grade but not application ID, persona, interview type, selected stories, notes or source snapshot (`app/suite/interview-sim/page.tsx:297`); starting a subsequent session can therefore mix the reopened role with previously selected context. This is distinct from the old absence of a detail read, which is fixed. Details also do not display the source revision or complete rubric.

The readiness counter regards any truthy `scores` object as a completed session (`app/suite/interview-sim/page.tsx:178`), while every new session initializes `scores:{}` (`app/api/interview/sessions/route.ts:52`). It can announce a completed baseline for an ungraded draft. Session-level feedback contains `weakCategories` (`app/api/interview/session-grade/route.ts:97`), but Career Twin reads `debriefs`, stories, resumes, plans and skill assessments rather than `interview_sessions` (`lib/career-graph.ts:276`). The readiness promise that saved debriefs shape next drills (`app/suite/interview-sim/page.tsx:222`) exceeds this path's implementation.

**Implementation:** use a typed detail hydrator and cursor-based history with filters for role/application, mode and competency. Show feedback status independent of ended/completed state. A practice progress summary must ingest the dedicated practice-assessment collection and compare only compatible rubric versions, competency, difficulty and modality. Use separate labels for observed assessment, self-report, card review and real outcome. Show sample count and enough context to explain why two attempts are or are not comparable. Archive old scores as legacy rather than normalizing invented precision into a trend.

### FB-08 — P2 — Experience-backed stories lack a traceable promotion and revision loop

**Source-confirmed.** The main grader returns `storyCandidates` as only title/why (`app/api/interview/session-grade/route.ts:66`), but the debrief has no candidate review action (`app/suite/interview-sim/page.tsx:2017`). A candidate cannot identify the original answer span or the saved story it proposes to improve. `resolvePracticeEvidence` preserves story IDs/STAR content but strips story timestamps and source metadata, and discards the source resolver's verification/update metadata (`lib/practice-session-server.ts:62`). Generation snapshots the content after it succeeds, not at initial session creation (`app/api/gauntlet/generate/route.ts:203`; `app/api/interview/sessions/route.ts:124`). Existing snapshots help retain grading context; they are not a complete provenance envelope.

Story Bank matching asks the model not to invent facts, but its quality policy proves only that ranked IDs belong to the bank (`lib/story-intelligence.ts:282`); answer-variant text is normalized without claim-level source checks (`:204`). Matching still takes the first 100 stories (`:241`), and its fallback recommends the nearest available story even with no relevance threshold (`:139`, `:156`). These are narrower remaining gaps than the now-fixed list pagination and missing routes.

**Implementation:** capture a revision/hash/source-kind envelope at session reservation, display what was used, and retain reviewed story provenance. A story candidate becomes an editable draft citing the practice answer; ask the user to distinguish actual work from hypothetical practice before saving a factual accomplishment. Support revising an existing story instead of duplicating it. Do not write practice scores or hypothetical answers into confirmed Experience automatically. Match against paginated/searchable owned candidates and label fallback/low relevance; check generated answer claims against selected STAR fields.

### FB-09 — P2 — Study cards and real-reflection history remain disconnected from the loop

**Source-confirmed.** Study cards support flip/previous/next/finish (`app/suite/interview-sim/page.tsx:1906`), with no recall response, difficulty feedback, missed-card record, review schedule or card-to-drill action. Finish submits advice to review missed cards in Memory (`:1152`), but no missed-card data exists and session PATCH does not accept recommendations (`app/api/interview/sessions/route.ts:155`). Interview-generated decks persist inside the session rubric (`app/api/gauntlet/generate/route.ts:93`), not as Memory records. Exact card reopening from saved sessions is implemented and should be retained.

Real reflection is saved to a separate debrief collection with owned GET (`app/api/agent/debriefs/route.ts:36`), but this page only loads interview sessions (`app/suite/interview-sim/page.tsx:371`); it shows a capture form, not saved reflection records (`:2128`). After reload the user cannot reopen that saved reflection here. The form's state is not keyed to application (`:2128`, `:2162`), so changing selected application can retain old notes/saved confirmation; this is a source-confirmed state risk, not browser-reproduced in this subtask.

**Implementation:** present two explicit history record kinds, Practice and Real interview reflection. Reopen the actual reflection by ID and offer user-reviewed follow-up practice. Keep study cards lightweight: self-rated recall is sufficient initially, with exact card IDs and a missed-card practice action. Decide on one canonical storage/read path before advertising Memory sync; do not count reading a card as an assessed answer or interview readiness.

## Implementation slices and proposed contracts

These are proposals, not implemented APIs. Reuse current authorization, allowance reservation and owned resource conventions. Avoid a parallel new interview product; extract contracts from the large existing page into small mode-specific modules.

| Slice | Concrete deliverable | Dependencies and exit criteria |
| --- | --- | --- |
| 1. Evidence/record boundary | `PracticeBrief` with separate `experienceSource`, `submittedResumeDocument`, application snapshot, approved story revisions, focus and source handoff. Filter/classify selectors; return typed source errors. Reflection confidence becomes optional explicit self-report. | First release gate: FB-01 and FB-03. Existing source-selection and debrief tests gain the new workspace-kind and missing-confidence cases. No generated resume is promoted to evidence. |
| 2. Immutable attempts and recovery | Add question IDs, answer-attempt IDs, saved input hashes, assessment job state and parent-attempt links. Grade by attempt ID with a transaction/lease. Preserve transcript and structured whiteboard drafts. | FB-05 and FB-06. Stale-worker, duplicate request, provider outage, save failure and refresh tests run per mode. Provider success with save failure is recoverable without creating another answer or charging another use. |
| 3. Evidence-linked feedback | `AssessmentResult` schema with `rubricVersion`, `assessmentVersion`, `inputHash`, `questionId`, `answerAttemptId`, rubric dimension IDs/levels, answer citations, source-consistency observations, specific revision task and next drill. Server computes summaries; UI renders the full rubric with question/answer context. | FB-02. Semantic fixtures reject bad IDs/spans and non-applicable dimensions. Separate coding/design/case assessment packs. Human review establishes acceptable quality on a frozen representative corpus before score comparisons ship. |
| 4. Revise, retry, continue | A retry command creates a child attempt for the same question. A drill command resolves a persisted recommendation into a new focused practice brief. Review assistant receives exact session/assessment IDs. | FB-04. Demonstrate answer → feedback → revision → retry → comparison, and Skill Bridge → practice → linked learning item, entirely from saved records. No chat-only substitute for a drill CTA. |
| 5. Histories and honest progress | Cursor history with record kind filters, complete detail hydration, practice-only progress grouped by compatible assessment contract, ungraded/legacy/insufficient-evidence states, real-reflection detail. | FB-07/09. 51st session remains reachable; unrelated roles/modes/versions are not combined; mood and practice do not alter employer pass rates. New-session context after reopening is deliberate. |
| 6. Reviewed experience and lightweight review | Candidate-to-story review with quoted provenance and update-existing option; card recall labels + card-to-drill; exact source handoff back to Your experience/learning. | FB-08/09. No auto-promotion, unsupported answer claims blocked or explicitly flagged, no card browsing counted as competence. Broader spaced-repetition or execution engines remain optional later scope. |

Suggested request shapes:

```ts
type PracticeBrief = {
  version: 1;
  mode: 'quick_drill' | 'full_mock' | 'sona_live' | 'study_cards' | 'technical_whiteboard';
  applicationId?: string;
  experienceSource?: { recordId: string; revisionId: string; contentHash: string };
  submittedResumeDocumentId?: string;
  selectedStoryRevisions: { storyId: string; revisionId: string; contentHash: string }[];
  focus?: { competencyId: string; instructions: string };
  origin?: { kind: 'feedback' | 'skill_challenge' | 'story_question'; recordId: string };
};

// Illustrative additions to existing sessions endpoints, not public commitments.
POST /api/interview/sessions
  { requestId, brief: PracticeBrief }
POST /api/interview/sessions/:id/answers
  { requestId, questionId, expectedRevision, content, modality }
POST /api/interview/session-grade
  { sessionId, answerAttemptIds, expectedInputHash, requestId }
POST /api/interview/sessions/:id/retry
  { requestId, parentAttemptId, action: 'revise_answer' | 'practice_focus', recommendationId? }
GET /api/interview/sessions?cursor=...&recordKind=practice&applicationId=...
```

The server resolves record ownership and source snapshots; clients do not assert factual verification. A saved assessment identifies exactly the source/answer/rubric version it assessed. For a full mock, use one session assessment over frozen eligible answer IDs plus per-answer feedback. For live, preserve transcript segment IDs and mark transcription uncertainty; do not infer pace without independently measured user-speaking time. For a card, review state belongs to a card ID, and an AI score is unnecessary.

## Test evidence and limits

Executed locally:

```sh
node --test scripts/practice-integrity.test.js scripts/practice-recovery.test.js scripts/interview-context.test.js scripts/learning-integrity.test.js scripts/application-debrief-route.test.js scripts/story-pagination.test.js
```

Result: **33 tests passed, zero failed/skipped**. The learning fixture logged a caught Twin invalidation `TypeError` because its fake database lacks `.set`; the passing run is not evidence that invalidation worked. The suite establishes mocked ownership, allowance reservation, retry leases, draft isolation, live-hook late callback cleanup, extraction/quality behavior, exact story access, plan versions and reflection idempotency. It does not test the actual interview React debrief/next-drill flow, provider score quality, grading semantic evidence, complete whiteboard reopen, deep progress comparisons, or real database concurrency.

Two additional bundled-route fixtures exercised FB-02 and FB-03 using current route source with mocked guard/provider/database and no remote requests. They confirmed HTTP 200 for out-of-range semantic question identity and inferred per-question confidence. The runnable fixtures are preserved in [feedback-probe.cjs](feedback-probe.cjs). Run from the repository root:

```sh
node docs/audits/interview-prep-2026/feedback-probe.cjs
```

Assertions are explicitly labeled **CURRENT DEFECT** and intentionally describe today's incorrect behavior; they should fail when the defects are repaired and then be replaced by regression tests for the corrected contract. Bundles compile in memory without output files. Neither fixture changes product code or stores user data. The report's remaining race/hydration findings are source traces requiring focused implementation tests, not claimed live reproductions.

Recommended acceptance coverage is scenario-based: the exact selected Experience versus submitted document; explicit versus absent self-confidence; valid answer ID with bad citation; incomplete/irrelevant/short correct answers; changed transcript after assessment request; delayed old assessment after revision; graded and ungraded reopen for every mode; a next-drill click observed in the resolved engine input; source story edited/deleted between session creation and grading; history beyond 50; and truthful non-promotion of hypothetical practice. Retain the passing current guards while adding these missing contracts.
