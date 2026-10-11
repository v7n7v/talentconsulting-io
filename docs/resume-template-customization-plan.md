# Résumé templates and full customization — implementation plan

Prepared October 7, 2026. Status: the structured version 2 build is implemented and locally verified. See the [build report](reviews/resume-templates-2026-10-07/build-report.md) for delivered controls, validation, and advanced extensions. The detailed brainstorm below records the broader product direction; it is not a claim that every advanced option ships in this release.

Review and screenshots: [Current-template audit](reviews/resume-templates-2026-10-07/review.md).

## Product decision

Ship a coherent version 2 of the existing 20 selectable templates. Keep their stable IDs and support older saved designs. The value is twenty useful compositions plus a capable editor, rather than twenty more fixed documents.

The current recommendation is structured customization: users control typography, color, layout, sections, and pagination while content remains in a predictable document flow. Unrestricted positioning is an optional later mode, pending the user's preference. The clarification has been asked; this plan proceeds with the recommended structured mode.

The template chooser and design editor should carry Taco's paper, ink, strong rules, restrained accent colors, and brand symbol. Candidate documents should use the candidate's chosen styling. Do not automatically put Taco branding, decorative claims, or watermarks inside an exported résumé.

### Brainstormed approaches

| Approach | Benefit | Cost / limitation | Decision |
|---|---|---|---|
| Twenty additional static designs | Fast to populate a gallery | Repeats hardcoded controls and export drift | Reject |
| A shared editor with twenty composition presets | Useful variety, consistent controls, maintainable exports | Requires the design contract and typography work first | Recommended |
| A fully free-positioned canvas | Maximum visual freedom | Harder pagination, reading order, mobile editing, and Word translation | Optional later extension |

## The twenty-template collection

All names below retain their current IDs. Default order is a starting point, not an unchangeable restriction. Empty sections disappear. Specialized blocks appear only when the user has supplied them.

### Family 1 — Professional foundation

| Template | Intended document | Default anatomy | Distinctive customization |
|---|---|---|---|
| Technical Signal | Technical/general professional résumé | Full-width identity → summary → experience → skills → projects → education | Technology lists versus grouped skills; mono accents versus sans; dates beside or beneath roles |
| Executive Ledger | Senior leadership record | Compact identity → executive summary → experience with scope → capabilities → education/credentials | Employer-first versus role-first; scope line; optional board/advisory section; quiet rule system |
| Strategy Brief | Strategy, consulting, operations | Memo-style identity → concise summary → experience/outcomes → selected engagements → skills/education | Engagement labels, compact/spacious role rhythm, outcome callouts with attribution |
| Finance Standard | Finance and accounting | Restrained serif identity → summary → experience → certifications → skills → education | Serif/sans pairing; conservative monochrome mode; ledger-like dates without tables containing core text |
| Legal Brief | Legal and compliance professional | Formal identity → practice summary → experience → admissions/credentials → education | Practice headings, jurisdiction fields, matter lists, plain versus ruled sections |

### Family 2 — Work and outcomes

| Template | Intended document | Default anatomy | Distinctive customization |
|---|---|---|---|
| Engineering Core | Engineering with substantial projects | Identity → summary → experience → selected systems/projects → technologies → education | Project blocks with contribution/stack; compact technology rail; main experience remains continuous |
| Product Signal | Product/design delivery | Identity → product summary → experience → launches/projects → competencies → education | Launch/case-study treatments; stage/context fields; optional narrow supporting rail |
| Data Evidence | Data, research, analytics | Identity → summary → experience → analytical projects → methods → education | Methods categories, linked project results, citations/URLs; no decorative proficiency meters |
| Sales Momentum | Revenue and commercial roles | Identity → summary → experience with verified outcomes → territory/accounts → skills/education | Period-labelled results; numeric emphasis with original sentence/context; optional selected-account list |
| Mission Impact | Nonprofit and mission-led roles | Identity → mission summary → program experience → selected programs/grants → service/education | Program/funding/beneficiary fields; outcome bands only from confirmed user content |

### Family 3 — Career stages and specialized records

| Template | Intended document | Default anatomy | Distinctive customization |
|---|---|---|---|
| Emerging Professional | Student, graduate, early career | Identity → education → projects → experience/internships → skills | Project-first/education-first toggle; coursework; sparse-content spacing; no inflated summary filler |
| Career Pivot | Career transition/return | Identity → transition summary → transferable capabilities → chronological experience → projects/education | Capability evidence linked to role/project IDs; skills-first versus chronology-first |
| Healthcare Precision | Clinical and health operations | Identity → supplied licenses/credentials → summary → experience → education/skills | License jurisdiction/expiry fields, clinical specialties, credential-first versus experience-first |
| Public Service | Public/civic service résumé | Identity → qualifications → detailed experience → service → education/credentials | Optional location/hours/detail fields when supplied; detailed versus concise role records; no unverified federal-compliance label |
| Academic Profile | Academic CV | Identity → education → research → publications → teaching → grants → service/appointments | Publication grouping and citations; section numbering; continuation headings; multi-page CV defaults |

### Family 4 — Editorial and portfolio

| Template | Intended document | Default anatomy | Distinctive customization |
|---|---|---|---|
| Editorial Authority | Leadership with an editorial presentation | Wide identity → summary/contextual highlights → continuous experience + optional supporting rail | Rail width/side; word-safe name layout; attributed highlights; light or colored rail |
| Editorial Signature | Writing, communications, publishing | Byline-style identity → summary → experience → selected publications → skills/education | Byline treatment, publication list format, serif hierarchy, understated rules |
| Creative Director | Creative leadership/portfolio résumé | Identity/portfolio URL → summary → continuous experience → selected work + support rail | Project captions and links, restrained display type, optional thumbnail block in designed export |
| Architectural Grid | Architecture/planning/project practice | Title block → summary → experience → selected projects → qualifications | Project role/stage/location fields; project grid versus list; quiet registration marks |
| Brutalist Voltage | Expressive creative presentation | Large word-safe identity → summary → experience → selected work → support details | Heavy versus light blocks; rule weight; uppercase headings; ink-saving mode; readable neutral body type |

A palette variation is not a new template. Every template must have a distinct default composition or content hierarchy and must remain useful with all decoration removed.

## Full customization contract

### Typography

- Choose from an initial curated set of approximately 6–8 licensed, bundled families covering readable sans, serif, and mono styles. Audit actual available assets before selecting names; do not rely on local operating-system fonts.
- Configure heading/body pair, weights, name size, section/role/contact sizes, line height, letter spacing, and casing. Offer global settings and selected-section overrides.
- Use physical units internally: points for type and millimetres or points for margins/gaps. Convert deliberately to CSS and Word units.
- Begin with 10.5–11.5 pt body text. Warn below 10 pt; provide an advanced override for smaller sizes. Numeric limits prevent invalid layouts, not arbitrary removal of user choice.
- Identity text wraps at word boundaries; oversized names get a suggested adjustment rather than destructive clipping or silently splitting letters.
- User font uploads and unrestricted mixed-script coverage require a separate asset/licensing/fallback design. They are not implied by merely adding a font dropdown.

### Colors and decoration

- Editable paper, main ink, headings, accent, rule, rail fill, and rail ink; preset palettes plus custom values.
- Check contrast against each actual surface. Explain any failing combination and let the user fix it or choose a safe suggested value. Do not silently replace their color and pretend it was applied.
- Make motifs, rules, fills, icons, and heading markers independently optional. Include grayscale and light-print presets.
- Optional user image/logo blocks belong in the advanced designed export; use real text for identity and contact details. Images are excluded from the application-oriented version by an explicit export choice.

### Layout

- One/two columns, rail side, column ratio, header alignment, per-edge margins, column gap, section/entry/bullet spacing, and alignment.
- Configure date placement, company/role priority, bullet style/indent, skill grouping, and rules.
- Allow sections to move between main/support regions. Keep each experience entry in a coherent region with its bullets and dates.
- Template switching previews the result before applying; offer “keep my styling” or “use template defaults.” Carry compatible settings and surface any unsupported placement instead of silently discarding saved choices.

### Sections and content

- Add, rename, show/hide, reorder, and move sections. Provide drag controls and equivalent keyboard-accessible up/down actions.
- Hide presentation without deleting source content. Show excluded-section count before export; selection changes must not silently omit candidate fields.
- Support custom sections and structured project/publication/license entries where useful. Adapt old string-based additional sections without guessing missing facts.
- Let users choose entry order; preserve explicit chronological defaults. Offer clear conventional heading suggestions for application-oriented exports.
- Keep achievement highlights tied to their originating role/project. Avoid copying or removing an achievement without a defined display policy.
- Job-description tailoring remains a separate content action: paste JD → tailor → review changes → design → export. Design changes must not rewrite or reconfirm the source.

### Pagination

- A4 and US Letter; actual page count; manual breaks before sections or entries; keep heading with first entry; widow/orphan protection; optional continuation identity.
- “One page” is a goal with visible tradeoffs, not permission to delete facts or make the body unreadable. Suggest margin/spacing changes and let the user choose a second page.
- Long roles may split between paragraphs/bullets; do not keep an entire oversized entry together and create excessive blank space. Prefer at least two body lines on either side of a break when feasible.
- Treat academic CVs as naturally multi-page. No résumé-wide forced one-page rule.

### Editing and recovery

- Undo/redo for design edits, clear reset scope, per-résumé autosave, named personal styles, duplicate variations, and save/reopen fidelity.
- Keep quick controls visible: template, font pair, palette, density, section order, and page size. Put detailed controls in four expandable groups: Type, Color, Layout, Sections & Pages.
- Desktop: compact control panel beside the document. Mobile: a collapsible panel plus page preview; no precision dragging required.
- Announce applying/saving/exporting failures with actionable recovery. Preserve the prior working design if an export or font load fails.

## Preview and export experience

The final PDF is authoritative for fonts and page breaks. The interactive document view can update quickly while editing, but must not imply it is already the exact paginated export.

Reuse `ResumeExportPreview` and `buildResumePDFArtifact`. Build a PDF after a deliberate preview action or a debounced settled design change; cancel/ignore outdated results. Cache the reviewed bytes and download those same bytes when the signature is unchanged.

Proposed export choices:

| Export | Purpose | Fidelity contract |
|---|---|---|
| Designed PDF | Selected layout for human review | Exact preview of the downloadable PDF |
| Application PDF | Conventional single-column document | Same included content, clear headings, real text, body contact details; preview before download |
| Editable Word | Practical editable companion | Selected typography/colors/order where supported, explicitly linear; do not promise pixel-identical pages |

Generating an application version must preserve the user's included sections, facts, and entry order. Explain unavoidable presentation changes; do not silently move content into a fundamentally different narrative. Universal ATS guarantees are out of scope. [Greenhouse's current parsing guidance](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse) supports this separation.

## Implementation architecture

### Shared presentation schema

Add a versioned `ResumeDesignConfig` beneath `workspace.presentation.design`. It should include template ID/version, page settings, typography, color roles, layout, section placement/order/visibility, per-section overrides, and break rules. Content remains in `CanonicalResume` and source snapshots; section/entry references use stable IDs.

Template presets resolve into this configuration. Font catalog entries describe bundled assets, available weights, language coverage, and the Word fallback. Validate finite numbers, units, known enum values, colors, and references; do not persist arbitrary CSS or executable expressions.

Update both serialization and `safePresentation`/read migration paths. The reader currently carries extra fields forward; introduce explicit design validation instead of relying on an unchecked spread. Tests must prove save → reopen → export equivalence.

### Shared composition, renderer-specific pagination

Build a typed `DocumentPlan` from canonical content, the resolved design, and a template composition definition. It carries ordered semantic blocks, inline text, source references, section regions, and keep/break instructions.

Use shared primitives for identity, role, bullet, project, credential, publication, and section blocks. Template definitions determine composition and defaults; they should not be twenty independent copies of rendering logic.

HTML and PDF adapters consume the same content plan, font assets, and physical design values. Continue using the existing PDF renderer to paginate; do not build a separate custom typesetting engine unless pilot evidence shows it is necessary. Word consumes the same ordered content and its documented supported-style subset. Browser layout and Word pagination can still differ, so the actual PDF preview remains essential.

An export signature includes content hash, design configuration/version, template renderer version, font asset version, page size, and export mode. It must invalidate cached bytes for any material design change. Design-only edits do not modify the source content hash or truth ledger.

### Compatibility and integration

- Keep existing template IDs, aliases, and legacy rendering. Introduce a version per saved design; do not make an old résumé change appearance merely because its template code was upgraded.
- Offer explicit migration to version 2 with a preview and retain the original saved version. An old record without version metadata uses the existing rendering contract until migrated.
- Preserve current layout entitlements: three free and seventeen paid selectable templates. Customization pricing is a separate product decision, not an automatic build-side change.
- Route the résumé workspace, public gallery, template lab, application-kit exports, and saved-version downloads through the same design resolver. Search for all callers before integration; upgrading only the visible studio is insufficient.
- Preserve import recovery, owned-resource boundaries, tailoring review, and approved content. This project is a presentation upgrade, not a replacement ingestion pipeline.

### Suggested code boundaries

Reuse the current modules rather than rename every renderer. Likely additions:

| Area | Work |
|---|---|
| `lib/resume-design/` | Types, defaults, validation, font catalog, migrations, design resolution, ordered document plan, export signature |
| `lib/resume-templates/catalog.ts` and `registry.ts` | Versioned presets, capabilities, family metadata; retain aliases and legacy entries |
| `lib/resume-workspace.ts` and persistence paths | Typed design save/reopen, migration, named styles |
| `components/resume-studio/ResumeDesignPanel.tsx` | Shared controls, quick/advanced groups, undo/reset, accessible section placement |
| HTML template modules | Shared physical tokens and semantic blocks, template composition definitions |
| `lib/resume-signature-pdf.tsx` / `lib/pdf-templates.tsx` | Shared fonts/configuration, keep/break policies, versioned export adapters |
| `lib/resume-signature-docx.ts` | Honest companion styling and section-order/configuration support |
| `ResumeExportPreview.tsx` | Design-aware signature, actual page feedback, exact-artifact reuse |
| Template browser/gallery/lab | Family/use filters, content-aware examples, comparison, v1/v2 preview fixtures |

Names are proposed boundaries, not a requirement to create every file before the pilot.

## Build sequence and completion gates

### Phase 0 — Baseline and specifications

Completed: code review, 20 HTML captures, 60 existing PDF outputs, 37 focused tests. Before coding, turn the four pilot anatomies into modest visual specifications, choose bundled fonts, and capture representative v1 fixtures. Add fixtures with genuinely different career content; the same executive fixture cannot validate a graduate résumé or academic CV.

### Phase 1 — Customization foundation

Implement the schema/resolver, persistence/migration, shared units/fonts, section IDs, document plan, and basic controls. Start with one single-column composition. Add design-aware artifact signatures and readable typography. Keep the production v1 path available.

Gate: every core control changes the final PDF, saves/reopens correctly, and leaves source content unchanged. Invalid settings recover clearly; late previews cannot overwrite newer designs.

### Phase 2 — Four pilots

1. **Technical Signal:** one-column, conventional application document.
2. **Editorial Authority:** two-column/supporting rail and long identity handling.
3. **Emerging Professional:** education/projects lead and sparse-content behavior.
4. **Academic Profile:** multi-page publication/research hierarchy.

These four stress different parts of the system before the remaining sixteen inherit it. Build the full core customizer in this phase, not after making twenty static designs.

Gate: real HTML and all PDF pages inspected; A4/Letter; sparse/normal/long role-specific content; saved edits and template switching; Word content/order and representative visual checks. Resolve the six existing continuation-page patterns in the shared pagination policies where feasible without shrinking text below the chosen readability range.

### Phase 3 — Complete the collection

- Add Executive Ledger, Strategy Brief, Finance Standard, Legal Brief, Engineering Core, and Product Signal: ten total.
- Add Data Evidence, Sales Momentum, Mission Impact, Career Pivot, Healthcare Precision, and Public Service: sixteen total.
- Add Editorial Signature, Creative Director, Architectural Grid, and Brutalist Voltage: twenty total.

For each, define anatomy, defaults, source-field mapping, empty/long behavior, and optional motifs. Test actual differentiating composition; a unique name or accent is insufficient.

Gate: all twenty work with the same shared controls; any capability differences are explicit. No template omits included content or creates an empty placeholder section.

### Phase 4 — Gallery and workspace integration

Show meaningful family/use-case/layout choices with readable previews. Let users preview their own content, clearly distinguish fictional examples, and compare two or three layouts. Keep template selection, design, and actual export preview close together in the existing résumé-first flow.

Gate: upload/import → general résumé or paste JD/tailor → review → select/customize → preview → export → save/reopen works end to end. Integrate all export callers and entitlement checks.

### Phase 5 — Release verification

Validate the matrix below, record representative visual outputs and limitations, then enable v2 deliberately. A plan-only review does not authorize a new deployment or computer shutdown in this turn.

## Acceptance matrix

| Dimension | Required evidence |
|---|---|
| Content | Included field inventory across HTML/PDF/Word; no fabricated copy; highlights retain attribution; hidden content remains recoverable |
| Identity | Long/multiword/hyphenated names; diacritics and URLs; no isolated final letter or overlapping dates |
| Pagination | A4/Letter, sparse/full/long, manual breaks, orphaned headings, long entries, multiple pages; inspect every page of representative stress outputs |
| Fonts | Assets/weights load in browser and PDF; known language coverage; missing-glyph handling and export errors are explicit; no unsupported universal multilingual claim |
| Customization | Each control affects expected output, survives reopen, works with undo/reset, and handles switching between incompatible regions |
| Reading flow | Human chronology and text extraction order; contact details as real body text; linear application variant includes all selected facts |
| Color | Actual-surface contrast checks, grayscale/print choices; no silent applied-color mismatch |
| Word | Content and order for all twenty; representative documents opened/rendered to inspect type/spacing and page breaks; disclose editor-dependent pagination |
| Accessibility | Keyboard section movement, labelled controls, focus, readable mobile controls, undo feedback; do not claim tagged accessible PDFs without checking them |
| Performance | Responsive controls, settled export generation, stale-result rejection, bounded image/font assets, error recovery without losing edits |
| Compatibility | Old saved versions and 25 legacy IDs reopen/export; v2 migration is explicit; no accidental tier changes |
| Integration | All current résumé/export entry points use the resolver; upload and job-tailoring flows remain functional |

Tests should target these behaviors and real failure patterns rather than mirror every styling declaration. Use the existing template suites, add focused contract/pagination tests, and capture actual artifacts. Run the project's applicable type/lint/build and workflow checks during implementation; do not treat the 37 audit tests as a release pass.

## Open choices and recommended defaults

1. Structured editor versus free positioning: recommend structured controls for the first release; optional canvas later.
2. Customization entitlement: preserve existing access during development; decide pricing explicitly before release.
3. User-uploaded fonts and arbitrary document graphics: start with a curated font set and optional bounded image blocks; extend once font licensing, asset storage, and export behavior are designed.
4. Pixel-identical Word: retain an honest editable companion. Investigate richer Word layouts only after the core PDF collection is solid.

The first implementation milestone should be the shared design contract plus Technical Signal. The first reviewable collection should be the four pilots, followed by the remaining sixteen through the same engine.
