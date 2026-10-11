# Your Experience upgrade: templates and export review

Read-only audit, 2026-09-28. Scope: catalog and selection, preview/customization, HTML/PDF/DOCX renderers, content fidelity, page/overflow behavior, accessibility, branding, and ATS wording. No provider, account, or production export was used. Findings below are based on source inspection and the offline fixture suite; browser and real print-driver proof remain separate.

## Evidence-backed strengths

- The catalog is the single source for selectable IDs, tiers, ATS posture, palette metadata, section order, and renderer keys (`lib/resume-templates/catalog.ts:327-411`). The 17 new signatures each have dedicated HTML, PDF, and linear DOCX registrations (`components/resume-templates/curated/index.tsx:366-386`, `lib/resume-signature-pdf.tsx:1001-1021`, `lib/resume-signature-docx.ts:69-262`).
- Selection fails closed for unknown renderers (`lib/resume-templates/registry.ts:3-18`) and entitlement checks are enforced before PDF and Word export (`app/suite/resume/page.tsx:1815-1840`, `:1865-1877`).
- Palette colors pass the documented contrast gate before rendering (`lib/resume-templates/palettes.ts:196-222`). The PDF renderer also validates that its consumed geometry agrees with catalog column/export labels and rejects ATS-first profiles that become split layouts (`lib/resume-signature-pdf.tsx:936-970`).
- Content inventory tests cover canonical fields, sparse/full/long fixtures, all 17 PDF signatures, all 17 DOCX companions, and modern PDF text extraction (`scripts/resume-signature-pdf.test.js`, `scripts/resume-signature-docx.test.js`). The run completed 42/43 tests; the single failure was an existing wording assertion in `resume-template-integration.test.js` expecting “17 new curated signature designs require Standard” while the page now says “the curated signature designs are available with Standard.”
- The DOCX companion intentionally uses body-flow paragraphs with no tables, text boxes, images, headers, or footers (`lib/resume-signature-docx.ts:521-529`), which is a conservative parsing boundary. ATS copy explicitly says compatibility varies and is not guaranteed (`app/suite/resume/page.tsx:191-219`, `app/templates/TemplatesGallery.tsx`).

## Findings

### P1 — Direct template links do not open the template stage and the default journey is target-job led

The Studio starts at `step = 'upload'` (`app/suite/resume/page.tsx:551-560`). A `?template=` deep link resolves and selects a template, but the effect only updates selection/filter state; it does not navigate to the template stage (`:684-706`). The upload confirmation then advances to `step = 'jd'` (`:3104-3119`), and the visible source copy instructs the user to paste a job description before optimization (`:3128-3132`). Template selection is a later stage (`:3467-3470`). This makes a public template card or direct “Your Experience” entry dependent on resume intake and a job-targeting journey even when the user only wants to shape a general career profile/resume.

Acceptance: keep Experience and Resumes equally prominent inside Your Experience. Within Resumes, make general resume creation and optional job tailoring accessible, with the former able to reach template selection and preview without a job description. A valid `?template=` link should land on the template stage when a usable resume exists, or show a clear resume-first handoff while retaining the requested template. Test signed-out, existing-draft, imported-resume, and no-job-description flows; none should require a fabricated or empty job target.

### P1 — Browser HTML preview and print may clip long content; clipping was not reproduced here

The curated HTML page is fixed to A4 dimensions and sets `overflow: hidden` (`components/resume-templates/curated/index.tsx:455-468`). The print rule retains the fixed A4 page and does not add an explicit page-break strategy (`:602-605`). Experience entries request `break-inside: avoid` (`:486-488`), but there is no measured overflow warning, continuation-page label, or content-height guard. The Studio preview computes height from `scrollHeight` (`app/suite/resume/page.tsx:4495-4529`), yet this does not prove that print/PDF browser output preserves overflow. I did not run a browser print session, so clipping is a code-level risk, not an observed reproduction. A long fixture passing React-PDF extraction does not prove the HTML surface is printable.

Acceptance: render every selectable HTML template with sparse, normal, and long fixtures in a real browser print-to-PDF path; assert no text is clipped, no section disappears, and continuation pages retain identity. Either allow natural multi-page flow or show a visible “continues on page N”/overflow state. Capture page count and extracted canonical-field coverage for each output.

### P1 — No product-level page-limit or overflow policy is exposed

The Studio does expose a `targetPageCount` choice with Auto/1 Page/2 Pages options (state near `app/suite/resume/page.tsx:574` and the target form), but the metadata does not declare a per-template page target, max pages, or overflow behavior (`lib/resume-templates/types.ts:13-25`, `catalog.ts:145-182`). PDF profiles use fixed padding and natural React-PDF flow (`lib/resume-signature-pdf.tsx:936-970`); DOCX profiles have no page-count contract. The UI control is therefore an input to the optimization flow, not evidence that the final HTML/PDF/DOCX render enforces that count. The Studio labels export behavior and ATS posture, but no measured final page count is presented (`app/suite/resume/page.tsx:3629-3641`).

Acceptance: define per-template page policy (`targetPages`, `maxPages`, or `auto`) and display it before export. Run long fixtures through PDF and DOCX conversion, report actual page counts, and reject or warn when a configured limit is exceeded. Do not shrink text below an accessible minimum to force one page.

### P1 — HTML, PDF, and DOCX are structurally related but not fidelity-equivalent

HTML uses curated composition classes and decorative glyphs (`components/resume-templates/curated/index.tsx:44-65`, `:453-601`); PDF uses a separate profile map and React-PDF primitives (`lib/resume-signature-pdf.tsx:89-145`, `:1001-1047`); DOCX intentionally uses a linear companion with a different profile map (`lib/resume-signature-docx.ts:40-69`, `:521-529`). This is an explicit product choice, but there is no automated cross-surface geometry or visual diff. Existing tests prove canonical text presence and structural metadata, not that headings, order, line wrapping, motif placement, or page breaks match the preview.

Acceptance: for each template, compare a browser screenshot, rendered PDF screenshot, and Word-to-PDF screenshot against a reviewed reference at representative viewport/page sizes. Define allowed differences: DOCX may be linear, but content order, headings, contact fields, bullets, and section presence must match. Store the reference fixture/version and review diffs on renderer changes.

### P2 — PDF ATS normalization changes supplied typography and symbols

The generic PDF path normalizes dashes, quotes, bullets, arrows, trademark/copyright symbols, and whitespace (`lib/pdf-templates.tsx:123-153`) before rendering. This improves parser tolerance but changes visible source text. The curated signature PDF path uses a no-hyphenation text wrapper (`lib/resume-signature-pdf.tsx:44-58`) yet the audit did not find a user-facing disclosure that PDF may normalize punctuation. The content inventory tests check normalized output boundaries, so they do not establish byte-for-byte visual fidelity.

Acceptance: state whether export is source-faithful or parser-normalized per template; preserve a source-faithful option for users. Add fixture assertions for punctuation normalization and an explicit export report when visible characters change.

### P2 — Palette customization is gated to Max while template access is Standard

Template selection uses Standard entitlement for Pro templates, while non-default palettes require Studio/God (`app/suite/resume/page.tsx:630-668`). The UI labels the palette area “MAX PALETTES” and routes to the Studio upgrade (`:3645-3669`), which is internally consistent, but the public gallery only says designs are available with Standard and does not explain that palette customization is a separate entitlement (`app/templates/TemplatesGallery.tsx`).

Acceptance: expose the two entitlements in the same place before users enter Studio: template access and palette customization. Keep Classic available and exportable for every entitled template. Test signed-out, Free, Standard, and Max states, including a persisted non-default palette after downgrade.

### P2 — Accessibility semantics are good for cards but need rendered-document testing

Studio cards implement `role="button"`, `aria-pressed`, keyboard activation, and focusability (`app/suite/resume/page.tsx:3543-3555`); palette uses a listbox trigger (`:3673-3680`). Curated decorative marks are hidden from assistive technology in the component (`components/resume-templates/curated/index.tsx:114-123`), and thumbnail images use empty alt text (`app/suite/resume/page.tsx:3566-3569`), appropriate if purely decorative. Source does not prove focus order, listbox option semantics, contrast under every dynamic palette, or screen-reader reading order of the exported PDF/DOCX.

Acceptance: run axe plus keyboard and screen-reader checks on template selection, palette selection, preview, and export states. Assert every palette option has option semantics and an accessible name, selected state is announced, and the rendered HTML preserves logical heading order. Treat PDF/DOCX accessibility as a separate capability statement unless tagged-PDF/Word reading-order tests are added.

### P2 — ATS labels are useful posture, not measured parser claims

The catalog uses `ATS-first`, `ATS-conscious`, and `Human-first` with template-specific limitations (`lib/resume-templates/catalog.ts:1-25`, `:185-205`). Product copy correctly avoids universal guarantees (`app/suite/resume/page.tsx:163-219`, `app/templates/TemplatesGallery.tsx`). However, no parser corpus or vendor matrix appears in this implementation; PDF tests use text extraction, which is not equivalent to ATS parsing.

Acceptance: define ATS claims as observed test scope: heading/order extraction, contact extraction, dates, bullets, and columns across a named parser fixture set. Publish the fixture date and keep “not guaranteed” copy. Do not promote `ATS-first` to a universal compatibility promise.

## Proof boundaries

The offline suite provides strong evidence for catalog closure, renderer registration, contrast gates, canonical field retention, and PDF/DOCX text extraction. It does not prove browser print fidelity, visual match between surfaces, real Word pagination, screen-reader behavior, tagged-PDF structure, or compatibility with employer ATS vendors. Those require supervised browser/office/reader runs with stored artifacts and a reviewed corpus.

## Discoverability and catalog counts

The selectable catalog contains 20 templates: 3 Free foundational designs and 17 Standard designs. Category counts are: executive 2, technical 2, creative 2, and one each in strategy, product, data, finance, legal, healthcare, academic, public-sector, nonprofit, transition, early-career, sales, design, and editorial. This is a Resumes experience concern: the Your Experience workspace should offer “Experience” and “Resumes” as peer destinations, with General and Tailor actions inside Resumes. The current resume Studio starts at upload and its default path proceeds through a target job description. The consolidated upgrade plan specifies the wider information architecture.

The one failing test in the audit command (`node --test scripts/resume-template-catalog.test.js scripts/resume-template-integration.test.js scripts/resume-template-palettes.test.js scripts/resume-signature-docx.test.js scripts/resume-signature-pdf.test.js scripts/resume-export-truth.test.js`) is `scripts/resume-template-integration.test.js:166-179`, test “public gallery is catalog-backed, deep-linked, tier truthful, and avoids universal ATS claims.” Its assertion expects `/17 new curated signature designs require Standard/`; the actual `app/templates/TemplatesGallery.tsx` text says “the curated signature designs are available with Standard” in the introductory paragraph and “The new curated signature designs require Standard” in the FAQ. This is a stale wording assertion, not a user-visible defect; the rendered copy still communicates the Standard requirement.

## Proposed release gate

Ship the upgrade only after: (1) all selectable templates pass browser and PDF/DOCX screenshot review on sparse, normal, and long fixtures; (2) no canonical content is clipped or reordered unexpectedly; (3) page policy and palette entitlements are explicit; (4) keyboard, axe, and screen-reader checks pass for the Studio flow; and (5) ATS wording remains scoped to the measured parser corpus with the current no-guarantee disclosure.
