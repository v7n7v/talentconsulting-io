# Search, applications, and career intelligence audit

Audit date: 2026-09-28. Repository: `Taco-upgrade`, base commit `806ac3c0`, current working tree. Scope: source inspection only; no application edits, provider calls, authenticated production reads, or browser inspection by this reviewer. Citations are current repository-relative paths and one-based lines. Existing tests were inspected, **not rerun**. A working handler or test assertion is evidence of implementation, not evidence that a live provider, email delivery, or production persistence worked today.

Priority definitions: **P1** materially misleading outcomes, incorrect source binding, or core state corruption that should block the affected workflow's release; **P2** recoverability, usability, or maintainability gaps that should be addressed in the upgrade. Product recommendations are labeled separately from source-proven defects.

## Disposition inventory

| Surface | User purpose and relevance | Current implementation that is worth preserving | Recommendation |
|---|---|---|---|
| Find roles `/suite/job-search` | Find plausible jobs, understand fit and source, save/skip, prepare a packet. Core journey. | Authenticated selected-source scoring, server-owned resume evidence, stable job identity, per-account storage, stale-request suppression, provider recovery, eligibility gate, incomplete packet handling. | **Keep and improve** as the single role-discovery workspace. Reuse its packet/source contract elsewhere. |
| Preferences and Career Picks | Save role/location/work-style preferences and choose recurring email/agent activity. Highly relevant; settings should not become a second search product. | Per-user server persistence, explicit email/digest consent and provider-pause recovery, server tier normalization, delivery-state wording. | **Keep within Find roles.** Separate search preferences from recurring work controls using progressive disclosure. |
| Legacy Weekly Picks components | Older in-page suggestions and packet panel. No import/use found in current `app` or `components`; these are dormant definitions, not confirmed user-reachable tools. | Suggestions API still ranks by shared evidence, suppresses feedback/ledger matches, avoids caching partial searches. | **Retire the unused UI implementations after caller verification; preserve the API where active callers need it.** Do not reattach the old panel without contract migration. |
| Applications `/suite/applications` | Record external submission and outcomes; follow up, prepare interviews, review an offer. Core system of record. | Explicit manual submission, contextual actions, outcome confirmation/history, linked resume review, guarded application/linked-resume loads, offer details persisted on the application. | **Keep and improve.** Make this the owner of application state and associated actions. Add direct manual tracking. |
| Packet queue `/suite/agent/queue` | Review proactive agent drafts before creating an application tracker. Relevant for Max; overlaps Applications' prepared work. | Revision-bound server approval, verified source/draft inspection, Max check for approval/tracking, idempotent transaction, tracker remains `not_applied`, full document comparison, keyboard-managed drawer. | **Merge navigation into Applications → Needs review**, preserving queue storage and the server review boundary until a safe migration exists. |
| Offer planning `/suite/negotiate` | Evaluate and negotiate an actual offer. A contextual application task. | Already a compatibility page linking to Applications and the offer filter; actual Offer Coach lives in the application drawer. | **Keep merged into Applications; retire standalone-tool prominence.** Preserve old links. |
| Network `/suite/network` | Store professional contacts, log interactions, remember follow-ups, connect a contact to an application. Useful supporting tool. | User-scoped CRUD, allowlisted update fields, filters/views, application linking, real interaction log. | **Keep and simplify.** Default to due follow-ups + contact list; offer richer views secondarily. |
| Market Oracle `/suite/market-oracle` | Decide whether one role merits an application, understand requirements and proof gaps. Relevant capability, excessive overlap with Find roles. | Structured JD/resume analysis, source-quality labels, model fallback, requirements/proof actions, optional reduced-motion-aware map. | **Merge as Find roles → Role analysis.** Reuse confirmed source, selected role, and shared packet contract; keep old route as a compatibility entry. |
| Weekly Career Pulse `/suite/pulse` | Review the user's application progress and next actions. It is **not market data** despite “Market Pulse” shorthand. | Shared funnel predicates, null rates for absent denominator, signed-out/empty states, morale entry. | **Merge into Career Insights → Weekly review**, with a Home summary; retain compatibility link. It is already embedded in Insights. |
| Career Insights `/suite/intelligence` | Review career evidence, remembered context, recommendations and outcomes; export profile. Useful supporting summary. | Persistent career-twin computation, recommendation cache, export, evidence coverage, explicit outcome-fetch failure state. | **Keep and simplify** into evidence/context + application results. Expose provenance/edit destinations. |
| Analytics `/suite/analytics` | Legacy entry to insights. | Server redirect to `/suite/intelligence`. | **Keep compatibility redirect**, no separate tool to build. |
| Application results `/suite/agent/quality` | Understand application fit, tailoring, interview conversion and activity. Overlaps Insights/Pulse heavily. | Auth guard, server aggregation, clear metrics layout and absent-score display. | **Merge into Career Insights → Results after correcting metrics.** Retire the separate dashboard surface. |

## Source-proven findings and upgrades

### SP-01 — P1: New queue-derived trackers disappear from some career summaries

`app/api/agent/packet-review/route.ts:92` creates a tracker using `company_name`, `job_title`, `created_at`, `last_updated` and `not_applied`, with no camelCase timestamp/name aliases. `app/api/agent/pulse/route.ts:24` queries only documents ordered by `createdAt`. `app/api/agent/quality/route.ts:39` orders by `updatedAt`. Career Insights' shared reader at `lib/career-graph.ts:346` returns the `createdAt` query immediately when it contains anything, and only attempts the older-field fallback when that query is empty or errors (`:351–360`).

This is a **mixed-writer** problem, not a claim that every application lacks aliases: `lib/database-suite.ts:540–559` explicitly dual-writes names and timestamps for its create path. `lib/database-suite.ts:645–657` adds `updatedAt`/`appliedAt` on status changes but does not add `createdAt` or camelCase names. A queue-created tracker can therefore remain omitted from Pulse and mixed-data Insights after it is marked applied; Quality may pick it up after update but display an unknown company/role (`app/api/agent/quality/route.ts:63`).

**Upgrade:** define one normalized application record and one bounded/paginated reader used by Applications, Insights, Pulse and Results. Backfill older documents intentionally, or normalize a read that includes all supported schemas; do not rely on fallback only when the preferred query is empty. Future writer compatibility should be centralized rather than copied field aliases.

**Acceptance:** a fixture containing one manually created record, one apply-pipeline record, and one packet-queue record appears exactly once in all summaries; old snake_case-only records remain visible in the presence of newer dual-written records; names, dates, sent status and outcomes agree across pages. Test actual query behavior in the Firestore emulator because a mock returning every document for `orderBy` would miss this.

### SP-02 — P1: Application Quality computes incorrect status and tailoring metrics

`app/api/agent/quality/route.ts:46–59` recognizes only `Applied`, `Interviewing`, `Offer`, `Rejected`, whereas canonical statuses are lowercase and include `screening`, `interview_scheduled`, `interviewed`, and `accepted` (`lib/database-suite.ts:458`). The endpoint counts current interviewing/offer buckets as “reached interviewing or beyond” (`quality/route.ts:73–77`), losing a past interview after rejection and excluding accepted offers. It also counts every scored queue record as “tailored,” then divides that independent queue count by application-plus-queue counts (`:79–104`). A fit score is not proof of a tailored submitted application. Draft applications are included in the denominator `appsSnap.size`.

**Upgrade:** use shared event/outcome predicates and one explicit cohort: submitted applications in a stated date window. Separate “fit assessed,” “tailored packet prepared,” “submitted,” and “reached interview” metrics. Join queue artifacts to applications by canonical IDs rather than unrelated totals. Report sample size, date window, unmeasured values and truncated-data warnings.

**Acceptance:** lowercase status coverage includes all canonical states; a rejected-after-interview record still counts as reaching interview; drafts do not depress submission conversion; five unsubmitted queue drafts do not alter the tailoring rate of one submitted application; accepted offers count in both reached-interview and reached-offer metrics. No percentage exceeds its meaningful denominator.

### SP-03 — P1: Oracle labels incomplete packets as ready

Oracle accepts any successful HTTP response, sets packet status to ready, and toasts “Application packet ready for review” (`app/suite/market-oracle/page.tsx:475–488`). The server deliberately returns HTTP 200 with `success: true` and `packetStatus: 'needs_attention'` when only part of a packet succeeds (`app/api/agent/apply-pipeline/route.ts:603–629`); its idempotent response has the same distinction (`:122–145`). Find roles already checks ready status, IDs, letter content and finite ATS score and exposes specific recovery (`app/suite/job-search/page.tsx:2356–2407`).

**Upgrade:** extract one typed packet-result reader/hook used by every entry point. Render partial saved work, missing artifacts, warnings and retry action; readiness must follow the persisted packet contract. Disable duplicate clicks while work is active.

**Acceptance:** an HTTP 200 `needs_attention` result never produces a ready state; missing letter/resume/score each produces correct recovery; a 403 identifies Max entitlement and preserves inputs; a duplicate or interrupted request returns the same tracker without claiming submission.

### SP-04 — P1: Oracle analysis and packet generation can use different resume sources

Uploading or pasting in Oracle clears `selectedResumeId` while retaining the analyzed resume text (`app/suite/market-oracle/page.tsx:309–315`, `:614–619`). Its preparation request sends the ID but not the analyzed text or a confirmed source binding (`:457–469`). With a null ID the server chooses the latest verified saved resume (`app/api/agent/apply-pipeline/route.ts:266–272`); it correctly refuses if none exists (`:273–280`). Thus the server safety check prevents an unverified upload from becoming a packet source, but the UI can silently prepare from a different existing source than the one the user just analyzed. The market lookup likewise does not send `x-talent-resume-id` (`market-oracle/page.tsx:322–333`), unlike Find roles (`job-search/page.tsx:2216–2218`).

**Upgrade:** before packet preparation, require the same confirmed source ID/hash used for analysis. Imported text should enter the shared source-confirmation flow; no silent fallback. Bind the report to the JD hash and source hash; editing either marks it stale. The market lookup must use the same selected source or explicitly label unscored results.

**Acceptance:** saved source A plus uploaded text B cannot produce a packet from A without an explicit source choice; a generated resume cannot be mistaken for a confirmed source; source/JD changes invalidate the report and preparation affordance; all fit scores state which source was assessed.

### SP-05 — P1: Offer Coach presents unsupported compensation benchmarks

Offer Coach's model prompt requests a `marketRange`, below/at/above-market verdict and mandatory recommendation to negotiate (`app/api/agent/negotiate/route.ts:157–192`). The only preceding data retrieval is the user's application and resume (`:105–153`); no benchmark source or market dataset is retrieved. The UI renders the verdict and Low/Mid/High dollar values without source, date, location or estimation label (`app/suite/applications/page.tsx:2633–2647`). Inputs lack currency and pay period (`:2580–2585`; `lib/database-suite.ts:498–509`). This matters because the output can directly influence a compensation decision.

Oracle does label salary as `ai_estimate` when appropriate (`lib/oracle-v2.ts:259`; `app/suite/market-oracle/page.tsx:912–916`), which is better. However, the backend still requests salary projections and interview yield from a model without labor-market/outcome data (`app/api/oracle/analyze/route.ts:146–160`), and deterministic interview yield is a weighted heuristic (`lib/oracle-v2.ts:260`), not measured probability.

**Upgrade:** make Offer Coach a structured comparison and negotiation-draft tool first. Use user-entered or verifiably sourced benchmarks with source URL/date/role/region/currency/period; otherwise state “benchmark unavailable” and omit market verdicts. Discuss preferences and alternatives rather than always prescribing negotiation. Label model-generated qualitative assessments as estimates; rename heuristic “interview yield” to an explainable readiness/priority assessment unless calibrated outcome evidence supports the term.

**Acceptance:** absent benchmark evidence produces no fabricated range or at-market label; compensation calculations normalize currency/pay period and distinguish cash/equity/sign-on; generated text cites only supplied evidence; tests with zero benchmark data cannot emit claimed market percentages; no invented probability appears under “yield.”

### SP-06 — P2: Several data failures look like no data or a successful save

Quality catches aggregation failure and returns HTTP 200 with an all-zero payload (`app/api/agent/quality/route.ts:130–137`), causing its “No application data yet” state (`app/suite/agent/quality/page.tsx:295–308`). Its client also ignores non-OK responses and catches silently (`:102–114`). Pulse similarly swallows GET failures and falls back to empty data (`app/suite/pulse/PulseContent.tsx:62–70`, `:100–104`); morale selection is updated before POST and the response status is never checked (`:74–84`). Insights handles outcome failure explicitly, but its main profile request ignores non-OK responses and lacks equivalent failure state (`app/suite/intelligence/page.tsx:520–534`).

**Upgrade:** standard load states—initial/loading/success/empty/stale/error—plus useful retry. Keep last known good data visibly stale instead of clearing or representing failed reads as zero. Morale changes should confirm persistence or restore/retry a failed selection.

**Acceptance:** 401, 403, 429, 500, malformed payload and offline scenarios cannot show “no records” as an assertion; retry preserves context; rejected morale writes visibly fail and do not imply saved state; loading does not flash zero metrics.

### SP-07 — P2: Pulse timing uses creation dates where submission dates are needed

Pulse counts this week's records from `createdAt` (`app/api/agent/pulse/route.ts:31`), dates active search from record creation (`:50`), and computes stale/follow-up windows from `createdAt` (`:72–96`). An application drafted weeks before submission can be called stale immediately after it is sent. Upcoming interview dates fall back to update/create timestamps (`:118–122`) even if no interview date is known. The input model has explicit `applied_at` and `interview_date` (`lib/database-suite.ts:460–462`).

**Upgrade:** separate “prepared this week” from “submitted this week.” Calculate response/follow-up timing from actual submission; preserve unknown date explicitly. Show an interview awaiting scheduling when no scheduled date exists rather than rendering the record's update date as interview time.

**Acceptance:** a 40-day-old draft submitted yesterday is neither stale nor follow-up-due; resuming a saved draft does not change historical submission date; a scheduled-status record with no interview date says “date needed”; a past interview is not included as upcoming.

### SP-08 — P2: A failed Network interaction save discards the typed note

`logInteraction` catches errors and returns normally (`app/suite/network/page.tsx:571–607`). The drawer awaits it and unconditionally clears interaction type, note and follow-up date (`:1099–1104`). A network/server error therefore removes the unsaved text, forcing re-entry. CRUD is user-scoped and update fields are allowlisted (`app/api/agent/network/route.ts:10–25`, `:70–117`), which should remain.

Other bounded issues: GET is capped at 100 contacts without a pagination contract (`network/route.ts:47–52`), though the UI calls the count “Total contacts” (`network/page.tsx:644`); relationship strength is a locally invented points formula (`:279–285`) displayed as a measured `/5` score (`:646–654`). Contact deletion is immediate from the page handler (`:551–568`) with no undo in that handler. The drawer has `role="dialog"` but lacks the focus containment/Escape handling found in the queue drawer (`network/page.tsx:1108–1120` versus `agent/queue/page.tsx:1164–1196`). These are source observations, not a completed keyboard usability test.

**Upgrade:** propagate success/failure and clear fields only after confirmed save. Add pagination/search appropriate to contact counts; replace strength score with explicit facts such as last interaction and follow-up date. Use the shared accessible dialog, add deletion confirmation or reversible undo, validate dates/contact links, and retain names/notes after every failure.

**Acceptance:** POST 500 preserves the exact note; a successful retry stores it once; the 101st contact remains discoverable and totals are honest; Tab stays within an open modal, Escape closes and focus returns; deleting a contact has a recoverable path; no unexplained numeric relationship score is presented as measured.

### SP-09 — P2: Async action ownership is weaker than the core Applications load guard

Applications correctly guards list and linked-resume loads with request/account lifecycle state (`app/suite/applications/page.tsx:378–397`, `:547–563`). But follow-up and interview-prep completions write their results into global drawer state without checking which application/account is still active (`:686–735`). A user opening application B while A's request finishes can see A's draft/prep in the current UI. Queue load and actions likewise lack the UI generation/account checks around `setItems`, `setSelected`, and subsequent `load()` (`app/suite/agent/queue/page.tsx:1624–1644`, `:1769–1836`). Its database helper does check owner after reads (`lib/database-suite.ts:1024`), but the page's completion handling is less comprehensive than Applications. Network has no cancellation/owner check in `loadData` (`network/page.tsx:364–390`).

Insights' outcomes are retained across owner changes: the signed-out path resets profile/twin/recommendations but not `outcomeStats` (`intelligence/page.tsx:509–517`), and loading outcomes is gated on `!outcomeStats` (`:581–601`). Quality does not clear existing metrics on sign-out, and its populated render branch is gated by metrics/count rather than current user (`quality/page.tsx:93–100`, `:175`). These are source-supported stale-client-state risks, not an observed server authorization bypass.

**Upgrade:** share an owner/request-generation guard for queries and mutations; key action results by application ID and input revision. Invalidate all user-scoped state synchronously on owner change, and ignore stale completions without erasing work belonging to the new context.

**Acceptance:** start A's follow-up/prep, select B, complete A: B never receives A's result; switch user during each load/mutation and no former user's data renders; sign out clears results; aborted requests do not toast success; use controlled deferred promises rather than only string-presence tests.

### SP-10 — P2: Offer finalization can leave contradictory states

`handleNegotiationStatus` first saves negotiation status, then independently updates application status; failure of the second write is ignored while a success toast still reports “Offer marked accepted/declined” (`app/suite/applications/page.tsx:849–864`). That can persist `negotiation_status: accepted` with `status: offer`. Separately, generating a brief proceeds after a failed initial detail save (`:800–802`), although it eventually checks the final brief save. This can spend a provider call before a known persistence issue is resolved.

**Upgrade:** implement terminal offer decisions as a single authenticated server transaction updating both fields plus an event; make retries idempotent. Stop or explicitly recover generation when required input persistence fails. Server-validate positive numeric values and typed application ownership.

**Acceptance:** injected write failure cannot leave mixed terminal states or success copy; double-click acceptance creates one event; failed detail save does not call the generator; saved brief identifies the exact offer revision it used.

### SP-11 — P2 product gap: Tracking a job found elsewhere is not a first-class path

The Applications empty state sends users to resume preparation or Ask Taco (`app/suite/applications/page.tsx:1240–1267`) and describes creation from Resume Studio/Job Search/Queue. There is no direct `createJobApplication` call or Add application form in this page. A new user who has already applied elsewhere must learn a generation/assistant pathway before recording that application. This is a source-backed missing affordance and a product recommendation; no usability study was conducted.

**Upgrade:** add “Track an application” with company, role, posting URL, actual sent status/date and optional resume link. Saving a manually submitted application must not require generation or Max. Progressive fields can be added in the dossier afterward. Let a user intentionally create an unsent saved role as a separate choice.

**Acceptance:** from an empty Applications page, a keyboard user can add an already-submitted role with only company/role/date; it enters the correct cohort and can progress to interview/offer; no provider call or fabricated resume is required; duplicate URL/application warning preserves user intent.

### SP-12 — P2 maintainability/IA: Similar tools are drifting onto different contracts

Pulse is already embedded in Insights (`app/suite/intelligence/page.tsx:27`, `:699`); Analytics redirects there (`app/suite/analytics/page.tsx:3–4`). Negotiation already moved into Applications (`app/suite/negotiate/page.tsx:4–39`). In contrast, Oracle still implements an independent packet client, and two unreferenced weekly components still contain older pipeline behavior (`app/suite/job-search/WeeklyPickApplyPanel.tsx:164–191`, `:279`; `WeeklyPicksSection.tsx:100`). The dormant panel says Standard unlocks packets (`WeeklyPickApplyPanel.tsx:184`) while the actual policy is Max (`lib/assistant/workload-policy.ts:6–8`). Because no caller was found in `app`/`components`, this is dead-code drift, not an asserted current UX defect.

**Upgrade:** converge around user jobs: Find roles → role analysis; Applications → Needs review/Submitted/Interviews/Offers; Career Insights → Evidence/Results/Weekly review; Network remains secondary. Reuse the best source/packet/recovery implementations instead of restyling each duplicate. Preserve old URLs through redirects or clear compatibility entry points.

**Acceptance:** one shared preparation client handles all active entry points; entitlement copy comes from shared policy; no unused legacy panel can be accidentally reintroduced by an import; every old route leads to the matching contextual destination, not merely the homepage; tool inventory and navigation count agree.

## Recommended upgrade sequence for this domain

1. **Trust and data contract first:** normalize applications and timestamps; correct metric cohorts/statuses; add explicit failed/stale states; share source/packet result contracts with Oracle; remove unsourced compensation certainty. These fixes should precede promotional screenshots or validation against production data.
2. **Complete the application loop:** manual tracking, owned async actions, atomic offer decisions, durable/retryable Network notes. Keep external submission explicitly user-controlled.
3. **Reduce competing destinations:** move queue review and offers under Applications; move role analysis under Find roles; consolidate Pulse/Results/Analytics within Career Insights. Preserve links before removing old menus/components.
4. **Make context visible:** selected confirmed resume, selected role, input/report revision, benchmark provenance, measurement window, and a single suggested next action. Advanced map/views should be optional.
5. **Validate the actual journey:** controlled free/Standard/Max users; empty/partial/mixed-schema account fixtures; slow/error/account-switch cases; desktop/mobile keyboard flows; then isolated staging provider/email checks with fixture data and documented expected outcomes.

## Existing test evidence and missing coverage

Read test implementations: `scripts/packet-review-route.test.js:102–128` exercises transactional/idempotent tracking and tier/ownership behavior; `scripts/applications-lifecycle.test.js:29–45` covers list/resume lifecycle and a runtime guard; `scripts/job-search-resume-source.test.js:53–82` covers source selection; `scripts/job-search-mobile-review.test.js:37–95` includes preparation gating/identity/disclosure assertions; `scripts/job-search-recovery.test.js:26` covers recovery classification. These are useful foundations. **This audit did not rerun them and makes no new pass claim.**

Priority gaps: mixed-field Firestore queries across all application writers; actual canonical status funnel fixtures; Oracle's partial-success response and source mismatch; delayed per-application actions and account changes; failed Network note preservation; offer transaction failure; source-free compensation output; user-understandable manual tracking. Browser behavior, assistive-technology operation, provider quality, production indexes and email delivery remain unverified by this source audit.
