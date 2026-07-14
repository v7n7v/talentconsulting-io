# TalentConsulting.io revenue generation strategy

Prepared July 2026.

The company-wide category benchmark and measurable parity goal live in [`docs/company-parity-goal.md`](./company-parity-goal.md). This strategy remains the revenue execution plan for that goal.

## Decision

TalentConsulting.io should not compete as another resume builder, ATS checker or job board.

The sharper position is:

Upload your resume. Tell Sona the job you want. Get verified job picks, truthful resume changes and review-ready application packets.

This is the clearest route to revenue because it turns the product into a job-search agent with user control. It avoids the crowded "AI resume tool" category and the trust risk of blind auto-apply.

## Market readout

The US job market is slow enough for job seekers to feel stuck, but not broken enough for them to stop searching. BLS reported 57,000 jobs added in June 2026 and a 4.2% unemployment rate. BLS JOLTS reported 7.6 million job openings in May 2026.

AI job-search behaviour is now normal. Competitors already cover resume tailoring, cover letters, autofill, job tracking and recommendations. Simplify says its Copilot has been used by more than 1 million job seekers and over 200 million applications. Teal, Huntr, Jobscan, Sonara and Rezi all compete around parts of this workflow.

Open source also lowers the moat. GitHub projects such as Ever Jobs, AIHawk, career-ops, JobSpy and ApplyPilot show that job supply, scraping, scoring and application automation are increasingly available to builders.

The opportunity is trust. Job seekers are tired of ghost jobs, generic AI writing, repetitive applications and tools that chase volume. Recruiters are tired of spam and AI-generated applications. TalentConsulting.io can win by helping users apply better, not more.

## Mission

Help job seekers find better-fit roles with less wasted effort, while keeping their facts, choices and final applications under their control.

## Vision

Become the trusted career operating system for serious job seekers: resume, job matching, application packets, interview prep and follow-up in one Sona-led workspace.

## 90-day objective

Turn resume upload into the main activation event and convert 8% to 12% of activated users into Pro or Max.

An activated user has:

- uploaded or built a resume
- set a target role, salary, location and work mode
- received at least 3 ranked job matches
- opened one Sona-prepared application packet

## Revenue model

Use 4 revenue paths:

- Free: prove value with one resume-led job match
- Pro: serious job seeker toolkit at about $19 per month or $149 per year
- Max: Sona agent scouting and prepared packets at about $49 per month or $399 per year
- 7-day sprint pass: $7 to $12 for urgent job seekers who do not want a full subscription yet

Max should not mean "more scans". Max should mean Sona does work for the user:

- daily job scouting
- ranked job queue
- prepared application packets
- resume morphs with truth locks
- cover letters and recruiter replies
- voice resume coaching
- email or text alerts with explicit consent
- follow-up drafts

## Product wedge

The first paid workflow should be:

1. User uploads a resume.
2. Sona asks for target role, salary, location and work mode.
3. Sona finds jobs from safer sources.
4. Sona ranks jobs by fit, risk and effort.
5. Sona prepares a review packet for each strong match.
6. User approves, saves, dismisses or edits.
7. TalentConsulting.io learns from the outcome.

Do not lead with a grid of tools. Lead with the outcome.

## Source strategy

Use Ever Jobs as the supply layer, not the visible product.

Prioritise safer sources:

- company career pages
- Greenhouse
- Lever
- Ashby
- Workday where reliable
- USAJobs
- RemoteOK
- Remotive
- Jobicy
- We Work Remotely
- Adzuna and Remotive as fallback

Do not make LinkedIn or Indeed scraping a core dependency. LinkedIn and Indeed both restrict bots, scraping or automated access in their terms. Treat those sources as user-directed, browser-assisted or partner-gated only.

## Differentiation

The product should be known for:

- fewer, better job picks
- direct source confidence
- ghost-job and scam-risk notes
- truth-locked resume changes
- review before any external action
- mobile-first workflow
- Sona as the user-facing career agent
- outcome learning from saved, dismissed, applied and interviewed jobs

## Threats

The main threats are:

- incumbents own search habits and distribution
- open-source tools make job automation easy to copy
- job seekers may not pay monthly after they get a job
- weak job data will make Sona feel generic
- privacy risk is high because resumes contain sensitive personal data
- auto-apply positioning can damage trust with users and recruiters
- compliance risk rises if the product relies on restricted scraping
- claims about ATS scores, salary and outcomes can become misleading if not qualified

## Opportunities

The strongest opportunities are:

- become the trusted alternative to spam auto-apply
- help users avoid fake or stale jobs
- use resume evidence to explain every recommendation
- make mobile job search feel calm and controlled
- use a recommendation ledger as the retention and learning layer
- create shareable fit reports as an acquisition loop
- sell Max around agent work, not higher limits
- publish weekly job market briefs to build authority and SEO

## Build priorities

Priority 1: activation

- make resume upload the main landing page and Sona entry point
- add target role, salary, location and work mode capture
- show 3 ranked jobs before signup where possible
- require signup to save the workspace
- instrument upload, match, packet open and upgrade clicks

Priority 2: recommendation quality

- add an Ever Jobs adapter
- normalise jobs into one internal contract
- dedupe aggregator and direct-source duplicates
- add source confidence, first seen, last checked and risk notes
- return fit reasons, missing skills and next action

Priority 3: Sona packets

- create one packet per recommended job
- include resume morph, cover letter, risk notes and interview prep
- require user approval before any external action
- store packet status in the recommendation ledger

Priority 4: monetisation

- gate recurring scouting and prepared packets to Max
- keep Pro as the active job seeker toolkit
- add a 7-day sprint pass
- put upgrade prompts after useful output, not before value

Priority 5: retention

- add daily job digest with explicit email consent
- add weekly job search scorecard
- add follow-up reminders
- ask why a user dismissed a job
- use feedback to improve the next recommendations

## 90-day roadmap

Days 1 to 15: first-run activation

- make resume upload the default Sona flow
- capture target role, salary, location and work mode
- polish mobile at 320px, 390px and 430px
- instrument activation events

Days 16 to 30: job supply and ranking

- add the Ever Jobs adapter
- add dedupe and source confidence
- keep Adzuna and Remotive as fallback
- add job risk notes

Days 31 to 45: application packets

- generate review packets for strong matches
- store packet status in the recommendation ledger
- add "why this job" and "why not" explanations

Days 46 to 60: paid packaging

- refine Pro and Max gates
- add the 7-day sprint pass
- add Max daily scouting
- connect paid value to Stripe upgrade moments

Days 61 to 75: retention loops

- add daily digest
- add weekly scorecard
- add follow-up reminders
- add user feedback tags

Days 76 to 90: growth and authority

- publish comparison pages for Sonara, Teal, Jobscan and Huntr alternatives
- publish "review-first AI job search" pages
- publish weekly labour market notes
- add shareable fit reports

## Tracker

| Track | Owner | Status | Target | Acceptance check |
| --- | --- | --- | --- | --- |
| positioning | product | in progress | Sona-led job search | landing page has one main action: upload resume |
| activation | product and engineering | in progress | 3 ranked jobs from a resume | Sona now captures target brief and resume upload; next checkpoint is ranked matches |
| job supply | engineering | planned | safe-source adapter | direct source, confidence and risk shown |
| recommendation ledger | engineering | planned | per-user learning layer | duplicate suppression and feedback work |
| Sona packets | product and engineering | planned | review-ready packet | resume, cover letter, risks and next action shown |
| trust and safety | product and engineering | in progress | no invented facts | 100 resume morph tests pass |
| mobile quality | design and engineering | in progress | native-feeling flow | passes 320px, 390px, 430px, 768px checks |
| monetisation | product | planned | Pro and Max clarity | upgrade follows visible value |
| retention | product | planned | daily and weekly loops | digest, scorecard and follow-up reminders work |
| analytics | engineering | in progress | activation and revenue events | Sona resume upload, parse, save, target brief and packet-start events tracked |

## Iteration 1

Initial plan: sell TalentConsulting.io as a broad AI career platform with resume, ATS, writing, job search, applications and interview prep.

Audit result: too broad. The product risked looking like a collection of tools. It also competed directly with established resume and tracker products.

Change made to strategy: make Sona-led resume-to-job matching the core promise. All other tools support that workflow.

## Iteration 2

Refined plan: sell Sona as a trusted job-search agent that finds ranked roles and prepares materials for review.

Skeptic result: still risky unless the product proves trust, data quality, and retention. Job seekers may not pay if the first result is generic or if they do not return.

Change made to strategy: add measurable activation, recommendation ledger, job source confidence, outcome learning, trust locks and kill criteria.

## Iteration 3

Build checkpoint: Sona now has a first-run target brief for role, salary, location and work mode. Resume upload prompts carry that target into the agent request, and activation analytics now track upload, parse, saved resume, target brief and packet-start events.

Audit result: this improves intent capture, but the revenue loop is not complete until Sona returns ranked jobs and a review-ready packet from the same flow.

## Iteration 4

Build checkpoint: target brief and resume-upload prompts now send a structured harness request through the Sona chat API. This removes reliance on the model deciding to call the job-scouting tool and makes Pro/Max scouting deterministic.

Audit result: the core revenue loop is closer, but the next checkpoint is showing a clear in-product Agent Queue result state after a harness run.

## Iteration 5

Build checkpoint: Sona chat messages can now render a harness result card with target summary, queued roles, fit scores, and an Agent Queue CTA.

Audit result: the flow now has a visible review destination after a scout run. The next product gap is improving the Agent Queue empty/loading/result states so queued packets feel like a premium workflow, not a raw list.

## Iteration 6

Build checkpoint: Agent Queue now has a proper signed-out conversion state with Create Account and Sign In actions, clear packet value, and compact workflow proof cards.

Audit result: mobile and desktop no longer show a passive sign-in notice or dead stretched space. The next gap is authenticated packet-list polish with real queued data.

## Iteration 7

Build checkpoint: Authenticated Agent Queue now uses a compact status rail instead of a duplicate full metric-card row. This gets mobile users to packet decisions faster while preserving total, pending, approved, tracked, and skipped counts.

Audit result: demo queue screenshots at 390px and 1440px show no horizontal overflow or console errors. The next gap is reducing duplicate packet rendering between "Needs attention" and "Application packets" without hiding priority decisions.

## Iteration 8

Build checkpoint: Command view now separates priority packets from the remaining packet list. Packets shown under "Needs attention" are not repeated again below; if all visible packets are already prioritized, the page shows a compact Queue-view handoff instead.

Audit result: demo queue screenshots at 390px and 1440px show each priority packet once, no horizontal overflow, and no console errors. The next gap is the underlying recommendation quality layer: direct-source confidence, first-seen/last-seen metadata, and stronger "why this job" explanations.

## Iteration 9

Build checkpoint: the recommendation layer now returns fit reasons, risk notes, source notes and a specific next action for each ranked job. Sona carries those signals into queued packets, and Job Search shows the same evidence in role cards and the detail panel.

Audit result: this makes the job product easier to trust because users can see why a role ranked, what source it came from and what to check before applying. The next gap is validating the full harness run with live or mocked job data and checking the Agent Queue drawer after a packet is selected.

## Iteration 10

Build checkpoint: Sona harness results now include the same fit, risk and source evidence used by Job Search and Agent Queue. The chat result card can show the first fit reason and risk count for each queued role. Sona's message renderer also handles numbered and bullet lists without duplicating list items.

Audit result: the Sona-to-queue handoff is clearer and more consistent. The next gap is a full end-to-end harness run with mocked job supply so the chat card, queue write and packet drawer can be verified in one deterministic test.

## Iteration 11

Build checkpoint: the mobile quick-tools rail now reserves a right-side lane for the swipe hint. The hint no longer covers the next tool label while still showing users that more tools are available offscreen.

Audit result: the Sona mobile screenshot at 390px shows Ask Sona, Job Match and the Swipe hint without text overlap or horizontal overflow. The next gap remains deterministic harness testing.

## Iteration 12

Build checkpoint: the Sona harness evidence path now has a pure helper and a deterministic Node test. The test proves that queued roles keep fit signals, risk signals, source notes, next actions, review-first chat copy and the Agent Queue record payload without using live job supply or Firebase.

Audit result: `npm run test:sona-harness` passes 5 tests. The next gap is a full mocked harness run that proves search, scoring, queue write and chat summary work together from one request.

## Iteration 13

Build checkpoint: the Sona harness now has a mocked end-to-end Node test. The test starts with a user request, injects a saved resume, mocks job supply and AI outputs, then proves Sona writes a prepared Agent Queue packet with fit evidence, risk evidence, source metadata, a morphed resume, a cover letter and a review-first next action.

Audit result: `npm run test:sona-harness` passes 6 tests. The next gap is product QA on the authenticated Agent Queue drawer and Sona chat card using the same prepared packet shape.

## Iteration 14

Build checkpoint: Agent Queue cards now show the first fit reason and source confidence before the user opens a packet. The packet drawer also shows source confidence and source notes, while keeping the approval gate and proof checks visible.

Audit result: mobile and desktop browser checks passed in demo mode. The mobile packet drawer no longer repeats "Source" as both label and value, and the drawer has enough bottom padding for fixed actions. The next gap is a live Sona chat harness QA pass that checks the card, upload prompt and voice controls together.

## Iteration 15

Build checkpoint: the Sona Agent mobile surface passed a focused QA pass. The header keeps the title, mode badge, voice action and resume action readable. Voice settings open as a named mobile sheet with clear voice choices. The target-brief example fills role, salary, location and work mode, then enables the Scout jobs action.

Audit result: browser checks at 390px showed no console errors. The upload buttons are visible in both the Sona context panel and the composer. The next gap is a controlled harness run from the chat UI that verifies the displayed result card after the Scout action completes.

## Iteration 16

Build checkpoint: the Sona chat result path now handles partial action-plan metadata without crashing. A mocked browser run returned a prepared harness result from `/api/agent/chat`, rendered the chat response, showed the target summary, displayed the queued role, fit score, risk count and Agent Queue call to action.

Audit result: the 390px browser run passed with no console errors after the fix. The next gap is a real authenticated harness run against safe job supply and a production-like account.

## Iteration 17

Build checkpoint: the Sona chat action-plan formatter now lives in a small tested helper. It handles missing `plannedSteps`, keeps known capability labels, and falls back to safe text when the API returns partial metadata.

Audit result: `npm run test:sona-harness` now passes 9 tests. The new tests cover the exact crash class found in the mocked browser run. The next gap remains a real authenticated harness run against safe job supply and a production-like account.

## Iteration 18

Build checkpoint: Sona's resume-upload entry points are now consistent. The composer plus button, Active Context upload button and "Upload and scout" workflow all use the same guarded upload picker. Upload-in-progress state disables duplicate starts, signed-out users go to auth, and invalid-file selections clear the input so users can retry the same file.

Audit result: `npm run type-check`, `npm run test:sona-harness`, scoped `git diff --check`, and `npm run build` pass. The remaining gap is an authenticated browser run with a real account and safe job supply to verify resume upload, parsing, harness queue write, chat result and Agent Queue drawer in one production-like flow.

## Iteration 19

Build checkpoint: Sona upload now has a parser fallback for real-world resume files. If structured parsing returns sparse data but text extraction worked, Sona saves the extracted resume text as context instead of blocking the user. The fallback keeps user-provided text only and does not invent education, employers or credentials.

Audit result: a mocked 390px browser run verified the "Upload and scout" workflow from file chooser through active resume context, Sona chat result, review-first harness card, fit score and Agent Queue CTA. Screenshot evidence: `output/playwright/sona-upload-harness-success.png`. `npm run test:sona-harness` now passes 11 tests, `npm run type-check`, scoped `git diff --check`, and `npm run build` pass. The remaining gap is the same flow with a real authenticated account and safe job supply.

## Iteration 20

Build checkpoint: the public landing hero now gives mobile users less dead space between the quick-tools rail and the Sona-led resume promise. The hero keeps the selling point focused: upload a resume, set the target, and let Sona prepare fit-ranked job picks for review.

Audit result: browser checks passed at 390px and 1440px with no console warnings. Screenshot evidence: `output/playwright/landing-sona-mobile-tightened.png` and `output/playwright/landing-sona-desktop-tightened.png`. `npm run test:sona-harness`, `npm run type-check`, scoped `git diff --check`, and `npm run build` pass.

## Iteration 21

Audit checkpoint: the public "Upload resume to Sona" CTA opens the signup flow cleanly on mobile. The modal renders as a centered sheet with Google and email signup options, visible cancel/close controls, and no clipping at 390px.

Audit result: browser check passed with no console warnings. Screenshot evidence: `output/playwright/landing-upload-signup-mobile.png`. No code change was needed for this checkpoint.

## Iteration 22

Build checkpoint: the "Upload resume to Sona" CTA now preserves intent through authentication. Email signup, email login and MFA honor `postAuthRedirect`, matching the existing Google redirect support. The landing upload CTA passes `/suite/agent`, while generic signup buttons keep their neutral behavior.

Audit result: `npm run type-check`, scoped `git diff --check`, and `npm run build` pass. A real account smoke test is still required before production to confirm Firebase auth redirects into Sona as expected.

## Iteration 23

Build checkpoint: the auth modal now reflects the Sona upload intent. When users click "Upload resume to Sona," the signup sheet says "Create account to upload your resume" and explains that Sona saves resume context before scouting review-ready job picks. Generic signup entry points keep generic copy.

Audit result: mobile browser check at 390px passed with no console warnings. Screenshot evidence: `output/playwright/landing-upload-signup-contextual-mobile.png`. `npm run test:sona-harness`, `npm run type-check`, scoped `git diff --check`, and `npm run build` pass.

## Iteration 24

Audit checkpoint: switching from the contextual Sona signup sheet to login preserves the same intent. The login sheet says "Sign in to upload your resume" and explains that Sona will use saved resume context to scout job picks.

Audit result: mobile browser check at 390px passed with no console warnings. Screenshot evidence: `output/playwright/landing-upload-login-contextual-mobile.png`. No code change was needed after Iteration 23.

## Iteration 25

Audit checkpoint: the public Sona-led landing hero holds at 320px. The headline wraps cleanly, primary and secondary CTAs fit, trust points remain readable, and the quick-tools rail does not cover the hero.

Audit result: browser check passed at 320px with no console warnings. Screenshot evidence: `output/playwright/landing-sona-320-mobile.png`. No code change was needed for this checkpoint.

## Iteration 26

Build checkpoint: the Sona upload intent now survives the landing signup path. The landing CTA points users to `/suite/agent?intent=resume-upload`, and the Sona route shows a focused resume upload callout when that intent is present.

Audit result: browser checks passed at 390px and 320px. Screenshot evidence: `output/playwright/sona-upload-intent-callout-mobile.png` and `output/playwright/sona-upload-intent-callout-320.png`.

## Iteration 27

Build checkpoint: the Sona upload flow no longer crashes when an agent response includes a partial harness result. The harness result card now handles missing goal, queue and counter fields, then renders a safe fallback card.

Build checkpoint: compact resume selection on Sona now stacks cleanly on mobile. The selected resume and change action no longer fight for the same narrow row after upload.

Audit result: the signed-in demo upload path was tested with mocked resume parsing and mocked Sona chat. The uploaded resume became active Sona context, the agent response rendered, the harness card rendered, and the console had no errors. Screenshot evidence: `output/playwright/sona-upload-intent-post-upload-mobile.png` and `output/playwright/sona-selected-resume-after-upload-mobile.png`.

## Iteration 28

Build checkpoint: the mobile quick-tools swipe hint is now quieter and better aligned with the rail. It keeps the user nudge without reading like another navigation chip.

Audit result: browser check passed at 320px with no console warnings. Screenshot evidence: `output/playwright/mobile-quick-tools-320-polished.png`.

## Iteration 29

Build checkpoint: partial Sona harness results now show the available score and next action instead of implying that no strong match exists. The fallback action now says `Continue search` when the agent has a score or recommendation but no queued-role payload.

Audit result: browser check passed at 390px with a partial mocked harness payload and no console errors. Screenshot evidence: `output/playwright/sona-partial-harness-card-mobile.png`.

## Iteration 30

Audit checkpoint: Job Search mobile holds at 390px and 320px. The header, resume source selector, target role, location input and search action fit without horizontal overflow.

Audit result: browser checks passed at 390px and 320px with no console warnings. A document width check at 320px returned `scrollWidth: 320`. Screenshot evidence: `output/playwright/job-search-mobile-390-audit.png` and `output/playwright/job-search-mobile-320-audit.png`.

## Iteration 31

Build checkpoint: Applications mobile now uses a compact 2-column workspace metric grid. The sticky action bar no longer covers the primary tracker, dossier, follow-up and outcome cards at 320px.

Audit result: browser checks passed at 320px and 390px with no console warnings and no horizontal overflow. Screenshot evidence: `output/playwright/applications-mobile-320-compact-fixed.png` and `output/playwright/applications-mobile-390-compact-fixed.png`.

## Iteration 32

Build checkpoint: Agent Queue header actions now keep Help in a stable top-right position. Ask Sona and Preferences remain visible named actions on mobile and sit on one row on desktop.

Audit result: browser checks passed at 320px and 1440px with no console warnings. A document width check at 320px returned `scrollWidth: 320`. Screenshot evidence: `output/playwright/agent-queue-mobile-320-header-fixed.png` and `output/playwright/agent-queue-desktop-1440-actions-fixed.png`.

## Iteration 33

Build checkpoint: Agent Queue packet review drawer now uses a mobile-first action tray. The primary packet action and Dismiss no longer compete in a cramped half-width footer on 320px screens, and the tray includes safe-area bottom padding.

Audit result: browser checks passed at 320px with the packet drawer open. The page width remained `scrollWidth: 320`, the drawer content scrolled to the true end without hiding the final posting details behind the action tray, and the browser console reported no warnings or errors. Screenshot evidence: `output/playwright/agent-queue-drawer-mobile-320-footer-fixed.png` and `output/playwright/agent-queue-drawer-mobile-320-scroll-end.png`.

## Iteration 34

Build checkpoint: Sona Agent mobile header and empty state are tighter. The resume picker uses a shorter contextual label in the Sona header, the duplicate Sona mark is hidden on mobile, the first-run strategy room uses reduced mobile padding, and static prompt/context icons now follow the neutral icon system.

Audit result: browser checks passed for `/suite/agent` at 320px, 390px, and 1440px with no horizontal overflow and no console warnings or errors. Screenshot evidence: `output/playwright/sona-agent-mobile-320-header-compact.png`, `output/playwright/sona-agent-mobile-390-header-compact.png`, and `output/playwright/sona-agent-desktop-1440-neutral-icons.png`. `npm run type-check`, `git diff --check`, and `npm run build` passed. Build warnings remain limited to the existing Google Sans Flex fallback warning and the Node legacy-build warning.

## Iteration 35

Build checkpoint: Job Search Workbench mobile header stats now render as one balanced row instead of one metric floating above two metrics. Labels were shortened and mobile stat typography was tightened so the chips read cleanly at 320px.

Audit result: browser checks passed for `/suite/job-search` at 320px and 1440px with no horizontal overflow and no console warnings or errors. Screenshot evidence: `output/playwright/job-search-mobile-320-header-stats-polished.png` and `output/playwright/job-search-desktop-1440-header-stats-polished.png`. `npm run type-check`, `git diff --check`, and `npm run build` passed. Build warnings remain limited to the existing Google Sans Flex fallback warning and the Node legacy-build warning.

## Iteration 36

Build checkpoint: Applications mobile now has a cleaner handoff from application tracking to Sona review. The application drawer keeps the Ask action compact on phones, allows the role title to wrap to 2 controlled lines, and uses neutral company and dossier icons. The main Applications workspace also uses neutral summary icons so the action hierarchy is easier to scan.

Audit result: browser checks passed for `/suite/applications` at 320px and 1440px with no horizontal overflow and no console warnings or errors. Drawer checks passed at 320px with one dialog open. Screenshot evidence: `output/playwright/applications-mobile-320-polished.png`, `output/playwright/applications-drawer-mobile-320-polished.png`, and `output/playwright/applications-desktop-1440-polished.png`. `npm run type-check`, `npm run test:sona-harness`, `git diff --check`, and `npm run build` passed. Build warnings remain limited to the existing Google Sans Flex fallback warning and the Node legacy-build warning.

## Iteration 37

Build checkpoint: The root dashboard hero now gives signed-in users a tighter first fold. The authenticated headline uses the user's first name instead of the full display name, and the title scale is smaller than the guest acquisition headline. This keeps the Sona-led workspace preview visible sooner while leaving the guest “drop your resume” acquisition message intact.

Audit result: browser checks passed for `/` at 320px and 1440px with no horizontal overflow and no console warnings or errors. Screenshot evidence: `output/playwright/landing-mobile-320-hero-compact.png` and `output/playwright/landing-desktop-1440-hero-compact.png`. `npm run type-check`, `npm run test:sona-harness`, `git diff --check`, and `npm run build` passed. Build warnings remain limited to the existing Google Sans Flex fallback warning and the Node legacy-build warning.

## Iteration 38

Build checkpoint: The Sona resume-upload intent now starts as one clear workflow. The opening state leads with resume upload, explains that the resume is the source context, keeps target brief entry directly below it, and removes the duplicate "Upload and scout" prompt from that intent state.

Audit result: browser checks passed for `/suite/agent?intent=resume-upload` at 320px, 390px and 1440px. The 320px width check returned `scrollWidth: 320`, and the 390px view shows upload, proof points and target inputs in the first viewport. Screenshot evidence: `output/playwright/sona-upload-mobile-320-intent-proof-strip.png`, `output/playwright/sona-upload-mobile-390-intent-proof-strip.png`, and `output/playwright/sona-upload-desktop-1440-intent-proof-strip.png`. `npm run type-check`, `npm run test:sona-harness`, scoped `git diff --check`, and `npm run build` passed. Build warnings remain limited to the existing Google Sans Flex fallback warning and the Node legacy-build warning.

## Iteration 39

Build checkpoint: The signed-in dashboard now sends zero-assets users straight into the Sona resume-upload path. When saved assets are 0, the primary hero action becomes "Upload resume to Sona" and routes to `/suite/agent?intent=resume-upload`. Users with saved assets still see "Continue workspace".

Audit result: browser checks passed for `/` at 390px and 1440px in the zero-assets authenticated state. The 390px width check returned `scrollWidth: 390`, and the primary CTA rendered as "Upload resume to Sona". Screenshot evidence: `output/playwright/landing-mobile-390-upload-primary-zero-assets.png` and `output/playwright/landing-desktop-1440-upload-primary-zero-assets.png`. `npm run type-check`, `npm run test:sona-harness`, scoped `git diff --check`, and `npm run build` passed. The local guest acquisition state could not be browser-audited in this server mode because the dev auth state renders an authenticated demo user; code inspection confirmed the guest CTA already routes to `/suite/agent?intent=resume-upload`.

## Iteration 40

Audit checkpoint: the zero-assets dashboard CTA now has an end-to-end mobile handoff into the focused Sona resume-upload intent. The route lands at `/suite/agent?intent=resume-upload`, keeps the resume-source panel visible, and exposes the upload control without horizontal overflow at 390px.

Build checkpoint: the root layout now declares its smooth-scroll behaviour for Next.js route transitions. This removes the development warning while preserving the intended scrolling behaviour.

Audit result: screenshot evidence is stored at `output/playwright/landing-to-sona-upload-handoff-390-clean.png`. The browser check returned `scrollWidth: 390`, one resume-source panel, and 2 visible upload entry points. `npm run type-check` and scoped `git diff --check` passed.

## Iteration 41

Research checkpoint: the company mission, vision and measurable 12-month objective now align to one Sona-led outcome. A new category parity goal benchmarks 10 products in each of 6 lanes: AI job agents, resume and ATS, interview preparation, application tracking, career writing, and career intelligence.

Audit result: the benchmark confirms that feature breadth is easy to copy and increasingly available in open source. The company should reach expected tool parity, then lead on explainable top-3 job recommendations, truth-locked application packets, trusted sources, mobile completion and review-first control. The next build checkpoint is to make paid packaging sell those outcomes and to prove the authenticated resume-to-picks-to-packet flow with safe job supply.

## Iteration 42

Build checkpoint: the upgrade page now sells active job-search outcomes instead of writing quotas. Pro is positioned for user-run career tools and manual scouts. Max is positioned for proactive Sona scouting, ranked picks, truth-locked tailoring, review-ready packets and user-controlled alerts. The comparison now states the actual Free, Pro and Max entitlements.

Audit result: three responsive passes covered 320px, 390px, 1024px, 1280px and 1440px. Mobile uses a stacked comparison with all plan values visible. The split checkout now starts only at 1360px, which prevents compressed cards and broken words on tablets and small laptops. Screenshot evidence: `output/playwright/parity-upgrade-max-390-final.png`, `output/playwright/parity-upgrade-max-1024-pass3.png`, `output/playwright/parity-upgrade-max-1280-pass3.png` and `output/playwright/parity-upgrade-max-1440-pass2.png`.

## Iteration 43

Build checkpoint: resume truth locks now protect the original skills array and reject unsupported numeric claims in summaries and experience prose. All reviewed morph and auto-fix prompts now prohibit invented skills, metrics, achievements, credentials, education and employment facts. Resume Studio achievement assistance now rewrites user-supplied evidence instead of generating accomplishments from a role title alone.

Audit result: the dedicated guardrail suite passes three cases covering exact education and skills preservation, unsupported metric restoration and legitimate existing metrics. Structured auto-fix output is also passed through the shared server guardrail before it returns to the user.

## Iteration 44

Build checkpoint: Sona now offers one real three-role scout to a Free user, repeatable manual scouting to Pro and proactive packet preparation to Max. A scout requires a saved resume, target role and location. Resume upload saves first and waits for missing target details instead of silently searching for a software engineer role in the United States. Email digests require explicit notification consent.

Audit result: the Sona harness suite passes 13 cases, including a one-time Free scout that creates three review-only queue items without resume or cover-letter assets, repeat-run blocking and incomplete-target handling without model inference. Unknown salary and work mode no longer pass a specific user constraint. Mobile Sona upload screenshots at 320px and 390px keep upload and target capture inside one focused workflow: `output/playwright/parity-sona-free-scout-320-pass2.png` and `output/playwright/parity-sona-free-scout-390-final.png`.

## Kill criteria

Narrow or stop the strategy if:

- fewer than 25% of resume uploaders create a first application packet within 15 minutes
- fewer than 20% of activated users return in week 2
- free-to-paid conversion stays below 3% after users hit a real limit
- more than 5% of audited packets contain unsupported claims
- fewer than 70% of users say a packet is usable after light edits
- paid acquisition costs more than 3 months of gross profit per subscriber

## Experiments

Run these before scaling paid acquisition:

- concierge test with 20 job seekers and 10 reviewed packets each
- pricing test at $4.99, $9.99, $19 and sprint-pass pricing
- proof test with and without evidence panels
- hallucination audit across 200 generated materials
- outcome logging test at 7, 14 and 30 days
- browser extension fake-door test
- B2B pilot discovery with career centres and workforce programmes
- claims audit for ATS, salary, AI detection and job outcome language

## Sources

- BLS Employment Situation, June 2026: https://www.bls.gov/news.release/empsit.nr0.htm
- BLS JOLTS, May 2026: https://www.bls.gov/news.release/jolts.nr0.htm
- Simplify Copilot: https://simplify.jobs/copilot
- Teal: https://www.tealhq.com/
- Jobscan: https://www.jobscan.co/
- Huntr: https://huntr.co/
- Sonara: https://www.sonara.ai/
- Ever Jobs: https://github.com/ever-jobs/ever-jobs
- AIHawk: https://github.com/feder-cr/jobs_applier_ai_agent_aihawk
- career-ops: https://github.com/santifer/career-ops
- JobSpy: https://github.com/speedyapply/JobSpy
- Google JobPosting structured data: https://developers.google.com/search/docs/appearance/structured-data/job-posting
- Indeed legal terms: https://www.indeed.com/legal
- FTC job scams: https://consumer.ftc.gov/all-scams/job-scams
- World Economic Forum Future of Jobs 2025: https://www.weforum.org/publications/the-future-of-jobs-report-2025/
