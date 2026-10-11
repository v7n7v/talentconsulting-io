# TalentConsulting.io

TalentConsulting.io is a mobile-first AI career workspace. Taco uses a job seeker's real resume, goals and saved career evidence to find stronger-fit roles, explain the match, prepare truthful application packets and keep every external action under the user's control.

The product is not a blind auto-apply service. It helps users choose better roles, prepare stronger work and review each next step.

## Company direction

Mission: help job seekers make better career moves with less wasted effort.

Vision: become the trusted career operating system for serious job seekers.

Current objective: turn resume upload into a complete activation flow. Within 10 minutes, a user should receive at least 3 explainable job matches and open one review-ready application packet.

See [`PRODUCT.md`](./PRODUCT.md), [`docs/company-parity-goal.md`](./docs/company-parity-goal.md) and [`docs/revenue-generation-strategy.md`](./docs/revenue-generation-strategy.md) for the product strategy and measures.

Firebase authentication release checks and console prerequisites are documented in [`docs/firebase-auth-runbook.md`](./docs/firebase-auth-runbook.md).

## Core workflow

1. Upload or build a resume.
2. Tell Taco the target role, salary, location and work mode.
3. Review ranked job picks with fit reasons, source notes and risks.
4. Ask Taco to prepare a truthful application packet.
5. Review the resume, cover letter, screening notes and proof checks.
6. Apply manually, track the outcome and improve future recommendations.

## Product areas

- Ask Taco: career context, job scouting, packet preparation and next actions
- Resume Studio: resume import, editing, truth-locked morphing, templates and export
- ATS Analyzer: parser checks, keyword fit and job-specific evidence
- Job Search Workbench: safe-source search, recommendation scoring and packet entry
- Applications Command Center: pipeline, follow-ups, outcomes and offer context
- Agent Queue: review-first application packets and approval controls
- Interview Studio: quick drills, mock interviews, whiteboard practice and debriefs
- Story Bank: truthful STAR stories linked to interview questions
- Writing Toolkit: cover letters, recruiter replies, LinkedIn copy and writing polish
- Career Intelligence: Career Twin memory, goals, proof and active-search signals

## Technology

| Area | Implementation |
| --- | --- |
| Web application | Next.js App Router, React and TypeScript |
| Styling | Tailwind CSS and CSS custom properties |
| Authentication and data | Firebase Auth, Firestore and Firebase Admin |
| Billing | Stripe Embedded Checkout, webhooks and customer portal |
| AI | Vercel AI SDK, Google Gemini, Groq and provider routing |
| Documents | PDF parsing, React PDF, DOCX generation and Mammoth |
| Email | Resend |
| Rate limiting | Upstash Redis |
| Browser verification | Playwright CLI |

## Local setup

Requirements:

- Node.js 22
- npm 9 or later
- a populated `.env.local`

Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Use [`env.example`](./env.example) as the variable checklist. Never commit `.env.local` or print secret values in logs.

Important environment groups:

- Firebase client and admin credentials
- AI provider keys
- Stripe publishable, secret, webhook and price identifiers
- Resend email configuration
- Turnstile and Upstash configuration
- Ever Jobs service URL, API key and safe-source controls
- cron authentication

## Quality commands

```bash
npm run type-check
npm run test:assistant-harness
npm run test:career-twin
npm run seo:audit:ci
npm run security:cve:ci
npm run build
```

Use `git diff --check` before a release.

Substantial UI changes also require browser checks at 320px, 390px, 430px, 768px, 1024px and 1440px. Check the core result state, console errors and horizontal overflow.

## Product safety

- Preserve schools, degrees, certifications, employers, job titles, dates, locations and contact details from the source resume.
- Do not invent experience, skills, credentials or quantified achievements.
- Treat ATS, salary, detector and fit scores as indicators, not proof.
- Show source confidence, missing evidence and risk notes where relevant.
- Require user review before any external application, message or notification.
- Use explicit consent for email and text alerts.
- Keep restricted-source scraping and blind auto-apply out of the default product.

## Mobile standard

Mobile is a complete product surface. The resume-to-job-to-packet flow must work at 320px without horizontal overflow, hidden actions or desktop side rails squeezed into the reading column.

Interactive controls should use at least a 44px touch target. Mobile inputs should use at least 16px text. Sticky workflow actions must respect safe areas and must not cover content.

## Release and operations

The repository supports Firebase and Cloud Run deployment paths. Review these documents before deploying:

- [`docs/launch-readiness-runbook.md`](./docs/launch-readiness-runbook.md)
- [`docs/launch-readiness-report.md`](./docs/launch-readiness-report.md)
- [`docs/ui-ux-launch-checklist.md`](./docs/ui-ux-launch-checklist.md)

Common commands:

```bash
npm run deploy:preview
npm run deploy
npm run deploy:cloudrun
```

Do not deploy from an unreviewed dirty working tree. Confirm production environment variables, Stripe checkout, webhook delivery, billing portal access and one authenticated Taco workflow before release.
