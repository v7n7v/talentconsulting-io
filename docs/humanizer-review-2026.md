# Taco Humanizer — September 2026 review

Implementation follow-up: the local reliability and editing changes are recorded in [the September 28 implementation report](humanizer-oracle-career-implementation.md). The findings below describe the pre-fix review; live benchmark and staging work remain separate.

Reviewed September 28, 2026 in `/home/xwingace/Documents/Projects/Taco-upgrade`, branch `codex/taco-upgrade`.

**Assessment: a useful foundation with substantial reliability work still needed before it can compete as a leading writing product.** The brand, saved drafts, writing controls and career context are valuable. The core quality checks, selective editing, mobile workflow and output review fall short of that ambition. This review found release blockers that the earlier workspace recovery and integration tests did not cover.

This is a review, not a claim that fixes have been implemented. No application code was changed, no production data was accessed and no real AI generation, payment or email was triggered.

## What was examined

- The running desktop workspace at `/suite/writing-tools`, its settings and its local Scan action.
- The public Humanizer page, shared Help, TXT/Word export and saved-session behavior.
- Suite/public rewrite routes, prompts, model routing, protected terms, paragraph patches, local scoring, Deep Scan, phrasing verification and word/run metering.
- Actual production helpers with 12 constructed rewrite pairs and five additional scoring examples. Seven pairs intentionally changed facts or meaning; all seven were accepted without warnings. This demonstrates checker blind spots, **not the frequency with which a model makes those mistakes**.
- Loaded frontend and API handlers with controlled storage/provider substitutes. A 19-test frontend/contract batch passed, including temporary reproductions that assert the observed bugs. Passing those reproduction tests does not mean the bugs are fixed.
- Current official Grammarly, QuillBot, Wordtune, Undetectable.ai and Turnitin documentation. Comparisons below concern documented capabilities and product positioning. No paid competitor or live Taco output benchmark was run.

## Comparison with the market in 2026

| Dimension | Current reference point | Taco today | Assessment |
|---|---|---|---|
| Personal voice | Grammarly supports reusable voice profiles from a writing sample of at least 200 words, with suggestions in the document. [Official guide](https://support.grammarly.com/hc/en-us/articles/38552339652109-Humanizer-user-guide) | Natural Voice selects a generic casual preset. The Humanizer request does not include a writing sample or personal voice profile. | Behind on personalization. A tone is not a learned personal voice. |
| Editing control | Wordtune supports selected-sentence/paragraph rewrites, alternative suggestions and contextual synonyms. [Writing features](https://support.wordtune.com/en/articles/9024394-wordtune-editor-writing-features) | Paragraph Fix exists, but scope is not enforced. The returned change explanations are not displayed; users toggle original/final text. | Behind on safe, reviewable editing. |
| Workflow and language | QuillBot documents direct humanizing, rewrite history, tone insights, five supported languages and integrations with ChatGPT/Gemini. [Humanizer](https://quillbot.com/ai-humanizer) | Scan is required before rewriting. English-specific heuristics run without a clear supported-language boundary. TXT/DOCX import and session storage exist. | More steps and narrower demonstrated language support. |
| Preserve terms | QuillBot's Paraphraser offers Freeze Words in supported modes. This is a related suite capability, not evidence that every Humanizer mode supports it. [Freeze Words](https://help.quillbot.com/hc/en-us/articles/35855113357847-What-is-Freeze-Words-in-Quillbot) | Manual/automatic protected terms exist, but percentage extraction and substring matching have concrete defects. | Good intended feature; enforcement needs repair. |
| Writing provenance | Grammarly Authorship can track the writing process in supported editors. [Authorship](https://support.grammarly.com/hc/en-us/articles/29548735595405-Introducing-Authorship) | Original/final drafts are retained, but there is no comparable process history; cloud restore loses check/change metadata. | Keep a clear revision history without claiming authorship proof. |
| Detector-focused segment | Undetectable.ai markets Basic/Stealth modes and detector-oriented results. These are vendor claims, not independent proof. [Product page](https://undetectable.ai/ai-humanizer) | The UI increasingly describes style signals, but the prompt still optimizes rigid detector-oriented patterns. | Positioning is inconsistent. Taco should compete on useful career writing and preservation. |
| Career relevance | General writing suites serve broad use cases. | Resume tone/domain presets, application context elsewhere in Taco and a coherent career workspace offer a focused use case. | A credible direction, but the Humanizer itself still needs explicit source and destination handoffs. |

The supported conclusion is that Taco trails these products in several editing capabilities. There is insufficient evidence to rank its prose quality, factual accuracy, latency or value against them. Current model names alone do not establish those outcomes.

Turnitin explicitly says its detection can misidentify text and should not be the sole basis for adverse decisions. Its AI-writing and similarity scores are also different measures. Taco should keep style feedback, authorship inference and plagiarism checks distinct. [Turnitin's explanation](https://guides.turnitin.com/hc/en-us/articles/22774058814093-Using-the-AI-Writing-Report)

## Release blockers found

### 1. Quality failures can still become successful, charged output

The router returns its final candidate even when `decision.passed` is false. The rewrite endpoints then return success and consume usage. A controlled run where all candidates failed returned the final corrupt candidate with `qualityDecision: "escalate"`. This is a warning mechanism, not an enforced gate.

Runtime output validation is also missing in these routes. A mocked `{}` response returned the source as an accepted rewrite and consumed both meters. The phrasing endpoint accepted a score of 999, an invalid verdict and a string in place of its analysis array.

Evidence: [router:115](/home/xwingace/Documents/Projects/Taco-upgrade/lib/ai/writing-model-router.ts:115), [rewrite materialization:220](/home/xwingace/Documents/Projects/Taco-upgrade/app/api/writing/humanize/route.ts:220), [metering:261](/home/xwingace/Documents/Projects/Taco-upgrade/app/api/writing/humanize/route.ts:261), [verification:46](/home/xwingace/Documents/Projects/Taco-upgrade/app/api/writing/uniqueness/route.ts:46).

Required: validate complete typed output, reject malformed or exhausted failed candidates, preserve the source and provide a retryable failure. Check retry/metering behavior across both public and suite routes.

### 2. The checks do not establish preservation of meaning

Actual helper results with valid `lengthMode: "exact"`:

| Deliberately changed input/output pair | Result |
|---|---|
| `12%` became `92%` | Accepted; percentage was not extracted. |
| `$10` became `$100` | Accepted; `$10` matched inside `$100`. |
| `did not lead` became `led` | Accepted; negation/experience changed. |
| `120 ms → 80 ms` became `920 ms → 10 ms` | Accepted; those numeric quantities were not protected. |
| A quoted absence of causal effect became a strong causal effect, retaining `[1]` | Accepted; preserving a citation marker did not preserve the quotation. |
| Jane Smith and Alex Jones exchanged responsibilities | Accepted; both names remained present. |
| Python/Microsoft became Java/Google | Accepted; single-token names were not extracted. |

The gate checks surface mechanics, term presence, word-count ratio, banned phrases and an internal style score. It has no semantic equivalence check. More lexical rules will help but cannot certify meaning on their own. Factual changes need visible comparison and user review.

Evidence: [extraction:42](/home/xwingace/Documents/Projects/Taco-upgrade/lib/writing-quality.ts:42), [matching:78](/home/xwingace/Documents/Projects/Taco-upgrade/lib/writing-quality.ts:78), [gate list:183](/home/xwingace/Documents/Projects/Taco-upgrade/lib/writing-quality.ts:183). Exact examples and outputs are in [the local corpus evidence](audits/humanizer-2026/corpus-results.json).

### 3. Selected-paragraph rewriting can alter unselected text

Returned patch indices are not restricted to the requested set. Global punctuation cleanup also touches the whole merged document. Empty/invalid targets can fall through to a full rewrite. The fallback mapper can repeat a single returned paragraph into multiple target paragraphs.

Required: validated unique target IDs, an exact source revision, strict membership checks, no global mutation outside the selected spans, and rejection of ambiguous patch counts. Unselected text must remain byte-for-byte unchanged.

Evidence: [route:145](/home/xwingace/Documents/Projects/Taco-upgrade/app/api/writing/humanize/route.ts:145), [materialization:220](/home/xwingace/Documents/Projects/Taco-upgrade/app/api/writing/humanize/route.ts:220), [patch helpers:201](/home/xwingace/Documents/Projects/Taco-upgrade/lib/writing-quality.ts:201).

### 4. Deep Scan can mistake missing evidence for a strong result

A mocked `{ completions: [] }` produced `humanConfidence: 100` and `likely_human`. Missing predictions are treated as zero overlap. Provider failures instead become a synthetic 50/50 mixed result. The API reports success and consumes a use, even when there were insufficient eligible sentences or no usable provider analysis.

This mechanism predicts a few sentence endings and compares word overlap. Its inverse is not a demonstrated authorship probability. An unavailable analysis must remain unavailable, with no invented confidence.

Evidence: [deep analysis:74](/home/xwingace/Documents/Projects/Taco-upgrade/lib/ai-detection-server.ts:74), [failure fallback:110](/home/xwingace/Documents/Projects/Taco-upgrade/lib/ai-detection-server.ts:110), [success/metering:42](/home/xwingace/Documents/Projects/Taco-upgrade/app/api/writing/deep-detect/route.ts:42).

### 5. Final text and its approval can disagree

Deleting all rewritten text resurrects the original because the active document is selected with `rewritten || inputText`. Export then receives that original. Separately, editing the final text retains the previous quality decision and passing gates. Reopening a cloud session without check metadata defaults its label to Accepted.

Required: distinguish absent output from intentionally empty output; bind every check to the precise text revision; never infer approval from missing metadata.

Evidence: [active text:418](/home/xwingace/Documents/Projects/Taco-upgrade/app/suite/writing-tools/page.tsx:418), [cloud restore:733](/home/xwingace/Documents/Projects/Taco-upgrade/app/suite/writing-tools/page.tsx:733), [editing:994](/home/xwingace/Documents/Projects/Taco-upgrade/app/suite/writing-tools/page.tsx:994), [Accepted fallback:1011](/home/xwingace/Documents/Projects/Taco-upgrade/app/suite/writing-tools/page.tsx:1011).

### 6. Mobile users lose necessary actions

Below the `lg` breakpoint, the full action rail disappears. The replacement offers Scan, then Humanize, then Export Word, plus Save/Copy. Diagnose and Verify are unreachable. After editing output, the UI can recommend Run Scan while the only primary action remains Export Word. This is a functional loss, not simply a layout preference.

Evidence: [mobile action choice:778](/home/xwingace/Documents/Projects/Taco-upgrade/app/suite/writing-tools/page.tsx:778), [hidden rail:929](/home/xwingace/Documents/Projects/Taco-upgrade/app/suite/writing-tools/page.tsx:929), [mobile controls:1113](/home/xwingace/Documents/Projects/Taco-upgrade/app/suite/writing-tools/page.tsx:1113). This finding comes from code and loaded-component inspection; this review did not perform a new mobile browser session.

### 7. Word allowances have correctness and retry problems

A controlled month-rollover reproduction started with 4,000 previous-month words. Reading usage showed zero, but recording 100 new words wrote 4,100 into the new month. The reset condition loses the stored month before it decides whether to reset.

The suite checks input size before generation and charges full output afterward. Concurrent requests can pass the same balance; expansion can exceed it; a paragraph rewrite charges the full merged document. There is no durable request receipt for uncertain retries. Public paid-tier humanizing bypasses the suite's monthly word check, unless intentionally defined as a separate entitlement.

Required: one explicit entitlement policy, an atomic month-bound reservation and request receipt, a documented charge unit and consistent failure/retry settlement. Keep current prices and allowance amounts while correcting enforcement.

Evidence: [usage read:336](/home/xwingace/Documents/Projects/Taco-upgrade/lib/usage-tracker.ts:336), [charge:373](/home/xwingace/Documents/Projects/Taco-upgrade/lib/usage-tracker.ts:373), [public route:114](/home/xwingace/Documents/Projects/Taco-upgrade/app/api/writing/humanize-free/route.ts:114).

## Product quality and usability findings

**Too much ceremony before useful editing.** The user navigates to Humanize writing, arrives at Writing Trust Studio and must Scan before Humanize is enabled. Five pipeline stages and a score dashboard compete with the editor. The brand is coherent, but the main task should be easier to recognize.

**Overlapping controls need a clearer hierarchy.** Modes, domain, tone, length, intensity and pace create many choices. Presets should set a small visible set of options; advanced controls should explain their practical effect. Fast/Best are routing choices, not measured quality guarantees. Actual latency and cost remain unmeasured.

**The prompt can suppress the writer's voice.** It mandates sentence variance, fragments, contraction frequency and unusual word choices, and bans broad punctuation/vocabulary patterns. These rules can conflict with formal prose, quoted material, parallel resume bullets and the selected domain. Shift to audience/purpose/style instructions and contextual editing; preserve competent original passages.

Evidence: [prompt:115](/home/xwingace/Documents/Projects/Taco-upgrade/lib/writing-prompts.ts:115).

**Scores are easy to overinterpret.** The browser showed a 32-word draft as Not enough text while displaying 73 Style and recommending Export or save. Local tests also rejected a valid six-word career bullet as a mechanical artifact. English-specific segmentation and contraction rules produce unsuitable signals for some other languages. Suppress unsupported scores; use concrete observations such as repeated openings or long sentences, with language/genre limits.

**Review changes is missing.** The model returns explanations, but the UI does not render them. Provide highlighted additions/deletions, accept/reject per change, undo and revision history. Optional semantic-risk checks should assist that review, not replace it.

**Export changes the document.** Word/TXT append a title and a Generated with AI Detector Suite footer that are absent from the editor. Word converts numbered lists to bullets. TXT/DOCX import extracts plain text, so it does not preserve document layout. Provide clean export by default, an explicit optional change/assistance report and a preview of any added content. Keep required source citations intact.

Evidence: [export:49](/home/xwingace/Documents/Projects/Taco-upgrade/lib/doc-export.ts:49), [footer:79](/home/xwingace/Documents/Projects/Taco-upgrade/lib/doc-export.ts:79), [TXT:111](/home/xwingace/Documents/Projects/Taco-upgrade/lib/doc-export.ts:111).

**Copy still contradicts the actual service.** Main-screen limitations are helpful, but Help promises a plagiarism/uniqueness check that makes sure content is original. Public examples introduce unsupported departments, onboarding work and job requirements while promising preservation. Remove these unsupported implications and use examples that preserve every supplied fact.

Evidence: [Help:233](/home/xwingace/Documents/Projects/Taco-upgrade/components/PageHelp.tsx:233), [examples:18](/home/xwingace/Documents/Projects/Taco-upgrade/app/tools/ai-humanizer/AIHumanizerLanding.tsx:18).

**Accessibility is incomplete.** Mode/intensity/pace selections lack radio or pressed semantics. Help lacks proper dialog semantics and focus/Escape management. The editor has a label and save status is announced. A formal contrast and assistive-technology audit remains outstanding.

**Privacy communication can be more useful at the action.** The privacy page discloses model-provider processing, and local drafts are owner-scoped. The editor should distinguish on-device Scan, external AI processing and cloud Save where the user takes each action. Do not claim provider retention/training guarantees without verifying the actual accounts and contracts. Plain source sanitation also alters legitimate `system:` text and quotations before preservation checks; preserve an immutable original and treat the draft as data instead.

**Long-input/provider handling needs hardening.** Public input validation is weaker than the suite schema. The OpenRouter timeout is cleared after headers, before response-body consumption, and truncation reasons are not checked. Word-count limits alone do not bound a huge single-token request. Test body timeouts, truncated JSON, long documents and cancellation explicitly.

## What is worth retaining

- Folded-A identity, restrained paper/ink/coral visual language and shared workspace layout.
- Original-text retention, owner-bound local drafts, explicit storage failures and optimistic cloud-save conflicts.
- Controls for domain, tone, length, intensity and protected terms, after simplifying their presentation.
- Paragraph-level editing as a concept, after making scope enforcement exact.
- Local style feedback that works without a provider, with honest scope and better genre/language handling.
- Career-focused integration: let the user improve an actual cover letter, profile section or recruiter message and return the reviewed version to its source tool.

## Recommended next build

### Pass 1 — Make the existing contracts reliable

Fix strict model schemas and failed-gate behavior; exact patch scope; numeric/term matching; malformed/insufficient analysis states; stale approval and empty-final handling; month-bound atomic metering and retry receipts. Align public/suite validation and entitlements. Correct contradictory Help/examples and export mutations.

Acceptance: the seven altered-fact fixtures must no longer receive unconditional all-clear approval; bad/empty model responses must not become successful charged rewrites; untargeted paragraphs remain unchanged; edited/restored text never carries stale approval; retries and monthly rollover preserve the correct allowance.

### Pass 2 — Build the editing experience users expect

Use one consistent Humanize writing title. Make the main flow **paste or import → choose purpose/voice → improve → review changes → use the text**. Keep Scan/diagnostics optional and reachable on every screen size. Add exact-selection rewriting, inline comparison, accept/reject, undo, version history and a source-tool return action.

Then add an optional personal-voice sample, explicit language/locale support and a concise processing/remaining-allowance disclosure. Preserve the approved design language. Make quality labels describe what was actually checked.

### Pass 3 — Measure before claiming leadership

Run a blinded staging benchmark with at least 60 examples across resume bullets, cover letters, recruiter messages, LinkedIn writing, formal/technical prose and general writing. Include excellent drafts that should barely change, second-language English, numbers, negatives, quotations and adversarially difficult inputs. Add non-English support only with separate language-specific evaluation.

Compare source text, Taco's revised system and a plain model-rewrite baseline; include competitor outputs where account access and terms permit. Use human review for meaning preservation, naturalness, personal voice, genre fit and edit usefulness. Track accepted-change rate, factual alterations, unnecessary edits, p50/p95 latency, cost per accepted 1,000 words and failed/partial requests. Detector score should not be the optimization target.

These are proposed evaluation gates, not completed results. Live model quality, cost, speed and competitive prose preference remain unverified.

## Evidence and continuation

- [Exact corpus results](audits/humanizer-2026/corpus-results.json)
- [Additional scoring examples](audits/humanizer-2026/score-results.json)
- [Reproduction script](audits/humanizer-2026/corpus.cjs) — runs locally, uses installed esbuild, writes its results under `/tmp`; no provider calls.
- Temporary frontend reproduction: `/tmp/humanizer-product-audit.test.cjs`; results `/tmp/humanizer-product-audit.log`.
- Prior broad [implementation report](tool-upgrade-implementation.md). Its successful tests remain valid for their tested contracts; this deeper review expands coverage and identifies additional work.

Recommended product direction: **career writing that sounds like the user, preserves their evidence and makes every change reviewable**. Complete Pass 1 before the broader live staging journey, then evaluate the redesigned editor with real tasks.
