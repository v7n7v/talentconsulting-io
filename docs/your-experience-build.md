# Your Experience — first working release

Implemented locally on `codex/taco-upgrade` in the isolated Taco-upgrade checkout. This is the first complete document journey from the upgrade plan, plus supporting integrity and export work. It is not a claim that every later roadmap phase is finished.

## Available now

- Experience and Resumes are equally prominent destinations throughout the workspace. A general resume needs no job description; tailoring is an optional action.
- One shared editor handles manual experience, reviewed imports, and saved resumes. It includes labeled identity/contact fields, work and education entries, skills, credentials, links, additional sections, keyboard entry/bullet movement, and undo/redo.
- Imports stage separately from the document being edited. Source text and warnings stay available for correction. Explicit confirmation saves and publishes the exact corrected experience; rejected/replaced imports do not become shared career facts.
- The parser validates model output at runtime, flags unsupported source changes, rejects empty/malformed responses, preserves recoverable text, and supports cancellation/timeouts. Legacy DOC and OCR are not advertised as supported.
- Experience and resume documents have distinct version envelopes, content hashes, origins, parent/source references, confirmation receipts, and presentation settings. Existing unlinked records remain editable documents with honest source status. Generated resumes do not become factual source records implicitly.
- Saved Open restores the selected document directly, including target, template, palette, source, page size, and review state. Pending generated changes return to review. General/manual edits do not require an AI pass.
- The library supports search, active/target/general/archive filters, rename, duplicate, and archive/restore. Experience history opens prior records. A newer confirmed experience revision offers a comparison and an explicit new draft; existing saved resumes stay unchanged.
- Save retries use a payload-bound idempotency key and transaction conflict detection. Experience confirmation timestamps survive retries. Every tracking entry point uses the same durable Save & Track operation and recovery receipt.
- PDF export supports A4 and Letter. The actual generated PDF renders as canvas pages inside the app, with its measured page count. Changing content or presentation clears the old artifact. The displayed artifact can be downloaded directly, and the main download action reuses matching bytes.
- Additional content and links are carried through HTML, PDF, and Word paths. The Editorial Authority sidebar now lays out identity/contact before credentials without painting over contact text; it repeats on continuation pages. Word remains a linear editable companion, with explicit page geometry rather than a promise of PDF-identical pagination.
- Compact checks distinguish optional content advice from source/review restrictions. Incomplete user-authored education is advice, not an account-save or export blocker. Unsupported generated changes still require review/reversion.

## Verification

Completed against fictional local-preview data; no live provider or production-account calls were used.

- Resume regression suite: 194 passing tests.
- Workspace regression suite: 249 passing tests.
- Additional intake, workspace, persistence, lifecycle, and export suites: 42 passing tests. These suite counts overlap in some covered behavior and are not a unique-test total.
- Final outbound/recovery/state regression pass also covers the incomplete-education policy adjustment.
- TypeScript, scoped lint for the new core components/contracts/parser/PDF helper, and production build pass.
- Actual PDF rendering and text extraction cover all 20 selectable templates: 17 curated templates with full/sparse/long fixtures and three foundational designs with long/sparse, Unicode, specialty-content, links, A4/Letter geometry, and pagination checks. This is artifact regression coverage, not universal ATS or multilingual certification.
- Browser checks: blank general resume save; confirmed Experience with a custom project section; create/save/reopen/reload; no-JD Design/Export; A4 and Letter artifact generation; invalidation on page-size change; mobile editing at 390px; visible PDF contact/project content; local Save & Track success. The temporary viewport override was reset.

The existing whole-repository design audit remains advisory: no accent-contrast regression was reported, but CSS custom-property definition counts increased with the scoped editor styles. This is not a claim that every pre-existing repository lint/design warning has been eliminated.

## Remaining roadmap and release gates

Later phases still include richer per-fact source citations/origins and conflict reconciliation; passage-level AI proposals; arbitrary section ordering/hiding and document-to-document comparison; side-by-side template comparison; server-side paginated library queries; a controlled rollout/rollback switch; and export receipts with durable artifact checksums. The first release uses additive resume-version records and does not run a database migration.

Before production rollout, verify authentication/rules and interruption behavior with a synthetic staging account, raw-upload retention/deletion lifecycle, provider limits/charging, representative Word-to-PDF results in supported office runtimes, and a broader manual visual/accessibility/language fixture review. Emoji and wider script coverage are not certified by the Latin/diacritic fixtures. OCR and advanced specialist ingestion remain follow-on work.

Device recovery is described as tab/device recovery; it is not an account backup. Account saves preserve normalized content and immutable source snapshots, not a new raw-upload retention promise. Library display is progressively revealed on the client; server pagination remains explicitly outstanding.

## Local review

Run `npm run preview:workspace` and open `http://127.0.0.1:3101/suite/resume`. The preview uses fictional session data and blocks external services. Production build was run with the dev server stopped; the preview is restarted afterward. No deploy, commit, banked reset, or shutdown was performed.
