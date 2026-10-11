---
name: build-loop
description: "How to execute multi-phase work autonomously in this repo - the verify/correct cycle, what each failure class means, where autonomy stops, and how to report honestly when blocked. Use this skill whenever you are working through a plan with more than one step, executing a phase from docs/design-system-v2-plan.md or any migration plan, running a build-test-fix cycle, or the user says to continue until something is done, work through the plan, keep going, or finish a phase. Also use it when deciding whether a change is actually complete, when a gate fails and you need to decide whether to fix or stop, and when you need to hand back a partial result because something is genuinely blocked."
---

# Working autonomously in this repo

## The governing principle

**You can work autonomously exactly as far as you can check your own work. Not one step further.**

An autonomous loop with weak exit criteria does not produce slow progress. It produces confident, plausible, wrong output at speed - and because each step looked fine, the error is discovered several phases later when it is expensive to unwind. The whole discipline below exists to prevent that one failure.

This repo is unusually well set up for autonomy: 244 release-safety tests, 329 assistant-harness tests, type-check, build, a CVE scan, a design-drift audit, and a browser verifier. That substrate is what earns the autonomy. Use it constantly.

## The loop

```
   read the goal and its exit criteria
        |
   make the smallest change that moves toward it
        |
   node scripts/verify.js          <- one command, all mechanical gates
        |
   +----+ fail -> classify (below) -> fix -> repeat
   |
   pass
        |
   touched UI? -> node scripts/ui-verify.js <routes>
        |         and LOOK at the screenshots
        |
   exit criteria met? -> no -> next change
        |
       yes
        |
   record what you decided, then continue to the next phase
```

`node scripts/verify.js` runs every mechanical gate in cost order and stops at the first failure. Use it instead of remembering seven npm scripts - you will forget one, and it will be the one that mattered.

`--fast` (design + types only) is for tight iteration. Run the full chain before declaring anything complete.

## Classify the failure before fixing it

The instinct to make a red thing green is the most dangerous instinct in an autonomous loop. What the failure *means* determines whether fixing it is progress or damage.

**Your change is wrong.** The common case. Fix the change.

**The change is right, the test encoded an old assumption.** Legitimate, and rarer than it feels at 11pm. Update the test *and say so explicitly* in your report - a silently updated test is indistinguishable from a defeated one.

**A guardrail caught you.** A failure in `test:release-safety` or `test:assistant-harness` is usually not a stale test. These guard live payments and the resume truth locks - the guarantees the product is sold on. Treat a failure here as evidence you did something the product must not do. Never weaken one to get green. If you believe the guardrail is genuinely wrong, that is a **stop and ask**, not a judgement call.

**The design audit regressed.** You added hex, a prohibited class, an inline card, or a new radius. Fix it. If the increase is genuinely deliberate, `node scripts/design-audit.js --update` and explain why in the commit - the ratchet is meant to be re-set consciously, not silently.

**Environment, not code.** Missing env var, no network, absent dependency. Do not code around it. Say what is missing and stop.

## Where autonomy stops

Iterate freely inside a tier. Stop at the top of one.

| Tier | Examples | Autonomous |
|---|---|---|
| Mechanical | type-check, build, tests, design audit, CVE | yes - loop as long as you need |
| Observable | overflow, console errors, touch targets, screenshots | yes, via `ui-verify.js` |
| Judgment | is it attractive, is it intuitive, is this the right tradeoff | **no** |
| Gated | secrets, DNS, live payments, real emails, deploys | **no** |

### Hard stops - report and wait

Do not proceed past any of these, however obvious the answer seems:

- Anything needing a secret, credential, DNS record, or an owner decision. The blocked workstreams in `AGENTS.md` are blocked on *people*, not on engineering. Attempting them produces a confident wrong guess about an email address or a domain.
- Anything with irreversible consequences: a deploy, a live payment, a real user email, an external submission, a force-push, a history rewrite.
- A guardrail test that you believe is wrong.
- A product or design tradeoff the plan does not already settle.
- The same gate failing three times with three different fixes. That means you have misdiagnosed it. Stop and describe what you have tried.

### Circuit breakers

Autonomy needs a way to end that is not "success". Stop and report if:

- **3 failed attempts** at the same gate. The third failure is information: your model of the problem is wrong.
- **The blast radius grew.** If a "fix the padding" task is now touching a data layer, the plan was wrong, not the padding.
- **You are about to disable something** - a test, a lint rule, a type check, a guardrail - to make progress. That is never the fix.
- **A metric went the wrong way and you cannot say why.**

Stopping early with a clear account is a good outcome. Grinding forward with a weakened gate is not.

## Goal-bounded runs

When told to continue through multiple phases, the phase boundary is what keeps a bad early decision from propagating silently.

At each phase boundary:

1. **Run the full chain** - `node scripts/verify.js`, plus `ui-verify.js` if UI changed. Not `--fast`.
2. **Check the phase's own exit criteria**, not just that the gates are green. Plans in this repo define them explicitly; the design plan has a numeric definition of done.
3. **Record every judgement call you made** in `docs/DECISIONS.md` - one line each: the date, what you chose, and the constraint that forced it. This is the load-bearing habit for goal-bounded work. It is the only way a human reviewing four phases later can see *why* phase 1 went the way it did, instead of reverse-engineering it from a diff.
4. **Commit** at the boundary. A phase that cannot be committed cleanly is not finished.
5. **Then continue.**

Do not batch several phases into one commit. The reviewer's ability to bisect is worth more than a tidy history.

## Reporting

When you stop - finished or blocked - report in this shape:

```
Done:      what actually works now, and how you know
Gates:     verify.js result; ui-verify.js result if UI changed
Decided:   judgement calls made, and why
Not done:  what remains, and whether it is blocked or just next
Blocked:   the specific thing needed, and from whom
```

Two things that matter more than they look:

**Say how you verified, not that you verified.** "244/244 release-safety, build clean at 181 pages, ui-verify clean at all six widths" is checkable. "Everything works" is not.

**Report what you could not test.** If you tested under a simulation, an emulator, a fixture, or a different platform than production, say so plainly. An untested assumption reported as verified is the most expensive thing you can hand someone - it converts a known unknown into an unknown one.

## Repo-specific traps that break autonomous runs

- **A UI change is not complete without a browser run.** This is a named anti-pattern here, not a preference. `ui-verify.js` makes it one command; there is no longer an excuse to skip it.
- **The theme cascade has caused the same P0 twice** - a global light-theme override inverting an intentionally dark surface while leaving light text on it. Always verify both themes.
- **`NEXT_PUBLIC_*` is baked at Docker build time.** Changing one needs a rebuild, not a redeploy.
- **Security headers are duplicated** in `firebase.json` and `next.config.js`. Change both or they drift.
- **Never deploy from an unreviewed dirty tree.**
- **Prices come from Stripe at runtime.** Never hardcode one to make a test pass.

## When a plan turns out to be wrong

Plans are written before contact with the code and are sometimes wrong. If a phase's approach does not survive first contact:

Stop executing it. Say specifically what you found, why the planned approach does not work, and what you would do instead. Then wait.

Do not silently substitute your own plan - the user approved the one they read. A plan that needed changing is useful information; a plan quietly replaced mid-run is how goal-bounded autonomy turns into a surprise.
