# Your Experience: browser and usability review

Reviewed 2026-09-28 in the local fictional workspace at `http://127.0.0.1:3101/suite/resume`, backed by the `codex/taco-upgrade` working tree. This is a review and planning artifact; no application code was changed for this review.

## Method and boundaries

Inspected the source arrival screen, opened a fictional saved version, exercised the built-in `reviewDemo=1` change-review fixture through Design and Ship, selected Product Signal, inspected the manual authoring screen, and checked the Ship screen at desktop and 390 × 844. Used screenshots, accessibility-tree snapshots, read-only DOM measurements, and source inspection. The two proposed reorder changes were accepted only within the fictional review tab. No live AI generation, real file ingestion, account saves, application creation, or export downloads were performed.

The review fixture's 86% score is hardcoded example data. It is not evidence of real model quality. Existing draft hydration initially displaced the demo's intended review stage; starting over in the dedicated review tab then reloading restored that fixture. This observation is specific to the development fixture.

Desktop document width was 1270 against a 1280 viewport; mobile document width was 380 against a 390 viewport. No horizontal document overflow was observed on the inspected Ship screen. This is not coverage of every form or template. The viewport override was reset after inspection.

## What is already working

- Paper, ink, coral, fine rules and the folded A give the workspace a recognizable relationship to the landing page. Keep that design vocabulary.
- Upload, paste and manual creation are visible together at arrival. The intake correction component already calls parser output a draft and offers editable fields.
- The change-review workbench presents source and proposed wording, allows keeping the source or accepting a change, and withheld Continue until the two fixture changes were reviewed. Retain this deliberate review interaction.
- Templates preview the candidate's own content. The catalog already offers 20 selectable formats, so expanding the catalog is less urgent than making selection and export dependable.
- The main morph editor can truthfully show “Draft saved in this tab.” The upgrade should extend accurate state reporting to the other entry paths.

## Findings

| ID / priority | Observed behavior | Impact and proposed resolution |
| --- | --- | --- |
| UX-01 / P1 | Sidebar says Your experience, but the visible destination is Resume Studio; the Your experience heading is visually hidden. There is no equally prominent career-record destination. | Keep a visible Your Experience title and two persistent peer destinations: **Experience** and **Resumes**. Shared facts support both. |
| UX-02 / P1 | Opening “Founding AI Product Engineer packet” lands at Target, asking for a job description. Progress is noninteractive; direct edit/design/export actions are absent there. | Open a saved document at its editor, preserve its name/revision, and expose Edit, Design and Export. Tailor to a job is optional. The generic New resume/Candidate header seen in this fixture alone does not prove saved content loss; the separate lifecycle reproduction establishes the state defect. |
| UX-03 / P1 | The manual-creation first screen exposes five unnamed text fields and an unnamed summary in the accessibility snapshot. DOM inspection confirms placeholders without labels, `aria-label`, or `aria-labelledby`. The target textarea has the same source-level issue. | Add persistent labels, appropriate input types/autocomplete, required/optional explanations, inline errors and focus management. Placeholders should illustrate acceptable input. |
| UX-04 / P1 | At mobile width, Source/Target/Shape/Review/Design/Ship labels all have `display:none`. The accessibility tree exposes bare “Completed” strings and no named current stage. | Preserve an accessible name and visible current stage at every width. Use meaningful destinations, not unexplained numbered dots; any navigation must preserve work. |
| UX-05 / P2 | Arrival promises “We will keep its structure” and footer says “Structure preserved / Draft saved locally” before any import can be verified. Manual creation hardcodes “Local draft.” | Describe actual capability and persistence state. Suggested upload copy: “Bring in your content, then check what we found.” Show Saving / Saved in this tab / Saved to your account / Save failed based on real receipts. |
| UX-06 / P2 | Targeting exposes a numerical rewrite-strength control and a prominent 100% Morph lock, alongside Auto / 1 Page / 2 Pages. | Lead with task choices such as Keep my wording, Improve clarity, or Tailor emphasis; keep advanced controls secondary. All choices obey the same factual boundaries. Distinguish requested length from actual rendered page count. |
| UX-07 / P2 | Design includes a large Proof Engine, another five-stage sequence, duplicate detail navigation and a mixture of scores, zero-claim assertions and unavailable proof. | Show a compact, evidence-scoped “Checks” summary with expandable details. Separate structural checks, user confirmation, source consistency, and optional job coverage. Do not imply independently verified credentials or measured hiring probability. |
| UX-08 / P2 | Ship declares “Your resume is ready” with 6/6 checks including summary presence, experience presence, “School names verified,” and account save availability. The source check for school names only tests missing institutions. | Replace the global readiness claim with specific results. “School names present” can be accurate; “verified” is not established. Missing optional summary or lack of a paid account should not masquerade as content invalidity. |
| UX-09 / P2 | Download PDF, Download Word, Track Application, Save and Template appear together; actual page count and the difference between designed PDF and linear Word are not clear at download. | One Export action opens a concrete PDF/Word choice, actual artifact preview and page information. Keep save status separate and application tracking optional. |
| UX-10 / P2 | Recent versions provide Open/Delete in a small table, with no visible search, branch/source lineage, comparison or archive/restore. | A resume library should support fast reopening, rename, duplicate, target/status filters and archive. Expose revision details on demand. Add pagination when implementing the library; do not call the current all-record query a pagination bug. |

## Source anchors

- Source console and promises: `app/suite/resume/page.tsx:2630–2922`.
- Target input and strength controls: `app/suite/resume/page.tsx:3231–3390`.
- Readiness checks: `app/suite/resume/page.tsx:2973–2980`.
- Manual first screen and fixed save label: `app/suite/resume/page.tsx:4150–4218`.
- Progress structure: `components/resume-studio/ResumeStudioProgress.tsx:18–46`; mobile labels: `components/resume-studio/resume-studio-system.css:445`.
- Header guarantees/defaults: `components/resume-studio/ResumeStudioHeader.tsx`.
- Supporting deeper evidence: [ingestion](ingestion-review.md), [editor lifecycle](editor-lifecycle-review.md), and [templates/export](templates-export-review.md).

## Proposed usability acceptance

Evaluate these as separate tasks: add a career achievement; import and correct experience; create a general resume without a job description; reopen and export an existing resume; tailor a copy to a role; recover an interrupted save. Both primary destinations must remain visible throughout. Run keyboard, mobile and screen-reader checks on the complete tasks, not only their empty screens.

Use synthetic fixtures during engineering, then consented usability sessions with first-job, experienced, career-change and long-CV participants. This review is an expert assessment, not a user study. Establish completion time, misnavigation and recovery baselines before claiming a measured UX improvement.
