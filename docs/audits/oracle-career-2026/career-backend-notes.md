# Career Intelligence backend audit (read-only)

Repository: /home/xwingace/Documents/Projects/Taco-upgrade. No application edits, live accounts, credentials, providers, browser or deployment. Actual bundled helpers/routes executed with controlled Firestore/auth boundaries, not replaced scoring logic. Queries approximate orderBy field-existence/order/limit; no actual emulator in this pass. Ten controlled cases.

Reproduce:
- `node docs/audits/oracle-career-2026/career-intelligence-audit.cjs` — 7 actual graph/twin/recommendation cases, `/tmp/career-intelligence-audit-results.json`.
- `node docs/audits/oracle-career-2026/career-outcome-audit.cjs` — 3 actual outcomes GET cases, `/tmp/career-outcome-audit-results.json`.

## Priority findings

### P1: persistent stale truth with missing source invalidation (runtime + source)
`lib/career-twin.ts:153-165,216-219` trusts any current-shape non-stale twin indefinitely; no computedAt age/TTL. Repro computes zero offers, updates source application to offer, rereads: zero offers, stale:false, only career_twin query. Source writers `app/api/applications/outcome/route.ts:308-343`, `app/api/applications/manual/route.ts:26`, `app/api/applications/offer/route.ts:24`, `app/api/agent/pulse/route.ts:181-189`, and resume save `lib/database-suite.ts:108-132` do not invalidate. Thus outcome/morale/resume changes can remain absent until another invalidating path or explicit POST refresh. `invalidateTwin` at204-212 silently swallows every error, not only missing-doc. Concurrent invalidation vs unconditional set at198 can also lose stale flag (race inferred, not runtime exercised).

Separate cache defect: `/api/agent/intelligence/route.ts:59-67` caches recommendations/summary by uid alone for5min. A correctly invalidated/recomputed twin can therefore be returned next to old recommendations/summary. Only explicit intelligence POST clears that process-local map; other writers' invalidateTwin doesn't. `cached:!twin.stale` at90 is also true for newly computed twins and does not report cache origin.

### P1: failed reads persisted as absent preferences and constraints (runtime)
`lib/career-twin.ts:380,443-447` swallows enrichment/memory read errors. Controlled failure of profile/main, jobPreferences, queue, applications produces successful persistent twin with stale:false, empty excludedCompanies/preferredCities, remotePreference:any, salaryMin:null, queue0/stale0. `computeAndPersistTwin:184-198` persists these values without degraded-source state; no TTL means transient outage can persist. This affects downstream prompt context and recommendations, not merely visual empty state. Core graph Promise.all DOES propagate failures correctly.

### P1: derived twin is writable by client owner (source-level rules evidence)
`firestore.rules:23` includes profile in mutable allowlist; generic owner-write match277-278 permits profile/career_twin. `getTwin` accepts shallow version5/background/behavioralBank/completeness/memory object shape (`lib/career-twin.ts:133-147,160-165`), trusts health/confirmedFacts/nextBestActions without recomputation. Owner can forge server-looking assessment/provenance or broken shapes. This is same-owner data-integrity issue, not cross-account access. No emulator run; exact allow path is present in source. Partition profile/main editable and career_twin server-only, preserve explicit user-supplied facts separately.

### P1/P2: disconnected evidence ingestion (runtime + exhaustive repository search)
`career-graph.ts:282-294` reads applications,debriefs,stories,morale,resumes,fit_analyses only. `skills.growing` is hardcoded[] at414. Controlled skill_verifications passed95 plus study_progress yields no growing/evidence and neither collection queried. Completed learning and authoritative assessed evidence cannot affect intelligence. `fit_analyses` search found reader plus rules but no producer in current repo. Oracle outputs matchedSkills/gapSkills (`app/api/oracle/analyze/route.ts:244-245`), keeps report in application-kit context (`app/suite/market-oracle/OracleContent.tsx:305-318,461+`); graph expects matchingSkills/missingSkills in separate collection (`career-graph.ts:398-405`). Current Oracle analyses thus do not establish fitAnalysisCount/gaps here. Historical/external producer is unknown; don't claim collection can never contain data.

### P2: empty debrief windows invent declining confidence (runtime)
`career-graph.ts:558-573`: two older debrief questions confidence80, two recent debriefs questions[] -> avgConfidence80 yet trend declining and high-priority confidence-declining recommendation. Each empty window divides0 by1 and becomes measured0. Round avg also invents50 for empty records (`583`), yielding65 rather than80. Debrief POST legitimately permits empty questions. Require actual scored evidence in both windows; use nullable unavailable stats. Default stable with <4 records likewise isn't measured stability.

### P2: Outcomes tab uses incompatible denominator, history and schema (3 route runtime cases)
`app/api/applications/outcome/route.ts:99-112` only applied_at/created_at, so old appliedAt Jan1 camel record is omitted from pending. At126 every status other than not_applied counts applied: saved-only record yields totalApplied1 and0% response instead of unknown. At127-158 only current outcome counts stages: interview→rejection history yields interviewCount0/rate0 although graph counts reachedInterview. Graph canonical application reader/ever-stage helpers do not share this endpoint's semantics. Graph's no-reply rate and outcome endpoint's explicit ghosted/reported rate also differ; UI needs distinct labels if retained.

### P2: truncated records presented as totals/coverage (runtime + source)
`career-graph.ts:285-293` silently limits debriefs100,stories100,resumes5,fit50. Controlled101 stories, oldest only leadership-tag story -> totalStories100, leadership uncovered. Placeholder action/result with teamwork tags yields covered teamwork8%; no reviewed/complete evidence test (`career-twin.ts:387-405`). Twin queue max20/apps max50 (`446-447`) likewise emits exact-sounding count recommendations, and unordered application sample can miss stale follow-ups. Application graph's canonical reader DOES reject incomplete result, good precedent. Expose sample/window/count meaning or paginate all relevant rows. Story source paths exist, but aggregate drops record IDs and evidence provenance.

### P2: days-to-response measures latest event rather than first reply (runtime)
`career-graph.ts:459-463`: appliedSep1, callbackSep2, rejectionSep21 -> avgDaysToResponse20, not1. Outcome writer overwrites outcome_reported_at on each event. Graph ignores earliest positive/rejection history. Same-day replies also excluded by days>0, and120+day replies excluded without reported sample boundary. Distinguish first-response date from last outcome.

### P2: recommendation claims exceed measured source (runtime + source)
One fit analysis with missing rust/python/sql produces "These appear frequently in postings" (`career-recommendations.ts:101`), though count1 and no frequency calculation. Interview confidence recommendation asserts "highest ROI" at117 and rising confidence says "your practice is paying off" at211 without measured intervention/outcome linkage. "confirmedFacts.skills" are latest resume self-claims, not skill assessment; names imply stronger provenance than computation (`career-graph.ts:364-374`,twin:495+). Health/completeness and burnout-risk fields are hand-weighted heuristics, not validated probabilities/diagnosis; synthetic tests cannot establish calibration or job outcome lift.

## Strengths retained
- API authenticated uid owner scoping; no request-provided owner in intelligence.
- Canonical mixed-schema application reader feeds graph; incomplete app history raises rather than silently emptying.
- Distinguishes tracked vs sent; preserves reached interview/offer history; nullable no-denominator conversion; measured-item denominators.
- No-morale check-in stays null; no resolved debrief outcome exported as pass-rate null; no-question average exported null.
- Core data read errors fail the graph rather than overwriting cache with empty graph.
- Outcome POST has owner-scoped transactional history/calibration updates and transition/idempotency checks (source inspection only this pass; earlier tests separate).
- Explicit external-action review constraint stays true even in default memory.

## Remaining unknowns / verification boundaries
No statistical accuracy or causal impact evaluation exists in these tests; no live data/AI response quality, concurrency race stress, actual emulator security test, network retries, production indexes or browser render verified in this pass. Non-application mixed schema (Timestamp objects, old resume/debrief timestamp aliases) is not normalized consistently but not exercised here. External fit_analyses writers may exist outside repo. Product telemetry measures usage elsewhere; these engines contain no calibration against eventual job success or recommendation attribution. Root/sibling cover UI, Oracle and competitor review.
