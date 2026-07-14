# Talent Consulting Product Strategy Plan

## Core Positioning

Talent Consulting is a candidate-side AI career intelligence platform, not an employer hiring or candidate-screening tool.

Primary promise:

> Your AI career operator. Tailor every application, track every opportunity, and prepare for every interview from one intelligent workspace.

The product should feel like a career command center, not a loose collection of tools.

## Active Goal

Build Talent Consulting into a Silicon Valley-level AI career operator.

The first product goal is the UI/UX upgrade. It gives the rest of the product a clear command center, consistent navigation, a persistent Sona context layer, and a review-first application workflow.

The product should default to review-first automation. Sona can prepare work, but the user approves each application packet before any external action.

## What Talent Consulting Includes

- Resume upload, parsing, and JD-specific morphing
- ATS and job description match scoring
- Fact-locked resume humanization
- Cover letters and LinkedIn optimization
- Job search, saved jobs, and application tracking
- Weekly job alerts and curated opportunity recommendations
- Interview prep, story bank, and salary negotiation support
- Sona as the user-facing AI career agent

## What Talent Consulting Should Avoid

- Employer-side hiring decisions
- Candidate ranking for employers
- Automated employment decision tooling
- Interview scoring for hiring managers
- Brand positioning around "bypass AI detection"

This keeps the product focused on job seeker outcomes and reduces regulatory risk.

## AI Humanizer Role

The AI humanizer should be positioned as a resume and career-writing trust layer.

Use cases:

- Make morphed resume bullets sound natural and human-written
- Humanize cover letters and LinkedIn sections
- Preserve facts, skills, titles, dates, and metrics
- Prevent generic AI-sounding language

Free traffic generator:

- Offer a free 300-word AI Resume Humanizer
- Position it as "Make AI-assisted resume writing sound natural, personal, and recruiter-ready"
- Use the result page to invite users into the full resume workflow

Avoid framing it primarily as an AI-detection bypass tool.

## MVP Wedge

Launch around one focused workflow:

1. Upload resume
2. Set target roles and job preferences
3. Get matched jobs
4. Tailor resume and cover letter to a selected job
5. Humanize and fact-check the output
6. Save the application
7. Track outcomes and follow-ups
8. Prepare for interviews from the saved application

The user should feel like Talent Consulting is helping run the job search with them.

## UI/UX Upgrade

The UI/UX upgrade is now the product foundation. Talent Consulting should feel like Linear, Google AI Studio, and Stripe Dashboard adapted for career work: calm, dense, fast, and trustworthy.

The upgrade should include:

- a dashboard that becomes the first screen and daily command center
- a compact sidebar grouped around the user's workflow
- a persistent Sona panel with context, next actions, and evidence
- application packets as the signature review workflow
- visible proof for AI output, including facts preserved, risks, and missing requirements
- a command palette for high-frequency actions
- designed empty, loading, result, and error states across suite pages
- a mobile review flow for quick approvals, follow-ups, and saved jobs
- consistent design tokens, spacing, typography, and icon use

This phase is complete only after 2 build and audit loops. Each audit must include desktop and mobile browser checks, console review, type-checking, and a UX review against `DESIGN.md`.

## Billion-Dollar Product Additions

### 1. Career Twin

A persistent profile that learns the user's resume, skills, goals, applications, interview history, salary expectations, writing style, and gaps.

Use it as the intelligence layer behind every feature.

Suggested language:

- Powered by your Career Twin
- Your career memory
- Your private job-search brain

### 2. Application Autopilot

A review-and-approve workflow that:

- Finds jobs
- Scores fit
- Explains why each role is worth applying to
- Prepares a tailored resume
- Prepares a cover letter
- Drafts recruiter messages
- Queues applications for user approval
- Tracks outcomes

This should become the flagship "wow" feature.

### 3. Proof Engine

For every resume morph, show evidence:

- Keywords matched
- Missing requirements
- Claims preserved
- No invented experience
- ATS-safe formatting
- Before/after bullet quality

Suggested language:

- Fact-Locked Resume Intelligence
- Proof Engine
- No invented credentials
- Recruiter-ready, not AI-spammy

### 4. Outcome Learning

Track what happens after each application:

- No response
- Rejected
- Recruiter screen
- Interview
- Offer

Use outcomes to improve recommendations, resume strategy, and application targeting over time.

This is the strongest potential data moat.

### 5. Company Dossier

For any job or company, generate:

- Company summary
- Role risk
- Salary range
- Interview themes
- Recruiter talking points
- Red flags
- Likely screening questions
- Resume angle to emphasize

### 6. Sona Daily Brief

A daily or weekly brief that tells the user:

- Best jobs to apply to today
- Stale applications to follow up on
- Resume gaps to fix
- Interview prep to complete
- One best next move

This creates retention and makes the product feel proactive.

### 7. Trust Layer

Trust language should be visible throughout the product:

- We never invent credentials
- Your resume stays yours
- Fact-locked rewriting
- No fake experience
- Recruiter-ready, not AI-spammy
- Private by default

### 8. Chrome Extension

Future extension capabilities:

- Save jobs from LinkedIn, Indeed, Greenhouse, Lever, and Workday
- Pull job descriptions into Resume Morph
- Autofill application fields
- Generate recruiter messages
- Track applications from the browser

The extension can make Talent Consulting part of the user's daily job-search workflow.

## Product Naming System

Keep the feature names cohesive:

- Career Twin
- Resume Morph
- Opportunity Radar
- Application Autopilot
- Story Bank
- Sona Agent
- Proof Engine
- Company Dossier
- Daily Brief

Avoid selling the product as "22+ tools." Sell it as one connected career operating system.

## Monetization

Current pricing direction is plausible:

- Free: limited usage, 300-word humanizer, small number of resume morphs/interview sessions
- Pro: core career tools, higher or unlimited limits
- Max: Sona Agent, proactive briefs, Application Autopilot, larger humanizer limits, priority processing

Before launch, reconcile all Stripe, webhook, and email pricing so the displayed plans, actual subscriptions, and confirmation emails match.

## Build Priorities

### Phase 0: Competitive intelligence

- Create a source-backed competitor brief for the top 20 products
- Compare pricing, tools, UX patterns, GitHub projects, and public user signals
- Turn the research into product gaps and build decisions
- Use `docs/competitive-intelligence.md` as the source of truth for competitor-backed product decisions

### Phase 1: UI/UX upgrade

- Make the dashboard the command center
- Clean up sidebar, suite navigation, and page hierarchy
- Make Sona a persistent right-side context panel
- Add application packets and review queue patterns
- Add proof, risk, and facts-preserved panels to AI output
- Standardise empty, loading, result, and error states
- Verify desktop, tablet, and mobile flows

### Phase 2: Career Twin

- Persist user profile, target roles, confirmed skills, applications, stories, and preferences
- Use Career Twin to personalize dashboard, job matches, resume work, and Sona

### Phase 3: Proof Engine

- Show JD match, missing requirements, preserved facts, and no-invention checks
- Explain before and after changes for resume, cover letter, and recruiter message output
- Make trust visible in every AI workflow

### Phase 4: Application Workspace

- Build a Kanban-style tracker for saved jobs and applications
- Add company dossier, recruiter notes, follow-ups, and outcome logging
- Connect saved applications to interview prep and Sona briefs

### Phase 5: Review Queue

- Queue prepared applications for user review
- Generate tailored resume, cover letter, recruiter message, and screening answers per job
- Require user approval before any external application action

### Phase 6: Interview System

- Build story bank, mock interview, role questions, salary negotiation, and debrief workflows
- Tie interview prep to each saved role and company dossier

### Phase 7: Monetization and readiness

- Reconcile Stripe pricing, checkout, portal, webhooks, usage gates, and email copy
- Add onboarding, analytics, security, observability, and support readiness

### Phase 8: Browser extension plan

- Plan save-job and autofill flows for LinkedIn, Indeed, Greenhouse, Lever, and Workday
- Ship the extension only after the review-first trust layer is stable
- Use `docs/browser-extension-plan.md` as the source of truth for extension scope, permissions, data boundaries, no-submit tests, and launch gates

## Build and audit loop

Each phase must run 2 loops:

1. Build pass 1.
2. Audit pass 1: type-check, build, browser screenshots, accessibility, UX review, and security review.
3. Build pass 2.
4. Audit pass 2: confirm fixes, mobile and desktop behavior, and no regressions.

## Key Metrics

- Resume uploads
- First morph completion
- Humanizer completions
- Jobs saved
- Applications tracked
- Weekly active users
- Free-to-paid conversion
- Checkout start to subscription conversion
- Application outcomes logged
- Interview invite rate per active user

## Strategic Verdict

Talent Consulting is feasible if it stays focused on candidate-side career outcomes.

The strongest product is not a generic AI tools suite. It is an AI career operator that helps users choose better jobs, tailor better applications, prepare better interviews, and learn from every outcome.
