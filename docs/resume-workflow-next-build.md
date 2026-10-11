# Resume Studio: five-section workflow — next build priority

Planning date: October 7, 2026. User approved this as the build goal and invoked long-horizon-build. Status: implemented and verified locally in Taco-upgrade on October 7, preserving unrelated changes. Deployment is coordinated separately by the other build chat. This supersedes the September 29 four-step presentation.

## Product direction

Upload & Diagnose → Job Description → AI Morph → Template → Export & Save.

Use one document workspace with five clickable sections, an enduring resume preview, Back/Next controls and visible status per section. Separate preparing the target from running AI. Keep source correction in the first section and proposed-change review in AI Morph; neither becomes another top-level step. Resume content, target, AI settings, current generated version, review decisions, template and export preferences survive navigation.

The earlier implementation grouped target entry, generation and review under Tailor, used progress labels without navigation, and cleared the candidate on input changes. V2 now makes all five sections directly navigable and retains prior generated versions when settings change.

## Section behavior

| Section | Content and purpose | Main action |
| --- | --- | --- |
| Upload & Diagnose | File compatibility/extraction status, original text, structured fields, factual corrections and useful missing-field/parse warnings. Clearly report unreadable or image-only files and offer retry, replacement or text paste. | Confirm resume and continue |
| Job Description | Full job text, optional role/company/posting URL, detected context that the user can correct, and source-backed relevance/gaps without invented qualifications. | Continue to AI Morph |
| AI Morph | Numeric rewrite strength plus plain-language presets, current cap/unlock state, generation/retry/cancel, source-versus-result comparison and change decisions. | Morph resume, then review and continue |
| Template | Selected resume in the actual layout, template access, palette and presentation choices. Earlier template browsing is allowed; samples must be explicitly labeled until there is usable resume content. | Continue to Export & Save |
| Export & Save | Resume name, exact PDF pages, editable Word, actual readiness, explicit Save resume and optional combined save-and-export action. Application tracking remains secondary. | Export and/or save |

Percentage expresses requested rewrite intensity, not a job-fit score or a guaranteed percentage of changed words. Preserve the current server-enforced 80% cap and explicit 100% unlock policy unless separately changed. Unlock never permits fabricated employers, schools, credentials, dates or achievements. Account/template entitlement and maximum-strength consent are distinct gates. General resumes may intentionally continue without AI or without a target job.

## Full navigation contract

- Every section has an accessible clickable control. Desktop: persistent five-section navigation; mobile: a labeled selector or compact tab rail that exposes all sections without icon-only guessing.
- Navigation is available even when a section is incomplete. An incomplete section explains prerequisites and links to them; its consequential action is gated. Browsing a template does not require generating a resume first.
- Show honest state: Not started, In progress, Ready, Needs attention, or Needs regeneration. Visiting a section does not mark it complete.
- Back, Next and direct jumps use the same transition logic. Returning to a section never reparses, reruns AI, clears fields, resets percentage or changes template by itself.
- Leaving a section during processing does not silently restart or abandon it. Bind asynchronous results to the exact owner, source, target and requested configuration. Changed inputs cannot be overwritten by late completion.
- Signing in, refreshing and reopening a saved version preserve the intended active work and respect account boundaries. Keep previous account drafts recoverable; do not inherit another account's source.

## Editing and regeneration

Keep editable input settings separate from the configuration that produced a generated version. Record source revision, job text, requested/effective percentage and generation status with each result.

| User action | Required behavior |
| --- | --- |
| Change template, palette or page size | Keep resume content and AI review decisions; rebuild only the export artifact. |
| Change requested percentage/unlock or AI target length | Retain the prior result and decisions; mark it as generated with previous settings. Require a deliberate new AI run to apply the new request. |
| Edit source facts or job description | Keep prior result as a previous version; mark its relationship to the new inputs outdated. Offer regenerate or intentional use of confirmed source. |
| New AI run succeeds | Create a new candidate and its own review decisions; do not reuse decisions for different proposed changes. |
| New AI run fails | Keep source, job, settings and the previous reviewed candidate. Show useful retry feedback. |
| Return to a prior reviewed result | Restore its matching source/target/settings and presentation metadata, so the user knows exactly what they are exporting. |

Default regeneration starts from confirmed source facts, not repeatedly from the last AI rewrite. Explicitly promoting user-corrected content into a new confirmed source is a separate, understandable action. Do not silently carry rejected claims into another run.

An old result must never masquerade as a fresh result for a changed job or percentage. Export of an intentionally selected older reviewed version can be allowed with its original context visible. Otherwise the current candidate must be reviewed and consistent with the chosen inputs, or the user explicitly chooses the confirmed source without AI.

## Design recommendation and alternatives

Recommended: one workspace, persistent preview and five clickable sections. It combines a guided first run with fast movement for a returning user. Keep one obvious primary action per section and move advanced controls into disclosures. Use restrained transitions that preserve reading position and honor reduced motion; never animate resume text while it is being reviewed.

Alternatives considered: a strict wizard would be simpler initially but conflicts with full navigation; five separate pages could support deep links but increase state/hydration complexity; an all-in-one long form could reduce clicks but recreate the current scanning burden. Avoid a toggle between separate beginner/expert products. A single workspace can support both through direct navigation and sensible defaults.

## Next build order

1. Define the five-section navigation and state/dependency model, including draft-versus-applied AI configuration and prior-version retention.
2. Implement upload diagnosis and confirmation; job entry becomes its own section.
3. Implement dedicated Morph controls, cap/unlock handling and generation/review lifecycle.
4. Connect actual template previews and the export/save station to the same active version.
5. Verify the complete signed-in workflow and navigation/recovery matrix, then inspect desktop/mobile accessibility and failure states.

Prioritize this workflow before further Resume Studio decorative polish or additional secondary tools. Reuse the functioning parsers, review ledger, server truth locks, template registry and exporters where possible; build a coherent navigation/state layer around them. Do not mistake adding two labels to the old progress bar for finishing this work.

## Acceptance evidence required

- Real upload → extraction/diagnosis → confirmed parse → job description → AI at an allowed percentage → reviewed result → selected template → real PDF/Word and account save.
- Capped strength, successful unlock, denied unlock, supported skip-AI route and unsupported-file recovery.
- All five sections reachable by keyboard and pointer; Back/Next/direct jumps retain work; incomplete states explain what is needed.
- Changing AI settings keeps the previous result and accurately requests regeneration; failed regeneration keeps the reviewed candidate; successful regeneration creates fresh decisions.
- Template-only changes trigger no AI request. Requests cannot commit to the wrong account or edited inputs.
- Sign-in, refresh and saved-version reopening recover source, target, applied settings, decisions and layout correctly.
- Save/export independently succeeds; a combined action reports each result and retries only the failed operation without duplicate saves.
- Inspect actual exported pages rather than trusting the miniature HTML preview. Use fixtures/emulators for destructive or failure tests; live account verification needs suitable signed-in access and explicitly authorized test data.

## Decisions to refine in the next design pass

Recommended default is separate Export and Save actions, with an optional Save & Export shortcut. Review within Morph should open with a concise summary and expandable detailed comparison while retaining required decisions. Neither option should add another navigation section. These are proposals, not claims of user approval for every UI detail.

## Build verification — October 7, 2026

The shipped implementation uses separate explicit Save, PDF and Word actions; the optional combined shortcut is deferred. Source diagnosis includes original text, correction/confirmation and extraction recovery. Requested AI controls and immutable applied generations have separate state; successful regeneration archives the prior reviewed result, while failures and edits retain it. Saved versions and owner-scoped drafts restore source, target, review, layout and PDF format. An explicitly selected older reviewed version can use its stored applied context; current consent limits still govern any new run.

- 220 integrated workflow, parser, consent, review, transport, upload-lifecycle and actual-export tests passed after the final navigation and source-provenance repairs. TypeScript passed. Scoped diff checks passed; new components/helpers/API/schema lint clean. The large page retains its baseline 25 lint errors and 4 warnings.
- 19 Firebase Auth/Firestore emulator checks passed, including account isolation and guarded saves. No production account writes were made.
- Browser: fictional TXT extraction, retained-text recovery after anonymous parse quota, successful normal Morph API at 72%, failed regeneration retaining the prior result, exact-context restore, refresh recovery and keyboard/pointer navigation. Template-only changes retained the applied AI version. Delayed uploads continued while visiting another section; explicit cancellation after returning stopped the original transfer without a late commit. Each restored AI version recovered its own original-file context; legacy records without that context clear the link. At 375px all five controls remain readable with at least 44px targets and no horizontal document overflow.
- Actual PDF/Word artifact tests cover contents, links, page size and protected source facts. The template build chat owns the broader 20-layout visual/export matrix and final production build/deployment.

Live production account saving and a live 100% unlock were not exercised without suitable signed-in test access; emulator/consent tests establish the code behavior. The normal server's anonymous parse allowance was exhausted; the source recovery path was verified instead of bypassing that limit. See `.codex/long-horizon/resume-workflow-v2.md` and `docs/reviews/resume-workflow-v2/desktop.png` / `mobile.png` for the handoff and visual evidence.
