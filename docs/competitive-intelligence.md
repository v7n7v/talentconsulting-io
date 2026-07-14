# Competitive intelligence for Talent Consulting

Reviewed on 3 July 2026.

This document supports Phase 0 of the active goal: build Talent Consulting into a Silicon Valley-level AI career operator.

The product direction is clear. Talent Consulting should not become a loose set of resume tools. It should become a review-first career command center where Sona prepares work, shows evidence, and asks the user to approve each application packet before anything leaves the product.

## Decision

Build around the workflow competitors only cover in pieces:

- Teal and Huntr prove that job seekers want a tracker, resume versions, and one place to manage applications
- Jobscan, Rezi, Resume Worded, and Enhancv prove that users pay for resume proof, scoring, and ATS guidance
- Simplify, JobCopilot, Oaki, LoopCV, LazyApply, and AIApply prove that speed and browser-assisted applying matter
- Careerflow and WonsultingAI prove that resume, LinkedIn, networking, and job tracking can sit in one toolkit
- Final Round AI, Big Interview, Exponent, and Interviewing.io prove that interview preparation is a paid category

Talent Consulting should combine those jobs into one trusted system:

- Career Twin memory
- Proof Engine
- application workspace
- review queue
- Sona daily brief
- interview system
- browser extension plan

The key difference should be trust. Competitors often push either manual tools or blind automation. Talent Consulting should make review-first automation the default.

## Source limits

Prices change often. This review uses official pricing pages first. When an official page was client-rendered, hard to parse, or missing an exact number, the pricing note says so.

X research uses public web search results. It is not a full X firehose, and it is not a sentiment sample. Treat it as market signal only.

## Top 20 competitor matrix

| # | Company | Main lane | Best at | Pricing snapshot | UX and product patterns to study | What Talent Consulting should add |
|---|---|---|---|---|---|---|
| 1 | [Teal](https://www.tealhq.com/pricing) | resume builder and job tracker | free tracker, resume versions, keyword matching, Chrome job saving | free plan, Teal+ at $13 every 7 days, $29 every 30 days, or $79 every 90 days | tracker-first home, resume versions linked to jobs, job notes, saved opportunities | make the dashboard the daily command center, not a static tool list |
| 2 | [Huntr](https://huntr.co/pricing) | job search CRM and AI application packets | tracker, contact management, autofill, tailored resumes, cover letters | free plan, Pro at $40/month, $90 every 3 months, or $160 every 6 months | strong workflow grouping, contact tracker, map view, application packets | use application packets as the signature review workflow |
| 3 | [Jobscan](https://www.jobscan.co/video-jobscan-premium) | ATS scan and match report | resume and cover letter match reports, keyword gaps, LinkedIn optimization | free scans, Premium commonly shown at $49.95/month or $89.95 quarterly on Jobscan plan and comparison pages | score-first proof, missing keyword guidance, scan history | build a Proof Engine that explains facts preserved, gaps, risks, and match quality |
| 4 | [Simplify](https://simplify.jobs/) | browser autofill and job tracker | free extension, autofill, automatic tracking, one profile | base Simplify and Simplify Copilot are advertised as free forever; paid Simplify+ appears in reviews but was not needed for the base automation claim | extension-first workflow, one profile, fast application flow, job tracking | keep the browser extension as Phase 8, after review and trust are stable |
| 5 | [Careerflow](https://www.careerflow.ai/premium) | broad AI career toolkit | resume, LinkedIn, tracker, JD summary, cover letters, mock interview in higher tier | Basic free, Premium $23.99/month, Premium Plus $44.99/month; weekly, quarterly, and yearly billing also shown | broad tool coverage, LinkedIn optimizer, premium feature ladder | unify tools through Sona and Career Twin so users do not feel they are switching apps |
| 6 | [Rezi](https://www.rezi.ai/pricing) | ATS resume builder | focused resume builder, AI credits, ATS language, lifetime offer | free plan, Pro $29/month, Lifetime $149 one time | clear resume writing funnel, good value message, resume review add-on | add lifetime or campaign pricing only if Stripe and usage costs support it |
| 7 | [Kickresume](https://www.kickresume.com/en/pricing/) | polished resume and cover letter builder | templates, AI writer, ATS checker, career map, student offer | free plan, paid plans shown at $24/month, $54 every 3 months, or $96/year; student/teacher offer available | high-quality templates, sample library, guided writing, mobile apps | improve resume output polish without making the suite feel like a template shop |
| 8 | [Enhancv](https://enhancv.com/pricing/) | visual resume builder and tailoring | visual templates, AI feedback, ATS score, tailoring, tracker | official page shows a 7-day free plan and packages starting from $16.50 in search results | strong visual editing, hundreds of templates, one-click tailoring | add cleaner output controls and proof panels beside visual editing |
| 9 | [Resume.io](https://resume.io/pricing) | resume builder and export | fast builder, templates, cover letters, PDF export | $2.95 7-day trial, then $29.95 every 4 weeks; $49.95 quarterly; limited free plan | fast conversion, template-first UX, export gate | be more transparent than trial-to-renew products; show billing and limits plainly |
| 10 | [Resume Worded](https://resumeworded.com/get-pro) | resume and LinkedIn scoring | score reports, LinkedIn review, rewrite suggestions | $49/month, $99 every 3 months, or $229/year | simple score loop, resume and LinkedIn review, clear progress feedback | make scoring actionable and explain how each edit improves the application |
| 11 | [WonsultingAI](https://www.wonsulting.com/pricing) | AI career toolkit and networking | resume, cover letter, networking messages, cold emails, job tracker | free starter, Premium $19.99/month | networking-first career copy, job tracking, cold email generation | add recruiter message and networking tasks to application packets |
| 12 | [Final Round AI](https://www.finalroundai.com/subscription) | interview copilot and mock interview | interview copilot, mock interview, resume checker, LinkedIn tools | free plan, Monthly $150, Quarterly $83.33/month, Yearly $25/month, Premium Max $41.67/month | interview product depth, AI mock practice, live-session positioning | build interview prep and debriefs, but avoid stealth-interview or cheating positioning |
| 13 | [Big Interview](https://www.biginterview.com/pricing/personal) | structured interview preparation | interview curriculum, practice sets, AI feedback, lifetime plan | $39/month, $99 for 3 months, or $299 lifetime | guided learning, interview simulator, answer builder, institutional trust | add story bank, structured practice, and role-based prep tied to saved applications |
| 14 | [Exponent](https://www.tryexponent.com/upgrade) | tech interview prep community | courses, peer mock interviews, Slack community, AI feedback | free plan, annual plan shown as $12/month after discount with $79/month anchor | premium content, peer practice, private community, job referrals | add role-specific prep tracks for product, engineering, data, and operations roles |
| 15 | [Interviewing.io](https://interviewing.io/faq) | live technical mock interviews | anonymous sessions with senior engineers, detailed feedback | premium interviews start at $179 and vary by subject and company-specific interviewer | high-trust human feedback, recording and playback, elite technical positioning | reserve human expert review as a possible premium service, not core MVP |
| 16 | [JobCopilot](https://jobcopilot.com/pricing/) | AI job application automation | finds jobs, applies or saves for review, tracker, resume and cover letter tools | Premium from $0.93/day, Elite from $1.05/day; weekly, monthly, and quarterly plans available | automation setup, job matches, save-for-review option, application tracker | copy the review option, not the blind auto-apply default |
| 17 | [Oaki](https://www.oaki.io/pricing) | AI job finder and application packages | AI job finder, tailored resumes, cover letters, tracker, extension-assisted applications | one-time plans shown at $50, $120, and $200, with payment plan examples | daily routine, prepared packages, queued applications, extension assistance | make prepared application packets the core Talent Consulting moment |
| 18 | [LoopCV](https://www.loopcv.pro/pricing/) | auto-apply and job loops | loops, job board scanning, email/form submissions, tracker | free plan; paid plans start from €9.99/month | simple automation setup, loop statistics, job board coverage | use automation metrics, but keep user approval and quality controls in front |
| 19 | [LazyApply](https://lazyapply.com/job-application-automation) | high-volume job application bot | one-click applying to LinkedIn and Indeed-style flows | official page promotes automation; 2026 reviews cite annual plans from $99/year to $999/year | high-volume promise, Chrome extension, simple automation copy | avoid volume-first positioning; quality and fit should beat application count |
| 20 | [AIApply](https://aiapply.co/) | end-to-end AI job application toolkit | resume, cover letter, follow-up, auto-apply credits, interview prep | official page says Premium includes core tools and auto-apply uses separate credits; reviews cite paid plans around $23 to $29/month plus credits | broad toolkit, credit-based auto-apply, strong acquisition copy | keep pricing simpler and make application credits visible if introduced |

## Adjacent watchlist

These products are not in the top 20 matrix, but they matter:

- [Sonara](https://www.sonara.ai/) because it promotes continuous AI job search automation and AI auto-apply
- [Jobright](https://jobright.ai/) because it has a large free AI job search copilot position and public claims around 2 million users
- [Scale.jobs](https://scale.jobs/) because it uses human assistants and one-time campaign pricing instead of pure software
- [Massive](https://www.usemassive.com/) because it is often mentioned with auto-apply tools in public discussions
- [ApplyArc](https://applyarc.com/) because it competes on flat pricing and tool breadth

## GitHub and open-source lessons

Open-source projects show what users and builders value when cost is removed.

| Project | What it proves | Lesson for Talent Consulting |
|---|---|---|
| [Reactive Resume](https://github.com/amruthpillai/reactive-resume) | privacy-first, self-hostable resume builders can attract large adoption | use privacy and data ownership as product trust signals |
| [OpenResume](https://github.com/xitanggg/open-resume) | resume parsing and ATS readability checks are valuable even before writing starts | add a parser diagnostic before resume morphing |
| [Resume Matcher](https://github.com/srbhr/resume-matcher) | open AI matching, cover letters, PDFs, and local or remote LLM support are popular | make the Proof Engine inspectable and avoid opaque scoring |
| [ApplyPilot](https://github.com/Pickle-Pixel/ApplyPilot) | autonomous job application pipelines are technically feasible | use the pipeline idea, but stop before external submission until approval |
| [AutoApply AI](https://github.com/Rayyan9477/AutoApply-AI-Agentic-Browser-Automation-for-Job-Search) | full-stack job discovery, tailoring, tracking, and browser automation can live in one app | model the architecture, but add audit logs and user approval |
| [AIHawk](https://github.com/feder-cr/jobs_applier_ai_agent_aihawk) | automated multi-job applying is a common builder target | treat automation as a risk area that needs guardrails |
| [RenderCV](https://rendercv.com/) | resume output can be beautiful and hard to break | build resume output with formatting guardrails and predictable exports |

Open-source takeaway:

Talent Consulting should make the system explainable. A user should understand why a resume changed, which facts were used, which facts were preserved, and what the product refused to invent.

## Public X signals

Public X search shows 4 useful market signals:

- job seekers share tool stacks that combine Teal, LoopCV, Jobscan, Resume Worded, Simplify, and interview tools
- auto-apply products are discussed as a separate category from resume builders
- Final Round AI and similar products market real-time interview support heavily
- users and creators compare application caps, daily volumes, and price in simple numbers

Source examples:

- [X post listing Teal and LoopCV among job search tools](https://x.com/AndrewBolis/status/1927707702622609767)
- [Final Round AI public X profile](https://x.com/FinalRoundAI)
- [Careerflow public X profile](https://x.com/careerflow_ai)
- [X search result discussing LazyApply, Massive, Wobo, and Sorce caps](https://x.com/pulkit_gupta2)

Use these as direction, not proof. The stronger evidence still comes from product pages, pricing pages, GitHub projects, and the app itself.

## UI and UX patterns to copy

Talent Consulting should copy patterns, not brands.

Use these patterns:

- a command center dashboard that starts with the user's next best action
- a compact sidebar grouped by Build, Search and apply, Prepare, and Grow
- a right-side Sona panel with context, evidence, and risks
- application packets with resume, cover letter, recruiter message, screening answers, dossier, and approval checklist
- proof panels beside every AI output
- clear saved state, draft state, approved state, submitted state, and outcome state
- mobile quick review for approving, saving, or snoozing work
- command palette for frequent actions
- transparent usage and billing limits

Avoid these patterns:

- blind auto-apply as the default
- application volume as the main success metric
- fake ATS certainty
- detector-bypass copy
- stealth-interview positioning
- resume templates that look good but parse poorly
- hidden trial renewal or unclear credit systems

## Product opportunities

### 1. Career Twin

Competitors ask users to re-enter context across tools. Talent Consulting should save trusted context once:

- confirmed resume facts
- target roles
- work history
- skills
- salary expectations
- writing style
- job preferences
- applications
- interviews
- outcomes

This becomes the memory layer for Sona.

### 2. Proof Engine

Jobscan and Resume Worded prove users value scoring. The opportunity is to go beyond scoring.

Show:

- matched requirements
- missing requirements
- facts preserved
- claims rejected
- before and after bullet changes
- ATS-safe formatting checks
- confidence and risk notes

### 3. Application workspace

Teal and Huntr prove tracking matters. Talent Consulting should make tracking richer:

- Kanban board
- saved jobs
- company dossier
- recruiter notes
- follow-up reminders
- outcome logging
- interview prep linked to each role

### 4. Review queue

Oaki and JobCopilot show users want prepared work. Talent Consulting should make this safer:

- Sona prepares an application packet
- the user reviews evidence and risk notes
- the user approves, edits, or rejects
- every submission has an audit trail

### 5. Interview system

Final Round AI, Big Interview, Exponent, and Interviewing.io prove interview prep is valuable.

Talent Consulting should add:

- story bank
- mock interview
- role-specific question sets
- company-specific prep
- salary negotiation
- debriefs

Do not build stealth live-interview help.

### 6. Monetization

Competitor pricing clusters around these bands:

- free starter plans
- resume and tracker plans around $19.99 to $49.95/month
- interview copilot plans from $25/month annual-equivalent up to $150/month
- one-time or lifetime offers from $50 to $299
- auto-apply credits or application caps

Talent Consulting should keep pricing simple:

- Free: enough to prove value, with limited saved history and AI usage
- Pro: core resume, tracker, proof, and interview workflows
- Max: Sona, Career Twin memory, proactive briefs, review queue, and higher limits

Before launch, Stripe prices, product copy, checkout, email receipts, and usage gates must match.

## Phase checklist

Use this checklist as the execution reference.

- [x] Phase 0 build pass 1: create a source-backed competitor brief
- [x] Phase 0 audit pass 1: verify sources, coverage, and plan alignment
- [x] Phase 0 build pass 2: add missing evidence and tighten recommendations
- [x] Phase 0 audit pass 2: final check before moving to Phase 1
- [x] Phase 1 build pass 1: dashboard command center, Sona panel, review packet shell
- [x] Phase 1 audit pass 1: desktop and mobile browser checks, console review, type-check, UX audit
- [x] Phase 1 build pass 2: fix UX gaps and complete empty, loading, result, and error states
- [x] Phase 1 audit pass 2: confirm responsive behavior and no regressions
- [x] Phase 2: Career Twin
- [x] Phase 2 build pass 1: show Career Twin memory in Career Intelligence
- [x] Phase 2 audit pass 1: signed-in desktop and mobile review with real Career Twin data
- [x] Phase 2 build pass 2: reuse Career Twin memory in dashboard, Sona panel, and application packet planning
- [x] Phase 2 build pass 2a: reuse Career Twin memory in the persistent Sona context rail
- [x] Phase 2 build pass 2b: reuse Career Twin memory in dashboard command center and application packet planning preview
- [x] Phase 2 build pass 2c: reuse Career Twin memory in Agent Queue packet review
- [x] Phase 2 audit pass 2: confirm real data, export, Sona prompts, and no regressions
- [x] Phase 3: Proof Engine
- [x] Phase 3 build pass 1: add reusable Proof Engine report and mount it in ATS Match Score
- [x] Phase 3 audit pass 1a: type-check, production build, and real ATS browser smoke check
- [x] Phase 3 audit pass 1b: accessibility, signed-in saved resume flow, and UX cleanup
- [x] Phase 3 build pass 2: reuse Proof Engine in Resume Studio, Agent Queue, cover letter, and screening-answer review
- [x] Phase 3 build pass 2a: reuse Proof Engine in Resume Studio morph review
- [x] Phase 3 audit pass 2a: type-check, production build, and mocked Resume Studio browser smoke check
- [x] Phase 3 build pass 2b: reuse Proof Engine in Agent Queue, cover letter, and screening-answer review
- [x] Phase 3 audit pass 2b: type-check, production build, and mocked Cover Letter Studio browser smoke check
- [x] Phase 3 audit pass 2: confirm desktop, mobile, evidence, no-invention rules, and no regressions
- [x] Phase 4: Application Workspace
- [x] Phase 4 build pass 1: add application workspace brief and drawer dossier
- [x] Phase 4 audit pass 1a: type-check, production build, and signed-out desktop and mobile workspace smoke check
- [x] Phase 4 audit pass 1b: signed-in tracker, dossier, follow-up, notes, outcome, and drawer review with local demo data
- [x] Phase 4 build pass 2: polish Skill Bridge, mobile drawer, and async recovery states
- [x] Phase 4 audit pass 2: type-check, production build, desktop and mobile drawer review, and API smoke check
- [x] Phase 5: Review Queue
- [x] Phase 5 build pass 1: add packet readiness cockpit and inline async recovery to Agent Queue
- [x] Phase 5 audit pass 1: type-check, production build, desktop drawer review, and readiness scoring finding
- [x] Phase 5 build pass 2: recalibrate readiness scoring and packet state summary after audit
- [x] Phase 5 audit pass 2: type-check, production build, desktop and mobile drawer review, and feedback smoke test
- [x] Phase 6: Interview System
- [x] Phase 6 build pass 1: add Interview Studio readiness cockpit
- [x] Phase 6 audit pass 1: type-check, production build, desktop review, and context fallback finding
- [x] Phase 6 build pass 2: reuse Career Twin intelligence for interview readiness and story fallback
- [x] Phase 6 audit pass 2: type-check, production build, desktop and mobile review, and Sona plan smoke test
- [x] Phase 7: Monetization and readiness
- [x] Phase 7 build pass 1: add checkout launch readiness and recovery states
- [x] Phase 7 audit pass 1: type-check, production build, desktop checkout review, and Stripe client-secret/CSP findings
- [x] Phase 7 build pass 2: stabilize embedded checkout session and CSP frame readiness
- [x] Phase 7 audit pass 2: type-check, production build, desktop/mobile upgrade review, checkout request audit
- [x] Phase 8: Browser extension plan
- [x] Phase 8 build pass 1: create browser extension scope, permissions, API, and data-boundary plan
- [x] Phase 8 audit pass 1: type-check, production build, source review, and missing implementation-gate findings
- [x] Phase 8 build pass 2: add auth pairing, board safety, parser fixtures, no-submit tests, and retention gates
- [x] Phase 8 audit pass 2: type-check, production build, final plan review, and product-strategy link
- [x] Live Firebase launch audit: temporary Firebase user, protected suite pages, authenticated APIs, mobile queue, checkout readiness, and cleanup

## Phase 0 audit record

The Phase 0 audit checked the current file and plan link.

Evidence:

- 20 numbered competitor rows are present in the top 20 matrix
- 73 source links are present across primary, secondary, GitHub, and X sources
- GitHub and open-source lessons are included
- public X signals are included with a clear limitation note
- pricing snapshots are included for every top 20 competitor, with caveats where official pages were limited
- `PRODUCT_STRATEGY_PLAN.md` links to this file as the Phase 0 source of truth

Phase 0 is ready to feed Phase 1. It does not prove the full product goal is complete.

## Phase 1 build pass 1 record

Phase 1 build pass 1 added the first review-first command center surface to `/suite`.

Evidence:

- `components/dashboard/PhaseOneCommandCenter.tsx` adds Sona context, a review-first application packet shell, and Proof Engine preview cards
- `app/suite/page.tsx` renders the command center before the existing job, outcome, and agent widgets
- `lib/ai/sdk.ts` now matches the current AI SDK model and token option types
- `lib/ai/sona-toolkit.ts` now uses current AI SDK tool schemas
- `npm run type-check` passed
- `npm run build` passed

The Phase 1 audit is still open. `/suite` redirects without an authenticated user, so the next audit must use a signed-in desktop and mobile session.

## Phase 1 shell progress record

Phase 1 now has a mounted command palette in the workspace shell.

Evidence:

- `components/CommandPalette.tsx` is a token-based suite command palette
- `components/workspace/WorkspaceFrame.tsx` mounts the command palette for suite and guest workspace views
- the palette includes upload or check resume, save job, create application packet, open Sona, start mock interview, review follow-ups, review queue, and billing commands
- the create application packet command opens Sona with a review-first prompt and says not to submit anything
- `npm run type-check` passed
- `npm run build` passed after clearing generated `.next` output
- Playwright desktop smoke check opened the command palette, filtered for `packet`, and opened Sona with the packet prompt
- Playwright mobile smoke check at 390 by 844 showed the quick tools rail and More tools sheet grouped by workflow

The console showed existing local environment noise: Google Tag Manager is blocked by the current content security policy, and `/api/admin/promo` returns 401 for unauthenticated preview sessions.

This historical gap was closed by the Phase 1 to Phase 3 consolidation audit.

## Phase 1 review state progress record

Phase 1 now has a reusable review-first workflow layer.

Evidence:

- `components/suite/ReviewFirstWorkflow.tsx` defines shared packet artifact, proof checklist, and review state components
- `components/dashboard/PhaseOneCommandCenter.tsx` uses the shared packet and proof components instead of local one-off rows
- packet artifacts now show ready, review, and blocked states
- the state model shows empty, preparing, blocked, and approved states
- proof items separate preserved facts, missing requirements, and risk notes
- `npm run type-check` passed
- `npm run build` passed
- Playwright confirmed the unauthenticated workspace shell still renders after the change

This historical build gap was closed by the later Agent Queue, Applications, Resume Studio, cover letter, and screening-answer integrations.

## Phase 1 Agent Queue progress record

Agent Queue now uses the shared review-first layer in the product workflow.

Evidence:

- `app/suite/agent/queue/page.tsx` maps each queue item into packet artifacts for tailored resume, cover letter, and screening answers
- the packet drawer now shows artifact status before fit notes, drafts, and posting details
- proof checks now show preserved facts, missing requirements, and submission control
- empty state now explains how a review-first packet will appear before Sona has data
- error state now gives a clear retry path
- `npm run type-check` passed
- `npm run build` passed
- Playwright opened `/suite/agent/queue` on desktop and mobile while signed out
- screenshots were saved at `output/playwright/agent-queue-unauth-desktop.png` and `output/playwright/agent-queue-unauth-mobile.png`

This historical signed-in packet gap was closed by the Phase 1 to Phase 3 consolidation audit using the local demo queue.

## Phase 1 Sona context panel progress record

The suite shell now has a persistent Sona context panel on wide screens.

Evidence:

- `components/workspace/SonaContextPanel.tsx` adds a right-side panel for current page context, evidence loaded, Sona moves, and trust gates
- `components/workspace/WorkspaceFrame.tsx` mounts the panel across suite pages and reserves space for it on wide screens
- `components/SonaFloatingOrb.tsx` keeps the chat listener available on mobile and opens chat beside the wide panel instead of under it
- the panel shows facts preserved, review required, artifact creation, and external-action approval gates
- the panel can open Sona with a review-first prompt for the current page capability
- mobile quick tools can open the Sona chat sheet with a prompt loaded
- `npm run type-check` passed
- `npm run build` passed after clearing generated `.next` output
- Playwright checked `/suite/agent/queue` at 1600 by 900 and 390 by 844 while signed out
- screenshots were saved at `output/playwright/sona-context-panel-wide.png`, `output/playwright/sona-context-panel-chat-open.png`, and `output/playwright/sona-mobile-quick-chat-open.png`

This historical signed-in audit gap was closed by the Phase 1 to Phase 3 consolidation audit using local demo Career Twin data. The live Firebase repeat was completed on 4 July 2026.

## Phase 2 Career Twin visibility progress record

Career Intelligence now exposes the Career Twin as a visible memory panel.

Evidence:

- `app/suite/intelligence/page.tsx` now stores `data.twin` from `/api/agent/intelligence`
- the overview page now shows Career Twin completeness, story coverage, applications, queued packets, identity, goals, search state, confirmed facts, trust controls, and next best actions
- the no-profile state now explains what data Sona needs before it can work from memory
- the panel can ask Sona to review the Career Twin and prepare a selected next action without external submission
- export uses `/api/agent/intelligence?export=true` with `authFetch` so the Firebase token is included
- `npm run type-check` passed
- `npm run build` passed
- Playwright checked `/suite/intelligence` at 1440 by 1000 and 390 by 844 while signed out
- screenshots were saved at `output/playwright/career-twin-intelligence-empty-desktop.png` and `output/playwright/career-twin-intelligence-empty-mobile.png`

This historical signed-in audit gap was closed by the Phase 1 to Phase 3 consolidation audit using local demo Career Twin data, export, and Sona prompt checks.

Known local console noise remains unchanged: Google Tag Manager is blocked by the current content security policy, and `/api/admin/promo` returns 401 for signed-out preview sessions.

## Phase 2 Sona rail memory progress record

The persistent Sona context rail now reuses Career Twin memory.

Evidence:

- `lib/career-twin-client.ts` adds client-safe Career Twin types and shared display helpers
- `app/suite/intelligence/page.tsx` now uses the shared Career Twin helper module instead of local duplicate types
- `components/workspace/SonaContextPanel.tsx` fetches `/api/agent/intelligence` for signed-in users and shows a Career Twin rail section
- the Sona rail now has locked, loading, missing, and loaded Career Twin states
- the Sona rail adds Career Twin metadata to Sona capability context, including completeness, target roles, applications, queued packets, stale applications, and skill gaps
- top Career Twin actions can be prepared through Sona with a review-first prompt
- `npm run type-check` passed
- `npm run build` passed after clearing generated `.next` output
- Playwright checked `/suite/intelligence` at 1600 by 1000 and 390 by 844 while signed out
- screenshots were saved at `output/playwright/sona-context-career-twin-rail-wide.png` and `output/playwright/sona-context-career-twin-mobile.png`

The signed-in loaded state is still not audited. The next pass must confirm the rail with real Career Twin data and then reuse the same memory in the dashboard and application packet planning surfaces.

## Phase 2 dashboard memory progress record

The dashboard command center now reuses Career Twin memory for the next action and packet planning preview.

Evidence:

- `app/suite/page.tsx` now uses a typed dashboard Career Twin shape and passes `twinData` into `PhaseOneCommandCenter`
- `app/suite/page.tsx` now exports Career Twin data with `authFetch('/api/agent/intelligence?export=true')` so the Firebase token is included
- `components/dashboard/PhaseOneCommandCenter.tsx` now changes its target, search, gap, next-action, packet artifact, and proof checklist copy from Career Twin memory
- Sona prompts from the dashboard command center now include Career Twin metadata for completeness, target roles, application counts, queued packets, stale applications, and skill gaps
- application packet planning now exposes Career Twin readiness, resume proof, application queue state, missing requirements, risk notes, and review control before submission
- `npm run type-check` passed
- `npm run build` passed
- Playwright checked `/suite` at 1600 by 1000 and 390 by 844 while signed out
- screenshots were saved at `output/playwright/dashboard-career-twin-command-center-wide.png` and `output/playwright/dashboard-career-twin-command-center-mobile.png`

The signed-out browser check rendered the guest workspace before the authenticated dashboard command center. That was expected. The dashboard audit gap was closed by the Phase 1 to Phase 3 consolidation audit using local demo Career Twin values, Sona prompt checks, export, desktop layout, and mobile layout.

Known local console noise remains unchanged: Google Tag Manager is blocked by the current content security policy, and signed-out API calls return 401 where account data is required.

## Phase 2 Agent Queue memory progress record

Agent Queue now uses Career Twin memory in its packet planning and review workflow.

Evidence:

- `app/suite/agent/queue/page.tsx` now fetches `/api/agent/intelligence` with `authFetch` for signed-in users
- the Agent Queue page now shows a Career Twin context strip with memory completeness, target roles, queue state, resume proof, skill gaps, and review gates
- empty queue packet planning now changes from generic setup copy to Career Twin-aware artifacts for memory, search preferences, resume proof, and user approval
- packet drawer artifacts now include Career Twin fit before tailored resume, cover letter, and screening-answer checks
- packet drawer proof checks now use confirmed skills, resume memory, active skill gaps, fit signals, risk signals, and submission control
- Agent Queue Sona prompts now include Career Twin metadata, packet id, company, role, match score, status, risk signals, and fit signals
- `npm run type-check` passed
- `npm run build` passed
- Playwright checked `/suite/agent/queue` at 1600 by 1000 and 390 by 844 while signed out
- screenshots were saved at `output/playwright/agent-queue-career-twin-wide.png` and `output/playwright/agent-queue-career-twin-mobile.png`

The signed-out browser check reached the sign-in state before the loaded queue. That was expected. The Agent Queue audit gap was closed by the Phase 1 to Phase 3 consolidation audit using local demo queue data, the Career Twin context strip, packet drawer artifacts, Sona prompt metadata, desktop layout, and mobile drawer layout.

Known local console noise remains unchanged: Google Tag Manager is blocked by the current content security policy, and signed-out API calls return 401 where account data is required.

## Phase 3 Proof Engine build pass 1 record

The ATS Match Score flow now has a visible Proof Engine report. It turns a score into review-first evidence.

Evidence:

- `components/suite/ProofEngineReport.tsx` adds a reusable report component and data model
- `components/ATSScorePanel.tsx` converts ATS results, resume text, and job description text into a proof report
- the report shows matched and missing requirements, evidence excerpts, preserved facts, blocked claims, before and after explanations, ATS-safe checks, and a no-invention guard
- missing certifications and unproven requirements are treated as blocked claims, not facts to invent
- `middleware.ts` now allows `/api/resume/ats-score` through the freemium API path list, matching the route's anonymous access setting
- `npm run type-check` passed
- `npm run build` passed after clearing generated `.next` output
- real browser testing on `/suite/ats-analyzer` returned 200 from `/api/resume/ats-score`
- Playwright confirmed the Proof Engine report, claims blocked, before and after explanation, no-invention guard, and no horizontal overflow at 390px mobile width
- screenshots were saved at `output/playwright/proof-engine-ats-score-real-wide.png` and `output/playwright/proof-engine-ats-score-real-mobile.png`

Historical gaps before the final Phase 3 consolidation:

- signed-in saved-resume selection required a real data audit
- signed-in Agent Queue packet drawers required a real data audit
- standalone screening-answer outputs needed a dedicated review surface if they moved outside Agent Queue or Sona chat
- accessibility review was needed for heading order, keyboard flow, contrast, and screen reader labels
- the desktop command palette trigger could sit over the lower right of the workspace, so the next UI cleanup needed to keep floating controls away from proof report metrics
- signed-out local preview logged account-data 401s where saved resume data was unavailable

## Phase 3 Resume Studio proof progress record

Resume Studio now shows the reusable Proof Engine report after a morph result, before the user exports or saves the resume.

Evidence:

- `app/suite/resume/page.tsx` maps the existing TF-IDF proof result and morph guardrail report into `ProofEngineReportData`
- the report shows job description terms, matched and missing requirements, preserved facts, blocked protected-field changes, before and after proof, export checks, and the no-invention guard
- guardrail changes, such as an attempted certification addition, appear as blocked claims
- the report appears in Resume Intelligence when available
- the report also appears in the Template review state, before export
- `npm run type-check` passed
- `npm run build` passed
- Playwright used mocked `/api/resume/parse` and `/api/resume/morph` responses to verify the full paste, parse, target, morph, and template review flow
- Playwright confirmed the Proof Engine report, claims blocked, before and after explanation, no-invention guard, blocked certification evidence, and no horizontal overflow at 390px mobile width
- screenshots were saved at `output/playwright/proof-engine-resume-morph-template-wide.png` and `output/playwright/proof-engine-resume-morph-template-mobile.png`

## Phase 3 Agent Queue and cover letter proof progress record

Agent Queue and Cover Letter Studio now reuse the Proof Engine report in review-first output states.

Evidence:

- `components/suite/ProofEngineReport.tsx` now supports compact report rendering for drawers and narrow result columns
- `app/suite/agent/queue/page.tsx` maps packet data into `ProofEngineReportData`
- the Agent Queue report checks role fit, tailored resume readiness, cover letter readiness, screening-answer review, Career Twin context, fit signals, risk signals, blocked claims, and no-auto-submit controls
- screening-answer readiness is now part of the Agent Queue packet proof report, so risk notes must be resolved before answers are pasted into external forms
- `app/suite/cover-letter/page.tsx` maps cover-letter output, Application Kit context, ATS keyword gaps, resume context, job description terms, and key highlights into `ProofEngineReportData`
- Cover Letter Studio now shows the proof report before copy, DOCX, save, subject, and letter body actions
- missing requirements, such as a certification gap, appear as blocked claims instead of claims to invent
- `npm run type-check` passed
- `npm run build` passed after clearing generated `.next` output
- Playwright used a mocked `/api/agent/cover-letter` response to verify the generated cover-letter result state
- Playwright confirmed the Proof Engine report, blocked certification claim, before and after explanation, no-invention guard, review-before-use check, and no horizontal overflow at 390px mobile width
- screenshots were saved at `output/playwright/proof-engine-cover-letter-wide.png` and `output/playwright/proof-engine-cover-letter-mobile.png`
- Playwright also confirmed the local Agent Queue route reaches the signed-out gate with no horizontal overflow

Historical gaps before the final Phase 3 consolidation:

- the signed-in Agent Queue drawer required a real data audit with queued packet data
- accessibility review was needed for heading order, keyboard flow, contrast, and screen reader labels
- signed-out local preview logged account-data 401s where saved resume data was unavailable

This completed the build side of Phase 3 pass 2. The final Phase 3 audit was closed by the Phase 1 to Phase 3 consolidation audit.

## Phase 1 to Phase 3 consolidation audit record

Phases 1 to 3 are complete for the current local demo build plan. The earlier signed-in blocker was removed for product work, so this pass used the local `Alula Career Operator` demo state instead of the sign-in wall.

Phase 1 consolidation evidence:

- `/suite` no longer redirects to `/`; it opens the workspace command center directly while sign-in is disabled for product work
- the sidebar Dashboard action now keeps the user in `/suite` instead of sending them to the public landing page
- desktop Playwright confirmed the command center loads Sona context, target roles, search state, gaps, application packet planning, Proof Engine preview, state model, and Agent Queue
- the command palette opens from the workspace and includes create application packet, review queue, and Sona next-action commands
- mobile Playwright at 390 by 900 confirmed the command center and quick tools rail remain usable
- screenshots were saved at `output/playwright/phase1-suite-command-center-desktop.png`, `output/playwright/phase1-command-palette-desktop.png`, and `output/playwright/phase1-suite-command-center-mobile.png`

Phase 2 consolidation evidence:

- `/suite/intelligence` loads Career Twin memory with 82% completeness, target roles, confirmed facts, skill gaps, trust controls, next best actions, application counts, queue state, and story coverage
- the wide Sona context rail reuses Career Twin data for targets, applications, queued packets, response rate, story coverage, velocity, stale applications, skill gaps, and review gates
- Career Twin JSON export downloaded successfully from the browser and contained `profile`, `background`, `memory`, `behavioralCoverage`, and `meta`
- desktop and mobile Playwright checks confirmed the Career Intelligence surface remained readable
- screenshots were saved at `output/playwright/phase2-career-twin-intelligence-desktop.png`, `output/playwright/phase2-career-twin-intelligence-mobile.png`, and `output/playwright/phase2-sona-context-career-twin-wide.png`

Phase 3 consolidation evidence:

- the Agent Queue packet drawer exposes the shared Proof Engine report for the Pinnacle AI packet
- the report shows requirement evidence, facts preserved, claims blocked, screening-answer guardrails, approval gate, and no-submit/manual-review language
- packet cockpit checks cover resume proof, cover letter, recruiter message, screening answers, proof checklist, and approval gate
- desktop and mobile Playwright text checks confirmed Proof Engine, claims blocked, requirements and evidence, facts preserved, screening answer review, approval gate, and no-submit language
- the suite Sona promo bubble is now suppressed inside `/suite/*` so it does not cover review drawers
- the Next.js dev indicator is disabled in local development screenshots
- the mobile packet drawer now sits above the quick tools rail, with the close control and bottom review actions visible
- screenshots were saved at `output/playwright/phase3-proof-engine-agent-queue-desktop-clean.png` and `output/playwright/phase3-proof-engine-agent-queue-mobile-final.png`

Regression checks:

- `npm run type-check` passed
- `npm run build` passed
- Agent Queue APIs checked in the browser returned `200 OK`: `/api/agent/intelligence`, `/api/agent/insights`, and `/api/admin/promo`

Known local console noise:

- Google Tag Manager is still blocked by the current local content security policy
- Next.js still warns that the `middleware` file convention is deprecated in favour of `proxy`
- the live Firebase repeat was completed on 4 July 2026

## Sign-in restoration record

Sign-in is re-enabled by default after the local demo build cycle.

Evidence:

- `lib/demo-mode.ts` now keeps demo mode off unless `NEXT_PUBLIC_DISABLE_AUTH_GATE=true`
- `env.example` documents the demo mode flag and sets it to `false`
- production still disables demo mode regardless of the flag
- local demo data can still be turned on deliberately for future audits
- unauthenticated `/api/agent/intelligence` now returns `401`
- Playwright confirmed `/suite/agent/queue` shows the sign-in gate, does not show the demo user, and does not show demo queue data
- screenshot saved at `output/playwright/sign-in-restored-agent-queue.png`

Live Firebase update:

- live Firebase audit completed on 4 July 2026
- see the live Firebase launch audit record below

## Live Firebase launch audit record

The Firebase blocker is closed for the current local product build.

Evidence:

- Firebase Admin credentials work for Auth and Firestore reads
- a temporary `codex-live-audit` Firebase user was created with a profile, one Agent Queue packet, and one Applications record
- the app login modal authenticated that user through the normal email and password flow
- `/suite/agent/queue` rendered the seeded packet and did not show the sign-in gate, demo user, or demo queue data
- `/suite`, `/suite/intelligence`, `/suite/applications`, `/suite/interview-sim`, `/suite/resume`, `/suite/ats-analyzer`, and `/suite/upgrade` rendered under the same Firebase session
- desktop Browser QA confirmed Applications showed the seeded Codex Audit Labs record
- mobile Browser QA at 390 by 844 confirmed Agent Queue rendered the live packet and did not show the sign-in gate
- Firebase REST login returned an ID token for the temporary user
- authenticated `GET /api/agent/intelligence` returned `200`
- authenticated `GET /api/user/subscription` returned `200`
- unauthenticated `GET /api/agent/intelligence` returned `401`
- the live Stripe checkout frame loaded on `/suite/upgrade`; no payment details were entered, no payment was submitted, and the open audit checkout session was expired
- the temporary Firebase Auth user and Firestore user document were deleted after the audit
- `npm run type-check` passed after the audit changes
- `npm run build` passed after the audit changes

Build fixes made during the audit:

- list rendering now uses stable fallback keys for Sona context lines, Sona capability context chips, floating Sona history and insights, Agent Queue widgets, dashboard skill chips, Career Intelligence chips, and Agent Queue proof signals

Remaining launch risks:

- Stripe live checkout was only opened on localhost; final payment testing still needs production HTTPS and an explicit test payment plan
- the browser extension is still a plan only; do not ship it until its separate privacy policy, parser fixtures, and no-submit tests are complete
- Turbopack still warns that it cannot find fallback override values for `Google Sans Flex`; the production build completes successfully

## Phase 4 Application Workspace progress record

Applications now has the first Application Workspace layer.

Evidence:

- `app/suite/applications/page.tsx` adds an Application Workspace brief near the top of the page
- the brief shows tracker count, company dossier coverage, follow-ups due, and outcome coverage
- the brief can focus the user on dossiers, follow-ups, outcomes, or ask Sona to audit the workspace
- the application drawer now opens with an application dossier before status, resume, notes, and outcome sections
- the dossier shows the next workspace action, dossier completion, company, role, linked resume, outcome, match, Skill Bridge progress, recruiter notes coverage, follow-up timing, and outcome ledger status
- the dossier keeps the review-first model: it shows missing notes, missing outcomes, follow-up timing, and packet review gates before action
- `npm run type-check` passed
- `npm run build` passed
- Playwright checked `/suite/applications` at 1440 by 1000 and 390 by 1000 in the signed-out empty state
- Playwright confirmed company dossier, follow-up, outcome, empty-state content, and no horizontal overflow at 390px mobile width
- screenshots were saved at `output/playwright/application-workspace-empty-wide.png` and `output/playwright/application-workspace-empty-mobile.png`

Open gaps:

- the signed-in application drawer still needs a real data audit with saved applications
- follow-up drafting, recruiter notes, outcome logging, offer review, and Skill Bridge progress still need end-to-end signed-in checks
- Phase 4 is not complete until the tracker, dossier, follow-up, notes, and outcome workflows are verified with real data

## Phase 4 signed-in audit pass 1b record

Applications now has a signed-in local demo path for the main workspace workflow while the sign-in wall is disabled for product work.

Evidence:

- local demo mode renders `/suite/applications` as `Alula Career Operator` with 3 saved applications, linked resumes, notes, outcomes, follow-up timing, interview prep, and an offer dossier
- the workspace summary showed tracker, company dossier, follow-up, outcome, needs-attention, recent application, and next-action states from seeded signed-in data
- the Vector Harbor drawer showed a complete offer dossier, linked resume, recruiter notes, outcome, negotiation brief, leverage points, non-salary asks, scripts, and decision buttons
- notes were edited and saved in the Vector Harbor drawer
- Nova Talent generated a follow-up draft from the drawer and returned `200 OK` from `/api/agent/follow-up`
- Nova Talent outcome logging changed the drawer, summary metrics, and needs-attention state from outcome pending to interview prep
- Nova Talent generated role-specific interview prep and returned `200 OK` from `/api/agent/interview-prep`
- Vector Harbor refreshed the offer brief and returned `200 OK` from `/api/agent/negotiate`
- `app/suite/applications/page.tsx` now sends follow-up, interview prep, and offer brief requests through `authFetch`
- `app/api/agent/follow-up/route.ts`, `app/api/agent/interview-prep/route.ts`, and `app/api/agent/negotiate/route.ts` now have deterministic local demo responses for the demo user
- offer deadlines are normalized for date inputs, and compensation fields use dollar labels while offer copy formats values as `$215k` style text
- `npm run type-check` passed
- `npm run build` passed
- Playwright checked the signed-in Applications workspace on desktop and at 390 by 900 mobile width
- screenshots were saved at `output/playwright/application-workspace-demo-followup.png`, `output/playwright/application-workspace-demo-outcome.png`, `output/playwright/application-workspace-demo-prep.png`, `output/playwright/application-workspace-demo-offer-refresh.png`, `output/playwright/application-workspace-demo-mobile.png`, and `output/playwright/application-workspace-demo-mobile-drawer.png`

Known local console noise:

- Google Tag Manager is still blocked by the current local content security policy
- the checked application APIs returned `200 OK`; no Applications workflow 401 remained in the final browser pass

Live Firebase update:

- Applications rendered with a live Firebase user on 4 July 2026

## Phase 4 build pass 2 and audit pass 2 record

Phase 4 is complete for the current local demo build plan.

Evidence:

- `app/suite/applications/page.tsx` now builds a Skill Bridge summary from linked study progress
- the application dossier now includes a Skill Bridge gate with a next action
- the drawer now has a dedicated Skill Bridge section with readiness, active skills, progress, and a direct Skill Bridge link
- applications without linked skill plans now show a useful empty Skill Bridge state
- the page-level mobile sticky action bar no longer appears while the application drawer is open
- follow-up and interview prep failures now show inline drawer recovery messages, not only toasts
- Offer Coach save and refresh failures now show inline recovery messages
- `npm run type-check` passed
- `npm run build` passed
- Playwright checked Vector Harbor on desktop for the empty Skill Bridge state and offer drawer continuity
- Playwright checked Aurora Labs on desktop for linked Skill Bridge readiness and active skill progress
- Playwright checked the Aurora Labs mobile drawer at 390 by 900, including a scrolled Skill Bridge section
- Playwright confirmed `/api/agent/interview-prep` returned `200 OK`
- screenshots were saved at `output/playwright/application-workspace-phase4-pass2-vector-desktop.png`, `output/playwright/application-workspace-phase4-pass2-skillbridge-desktop.png`, `output/playwright/application-workspace-phase4-pass2-mobile-drawer.png`, and `output/playwright/application-workspace-phase4-pass2-mobile-skillbridge-scrolled.png`

Known local console noise:

- Google Tag Manager is still blocked by the current local content security policy

Live Firebase update:

- Applications rendered with a live Firebase user on 4 July 2026

## Phase 5 build passes and audit record

Phase 5 is complete for the current local demo build plan.

Build pass 1 added the Review Queue packet cockpit.

Evidence:

- `app/suite/agent/queue/page.tsx` now turns each queued role into a packet readiness model
- the packet drawer now shows resume proof, cover letter, recruiter message, screening-answer notes, proof checklist, and approval gate together
- recruiter-message, screening-answer, and proof-checklist draft previews now have Sona revision actions
- approve, apply, and feedback actions now clear stale errors, catch failures, and show inline recovery messages as well as toasts
- `npm run type-check` passed
- `npm run build` passed

Audit pass 1 finding:

- the first cockpit score treated every review state as zero readiness, which made a prepared but unapproved packet show `0%`

Build pass 2 fixed the score model.

Evidence:

- review states now count as partial readiness
- the cockpit summary now shows ready, review, and blocked counts
- the packet state is shown in the cockpit description
- the Pinnacle AI demo packet now shows `50%` readiness, with five review gates and one blocked gate
- desktop Playwright reviewed the Pinnacle AI drawer with Career Twin data, packet drafts, proof report, and approval controls
- mobile Playwright at 390 by 900 confirmed the drawer remains reachable and the bottom approve, dismiss, and posting controls are present
- feedback smoke test toggled `More like this` without showing an inline action error
- `npm run type-check` passed after the redo
- `npm run build` passed after the redo
- screenshots were saved at `output/playwright/review-queue-phase5-pass2-desktop-drawer.png` and `output/playwright/review-queue-phase5-pass2-mobile-drawer.png`

Known local console noise:

- Google Tag Manager is still blocked by the current local content security policy

Live Firebase update:

- Review Queue rendered with a live Firebase user on 4 July 2026

## Phase 6 build passes and audit record

Phase 6 is complete for the current local demo build plan.

Build pass 1 added an Interview Studio readiness cockpit.

Evidence:

- `app/suite/interview-sim/page.tsx` now builds interview readiness checks for role context, resume anchor, story proof, JD signal, debrief loop, and practice plan
- the setup flow now shows readiness score, ready/review/blocked counts, and a next drill sequence before the user starts practice
- the cockpit includes actions to ask Sona for a plan or move to saved debriefs
- `npm run type-check` passed
- `npm run build` passed

Audit pass 1 finding:

- the cockpit worked, but when page-local application and story context was empty it showed a weak baseline even though Career Twin already had target roles, resume memory, and Story Bank coverage

Build pass 2 reused Career Twin intelligence in the Interview System.

Evidence:

- Interview Studio now fetches `/api/agent/intelligence`
- the top tiles use Career Twin target roles, Story Bank count, and resume memory when no exact application or resume is selected
- the readiness cockpit now shows Career Twin role context, resume memory, 8 proof stories, model evaluation gap, and a 61% readiness score in the local demo state
- the Sona intelligence panel now matches the cockpit instead of saying no stories are available
- desktop Playwright reviewed the Career Twin-backed readiness state
- mobile Playwright at 390 by 900 confirmed the readiness cockpit remains readable
- the `Build plan` action opened Sona with the focused interview plan prompt loaded
- `npm run type-check` passed after the redo
- `npm run build` passed after the redo
- screenshots were saved at `output/playwright/interview-system-phase6-pass2-desktop-readiness.png` and `output/playwright/interview-system-phase6-pass2-mobile-readiness.png`

Known local console noise:

- Google Tag Manager is still blocked by the current local content security policy

Live Firebase update:

- Interview Studio rendered with a live Firebase user on 4 July 2026

## Phase 7 build passes and audit record

Phase 7 is complete for the current local demo build plan.

Build pass 1 added checkout launch readiness.

Evidence:

- `app/suite/upgrade/page.tsx` now shows a checkout readiness panel for plan fit, live pricing source, secure checkout, and billing control before the user pays
- the readiness panel handles ready, review, loading, and blocked states
- pricing source status comes from `/api/billing/prices`
- checkout failures now show an inline recovery panel with retry and billing settings actions
- plan identity now uses the shared Pro and Max brand system
- `npm run type-check` passed
- `npm run build` passed

Audit pass 1 finding:

- React development mode could create more than one embedded checkout session during the first load, which produced Stripe's client-secret change warning

Build pass 2 stabilized checkout and CSP readiness.

Evidence:

- checkout session creation now ignores stale responses
- the initial checkout effect is guarded so the first page load does not request duplicate checkout sessions
- `EmbeddedCheckoutProvider` is keyed by `clientSecret` so a new checkout session remounts cleanly when needed
- `next.config.js` now allows `https://client.wra-api.net` in `frame-src` for Stripe's verification path
- desktop Playwright confirmed the Max checkout path shows 100% readiness, live `$9.99/mo` pricing, one `/api/stripe/subscribe` request, and an embedded Stripe checkout form
- mobile Playwright at 390 by 900 confirmed the readiness surface and embedded Stripe payment form are usable
- `npm run type-check` passed after the redo
- `npm run build` passed after the redo
- screenshots were saved at `output/playwright/monetization-phase7-pass2-desktop-upgrade.png`, `output/playwright/monetization-phase7-pass2-mobile-upgrade.png`, and `output/playwright/monetization-phase7-pass2-mobile-checkout.png`

Known local console noise:

- Google Tag Manager is still blocked by the current local content security policy
- Stripe warns that live Stripe.js integrations must use HTTPS; this is expected on `localhost`
- Stripe's PerimeterX frame still logs a `client.wra-api.net` CSP message from inside Stripe's own third-party frame, but the embedded checkout loads and remains usable

Live Firebase update:

- checkout rendered with a live Firebase user on 4 July 2026
- production HTTPS and final Stripe payment testing remain separate launch checks

## Phase 8 build passes and audit record

Phase 8 is complete for the current planning scope.

Build pass 1 created the Browser Extension Plan.

Evidence:

- `docs/browser-extension-plan.md` now defines the extension decision, V1 job clipper scope, V1.5 manual-paste assistant, and V2 guarded autofill path
- the plan covers LinkedIn, Indeed, Greenhouse, Lever, and Workday
- the plan defines Manifest V3 architecture, permissions, data boundaries, API contracts, capture payload, review-first invariants, security checklist, implementation phases, audit plan, metrics, and launch gates
- the plan uses official Chrome extension and Chrome Web Store policy references for permissions, Manifest V3, content scripts, storage, and privacy requirements
- `npm run type-check` passed after clearing stale generated `.next/dev/types`
- `npm run build` passed

Audit pass 1 findings:

- the first plan needed clearer account pairing, parser fixture, board policy, no-submit, and retention gates before it could guide implementation safely

Build pass 2 added the missing implementation gates.

Evidence:

- the extension plan now includes board safety rules for login walls, CAPTCHA, mass scraping, anti-abuse controls, and fail-closed parser behavior
- the popup plan now includes keyboard, focus, labeling, color, and 320px accessibility requirements
- the auth model now uses account pairing, short-lived scoped sessions, revocation, expiry, versioned requests, account deletion handling, and sign-out storage clearing
- parser contracts now require field-level confidence, warnings, blocked reasons, and parser versions
- fixture requirements now cover happy paths, expired jobs, login walls, sensitive fields, form fields, and markup drift
- the no-submit test matrix now covers submit, apply, next, continue, hidden fields, sensitive fields, verification flows, unsupported hosts, and Sona refusal behavior
- retention and deletion rules now keep the web app as the system of record and clear extension local state on sign-out
- `PRODUCT_STRATEGY_PLAN.md` now links Phase 8 to `docs/browser-extension-plan.md`
- `npm run type-check` passed after the redo
- `npm run build` passed after the redo

Remaining launch gate:

- do not build or ship the extension until the privacy policy covers extension data handling and the extension parser, retention, and no-submit tests are complete

## Recommended Phase 1 build scope

Start Phase 1 with the product shell, not with another isolated feature page.

Build these in order:

1. Create a command center dashboard on `/suite`.
2. Refactor suite navigation around workflow groups.
3. Add a persistent Sona context panel on desktop and a drawer on mobile.
4. Add an application packet component with draft, review, approved, and blocked states.
5. Add a proof panel component that can be used by resume, cover letter, and screening-answer workflows.
6. Add consistent empty, loading, result, and error states.
7. Add mobile quick review actions.
8. Add command palette actions for upload resume, save job, create application packet, open Sona, start mock interview, and view billing.

The audit should use `DESIGN.md` as the standard.

## Sources

Primary sources:

- [Teal pricing](https://www.tealhq.com/pricing)
- [Huntr pricing](https://huntr.co/pricing)
- [Jobscan Premium features](https://www.jobscan.co/video-jobscan-premium)
- [Jobscan plan page](https://app.jobscan.co/plan)
- [Simplify homepage](https://simplify.jobs/)
- [Simplify Copilot](https://simplify.jobs/copilot)
- [Careerflow Premium](https://www.careerflow.ai/premium)
- [Rezi pricing](https://www.rezi.ai/pricing)
- [Kickresume pricing](https://www.kickresume.com/en/pricing/)
- [Enhancv pricing](https://enhancv.com/pricing/)
- [Resume.io pricing](https://resume.io/pricing)
- [Resume Worded Pro](https://resumeworded.com/get-pro)
- [WonsultingAI pricing](https://www.wonsulting.com/pricing)
- [Final Round AI subscription](https://www.finalroundai.com/subscription)
- [Big Interview pricing](https://www.biginterview.com/pricing/personal)
- [Exponent pricing](https://www.tryexponent.com/upgrade)
- [Interviewing.io FAQ](https://interviewing.io/faq)
- [JobCopilot pricing](https://jobcopilot.com/pricing/)
- [Oaki pricing](https://www.oaki.io/pricing)
- [LoopCV pricing](https://www.loopcv.pro/pricing/)
- [LazyApply automation page](https://lazyapply.com/job-application-automation)
- [AIApply homepage](https://aiapply.co/)

Secondary pricing or market context sources:

- [Jobscan versus Teal comparison](https://www.jobscan.co/blog/jobscan-vs-teal/)
- [Jobscan versus Resume Worded comparison](https://www.jobscan.co/blog/jobscan-vs-resume-worded/)
- [LazyApply 2026 review](https://www.remotejobassistant.com/blog/lazyapply-review)
- [AIApply pricing review](https://www.adzuna.com/blog/aiapply-review-what-works-what-doesnt-a-better-alternative/)

GitHub and open-source sources:

- [Reactive Resume on GitHub](https://github.com/amruthpillai/reactive-resume)
- [OpenResume on GitHub](https://github.com/xitanggg/open-resume)
- [Resume Matcher on GitHub](https://github.com/srbhr/resume-matcher)
- [ApplyPilot on GitHub](https://github.com/Pickle-Pixel/ApplyPilot)
- [AutoApply AI on GitHub](https://github.com/Rayyan9477/AutoApply-AI-Agentic-Browser-Automation-for-Job-Search)
- [AIHawk on GitHub](https://github.com/feder-cr/jobs_applier_ai_agent_aihawk)
- [RenderCV](https://rendercv.com/)

Public X sources:

- [Job search tools post on X](https://x.com/AndrewBolis/status/1927707702622609767)
- [Final Round AI on X](https://x.com/FinalRoundAI)
- [Careerflow on X](https://x.com/careerflow_ai)
- [Pulkit Gupta on X](https://x.com/pulkit_gupta2)
