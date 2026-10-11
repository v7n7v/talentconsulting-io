# Market Oracle and Career Intelligence review

Implementation follow-up: the local reliability and editing changes are recorded in [the September 28 implementation report](humanizer-oracle-career-implementation.md). The findings below describe the pre-fix review; live benchmark and staging work remain separate.

Reviewed September 28, 2026, on `codex/taco-upgrade`. This is a review and proposed upgrade sequence; application code was not changed.

## Assessment

Both capabilities are worth keeping. Oracle should answer **“Is this particular role worth pursuing, and what evidence do I need?”** Career Intelligence should answer **“What is happening across my search, and what should I do next?”** The current implementation has useful foundations, but neither should yet be presented as a dependable market intelligence engine.

The largest problem is disconnected and inconsistent evidence, not a shortage of screens. Current Oracle reports do not populate the collection used by Career Intelligence for role-derived skills. Career summaries can stay stale indefinitely, and adjacent analytics views use different definitions. Some Oracle conclusions look more authoritative than their supporting evidence permits.

## Scope and verification

- Read the Oracle route, report builder, frontend and map; Career Graph/Twin/recommendations; intelligence, analytics, results, pulse and outcomes paths.
- Executed the actual bundled Oracle helpers/route, graph/twin/recommendation logic and Outcomes GET with controlled local dependency boundaries. No live providers, accounts or production writes.
- Ran two loaded-component reproductions showing Analytics' false empty state and 200% conversion rate.
- Inspected the local fictional preview: Role analysis inputs, Career Intelligence Overview, Analytics and Application results. This verifies rendering and navigation, not model output quality or production persistence.
- Reviewed current first-party competitor documentation. Their feature descriptions establish available workflows, not independent evidence of hiring effectiveness.

Reproduction scripts and captured results are in [the audit folder](audits/oracle-career-2026/README.md). A passed audit reproduction means the described defect was observed; it does not mean the product behavior is correct. The Firestore rules finding below is source-confirmed, not emulator-tested in this review.

## How the two tools currently connect

| Capability | Present role | Evidence actually used | Main limitation |
| --- | --- | --- | --- |
| Market Oracle / Role analysis | Compare a resume and one posting; suggest a decision, proof gaps and preparation | Selected owned resume or pasted text, job description, model output, heuristic parsing; a separate related-jobs search | No broad market or salary dataset supports the main decision; some claims are ungrounded |
| Career Intelligence / Career insights | Summarize search activity, stories, interview debriefs, resume skills and wellbeing check-ins | Personal account records, derived Career Twin memory, deterministic recommendations | Freshness and ingestion gaps; overlapping views disagree |

Actual Oracle flow: inputs → model analysis → report → Application Kit state and, if tracked, an application's `gap_analysis`. `career-graph.ts:292,398–405` instead reads `fit_analyses` with `matchingSkills`/`missingSkills`. No current writer for that collection was found in this repository. An external or historical producer may exist, but the present Oracle path does not establish this handoff. Learning assessments and study progress are also absent from graph ingestion; `skills.growing` is always empty.

The intended loop should be: **confirmed experience → role analysis → reviewed application → recorded outcome → career insights → next action**, with a stable analysis/application ID and evidence references at each step. A single analyzed posting should be described as a requirement in that posting, not evidence of general market demand.

## Findings that should block stronger claims or a broad release

### 1. Oracle can return contradictory or fabricated conclusions — P1

The secondary schema validates shape, not support for a claim. A controlled route response returned HTTP 200 with `apply`, high confidence, fit/readiness zero and risk 100. It also accepted “Current active security clearance” as covered when the source explicitly said no clearance. The report builder trusts the model verdict independently of the numeric decision fields.

Evidence: `app/api/oracle/analyze/route.ts:78`; `lib/oracle-v2.ts:257`. Reproduction: `contradictoryProvider` in the Oracle results JSON.

Fix direction: model findings must point to exact source spans and declare whether they are stated, inferred or unknown. Validate evidence and contradictions before rendering a verdict. Source identity hashes are necessary, but do not prove the truth of claims about that source.

### 2. Oracle silently analyzes truncated evidence — P1

The first prompt receives at most 4,000 resume characters and 3,000 posting characters; secondary validation receives 2,000 and 1,500. Crucial tail evidence disappeared from both prompts in the controlled case, yet the report labeled the posting `full_jd` and displayed the full input lengths.

Evidence: `app/api/oracle/analyze/route.ts:143` and secondary prompt construction. Reproduction: `truncation`.

Fix direction: process all supplied requirements through bounded extraction/chunking, or explicitly return partial coverage and the omitted range. Never call truncated analysis complete.

### 3. A requirement can be both covered and missing — P1

Resume Python + posting “Python required” + matched Python + explicitly empty missing requirements produced Python in both lists. The fallback treats an empty array as absent and then copies every legacy JD requirement into the missing list.

Evidence: `lib/oracle-v2.ts:262`; reproduction `requirements`.

Fix direction: preserve meaningful empty arrays and derive mutually exclusive requirement states from one requirement ledger: supported, partial, not evidenced, needs clarification.

### 4. Career summaries can remain stale indefinitely — P1

The persistent Twin has no age limit. A controlled test computed zero offers, changed the application source to an offer, then retrieved zero offers with `stale:false`; only the cached Twin was read. Several application, resume and morale writers do not invalidate it. The separate five-minute recommendation cache is keyed only by user, so even a recomputed Twin can appear beside recommendations based on its predecessor.

Evidence: `lib/career-twin.ts:153–165,198–219`; `app/api/agent/intelligence/route.ts:59–67`; writer references and reproduction in [backend notes](audits/oracle-career-2026/career-backend-notes.md).

Fix direction: version the underlying evidence, invalidate after successful writes, key recommendations to that version, and expose computation time and degraded sources. Add a bounded freshness fallback; a refresh must actually refresh all related data.

### 5. Failed memory reads become fresh empty constraints — P1

Profile, preference, queue and application enrichment failures can be swallowed and persisted as a successful Twin: no excluded companies, remote preference “any,” no salary floor and zero queue entries. Core graph failures correctly propagate; the enrichment layer does not.

Evidence: `lib/career-twin.ts:380,443–447`; controlled `optional read outages persisted as known defaults` case.

Fix direction: retain the last known constraints and mark failed sources unavailable. An outage must never rewrite “unknown right now” as a confirmed empty preference.

### 6. Derived Twin data is client-writable — P1, source-confirmed

The generic owner-write rule includes the `profile` collection, covering `profile/career_twin`. The reader checks a shallow shape/version and trusts the stored derived assessment. This is a same-owner integrity issue, not evidence of cross-account access.

Evidence: `firestore.rules:23,277–278`; `lib/career-twin.ts:133–165`.

Fix direction: separate user-editable profile facts from server-derived memory and scores. Add emulator tests proving that owners can edit permitted profile fields but cannot forge the derived Twin.

### 7. Analytics is broken and uses invalid conversion math — P1

The tab fetches `/api/agent/applications`, for which no route or rewrite exists in this checkout. Its error handler is empty, so failure becomes “No Pipeline Data Yet.” The local preview displayed that state beside Application results showing three submitted applications; the isolated preview blocks external services, so the nonexistent route is separately established by repository inspection.

Even with a successful fixture, Analytics divides progressed applications by only the records currently marked `applied`. One applied plus two interviewing produces 200%. Draft creation also counts toward application velocity.

Evidence: `app/suite/analytics/AnalyticsContent.tsx:49,73,91,188`; both loaded-component reproductions.

Fix direction: consolidate into Application results using the canonical application reader and milestone definitions. Keep error, empty, loading and partial states distinct. Do not repair a redundant dashboard while preserving contradictory formulas.

### 8. Oracle labels the inverse of risk as “Risk” — P1

Actual risk 20 displays a green “Risk 80” because the UI renders `100 - riskScore`. A user can reasonably read this in the opposite direction.

Evidence: `app/suite/market-oracle/OracleContent.tsx:135,858`.

Fix direction: display actual risk with an explicit explanation and appropriate color direction; prefer concrete blockers and questions over an opaque aggregate.

## Other material correctness and usability gaps

| Finding | Evidence / reproduction | Recommended change |
| --- | --- | --- |
| Salary parser treats “Serve 100–200k customers” as pay, while missing ordinary comma-separated, hourly and GBP ranges | `oracle-v2.ts:158`; Oracle salary fixtures | Parse compensation context, currency, period and source span; preserve unknown |
| Substring skills and negations become positive evidence | `oracle-v2.ts:168`; “Maintained restaurant schedules. No Python experience.” produces Python, AI, REST | Token/context-aware extraction and positive-evidence validation |
| Company inference matches `at` inside words | `oracle-v2.ts:154`; “Located in Boston” → “ed in Boston.” | Explicit company input or cited named entity; no invented tracker company |
| Any year count plus a short resume becomes an experience warning | `oracle-v2.ts:194`; equipment warranty “5 years” becomes a candidate requirement | Extract actual requirements and compare stated relevant experience |
| Factor scores and confidence use unsupported proxies | `oracle-v2.ts:258+`; location present → 82, salary parsed → 86, confidence from text length | Show eligibility/coverage evidence rather than fabricated precision |
| Risk list truncation can drop serious findings | `oracle-v2.ts:253`; source inspection | Deduplicate and prioritize by severity before limiting display |
| Outcomes disagrees with canonical application metrics | `applications/outcome/route.ts:99–158`; saved-only counted sent, camel-case date omitted, interview history erased after rejection | Share the same normalizer, sent cohort and historical milestones across all views |
| Empty recent debriefs manufacture declining confidence | `career-graph.ts:558–583`; older confidence 80 followed by empty questions triggers decline | Require scored evidence in both windows and show insufficient data otherwise |
| “Days to response” uses the latest outcome date | `career-graph.ts:459–463`; Sep 1 apply, Sep 2 callback, Sep 21 rejection → 20 days | Use the earliest recorded response; disclose sample and exclusions |
| Bounded queries are presented as total coverage | `career-graph.ts:285–293`; 101 stories becomes 100 and omits the only leadership story | Paginate, or label sampled windows/count limits |
| Placeholder stories and self-listed skills receive stronger labels than their provenance supports | `career-twin.ts:387–405,495+`; placeholder tagged story counts as coverage | Distinguish listed, reviewed and assessed evidence; require meaningful story content |
| One analyzed posting supports “frequently in postings” | `career-recommendations.ts:101`; one-analysis fixture | Show frequency, denominator and scope, or say “in a role you analyzed” |
| Returning from Discover loses Oracle context | `OracleContent.tsx:294–318`; source-traced omission of location, salary target, URL and result restoration | Restore complete input/report snapshot with freshness checks |
| Optional market search delays the primary report | `OracleContent.tsx:450,1057`; source trace | Publish the decision first, then load related roles independently; separate errors from zero matches |
| Map cannot retain selection or open a job | `OracleContent.tsx:1067`; `Scene.tsx:114,173` | Use a sortable accessible list with posting links; make any map supplementary; preserve currency |
| Outcomes can conceal refresh failure behind stale data; Weekly check-in does not refresh Overview | `intelligence/page.tsx:521,600,729`; `pulse/PulseContent.tsx:40` | Shared versioned refresh and explicit stale-data notice |
| Selected control state is visual-only | Oracle modes/presets/result tabs; intelligence tab strip | Correct tab/button semantics, keyboard behavior and selected-state announcements |

## Design and product direction

The paper background, restrained red accents, dark sidebar and folded-A brand carry through well. Keep that foundation. The main usability weakness is hierarchy: many boxes explain the system before the user reaches a useful decision.

In the desktop preview, Oracle shows repeated readiness checklists, an empty decision brief and six result tabs before producing a result. The lower readiness column extends into the adjacent panel at the inspected viewport. The input summary says “Source Ready” while also saying the resume is not loaded. These states need clearer conditions and a responsive layout check.

Career Intelligence places health and score breakdown panels above actionable work. “Career Twin memory,” “Smart Recommendations,” “Next best actions,” Analytics, Outcomes and Application results create competing explanations. The preview's separate fictional Overview and Results fixtures also show different interview/offer totals; that is a fixture consistency issue, not an independent production backend finding.

Recommended structure:

1. **Find roles → Role analysis:** resume + posting → recommendation with cited reasons → supported requirements, gaps and questions → prepare or save. Optional market context follows the decision. Keep the Oracle name only if desired as a secondary brand.
2. **Career insights → Overview:** up to three record-specific next actions, what changed since the last review, and clearly dated evidence. Move detailed memory and score explanations behind disclosure.
3. **Career insights → Results:** one set of submission, response, interview and offer definitions; drill into the supporting applications. Fold useful Outcomes/Analytics content here.
4. **Career insights → Weekly review:** follow-ups, upcoming interviews and an optional check-in. Actions open the relevant application or practice context directly.
5. **Evidence details:** explain listed versus reviewed versus assessed skills, source dates and missing connections. Do not equate personal activity with external market demand.

## Comparison with tools available in 2026

| First-party documented capability | What Taco should learn from it |
| --- | --- |
| LinkedIn Career insights combines career goals with recent hiring activity, relevant network connections and learning recommendations. Some access is Premium. [LinkedIn documentation](https://www.linkedin.com/help/linkedin/answer/a6219289) | Actual market context needs dated external evidence and a stated population. Taco currently has personal search intelligence, not comparable market coverage. |
| Jobscan's match report exposes skill occurrences, their posting context and a way to exclude an irrelevant skill. [Jobscan walkthrough](https://www.jobscan.co/video-resume-match-report) | A score needs inspectable reasons and a correction path. Taco's source-linked requirement ledger could become stronger than another opaque percentage. |
| Teal connects job stages with notes, follow-up dates, the resume used, interview preparation and stage-specific actions. [Teal tracking guide](https://help.tealhq.com/en/articles/14435727-how-to-track-your-job-applications) | Reliable continuity from saved role to outcome is a practical baseline. Taco should preserve IDs and evidence across tools before adding more dashboards. |

These are feature/workflow comparisons, not a benchmark of accuracy or hiring results. No competitor marketing claim is treated as proof of efficacy. Taco's opportunity is a coherent evidence-led workflow across resume, role, packet and interview work; that advantage remains conditional on fixing the connections described above.

## Proposed upgrade order and acceptance criteria

### Pass 1 — Make decisions and metrics trustworthy

- Ground Oracle findings in complete analyzed evidence; reject contradictions; repair missing/covered classification, risk direction and parsers.
- Protect derived Twin data, preserve unavailable constraints, and implement versioned invalidation and freshness.
- Consolidate Analytics/Outcomes into canonical metrics; retain historic milestones and correct first-response timing.
- Accept when the supplied counterexamples no longer produce false claims, every ratio has a valid cohort, failed reads stay visibly failed, and owner access rules protect derived records.

### Pass 2 — Connect the evidence loop

- Persist one owner-scoped role-analysis record with stable ID, schema version, resume hash, posting snapshot, requirement evidence and creation time.
- Reference that record from applications; ingest its requirements into career summaries with clear personal-sample labels.
- Connect reviewed stories, assessed skills, study progress and recorded outcomes without relabeling self-claims as verified ability.
- Accept when analyzing a role, changing an outcome, saving a resume or recording a check-in reliably updates the relevant summary and recommendations with traceable sources.

### Pass 3 — Simplify the experience

- Make Role analysis a focused compare-and-prepare flow and Career insights an action-led overview, Results and Weekly review.
- Restore complete work across navigation, separate optional search loading, replace the unusable map with accessible role results, and repair responsive/selected-state behavior.
- Accept when a keyboard/mobile user can analyze → inspect evidence → save/prepare → record outcome → understand the next action without losing context or seeing conflicting counts.

### Pass 4 — Add defensible external market context

- Select licensed or appropriately permitted sources for role demand and compensation; attach geography, currency, period, sample size, freshness and source links.
- Keep observed data, model interpretation and unknowns separate. Start with a limited supported geography/role scope.
- Benchmark requirement extraction and evidence support on a diverse adjudicated corpus. Assess recommendation usefulness separately from speculative hiring prediction.
- Accept only source-supported market claims. Do not promise hiring probabilities or causal job-search improvement without suitable evaluation.

This review does not establish live provider reliability, security-rule behavior in an emulator, production index readiness, model accuracy rates, concurrency safety or job-outcome lift. Those remain explicit validation work after the relevant changes.
