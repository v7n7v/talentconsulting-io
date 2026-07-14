# UI and UX launch checklist

Use this checklist for product surfaces, public tools and launch-critical documentation.

## Product surface

- [ ] The first screen gives the user a useful task or decision.
- [ ] Navigation is compact and grouped around the career workflow.
- [ ] Page headers use the shared suite pattern where it applies.
- [ ] Primary actions are clear, visible and reachable by keyboard.
- [ ] Secondary actions do not compete with the primary task.
- [ ] Empty states tell the user what to do next.
- [ ] Loading states reserve space and do not shift surrounding content.
- [ ] Error states explain what happened and how to recover.

## Layout and wrapping

- [ ] No route has horizontal overflow at mobile width.
- [ ] Long job titles, company names and file names wrap or truncate intentionally.
- [ ] Generated prose uses natural wrapping, not mid-word breaks.
- [ ] Numeric stats do not stack, clip or overlap icons.
- [ ] Cards are used for repeated items, modals, selected records or tool surfaces.
- [ ] No section is wrapped in a card only for decoration.
- [ ] There are no decorative orbs, noisy gradients or generic AI dashboard patterns.

## Accessibility

- [ ] Interactive elements can be reached and used with a keyboard.
- [ ] Focus states are visible in light and dark mode.
- [ ] Inputs have labels or accessible names.
- [ ] Icon-only buttons have accessible names.
- [ ] Status does not rely on color alone.
- [ ] Long-running work uses useful progress text.
- [ ] Motion is purposeful and respects reduced-motion settings.

## Brand and metadata

- [ ] The app uses the current TalentConsulting mark and wordmark.
- [ ] Favicon, Apple icon and manifest icons point to `public/brand/` assets.
- [ ] Open Graph and Twitter images use `public/brand/brand-og-v2.png`.
- [ ] The wordmark has no clipped text at small sizes.
- [ ] The brand source SVGs do not use negative letter spacing.
- [ ] If brand sources changed, `npm run brand:og` has regenerated the matching PNG export.

## Documentation

- [ ] Launch notes do not include secret values.
- [ ] Setup guidance uses placeholder values instead of real keys.
- [ ] Commands are non-destructive unless the launch owner approved them.
- [ ] Known risks have an owner and a decision.
- [ ] User-facing prose is clear, specific and in sentence case.

## Browser checks

Record the checked routes:

| Route | Desktop | Mobile | Notes |
| --- | --- | --- | --- |
| `/` | Pass | Pass | 5 July 2026 local production and Firebase preview checks. The hydrated page passed desktop and 390 by 844 checks with no global error boundary, no console errors and no horizontal overflow. The crawlable HTML now has one H1, 257 words, 6 internal links and metadata in range. |
| `/help` | Pass | Pass | 5 July 2026 local production and Firebase preview checks. The page has one H1, 301 crawlable words, 5 internal links, metadata in range, no console errors and no horizontal overflow at 1440 by 900 and 390 by 844. |
| `/for-teams` | Pass | Pass | 5 July 2026 local production and Firebase preview checks. The page has one H1 reading `TalentConsulting for Teams`, 332 crawlable words, 5 internal links, metadata in range, no console errors and no horizontal overflow at 1440 by 900 and 390 by 844. |
| `/blog` | Pass | Pass | 5 July 2026 local production and Firebase preview checks. Metadata is in range, source context is visible, there is one H1, no console errors and no horizontal overflow at 1440 by 900 and 390 by 844. |
| `/blog/auto-apply-bots-are-ruining-your-job-search` | Pass | Pass | 5 July 2026 local production and Firebase preview checks. Title and description are in range, source context is visible, and desktop and mobile checks had no console errors or horizontal overflow. |
| `/tools/resume-builder` | Pass | Pass | 5 July 2026 local production and Firebase preview checks. Title and description are in range, source context is visible, and desktop and mobile checks had no console errors or horizontal overflow. |
| `/tools/interview-prep` | Pass | Pass | 5 July 2026 local production and Firebase preview checks. Title and description are in range, source context is visible, and desktop and mobile checks had no console errors or horizontal overflow. |
| `/resume-examples/software-engineer` | Pass | Pass | 5 July 2026 local production and Firebase preview checks. Source context is visible, title and description are in range, and desktop and mobile checks had no console errors or horizontal overflow. |
| `/suite` | Pass | Pass | 5 July 2026 local production check. Career Twin and suite shell rendered without the global error boundary or console errors. Second UI loop checked 1280 by 720 and 390 by 844. The command centre had no horizontal overflow, no console errors and the `Resume proof` action opened `/suite/resume`. |
| `/suite/agent/queue` | Pass | Pass | 5 July 2026 local checks. Production build passed. Dev demo QA showed queue packets, blocked approval controls, no old `Open and track` copy, no console errors and no horizontal overflow at 1440 by 900 and 390 by 844. |
| `/suite/applications` | Pass | Pass | 5 July 2026 local checks. Draft records now say `Draft`, not `Not Applied`. The page tells users to submit manually before marking applied. Outcome buttons stay hidden for drafts. Desktop 1440 by 900 and mobile 390 by 844 had no console errors or horizontal overflow. |
| `/suite/job-search` | Pass | Pass | 5 July 2026 local checks. Saved search loaded roles, the packet tab said `Prepare packet`, and copy says TalentConsulting does not submit the application. Old `Apply Now`, `Open Apply Page` and `Prepare Application` copy was absent. Desktop and 390 by 844 mobile had no console errors or horizontal overflow. |
| `/tools/ai-humanizer` |  |  |  |
| `/tools/ats-analyzer` |  |  |  |
| `/suite/resume` | Pass | Pass | 5 July 2026 local and Firebase preview checks at 1440 by 900 and 390 by 844. Resume Studio showed no global error boundary, no console errors and no horizontal overflow after the duplicate save modal render was removed. |

Record the commands:

| Command | Result | Notes |
| --- | --- | --- |
| `npm run test:career-twin` | Pass | 5 July 2026. Covers partial signed-in Career Twin memory with missing `goals`. |
| `npm run type-check` | Pass | 5 July 2026 public SEO loop pass. |
| `npm run seo:audit` | Pass with follow-up work | 5 July 2026 production run. 0 critical, 0 high and 42 medium issues remain on production until preview work is promoted. |
| `npm run security:cve` | Pass | 5 July 2026 public SEO metadata and source context loop. 0 high or critical findings. |
| `npm run build` | Pass | 5 July 2026 public SEO metadata and source context loop. Known warnings: Google Sans fallback values and Node legacy-build warning. |
| `npm run deploy:preview` | Pass | 5 July 2026. Firebase preview deployed to `https://talent-consulting-acf16--preview-7vqfk4zu.web.app`, expiring on 12 July 2026 at 14:59:40. Final pass confirmed Firebase Hosting CSP and Stripe wildcard CSP on public SEO and suite pages. |
