# Taco 2.0 — product and design preparation

8 October 2026. Prepared from [Fanout's public site](https://fanout.sh/) for the user's request to begin Taco 2.0 preparation while continuing the current neo-brutalist design. This milestone is reference research and a proposed experiment; it does not certify an implemented redesign.

## Direction

Keep Taco's recognizable paper, ink, coral, original blue, and lavender shadow roles. Borrow Fanout's breathing room, coherent navigation, and document-like product explanations. The useful change is stronger hierarchy: one obvious next action, a few meaningful destinations, and evidence that can be inspected without opening every tool.

Fanout's gray shadows, many category colors, company logos, illustrations, and promotional copy are its own design choices. They are not Taco's new palette or assets. Resume templates remain independent employer-facing documents.

## What we captured

A delegated research agent saved public HTML for the homepage, AI course, and Labs, plus linked CSS/JS and extracted tokens. Firecrawl was authenticated but rejected the scrape because its credits were exhausted. Public source capture and a real browser supplied the fallback evidence. Raw captures are local and gitignored under `.firecrawl/fanout-2026-10-08/`.

The homepage was inspected at **1440 × 1000** and **390 × 844**. Search opening and Escape dismissal were verified on desktop. The phone menu opened a navigation dialog and its Close control dismissed it. No search query, account flow, payment, upload, or external submission was made.

| Observation | Evidence and confidence | Taco implication |
| --- | --- | --- |
| Large, calm typography surrounded by generous space | Browser: desktop hero 88px, weight 400, line height 87.12px; phone 48.75px / 49.725px. Body uses Overused Grotesk. | Make the outcome and next action dominant; keep supporting source/status text legible. Font replacement is not decided. |
| Tactile paper and book objects explain the product | Browser: angled artifacts surround the hero; light canvas `#f7f7f8`, ink `#272727`, fine borders and layered button depth. | Use real resume excerpts, match explanations, and packet sections as useful objects; retain Taco's lavender depth. |
| A large product is presented through a small set of paths | Browser: course directory and grouped desktop/mobile destinations. CSS: course grid changes from 2 to 3 to 4 columns at 1024 and 1536px. | Organize around the career journey; make advanced tools discoverable without giving every tool equal prominence. |
| Search connects several content types | Browser: labelled search combobox inside a dialog, clear keyboard dismissal and opening hint. Query results were not tested. | Build on Taco's existing command/search entry point; group available actions and saved objects clearly. |
| Phone composition changes, rather than merely shrinking | Browser: compact Menu control, tall navigation panel, vertically stacked hero actions; document scroll width 390px at a 390px viewport. Desktop scroll width was 1437px at 1440px. | Keep the primary workflow easy to read and act on at narrow widths. Taco remains mobile-first; Fanout's visible desktop-preference notice is not a suitable pattern to adopt. |
| Motion is restrained in source, with explicit reduced-motion handling | Source: 150/200/250ms tokens, hero rotation every 2400ms with reduced-motion handling; rotation also observed in browser. | Prefer short feedback transitions; do not animate essential evidence out of view. Reduced-motion behavior still needs a Taco browser test. |

Source details: [Fanout homepage](https://fanout.sh/), [AI course](https://fanout.sh/ai), [Labs](https://fanout.sh/labs). The latter two were captured as source scaffolds; their hydrated or signed-in workflows were not visually verified.

## First proposed experiment

Prepare one reviewable workspace concept around the existing journey:

1. **One next action.** Resume upload for a new user; the actual next unfinished task for a returning user.
2. **Four understandable destinations.** Resume, job matches, applications, and interview preparation. Keep additional tools available through the existing discovery controls.
3. **One evidence area.** A source excerpt, the reason a job matches, and the packet's review state. Make verified, inferred, draft, and missing information distinguishable through words as well as color.
4. **Useful document cards.** Consistent ink borders, spacing, and lavender shadows. Prioritize content and actions over decorative card variety.
5. **A phone composition.** Stack evidence where two columns would squeeze it; retain the existing top mobile tools rail and dashboard rules.

Start with the genuine empty state, then inspect the same composition with an actual available result. Do not fill the concept with invented scores, fake saved applications, or fabricated career claims. The north star remains resume → three explainable matches → one review-ready packet. Truth locks and the explicit human review boundary apply throughout.

The concept should answer whether users can identify their next step, understand why a match was shown, and find what still needs review. It is an experiment to review before committing to a Taco 2.0 component migration. Current landing and app refinements can continue independently.

## Evidence files and limits

- [Detailed source and design report](../../.firecrawl/fanout-2026-10-08/DESIGN.md)
- [Capture manifest](../../.firecrawl/fanout-2026-10-08/capture-manifest.json)
- [Measured browser observations](../../.firecrawl/fanout-2026-10-08/browser-observations.json)
- [Desktop screenshot](../../.firecrawl/fanout-2026-10-08/browser-desktop-1440.png)
- [Desktop search screenshot](../../.firecrawl/fanout-2026-10-08/browser-search-1440.png)
- [Phone screenshot](../../.firecrawl/fanout-2026-10-08/browser-phone-390.png)
- [Phone navigation screenshot](../../.firecrawl/fanout-2026-10-08/browser-phone-menu-390.png)

This is an initial public-reference study. It does not establish search-result quality, demo behavior, logged-in usability, console quality, full accessibility conformance, or responsiveness at every breakpoint. Future Taco UI implementation still requires type-check, build, and real result-state browser verification at 320 / 390 / 430 / 768 / 1024 / 1440px, including console and horizontal overflow checks. Third-party assets and fonts have not been selected for reuse.

## Choosing complementary references

Added 8 October 2026 after the user asked how to discover other sites worth learning from and prepare a design-token system. The shortlist below is a research recommendation based on checked first-party product documentation. Fanout has the earlier rendered-browser evidence; the other products have not received the same visual, mobile, or interaction audit.

Use [Mobbin](https://mobbin.com/) to discover app screens and flows by the problem being solved, such as onboarding, search, document editing, or review. Its public library describes screens, flows, animations, and UI elements. Discovery should lead to the actual product or its official documentation; a gallery image alone does not establish usability, accessibility, current implementation, or exact tokens. No subscription or account has been created for this research.

| Reference | Checked first-party evidence | Taco question to investigate next |
| --- | --- | --- |
| Fanout | Earlier source captures and desktop/phone browser observations in this brief | How can spacious hierarchy and tactile artifacts make the next action and its evidence clear? |
| [Linear](https://linear.app/docs/display-options) | Documents grouped/ordered views, list/board layouts, and control over visible properties | Which application or match details should appear immediately, and which belong in an expanded view? Study information density and navigation in a future visual pass. |
| [Craft](https://support.craft.do/en/write-and-edit/styling) | Separates page-level and text-level styling; documents card layouts and structural separators | How can Taco's review workspace make long content easy to scan? Study document presentation while preserving independent exported resume templates. |
| [Raycast](https://manual.raycast.com/action-panel) | Documents contextual actions, grouped sections, a primary action, search, and keyboard dismissal | How can one discovery entry point expose useful actions for the selected resume, match, or packet? Taco's external-send actions still require explicit review and approval. |
| [Teal](https://help.tealhq.com/en/articles/14435727-how-to-track-your-job-applications) | Describes a job tracker with application status organization | Are the career workflow labels and task progression understandable? Investigate the domain model without assuming its matching claims or scores meet Taco's evidence standard. |
| [GitHub Primer](https://primer.style/product/getting-started/foundations/color-usage/) | Explains base, functional, and component color tokens | How should Taco separate actual values, semantic roles, and occasional component-specific needs? |
| [Radix Colors](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) | Assigns scale steps to backgrounds, interactive states, borders, fills, and text | Which surface/state pairs need explicit tokens and tests? Its published pairing guidance does not validate Taco's custom palette. |

These are complementary lenses, not a recommendation to combine every site's visual style. Recommendations in the last column are Taco adaptations, rather than findings that those products solve Taco's exact problems.

For each candidate, record five checks as supported, pending, or unsuitable, with a source or screenshot rather than an invented quality score:

1. **Task fit:** identify the precise Taco task it could improve.
2. **Repeatable system:** inspect the pattern across more than one component or screen.
3. **Complete states:** inspect empty, loading, populated, focus, error, and disabled behavior where relevant. Public marketing pages may leave these pending.
4. **Phone and access:** check narrow layout, readable evidence, keyboard use, and motion preferences. Appearance does not establish accessibility.
5. **Brand and evidence fit:** adapt the pattern to the approved palette, truthful data, human review, existing dashboard rules, and the top mobile tools rail.

The shortlist stage is complete when every reference has a distinct question and an evidence boundary. Advance only the strongest few into deeper capture. Adopt a pattern after a small Taco concept demonstrates the user's next step, match reason, and remaining review work with genuine empty/actual-result states. No user test or implementation outcome is claimed here.

## Proposed token preparation

A design token is a named reusable value or role. Taco needs a system covering color, typography, spacing, border width/radius, elevation, and motion, plus component states. The following organization is a proposed Taco adaptation informed by Primer and Radix; it is not an implemented token API.

| Layer | Responsibility | Proposed examples |
| --- | --- | --- |
| Primitives | Approved concrete values and scales | `palette.lavender`, `palette.ink`, `space.*`, `font.size.*`, `border.width.*`, `radius.*`, `motion.duration.*` |
| Semantic roles | Why a value is used | `surface.page`, `surface.card`, `text.primary`, `text.muted`, `action.primary`, `focus.ring`, `color.shadow`, `evidence.verified`, `evidence.inferred`, `evidence.draft`, `evidence.missing` |
| Component roles | A specific distinction that shared roles do not express | `button.primary.background.hover`, `input.border.focus`, `reviewCard.shadow.color`, `evidenceBadge.text` |

For example, `palette.lavender` supplies `color.shadow`, which supplies `reviewCard.shadow.color`. Shadow offset, blur, spread, and behavior are separate values; a shadow color is not the entire elevation recipe. This preserves the user's lavender choice while allowing consistent depth across components.

Prepare the system in this order:

1. Inventory actual existing tokens and consumption using `scripts/design-audit.js` and the canonical token definitions. This checkout still contains earlier blue/navy token definitions; the preferred palette is a known user choice, not proof that migration is complete. Reconcile definitions before introducing new aliases or another token file.
2. Record the approved palette and scales once; map semantic roles to them. Preserve existing names where possible, or document aliases and retirement paths. This document does not select replacement fonts or numerical scales.
3. Document each core component's default, hover, pressed, focus, disabled, loading, and error states as applicable. Distinguish evidence status through visible labels as well as color; unknown stays unknown.
4. Validate text, borders, focus indication, and attention states against each actual surface, including theme boundaries. Reusing an external scale is not a contrast result for Taco.
5. Review one truthful workspace concept, then decide the token contract and migration scope. Keep typography for exported resumes separate from product typography. Run the existing design gate and required all-width UI checks during implementation.

Prepared outputs at this stage: a complementary shortlist, evidence checks, token layer examples, and a validation sequence. Deep captures of the new candidates, final numeric tokens, the workspace concept, and component migration remain future work.

## Product direction as general AI assistants gain execution

Added 8 October 2026 in response to the user's question about Taco's future differentiation from Claude and ChatGPT. This is a strategic recommendation for discussion, not a committed roadmap, implementation claim, or forecast of hiring results.

**Recommended position:** Taco helps a person turn their actual career evidence into better-informed opportunities, defensible applications, and preparation for the conversations that follow. Its value should accumulate across the job-search cycle and remain usable with the person's preferred AI assistant.

The competitive pressure is real. [ChatGPT's official browser documentation](https://learn.chatgpt.com/docs/browser) describes website navigation and multi-step actions, with permissions, sign-in, and site-access limits. [Claude's computer-use documentation](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork) describes app interaction with per-app permission and limitations; [Anthropic's overview](https://claude.com/resources/articles/dispatch-and-computer-use) describes research-preview execution and reliability limits. These sources establish general execution capabilities, not reliable application submission on every hiring portal.

Memory and ongoing work also exist in general assistants: [OpenAI's dots documentation](https://learn.chatgpt.com/docs/dots) describes retained preferences, decisions, ongoing context, and work between conversations. Therefore memory, automation, user approval, writing, and a distinctive UI are insufficient on their own to establish Taco's competitive advantage. The bet is the quality and convenience of a domain-specific, evidence-linked workflow; it must earn repeat use and payment in tests.

### Current code foundations

The following anchors were inspected in the canonical Taco checkout during this discussion. Code presence does not establish production activation, end-to-end UX quality, or competitive efficacy.

| Foundation | Code evidence | What remains unproven |
| --- | --- | --- |
| Protected source/proof links | [firestore.rules](../../firestore.rules), guarded `resume_versions` and packet proof fields | Source provenance is not independent verification of employment or a metric's truth. |
| Export checks | [lib/resume-export-truth.ts](../../lib/resume-export-truth.ts), reapplies guardrails to the original and candidate resume | Guardrails do not establish detection of every possible unsupported claim. |
| Continuing career context | [lib/career-twin.ts](../../lib/career-twin.ts), `buildMemory()` uses profile, preferences, queue and applications | Saved context must be accurate, editable, appropriately scoped and useful in the rendered workflow. |
| Explainable matching | [lib/job-recommendation-platform.ts](../../lib/job-recommendation-platform.ts), confidence, coverage, reasons, risks and score caps | Heuristic fit scores are not hiring probabilities or independently proven recommendation quality. |
| Outcome feedback | [app/api/applications/outcome/route.ts](../../app/api/applications/outcome/route.ts), links reported outcomes to calibration evidence where available | Outcomes are user-reported, sometimes unlinked, and do not prove which change caused an interview or rejection. |
| Human review boundary | [lib/assistant/agent-harness.ts](../../lib/assistant/agent-harness.ts), review requirement and manual job-link submission; [apply pipeline](../../app/api/agent/apply-pipeline/route.ts), guarded artifacts become ready for review | No general external application executor is established by these paths. |
| Calibration review | [lib/recommendation-calibration.ts](../../lib/recommendation-calibration.ts), readiness thresholds and human review; automatic changes remain false | No inspected production cohort establishes a learned ranking advantage. |

### Bets considered and recommended

Execution speed, generic document generation, a reusable evidence record, better job decisions, interview/skill preparation, outcome learning, and interoperability are possible product directions. I would concentrate the next iteration on the evidence record and the connected application workflow. Preparation and outcome learning become valuable extensions once that core works reliably. Browser execution can be added through scoped, approved integrations when its reliability and cost are understood.

1. **A career record the user controls.** Store achievements, projects, responsibilities, preferences, and reusable interview stories with their sources and confirmation status. Taco asks for missing facts instead of inventing them. Distinguish user-confirmed claims from independently verified evidence. Make correction, export and deletion straightforward; the product should earn reuse rather than depend on lock-in.
2. **A few opportunities worth considering.** Explain why a role fits, what conflicts with the user's constraints, what is unknown, and how fresh/reliable the source is. Allow the user to correct both the profile and the recommendation. Preserve the three-explainable-matches north star; the number is a product focus, not a promise that three suitable live jobs always exist.
3. **One continuing journey.** Carry the selected job, factual source, approved resume version, cover letter and screening answers into a visible review packet, then use the same evidence for interview preparation and outcome tracking. Future assisted execution should act on the exact reviewed version and record the destination and confirmed result. Retry or uncertainty must not become a false submitted status. Every external send retains explicit human approval.
4. **Help the person strengthen their case.** Where evidence is missing, identify an appropriate real work sample, practice task, or clarification to pursue. Reuse real examples in interview preparation. Record user-reported callbacks and outcomes, and learn cautiously when there is enough data. A rejection alone does not establish its cause, and a small history does not justify a success prediction.
5. **Work with the user's chosen AI.** Longer term, let authorized assistants consume a scoped, source-linked career record and reviewed packet through supported integrations or exports. Taco can provide consistent evidence, review state, and application history while a general assistant helps with execution. This is a proposed interoperability direction; no ChatGPT/Claude integration or permission flow has been implemented here.

The product experience should make the next decision, its evidence and its review state clear. Spacious typography, tactile document surfaces, the approved palette and lavender depth support that experience. They are part of usability and recognition; they do not prove a business advantage.

### Sequence and tests

For the first experiment, validate one role family within experienced professionals making a focused move. This audience recommendation is an assumption: these users may have reusable evidence and feel the burden of repeated tailoring. Interviews and observed workflow completion must establish whether that is true.

- **First:** inventory existing context and evidence paths, then demonstrate resume intake → target/constraints → explainable matches → one source-grounded review packet. Use genuine empty/actual-result states; keep secondary tools accessible within the relevant step.
- **Next:** connect the chosen job and approved material to interview preparation, deliberate follow-up drafts and user-reported outcomes. Learn which steps users actually reuse before increasing automation.
- **Later:** test scoped execution/interoperability and cautiously improve recommendations as linked outcomes become adequate. These are evidence-gated phases, not calendar commitments.

Compare the first workflow with the user's normal method and a general assistant using the same resume, job and constraints. Observe time to a useful reviewed packet, unsupported claims, amount of user correction, understanding of match reasons, and whether users return or pay for continued help. Report sample size, missing outcomes and uncertainty. Interviews per confirmed application can be a later cohort measure, but observational differences must not be advertised as causal improvement.

The existing under-ten-minute activation north star remains a target, not a measured result. During a successful search, the product should respect a user's request to pause activity; finding work is a successful exit. This strategy needs evidence of quality, repeated utility, willing payment and sustainable operating cost before being called a durable advantage.

## Token inventory and local concept

The user approved proceeding with a bounded local workspace concept and token inventory. This is preparation for review, rather than authorization to migrate the full app or release concurrent work. The source inventory below was completed on 9 October 2026 without changing the design-audit baseline.

| Area | Current source evidence | Implication for 2.0 |
| --- | --- | --- |
| Theme colors | [app/globals.css](../../app/globals.css) defines navy/blue dark tokens and white/blue light tokens. It is loaded by [app/layout.tsx](../../app/layout.tsx). | The preferred paper/ink/coral palette and lavender shadows are a user decision; the current global definitions do not establish that migration is complete. Use the actual Taco brand mark for its original blue. |
| Semantic names | Existing `--bg-*`, `--text-*`, `--border-*`, `--accent-*`, `--success`, `--warning`, `--danger`, and `--elevation-*` roles are widely consumed. | Preserve these useful role names in a future migration. Add explicit evidence, focus, spacing, radius, typography and motion roles only where needed. |
| Paper and elevation | `--paper` is currently a printed-document surface. Elevation recipes use black or neutral navy. | Do not repurpose the document token for the page. Define shadow color and geometry separately for the local concept; leave exported resume templates independent. |
| Shared components | [SuiteToolChrome](../../components/suite/SuiteToolChrome.tsx) supplies `SuiteToolShell`, `SuitePanel`, `EvidenceBadge`, empty and unmeasured states. There is no generic React Card/Button/Field API. | Reuse the shell, panel and evidence badge in the concept. Local semantic button and field styles can remain small and explicit. Avoid claiming nonexistent shared primitives. |
| Global interference | The global stylesheet includes broad `!important` radius/padding overrides and an inline-shadow reset. | An isolated preview can test the intended treatment without importing those rules or writing a competing app-wide theme. |

The read-only `node scripts/design-audit.js` run scanned 415 files: 177 distinct hardcoded hex values across 268 occurrences, 241 prohibited occurrences, 30 radius values, 202 inline buttons versus 114 shared-class occurrences, 1,149 inline cards versus 19 shared-class occurrences, and 18 of 43 suite routes outside the shared shell. It found seven token-definition files, 15 scanner-reported undefined references, and zero accent contrast failures.

Interpret these counts narrowly. Shared-class occurrences are not React-component adoption. Several undefined-token findings are dynamically assigned tokens or partial token names; actual missing surface aliases include `--bg-card`, `--bg-page` and `--bg-primary`. The contrast gate checks its recognized literal theme definitions; zero failures does not validate the concept's custom palette. These figures support planning, not a claim that the app now follows the proposed system.

The concept source lives in [taco-2-workspace-preview](taco-2-workspace-preview/), with the local build/serve entry point [taco-2-workspace-preview.mjs](taco-2-workspace-preview.mjs). It has no app route, authentication bootstrap or remote data connection.

The populated-state browser check used an excerpt from this saved strategy brief, explicitly named as **project evidence**, rather than invented employment or an assumed resume. A short excerpt from [OpenAI's public Frontend Software Engineer, Codex App posting](https://openai.com/careers/frontend-software-engineer-codex-app-san-francisco/) supplied authentic posting text for exercising the local review controls. That posting is a test input, not a recommendation to this user. The concept continues to show fit as unassessed and freshness as unverified; it does not fetch, rank or validate the posting. The test context does not establish that the user qualifies for the role.

### Delivered concept and verification

Run `node docs/reviews/taco-2-workspace-preview.mjs` from the repository root to build and serve the concept at **http://127.0.0.1:3112/**. Use `--build` for the isolated bundle only, or `--port=3113` for another local port. The server binds to loopback, serves an explicit file allowlist, and disables remote connections through its content-security policy. Build output and browser proof are ignored under `output/taco-2-workspace-preview/`.

The concept uses the real `SuiteToolShell`, `SuitePanel` and `EvidenceBadge` components. Its tentative numeric palette and scales live once in [tokens.css](taco-2-workspace-preview/tokens.css); the actual brand asset supplies the mark. Paper is the default view, with a dark view and lavender depth. The editorial heading uses the local system serif stack; this is a concept choice, not a decision to replace the app's fonts. Semantic aliases are scoped on the concept root so they resolve against the active theme, rather than inheriting already-resolved light values.

The header's primary action advances through **add evidence → add posting → prepare local review note → review → practice**. Four destinations remain available through the desktop sidebar and the top phone tools rail. A supplied source stays verbatim and separate from user confirmation. Posting fit and freshness remain unknown. The review note collects entered text and context; it is not a generated resume, cover letter, screening-answer packet or submission. Approval binds the exact note inputs, and edits make the old note stale. Optional plain-text import and an explicitly approved local text download work without persistence or remote services.

| Check | Observed result and boundary |
| --- | --- |
| Build and types | Isolated esbuild bundle and strict scoped TypeScript pass. Canonical `npm run build` passes, generating 187 static pages; `npm run type-check` passes after build generation and again after the final source changes. An initial concurrent type check raced the build's generated files; the sequential rerun resolved it without a code change. These checks do not approve unrelated dirty-tree work for release. |
| Responsive states | Real-browser empty and populated review states checked at **320 / 390 / 430 / 768 / 1024 / 1440px**, in paper and dark views. No horizontal page overflow or measured horizontal text clipping in the populated review. Visible control targets are at least 44px; input text is 16px. Phone tools appear below 1024px; desktop sidebar appears from 1024px. |
| Source and status | Genuine project evidence and a short public posting excerpt render verbatim with explicit provenance labels. Local `.txt` import of this saved project brief was exercised and its name/title checked in the editor and evidence trail. Confirmation remains distinguishable from independent verification. Fit is unassessed, freshness unverified, and no personal employment or qualification is inferred. |
| Review and keyboard | Review checkbox toggles with Space, approval activates with Enter, and the note's focusable named region scrolls from the keyboard. Focus uses a visible 3px palette ring. Download is disabled before approval; a requested download produced a text file containing the source, honest unknown states and exact-note approval. Application-note edits and source edits clear approval and block stale approval/download. Practice notes are separate from the note inputs. |
| Next step | Header action transitions were exercised through source, posting, note preparation, review and approved interview practice. Changing the source returns the main action to evidence intake. An independent source review found no approval bypass in those branches. |
| Theme and contrast | Browser-computed shared text/surface aliases match the active concept roles at every tested width. A numeric check of **24 explicit text/boundary pairs per theme** passes: minimum tested text ratio 5.63:1 paper / 5.91:1 dark; minimum tested boundary ratio 3.44:1 paper / 3.84:1 dark. This is a selected-pair check, not a full accessibility certification. |
| Console and privacy | No errors or warnings observed in the preview console. Source review found no auth, network, storage or external-send calls; content-security policy also prevents remote connections. Entries clear on reload; user-requested downloads leave the tab by explicit action. |

Proof includes `proof/empty-{theme}-{width}.png`, `proof/review-{theme}-{width}.png`, responsive and semantic-role JSON, selected-pair contrast JSON, and keyboard/approval/stale-note captures under the ignored output folder. The preview opens on its genuine empty state after verification, with no loaded test context.

The first concept and token inventory are delivered for review. Whether a user understands the next step, match reason and remaining review work still needs observation with an actual career source and connected matching results. Live resume parsing, explainable recommendations, truthful AI packet generation, signed-in persistence and the interview/outcome loop remain integration work. The three-match and ten-minute north star has not been demonstrated by this local note exercise. Review the composition and role names before planning component migration; preserve the existing dashboard and document rules throughout that later work.
