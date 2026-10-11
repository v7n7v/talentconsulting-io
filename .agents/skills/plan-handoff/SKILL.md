---
name: plan-handoff
description: "How to write decisions, plans and research findings so a different agent session can act on them correctly - and so they don't quietly go stale. Use this skill whenever work will cross a session boundary: producing a plan, architecture decision, migration runbook or research summary that someone else will execute; writing or updating AGENTS.md, AGENTS.md or a project context file; handing work from a planning session to an implementation session, or from a cloud/remote session to a local one; onboarding an agent to an unfamiliar repo; or finishing a phase of work whose outcome the next session needs to know. Also use it when documentation has drifted from reality, when a doc turns out to describe a system that no longer exists, or when the user asks how their plans, context or decisions carry over between Codex sessions or tools."
---

# Writing context that survives the session

## The core fact

A new agent session inherits **files, not memory**. Everything else - the reasoning, the alternatives you rejected, the user's corrections, the thing you almost got wrong - is gone the moment the session ends.

This has one practical consequence that governs everything below: **a decision that isn't written down did not happen.** If you and the user settle something important and you don't record it, the next session will re-litigate it, and probably decide differently.

## What to write down

Not everything deserves to persist. Writing too much is its own failure - a bloated context file gets skimmed, and a skimmed file is no better than a missing one.

**Write down:**

- **Decisions and their constraints.** "The accent is Cyan `#0891b2`/`#0e7490`" - and the constraint that made it necessary: no single hex clears 4.5:1 on both near-black and near-white.
- **Ground truth that contradicts the obvious.** If the repo contains a document describing a Postgres schema and the system actually runs on Firestore, say so loudly. Someone will read that document first.
- **Measured baselines.** "465 distinct hex colors" is worth ten paragraphs of "the styling is inconsistent." Numbers make progress checkable.
- **Rules with their reasons.** A rule without a rationale gets treated as a preference and traded away under deadline.
- **Traps.** The thing that looks like a Gemini client but posts to an internal route. The environment variable baked at build time. These cost hours each time someone rediscovers them.
- **What's blocked and on whom.** Distinguishing "engineering isn't done" from "we're waiting on a DNS record" changes what the next session should even attempt.

**Don't write down:**

- Deliberation that led to an obvious conclusion
- Options you rejected for uninteresting reasons
- Narration of what you did - the next session cares about the current state, not the path
- Anything you'd have to update every week to keep true

The test: *would a competent person, arriving cold, make a worse decision without this?* If not, leave it out.

## Where it goes

**`AGENTS.md` at the repo root is read automatically, every session.** That makes it the only guaranteed channel - and the only one whose cost is paid every single time.

Keep it to durable, high-signal facts: stack ground truth, hard rules, current blocking state, verification commands, traps, and pointers to deeper documents. Roughly 200 lines is a healthy ceiling. If a section is growing into a treatise, move it to `docs/` and leave a one-line pointer.

**Everything else is read on demand** - because `AGENTS.md` points at it, or the user names it. Which means a document nobody points at effectively doesn't exist. When you write a plan, add the pointer.

**A skill is the right home for rules that apply to a category of work** rather than to the project as a whole. `AGENTS.md` is loaded always and pays a constant cost; a skill loads when its subject comes up. Design rules, deployment procedures, and testing conventions usually belong in skills.

## Write for someone who arrives cold

The reader is competent, has no history with the project, and will act on what you wrote. So:

- **State conclusions, not journeys.** "Prices resolve from Stripe at runtime; never hardcode one" beats three paragraphs about how you discovered that.
- **Say what's true now, not what changed.** A context file is a snapshot, not a changelog. The changelog is a different document.
- **Mark uncertainty explicitly.** "UNVERIFIED: which deploy path serves production" is genuinely useful. Quiet confidence about something you didn't check is how bad documentation gets written.
- **Date claims that will expire.** "244/244 as of 25 July 2026" ages honestly. "All tests pass" becomes a lie without anyone lying.
- **Point to the file, not the fact,** when the fact lives in code. `firestore.rules` will always be more current than your summary of it.

## Keeping it from going stale

Stale context is worse than none, because it's trusted. The characteristic failure: a document describing an architecture that was abandoned, still sitting at the repo root under a filename newcomers open first.

Three habits prevent it:

**State the verification date at the top.** A reader can then judge for themselves whether to trust it, and you've made the document's age visible rather than implicit.

**Banner superseded documents rather than deleting them.** Deleting loses history; leaving them unmarked poisons the next reader. A three-line header saying what's wrong, what replaced it, and when - that's enough. Pay particular attention to files whose *names* attract readers: `QUICKSTART.md`, `GETTING_STARTED.md`, `README*.md`. A wrong document called `NOTES-old.md` is harmless; the same content called `GETTING_STARTED.md` is actively destructive.

**Update the context file as part of the work, not after it.** When you finish a phase, learn something that contradicts `AGENTS.md`, or find a documented claim to be false - fix it in the same change. A separate "update the docs" task is a task that doesn't happen.

## Prose asks; a gate tells

The strongest lesson from projects where this breaks down: **written rules degrade under deadline pressure, and mechanical checks don't.**

If a rule matters enough to write down, ask whether it can be enforced instead:

- A convention → a lint rule
- A measured baseline → a CI check that fails on regression
- A required primitive → make the alternative a type error
- A forbidden pattern → remove it from the API surface entirely

A rule that a build failure enforces will still hold in a year. A rule that only a document enforces holds until the first urgent Friday.

This isn't an argument against writing things down - it's an argument for knowing which category each rule is in. Write the rule *and* the reason, then gate the ones that matter.

## Handing off mid-task

When execution moves to another session or tool, the receiving session needs four things:

1. **The objective**, stated concretely enough to be checkable.
2. **The current state** - what's done, what's in flight, what's blocked.
3. **The verification command** - how it will know it succeeded.
4. **The first action**, specifically. "Read X, then run Y, then show me the output" beats "continue the work."

Ordering matters when steps have prerequisites. If step 3 would be painful before step 1, say so and say why - otherwise a capable agent will reasonably start wherever looks most interesting.

Be explicit about what the receiving session **can't** do. If you tested something under a simulation, an emulator, or a different platform than the target, write that down. An untested assumption presented as verified is the most expensive thing you can hand someone.
