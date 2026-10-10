# Taco blue identity update — October 4, 2026

The original blue gradient folded A is now the shared Taco identity in the local Taco-upgrade build. The blue master is preserved without recolouring or geometry changes. Wordmarks use the blue A on ink and light surfaces; surrounding lettering adapts to the surface. The workspace grayscale overrides and error/locked desaturation were removed.

Shared components in components/BrandLogo.tsx and components/taco-identity.css cover wordmarks, standalone symbols, and application-owned inline Taco names. Static visible copy has 123 shared-name placements; 19 conditional copy expressions use the shared text renderer. Shared page titles, help copy, command entries and thinking states use the same renderer. Existing adjacent assistant icons remain single placements. Public headers, account screens, auth, suite and admin rails, compact navigation, mobile menu and assistant destination use the identity. Browser SVG/ICO favicons, Apple touch icon, app manifest, social artwork and email artwork follow the same master.

Verification:
- TypeScript check passes with incremental output disabled.
- Existing brand and email-rendering tests: 22 passed, including all catalog event fixtures. Email assertions now expect the requested artwork and accessible brand name; sender and service/marketing behavior remain covered.
- All changed UI source files were compared with their pre-change lint state: no new errors. Final changed shared components/public headers have no lint errors; BrandLogo retains three existing plain-image warnings.
- Design audit metrics are identical to the pre-change working tree. The existing repository baseline is already exceeded in five metrics; this change adds no metric regression and does not alter that baseline.
- Patch formatting check passes.
- Ink wordmark, light wordmark and standalone SVG each preserve 38,267 blue pixels when rendered, with no tint or grayscale filter.
- Browser checks: desktop landing and expanded/compact workspace rail, chat, 390px mobile launcher/drawer/assistant navigation, both themes, and no horizontal overflow. Browser error log empty. Original light theme, sidebar collapse preference and viewport restored after testing.

Current preview: http://127.0.0.1:3101. This change is local; no production release was performed. Future screens should follow docs/taco-brand-system.md and docs/taco-brand-wordmark.md.
