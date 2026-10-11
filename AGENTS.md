# AGENTS.md — Talent Studio (`talentconsulting-io`)

Context for Codex working in this repository. Verified against source on 25 July 2026.

**Read `TALENT_SUITE_ARCHITECTURE.md` before touching data, auth or billing.** Several older documents in this repo are wrong; see §8.

---

## 1. What this product is

TalentConsulting.io is a mobile-first AI career workspace. The assistant is **Taco**. A user uploads a real resume, states a target role, gets a small number of **explainable** job matches, and Taco prepares a truthful application packet the user reviews before anything leaves the product.

**It is not auto-apply.** Nothing is submitted, emailed or sent externally without explicit user approval.

North star: resume upload → 3 explainable matches + 1 review-ready packet, in under 10 minutes.

---

## 2. Stack — ground truth

| Layer | Actual implementation |
| --- | --- |
| App | Next.js App Router, React, TypeScript, `output: 'standalone'` |
| Data | **Cloud Firestore** |
| Auth | Firebase Auth, **ID-token bearer, no session cookies** |
| Storage | Firebase Storage |
| Billing | Stripe Embedded Checkout + webhooks |
| Email | Resend + Firestore outbox |
| Rate limit | Upstash Redis |
| Hosting | Cloud Run (primary) + Firebase Hosting SSR |

**There is no Supabase, Postgres or pgvector.** Verified: no `@supabase/*` dependency; zero references in `lib/`, `app/`, `components/`.

### AI providers — three, via Vercel AI SDK (`lib/ai/providers.ts`, `lib/ai/models.ts`)

```
fast:      groq('openai/gpt-oss-120b')
validator: google('gemini-3-flash-preview')
sona:      openrouter('qwen/qwen3.6-plus')
writing:   default openai/gpt-oss-120b | verifier deepseek-v4-flash
           premium deepseek-v4-pro     | fallback qwen3.6-plus   (all OpenRouter)
```

Voice: STT **Deepgram** `nova-2`; TTS **OpenRouter** `openai/gpt-4o-mini-tts-2025-12-15`; live `gemini-2.5-flash-preview-native-audio`.

Two traps:
- `lib/gemini.ts` is **not** a Gemini client — it POSTs to `/api/ai`. The real client is `lib/ai/gemini-client.ts`.
- **ElevenLabs is unused.** It appears only in CSP allowlists.

---

## 3. Non-negotiable product rules

### Truth locks — enforced in the database, not just in code

`firestore.rules` is the enforcement point. `resume_versions` become **immutable once a `guardrail_report` is attached**; packet proof fields on `applications` are unwritable by clients; `settings.resumeMorphSafety` and `settings.privacyControls` are server-only.

Do not add a client write path that works around these. The rules will reject it, and that rejection is correct.

Never generate or permit: invented skills, metrics, certifications, degrees, employers, titles, dates. Truth locks are re-applied at the **PDF/DOCX export boundary** (`lib/resume-export-truth.ts`), not only at generation.

**Unknown evidence stays unknown — never render it as a measured zero.**

### Auth

- User routes: `guardApiRoute()` in `lib/api-auth.ts`.
- Admin routes: `requireAdmin(request, permission)` in `lib/admin-auth.ts` — revocation-checked token, `admin_accounts/{uid}` lookup, custom-claim cross-check, `email_verified`, MFA.
- **`isMasterAccount` is a commercial-entitlement override only. Never use it to authorize an admin route.** The source says so explicitly.

### Billing

`PLAN_PRICE` is `null` for every paid tier **by design**. Prices resolve from Stripe at runtime (`lib/billing-prices.ts`). **Never hardcode a price.** Repricing is a Stripe dashboard operation plus env var changes.

Tiers in code: `free | pro | studio | god`. Strategy calls `studio` **"Max"** — customer-facing name only; `studio` is canonical in code.

### Secrets

| File | Rule |
| --- | --- |
| `.env`, `.env.local`, `.env.cloudrun.yaml`, `hermes-agent-keys.txt` | gitignored — **never commit** |
| `.env.production` | **tracked by design** — only `NEXT_PUBLIC_*` values baked into the client bundle; the Docker build needs it |

---

## 4. Repository state — READ THIS FIRST

**Recovered and committed as of 25 July 2026. One action outstanding: the push.**

- The missing `.pack` was **found and restored** — in the sibling folder `Talent Consulting 04112026 - OLD-ANIMATED`, not the recycle bin. `git diff` works; history is whole at 96 commits.
- The working tree is committed across **15 commits** on `codex/admin-command-grid`. Tree clean.
- **`git push -u origin codex/admin-command-grid` has not run.** Git Credential Manager holds no `github.com` credential — only a legacy `api.github.com` entry — so it falls back to an interactive prompt. This is an owner action; nothing is on the remote yet.
- The repo **still lives in a OneDrive-synced folder**. Root cause unaddressed. `recover-repo.ps1` performs the migration to `C:\dev\talent-consulting` if you want it, but recovery no longer depends on it.

Actually lost: **`stash@{0}`** only. Its tree is among 16 still missing, and it is why `git gc` aborts — `gc.auto` is set to `0` locally so commits aren't interrupted. `stash@{1}` survived and is readable. The branches `codex/audit-automation-recovery` and `codex/release-safe-cleanup` were **never lost**; both are on GitHub at the commits the runbook lists as unrecoverable.

`GIT-RECOVERY-RUNBOOK.md` is now historical. Both its scripts needed fixes to run on Windows PowerShell 5.1 (UTF-8 BOM, and `$ErrorActionPreference` vs native git stderr); the fixes are committed.

**Never deploy from an unreviewed dirty tree.**

---

## 5. Verification — run these

```bash
npm run type-check
npm run build                      # expect 180–181 static pages
npm run test:release-safety        # 244/244
npm run test:assistant-harness     # 329/329
npm run test:admin-command-grid    # 24/24
npm run test:email-system          # 59/59
npm run test:observability         # 31/31
npm run security:cve:ci            # 0 high/critical
npm run seo:audit:ci
```

A UI change is **not complete** until: `type-check` passes, `build` passes, and a real browser run at **320 / 390 / 430 / 768 / 1024 / 1440px** shows the core result state, a clean console, and no horizontal overflow.

---

## 6. Design system

**Current state is fragmented.** Run `node scripts/design-audit.js` — **it is the authority, not this table.** Baseline of 26 July 2026, `app/` + `components/`:

| Metric | Value |
| --- | --- |
| Distinct hardcoded hex | 300 (1,183 occurrences) |
| Prohibited class occurrences | 1,260 (includes CSS-level, which a `.tsx`-only scan misses) |
| Distinct radius values | 31 against a documented single 12px standard |
| Buttons inline vs `btn-*` | 301 vs 22 |
| Cards inline vs shared | 1,167 vs 68 |
| Suite routes outside `SuiteToolShell` | 22 of 43 |
| Token definition files | 6 |
| Tokens referenced but never defined | 20 |
| Accent below 4.5:1 on a surface | 0 — CI-gated |

**This table has gone stale twice**: once when the tool superseded the original hand counts (508/1,231/344/488/18/28), again when the brand rebuild moved every hex-derived figure. That is the argument for the tool, not for a better table. The figure that changes planning is inline cards — **1,167, not 488** — putting Phase 3 at roughly 2.4× its original scope.

Counterpoint: **8,101 `var()` calls** — the token habit is strong. Infrastructure is fine; enforcement is absent.

`DESIGN.md` and `UI_DESIGN_GUIDE.md` **contradict each other** (cyan/emerald, gradients, card background, sidebar width) and `.glass-card` is named for a treatment both documents ban. Resolve against `docs/design-system-v2-plan.md`, not against either older document.

**Direction is decided** — see `docs/design-system-v2-plan.md`:

1. **Evidence-first semantics.** Color encodes epistemic status: verified / inferred / draft / missing.
2. **Accent — DONE, do not reopen.** Cyan/teal `#00C2CD` dark / `#00787F` light, shipped 26 July 2026. Chosen against the brand mark, not against a contrast table: the mark and wordmark are electric blue, and an accent from a different family would have made the logo and the buttons disagree. The old Google-blue token and the unbacked emerald are both retired. `design-audit.js` gates it via `accentContrastFails`, which must stay 0.
3. **Admin folds into the main system**, keeping its density via a modifier rather than a 30-token fork.
4. **TACO = assistant, TC = company.** Retire the `brand-*` and Sona mark systems.

Do not start the design work until the repo is recovered, committed **and pushed** (§4 — the push is outstanding). It touches every file.

A method lesson worth carrying, now that the arithmetic is automated: **validate contrast per surface, never per mode.** Measured against the old Google-grey scale, no accent candidate cleared 4.5:1 on all seven surfaces — hover and active always failed. The brand rebuild replaced those surfaces with navy and paper, and one step per mode now clears everything. Both facts were true; only the surfaces changed. That is why `design-audit.js` computes `accentContrastFails` across every theme × surface pair rather than trusting a recorded verdict — a number measured against retired inputs is worse than no number.

### Where things live

- `.agent/.shared/ui-ux-pro-max/` is a **generic** design knowledge base. It recommends Lucide icons and glassmorphism, both of which contradict this project. Reference only — not project law.
- Resume templates (`components/resume-templates/`, `lib/resume-templates/`) are **intentionally visually independent** — they're documents for employers, not product UI. Verified clean separation. Leave them out of unification.

---

## 7. Blocked workstreams — all owner-gated, none engineering-blocked

| Workstream | Blocked on |
| --- | --- |
| Admin Command Grid | `ADMIN_AGGREGATE_CRON_SECRET`, `ADMIN_REFERENCE_SECRET`, second-owner **provisioning**, auth-domain alignment |
| Admin RBAC | MFA enforcement, pending that same second-owner provisioning |
| Email V2 | Cloudflare MX + `_dmarc` for `support@`/`ops@`/`dmarc@`; `.env.production` V2 credentials |
| User Observability v1 | retention-policy approval, managed HMAC secrets, approved rollback runbook |
| ~~Resume Studio QA~~ | **unblocked** — `node scripts/ui-verify.js` drives local Playwright, which has no `localhost` restriction |

**The second recovery owner is named:** `quantumsec01@gmail.com`, by the existing owner on 25 July 2026. What remains is **provisioning**, not naming — steps in `docs/SECOND-RECOVERY-OWNER.md`, run by the *existing* owner from a trusted environment with the production service account. It is still the single action that unblocks the most.

Standing holds: no live payments, no real user emails, no external submission without human approval.

---

## 8. Documents that are WRONG — do not build against them

Bannered as superseded on 25 July 2026:

- `docs/archive/hirely-era/` — 10 Hirely.ai setup guides telling you to configure Supabase. Archived out of the repo root because their filenames (`QUICKSTART.md`, `GETTING_STARTED.md`, `README_NEXTJS.md`) are what a newcomer opens first. They leak a stale Supabase project ref (`qsriqbphmvnnbterqnsv`) — **treat it as a credential to revoke, not to use.**
- `schema.sql`, `suite_schema.sql`, `suite_migration.sql`, `supabase/` — orphaned Postgres DDL. Safe to delete.
- `TalentConsulting_Architecture_Rebuttal.md` — its `$2.99` pricing argument is superseded.

**Current and correct:** `README.md`, `TALENT_SUITE_ARCHITECTURE.md`, `TALENT_SUITE_STATUS.md`, `CHANGELOG.md`, `GIT-RECOVERY-RUNBOOK.md`, `docs/pricing-reconciliation.md`, `docs/design-system-v2-plan.md`.

---

## 9. Gotchas that will bite you

1. **`NEXT_PUBLIC_*` is baked at Docker build time.** Changing one requires a rebuild, not just a redeploy.
2. **Security headers are duplicated** in `firebase.json` and `next.config.js`. Change both or they drift.
3. **Two deploy paths coexist** (Cloud Run and Firebase SSR). Confirm which serves production before deploying.
4. **Text wrapping is a release blocker.** `min-w-0` on every text-bearing flex/grid child; `wrap-anywhere` only for URLs/IDs; stat numbers `tabular-nums whitespace-nowrap`, never stacked. Test any card below 420px.
5. **The global theme cascade has caused the same P0 twice** — a light-theme override inverting an intentionally dark surface while leaving light text. Theme-invariant surfaces need an explicit boundary.
6. Mobile has **no bottom nav bar**. `MobileQuickToolsRail` sits at the top below 1024px. Sticky bottom bars are for workflow actions only.
7. **Never fabricate UI content** — no fake scores, mock saved data, or placeholder illustrations. `design-qa.md` strips these repeatedly.
8. **The landing page went blank on a real device once.** Every CSS rule that
   *hides* something there is scoped to `html.js`, set by the pre-paint script
   in `app/layout.tsx`. If that class never lands — script error, blocked inline
   script, in-app WebView with JS off — the page must stay readable. Do not
   remove the gate, and do not add a hiding rule that is not gated on it.
9. **`weakWords` matching is plain substring.** `leverage` does not match
   `leveraging`; `utilize` does not match `utilizing`. The Career Check silently
   under-reports. Stem the list or switch to a word-boundary regex — this is a
   real product bug, not a demo artefact.

---

## 9b. The landing page — `components/landing/`

`app/page.tsx` renders `TalentLanding`. `GuidedCareerLanding` and `LandingPage`
are retired to `_to_delete/`. Four things about it are deliberate and will look
like mistakes if you do not know why:

- **`talent-landing.css` is a plain global stylesheet, not a CSS module**, with
  every selector mechanically scoped under `.tcl`. Converting it to a module
  breaks the page: `talentLandingMotion.ts` finds elements by those exact class
  names, and a module would hash them apart.
- **It contains no colour literals.** The palette is the `.tcl` block in
  `app/globals.css`, which also re-points the token names the app itself uses
  (`--bg-input`, `--text-primary`, …) for that subtree. That is not redundancy:
  `globals.css` styles bare `textarea` with
  `background: var(--bg-input) !important`, and !important cannot be outranked
  by specificity. Anything that leaks in now leaks in wearing the right colour.
- **The landing is dark-only by product decision** — choosing a theme belongs to
  signed-in people, inside the product. `color-scheme: dark` on `.tcl` keeps the
  textarea, scrollbars and focus rings dark when the app is in light mode.
- **Three regions use `dangerouslySetInnerHTML` with module-owned constants**
  (`#res`, `#rwText`, `#chatLog`). The motion module rewrites their innerHTML;
  marking them opaque stops React reconciling children it did not write. No user
  input reaches any of them — the results panel is assembled from a fixed phrase
  list and integer counts and never echoes the textarea at all.

No `box-shadow` anywhere in it. `scripts/design-audit.js` bans it, and the
`components/landing` exception is documented as covering gradients and
`backdrop-filter` only. Elevation there is a solid fill, an accent-tinted border
and an `outline` ring of page background.

Two audit mechanics to understand before you "fix" a metric: `TOKEN_DEF_FILES`
exempts token-defining files from the hex counts *only*, and `EXTERNAL_TOKENS`
tells the scanner that next/font emits `--font-*` at build time. Neither is a
way to switch a rule off.

---

## 10. Working style for this repo

- Verify against code, not against documentation. This repo's docs have drifted before.
- Prefer editing an existing file over creating a new one; this repo already has documentation sprawl.
- Run the relevant test suite before claiming a change works.
- For UI changes, a browser run is mandatory — "declared complete without a browser run" is an explicit anti-pattern here.
