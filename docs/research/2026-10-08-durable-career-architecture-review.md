# Durable career architecture: independent review

**Checked October 8, 2026. Research/design only; no runtime validation or live calls.** Recommendations below are design judgments. Rolling vendor docs establish documented capabilities, not account availability, production fitness or historical release dates. Reviewed the architecture proposal, system architecture and existing runtime/memory research. Preserve Firestore, Firebase ID-token auth, truth locks and user control.

## Recommendation and challenge to the proposal

Build a durable **mission ledger with short bounded runs**, deterministic transitions and selectively agentic reasoning. Pilot Firestore + Cloud Tasks, but time-box orchestration engineering and compare Google Workflows before inventing a general workflow engine. Choose Temporal when timers, deploy compatibility, signals and recovery genuinely dominate. One execution authority per workflow; Firestore remains the business record if orchestration moves elsewhere.

The differentiated asset is continuity: relevant new jobs, explainable choices, editable application packets, interview preparation and useful reminders over weeks. It is not a swarm. The dashboard’s applications, learning and account views should project the same mission/evidence records; chat must not own a competing database. Search broadening is a proposal to the user when a hard constraint changes. A low fit score is advisory: users may choose stretch roles and add real experience through a new evidence/resume revision, preserving old immutable proofs.

**Code-evidenced baseline, not deployment claims:** `lib/assistant/agent-harness.ts:695` creates `agent_runs`; `lib/assistant/activation-receipt.ts` signs and consumes a user-bound, five-minute scout receipt. `lib/email/outbox.ts:90` transactionally deduplicates messages, `:234` passes a provider idempotency key, and `:349` fences completion by lease owner. These are valuable primitives, not evidence of a resumable mission runtime. `lib/assistant/tools.ts:1007` still trusts model-supplied `userConfirmed` for an internal queue mutation; its repair needs a server-owned authority contract, without adding friction to authorized drafting.

| Alternative | Actual contribution | Main tradeoff / decision |
|---|---|---|
| Firestore + Tasks + existing AI SDK | Business state, atomic claims, bounded asynchronous dispatch | Lowest migration; team owns recovery, waits and migrations. Pilot only. [Tasks](https://docs.cloud.google.com/tasks/docs/dual-overview) |
| Google Workflows + Cloud Run workers | Managed ordering, retries, callbacks; waits up to a year | Strong neglected comparator for mostly fixed GCP flows; YAML/JSON and dynamic graph ergonomics cost. [Overview](https://docs.cloud.google.com/workflows/docs/overview) |
| Temporal + TypeScript workers | Durable event history/replay, timers and signals | Best complex coordination; worker/version discipline and service cost. Keep nondeterministic LLM/API work in activities. [Execution](https://docs.temporal.io/workflow-execution), [versioning](https://docs.temporal.io/develop/typescript/workflows/versioning) |
| LangGraph | Graph checkpoints, review interrupts | Fits inspectable reasoning graphs; needs durable production checkpointer and effect discipline. A resumed interrupt restarts its node. [Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence), [interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts) |
| ADK / Agent Engine | Agent composition, managed hosting, sessions, memory | Evaluate only against a concrete operational advantage; sessions are not proof of durable external effects. [Google platform](https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale) |
| Autonomous swarm | Exploratory delegation | Adds context duplication, circular delegation and authority ambiguity. Admit only bounded independent workers after measured gain. |

Google’s rolling docs now redirect Agent Engine to Gemini Enterprise Agent Platform. ADK documents deterministic sequential/parallel/loop templates, TypeScript support, and newer Python/Go graph structures; feature parity must be checked before adoption. [ADK](https://adk.dev/agents/workflow-agents/) Memory Bank can be used from Cloud Run, so it does not require moving execution; generated memories still need provenance/deletion controls. [Memory Bank](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/memory-bank/set-up) A2A belongs at independently operated agent boundaries: its cancellation is best-effort and message idempotency optional, not Taco’s effect guarantee. [Specification](https://a2a-protocol.org/latest/specification/)

Cloud Run’s October 7 docs list services, jobs, worker pools and long-lived instances. None alone provides business checkpoint/approval semantics; longer container life is not durable execution. Jobs explicitly require restart-safe checkpointing. Use jobs for batch backfills, not idle human waits. [Resource model](https://docs.cloud.google.com/run/docs/resource-model), [job retries](https://docs.cloud.google.com/run/docs/jobs-retries)

## Three planes and minimum contracts

**Control:** authenticated mission commands, authority/policy revisions, schedules, budget reservations, approval service and effect dispatcher. Background workers use IAM identity, not stored Firebase user tokens; user authority is resolved server-side at each consequential boundary. Separate analysis and dispatch service identities. Admin SDK bypasses rules: scoped repository/tool access must enforce ownership independently.

**Data:** user facts and source versions, preferences/consent, artifact hashes, application/learning projections and redacted events. **Execution:** queue delivery, workers, leases, attempts and orchestration history. A chat disconnect affects its observer, not mission ownership. A user pause affects future runs; cancelling a run affects current work. Revoking authority stops both.

Minimal proposal:

```ts
Mission = { uid, id, rev, goal, constraints, authorityRev,
  scheduleGrantId?, budgetPolicy, state: 'active'|'paused'|'closed' }
Run = { uid, id, missionId, missionRev, inputRefs, workflowVersion,
  policyVersion, cancelEpoch, budgetReservationId, state, deadline }
Task = { id, runId, inputHash, dependencies, attempt, fence,
  leaseUntil, resultRef?, state }
Event = { id, aggregateId, sequence, causationId, correlationId,
  expectedRevision, kind, payloadRef?, at }
Effect = { id, uid, runId, digest, approvalId, idempotencyKey,
  state: 'prepared'|'dispatching'|'accepted'|'delivered'|'unknown'|'failed' }
```

A mission may last months; each run pins inputs, models/prompts/tools, deadline and authority. Changed preferences or facts invalidate pending consequential decisions and create a new run; do not mutate historical run inputs. Reuse still-valid analysis by input hash. Avoid one ever-growing conversation or one immortal workflow. Completion means required artifacts and deterministic checks exist, not that a model said “done.”

Append transition, update aggregate and create outbox intent in one transaction. Events sequence per aggregate, not globally; projectors dedupe event IDs and tolerate reordering. Queue payloads contain IDs only. Repair undispatched intents and expired leases. Tasks deliver at least once; task-name dedup lasts up to 24 hours and HTTP dispatch has a maximum 30-minute deadline. Firestore callbacks can rerun: no network/model effects inside them. [Tasks](https://docs.cloud.google.com/tasks/docs/dual-overview), [transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)

Lease expiry only permits takeover. Increment a monotonic fence transactionally; commit requires the current fence, run revision/cancel epoch and authority revision. Heartbeats require the same checks. Budget reservations cover all children, retries and cancelled calls; release only unused reservation, never erase incurred cost. Retries reuse completed branches, distinguish transient failures from invalid inputs, and cap attempts/deadline.

## Approvals, cancellation and uncertain effects

An approval is authenticated, single-use, expiring, revocable and bound to `uid`, effect ID, mission/authority revision, destination, final rendered body bytes, attachment hashes, source/artifact revisions and policy. Canonicalize structured fields with a specified scheme, hash exact delivered bytes, then sign the grant with a dedicated rotated key/key ID. A signature prevents tampering; it does not prove the user reviewed anything. Record the authenticated approval event and atomically consume the nonce while claiming dispatch. [Canonical JSON standard](https://www.rfc-editor.org/info/rfc8785/)

Freeze content before approval; runtime-added links or changed recipient addresses must not silently alter approved communications. Recheck ownership, revocation, freshness and export truth at dispatch. An opt-in reminder grant may cover a narrow category/cadence/destination with expiry and unsubscribe; it never authorizes recruiter outreach or application submission.

Cancellation increments the epoch, stops new claims and rejects late artifact commits. Abort supported calls, but charge actual usage. There is an unavoidable race between dispatch authorization and provider acceptance: expose `cancellation_requested` until in-flight effects reconcile. A local fence cannot stop a remote API call already issued or fence a provider that ignores it. Cancellation after acceptance cannot promise recall. [Temporal cancellation](https://docs.temporal.io/develop/typescript/workflows/cancellation)

No exactly-once guarantee spans Firestore and an independent provider without cooperation. Persist intent before sending and receipt afterward; ambiguous timeouts become `unknown`. Query receipts/webhooks where available; otherwise reconcile manually rather than resend blindly. Provider acceptance is not delivery, an interview or an application outcome. Resend idempotency lasts **24 hours**; an outage/restore beyond that window requires reconciliation before retry. [Resend](https://resend.com/docs/dashboard/emails/idempotency-keys)

## Evidence, memory and deletion

Keep user-asserted facts with exact source/locator/hash, effective/observed dates and conflict/withdrawal status. Source-supported is not independently verified. Preferences are editable intent; inferred memory is expiring, user-correctable assistance, never resume evidence or hard constraints. Unknown stays unknown. Real additions create new evidence and proofed resume versions; never edit locked versions. Derived Career Twin, embeddings and summaries must be rebuildable and dependency-indexed.

Authorize before retrieval; namespace stores/caches by tenant, user and data/policy version. Minimize job-source access to resume facts, and treat scraped instructions as data. On deletion, immediately tombstone scope and increment a deletion epoch to reject in-flight writes, then resumably remove descendants, indexes, caches, model-session copies and draft dependencies. Parent deletion does not delete Firestore subcollections. Track provider deletion limitations and backup expiry honestly; keep only justified redacted audit metadata. [Firestore deletion](https://firebase.google.com/docs/firestore/solutions/delete-collections)

## Allocation, economics and evidence of success

Machines own identity, filters, dedupe, freshness, budgets, artifact versioning, truth/export checks and dispatch. One bounded planner handles ambiguous goals/search repair; two optional independent analyzers assess resume/JD evidence and source/job risks; a synthesizer resolves conflicts. Workers return typed proposals and evidence references, never direct commits. Strengthen models only on diagnosed ambiguity/quality failure. Existing provider adapters are candidates; a Codex Luna delegation name does not establish a purchasable production API model.

Experimental envelope per one-packet run: planner 3k input/1k output; two analyzers 5k/1.5k each; synthesis 5k/2k; one corrective pass 4k/1.5k. Total ceiling **22k input/7.5k output**, including correction, plus explicitly capped search/export costs. Tokenizer/provider reasoning accounting varies; enforce both call limits and dollar reservations using conservative billable-token bounds. Cost = sum of actual provider token categories × current contracted rates, plus tools, queue/database, orchestration and repair labor. Record price snapshot; no hardcoded tier price. Measure full cost per user-accepted, source-supported packet. Expand fanout only if preregistered trials show ≥10 percentage-point acceptance gain or ≥25% latency gain with no safety regression and ≤25% cost increase; these are proposed thresholds.

Trace mission/run/task/effect IDs, causal events, versions, cost, freshness, fences and receipts; redact payloads. Evals cover stretch roles, added experience, contradiction, unavailable sources and injection. Use blinded independent review; builders cannot certify their own output. Interview/job-offer rates are delayed, self-reported, selection-biased and labor-market-dependent: causal benefit needs consented randomized cohorts, baseline covariates and confidence intervals. Early gates use acceptance, correction burden, useful matches and reminder opt-outs.

## Five required failure drills and 30/90-day sequence

1. Crash after intent commit before enqueue: repair dispatches once; duplicate delivery returns committed result.
2. Lease takeover while old model call finishes: stale fence cannot commit; both calls’ costs remain visible.
3. Approve packet, then change resume/recipient and cancel during dispatch: old grant fails; in-flight provider acceptance reconciles accurately.
4. Lose receipt after email acceptance; restore database after 48 hours: no blind resend beyond dedup window; restored approvals/queues remain quarantined.
5. Delete one tenant during fanout and restore an older backup: deletion tombstones prevent resurrection; no cross-tenant retrieval or late writes.

**Days 1–30:** baseline current flow; contract/authority repair; read-only durable role analysis; same synthetic fault suite on Tasks and Workflows; independent acceptance review. Keep outbound dispatch disabled in recovery environments. Proposed targets: all injected boundary crashes recover, no observed unauthorized/duplicate effects, zero unaccounted incurred cost, p95 useful-result under ten minutes. Finite tests establish observed results, not universal safety.

**Days 31–90:** curated search → three explainable matches → packet; unify interactive/scheduled triggers; opt-in reminders; correctable memory/deletion; restore and provider-outage drills. Proposed RPO ≤15 minutes/RTO ≤4 hours must be validated against configured backups, not asserted. Restore authority/deletion tombstones and reconcile remote effects before reopening dispatch.

Revisit managed orchestration immediately if custom recovery exceeds ten engineering days, consumes >4 repair hours/week for two weeks, >0.5% runs need manual recovery, or workflows require several independent long waits/compensations across deploys. Scale using observed queue age, contention and provider quotas; shard queues/counters when p95 dispatch exceeds 60 seconds at authorized peak load. User count alone is not a migration trigger.

**Strongest counterargument:** reliable weeks-long continuity already requires difficult recovery/versioning; a small team should buy durability now. This is credible. If the bounded pilot cannot meet fault gates within its engineering budget, select Workflows for fixed GCP processes or Temporal for richer coordination immediately. Staying on familiar Firestore is not a reason to own an accidental workflow engine.
