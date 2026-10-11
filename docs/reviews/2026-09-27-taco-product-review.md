# Taco product, experience, and growth review

Reviewed September 27, 2026. Scope: the current working tree and the public site at https://talentconsulting.io. This is a review and proposed roadmap, not an implementation or deployment.

**Taco has a credible product idea, but its current experience weakens its strongest promise.** Helping someone find suitable jobs and prepare applications grounded in their actual experience is useful. The immediate opportunity is to make that one journey reliable, obvious, and easy to complete. The current landing page emphasizes writing polish and tool breadth; the workspace exposes too much product machinery; and a reproduced matching error contradicts the evidence-based positioning.

I would fix trust and activation before increasing acquisition spend or adding more tools. Keep the visual identity, the connected career context, and user control over applications. Concentrate the product around a small number of completed outcomes.

## Evidence and limits

| Area | What was checked |
|---|---|
| Public website | Crawled all 35 sitemap URLs; all returned HTTP 200. Inspected live landing interactions, signup entry, and resolved pricing. |
| Visual experience | Live landing at 320, 768, and 1440 pixels; local landing and guest workspace at 390 pixels; desktop landing inspection. No document-level horizontal overflow observed on these landing checks. |
| Product behavior | Local phrase check, before/after demo, guest dashboard, Taco resume/target setup, and a submitted synthetic ATS match. |
| Source | Positioning, landing motion, scoring, proof reports, navigation, pricing entitlements, analytics, SEO, representative privacy/security controls, and AI workload economics. |
| Checks | TypeScript check passed. Twenty-six selected handoff, resume-guardrail, privacy, and plan-packaging tests passed. Lint failed. |
| Not established | Conversion, retention, actual recommendation precision, customer acquisition cost, field Core Web Vitals, rankings, backlinks, paid account behavior, production AI output quality, completed checkout, or an authenticated resume-to-packet journey. This is not a penetration test or an accessibility certification. |

Findings below distinguish observed behavior, source-based risks, and strategic hypotheses. Local changes have not all reached production: for example, production landing copy still says “Studio” in one plan paragraph, while the local version says “Max.” Existing workspace changes were preserved.

## 1. Product idea and market position

The strongest proposition is: **Taco turns your actual experience into a focused job search and review-ready applications.** The durable value would come from accurate career memory, fresh sources, explainable matches, reusable application context, and learning from outcomes. A generic AI writer can generate a letter; it does not automatically provide that continuous, reliable workflow.

The current audience in [PRODUCT.md](/home/xwingace/Documents/Projects/Taco/PRODUCT.md) is broad. A sensible first segment to validate is experienced knowledge workers seeking a focused move: they have substantial evidence to reuse and feel the cost of repetitive tailoring. This is a hypothesis, not evidence of product-market fit. Interview recent job seekers and watch them complete the first application workflow before committing to it.

Competitive pressure is real. Teal markets free resume creation and downloads alongside matching and tracking; Simplify markets free autofill and application tracking. These are vendor offerings, not independently verified outcome claims. Competing on “many tools” or basic generation alone is unlikely to be enough. [Teal resume builder](https://www.tealhq.com/tools/resume-builder), [Simplify Copilot](https://simplify.jobs/copilot).

| Product decision | Recommendation | Why |
|---|---|---|
| Primary job | Choose a role worth pursuing and prepare a truthful application | Connects product value to an actual decision and deliverable |
| Initial audience | Validate one role family and experience band first | Makes matching quality, examples, and acquisition more specific |
| Product breadth | Keep secondary tools discoverable inside relevant steps | Reduces choices before the user gets value |
| Brand | Consider “Taco by TalentConsulting” as a consistent public hierarchy | Resolves the current Taco / Talent Studio / Talent Consulting ambiguity without assuming a domain migration |
| Differentiation | Show evidence, provenance, freshness, and unresolved gaps | Makes trust observable rather than an adjective |
| B2B | Treat teams as a separate validation track | Consumer job seekers and team buyers have different workflows and purchase criteria |

The first research round should answer: What would someone stop using if Taco worked? Which output would they pay to reuse? What makes a recommended job unsuitable? Where do they stop trusting the tool? Test actual task completion with 5–8 representative users before interpreting preference polls as demand.

## 2. Highest-priority findings

P1 means address before pushing growth or relying on the affected claim. P2 means a meaningful improvement after the critical journey works. These are review priorities, not predictions of revenue impact.

| Priority | Finding and evidence | Recommended change and acceptance condition |
|---|---|---|
| P1 | **Negated qualifications count as matches.** A local guest ATS submission explicitly said “No AWS certification and no Python experience.” Both were marked Matched; the result was 81, “Excellent Match,” with zero missing keywords. | Distinguish keyword occurrence from supported experience, handle negation and ambiguous evidence, and separate required from preferred qualifications. This example must not earn positive evidence for AWS or Python. |
| P1 | **The proof report claims verification it did not perform.** The ATS result says a rewrite preserved facts even though this workflow only scores text. Its verdict depends on missing-keyword count. | Make report claims depend on actual checks and report type. A scoring-only report must not assert that a rewrite or exported document was verified. |
| P1 | **The production rewrite demonstration is visually broken.** Clicking Rewrite it changes the score to 91, but the replacement sentence remains `display:none`. Reproduced locally and live. | Resolve CSS specificity and verify every example's visible before/after result, including reduced motion. Checking the score alone is insufficient. |
| P1 | **The demo undermines the core promise.** Its replacement adds six partners, a 31% reduction, and a quarter that are absent from the displayed source. The scores are fixed constants. | Show the source facts that justify the rewrite, or retain only facts already present. Label illustrative examples and remove unexplained score changes. This is a defect in the demonstration, not evidence that the production rewriting model generated those facts. |
| P1 | **The landing page does not start the main product journey.** The primary CTA runs a phrase check, the secondary advertises 22 tools, and the header opens generic signup. There is no landing resume upload. | Make the primary path resume → target → matches → application review. Reuse the existing Taco upload/target entry. Keep a clearly scoped writing check as a secondary entry. |
| P1 | **The guest dashboard contains implementation instructions.** It displays “Use skeleton-style progress while evidence loads” and tells readers what Taco “should” do. Empty context can read “No open proof gaps.” | Replace design-spec language with user actions and real state. No resume should show “Add your resume to check gaps,” not an apparent all-clear. |
| P1 | **The core free-value promise is inconsistent.** Product strategy defines activation as three matches plus an opened packet, while pricing excludes prepared packets from Free. | Decide whether a limited first-packet preview is part of activation or whether matching is the free activation milestone. Align UI, limits, docs, and analytics around that decision. |
| P1 | **Lint is not a functioning release check.** `npm run lint` invokes `next lint` and exits with “Invalid project directory … /Taco/lint.” | Configure the installed ESLint tool correctly and add a working PR check. This failure is a tooling problem, not a list of code lint violations. |
| P2 | **The mobile ATS task is buried under setup explanation.** At 390px, the first viewport contains the page header, application-kit explanation, cross-links, and four empty context cards; the actual inputs are below. | Put the resume/JD inputs or upload action first for guests. Collapse context until it contains useful information. |
| P2 | **The first impression repeatedly disappears.** Hero motion substitutes generic draft copy for the real headline on a 9.4-second cycle until interaction. | Keep the benefit visible from the first paint. Place an optional, one-shot before/after animation beside it with a visible pause/replay control. |
| P2 | **Brand and plan language drift.** Page title uses Talent Studio, wordmark uses Talent Consulting, agent uses Taco; production also mixes Studio and Max. | Maintain one public naming map and use it for navigation, metadata, plans, email, and checkout. |
| P2 | **Current landing interactions are not represented by specific funnel events in the component.** Resume-handoff analytics exist, but the active landing has no upload and no explicit check-result/next-step events. | Instrument the actual entry and outcome path under the existing consent model. Never send resume text or identifying details in analytics. |

Key implementation evidence:

- [Substring-based scoring](/home/xwingace/Documents/Projects/Taco/lib/ats-score.ts:285) treats occurrences as matches; [fallback category scores](/home/xwingace/Documents/Projects/Taco/lib/ats-score.ts:313) return 70 when no keywords are extracted. Missing measurement should be “not assessed,” not a reassuring percentage.
- [Proof verdict](/home/xwingace/Documents/Projects/Taco/components/suite/ProofEngineReport.tsx:315) describes a safe rewrite based on match gaps.
- [Conflicting rewrite selectors](/home/xwingace/Documents/Projects/Taco/components/landing/talent-landing.css:412): the `html.js` hiding rule outranks the completed-state display rule.
- [Fixed demo examples](/home/xwingace/Documents/Projects/Taco/components/landing/talentLandingMotion.ts:81) contain additional claims and fixed scores.
- [Dashboard state copy](/home/xwingace/Documents/Projects/Taco/components/dashboard/PhaseOneCommandCenter.tsx:40) and [empty-state decision](/home/xwingace/Documents/Projects/Taco/components/dashboard/PhaseOneCommandCenter.tsx:63) expose implementation language and premature advice.
- [Handoff test commentary](/home/xwingace/Documents/Projects/Taco/scripts/landing-resume-handoff.test.js:179) explicitly acknowledges that the current landing has no upload. Passing this test does not establish a complete landing-to-Taco handoff.

## 3. Landing page: first impression and conversion

The dark navy, cyan accent, large typography, and generous spacing are coherent. Buttons are easy to distinguish; the local phrase check provides an immediate response without uploading text; the layout stayed within the tested viewport widths. Preserve those strengths.

The dominant hero object is a large brand mark. It establishes visual identity but shows no product result. “Nothing here is invented” communicates a trust principle before explaining what the visitor can accomplish. “Career operating system,” “proof,” “signals,” and a count of tools require interpretation. Visitors should not need to scroll through a product philosophy to discover the job-search benefit.

Recommended hero direction:

> **Find roles that fit. Apply with your real experience.**
>
> Taco uses your resume and goals to explain job matches and help prepare application materials for your review.
>
> **Start with my resume** · **See an example application**

This is proposed copy, subject to the corrected matching behavior and actual plan access. Do not add “no account,” a time guarantee, or a free-packet promise unless the implemented flow supports it.

Recommended page order:

1. Stable benefit, primary resume entry, and a readable example match card. Put Taco's role in one plain sentence.
2. A concrete result: matched evidence, one missing requirement, source link, last checked time, and the next action.
3. Three steps: add experience, choose a target, review the application. Explain signup and storage at the step where they matter.
4. A truthful before/after with source facts visible. Replace decorative score changes with an explanation of the actual improvement.
5. Trust details: what is stored, how AI processing works, how users correct facts, and what is never submitted automatically.
6. A compact plan comparison with verified prices, clear limits, and a link to full details.
7. Specific questions about imports, saving, exports, cancellation, source freshness, and unsupported claims; then the final resume CTA.

Use real product examples before testimonials. Add customer quotes only with permission and a verifiable context. A fictional sample should be labeled as a sample. The Taco chat currently presents a scripted career history and timeline; make that status explicit.

Replace the moving 22-tool inventory with a stable grouping by outcome: Find roles, Prepare applications, Practice interviews. A tool catalogue can remain available for visitors arriving with a specific task. Remove internal design rationale such as the sentence about “no per-tool colour coding.”

At mobile and tablet sizes, the desktop navigation and signup button disappear, with the dock appearing only after scrolling. Keep a visible menu and a direct sign-in route near the top. The desktop “Start free” opens signup while the mobile dock's identically named action scrolls to the check; use labels that predict the action.

## 4. Onboarding and daily use

The existing `/suite/agent?intent=resume-upload` is closer to the intended first experience than the generic dashboard. It shows upload, target role, salary, location, work mode, and a scout preview. Build the main entry around this existing capability rather than creating another disconnected tool.

| Stage | User needs to know | Recommended behavior |
|---|---|---|
| Resume intake | What can I upload, and where does it go? | File limits and processing notice at upload; parse progress; editable extraction preview; recoverable errors |
| Target | What do I want next? | Role and location first; optional salary and work mode; distinguish unknown from unrestricted |
| Matches | Why is this role worth my time? | Evidence, hard constraints, missing requirements, source and freshness; explain zero-result states |
| Packet | What changed, and is it true? | Source-linked edits, missing-fact questions, user approval, actual export checks |
| Application | What happens outside Taco? | Employer link and manual-submission handoff; mark applied only from confirmation |
| Return visit | What is the one useful next action? | Resume setup for newcomers; review a match, finish a packet, or follow up for returning users |

Simplify navigation around those stages. The current sidebar grouping is a useful start, but terms such as Market Oracle, Career Twin, Proof Engine, Agent Queue, and “STAR Stories + Answer RAG” create avoidable learning. Use plain names in the main journey; reserve advanced terminology for details.

A new workspace should have one dominant next step and a short progress indicator. Do not show a wall of empty metrics, upgrade copy, and queue controls before a resume exists. On returning visits, show actual unfinished work instead of generic instructions about how the product behaves.

For the ATS output, distinguish **text coverage**, **supported evidence**, **parser/format observations**, and **unknowns**. Never imply that a text heuristic reproduces every employer's ATS or predicts hiring outcomes. Add regression cases for negation, expired credentials, planned training, substring collisions, ambiguous dates, empty input, and jobs outside software engineering.

## 5. Design system, accessibility, and performance

The current stack is sufficient. More frameworks are not the bottleneck. Reuse existing design tokens and the component gallery to establish a small set of forms, result cards, empty states, progress states, and dialogs. Each should have examples for guest, loading, partial success, unavailable data, and error recovery.

Public landing and pricing use different logo treatments; the mobile pricing screenshot shows a conspicuous white rectangular logo patch on the dark header. Four font families are initialized at the root, and Material Symbols still uses an external stylesheet despite a comment about avoiding third-party font loading. Consolidate typography and load route-specific display assets only where needed. Measure the bundle before choosing an optimization; package presence alone does not establish that a page downloads every dependency.

Concrete accessibility work:

- Add a main landmark and skip navigation to the landing page; no `main` was present in the inspected DOM.
- Announce debounced phrase-check results through a suitable live status region. The current results container has no `aria-live`.
- Complete keyboard tab semantics for the example and conversation controls; source contains selected-state buttons but no arrow-key handling for those tab groups.
- Provide an obvious way to pause automatic motion. Reduced-motion CSS and focus-paused tool rails are already present and worth keeping.
- Preserve the observed 16px mobile input text and large primary targets. Verify contrast, zoom/reflow, focus order, screen-reader results, and all component states before claiming WCAG conformance.

No production speed score was measured in this review. Establish real mobile field monitoring and a repeatable production-build lab check. Target the standard good thresholds at the 75th percentile: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1. Dev-server timing is not evidence of production performance. [Web Vitals guidance](https://web.dev/articles/vitals).

## 6. SEO and content

The foundation is better than the positioning: all 35 sitemap pages responded successfully, canonical URLs were present in the crawl, public pages contain meaningful HTML, and structured data exists. The most valuable SEO work is improving intent, consistency, and task usefulness, alongside the following technical fixes.

| Check | Assessment | Action |
|---|---|---|
| Public sitemap | Pass: 35 URLs, HTTP 200 | Submit and monitor in Search Console; a successful fetch does not establish indexation |
| Live robots.txt | Fail: HTTP 404; local route returns 200 | Investigate deployment/routing and verify the live response after release |
| Static asset access | Source risk: local robots disallows `/_next/` | Allow rendering assets. Do not deploy this restriction unchanged. Google needs access to required JS/CSS. [JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) |
| Workspace indexing | Inconsistent source policy: root is indexable; robots disallow is not a noindex guarantee | Define intended indexable public pages and use appropriate noindex/auth behavior for workspace pages |
| Search/social message | Root title says career intelligence; Twitter title leads with humanizer/detector | Use consistent product naming and promise across title, description, social cards, and structured data |
| Modification dates | Public and guide dates share May 14, 2026 in source | Track substantive page changes; do not blanket-refresh dates merely for freshness |
| Tool index | Five public tools versus 22 advertised tools; some destinations enter the suite | Explain free/account-required access and organize by outcome with useful descriptions |
| Editorial depth | Role guides exist; several are roughly 300–370 words in the crawl | Add original examples, evidence-based explanations, and useful linked tool actions; avoid word-count padding |
| Rankings/backlinks | Unmeasured | Use Search Console and an SEO dataset before assigning traffic, ranking, or difficulty claims |

The repository crawler labels the missing robots file “critical.” I would downgrade that to a deployment/crawl-policy defect: Google treats most 4xx robots responses as no crawl restrictions, not as a site-wide block. Likewise, a short contact page is not automatically low quality, and a product price does not require an external research citation. Its six flags need human interpretation. [Google robots handling](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec).

Prioritize keywords that lead to the core task. The table is a qualitative content backlog; search volume, current ranking, and keyword difficulty were not measured. Do not treat these priorities as a forecast.

| Query/topic | Intent | Suggested destination/content | Priority |
|---|---|---|---|
| Match resume to job description | Task | Usable match tool with evidence examples | High |
| Tailor resume without changing experience | Task | Source-preserving rewrite walkthrough | High |
| AI job search assistant | Commercial | Taco workflow page and sample result | High |
| Job application packet | Informational/task | Complete annotated packet example | High |
| Resume keyword checker | Task | Coverage tool that separates evidence from mentions | High |
| ATS resume formatting checker | Task | Parser observations and export examples | High |
| Software engineer resume example | Informational | Improve existing example with source facts and a target role | High |
| Data analyst resume example | Informational | Annotated example tied to a realistic JD | High |
| Product manager resume keywords | Informational | Existing guides plus evidence-rich examples | Medium |
| Career change transferable skills resume | Informational | Before/after with defensible transferred experience | Medium |
| How to spot stale job listings | Informational | Freshness checklist and source limitations | Medium |
| Job application tracker with follow-ups | Commercial/task | Show the actual saved-job-to-follow-up journey | Medium |
| Interview stories from your resume | Task | Source-grounded STAR story workflow | Medium |
| Resume facts AI should not change | Informational | Trust methodology with test cases | Medium |
| Teal alternative for job matching | Commercial | Factual, maintained comparison after matching quality is proven | Later |
| Simplify alternative for reviewed applications | Commercial | Compare distinct workflows and user control honestly | Later |

Humanizer/detector acquisition should be assessed by downstream activation, not visits alone. It can bring an audience with different needs from job seekers. Connect relevant writing visitors to a useful application action, while avoiding claims that a detector establishes authorship or employability.

## 7. Pricing, retention, and operating efficiency

Both live and local pricing eventually resolved to **Standard $9.99/month and Max $19.99/month** during this review. Older strategy documents propose different amounts. Use the live verified catalogue as the current product truth and update internal planning separately. [Public pricing](https://talentconsulting.io/pricing).

The paid distinction—hands-on tools versus recurring scouting and prepared packets—is understandable. The presentation can improve: describe usable outcomes and exact limits instead of “workloads,” “starter access,” and “full access.” Explain why Max has fewer runs but more work per run. A pricing comparison should make cancellation and account requirements easy to understand before checkout.

Trust protection should be universal. Paid tiers can buy automation, capacity, and continuity; they should not appear to buy factual accuracy that Free lacks. Make that clear in the feature comparison.

Source already contains workload caps, model routing, a cost model, and a 70% workload-margin gate. These are useful foundations, but fixed per-operation estimates are not observed profitability. Track actual provider spend, retries, job-supply cost, storage, delivery, support, payment costs, and refunds by activated and paying cohort. Use the existing economics model to compare estimated versus actual cost.

For efficient execution, parse a resume once, reuse structured context, cache unchanged source data, deduplicate jobs, and invoke expensive reasoning only when deterministic checks or simpler processing cannot resolve the task. Attach timeouts and recoverable states to provider failures. Preserve the existing deterministic checks; fix their semantics rather than replacing everything with a model call.

Retention should follow the job-search lifecycle: useful new matches, incomplete applications, upcoming interviews, and agreed follow-ups. Let users reduce or pause activity after finding work. A successful exit is different from abandonment. Test a limited-duration search pass only after the core paid value and unit economics are understood.

## 8. Measurement, trust, and release tooling

Measure a privacy-respecting funnel from landing entry → intake started → parse completed → target saved → useful matches shown → match opened → packet reviewed → application confirmed → paid conversion. Record errors and latency at each transition. Reconcile definitions with the selected Free/paid activation boundary.

The existing consent-aware analytics and content-exclusion tests are strengths. Keep resume text, prompts, employer names, and user identifiers out of optional analytics. Report opt-in cohort coverage so a low-consent sample is not mistaken for the whole audience. Do not infer that analytics is absent merely because no events are sent before consent.

Use these measures to guide decisions:

| Measure | Why it matters |
|---|---|
| Time to first useful match | Tests the actual activation promise |
| Useful-match precision in top three | Tests relevance; define “useful” with users and assess by role cohort |
| Hard-constraint violation rate | Catches location, seniority, credential, and work-mode mismatches |
| Packet review completion | Distinguishes generation from usable output |
| Unsupported-claim rate | Directly tests the trust proposition |
| Cost per accepted packet | Combines quality and operating efficiency |
| Seven-day return during an active search | Tracks recurring usefulness without treating employment as churn failure |
| Activated-user paid conversion | More meaningful than visitor-to-signup alone |

The repository's 10-minute activation and 70% top-three useful-match precision are targets, not measured achievements. Establish the baseline before changing these targets or publishing them.

Before resume upload, make processing and storage understandable; link to actual deletion controls and support. The privacy page acknowledges AI providers and retention, but the review did not verify provider settings or deletion end to end. Validate those before making stronger privacy claims.

Development priorities: fix lint, add a PR gate for types and relevant behavioral tests, and exercise the browser journey on a production build. Existing scheduled SEO/security workflows do not replace a per-change check. The landing CSS defect illustrates why a passing source-level test is not a rendered-UI test. Add assertions for visible rewritten text, correct context handoff, negated qualifications, and empty-state honesty.

## 9. Recommended sequence

Effort bands are estimates for planning, not delivery commitments: small means roughly up to a day, medium several days, large a focused iteration with validation.

| Order | Deliverable | Impact / effort | Release condition |
|---|---|---|---|
| 1 | Correct ATS evidence matching and report claims | High / medium | Negated, missing, and unknown qualifications are represented honestly; score-only results claim no rewrite verification |
| 2 | Repair proof demo and expose source facts | High / small | All examples visibly work and add no unsupported claims |
| 3 | Remove implementation copy and premature all-clear states | High / small–medium | A new user sees one truthful next action |
| 4 | Connect landing to existing resume/target flow | High / medium–large | Context survives navigation/auth; chosen activation definition is attainable within tier rules |
| 5 | Align hero, CTA, brand, pricing, and metadata | High / medium | Every surface makes the same verifiable promise |
| 6 | Repair robots delivery, asset policy, lint, and browser gates | High / medium | Live policy is correct and checks run successfully on the release candidate |
| 7 | Validate the journey with representative users | High / medium | Observe comprehension, completion, trust objections, and time to value |
| 8 | Instrument cohorts and calibrate recommendations | High / large | Quality and unit-cost baselines are available by target segment |
| 9 | Publish the first three high-intent content/tool improvements | Medium / medium | Every page leads to a useful, working product outcome |
| 10 | Expand distribution and secondary capabilities | Conditional / ongoing | Acquisition experiments are judged by activated, retained users and contribution margin |

For the next focused iteration, success means: a visitor understands Taco, brings their resume, receives an honest useful result, knows the next action, and can return without repeating their work. More tools should wait until that sequence is dependable.

## Reproduction and verification record

Commands completed:

```text
npm run type-check
node --test scripts/landing-resume-handoff.test.js scripts/resume-morph-guardrails.test.js scripts/analytics-privacy-contract.test.js scripts/plan-outcome-packaging.test.js
node scripts/seo-audit.js --out-dir=/tmp/taco-review-seo-2026-09-27-full
npm run lint
```

Results: types pass; 26/26 selected tests pass; 35 sitemap pages return 200; crawler reports six heuristic flags; lint exits 1. A production build, purchase, account creation, and authenticated application/export were not performed.

ATS reproduction at `/suite/ats-analyzer?tab=score`, signed out in the local workspace:

```text
Resume:
Synthetic test profile: Software Engineer at ExampleCo, 2021–2025.
Built TypeScript and React interfaces and Node.js APIs. Used PostgreSQL
and Git. Reduced page load time by 30% through profiling and caching.
Collaborated with product managers and designers. No AWS certification
and no Python experience.

Job description:
Software Engineer. Build React and TypeScript interfaces and Node.js
APIs backed by PostgreSQL. Collaborate with product and design.
Required: three years of software engineering experience, Git, and
automated testing. Preferred: AWS certification and Python.
```

Observed: overall score 81; eight matched, zero partial, zero missing; AWS certification and Python classified as Matched with the negated source snippet shown as evidence. This is a deterministic scoring defect, not an observed model hallucination. Production scoring was not submitted during this review.

For the landing defect, click Rewrite it in the first example. The original disappears and the fixed score rises to 91, while the replacement stays hidden. DOM inspection showed the completed class on the widget and computed `display:none` on its after-text on both local and production pages.
