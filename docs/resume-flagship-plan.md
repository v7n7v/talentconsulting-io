# Taco résumé flagship — quality and build plan

Prepared October 8, 2026. **Current status: Gates 0–4 implemented and accepted for the tested professional résumé scope.** See [the completed build report](reviews/resume-flagship-2026-10-08/build-report.md) for final decisions, evidence and limits. The following preserves the original planning contract and its decisions at each earlier stage; historical statements about no implementation describe those stages, not the current build.

The user asks whether to plan first and requests a delegated builder, an independent skeptic, and the coordinator as final reviewer/decider. Use the existing custom résumé foundation to develop one original flagship with a demonstrably better document and editing experience. Existing dashboard work, saved résumés, template entitlements, source facts, and review boundaries remain intact.

## Outcome and product scope

A professional can import or enter their résumé, see its source facts intact, produce a polished original document, make a targeted design change without searching a large settings panel, inspect the actual exported pages, and save/reopen the reviewed version.

The initial audience is mainstream professional and technical applicants. Early-career and long-experience cases test resilience; a full academic CV is a stress case rather than a promise that one flagship replaces every specialized layout. Working name: **Taco Signature**. This name is a hypothesis, not a twenty-first public catalog entry.

Quality is demonstrated with the same fictional candidate content across the current Technical Signal/Editorial Signature baseline and the new flagship. A font swap, new palette or extra motif alone does not satisfy the outcome. A successful result needs both a materially improved composition and a useful editing/export improvement.

The current 20-layout v2 system supplies typed settings, bundled fonts, source-preserving document plans, PDF/Word adapters, recovery and export signatures. Existing passing tests prove specific contracts; they do not prove exceptional design or ease of use. The current UI uses a continuous HTML editing view and an explicitly generated PDF view. That difference must remain visible until a single measured preview/export system is demonstrated.

## Team and authority

| Role | Owner | Responsibility |
|---|---|---|
| Coordinator, reviewer and final decider | Primary agent | Product scope, contracts, integration, final browser/PDF review, acceptance decisions and checkpoint. |
| Builder | GPT-6 Luna, `template_design_panel` | Feasibility first, then bounded implementation packages with explicit file ownership. Supply actual artifacts and checks; do not self-approve. |
| Independent skeptic | GPT-6.1, `resume_flagship_skeptic` | Challenge assumptions and rendered output independently. Report reproducible defects, evidence limits and proposed remedies. Do not implement the fixes or quietly rewrite the spec. |
| Project mapper | Native `project-map` role | Track evidence, remaining gates and decisions within `.project-map/`; preserve the existing dashboard map. |

The coordinator classifies every skeptic finding as accept/fix, test the hypothesis, justified tradeoff, or out of scope. Decisions include evidence and the remaining limitation. Open data loss, incorrect attribution, unreadable/overlapping export, owner isolation failure, or an inaccessible required interaction blocks acceptance. Aesthetic disagreement is discussed using specific examples and the intended audience. No arbitrary numerical score overrides a failed integrity check.

## Proposed document direction

Start with a calm editorial document: white paper, near-black text, one restrained accent, a deliberate name/title hierarchy and a consistent body measure. Taco's visual identity belongs to the surrounding editor; the candidate document carries the candidate's identity and supplied links, with no automatic Taco logo or watermark.

The composition hypothesis is a single sequence of résumé content with a narrow section-label gutter on wide paper. Each label stays associated with the corresponding section; role, employer and dates form a coherent metadata group before achievements. Supporting information uses compact, readable groups, rather than decorative proficiency meters or invented outcome cards. Removing accent color must leave the reading hierarchy clear. The application export places conventional headings above one full-width content flow.

This gutter is an experiment, not a settled layout. The skeptic must check its reduced line measure, long heading behavior, extraction order and pagination. If it cannot outperform a conventional full-width composition using actual documents, the coordinator selects the simpler composition and records the evidence. The flagship must not invent facts to make its visual design work.

Use bundled, licensed font pairs. Start around 10.5–11.5 pt for body text, readable contacts and restrained heading sizes. Identity and contact blocks wrap safely. Do not force every résumé to one page by hiding content, compressing text without consent or silently lowering type sizes.

## Proposed editing experience

1. **Choose a section on the editing document.** Mouse and keyboard selection identify the same stable section ID and reveal a small contextual panel. An equivalent section list remains available on mobile and by keyboard. Selection itself never changes source content.
2. **Change the selected section.** Show its relevant typography, visibility, placement and break controls with a clear return to global settings. Unsupported properties are explained or hidden, not silently accepted.
3. **Understand page fit.** Show page size, actual generated PDF page count, hidden-section inventory and warnings associated with the current source/design signature. Changing content or design makes previous PDF results visibly stale and prevents stale-byte delivery. PDF generation failure gives a retry path without losing edits.
4. **Inspect and export.** The user can distinguish the editing view from actual PDF pages and choose designed or single-column application output. A reviewed download uses exactly the artifact that was inspected. Word remains an editable linear companion unless separately rendered and verified in Word; pixel-identical pagination is not promised.

On-page selection starts in the HTML editing view. Selecting a canvas pixel in the PDF viewer is not claimed to provide accurate section selection. A PDF overlay requires a measured section manifest and a separate proof before implementation.

Readability and layout warnings must appear at the relevant editing control and in an always-visible pre-export summary; they cannot live solely inside a collapsed Color panel. Call a section-gap shortcut “section spacing” unless it actually adjusts the declared density factors. A claimed page-fit suggestion must use current measured pages and preserve user control over any reduction.

## Compatibility and isolation decisions

- First prototype: a development-only flagship lab, with fictional fixtures and explicit experiment labeling. No public catalog ID, entitlement change or persistent record migration in the composition experiment.
- Verify the prototype is unavailable in a production build through a server/build-side route guard. A hidden navigation link is insufficient. Prototype save/linked-application actions remain unavailable; an experimental download is never presented as a durably saved flagship record.
- Reuse `buildResumeDocumentPlan` and canonical source facts. A proposed renderer does not receive permission to normalize away unrecognized supplied fields or omit source records.
- Keep existing v1/v2 rendering paths and export signatures. A later opt-in flagship renderer needs explicit version dispatch, a validated persistence envelope and regression coverage; it must not be smuggled into an old `rendererVersion: 2` record by changing a preset.
- Before production integration, record whether one existing selectable slot gains an opt-in variant or another launch mechanism is warranted. Default is to retain the 20 public templates until this decision is justified.
- The coordinator owns changes to `app/suite/resume/page.tsx`, upload/recovery state, persistence, generation snapshots, account ownership, linked application exports and shared contracts. The builder can propose changes to these interfaces but cannot expand its file ownership without a specific handoff.
- No dashboard changes, deployments, shutdowns, purchases, new cloud services, uploaded user fonts/images or third-party source-code copying are part of this phase.

## Build packages and review gates

### Gate 0 — Agree on the build contract

Inspect current code, read builder feasibility and independent skeptic findings, resolve missing interfaces and save the coordinator decisions. Distinguish established facts from hypotheses. Preserve the existing dashboard map and user choices. Deliver this reviewed plan, the ownership split and an evidence-based first build package.

### Gate 1 — Original document prototype

**Prerequisite R0 — repair proven foundation export failures.** The skeptic has reproduced a missing education year when the degree/title is blank, clipping of an oversized unbroken name, and truncation of an unusually long uninterrupted URL. These are accepted integrity defects, not design preferences. First builder package owns `lib/resume-design/pdf.tsx`, any narrowly necessary text-layout helper, and focused export regressions. The coordinator reviews geometry/content preservation, the chosen name/URL wrap behavior, and changes to the old v2 path. A long-token fix must not restore ordinary-name fragmentation or silently reduce user-selected type size. Source strings and normal copy/paste remain recoverable. Unsupported glyph handling must be explicit; comprehensive multilingual support remains outside this initial font set. Confirm exact reproductions against the retained skeptic evidence before fixing.

Builder owns new isolated flagship component/styles and a development-only lab; exact paths follow feasibility review. The prototype shares source planning and licensed fonts but implements its own deliberate composition. Coordinator verifies real PDFs and all source fields. Skeptic examines first impression, hierarchy, reading measure, spacing, grayscale, sparse data and every page of long examples.

Deliver comparative artifacts from identical content: current baseline and flagship, A4 and Letter, full/sparse/long examples. Also exercise long names, uninterrupted links, long employer/role labels, additional sections, hidden sections and an intentionally oversized single entry. Add graduate and academic cases where they challenge the intended limits. Unsupported scripts need a disclosed limit rather than a multilingual coverage claim.

Specific additional cases: incomplete education records, a long role continuing onto the next page, supporting content overflowing alone, no supporting content, repeated section labels, very long custom headings, and sparse content with one meaningful section. Inspect each page independently for intelligible role/section continuity, rather than treating aggregate page count as a quality score. Produce a grayscale view of the designed output, not only a separate application export.

Acceptance requires a useful visible difference beyond decorative tokens, coherent role metadata, readable type, no overlap/clipping/missing fields, stable extraction order and no redundant near-empty final page caused by an avoidable keep rule. Content that genuinely needs a second page remains on a second page.

### Gate 2 — Contextual editing and current page feedback

Builder implements bounded section-selection/context UI after the coordinator fixes its props and state ownership. Coordinator integrates the existing studio state and PDF artifact lifecycle. Render completion order must not let an obsolete job replace a newer preview. Undo/recovery semantics include both contextual and global edits.

Demonstrate a fictional user selecting Experience, changing its typography or break, undoing, hiding/restoring a section, changing page size, inspecting the actual PDF, encountering a failed preview and retrying. Exercise keyboard-only selection and a 390 px mobile viewport. Required controls remain reachable and readable with no horizontal page overflow or keyboard trap. Source facts remain identical throughout presentation edits.

### Gate 3 — Opt-in persistence and export integration

Coordinator implements reviewed version dispatch and save/reopen/linked-export boundaries. Builder handles only separately assigned UI and adapter packages. Demonstrate a new flagship record round trip, an old v1/v2 record unchanged, owner changes without state leakage, a template switch, an in-flight preview invalidation, and the reviewed-byte download. Generation/tailoring identity must remain separate from presentation changes.

Additional items and credentials currently permit positional references. Reorder and delete such an item after setting an entry break, then verify that the break remains associated with its intended source record or is explicitly invalidated. Never transfer it silently to a different item. This is a targeted persistence hypothesis, not an established current failure.

### Gate 4 — Independent challenge and final decision

Skeptic receives actual artifacts and code from the same final revision, not only a builder summary. It reports reproduction, evidence, impact and severity. Builder resolves accepted defects; coordinator reruns affected checks, inspects real browser behavior and every stress-document page, then records pass/fail with any explicit limitations. A new revision invalidates affected earlier evidence.

The remaining 19 layouts are considered only after the flagship passes these gates. Broad catalog rollout is a separate work package, not a reward for having written a prototype.

## Evidence and completion rules

- Retain fixtures, source hashes, settings, tool/renderer versions, real PDFs, extracted text/order checks and actual-page screenshots for each reviewed revision.
- Quantitative checks cover included-field preservation, attribution/order, bounds/page count, contrast on actual surfaces, artifact identity and compatibility. Existing suites run where contracts change; tests must target meaningful failure modes rather than repeat the implementation.
- Human/agent visual review covers hierarchy, scanning, measure, rhythm, sparse balance and long-page continuity. Comparable documents use the same content; source repositories and project stars are references, not proof that Taco outperforms them.
- Product claims stay narrow. Text extraction tests demonstrate tested reading behavior, not compatibility with every employer ATS. A successful build is not automatically an open-source release or deployment.
- The final report states what was built, what was verified, what remains limited, and the local preview. Planning and feasibility documents never count as shipped flagship code.

## Review records

- Builder feasibility: `docs/reviews/resume-flagship-2026-10-08/builder-feasibility.md`.
- Independent skeptic: `docs/reviews/resume-flagship-2026-10-08/skeptic-review.md`.
- Coordinator disposition: to be recorded below after both reviews.
- Existing baseline: `docs/reviews/resume-templates-2026-10-07/build-report.md` and `evidence-v2/`.

## Coordinator disposition

Builder feasibility inspected. Accept a private experimental composition adapter using the existing ordered document plan. Experiment selection is route-local and included in artifact/cache identity; it is not written into `ResumeDesignConfig`, account documents or generation snapshots. Initial contextual controls are design-only; direct content editing remains a separate, deliberate action in the existing editor. Page count is measured from the generated PDF; semantic section-to-page mapping is deferred until a measured manifest exists.

Accept the skeptic's three reproduced export content failures as prerequisite R0. Earlier 60-fixture checks remain valid for those tested inputs, but do not establish arbitrary-token or incomplete-record resilience. No flagship acceptance is inferred from the previous suite count. Mixed-script font support is a known limit; silent missing-glyph output needs detection or an explicit supported-font remedy before such a document can pass the export gate.

The section-label gutter remains a testable hypothesis. The first comparative artifact must show whether it improves scanning without sacrificing useful line measure or text order. The builder's conventional full-width proposal is the fallback. Keep the same candidate facts in both compositions.

Accept warning discoverability and misleading density scope as concrete UI concerns for Gate 2. Accept continuation/grayscale checks as explicit Gate 1 visual evidence. Accept positional entry-break reassociation as a hypothesis requiring Gate 3 tests, without claiming a reproduced ownership or persistence leak. Preserve exact PDF-byte review and legacy fallback rather than rebuilding those already useful contracts.

Independent review completed and accepted for Gate 0. The coordinator inspected both reports and the retained source-hashed reproductions. Adopt the skeptic's additional acceptance conditions: production route guard, complete composition/mode cache identity, no ephemeral-to-durable save ambiguity, truthful one-column controls, and source-switch/hidden-section focus behavior. The proposed visual design remains unproven until Gate 1 evidence exists. No implementation gate is marked passed.

Selection contract: selecting a visible section reveals its contextual controls. Hiding that selected section retains its settings in a separate hidden-section inventory and returns selection to global controls, with a clear status announcement; focus stays on the initiating control or a named restore control. Restoring/undoing can reselect its stable ID only if it exists in the current source inventory. Replacing the source clears selection unless the exact stable source/section identity remains valid. No selection outline, experimental badge or editing control enters the candidate's PDF. A single-content-column experiment does not offer a rail placement choice that has no effect.

Decision: proceed from this reviewed plan to bounded R0 implementation and independent re-verification, then the private original composition prototype. This decision approves the implementation order and quality contract, not production release or a claim that the new flagship is already built.

Review evidence: `docs/reviews/resume-flagship-2026-10-08/evidence/reproduce-foundation.cjs` and `foundation-reproductions.json` retain exact fixtures, source hashes, dependency versions, extracted text and page bounds for both designed/application PDFs. The disclosed font limit remains an input-specific export condition to handle before accepting such output.

## First implementation handoff after Gate 0

The coordinator hands off R0 with synthetic fixtures and exact assertions from the skeptic. Builder reports changed files, targeted checks and retained PDF evidence. Skeptic reruns the independent reproductions; coordinator accepts or returns the fix. Only then dispatch the isolated composition package:

- Builder owns new `components/resume-templates/flagship/` and `lib/resume-design/flagship-pdf.tsx` modules; a development-only `app/resume-flagship-lab/` is permitted once its production guard is reviewed. No shared schema/catalog mutation.
- Shared input is the validated `ResumeDocumentPlan` plus derived layout tokens. Interaction props are `selectedSectionId: string | null` and `onSelectSection(id: string): void`; only IDs actually present in the current plan are selectable. A keyboard-operable section list selects the same ID. Selection presentation never enters PDF content or source facts.
- The experiment's `composition: 'standard' | 'flagship-experiment'` discriminator lives at an explicit preview/export boundary and participates in artifact identity. The coordinator owns modifications to shared export plumbing and the large main studio page. The builder does not independently add state or persistence fields there.
- Contextual design changes reuse a single validated design-update path. Source résumé fields, AI proposal decisions and review acknowledgments are unchanged. Undo/redo and current-selection behavior on hide/reorder/source switches are specified before integration.
- Fixture proof includes full/sparse/long, A4/Letter, section/entry breaks and R0 edge cases. No normal local preview depends on external services for this experiment. Only fictional content is used in retained review screenshots.

No product code changes are part of this completed Gate 0 planning record. The first code package is specific and its prerequisite reproduction evidence is saved. Gate 1–4 completion requires implementation and verification, not further planning claims.
