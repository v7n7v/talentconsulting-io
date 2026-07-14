# Browser Extension Plan

Prepared on 4 July 2026.

This plan covers Phase 8 of the Talent Consulting product goal.

## Decision

Build a Chrome Manifest V3 extension after the review-first trust layer is stable.

The extension should have one clear purpose:

> Save jobs from supported job boards and prepare review-first application packets in Talent Consulting.

It should not be positioned as an auto-apply bot. It should not submit applications for the user.

## Why This Matters

Competitors such as Simplify, Huntr, Oaki, JobCopilot, LoopCV, LazyApply, and AIApply prove that browser-assisted applying is a real user need. Talent Consulting should take the useful part of that workflow:

- save the job without copy and paste
- extract the job description
- prepare a tailored packet
- help the user fill common fields
- track the application

The product advantage should be trust. Sona prepares the work, shows proof, and asks for approval before anything leaves the product.

## Source Rules

The extension plan follows current Chrome guidance:

- Chrome extensions should declare needed permissions in the manifest. Chrome recommends optional permissions where the product can ask at runtime instead of install time. See [Chrome permission guidance](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions).
- Manifest V3 uses service workers and does not allow remotely hosted extension code. See [Chrome Manifest V3 guidance](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3).
- Content scripts can read and change page DOM, but run in isolated worlds and must message other extension parts for APIs they cannot access directly. See [Chrome content scripts guidance](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
- Use `chrome.storage`, not page `localStorage`, for extension state. See [Chrome storage API guidance](https://developer.chrome.com/docs/extensions/reference/api/storage).
- Chrome Web Store policy requires a clear privacy policy, limited data use, consent for user data handling, and data collection only for the disclosed single purpose. See [Chrome Web Store policies](https://developer.chrome.com/docs/webstore/program-policies/policies).

## Board Safety Rules

Every supported board needs a policy and reliability review before release.

Rules:

- do not bypass login, CAPTCHA, paywalls, rate limits, or anti-abuse controls
- do not scrape search result pages in the background
- do not mass-save jobs without user activation
- do not send messages to recruiters from the extension
- do not click apply, next, continue, submit, or confirmation buttons
- do not alter an application after the user has submitted it
- stop if the page shows fraud, identity verification, background-check, payment, or tax forms
- keep each parser specific to a host and page type

If a board changes markup or policy, the parser should fail closed and show `Could not read this page`.

## V1 Scope

V1 is a job clipper and packet launcher.

User flow:

1. User opens a job on a supported board.
2. User clicks the Talent Consulting extension.
3. The extension reads the visible job title, company, location, URL, salary if visible, and job description.
4. The extension shows a small review screen with the extracted data and confidence.
5. User clicks `Save job`.
6. Talent Consulting saves the job, runs Market Oracle, and creates a draft Application Workspace record.
7. User can open the packet in Talent Consulting for resume morph, cover letter, recruiter message, screening notes, and approval.

V1 must not:

- submit an application
- click external apply buttons
- answer application questions automatically
- scrape pages unless the user activates the extension on a supported job page
- store resume content inside the extension
- read unrelated browsing history

## Supported Sites

| Site | V1 behavior | Notes |
|---|---|---|
| LinkedIn | Save visible job details and launch packet preparation | Use user activation only. Do not automate Easy Apply in V1. |
| Indeed | Save job details and launch packet preparation | Extract only visible job information. Do not submit or mass-save jobs. |
| Greenhouse | Save structured job page data and launch packet preparation | Good first target because pages are usually simpler and public. |
| Lever | Save structured job page data and launch packet preparation | Good first target because URL and page structure are predictable. |
| Workday | Save visible job data, then show a manual checklist | Workday flows vary heavily. Treat autofill as a later research item. |

## V1.5 Scope

V1.5 can add manual-paste assistance.

User flow:

1. User opens the saved application packet.
2. Talent Consulting prepares approved field suggestions.
3. The extension detects visible form labels.
4. The extension offers copy buttons or one-field-at-a-time fill.
5. The user reviews every field.

V1.5 should support:

- name, email, phone, city, state, country
- LinkedIn URL, portfolio URL, GitHub URL
- work authorization answers where already saved by the user
- resume upload handoff from the browser download folder only after user chooses a file
- cover letter paste after explicit user confirmation

V1.5 should avoid:

- demographic, disability, veteran, race, gender, or EEO answers
- salary expectations unless the user explicitly saved a value for that application
- free-text screening answers without showing proof, missing context, and risk notes
- hidden fields
- fields inside payment, identity, or background-check flows

## V2 Scope

V2 can add guarded autofill for common application fields.

Rules:

- autofill only after the user opens the packet and clicks `Fill reviewed fields`
- show every detected field, source value, confidence, and risk before filling
- never click `Submit`, `Apply`, `Continue`, `Next`, or equivalent external action buttons
- log what was filled in the Application Workspace audit trail
- stop when a field is ambiguous, sensitive, hidden, or unsupported

## Product UX

The extension popup should be quiet and task-focused.

States:

- `Not a supported job page`
- `Reading job`
- `Review captured job`
- `Saved to Talent Consulting`
- `Packet preparing`
- `Ready for review`
- `Needs sign-in`
- `Permission needed`
- `Could not read this page`

Primary actions:

- `Save job`
- `Prepare packet`
- `Open review queue`
- `Open application`
- `Copy approved answer`
- `Fill reviewed field`

The popup must show:

- extracted company, title, location, URL, and source board
- parse confidence
- what will be sent to Talent Consulting
- a privacy note that the extension only reads the active supported page after the user opens it
- a link to Settings for permissions and account status

Accessibility requirements:

- keyboard navigation for every popup action
- visible focus states
- labels for icon-only controls
- no text smaller than 12px in the popup
- no status conveyed only by color
- unsupported-page and error states must be readable at 320px width

## Architecture

Use Manifest V3.

Extension parts:

- `manifest.json`: declares action, service worker, storage, scripting, active tab, and optional host permissions
- service worker: handles auth, messages, network calls, queue state, and audit events
- content scripts: read visible job data and form labels on supported hosts
- popup UI: shows capture, review, and status states
- options page: account connection, permission controls, privacy text, and diagnostics

Recommended permissions:

- `activeTab`
- `scripting`
- `storage`
- optional host permissions for the supported job boards

Avoid in V1:

- `<all_urls>`
- `webRequest`
- background scraping
- remote code loading
- broad clipboard access

## Data Boundaries

The extension can send:

- current page URL
- source board
- job title
- company
- location
- salary text if visible
- job description text
- visible application question labels
- parse confidence and parser version

The extension must not send:

- unrelated page text
- browsing history
- passwords
- cookies
- page analytics identifiers unless already part of the URL
- sensitive demographic answers
- hidden form values
- resume text stored locally in the extension

The app should store the job and packet. The extension should store only:

- short-lived account/session state
- user permission choices
- most recent capture status
- parser diagnostics needed for support

## API Contract To Build

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/extension/session` | `POST` | Pair the extension with a signed-in Talent Consulting account |
| `/api/extension/status` | `GET` | Return account tier, feature flags, and supported boards |
| `/api/extension/jobs/capture` | `POST` | Save the reviewed job capture into Application Workspace |
| `/api/extension/packets/prepare` | `POST` | Start a review-first packet for a captured job |
| `/api/extension/audit` | `POST` | Log permission grants, captures, fills, blocked fields, and errors |

All endpoints should require authentication, rate limiting, schema validation, and server-side domain allowlisting.

## Auth Model

Use account pairing, not copied API keys.

Recommended flow:

1. User clicks `Connect account` in the extension.
2. The extension opens Talent Consulting in a browser tab.
3. The web app confirms the signed-in user.
4. The server creates a short-lived extension pairing token.
5. The extension exchanges the pairing token for an extension session.
6. The extension stores only the session metadata and expiry in `chrome.storage`.

Requirements:

- extension sessions must be revocable from Settings
- tokens must expire
- tokens must be scoped to extension endpoints
- extension requests must include extension version and parser version
- account deletion must revoke extension sessions
- sign-out in the extension must clear `chrome.storage`

## Capture Payload

```json
{
  "source": "linkedin",
  "url": "https://www.linkedin.com/jobs/view/example",
  "title": "Founding AI Product Engineer",
  "company": "Example Labs",
  "location": "San Francisco, CA",
  "salaryText": "$160k-$220k",
  "descriptionText": "Visible job description text",
  "questionLabels": ["Work authorization", "Portfolio URL"],
  "parserVersion": "linkedin.v1",
  "confidence": 0.86
}
```

## Parser Contract

Each board parser should return the same shape:

```json
{
  "source": "greenhouse",
  "pageType": "job",
  "url": "https://boards.greenhouse.io/example/jobs/123",
  "fields": {
    "title": { "value": "Product Engineer", "confidence": 0.94 },
    "company": { "value": "Example Labs", "confidence": 0.91 },
    "location": { "value": "Remote", "confidence": 0.8 },
    "descriptionText": { "value": "Visible job text", "confidence": 0.88 }
  },
  "warnings": ["salary_not_visible"],
  "blocked": []
}
```

Parser rules:

- return confidence per field
- return warnings for missing optional fields
- return blocked reasons for unsupported, hidden, sensitive, or ambiguous fields
- never infer company, location, salary, or requirements from unrelated page text
- include a parser version in every capture

## Test Fixtures

Keep local HTML fixtures for each supported board.

Required fixtures:

- happy-path job page
- missing salary
- remote or hybrid location
- login wall
- expired job
- sponsored or recommended job card, not a real job page
- application form with common fields
- application form with sensitive fields
- markup drift fixture copied from a real changed page

Fixtures should be scrubbed of personal data and checked into the extension test package.

## Review-First Invariants

These rules must be enforced in product copy, code, and tests:

- the extension saves jobs, not applications
- Sona prepares packets, not submissions
- the user approves every artifact before use
- the extension can fill only reviewed fields
- the extension never clicks final external actions
- every filled field has a source value and audit log entry
- unsupported or sensitive fields are skipped with a visible reason

## No-Submit Test Matrix

Automated tests must prove the extension cannot submit.

| Scenario | Expected behavior |
|---|---|
| page has `Submit application` button | extension does not click it |
| page has `Apply`, `Next`, or `Continue` button | extension does not click it |
| user asks Sona to auto-apply | Sona refuses and offers a reviewed packet |
| autofill completes low-risk fields | extension stops before external navigation or submission |
| field is hidden | extension skips it and logs `blocked_hidden_field` |
| field asks for EEO or disability data | extension skips it and logs `blocked_sensitive_field` |
| form has CAPTCHA or identity verification | extension stops and logs `blocked_verification_flow` |
| unsupported host | extension shows unsupported state and sends no page text |

## Security And Compliance Checklist

- Create a Chrome Web Store privacy policy page before submission
- Add a user-facing data disclosure in the popup and options page
- Keep extension purpose narrow: save jobs and prepare packets
- Use optional host permissions where possible
- Add a server-side domain allowlist
- Validate payloads with schemas before saving
- Redact sensitive fields before logging
- Rate-limit capture and packet preparation
- Version every parser
- Keep remote AI calls in the web app backend, not in the extension
- Package all extension JavaScript locally
- Add a manual review gate before any autofill
- Add automated tests for no-submit behavior

## Retention And Deletion

The web app should own retention.

Rules:

- extension captures become Application Workspace records
- users can delete extension-captured jobs from Applications
- deleting an account deletes extension sessions and captured jobs under the account lifecycle policy
- extension local state should clear on sign-out
- parser diagnostics should expire unless attached to an active support case
- audit events should keep action metadata, not sensitive field values
- support exports should label extension-captured records by source board and parser version

## Implementation Phases

### Extension Phase A: Design and API contracts

- Create `apps/extension` or `extension` package
- Add Manifest V3 scaffold
- Add parser contracts and fixture pages
- Build `/api/extension/status` and `/api/extension/jobs/capture`
- Add Application Workspace source labels for extension captures
- Add audit logs for extension events

### Extension Phase B: Job clipper MVP

- Implement popup capture UI
- Implement LinkedIn, Greenhouse, Lever, Indeed, and Workday page readers
- Save reviewed captures into Application Workspace
- Launch Market Oracle and packet preparation from the saved job
- Add parser confidence and diagnostics

### Extension Phase C: Review queue integration

- Show extension-saved jobs in Agent Queue
- Show source board and captured URL in packet drawers
- Add Sona prompts for captured roles
- Add mobile review support for extension captures

### Extension Phase D: Manual-paste assistant

- Detect supported field labels
- Offer copy buttons for approved packet artifacts
- Log copied fields and blocked fields
- Keep sensitive fields out of scope

### Extension Phase E: Guarded autofill

- Add one-field-at-a-time fill for low-risk fields
- Add reviewed field mapping
- Log filled fields
- Prove no-submit behavior with tests

## Audit Plan

Before shipping:

- type-check and production build the web app
- run extension unit tests against fixture pages
- run Playwright or Chrome extension E2E tests on saved local fixtures
- review popup and options UX at 320px, 390px, and desktop widths
- review permissions warning text
- confirm unsupported pages show a useful state
- confirm every capture has a visible review step
- confirm no code path clicks a final external action
- review privacy policy and Chrome Web Store listing copy
- review data retention and deletion behavior

## Success Metrics

- supported job pages captured
- capture-to-saved-job conversion
- saved-job-to-packet conversion
- packet approval rate
- fields copied or filled after review
- blocked sensitive fields
- application outcomes from extension-saved jobs
- uninstall reasons
- permission grant rate by board

## Launch Gate

Do not ship the extension until these product gates are done:

- sign-in is re-enabled
- Career Twin audit passes with a real user
- Proof Engine audit passes with real saved applications
- Review Queue audit passes with real queued packets
- Applications audit passes with real saved jobs and outcomes
- Stripe checkout is verified on production HTTPS
- privacy policy and terms cover extension data handling
