# Taco assistant brand system

Visual identity updated October 4, 2026: the existing blue gradient folded A app icon is the persistent Taco identity, including the A within the TACO wordmark. See [the wordmark specification](taco-brand-wordmark.md) for assets and generation instructions.

## Identity

The customer-facing name is **Taco**. The formal wordmark is **TACO**. The name comes directly from the first two letters of **TA**lent **CO**nsulting. In normal sentences, buttons, notifications, email, and speech, write “Taco.” Reserve “TACO” for the wordmark and the TA + CO explanation.

Pronounce it “TAH-koh.” Screen-reader labels must use “Taco,” not separated letters. The familiar spelling makes the name memorable, but the brand is not a food mascot: do not use shells, ingredients, restaurant imagery, food jokes, or habitual taco puns.

Core positioning: Taco is TalentConsulting.io’s career intelligence partner. Taco prepares evidence-backed work; the user reviews and controls every consequential decision.

## Voice and personality

Taco is strategic, candid, evidence-aware, encouraging, practical, and respectful. Lead with the recommendation, then give the evidence, uncertainty, and next action. Prefer clear conversational sentences and one to three prioritized actions.

- Professional mode is precise, analytical, and composed.
- Coach mode is warm, reflective, candid, and action-oriented.
- Direct mode is concise and prioritized without becoming harsh.

Avoid empty praise, hype, canned enthusiasm, corporate jargon, excessive exclamation marks, and claims of human experience. Never create a fictional personal history or alternate meaning for the name.

## Trust contract

Taco must separate verified facts, inferences, drafts, and missing evidence. Taco never invents career facts; guarantees employment or compensation; claims an external action succeeded without a trusted result; or submits, sends, replaces, or changes consent without explicit approval at the consequential step.

The canonical policy is implemented in `lib/assistant/personality.ts`. Product copy must not weaken that policy.

## Product naming

| Use | Do not use |
| --- | --- |
| Ask Taco | Taco Agent as a feature title |
| Career Picks by Taco | Taco Picks |
| Live Interview with Taco | Taco Live Room |
| Prepared by Taco | Taco-generated guarantee language |
| Taco-assisted scouting | Autonomous application claims |

Functional tools such as Resume Studio, Application Tracker, Skill Bridge, and Market Oracle keep their functional names. Taco is credited where the assistant meaningfully prepares or explains work; it is not attached to every control.

## Visual identity

The Taco symbol is the existing blue gradient folded A from `public/taco-icon-512.png`. Preserve its silhouette and original gradient across light/dark surfaces and every assistant state. No grayscale, white inversion, tint, pointed chevron, font A, or TC monogram may replace it.

The same A appears within the visual TACO wordmark and as a standalone symbol next to visible Taco names, feature labels and app navigation. Use `TacoWordmark`, `TacoBrandSymbol`, `TacoName` and `TacoText` from `components/BrandLogo.tsx`; use the shared `components/taco-identity.css` styles. Lettering may adapt to the surface; the icon always retains its blue gradient. Compact desktop and mobile navigation keep the icon when the full name is hidden.

Use the existing blue assets for browser, touch and install icons. The installed app's name is Taco. Shared social images use the same generated wordmark. Company attribution and legal organization names stay TalentConsulting. Native input values, accessibility names, speech and user documents keep plain text. Decorative icons must not duplicate the accessible name.

See [the wordmark specification](taco-brand-wordmark.md). Regenerate the wordmark/icon family with `node scripts/render-taco-wordmark.js`; do not regenerate or recolour the master. Earlier monochrome and chevron designs are historical.

## Fixed color palette

Palette decision: October 5, 2026; applied throughout the app October 7, 2026. Keep the existing paper appearance, coral accent and original blue Taco identity. Lavender is the dedicated shadow color. Public pages, workspace, resume tools, admin, dialogs and plan presentation use these shared roles.

| Role | Color | Use |
| --- | --- | --- |
| Paper | `#fffaf5` | Page and document backgrounds |
| Ink | `#151515` | Headings, body text, structural borders, selected controls |
| Coral | `#ff5b35` | Primary actions, focus outlines, small emphasis and progress details |
| Lavender | `#c6b6ff` | Offset shadows behind cards and panels only |
| Taco blue | Original gradient in `public/taco-icon-512.png` | Taco identity, wordmarks and the moving journey symbol |

Supporting shades are part of these families: muted ink `#6e6964`, paper borders `#ded7cf`, soft paper `#f2ebe3`, darker coral `#a82c18` for readable text, and a 12% coral tint mixed into paper for subtle callouts. Use shared tokens rather than adding independent hex colors. The blue gradient remains the master asset, not a newly sampled or recolored approximation.

Paper and ink carry most of each screen. Coral directs attention to actions and relevant details. Blue identifies Taco. Lavender adds depth through offset shadows, using the shared `--taco-shadow` token; it does not color text, badges, controls, borders or section backgrounds. Focus rings retain their accessible coral/ink/paper treatments. Do not add lime, rainbow feature colors, per-section palettes or decorative gradients. Differentiate information with labels, icons, typography, borders and spacing instead of unrelated hues. Status feedback must use explicit text or icons as well as color. Dark surfaces use the existing ink/paper family with the same coral and original blue identity.

The canonical palette is defined once in `components/taco-theme.css`. `app/globals.css` maps legacy and semantic roles to those tokens; `components/taco-public-palette.css` maps public pages to the fixed paper surface. Use `--taco-accent-text` for readable coral text and `--taco-action` / `--taco-action-ink` for filled actions. Light and dark mode use appropriate shades from these families. Resume document templates and exports retain their independent presentation. WebGL scenes and the standalone global error boundary use matching literal colors because they cannot inherit CSS variables. The design audit validates accent contrast across every app surface and checks action contrast in both modes.

## Microcopy patterns

- Working: “Taco is reviewing your evidence.”
- Missing evidence: “I’m missing the role requirements needed to verify this.”
- Draft boundary: “Here’s a draft for your review.”
- Approval boundary: “Review and approve before anything is sent.”
- Failure: “Taco couldn’t complete this step. Nothing was submitted.”

Do not use playful food metaphors in loading, error, pricing, security, or career-loss contexts.
