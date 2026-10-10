# Taco blue gradient identity

Identity decision: October 4, 2026. The owner chose the existing blue gradient folded A app icon as Taco's persistent identity across the product. This supersedes the September 28 charcoal/white symbol treatments.

The master is `public/taco-icon-512.png`. Preserve its original pixels, blue gradient, flat top, angled legs, open interior and fold. The symbol keeps this blue treatment on light and dark surfaces and in every assistant state. Surrounding T/C/O lettering can switch between ink and light for readability.

Use `TacoWordmark`, `TacoBrandSymbol`, `TacoName` and `TacoText` from `components/BrandLogo.tsx`. Wordmarks retain the blue A as their second letter. Standalone navigation and app icons use the same A. Visible application-owned Taco names and feature copy use the inline symbol with readable text. Decorative icons have empty alternatives so screen readers announce the name once. Input values, spoken text, accessible labels and user-authored documents retain readable strings.

Desktop rails show the full wordmark; compact rails keep the symbol. The mobile menu launcher and assistant destination use the same blue symbol, even while the rail is closed. Public navigation, tool pages, templates, blog, account actions, auth dialogs, chat, and social previews inherit the shared identity. Browser favicons and installed app icons use the blue master; the installed app name is Taco.

Generate the shared SVGs, social PNG, favicon and touch icon with `node scripts/render-taco-wordmark.js`. Its cropped SVG embeds the master without grayscale, inversion or tint filters. The historic wordmark export URLs resolve to the same blue identity. Earlier chevron and monochrome artwork is historical and must not be used as an active product identity.

Company attribution and legal organization names remain TalentConsulting. Verification and change evidence: `docs/taco-blue-identity-update.md`.
