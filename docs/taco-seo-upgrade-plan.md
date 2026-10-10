# Taco SEO upgrade: research and implementation plan

**Date:** 9 October 2026
**Status:** Research and S0 audit implementation complete; S1–S8 remain proposed. No deployment.
**Canonical project:** /home/xwingace/Documents/Projects/Taco-upgrade
**Public site:** https://talentconsulting.io

Taco should first make its public promises, indexing controls, and measurement trustworthy, then improve the pages that bring a visitor into the real resume workflow. The strongest initial acquisition task is **tailoring an existing resume to a job description while keeping every claim supported by the candidate's experience**. This is a product positioning recommendation, not a proven high-volume keyword or a promise of rankings.

The user's requested journey remains the content and conversion spine: **upload → diagnose/parse → paste job description → controlled AI morph and unlock → choose template → review, export and save**, with navigation between stages. SEO explains and leads into that journey; it does not replace the product flow or redesign the dashboard.

## 1. Evidence, ownership and scope

Three fresh-context **gpt-6-luna** researchers covered independent lenses. The coordinator checked consequential claims against current source, fresh unauthenticated production responses, official documentation, and first-party competitor pages. The native project mapper preserves the separate dashboard workstream.

| Evidence | Purpose |
| --- | --- |
| [Technical brief](research/2026-10-09-taco-seo-technical.md) | Live crawl, canonical/indexing policy, audit coverage, metadata, sitemap and schema |
| [Market brief](research/2026-10-09-taco-seo-market.md) | Seven competitor positions, sampled search patterns, 18 candidate query clusters and page ownership |
| [Content and measurement brief](research/2026-10-09-taco-seo-content-measurement.md) | Claim corrections, editorial briefs, consent boundaries, event contract and review cadence |
| [Fresh full crawl](../.codex/long-horizon/seo-research/technical/audit-full/seo-audit-summary.md) | All 35 sitemap URLs checked on October 9; raw JSON alongside summary |
| [Independent public route receipt](../.codex/long-horizon/seo-research/coordinator/public-route-verification.json) | Legal pages, workspace/admin shells, robots and resume-builder schema checked separately |
| [Source fingerprints](../.codex/long-horizon/seo-research/coordinator/source-fingerprints.json) | Exact working-source hashes inspected; not a deployed-build receipt |
| [Independent Luna review](../.codex/long-horizon/seo-research/review/plan-review.md) | Challenges to shared-file ownership, page scope, telemetry necessity and executable route policy |
| [Performance/access limitations](../.codex/long-horizon/seo-research/coordinator/performance-access.json) | PageSpeed API returned 429; no field or lab score obtained; analytics account data unavailable |
| [Recovery checkpoint](../.codex/long-horizon/taco-seo-upgrade.md) | Authorization, owners, scope and next work package |
| [Project map](../.project-map/index.html) | SEO research/plan milestones beside preserved dashboard milestones |

The working checkout was on codex/taco-upgrade at HEAD 806ac3c06292bb7f4a728de3575fa59790efd5be, with hundreds of concurrent edits. That SHA identifies local history; it does not identify everything currently deployed. October 8's [release receipt](reviews/combined-release-2026-10-08.md) records the last verified deployment. October 9 live observations and source observations are labeled separately.

The current audience assumption is US English professionals applying to specific jobs. Students and career changers remain supporting audiences; exact priority and market demand need customer/query evidence. No volume, CPC, difficulty, traffic forecast, backlink count, indexing count, or conversion baseline has been invented. Firecrawl had exhausted credits; researchers used native web search and public HTTP instead. Search samples are qualitative snapshots, not localized Google rank measurements.

The research package is complete. The authorized S0 package now changes the audit engine, route policy config, deterministic tests and SEO workflow, plus coordinator records; it makes no product metadata, UI, auth or analytics changes. Implementation owners must preserve existing dashboard rules, Firebase bearer-token authentication, admin RBAC, truth locks, runtime Stripe pricing, current consent authority, and the independent visual design of exported resume templates.

**S0 completion — 9 October:** Integrated 34 passing deterministic tests, eight named route policies and two host probes. Pull requests run local fixtures; scheduled/manual live audits separately enforce deterministic policy failures. Anonymous origin-bound transport rejects unsafe paths/redirects, aggregates restrictive metadata and excludes non-public body content from reports. The isolated package is committed on `codex/seo-route-audit` at `ed7c27e2` (implementation `b9f57e4c`) and its four target files were integrated with unchanged-baseline hash guards into the concurrent checkout. [Verification and integration receipt](../.codex/long-horizon/seo-research/s0/verification.json), [independent review](../.codex/long-horizon/seo-research/s0/review.md).

The expanded public-only crawl checked 43 pages and found 10 designated route-policy failures (seven canonical incidents and three missing workspace noindex directives), plus 29 advisory findings. These are response-policy observations, not proof of actual indexing or account ownership. The original live process exit was not captured; the coordinator verified a failing CI decision from the saved result, and local CLI fixtures verify exit behavior. The isolated full verification chain passed design/types/release/admin/email/observability/build, but failed 11 unchanged assistant tests and 38 dependency findings on the unchanged baseline lock. No gate was weakened and no release readiness is claimed. S1 will correct metadata after shared-file ownership is reconciled; S0 does not fix those product defects.

## 2. What is established, and what is still unknown

| Area | October 9 baseline | Practical implication |
| --- | --- | --- |
| Host and crawl | HTTP and www redirect to HTTPS apex; robots and sitemap return 200; all 35 sitemap pages return 200 | Retain working host normalization; do not migrate domains |
| Existing audit | 0 critical, 0 high, 22 medium, 1 low | This is this script's classification, not a clean bill of SEO health |
| Audit warnings | 16 title-length heuristics; 2 word-count heuristics; 1 link-count warning; 3 citation heuristics; 1 multiple-H1 warning | Review intent and semantics; do not pad pages or optimize arbitrary counts |
| Legal canonicals | /privacy and /terms are public 200 pages with homepage canonicals | Distinct public pages inherit an inappropriate canonical |
| Workspace controls | /suite/resume is public shell 200, self-canonical, index/follow; /suite/admin is public shell 200 with homepage canonical and index/follow; robots blocks /suite/ | Explicit exclusion policy is missing/inconsistent; this does not establish private-data disclosure or actual indexing |
| Audit blind spots | Only sitemap URLs are crawled; CI fails only critical findings | The legal/workspace findings can coexist with a passing scheduled audit |
| Content inventory | 15 role/industry guides and 7 blog posts, plus public tool/template pages | Improve and fact-check existing inventory before expanding it |
| Public claims | Resume-builder copy says “end-to-end encryption,” “never leaves your account,” and “fine-tuned” Gemini; blog claims morphing doubles ATS pass-through | Statements need evidence/correction; the privacy page explicitly describes model-provider processing |
| Analytics source | Central facade is consent-gated and sanitized; SeoTrackedLink bypasses it; automatic pageviews are enabled in the consent-aware loader | Extend the existing safeguards to the remaining transport paths |
| Search performance | GSC queries, impressions, clicks, chosen canonicals, index coverage and backlinks not accessed | No defensible growth forecast or completed indexation claim |
| Product measurement | GA4 account data unavailable; current loader requires authenticated, server-confirmed opt-in | GA4 is not a complete anonymous organic visitor denominator |
| Performance | Public PageSpeed API probe returned 429 quota error | LCP/INP/CLS and Lighthouse score remain unknown; the error is not a website performance failure |

The root cause of canonical inheritance is app/layout.tsx:58–62. The audit fetches only sitemap URLs at scripts/seo-audit.js:834–864, calls canonical mismatches medium at :467–484, and exits CI unsuccessfully only for critical findings at :943–945. These are confirmed source facts.

Robots controls crawling, not authentication. Google must be able to crawl a safe response to see noindex; a blocked URL may still appear as a URL-only result. Classify anonymous shells separately from protected data before adjusting crawl rules. Keep private documents inaccessible. See [Google's noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

## 3. Market direction and page ownership

First-party pages show that resume checking, tailoring, tracking and AI assistance already overlap across competitors. [Jobscan](https://www.jobscan.co/resume-matcher) presents resume/JD matching and distinguishes its match visualization from an employer ATS score. [Teal](https://www.tealhq.com/tool/resume-checker) pairs checking with its workspace. [Huntr](https://huntr.co/) combines tracking, tailoring and autofill. [Rezi](https://www.rezi.ai/rezi-docs/ai-resume-agent) describes resume analysis, JD targeting and job discovery. [Kickresume](https://www.kickresume.com/en/templates/resume/) competes on templates. These are company claims, not independent product tests.

Truthful tailoring is also claimed by emerging products such as [FilterProof](https://filterproof.ai/evidence-based-ai-resume-builder) and [Olive Jobs](https://www.olive.jobs/resume-tailoring). Therefore do not describe Taco as the only evidence-based or review-first product. Its opportunity is to **demonstrate** source-to-change traceability, visible gaps, controlled morphing, and usable export/save behavior. Whether users search “evidence-based AI resume” enough to warrant a dedicated page remains unproven.

Use “Taco by TalentConsulting.io” consistently at first-contact public touchpoints, with a descriptive career/resume phrase. Retain Taco as the assistant and TalentConsulting.io as the company. Do not chase food queries or rename the product for SEO. Align the existing WebSite/Organization identity and verified profiles; do not fabricate social links. Google's [site-name guidance](https://developers.google.com/search/docs/appearance/site-names) supports a consistent, accurate identity but does not guarantee its selected display.

| Query family / visitor task | Canonical owner | First implementation |
| --- | --- | --- |
| Taco resume / TalentConsulting / AI career workspace | / | Clear entity and linked overview of the real workflow |
| AI resume builder / edit an existing resume | /tools/resume-builder | Current intake, editing, controlled rewrite, template/export explanation |
| Tailor resume to job description | Initially the builder's tailoring section; proposed /tools/resume-tailoring only after the distinct-page gate below | Demonstrate source → requirement → accepted change; one task owner at each stage |
| Tailor without inventing experience | Tailoring section plus one practical supporting guide | Positioning test; no assumed volume |
| ATS resume checker / compare resume with job description | /tools/ats-analyzer | Separate parser/structure checks from Taco's own role-alignment guidance |
| What does an ATS match score mean? | Analyzer explanation plus an existing ATS article rewritten for this informational question | Explain inputs, excluded signals and limitations |
| Resume templates / ATS-friendly formats | /templates | Decision aid, actual previews, entitlement and PDF/Word differences |
| Resume example for a role | /resume-examples/[role] | Evidence worksheet/scaffold; no invented candidate achievements |
| Resume keywords for an industry | /resume-keywords/[industry] | Include only supported skills; requirements-to-evidence examples |
| AI interview practice | /tools/interview-prep | Explain current practice/feedback and accurate access gates |
| Interview questions / STAR stories for a role | /interview-questions/[role] and the existing STAR article for the general method | One role pilot with real contribution/evidence prompts |
| Jobs matching my resume | Home explanation; a future public explainer only with distinct value | Personalized results remain private; no empty indexed job shell |
| Career-change resume / transferable experience | A specific template/guide section first | Validate customer language before a new cluster |
| Pricing and tool access | /pricing | Runtime prices and tested current plan limits; no SEO pricing copy fork |

Before creating /tools/resume-tailoring, require a reviewed live workflow, unique task content/demo that is not a paraphrase of the builder, a distinct query/reader need, and a contextual internal-link plan. If this gate fails, keep one richer builder page. Do not create parallel generic /resume-tailor, /ai-resume-tailor and /resume-optimizer pages. Existing informational pages answer questions; public tool pages own tool use. Canonical tags do not substitute for giving duplicate pages a purpose.

Defer broad “best tool” roundups, location/role page factories, detector-evasion content and public job feeds. A named comparison may be considered later only with dated, reproducible testing and disclosure. Do not copy competitor interview-lift or ATS-pass claims.

## 4. Prioritized implementation backlog

P0 means “before increasing acquisition or claiming the upgrade is ready,” not a newly declared production incident. Estimates below are work-package sizes, not delivery dates. Names describe implementation responsibilities; assign actual builders when the build begins.

| ID / priority | Concrete work and files | Owner / dependency | Acceptance and size |
| --- | --- | --- | --- |
| S0 / P0 | Define deterministic route policies in scripts/seo-audit.config.json before changing CI thresholds. Extend scripts/seo-audit.js and its tests to check non-sitemap routes, complete redirect chains, headers plus all robots/googlebot tags, canonical origin/target, duplicate/conflicting directives and expected exclusion. Distinguish indexable pages, safe anonymous shells and protected responses. | SEO infrastructure owner; coordinator reviews route inventory | Regressions for homepage inheritance, off-host canonical, redirected/noindex sitemap entry and unexpected indexable shell fail; intentional 401/404/noindex cases do not fail as missing landing pages. Fixtures precede live policy changes. 1–2 focused packages |
| S1 / P0 | Make metadata-only root edits in app/layout.tsx; give home its canonical through a server metadata boundary; add explicit legal/public metadata using lib/seo.ts. Choose precise server metadata or response headers for suite/admin/auth/settings exclusion and verify effective directives even when child metadata exists. Preserve the client WorkspaceFrame. Choose one robots source: existing public/robots.txt or app/robots.ts, never both. Header changes must match next.config.js and firebase.json. | Coordinator /root exclusively owns root/home metadata and header integration after reconciling the active dashboard diff; one bounded route implementer assigned at build kickoff; S0 classifications required | Public indexable pages self-canonical; safe anonymous app shells explicitly noindex; protected data remains inaccessible with original auth controls and crawl blocks, plus exclusion headers where applicable. No workspace/admin sitemap entries or blanket private unblocking. 1–2 packages |
| S2 / P0 | Correct source/copy claims in app/tools/resume-builder/ResumeBuilderLanding.tsx and page.tsx, app/blog/[slug]/ArticlePage.tsx, app/blog/posts.ts and lib/seo-content.ts. Remove unsupported privacy/model/outcome claims and undocumented “us vs others” assertions. Replace invented achievements with evidence worksheets or clearly marked fill-in scaffolds. | Content/product owner; privacy/security/billing facts verified with current code and approved policy | Exact primary citations for retained factual statistics; no unsubstantiated pass-through/interview uplift; no claim JD supplies candidate facts; no unsupported E2E/fine-tune promise; all example placeholders visibly explained. 2–3 editorial packages |
| S3 / P0 | Route components/seo/SeoTrackedLink.tsx through lib/analytics.ts and lib/analytics/ga4-privacy.ts. Replace raw pathname/href with finite identifiers. Review automatic pageviews in components/privacy/ConsentAwareAnalytics.tsx and GA4 property Enhanced Measurement. Extend existing privacy/funnel tests. | Analytics/privacy owner; no new collection authority | Denied/stale/revoked consent sends no event even with a loaded gtag; no raw URL/query/referrer/document values; only opt-in authenticated cohort measured. Failure/duplicate cases preserve semantics. 1–2 packages |
| S4 / P1 | Improve existing builder, analyzer, templates and interview pages; accurate title/H1, visible limitations, gate disclosures, contextual links and actual product captures. Update components/seo/PublicSeoPage.tsx and RelatedLinks.tsx for meaningful related pages instead of generic source padding. | Content/UI owner; S1–S3 and stable product behavior | Each page solves its distinct task and reaches the correct workspace step; links work with/without an account; six-width browser evidence and clean console. No exported document template restyling. 2–3 packages |
| S5 / P1 | Add reviewed per-entry publication/revision/author/source fields to lib/seo-content.ts and app/blog/posts.ts; render the same fields in guide/blog views; derive Article and sitemap dates in lib/seo.ts, dynamic guide routes and app/sitemap.ts. Consolidate visible/schema FAQ data where retained. Review SoftwareApplication/Offer and entity data in app/page.tsx and lib/seo.ts. | SEO/content owner; actual editorial records and current entitlement/price evidence | Real dates or omitted unknown dates, never “today” on every build; schema matches visible copy; truthful authorship; no fake ratings; accurate offers or omitted uncertain commercial fields. 1–2 packages |
| S6 / P1 | Rework the first three editorial pilots below; optionally add one distinct tailoring route only after its gate. Update sitemap and relevant context links on publication. | Editor and product reviewer; S2, S4–S5 | Original useful content, one query owner, evidence ledger, tested destination, current byline/date, no generated near-duplicate expansion. One pilot per package |
| S7 / P2 | Obtain representative field/lab measurements for /, /tools/resume-builder, /tools/ats-analyzer and /templates. Diagnose measured font/hero/JS/image/SSR costs before edits. Inspect app/layout.tsx font/icon loading and landing/gallery bundles as suspects only. | Performance owner; tool availability | Preserve attractive animations, reduced motion, dimensions, landing html.js readability gate and mobile layout. Compare same-device repeated lab runs and available 28-day field data. No invented score target baseline. 1 measurement package before any optimization |
| S8 / P2 | Maintain monthly editorial/search reviews and aggregate SEO reporting. Optional Mission Control SEO tile later, through existing RBAC and honest “not connected/stale/unknown” states. | Founder/editor; authorized read-only reports and existing dashboard contracts | Report dates, cohorts and suppressed/unknown data; no account-level query/resume joins; no new admin fork or external write automation. Scope after core fixes |

S0 and read-only baseline collection can run together. S1 and S2 may proceed in parallel only after the coordinator assigns disjoint files and reconciles existing edits; no two agents may edit app/layout.tsx, app/page.tsx or deployment header files concurrently. S3 hardens current collection; it does not add new workflow telemetry. S4–S6 depend on stable product and truthful claims. GSC access is needed for demand/indexation validation, but is not a reason to delay deterministic canonical, copy or privacy fixes.

The S1 patch excludes root html/body structure, providers, ConsentAwareAnalytics mounting, font imports, theme/pre-paint scripts, landing html.js gate, CSS, dashboard navigation and exported template components. For a concrete home boundary, keep app/page.tsx as a server metadata wrapper and extract its current client behavior into proposed app/HomePageClient.tsx only if needed; the coordinator owns both files and preserves the current landing/auth behavior. Do not move whole route families or introduce a route-group redesign. Reconcile that extraction with the current landing owner before editing. S3 owns consent/transport changes in its separate reviewed package, not S1.

Update .github/workflows/seo-audit.yml to run deterministic fixture/route-contract checks on relevant pull requests and maintain a separate bounded live audit on its existing schedule/manual trigger. Make designated canonical/index-policy/schema-truth regressions fail CI. Keep word/title/link-count heuristics advisory. Do not make pull-request success depend entirely on a flaky production crawl or require account credentials for unit fixtures.

## 5. Route policy for the first technical package

| Route class | Index and canonical policy | Crawl / privacy policy |
| --- | --- | --- |
| Home and public tool/template/editorial pages | Indexable only when useful, public and current; one self-canonical and consistent OG URL | Crawlable HTML/text, ordinary links; no personalized candidate content |
| Privacy and Terms | Default plan: public self-canonical legal pages; sitemap inclusion optional | Crawlable; if a deliberate exclusion is chosen, explicit noindex instead of homepage canonical |
| /suite and safe anonymous workspace shells | Excluded from search; explicit noindex, including Googlebot; remove unrelated homepage canonical inheritance | Permit only named safe shells to be crawled if necessary for noindex visibility; inspect with GSC before claiming deindexation |
| /suite/admin and protected account/data routes | Excluded; no sitemap entry; precise noindex response/header where applicable | Preserve admin/user authorization and crawl blocks; do not open private data to expose noindex |
| /auth/* and /settings | Excluded; correct reset/login/settings behavior and no unrelated canonical | No token/query exposure; named safe anonymous responses may be crawlable for noindex, otherwise remain inaccessible |
| API, exports, uploaded files, resume/application/share records | Never part of SEO landing inventory; noindex headers where relevant | Auth/ownership are primary controls; no guessed file URLs or user data in the audit |
| Nonexistent routes | Real 404/410 as appropriate; effective noindex | Do not misreport inherited metadata on a real 404 as proof of a soft-404 or index leak |
| Accepted query/trailing-slash/alias variants | Follow route-specific redirect/canonical policy | Test variants without propagating sensitive query values into audit logs or analytics |

Review all known layouts and headers, not just /suite/resume. Private URLs may remain unknown to search; noindex plus a disallow is not evidence Google has processed exclusion. If Search Console shows an already indexed protected URL, use a reviewed remediation/removal plan while keeping authentication intact. No account mutation/removal request was made during this research.

The template gallery's 21-H1 warning needs semantic review: document previews contain headings for employer-facing resumes. Do not change exported resume headings to satisfy a regex audit. Keep product-page hierarchy clear and evaluate preview isolation/accessibility independently.

The S0 fixture/config schema must record: path or explicitly bounded pattern; expected anonymous status/redirect; body class (public-content, safe-shell, protected-error or not-found); crawl policy; effective index directive; canonical expectation (self, intentional target or omitted); sitemap membership; and required response headers. Resolve restrictive directives from the actual response, including multiple tags, Googlebot rules and X-Robots-Tag. Cover standard Next 404 and streamed metadata as fixtures so inherited generic metadata does not create a false incident. A public HTTP fixture cannot certify signed-in record ownership; keep existing auth/ownership tests as a separate prerequisite. Safe-shell robots exceptions must be exact named paths, never a blanket /suite/ allow.

## 6. Three editorial pilots and the public-to-product path

**Pilot A: tailor to a job without adding experience.** First improve the builder's tailoring explanation. A supporting guide uses requirements → source evidence → supported/adjacent/missing → reviewed wording → template/export checks. Include “result not measured” and no-change examples rather than invented metrics. Link to the analyzer for diagnosis, templates for format, and /suite/resume for execution after explaining account/access gates. A separate tailoring landing page is conditional, not the automatic first build.

**Pilot B: what a match score can and cannot tell you.** Refresh /tools/ats-analyzer and the existing ATS article around actual score inputs, structural parsing versus job fit, limitations and a reading-order/selectable-text checklist. Cite Taco's tested implementation for Taco behavior and a named vendor's primary documentation for that vendor only. O*NET/BLS describe occupations, not an employer's ATS score. Do not promise screening outcomes.

**Pilot C: interview stories grounded in real work.** Rework the existing STAR article and one reviewed role guide. Help the reader identify their actual contribution, evidence, tradeoffs and an unknown result, then practice follow-up questions. Link to /tools/interview-prep. Avoid fictional answers or claims about “most common” questions without research.

Each pilot requires a named accountable editor/reviewer, claim-adjacent sources, real publication/substantive revision dates, one intended reader task, an explicit access/plan boundary and a tested CTA. Use consented, approved product captures or clear evidence worksheets; never publish user resumes or screenshots with personal information.

The link path should be understandable without JavaScript: relevant guide → relevant public tool or template chooser → correctly disclosed workspace step → review → export/save. Retain current colors/navigation/dashboard rules. Do not remove landing html.js visibility gates or obscure substantive content behind animation.

## 7. Measurement contract and honest success criteria

Read-only GSC/GA4 aggregate exports are the preferred next input. Plugin discovery found GSC Wizard and Windsor.ai available but uninstalled; no property was connected. Request the least report access needed or use owner-provided exports. Preserve existing server-confirmed optional analytics consent; do not install anonymous tracking, session replay or new identifying dimensions for this project.

Baseline: GSC Web impressions/clicks/CTR/average position by canonical page, query cluster, country and device for an available 90-day window and an equal prior period if available. Also capture Page Indexing, selected canonicals, sitemap status and field CWV with data dates. Record property timezone and query suppression. A new/small property may have insufficient history.

Current GA4 is a consenting authenticated cohort. Report its stage progression separately from GSC search exposure. **Do not divide its exports by all GSC clicks and call the result the full organic conversion rate.** Do not join search queries to accounts or resumes.

| Stage | Reuse / proposed event | Trigger and bounded data |
| --- | --- | --- |
| Public CTA | Existing seo_* click names via the central facade | Real activation with current consent; finite page_id/destination/placement; no raw URL |
| Upload | Existing sona_resume_upload_started | Attempt only; fixed source enum |
| Parse | Existing sona_resume_parsed | Accepted non-empty normalized source; coarse source/count bands only |
| Job description ready | Proposed resume_jd_ready | Validated transition, not paste/keystroke; fixed workflow source and has_resume boolean |
| AI morph | Existing tool_use with resume_morph where sufficient | Accepted current draft/guardrail result; no generation ID, exact score or content |
| Review | Proposed resume_review_recorded | Accepted/edited/rejected/deferred action actually recorded; no diff or notes |
| Template | Proposed resume_template_selected | Actual changed selection; coarse ATS posture, not rerenders or private template identifiers |
| Export | Existing resume_download | Successful artifact creation and browser handoff; analyst label “export triggered,” not confirmed receipt/download |
| Account save | Existing sona_resume_saved where applicable | Confirmed cloud persistence; no ID/name/document value in GA4 |

Proposed names are optional follow-on candidates, not part of S3 or newly emitted events. Preserve legacy sona_* compatibility and existing analytics APIs. Add a JD-ready event only to answer a demonstrated intake-to-target dead-end question, a review event only to diagnose a demonstrated draft-to-review handoff problem, and a template event only to assess a demonstrated format/entitlement decision problem. Prefer existing aggregate events and qualitative feedback first. Before adding one, the owner must record the decision, minimum fields, cohort/denominator, current consent notice coverage and retention purpose; if those are not justified, omit it. No new anonymous cohort is authorized.

Per-operation dedupe is local; operation IDs never leave for GA4. Failed, cancelled or superseded operations do not count as success. Unknown required data is omitted/unknown, not converted to a measured zero.

Disable uncontrolled pageviews/history measurement before using manual page-level reporting where raw paths/queries/referrers can enter transport. If needed, derive public canonical URLs and titles from a finite route registry and scrub the entire transport, not only custom params. Confirm GA4 Enhanced Measurement settings; a config flag alone is not evidence all automatic events are disabled. Keep workspace stages coarse, not page-level user histories. [GA4 configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config) documents location/referrer defaults, and [PII guidance](https://support.google.com/analytics/answer/6366371) covers URLs and user-entered values.

Required test scenarios: no/stale/revoked consent; loaded gtag after revocation; current server confirmation; cross-tab withdrawal; arbitrary href/path/referrer/query/fragment; pendingResume/email/phone values; unknown enums/events; actual accepted success versus attempt; retries, cancellations and duplicate renders. Essential reliability records are separate; do not repurpose observability/retention controls for SEO.

| Review point | Question | Action supported by evidence |
| --- | --- | --- |
| First 30 days after the later release | Are public promises correct, routes controlled, pages discoverable, and reporting definitions valid? | Resolve correctness failures; inspect representative URLs; annotate exact deployment/content dates |
| Around day 60 | Are impressions relevant and do readers complete the page's task? | Improve snippets/content/CTA clarity; use qualitative reviews when data is sparse |
| Around day 90 | Which distinct pages should remain, improve or consolidate? | Compare equal windows with seasonality/device/indexing caveats; expand only supported clusters |

These dates are review cadence, not growth deadlines. No fixed rank, visitor, conversion, revenue or hiring-outcome target is justified by this research. Google [AI search guidance](https://developers.google.com/search/docs/appearance/ai-features) describes ordinary SEO eligibility and aggregate Search reporting; there is no special “GEO schema” requirement.

## 8. Schema, dates and performance decisions

Retain accurate Organization/WebSite identity, breadcrumbs and reviewed Article data. Make visible FAQ text and retained JSON-LD share one data source. Google retired FAQ rich results starting **7 May 2026** and removed their documentation in June: [official updates](https://developers.google.com/search/updates). FAQ copy can still help visitors; do not promise rich-result growth.

The homepage AggregateOffer and tool Offer details need verification against the actually available free/paid functionality. A zero-priced offer is appropriate only for the accurately described free offer; it does not mean every advertised AI capability is free. Paid prices come from runtime Stripe data or are omitted. Google SoftwareApplication rich results require a real rating/review among their required fields; none was established here. Keep truthful descriptive schema without claiming rich-result eligibility, and never invent ratings to satisfy the [software-app requirements](https://developers.google.com/search/docs/appearance/structured-data/software-app).

Replace global fixed May 14 lastmod with genuine per-content revision dates, or omit unknown values. Cosmetic edits/deploys do not manufacture new editorial dates. A sitemap helps discovery; it does not guarantee indexing. Generic numeric claims and words such as “2026” are not proof of research: correct the audit's interpretation rather than attaching unrelated citations.

Performance optimization follows measurement. Target a good real-user experience using Google's [CWV guidance](https://developers.google.com/search/docs/appearance/core-web-vitals) and available field data. Compare LCP around/under 2.5 seconds, INP around/under 200 ms and CLS around/under 0.1 at the relevant percentile; report exact metric/tool/window, not a fabricated baseline. Preserve beautiful motion while testing responsiveness, reduced motion, stable dimensions and low-end mobile behavior. LCP/INP/CLS cannot be certified from a quick HTTP response or an unknown Lighthouse score.

Avoid word-count padding, mass query-variant pages, purchased/invented mentions and speculative llms.txt work for Google. The [current AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) explicitly rejects a required special file, chunking format or ideal page length. Original user-useful evidence and ordinary crawling remain the priority.

## 9. Verification, rollout and next builder handoff

Research verification completed: the live 35-URL crawl; independent non-sitemap route checks; official/competitor evidence review; **6/6 existing SEO audit tests** and **6/6 existing analytics privacy-contract tests**. These passing baseline tests do not cover the newly found gaps and do not verify a future implementation. No product build or UI-change completion is claimed.

For implementation, use reviewed isolated packages based on the current accepted source/handoff; do not deploy or broadly commit the shared dirty tree. Preserve other agents' modifications and inventory dashboard ownership before editing shared layouts/analytics/components.

First builder package: **S0 route-policy fixtures and audit enforcement**, followed by S1 metadata corrections and S2 truthful-copy corrections. Start with these named cases: /privacy, /terms, /suite, /suite/resume, /suite/admin, /settings, reset-password, unknown 404, HTTP/www, sitemap redirects/noindex and off-origin canonicals. The exact safe-shell crawl exceptions are a reviewed output of classification, not guessed here.

For a later code release, run the actual repository commands appropriate to changed behavior: npm run seo:audit:test, npm run seo:audit:ci, npm run type-check and npm run build; run analytics privacy/funnel and release-safety tests for the affected slices. Preserve truth/export/auth/entitlement tests when shared product boundaries change. Every UI change requires a real browser at 320/390/430/768/1024/1440 with core states, clean console and no horizontal overflow. Test the promised guest/free/paid path with permitted test data; no real payment, message or application submission.

Before publication, confirm a clean reviewed release artifact, current security/readiness gates and canonical serving path. The last verified path is npm run deploy / deploy-fix.js to Firebase Hosting SSR, per the October 8 receipt; reconfirm at deployment rather than using the older architecture's alternate Cloud Run assumption. The bounded development-only Braces exception in that receipt expires October 15; it is not a standing bypass for a later release.

Publish small batches, record the exact build/Hosting version and prior rollback point, then verify live robots/sitemap/metadata/header bytes plus representative public and excluded routes. For misplaced public noindex, private index controls, misleading schema/copy, or consent failure, revert the reviewed package/release using the established runner rollback procedure. Do not roll back other agents' source work wholesale. Check GSC after recrawl; HTTP success is not an indexing outcome.

Any later implementation result must update this checkpoint and map with actual evidence. Research/plan completion is separate from build completion. PC shutdown remains cancelled.
