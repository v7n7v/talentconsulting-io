---
name: agent-orchestration
description: "How to split work across sub-agents in this repo and - the part that actually matters - who is allowed to certify that it is done. Use this skill whenever you are about to spawn sub-agents or author a Workflow script, delegate sections of a plan to separate agents, run a build/audit/critic loop, or the user asks for a swarm, an orchestration, a panel, a red team or a second opinion, or says be thorough, be comprehensive, attack this, or have something check your work. Also use it when merging several agents' findings into one plan, when a fan-out has come back clean and you need to know whether clean means anything, and when deciding whether two agents can safely edit at once."
---

# Splitting work across agents

## Why this exists

On 3 August 2026 this repo built one upload foundation three times.

**Round 1** was a build -> audit -> critic loop: 3 iterations, 9 agents, 1.69M tokens, 1h44m. It ended green - `tsc` clean, design audit passing, 56/56 tests - with its own auditor and critic reporting every finding resolved.

**Round 2** was five independent skeptics plus a judge, in a *separate* workflow, given the file list and nothing else: 6 agents, 905k tokens, 22 minutes. It produced 31 raw findings; the judge confirmed **25**, four of them live to users. The worst: on a dead socket the stall watchdog called `xhr.abort()` before settling, and because XHR dispatches `abort` synchronously, a user whose network died was told **"Upload cancelled."** for something they never did. Round 1's reviewers read that file three times and passed it.

**Round 3** remediated, re-verified and adjudicated. The final judge reverted fixes in place and re-ran the suite. `if (true) return;` at the top of `retry()` still gave **90/90 green**.

The lesson is not "use more agents" - round 1 had nine. It is that **a reviewer who shares the builder's context confirms the builder's beliefs.** Everything below exists to make the checker genuinely independent, and to stop a reviewer instructed to find problems from inventing them: the judge refuted 4 of the 31.

## The four roles

| Role | Reads | May not | Concurrency | Returns |
|---|---|---|---|---|
| **Builder** | the merged plan, house skills, the code | grade its own work; skip a gate | sequential whenever file sets overlap - assume they do unless disjointness is proven | files written, **verbatim** gate output, known gaps |
| **Auditor** (the watchdog) | the plan, the rules, the files on disk | edit anything; declare done | same workflow as the builder | conformance defects, each with file and line |
| **Skeptic** | the file list and its own lens, nothing else | edit; see the builder's report | N in parallel, one lens each - read-only, so safe | findings with file, line, quoted evidence, and whether it is new or pre-existing |
| **Judge** | the raw findings **and** the code | accept a gate result it did not run itself | one, alone, higher effort | CONFIRMED / REFUTED / DUPLICATE - every input in exactly one bucket |

"Watchdog" and "auditor" are one role. The judge is not: the auditor grades against the plan *inside* the build; the judge adjudicates *between* the skeptics and the code, and it is the only role that may say the work is done.

## Independence is the whole mechanism

`build-loop` says you can work autonomously exactly as far as you can check your own work. Delegated, that becomes: **you can delegate exactly as far as the checker is independent of the builder.** Three testable properties:

**Different context.** Skeptics and judge run in a *separate* `Workflow` invocation from the build, prompted with the file list and the rules. Never thread the builder's summary into a reviewer prompt - round 1 did, and its auditor inherited the builder's mental model along with its blind spot.

**Its own evidence.** A finding you cannot point at a line for is not a finding. Make that structural: put `file`, `line` and `evidence` in the `required` array of the agent's `schema`, so the harness rejects a report without them.

**Its own gates.** "Run the gates yourself and report their verbatim output. Do not accept a claimed gate result you did not see." That sentence in the judge prompt is what surfaced the mutation results.

Green gates are not an exit criterion - round 1 was fully green with a lie shipping. **The exit is a judge verdict.** For any fix that matters, the judge mutation-tests it: revert the change in place, re-run, confirm red, restore. A test that stays green is not a test.

## Sharpening the skeptic

"The skeptic must be a smarter model" has a concrete but limited form:

| Lever | Values | Use |
|---|---|---|
| `effort` | `low` `medium` `high` `xhigh` `max`; omit to inherit the session | **the reliable lever.** `effort: 'high'` on the judge is what produced the mutation testing |
| `model` | omit to inherit the session model | only when the session is on a *lower* tier than the skeptic needs. If the session is already top tier this buys nothing |

**You do not get a smarter model than the session's; you get more thinking.** Spend the asymmetry on the judge rather than the skeptics - skeptics gain from count and lens diversity, the judge from depth, because refuting is harder than accusing.

## Merging N agents into one plan

The merge is where a fan-out turns into a pile of contradictions. Four rules stop it:

1. **Dedup in code, not in an agent.** Key on file plus line range plus claim, in plain JS in the workflow script, before any expensive downstream agent.
2. **One judge, not a committee.** Every raw finding lands in exactly one of CONFIRMED, REFUTED or DUPLICATE. Two findings that contradict cannot both be confirmed without the judge writing down why.
3. **Refutations are binding.** Hand the remediator the REFUTED list and tell it not to act on those and not to "fix" them back.
4. **Publish the arithmetic.** "31 raw, 25 confirmed, 4 refuted" is checkable. `log()` anything you drop - a plan that quietly shrinks is the tell.

Anything the judge cannot resolve becomes an **open question**, not a plan item. Open questions are a `build-loop` stop-and-ask, not a judgement call for the loop to settle.

## Anti-patterns

| Pattern | What it looked like here |
|---|---|
| **Self-certification** | round 1's auditor passed a file with a live blocker in it, three iterations running |
| **Manufactured findings** | 4 of 31 refuted - one reviewer stopped reading eight lines before the assertion it claimed was missing |
| **Findings with no line** | unfalsifiable and unfixable; make `line` and `evidence` schema-required, not a request |
| **Unfalsifiable tests** | 43 of 56 tests asserted source text via `readFileSync`; `if (true) return;` in `retry()` left 90/90 green |
| **Parallel writers** | two builders on overlapping files race. Parallel is for read-only lenses |
| **Agent-count theatre** | three agents sharing one context are worse than one agent that runs the gate |

## Cost, and when this is the wrong tool

Those three workflows cost **20 agents, 3.5M tokens, 1,103 tool calls and 2h53m** on about 14 files - roughly **140k tokens per confirmed defect.** That is the number to compare against.

**Worth it** when the surface touches money, PII, auth, the truth locks or the export boundary; when there is no house precedent to copy; or when other call sites are about to be migrated onto it.

**Not worth it** - do the work directly - when:

- a mechanical gate already covers it. `node scripts/verify.js` is cheaper and more reliable than five agents for a type error.
- the change is a few files and revertible in one commit.
- you cannot write the lens prompts. If you cannot say what a skeptic should attack, it will invent something.
- the task is a lookup or an exploration. One `Explore` agent is delegation, not orchestration.
- it is already blocked on an owner decision. `build-loop`'s hard stops apply before the first token is spent.

## Precedence

`build-loop` outranks this skill in full. Its hard stops, its 3-attempt circuit breaker and its phase-boundary protocol apply to the orchestrating session. **A fan-out never resets the attempt counter** - three failed rounds is still three failed attempts.

`.agent/agents/orchestrator.md` and `.agent/workflows/orchestrate.md` describe a different framework with its own house style and arbitrary numeric rules - "ORCHESTRATION = MINIMUM 3 DIFFERENT AGENTS" is agent-count theatre, not a quality mechanism. **Reference only, never project law** - the same footing `CLAUDE.md` gives `.agent/.shared/ui-ux-pro-max/`. Where they conflict with this skill, this skill wins.

## Reference files

| File | Read it when |
|---|---|
| `references/workflow-api.md` | authoring a `Workflow` script - API surface, pipeline vs barrier, schemas, resume, and the traps |
| `references/role-prompts.md` | writing the builder / auditor / skeptic / judge prompts and their output schemas |
| `references/case-file.md` | you need the evidence behind a rule above, or a worked example of the full three-round shape |
