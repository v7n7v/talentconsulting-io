# The 3 August 2026 case file

The evidence behind every rule in `SKILL.md`, recorded so the rules can be re-argued rather than taken on faith. The task was the file-upload foundation: `lib/upload/`, `components/upload/`, the rewritten `lib/resume-upload.ts`, and the parse route.

## The three rounds

| Round | Shape | Agents | Tokens | Tool calls | Wall clock |
|---|---|---|---|---|---|
| 1 | build -> audit -> critic, 3 iterations, one workflow | 9 | 1.69M | 582 | 1h43m |
| 2 | 5 independent skeptics + judge, separate workflow | 6 | 905k | 215 | 22m |
| 3 | remediate -> 3 verifiers -> final judge | 5 | 905k | 306 | 47m |
| | **total** | **20** | **3.50M** | **1,103** | **2h53m** |

25 confirmed defects. Roughly **140k tokens per confirmed defect.**

## What round 1 reported, and what was true

Round 1 finished green: `tsc` clean, `design-audit --ci` passing, 56/56 tests, and its own auditor and critic reporting every finding resolved. It also claimed "10 of 10 mutations caught."

Round 2 - given only the file list, the house rules, and a lens each - produced 31 raw findings. The judge confirmed 25: **1 blocker, 9 major, 15 minor.**

Round 1's reviewers had read those files three times.

## The blocker

`lib/upload/upload-transport.ts`, the stall watchdog. On a dead socket it called `xhr.abort()` before settling the promise. XHR dispatches `abort` **synchronously**, so the abort listener won the race and the caller received `abortError()` - message `"Upload cancelled."` The stall path aborts the XHR and never the `AbortController`, so `signal.aborted` was false and the hook took the failure branch.

Net effect: a user whose network died was told, in error ink with a screen-reader announcement, that they had cancelled a transfer they never touched. The watchdog's own honest message was unreachable code. It was live in production through `uploadAndParseResume`.

Fixed by settling first, then aborting - `finish()` sets `settled` before rejecting, so the synchronous `abort` event becomes a no-op.

## The four refutations

The judge threw out 4 of 31. Two worth keeping as examples of how a competent reviewer over-claims:

- A reviewer reported that the guard-rejection branch performed a full body read plus a Storage delete RPC on every rejected request. It had **stopped reading eight lines short** of `if (!identity) return null;`, which returns before the body read.
- A reviewer called a genuine sub-1% first flush a "fabricated zero": 6,144 bytes of 4 MB floors to 0%. That is the honest floor of 0.146%, with the byte pair rendered beside it. Not a fabrication.

Both were plausible, specific, and wrong. This is why refutations are binding and why the remediator is told not to fix them back.

## The mutation results

The final judge reverted fixes in place and re-ran the suite. Two mutations were **executed** and survived:

- Replacing the merged pause/resume button with the two-sibling shape the finding described: **90 pass, 0 fail.** The test named "pausing does not move focus, because the same button stays mounted" cannot fail - both its assertions hold for the broken shape too.
- `if (true) return;` as the first statement of `retry()`: **90 pass, 0 fail.** The entire retry callback can be a no-op.

Three further mutations had their premises confirmed by reading but were not executed. If you cite "three tests could not fail", say which three and how each was established.

One mutation that *did* work: reverting the stall-watchdog ordering gave `not ok 28 - a dead socket is reported as a network stall, never as a cancellation / expected: 'The upload stopped responding. Try again.' / actual: 'Upload cancelled.'`

## The test-honesty census

| | Before | After |
|---|---|---|
| Total tests | 56 | 90 |
| Assert source text via `readFileSync` | 43 | 7 |
| Modules actually executed | 1 | 5 |

The 7 remaining source-text tests are cases where the source *is* the artifact - five CSS rules, two class-name lints. `UploadTrigger.tsx` is still not bundled by the harness; its entire coverage is one `assert.doesNotMatch` over its source.

**"56/56 green" meant almost nothing.** That is the number to remember when a fan-out reports a passing suite.

## Things a self-grading loop shipped

Beyond the blocker, round 2 and 3 caught:

- **A fix that introduced a regression.** Hoisting a storage bind above the anonymous-caller gate let unauthenticated callers force a Cloud Storage delete RPC per request.
- **A PII backstop that did not exist.** Five separate comments asserted a bucket lifecycle rule as the retention guarantee for abandoned resumes. `grep -rn lifecycle` found nothing. A stated privacy guarantee that is not real is worse than none.
- **Data leaking into an immutable record.** A `storagePath` was being returned to callers and persisted into `resume_versions`, which `firestore.rules` freezes once a guardrail report attaches - carrying the user's original filename into a permanent record and naming an object the route had already deleted.
- **Both cleanup mechanisms failing together.** The one path that produces an abandonable object - the token becoming unreadable after the bucket write - was also the path that sent the cleanup request unauthenticated and left the unload beacon untokened. The test covering it asserted only that one fetch happened, never inspecting the header, so the suite was green with the hole live.

Every one of these is a truthfulness defect rather than a crash. That is the shape of what a shared-context reviewer misses.
