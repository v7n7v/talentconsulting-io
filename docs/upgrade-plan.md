# Taco: the next chapter

Implementation plan · September 27, 2026 · isolated development copy

## Outcome and boundaries

Make Taco immediately understandable and desirable: a career workspace that turns a person's actual experience into a focused job search and applications they review. The landing page should feel alive, have a distinctive visual identity, and lead directly into the existing resume-first journey. Trust defects must not undermine that promise.

All work happens in `/home/xwingace/Documents/Projects/Taco-upgrade`, branch `codex/taco-upgrade`. This is an independent clone containing the original working tree, including uncommitted changes. Baseline commit: `7eb7a02a8e2c8055968cb66439167fff90ff91f3`. Its Git remote was removed to prevent an accidental push to the original directory. Dependencies are separately copied, not linked. Local environment files are copied for local development; this is code isolation, not a separate backend or data environment. Do not exercise account creation, payments, emails, job submissions, or production mutations during this preview.

The original project's files and Git status will be compared with a recorded manifest after implementation. Deployment is a later step. Existing unrelated changes belong to the user and are preserved in the baseline.

## Product decisions

- Lead with one journey: experience → suitable roles → reviewed application. Tool breadth is supporting navigation.
- Use **Taco by TalentConsulting** as the landing identity. Keep the existing domain, account system, and application routes.
- Start with a credible emotional promise, followed immediately by a concrete explanation of AI job search. Do not promise jobs, interviews, response rates, or a guaranteed match.
- The primary action is **Start with my resume**. Guests open the existing signup modal with `/suite/agent?intent=resume-upload` retained through authentication. Signed-in users go directly there. This opens the existing resume prompt, not a native file picker.
- The free activation milestone for this release is an initial scout of up to three roles. Automated prepared application packets remain a Max feature under existing entitlements. Standard remains the on-demand scouting plan. No billing changes are hidden inside a design release.
- Use a clearly labeled fictional example, with one consistent person's source evidence, target, gap, and rewritten sentence. Every output fact must be present in the displayed source. No invented customer logos, testimonials, live indicators, ATS scores, or outcome statistics.

## Creative direction

**Bright, editorial, human.** Warm white, deep ink, and vivid coral replace the dark navy/cyan landing. Small contrasting accents distinguish evidence from unresolved questions. Coral is primarily an action and emphasis color; ink supplies readable type. Use the existing font infrastructure and scoped landing tokens rather than adding another font service or UI framework.

Build the hero around oversized typography and a layered product scene. An expressive path or loop should suggest a career taking shape. Product content supplies the visual interest: real-looking source excerpts, a role card with an honest gap, and an application draft. Avoid a giant decorative logo, a moving catalogue of tools, and repeated generic feature cards.

The headline and CTA are stable from first paint. Motion clarifies the transition between source, match, and draft. Use CSS transforms/opacity and React state. Any continuing motion needs a visible pause control, reduced-motion support, and offscreen/hidden-tab suspension; a short entrance followed by user-controlled steps is preferable. No animation may be required to reveal essential content.

Page sequence:

1. Visible brand, concise navigation, sign-in, and resume CTA on desktop and mobile.
2. Large benefit and interactive three-stage illustrative product scene.
3. A short explanation of the real three-step journey.
4. A source-grounded before/after, with a concrete explanation of what changed.
5. Outcome-based routes: find roles, prepare applications, practice interviews.
6. Review and privacy controls, honest plan boundaries, and a full-pricing link.
7. Practical FAQs and a strong closing CTA.

## Architecture and interfaces

Keep the Next.js App Router stack. Rebuild `TalentLanding` in React; stop mounting the old imperative motion module or handing HTML ownership between React and `innerHTML`. Scope the stylesheet under `.taco-landing`. Preserve the existing `isAuthenticated` and `onOpenAuth(mode, redirect)` component interface so the auth integration remains small and reviewable.

Use no new runtime animation dependency. Avoid autoplay video, WebGL, and decorative network requests. This makes the visual upgrade easier to maintain and reduces mobile cost. Keep public copy server-renderable; interaction progressively enhances it.

ATS matching remains a deterministic text heuristic. Add evidence-aware mention classification with token boundaries and regression coverage for negation, unsupported future training, and expired qualifications. It does not establish the truth of a resume or reproduce an employer's ATS. Distinguish unassessed categories from measured low coverage without silently breaking numeric consumers.

Proof reports need explicit scope. A keyword analysis cannot claim that a rewrite preserved facts or an exported document passed checks. Empty arrays do not establish a successful check. Make scope available to the UI and test the claims shown for scoring-only and unknown reports.

## Milestones and acceptance

| Milestone | Deliverable | Acceptance | Dependency |
|---|---|---|---|
| M0 — Isolation and reviewed design | Independent clone, baseline, plan, checkpoint | Original hashes/status unchanged; no shared Git objects or dependency links; Astra review recorded | None |
| M1 — New first impression | Complete responsive landing, honest interactive example, visible mobile navigation | Inspect 320/390/768/1440px, no horizontal overflow; readable hero; all example steps work; reduced motion and keyboard controls; source supports output | M0 |
| M2 — Credible entry | Resume CTA auth handoff, useful empty workspace, clear account/plan cues | Guest CTA opens correct modal, switch mode retains destination, close restores focus; existing route handles resume prompt; no-resume state does not assert no gaps | M0, M1 for browser checks |
| M3 — Evidence correctness | Negation/boundary fixes and scoped proof reports | Original AWS/Python reproducer no longer earns credit; independent affirmative mentions still work; no fabricated rewrite/export verdict | M0 |
| M4 — Discoverability and release tooling | Consistent root search/social metadata, crawl assets allowed, working lint command | Rendered metadata and robots verified locally; typed code and relevant tests pass; lint reports real code findings; production build assessed | M1–M3 |
| M5 — Real activation | Resume extraction review → target → three useful matches → next action | Test guest/new/returning accounts in an isolated backend; cancellation/retry/empty-result/error paths; no silent file loss | M1–M4; test environment |
| M6 — Paid value and repeat use | Reviewed packet, export, application tracking, useful return state | Source-linked changes, explicit unresolved facts, export checks, accurate entitlement errors; end-to-end Standard/Max and cancellation tests | M5; billing test environment |
| M7 — Learning and growth | Consent-aware funnel, quality feedback, useful search content | Event names and nonidentifying payloads verified; actual baseline measured; role-specific examples; Search Console indexing check | M5 |
| M8 — Launch decision | Field performance, privacy/security checks, production rollout and rollback | Reviewed release diff; staging smoke tests; monitored deployment; live robots, auth, pricing, and core journey verified | M5–M7; deployment authorization |

This implementation session starts and verifies M0–M4. M5–M8 are explicit follow-on work, not claims of completed activation, business success, or unattended background work.

## Verification strategy

Run targeted behavior tests for scoring and report scope plus existing auth/handoff, resume guardrail, analytics privacy, and plan packaging tests. Type-check the integrated tree. Repair the invalid `next lint` command using the installed ESLint version; report inherited findings separately rather than suppressing the whole codebase. Build with the existing webpack production script and inspect the local production page when available.

Browser checks cover hero and page hierarchy, all demo steps, mobile menu, FAQ, primary/secondary links, signup/login mode switching, dialog dismissal, focus restoration, and reflow. Do not submit real signup or checkout. Clearly distinguish route/source inspection from authenticated end-to-end verification. Test reduced motion and absent animation; leave content readable if browser JS fails.

Inspect local `/robots.txt`, title, description, canonical, social metadata, and JSON-LD. Allow `/_next/` assets. No domain migration or mass change to publication dates. Workspace noindex policy requires a separate route-wide audit rather than a hurried client/server layout migration.

Performance budgets are goals until measured: p75 LCP ≤2.5 seconds, INP ≤200ms, CLS ≤0.1. Measure production builds and later real users; do not label dev-server timing a Core Web Vitals result. Avoid new heavy dependencies in this release.

## Product validation and efficiency

After the first experience is reliable, recruit 5–8 representative job seekers from one role family. Watch them explain the hero, start a search, reject an unsuitable role, and review a draft. Record where they lose confidence and what they would otherwise use. A strong visual preference is not evidence of product-market fit.

Measure consented landing entry → auth completion → resume accepted → target confirmed → useful match saved, followed separately by paid packet review/export and week-one return. Distinguish no result from an API failure. Establish actual baselines before conversion targets or acquisition spend.

Record observed provider usage, retrieval quality, latency, cost per successful scout/packet, and support burden. Existing estimated unit costs are not billing measurements. Keep deterministic checks local, cache reusable context safely, and reserve expensive models for work where they improve decisions. Reuse existing tools rather than expanding the catalogue.

SEO should target the job-seeker journey: match resume to job description, tailor without changing experience, and source-grounded application examples. Add original annotated examples and useful internal links; do not generate thin pages just to increase page count. Validate demand and indexing with real data before forecasting traffic.

## Astra review and accepted changes

The top-model review approved the visual direction with six refinements: pair the emotional hero with a concrete AI job-search explanation; use one coherent sample story; preserve the existing auth destination without pretending a file is staged; rebuild motion in React; treat evidence matching as an independent correctness gate; and give proof verdicts explicit provenance.

The review also identified limits that shape this release: the upload intent opens a prompt rather than a picker, numeric score consumers require backward-compatible assessment metadata, and existing handoff tests do not establish the landing CTA journey. These are reflected above. No customer metric, paid conversion, or production deployment is represented as verified by this plan.

## Routing and handoff

The `long-horizon-build` skill routes planning and final review to GPT-6 Astra and bounded implementation to the currently available GPT-5.6 Luna. Independent builders own landing files and evidence/report files; the coordinator owns integration, the plan, and `.codex/long-horizon/taco-upgrade.md`. Save compact outcomes and failed checks there so later work resumes without repeating the full brainstorming exercise.

## Accepted animation refinement

The user requested visible writing animation across different job types after reviewing the initial hero card. Add Product Designer, Software Engineer, and Marketing Manager examples, each with its own fictional source, skills, gap, and supported draft. Animate the hero card while keeping the main promise stable. Provide role selection and Pause/Resume; manual selection immediately reveals the full text. Each cycle must leave at least five seconds to read completed text.

Astra reviewed this refinement: use one coordinated scheduler; clean up timers in Strict Mode; pause offscreen and in hidden tabs; disable typing and cycling for reduced motion; keep full accessible text outside character animations. Freeze automatic changes when visitors hover, focus, or interact with the example. Lower-page content must not change under someone reading it. Controls remain in normal flow so taller mobile cards cannot cover them.

## Implementation status

M0–M4 and the requested animation refinement are implemented in the independent clone and reviewed. The final production build, type-check, scoped lint, 39 selected tests, and design audit pass. Responsive and interaction checks are recorded in `docs/upgrade-verification.md`, including the remaining validation limits and pre-existing full-repository lint findings. The original's 1,251 recorded files and Git status remain unchanged. M5–M8 remain planned; no deployment or production service mutation was performed.

## Whole-card writing refinement

The user requested writing the whole example instead of animating only the review-ready draft. Extend the existing single sequence to the role, explanatory line, skills, gap, source facts, and draft. Keep the fictional-example marker and interactive controls readable throughout. Reserve each field's complete space so typing does not move the card. Show full accessible text and retain the complete static/SSR and reduced-motion states. Pause or manual role selection reveals the complete card. Each role receives at least five seconds of reading time after all its text finishes, then the next role begins. Preserve the lower example's synchronized source data and its interaction pause.

## Readable three-stage demo — implemented

Reference: `/home/xwingace/Pictures/Screenshots/Screenshot From 2026-09-27 19-54-30.png`. The user requested a plan for readable text and attractive animation in **Your experience → Your matches → Your application**. The user subsequently authorized implementation. The readable documents, transitions and optional walkthrough below are now implemented in the independent clone.

### Content and hierarchy

Replace the tilted sheet's placeholder bars with a readable example document. Make it the primary reading surface; the adjacent column should explain the step in one short sentence instead of repeating the source or draft twice. Keep the fictional-example label visible throughout. Use the same selected role as the hero, with all three existing role examples supported.

| Stage | Short explanation | Readable document — Product Designer example |
|---|---|---|
| Your experience | **Experience worth building on.** Start with what you actually did. | **Resume excerpt.** “Led the checkout redesign using Figma and user research that increased completion by 18%.” **Skills in this excerpt:** Figma · User research · Checkout. |
| Your matches | **See the fit. See the questions.** Compare your evidence with an illustrative role. | **Example role: Product Designer.** Show explicit illustrative requirements for Figma, user research and people management; match the first two to their source words. **Worth reviewing:** “People-management experience is not shown in this excerpt.” |
| Your application | **Put your evidence into words.** Review a clearer bullet built from the same facts. | **Application draft · for your review.** “Using Figma and user research, led the checkout redesign that increased completion by 18%.” **Source details retained:** Figma · User research · Checkout redesign · 18% increase. |

Use the equivalent existing source/draft for Software Engineer and Marketing Manager. Add explicit fictional requirement data and cautious gap labels to `landingExamples.ts`; an absent fact means “not shown in this excerpt,” not proof the person lacks it. Do not invent employers, qualifications, scores or additional outcomes. Label the output a draft bullet/excerpt, not a complete resume or application.

### Motion direction

Carry the same visual document through all three stages. On a deliberate stage change, settle the sheet from an 8px lift over roughly 350ms, then emphasize source terms, matching rows, or retained facts at 70ms intervals. Finish the decorative reveal within about 800ms. Keep the body copy visible and use animated underlines, accent markers and small positional changes to show what connects; do not add a second typing loop that competes with the hero.

Default to manual stage selection. An explicit **Play walkthrough** may run one pass, allowing at least six seconds to read each completed stage, with **Pause** while playing and **Replay** on completion. Manual selection stops the walkthrough and shows that stage immediately. No endless cycling. Reduced motion renders every selected stage completely and disables automatic progression.

### Readability and behavior

- Body copy: at least 16px with approximately 1.55 line height; document labels at least 14px. Use existing fonts and scoped ink/coral/lime/lavender tokens.
- Replace the fixed 66% width/68% height with a content-sized sheet. Keep it upright on mobile, lightly tilted only where readable on desktop. Put the review badge in normal flow, clear of text.
- Make the document semantic content: remove `aria-hidden` from the sheet, hide decoration only, retain labeled tabs, arrow/Home/End navigation, focus rings and 44px controls. Do not announce text character by character or repeatedly announce the whole panel.
- Pause the hero's role cycling while the lower example is visible, not only after pointer/focus interaction. Keep the selected role stable through reading and walkthrough playback. Explicitly choosing another hero role resets the walkthrough cleanly.
- Suspend timers when offscreen or in a hidden tab, clean up on unmount/role change, and preserve complete static/SSR content. A timer must never carry an old role's facts into the new example.

### Implementation and acceptance

1. Extract the lower stage renderer from `TalentLanding.tsx` into a small `CareerJourneyDemo` component receiving `selectedExample` and an interaction callback. Replace placeholder geometry and duplicate text first; preserve the existing hero component and auth flow.
2. Extend `landingExamples.ts` with illustrative requirements and carefully worded missing-evidence labels. Keep one source of example facts across hero, stages and comparison section.
3. Add scoped document styles and short stage transitions; then add the explicitly started walkthrough only after the static reading experience passes review. Use CSS/React, with no new animation dependency.
4. Verify every stage and role at 320/390/768/1440px and 200% zoom: complete readable text, no clipping, no overlap, no duplicate passages, and all draft facts traceable to the source. Check rapid switching, keyboard focus, pause/replay, offscreen/hidden-tab suspension, reduced motion and static rendering. Run scoped lint, type/build and design audit; inspect the actual browser before marking complete.

Astra's independent planning review approved replacing placeholder sheets and reducing duplicate copy, with two refinements adopted above: state the illustrative role requirements explicitly and describe gaps as evidence not shown, rather than as confirmed absence of a qualification. Implementation is complete after the whole-card typing refinement. The walkthrough starts only on request, allows 6.8 seconds per stage, and stops after one pass. The user also requested a smaller bottom coral section and removal of the coral loop behind the hero: both are implemented. The bottom CTA is approximately 19% shorter at the measured desktop viewport; the loop SVG and its styles are removed. Actual verification and remaining test limits are recorded in `docs/upgrade-verification.md`.

## Scroll-driven hero, three moves, and review stamp — implementation plan

**Status: implemented and verified.** Requested after the section-spacing refinement on September 27, 2026 and authorized with “Please proceed.” This section supersedes the earlier timer-driven motion decisions. The production preview at port 3100 now contains the scroll-driven replacement and restored stamp. Work remains confined to the independent `Taco-upgrade` clone. Verification and browser-tool limits are recorded in `docs/upgrade-verification.md`.

### 1. Intended experience and decisions

Scroll position should determine the visual story. Stop scrolling and the story holds; scroll backward and the visual treatment reverses. Neither animation should start an independent playback clock just because it entered the viewport.

- **Hero:** ordinary page flow, no pinning and no extra scroll runway. The card responds to scrolling through its writing/highlight sequence; headline, description and signup CTA remain stable and usable.
- **Three useful moves:** a short sticky document scene on screens where the entire document and controls fit. Experience becomes evidence-to-role comparison, then an application draft, ending with the restored stamp.
- **Mobile, short screens and zoomed layouts:** three concise documents in natural vertical flow. Each responds to its own passage through the viewport. Scrolling never replaces a long document while someone is reading its lower half.
- **Role identity is manual:** Product Designer, Software Engineer and Marketing Manager remain selectable. Scrolling never cycles careers or changes the lower example's facts.
- **Keep the compact rhythm:** retain 52–80px section padding, 28–40px introduction-to-content gaps and 44–64px closing-section padding. Extra mobile height must contain actual readable documents, not blank animation spacers.
- **Motion is an enhancement:** complete text, truthful labels and ordinary navigation remain available in static rendering and reduced motion.

### 2. What exists, what is missing, and measured constraints

The hero currently writes characters on a 24ms scheduler, holds a finished card for 5.2 seconds and rotates roles. The lower scene advances on a 6.8-second stage timer. Intersection observers only gate these clocks; they do not make either scene scroll-driven.

The original reference at `/home/xwingace/Pictures/Screenshots/Screenshot From 2026-09-27 19-54-30.png` shows a tilted, lime-outlined **FOR REVIEW** stamp on the application sheet. The implemented stage instead renders `↗ Review-ready draft` as a flat lime badge. Restore the reference's visual signature while keeping the current readable document.

Measured in the current browser with Product Designer, before adding stamp space:

| Viewport | Hero example including controls | Tallest lower shell across three stages | Consequence |
|---|---:|---:|---|
| 1440 × 900 | 603px | 748px | Potentially enough room for sticky, subject to the stamp and clearances |
| 1024 × 768 | 647px | 772px | Whole-shell sticky would clip; use natural flow |
| 390 × 844 | 666px | 1007px | Use natural flow |

The current stage heights differ by more than 60px on desktop. Letting the active stage resize its own scroll track would create jumps and oscillation. The pinned presentation must reserve the tallest stage for the chosen role, including the stamp, before calculating progress.

`.taco-landing { overflow: hidden; }` is another existing obstacle: it can make sticky elements attach to the wrong scrolling ancestor. Resolve clipping locally and inspect the full ancestor chain, including `body` and the mobile global `main` overflow rule. A width breakpoint alone is not evidence that sticky works.

### 3. Hero storyboard

Keep one complete, semantic example card and the current three role choices. Replace disappearing/blank text with a fully readable base layer and a decorative writing or ink-emphasis layer. The animated layer is hidden from assistive technology; the body text appears once in the accessibility tree. All labels and the fictional-example marker are visible from first paint.

| Hero progress | Treatment |
|---|---|
| 0–15% | Role and document header are already legible; the card gently straightens from its existing 2° tilt |
| 15–35% | Skill labels receive successive ink/highlight passes |
| 35–50% | The missing-evidence line receives a restrained marker; its cautious wording stays visible |
| 50–70% | The source sentence receives a writing sweep connecting the skill terms and original outcome |
| 70–90% | The draft receives the writing sweep, in the same reading order |
| 90–100% | Completed card holds with the source and draft fully legible |

These are scroll intervals, not durations. Reverse scrolling unwinds the emphasis and tilt, without erasing the underlying facts. Remove timed career rotation and the infinitely blinking cursor. Role selection replaces the example everywhere, retaining the current progress rather than starting a new clock.

Measure the untransformed hero wrapper. An initial mapping is `start = max(0, cardTop - 0.75 × viewportHeight)`, `end = max(start + 240, cardBottom - 0.45 × viewportHeight)`, and `progress = clamp((scrollY - start) / (end - start), 0, 1)`. Tune the endpoints in the actual browser so the draft completes while its text is still visible, including at short heights. This range changes motion only; it adds no layout space. If the useful visible range is too short, show the completed ink treatment instead of forcing a cramped scrub.

### 4. Desktop three-move storyboard

The introduction stays in ordinary flow. Below it, pin only the document scene and stage controls, with 24–32px top clearance and at least 24px bottom clearance. Use the measured maximum shell height, a minimum 24px spare-height tolerance, and a wide-layout guard (initially 1100px) to determine eligibility. Recheck after fonts and role content resolve. The eligibility test includes the stamp reservation and all controls.

Keep the additional scroll distance bounded: target roughly 300px, maximum 360px beyond the normal tallest-shell height. Do not use multi-screen `300vh` or `400vh` sections. While the scene is pinned, the occupied document explains this scroll distance. If the compact range proves too abrupt in real use, use natural flow; do not silently lengthen the page or reduce text size.

Measure candidate sticky geometry in its intended desktop columns, not by summing the natural-flow articles. Only perform that candidate layout pass while the whole scene is below the viewport; finalize sticky eligibility or return to flow before it is encountered. A compact track gives each held stage about 80–100px and the stamp about 30px, so the actual wheel/trackpad check must assess whether the sequence feels useful, not merely whether its endpoints are mathematically correct.

| Scene progress | Document behavior |
|---|---|
| 0–28% | Source excerpt holds; matching source terms are emphasized |
| 28–34% | Short paper transition into the role comparison |
| 34–62% | Matching evidence rows hold; supported markers appear in order and the open question remains distinct |
| 62–68% | Short paper transition into the application draft |
| 68–86% | Draft holds; retained facts receive an underline sweep |
| 86–96% | FOR REVIEW stamp approaches, presses, rebounds and settles |
| 96–100% | Finished draft and ink mark hold before normal page flow continues |

Stage identity changes at the midpoint of the two transition ranges (31% and 65%). Use a pure mapping from progress to stage and presentation. Layer opacity/transform changes within the reserved shell; never animate its dimensions. Transition layers must not both appear as active documents to assistive technology.

Native wheel, trackpad, touch, PageDown and ordinary page scrolling remain native. No wheel/touch interception, forced scroll snapping or smooth-scroll engine. Fast scrolling may skip intermediate decorative frames; it must still produce the correct final document and stamp. Reverse scrolling uses the same mapping.

### 5. The missing stamp

Restore **FOR REVIEW**, with the reference's lime outline, ink lettering and small arrow, at a slight counterclockwise tilt. It communicates a draft awaiting the visitor's review, not verification or approval. Keep the visible fictional-example label and draft status; do not substitute VERIFIED, APPROVED or READY TO SEND.

Reserve a normal-flow slot near the lower-right of the final sheet, after the draft and clear of retained-fact text. Start with approximately 120 × 72px on desktop and 104 × 64px on mobile, allowing the slot to grow for enlarged text. The stamp may sit at an angle within that slot but must not cover writing or escape the sheet's safe area.

Within the stamp segment, map a local progress value through four poses:

1. **Approach:** stamp at roughly `translateY(-24px)`, scale `1.18`, rotation `-16deg`, ink not yet deposited.
2. **Contact:** stamp reaches the paper, scale briefly compresses to `0.97`, rotation approaches `-8deg`; the ink mark appears. Give the paper at most a 1–2px downward response.
3. **Rebound:** scale reaches `1.02` and lift reduces; the deposited mark remains.
4. **Settle:** scale `1`, rotation `-8deg`; readable outline and FOR REVIEW lettering remain on the page.

Use a decorative stamp impression layer plus an optional brief impact outline, built with HTML/CSS or a small inline SVG. No image request, canvas, video or new art dependency is necessary. Animate transform and opacity; do not animate large blurs or expensive moving box shadows. These poses are interpolated from scroll position, so there is no spring or timeout continuing after scrolling stops. Reverse scrolling lifts the stamp through the same poses. Manual selection of the final stage shows the settled mark immediately; reduced motion does the same.

### 6. Natural-flow reading on mobile and short screens

Render experience, matches and application as three semantic articles in sequence, reusing the same data and content components as the desktop presentation. Retain the section introduction once. Use compact stage headings inside each document rather than repeating the current large title/explanation column three times. Keep 16px-or-larger body copy, the existing readable document padding, 44px controls and 24–28px gaps between documents.

Each article's highlight progress follows its own entry into the viewport. The stamp gets its own measured trigger/target wrapper near the bottom of the final article, so it animates when the stamp is visible even if the full document is taller than the screen. No article disappears as the next one arrives. This provides a genuinely scroll-linked mobile experience without trying to pin an oversized sheet.

Stage navigation becomes links to the three article anchors, with `aria-current="step"` on the current document. It must not pretend to be tabs when all panels are visible. The sticky desktop presentation retains tabs with associated panels. Document IDs stay stable across modes; navigation cannot strand keyboard focus in hidden content.

The longer mobile flow is an explicit tradeoff: it adds the actual second and third documents, while eliminating the duplicated explanatory columns. Report its measured page-height impact during review. Do not regain compactness by shrinking text or hiding required content.

### 7. Controls, accessibility and state ownership

Separate layout (`flow` / `sticky`) from motion (`scroll` / `manual` / `static`).

- Replace misleading Play/Pause/Replay wording for the old clocks. Provide a clear motion toggle, and **Follow scroll** when a desktop stage was manually selected.
- In sticky mode, clicking a stage or using Arrow/Home/End shows that complete stage and holds it until Follow scroll. Scrolling continues to move the page normally.
- Focus entering the selected document or active text selection holds its content. Never hide a focused element because progress crossed a threshold. A normal touch swipe is not a manual-selection event.
- Follow scroll reconciles to the current physical position without jumping the viewport or moving focus to the new panel. If the trigger remains focused, it remains rendered after the mode change.
- Honor modified navigation keys: do not capture Ctrl/Meta+Home/End as tab-selection shortcuts.
- In flow mode, stage links perform ordinary document navigation; there is no hidden selected panel or timed progression.
- A user motion-off choice applies to both scenes for the current page session. System reduced motion has precedence. In static mode, all text and the final stamp are complete, transforms stop and the lower scene uses natural flow.
- Keep full text available once to screen readers. Do not put scroll percentages, animated characters or repeated stage announcements in a live region. Decorative stamps duplicate the existing draft status and may be `aria-hidden`.

Move the single `selectedExampleId` to `TalentLanding`; derive the existing `LandingExample` data there and pass it into both scenes and the evidence section. Remove automatic profile notifications/rotation and the parent hero-pause/lower-visibility coupling when the new controls make it unnecessary. Removing `key={selectedExample.id}` from the whole lower controller allows deliberate state handling instead of incidental remount resets. Role changes update every article consistently; any newly oversized role switches to flow safely.

### 8. Implementation structure and browser lifecycle

Use native browser observers and requestAnimationFrame with scoped CSS, without adding a runtime animation package. The installed Framer Motion dependency is not required for this change.

| File | Planned responsibility |
|---|---|
| `components/landing/landingMotion.ts` (new) | Pure clamping, progress, phase/stage mapping, stamp poses and explicit control transitions |
| `components/landing/useLandingScrollScene.ts` (new) | Measurement, passive scrolling, resize/font/visibility updates, bounded frame scheduling and teardown |
| `components/landing/AnimatedCareerExample.tsx` | Replace clock and career rotation with controlled role input and scroll-linked ink treatment |
| `components/landing/CareerJourneyDemo.tsx` | Shared semantic articles, fit-aware presentation, accessible controls, manual override and final stamp |
| `components/landing/TalentLanding.tsx` | Own selected role and motion preference; remove obsolete timer-suspension wiring |
| `components/landing/talent-landing.css` | Hero scroll presentation, local overflow correction, preserved compact spacing |
| `components/landing/career-journey-demo.css` | Stable sticky shell, natural-flow articles, stamp slot and motion/static styles |
| `scripts/landing-scroll-motion.test.js` (new) | Meaningful pure progress/state and static-content regression checks |

The hook accepts stable measurement and presentation refs. It returns discrete state and controls; it writes only component-owned CSS custom properties for continuous presentation. React continues to own the content/markup. No innerHTML, global DOM writer or global `html.js` reveal dependency.

One passive scroll listener per active scene schedules at most one pending frame. Batch geometry reads before writes; update React only when a stage/mode changes. No always-running rAF loop. Observe untransformed wrappers, not moving stamp/card surfaces. Cache geometry until layout invalidates it; refresh on container resize, font readiness, orientation/viewport changes, role changes and `pageshow`. Avoid resize-observer feedback by reserving size outside the animated layer. Disconnect observers/listeners and cancel pending work on unmount or static mode. Stop presentation updates while the document is hidden and reconcile to actual position on return.

Replace the landing root's scroll-container-producing overflow with local horizontal clipping that permits viewport sticky behavior, preserving the existing gutter and decorative shadow containment. Check computed ancestor overflow and actual sticky behavior in-browser. Apply any additional override only to the landing boundary; do not change suite scrolling. If suitable clipping/sticky support is unavailable, retain flow mode.

### 9. First paint, navigation and resizing

The hero's readable underlay uses the same geometry before and after enhancement. The lower SSR baseline is the complete three-document flow with the stamp already meaningful. Enhancement must never briefly blank the examples.

Enable lower sticky mode only when measurements, motion preference and font metrics are ready **and the entire scene still lies below the current viewport**. If first load, direct `/#demo`, direct `/#pricing`, browser Back or restored scrolling lands inside or past the scene, keep natural flow for that visit. This avoids collapsing a long SSR layout beneath an already-restored reading position. The two layouts remain useful; direct links do not require the animated presentation.

Once a scene falls back during a visit, do not repeatedly upgrade it near a fit threshold. If an already-pinned scene becomes too tall after a resize, zoom or role change, switch to flow, retain the focused/nearest reading article, and preserve that article's viewport offset with a single immediate layout compensation if needed. Do not use animated scrolling for that correction. Reduced-motion changes settle decoration and release pinning immediately while preserving the reading anchor.

### 10. Build order and review gates

1. **Static documents and stamp.** Extract shared article markup, add the restored FOR REVIEW impression and safe slot, keep the three examples truthful. Verify all role content and long mobile layouts before motion.
2. **Pure progress and lifecycle.** Implement mappings/control transitions and observer hook. Test clamping, zero/invalid ranges, exact stage boundaries, reverse/jump parity, manual override, role changes and cleanup. No timers from the previous playback systems survive scroll mode.
3. **Hero integration.** Replace typing/rotation with the scroll-linked ink layer, preserve signup actions and manual roles, verify readable initial/restored states. No additional hero height.
4. **Lower scene and stamp scrub.** Add measured fit, stable maximum-height shell, bounded desktop track, normal-flow navigation and the four stamp poses. Verify document focus survives mode changes.
5. **Integrated review.** Build, lint, audit and inspect the real page; tune the actual progress intervals and pose amplitudes once. Save exact evidence and any limitations in the checkpoint and verification document.

### 11. Acceptance evidence required before completion

- At fixed scroll position, wait longer than both former clocks: role, stage, ink and stamp must not progress. No cursor keeps blinking.
- Sample forward, reverse and jump scrolling at the same positions: stage and stamp poses agree. Test fast passage to the next section and history restoration; no stale-role frames or delayed replays.
- Capture the stamp before contact, at contact and settled. Confirm the lime outline/ink lettering reproduce the FOR REVIEW reference and never cover draft text.
- Check all three roles and stages at 320/390/430/768/1024/1440px, portrait/landscape, 320×200px, and real 200% browser zoom. Verify fit with stamp included and the natural-flow fallback at 1024×768.
- Test keyboard tabs/links, Arrow/Home/End, Ctrl/Meta+Home/End, focus hold, selection, motion-off and Follow scroll. Signup/login destination and Escape focus restoration still work; do not create an account.
- Browser-emulate reduced motion and JavaScript-disabled rendering. If the current browser tools cannot emulate a condition, explicitly mark it unverified and use an available supported test environment; source review alone must not be reported as a browser pass.
- Inspect dark and light host-theme contexts; the landing remains paper/ink and text stays readable. No horizontal overflow, clipped text, hidden action or animated height jumps.
- Verify direct `/#demo`, `/#pricing`, Back/Forward, resize, font completion and role changes without scroll traps or unexpected reading-position jumps.
- Inspect performance during a scroll and while idle: no per-character React scheduler, no perpetual animation frame, no duplicate Strict Mode listeners, no layout read/write loop. Record local measurements, not invented field-performance results.
- Compare page heights against the tightened baseline (1440px: 5510px; 390px: 7609px in Product Designer/source state). Hero adds zero runway; lower desktop adds at most 360px of animation track plus the measured stamp slot. Report mobile's added real document height.
- Run focused motion tests, `npm run lint:upgrade`, `npm run build` (including TypeScript), `node scripts/design-audit.js --ci`, and `git diff --check`. Reuse relevant static-render/auth handoff checks. The old `scripts/landing-polish.test.js` targets retired `GuidedCareerLanding` and is not proof for these components.

Independent planning review identified the sticky overflow ancestor, variable document heights, automatic career remounts, oversized mobile sheets and SSR restoration as the principal risks. The plan addresses them explicitly. No backend, deployment or original-project changes are needed for this work.

Final independent plan review: no blocking contradictions found. Accepted tradeoffs are a deliberately short desktop track that may skip decorative poses during fast scrolling, and a complete flow presentation for direct/restored links or documents that fail the post-stamp fit check. Implementation must verify those conditions rather than assume every desktop will be pinned.

## Lower-page style unification and compact moving close — implemented

User requested the top landing's brutalist language throughout the remaining sections. Outcomes, trust, plans and FAQ now share warm paper, ink frames, a restrained ruled backdrop and hard accent shadows; footer branding matches the header. Upper hero and journey appearance is preserved. The coral closing section is smaller and uses a continuous decorative text ticker with stationary semantic copy and resume CTA. Pagewide pause/reduced-motion controls apply; the ticker also pauses on hover, offscreen and when the document is hidden. This user-requested loop replaces the earlier finite-motion rule for the closing decoration only. Verification is recorded in docs/upgrade-verification.md. Internal screens are a future planning step, not part of this implementation.


## Latest refinement — hero writing and motion indicator removal

This user request supersedes earlier hero scroll and visible motion-control requirements. Remove the hero motion button, journey status/action row and footer pause button. Preserve useful role/stage navigation. Restore a finite 4.4-second whole-card typing pass on first visible entry and role selection, without automatic role cycling. Reserve full text geometry and keep complete semantic/static/reduced-motion text. The journey and review stamp remain scroll-driven; manual stage choices resume on actual scrolling unless document focus or selected text protects the current reading surface. The ticker retains hover, footer focus, offscreen, hidden-document and reduced-motion suspension. Internal screens remain future work.


## Internal product structure — planning handoff

The user requested brainstorming and a detailed internal plan before building. `docs/internal-product-blueprint.md` now contains the proposed five-destination structure, alternatives considered, the route/tool consolidation map, screen contracts, source/packet state boundaries, I0–I7 milestones, first implementation tickets, acceptance scenarios and rollout strategy. It extends M5–M6 and carries the established landing identity into the workspace. Workflow-first interaction and an existing-resume audience are provisional recommendations pending user preference. No internal implementation is authorized by the planning document itself.

The next build starts with I0: resolve navigation ownership, source-confirmation semantics, the Standard/Max packet entitlement disagreement and deterministic test isolation. The current Ask Taco path saves immediately after parse; its replacement must stage/review first and reuse the existing target/preflight flow. Full details, evidence and independent review corrections are in the blueprint.
