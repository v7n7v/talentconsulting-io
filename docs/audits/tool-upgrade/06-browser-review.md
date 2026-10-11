# Local browser review

Date: 2026-09-28. Checkout: `/home/xwingace/Documents/Projects/Taco-upgrade`, branch `codex/taco-upgrade`, base commit `806ac3c0`. This supplements the source audits; it is not a production acceptance report.

## Environment and limits

The browser used `http://127.0.0.1:3101` with the explicit fictional workspace preview. The preview blocks external services and many API actions. It does not establish whether real authentication, generation, Firestore persistence, email, microphone, payments, or provider responses work. No real credentials, uploads, purchases, communications, or account lifecycle changes were used. The user's existing Resume Studio tab was preserved; inspection used a separate temporary tab. Temporary viewport overrides were reset after review.

The initial fixture was “Drafts and next actions.” Failed or unavailable provider-backed panels in this fixture are recorded as preview limitations, not automatically as production bugs. Early loading frames were not counted as settled empty/error states. The source reports distinguish missing implementations from intentionally blocked preview requests.

## Coverage

Desktop entry-state checks at a 1280px viewport covered all 24 customer-facing suite destinations/capabilities:

| Group | Routes inspected |
|---|---|
| Foundation | `/suite`, `/suite/agent`, `/suite/resume`, `/suite/ats-analyzer`, `/suite/cover-letter`, `/suite/linkedin` |
| Search and applications | `/suite/job-search`, `/suite/applications`, `/suite/agent/queue`, `/suite/negotiate`, `/suite/network`, `/suite/market-oracle`, `/suite/pulse`, `/suite/intelligence`, `/suite/agent/quality` |
| Practice and learning | `/suite/interview-sim`, `/suite/agent/stories`, `/suite/skill-bridge` |
| Writing and utilities | `/suite/gallery`, `/suite/writing-tools`, `/suite/jd-generator`, `/suite/settings`, `/suite/upgrade`, `/suite/feedback` |

All seven Interview Studio mode selectors were opened: Quick Drill, Study Cards, Full Mock, Live Interview with Taco, Avatar Live, Whiteboard, and Debrief Review. This inspected setup states, not completed sessions. No live audio session was started.

All ten Settings sections were opened and their settled content inspected: Profile, Display, AI Safety, Subscription, Security, Notifications, Help, Feedback, Sessions, Data & Privacy. No account-changing controls were submitted. Upgrade correctly showed unavailable checkout and a retry in the isolated preview; no payment flow was attempted.

Five public tool entry pages were inspected: `/tools/ai-detector`, `/tools/ai-humanizer`, `/tools/ats-analyzer`, `/tools/interview-prep`, `/tools/resume-builder`. These are not five fully executed production tools; most are marketing entry points into the suite. Their actual implementation is inventoried in [04-writing-public.md](04-writing-public.md).

Compatibility destinations were visited:

| Legacy URL | Observed destination |
|---|---|
| `/suite/analytics` | `/suite/intelligence` |
| `/suite/ats-preview` | `/suite/ats-analyzer` |
| `/suite/ats-score` | `/suite/ats-analyzer` without a score-tab query |
| `/suite/flashcards` | `/suite/interview-sim?mode=study_cards` |
| `/suite/interview-debrief` | `/suite/interview-sim?mode=debrief_review` |
| `/suite/vault` | `/suite/skill-bridge?view=memory` |
| `/suite/negotiate` | Honest bridge screen linking into Applications and offers |

The six redirect aliases and the offer bridge must preserve useful deep-link context during consolidation. The score alias currently lands on the analyzer's default Preview rather than explicitly choosing Match Score, consistent with source review.

## Reproduced behavior

### B-01 — Writing draft disappears after a “saved locally” message

1. Open `/suite/writing-tools` in the fictional signed-in preview.
2. Enter: “I designed a checkout flow for a small shop. I interviewed five customers and used their feedback to simplify the payment form.”
3. Observe the draft status: “Draft saved locally.”
4. Reload the page.
5. The input is empty. The default status still says “Draft saved locally.”

This is a browser-reproduced data-recovery defect, supported by the source effect that changes the status string without writing a draft. It is not a test of cloud Save. Acceptance must cover local write failure, reload, source/result/settings recovery, ownership and exact-revision status, not merely replacing the toast.

### B-02 — Gallery Word Counter completes locally

Open Writing Toolkit → Word Counter, enter “I designed a checkout flow. Completion increased by 18 percent.” and run the tool. It returned 10 words, 63 characters, 54 characters excluding spaces, two sentences, one paragraph, five words per sentence, and minimum one-minute reading/speaking estimates. The core count action worked without a provider. This does not validate the seven AI-backed Gallery tools.

### B-03 — Interview mode and Settings selections do not update the URL

Starting on `/suite/interview-sim?mode=debrief_review`, select each other mode. The visible mode changes; the URL remains `mode=debrief_review`. In Settings, clicking through sections similarly leaves `/suite/settings` unchanged. Source review confirms local-state selection. Refresh/share/back behavior therefore needs a consistent route-state contract. The initial query does select an entry mode; the defect is not that query links never work.

### B-04 — Resume readiness is inconsistent within interview setup

The fixture's practice banner says “Resume linked” while the explicit context selector says “No resume selected / Practice without a resume version.” The fixture has career context, so these statements may refer to different things; the interface does not make that distinction clear. The source audit independently establishes that selected source evidence is not resolved into the practice engine. This observation is a usability contradiction, not proof that a provider consumed the wrong document.

### B-05 — Some preview data failures are distinguishable, others resemble an empty account

Network shows an explicit disabled-preview error and retry. Story Bank shows a load failure beside empty-state guidance. Pulse displays “Your Pulse is waiting” despite tracked application fixtures elsewhere. These observations motivate truthful unavailable/partial/empty states. They do not prove the live Pulse data query failed; the separate schema/query defect is established from source in SP-01.

## Responsive and visual observations

At 390×844, entry layouts were checked for Resume, Cover Letter, Writing Trust Studio, Market Oracle, Interview Studio, Skill Bridge, Settings and Gallery. At 320×800, checks covered Resume, Writing Trust Studio, Interview Studio, Market Oracle and Settings. In these measured states, document scroll width did not exceed the viewport. Desktop entry checks likewise found no whole-document horizontal overflow. Intentional horizontal navigation rails exist; absence of page overflow does not prove every internal control is usable or unclipped.

Screenshots were visually inspected for mobile Gallery, Writing Trust Studio and Interview Studio. The accepted paper/grid shell and strong borders provide a coherent starting point, but inner modules still mix rounded cards, older naming, and duplicated summary/context panels. This calls for shared component migration, not another independent visual theme.

In Writing Trust Studio, document/domain/tone/length configuration precedes the actual text editor. At 390px the editor began approximately 1390px below the viewport top, including the prominent development-only preview banner and mobile navigation. The precise production offset will differ. The meaningful finding is configuration-before-content: the upgrade should expose the document first and move advanced controls behind progressive disclosure.

Interview setup repeats the launch action and places a broad career summary before the exact role/source configuration. The first mobile screen promotes Start while the exact source can remain unselected. Make the selected practice brief and its missing context visible alongside the single primary start action.

Gallery's word-count utility is useful, but the page presents a separate directory of writing suites plus eight utilities. Integrating common edits into an existing document is a product recommendation, not a measured discovery-rate result.

## Remaining runtime gates

- Complete authenticated workflows with isolated staging accounts and provider credentials; verify persistence by reopening exact saved records.
- Run each AI mode with controlled malformed, slow, failed and successful responses; test input/account changes during requests.
- Verify Free allowance boundaries, existing paid access, denied permissions, live cleanup, interrupted grading and retries.
- Run export content checks on the actual PDF/DOCX, source changes, review invalidation and partial tracking failures.
- Expand responsive checks to result screens, drawers, long lists, error states, keyboard-only use, 200% zoom, contrast, screen readers and reduced motion.
- Validate billing, MFA, optional-data consent and lifecycle processing in staging. Their source implementations and historical tests are not equivalent to newly passed end-to-end checks.
- Conduct observed usability tasks with representative job seekers before claiming intuitiveness or completion-rate improvements.

This audit added no application code or automated tests. Historical build/test results remain documented separately in [internal-workspace-review.md](../../internal-workspace-review.md).
