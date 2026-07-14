# Launch readiness report

Generated on 4 July 2026 for the autonomous launch train. Updated on 5 July 2026.

## Decision

The current build passes the release-readiness gates and is deployed to preview.

This is not a new production go decision. The latest changes in this pass have been deployed to preview, not production.

The current production URL is:

https://talentconsulting.io

The latest recorded preview URL is:

https://talent-consulting-acf16--preview-7vqfk4zu.web.app

The product is ready for controlled preview review. Do not submit live payments, send real user emails, deploy to production or submit external job applications without a separate human approval step.

## Verification summary

| Check | Result | Notes |
| --- | --- | --- |
| `npm run type-check` | Pass | 5 July 2026 final release-readiness pass. |
| `npm run build` | Pass | 5 July 2026 final release-readiness pass. Known warnings: Google Sans fallback values and Node legacy-build warning. |
| `npm run security:cve` | Pass | 5 July 2026 final release-readiness pass. 0 high or critical findings. |
| `npm audit --omit=dev` | Previous pass | 0 vulnerabilities in the last recorded run. |
| `npm run seo:audit` | Pass with follow-up work | 5 July 2026 production rerun. 0 critical and 0 high issues. 42 medium content issues remain on production until the preview work is promoted. |
| Targeted public SEO HTML check | Pass | 5 July 2026 preview check. Public SEO pages now have bounded metadata, source context on data-style pages and no targeted source-warning failures. |
| Preview deploy | Pass | 5 July 2026 Firebase preview deployed and smoke-tested at `https://talent-consulting-acf16--preview-7vqfk4zu.web.app`. It expires on 12 July 2026. Latest expiry recorded: 14:59:40. |
| Firebase static security headers | Pass | 5 July 2026 preview check confirmed the hosted root page now receives CSP and security headers from Firebase Hosting. |
| Production deploy | Previous pass | Production deploy is a separate release action. |
| Production robots | Previous pass | `https://talentconsulting.io/robots.txt` returned 200 in the last recorded check. |
| Production billing prices | Previous pass | Pro and Studio monthly and annual prices were active in the last recorded check. |
| Production protected API | Previous pass | Signed-out `/api/agent/intelligence` returned 401 in the last recorded check. |
| Production Stripe CSP | Previous pass | `/suite/resume`, `/suite/settings` and `/suite/upgrade` allowed Stripe Checkout and 3D Secure hosts in the last recorded check. |
| Production cache control | Previous pass | App routes returned `no-cache, no-store, max-age=0, must-revalidate` in the last recorded check. |

## Stripe launch checks

- The deploy environment now uses active Stripe prices for Pro and Studio monthly and annual plans.
- Pro shows $4.99 per month and $49.99 per year.
- Studio shows $9.99 per month and $89.99 per year.
- Checkout sessions are no longer created when the old upgrade modal opens. A user must choose to continue to secure checkout.
- Stripe return URLs now use an allowlist for localhost, Firebase preview and production domains.
- Stripe webhooks now ignore events that do not match the configured Stripe key mode.
- No live payment was submitted during verification.

## Billing operations hardening on 5 July 2026

This pass was local only. It did not deploy to production.

Build pass 1 fixed refund case creation when no risk flags are present. It also changed the finance summary so recognized revenue uses paid invoices only. Checkout and payment intent mirror events are excluded from gross revenue to avoid duplicate counting.

Audit pass 1 found that refund approval could mark a case as failed after Stripe had already accepted the refund if Firestore, ledger, email or audit logging failed later.

Build pass 2 separates Stripe refund failure from local follow-up warnings. Only a Stripe API failure marks a refund case as failed. If Stripe accepts the refund and local follow-up work fails, the case stays `submitted_to_stripe` and records `postSubmitWarnings`.

Build pass 2 also improves refund and dispute account attribution. Refund metadata now carries the account and Firebase user where available. Refund and dispute webhooks also try to recover account identity from prior ledger rows before falling back to an unknown customer record.

Audit pass 2 results:

- `npm run type-check` passed
- `npm run build` passed with the known Google Sans fallback warning and Node legacy-build warning
- `npm run security:cve` passed with 0 high or critical findings
- signed-out admin billing APIs returned 401 for refunds, summary, ledger and refund approval
- local production `/suite/admin` denied non-admin access cleanly with no runtime errors
- local production home page passed desktop and 390 by 844 mobile browser checks with no runtime errors
- mobile page width matched the viewport width, so the public page did not create horizontal overflow

## Sign-in crash and communications hardening on 5 July 2026

This pass was local only. It did not deploy to production.

The live browser error was `Cannot read properties of undefined (reading 'goals')`. On 5 July 2026, the live home page still served an older production bundle. That bundle mounted the Sona context rail on the public home page and read `memory.goals.targetRoles` without a fallback.

The local build no longer has that path. The public home page disables workspace chrome, and the Sona context rail normalizes missing Career Twin memory before it reads `goals`.

Build pass 1 confirmed that local Career Twin memory now normalizes missing `memory.goals` fields before the dashboard, Sona context rail and Career Intelligence page read them.

Build pass 2 added another defensive normalization inside the phase one command centre, so the component cannot crash if a future caller passes a partial Career Twin object.

The same pass fixed communications risks found during audit:

- Resend `{ error }` responses are now treated as failed sends
- Stripe webhook billing emails now log `sent` or `failed` after the provider response
- billing communication logs can store the provider message id and provider error
- signed-in free users now receive authenticated speed limits, not only lifetime usage caps
- admin email preview and custom email bodies are sanitized before rendering or sending
- study reminder emails must match the signed-in user email
- job digest, study reminder, outcome check and agent digest sends now write to the user communications timeline

Audit pass 2 results:

- `npm run type-check` passed
- `npm run build` passed with the known Google Sans fallback warning and Node legacy-build warning
- local production home page passed the delayed crash check at `http://127.0.0.1:3031/?qa=delayed-crash-local`
- the `Run free Job Match` action updated the URL to `?tool=job-match`, focused the preview input and logged no browser console errors
- `npm run security:cve` passed with 0 high or critical findings
- signed-out admin email, study reminder, jobs notify and Career Twin intelligence APIs returned 401
- malformed Career Twin memory with no `goals` object normalized to safe defaults
- local production home page, `/suite`, `/suite/intelligence` and `/suite/agent/queue` did not show the global error boundary
- local production browser console was clean on the checked routes
- `/suite/intelligence` showed its local empty or unavailable state because the local test account was not seeded, not because of a runtime crash
- 390 by 844 mobile `/suite` did not show the global error boundary
- mobile overflow detection only flagged the intentionally hidden off-canvas sidebar

Production follow-up:

- deploy the current local build to Firebase Hosting project `talent-consulting-acf16`
- verify that `https://talentconsulting.io` no longer serves the older bundle
- verify that `/favicon.ico` returns 200 after deploy

Production recheck on 5 July 2026:

- a clean browser load of `https://talentconsulting.io/?qa=clean-playwright-commit-check` did not show the global error boundary
- the same clean load still rendered the older public home page with the suite sidebar and the `Land the right role with one command center.` headline
- this confirms the local crash fix and UI refresh have not yet reached the live Firebase Hosting build
- the signed-in crash reported in the browser console is consistent with a returning user loading the older bundle against partial Career Twin memory
- local `npm run type-check` passed
- local `npm run build` passed with the known Google Sans fallback and Node legacy-build warnings

Regression gate added on 5 July 2026:

- `npm run test:career-twin` now covers partial signed-in Career Twin memory with no `goals` object
- the test confirms `normalizeCareerTwinMemory`, `normalizeCareerTwinSummary` and `careerTwinPromptMetadata` return safe defaults
- local `npm run test:career-twin` passed with 3 tests
- local `npm run type-check` passed
- local `npm run build` passed with the known Google Sans fallback and Node legacy-build warnings
- local production `/` and `/suite` rendered without the global error boundary
- browser console logs were clean on the checked local routes
- a fresh production browser load of `https://talentconsulting.io/?qa=codex-restored-*` did not show the global error boundary or old `01pa626...` chunk

## Landing page UI loop 3 on 5 July 2026

This pass was local only. It did not deploy to production.

Build pass 1 tightened the public landing hero so the free-tools section is visible sooner on desktop. Audit pass 1 found that 1280 by 720 still only showed a thin strip of the free-tools band.

Build pass 2 reduced only desktop hero weight and spacing. It kept the mobile composition unchanged.

Audit pass 2 results:

- `npm run type-check` passed
- `npm run build` passed with the known Google Sans fallback warning and Node legacy-build warning
- 1280 by 720 local production `/` showed the product preview, primary free-tool action and a visible free-tools section preview
- 1440 by 900 local production `/` showed the product preview, full free-tools band and the next section
- 390 by 844 local production `/` showed the primary action, free-tools band and product preview with no horizontal overflow
- `Run free Job Match` updated the URL to `?tool=job-match`, scrolled to the workbench and focused `dashboard-preview-input`
- browser console logs were clean on the checked desktop and mobile routes
- screenshot evidence was saved for this run at `/tmp/tc-landing-loop3-1280x720-final-v2.png`, `/tmp/tc-landing-loop3-390x844-first-final.png` and `/tmp/tc-landing-loop3-390x844-final-v2.png`

## Suite command centre UI loop on 5 July 2026

This pass was local only. It did not deploy to production.

Build pass 1 replaced the animated profile card and typewriter tool grid with a restrained command centre. The page now uses neutral suite panels, explicit buttons, stable tool cards and review-first actions.

Audit pass 1 found that the quick-action grid and Sona context panel became too narrow at 1280 by 720. It also found that the mobile quick-tools rail touched the dashboard title.

Build pass 2 kept quick actions to 2 columns on desktop, delayed the Sona context split until wider screens and added mobile spacing below the quick-tools rail.

Audit pass 2 results:

- `npm run type-check` passed
- `npm run build` passed with the known Google Sans fallback warning and Node legacy-build warning
- 1280 by 720 local production `/suite` showed the command centre, Sona review panel and tool grid with no global error boundary
- 390 by 844 local production `/suite` had no horizontal overflow and the dashboard title cleared the mobile quick-tools rail
- browser console logs were clean on the checked desktop and mobile routes
- the `Resume proof` command opened `/suite/resume` with no runtime errors
- a read-only audit found no remaining unsafe render-path reads for missing Career Twin `memory.goals`

## Agent Queue review loop on 5 July 2026

This pass was local only. It did not deploy to production.

Build pass 1 tightened the Agent Queue review path. It removed route-level motion, replaced hard-coded status colours with suite tokens and changed the approved packet action from `Open and track` to `Track and open posting`.

The data layer now enforces the review contract. Pending packets cannot be tracked. Already tracked packets cannot create duplicate application records. A tracked queue item now moves to the `applied` queue state, which the UI labels as `Tracked`.

Audit pass 1 found that blocked packets still showed active approve controls. Build pass 2 disabled those controls and showed `Resolve checks first` with the blocking proof area.

Audit pass 2 results:

- `npm run type-check` passed
- `npm run build` passed with the known Google Sans fallback warning and Node legacy-build warning
- static scan found no raw Tailwind status colours or `framer-motion` imports in `app/suite/agent/queue/page.tsx`
- 1440 by 900 local dev demo `/suite/agent/queue` showed Pinnacle AI and Cobalt Systems packets with no console errors
- 390 by 844 local dev demo opened the packet drawer with no horizontal overflow
- blocked packets showed disabled `Resolve checks first` controls with the title `Resolve before approval: Screening answers`
- no path found in this pass submits an application externally without user action

## Applications manual-submit loop on 5 July 2026

This pass was local only. It did not deploy to production.

Build pass 1 made queue-created tracker records read as drafts. The Applications page now uses `Draft`, `Submit manually` and clear copy that tells the user to submit on the job site before they mark the record applied.

Audit pass 1 found 2 remaining risks. Apply Pipeline could create duplicate draft records for the same posting, and status controls did not expose enough state to assistive technology.

Build pass 2 made Apply Pipeline use a deterministic application record for the same posting. A repeat request now returns the existing draft instead of creating another tracker row. The same pass added status menu state, status button pressed state and safer long-text wrapping.

Outcome logging now stays behind the manual-submit gate. The client helper, demo path and `/api/applications/outcome` all reject outcomes for `not_applied` records.

Audit pass 2 results:

- `npm run type-check` passed
- `npm run build` passed with the known Google Sans fallback warning and Node legacy-build warning
- 1440 by 900 local dev demo `/suite/applications?status=not_applied` showed the Pinnacle AI draft with `Submit manually`, no `Not Applied` copy, no console errors and no horizontal overflow
- the desktop draft drawer showed `Draft, not submitted`, `Open posting` and the manual-submit warning
- the desktop draft drawer hid outcome buttons until the record is marked applied
- the drawer used `aria-modal="true"` and status buttons exposed their selected state
- 390 by 844 local dev demo `/suite/applications?status=not_applied&mobileView=followups` opened the follow-up filter, showed the draft state and had no console errors or horizontal overflow
- screenshot evidence was saved at `output/qa/applications-desktop-draft-list-2026-07-05.png` and `output/qa/applications-mobile-draft-drawer-2026-07-05.png`

## Core workflow loop on 5 July 2026

This pass was local only. It did not deploy to production.

Build pass 1 fixed the Job Search and packet preparation handoff. Job Search now says `Prepare packet`, not `Prepare Application`. The tracker only marks a packet applied after the user confirms they submitted on the job site, and only after the tracker update succeeds.

Build pass 1 also aligned follow-up and interview-prep APIs with the UI gates. Follow-up drafts now require an applied record and at least 5 days since applying. Interview prep now requires an interview-stage record.

Audit pass 1 found that server-side resume reads could prefer an old onboarding seed over a newer saved resume. Build pass 2 added a shared latest-resume resolver and connected it to Sona resume tools, job suggestions, the weekly digest, the agent pipeline and `/api/resume/latest`.

Build pass 2 also stopped hollow packets. Apply Pipeline now uses the latest resume source, refuses to create a ready packet with no resume, and can repair an older deterministic draft that was created without a linked resume.

The remaining review-first fixes from this loop were:

- Apply Pipeline and Weekly Picks no longer use one-click apply copy
- Job Search and Weekly Picks write the tracker application id and posting URL into the shared application-kit context
- Resume Studio passes the posting URL into Applications when creating tracker records
- resume-linked tracker creation now reuses an existing record instead of creating a duplicate
- Sona chat queue writes now require an explicit `userConfirmed` flag and reuse an existing pending queue item for the same company and role
- the follow-up draft modal now has a mobile-safe height cap and scroll area
- the Proof Engine `Blocked` stat now counts missing or blocked requirements

Audit pass 2 results:

- `npm run type-check` passed
- `npm run build` passed with the known Google Sans fallback warning and Node legacy-build warning
- static scan found no old `one-click`, `Prepare & Apply`, `Apply Now`, `Open Apply Page` or `Prepare Application` copy in the checked core workflow files
- signed-out `POST /api/agent/follow-up` returned 401
- signed-out `POST /api/agent/interview-prep` returned 401
- 1440 by 900 local dev demo `/suite/job-search` loaded without the global error boundary, console errors or horizontal overflow
- the Job Search saved search loaded roles and the packet tab showed `Prepare packet`
- the packet tab said TalentConsulting does not submit the application
- 390 by 844 local dev demo `/suite/job-search` passed the same packet-tab check with no horizontal overflow
- screenshot evidence was saved at `output/qa/job-search-desktop-review-2026-07-05.png` and `output/qa/job-search-mobile-packet-review-2026-07-05.png`

## Security and reliability loop on 5 July 2026

This pass was local only. It did not deploy to production.

Build pass 1 reviewed the touched workflow against the Next.js and React security guidance. The review focused on auth boundaries, state-changing API routes, risky client sinks, external links, stale resume state and internal queue writes.

Build pass 1 found one small link hardening issue. The Applications posting link used `target="_blank"` without an explicit `noopener`. Build pass 2 added `rel="noopener noreferrer"` to match the Job Search links.

The security review also confirmed the workflow fixes from the core loop:

- protected API routes use `guardApiRoute`
- cron routes require `CRON_SECRET`
- Apply Pipeline, follow-up and interview-prep routes are rate limited
- Sona queue writes require explicit `userConfirmed`
- the touched client files do not use `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function`
- all checked blank-target links now use `noopener` or the `window.open` noopener feature string

Audit pass 2 results:

- `npm run type-check` passed
- `npm run security:cve` passed with 0 high or critical findings
- `npm run build` passed with the known Google Sans fallback warning and Node legacy-build warning
- signed-out `POST /api/agent/follow-up` returned 401
- signed-out `POST /api/agent/interview-prep` returned 401
- targeted source scans found no risky HTML injection sinks in the touched workflow files
- no secret values were printed or copied during the review

## Docs and release readiness loop on 5 July 2026

This pass was local only. It did not deploy to preview or production.

Build pass 1 audited the launch runbook, readiness report and UI checklist. It checked for stale automatic-submit copy, secret values, unsafe production action language and blank acceptance notes.

Audit pass 1 found 2 release-readiness gaps. The top-level decision still made the latest work sound production deployed, and the UI checklist had no recorded result for Resume Studio or the final SEO audit.

Build pass 2 fixed those records and removed a duplicate Resume Studio save modal render. Resume Studio now has one `showSaveModal` render path, which reduces duplicate overlay and focus risk.

Audit pass 2 results:

- `npm run type-check` passed
- `npm run build` passed with the known Google Sans fallback warning and Node legacy-build warning
- `npm run security:cve` passed with 0 high or critical findings
- `npm run seo:audit` passed with 0 critical, 0 high and 42 medium issues
- local Next 16 production server `/suite/resume` passed 1440 by 900 and 390 by 844 browser checks
- Resume Studio had no global error boundary, no console errors and no horizontal overflow in those browser checks
- the duplicate save modal scan now finds one `showSaveModal` render block
- the docs scan found no secret values in the launch runbook, readiness report or UI checklist

## Preview deployment loop on 5 July 2026

Build pass 1 ran the existing Firebase preview path:

- `npm run deploy:preview`
- preview URL: `https://talent-consulting-acf16--preview-7vqfk4zu.web.app`
- expiry: 12 July 2026

The deploy completed successfully. It updated the pinned SSR function and released the preview channel.

Deploy warnings to keep on the release record:

- Firebase Hosting framework support for Next.js is still an early preview
- Firebase says the framework integration is known to work with Next.js 12 to 15, while this app is on Next.js 16.2.6
- local deploy used Node 23.10.0, while the project engine and deployed function target Node 22
- the generated function package warns that its `firebase-functions` dependency is outdated
- the known Google Sans fallback warning still appears during build
- the known Node legacy-build warning still appears during static page generation

Audit pass 1 checked the hosted preview:

- `/` returned 200 with `no-cache, no-store, max-age=0, must-revalidate`
- `/suite/resume` returned 200 with the expected security headers and Stripe-ready CSP
- `/api/billing/prices` returned active Pro and Studio monthly and annual prices
- signed-out `/api/agent/intelligence` returned 401
- desktop hosted `/` showed the refreshed public page with no global error boundary, no console errors and no horizontal overflow
- mobile hosted `/` passed the same checks at 390 by 844

Build pass 2 made no code changes because audit pass 1 found no preview-only blocker.

Audit pass 2 repeated focused preview checks:

- hosted `/suite/resume` passed 1440 by 900 and 390 by 844 browser checks
- Resume Studio had no global error boundary, no console errors and no horizontal overflow on preview
- `/suite/upgrade` returned 200 and included Stripe Checkout and 3D Secure hosts in the CSP
- signed-out `POST /api/stripe/checkout` returned 401, so no checkout session was created without authentication
- `/favicon.ico` returned 200
- `/robots.txt` returned 200
- no live payment, email send, production deploy or external job submission was run

## Firebase static header hardening loop on 5 July 2026

This pass deployed to preview only. It did not deploy to production.

Build pass 1 added Firebase Hosting security headers for static hosted pages. The goal was to make the public root page match the suite security posture, because the previous preview showed CSP on suite pages but not on `/`.

Audit pass 1 results:

- `firebase.json` parsed successfully
- `npm run type-check` passed
- `npm run security:cve` passed with 0 high or critical findings
- `npm run build` passed with the known Google Sans fallback warning and Node legacy-build warning
- Firebase preview deploy completed
- independent audit found one Stripe CSP improvement: add `https://*.js.stripe.com` to `script-src` and `frame-src`

Build pass 2 added the Stripe wildcard origin to both `firebase.json` and `next.config.js`, keeping Firebase Hosting and Next headers aligned.

Audit pass 2 results:

- `firebase.json` parsed successfully
- `npm run type-check` passed
- `npm run security:cve` passed with 0 high or critical findings
- `npm run build` passed with the known Google Sans fallback warning and Node legacy-build warning
- final Firebase preview deploy completed at `https://talent-consulting-acf16--preview-7vqfk4zu.web.app`
- hosted `/` returned 200 with CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and `X-DNS-Prefetch-Control`
- hosted `/` CSP includes `https://js.stripe.com` and `https://*.js.stripe.com` in `script-src` and `frame-src`
- hosted `/suite/upgrade` returned 200 with the same Stripe-compatible CSP
- signed-out `/api/agent/intelligence` returned 401
- signed-out `POST /api/stripe/checkout` returned 401
- desktop and 390 by 844 hosted `/` browser checks had no global error boundary, no console errors and no horizontal overflow

## Public SEO and help content loop on 5 July 2026

This pass deployed to preview only. It did not deploy to production.

Build pass 1 improved the crawlable public HTML for the home page, help page and teams page. The home page now has a public loading snapshot with one H1, answer-first copy and internal links before the authenticated dashboard hydrates. The help page now gives users direct routes into the resume builder, ATS analyzer, interview practice, templates and teams guidance. The teams page now links to the same public tools and no longer uses unsupported numeric claims in its visible value cards.

Audit pass 1 found 2 issues:

- the home page crawlable word count was still close to the threshold
- the teams H1 read as `TalentConsultingfor Teams` in the DOM because the visual line break did not include a text space

Build pass 2 added a little more useful home copy and fixed the teams H1 text.

Audit pass 2 results:

- `npm run type-check` passed
- `npm run security:cve` passed with 0 high or critical findings
- `npm run build` passed with the known Google Sans fallback warning and Node legacy-build warning
- local production `/` returned 257 crawlable words, one H1, 6 internal links, a 55-character title and a 136-character meta description
- local production `/help` returned 301 crawlable words, one H1, 5 internal links, a 50-character title and a 129-character meta description
- local production `/for-teams` returned 332 crawlable words, one H1, 5 internal links, a 39-character title and a 154-character meta description
- local production desktop and 390 by 844 browser checks for `/`, `/help` and `/for-teams` had no global error boundary, no console errors and no horizontal overflow
- Firebase preview deploy completed at `https://talent-consulting-acf16--preview-7vqfk4zu.web.app`
- hosted `/`, `/help`, `/for-teams`, `/suite/resume` and `/suite/upgrade` returned 200 with CSP and Stripe-compatible directives
- hosted `/`, `/help` and `/for-teams` matched the local SEO HTML checks
- signed-out `/api/agent/intelligence` returned 401
- signed-out `POST /api/stripe/checkout` returned 401
- hosted desktop and 390 by 844 browser checks for `/`, `/help`, `/for-teams` and `/suite/resume` had no global error boundary, no console errors and no horizontal overflow

## Public SEO metadata and source context loop on 5 July 2026

This pass deployed to preview only. It did not deploy to production.

Build pass 1 shortened overlong public metadata on blog, templates, resume builder and interview prep pages. It also added visible source-context sections to blog pages, public SEO guides and public tools that contain data-style claims or numeric examples.

Audit pass 1 results:

- `npm run type-check` passed
- `npm run build` passed with the known Google Sans fallback warning and Node legacy-build warning
- targeted local SEO checks passed for blog, selected article, templates, resume builder, interview prep, AI detector, AI humanizer, resume example and resume keyword pages
- all checked pages returned 200
- all checked titles were 20 to 70 characters
- all checked meta descriptions were 70 to 170 characters
- all checked data-style pages had at least one visible external source link
- desktop and 390 by 844 browser checks passed for `/blog`, `/blog/auto-apply-bots-are-ruining-your-job-search`, `/tools/resume-builder`, `/tools/interview-prep` and `/resume-examples/software-engineer`
- those browser checks had no global error boundary, no console errors and no horizontal overflow

Build pass 2 made no code changes because audit pass 1 found no blocker.

Audit pass 2 results:

- `npm run security:cve` passed with 0 high or critical findings
- Firebase preview deploy completed at `https://talent-consulting-acf16--preview-7vqfk4zu.web.app`
- hosted SEO smoke checks passed for `/blog`, selected blog articles, `/templates`, public tools, `/resume-examples/software-engineer` and `/resume-keywords/software-engineering`
- hosted pages had CSP and Stripe-compatible directives
- signed-out `/api/agent/intelligence` returned 401
- signed-out `POST /api/stripe/checkout` returned 401
- hosted desktop and 390 by 844 browser checks passed for representative SEO pages with source context visible, no global error boundary, no console errors and no horizontal overflow

## SEO follow-up work

The production SEO audit still reports 42 medium issues because this SEO content pass is only on preview.

The preview passes address these production audit items for the next production promotion:

- thin content on the home page and help page
- weak meta descriptions on the home, help and teams pages
- weak internal links on the home, help and teams pages
- missing home page H1 in the rendered audit output
- title and description length warnings on selected blog, templates and tool pages
- source citation warnings on public pages that contain data-style claims

The remaining medium SEO work should be remeasured after production promotion. Any remaining items are growth and quality issues, not launch blockers.

## Remaining risks

- Firebase Hosting framework support warns that Next.js support is preview and documented for Next 12 to 15. The app currently deploys on Next 16.
- The generated SSR function package is large, about 1.27 GB to 1.30 GB. Reduce this before the next hardening pass.
- App routes now prioritize freshness over static asset performance with no-store Firebase cache headers. Reintroduce immutable caching for hashed assets after confirming it does not reintroduce stale app-shell errors.
- The browser extension remains outside launch scope until its separate privacy and no-submit gates pass.

## Assets

- Generated no-text raster asset: `public/brand/career-command-center-v1.png`.
- Code-rendered Open Graph source: `public/brand/brand-og-v2.svg`.
- Open Graph PNG export: `public/brand/brand-og-v2.png`.
- Regeneration command: `npm run brand:og`.

## Release controls

Keep these controls in place:

- Firebase token required for protected APIs.
- Demo mode disabled unless `NEXT_PUBLIC_DISABLE_AUTH_GATE=true`.
- Stripe live charges require explicit human approval.
- Sona can prepare work for review, but must not submit external job applications without user action.
