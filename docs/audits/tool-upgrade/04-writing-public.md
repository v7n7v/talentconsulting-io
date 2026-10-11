# Writing, Gallery, JD and public-entry audit

Audit date: 2026-09-28. Bounded source review in `Taco-upgrade`; no application changes, provider calls, account mutations, browser actions or tests performed by this reviewer. The parent reviewer separately reproduced Writing Trust draft loss after reload and verified a Word Counter fixture (10 words, 63 characters, 2 sentences). Those are explicitly parent-provided browser observations; generated-output quality, exported-file fidelity and production entitlement behavior remain unverified. P1 means fix before broader real-data use; P2 means follow-on usability/completeness. No P0 incident established. Product recommendations below are judgment from the implementation, not user-research findings.

## Gallery: all eight capabilities

The Gallery supplies three lanes and eight dedicated tools, with deep links, examples, input/result views, loading state and account/usage dialogs (`app/suite/gallery/page.tsx:71-165,571-578,623-641,678-705`). Cover Letter, LinkedIn and Humanizer cards link to existing tools and are not additional implementations (`:40-69`).

| Tool | Capability, source evidence and limit | Decision / proposed acceptance |
|---|---|---|
| Grammar Checker | Free. Requests specific corrections, rules and explanations; its card promises a corrected draft, but its prompt schema only requests corrections/score/summary (`gallery/page.tsx:73-81,212-237`; `lib/writing-prompts.ts:197-207`). The result renderer merely tolerates a corrected-text property if returned. | **Merge into shared editor; P2.** Show source-linked suggestions and an explicit apply action. A grammar fixture returns both validated corrections and a complete edited draft, preserves factual claims and supports undo. |
| Word Counter | Free, deterministic client-side words/characters/sentences/paragraphs/timing (`gallery/page.tsx:653-674`). Parent browser fixture passed. The card advertises top words (`:84-92`), but this client result omits them; a separate API implementation includes them (`app/api/gallery/run/route.ts:14-46`). | **Keep as embedded utility; P2.** Use one deterministic implementation and define counting rules. Empty text, punctuation, paragraphs and Unicode fixtures agree across consumers; advertised metrics exist and never require generation. |
| Citation Machine | Free, prompts for four citation styles and in-text forms, with copy controls (`gallery/page.tsx:95-103,242-275`; `writing-prompts.ts:208-226`). The route performs no source lookup or bibliographic verification (`api/gallery/run/route.ts:59-74`). | **Move to optional study/research area; P2.** Ask for structured source metadata, flag missing fields and label unverified references. Never invent an author/date/DOI; known fixtures match the chosen style. Retain only if audience demand supports it. |
| Summarizer | Free, produces one-liner, brief, detailed and bullet summaries (`gallery/page.tsx:106-114`; `writing-prompts.ts:256-267`). Counts are requested from the model rather than calculated. | **Keep within role/company research; P2.** Attach the source, calculate counts locally and preserve qualifications. Fixtures retain numbers, negation and conditions; unsupported additions are highlighted for review. |
| Tone Analyzer | Free, model-generated tone, sentiment, formality and readability (`gallery/page.tsx:117-125`; `writing-prompts.ts:242-254`). The prompt also asks the model for a Flesch-Kincaid grade. | **Merge into shared editor; P2.** Treat tone/sentiment as suggestions and calculate readability using an explicit deterministic formula. No percentage or grade implies scientific confidence without validation. |
| Paraphraser | Standard/paid in frontend; returns formal, casual and concise alternatives (`gallery/page.tsx:128-136`; `writing-prompts.ts:228-240`). Meaning preservation is a prompt request, not factual equivalence verification. | **Merge into shared rewrite modes; P1 entitlement, P2 consolidation.** Preserve source facts, show a diff and let users choose/apply one variation. Direct endpoint requests must enforce the same paid tier as the card. |
| Email Composer | Standard/paid; subject/body and formal/friendly variants from rough context (`gallery/page.tsx:139-147`; `writing-prompts.ts:269-281`). It drafts text; no send action was identified in this tool. | **Keep under recruiter/application communications; P1 entitlement, P2 context.** Reuse chosen role, recipient and verified application facts. A draft must not invent a meeting, promise or relationship; copy/export has a truthful completion state. |
| Thesis Generator | Standard/paid; argumentative/analytical/expository thesis suggestions and associated structure (`gallery/page.tsx:150-158,453-479`; `writing-prompts.ts:302-318`). Weak fit with the core career workflow. | **Retire from primary career navigation or park in optional study tools; P1 entitlement, P2 relevance.** Do not remove stored content. If retained, frame outputs as proposals requiring evidence and enforce the tier at the endpoint. |

### W01 — P1: paid Gallery restrictions are not enforced per tool on the server

The UI blocks guests and Free users from paid tools (`gallery/page.tsx:593-599,623-641`). All eight IDs are accepted by one schema (`lib/schemas.ts:308-316`); the endpoint permits anonymous access and checks only the shared `galleryTools` allowance before dispatching any ID (`app/api/gallery/run/route.ts:51-74`). The common guard does provide anonymous caps, authentication, rate limiting and Free-tier usage checks (`lib/api-auth.ts:116-170,194-229`); it does not enforce a per-tool minimum tier. This is a source-established policy mismatch, not a tested live exploit or unlimited-use claim.

Move tool definitions, minimum tier and per-tool schemas into one shared server-owned registry. Acceptance: guest/Free direct requests for each paid ID fail before provider invocation, Standard succeeds within its policy, free IDs retain intended trial behavior, and rejection does not consume a generation. Bound model options instead of accepting arbitrary record values (`schemas.ts:316`; `api/gallery/run/route.ts:71-74`).

### W02 — P2: Gallery needs artifact state and validated result contracts

Switching/closing tools clears draft and result (`gallery/page.tsx:612-615,709-713`). Results accept arbitrary JSON/string fallbacks (`:694-700`); failure is a generic toast (`:701-705`). Async responses have no tool/revision ownership check in this handler. This makes tools feel disposable and risks a late result being associated with a newly selected tool/input.

Preserve drafts by tool or source artifact, validate each result schema, retain an inline retryable error, and bind completion to the owner/tool/input revision. Acceptance: switching tools during generation cannot replace the wrong result; reopening restores work; malformed output is recoverable; retry never clears the source. Word Counter should remain instant and independent of paid-generation infrastructure.

## Writing Trust Studio: five modes and full workflow

The existing workflow is substantial: Scan → Diagnose → Humanize → Verify → Export (`app/suite/writing-tools/page.tsx:100-106`), paragraph feedback, protected terms, targeted rewriting, before/after viewing, model quality selection, cloud save and Word/TXT export. It is worth improving as the shared writing workspace rather than adding more isolated rewriting tools.

| Mode | Current preset and purpose | Decision / acceptance |
|---|---|---|
| Safe Polish | General / professional / exact length (`lib/writing-pipeline.ts:63-73`). | **Keep default; P2.** Conservative edits with source diff; unchanged claims and protected values survive. |
| Voice Match | General / casual / exact (`:76-80`). No personal voice samples/profile are passed in the inspected generation payload (`writing-tools/page.tsx:543-555`). | **Improve naming or implement actual voice input; P2.** “Natural voice” describes the current preset; a true match must use explicit user examples without importing their facts. |
| Recruiter Ready | Resume / confident / exact (`writing-pipeline.ts:83-87`). | **Keep in resume/application editor; P2.** Use the selected role and verified evidence; do not manufacture metrics to sound stronger. |
| Academic Integrity | Academic / academic / exact (`:90-94`). | **Move to optional advanced mode; P2.** Name it academic style unless authorship/citation processes are actually checked. Output must not claim academic-integrity certification. |
| Creative Rewrite | Creative / creative / expand (`:97-101`). | **Keep optional; P2.** Explain expansion and preserve factual constraints. Creative elaboration cannot become an asserted achievement, quotation or event. |

### W03 — P1: draft and library completion states are misleading

The initial status says “Draft saved locally” (`writing-tools/page.tsx:393`), but the input effect only updates title/status (`:440-445`). A public draft is read from sessionStorage and immediately removed (`:423-438`); there is no corresponding draft write in this page. Parent browser evidence independently confirms typing → saved label → reload → empty text. This is actual loss of unsaved work, not merely missing autosave polish.

Manual Save is a real owner-scoped Firestore write (`writing-tools/page.tsx:605-641`; `lib/database-suite.ts:1375-1416`), but each save adds a fresh document (`:1411`) and the inspected application contains no reader/reopen library for `writing_sessions`. “Saved to library” therefore lacks a customer retrieval path. Do not conflate this with the missing local write.

Implement an owner-scoped draft store with explicit write success/error, revision recovery and a session library with create/update/open/delete. Import handoff data only after durable draft creation. Acceptance: reload, route change, offline storage failure, account switch and reopening a cloud session all have defined results; save twice updates the intended session or explicitly creates a version; no completed message precedes persistence. Keep guest drafts separate from signed-in owners.

### W04 — P1: visible settings and asynchronous results do not reliably describe the current document

Domain, Tone and Length are editable (`writing-tools/page.tsx:723-725`), yet generation uses `modeSettings.domain || domain` and equivalents (`:547-549`). Every mode supplies all three values (`writing-pipeline.ts:61-107`), so the manual controls never override the preset. Save records the same overridden settings (`writing-tools/page.tsx:612-621`).

Scan/Diagnose/Humanize/Verify handlers write results after asynchronous work without owner/input-revision guards (`:485-603`). Humanize updates rewritten text and detection but does not invalidate existing originality/deep-scan results (`:563-573`); the old verification summary can remain displayed (`:982`). These are source-derived race/staleness risks, not browser reproductions here.

Make mode selection initialize editable settings, or clearly show locked preset settings. Bind every result to a document hash/revision and owner, cancel/ignore stale completions, and invalidate downstream checks after edits. Acceptance: selecting a tone changes the actual request; a delayed response cannot overwrite newer input or another account; changing output marks prior verification stale; saved/exported metadata agrees with the visible draft.

### W05 — P1 trust claims / P2 guidance: useful style signals are not proof of authorship, originality or factual integrity

Local Scan uses `detectAI` (`writing-tools/page.tsx:485-499`). Trust and confidence labels are derived from thresholds, word count and flags (`writing-pipeline.ts:109-155`), not calibrated probability. Deep Diagnose calls a model and its prompt correctly says signals are not a judgment (`app/api/writing/deep-detect/route.ts:22-53`). Verify calls a model for phrasing originality with no corpus search (`app/api/writing/uniqueness/route.ts:31-62`; `lib/writing-prompts.ts:170-191`). It cannot verify plagiarism absence or provenance.

Humanization does have more than a prompt: authentication, schema, rate/usage checks, protected terms, paragraph patches and quality-policy evaluation (`app/api/writing/humanize/route.ts:73-99,146-161,240-285`). Its gates check mechanics, term preservation, length, phrase residue and heuristic trust movement (`lib/writing-quality.ts:136-197`). Those checks neither establish semantic equivalence nor detect all newly invented facts. Optimizing a detector score should not be presented as increasing factual trust.

Use plain labels such as writing-pattern signal, clarity suggestions and phrasing variety; explain limitations beside the action. Preserve source claims with a visible diff and user review. Acceptance: supported factual checks flag missing/changed numbers, dates, entities, negation and new claims; unverifiable conclusions remain suggestions; a high style score never labels the text truthful or certainly human; Verify explicitly says it is not a plagiarism database check. Existing protected-term gates remain and are tested rather than discarded.

### Workflow completeness and acceptance

| Step | Implemented capability | Proposed verification / improvement |
|---|---|---|
| Import/edit | Text plus `.txt/.doc/.docx` picker, text/Mammoth extraction and minimum length (`writing-tools/page.tsx:456-483,831-875`). | **P2:** format/size/error fixtures, including actual legacy DOC, blocked storage and an empty extraction. Preserve current draft until a new import succeeds. |
| Scan/Diagnose | Local scan and authenticated deep request with API-limit handling (`:485-527`). | **P2:** useful empty state, explicit input revision and cancellation/retry; remove artificial delay when no work needs it. |
| Rewrite | Light/balanced/deep, Fast/Best, protected terms and paragraph targeting (`:67-98,529-575`). | **P1:** honor settings, preserve factual evidence, show gate warnings and treat failed checks as review-required; exercise provider/malformed-response/fallback paths in isolated tests. |
| Verify | Authenticated style-originality model (`:577-603`). | **P1:** correct meaning of “verify”; invalidate on edit and display inspected revision, limits and source. |
| Save/export | Cloud Save; visible Word/TXT/Copy actions (`:605-671,954-980`). PDF is not an exposed action here. | **P1 save, P2 export:** reopen/version behavior; parse downloaded DOCX/TXT to confirm exact chosen draft; handle clipboard rejection instead of unconditionally claiming success. Generated-file fidelity was not checked in this audit. |

## JD Generator / Mission Blueprint Generator

**Keep outside the primary candidate journey; improve P1 contracts, P2 workflow.** Its recruiting purpose is distinct from helping a candidate apply. Four styles—startup, corporate, technical, creative—plus seniority, department, context and optional compensation are a useful recruiter template system (`app/suite/jd-generator/page.tsx:47-84`). It generates structured content, exposes an editable text version, checks a local bias-pattern list, copies/downloads PDF and saves/loads templates (`:99-118,184-204,212-284,459-477`). The requirement-specificity band is explicitly a local qualitative reading, not a labor-market metric (`:188-193`).

**W06 — P1: compensation opt-out and generated company facts are not respected.** The prompt always asks for compensation and falls back to “Competitive salary + equity” even when the user does not include compensation (`:151,162`). Missing context becomes a fast-growing tech company with a growing innovative team (`:160-161`), and benefits/culture/growth are requested without verified inputs (`:146-152`). These are risky employer claims. Require explicit values or visibly suggested placeholders; omit compensation when off. Acceptance: role-only and opt-out fixtures never assert salary, equity, benefits or company facts absent from source, and only approved claims enter copy/PDF/template output.

**W07 — P1: JD's metering and contract should be server-owned.** The page sends a client-authored prompt and `usageFeature: 'jdGenerations'` to generic `/api/ai` (`:166-175`). Its default guard resolves to `gauntlets` (`lib/api-auth.ts:46,225-229`), while the route optionally checks/increments the client-supplied feature (`app/api/ai/route.ts:28-55,81`; `lib/schemas.ts:29`). A missing feature therefore avoids the JD-specific accounting, while an unrelated exhausted allowance can block the normal path. This is a source-level contract flaw, not live billing verification. Use a dedicated validated JD endpoint with server-owned feature/tier/prompt and result schema. Acceptance: omitted/forged client meter cannot alter JD accounting; unrelated tool exhaustion does not block JD; malformed domain output fails safely; only a completed JD counts once.

**P2 template/bias workflow:** only the first five templates are reachable (`jd-generator/page.tsx:464`); loading restores editable text but not a structured `generatedJD` (`:465-469`), while Save returns early without one (`:269`). Build an actual searchable library and update model. Bias checks are local pattern substitutions (`:104-118,286-300`); “All bias fixed” overstates their coverage. Label them wording suggestions, preview replacements and allow undo. Acceptance: open/edit/resave any template, preserve metadata and export current text; suggestions never claim an inclusive or legally compliant JD. No legal-compliance conclusion is made here.

## Five public entry pages

The `/tools` index is discovery, not a sixth tool. Four of the five pages are static marketing-to-suite handoffs; only the detector supplies a local interactive analysis. Keep that distinction clear in analytics and product claims.

| Public route | Actual implementation and source | Decision / acceptance |
|---|---|---|
| `/tools/ai-detector` | Interactive local heuristic and sample text, 500-word input, delayed score display (`app/tools/ai-detector/AIDetectorDemo.tsx:10-55,93-100,184-203`); saves a sessionStorage handoff (`:112-120`). Editing clears current result, but a pending timer can still return an older analysis. | **Keep as writing-pattern preview; P1 claims/handoff, P2 race.** Share the suite's signal definitions; bind result to input revision; preserve draft through sign-in/reload; explain sample texts are illustrative and scores do not establish authorship. Storage errors must not discard input. |
| `/tools/ai-humanizer` | Static before/after examples and CTAs to Writing Trust Studio (`app/tools/ai-humanizer/AIHumanizerLanding.tsx:18-27,83,111,171-195,255`), no in-page rewriting control. | **Keep handoff, fix examples P1.** Resume example adds five people, three weeks/four days and $120k; cover example adds React, 14 features, six months and zero rollbacks absent from its source. Replace with evidence-preserving examples or include the explicitly supplied additional evidence. “Voice-preserved rewrite” must not demonstrate fabricated achievements. |
| `/tools/ats-analyzer` | Static explanatory landing, CTA `/suite/ats-analyzer` (`app/tools/ats-analyzer/page.tsx:69-84`); advertises job-description matching (`:99,111`). | **Keep, improve P2.** Send promised match analysis to the scoring mode, or explicitly offer Parse preview versus Role match. The current suite default is preview (`app/suite/ats-analyzer/page.tsx:14,22-25`); do not count this landing as an independent analysis engine. |
| `/tools/resume-builder` | Static previews and links to `/suite/resume` (`app/tools/resume-builder/ResumeBuilderLanding.tsx:56,77,224`). | **Keep, improve P2.** Use the same live feature/entitlement copy as the suite; CTA says it opens the builder. Verify unauthenticated entry/return and target the intended Build mode, without losing later draft context. |
| `/tools/interview-prep` | Static question/benefit presentation and links to `/suite/interview-sim` (`app/tools/interview-prep/InterviewPrepLanding.tsx:18-29,50,76,221`). | **Keep, improve P2.** State that practice starts in the suite, explain the initial setup and carry intent through authentication. Reuse the same tier/session-limit wording as the actual simulator. |

## Upgrade order and remaining verification

1. Fix saved-state honesty, draft recovery, session readback and revision ownership; these underpin every writing workflow.
2. Correct facts/claims: humanizer examples, JD defaults, heuristic confidence/originality language and supported source-preservation checks.
3. Move entitlements, quotas and per-tool input/output contracts to server-owned definitions; keep public previews explicit and bounded.
4. Consolidate grammar/tone/paraphrase into the shared editor, add communications drafts to application context, and move academic/recruiter specialties out of the default candidate path.
5. Verify isolated fixtures for persistence, account switch, in-flight edits, per-tier direct endpoint access, exact quota boundaries, malformed/provider failures and export contents. Follow with a keyboard/mobile walkthrough and customer usability sessions.

The scoped repository filename inventory did not reveal focused test files named for Gallery, Writing Trust, humanization, JD Generator or AI detection. This is not proof that no indirect tests exist. No test results, provider quality, accessibility conformance, legal compliance, production billing safety or full security assurance are claimed from this source review.
