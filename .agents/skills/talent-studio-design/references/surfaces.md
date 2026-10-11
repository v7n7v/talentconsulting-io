# Per-surface rules

Not every surface follows the same rules. Some deviations are correct and deliberate; others are drift that hasn't been fixed yet. Knowing which is which prevents you from "fixing" something that's intentional, or preserving something that's a bug.

## Product UI - suite, tools, admin

The default. Everything in the main SKILL.md applies without exception.

Register: restrained surfaces, compact density, one accent, evidence states. `DESIGN.md` puts it well - these are pages for *repeated work*: scanning, comparison, editing, reviewing, deciding. Brand-page spectacle inside a suite tool makes daily work harder.

## Admin console

**Currently a parallel design system.** `components/admin/admin-command-grid.css` declares 30 `--admin-*` tokens and 39 distinct hex values, and **shadows 7 global token names with different values** (`--text-primary`, `--text-secondary`, `--text-tertiary`, `--theme-bg-card`, `--theme-border`, `--theme-shadow`, `--theme-surface-hover`). That shadowing is an active naming collision, not a shared contract - the same token name resolves differently depending on which file won.

**Decided direction:** admin folds into the main system. Its higher information density is preserved through a **density modifier** (`data-density="compact"`) that adjusts spacing and row height only.

Density is a layout concern. It does not justify a separate palette. When you touch admin, move it toward the shared tokens rather than extending the fork - and never add a new `--admin-*` color.

All 12 admin routes also bypass `SuiteToolShell`. New admin work should use the shell.

## Landing and marketing

Marketing may use larger type, more negative space, and motion. It may **not** invent its own colors.

The current failure isn't that marketing looks different - it's that `components/landing/GuidedCareerLanding.module.css` declares 14 local tokens and **136 distinct hex values** (the single worst file in the repo), while `app/for-teams`, `app/blog` and `app/templates` bypass tokens entirely with raw Tailwind literals like `text-cyan-400`, `text-emerald-500` and `text-slate-950`.

Divergence belongs in **scale and rhythm**, never in a private palette. A marketing page drawing from the same tokens at larger sizes still reads as the same company; one with its own greens does not.

`app/tools/*` is the model to copy - already token-driven, just with some inline `style={{}}` blocks to clean up.

## Email

**The healthiest surface in the repo** - `emails/tokens.ts` is a real shared theme with 18 named colors, and there are **zero hardcoded hex values across all 9 templates**. Every color flows from tokens through `TalentEmailLayout` and `EmailPrimitives`.

Two things to fix, both small:

1. Its brand color `#2E3FFF` matches nothing in `globals.css`. The token *values* need reconciling with the product accent - the structure is already right.
2. `tokenUrl`/`tacoMarkUrl` currently aliases the **TalentConsulting** mark, so Taco branding silently disappears in email. TACO is the assistant; TC is the company.

When adding an email template, keep the discipline that's already there: colors come from `emailTokens`, never inline.

## Resume templates - deliberately excluded

`components/resume-templates/` and `lib/resume-templates/` are **intentionally visually independent** and are excluded from the audit. They are documents rendered for employers, not product UI. Their fonts (Georgia, Cambria, Arial Narrow, Impact) are meant to be non-product, and they carry zero `dark:` variants because a resume must not invert with the app theme.

This separation has been verified clean. **Do not unify them.** The only cleanup worth doing is normalising their 86 distinct hex values into the `catalog.ts` palettes rather than scattering them across renderers.

## PDF / DOCX export - the real bug

Three parallel font systems, and the exports **do not match the web preview**:

- `@react-pdf/renderer` registers only Inter, then falls back to Helvetica in 34 places (`lib/pdf-templates.tsx`) and 33 places (`lib/resume-signature-pdf.tsx`).
- DOCX uses Arial, Georgia, Calibri and Cambria across `lib/resume-signature-docx.ts`; `lib/doc-export.ts` hardcodes Calibri with no color awareness.
- ~69 hex values are re-declared rather than imported from `catalog.ts`.

The consequence is user-visible: **the Editorial and Brutalist templates silently render as Helvetica.** A user picks a distinctive template, previews it, exports it, and gets something else - in the document they send to an employer.

This is the highest-priority unification target. It's a correctness bug wearing a consistency bug's clothes.

## Charts

Only 3 files use Recharts. **37 files hand-roll inline SVG** with hardcoded hex - that's where most in-`.tsx` color lives.

Rules when building any chart:

- **Assign categorical colors in fixed order, never cycled.** A ninth series is not a generated hue; it folds into "Other" or becomes small multiples.
- **Never a dual-axis chart.** Two measures at different scales become two charts, or index both to a common base. This is the single most common charting mistake and it reliably misleads.
- **Sequential = one hue, light to dark. Diverging = two hues with a neutral gray midpoint.** Never a rainbow, never a hue at the diverging midpoint.
- **Status colors are never series colors.** If a series *means* good/bad, it wears status tokens; if it's just "series 3", it wears categorical. Never both in one chart.
- **Text wears text tokens, never the series color.** A colored mark beside the label carries identity; the label itself stays in `--text-primary`/`--secondary`.
- **Legend for two or more series; direct labels for four or fewer.** Identity is never color-alone.
- **Dark mode is a selected set of steps, not an automatic flip.** Validate against the dark surface.
- **Validate the palette programmatically** for contrast and colorblind separation. Don't eyeball it - adjacent-pair separation is not something human judgement is good at.

Charts also carry evidence states: a projection is inferred, a measured value is verified, and a gap in the series is missing - not zero. A line that drops to zero because data is absent is a lie told by a default.
