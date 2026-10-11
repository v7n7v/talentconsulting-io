# Isolated Taco upgrade verification

September 27, 2026. All checks target `/home/xwingace/Documents/Projects/Taco-upgrade`. The original checkout is a preserved source, not the implementation destination.

## Repeatable checks

| Check | Final result, including the animation refinement |
|---|---|
| `npm run test:upgrade` | 39 tests passed: evidence matching, proof-report scope, resume handoff, rewrite guardrails, analytics privacy, plan packaging |
| `npm run type-check` | Passed |
| `npm run lint:upgrade` | Passed |
| `node scripts/design-audit.js --ci` | Passed; baseline unchanged |
| `npm run build` | Passed; 188 static pages generated |
| `git diff --check` | Passed |
| Full `npm run lint` | Runs successfully as a tool but exits with 208 existing errors and 40 warnings; none of the error-bearing files was changed in this upgrade |

The production build emits a nonfatal Google Sans Flex fallback-metrics warning inherited from the existing font setup. This does not establish field performance; Core Web Vitals remain unmeasured.

ESLint repair: replaced the removed Next lint command with the installed flat-config ESLint CLI. Scoped the brace-expansion override to the compatible major required by minimatch 3. The design audit recognizes the landing palette as token definitions, allows decorative offset shadows only in landing components, and excludes the standalone raster social image. It still enforces the existing 11px typography floor; new small labels were raised to meet it.

## Browser and integration evidence

- 320, 390, 768, and 1440px layouts inspected. Hero CTA appears in the first viewport; no document-level horizontal overflow observed.
- Guest resume CTA opens “Create account to upload your resume.” Switching to login preserves the corresponding resume wording. Escape closes the modal and restores focus to the originating CTA.
- Mobile menu keeps sign-in visible when closed; Escape closes the expanded navigation and returns focus to Menu.
- Example tabs respond to ArrowRight and End with the selected tab and focus moving together.
- Source/rewrite controls display the intended versions. The draft's metric and skills appear in its source.
- Local robots returns 200 and permits framework assets. Canonical, root description, social title, and JSON-LD reflect Taco's career workflow. The generated social image returns PNG and was visually inspected.
- Final standalone production rendering inspected at desktop and 320px. Role controls remain readable above the card without overlap, resume signup opens correctly, and the browser error log is empty.
- An SSR render of the actual landing component includes its complete example draft and the authenticated resume-intent link. No authenticated service flow was executed.

## Integrity and limits

The recorded 1,251 original project files retain their hashes and original Git status. The clone has separate source/dependency inodes, no Git alternates, and no remote pointing back to the original. It includes local configuration, so it does not represent an isolated Firebase, Stripe, or AI backend.

No production deployment, account creation, checkout, email, or external application submission was performed. Authenticated resume-to-match activation, paid packet creation, exports, retention, conversion, search rankings, and general natural-language qualification accuracy remain unverified. The matcher is a bounded text heuristic.

## Final animation pass

- Product Designer, Software Engineer, and Marketing Manager each have a consistent source, skills, gap, result, and draft. Lower-page content follows the same selected data.
- Observed partial text and cursor while playing, automatic role rotation, complete text with no cursor when paused, and immediate full text on manual selection. The nine-second cycle leaves approximately seven seconds to read each completed draft.
- Arrow/End navigation moves both role selection and keyboard focus. Hover pauses temporarily; manual and keyboard interactions pause persistently. Interacting with the lower example freezes the profile; its selection remained unchanged across several minutes while reading below the hero.
- Astra's final source review found no remaining animation release blockers: one cleaned-up scheduler, viewport/document visibility suspension, reduced-motion handling, readable static/SSR content, and labeled controls/panel. Browser reduced-motion emulation was unavailable, so that preference path is source-reviewed rather than claimed as browser-tested.
- Final type-check, scoped lint, 39 tests, design audit, production build, and whitespace check pass. A final integrity comparison confirms all 1,251 recorded original files and original Git status are unchanged.

## Verification after reboot and wordmark follow-up

On September 27, rebuilt the current tree with the custom chevron wordmark: production build (including TypeScript) passed with 188 static pages. All 39 upgrade tests, scoped lint, design audit CI and whitespace check passed again. The full legacy lint findings above were not rerun.

The restored standalone production preview runs at `http://127.0.0.1:3100`. Rechecked desktop and 320px reflow, both loaded wordmark assets, manual Software Engineer selection with matching source/draft and paused autoplay, the mobile resume CTA, signup-to-login intent preservation, Escape dismissal and focus return. No document overflow or browser console errors were observed. Earlier reduced-motion validation limits remain unchanged.

Temporary integrity manifests did not survive the reboot. Instead, all 1,251 source files from the clone baseline commit `7eb7a02a8e2c8055968cb66439167fff90ff91f3` were compared against the original checkout using Git blob hashes: zero changed or missing files. This baseline is the durable reference for future recovery. No production service mutation or deployment was performed.

## Whole-card typing refinement

The visual-only follow-up expands the single typing sequence across the role, labels, skills, gap, source and draft, followed by 5.2 seconds to read. Complete text reserves the layout, while a separate visual layer types; readable static/accessibility copy remains present. Coordinator review corrected chip grid layering, cursor layout contribution, and the SSR/stale-role distinction.

Production build (including TypeScript), scoped lint, design audit CI and whitespace check passed. Browser checks found no horizontal overflow or clipped typed text at 320/390/430/768/1024/1440px. The full mobile card and desktop card were visually inspected. A partial role and completed card measured the same rendered height within subpixel rounding; at most one cursor was present. Manual Marketing Manager selection revealed all content, and Home/ArrowRight selected and focused the matching roles. Browser error log was empty. Reduced-motion/static paths were source-reviewed; no additional claim of emulated reduced-motion or backend validation is made.

At this checkpoint the lower-stage redesign was still a reviewed plan. The following follow-up implements it.

## Readable stages and landing cleanup

The lower demo now contains readable source, illustrative role requirements and a source-grounded draft, with a persistent fictional-example label. Brief paper transitions and staggered evidence markers connect the stages. Playback is optional, runs once at 6.8 seconds per stage, and exposes Pause/Resume/Replay. Manual or keyboard stage selection stops playback. The hero stays on the selected role while the lower example is visible.

The decorative coral loop behind the hero and its CSS were removed. The bottom coral CTA uses less vertical padding and a smaller heading: its measured desktop height changed from 530.45px to 431.41px, approximately 19% shorter.

Browser checks covered all three stages at 320/390/430/768/1024/1440px with no horizontal overflow or clipped leaf text. Playback paused for longer than one stage interval without advancing, resumed through completion, offered Replay, and restarted at stage one. End selected and focused stage three and stopped playback. The loop is absent from the DOM. A theme-inherited pale document heading was found and corrected; the final computed heading color is ink (`rgb(21, 21, 21)`).

Independent source review checked example provenance, timer cleanup, role changes, reduced motion and hero suspension. It found a visibility threshold that could block playback on very short screens; playback now follows intersection without requiring 20% of the whole section. Reduced-motion, hidden-tab and static-render paths are source-reviewed; no browser-emulated reduced-motion or 200% zoom result is claimed. Existing backend tests were not repeated for this visual-only change.

The viewport correction was browser-verified at 320×200px with a 1,662px-high section: the walkthrough advanced from stage one to stage three. At 320px, all three roles displayed their own matching requirements, cautious gap and supported draft, with no horizontal overflow. Small-screen document headers now stack to avoid splitting their labels into narrow columns.

## Scroll-driven hero, three moves and review stamp — completed

Implemented the approved plan in the independent clone. The hero uses full readable text with decorative scroll-linked ink, staggered skill highlights and a small straightening motion. Role identity is manual and shared with the lower example. No typing timer or cursor remains. One passive, event-driven subscription per scene coalesces updates into a pending animation frame; idle scenes do not run animation loops.

The lower scene renders exactly three semantic articles with stable unique IDs. On an eligible fresh desktop visit, a synchronous below-viewport measurement reserves the tallest article and toolbar. At 1440×900 the final shell is 791.33px tall, pins at 32px and adds exactly 300px of scroll distance. Source, match and application presentations follow physical scroll position. Mobile, short screens, direct `#demo` visits and restored visits inside/past the scene use natural flow. Stage controls become ordinary anchors. Manual selection, keyboard focus and selected text hold the desktop document; Follow scroll clears the hold without scrolling the page. On a resize that removes the Follow control, focus moves to the surviving motion control or stage link.

The lime-outlined FOR REVIEW stamp is restored in a reserved slot below retained facts. Approach, contact, rebound and settle are deterministic scroll poses, with a brief impact outline. Mobile progress uses the stamp slot itself, so a tall document does not complete the stamp offscreen. Static/reduced-motion rendering preserves complete documents and a settled stamp. The stamp remains decorative; adjacent text identifies the draft as awaiting review.

Validation:

- Production build and integrated TypeScript check pass; 188 static pages generated. Scoped lint, whitespace check and design-audit CI pass with the existing audit baseline unchanged.
- All 53 upgrade tests pass, including 14 new motion, lifecycle and static-render tests. Tests cover exact/reverse pose mapping, direct jumps, one pending frame, idle work, hidden-tab restoration, font/resize/pageshow invalidation, Strict Mode cleanup, viewport scale, reduced-motion subscription and complete unique static markup for every role.
- Browser checks at 320/390/430/768/1024/1440px found no horizontal overflow or clipped leaf text. All three roles retain their own source, cautious gap wording and draft. Mobile application-anchor navigation works.
- Desktop native scroll advances source→match→draft while the shell stays at 32px. Reversing to the same scroll coordinate restores the same stamp pose. The hero also restores the exact same ink state on reverse scroll. Motion off completes both scenes; re-enabling follows actual scroll position.
- Native browser interactions confirm manual selection persists while scrolling, focused documents hold, text selection holds through reverse scrolling, Follow scroll clears selection and reconciles without moving the viewport, End selects the last stage, and Ctrl+Home scrolls the page without changing the selected stage. Resize fallback preserves focus from Following scroll to the motion toggle.
- At 320px the final article is taller than the screen; the stamp approaches only when its own slot becomes visible and settles while still onscreen. Its raised pose stays below the retained facts. Desktop and mobile stamp screenshots were visually inspected.
- Final production smoke checks at port 3100 confirm desktop sticky enhancement and 320px complete flow/anchor navigation, with an empty browser error log.
- All 1,251 original project files still match clone baseline `7eb7a02a`; no original-project edits, deployment or backend mutation occurred.

Page-height tradeoff: Product Designer at 1440px is now 5,938px (previous compact single-panel page: 5,510px; +428px including the 300px track). At 390px it is 8,928px (previous: 7,609px; +1,319px for three real documents). Shared 52–80px section spacing remains; mobile has no artificial scroll runway.

Verification limits: OS reduced-motion changes and actual 200% browser zoom could not be emulated by the available browser controls. Their lifecycle/fallback logic is source-reviewed and covered by synthetic tests; motion-off and responsive fallback are browser-tested. No-JavaScript behavior is checked through static server rendering, not a browser with JavaScript disabled. Full legacy lint was not repeated; the changed-file lint gate passes.

## Evidence section removal

Removed “Evidence over embellishment” at user request, including its navigation link, source/rewrite toggle state and dedicated CSS. Shared intro and spacing rules remain. The three-move demo now leads straight into the lavender outcomes section. Type-check, production build, scoped lint, design-audit CI and whitespace checks pass. Production browser checks at 320/390/430/768/1024/1440px confirm no removed-section/link markup, direct section adjacency, no horizontal overflow or clipped outcome text, and no console errors. The desktop transition was visually inspected. Preview rebuilt at port 3100; no original-project changes or deployment.

## Unified lower landing and moving coral close

Restyled outcomes, trust, plans, FAQ and footer to use the upper landing's paper/ink palette, square borders and hard accent shadows. A subtle graph-paper backdrop links the lower sections. Plan claims, links, auth destination and native FAQ behavior remain intact. Outcomes/FAQ have section headings; card actions align at the bottom. The footer uses the ink wordmark on paper.

The coral closing section is now 259px tall at 1440px (previous 383.41px, 32% smaller) and 245.94px at 390px (previous 318.44px, 23% smaller). A stationary headline and resume CTA accompany a bold decorative horizontal ticker. Two equal-width groups translate through exactly half the track over 26 seconds, looping continuously. The shared pause control freezes the pose and resumes from it; hover, offscreen state and hidden-document state also pause it. Reduced-motion CSS removes the animation. Ticker copies are hidden from assistive technology and contain no interactive elements.

Type-check, production build, scoped lint, design audit and whitespace checks pass; independent review has no remaining actionable finding. Browser checks cover 320/390/430/768/900/1024/1440px with no horizontal overflow or clipped lower content. Verified equal group widths, moving/frozen/resumed ticker poses, working hover pause, offscreen suspension, 44px controls, FAQ pointer/keyboard behavior, signup-modal entry and Escape focus return. Compared hero/story computed styling with the earlier production preview: unchanged. Desktop lower panels and mobile closing/FAQ were visually inspected. Production smoke checks at 1440/390px match the measurements and show no console errors. Browser OS reduced-motion and hidden-tab emulation remain unavailable; corresponding CSS/listener cleanup is source-reviewed. No extra backend tests were added or run for this visual refinement. Preview refreshed at port 3100; original project untouched.


## Motion indicators removed; hero writing restored

Removed the hero motion button, the journey status/action row (including step counts and Follow scroll), and the footer pause button. Role and stage navigation remain. The hero now writes the role, supporting line, skills, gap, source and draft in one finite 4.4-second pass on first visible entry or role change. Full semantic text reserves the layout, while an aria-hidden visual layer types. It stays complete on the server, without IntersectionObserver, and with reduced motion. No automatic role cycling occurs. Offscreen/hidden-document interruption settles the example; all frame/listener cleanup is paired and stale observer callbacks are ignored.

The lower scroll demo and review stamp remain. Manual stage selection survives layout updates and resumes on the next physical scroll; focused or selected document content remains protected. The footer ticker keeps hover, footer-focus, offscreen, hidden-document and reduced-motion suspension without a visible status control.

Validation: production build and TypeScript pass (188 static pages), scoped lint passes, all 52 upgrade tests pass, and design-audit CI/whitespace checks pass. Updated static tests cover both motion-enabled and static complete hero markup with no cursor, and the absence of removed journey controls. Independent source review found and resolved the missing-observer fallback and stale-callback issues. Browser checks at 320/390/430/768/1024/1440px found no horizontal overflow or clipped measured text. Hero typing and complete states have identical card-frame heights for the selected role (526.5px on the development desktop engineer example; 537.5px on the production desktop marketing example). One cursor appears during writing and none after completion. Rapid role changes, keyboard End focus/selection, manual stage selection followed by scroll resumption, and document-focus holds were verified. Footer keyboard focus pauses its still-visible ticker. Production desktop and mobile hero states were visually inspected; the 390px engineer card retained its 511.984375px frame height through typing, and the browser error log was empty. OS reduced-motion and hidden-tab emulation remain unavailable; those paths are source-reviewed, with complete static markup covered by automated checks.

Preview rebuilt at http://127.0.0.1:3100. Work remains in Taco-upgrade; no deployment or backend changes. Internal screen planning remains future scope.
