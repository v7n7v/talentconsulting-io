# VPS SuperTonic Voice Migration — Implementation Plan

**Status:** approved to build · **Date:** 2026-08-08
**Decisions locked (owner):** (1) Remove Gemini from **voice only** — leave the non-voice text routes on Gemini. (2) Interview goes **turn-based** (Deepgram STT → LLM → self-hosted SuperTonic TTS); ~1.5 s time-to-first-audio accepted, barge-in built in-house.

This document is the single source of truth the build loop consumes. Builders read this + the house skills; reviewers get only the file list + their lens.

---

## Goal

Give each interview **persona its own self-hosted SuperTonic voice**, and remove Google Gemini from every **voice** path (agent-chat TTS + the live interview). Keep Gemini for the six non-voice text routes.

## Non-goals (explicitly out of scope)

- The six non-voice Gemini text routes (`dual-ai.ts` → cover-letter, LinkedIn, resume auto-fix, resume check, skill-bridge grade, study-plan). **Untouched.**
- **Production exposure** of the VPS TTS (Caddy `tts.` subdomain, DNS record, auth secret). Owner-gated; tracked in §Gated, not built by the loop.
- Real avatar lip-sync. It is currently **dead code** (`TalkingHead.speakAudio()` never called); keep the `isSpeaking`-boolean visual. Real lip-sync is a future feature, not parity.
- Final voice-quality sign-off and per-persona voice *gender* assignment — the loop proposes a mapping; the owner tunes it by ear.

---

## Current-state facts (from research, with anchors)

- **Three voice endpoints:** `app/api/voice/speak/route.ts` (OpenRouter `gpt-4o-mini-tts`), `app/api/voice/transcribe/route.ts` (Deepgram `nova-2` — **keep**), `app/api/voice/live-token/route.ts` (Gemini Live).
- **Callers:** `app/suite/agent/page.tsx:674` (transcribe) + `:711` (speak); `hooks/useGeminiLiveAvatar.ts:127` → `app/suite/interview-sim/page.tsx:247` (live).
- **Bug to fix:** `live-token` `PERSONA_VOICE_MAP` is keyed by display name (`'FAANG Tech Lead'`) but the client sends `persona.id` (`'faang-lead'`) → every persona falls through to default **Kore**. Interview personas already all sound the same.
- **Dead code:** `useGeminiLiveAvatar` exports `setOnAudioChunk`/`setOnTurnComplete`, never called; avatar audio path unused.
- **Config pattern:** URLs are hardcoded per-route today. Env-driven private-host precedent = `EVER_JOBS_API_URL` + `EVER_JOBS_ALLOW_PRIVATE_HTTP` (`lib/job-supply-health.ts`). New: `TTS_BASE_URL` + `TTS_API_KEY`.
- **Prod reachability:** app runs on Cloud Run / Firebase SSR (us-east1) — **cannot** reach VPS `127.0.0.1:8080`. Needs public HTTPS + token (owner-gated). Local dev reaches the VPS via the SSH tunnel (`localhost:9010`).
- **CSP `connect-src`** duplicated in `next.config.js:62` and `firebase.json:54,95`. Server-side TTS calls are **not** gated by CSP; only browser-direct connections are.

## Persona → SuperTonic voice map (provisional — tune by ear)

Single source of truth: `lib/ai/persona-voices.ts`, keyed by `persona.id` (fixes the mismatch bug). SuperTonic exposes 10 voices (sid 0–9). Provisional, to be auditioned in the TTS lab:

| persona.id | Persona | Provisional sid | Intent |
|---|---|---|---|
| faang-lead | FAANG Lead | 0 | male, precise |
| friendly-hr | Friendly HR | 3 | female, warm |
| startup-cto | Startup CTO | 1 | male, energetic |
| vp-engineering | VP Engineering | 2 | male, measured |
| consulting-partner | Consultant | 4 | female, structured |
| behavioral-specialist | STAR Specialist | 7 | female, coaching |

(Gender/character of each sid must be confirmed by listening; the map is the one place to change.)

---

## Phases

Each phase: smallest change → `node scripts/verify.js` → (UI? `ui-verify.js`) → commit at boundary → `docs/DECISIONS.md` line. Feature-flagged; provider falls back until cutover.

### Phase 0 — Foundation (autonomous)
- `lib/ai/supertonic-tts.ts` — server-side client: `synthesize({text, voiceSid, speed, format})` → `{audio: Buffer, headers}`. Auth via `X-TTS-Token: ${TTS_API_KEY}` header; configurable timeout; typed error mapping (unreachable / non-200 / bad-audio).
- `lib/ai/persona-voices.ts` — canonical `persona.id → sid` map + `resolveVoiceSid(hint)`.
- Config reader for `TTS_BASE_URL` / `TTS_API_KEY`; add to `env.example`, `.env.example`, `.env.cloudrun.yaml.example` (values blank).
- Unit tests: client (mock `fetch`, cover ok / timeout / non-200 / empty), map resolution.
- **Exit:** compiles; tests pass; `verify.js` green; no design-audit regression.

### Phase 1 — Agent-chat TTS swap (autonomous, reversible)
- Rewire `app/api/voice/speak/route.ts`: when `TTS_BASE_URL` is set → SuperTonic via the client; else → existing OpenRouter path (fallback preserved). Map `voiceId`/persona → sid via `persona-voices`.
- **Preserve exactly:** the voice-minute billing (`checkVoiceAllowed`/`recordVoiceUsage`), response `X-Voice-*` headers, `audio/mpeg` output, rate limits.
- Fix the stale `// DashScope CosyVoice TTS` comments (`agent/page.tsx:621,701`).
- Tests: route unit test, both provider branches, billing still recorded on success only.
- **Exit:** serves SuperTonic MP3 behind the flag; OpenRouter fallback intact; billing/headers unchanged; `verify.js` green. (Orchestrator does a live integration hit via the tunnel.)

### Phase 2 — Interview turn-based rebuild (autonomous build; browser + latency are orchestrator/owner-verified)
- New endpoints replacing `live-token`:
  - session authorize — **keep** `guardApiRoute(feature:'gauntlets')` and the `errorUpgradeUrl` contract (upgrade CTA only on cap/tier failure).
  - turn: Deepgram STT (reuse transcribe path) → LLM (`groq openai/gpt-oss-120b`, already used by grading) with **ported** `buildInterviewPrompt` + persona traits → **sentence-chunked** SuperTonic TTS (synthesize sentence _n_ while the LLM writes _n+1_).
- `hooks/useTurnBasedInterview.ts` — **identical public interface** to `useGeminiLiveAvatar` (`connect`/`disconnect`/`getTranscript` + full state object). Reuse: 16 kHz PCM mic capture, jitter-buffer playback, `lib/audio-level.ts` metering, transcript accumulation + `?` question count, mic-gate + 500 ms echo debounce.
- **Barge-in (build properly):** Deepgram interim results / client VAD during playback → stop + **flush** scheduled audio (close/replace the playback `AudioContext`, unlike the current hook which only flips flags).
- Swap one import at `app/suite/interview-sim/page.tsx:22`. `LiveRoom`, `AvatarCanvas`, sessions, `session-grade`, telemetry unchanged.
- **Exit:** hook interface parity (drop-in); `verify.js` green; `ui-verify.js` clean on interview-sim at 320/390/430/768/1024/1440 in both themes; measured TTFA and working barge-in (orchestrator + owner confirm — observable/judgment tier).

### Phase 3 — Gemini VOICE teardown (autonomous, after Phase 2 lands)
- Delete `app/api/voice/live-token/route.ts`, `hooks/useGeminiLive.ts`, `hooks/useGeminiLiveAvatar.ts`.
- Remove `@google/genai` dependency (the Live SDK — voice only). **Keep** `GEMINI_API_KEY`, `@google/generative-ai`, `@ai-sdk/google`, and the `https://generativelanguage.googleapis.com` CSP entry + dns-prefetch — the six text routes still use them.
- Remove only the `wss://generativelanguage.googleapis.com` entry from `connect-src` in `next.config.js` and `firebase.json` (×2).
- **Exit:** no `@google/genai` imports remain; text routes unaffected (assistant-harness green); `wss` gemini CSP gone; `verify.js` green.

---

## Gated / out-of-loop (owner actions — hard stops)

- **Production exposure:** `tts.talentconsulting.io` A-record → VPS; Caddy route → `supertonic-tts` container with a shared-secret header; inject `TTS_BASE_URL`/`TTS_API_KEY` into `.env.cloudrun.yaml`. DNS + secret = owner.
- **Voice-quality acceptance** and per-persona **voice gender** assignment (owner's ear, via the TTS lab).
- **No deploy** from the loop. Build + verify only; cutover is owner-driven and flag-gated.

---

## Autonomous loop design (build → audit → skeptic → judge)

Roles per `agent-orchestration`. Reviewers never receive the builder's summary — only the file list + their lens. Only the **Judge** may declare a phase done; green gates are not the exit.

- **Builder** (sequential per phase): reads this plan + house skills + gate commands + prior round's *confirmed* findings; writes complete compiling code; returns **verbatim** gate output; lists `notFixed`. Must not act on REFUTED items.
- **Auditor** (in-build): conformance vs this plan + house skills; reads disk, not the builder's report; cannot declare done.
- **Skeptics** (parallel, read-only, one lens each, file-list only):
  1. **truth/fabrication** — no invented numbers/states; truth locks intact; no fake voice/latency values.
  2. **billing & entitlement** — voice-minute cap + `gauntlets` gate + fallback never silently drop or double-count usage.
  3. **transport/error** — TTS/STT timeouts, non-200, empty audio; no upgrade-nag on infra faults; connection-state disambiguation.
  4. **security** — SSRF via `TTS_BASE_URL`, token handling/no leak, CSP correctness, no secret in client bundle.
  5. **React/runtime** — hook interface parity, cleanup/leaks, mic-gate races, playback flush on barge-in.
- **Judge** (one, `effort: high`): raw findings + the code; runs the gates itself; **mutation-tests** any fix that matters (revert in place → confirm red → restore); buckets every finding CONFIRMED / REFUTED / DUPLICATE. Named verdict fields: `showsUserUntrue`, `billingSafe`, `hookIsDropIn`, `safeToBuildOn`.

Circuit breakers (from `build-loop`): stop and report on 3 failed attempts at one gate, blast-radius growth, about-to-disable-a-gate, or a guardrail (`release-safety`/`assistant-harness`) failure. A fan-out never resets the attempt counter.

## Verification gates

- `node scripts/verify.js` — type-check, build (~180–181 pages), release-safety (244), assistant-harness (329), design-audit, CVE.
- `node scripts/ui-verify.js` for the interview UI (Phase 2) — 320/390/430/768/1024/1440, both themes, clean console, no overflow.
- **Never** weaken `release-safety` / `assistant-harness` to get green — those guard billing and the truth locks. That's a stop-and-ask.

## Branch & commit hygiene

- Dedicated branch `feature/vps-voice-migration`.
- Commit at each phase boundary; one `docs/DECISIONS.md` line per judgement call. No batching phases into one commit.
