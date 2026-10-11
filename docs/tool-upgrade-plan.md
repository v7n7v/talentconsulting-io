# Taco tool upgrade implementation plan

**Latest plan: [Four-part core journey, 9 October 2026](#core-journey-implementation-plan--9-october-2026).** This is the detailed plan for the next long-horizon build; its new source service, journey changes and release repairs are not implemented. Preserve the [Guided tool experience DNA](#guided-tool-experience-dna--9-october-2026) and the corrected [Find roles 20% refinement](#find-roles-20-refinement--9-october-2026); the earlier 80% workspace-wide proposal is withdrawn. Earlier upgrade batches remain recorded in [the implementation report](tool-upgrade-implementation.md).

Prepared 2026-09-28 for `/home/xwingace/Documents/Projects/Taco-upgrade`. **Plan only: no application implementation, production migration, entitlement change, provider activation or deployment is authorized by this document.** The source audit and the separate browser review describe current evidence; the destinations and contracts below describe the proposed future state.

Start with the [master audit](tool-audit.md), [writing/public-tools audit](audits/tool-upgrade/04-writing-public.md), and [browser evidence](audits/tool-upgrade/06-browser-review.md). This document turns those findings and the remaining domain reports into proposed implementation batches for review; it does not start them.

Working product assumption: Taco primarily serves active job seekers. The central outcome is **confirmed experience → considered role → reviewed application → recorded response → useful interview practice**. General writing remains useful supporting functionality; employer job-description writing, citations and academic thesis work remain secondary. This assumption can be revised without replacing the core data model.

The upgrade should make the existing workflows dependable and easier to complete before adding tools. Keep the five primary destinations—**Home, Your experience, Find roles, Applications, Interview prep**—and make Ask Taco contextual help and orchestration within them. Preserve the approved folded-A identity and paper/ink/coral brutalist design language.

## Evidence and priority discipline

The plan draws on these domain reports:

- [Foundation](audits/tool-upgrade/01-foundation.md): Home, Ask Taco, resume, checks, cover letters, profile writing.
- [Interview and learning](audits/tool-upgrade/02-interview-learning.md): practice formats, stories, learning plans, saved notes.
- [Search and applications](audits/tool-upgrade/03-search-pipeline.md): discovery, applications, packet review, offers, network and insights.
- [Writing and public tools](audits/tool-upgrade/04-writing-public.md): Writing Trust, all eight Gallery tools, JD writing and five public entry pages.
- [Account utilities](audits/tool-upgrade/05-account-utilities.md): settings, preferences, support, billing and account lifecycle.
- [Browser review](audits/tool-upgrade/06-browser-review.md): controlled runtime observations and the limits of fictional preview fixtures.

Source-confirmed defects, source-supported race risks, browser observations and product judgments must remain separate in implementation tickets. No P0 incident was established by these source reports. P1 should mean an affected workflow has a materially broken completion/evidence contract; it should not mean every unaudited provider feature is known broken. Staging checks for billing, MFA, email, voice and provider behavior are release gates for those capabilities, not a substitute for evidence of defects. A scoped capability can be hidden honestly while the rest of the product remains reviewable.

## Preserve these working boundaries

Do not replace the source intake, guarded resume morphing, exact-content review ledger, truth-preserving PDF/Word preparation, packet source inspection, revision-bound human approval, Max packet entitlement, idempotent tracker creation, or manual-submission distinction with a generic new “AI generate” path. Reuse and extend the existing implementation and focused tests.

Keep per-user authorization server-side; retain Firestore ownership/proof protections. Never infer external submission from packet generation, opening a posting, exporting a document or creating a tracker. Keep job email consent, pause/resume handling, payment reconciliation and observability consent machinery. Improve their callers and state displays without weakening their guarantees.

The original `Taco` checkout, production services and existing unrelated work are outside this build plan. All implementation should begin in the upgrade checkout on scoped commits. Preview fixtures remain explicitly fictional and must continue blocking live-service calls.

## Target information architecture

The URLs with new query parameters below are **proposed contracts**, not claims about current implementation. Introduce destination support before changing navigation or redirects. Preserve current stable entity parameter names such as `application`, `packet` and `mode` where practical. URLs may contain owned record identifiers; they must never contain resume text, transcripts, personal contact details or pasted JDs.

| Primary destination | Default job | Subordinate capabilities and proposed entry |
|---|---|---|
| Home `/suite` | Resume the most useful unfinished action | One next action; saved work; due follow-ups; interview reminder; small weekly summary. Action label and destination come from one resolved action object. |
| Your experience `/suite/resume` | Confirm and maintain facts | Source editor and versions; review/export; structural checks; Story bank at `/suite/agent/stories`; LinkedIn profile at `/suite/linkedin`. Keep these subordinate entries without making another primary rail item. |
| Find roles `/suite/job-search` | Find, compare and decide | Discover and Saved views; Role analysis at proposed `?view=analysis`; Preferences at `?view=preferences`; recurring Career Picks controls within Preferences. Role analysis reuses the selected role and confirmed source. |
| Applications `/suite/applications` | Review work and track real progress | Proposed `?view=review&packet=<id>` for prepared drafts; existing `?application=<id>&action=<action>` for dossier actions; active applications, interviews and offers as views/filters. Cover letters are editable artifacts attached to a role/application. Manual tracking is a first-class action. |
| Interview prep `/suite/interview-sim` | Practice for a chosen role | Quick typed drill as default; full mock and spoken practice as formats; specialist whiteboard formats; study cards; practice history; separately typed real-interview reflections. Linked Learning plan stays at `/suite/skill-bridge`, subordinate to this journey. |

Secondary destinations stay discoverable through the relevant journey, More tools and command search:

| Capability | Placement and transition |
|---|---|
| Ask Taco `/suite/agent` | Keep direct chat/history and contextual invocation. Opening from a role/application/story carries its owner-checked IDs and revision; it must acknowledge that context. Starting fresh explicitly clears prior target context. |
| Your network `/suite/network` | Supporting destination, with contact links in Applications. Default to due follow-ups and a useful list. Do not require a CRM tour before logging one contact. |
| Career insights `/suite/intelligence` | Supporting summary with Evidence, Results and Weekly review tabs. Results comes from one application reader/cohort definition. Weekly review reports the user's activity, not market signals. |
| Learning notes `/suite/skill-bridge?view=memory` | Shared saved study archive, clearly distinct from inferred career context. Exact note/deck/session continuation links open saved records. |
| Writing toolkit `/suite/gallery` and `/suite/writing-tools` | Supporting utilities; resume/letter/profile editing is also accessible where the artifact is used. Preserve public guest entry according to each existing tool's entitlement. No detection-evasion or job-outcome promises. |
| Job description writer `/suite/jd-generator` | Remain a secondary employer-oriented tool. Do not place it on the core candidate setup path. |
| Settings / Plans and usage / Help and feedback | Keep utility destinations. Move truthful session information into Security; share Settings and standalone feedback form/receipt behavior. |

### Compatibility map

| Existing URL | Proposed resolution after destination support exists |
|---|---|
| `/suite/agent/queue?packet=<id>` | `/suite/applications?view=review&packet=<id>`, preserving the exact review record and permission boundary. Initially render the existing review component there; do not merge collections merely to merge navigation. |
| `/suite/market-oracle` | `/suite/job-search?view=analysis`; preserve approved role/source identifiers and manual-entry state through the context store, not private query text. |
| `/suite/negotiate` | `/suite/applications?status=offer`; when an application is specified, open its offer action. No empty compatibility detour once the direct path is reliable. |
| `/suite/agent/quality` | `/suite/intelligence?tab=results`, only after shared metrics are correct. |
| `/suite/pulse` | `/suite/intelligence?tab=weekly`; fix current “Market pulse” navigation wording immediately. |
| `/suite/analytics` | `/suite/intelligence?tab=results`; preserve supported filters/date-window parameters. |
| `/suite/ats-score` | Transitional `/suite/ats-analyzer?tab=score`, then the equivalent Resume checks view. Preserve a standalone guest paste comparison. |
| `/suite/ats-preview` | Transitional `/suite/ats-analyzer?tab=preview`, with clearly bounded structural checks; eventually the corresponding Resume checks view. No implied real vendor parsing. |
| `/suite/flashcards` | `/suite/interview-sim?mode=study_cards`, preserving an owned deck/session identifier. |
| `/suite/interview-debrief` | `/suite/interview-sim?mode=debrief_review`, preserving application/session and intended action. |
| `/suite/vault` | `/suite/skill-bridge?view=memory`, preserving item/type/search where supported. |
| `/suite/cover-letter` | Keep a stable editor entry; open the selected application artifact when specified, otherwise offer a role/source picker. A redirect is unnecessary until equivalent editing is available inside Applications. |

Use an allowlist for forwarded parameters; validate IDs at the destination and show unavailable/unauthorized recovery. Never perform mutations merely because a legacy URL contains an outcome or action parameter. Keep explicit confirmation for reporting real-world outcomes. Route changes must preserve back/forward behavior, keyboard focus and selected workspace navigation.

## Phases, dependencies and deliverables

### Phase 0 — Honest states and capability containment

**Dependencies:** none beyond reading the affected current handler. This is not a redesign or data migration.

**Deliverables:** remove false success, unsupported availability and unsupported certainty at the active surface. Replace the export “being prepared/emailed” toast with an honest unavailable state until a durable job exists; remove or disable decorative push switches; stop silently accepting profile fields that are not stored; preserve the full feedback length the API accepts. Correct device-only resume privacy/save language. Writing Trust must stop claiming “Draft saved locally” without a successful draft write; retaining an honest transient draft is containment, while durable recovery remains a Phase 1 priority. Hide or explicitly mark unavailable Story AI actions and full-note reads until their missing routes are implemented. Hide the unavailable avatar display. Avoid presenting model/heuristic scores as factual proof, compensation benchmarks, privacy clearance, hiring probability or vendor parsing validation. Replace public rewriting examples that add unsupported achievements; omit JD compensation/benefit/company facts when the user did not supply them or explicitly opted out.

Handle scope precisely: do not remove functional manual Story CRUD because assisted extraction is unavailable; do not remove typed practice because avatar presentation is incomplete; do not invent replacement numerical scores. For incomplete packets, show saved partial work and recovery instead of “ready.”

**Completion evidence:** each affected control either completes its claimed action or states its exact limitation; failure produces no save/send/verification claim; generated and user-authored text survives failures. Use narrow route/component tests for behavioral defects and browser checks for presentation. No new test suite is needed merely to assert a wording string.

**Audit coverage:** F02/F03/F07; IL-09/12/13/21; SP-03/05/06; W03/W05/W06 and public rewriting examples; U01/02/03/04/05.

### Phase 1 — Shared identity, schema and operation contracts

**Dependencies:** Phase 0 can proceed independently. Phase 1 is the dependency for deeper source/context migrations.

**Deliverable A: owner- and workflow-scoped reactive context.** Replace ad hoc browser-global handoffs with a subscribed context repository keyed by **owner + workflow/artifact scope**, not one mutable global target. Scopes include a resume draft/version, role/application, writing session, interview session and Taco conversation; an unsaved workflow receives a stable local draft ID. Each scope holds its own confirmed source reference/revision, selected target/revision and operation IDs. UI “active selection” points to a scope; it does not replace unrelated saved or in-progress contexts. Opening application B must not overwrite application A's letter, a separate LinkedIn draft or another Taco conversation.

A result records the input revisions used. Updating a source/target invalidates only its explicitly dependent results and preserves other scopes; an accepted new revision never silently rewrites historical saved artifacts. Updates require the expected scope revision so stale hook snapshots cannot overwrite newer state. Cross-tool handoffs pass an explicit scope/entity reference and the destination acknowledges it; “start fresh” creates a new scope. Clear visible account-owned state on sign-out/owner change and ignore late results bound to the previous owner, scope or operation. Anonymous scratch work uses a distinct namespace and requires an explicit reviewed import into an account.

Quarantine legacy unowned `talent-application-kit-context`, `talent-resume-draft`, `tc_skill_gaps`, `tc_blueprints` and unused handoff keys. Do not assign their contents to the next authenticated account. Preserve a recoverable user-initiated import path if appropriate. Handle unavailable storage and quota errors as draft-state failures, not unhandled exceptions.

**Deliverable B: canonical readers and entities.** Normalize current and legacy application fields/statuses in one reader that includes mixed schemas. Define the distinction between saved role, packet draft, approved packet, tracker draft and submitted application. Dates include created, submitted, scheduled interview and recorded outcome; unknown stays unknown. Use append-only event history for reached-stage metrics and explicit transitions for current status. Readers paginate predictably and expose completeness, rather than silently presenting the latest 100 rows as all-time totals. Preserve supported aliases during migration.

**Deliverable C: typed command/result boundaries.** Each generated artifact or assessment binds owner, artifact type/ID, source references, input revision, operation ID, schema version and result provenance. Resolve source IDs and current hashes server-side; a client-provided UID or hash is not authority. Validate provider output shape and bounds before persistence. Keep user-confirmed facts, model suggestions, practice assessments and structural checks as different provenance categories. The Gallery registry must enforce each tool's existing minimum tier server-side, before a provider call; arbitrary client options cannot select a different feature/meter. Move JD writing from the generic client-authored prompt/meter path to a dedicated validated endpoint with its existing intended policy. These are policy-consistency repairs, not authorization to invent a new plan package.

**Deliverable D: durable operation states.** Establish `queued/running/partial/succeeded/failed/canceled` semantics and independent saved/reviewed/exported/submitted statuses. Add idempotency to creation/finalization and explicit retry of only failed stages. UI cancellation must distinguish stopping a request from undoing already-persisted server work. Resume long operations from an operation/artifact ID; stale completions cannot populate another selected record. Writing Trust gets an actual owner-scoped local draft write and a create/update/open contract for `writing_sessions`; consume public handoff text only after durable draft creation succeeds. Two saves update the chosen session or explicitly create a new version, never an inaccessible duplicate disguised as a library save.

**Deliverable E: allowance contract decision.** Document existing entitlements and actual meters before modifying code. Ask Taco “check-in” currently counts successful responses; Free typed practice can consume the last allowance generating questions and then be denied grading. Propose one reserved practice/check-in operation through its required completion, with idempotent retries, but treat unit/packaging changes as a product decision requiring explicit acceptance before implementation. Do not silently expand tiers, weaken Max packet checks, or change prices. Standard/Max/God currently bypass the interview lifetime cap; tests must not imply otherwise.

**Completion evidence:** A→sign-out→B; source A→B; role A→B; slow-old/fast-new; duplicate requests; reload; blocked storage; mixed-schema records; malformed provider results; supported tier limits. Assertions operate on results and persisted entities, not only source-string matches. Firestore emulator covers actual queries and derived-field rules.

**Audit coverage:** F01/F05/F06/F08/F09; IL-02/03/05/13/16/17/19/20; SP-01/02/04/09/10; W01/W02/W03/W04/W07; U02 and owner-sensitive utility flows.

### Phase 2 — Complete source-to-application vertical slice

**Dependencies:** shared owner/source/result contracts from Phase 1. Preserve the current guards and review mechanics throughout.

1. **Confirm experience.** Upload/paste/manual/library all enter one source-confirmation contract. Show cloud processing and save state accurately. Preserve missing fields as missing. Review proposed wording edits separately from exact evidence reordering; either implement a supported page-count behavior or remove that ineffective control. A no-op is reported as no change.
2. **Select a role.** Discovery and Role analysis share selected source, role identity, source provenance, evidence coverage and recoveries. Manual pasted JDs remain supported but are labeled as user-provided. Editing analyzed inputs invalidates dependent analysis. Explain ranking/heuristics without calling them acceptance probabilities.
3. **Prepare and review.** Share the hardened packet-result reader across discovery, Oracle/role analysis and Taco entry points. `needs_attention` remains partial even with HTTP 200. Preserve confirmed source → guarded resume → cover letter → server-ready packet → revision-bound user review. Exports render the reviewed revision and keep source provenance.
4. **Finish writing.** Converge active cover-letter endpoints around a typed source-bound service; provide an actual editable draft, compare/undo, save/load and validated export. Keep LinkedIn positioning separate from a single application's missing requirements. Structural extraction, requirement coverage and optional writing assessment have distinct names and freshness.
5. **Track reality.** Add direct manual application capture; generation is not a prerequisite for tracking a role already submitted elsewhere. Capture actual sent date. Follow-ups, interviews and offer actions use the selected application's immutable request context. Finalizing an offer writes negotiation and application state atomically; failure cannot emit success.
6. **Show correct progress.** All summaries use the same canonical application reader and cohort definitions. Drafts do not depress submitted conversion. Historical interviews survive later rejection in reached-stage metrics. Tailoring is tied to the submitted artifact, not the number of scored queue records. Label windows, denominators and missing data.

**Completion evidence:** a confirmed source creates one reviewed packet and one unsent tracker; user explicitly records submission; a reply/interview/offer progresses correctly; reload restores the exact documents and event history. A manually submitted job follows the same downstream path without AI or Max packet generation. Inject failure at each boundary and prove recoverable partial success without duplicate records or false submission claims.

**Audit coverage:** foundation artifact issues and all SP findings. Network note-preservation and pagination can run as a parallel small package once common operation states are available.

### Phase 3 — Make interview practice and learning durable and relevant

**Dependencies:** owner/revision/operation contracts; source/application context from Phase 2. Missing-route containment does not need to wait for this phase.

**Deliverables:** shared mode/persona request schema; Full Mock uses the intended branch; visible configuration has an implemented effect or is removed. Server resolves the selected application, confirmed resume and user-approved stories into the interview brief. Persist answers/transcripts before grading; retries reuse the same session and preserve allowance policy. History opens the complete saved session with answer-specific feedback and exact-record continuation. A grading outage yields unscored useful guidance/retry, not an invented proficiency band. Typed work receives no speech-pacing verdict.

Live practice follows typed durability: cancelable launch, permission/device check, mute, reconnect/text fallback, resource cleanup, transcript save independent of grade. Avatar is only an optional display after an asset/audio/lifecycle test proves it works; it is not a new learning mode.

Keep actual-interview reflection separate from practice. Offer an editable, explicitly confirmed answer-to-story draft instead of automatically turning confidence into work evidence. Implement Story extraction/matching/review routes only against owner-checked sources and validated outputs; manual stories remain useful without them. Recompute derived completeness/privacy hints on every edit and reject client-forged derived metadata.

Learning plans render every task, resource/search phrase and effort estimate; no hidden full curriculum or `(undefined)` links. Save plan versions; progress binds to stable task IDs rather than day indices after regeneration. Practice challenges have a server-owned prompt/rubric/attempt ID; verdict derives from validated score/type, and rules protect server assessments. Separate latest/best/stale practice status from factual skill claims. Implement owned full-note reads and stable cursor pagination; saved deck/session links reopen the original material.

**Completion evidence:** final answer survives grading failure and reload; exact session reopens; one remaining Free allowance completes according to the approved meter contract; selected source/story affects engine context; text/audio are correctly distinguished; fast Exit cannot start mic later; legacy skill records do not inherit new verification; the 21st/201st note remains accessible; a saved deck resumes without generating a replacement.

**Audit coverage:** IL-01–23, with engine contracts and durable history before new modes or avatar polish.

### Phase 4 — Consolidate tools and finish supporting utilities

**Dependencies:** destination functionality and contracts exist before routes/navigation change. This phase can be split by destination; it is not a single wholesale rewrite.

**Deliverables:** move packet review/offer navigation under Applications, role analysis under Find roles, Results/Weekly review under Career insights. Retire dormant Weekly Picks UI after verifying no caller remains; retain active APIs and email jobs. Centralize tool titles, descriptions, availability, aliases and command-search entries in the existing navigation registry. Make context-preserving compatibility handlers. Keep general writing and employer/academic tools secondary.

Writing utilities share an input/result editor, preservation guarantees, meaningful diff/undo, schema-validated output, explicit save state, entitlement/recovery messaging and original-text retention. Mode selection initializes editable tone/domain/length settings; those controls must affect the actual request. Rewriting invalidates previous checks of the old output. Consolidate grammar/tone/paraphrase; keep deterministic Word Count instant and consistent; calculate counts/readability using documented functions rather than model assertions. Academic/citation and recruiter tools stay optional. Citation outputs require supplied bibliographic metadata and explicitly unverified missing fields; “Verify” in writing must not imply a plagiarism database search. JD templates get a searchable reopen/edit/update path, and bias wording suggestions retain diff/undo without a compliance guarantee. Audit public guest entry separately from suite entry: four public pages are handoffs, not independent engines; the public detector is a bounded writing-pattern preview. No external message is sent by a drafting tool.

Utilities share profile persistence, owner-bound preference loads, precise failure/rollback state and support receipt behavior. Decide whether to implement export, push, session revocation and broader deactivation; until implemented end-to-end, keep availability and completion honest. Account deletion stays request → confirmed queue → processing → completed/failed with supported retention handling; never describe confirmation as completed deletion. Billing/MFA/privacy-control source implementations are retained and verified in isolated staging, not casually rewritten.

**Completion evidence:** every visible tool action maps to an implemented route or clear unavailable state; old URLs preserve the intended owned record; no duplicate nav identity for a redirect; support retains all accepted text; preference reload agrees with server; no accidental email, payment or provider side effect in preview.

### Phase 5 — Design consistency and task usability

**Dependencies:** functionality determines the states to design. Shared visual primitives can be extracted earlier; final polish should follow contract stabilization.

**Deliverables:** preserve folded-A wordmarks, warm paper backgrounds, ink typography/borders, compact spacing and disciplined coral accents. Do not redesign the landing page or replace the brand. Use a common tool header, source/target strip, primary-action area, editable artifact, review panel, error/retry state and save indicator. Remove competing score cards and nested dashboards where a short next action is enough. Coral denotes the intended accent/attention consistently; color alone never conveys state.

Use progressive disclosure for personas, advanced role filters, multiple list views, 3D visualization and specialist writing controls. No ornamental motion indicators. Honor reduced motion; animate transitions only where they explain a state change. Interactive illustrations from the accepted landing design need not become motion-heavy internal controls.

**Completion evidence:** keyboard focus containment/return, named inputs, announced asynchronous results, native/accessible tab and select behavior, touch targets, 320/390 px layouts, zoom, light/dark contrast and reduced-motion behavior. Test real tasks with fresh users after internal verification: confirm a resume; track an existing application; prepare/review a role packet; practice and reopen feedback; find a saved note; recover from a failed save. Record observed confusion and completion paths, not invented usability scores.

### Phase 6 — Controlled staging and release decision

**Dependencies:** each affected feature meets its source/component/emulator/browser acceptance. Staging access/provider credentials are a separate controlled prerequisite; their absence is not proof the feature is defective.

**Deliverables:** a versioned fixture matrix, captured expected/actual results, known limitations and rollback switch for each migrated capability. Run isolated test accounts and non-real personal content against staging auth, Firestore indexes/rules, providers, billing test mode, email sandbox and voice devices. Confirm profile/account switching, tier resolution, provider malformed/timeout responses, export fidelity, signed/expired lifecycle links, webhook delays, retries and consent withdrawal.

No production migration or broad rollout until the reviewed migration plan and relevant staging gates are complete. Record checks that could not run as unverified. Do not describe route rendering, fake preview data or old test passes as proof of live generation/persistence/payment behavior.

## First small build batch

Start with **B0: truthful account and save surfaces**, not a whole-workspace rewrite. It is independently reviewable and requires no external service activation.

1. Settings: replace the export success toast with an honest unavailable state; show push as unavailable; retain only supported profile fields in the editable/save contract until phone/bio persistence exists.
2. Feedback: preserve the full validated 5,000-character canonical message; shorten only separately labeled notification summaries if needed. Share input limits between both forms and API.
3. Resume entry/library and Writing Trust: display actual local draft/account save status and truthful AI-processing copy; do not claim all files stay on-device or that unwritten drafts are saved. The writing draft remains explicitly unsaved until B1 adds real persistence.
4. Navigation wording: rename “Market pulse” to “Weekly review” or “Career pulse” while retaining its current route until consolidation.

**Review artifacts:** focused diff; before/after desktop/mobile screens; no app-wide cosmetic changes; a short list of what remains unavailable. **Verification:** feedback boundary/round-trip tests at 2,000/2,001/5,000 characters and failure preservation; source inspection confirms unavailable controls issue no request; browser checks show honest states and preserved entered text; scoped lint/types and relevant existing checks. Do not add tests that merely duplicate static wording.

Then B1 introduces the owner/revision context and migrates one vertical pair—Resume source → Cover Letter—before converting every consumer. Writing Trust's draft persistence/reopen contract is a parallel bounded B1 package using the same ownership primitives; do not defer observed draft loss to final polish. B2 reuses the shared contract for Find roles/Role analysis and the packet result reader. The canonical application reader/metric fixtures and Gallery server entitlement enforcement can proceed in parallel with B1 because their server scopes are separable. Interview missing-route/mode-contract containment can also proceed independently; durable session metering waits for the explicit charging-unit decision.

## Implementation contract checklist

Every implementation ticket should identify the owning workflow, audited finding, active entry points, changed contract, fixtures, migration/rollback and observable completion. Proposed modules may be introduced beside existing ones, but prefer extending proven helpers over replacing them.

| Contract | Required fields/behavior | Must not imply |
|---|---|---|
| Workflow scope | Owner + stable draft/artifact/application/conversation/session identity; independent context; expected revision on update | Selecting a new target globally overwrites unrelated work. |
| Source reference | Owned source ID, source kind, immutable content revision/hash, confirmed status, canonical normalization | User confirmation proves employment or an external credential. |
| Target reference | Stable job/application ID, owned user input or verified posting provenance, JD revision | A model-inferred employer/role is verified posting data. |
| Artifact | Type, parent entity, input revisions, generator/check versions, draft/review/export/save states | Generation, export and review are the same completion event. |
| Assessment | Rubric/check type, measured inputs, provenance, uncertainty/unmeasured state, freshness | Keyword coverage, model feedback or self-confidence is a hiring probability or credential. |
| Operation | Owner, idempotency key, state, stage outcomes, recovery, allowance reservation where approved | UI abort automatically canceled already-persisted work. |
| Application event | Actual event type/date/source, previous/current status, optional reported history | A prepared tracker was externally submitted. |
| Data read | Loading/error/empty/success/stale, pagination/completeness and retry | An API failure means the user has no records. |

## Test and acceptance matrix

Run the relevant narrow tests once per meaningful change, then broaden only for integration or new concerns. Preserve existing intake/review/export/packet/entitlement/emulator tests as regression guards. Do not claim the repository's legacy broad lint is clean if only scoped lint passed.

| Dimension | Required cases | Observable result |
|---|---|---|
| Identity | Guest, user A, sign-out, user B, owner switch during request | No former-owner context, drafts, metrics or success toast lands in the new account; guest import is explicit. |
| Source/target/scope | None, confirmed source, generated draft, stale/deleted source, A→B revision, manual JD, saved posting, two simultaneous applications/conversations | Exact source/target shown; server validates refs; stale results cannot be exported as current; changing one scope preserves unrelated work. |
| Tier/meter | Existing Free/Standard/Max/God policies; zero/one remaining Free run; concurrent starts; retry | Consistent entitlement and accurate allowance behavior; no invented paid cap; no unapproved pricing change. |
| Failure | Offline, 401/403/429/500, timeout after server write, malformed provider payload, partial success | Work retained; no false save/ready/send claim; bounded recovery; no duplicate entities or billing events. |
| Persistence | Refresh, same/different device as supported, unavailable browser storage, missed response | Saved state agrees with durable store; unsaved state remains explicit; retry resumes exact work. |
| Applications | Manual/pipeline/queue writers; mixed snake/camel legacy docs; every status; past interview then rejection; draft old/sent recent | All readers agree on names, sent cohort, timing and historical outcomes; actual Firestore query tested. |
| Output | PDF/DOCX extraction, long names/non-ASCII, 7+ bullets, missing fields, edited letter, unmeasured score | Reviewed facts retained; lossy changes require review/undo; zero differs from unknown. |
| Practice | Typed, spoken, full mock, cards, coding/design/case, unavailable grader, canceled live launch | Appropriate context/rubric, durable answers/history, no typed speech judgment, resources stopped. |
| Library | 0/1/21/121/201 records as relevant, filter/search/page/detail races | Complete pagination, stable selection, exact-record continuation, useful empty/error states. |
| Accessibility/layout | Keyboard, screen reader spot checks, touch, 320/390 px, zoom, themes, reduced motion | Core task completes without hidden controls, trapped focus or lost context. |
| Preview isolation | Every known and unknown API path while preview flag enabled | Fixture reads only; unknown operations fail safely; no live providers, email, billing or production writes. |

### Separate staging gates

| Gate | What must be established in isolation |
|---|---|
| Auth/MFA | Real owner transitions, expired sessions, social/password provider reauthentication, enrollment/removal and recovery. |
| Firestore | Deployed indexes, mixed-schema queries, ownership and server-only derived-field rules, transaction retry behavior. |
| AI/job providers | Model availability, validated response formats, timeout/malformed output recovery, job-source attribution and safe outbound URLs. |
| Voice | Browser permission/device failures, cancellation, sockets/audio cleanup, transcript durability and approved voice usage accounting. |
| Billing | Test-mode duplicate/concurrent checkout, existing customer, timeout/resume, webhook delay/idempotency, authoritative entitlement refresh. |
| Communications/lifecycle | Explicit opt-in, delivery accepted versus delivered, provider pause/resume, unsubscribe, expired confirmation, queued versus completed account actions. No real outbound recipient is needed for the audit. |
| Privacy/observability | Optional collection disabled before consent, withdraw/revoke behavior, diagnostic case bounds and absence of private content in analytics payloads. |

## Measurement without private content

Define event schemas before adding instrumentation and honor existing consent controls. Optional product analytics remains off without consent; withdrawing consent stops it. Necessary operational monitoring and explicitly granted case diagnostics retain their separate existing policies and must not be expanded by this plan.

Suggested consented events describe workflow type, coarse stage, success/partial/failure, bounded error code, retry count, duration bucket and UI destination. Do **not** include resume/JD text, answers/transcripts, generated documents, contact names/emails, employer names, free-form notes, pasted URLs or prompts. Avoid persistent cross-context identifiers when aggregate events suffice; do not call pseudonymous IDs anonymous. Validate telemetry payloads against an allowlist and test redaction/consent.

Measure completed source confirmation, saved reviewed artifact, duplicate-free tracker creation, reopened practice feedback, successful failure recovery and task abandonment by stage. Establish a baseline before setting product targets. Label measurement windows/denominators; no arbitrary conversion improvement promise follows from this audit. Qualitative task observations supplement these metrics.

## Reversible migration and rollout

1. Add schema versions and compatibility readers first. Inventory record counts/shapes using approved staging data; plan any production read separately.
2. Introduce new context/operation contracts behind scoped flags. Migrate one consumer pair and validate before broad adoption. Keep old APIs as adapters until all callers are known and moved.
3. Quarantine ownerless browser state; offer reviewed recovery instead of deleting or auto-importing it. Do not merge separate users' local data.
4. For persisted entities, use idempotent bounded backfills with dry-run output, checkpoints, conflict reporting and retained original values. Back up before any production mutation. Do not retroactively mark historical heuristic stories/skills as confirmed evidence.
5. Enable new navigation only after equivalent capability and compatibility tests pass. Keep redirects/readers through a monitored deprecation window; remove dormant code only after reference inventory and preserved-link validation.
6. Roll back the new UI/caller flag without deleting user work. New writes remain readable through adapters; do not roll back by weakening proof/ownership rules. If a migration cannot safely roll back, narrow it until a recoverable approach exists.

## Product decisions and non-goals

The proposed hierarchy assumes active job seekers; employer and academic workflows remain secondary. Proposed merges concern navigation/capability ownership and do not authorize deleting user data, changing plans, increasing Free allowances, lowering Max packet gates or activating new paid services. The check-in/practice charging unit, whether to build unavailable export/push/session features, and any benchmark data provider are explicit product decisions before their dependent implementation.

Not included: a new landing design, a new logo, a general architecture rewrite, automatic external applications, automated recruiter messaging, detector-evasion claims, employer acceptance prediction, unsourced salary benchmarking, replacing source confirmation with model confidence, or expanding avatar/3D experiences ahead of durable work. Admin operations are not replatformed as part of the candidate tool upgrade.

The implementation is ready for review when each shipped slice has evidence for its actual behavior, preserved user work, current limitations, relevant checks and a recoverable rollout. The entire tool collection need not be rewritten before the first dependable end-to-end slice is available.

## Find roles 20% refinement — 9 October 2026

Status: **corrected scope; implementation unstarted**. The user clarified that the intended reduction is **20% less clutter in Find roles only**, rather than 80% across the workspace. The prior workspace-wide simplification and tool-folding proposal is withdrawn. It produced planning documents and before-state review evidence only; no product implementation, new commit or deployment resulted from that proposal. Git HEAD was verified at `806ac3c06292bb7f4a728de3575fa59790efd5be` (27 September 2026) when the correction arrived.

The current magnifier-spacing, source-picker readability and section-tab visibility fixes remain intact as local uncommitted work. This correction does not revert earlier functionality or unrelated shared changes.

### Bounded proposed refinement

Keep the current navigation, tool portfolio, page structure and all other destinations. Make a modest cleanup of redundant Find roles chrome:

- Remove the three header statistic tiles (Ranked, Strong, Packets). The results count already belongs beside the roles; material packet state stays on its relevant role.
- Remove the redundant Opportunity feed eyebrow while retaining the result count and useful role context.
- Express role metadata as concise lines and avoid repeating the same date within a card. Preserve title/company, location/pay, source confidence, measured-or-unknown fit, one evidence reason, packet state and material risks.
- Retain the recently improved Discover / Role analysis / Preferences tabs, source picker, target/location/Search, filters/sort/Controls, preferences and all existing role/packet actions.

The existing source-derived ledger counts eighteen optional pre-result units, excluding navigation, required inputs and decision safeguards. Removing the three stat tiles and feed eyebrow yields fourteen, a **22.2% reduction** after rounding to whole units. This is a proposed narrow measure, not a claim that the screen feels exactly20% less cluttered or that any reduction is implemented. Freeze a matching live before-state and assess the modest visual result before expanding scope.

### Verification for a later build

One builder owns the Find roles page and local components. Preserve account/source/request protections, current filtering and navigation behavior, named recovery and truth/review boundaries. Run the existing52 focused checks, type-check, build and whitespace checks; recheck320/390/430/768/1024/1440px in both themes with core results, clean normal-state console and no overflow. The design audit baseline must not be rewritten to conceal an additional regression.

No main-menu restructuring, tool merging, other-screen redesign, data migration, entitlement change or deployment is included in this corrected request. Source inventory and earlier before-state screenshots remain historical review evidence in `.ui-verify/workspace-simplification-2026-10-09/`; they are not evidence of shipped simplification.

## Guided tool experience DNA — 9 October 2026

**Status: build authorized and implemented locally; browser acceptance remains pending.** The founder approved construction with “Can we build it now?” Shared contextual Help, Find roles, Resume and the exposed tool-family adapters are now implemented in `/home/xwingace/Documents/Projects/Taco-upgrade`. The proposal below records the original decisions and acceptance criteria; its baseline source observations describe the pre-build state. Current implementation, review findings, checks and remaining gates are recorded in [the implementation report](tool-upgrade-implementation.md#guided-tool-experience-dna--9-october-2026). No fresh-user study or screen-reader run establishes effectiveness yet. Preserve existing shared changes and the separate Find roles-only approximately 20% cleanup. The withdrawn 80% reduction, tool merging, navigation restructuring, palette changes and commercial-policy changes remain outside scope.

### Recommended DNA: one working brief, one current task, one honest outcome

Every tool should let a new visitor answer: **What can I accomplish here? What are we using? What should I do now? What happened, and where is my work?** Returning users should immediately recognize their object, its source and its current status.

Use a common narrative grammar behind the interface: **purpose → source → action → evidence/review → choice → outcome**. These are content and state responsibilities, not six cards, six screens or a compulsory wizard. Before results exist, the input surface is the work. Afterward, the document, comparison, practice answer or other real artifact becomes the visual centre. Editing, searching again, comparing and recurring reviews remain natural loops.

| Moment | Visible experience | Rule |
| --- | --- | --- |
| Arrival | Existing title, one concrete purpose sentence, relevant inputs or retained object | Avoid feature inventories and unrelated summary cards. Explain an absent prerequisite beside its dependent action. |
| Working | Compact source/target/status context, central work, clear current decision | Use one primary action per decision area while retaining useful secondary choices. Advanced options remain discoverable; do not conceal material safeguards. |
| Review | Real result beside its basis, uncertainty and editable decisions | A model suggestion is not a confirmed fact; missing evidence is not measured zero. |
| Outcome | Factual state inside the artifact and its real save location | Generated, retained in this tab, saved to account, downloaded, reviewed and submitted are distinct. |
| Return | Restore actual context and identify stale or unfinished work | Introductory copy recedes. Never overwrite edits or silently re-run work to manufacture continuity. |

Distinctive finish: paper holds the work, ink establishes hierarchy, coral identifies the current action, and the folded A remains an identity detail. Reuse current tokens and both supported themes. Prefer composed document surfaces, aligned captions and readable rows to additional decorated cards. Motion may clarify an actual transition or locate a target; it must be restrained and respect reduced motion. Factual outcome text settles into the existing artifact instead of spawning another celebration or summary panel. Resume templates remain visually independent employer-facing documents.

Three creative alternatives were compared: an editorial working brief, an evidence trail, and a continuous artifact handoff. Recommend the brief as the common structure; use an evidence trail within meaningful claims and handoffs when a genuine object crosses tools. A mandatory wizard would obstruct editing and comparison. A conversation-only interface would bury source, version and review state. Merely adding a tour to an overwhelming page would leave the underlying problem intact.

### Tool stories and real endings

These are proposed narratives, grounded in representative current source, not a claim that every capability has passed a complete audit. A tool's implementation adapter must establish its actual prerequisites and endings before it receives live guidance.

| Tool or family | Natural story | Honest ending |
| --- | --- | --- |
| Resumes / Your experience | Import or reuse source → confirm extracted facts → choose a job or continue without tailoring → edit/review → design → inspect actual export → save/download | Name the saved version or downloaded file; show whether work is only retained locally. Reuse existing Source/Target/Shape/Design/Ship sections without forcing their order. |
| Find roles | State target/location → choose source when needed for fit → search → inspect role facts and resume evidence → choose save, skip, open posting or eligible preparation | A role is saved only after success. A prepared draft is ready for review only when confirmed. Browsing and pausing are valid choices. |
| Role analysis / Oracle | Choose source and posting → inspect supported, partial and missing evidence → decide what to change or pursue | A sourced assessment and the chosen next action; no invented salary benchmark, culture judgment or interview likelihood. Oracle is already a Find roles analysis view. |
| Applications / packet review | Open or create a real tracked item → inspect linked source/documents → review draft → record actual submission or later event → follow up | A successfully saved note/status/outcome with its source and date. Opening a posting, preparing or downloading is not submission. |
| Interview prep / debrief | Choose real context → select practice → answer → receive feedback → inspect transcript and next practice choice | Distinguish retained answer/transcript, feedback failure and a saved session. A debrief screen alone does not prove feedback was saved or practice improved readiness. |
| Humanizer / Writing Toolkit | Bring a draft → choose purpose/tone and protected terms → revise → compare/accept changes → copy/download/save | The accepted text and real storage/export state. Scan, Diagnose and Verify are optional checks; they do not establish authorship, factual accuracy or plagiarism. |
| ATS and document checks | Select document and optional posting → run supported structural/keyword checks → inspect observations and limitations → decide edits | A labelled check report; no universal ATS pass, hiring prediction or fabricated measured score. Each standalone check needs its own capability audit. |
| Story Bank | Bring a genuine example → structure it → confirm wording and facts → save or use in practice | A named saved story or selected practice context, without manufactured metrics or experience. |
| Learning / Skill Bridge | Choose a genuine gap/goal → select useful work → practise or record learning → review and choose next activity | User-reported task completion or saved practice evidence, with provenance; no automatic certification or resume fact. |
| Network | Select a genuine contact/opportunity → review context → draft or record the next interaction | Saved draft/note or a confirmed external action; drafting a message never sends it. |
| Ask Taco | Express the current question → confirm relevant context → inspect answer or proposed action → choose what to do | An answer or a specifically acknowledged artifact/action. Conversation alone cannot imply work was saved or submitted. |
| Career Intelligence / Home | Orient to the current snapshot → inspect the basis of a priority → choose real work → return to refreshed context | A refreshed read or a genuine action elsewhere; no synthetic career-progress score or forced finish. |

### Help that follows actual use

Put one recognisable Help icon in the same relative place on each tool header, with a visible tooltip and accessible name such as `How to use Find roles`. Use a 44px target as the product standard. Include custom headers such as Resume Studio; registry metadata alone does not make a button exist.

**Recommended first-visit default:** a small, dismissible `Show me how` invitation. Do not auto-start a blocking tour. Help remains available, restartable and skippable. This preference was asked asynchronously; the recommendation is an assumption until the founder answers. Remember only guidance preference/position scoped to the relevant owner and guide version; retain no resume text, posting content or transcript in guidance storage. Do not add new telemetry by default.

The icon starts **nonmodal guidance beside the real controls for the current state**. Each short step names one action, why it matters and what to expect. Keep Back, Next, Close and a keyboard-accessible Show target control available. `Read the workflow` provides an accessible text overview, including future phases that cannot yet be highlighted. There is no additional mode-selection screen.

On desktop, place the note near its target without covering it. On narrow screens, use a compact note in the normal layout or an appropriately reserved area; the real target and its label must remain visible and operable. A blocking spotlight backdrop does not belong to assisted doing. A separately opened modal overview follows modal focus containment/return semantics and makes background controls inert; do not combine modal semantics with clickable background work.

For **Find roles**, use two short chapters:

| Chapter | Real target | Proposed explanation |
| --- | --- | --- |
| Set your direction | Target | “What role are you looking for? This defines the search.” |
| Set your direction | Location/work preference | “Choose where you would work. Keep the constraints that matter to you.” |
| Set your direction | Source picker | “Use a confirmed resume to compare your experience. You can still browse without one.” |
| Set your direction | Search | “Run this search when you are ready. Your inputs stay available if you need to retry.” |
| Review your choices, once results exist | Actual role row/detail | “Open a role to inspect the posting and why it appeared.” |
| Review your choices | Fit/evidence area | “See what your resume supports and what is not yet shown.” |
| Review your choices | Available decision actions | “Save, keep exploring, or prepare a draft when eligible. Review any draft before using it.” |

At the boundary, Help waits for the user's real search and its current outcome. It cannot spotlight nonexistent results or silently skip a prerequisite as completed. Back/Next moves through explanations only. Reading the final explanation does not finish the job; Help closes with currently available choices, without a completion badge.

The same model applies to other tools in their own natural sections, not an automatically cross-tool tour. Starting on an existing result should offer the relevant result chapter and allow returning to setup. A “resume guidance” position is revalidated against owner, object and revision; it is never a business-state authority.

### State and recovery are part of the story

| Actual condition | Required communication and behaviour |
| --- | --- |
| No confirmed source | Keep permitted browsing/manual work available; explain the source-dependent fit/preparation boundary. |
| Pending operation | Name current work, retain inputs, observe the actual operation; no invented progress percentage or timeout success. |
| Successful zero results | “No roles found for this search.” Point to editing inputs without silently relaxing constraints. |
| Filters hide results | “No roles match these filters.” Offer the actual filter reset, retaining the underlying results. |
| Failed or partial operation | Identify what failed, preserve usable work and offer retry for the affected scope. Failure is not an empty market. |
| Missing evidence | “Not measured” or “No supporting excerpt found,” as appropriate; neither asserts lack of ability. |
| Inputs/source changed | Name the prior context and stale result. Pause dependent guidance and let the user explicitly refresh or make a domain-supported choice. Preserve existing outbound gates. |
| Paid or unavailable action | Explain the real entitlement/prerequisite before the action; do not initiate provider work or mark a checklist failed. |
| Anchor hidden or missing | Explain the prerequisite and let the user open it, or show readable fallback guidance. Never highlight an arbitrary substitute. |
| Account/object changes | Close/revalidate guidance, discard obsolete target references and prevent cross-owner continuation. |
| Real save/download/review event | Update the original artifact with its actual status and location. Keep additional next steps optional. |

### Shared implementation contract for a later build

Extend the existing tool registry and shared chrome; do not introduce another ungoverned mega-registry of prose and selectors. Use one logical guidance controller per route. Tool-owned adapters supply current facts from existing workflow state rather than deriving completion from DOM visits or creating a parallel business state machine.

Each audited story has a stable ID/version, outcome/prerequisites, optional chapters, authored step copy, semantic anchor registration, state availability (`available`, `waiting`, `blocked`, `stale`, `complete`), owner/object/source/revision identity and an observable outcome. Guide position is separate from work progress. Stable element references or semantic hooks replace CSS/translated-text guessing. Authored guidance, not a runtime LLM, determines targets and sequence.

The engine may explain, highlight, announce and perform controlled presentation scrolling. It must never execute Search, generate, save, export, send, approve, change source or reset work. A presentation-only reveal callback is permitted only after its effect is audited and declared; an arbitrary tab or stage change is not necessarily harmless. Opening a disclosure with mutation-bearing effects requires an explicit user action.

Async targets use bounded waiting plus a readable fallback; observe the current request identity, not a fixed delay. Reposition for nested scrolling, resizing and target changes without focus theft. Pause while auth, permission or another modal owns focus. Closing/restarting Help preserves fields, selection, unsaved documents and the selected context. Navigation may invalidate guidance; it must not automatically move the user to another tool.

Source findings that shape this design:

- `components/PageHelp.tsx` currently renders all prose steps in a focus-managed modal. Its step type has no anchor/current-step/state contract. Some Resume and Job Search copy describes older capabilities and must be reconciled against current handlers before reuse.
- `components/suite/SuiteToolChrome.tsx` mounts separate desktop/mobile Help instances. A hidden active instance during resize is a source-derived risk requiring runtime verification; one route controller avoids competing sessions.
- `components/resume-studio/ResumeStudioHeader.tsx` has no Help slot despite the registry's Resume help ID.
- `app/suite/job-search/page.tsx` registers P/S window shortcuts for preparation/save and excludes only input/textarea. Reading Help must not allow these shortcuts to start work. Scope tool shortcuts to the appropriate active region and arbitrate overlays/interactive elements.
- `app/suite/resume/page.tsx` can replace `buildResume` from `originalResume` when navigating to Source. A guide must not call that handler as a harmless target reveal.
- `lib/resume-workflow.ts` already distinguishes navigation, source state, generation ownership and stale work. `lib/application-kit.ts` provides owner/scope scaffolding. Reuse and validate these contracts; preserve confirmed-source identity separately from a generated artifact on handoff.

These are source observations and implementation risks, not newly reproduced runtime bugs. The registry/help inventory is not yet a complete audit of every route or mode.

**Coverage snapshot, 9 October:** `lib/suite-tool-registry.ts` defines 14 entries and 13 Help references, of which 12 resolve in current `PageHelp` content. Dashboard has no Help ID; ATS Analyzer points to `ats-analyzer`, which has no matching content (the separate `ats-preview` entry is not a substitute). More broadly, `lib/workspace-navigation.ts` exposes 32 destinations: 24 standard destinations plus eight writing utilities. These are navigation destinations, not 32 independently audited tools. Use that existing manifest and canonical child modes as the rollout denominator; include direct utilities such as cover letters, LinkedIn, JD writing, Weekly review, application results, offer planning, settings/plans and feedback. A resolved Help ID alone does not prove a header actually mounts Help or targets work.

### Enterprise acceptance and pilot sequence

“Enterprise” here means predictable language, accessible interaction, recovery, provenance and reliable continuity. No enterprise certification or measured usability improvement is claimed.

1. **Validate the hierarchy in Find roles.** Freeze a live before-state and prototype the corrected modest cleanup, working brief and genuine outcome states. Observe representative first-time users before showing Help: can they explain the purpose, find the starting action and identify the basis/uncertainty of a result? Include returning users, direct links and mobile use. Treat small-sample results as qualitative evidence, not conversion proof.
2. **Build the shared Help foundation and Find roles pilot.** One builder owns shared guidance/chrome/registry contracts; another may own Find roles anchors/state adapter with explicit file boundaries. Root reviews coherence and safety; a skeptic tries absent targets, shortcut conflicts, stale inputs and interrupted work. Follow existing source protections; this is not a backend rewrite.
3. **Use Resume as the second stress test.** Validate editing, source confirmation, stage mutation, unsaved work and actual export boundaries. Extend its custom header consistently. Do not roll out everywhere merely because a search tour worked.
4. **Roll out by family.** Applications/packet review → Interview → Writing → analysis/checks → saved stories/learning/network → Ask Taco/Home/Intelligence. Inventory all exposed routes, nested modes and custom headers; every supported tool must resolve to reviewed story content and targets. Aliases may share a story only when they land on the same real workflow. Track partial coverage explicitly.
5. **Codify the demonstrated standard.** After the pilot is accepted, add the durable principles to the existing design skill and enforce registry/anchor coverage plus no-action guidance mechanically. A proposal document is not a shipped product rule or feature.

Release checks for each implemented slice:

- Relevant workflow tests, type-check, build and whitespace checks pass; preserve the current design-audit baseline without concealing regressions.
- Real browser results at 320/390/430/768/1024/1440px in both themes: readable core state, clean normal-state console, no horizontal overflow. Also check resize while guidance is open, nested scrolling, sticky rails, assistant collision, virtual keyboard, zoom and reduced motion.
- Keyboard access to Help, Back/Next/Close, real target and optional overview; Escape closes the active surface and returns focus to a valid visible origin. No invisible focus traps; no background action shortcuts while guidance owns focus. Normal input focus remains stable during async updates.
- Screen-reader check: named guidance region, meaningful target label, explanation position and concise actual state changes. No essential colour-only or spatial-only instruction. Guidance cannot cover the focused target. Test real assistive technology; source review alone does not establish accessibility.
- Opening, traversing, exiting, restarting and encountering missing targets produces **zero action requests or data writes**, except any expressly implemented local guidance preference. Search/preparation/save/export remains an explicit action through existing handlers, guards and entitlement checks.
- Exercise pending, successful empty, filtered-empty, partial/error/retry, missing source, changed inputs, stale source, denied entitlement, unsaved edits, owner change and genuine completion. Guide completion never changes business status.
- Repeat a normal task with Help dismissed. If it remains confusing, revise hierarchy/copy rather than making the tour mandatory.

Observe time to first useful action, task errors, recovery, ability to name source/uncertainty, and successful return to work. Tour completion is a secondary diagnostic, not product success. Do not add analytics or persist sensitive content solely for the pilot without an explicit collection decision. The under-ten-minute career-workspace north star remains an aim, not a result established here.

### Research and conversation basis

- [NN/G: Onboarding tutorials versus contextual help](https://www.nngroup.com/articles/onboarding-tutorials/) supports optional, easily dismissed/reopened help alongside the task, with progressive detail rather than front-loaded memorisation. It does not prove this proposed UI works for TalentConsulting.
- [W3C: Understanding Consistent Help](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help) supports stable relative help placement across pages where help is repeated; it does not require a tour on every tool or certify this proposal.
- [WAI-ARIA: Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) informs the separate overview's modal semantics; it is not a template for nonmodal assisted doing.
- [W3C: Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) informs guidance placement and focus visibility.

The fresh Muse creative-role agent recommended working briefs, restrained identity and outcome state within the artifact. The journey architect challenged mandatory linearity and supplied source-grounded endings. The enterprise reviewer challenged modal/background interaction, shortcuts, missing targets and mutation-bearing navigation. Their second exchange converged on nonmodal, state-aware guidance with a readable overview and no fake completion. Muse was a fresh creative-role agent, not a separately connected model or service. Root recommends the combined standard; founder feedback and pilot evidence may refine it.

**Build follow-up:** the later user request authorized implementation. Shared guidance and tool adapters now exist; complete browser acceptance and inspect the report before declaring the UI ready. The brainstorm itself made no product changes. This build has made no commit or deployment.

<a id="core-journey-implementation-plan--9-october-2026"></a>

## Core journey implementation plan — 9 October 2026

**Status: planning complete, including independent adversarial review. Implementation and release acceptance are not complete.** This section answers the user's request to plan all four parts before using long-horizon-build. It supersedes older next-step advice for this slice, not the existing product architecture or completed upgrades. The four parts are the explicit résumé-to-search handoff, the complete first-time/returning journey, native browser/Help/accessibility acceptance, and design/SEO repair plus a reviewable release. Interview prep follows this foundation and is outside this slice.

Canonical checkout: `/home/xwingace/Documents/Projects/Taco-upgrade`, branch `codex/taco-upgrade`, inspected HEAD `8c34ccbfb2b0a94ef34d3ac73b69de8b2de425be`. This is a shared dirty checkout with unrelated work. HEAD does not identify its entire working tree or the deployed artifact. Original `/home/xwingace/Documents/Projects/Taco` is reference-only. Execution resumes from [the existing checkpoint](../.codex/long-horizon/tool-upgrade.md), [implementation evidence](tool-upgrade-implementation.md) and [the guided journey map](../.project-map/guided-tool-dna.html).

### Outcome and boundaries

A new user can upload, paste or enter a real résumé, correct and confirm its facts, deliberately use that exact source to find roles, inspect up to three genuine matches, and prepare and review an application packet. A returning user resumes actual unfinished work with its original source and posting identified. Each screen explains its purpose, present state and next action without requiring Help. Help explains the same workflow sequentially without performing it.

The under-ten-minute north star is an evaluation target, not a measured result. “20% less clutter” remains a modest hierarchy/disclosure brief for Find roles, not an invented numerical usability result or permission to remove 80% of the workspace. Keep résumé editing, templates/customization, prominent job-description tailoring and the existing five primary destinations. Keep the paper/ink/coral design and folded-A identity; employer-facing résumé documents remain visually independent.

These invariants govern every milestone:

- Search and generation read owner-scoped, confirmed source records. A generated or merely saved résumé document is never silently promoted into factual evidence.
- Confirmed means **confirmed by the user**, not independently verified employment, education or skill claims. The UI must make that distinction clear.
- Career-profile saving is optional. Using a résumé for search must not save reusable career details, update the main profile or populate experience history unless the user chose that operation.
- Unknown evidence remains unknown. Do not invent scores, salary, dates, skills, metrics, employers, credentials or mock saved work.
- Preparation, human approval, export, opening an employer posting and user-reported submission are different events. None implies the others. No automatic application, email or payment is added.
- Existing guarded morphing, entitlement checks, exact-content review receipts, PDF/DOCX truth enforcement and Firestore proof protections remain authoritative.
- Work and async completion are bound to owner, source, posting and revision. Help, navigation, account changes and retries must not silently change those bindings.

### Baseline: implemented, missing and unverified

| Area | Inspected evidence | Consequence for this build |
| --- | --- | --- |
| Résumé confirmation | `confirmImportedSource` can retain a confirmed local snapshot with no saved source ID. Checked career saving writes an `experience` version; document saving writes a `resume` version. | Add an explicit durable search-source operation; do not reuse career saving behind an unchecked checkbox. |
| Source eligibility | `lib/server-resume.ts` rejects document-kind versions. The picker now uses its shared structural classifier. | Preserve that rejection; add a distinct, strictly validated source kind. |
| Current continuity fixes | October 9 controlled tests repaired stale application/analysis context, packet/source binding, interrupted source reloads and failed tracker-link retry. | Preserve these fixes; test the new flow against their failure cases. |
| Review destinations | Find roles prepares `apply_pipeline` application records; `applications?view=review` renders queue content. | Link each prepared artifact to its real review surface; a generic queue link is insufficient. |
| Local checks | Prior bounded slice: 80 focused tests and 128 tool-upgrade tests passed, with overlapping coverage; aggregate verification passed 8 of 9 gates. | Re-run relevant checks after changes; do not add overlapping counts or inherit old green results. |
| Design | Current distinct hex/occurrences/token-definition files: **39/76/16**, against **25/40/15**. Accent contrast failures: **0**. | Three CSS files can repair these exact regressions without changing the audit baseline. |
| SEO | Saved October 9 anonymous production audit: 43 pages, ten designated policy failures: seven canonical and three noindex failures. Existing S0 fixtures: 34 passing. | Implement the bounded S1 metadata policy in the existing SEO plan; retain S0. This is HTTP policy evidence, not proof of search indexation or data disclosure. |
| Native acceptance | The user reported Find roles loaded; the computer-use tool still exposed stale error documents and denied their protocol. No new successful native browser cases or screenshot in the last slice. | Native acceptance remains open. Resolve access through permitted browser tools; never bypass a tool security denial through another browser, shell, CDP or tunnel. |

Current bounded evidence is in `.ui-verify/core-journey-2026-10-09/validation.json`. Earlier browser reports and fictional preview fixtures are useful baselines, not authenticated production or current six-width acceptance.

### Part 1 — Explicit, truthful résumé-to-search handoff

#### User flow

1. Preserve real PDF/DOCX upload, paste and manual entry. Show the actual intake operation and errors; a timeout, cancel, retry or replacement cannot leave an endless spinner or erase recoverable input. Validate actual supported file formats/size against current parser limits instead of advertising unimplemented support.
2. Show imported facts alongside available original evidence, parser warnings and missing fields. Let the user correct them and acknowledge material warnings before confirmation. Preserve available parser receipts; do not fabricate provenance for older drafts whose receipts were lost.
3. **Confirm résumé facts** captures a revision of the corrected source. Later factual edits invalidate confirmation until reconfirmed. Editing or generating a tailored document does not mutate this source.
4. After confirmation, keep both choices prominent: **Use this résumé to find roles** and **I already have a job description**. General résumé editing and export remain available; no template or export is required before search.
5. The search action explicitly persists/reuses the confirmed source and navigates only after a successful source receipt and owner-scoped read. For a guest, offer sign-in with recoverable work; do not attach a guest draft to an arbitrary account without an explicit adoption action.
6. Keep **Also save reusable career details** optional and accurately described. The existing explicit checked career-save path may remain, but its outcome is independent of source saving. Legacy career content can be confirmed and snapshotted without writing it back to career history; unchecked source saving never calls `saveExperienceRevision`. Direct identity reuse is limited to an already sealed source receipt with matching current content.

If source saving fails, stay on the current screen with the confirmed snapshot, show the failed operation and allow the same command to retry. If source saving succeeds but an explicitly selected career save fails, retain the usable source receipt and offer a separate career-save retry. Do not report both operations successful, duplicate the source or force the user to complete career saving before search.

#### Data design: a separate source snapshot

Use the existing owner-scoped `resume_versions` namespace with a new **`workspace.kind: 'source'`, `purpose: 'role_search'`** record. Use a versioned metadata union: existing schema-v1 `experience` and `resume` records retain their behavior; new source metadata is schema-v2. Unknown kinds/versions fail closed. New sources must not appear as saved résumé documents or reusable career-history entries.

Add one small authenticated server service rather than a generic client write path. Proposed entry point: `app/api/resume/source/route.ts`, with POST for deliberate creation and GET for exact owner-scoped reading. Proposed server-only module: `lib/resume-source-service.ts`. Extend the existing pure workspace/source types and thin authenticated client adapter. Names are implementation contracts to finalize at M0, not claims these files already exist.

Proposed public request/receipt shape:

```ts
type ConfirmSearchSource = {
  requestId: string;                    // durable UUID for this explicit command
  confirmedContent: CanonicalResume;    // captured factual source, not editor output
  origin: 'user_upload' | 'user_authored';
  intake?: AvailableIntakeEvidence;     // bounded, optional, never fabricated
};

type SearchSourceReceipt = {
  status: 'created' | 'replayed';
  source: {
    collection: 'resume_versions';
    id: string;
    hash: string;
    hashEncoding: 'sha256-json-stringify-v1';
    contentHash: string;
    contentHashEncoding: 'sha256-stable-json-v1';
    confirmedAt: string;
  };
};
```

The service derives UID through `guardApiRoute()` and validates fields/limits server-side. It does not accept caller-owned UID, a verification claim, guardrail proof, timestamps or authoritative hashes. `origin` is user-reported provenance unless accompanied by actual validated parser evidence; it is not an independent credential. Normalize with the same canonical content contract used by the packet source reader, preserving supported confirmed sections and honest absence. Never invoke AI to fill gaps. Bound the complete Firestore document, including metadata/evidence, below the storage limit; unsupported/oversized input produces a recoverable error before writing.

At M0 fix the endpoint error contract and bounds from existing parser/storage policy: invalid command/content → correction needed, unauthenticated → sign-in, oversized → explicit limit, owner-scoped missing/denied source → unavailable, replay conflict → new command, write limit → bounded retry, transient failure → same-command retry. Use the existing authenticated write-rate policy and strict body/UUID validation; avoid unbounded source creation. Wrong-owner reads reveal no other account's source existence. Every loading state has an operation identity and cancellation/timeout/retry outcome; diagnostic logs contain no résumé text, tokens or raw provider payloads.

Keep the two existing hash encodings explicit. `stableWorkspaceContentHash` sorts keys; apply-pipeline currently hashes `JSON.stringify(baseResume)`. They are not interchangeable. A server-only integrity helper computes the packet hash from the **same normalized source read used by apply-pipeline** and tags both hashes. Do not add Node crypto/Admin SDK imports to the pure classifier imported by client components. The chooser's structural predicate is UI eligibility, not cryptographic authority; the server read remains authoritative.

**One v2 sealed-source read contract must govern every authoritative consumer**, not only the proposed GET. It accepts the owner/document reference plus record, validates schema/kind/receipt/identity and both content hashes, and returns the same normalized content/hash or an explicit denial. Wire it into source creation/read, `getVerifiedResumeForUserById` for search, apply-pipeline's initial source read plus transactional reservation/finalization, `getPacketSourceContent`/`inspectPacketReview` for review and approval, and the linked export source check. Today `getPacketSourceContent` only checks legacy provenance/active state and hashes raw content; extending the chooser alone would leave incompatible or weaker downstream behavior. New v2 records cannot fall back to that legacy path when receipt validation fails. Preserve an explicit legacy branch with its original serialization/hash bytes; don't rewrite old packet proof silently. Include real consumer-path tests for v2 source → search → prepare → approve → export and malformed receipt, identity, content and encoding denial at every boundary.

Create a dedicated server-owned `source_confirmation_receipt` proof field and protect both it and source-kind writes in Firestore rules. Clients cannot create, edit, relabel, remove the receipt from or delete a sealed source. Do not forge a `guardrail_report` to obtain immutability. Server corrections create a new revision; existing protected generated versions remain protected.

**Cleanup is an activation prerequisite, not an existing guarantee.** The current account-lifecycle confirmation route records `deletion_confirmed` and requests an operations workflow; it does not erase data. M0 must identify the approved actual server/owner erasure and retention procedure, include v2 sources/receipts and owner-scoped local caches, and define a transactional creation-versus-deletion fence against authoritative lifecycle state. A deletion request that wins the fence must prevent new source writes; any source committed first must be included by cleanup. Replays cannot revive erased sources. Test both orderings with the real authoritative documents and protected server operations. If the approved procedure/retention policy is unavailable, keep new source creation disabled and report that owner dependency. Coordinate rules ownership with parallel lifecycle work; don't incidentally ship its unreviewed patch or call a recorded deletion intent completed erasure.

#### Retry, compatibility and exact selection

- Persist a command UUID with the owner-scoped confirmed draft and captured revision. Derive a deterministic document identity within the owner's namespace; transactionally create once. An identical replay returns the **original** source/receipt/timestamps, including after a committed write whose response was lost. Different content or intent under the same command returns 409 and requires a new explicit command.
- Fingerprint stable, meaningful payload/provenance. Exclude fresh transport timestamps, not substantive source evidence. The existing generic save path normalizes `recordedAt` with the current time on each call; its career-save retry can therefore conflict with an already committed version. Fix that path's stable replay contract as well, or preserve a captured timestamp consistently. Test the combined real normalization plus transaction path, not just a mock fingerprint helper.
- Carry the exact source ID through proposed `/suite/job-search?source=<id>`. Query strings contain identifiers only, no résumé text/name or posting description. Authenticate every read; an ID grants no access.
- For this explicit handoff, missing, deleted, archived, wrong-owner, malformed or mismatched sources require named recovery. **Never fall back to a different eligible résumé.** The ordinary chooser without an explicit source may retain its existing behavior with truthful selection copy.
- A saved document with valid lineage may reuse an already sealed original source after an authoritative read. Current schema-v1 experience records remain client-mutable and cannot inherit the new immutability guarantee merely by passing structural checks. Legacy career/document lineage requires reading its factual content, explicit confirmation and creation of a sealed snapshot through the new service. Known generated document records/references cannot be relabeled as factual sources; orphaned documents require real-fact reconfirmation rather than invented lineage. Arbitrary pasted/authored facts remain self-attested: this service does not claim to detect all AI-origin text or independently verify the user's claims.
- Bind save/read/navigation to owner, captured source revision and operation identity. Account A → B, source replacement, route departure or a later edit makes an old response ineligible to change current UI. Durable receipts still support a deliberate later return.
- Search is enabled only after the exact eligible source is loaded. Navigation does not automatically call Search, prepare a packet, subscribe to jobs or save profile data.

Primary files: `app/suite/resume/page.tsx`, `lib/resume-workspace.ts`, `lib/resume-provenance.ts`, `lib/database-suite.ts`, `lib/server-resume.ts`, `lib/job-search-resume-source.ts`, `lib/job-packet-review.ts`, `app/api/agent/apply-pipeline/route.ts`, `app/suite/job-search/page.tsx`, the linked export source boundary, the proposed service/route/integrity helper and `firestore.rules`. Read `TALENT_SUITE_ARCHITECTURE.md` before this work. Use existing intake, lifecycle and source tests; add focused authenticated service and real emulator cases where behavior is new.

**Part 1 is accepted when:** unchecked career saving leaves profile/history unchanged; checked saving has a separate truthful outcome; upload/paste/manual and resumed drafts produce the intended sealed source; known generated lineage, forged proof and wrong-owner records are denied; all downstream readers verify v2 integrity; edit/reconfirm creates a new revision; response-loss/double-click/reload creates one source; failed save preserves work; and Find roles visibly selects exactly the acknowledged source. Activation additionally requires the approved cleanup/fence proof above.

### Part 2 — One understandable journey, including return visits

#### First-time path and information hierarchy

| Stage | The screen communicates | Primary deliberate action | Detail disclosed when useful |
| --- | --- | --- | --- |
| Résumé intake | “Start with your real résumé.” Actual supported entry methods and processing state. | Upload, paste or enter | Format limits and privacy/intake detail |
| Fact review | “Check what we imported.” Actual missing fields/warnings and source evidence. | Correct, acknowledge and confirm | Full original evidence and parser diagnostics |
| Confirmed source | Source name, confirmation state and what using it will save. | Find roles / paste an existing job description | Optional career saving, library, templates |
| Search | Loaded source, target role/location and editable constraints. | Find roles | Additional preferences, full settings |
| Matches | Up to three real first results, reasons, supporting evidence and uncertainty. | Inspect a role | More actual results, deeper analysis, feedback |
| Role decision | Posting requirements versus this source; what packet preparation will do. | Prepare application drafts | Save/skip, full posting and analysis |
| Preparation | Named operation, partial outcomes and retry scope. | Review drafts after actual completion | Usable artifacts and failed components |
| Review | Original source, proposed documents, changes, warnings and exact review state. | Review and approve the current revision | Evidence ledger and full diagnostics |
| Export / manual submission | What was approved; which files were actually exported; where the employer accepts applications. | Export/copy, then open posting when ready | Format controls and submission instructions |
| Tracking | Actual prepared/approved/exported/submitted state and next follow-up. | Record a real submission or later outcome | Other application history |

Keep the most relevant action dominant, with supporting actions legible and clearly named. Do not remove useful paths just to make a smaller screenshot. The job-description branch stays prominent and uses existing guarded tailoring; the user can finish a general résumé without inventing a target job.

Show the first **up to three** genuine matches at every viewport, then offer more with the actual total/pagination state. Do not display three if fewer exist or hide uncertainty behind a synthetic readiness score. Distinguish market-empty, filter-empty, request failure, partial results and stale context. Move “Tune future picks” after evidence and decision. Replace unexplained JD/Packet wording in task copy with “Posting requirements” / “Application drafts.” Give real detail tabs proper semantics, keyboard behavior and visible selected state; use disclosure buttons instead if these are sections rather than tabs.

Remove unsupported readiness/no-change assertions: a count of preferences is not measured search readiness, and a rewrite with no substantive change cannot claim a newly improved order. Copy must follow the actual outcome and evidence. Preserve useful measured source checks separately from generated-document checks.

#### Returning-user path

Select the next action from actual loaded records, not a tour-completion counter: unconfirmed import → confirm; confirmed local draft → save/use; loaded source → search; saved posting → inspect; failed/partial preparation → recover; drafts awaiting review → review; approved current revision → export; user-reported submitted application → track response. A missing source or failed read remains an error with recovery, not an empty account.

Identify the source, posting and retention scope on resume. A changed source/description marks dependent results stale and requires an explicit refresh/review. Keep the user's libraries available below current work. Do not automatically create a tracker, regenerate, approve or adopt an ownerless draft because the user returned. Keep old links and canonical aliases working; Role analysis should resolve to `job-search?view=analysis` with the correct source/posting context rather than restoring a prior posting's Oracle draft.

#### Review routing and consent

Find roles must say **“Drafts ready for review”** and make **Review drafts** the primary completed-preparation action. Opening the employer posting remains available for inspection, but is not the implied next step before review.

Retain the two current packet families. An internal discriminated review target (`application` versus `queue_packet`) routes each artifact to its existing authoritative record and approval policy. Do not merge Firestore collections, borrow an unrelated approval receipt or use tracker status as consent. First repair the Find roles deep link to its actual application document review; compose a unified review entry only through a small read/UI adapter if required to make both families discoverable. Unsent prepared records prioritize review; manually tracked records without generated documents do not pretend they have an approvable packet.

Proposed `action=review` is a presentation intent only; implement and test the destination before emitting it. It selects/focuses the actual review region after a successful read and never approves, downloads or changes application state. Preserve existing links/actions during migration. On load failure retain the intended link for retry.

Approval remains bound to exact artifact revisions, source hashes and posting context. If a document changes after approval, export is blocked or requires the existing applicable re-review; don't approve a stale preview. PDF/DOCX export must execute the real truth boundary and produce files whose content can be inspected. Opening/downloading a file does not mark an application submitted. **I submitted this application** records an explicit user statement and real timing, never a guessed event.

#### Help as product DNA

Reuse the existing guidance engine, adapters and semantic anchors. One logical controller per active route; guide position is separate from business progress. Provide short context chapters for résumé intake/source confirmation, search/match decision, preparation and review/export, with an optional readable whole-journey overview.

Add exact review anchors for source, prepared résumé, cover letter, approval, exports, employer posting and submission recording. The Applications adapter must observe the actual open packet, loading/errors, readiness, revisions and approval, not only `selectedApp`. Only the active surface registers targets. A hidden/unavailable target explains its prerequisite; it cannot highlight an arbitrary substitute or force a mutation-bearing stage change.

Help may explain, announce, highlight and safely scroll. Back/Next/Close/restart **never** call upload, save, Search, generation, approval, export, clipboard, employer navigation or submission handlers. Presentation-only reveals require explicit audited effects. Pause for auth, modal or permission ownership; arbitrate shortcuts so P/S cannot prepare/save behind Help. Closing or resizing Help preserves fields, selection, unsaved documents and focus. The normal task must remain understandable with Help dismissed.

Primary files: the three journey pages, `components/resume-studio/ResumeReviewWorkbench.tsx`, `lib/resume-guidance.ts`, `lib/tool-story-adapters.ts`, existing packet/review components and canonical guidance definitions. Shared provider/chrome changes only when a demonstrated failure requires them. Preserve related role/packet lifecycle tests and independently challenge stale closure/response cases.

**Part 2 is accepted when:** new and returning users can name the source, current step and next action; both résumé routes remain obvious; Find roles lands on the correct packet's review; revision approval/export/manual tracking stay distinct; and Help explains each real state while performing zero workflow actions.

### Part 3 — Native journey, mobile and accessibility acceptance

Automated contracts, real emulator tests, browser interaction and live-service canaries prove different things. Store them separately; a scripted fixture, source scan or worker's report cannot establish native focus, visual correctness, provider reliability or production readiness.

First resolve the existing computer-use binding restriction through a permitted browser entry point/tool recovery. Do not repeat the same user refresh request indefinitely or create an equivalent workaround after security denial. Until access is available, implementation and nonbrowser verification can progress, but native UI acceptance remains **blocked**, with no screenshot or “visually verified” claim.

Run the core result journey at **320, 390, 430, 768, 1024 and 1440px**, in both light and dark themes. Capture at each width the source-ready state, actual match/detail state, packet review/export-ready state and Help open on a real target. Include the 1024px layout boundary, resize while Help is open, nested scrolling, virtual keyboard/visual viewport, sticky workflow actions, assistant/rail collisions and safe areas. Require readable wrapping, visible selected states, clean normal-state console and no document horizontal overflow. Document any intentional horizontal document preview scrolling separately; it must not scroll the whole app.

Use explicitly synthetic accounts/content for repeatable acceptance. Fixtures must contain only intentional scenario facts, never fake production claims. Browser network instrumentation verifies actions, not just button appearance. Run a separate isolated staging canary with real auth/rules/providers only when configured and authorized; fictional preview success does not substitute for it.

| Acceptance scenario | Required proof |
| --- | --- |
| Fresh account, upload and no career save | Import → correction → confirmation → explicit source save → exact selected source; career/profile unchanged. Include a real supported PDF and DOCX, paste and manual entry. |
| Upload interruption/failure/replacement | Timeout/cancel/retry/replacement resets pending state safely and retains recoverable input; late old parser results cannot overwrite newer work. |
| Checked career save and response loss | Independent truthful outcomes; retry after committed-write/lost-response returns one source and original receipt. |
| Complete search → prepared packet → approval/export | Real record IDs/hashes/revisions remain bound throughout; export contents pass truth guards. Nothing externally submitted. |
| Already-have-JD branch | Pasted description stays prominent, exact context survives tailoring/review, source facts remain separate from generated output. |
| Empty/filtered/partial/failure states | Correct explanation and affected retry; usable work retained; no fake scores or silent constraint relaxation. |
| Account/source/role/JD/route changes during requests | Old responses cannot change the new context, consume intended review links or attach another role's artifacts. Selecting the first result never implies prepare/approval consent. |
| Return/reload and legacy records | Actual draft stage, source identity and approval preserved; stale/missing/archived sources require named recovery; no explicit-source fallback. |
| Exact review under stale edit/read failure | Failed read remains retryable; a changed artifact cannot reuse approval. Application and queue families use their own authority. |
| Sequential Help safety | Open/traverse/close/restart/missing-target/resize causes zero provider requests, persistent writes, clipboard/export/posting actions or business transitions. |
| Keyboard and assistive technology | Logical Tab/Shift-Tab, named controls, dialog/Escape/focus return, announced async state, selected tabs, uncertainty readable without colour; test actual supported screen-reader/browser combination. |
| Long content and user preferences | Long names/URLs/descriptions, missing salary/date/score, warnings, 200% zoom and reduced motion remain usable in both themes. |

Apply WCAG 2.2 AA relevant criteria; verify focus visibility against actual sticky overlays. Use a house target of **44px** for touch controls where practical; do not misstate that as the AA minimum in every case. [W3C focus guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) and [target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) inform the checks, not a compliance certification.

Save per-case viewport/theme, build/source identity, input scenario, actual outcome, screenshot, console/network result, overflow result and keyboard/focus observations. Keep all PII/tokens out of logs. Classify **passed / failed / blocked / not run** explicitly. Manual assistive-technology or fresh-user sessions that are unavailable remain open; don't fill them with simulated evidence. Existing controlled tests remain valuable regression checks, including a red-before-fix case for consequential source/retry defects.

**Part 3 is accepted when:** the defined journey/result/Help cases have actual browser proof at all six widths and both themes, actionable accessibility defects are fixed, failure/owner/revision checks pass, and the agreed staging capabilities have separate honest evidence. No unqualified enterprise/accessibility certification is implied.

### Part 4 — Bounded design/SEO repairs and reviewable release

#### Design repair: three files, unchanged audit authority

One bounded CSS worker owns these files only:

| File | Planned change |
| --- | --- |
| `components/resume-studio/resume-design-workbench.css` | Remove raw fallback hex where existing tokens are defined, keep token-based controls and use `var(--elevation-card)` for the paper-container elevation. Removes 24 current hex occurrences. |
| `app/resume-flagship-lab/lab.css` | Replace raw border colors with existing roles; remove eight duplicate palette aliases. Removes 12 current hex occurrences. |
| `components/taco-theme.css` | Define those lab-only aliases under `.flagship-lab` using established paper/ink/muted/line/coral/soft roles, with an explicit fixed-paper boundary in both themes. |

A read-only virtual audit predicts **25 distinct hex / 40 occurrences / 15 token-definition files**, prohibited occurrences **174** instead of 175, other metrics unchanged and zero accent contrast failures. This proves a bounded repair is possible; the actual change still needs its own audit and browser proof. Preserve the scanner and baseline byte-for-byte. Do not move raw literals into arbitrary exempt files, broaden template exceptions, change document palettes or migrate every inline card. The flagship lab remains development-only and returns 404 in production.

#### SEO S1: metadata and response policy only

Reuse [the SEO plan](taco-seo-upgrade-plan.md) and [SEO checkpoint](../.codex/long-horizon/taco-seo-upgrade.md). S0 audit/config/fixtures/workflow work is already present; do not repeat it. This journey package implements its bounded S1 policy; broader content, acquisition, analytics and performance phases remain separate.

- Remove homepage canonical inheritance from root metadata. Give `/` its canonical through a server wrapper around the existing client home, preserving auth behavior, JSON-LD, providers, fonts, theme script, `html.js`, analytics mounting and navigation.
- Give `/privacy` and `/terms` self-canonicals through the existing metadata helper.
- Remove canonical metadata from the **twelve** current suite child layouts: resume, ats-preview, pulse, interview-debrief, flashcards, job-search, upgrade, writing-tools, market-oracle, applications, intelligence and skill-bridge. Root removal alone does not fix these.
- Apply matching noindex response policies in Next and Firebase for the reviewed private shell/endpoint classes, including suite/admin/auth/settings. Validate ordinary and Googlebot responses, streamed metadata and header precedence. Keep the client `WorkspaceFrame`; avoid a broad layout refactor.
- Keep `public/robots.txt` as the single source; do not restore `app/robots.ts`. Preserve S0's explicit crawl-either policy until any safe-shell exception is separately justified. Authentication protects data; canonical/noindex are not authorization. Do not expose private content merely to let crawlers read directives.
- Verify legal/public self-canonicals, omitted private canonicals, effective private noindex and no excluded sitemap membership. Extend real response fixtures, including nested layouts, rather than relying on source regex only.

Google documents [noindex visibility to crawlers](https://developers.google.com/search/docs/crawling-indexing/block-indexing) and [canonical signals](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls). These inform route policy; no claim of indexing removal/ranking improvement follows from a local fix. GSC/GA4 results are unknown and outside deterministic acceptance.

The coordinator exclusively owns root/home metadata, `next.config.js` and `firebase.json`; coordinate with the existing SEO work before any edit. A route worker may own legal and the named twelve child metadata files only. No simultaneous writers on home, headers, global styles, rules or package scripts.

#### Reviewable candidate and publication boundary

Produce a **clean, reviewed candidate**, not a deployment from the changing shared tree. Record accepted source hashes/base commit, selected file deltas and dependencies. Use an isolated candidate checkout with reviewed packages; exclude unrelated agentic/dashboard/lifecycle work unless explicitly reviewed as a dependency. Stop integration when a source hash changed and reconcile that change before copying. Pin reviewed rules and indexes independently; never inherit them merely because the deployment runner reads them.

Run current candidate types/build, design, SEO fixtures/policy, release-safety, assistant, admin, email, observability, security and affected workspace/resume/source/export/emulator checks. Record actual counts and failures; historical page/test counts are not thresholds. Keep production canonical-origin semantics with local audit transport. Staging's intentional global noindex must be tested as staging policy, not misreported as failed public-production indexing.

Last verified production receipt was October 8 Firebase Hosting SSR: project `talent-consulting-acf16`, service `ssrtalentconsultingacf1`, region `us-east1`, build `SQ7GogDfLFZ6Ijo-P5LQh`, Hosting version `0d32e34d08bbe66f`, revision `ssrtalentconsultingacf1-00181-tor`. Re-read domain/Hosting/service traffic before any future publication; this is a dated receipt, not confirmation of current routing. `deploy-cloudrun.sh` targets another service and cannot be assumed to serve the domain. Staging is separate: project `talent-consulting-stg`, service `taco-upgrade-staging`; saved P1 revision `00003-f6p` does not certify this journey or configured providers.

**Critical rollback constraint:** the recorded `npm run deploy` runner (`deploy-fix.js`) deploys `hosting,firestore`; its automatic rollback restores Hosting and Cloud Run traffic, **not Firestore rules**. A source-service release must have a separately reviewed rules rollout/recovery procedure. Record previous and candidate rules/index hashes alongside Hosting version, immutable app/image/build identity, tags, traffic, public build-time env identity and verification receipt. No secrets enter the plan, patch or logs.

Stage the new source capability compatibly: reviewed deny-by-default rules → backend/read support → UI with source creation gated off → staging acceptance → authorized activation. The feature gate controls new source creation, not legitimate reads/account cleanup of existing sealed sources. Test N and N−1 app behavior: old readers may reject v2 honestly, but must not promote it or mutate it. Prepare a compatible recovery app before activation; rollback must preserve source immutability and usable receipts, not downgrade protections to make an old client work. Test the chosen activation flag's actual deployment/runtime behavior; `NEXT_PUBLIC_*` changes require a rebuild.

Publication is a later explicit execution step with a concrete candidate/receipt; this planning turn does not request approval or deploy. Preserve live-payment/email/submission holds. Check owner-dependent production credentials/MFA/recovery/observability approvals only for capabilities actually enabled, rather than assuming every old blocker is still missing. Revalidate time-limited security exceptions at release; an expiring advisory acceptance cannot become a permanent bypass. No allowance-threshold auto-deployment, reset or PC shutdown is triggered by this plan.

**Part 4 is accepted when:** bounded design and route-policy gates pass without weakened baselines; the candidate is clean and independently reviewed; UI/staging evidence matches its build; the serving target and separate rules recovery are verified; and publication, if later authorized, produces an exact deployment receipt plus live representative-route/SEO checks.

### Milestones, ownership and long-horizon execution

The four parts are the product scope; the milestones below are the dependency-aware build order. Design and metadata repairs can run alongside journey work only with disjoint ownership. Final acceptance waits for the integrated candidate.

| Milestone | Deliverable and exit | Dependency / owner |
| --- | --- | --- |
| M0 — Freeze and contracts | Refresh current source hashes; reconcile active owners; finalize source schema/API/shared-consumer integrity/hash/idempotency/rules and review-target contracts; identify approved erasure/retention and lifecycle fence; capture failing regressions. | First. Coordinator; no broad re-audit or UI rewrite. |
| M1 — Source foundation | Authenticated immutable source service, exact handoff read, sealed legacy snapshots, v2 validation through preparation/review/export, stable career/source replay and deletion fence; real auth/Firestore denial/concurrency tests. | M0. Coordinator owns consequential logic/rules; bounded builder assistance after contracts. |
| M2 — Résumé → roles → review story | Explicit source action, JD branch, consistent match hierarchy, correct application review routing, returning/error states and no-action Help chapters/anchors. | M1 contracts. UI builder owns declared page/component slice; coordinator integrates. |
| M3 — Acceptance and corrections | Six-width/two-theme native proof, keyboard/assistive-tech, failure/recovery/export checks; fix findings and confirm no-action Help. | M1–M2 integrated and permitted browser access. Coordinator + independent skeptic. |
| M4 — Design and SEO S1 | Three-file CSS repair and exact public/private metadata/header policy. Actual audits and relevant checks pass. | May start after M0 ownership agreement; exclusive CSS worker and metadata worker, root owns shared boundaries. |
| M5 — Reviewed release candidate | Isolated clean candidate, all current gates/native evidence, compatible source rollout, staging receipt and rules/app recovery rehearsal; concrete reviewable publication package. | M3 + M4. Coordinator adjudicates release readiness; publication only when authorized. |

Keep the current primary agent as architect, reviewer and ultimate decider. Under [long-horizon-build](/home/xwingace/.codex/skills/long-horizon-build/SKILL.md), prefer supported **gpt-6-luna** workers for bounded UI/CSS/test implementation, using fresh compact context. A worker's success report is not acceptance. An independent fresh-context skeptic attacks optional-saving side effects, source forgery, replay/ownership races, exact approval/export, hidden Help actions, mobile/focus and release/rollback assumptions. The coordinator checks each finding against code/reproduction and records **confirmed / refuted / duplicate / unresolved** with the reason.

Start with one UI builder; add another only for nonoverlapping work. A résumé-page writer and a Find roles writer must agree the contract first. Applications/review changes follow the routing contract; root owns shared registry/adapters until any explicit ownership transfer. The CSS package is independent of page writers; metadata ownership is independent of visual components. Workers are not alone in the codebase, must preserve others' edits, and must not revert, deploy, send messages externally or delegate further without a handoff granting that role.

Each handoff includes absolute checkout, milestone, allowed files, contract/decision pointers, preserved changes, acceptance commands, forbidden side effects and checkpoint path. Reuse a relevant builder rather than restarting a broad scan. Escalate architectural uncertainty immediately; after two focused failed implementation attempts, send the smallest reproducer/evidence to root or a supported stronger model. Do not repeat an unchanged cheap-model task indefinitely or promise a percentage allowance saving.

Root updates the existing checkpoint and project map after each milestone with actual changed paths, evidence, pending gates and next action. Do not count planning as implemented work. Parallel verification operates on an identified snapshot and avoids simultaneous build/type-check processes writing the same artifacts. Focused checks run while building; the integrated candidate gets full gates. Revise only the affected plan after a finding, retaining the approved story and invariants.

Independent plan review confirmed three gaps and the coordinator incorporated each remedy: mutable legacy reuse now requires a sealed snapshot; v2 source integrity now covers every downstream reader, not just GET; actual erasure/retention and deletion fencing are activation prerequisites. The fresh-context skeptic reread those revised contracts and M0/M1 and found no remaining concrete gap in that scope. It also prompted the explicit distinction between self-attested facts and known generated lineage. These are resolved **planning** findings, not tested implementation or native acceptance.

### Verification commands and definition of done

Use current `package.json` commands, not historic totals. At minimum the candidate must pass:

```bash
npm run type-check
npm run build
node scripts/design-audit.js --ci
npm run seo:audit:test
npm run test:tool-upgrade
npm run test:workspace
npm run test:workspace:rules
npm run test:resume
npm run test:resume-design
npm run test:resume-flagship
npm run test:release-safety
npm run test:assistant-harness
npm run test:admin-command-grid
npm run test:email-system
npm run test:observability
npm run security:cve:ci
git diff --check
```

Also run the existing lifecycle/source/guidance suites and the new service/replay/emulator tests for this slice; include their file list in the receipt so new tests cannot be accidentally omitted from aggregates. Configure emulators with demo IDs, isolated network/runtime configuration and synthetic data; copying production credentials into a clone is not isolation. Run SEO response audit using the existing explicit route-policy configuration and local transport with the production canonical origin, then a separate bounded live audit after any approved publication. Shell/browser tools remain subject to current tool security restrictions.

This slice is done only when code, source/auth/truth boundaries, the whole native journey and the reviewed release candidate meet their exits. The coordinator's final report distinguishes implementation, local gates, browser cases, staging canaries, deployment and unknown results. No “perfect,” “enterprise-certified,” measured conversion uplift or search-indexing claim substitutes for that evidence.

**Next build action:** read the checkpoint and this section, reconcile current page/rules/SEO owners and source fingerprints, then execute M0 followed by M1. Do not start Interview prep, full SEO expansion or another template collection before closing this foundation's accepted scope.
