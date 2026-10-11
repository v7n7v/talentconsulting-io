# Taco tool audit and upgrade recommendation

Date: 2026-09-28. Implementation checkout: `/home/xwingace/Documents/Projects/Taco-upgrade`, branch `codex/taco-upgrade`, base commit `806ac3c0` plus existing local brand changes. Scope: inspect and plan; no product fixes were made in this audit.

**Recommendation: keep the product's core direction and repair the contracts between tools before adding capabilities.** The five-destination workspace, confirmed resume source, guarded document exports and transactional packet review provide a useful foundation. Several specialist tools still expose controls, persistence messages or evidence claims that the implementation does not complete. More visual polish alone will not resolve those failures.

The next build should deliver a reliable job-seeker journey: confirm experience → choose a role → review grounded documents → track the application → practice with that exact context → reopen useful feedback. Ask Taco should help at each step without creating a second, conflicting copy of the user's work.

## What was inspected

The route inventory contains 43 suite page routes: 24 customer-facing destinations/capabilities, six compatibility redirects, eleven admin/admin-preview pages and two brand-gallery pages. The 24 include the existing Offer Planning bridge; they are not 24 independent product engines. The career-product audit covers the 24 destinations and six redirects. Founder/admin tooling and internal brand motion labs are separate projects and excluded from completeness claims here.

The review also covers eight Gallery utilities, seven Interview Studio modes with their subformats, all ten Settings sections, and five public tool entry pages. Every included tool has a source-level purpose, implementation assessment, disposition and acceptance criteria in the domain reports. Desktop entry states were inspected across the catalog; selected workflows and mobile states were checked in the isolated browser.

**This is a completed catalog/source audit with bounded browser checks, not a claim that every live tool passed end-to-end QA.** The preview intentionally blocks external services. No real account data, payments, emails, application submissions or microphone sessions were used.

| Evidence | Meaning |
|---|---|
| Browser-reproduced | Observed in the isolated local UI, with a described action and result. |
| Source-confirmed | Traced the active caller, handler, schema and relevant persistence or route inventory. |
| Source risk | Code supports a failure scenario, but runtime reproduction is still needed. |
| Product judgment | Proposed relevance/usability decision; not a finding from user research. |
| Validation gate | A required check that remains unperformed; not itself a confirmed defect. |

P1 means fix or contain the broken promise before releasing the **affected capability** to broader real-data use. P2 means important workflow, usability or maintainability work. No P0 incident was established. Billing/MFA/privacy staging checks are listed as gates, not counted as discovered P1 failures. No real account disclosure or server authorization bypass was reproduced.

## Complete disposition inventory

“Merge” means one understandable entry point and shared contracts while preserving useful functionality, saved records, old URLs and existing entitlements. “Retire from default navigation” does not authorize deleting user data or silently removing paid access.

| Current destination | Relevance and implementation conclusion | Upgrade disposition |
|---|---|---|
| Home | Clear next-action concept; stronger account-aware loading already exists. Legacy directory labels and redundant signals remain. | Keep as the daily starting point; one primary next action and resumable work. |
| Ask Taco | Useful coordinator with real history/intake/tool use; message/session allowance and stale-request ownership need repair. | Keep contextual assistance and an accessible conversation destination; reuse the same work records. |
| Your experience / Resume Studio | Essential source and document editor; confirmed source/review/export safeguards are valuable. Privacy copy and some source/output handoffs contradict reality. | Keep and prioritize. One canonical intake and versioned source; output changes remain proposals until reviewed. |
| ATS Analyzer | Useful deterministic role coverage; vendor Preview is a local simulation with lossy autofixes. | Merge role coverage and actual document structure checks into Resume Review; preserve guest comparison and correct legacy links. Remove unsupported vendor-fidelity claims. |
| Cover Letter | Core application artifact; active generation path has weaker grounding than another existing route. | Keep inside a selected application and shared writing service; editable, versioned, evidence-bound drafts. |
| LinkedIn profile | Relevant reusable career output, but factual source checks and saved continuation are incomplete. | Keep under Your experience; explicit resume/target, proposed edits and recoverable versions. |
| Find roles | Core search/evidence/detail workflow; important guarded packet logic already exists. | Keep. Absorb useful role analysis and make manually found jobs first-class. |
| Applications | Core durable work record and manual submission tracking. Reader/writer schemas and offer finalization need consolidation. | Keep as canonical application home with tracking, review, interview and offer states. |
| Drafts to review / Queue | Important review controls; overlaps application navigation and uses a writer schema missed by some summaries. | Merge into Applications → Needs review; preserve exact packet/review links and human approval. |
| Offer Planning / Negotiate | Already a bridge; offer coach overstates unsupported compensation benchmarks. | Keep offers in Applications; show user inputs, assumptions and sourced comparisons separately. |
| Your network | Relevant contacts/follow-ups; failed interaction saves can discard typed notes. | Keep as a secondary workspace with contextual application/contact actions and recoverable notes. |
| Market Oracle / Analyze a role | Overlaps Find roles; can mark incomplete packets ready and use a different resume for preparation. | Merge role analysis into Find roles with exact source identity and shared packet contract. |
| Market Pulse | Mostly personal pipeline/timing analysis; name suggests broader market evidence. | Merge substantiated personal activity into Career insights; separate future external market data with provenance. |
| Career Intelligence | Useful measured groups plus recommendations; mixed application queries lose some records. | Keep one Career insights destination backed by canonical events, explicit denominators and unknown states. |
| Application Quality / Results | Overlapping analytics with incompatible statuses and misleading metric denominators. | Merge corrected outcomes into Career insights and relevant Applications views. |
| Interview Studio | Relevant typed/live/study/specialist practice; setup and backend contracts diverge in several modes. | Keep Quick Drill as default, complete context/save/debrief/metering first. Treat other modes as formats. |
| Story Bank | Essential reusable experience examples; CRUD exists, but extraction/matching/quality actions have no routes. | Keep under Your experience. Hide or implement missing actions; extracted statements remain reviewed drafts. |
| Skill Bridge / Memory | Useful targeted practice/learning archive; assessment authority, hidden plan material and broken detail retrieval need work. | Keep focused learning under Interview prep and role gaps; clarify saved notes versus inferred career context. |
| Writing Toolkit / Gallery | Word Counter works locally; other utilities have common grounding/entitlement/recovery seams. | Consolidate common editing commands into one writing workspace; keep accessible utility entry points. |
| Writing Trust Studio / Humanizer | Overlapping document editor; false local-save status reproduced; settings and library claims exceed behavior. | Merge into the writing workspace after persistence repair. Rename checks according to actual evidence. |
| Job Description Generator | Primarily employer-facing, outside the default job-seeker journey; invents default compensation/company details. | Retain secondary/legacy access; deprioritize expansion and require explicit employer facts. |
| Settings | Real preference/auth/privacy machinery mixed with cosmetic controls and incomplete saves. | Keep; remove false success, complete supported fields, share state/ownership patterns and truthful lifecycle status. |
| Upgrade | Substantial server billing and recovery implementation; not exercised live. | Preserve and validate in staging; clarify unavailable, pending and completed states. No pricing/entitlement redesign in this plan. |
| Feedback | Real durable receipt machinery, but accepted text is silently shortened. | Keep one canonical component/contract for Settings and standalone route; preserve the full accepted report. |

Gallery's eight utilities are individually assessed in report 04: grammar, word count, citations, summarization, tone, paraphrasing, email composition and thesis generation. Citations/thesis are lower relevance to active job seekers and should leave default navigation rather than receive another prominent workflow. Interview mode and Settings submode inventories are in reports 02 and 05.

## Findings that determine build order

| Priority cluster | Decisive evidence and consequence | First response |
|---|---|---|
| Lost input and false completion | Browser B-01: Writing says saved locally but reload loses the draft. U01: Profile saves only display name, dropping editable Phone/Bio. U03: Feedback accepts 5,000 characters but stores 2,000. U02/export: push controls are cosmetic and account export only shows a toast. | Truthful unavailable/unsaved states immediately; then durable draft/profile/feedback operations with read-back and failure recovery. Building a full push/export service is not necessary to remove the false promise. |
| Missing action contracts | IL-12: Story extract/match/quality routes absent. IL-21: Memory item-detail route absent. | Stop advertising successful actions until implemented; finish the essential story and archive paths with owned schemas and reviewed results. |
| Practice setup does not reach the engine | IL-01: Full Mock sends `mock`, handler expects `mock-interview`. IL-03: selected resume/stories are not resolved into generation/grading. IL-08: live persona IDs do not match the voice map. | Shared mode/context schemas; each visible control must alter a supported behavior or be removed. |
| A Free practice can finish without its feedback | IL-02: question generation and grading each consume a gauntlet use. A Free user with one of three lifetime uses remaining can start and then fail the grading cap. Standard/Max/God have unlimited lifetime uses for this feature. | One durable session allowance contract through completion/retry; preserve paid-tier behavior and distinguish allowance from monetary charging. |
| Shared context lacks owner/revision boundaries | Foundation: unowned Application Kit browser storage and stale dependent outputs. IL-19: browser-global skill-gap context. Writing async responses lack source-revision checks. | Owner-scoped context, immutable input revisions, safe handoffs and invalidation. These are source risks; no actual cross-account disclosure was reproduced. |
| Analytics can omit current records | SP-01/02: queue-created tracker documents use snake_case while some readers query camelCase timestamps; manual writer already dual-writes. Mixed records are incompletely read and status/denominator logic differs. | One writer/reader normalization and canonical event cohort. Do not fabricate missing historical submission times or claim all existing records are affected. |
| Role analysis can produce the wrong packet state/source | SP-03/04: Oracle treats successful HTTP as ready even for `needs_attention`; text-only analyzed resume is not the packet source. | Reuse hardened Find roles pipeline and display exact selected source and returned preparation state. |
| Evidence labels overstate checks | Foundation ATS/vendor/proof labels; IL-07/13/16 assessment and story evidence; SP-05 compensation benchmarks; writing originality claims and public samples. | Separate structural checks, textual coverage, model suggestions, user-confirmed facts and genuinely measured outcomes. Enforce assessment rules server-side; do not turn practice/reflection into claimed work experience automatically. |
| Saved work cannot reliably be resumed | IL-05/06 debrief save/reopen, IL-18 hidden plan resources, IL-21/22 archive retrieval/pagination; writing sessions lack a user reopening path. | Complete save → acknowledgement → reopen → continue before adding more generation modes. |

The full findings, source locations and acceptance criteria live in the domain reports. Highest-impact contracts were independently reviewed by a second agent; scope corrections for finite Free allowance, mixed-schema records and staging uncertainty are included here.

## Design and intuitiveness

Keep the folded-A brand symbol, paper surfaces, restrained grid, strong borders and compact editorial hierarchy already accepted for the workspace. Apply that system through shared controls and layouts rather than adding custom cards for every specialist tool. Use restrained feedback for an actual save, selected state or completed review; avoid ambient motion, score theater and motion indicators.

Each tool should answer five questions without opening Help: What am I working on? Which source and role will be used? What is the next useful action? Was the work saved? How do I return to it? Advanced settings belong after the document/context, and one primary action should dominate each state.

The current mobile entry layouts did not overflow the page in the measured states, but writing configuration precedes the editor and interview readiness can contradict its source selector. Those are useful design findings, not a completed accessibility certification. User research has not yet established that the proposed hierarchy is intuitive; the plan contains task-based evaluation gates.

## Read the evidence and build plan

- [01 — Foundation: Home, Ask Taco, Resume, ATS, Cover Letter, LinkedIn](audits/tool-upgrade/01-foundation.md)
- [02 — Interview, Story Bank, learning and Memory](audits/tool-upgrade/02-interview-learning.md)
- [03 — Search, pipeline, offers, network and analytics](audits/tool-upgrade/03-search-pipeline.md)
- [04 — Writing tools, job descriptions and public entries](audits/tool-upgrade/04-writing-public.md)
- [05 — Settings, Upgrade and Feedback](audits/tool-upgrade/05-account-utilities.md)
- [06 — Browser coverage, reproductions and limitations](audits/tool-upgrade/06-browser-review.md)
- [Detailed implementation plan](tool-upgrade-plan.md)

No application test suite or production build was rerun for these documentation-only changes. Previous core-workspace tests/build results remain in [the earlier implementation review](internal-workspace-review.md); they are not presented as newly passed specialist-tool QA. The plan requires targeted contract, recovery, emulator, browser, staging and usability checks as the affected features are changed.
