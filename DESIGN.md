---
name: Talent Studio
version: 1.0.0
framework: Next.js 15 (App Router)
styling: Tailwind CSS + CSS Custom Properties
theme: dual (light / dark)
font:
  family: Inter
  weights: [400, 500, 600, 700, 900]
  source: next/font/google
icon:
  family: Material Symbols Rounded
  fill: 0
  weight: 300
  optical-size: 24
---

# Talent Studio — Design System

> "Functional Elegance" — Inspired by Google AI Studio.
> Every surface is intentional. Every color has a purpose.

## 0. Skill-Backed UI Workflow

These local Codex skills are part of the design process for every product-facing UI change:

| Skill | Use When | Project Value |
|-------|----------|---------------|
| `frontend-ui-engineering` | Building or modifying any user-facing page, component, workflow, layout, or state | Keeps implementation production-grade: composition, accessibility, responsive behavior, state clarity, realistic content, and maintainable UI boundaries |
| `impeccable` | Auditing, polishing, redesigning, or making an interface feel premium | Catches AI-looking patterns, weak hierarchy, bad wrapping, excess cards, dull motion, cognitive load, and visual drift |
| `playwright` | Verifying local browser behavior after UI changes | Requires real-page checks: load, fill, click, run the workflow, inspect screenshots, console errors, overflow, and responsive states |
| `figma-implement-design` | Implementing from Figma specs | Preserves visual fidelity and token discipline when a Figma design is the source of truth |
| `figma-generate-design` | Creating/updating Figma screens from the app or product plan | Helps maintain design-system alignment when screens need to be represented in Figma |
| `screenshot` | Capturing desktop/system visual evidence when browser screenshots are insufficient | Supports visual QA and bug reporting |

### Mandatory UI Change Gate

No substantial UI change is considered complete until all relevant checks pass:

1. Use `frontend-ui-engineering` standards while building: component focus, simple state, accessible controls, real content, and responsive layout.
2. Use `impeccable` standards while reviewing: hierarchy, spacing rhythm, typography, color restraint, motion, copy, edge states, and anti-pattern detection.
3. Run the local browser route for the changed tool.
4. Exercise the core workflow, not only the empty state.
5. Capture or inspect the result state visually.
6. Check desktop, tablet/narrow, and mobile breakpoints when the layout changed.
7. Confirm there is no horizontal overflow, clipped dropdown/sheet, broken icon alignment, stacked numbers, or awkward mid-word wrapping.
8. Check browser console errors. Known third-party or auth noise may be noted, but app runtime errors must be fixed.
9. Run `npm run type-check`; run `npm run build` for substantial feature or layout changes.

### Launch readiness references

Use these documents before a public launch, preview launch, or stakeholder review:

- `docs/launch-readiness-runbook.md` for the launch process, no-secret handling, brand asset checks, and release decision format.
- `docs/ui-ux-launch-checklist.md` for product UI, wrapping, accessibility, brand, documentation, and browser QA checks.

### Product Register

Talent Studio suite pages are **product UI**, not marketing pages. Design serves repeated work: scanning, comparison, editing, applying, reviewing, and decision-making. Default to restrained surfaces, clear hierarchy, and compact control density. Do not use brand-page spectacle inside suite tools.

### UI/UX Upgrade Goal

The active product goal starts with a UI/UX upgrade. The suite should feel like a career command center before deeper automation is added.

The upgrade must create:

- a dashboard that works as the user's daily command center
- compact navigation grouped around career workflow stages
- a persistent Sona context panel for next actions, evidence, and risk notes
- application packets as the main review-first workflow
- proof panels for every AI output, including facts preserved and missing requirements
- clear empty, loading, result, and error states
- a mobile review flow for quick approvals, saved jobs, and follow-ups
- a command palette for frequent actions

Treat this as the baseline for future product work. New Career Twin, Proof Engine, application, interview, and billing features should fit this shell instead of adding isolated page patterns.

## 1. Color Tokens

### Dark Mode (default)

| Token              | Value                         | Usage                              |
|--------------------|-------------------------------|-------------------------------------|
| `--bg-deep`        | `#0b0b0b`                     | Page background                    |
| `--bg-surface`     | `#131314`                     | Card / section background          |
| `--bg-elevated`    | `#1a1a1b`                     | Elevated surfaces (modals, inputs) |
| `--bg-input`       | `#1e1e1f`                     | Input field bg                     |
| `--bg-hover`       | `#1f1f21`                     | Hover state bg                     |
| `--border`         | `#444746`                     | Primary border                     |
| `--border-subtle`  | `#2d2d2f`                     | Default card border                |
| `--text-primary`   | `#f1f1f1`                     | Headings, body text                |
| `--text-secondary` | `#9ca0a0`                     | Labels, descriptions               |
| `--text-muted`     | `#5f6368`                     | Tertiary/disabled text             |
| `--accent`         | `#a8c7fa`                     | Links, active elements             |
| `--card-bg`        | `#1a1a1b`                     | Card background (opaque)           |

### Light Mode

| Token              | Value                         | Usage                              |
|--------------------|-------------------------------|-------------------------------------|
| `--bg-deep`        | `#ffffff`                     | Page background                    |
| `--bg-surface`     | `#f8f9fa`                     | Card / section background          |
| `--bg-elevated`    | `#f1f3f4`                     | Elevated surfaces                  |
| `--bg-hover`       | `#e8eaed`                     | Hover state bg                     |
| `--border`         | `#dadce0`                     | Primary border                     |
| `--border-subtle`  | `#e8eaed`                     | Default card border                |
| `--text-primary`   | `#111111`                     | Headings, body text                |
| `--text-secondary` | `#444746`                     | Labels, descriptions               |
| `--text-muted`     | `#9aa0a6`                     | Tertiary/disabled text             |
| `--accent`         | `#1a73e8`                     | Links, active elements             |
| `--card-bg`        | `#ffffff`                     | Card background                    |

### Semantic Tags (used across both modes)

| Tag        | Dark bg/text                       | Light bg/text                        |
|------------|-------------------------------------|--------------------------------------|
| Amber      | `rgba(253,214,99,0.15)` / `#fdd663` | `rgba(249,171,0,0.12)` / `#e37400`  |
| Blue       | `rgba(168,199,250,0.15)` / `#a8c7fa`| `rgba(26,115,232,0.12)` / `#1a73e8` |
| Purple     | `rgba(210,168,255,0.15)` / `#d2a8ff`| `rgba(161,66,244,0.12)` / `#9334e6` |
| Green      | `rgba(129,201,149,0.15)` / `#81c995`| `rgba(24,128,56,0.12)` / `#188038`  |
| Rose       | `rgba(242,139,130,0.15)` / `#f28b82`| `rgba(217,48,37,0.12)` / `#d93025` |

---

## 1.1 Icon System

Static app icons are neutral. Tool-identifying, decorative, section, tab, empty-state, header, and card icons should use `var(--text-muted)`, `var(--text-primary)`, or `currentColor`; they should not use emerald, cyan, amber, rose, blue, purple, or inline hex colors just to decorate the UI.

Use these utilities:

| Utility | Usage |
|---------|-------|
| `.icon-neutral` | Static/decorative icons that should follow the neutral theme tone |
| `.icon-current` | Icons inside buttons or links that should inherit text color |
| `.icon-shell-neutral` | Icon containers with neutral background, border, and icon color |
| `.icon-status-success` | Success/complete status icons only |
| `.icon-status-warning` | Warning/attention status icons only |
| `.icon-status-danger` | Error/destructive status icons only |

Exceptions:

- Sidebar active navigation icons keep their route color and active rail.
- Status, score severity, progress, charts, badges, and data visualizations may use restrained semantic color.
- Sona marks, logos, resume templates, and user-facing generated design outputs keep their own visual systems.

---

## 2. Typography

| Role       | Classes                                    | Size    | Weight |
|------------|--------------------------------------------|---------|--------|
| Page Title | `text-2xl lg:text-3xl font-bold`           | 24–30px | 700    |
| Section    | `text-lg font-semibold`                    | 18px    | 600    |
| Body       | `text-sm`                                  | 14px    | 400    |
| Label      | `text-xs font-medium`                      | 12px    | 500    |
| Caption    | `text-[10px]`                              | 10px    | 400    |
| Stat Value | `text-3xl font-black tabular-nums`         | 30px    | 900    |

> **Always use `var(--text-primary)` for headings and `var(--text-secondary)` for body labels.**
> **Never hardcode `text-white` or `text-silver` in components — they break in light mode.**

### Text Wrapping Rules

Text wrapping is a first-class design requirement. Every current and future tool must preserve readable line lengths and avoid awkward one-word stacks.

- Use `min-w-0` on every grid/flex child that contains text.
- Use `premium-heading-wrap` or `text-balance` for card headings and empty-state headlines.
- Use `premium-copy-wrap` or `text-pretty` for body copy.
- Use `wrap-natural` for normal generated prose, role names, company names, and action text. It wraps at good boundaries and avoids ugly mid-word splits.
- Use `wrap-anywhere` only for strings that can contain unbroken long tokens: URLs, filenames, emails, IDs, and compact chips with no reliable spaces.
- Do not use hero-sized text inside cards, side panels, narrow drawers, or tool consoles. Compact cards should use `text-lg` or `clamp()`-based sizing.
- Do not use negative letter spacing. Keep `letter-spacing: 0`; uppercase labels may use restrained tracking only when they have enough width.
- Avoid `whitespace-nowrap` except for tiny badges, dates, icons, or controls that have a guaranteed minimum width.
- Long chips must wrap within their pill or truncate intentionally with a tooltip; they must never widen the page or create hidden horizontal overflow.
- Score/stat cards must reserve fixed space for icons and use `whitespace-nowrap tabular-nums` for numeric values; numbers must never stack vertically.
- If a card can be narrower than 420px, test it at that width and adjust type size, line-height, or layout before shipping.

---

## 3. Spacing

| Scale  | Value  | Usage                          |
|--------|--------|--------------------------------|
| xs     | 4px    | Icon gap, micro padding        |
| sm     | 8px    | Inner card padding, badge gap  |
| md     | 16px   | Section spacing                |
| lg     | 24px   | Card padding                   |
| xl     | 32px   | Page section gaps              |
| 2xl    | 48px   | Hero/header vertical spacing   |

---

## 4. Components

### Card (`.glass-card`)

```
background: var(--card-bg)
border: 1px solid var(--border-subtle)
border-radius: 12px
hover: border-color → var(--border)
```

- **Cards are OPAQUE.** Dark = `#1a1a1b`, Light = `#ffffff`.
- No backdrop-filter, no box-shadow, no gradient fills.
- **Never use `background: transparent` on cards** — it causes content bleed-through.
- Never apply `bg-white`, `bg-black`, or colored fills directly — use `var(--card-bg)`.
- Cards are not the default answer. Use them for repeated items, grouped controls, modals/sheets, tool surfaces, and state summaries. Do not wrap every section in another card.
- Never put cards inside cards unless the inner element is a distinct repeated item, input group, or selectable row with a real interaction role.
- Keep corner radii intentional: repeated cards usually `rounded-[16px]` to `rounded-[22px]`; compact controls `rounded-[10px]` to `rounded-[14px]`.

### Button (Primary)

```
background: linear-gradient(135deg, accent1, accent2)
border-radius: 12px (rounded-xl)
padding: 10px 20px
font: 14px / font-bold
color: white
```

### Status Badge

```
display: inline-flex
align-items: center
gap: 6px
padding: 4px 12px
border-radius: 8px (rounded-lg)
font-size: 12px / font-medium
border: 1px solid ${status.border}
background: ${status.bg}   (always 10-20% opacity tint)
color: ${status.text}
```

### Input

```
background: var(--bg-surface) | var(--bg-elevated)
border: 1px solid var(--border-subtle)
border-radius: 12px (rounded-xl)
padding: 10px 16px
font-size: 14px
color: var(--text-primary)
placeholder: var(--text-tertiary)
focus: border-color → accent/50, ring → accent/20
```

### Stat Card

```
border: 1px solid var(--border-subtle)
background: var(--bg-surface)
border-radius: 16px (rounded-2xl)
padding: 20px
icon: 24px in tinted 48px rounded-xl container
value: text-3xl font-black
label: text-xs text-[var(--text-secondary)]
```

- Reserve fixed space for icons, gauges, rings, and status indicators.
- Numeric values use `tabular-nums` and `whitespace-nowrap`.
- A stat card must still work with 2-4 digit values, currency, percentages, and labels in both light and dark mode.
- If an icon overlaps a number at any tested width, the component is broken.

---

## 5. Layout Rules

### Page Header Pattern

Every suite tool page follows the shared `SuiteToolShell` + `SuiteToolHeader` pattern:

```
┌─────────────────────────────────────────────────────────┐
│  [Icon]  Title                          [Actions] [?]   │
│          Description                                    │
└─────────────────────────────────────────────────────────┘
```

- Standard shell width: `1120px`; workbench/editor/agent shell width: `1280px`.
- Header surface: `rounded-[24px]`, `var(--card-bg)`, `var(--border-subtle)`, no decorative gradient blobs.
- Left: neutral icon shell + Title (`text-2xl font-bold`) + Subtitle
- Right: Action buttons + `<PageHelp>` **always last (far-right)**
- Static tool icons use `.icon-shell-neutral` and `.icon-neutral`; active sidebar icons remain the navigation color exception.
- Workbench pages may use wider content, but their header and content must align to the same shell.

### Sidebar

- Width: `w-[200px]` collapsed `w-0`
- Background: `var(--sidebar-bg)`
- Items grouped: BUILD, SEARCH & APPLY, PREPARE, GROW
- Active item: `var(--sidebar-active)` bg + `var(--sidebar-text-active)` text
- Gap between items: `gap-0.5` (2px)

### Mobile Quick Tools

Mobile suite pages do not use a bottom navigation bar. The sidebar/mobile menu remains the complete navigation system, and the mobile shortcut layer is a top quick-tools rail.

- `MobileQuickToolsRail` appears near the top of suite pages on screens below `1024px`.
- The rail contains only frequent actions: Sona, Resume Check, Humanize, ATS Score, Applications, Follow-up, and Interview Prep.
- `More tools` opens a top sheet grouped by career workflow: Build, Search and Apply, Prepare, Grow.
- Dense tools stay accessible, but may be marked `Best on desktop` in the sheet.
- Sticky bottom bars are reserved for active workflow actions only, not navigation.

### Shared Components

| Component             | Location                           | Usage                              |
|-----------------------|------------------------------------|------------------------------------|
| `ResumeLibraryPicker` | `components/ResumeLibraryPicker.tsx`| Resume selection across all tools |
| `PageHelp`            | `components/PageHelp.tsx`          | Help tooltip on every page header |
| `Toast`               | `components/Toast.tsx`             | Success/error notifications       |

### Workbench Pages

Use the workbench pattern for suite tools that combine inputs, intelligence, and actions:

```
Header
Command / Context Strip
Primary Work Surface
Secondary Intelligence / Actions
Result / Review State
```

- Keep setup controls in a stable dock or command strip when they influence the whole page.
- Avoid narrow columns for dropdowns, resume pickers, long role names, or generated explanations.
- If a picker contains many items, use a modal/sheet or full-width panel, not a clipped menu inside a small card.
- Important result states must feel designed, not dumped: verdict, score, explanation, and next action each need clear space.
- Advanced details should be collapsed or placed in a secondary panel so the default state stays calm.

### Browser Verification Standard

For any changed tool route:

- Open the local route in a browser.
- Verify empty, loading, result, error, and narrow-width states when relevant.
- Use realistic content with long role names, company names, salary text, dates, emails, URLs, and generated prose.
- Screenshot or inspect the final result state before reporting completion.
- If browser automation cannot fill the UI directly, use a mocked API/browser route to force the result state and inspect the rendered screen.
- Do not rely on `npm run build` alone for UI correctness.

---

## 6. Do's and Don'ts

### ✅ DO

- Use `var(--text-primary)` for all heading text
- Use `var(--text-secondary)` for all label/description text
- Use `var(--text-muted)` or `var(--text-tertiary)` for tertiary info
- Use `var(--bg-surface)` for card backgrounds
- Use `var(--bg-hover)` for hover states
- Use `var(--bg-elevated)` for raised surfaces
- Place `<PageHelp>` as the **last element** in every header flex row
- Add `outline-none focus:outline-none` to clickable card containers
- Use `pointer-events-none` on decorative icons inside inputs

### ❌ DON'T

- Don't hardcode `text-white` or `text-silver` — breaks in light mode
- Don't use `bg-white/5` or `bg-white/10` — invisible in light mode
- Don't use `hover:bg-white/10` — use `hover:bg-[var(--bg-hover)]`
- Don't use raw `bg-black` or `bg-white` on surfaces
- Don't nest cards inside cards
- Don't use purple/violet as primary accent (brand is TalentConsulting blue on landing)
- Don't fabricate certifications, credentials, or achievements in AI outputs
- Don't mix `glass-card` with inline `background` styles
- Don't place `<PageHelp>` anywhere other than far-right in the header

---

## 7. Accessibility

- Minimum contrast ratio: **4.5:1** (WCAG AA)
- All interactive elements: keyboard accessible with visible focus indicator
- Icons: always paired with text labels (or `aria-label`)
- Status colors: always paired with icon + text label (not color-alone)
- Motion: `prefers-reduced-motion` respected via Framer Motion
- Theme: respects `prefers-color-scheme` with manual override via `data-theme`

---

## 8. AI Guardrails

> **Anti-Fabrication Policy:** AI-generated content must never invent certifications, degrees, work experience, skills, or achievements that don't exist in the user's actual resume data. The system uses tool-assisted fetching from Firestore to populate context — not hallucination.

---

## 9. Motion

| Effect           | Library         | Duration   | Easing       |
|------------------|-----------------|------------|--------------|
| Page entry       | Framer Motion   | 300ms      | ease-out     |
| Card stagger     | Framer Motion   | 50ms delay | spring       |
| Button press     | `whileTap`      | instant    | scale(0.97)  |
| Hover lift       | `whileHover`    | 150ms      | y: -2px      |
| Dropdown         | AnimatePresence | 200ms      | ease-in-out  |
| Progress bar     | Framer Motion   | 1000ms     | ease-out     |
