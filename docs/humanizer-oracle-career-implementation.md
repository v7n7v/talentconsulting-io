# Humanizer, Oracle and Career Intelligence implementation

Implemented locally on September 28, 2026 in `/home/xwingace/Documents/Projects/Taco-upgrade`, branch `codex/taco-upgrade`. This continues the earlier workspace upgrade and addresses the subsequent Humanizer and Oracle/Career Intelligence reviews. Existing branding, prices and allowance amounts remain intact. Nothing has been committed or deployed.

## Humanize writing

The normal path is now paste/import → choose tone or optional voice sample → Humanize → compare and review → export. Scan is optional. Diagnose and Verify remain accessible on mobile as well as desktop. The title, public page and Help now describe the actual editing and diagnostic scope.

- Selected-paragraph output must contain exactly the requested, unique paragraph indices. Invalid targets fail before reservation. Unselected source bytes, paragraph separators, quotes and line endings remain unchanged; no global punctuation substitution alters the source.
- Model output is validated, failed quality checks cannot become successful rewrites, and failed requests release reservations. Every changed rewrite requires meaning review. Numeric boundaries, percentages and quotations have additional checks, but token checks do not certify semantics.
- Before/after comparisons expose additions and removals, model explanations, keep/reject decisions, undo and up to five prior revisions. Selections expand to whole paragraphs; this is not character-level partial-sentence editing.
- Checks bind to both the exact output and its writing settings. Manual changes, rejected edits and old cloud metadata cannot inherit an approval. Intentionally empty output remains empty through recovery and export.
- A personal writing sample can guide the request. Prompts preserve uncertainty, attribution, genre and competent existing prose. Detector scores, punctuation bans and forced vocabulary are no longer rewrite objectives or failure gates.
- Deep Scan reports unavailable/null when the provider supplies no usable analysis, without charging that diagnostic use. Verify reviews phrasing only; it does not search a plagiarism database.
- Authenticated requests use atomic, payload-bound receipts and month-bound metering. Exact successful retries return the saved response even at cap. Leases permit interrupted recovery and reject stale worker settlement. Retry identity persists on the device before dispatch and survives reload; storage failure is labeled.
- Each Humanize request still uses the entire input document's word count, including selected-paragraph edits. This is explicitly disclosed. Allowance amounts and the charge unit did not change. Anonymous public requests retain their IP-based daily limit.
- TXT exports the exact current text. Word retains literal list markers and paragraphs, without silently adding a title or AI footer. Imports remain plain-text extraction, not document-layout preservation.
- Help has dialog labeling, initial focus, keyboard containment, Escape and focus restoration. Selected controls expose their state.

## Oracle / Role analysis

Analysis is grounded in the supplied posting and selected resume. It is a source comparison, not a market salary model or calibrated hiring forecast.

- Both providers receive complete, unchanged source data. Each source is limited to 12,000 characters; longer inputs fail explicitly before a partial analysis is produced. Input hashes and evidence offsets preserve leading whitespace and line endings.
- The requirement ledger carries exact posting and resume spans. Unsupported model claims cannot become covered requirements; matching one keyword cannot establish a complex requirement. Negated experience is not positive skill evidence. The limited skill lexicon and potentially incomplete requirement inventory are disclosed.
- Skill coverage reports literal matched terms, or unknown when no denominator exists. Unsupported readiness, risk and interview-yield scores are null. These are not substituted with invented scores or unconditional Apply/Skip recommendations.
- Salary extraction retains the posting's currency, period and offsets. Missing parsing is displayed as no range parsed; there is no inferred salary gain per skill. Company information uses supplied facts.
- Stable owner/source/context analysis IDs save canonical normalized matching/missing skills and a separate evidence ledger. Repeating the same input updates one analysis. Career Intelligence invalidates after a saved analysis.
- Role, company, location, salary target, posting URL, source binding and report freshness survive reload. Input changes make dependent actions stale. Pasted sources cannot prepare packets until backed by a confirmed library source. Packet metadata carries the analysis ID; Track retains the report identity.
- Primary analysis is displayed and saved before the optional related-role lookup finishes. Related roles use a readable list and safe posting links, with distinct loading, empty and failed states. A failed lookup does not erase the analysis.

## Career Intelligence / Career insights

The primary page now shows a small set of next actions, recorded milestones and update time. Detailed heuristic scores and evidence live in an expandable section. Overview, Weekly review and Application results share one page; old Analytics and Outcomes links open the canonical Results view.

- A versioned snapshot has a 60-second TTL and transactional invalidation revision. A concurrent computation cannot overwrite a newer invalidation. Recommendations derive from the same snapshot rather than an independent cache.
- Refresh invalidates then reloads. Weekly check-in refreshes the overview. Source changes invalidate the snapshot. Owner changes and unmounts suppress stale responses and follow-on requests.
- Failed source reads propagate as failures; they do not persist empty conclusions. Paginated reads expose counts and completeness, with an explicit error above 5,000 records per source collection.
- Overview and Results use the same submitted cohort and historical interview/offer milestones. First response timing includes same-day responses. Sparse trends and denominators remain unknown.
- Resume-listed skills, terms in the user's analyzed roles, practice assessments and learning progress retain distinct provenance. They do not imply market-wide demand or verified employment competence. Incomplete STAR placeholders do not count as prepared stories.
- Derived Twin and fit-analysis records, including nested writing receipts, reject client writes. Legitimately editable profile records remain editable. Real local Firestore transactions and rules were exercised.

## Verification

These suites overlap; the counts should not be summed as unique tests.

| Check | Result |
|---|---|
| `npm run test:tool-upgrade` | 125 passed |
| `npm run test:tool-hardening` | 51 passed across seven new focused files |
| `npm run test:workspace` | 249 passed |
| `npm run test:upgrade` | 52 passed |
| `npm run test:workspace:rules` | 18 passed in actual local Auth/Firestore emulators, including concurrent writing reservation/replay and forged derived-record rejection |
| TypeScript | Clean |
| Scoped ESLint | Clean for the changed three-tool UI, helpers, providers and routes |
| Design audit | Passed without changing the baseline; no metric regressed |
| Whitespace | `git diff --check` clean |
| Production build | `npm run build` passed, including TypeScript and all 199 static pages |

Regression tests cover actual route/helper logic with controlled external boundaries, loaded component state, failed/malformed providers, source offsets, immutable paragraph scope, payload-bound replay, month rollover, account-switch races, empty output, clean exported DOCX contents, optional-job lookup failures, blank optional posting URLs and null-ID packet eligibility. The seven harmful synthetic fact mutations never receive unconditional all-clear approval. This establishes those failure protections, not a measured rate of factual accuracy in real generated writing.

Browser checks used the fictional, loopback-only preview: desktop and 390px Humanizer controls; Help focus, Tab and Escape; Career refresh, Overview/Results cohort parity and mobile width; Oracle named inputs, mobile width and exact role/company/location/URL recovery after reload. Test-entered Oracle fields were cleared and the viewport override reset. Provider-backed generation stays blocked in this preview; its success/failure contracts were exercised through the route and component tests.

## Remaining product and release work

Live model output quality, latency and cost have not been benchmarked. Run the proposed blinded writing evaluation and isolated staging journeys before claiming competitive leadership. A reusable learned voice profile, character-level selection/alternative rewrites, round-trip handoff into the originating writing tool and validated multilingual support remain product follow-ups. The current sample is request guidance, not a trained voice model.

Staging must verify deployed rules/indexes, real auth and provider behavior, account quotas and live persisted integration. These local tests do not certify semantic equivalence, authorship detection, plagiarism, employer culture, market demand or hiring outcomes. Full accessibility testing and fresh-user task sessions remain separate checks.

Related records: [Humanizer review](humanizer-review-2026.md), [Oracle/Career review](oracle-career-intelligence-review-2026.md), [backend/emulator verification](audits/oracle-career-2026/career-humanizer-repair-verification.md), [earlier tool upgrade](tool-upgrade-implementation.md).

Local preview restarted after the build: `http://127.0.0.1:3101`. Start with `/suite/writing-tools`, `/suite/job-search?view=analysis`, or `/suite/intelligence`. Logs: `/tmp/taco-three-tools-build.log`, `/tmp/taco-three-tools-preview.log`, `/tmp/taco-final-{tools,hardening,workspace,upgrade,types,lint,design}.log`.
