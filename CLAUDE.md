# CLAUDE.md — Talent Studio (`talentconsulting-io`)

Context for Claude Code in this repository. Every claim below was verified against source on 4 August 2026.

**Read `TALENT_SUITE_ARCHITECTURE.md` before touching data, auth or billing.** Several older documents in this repo are wrong; see §6.

---

## 1. What this product is

TalentConsulting.io is a mobile-first AI career workspace. The assistant is **Taco**. A user uploads a real resume, states a target role, gets a small number of *explainable* job matches, and Taco prepares a truthful application packet the user reviews before anything leaves the product.

**It is not auto-apply.** Nothing is submitted, emailed or sent externally without explicit user approval.

North star: resume upload → 3 explainable matches + 1 review-ready packet, in under 10 minutes.

---

## 2. Stack — ground truth

| Layer | Actual implementation |
| --- | --- |
| App | Next.js App Router, React, TypeScript, `output: 'standalone'` |
| Data | Cloud Firestore |
| Auth | Firebase Auth, ID-token bearer, **no session cookies** |
| Storage | Firebase Storage |
| Billing | Stripe Embedded Checkout + webhooks |
| Email | Resend + Firestore outbox |
| Rate limit | Upstash Redis |
| Hosting | Cloud Run (primary) + Firebase Hosting SSR |

**There is no Supabase, Postgres or pgvector.** No `@supabase/*` dependency; zero references in `lib/`, `app/`, `components/`. Old docs claiming otherwise are listed in §6.

### AI providers — three, via Vercel AI SDK (`lib/ai/providers.ts`, `lib/ai/models.ts`)

```
fast:      groq('openai/gpt-oss-120b')
validator: google('gemini-3-flash-preview')
sona:      openrouter('qwen/qwen3.6-plus')
writing:   default openai/gpt-oss-120b | verifier deepseek-v4-flash
           premium deepseek-v4-pro     | fallback qwen3.6-plus   (all OpenRouter)
```

Voice: STT Deepgram `nova-2`; TTS OpenRouter `openai/gpt-4o-mini-tts-2025-12-15`; live `gemini-2.5-flash-preview-native-audio`.

Two traps:
- `lib/gemini.ts` is **not** a Gemini client — it POSTs to `/api/ai`. The real client is `lib/ai/gemini-client.ts`.
- **ElevenLabs is unused.** It appears only in CSP allowlists in `next.config.js` and `firebase.json`.

---

## 3. Non-negotiable rules

### Truth

IMPORTANT: Never generate or permit invented skills, metrics, certifications, degrees, employers, titles or dates.

YOU MUST leave unknown evidence unknown. Never render a missing value as a measured zero, and never invent one. If a grader, scorer or data source is unavailable, fail loudly — return an error, persist nothing, and let the UI say so. Do not synthesise a plausible number from keyword counts, string lengths or field presence. The `talent-studio-design` skill's `references/evidence-states.md` is the full rule.

Truth locks are enforced in `firestore.rules`, not just in code: `resume_versions` become immutable once a `guardrail_report` is attached; packet proof fields on `applications` are unwritable by clients; `settings.resumeMorphSafety` and `settings.privacyControls` are server-only. They are re-applied at the PDF/DOCX export boundary (`lib/resume-export-truth.ts`), not only at generation.

Do not add a client write path that works around these. The rules will reject it, and that rejection is correct.

### Standing holds

No live payments. No real user emails. No external submission without human approval.

### Auth

- User routes: `guardApiRoute()` in `lib/api-auth.ts`.
- Admin routes: `requireAdmin(request, permission)` in `lib/admin-auth.ts` — revocation-checked token, `admin_accounts/{uid}` lookup, custom-claim cross-check, `email_verified`, MFA.
- IMPORTANT: `isMasterAccount` is a commercial-entitlement override only. Never use it to authorize an admin route.

### Billing

`PLAN_PRICE` is `null` for every paid tier **by design**. Prices resolve from Stripe at runtime (`lib/billing-prices.ts`). YOU MUST NOT hardcode a price — repricing is a Stripe dashboard operation plus env var changes.

Tiers in code: `free | pro | studio | god`. Strategy calls `studio` **"Max"** — customer-facing name only; `studio` is canonical in code.

### Secrets

| File | Rule |
| --- | --- |
| `.env`, `.env.local`, `.env.cloudrun.yaml`, `hermes-agent-keys.txt` | gitignored — **never commit** |
| `.env.production` | tracked **by design** — only `NEXT_PUBLIC_*` values baked into the client bundle; the Docker build needs it |

Never deploy from an unreviewed dirty tree.

---

## 4. Verification — run these

```bash
npm run type-check                  # 0 errors
npm run build                       # must pass
node scripts/design-audit.js --ci   # PASS - never run --update to make it pass
npm run test:release-safety         # 245
npm run test:assistant-harness      # 329
npm run test:admin-command-grid     # 24
npm run test:email-system           # 59
npm run test:observability          # 31
```

Counts are baselines as of 4 August 2026 and rise as tests are added. The gate is **zero failures**, not the exact number.

Two gates currently fail. Both predate any current work — do not treat them as caused by your change, and do not "fix" them by weakening the check:
- `npm run security:cve:ci` — 3 high, all `brace-expansion` transitive DoS advisories, patched versions available.
- `npm run seo:audit:ci` — 1 critical, `robots.txt` returns 404. Note this crawls **live production**, not localhost.

A UI change is **not complete** until `type-check` passes, `build` passes, and a real browser run at 320 / 390 / 430 / 768 / 1024 / 1440px shows the core result state, a clean console, and no horizontal overflow. Use the `ui-verify` skill; `node scripts/ui-verify.js` drives local Playwright.

---

## 5. Design system

Run `node scripts/design-audit.js` — **it is the authority**. Do not copy its numbers into this file; they move every session.

The current state is fragmented: heavy inline styling, many hardcoded hex values, and most suite routes still outside `SuiteToolShell`. Infrastructure is fine and the token habit is strong (thousands of `var()` calls) — what is missing is enforcement.

The **`talent-studio-design` skill is the design law** for anything that renders, and carries the depth on tokens, surfaces and evidence states. Load it before writing or changing markup.

Decided direction — see `docs/design-system-v2-plan.md` and `docs/DECISIONS.md`:

1. **Evidence-first semantics.** Color encodes epistemic status: verified / inferred / draft / missing.
2. **Accent is Cobalt** — `#5a7fff` dark / `#315cff` light (decided 25 July 2026, superseding an earlier Cyan decision). It matches the shipped brand mark and the existing `--admin-cobalt`. Azure and Teal were considered and **rejected**. Not yet implemented: `app/globals.css` still ships a cyan `--accent`.
3. **Admin folds into the main system**, keeping its density via a modifier rather than a 30-token fork.
4. **TACO = assistant, TC = company.** Retire the `brand-*` and Sona mark systems.

A structural finding worth carrying: the accent cannot be one step per mode. The token system defines seven surfaces per mode and no candidate clears 4.5:1 on all of them — it needs a step per *surface tier*. Validate contrast per surface, never per mode.

`DESIGN.md` and `UI_DESIGN_GUIDE.md` contradict each other and `.glass-card` is named for a treatment both ban. Resolve against `docs/design-system-v2-plan.md`, not either older document.

Two things that are deliberately outside the system:
- `.agent/.shared/ui-ux-pro-max/` is a **generic** knowledge base recommending Lucide icons and glassmorphism, both of which contradict this project. Reference only — not project law.
- Resume templates (`components/resume-templates/`, `lib/resume-templates/`) are intentionally visually independent — they are documents for employers, not product UI. Leave them out of unification.

---

## 6. Documents that are WRONG — do not build against them

- `docs/archive/hirely-era/` — 10 Hirely.ai setup guides telling you to configure Supabase. Archived out of the repo root because their filenames (`QUICKSTART.md`, `GETTING_STARTED.md`, `README_NEXTJS.md`) are what a newcomer opens first. They leak a stale Supabase project ref (`qsriqbphmvnnbterqnsv`) — treat it as a credential to revoke, not to use.
- `schema.sql`, `suite_schema.sql`, `suite_migration.sql`, `supabase/` — orphaned Postgres DDL. Safe to delete.
- `TalentConsulting_Architecture_Rebuttal.md` — its `$2.99` pricing argument is superseded.
- `GIT-RECOVERY-RUNBOOK.md` — historical. The recovery it describes is complete.

**Current and correct:** `README.md`, `TALENT_SUITE_ARCHITECTURE.md`, `TALENT_SUITE_STATUS.md`, `CHANGELOG.md`, `docs/DECISIONS.md`, `docs/pricing-reconciliation.md`, `docs/design-system-v2-plan.md`.

For workstream and blocked-on-owner status, `TALENT_SUITE_STATUS.md` §3 is the board. Do not duplicate it here — it drifts.

---

## 7. Gotchas that will bite you

1. **`NEXT_PUBLIC_*` is baked at Docker build time.** Changing one requires a rebuild, not just a redeploy.
2. **Security headers are duplicated** in `firebase.json` and `next.config.js`. Change both or they drift.
3. **Two deploy paths coexist** (Cloud Run and Firebase SSR). Confirm which serves production before deploying.
4. **Text wrapping is a release blocker.** `min-w-0` on every text-bearing flex/grid child; `wrap-anywhere` only for URLs/IDs; stat numbers `tabular-nums whitespace-nowrap`, never stacked. Test any card below 420px.
5. **The global theme cascade has caused the same P0 twice** — a light-theme override inverting an intentionally dark surface while leaving light text. Theme-invariant surfaces need an explicit boundary.
6. **Mobile has no bottom nav bar.** `MobileQuickToolsRail` sits at the top below 1024px. Sticky bottom bars are for workflow actions only.
7. **Never fabricate UI content** — no fake scores, mock saved data, or placeholder illustrations. `design-qa.md` strips these repeatedly.

`components/landing/` has its own CLAUDE.md covering four deliberate decisions that look like bugs. Read it before editing that directory.

---

## 8. Working style for this repo

- Verify against code, not against documentation. This repo's docs have drifted before — that is why §4 carries dates and §5 refuses to cache numbers.
- Prefer editing an existing file over creating a new one; this repo already has documentation sprawl.
- Run the relevant test suite before claiming a change works.
- For UI changes a browser run is mandatory. "Declared complete without a browser run" is an explicit anti-pattern here.
