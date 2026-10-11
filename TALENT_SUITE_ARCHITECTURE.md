# Talent Studio — System Architecture

**Status:** Current. Verified against the working tree on 25 July 2026.
**Supersedes:** the Hirely.ai-era revision of this document, which described a Supabase/Postgres + pgvector data layer. That design was never shipped. See [Appendix A](#appendix-a-what-changed-and-why-the-old-version-was-wrong).

> **Read this before writing code.** Every claim below was checked against source files, `firestore.rules`, and `firestore.indexes.json`. File paths are given so you can verify any statement yourself. Where something could not be established from code, it is marked **UNVERIFIED**.

---

## 1. At a glance

| Layer | Implementation | Source of truth |
| --- | --- | --- |
| Web application | Next.js (App Router), React, TypeScript, `output: 'standalone'` | `next.config.js` |
| Styling | Tailwind CSS + CSS custom properties | `tailwind.config.ts`, `DESIGN.md` |
| Database | **Cloud Firestore** | `firestore.rules`, `firestore.indexes.json` |
| Auth | Firebase Auth, ID-token bearer (no session cookies) | `lib/api-auth.ts` |
| Admin authz | Firestore-backed RBAC + custom claims + MFA | `lib/admin-auth.ts`, `lib/admin-permissions.ts` |
| File storage | Firebase Storage | `storage.rules`, `lib/firebase-admin.ts` |
| Billing | Stripe Embedded Checkout, webhooks, portal | `lib/billing-prices.ts`, `app/api/stripe/**` |
| AI | Vercel AI SDK → Groq, Google, OpenRouter | `lib/ai/providers.ts`, `lib/ai/models.ts` |
| Email | Resend + Firestore outbox | `lib/email/**`, `app/api/cron/email-outbox/` |
| Rate limiting | Upstash Redis | `lib/rate-limit.ts` |
| Hosting | Cloud Run (primary) + Firebase Hosting SSR | `Dockerfile`, `deploy-cloudrun.sh`, `firebase.json` |

**There is no Postgres, no Supabase, and no pgvector in this system.**

---

## 2. Data layer — Firestore

### 2.1 Clients

- `lib/firebase.ts` — browser SDK, initialised from `NEXT_PUBLIC_FIREBASE_*`. Its header comment reads *"Replaces Supabase for auth + database"*.
- `lib/firebase-admin.ts` — Admin SDK, initialised from `FIREBASE_SERVICE_ACCOUNT_JSON`. Exports `getAdminAuth()`, `getAdminDb()`, `getAdminStorage()`.
- `lib/database-suite.ts` — application-level data access. Header: *"Primary: Firestore (cloud, syncs across devices) / Fallback: localStorage"*.

### 2.2 Security model

`firestore.rules` ends with a default-deny `match /{document=**}`. Nothing is readable or writable unless a rule explicitly allows it. Collections fall into four bands:

| Band | Rule shape | Meaning |
| --- | --- | --- |
| Owner read/write | `request.auth.uid == uid` | Client may freely read and write |
| Owner read, server write | `allow read: if isOwner(); allow write: if false` | Client sees it; only the Admin SDK changes it |
| Key-fenced | field-level whitelist | Client may mutate *some* fields only |
| Server-only | `allow read, write: if false` | Admin SDK exclusively |

### 2.3 The `users/{uid}` subtree

**Server-authoritative** (`allow read, write: if false` — Admin SDK only):
`subscription/` (the `current` doc holds plan + status), `diagnosticGrants/`, `observabilityControl/`, `observabilityReset/`.

**Owner-read, server-write:** `usage/`.

**Key-fenced** — client may write, but protected fields are immutable:

| Subcollection | Client may change |
| --- | --- |
| `applications/` | everything *except* packet proof fields |
| `resume_versions/` | nothing once a `guardrail_report` is attached |
| `agent_queue/` | only `status`, `packetStatus`, `reviewed_at`, `last_action_at`, `feedbackTags`, `application_id`, `assisted_at` |
| `settings/{settingId}` | everything *except* `resumeMorphSafety` and `privacyControls` |

**Freely owner-mutable** (whitelisted by `isUserMutableCollection()`):
`agent`, `agent_stories`, `applicationQueue`, `cover_letters`, `debriefs`, `feedback`, `fit_analyses`, `interview_sessions`, `jd_templates`, `jobAlertEvents`, `morale`, `network_contacts`, `outcomes`, `personas`, `preferences`, `profile`, `referral`, `skill_verifications`, `study_progress`, `vault`, `writing_sessions`.

**Server-written subcollections** present in code and indexes but absent from the mutable whitelist — therefore Admin SDK only:
`communications`, `history`, `billingSupport`, `stepUpLeases`, `notificationClaims`, `recommendation_impressions`, `recommendation_calibration`, `job_recommendations`, `agent_preflight_receipts`, `email_change_requests`, `metrics`, `items`, `entries`, `list`.

### 2.4 Top-level collections

| Group | Collections | Access |
| --- | --- | --- |
| User-scoped | `study_vault` (owner-read via `resource.data.userId`) | Admin SDK writes |
| Admin plane | `admin_accounts`, `admin_audit_log`, `admin_feedback`, `admin_mutation_claims`, `admin_aggregate_cache`, `admin_pricing_options_decisions` | server-only |
| Observability | `user_observability_events`, `user_observability_summaries`, `user_observability_daily`, `diagnostic_support_cases`, `diagnostic_access_receipts`, `observability_reset_jobs` | server-only |
| Comms | `contact_submissions`, `email_suppressions`, `emailDeliveryAttempts`, `account_action_requests` | server-only |
| Misc | `team_interest`, `shards`, `pricing_memo` | server-only |

Many collections carry `expiresAt` TTL policies declared in `firestore.indexes.json`.

### 2.5 Design invariant

**Truth-locked records are enforced at the database layer, not just in application code.** `resume_versions` becoming immutable once a `guardrail_report` exists, and packet proof fields being unwritable by clients, are *rules-level* guarantees. Do not add a client write path that works around them — the rules will reject it, and that rejection is the intended behaviour.

---

## 3. Authentication and authorization

### 3.1 User routes

`lib/api-auth.ts`:

- `authenticateRequest()` requires `Authorization: Bearer <Firebase ID token>` and calls `verifyIdToken`. **There are no session cookies.**
- `guardApiRoute()` composes the full guard: IP throttle for unauthenticated callers (`cf-connecting-ip` / `x-forwarded-for`), optional `allowAnonymous` with per-IP `ANON_CAPS`, tier resolution via `getUserTier`, per-minute rate limits, and free-tier lifetime caps through `checkUsageAllowed` / `incrementUsage` against a `ROUTE_FEATURE_MAP`.

### 3.2 Admin routes — a separate, stricter plane

`lib/admin-auth.ts` `requireAdmin(request, permission)`:

1. `verifyIdToken(token, true)` — revocation-checked.
2. Reads `admin_accounts/{uid}` from Firestore.
3. Cross-checks custom claims (`admin`, `adminRole`, `adminVersion`) against that record via `evaluateAdminIdentity`.
4. Requires `email_verified`.
5. Checks MFA (`token.firebase.sign_in_second_factor`) subject to `ADMIN_MFA_ENFORCED`.

Roles (`lib/admin-permissions.ts`): `owner`, `administrator`, `billing_admin`, `support_admin`, `operations_admin`, `analyst` — mapped onto 17 permissions (`admin.access`, `users.manage`, `billing.manage`, `diagnostics.metadata.read`, …).

> **Hard rule, stated in the source itself:** `isMasterAccount` in `lib/pricing-tiers.ts` is a *commercial entitlement* override only. It is annotated *"Never use this helper to authorize administrative routes."* Admin access goes through `lib/admin-auth.ts`. Nothing else.

---

## 4. AI provider topology

`lib/ai/providers.ts` wires exactly three providers, all through the Vercel AI SDK:

| Provider | Endpoint | Key |
| --- | --- | --- |
| Groq | `https://api.groq.com/openai/v1` (OpenAI-compatible) | `GROQ_API_KEY` |
| OpenRouter | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| Google | `createGoogleGenerativeAI` | `GEMINI_API_KEY` |

`lib/ai/models.ts` assigns roles:

```
fast:      groq('openai/gpt-oss-120b')
validator: google('gemini-3-flash-preview')
sona:      openrouter('qwen/qwen3.6-plus')
writing:   default   openai/gpt-oss-120b
           verifier  deepseek/deepseek-v4-flash
           premium   deepseek/deepseek-v4-pro
           fallback  qwen/qwen3.6-plus     (all via OpenRouter)
```

`lib/ai/sdk.ts` is the bridge exposing `generateText` / `generateObject` / `streamText`.

**Voice:**

| Function | Actual implementation |
| --- | --- |
| STT | Deepgram — `app/api/voice/transcribe/route.ts`, `nova-2`, `smart_format=true` |
| TTS | **OpenRouter**, `openai/gpt-4o-mini-tts-2025-12-15`; voices alloy/nova/echo/fable/onyx/shimmer |
| Live voice | `gemini-2.5-flash-preview-native-audio` — `app/api/voice/live-token/route.ts` |

### Two naming traps

- **`lib/gemini.ts` is not a Gemini client.** It is a client-side wrapper that POSTs to `/api/ai`. The real Gemini client is `lib/ai/gemini-client.ts`.
- **ElevenLabs is not used.** It appears only in CSP `connect-src` allowlists in `next.config.js` and `firebase.json`. No code calls it.

There is no direct OpenAI or Anthropic SDK dependency. OpenAI-named models are reached through Groq or OpenRouter.

---

## 5. Billing

`lib/pricing-tiers.ts`:

```ts
type PlanTier = 'free' | 'pro' | 'studio' | 'god';
```

`getUserTier(uid, email)` returns `god` / `studio` for the hardcoded `GOD_EMAILS` / `MASTER_EMAILS`, otherwise reads `users/{uid}/subscription/current` and maps `status ∈ {active, trialing}` with `plan ∈ {studio, pro}`.

`RATE_LIMITS` is a per-route × per-tier requests-per-minute table. `god` returns `Infinity`.

### Prices are never hardcoded

`PLAN_PRICE` sets every paid entry to `null` **by design**. `lib/billing-prices.ts` resolves prices at runtime:

1. Price IDs from env (`STRIPE_PRO_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`, `STRIPE_STUDIO_PRICE_ID`, `STRIPE_STUDIO_ANNUAL_PRICE_ID`)
2. `stripe.prices.retrieve()` — API version `2026-02-25.clover`, 5s timeout, no retries
3. Formatted display + annual savings percentage
4. 60-second in-process cache, **not** populated on retrieval error

Checkout availability is gated by `getStripeRuntimeReadiness()` and `getStripeCommercialReadinessSnapshot()`, degrading to `CHECKOUT_NOT_CONFIGURED` / `CHECKOUT_CONFIGURATION_BLOCKED` rather than ever showing a stale price.

> **Implication:** changing a price is a Stripe dashboard operation, not a code change. Do not add prices to source.

### Tier naming mismatch — known, unresolved

The product strategy documents call the top tier **Max**. The code calls it **`studio`**. `PlanTier` and the Stripe env var names (`STRIPE_STUDIO_*`) both use `studio`. Treat `studio` as canonical in code and `Max` as the customer-facing name until someone unifies them.

---

## 6. Deployment

Two paths coexist, both building Next.js with `output: 'standalone'`.

### Primary — Cloud Run

- `Dockerfile` — 3-stage `node:22-alpine`. `NEXT_PUBLIC_*` values (Firebase config, Stripe publishable key, feature flags `NEXT_PUBLIC_DEMO_MODE`, `GOOGLE_AUTH_ENABLED`, `MFA_ENABLED`, `ADMIN_COMMAND_GRID_V2`) are **build args baked into the bundle**. Runner is non-root user `nextjs`, `PORT=8080`, `CMD ["node","server.js"]`.
- `cloudbuild.yaml` — builds and pushes `${_IMAGE_NAME}`.
- `deploy-cloudrun.sh` — project `talent-consulting-acf16`, region `us-east1`, service `talent-studio`, 512Mi / 1 CPU, min 0 / max 5 instances, 300s timeout, `--allow-unauthenticated`, runtime secrets from `.env.cloudrun.yaml`, preceded by `scripts/production-deploy-preflight.js`.

> Because `NEXT_PUBLIC_*` is baked at build time, a config change to any public variable requires a **rebuild**, not just a redeploy.

### Secondary — Firebase

- `firebase.json` — deploys Firestore rules and indexes, Storage rules, and Hosting with `"source": "."` plus `frameworksBackend.region: us-east1` (web-frameworks SSR).
- `deploy-fix.js` (`npm run deploy`) — project `talent-consulting-acf16`, SSR service `ssrtalentconsultingacf1`, region `us-east1`. Strips `FIREBASE_` / `EXT_` / `X_GOOGLE_`-prefixed reserved keys before deploying.
- Emulators: auth on 9099, Firestore on 8080.

Security headers (HSTS, `X-Frame-Options: DENY`, and an identical detailed CSP) are **duplicated** in `firebase.json` and `next.config.js`. Change both or they drift.

**UNVERIFIED:** which path currently serves production traffic. Both are wired and both were touched on 24 July 2026. The `frameworksBackend` SSR service name in `deploy-fix.js` suggests Firebase Hosting SSR is at least also live. Confirm before deploying.

---

## 7. Dead code — do not build against these

| Artifact | Status |
| --- | --- |
| `supabase/migrations/job_applications.sql` | deleted 11 October 2026 |
| `schema.sql`, `suite_schema.sql`, `suite_migration.sql` | orphaned Postgres DDL, deleted 11 October 2026 |
| `SUPABASE_SETUP.md`, `STEP_BY_STEP_SUPABASE.md` | orphaned setup guides |

Verification performed 25 July 2026:

- No `@supabase/*` package in `package.json` or `package-lock.json`.
- `grep -rl supabase lib app components --include=*.ts --include=*.tsx` → **zero files**.

These files are retained only as history. Deleting them is safe and recommended.

---

## Appendix A: what changed, and why the old version was wrong

The previous revision of this document described:

- a Supabase/Postgres data layer with `resume_versions`, `job_descriptions`, `mock_interviews`, `market_data` tables
- pgvector embeddings for semantic matching
- Hirely.ai branding and a neon-cyan/violet 3D aesthetic

None of that describes the shipped system. The product migrated to Firebase/Firestore and rebranded to Talent Studio, but this document was never updated. The Postgres DDL files listed in §7 are the residue of that abandoned design.

**The practical cost:** any engineer or AI agent that read this document first would model the data layer against Postgres tables that do not exist, and would miss the fact that Firestore rules — not application code — are what enforce the product's truth-lock guarantees. That is the single most important architectural fact in the system, and the old document did not contain it.

**Guard against recurrence:** this document states its verification date at the top. If that date is more than one release train old, verify before trusting it.
