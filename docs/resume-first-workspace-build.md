# Résumé-first workspace build

September 29, 2026. Implements the approved resume-first-workspace-plan.md for local review.

## Result

Resumes is the primary sidebar destination. My resumes and Templates lead the workspace; Career details is optional. Existing career and saved-document links remain supported.

Returning users see their current or latest resume with a miniature and Continue editing. New resume actions remain compact. New users see a shorter upload entry with paste, blank creation and real template previews. The full catalog has style and ATS filters, actual document rendering and existing access restrictions. Fictional sample content is labeled and never copied into a blank draft.

The editor and live preview share one workspace with name, save, export and Content/Design/Review controls. Reviewed import corrections become the draft used in design. Changing templates preserves content, editor section, undo/redo and mobile Edit/Preview selection. Starting a new document resets those sessions. Career details are reused deliberately; existing resumes are not silently overwritten. Tailoring and duplication create independent copies.

The library groups only recorded revision relationships, exposes history and secondary actions, and retains orphaned or older unlinked records. Filtering does not break recorded groups. Archive/restore handles all recorded revisions with account checks.

## Verification

- Final production build and TypeScript pass; focused new/changed component and grouping-helper lint pass. git diff --check passes.
- 194 regression tests, 43 experience/import/source/save tests, 7 binary/local-import tests, and 25 final state/export/navigation/group tests pass. These suites overlap; counts are separate runs.
- Browser checks covered blank/sample isolation, actual saved-document editing, save, template switching, undo/redo, current section, mobile preview retention, fresh-document reset and draft recovery.
- At a 390px viewport the document width was 380px, with no horizontal page overflow. Desktop editor/export actions remained visible after fixing the older shell translation rule.
- Actual PDF export was inspected as a readable one-page A4 document. Actual Word XML preserved content and reading order. The exported PDF was uploaded through the UI; parsing completed, the original source remained available and corrected content reached design.

## Review limits

Local preview runs at http://127.0.0.1:3101/suite/resume?view=resumes with fictional session data and external services blocked. Live AI and production persistence were not exercised in this task. Existing full résumé-page lint debt was compared with the frozen release baseline; this is not a claim that repository-wide lint passes. Production deployment was not requested for this build.

## Job-tailoring discoverability follow-up

Added visible Tailor to a job actions on the current/latest document, individual saved resumes and the editor (including design/export). Import review also has Confirm and tailor to a job, gated by the same acknowledgment and account checks. This opens the existing job-description, rewrite-strength and Optimize Resume flow directly. A new targeted copy clears the previous job/company, retains reviewed content and source context, and does not overwrite the saved original. Pending generated changes still require review before another tailoring handoff.

Verification: 18 focused state/export tests and TypeScript pass; final production build passes. Browser checks covered home and saved-library entry, cleared target context, reviewed import directly into job targeting, and Optimize Resume enabling after a pasted job description. Live AI generation remains blocked in the isolated preview.
