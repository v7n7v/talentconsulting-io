# Token contract

Every color, size and radius in product UI comes from here. If you need something that isn't in this file, add it to the token file and document it - don't inline a literal.

## Why tokens are fragmented today

Tokens are currently defined across **6 files**, and **23 tokens are referenced but never defined anywhere** - they fall back silently, which is why some surfaces look subtly wrong in one theme only. Phase 1 of `docs/design-system-v2-plan.md` collapses these into one file.

Currently defining tokens: `app/globals.css`, `components/admin/admin-command-grid.css`, `components/resume-studio/resume-studio-system.css`, `components/resume-studio/resume-source-console.css`, `components/landing/GuidedCareerLanding.module.css`, `components/suite/proof-engine-report.css`.

**Undefined but referenced** (do not use these until they're defined): `--accent-primary`, `--bg-card`, `--bg-page`, `--bg-primary`, `--border-active`, `--font-brand`, `--font-inter`, `--font-mono`, `--observability-success`, `--plan-accent`, `--plan-accent-readable`, `--plan-border`, `--plan-button-text`, `--plan-surface`, `--shimmer-color-1/2/3`, `--suite-sidebar-content-offset`, `--tag-cyan-bg`, `--tag-cyan-text`, `--theme-fg`, `--theme-surface`, `--theme-text-tertiary`.

If you find yourself reaching for one of those names, that's a signal the token needs defining, not that you should inline a hex.

## Surfaces and ink

| Token | Dark | Light | Use for |
|---|---|---|---|
| `--bg-deep` | `#0b0b0b` | `#ffffff` | page canvas |
| `--bg-surface` | `#131314` | `#f8f9fa` | the default panel |
| `--bg-elevated` | `#1a1a1b` | `#f1f3f4` | cards, popovers, raised things |
| `--bg-input` | `#1e1e1f` | `#ffffff` | form fields |
| `--bg-hover` | `#1f1f21` | `#f1f3f4` | hover states |
| `--border-subtle` | `#2d2d2f` | `#e8eaed` | default separation |
| `--border` | `#444746` | `#dadce0` | emphasis, hover, focus rings |
| `--text-primary` | `#f1f1f1` | `#111111` | body and headings |
| `--text-secondary` | `#9ca0a0` | `#444746` | supporting copy, labels |
| `--text-muted` | `#80868b` | `#5f6368` | timestamps, disabled, hints, **missing state** |

### Why `--text-muted` changed

The previous values (`#5f6368` dark / `#9aa0a6` light) failed WCAG AA on every surface they were used on:

| Surface | Old | Measured |
|---|---|---|
| dark `--bg-surface` | `#5f6368` | 3.07:1 |
| dark `--bg-elevated` | `#5f6368` | 2.87:1 |
| light `--bg-surface` | `#9aa0a6` | 2.50:1 |
| light `--bg-elevated` | `#9aa0a6` | 2.37:1 |

That mattered more than a typical contrast miss, because `--text-muted` is the ink for the **missing evidence state** — the one users most need to be able to read. "We have no data for this" rendered at 2.37:1 is a message that quietly doesn't get delivered.

The replacements are the *closest* passing steps, chosen to keep the muted feel rather than jumping to high contrast: `#80868b` clears 4.72:1 on dark elevated, `#5f6368` clears 5.44:1 on light elevated. Both pass on `--bg-surface` too.

Elevation is a **border**, not a shadow. If something needs to feel raised, it moves up the surface scale and gains a border - it does not gain a shadow.

## Accent

Per `docs/design-system-v2-plan.md`, the accent is a **new hue family** replacing both the old Google-blue token and the stray emerald that shipped in the sidebar.

**No single hex clears 4.5:1 on both a near-black and a near-white surface** - a step light enough for dark mode is too light for white. So the accent is one hue family with a step per mode. That's not a workaround; it's the correct shape.

| Token | Dark | Light |
|---|---|---|
| `--accent` | `#0891b2` (5.04:1) | `#0e7490` (5.08:1) |

Validated alternatives, all clearing 4.5:1 in both modes: Sky `#0284c7`/`#0369a1`, Cobalt `#5a7fff`/`#315cff`, Azure `#1e88e5`/`#1565c0`. Teal was rejected - it sits too close to success green and blurs the distinction the evidence system depends on.

Use accent for: the primary action, focus rings, active navigation, and the draft evidence state. Not for decoration, not for "make this pop".

## Status - reserved, never reused

| Token | Dark | Light | Meaning |
|---|---|---|---|
| `--success` | `#81c995` | `#188038` | completed, healthy, verified-positive |
| `--danger` | `#f28b82` | `#d93025` | error, destructive, blocked |
| `--warning` | `#fdd663` | `#a85200` | needs attention, degraded, expiring |

Light `--warning` was `#e37400`, which measured **2.79:1** on `--bg-elevated` — below even the 3:1 graphic threshold, let alone 4.5:1 for text. `#a85200` clears 4.87:1 and reads as the same amber intent. If you need the brighter orange for a large decorative mark, that is the one case where a lighter step is defensible — but never for text or for an icon carrying meaning.

These four meanings are the only things these colors may express. A status color must never be used as "series 4" in a chart or as a decorative accent - if a user has learned that amber means attention, an amber bar that means nothing teaches them to stop trusting the encoding.

Status always ships with an **icon and a label**. Color alone fails WCAG and fails colorblind users — and the icon is what carries the meaning for anyone who can't distinguish the hue at all.

## Typography

Inter, weights 400/500/600/700. Material Symbols Rounded for icons (fill 0, weight 300, opsz 24).

| Role | Spec |
|---|---|
| Page title | `text-2xl lg:text-3xl font-bold` |
| Section heading | `text-lg font-semibold` |
| Body | `text-sm` |
| Label | `text-xs font-medium` |
| Caption | `text-[10px]` |
| Stat number | `text-3xl font-bold tabular-nums whitespace-nowrap` |

`font-black` and `font-extrabold` are not in the system - 69 uses exist and should migrate to `font-bold`. Never use negative letter-spacing. Never put hero-scale type inside a card, panel, drawer or table.

Stat numbers get `tabular-nums` so figures don't jitter as they update, and `whitespace-nowrap` so they never stack - a wrapped number reads as two numbers.

## Spacing

`4 / 8 / 16 / 24 / 32 / 48px`. In Tailwind: `1 / 2 / 4 / 6 / 8 / 12`.

The most-used values today are `gap-2`, `gap-3`, `p-4`, `p-3` - which is healthy. Avoid inventing half-steps (`p-2.5`, `gap-1.5`) unless there's a real optical reason; they compound into visible inconsistency across a page.

## Radius

**One scale. 32 distinct radius values currently exist; that is the drift, not the standard.**

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 8px | badges, chips, small controls |
| `--radius` | 12px | the default - cards, buttons, inputs |
| `--radius-lg` | 16px | stat cards, larger panels |
| `--radius-xl` | 24px | page-level header surfaces |
| `--radius-full` | 9999px | pills and avatars only |

Near-miss values (`rounded-[11px]`, `[13px]`, `[14px]`) are the worst offenders because users can't name what's wrong but can see that it is.

## Shells

| Shell | Width |
|---|---|
| Standard suite tool | 1120px |
| Workbench / editor / agent | 1280px |

Sidebar is 200px expanded, 0 collapsed, grouped **BUILD / SEARCH & APPLY / PREPARE / GROW**.

Mobile (below 1024px) has **no bottom nav bar** - `MobileQuickToolsRail` sits at the top. Sticky bottom bars are reserved for workflow actions (approve, submit, continue), never navigation.

## Icons

Neutral by default: `.icon-neutral`, `.icon-current`, `.icon-shell-neutral`. Icons are not decoration and don't carry brand color.

The only colored icons are: active sidebar items, genuine status indicators (`.icon-status-success|warning|danger`), chart marks, the TACO and TC brand marks, and resume template glyphs.

## Using tokens in Tailwind — a trap that ships broken

Arbitrary Tailwind values referencing a custom property need an explicit type hint:

```jsx
// WRONG - compiles to background-image, so the surface renders with no background
<div className="bg-[var(--bg-elevated)]" />

// RIGHT
<div className="bg-[color:var(--bg-elevated)]" />
<div className="text-[color:var(--text-primary)]" />
<div className="border-[color:var(--border-subtle)]" />
```

Without the hint Tailwind can't tell a color from an image URL and guesses wrong. It fails silently — no error, no warning, just a missing background that looks like a theming bug and gets debugged in the wrong place.

Prefer semantic utility classes where they exist. Reach for arbitrary values only when there isn't one, and always with the type hint.

## Colors in SVG

`var()` does **not** resolve in SVG presentation attributes in any browser. `fill="var(--success)"` renders black.

Use inline `style` or inherit through `currentColor`:

```jsx
<path style={{ fill: 'var(--success)' }} />   // works
<path fill="var(--success)" />                // renders black
```

This is the most common cause of "the chart looks right in dev and wrong in production" — because in dev you're often looking at a hardcoded placeholder color that someone meant to replace.
