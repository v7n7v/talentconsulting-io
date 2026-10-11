---
name: ui-verify
description: "Verify a UI change in a real browser at every required breakpoint and in both themes, using scripts/ui-verify.js. Use this skill whenever you have changed anything that renders - a component, page, layout, style, responsive behaviour or theme - and before claiming any visual work is complete. Also use it when investigating a layout bug, horizontal overflow, text clipping or truncation, a mobile or responsive problem, a theme or contrast issue, a console error on a page, or when the user asks whether something looks right, works on mobile, or is broken at a particular width. Reach for it too when a screenshot of a page would answer the question faster than reading the code."
---

# Browser verification

## Why this is a command and not a checklist

This repo requires a real browser run at six widths in both themes before a UI change is complete, and names "declared complete without a browser run" as an anti-pattern. The rule kept being skipped for a simple reason: running one was manual and tedious, so under time pressure it lost.

`scripts/ui-verify.js` makes it one command. There is no longer a version of "I didn't have time" that holds up.

It also solves a specific blocker recorded in the repo: two resume-template captures are marked `blocked` because the in-app browser refused `localhost`. A local Playwright run has no such restriction.

## Running it

```bash
npm run dev                                   # in another terminal

node scripts/ui-verify.js /suite/resume
node scripts/ui-verify.js /suite/resume /suite/job-search      # several routes
node scripts/ui-verify.js /suite/resume --widths=320,390       # narrow first
node scripts/ui-verify.js /suite/resume --theme=light          # one theme
node scripts/ui-verify.js /suite/resume --json                 # machine-readable
```

Defaults: widths `320, 390, 430, 768, 1024, 1440`; themes `dark, light`; screenshots to `.ui-verify/`.

Exit code is 0 only when nothing failed. Notes alone do not fail the run.

## What it catches

| Check | Why it's in the list |
|---|---|
| **Horizontal overflow** | The most common responsive break here. Reports the offending elements by tag, class and how far they stick out - not just that overflow exists. |
| **Console errors** | A clean console is part of the completion bar. |
| **Clipped text** | `overflow: hidden` with no ellipsis - text silently vanishes. This repo has shipped it more than once via intrinsic min-content width. |
| **Touch targets under 44px** | The mobile standard. Checked below 768px only. |
| **Inputs under 16px** | iOS Safari zooms the page on focus and strands the user mid-viewport. Checked below 768px only. |
| **Ellipsis truncation** | Reported as a *note*, never a failure. Deliberate truncation is usually fine - but at 320px this repo has hidden the very label that mattered ("Seniority sign..."). |

## Start narrow

Run 320px first. Nearly every responsive failure appears there, and the diagnosis is cheapest with one width's output in front of you rather than twelve.

When something breaks at 320 but not 430, the cause is almost always one of three things: a missing `min-w-0` on a flex or grid child, a `whitespace-nowrap` on prose rather than on a number, or a fixed pixel width that should have been a max-width.

## The screenshots are the point

The script checks what a machine can check. It cannot tell you whether the result is *good*.

**Open the screenshots and look at them.** Every time. What the tool cannot see:

- Visual hierarchy - does the eye land where it should?
- Crowding, awkward gaps, unbalanced whitespace
- A card that technically fits but reads as cramped
- Contrast that passes a ratio but still feels muddy
- Whether the empty and missing states look intentional or look broken

A clean run means "no known defects", not "this is good". Those are different claims and only one of them is machine-checkable.

## Both themes, always

Dark is the default; light is where the bugs are. The same P0 has occurred twice in this repo: a global light-theme override inverting an intentionally dark surface while leaving light text on it - unreadable, and invisible if you only test dark.

If a surface is deliberately theme-invariant, scope it explicitly and say so in a comment rather than relying on the cascade.

## What it doesn't cover

Not a substitute for `node scripts/verify.js`, which runs the mechanical gates - types, tests, build, design drift, CVEs. Run both.

It also doesn't test interaction: focus traps, keyboard navigation, screen-reader output, or what happens after a click. Those still need thought, and modal focus traps in particular have been a recurring defect here - found by review, not by tooling.
