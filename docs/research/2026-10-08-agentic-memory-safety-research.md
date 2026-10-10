# Agentic memory and safety research for Taco AI

**Research cutoff:** 2026-10-08. Sources below are primary standards, official product documentation, or original research available by that date. Recommendations are design inferences for Taco; they are not guarantees established by any one source.

## Findings that shape the design

An agent can be highly autonomous in research and preparation while remaining bounded at consequential actions. OpenAI’s 2026 prompt-injection analysis frames the central risk as untrusted content reaching a dangerous action (“source to sink”), and recommends containing the impact even when the model is persuaded. Resume submission, sending outreach, changing a public profile, and following a URL that could carry private data are sinks. Filtering suspicious text is useful but cannot be the only barrier. [OpenAI, “Designing AI agents to resist prompt injection,” March 11, 2026](https://openai.com/index/designing-agents-to-resist-prompt-injection/)

Long-term memory needs conflict handling, provenance, and forgetting as first-class behavior. The April 2026 Memora benchmark reports that tested memory agents frequently reused invalid memories and failed to reconcile changing facts. The May 2026 STALE preprint tests implicit conflicts and reports 55.2% overall accuracy for its best evaluated model. These are benchmark results, not universal production failure rates, but they show why retrieval success alone is an inadequate gate. [Memora, ACL 2026 Findings](https://arxiv.org/abs/2604.20006); [STALE, arXiv preprint, May 7, 2026](https://arxiv.org/abs/2605.06527)

MCP and A2A solve different integration problems. MCP standardizes access from an AI host to tools and data; its specification explicitly leaves consent, authorization, and safety enforcement to implementers. A2A standardizes communication, discovery, and task delegation between independent agents. Taco should use MCP for connectors if needed and ordinary in-process delegation for its own specialized work. A2A only becomes useful if Taco needs to exchange long-running tasks with separately operated agents; it grants no trust in their claims or outputs. [MCP specification, version 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25); [A2A Protocol specification, version 1.0.0](https://a2a-protocol.org/latest/specification/)

Human approval can be implemented as a pause at the tool call, with approval bound to the specific action. OpenAI’s Agents SDK documents approval interruptions, including fail-closed behavior when a callable approver cannot safely inspect malformed arguments. This is a useful runtime pattern; the product must still display the exact recipient, destination, content, and fields to be sent, and enforce approval server-side. [OpenAI Agents SDK, “Human in the loop”](https://openai.github.io/openai-agents-python/human_in_the_loop/)

Tracing the whole trajectory is more useful than storing only the final answer: model turns, tools, handoffs, guardrails, approval decisions, and outcomes can be linked under a workflow trace. The same docs warn that inputs and outputs may contain sensitive data and that sensitive capture is enabled by default. Taco should log decision metadata and redacted evidence references by default, with tightly controlled access to full payloads only when debugging requires them. [OpenAI Agents SDK, “Tracing”](https://openai.github.io/openai-agents-python/tracing/). OpenAI’s report on internal agent monitoring also describes asynchronous monitoring as a source of detection signal, not a preventive control; monitoring should complement policy gates, never replace them. [OpenAI, “How we monitor internal coding agents for misalignment,” March 19, 2026](https://openai.com/index/how-we-monitor-internal-coding-agents-misalignment/)

Retries of external writes can duplicate effects unless the application provides idempotency. Stripe’s API documentation describes idempotency keys that replay the first result for the same key and request parameters. Taco should use an application-side action ledger and provider idempotency where available, plus reconciliation when a provider times out after an uncertain commit. This is a general reliability pattern, not a claim that every job board supports idempotency. [Stripe API, “Idempotent requests”](https://docs.stripe.com/api/idempotent_requests)

## Recommended control design

### 1. Build an evidence ledger, not a résumé-shaped memory blob

Store candidate facts as versioned claims with: canonical claim, source document ID and version, page/section or text span, content hash, ingestion time, verification status, confidence, effective date if known, last-confirmed date, and links to claims it supersedes or conflicts with. Keep original evidence immutable; corrections add a new version and mark the prior claim superseded. Distinguish:

- **Verified:** directly supported by an approved resume, portfolio, or user confirmation.
- **Inferred:** synthesized by the system and explicitly labelled; never silently promoted to verified.
- **Unknown/conflicted:** omitted from application materials until resolved.

Here, “verified” means supported by a source or confirmed by the user; it does not mean Taco independently verified employment, credentials, or the truth of the underlying claim.

Every generated résumé or application answer should have claim-level provenance back to the evidence ledger. Block unsupported metrics, dates, titles, credentials, and skills. Ask the user when sources disagree or when a material fact has gone stale. A job description is evidence about the employer’s requirements, never evidence about the candidate.

### 2. Version memory and support correction / forgetting

Keep user-approved profile state separate from transient session context and derived preferences. Record updates as events with `observed_at`, `effective_at` (when applicable), source, supersession links, and optional expiry / re-confirmation date. Resolve explicit contradictions deterministically; for implicit changes, flag related claims for adjudication rather than allowing retrieval rank to decide which state wins. Expiring facts should become “needs confirmation,” not be silently treated as false or current.

Provide “correct this” and “forget this” actions. A forget operation should remove the fact from active retrieval, summaries, caches, embeddings, and generated drafts; retain only a minimal deletion tombstone if needed to prevent accidental re-import. Rebuild derived artifacts from remaining authorized evidence. User deletion must propagate across connected copies where Taco controls them.

### 3. Treat every external artifact as untrusted data

Parse job pages, recruiter emails, attachments, and PDFs as quoted/untrusted content with source metadata. Do not let embedded directions change system policy, widen connector access, store personal data, or invoke tools. Keep browsing and document parsing read-only; disable remote fetches of embedded images/URLs unless they are independently checked and needed. A job post’s links, upload forms, and contact addresses are destinations to validate, not instructions to follow automatically.

For each proposed write, a deterministic policy layer should validate tool name, user, tenant, destination domain/account, allowed fields, attachment hashes, and action scope. It should reject arbitrary URLs, secret-like fields, unapproved recipients, scope escalation, and any attempt to move data to a destination introduced only by untrusted content. Limit agents and connector tokens to only the read scopes needed for discovery and drafting; request short-lived, narrow write scopes only for an explicitly approved action. The MCP specification calls for least-privilege scopes and explicitly states that protocol support alone cannot enforce consent and safety.

### 4. Make the lifecycle explicit

1. **Discover:** read-only search and import; deduplicate and rank jobs with freshness and source URL.
2. **Prepare:** match requirements to cited evidence; generate tailored résumé/cover letter drafts and flag unsupported or stale facts.
3. **Review:** show the exact employer, official destination, selected job, candidate claims, answers, attachments, and data fields. Require approval for the exact packet and action; changes invalidate that approval.
4. **Execute (optional):** only a deterministic action service may submit or send, using a scoped, short-lived grant, per-action approval, allowlisted destination, idempotency key, rate limits, and audit event. No standing “apply to all” authority in the initial release.
5. **Track:** record provider receipt/status and next follow-up. Keep tracking read-only unless the user separately approves an outreach or profile edit.

The project’s existing `CLAUDE.md` instruction that nothing is sent or submitted without explicit user approval is consistent with this boundary and should remain a launch invariant. Agent autonomy can cover scouting, matching, drafting, and tracking; it does not imply safe autonomous execution.

## Evaluation and launch gates

Evaluate complete trajectories on a fixed, versioned scenario set. Include normal and adversarial job pages, hidden instructions in email/PDF text, prompt injection that asks the agent to reveal personal facts or change destinations, stale and contradictory career claims, malformed tool arguments, permission-denied and timeout responses, duplicate retries, and altered drafts after approval. Score outcomes with deterministic assertions plus human review of sampled judgments. Test the policy layer independently from the model, then run end-to-end model tests; a good final answer must not hide an unsafe intermediate tool call.

Suggested initial gates (targets are product recommendations, not research findings):

| Measure | Launch target |
|---|---:|
| Unsupported résumé/application claims in accepted packets | 0 |
| Required claim provenance present and resolvable | 100% |
| Unauthorized or unapproved external writes in adversarial runs | 0 |
| Approval bound to exact content, destination, attachments, and job | 100% |
| Stale/conflicted fact handling on the evaluation set | ≥99% correct action; unresolved cases must ask or omit |
| Duplicate external effects under timeout/retry fault injection | 0 |
| Tool-call authorization / policy violations | 0 |
| Successful job discovery and packet quality | Track precision@k, user acceptance, and time saved; set target from a human-reviewed baseline |
| Observability | 100% of runs have trace ID, policy result, tool/action outcome, and approval event; payloads redacted by default |
| Cost and latency | Track model/tool spend and wall time per accepted packet, plus p50/p95; cap fanout and stop low-yield searches |

For the requested GPT-6 Luna fanout, run bounded parallel read-only subtasks (for example: job discovery, requirement extraction, evidence matching) against the same versioned inputs. Give each task a narrow schema and return source references, not free-form authority. A coordinator deduplicates and adjudicates conflicts before drafting. Record per-subtask cost, elapsed time, citation coverage, duplicate rate, and incremental accepted-job yield; keep a serial fallback. Fanout is an optimization to test, not a reliability or security control.

## Sources

1. OpenAI, [“Designing AI agents to resist prompt injection”](https://openai.com/index/designing-agents-to-resist-prompt-injection/), March 11, 2026.
2. Model Context Protocol, [Specification](https://modelcontextprotocol.io/specification/2025-11-25) and [Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), version 2025-11-25.
3. Agent2Agent, [Protocol Specification](https://a2a-protocol.org/latest/specification/), latest released version 1.0.0 as checked 2026-10-08.
4. Uddin et al., [“From Recall to Forgetting: Benchmarking Long-Term Memory for Personalized Agents”](https://arxiv.org/abs/2604.20006), submitted April 21, 2026; accepted to ACL 2026 Findings.
5. Chao et al., [“STALE: Can LLM Agents Know When Their Memories Are No Longer Valid?”](https://arxiv.org/abs/2605.06527), submitted May 7, 2026; preprint.
6. OpenAI Agents SDK, [Human in the loop](https://openai.github.io/openai-agents-python/human_in_the_loop/), documentation checked 2026-10-08.
7. OpenAI Agents SDK, [Tracing](https://openai.github.io/openai-agents-python/tracing/), documentation checked 2026-10-08.
8. OpenAI, [“How we monitor internal coding agents for misalignment”](https://openai.com/index/how-we-monitor-internal-coding-agents-misalignment/), March 19, 2026.
9. Stripe API, [Idempotent requests](https://docs.stripe.com/api/idempotent_requests), documentation checked 2026-10-08.
