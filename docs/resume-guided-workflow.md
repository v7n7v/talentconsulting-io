# Resume Studio guided workflow

The primary flow is now Upload → Tailor → Choose a template → Export or save. Import correction stays in Upload. AI change decisions stay in Tailor, and undecided or unsupported changes cannot be saved or exported. General resumes can continue without AI. Existing template, palette, entitlement, PDF, Word, truth-lock and account ownership behavior is retained.

Saved resumes, career details, browsing without a resume, the first-90-days plan, application tracking and cross-tool actions are secondary disclosures. The starting screen prioritizes uploading instead of a template catalog. Finish contains the resume name, PDF/Word downloads and explicit account saving. AI generation no longer automatically writes a version to the account; signed-in tab recovery remains automatic.

Back keeps the job description, source, candidate decisions and layout. Source or target edits invalidate old AI output and scores. Manually edited content becomes the next tailoring source without replacing the immutable imported record. Expected tailoring failures show a retryable inline error and retain inputs.

Successful sign-in from a guest studio copies the current draft into that specific account’s tab recovery. It never transfers another signed-in account’s data or a developer fixture. If an account already had a tab draft, that previous draft stays available under Open a saved resume. Switching back swaps the two tab drafts. This is browser session recovery, not a cloud save. Extracted text and import errors are also retained for retry after sign-in.

Validation: 166 focused tests pass, including Back/Continue, invalidation, skip-AI, service failure, four-step accessibility, guest sign-in handoff, storage failure, account boundaries, review decisions, save/tracking, export truth, templates and upload. TypeScript, scoped component/helper ESLint and whitespace checks pass. The large existing page still has legacy whole-page lint issues; no clean whole-repository lint claim is made. No production build was run against the active Next development server.

Browser verification on normal loopback development: upload confirmation advances to Tailor; Back retains a fictional job description; source corrections reach template preview; mixed accept/revert review enables continuation; Back preserves decisions; templates advance to Finish; PDF download correctly opens authentication while signed out. Desktop and 375px Upload, template and finish layouts inspected without horizontal overflow. Temporary fixture tabs closed, viewport restored, normal result tab retained; browser error logs empty. Real account sign-in, provider rewriting and cloud saving were not performed during this frontend verification.

Preview: http://127.0.0.1:3101/suite/resume. Screenshots: `docs/audits/resume-guided-workflow/upload-desktop.jpg` and `upload-mobile.jpg`.

All implementation was performed in Taco-upgrade. No original checkout edit or deployment was performed by this task. A read-only original baseline check found one existing/concurrent difference in `lib/pdf-templates.tsx`; it was preserved.
