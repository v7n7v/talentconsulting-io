# Launch readiness runbook

Use this runbook before a public launch, preview launch or stakeholder review.

The aim is to confirm that TalentConsulting is ready to show real users without exposing secrets, breaking payments, sending external email or shipping obvious UI defects.

## Scope

This runbook covers:

- product UI and public UI checks
- brand assets and metadata
- content and documentation checks
- local verification commands
- launch handoff notes

This runbook does not approve changes to:

- authentication logic
- Firebase or Firestore rules
- Stripe routes or webhook handling
- security middleware
- production deployment settings

Document findings in the launch notes if you see a risk in those areas. Do not patch them during a UI and documentation pass.

## Before you start

1. Run `git status --short`.
2. Check whether other agents have changed files in the same area.
3. Read `DESIGN.md` and `UI_DESIGN_GUIDE.md`.
4. Inspect `components/BrandLogo.tsx`, `public/brand/`, `public/site.webmanifest` and `app/layout.tsx`.
5. Do not open `.env`, `.env.local`, `.env.production`, service account files or private key files unless the task explicitly requires secret handling.

## Secret handling

Keep secrets out of chat, screenshots, logs and documentation.

Use these rules:

- refer to environment variables by name only
- use placeholder values such as `replace-with-value`
- do not paste Firebase service account JSON into issues, pull requests or reports
- do not paste Stripe, Firebase, Gemini, Groq, Resend or Adzuna keys into reports
- redact account identifiers if they are not needed for the decision
- remove screenshots that show private dashboards, billing records or user data

If a command prints a secret, stop and replace the output with a short note that the command was not safe to share.

## Local verification

Use non-destructive checks first:

```bash
npm run type-check
npm run seo:audit
```

Use `npm run build` only when the change affects routing, metadata, shared layout or a broad UI surface.

Do not run:

- production deploy commands
- real Stripe payment flows
- external email sends
- jobs that write production data
- cron endpoints against production services

## UI and UX checks

Check changed routes at desktop and mobile widths.

Confirm that:

- the first screen is useful and not a marketing placeholder
- text wraps naturally and does not stack word by word
- chips, file names, URLs and long job titles do not create horizontal overflow
- controls have clear labels or accessible names
- focus states are visible in light and dark mode
- loading, empty, result and error states are present where the workflow needs them
- numbers use enough fixed space and do not overlap icons
- tool panels do not put cards inside cards without a clear interaction reason
- Sona and status elements use text as well as color

Known unauthenticated API noise can be noted. App runtime errors, broken layout and inaccessible controls must be fixed before launch.

## Brand and metadata checks

Current brand assets live in `public/brand/`.

Required assets:

| Asset | Required size or type | Used by |
| --- | --- | --- |
| `brand-icon.svg` | scalable square mark | source icon |
| `brand-icon-180.png` | 180 by 180 PNG | Apple icon |
| `brand-icon-192.png` | 192 by 192 PNG | web app manifest |
| `brand-icon-512.png` | 512 by 512 PNG | web app manifest |
| `brand-wordmark.svg` | scalable wordmark | structured data and UI reference |
| `career-command-center-v1.png` | 1728 by 910 PNG | no-text generated background for public and Open Graph art |
| `brand-og-v2.svg` | 1200 by 630 SVG source | Open Graph source with exact code-rendered brand text |
| `brand-og-v2.png` | 1200 by 630 PNG | Open Graph and Twitter cards |
| `brand-og.svg` | 1200 by 630 SVG source | previous Open Graph source |
| `brand-og.png` | 1200 by 630 PNG | previous Open Graph and Twitter card |

If the SVG source changes, regenerate the matching PNG before launch.

Raster export specification:

- run `npm run brand:og`
- use 1200 by 630 pixels
- use PNG with RGBA color
- keep the same safe area, background and text
- verify the wordmark is not clipped at either edge
- keep generated raster art free of text, logos, numerals and watermarks

If raster generation is unavailable, record this as a launch blocker or handoff item.

## Release decision

Before launch, record:

- the commit or branch under review
- verification commands and results
- routes checked in the browser
- known risks and owner
- any assets that still need regeneration

Use a clear decision:

- go: ready for launch
- hold: launch should wait for named fixes
- go with risk: launch can proceed if the owner accepts the named risk
