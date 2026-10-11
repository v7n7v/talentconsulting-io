# Talent Studio — Status Board

**As of:** 25 July 2026
**Supersedes:** the January 2026 "Hirely.ai" revision, which described a Supabase/IndexedDB stack and a Liquid Resume / mock-interview roadmap that were never shipped.

---

## 1. Headline

Four major workstreams are **code-complete, test-passing, and not shipped**. Every one of them is blocked on an external prerequisite an operator must supply — not on engineering.

**One decision unblocks the most: naming and verifying a second admin recovery owner.** It gates both admin MFA enforcement and admin production activation.

---

## 2. Repository health — action required

| Fact | Detail |
| --- | --- |
| Last commit | `6bfd9a6`, 2026-05-06 |
| Uncommitted | 552 modified, 352 untracked files (~2.5 months of work) |
| Repo integrity | **Damaged** — `.git/objects/pack/` has `.idx` and `.rev` but no `.pack`; 272 objects unreadable |
| Consequence | `git diff` and history traversal fail partway; `git bundle` and `format-patch` fail |
| Lost refs | `codex/audit-automation-recovery`, `codex/release-safe-cleanup`, and both stashes are **unrecoverable** from this clone — their trees live in the missing pack and are not on the remote |
| Backup | Working tree archived and verified, 25 July 2026 — `_backup/src.tar.gz` (1,181 files), `_backup/root-config.tar.gz` (315 files) |

**Procedure:** `GIT-RECOVERY-RUNBOOK.md`.
**Probable cause:** the repository lives inside a OneDrive-synced folder. Move it out.

---

## 3. Workstream status

| Workstream | Code | Tests | Ships when |
| --- | --- | --- | --- |
| Admin Command Grid | Complete (§0–16) | 24/24 | §17 prerequisites cleared |
| Admin RBAC | Live in production | — | MFA enforcement pending 2nd recovery owner |
| Email V2 | Complete | 59/59 | DNS + `.env.production` V2 credentials |
| User Observability v1 | Complete | 31/31 | Retention policy + HMAC secrets + runbook |
| Resume Studio redesign | Complete | — | 1 design-QA item blocked |

### 3.1 Admin Command Grid — section 17 open

Nine modules on branch `codex/admin-command-grid`. Sections 0–16 verified. Outstanding:

- [ ] Provision `ADMIN_AGGREGATE_CRON_SECRET` in the production GitHub environment; prove the scheduled workflow reaches production
- [ ] Provision and verify a **second active recovery owner with MFA**
- [ ] Align production auth-domain and admin rollout environment values
- [ ] Install a strong production `ADMIN_REFERENCE_SECRET`
- [ ] Run the live recovery-owner proof and authenticated MFA smoke token
- [ ] Capture rollback point, deploy, prime aggregates, run smoke tests — **only on explicit request**

Current flags: `ADMIN_MFA_ENFORCED=false`, `FIREBASE_MFA_PROJECT_ENABLED=false`.

> The owner must supply the exact verified email for the second recovery owner. Nothing will be guessed.

### 3.2 Email V2 — cutover blocked

Catalog of 74 events (72 live, 2 marketing disabled). Sender domain `talentconsulting.io` verified and sending; 71/71 live samples accepted by Resend.

Blocked on:

- [ ] Cloudflare Email Routing MX records for `support@`, `ops@`, `dmarc@`
- [ ] `_dmarc` TXT record
- [ ] Destination mailbox for branded Resend SMTP replies
- [ ] `.env.production`: V2 API + webhook credentials, sender/reply routing, signing secrets, ops destination, app origin, cutover flags

Known gaps in one run: notification suite 31/32 (missing `app/api/cron/weekly-suggestions/route.ts` — **this file now exists uncommitted, +612 lines**); release-safety 220/237 due to env drift and Windows permission expectations. Both should re-run clean after the repo recovery.

Procedure: `docs/email-system-runbook.md`. Run shadow rendering before cutover.

### 3.3 User Observability v1 — behind a disabled flag

AC-01..AC-16 accepted 24 July 2026. Independent Auditor, Skeptic and UI-Verifier all PASS.

Blocked on:

- [ ] Retention policy approval
- [ ] Managed HMAC secrets
- [ ] Approved smoke and rollback runbook

Flag `USER_OBSERVABILITY_V1_ENABLED` stays off until all three clear.

### 3.4 Resume Studio — one QA item blocked

9 of 10 design-QA sections pass. **Three Signature Resume Templates** is `blocked`: the in-app browser refused `localhost` under its URL security policy, so Technical Signal and Brutalist Voltage have no rendered captures or source/implementation comparisons.

Closeout needs, per template: A4 captures, combined comparisons, and verification of selection, reload mapping, 390px mobile, dark-paper isolation and console state.

---

## 4. Test posture

| Suite | Result |
| --- | --- |
| `npm run test:release-safety` | 244/244 |
| `npm run test:assistant-harness` | 329/329 |
| `npm run test:admin-command-grid` | 24/24 |
| `npm run test:email-system` | 59/59 |
| `npm run test:observability` | 31/31 |
| `npm run build` | 180–181 static pages |
| `npm run security:cve:ci` | 0 high / 0 critical |
| `npm run seo:audit:ci` | 42 medium content issues on production |

---

## 5. Commercial state

| | Strategy target | Live in Stripe |
| --- | --- | --- |
| Pro | ~$19/mo, $149/yr | $4.99/mo, $9.99/yr¹ |
| Max (`studio` in code) | ~$49/mo, $399/yr | — |
| Sprint pass | $7–12 / 7 days | not built |

¹ As recorded in `docs/launch-readiness-report.md`, 5 July 2026. Prices resolve from Stripe at runtime (`lib/billing-prices.ts`); code holds no prices. **Changing price is a Stripe dashboard operation.**

Provider cost basis: $1.488/month Pro, $4.3989/month Max maximum included Taco workload — directional provider cost only. At target pricing that implies ~92% and ~91% gross margin respectively.

See `docs/pricing-reconciliation.md` for the three-way contradiction across strategy, launch-readiness and the architecture rebuttal, and what to change.

**Naming mismatch:** strategy says **Max**, code says **`studio`** (`PlanTier`, `STRIPE_STUDIO_*`). Unresolved.

---

## 6. Standing holds

These are deliberate and remain in force:

- No live payments
- No real user emails
- No external application submission without human approval
- No blind auto-apply, ever
- No restricted-source scraping in the default product

---

## 7. Ordered next steps

1. **Recover the repository** and commit the outstanding work — `GIT-RECOVERY-RUNBOOK.md`. Everything else is at risk until this is done.
2. **Name the second admin recovery owner.** Unblocks admin MFA and production activation.
3. **Complete email DNS**, populate `.env.production` V2 values, run shadow rendering, then cut over.
4. **Capture the two missing resume-template comparisons** to clear the last design-QA blocker.
5. **Approve observability retention policy and HMAC secrets** before enabling the flag.
6. **Decide pricing** and align Stripe to it.
