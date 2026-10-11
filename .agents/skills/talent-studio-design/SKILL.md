---
name: talent-studio-design
description: "Talent Studio (talentconsulting-io) house rules for anything that renders: React/TSX components, pages, suite routes, landing, admin, email templates, PDF export. Load it before you write or change markup, CSS variables, or Tailwind classes here - colors, spacing, radius and type come from tokens, shared primitives (Card, Button, EvidenceBadge, SuiteToolShell) are mandatory, several common utility classes are banned, and AI-derived values must show their evidence state (verified/inferred/draft/missing) with no invented placeholder numbers. Applies to: adding a screen, card, badge, table, chart, or empty/loading/error state; picking or debugging a token, theme, or style that is not rendering; reviewing a diff that touches UI; and any \"make it look better / more premium / more consistent\" request. Most such asks arrive worded as ordinary feature or bugfix work and never mention design - treat visible output as the trigger, not the word \"design\"."
---

# Talent Studio design system

## Why this exists

This repo already had a design system. It failed - not because the ideas were wrong, but because it was advisory and self-contradictory, so drift was the rational outcome. A measured audit found 465 distinct hardcoded hex colors, 1,290 prohibited class occurrences (262 of them CSS-level, invisible until the audit was extended), 301 hand-rolled buttons against 22 uses of the shared one, and 22 of 43 suite routes bypassing the shell.

The lesson shapes how you should use this skill: **the rules below are not style preferences to weigh against velocity.** They are the difference between a product that reads as one thing and 43 pages that read as 43 teams. When a rule blocks you, the answer is to find the sanctioned way to do it, not to make an exception - because every exception here was also, at the time, reasonable.

Run `node scripts/design-audit.js` to see current numbers.

## The idea: evidence you can see

Talent Studio's promise is that nothing is invented, everything is inspectable, and nothing leaves without the user's approval. The design system encodes that promise directly.

**Color carries epistemic status, not decoration.** Every AI-touched value on screen answers one question: how much should the user trust this? Four states cover it:

| State | Meaning | Treatment |
|---|---|---|
| **Verified** | from the user's resume or a trusted source | full ink, solid left rule |
| **Inferred** | model reasoning, not established fact | secondary ink, dotted left rule |
| **Draft** | generated, awaiting review | accent-tinted surface, provisional marker |
| **Missing** | no evidence exists | dashed outline, muted ink - never a zero |

Encode state primarily through **weight, rule style and ink** - not hue. That keeps the color budget small, survives 320px, and satisfies "never color alone" by construction. Hue is reserved for one accent and four fixed status colors.

That last row is the one people get wrong. `design-qa.md` has stripped it repeatedly: **unknown evidence stays unknown.** A missing ATS score is not 0%. An unmeasured match is not "low". If you find yourself rendering a placeholder number so the layout looks balanced, stop - the empty state *is* the design.

Read `references/evidence-states.md` before implementing any surface that shows AI output.

## Non-negotiables

**No hardcoded colors.** Every color comes from a token. `#0891b2` in a `.tsx` file is a bug even if it happens to be the right blue - because the next person changes the token and yours silently diverges. Use `var(--...)`; if the token you need doesn't exist, add it to the token file rather than inlining a value.

**These classes don't belong in this product:**

| Pattern | Why |
|---|---|
| `text-white` | breaks theming - use `var(--text-primary)` |
| `bg-white/N`, `bg-black` | ignores the theme - use a surface token |
| `backdrop-blur` | glass is not this product's language |
| `bg-gradient-to-*` | surfaces are flat; gradients are decoration |
| `shadow-{sm,md,lg,xl}` | elevation is expressed with borders |
| `bg/text/border-{purple,violet,indigo,fuchsia}-N` | purple is not an accent here |

**Use the shared primitives.** A card is the card component; a button is the button component. If the shared one can't do what you need, extend it - a variant helps everyone, a bespoke `<div className="rounded-2xl border p-4">` helps only this screen and costs everyone later.

**Suite routes use `SuiteToolShell` + `SuiteToolHeader`.** The shell owns width, the header layout, and `<PageHelp>` position (always far-right). Bypassing it is how you get 43 subtly different page headers.

**Radius comes from the scale.** Not `rounded-[13px]` because it looked better next to that one icon. Near-miss values (11, 13, 14px) read as accidental to users even when they can't name why.

**Text wrapping is a release blocker here, not a polish item.** Put `min-w-0` on every text-bearing flex/grid child. Use `wrap-anywhere` only for URLs, IDs and filenames - never prose, role titles or company names. Stat numbers get `tabular-nums whitespace-nowrap` and never stack. Test any card that can go below 420px. This repo has shipped clipping bugs from intrinsic min-content width more than once.

**Theme-invariant surfaces need an explicit boundary.** The same P0 has happened twice: a global light-theme override inverted an intentionally dark surface while leaving light text on it. If a surface is deliberately dark in both themes, scope it and say so in a comment - don't rely on the cascade.

## Building something new

The happy path, in order:

1. **Check whether it exists.** Search `components/` before creating. This repo's problem is duplication, not scarcity.
2. **Start from the shell.** New suite route → `SuiteToolShell` + `SuiteToolHeader`.
3. **Compose primitives.** Card, Button, Field, StatTile, EvidenceBadge. No inline containers.
4. **Reach for tokens, never literals.** See `references/tokens.md`.
5. **Mark the epistemic status** of anything the AI produced.
6. **Design the empty and missing states first.** They are more common than the happy path in a job search, and they're where fabrication creeps in.
7. **Verify** (below).

## Working on existing code

Most files predate this system, so full compliance isn't the bar on every edit. The bar is:

- **New code is fully compliant.** No exceptions - this is how the numbers come down.
- **Code you touch gets better, or at least no worse.** If you're editing a file with 40 `text-white` instances, you're not obliged to fix all 40; you are obliged not to add the 41st.
- **The audit never regresses.** `node scripts/design-audit.js --ci` fails the build if any metric worsens. It's a ratchet: you're never asked to fix everything at once, only to stop adding.

If a deliberate change legitimately increases a metric, run `--update` to re-record the baseline and say why in the commit. That's an honest conversation; silently drifting is not.

## Verification

A UI change isn't done until all of these pass:

```bash
node scripts/design-audit.js --ci   # no metric regressed
npm run type-check
npm run build                       # expect 180-181 static pages
```

Plus a **real browser run** at 320 / 390 / 430 / 768 / 1024 / 1440px, checking the core result state, a clean console, and no horizontal overflow. "Declared complete without a browser run" is a named anti-pattern in this repo - `design-qa.md` has caught real P0s that only appear at one width.

Check both themes. Dark is the default; light is where the cascade bugs live.

## Never fabricate UI content

No fake scores, mock saved data, sample rows that look real, or placeholder illustrations standing in for a feature. This is a product whose entire value proposition is that it doesn't invent things about your career. A mocked-up score in a screenshot becomes a mocked-up score in production more often than anyone expects.

If you need to show a component in isolation, label the data as sample, visibly.

## Reference files

| File | Read it when |
|---|---|
| `references/tokens.md` | picking any color, size, spacing or radius |
| `references/evidence-states.md` | building any surface that displays AI output |
| `references/surfaces.md` | working on admin, landing, email, PDF export or charts - each has its own rules and known deviations |

## Where the deeper context lives

- `docs/design-system-v2-plan.md` - the phased migration plan and its exit criteria
- `AGENTS.md` - repo-wide ground truth
- `DESIGN.md` / `UI_DESIGN_GUIDE.md` - **superseded where they conflict with this skill.** They contradict each other on cyan/emerald, gradients, card background and sidebar width. Don't resolve disputes against them.
- `.agent/.shared/ui-ux-pro-max/` - a generic design knowledge base that recommends Lucide icons and glassmorphism, both of which contradict this product. Reference only, never project law.
