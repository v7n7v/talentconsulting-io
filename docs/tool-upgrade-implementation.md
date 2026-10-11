# Taco tool upgrade — implementation and review

## Current core journey build — 10 October 2026

User authorized the [four-part plan](tool-upgrade-plan.md#core-journey-implementation-plan--9-october-2026) with “Let’s begin.” Local implementation and coordinator/independent source review are finished. Native UI acceptance, production activation and a clean release candidate remain open. [Checkpoint](../.codex/long-horizon/tool-upgrade.md); [current evidence](../.ui-verify/core-journey-2026-10-10/validation.json); [guided journey map](../.project-map/guided-tool-dna.html).

- **Résumé facts → exact Find roles source:** authenticated bounded creation/read API, immutable owner-bound sealed source/receipt, explicit canonical and packet hash encodings, payload-bound response-loss replay, durable account-deletion fence and shared integrity across search/preparation/review. Career saving is independent. Imported facts, authored edits and saved legacy facts require deliberate confirmation. Generated versions use only a verified retained original; manual edits cannot erase generated lineage. Malformed seals fail closed. The existing career-save retry also preserves original provenance timestamps.
- **Three useful matches → actual draft review:** all widths initially show three matches, with explicit expansion. `?source=` selects only a successful exact read and retains retry context on failure. Optional browser caches cannot revoke a successful read. Preparation leads to the actual application’s review. Pasted-JD tailoring remains prominent. Revision approval, download and the user’s statement of manual submission remain distinct.
- **Review and Help:** source/prepared-document comparison, exact approval and fresh owner/revision/hash-bound PDF/Word export checks. The truth boundary blocks a changed approved document; the default Word path now retains links, education details, certifications and additional sections, verified in actual generated DOCX XML. State-aware Help explains real loading, error, review and next-step states without workflow callbacks. Native focus/keyboard/action-safety acceptance remains unverified.
- **Bounded design/SEO S1:** three CSS repairs use existing tokens; unchanged audit scanner/baseline pass at 25 distinct hex, 40 occurrences, 15 token definition files, 174 prohibited occurrences and zero contrast failures. Home metadata is server-owned with its original client body preserved; legal routes self-canonicalize; twelve suite child canonicals are removed; matching Next/Firebase private headers are present. A built-response check additionally found the suite base’s inherited HTML `index` directive. Its layout now owns private metadata while preserving the same client WorkspaceFrame and Help providers.

Local checks on synchronized lockfile dependencies (Next 16.3.8; package files unchanged):

| Evidence | Result |
| --- | --- |
| Production build / TypeScript | Pass; 201 static pages. Existing Google Sans Flex override warnings remain; this is not clean native-console proof. |
| Journey/source/route/replay/export/metadata contracts | 76/76; includes actual handlers and generated DOCX contents. |
| Real local Firebase Auth/Firestore rules and service tests | 23/23; emulators stopped cleanly. |
| Workspace / experience / résumé design / flagship | 280/280, 61/61, 21/21, 22/22. |
| Release safety / assistant harness / admin / email / observability / upgrade | 264/264, 331/331, 35/35, 60/60, 31/31, 56/56; suites overlap. No live email/provider/payment/submission. |
| Anonymous responses from the built server | 50 policy checks across public/private base/child routes, ordinary and Googlebot. No private body saved. Separate from native UI and deployed Firebase proof. |
| SEO audit fixtures / scoped new-code ESLint / whitespace | 34/34 / pass / pass. Live production SEO CI still fails with 10 critical route-policy incidents; local repairs are not deployed. |
| CVE CI | Pass, zero new high/critical findings; one preexisting accepted development `braces` advisory expires 15 October 2026. This is not zero vulnerabilities. |

The first integrated runs exposed stale test seams and an installed-versus-lockfile dependency mismatch. The fixtures now assert the new invalidation/provenance seams; `npm ci --ignore-scripts` synchronized dependencies without changing manifests. Final gates ran afterward. Independent review’s concrete legacy/generated promotion, malformed-envelope fallback, optional-cache and Word-omission findings were repaired and reread as resolved at source-review level.

**Activation/release limits:** `RESUME_SOURCE_CREATION_ENABLED` is false and no retention-policy version is configured. New cloud source creation requires an approved actual retention/erasure procedure (including local caches), active provisioned `account_source_fences/{uid}` and independently reviewed rules rollout/recovery. The current account lifecycle only records deletion intent; no eraser or fence provisioner was added. Exact existing sealed receipts can replay after rollout disable, but the source service denies reads/creates for deactivated or deletion-fenced accounts and cannot revive an erased source. This is not a claim that existing client reads or all other APIs implement account erasure. Synthetic demo sources remain local-only.

Native computer-use still sees stale error documents after protocol binding denial. There is no new screenshot, six-width/two-theme/focus/console/overflow proof, provider canary or fresh-user study. No security workaround was used. The shared dirty tree includes unrelated work; no clean candidate, commit or deployment was produced. Before-files and selected deltas/fingerprints are recorded separately; never publish the whole dirty Firestore rules file.

Preview: `http://127.0.0.1:3102/suite/resume`, development-only synthetic workspace with API proxy protections and `.next-workspace-preview` output. Log `/tmp/taco-core-journey-preview-20261010.log`. The temporary production HTTP server and Firebase emulators are stopped. Resume with permitted native acceptance, actual activation procedure and isolated candidate review; do not equate local checks with launch readiness.

---

## Earlier implementation — September 28, 2026

Implemented September 28, 2026 in `/home/xwingace/Documents/Projects/Taco-upgrade`, branch `codex/taco-upgrade`. The user authorized the build after reviewing the [upgrade plan](tool-upgrade-plan.md). The original `Taco` checkout and unrelated admin brainstorm were not edited. Existing folded-A branding and the approved paper, ink and coral design were retained.

This report separates implemented behavior, local verification and live-service release gates. It is not a claim that mocked providers or fictional preview data prove production behavior.

## What changed

The five primary destinations remain Home, Your experience, Find roles, Applications and Interview prep. Packet review now lives under Applications; role analysis and preferences under Find roles; Results and Weekly review under Career insights. Old URLs forward through an allowlist that preserves supported record identifiers and filters. Dormant weekly-pick panels were removed after checking callers; active search and notification services remain.

Shared context is now keyed by account and workflow/application. Inputs, settings, outputs and pending operations have explicit ownership and revision checks. An existing letter for application A is not overwritten by work on B. Explicit cross-tool handoffs refresh the chosen destination, preserve its settings and mark dependent prior results stale. Ownerless legacy drafts are quarantined. Public writing handoffs require an explicit, recent handoff for the matching owner; guest import is a separate action.

### Tool coverage

| Tool or workflow | Implemented behavior |
|---|---|
| Resume / Your experience | Accurate device/account/AI-processing copy; reviewed source and export guards retained; source classification rejects optimized/generated drafts as facts; Save & Track retains its owner-bound recovery receipt across reload; concurrent tracking uses an atomic, source-and-role-specific identity. |
| Resume checks / ATS aliases | Clear educational/structural scope, explicit source selection, no silent latest-resume fallback; safe edits preserve content and have revision-bound undo. Real ATS vendor parsing is not claimed. |
| Cover letters | Selected source required; source-preserving letter structure, editable output, meaningful style/ordering controls, stale-response suppression. Unsupported achievement generation is not accepted as evidence. |
| LinkedIn | Profile context and edits persist separately; AI selects supplied evidence and the server constructs the output from that evidence. No hidden latest-resume source. |
| Ask Taco | Conversation/account/source guards; accurate per-message allowance wording; atomic reservations and input-bound request receipts prevent concurrent overspend; successful retries replay saved responses; failures release capacity. Expired unknown operations are not silently rerun. |
| Find roles | Shared packet-result validation, explicit partial-work recovery, preference/notification consent retained; disabled provider fallback cannot turn an upstream failure into a healthy empty search. |
| Role analysis | Server resolves the chosen confirmed source and returns its hash. Preparation checks that same source; edited inputs stale the report. Pasted text can be analyzed but cannot silently prepare from a different saved resume. Unsupported salary estimates are omitted; preparation heuristics are not hiring probabilities. |
| Applications | Direct manual tracking without generation or Max; actual sent date; payload-bound retries; source-linked concurrent tracking deduplication; selected-application/account guards on drawer actions; notes cannot revert newer status. |
| Draft review | Existing source inspection, Max entitlement, server approval, exact-revision review and unsent-tracker boundaries retained; owner and operation guards added around queue actions. |
| Offer planning | User-entered currency/pay period and preferences replace fabricated market ranges. Accepted/declined decisions and history save together. Optimistic signatures reject stale edits/briefs; legacy unproven briefs are not shown as current. No negotiation message is sent. |
| Application results / Weekly review | Shared mixed-schema reader includes snake_case and camelCase records; submitted cohort excludes drafts; historical interview/offer milestones survive later statuses; missing submission/interview dates remain unknown. Failed or malformed reads show retry/stale states, not zero-data assertions. |
| Career insights | Owner-bound overview/outcome loads, visible errors and retry; Results and Weekly review embedded with compact headers. Existing analytics/outcome capabilities retained. |
| Network | Failed interaction saves retain exact notes; payload-bound retry deduplicates; stable pagination reaches contacts past 100; loaded counts are honest; invented relationship scores removed; deletion confirmation and dialog focus/Escape/return behavior. |
| Interview prep | Quick typed drill remains default. Authoritative session reservation, saved transcripts before grading, same-session retry, validated full grades, explicit owned-story selection, scoped unfinished-answer recovery, exact session/deck continuation. Inert configuration removed. |
| Live interview | Token/socket/microphone cancellation and reconnect cleanup hardened and tested with controlled media/socket substitutes. Avatar presentation remains unavailable; no real microphone/provider validation was performed. |
| Real-interview reflection | Kept separate from practice; saving a reflection no longer automatically promotes answers into experience claims. |
| Story bank | Owner-checked manual/assisted routes, editable extracted STAR review, derived metadata protection, exact story reads and owner/filter-bound pagination beyond the former 120-record boundary. Assisted extraction currently uses explicitly pasted source material. |
| Learning plan | Immutable plan/task identifiers and expected-version progress; regeneration resets progress and archives the prior plan. Full task/resource/effort material is displayed; failed saves do not claim success. |
| Practice challenges | Server-owned prompt/rubric/attempt; validated assessment saved atomically with progress; provenance distinguishes legacy heuristics from current assessments; latest, best and stale results are separate. Practice assessment is not a credential. |
| Learning notes / Memory | Owned full-note reads, stable pagination and original saved-card continuation rather than regeneration. Legacy global handoff keys are not silently imported. |
| Writing workspace | Full source/output/settings/check/session recovery; explicit save failure status; optimistic transactional cloud saves; separate draft identity after Clear; edits invalidate earlier checks; original text retained. |
| Gallery / public writing | Output schemas for individual tools, deterministic shared word counting, per-tool source/result state, visible controls affect requests, stale completions rejected. Public writing-pattern checks are bounded and are not authorship/originality proof. |
| Job description writer | Compensation opt-out enforced after provider output; templates can be searched, reopened and updated without creating a replacement identity; metadata allowlist and owner checks. |
| Profile / Settings / Help / Feedback | Phone/bio persistence, owner-bound load/save guards and retry, dirty profile draft retention across tabs/reload, fresh server baseline; full accepted 5,000-character feedback preserved with receipt/partial-delivery states. Help and lifecycle copy match actual behavior. |

## Verification

Final results are recorded below; overlapping suites are listed separately, not added into a misleading total.

| Check | Result |
|---|---|
| `npm run test:tool-upgrade` | 111 focused behavior tests passed across 21 files. Loaded handlers/components, controlled deferred operations, provider failure/malformed output, source isolation, persistence/retry, quota, pagination and learning versions. |
| `npm run test:workspace` | 249 passed. Includes packet ownership/entitlement/review, source intake, application outcomes, resume truth preservation and workspace navigation regressions. |
| `npm run test:upgrade` | 52 passed. Existing design, landing and plan/outcome packaging checks retained. |
| `npm run test:workspace:rules` | 15 passed against local Auth/Firestore emulators. Includes forged authoritative-record denial, valid learning updates, 252 mixed-schema records across query pages, concurrent actual offer transactions, and concurrent source-linked tracker creation with preserved history. |
| Search/widget/consent focused batch | 46 passed; actual widget hooks prove no subscription write before explicit opt-in and preserve partial-search results. |
| Utility/profile/rendered-email batch | 23 passed. No email sent. |
| TypeScript | Clean with `npx tsc --noEmit --incremental false`. |
| Design audit | `node scripts/design-audit.js --ci`: no metric regressed; baseline was not relaxed. |
| Scoped ESLint | Clean for new application commands/readers, resource hook, corrected Results/Pulse and offer routes. This is not a claim that the repository's pre-existing broad lint baseline is clean. |
| Production build | `npm run build` passed, including TypeScript and all 199 static pages. |
| Whitespace check | `git diff --check` passed after final integration. |

### Browser review

Used a separate local review tab, preserving the user's existing tab. Preview APIs remained loopback-only, explicitly fictional and blocked from external services.

- Applications rendered at desktop, 390px and 320px; measured document width did not exceed the viewport. Removed duplicate application navigation rows.
- A blocked manual save preserved company, role and date and showed the actual preview error.
- A named writing editor saved a fictional draft locally and recovered the exact text after reload. The save indicator is visible outside advanced settings. Review text was cleared afterward.
- Results displayed the canonical fictional submitted cohort and historical milestones; narrowed screens remained usable. Embedded headers were compacted.
- Role-analysis source setup and Interview prep rendered at 390px without horizontal document overflow. Browser inspection found unnamed source fields and misleading unavailable-context captions; these were corrected.
- Network failure was a visible failed read with Retry. Add-contact dialog kept reverse-Tab inside, Escape closed it, and focus returned to Add contact.

These are targeted visual/keyboard checks, not a formal accessibility certification or a completed fresh-user study. Provider-backed successful workflows are primarily covered by controlled route/handler tests and the listed emulator checks, not by bypassing the preview's safety boundary.

## Deliberately unavailable or still requiring live verification

- Account export job delivery, push notifications, avatar display, real ATS-vendor/exported-file parsing and operational account suspension were not invented. Controls/copy now state the actual scope. Optional-email pause and queued deletion are not described as immediate account deletion or disabled sign-in.
- Assisted Story extraction works with pasted material and editable review. A saved-source picker is an optional enhancement; no missing picker is represented as an existing capability.
- Before deployment, use isolated staging accounts to verify real auth/account switching, indexes/rules deployment, durable Firestore integration, real provider latency/malformed responses and quotas, actual PDF/Word download fidelity, microphone/devices/reconnect, billing test mode, email sandbox/outbox, consent withdrawal and lifecycle processing.
- Run fresh-user task sessions for source confirmation, manual tracking, reviewed packet preparation, saved practice feedback, note recovery and failed-save recovery. No usability scores were fabricated.
- No production deployment, real account lifecycle action, email, payment or real microphone/provider session was performed.

## Review and continuation

A subsequent [Humanizer-specific review](humanizer-review-2026.md) found additional release blockers in rewrite quality enforcement, scoring, mobile actions and metering. The successful tests above remain evidence for their tested contracts; they do not establish Humanizer readiness or competitive output quality. See that review before live staging.

A subsequent [Market Oracle and Career Intelligence review](oracle-career-intelligence-review-2026.md) found additional gaps in evidence grounding, Twin freshness and integrity, metric consistency, and cross-tool ingestion. Controlled reproductions and a proposed upgrade sequence are saved with that review. The follow-up fixes and their expanded validation are now recorded in [the three-tool implementation report](humanizer-oracle-career-implementation.md). The earlier successful checks alone did not establish those contracts.

Local review command: `npm run preview:workspace`. The preview was restarted after the successful production build. Open `http://127.0.0.1:3101/suite/applications`.

The isolated preview intentionally blocks most writes to server-backed services. A displayed preview failure is not evidence of a production failure or of successful live persistence. Use the controlled tests and staging gates above for those contracts.

The [original audit](tool-audit.md), [implementation plan](tool-upgrade-plan.md) and this report form the handoff. The plan's old “plan only” preamble describes its preparation stage; the user's later instruction authorized this implementation. Existing public prices, allowance amounts, packet entitlement and manual-submission distinctions were preserved.

## Find roles local upgrade — 8 October 2026

Find roles now ties visible packets to the selected résumé content and exact job description, guards late completions across source/account/role changes, and keeps submitted search context separate from editable fields. Preferences hydrate without closing Controls; successful explicit saves apply only to the unchanged draft. Failed source reads and rejected saves offer clear recovery. Mobile role titles and salary values remain readable, filtered-empty results have a direct reset, and pending or missing evidence is not simulated as complete.

Root validation: **52/52 focused checks**, final type-check/build, SEO and broad release/assistant/admin/email/observability/CVE checks passed. Real browser review covered all six required widths in both themes, plus narrow Controls and failure states. The final normal result run had a clean console and no horizontal overflow. A fresh independent skeptic reviewed source ownership, auth intent and preference lifecycle; behavioral regressions cover delayed source/JD/role transitions and overlapping preparation requests in both response orders. The final request-revision guard also prevents an older success from replacing a newer failure.

The global design audit remains blocked by its pre-existing three baseline failures; this task introduced none. Local preview data is fictional and external services remain blocked. Real match quality and durable provider/Firestore/auth behavior require staging. No deployment was performed from the shared dirty checkout.

Detailed decisions and evidence: [Find roles checkpoint](../.codex/long-horizon/find-roles.md) and [responsive browser measurements](../.ui-verify/find-roles-2026-10-08/responsive.json). Local review: `http://127.0.0.1:3102/suite/job-search`.

### Find roles design follow-up

The requested visual revisit recommends one focused design pass before the next section. The existing paper/grid direction is coherent, but duplicated navigation, title statistics, nested filter surfaces and tall role cards delay the useful choices. Live 320px review placed the first role title 1323px below the document start after excluding the fictional preview banner. Proposed refinements: a compact integrated heading/navigation, quieter results toolbar, concise comparison cards, evidence before feedback, and consistent shared panel geometry. Preferences also needs fewer nested/stretch-filled panels and one clear setup summary.

This is a completed review, not a shipped redesign. No product code was changed. Current mobile checks did not confirm the suspected floating-assistant overlap. Source-backed findings, independent critique and future acceptance are saved in the [Find roles checkpoint](../.codex/long-horizon/find-roles.md).

### Find roles screenshot fixes

Two subsequent user-reported defects are fixed locally: the résumé-picker magnifier has a reserved input inset, and section links have strong token borders plus a visibly filled current view. Picker details and Selected/Use badges no longer compete for horizontal space; desktop popovers stay at least 320px wide. Routes, source eligibility and request protections are unchanged.

Final type-check/build, 52 focused checks and whitespace checks pass. All six required widths in both themes retain core results with no horizontal overflow; the picker has 9–10.5px icon/text separation and a badge below its details. The console is clean, and the global design audit has no additional regression. Wider design proposals remain unimplemented. [Final browser evidence](../.ui-verify/find-roles-2026-10-08/picker-fix/responsive-final.json) and [visible fixes](../.ui-verify/find-roles-2026-10-08/picker-fix/fixes-final.jpg) are saved with the checkpoint. No deployment was performed.

## Guided tool experience DNA — 9 October 2026

The approved [tool-experience standard](tool-upgrade-plan.md#guided-tool-experience-dna--9-october-2026) is implemented locally. **Browser acceptance is still pending.** This is an implementation and source/test review result, not a completed visual, accessibility or fresh-user assessment.

The working principle is one working brief, one current task and one honest outcome. Tools retain their actual editing, comparison, practice and recurring-review loops. Guidance explains those workflows rather than forcing six panels or a mandatory wizard.

### Implemented behavior

One shared controller owns contextual Help inside the workspace. The header icon opens a named, nonmodal guidance region for the tool's current state. Back/Next advances explanations; Show target scrolls to a real semantic anchor. A readable workflow overview uses the same region. A dismissible first-use invitation never starts automatically; only owner/tool/version guidance preference is remembered in session memory.

Tool adapters describe actual waiting, pending, blocked, stale, failed and retained-result states. Reading the final explanation changes no business status. Guidance has no generation, search, save, export, approval, payment, source-change or stage-navigation callback. Existing actions remain explicit choices through their existing handlers. Account, source and record changes invalidate obsolete guidance without restoring old work or stealing focus from an editor.

Help also works inside explicitly identified workflow drawers, opened from their internal Help button. Its note and highlight belong to that drawer; additional auth/approval/payment modals pause guidance. Native drawer focus containment includes the portaled controls. Fixed footer targets place the note on their available side; outlines clip to actual scrollports. These mechanisms have controlled tests, with actual placement and native browser behavior still requiring review.

Find roles removes its three header statistic tiles and redundant Opportunity feed eyebrow, adds a concise purpose, and binds setup/results guidance to actual search state. Filters, preferences, tabs, source selection and role/packet decisions remain. The old source ledger loses four of eighteen optional chrome units, excluding shared Help: 18 → 14 (22.2%). This is a narrow source count, **not a measured claim that the page feels exactly 20% less cluttered**. The earlier picker spacing and selected-tab fixes remain.

Resume guidance follows import, fact confirmation, editing, job targeting, rewriting, review, design and export. Optional career details remain separate. Local confirmed-source hashes distinguish replacement sources; a guide cannot invoke mutation-bearing Source navigation or accept a proposed rewrite. The custom header now has Help, including template browsing and career details.

### Coverage

The existing navigation manifest remains unchanged. Its 32 destinations include eight utilities inside one Gallery workflow; they are not 32 independently built products. All exposed families have authored adapters and actual semantic targets or honest unavailable-target explanations. Compatibility URLs continue to use their canonical workflow.

| Family | Local guidance coverage |
| --- | --- |
| Home and assistant | Home orientation; Ask Taco source/composer/latest response or named recovery. Greeting-only history is not a completed operation. |
| Resume and checks | Resume sections and career details; active ATS structural preview or text-match panel. Neither claims a vendor ATS execution. |
| Discovery | Find roles setup/results; role analysis and its source/stale/report boundaries. |
| Applications and relationships | Manual tracker, selected application, prepared-document review, offer-stage work, packet queue, contact details and Add contact. Approval, drafting, tracking and submission stay distinct. |
| Practice and learning | Interview setup, active room and retained debrief across existing modes; Story Bank manual/extracted/saved work; Skill Bridge plans/proofs and Memory. |
| Writing | Humanizer; cover letters; LinkedIn; saved or new job descriptions; Gallery selection and all eight utility-specific stories. |
| Insights | Career insights, embedded Weekly review and Application results; missing measurements and failed reads retain their existing meaning. |
| Utilities | Current Settings child, runtime-priced plans/checkout, Feedback submission/receipt and signed-out prerequisites. No account or payment action is executed by Help. |

Source integration is complete for this declared coverage. Responsive visibility, target placement and real keyboard use across every family remain browser acceptance work. Admin and internal lab views were outside scope. Existing source/auth/billing/export policies, dashboard rules, palette, tool navigation and employer-facing resume templates were preserved.

### Independent review and root decisions

Separate builders owned the controller and tool integrations; root owned Resume integration and final checks. The independent skeptic reviewed current source against the pre-build snapshot. Root adjudicated **15 concrete mechanisms as CONFIRMED**; all now have source fixes and focused coverage:

1. Replacing a local confirmed Resume source did not change guide identity.
2. Keyboard Help opening and action-shortcut arbitration needed an explicit accessible region and safe control handling.
3. Invalidation could restore focus to an obsolete trigger.
4. A blanket modal pause made selected-record guidance unreachable.
5. Historical Ask Taco recovery could dominate a newer successful response.
6. React-only Applications Tab handling missed portaled guidance ancestry.
7. JD guidance misread reopened saved text and the return to input mode.
8. Show target could scroll a control behind its own note.
9. The modal note could cover nonscrolling packet footer actions.
10. An overflow-clipped target could be outlined over a drawer header.
11. A Writing failure could survive opening saved work or clearing the draft.
12. A Gallery failure could survive closing the utility.
13. A JD failure could survive opening another saved template.
14. A failed Add contact could label the tracker after closing/reopening the form.
15. Explicit Close could leave keyboard focus on an offscreen Help trigger without revealing it.

**REFUTED specific hypothesis:** ordinary changed-owner/context guards were bypassed by the new failure setters in Gallery, JD, Writing and Feedback; those updates remain behind their current-operation guards. Network's different form-close spill was confirmed and fixed separately. Pre-existing Resume Source navigation effects and ATS hydration limitations were excluded from this change's findings. No unresolved concrete introduced defect remained in the bounded final source pass; that verdict does not replace runtime verification.

### Verification and remaining gate

| Root-run check | Result |
| --- | --- |
| Six focused guidance scripts | **103/103 passed**. Pure state/geometry, actual provider/Panel controlled runtime, actual page observation expressions, source/owner changes, shortcuts, saved-draft resets and deferred form-close failures. |
| Existing tool-upgrade suite | **126/126 passed**. Five UI test fixtures were updated for new presentation imports, actual native drawer containment and anchor-independent input extraction; existing business assertions remain. |
| Search regressions | **43/43 passed** across source selection, context lifecycle, mobile review, failure/recovery and packet recovery. |
| Existing experience suite | **59/59 passed** for ingestion, source classification, upload lifecycle, saved work and export state. |
| Production build | Passed with **200 generated pages** after final product changes. |
| Type-check | Passed sequentially after the final build. A concurrent attempt raced build-generated type files; it was discarded and rerun. |
| Broad verification | Release safety, assistant, admin, email, observability and CVE gates passed. SEO CI passed with no critical/high issues. |
| Design audit | Same three pre-existing failures: 39 distinct hex values, 76 occurrences and 16 token-definition files. No additional regression; inline-card count decreased from 1070 to 1067. Baseline was not relaxed. |
| Whitespace | Passed. |
| Test effectiveness | An in-memory mutation removed the local-source hash from identity; the replacement-source regression failed as expected (8 pass/1 fail). Production files were never mutated. |

The provider/DOM test substitutes and expression/callback tests establish their tested contracts. They do not establish actual native focus, geometry, console health, exported-file fidelity or usability. [Mechanical evidence and coverage receipt](../.ui-verify/guided-tool-dna-2026-10-09/validation.json) records those limits separately.

The local fictional preview is running at `http://127.0.0.1:3102/suite/job-search`. Browser security rejected binding the existing error-page tab because its underlying URL uses a blocked protocol. The user was asked to reopen the normal HTTP preview. No alternate browser surface or shell browser was used to bypass that rejection.

**Pending:** reopen the working preview; inspect actual results and guidance at 320/390/430/768/1024/1440px in both themes; check clean console, no overflow, keyboard/focus reveal, native portal Tab behavior, resize, nested scrolling, sticky/footer/assistant collisions, zoom, visual viewport and reduced motion. Actual screen-reader and first-time/returning-user sessions remain unperformed. Do not declare the UI ready or codify it as a demonstrated design-skill standard before this acceptance.

This build made no commit or deployment. Parallel agent-contract work advanced the shared checkout's HEAD independently; its files and other dashboards were preserved. No external submission, message, payment, shutdown or allowance reset was performed.

### Core journey continuity checkpoint — 9 October 2026

The follow-up source review corrected eight mechanisms in the Resume → Find roles → packet-review journey. The source picker now uses the same pure verification classifier as the server, so active document versions and malformed lineage cannot masquerade as confirmed factual sources. Selecting a different posting drops its predecessor's application binding and analysis draft. Automatic selection reconnects only a packet matching the current source and exact description, including when preparation finishes during a pending search. Browsing without a source clears obsolete résumé inputs.

Packet completion preserves the factual résumé for subsequent Role analysis. The generated document and its score remain on the packet, where Applications retrieves them through the application record. Failed or changed source reloads turn interrupted preparation into a retryable failure; cancelled requests cannot replace the retry. A failed tracker read retains application-review and outcome-confirmation links until a successful retry can resolve them.

Root adjudicated ten review inputs: **nine CONFIRMED, one DUPLICATE, zero REFUTED**. Eight confirmed mechanisms are fixed; one pre-existing source-handoff gap remains an acceptance item. A document-only résumé save is intentionally not a verified search source. The fresh-user path still needs an explicit source-saving handoff; this patch does not silently promote a document or save career details. Root also corrected obsolete source carry-over when browsing without a résumé. The final independent reread found no concrete regression in the bounded packet-state and reload correction.

Root validation after the final product change: **80/80 focused checks**, including 24 real-page-handler lifecycle cases, and **128/128 existing tool-upgrade checks** passed. These runs overlap and are not a combined unique test count. Type-check, production build, release safety, assistant, admin, email, observability and CVE gates passed. Whitespace passed. New behavioral cases failed before their corresponding fixes and passed afterward. The source-picker fixture now uses the actual pure server classifier; its former metadata-only provenance assumption was corrected to the top-level provenance persisted by the save path, while metadata-only evidence remains rejected.

The mechanical chain remains **8/9 gates passing**: the design audit has the same three existing failures (39 distinct hex values, 76 occurrences, 16 token-definition files). Its baseline was not relaxed. The separate anonymous SEO audit of the deployed live site reported ten critical canonical/noindex policy mismatches, zero high, 24 medium and five low issues across 43 pages. That live-site result does not validate this undeployed checkout and was not changed by this pass.

**Browser acceptance is still blocked.** The user confirmed Find roles loaded; CUA continues to expose the old connection-refused tabs, including the error document whose non-HTTP protocol was rejected. No alternate browser, tab, shell browser or raw CDP workaround was used. There is no new screenshot or successful rendered journey case. Six widths in both themes, keyboard/portal focus, sequential Help, console health, overflow and the explicit source handoff remain unverified. Controlled handler/classifier tests do not establish these browser behaviors or durable service integration.

[Validation, adjudications and scoped review patch](../.ui-verify/core-journey-2026-10-09/validation.json) preserve the final file fingerprints, gate results, failing-before-fix evidence and limitations. The patch is relative to this pass's six-file snapshot and excludes unrelated shared work. The local preview remains on port 3102. No commit, deployment, shutdown or allowance reset was performed.
