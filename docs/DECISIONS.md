# Decisions

Append-only. Newest at the top. One entry per decision that would otherwise get re-litigated.

**Why this file exists:** the pricing contradiction ($2.99 vs $4.99/$9.99 vs $19/$49) survived across three documents for months because each recorded a *price* but none recorded *which superseded which, or why*. Every entry here is cheap to write and saves someone re-deriving a conclusion you already reached.

**Write an entry when:** you make a call that a reasonable person could have made differently, you reject an approach for a non-obvious reason, or you discover a constraint that closes off options. Not for routine implementation choices.

**Format:**

```
## YYYY-MM-DD - Short title
**Decision:** what was chosen.
**Constraint:** the fact that forced it. This is the part that ages well.
**Rejected:** what else was considered, and why not.
**Revisit if:** the condition under which this should be reopened. Omit if permanent.
```

---

## 2026-10-09 - Keep factual sources separate from prepared packet artifacts

**Decision:** Find roles keeps its selected confirmed résumé in the shared analysis context after packet preparation. Generated résumé versions and their scores stay attached to the application packet. Source reload interruptions expose retryable failures, while completed work remains available.

**Constraint:** Role analysis verifies source IDs server-side and rejects generated document IDs. Applications independently loads its generated documents through the application record. Mixing those inputs either rejects a valid analysis journey or labels a packet score as a check of the original résumé.

**Rejected:** Weakening source verification or silently promoting a document-only save into a confirmed source. The existing explicit confirmation and optional career-saving boundaries remain in force; their fresh-user handoff still needs browser acceptance.

## 2026-07-25 - Visual direction: Studio product, Editorial landing

**Decision:** Two registers, one system. The product surface is a craft tool - dark-first, focused, everything on screen serving the work (Figma/Ableton lineage). The landing is editorial - type at real scale, generous space, one striking idea. Both draw from the same tokens; they differ in scale and rhythm, never in palette.

**Constraint:** Naive restraint produces forgettable, and decoration without a stance produces generic SaaS. Memorable products pair restraint with a point of view. The name is already "Talent Studio", and users genuinely are making something - the craft-tool register is the honest one.

**Rejected:** Instrument (precision-instrument aesthetic - correct for "evidence you can see" but cold, and job searching is already cold). Quiet luxury (addresses the emotional reality but reads unserious when your career is on the line).

## 2026-07-26 - Accent settled: cyan/teal, and the surface scale moved with it

**Decision:** `--accent: #00C2CD` dark / `#00787F` light. This is what shipped and what `app/globals.css` holds. It supersedes both the Cyan entry and the Cobalt entry below.

**Constraint:** The brand rebuild changed the inputs, not just the answer. The surface scale moved off Google's greys onto the brand's navy (`#01081F` → `#122045`) and paper (`#FFFFFF` → `#EAEFF9`) in the same change. Every contrast verdict recorded before 26 July was measured against surfaces that no longer exist.

**Consequence worth keeping:** against the old greys, no candidate cleared 4.5:1 on all seven surfaces — hover and active always failed, which is what made "one step per mode" look structurally impossible. Against navy and paper, one step per mode clears everything. The rule that survived is not a value but a method: **validate per surface, every time, mechanically.** `design-audit.js` now computes `accentContrastFails` across every theme × surface pair, and it must stay 0.

**Rejected:** carrying forward any of the three earlier recommendations (Cyan on measurement, Azure on hue separation, Cobalt on mark-matching). Each was reasonable against the inputs available at the time. None was re-derived after the surfaces changed, which is the only reason to trust a contrast number.

## 2026-07-25 - Accent changed from Cyan to Cobalt

> ⚠️ **Superseded** by the 26 July entry above. Cobalt was never implemented; the shipped accent is cyan/teal `#00C2CD`/`#00787F`. The brand reasoning here is still the right *kind* of reasoning — it is why the decision moved off a pure contrast argument — but the value is wrong.

**Decision:** Cobalt - `#5a7fff` dark / `#315cff` light. Supersedes the Cyan decision recorded earlier today.

**Constraint:** The shipped brand mark and wordmark are electric blue, approximately `#2b3fff`. Cobalt is the validated family closest to it, and `--admin-cobalt: #315cff` already exists in the admin stylesheet. Cobalt therefore unifies mark, wordmark, product accent and the admin fork in one decision. Cyan would have left the logo saying electric blue while the buttons said teal - a mismatch users feel without being able to name.

**Rejected:** Cyan `#0891b2`/`#0e7490`. It passed contrast validation, which is how it got chosen - but it was selected on measurement alone, before anyone looked at the brand. Method error, not arithmetic error.

## 2026-07-25 - The chevron is the form language

**Decision:** Keep the mark. The folded-ribbon chevron becomes the product's geometry, not just its logo: the fold as section divider, the apex angle as recurring construction, ascent as the motion metaphor for progress.

**Constraint:** It is already yours, it reads as both letter and mark inside the wordmark, and upward motion is the right metaphor for a career product. An owned form language beats an adopted aesthetic.

**Two corrections:** The flat-blue mark becomes canonical; the foil gradient is reserved for large hero use only - it flattens in monochrome, dies at 16px, and the brand doc's own requirement is legibility at 16px monochrome. The secondary chevron inside the "n" of Talent is removed; one idea stated once is stronger.

**Note:** `docs/taco-brand-system.md` describes a TC monogram on a white tile with a cyan-to-blue edge. That is not what shipped. The doc needs rewriting against the actual mark.

## 2026-07-25 - The evidence marks are the signature element

**Decision:** Verified / inferred / draft / missing get a genuinely distinctive visual treatment, and that treatment is the thing the product is recognised by.

**Constraint:** Memorable products have one describable-to-a-friend element. No competitor can copy this one without adopting the truth-lock architecture underneath it, which makes it defensible rather than merely decorative.

## 2026-07-25 - Phone-primary, not phone-capable

**Decision:** The phone is the primary device; desktop is the accessory. This governs information architecture, not just breakpoints.

**Constraint:** The README already claims "mobile-first AI career workspace" and "mobile is a complete product surface" - the product has been positioned this way without being built this way. Job searching happens in gaps: commute, sofa, before a meeting, late at night. 43 routes behind a four-group sidebar is a desktop IA that reflows, which is not the same thing.

**Implication:** The mobile home screen is not a tool grid. Reviewing a resume diff at 390px is the hardest screen in the product and also the core promise - it is the design problem, not an afterthought.

## 2026-07-25 - First design investment goes to the activation path

**Decision:** Upload to matches to packet gets the design work first. Landing second. Admin gets folded in mechanically via tokens and never gets bespoke design.

**Constraint:** The north star is three explainable matches and one review-ready packet within ten minutes. That path *is* the first-run experience, and first-run decides whether a signup was worth acquiring. A beautiful landing that feeds a mediocre activation buys traffic and loses users. Admin is internal - no user ever sees it, so bespoke design there has no return.

## 2026-07-25 - `quantumsec01@gmail.com` named as second admin recovery owner

**Decision:** `quantumsec01@gmail.com` is the second owner. Provisioning steps in `docs/SECOND-RECOVERY-OWNER.md`; the existing owner runs the CLI, not the new account.

**Constraint:** The system had exactly one owner. Owner creation and recovery are CLI-only from a trusted environment, and the admin runbook's own deployment checklist requires at least two owners before rotating the bootstrap operator - so a single owner was a single point of failure for the entire admin plane. Admin MFA enforcement was also blocked on it, because enforcing MFA with one owner risks locking out the only account able to repair the situation.

**Rejected:** Guessing or inferring the address. Every tracker in this repo says the owner must supply the exact verified email; a mistyped owner address is unrecoverable through the web console, which by design cannot edit owners.

**Verified:** 25 July 2026 11:09. `quantumsec01@gmail.com` signed in and renders the Admin Access module as the current account - which exercises the full `requireAdmin` chain (revocation-checked token, active `admin_accounts` record, matching custom claims, verified email, role permission). Both owners show Active at role version v1. The original owner is CLI-protected.

**Still open:** neither owner has MFA. Firebase project MFA is disabled, so the Command Grid item "second active recovery owner **with MFA**" remains blocked - the owner half is done, the MFA half is not.

**Revisit if:** a third owner is added, or the account is rotated.

## 2026-07-25 - `core.fileMode=false` set on the repository

**Decision:** Set `core.fileMode false` locally.

**Constraint:** Viewing the repo through a Linux mount reported 1,200 files as modified with zero content changes - pure permission-bit churn between Windows and Linux. It buried the 6 real changes and made `git status` useless for judging state. After the change: 1,206 entries becomes 6.

**Rejected:** Committing the mode changes. They would reappear on the next cross-platform access, and the commit would be 1,200 files of noise obscuring real history.

## 2026-07-25 - Git index operations are not possible from the remote device bridge

**Decision:** All git write operations (`add`, `commit`, `push`) are performed by Claude Code running natively, never from a remote session.

**Constraint:** The mounted filesystem cannot unlink files inside `.git/`. Git creates `index.lock`, completes its work, then fails to remove it - leaving a stale lock that blocks every subsequent index operation. Confirmed by reproduction: clearing the lock allows exactly one operation before the next one strands another.

**Rejected:** Working around it by clearing the lock before each command. It is fragile, and a lock cleared while a real git process is running would corrupt the index.

## 2026-07-25 - Accent becomes a new hue family, one step per mode

**Decision:** Cyan - `#0891b2` dark / `#0e7490` light. Retires both the Google-blue `--accent` and the unbacked emerald shipping in the sidebar.

**Constraint:** No single hex clears 4.5:1 against both a near-black and a near-white surface; a step light enough for dark mode is too light for white. A per-mode pair is the only correct shape, not a workaround.

**Rejected:** Teal - sits too close to success green and would blur the fact/inference distinction the evidence system depends on. Azure - too close to the Google blue being retired. Cobalt remains the pragmatic alternative since admin already uses `#315cff`, which would make the admin fold-in nearly free.

**Revisit if:** brand work establishes a company color that should also serve as the product accent.

## 2026-07-25 - `--text-muted` and light `--warning` corrected for contrast

**Decision:** `--text-muted` becomes `#80868b` dark / `#5f6368` light. Light `--warning` becomes `#a85200`.

**Constraint:** The previous muted values failed WCAG AA on every surface they were used on - worst case 2.37:1 against a 4.5:1 requirement - and `--text-muted` is the ink for the *missing evidence* state, the message users most need to be able to read. Light `--warning` at `#e37400` measured 2.79:1, below even the 3:1 graphic threshold.

**Rejected:** Keeping the values and relying on the mandatory icon+label pairing as mitigation. That works for a status glyph; it does not make body text legible.

## 2026-07-25 - Admin folds into the main design system, keeping density

**Decision:** Retire the 30 `--admin-*` tokens and the 7 that shadow global names with different values. Preserve admin's information density through a `data-density="compact"` modifier affecting spacing and row height only.

**Constraint:** Shadowing global token names is an active collision - the same name resolves differently depending on which stylesheet wins, which is a class of bug that is very hard to see and very easy to reintroduce.

**Rejected:** Leaving admin forked. Defensible on the grounds that it is internal-only, but the shadowed names would still have to be fixed, and at that point the remaining fork buys little.

## 2026-07-25 - Resume templates stay outside the design system

**Decision:** `components/resume-templates/` and `lib/resume-templates/` remain visually independent and are excluded from `design-audit.js`.

**Constraint:** They are documents rendered for employers, not product UI. Their non-product fonts are intentional, and they must not invert with the app theme - verified: zero `dark:` variants across all seven files.

**Rejected:** Unifying them for consistency. Auditing them against product tokens would generate permanent noise, which trains people to ignore the audit - the failure mode that produced the current drift.

## 2026-07-25 - Repository recovered by fresh clone rather than in-place repair

**Decision:** Clone fresh from GitHub to `C:\dev\talent-consulting`, lay the working tree on top, commit in twelve batches.

**Constraint:** `.git/objects/pack/` retained its `.idx` and `.rev` but lost the `.pack` - 272 unreadable objects, breaking `git diff` and truncating history traversal. Commit `6bfd9a6` was intact on the remote, so history was recoverable; the local-only refs were not.

**Rejected:** In-place `git fetch` repair - viable and less disruptive, but leaves the repository inside a OneDrive-synced folder, which is the root cause.

**Accepted loss:** `codex/audit-automation-recovery`, `codex/release-safe-cleanup`, and both stashes. Their trees live in the missing pack; bundle, format-patch and archive were all attempted and all failed.


## 2026-10-09 — Agentic baseline isolation and compatibility

- Use fixed synthetic test commands inside Linux network/PID namespaces, masked runtime configuration and demo Auth/Firestore emulators; copied clone credentials are not an isolated environment. Public advisory/SEO reads are separate, credential-free evidence. No gate or acceptance threshold was weakened.
- Preserve and tag Oracle's raw-text JD digest and packet review's normalized/JSON JD digest. Identical posting text currently produces different hashes; future adapters must keep both provenance encodings explicit and add the missing analysis relationship.
- Treat the original's start-of-turn manifest as the preservation reference; older clone-baseline hashes no longer describe unrelated work performed since then.


## 2026-10-09 — Preparation authority contract checkpoint

- Keep the first P1 implementation pure and disconnected while issuance, storage and staging are unresolved; a model-provided confirmation must never become server authority. No claim that the existing queue path is repaired follows from schema tests.
- Return the original stored command on an idempotent replay, preserving deadline, identity and budget. Check aggregate reservations before new provider calls; reconciled internal saves are not new provider reservations.
- Leave Tasks versus Workflows provisional until the same recovery flow can be tested in isolated staging. The local contract suite is not cloud recovery evidence, and a copied production configuration is not permission to run that experiment.


## 2026-10-09 — SEO S0 audit policy

- Audit exact named legal and anonymous app routes independently of sitemap sampling. Require public self-canonicals and excluded app shells with noindex, omitted canonicals and no sitemap membership; preserve current robots blocks through an explicit crawl-either policy. Anonymous responses do not prove account ownership or actual search indexation.
- Fail CI for deterministic route-policy incidents while keeping editorial length/link heuristics advisory. Run local fixtures on pull requests and bounded public crawls separately; require explicit CLI policy configuration so a missing file or array cannot silently weaken coverage.
- Keep transport anonymous, origin-bound and bounded across redirects/body reads. Reject ambiguous/private paths and redact unsafe URL data; omit private response content and unavailable measurements from reports. Preserve optional empty policies only for existing direct API callers.
- Build this package in an isolated worktree and integrate only reviewed changes into the concurrent checkout. Existing assistant/CVE gate failures remain release blockers; metadata/copy correction and deployment are later work.

## 2026-10-09 — Planned four-part core journey contracts

**State:** decisions for the next build, not implemented behavior. Canonical detail and acceptance: [Core journey implementation plan](tool-upgrade-plan.md#core-journey-implementation-plan--9-october-2026); execution resumes from [the existing checkpoint](../.codex/long-horizon/tool-upgrade.md).

- **Separate durable search source from career saving.** Add an explicit user action and schema-v2 `workspace.kind:'source', purpose:'role_search'` in owner-scoped `resume_versions`, through an authenticated server service with a protected create-only receipt. The unchecked career option cannot invoke `saveExperienceRevision` or populate profile/history. Rejected: weakening document-source classification or silently saving an `experience` record, which would blur generated documents and optional career storage.
- **Seal legacy facts before reuse in this handoff.** Direct identity reuse requires a matching sealed receipt. Mutable schema-v1 career/document lineage is read, confirmed and snapshotted; it does not inherit immutability from structural metadata. Arbitrary authored claims remain self-attested, not independently verified or universally detected AI text.
- **Share v2 integrity across every consumer.** Source reads, search, apply reservation/finalization, packet review/approval and linked export use one owner/reference/receipt/hash normalization contract. New v2 integrity failure never falls back to legacy provenance. Preserve stable-canonical versus JSON packet hash encodings and existing legacy proof bytes explicitly. Retry returns original IDs/timestamps, including the current career-save provenance normalization path.
- **Gate creation on actual lifecycle coverage.** Current account confirmation records deletion intent, not erasure. Approved erasure/retention and a transactional create-versus-deletion fence covering sealed sources/receipts/local caches are prerequisites to activation. If unavailable, keep new source creation off rather than claiming account cleanup works.
- **Review real drafts before use.** Preserve prominent Find roles and pasted-JD paths. Route application and queue artifacts to their separate authoritative reviews. Prepared, revision-approved, exported, employer-posting-opened and user-reported submitted remain distinct. Help explains without performing actions.
- **Keep repair/release scope bounded.** Three CSS files repair measured audit drift with unchanged baseline; existing SEO S1 repairs root/legal/twelve child metadata plus both header layers. Preserve landing safety, templates and parallel work. Release requires a clean reviewed candidate, current native/staging evidence, serving identity and separate rules recovery: automatic deploy rollback does not restore Firestore rules.

An independent fresh-context skeptic confirmed three contract gaps; all were incorporated and reread as resolved at plan level. Product implementation, native UI acceptance and release remain pending. Build later with the primary coordinator owning consequential contracts/final decisions, bounded Luna workers and independent skeptical review under long-horizon-build.

## 2026-10-10 — Core journey implementation and activation boundary

- The four-part build is authorized. Use sealed schema-v2 role-search sources in `users/{uid}/resume_versions`; no generic client proof write. Stable canonical and legacy packet JSON hash encodings remain distinct. Recover the original matching receipt after response loss or rollout disable, but never after account deactivation/deletion fencing. Preserve legacy proof bytes; malformed v2 or misplaced receipt envelopes cannot become legacy sources.
- New creation defaults off. Require an active, policy-versioned **top-level `account_source_fences/{uid}`**, retained after `users/{uid}` erasure. An approved future eraser must fence transactionally before enumerating/deleting source data. The current deletion-intent endpoint is insufficient; no erasure/provisioner or approved retention policy is implied by the tested fence protocol.
- Saved generated artifacts can offer only a retained original whose hash matches, followed by explicit factual review. Editing generated wording does not promote it to source facts. Optional preference/selection caches are best effort; only authoritative owner-scoped reads determine explicit source selection. Command-identity session storage remains required for safe source retries.
- Prepared exports read fresh actual packet authority and require the exact displayed revision, linked content hash and unchanged truth-guard output. Default Word export must retain every supported canonical fact, verified by inspecting its generated XML; download remains separate from user-reported submission.
- Built-response evidence justified a bounded suite-layout metadata correction beyond the twelve named child layouts: preserve the existing client WorkspaceFrame/Help providers, use server metadata to prevent base/other suite HTML from inheriting public `index`. Matching response headers remain authoritative. No broad dashboard/layout redesign.
- Synchronize installed dependencies to the existing lockfile before final checks. Preserve manifest bytes and distinguish anonymous built HTTP policy checks, actual local emulator proof and blocked native UI acceptance. Never describe one accepted development advisory as zero vulnerabilities, or local SEO repairs as passing live production CI.

Independent implementation review findings are repaired and narrowly reread as resolved. Native/staging acceptance, activation and clean candidate/publication remain open; detailed receipts are in the [implementation report](tool-upgrade-implementation.md) and [checkpoint](../.codex/long-horizon/tool-upgrade.md).
