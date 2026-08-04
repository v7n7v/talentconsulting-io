# The landing page — `components/landing/`

`app/page.tsx` renders `TalentLanding`. `GuidedCareerLanding` and `LandingPage` are retired to `_to_delete/`.

Five things here are deliberate and will look like mistakes if you do not know why.

## 1. `talent-landing.css` is a plain global stylesheet, not a CSS module

Every selector is mechanically scoped under `.tcl`. Converting it to a module **breaks the page**: `talentLandingMotion.ts` finds elements by those exact class names, and a module would hash them apart.

## 2. It contains no colour literals

The palette is the `.tcl` block in `app/globals.css`, which also re-points the token names the app itself uses (`--bg-input`, `--text-primary`, …) for that subtree.

That is not redundancy. `globals.css` styles bare `textarea` with `background: var(--bg-input) !important`, and `!important` cannot be outranked by specificity. Re-pointing the tokens means anything that leaks in now leaks in wearing the right colour.

## 3. The landing is dark-only by product decision

Choosing a theme belongs to signed-in people, inside the product. `color-scheme: dark` on `.tcl` keeps the textarea, scrollbars and focus rings dark even when the app is in light mode.

## 4. Three regions use `dangerouslySetInnerHTML` with module-owned constants

`#res`, `#rwText`, `#chatLog`. The motion module rewrites their innerHTML; marking them opaque stops React reconciling children it did not write.

No user input reaches any of them. The results panel is assembled from a fixed phrase list and integer counts, and never echoes the textarea.

## 5. The page must stay readable if JavaScript never runs

It went blank on a real device once. Every CSS rule that *hides* something here is scoped to `html.js`, set by the pre-paint script in `app/layout.tsx`.

If that class never lands — script error, blocked inline script, in-app WebView with JS off — the page must still be readable. **Do not remove the gate, and do not add a hiding rule that is not gated on it.**

## No `box-shadow` anywhere in this directory

`scripts/design-audit.js` bans it. The `components/landing` exception covers gradients and `backdrop-filter` **only**. Elevation here is a solid fill, an accent-tinted border, and an `outline` ring of page background.

Two audit mechanics to understand before you "fix" a metric: `TOKEN_DEF_FILES` exempts token-defining files from the hex counts *only*, and `EXTERNAL_TOKENS` tells the scanner that next/font emits `--font-*` at build time. Neither is a way to switch a rule off.

## The weak-word matcher is demo scope, not product scope

`talentLandingMotion.ts` matches typed text against `WEAK`, which concatenates two lists:

- `WEAK_PRODUCT` — the real phrases from `careerLandingContent.ts`. All multi-word (`responsible for`, `aligns well`).
- `WEAK_DEMO` — commented in source as *"a documented demo extension of common filler - NOT product data"*. This is where the single words live (`leverage`, `utilize`, `various`).

Matching is plain substring, so `leverage` does not match `leveraging`. That under-counts, but **only in this landing animation** — the free Career Check tools at `/tools/*` are separate implementations and do not use this list. Fix it for demo fidelity if you like; it is not a product correctness bug, and earlier notes calling it one were wrong.
