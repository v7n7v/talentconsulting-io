# Talent Studio UI Design Guide

This guide translates the installed frontend skills into practical rules for Talent Studio. `DESIGN.md` remains the source of truth for tokens and system rules; this file explains how to apply them while building pages.

## 1. Operating Standard

Every suite tool should feel like a premium product console: calm, useful, fast to scan, and hard to break. The user should never feel trapped in a narrow card, confused by disconnected whitespace, or surprised by a broken result state.

Use these skills as mandatory lenses:

- `frontend-ui-engineering`: build production-quality components, state, accessibility, responsive layout, and performance.
- `impeccable`: critique hierarchy, layout, typography, color, motion, copy, edge cases, and visual polish.
- `playwright`: run local browser flows and capture/inspect the actual rendered UI after changes.
- `figma-implement-design`: use when implementing from Figma.
- `figma-generate-design`: use when creating/updating Figma screens from the app.
- `screenshot`: use for desktop/system captures when browser capture is not enough.

## 2. Product Design Philosophy

Talent Studio suite pages are product UI, not landing pages.

- Prioritize repeated work: scanning, editing, comparing, deciding, saving, exporting, applying.
- Keep the first screen useful. Avoid marketing hero sections inside the suite.
- Use restrained surfaces, subtle borders, low shadows, and clear state colors.
- Use cyan/emerald for meaningful active, ready, success, and intelligence states.
- Use amber/red only for risk, blockers, warnings, or destructive actions.
- Avoid generic AI aesthetics: purple-heavy palettes, noisy gradients, glowing blobs, identical card grids, huge hero type inside tools, and decorative glass.
- Keep delightful motion purposeful: progress, state transition, focus, completion, or Sona thinking.

## 3. Page Pattern

Use this structure for most tools:

1. Header: icon, title, concise subtitle, actions, `PageHelp` far right.
2. Context strip or evidence dock: selected resume, target role, company, source, save status, or workflow context.
3. Main workbench: the primary task surface.
4. Intelligence or action panel: secondary details, recommendations, packet/output actions.
5. Review/result state: score, summary, next action, export/save/track.

Rules:

- Keep global setup controls out of cramped side cards.
- Use modals/sheets for large pickers, especially saved resumes and long lists.
- Keep advanced details collapsed by default unless the user is clearly in power-user mode.
- Do not create four equal vertical columns unless each column has a distinct job and balanced visual weight.
- If a workflow can run in the background, show progress in-place and preserve user context.

## 4. Typography And Wrapping

Text wrapping is a release blocker.

- Body line length should usually stay under 65-75 characters.
- Use balanced headings and pretty body wrapping.
- Use `min-w-0` for every grid/flex child that contains text.
- Use `wrap-natural` for generated prose, role names, company names, recommendation text, and normal labels.
- Use `wrap-anywhere` only for unbroken tokens: URLs, filenames, emails, IDs, and compact chips.
- Use `whitespace-nowrap` only for short badges, dates, tiny labels, and numeric stats with fixed space.
- Score numbers must use `tabular-nums whitespace-nowrap`.
- Do not allow numeric values to stack vertically.
- Do not use negative letter spacing.
- Do not use hero-scale type in cards, side panels, drawers, tables, compact dashboards, or result summaries.
- If a card can be narrower than 420px, test that width with realistic long text.

## 5. Cards, Panels, And Controls

Cards should communicate structure, not decorate everything.

- Use cards for repeated items, modals/sheets, grouped controls, selected records, and tool surfaces.
- Avoid cards inside cards. If nesting is necessary, the inner item must be interactive or repeated.
- Controls should be familiar: icon buttons for obvious tools, segmented controls for modes, toggles for binary settings, sliders/steppers for numbers, menus for option sets, tabs for views.
- Avoid native system dropdowns when the design language needs a custom premium control.
- Chips must wrap or truncate intentionally and never widen the page.
- Gauges, rings, and indicators must reserve fixed layout space.
- Empty states should show the next action and readiness, not a blank marketing message.

## 6. Motion And Sona Thinking

Motion should make work feel alive without becoming noisy.

- Prefer transform and opacity. Do not animate layout properties.
- Respect `prefers-reduced-motion`.
- Use the shared Sona thinking pattern for long-running AI work.
- Show the active stage clearly: scan, diagnose, humanize, verify, export, parse, compare, prepare, save.
- Progress indicators should remain inside their card boundaries and not overlap text or numbers.
- Animations should be subtle but visible enough that users know work is happening.

## 7. Accessibility

Use WCAG 2.2 AA as the baseline.

- Every interactive element must be keyboard reachable.
- Drag/drop actions must have a visible non-drag alternative.
- Focus states must be visible in light and dark mode.
- Status must not rely on color alone; pair color with text and icon.
- Use `aria-live` for long-running progress and save states.
- Inputs need labels or accessible names.
- Buttons must have clear action copy, especially when destructive or irreversible.

## 8. Responsive Behavior

Desktop and mobile can differ, but both must feel intentional.

- Desktop workbenches may use two or three zones only when each zone has enough width.
- Tablet should collapse to two zones or stacked sections.
- Mobile should stack: header, context strip, primary action, result cards, secondary details.
- Avoid fixed-width panels that create hidden right-side slivers.
- Modal/sheet widths must be viewport-aware.
- Do not ship horizontal overflow.
- Test at desktop, tablet/narrow, and mobile widths for major layout changes.

## 9. Browser QA Gate

For every meaningful UI change:

1. Open the local route in the browser.
2. Test the actual workflow, not just the initial page.
3. Verify empty/loading/result/error states where relevant.
4. Use realistic long content.
5. Inspect light and dark mode when colors or surfaces changed.
6. Capture or inspect the final rendered state.
7. Check console errors.
8. Run `npm run type-check`.
9. Run `npm run build` for substantial UI or workflow changes.

Known third-party script or unauthenticated API noise may be documented, but app runtime errors, layout overflow, broken wrapping, overlapped indicators, and clipped controls must be fixed before completion.

For launch checks, use `docs/ui-ux-launch-checklist.md` with this browser gate. Use `docs/launch-readiness-runbook.md` when the work also touches metadata, brand assets, setup guidance, or release notes.

## 10. Anti-Patterns To Reject

- One long vertical column when two balanced zones would reduce cognitive load.
- Tiny narrow menus for complex pickers.
- Result cards where indicators overlap values.
- Mid-word wrapping in normal prose.
- Empty whitespace that disconnects related controls.
- Generic “AI dashboard” cards with the same icon-heading-copy pattern repeated.
- Gradients/orbs used as decoration inside product tools.
- Native dropdowns that visibly clash with the suite design language.
- Help icons anywhere except the top-right header/action area.
- Design changes declared complete without a browser run.
