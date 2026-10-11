# Role prompts and their schemas

Copy-ready skeletons. Every line below earned its place on 3 August; see `case-file.md` for what each one caught.

## The ground rules block

Paste this into **every** read-only reviewer prompt, verbatim. It is what took the refuted rate down and made findings actionable:

```
Report ONLY what you can demonstrate by quoting a specific line or by running a
command and showing its output.
A finding you cannot point at is not a finding. Speculation is worse than silence.
If a dimension is genuinely clean, say so explicitly rather than manufacturing a
finding to look thorough.
Distinguish PRE-EXISTING problems from ones this work introduced. Say which.
READ-ONLY - you must not edit, create or delete any file.
```

The third line matters as much as the first. A reviewer under instruction to find problems will find them whether or not they exist.

## Findings schema

`required` is the enforcement. A reviewer cannot return a finding without a line and evidence, because the harness rejects the call.

```js
const FINDINGS = {
  type: 'object',
  additionalProperties: false,
  required: ['lens', 'verdict', 'findings'],
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', enum: ['clean', 'defects-found'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'file', 'line', 'claim', 'evidence', 'introduced'],
        properties: {
          severity:   { type: 'string', enum: ['blocker', 'major', 'minor'] },
          file:       { type: 'string' },
          line:       { type: 'string' },
          claim:      { type: 'string' },
          evidence:   { type: 'string', description: 'Quoted code or command output proving it' },
          introduced: { type: 'string', enum: ['this-work', 'pre-existing'] },
        },
      },
    },
  },
}
```

## Builder

Give it the plan, the house rules, the gate commands, and the prior round's confirmed findings. Never give it the reviewers' raw output - only the adjudicated list.

Closing lines that matter:

```
Write real, complete, compiling code to disk. Run every gate and report their
VERBATIM output. If a gate fails, fix it and re-run before reporting.
If you cannot fix something, say so in notFixed with the reason - do not silently
skip it and do not claim a gate passed without running it.
Do not act on the REFUTED section. Do not "fix" those back.
```

Its schema should require `gates` as a string holding raw command output, not a boolean. A boolean invites a claim; raw output invites a check.

## Auditor

Conformance against the plan and the house skills, inside the build workflow. It reads the files on disk, never the builder's report. It may not declare the work done - that is the judge's alone.

## Skeptic

One lens per agent, run in parallel because they are read-only. Give each the file list and its lens, and **nothing about what the builder believes it did.**

Lenses should be written from the actual risk surface. The five used on the upload foundation were fabrication, transport correctness, accessibility, security, and React runtime - useful as a starting shape, not as a template to copy blind. If you cannot articulate what a lens should attack, drop it rather than let it invent something.

A lens prompt that worked, in miniature:

```
LENS: FABRICATION. This product's promise is that nothing is invented.
Hunt for any place the UI states something it does not know:
- a percentage, width or byte count not derived from a real event. Trace every
  number to its source.
- any artificial delay or minimum duration that manufactures the appearance of work.
- states that render a value where the value is meaningless.
Prove each one by quoting the line.
```

## Judge

One agent, alone, `effort: 'high'`. It receives the raw findings **and** reads the code itself.

```
For EACH finding, open the file, read the code around the cited line, and decide:
  CONFIRMED - the defect is real and you verified it yourself
  REFUTED   - the reviewer misread the code; say what they missed
  DUPLICATE - the same defect as another finding

Be sceptical in both directions. Reviewers under instruction to find problems will
sometimes invent them; reviewers can also miss things. Where two reviewers disagree,
adjudicate by reading the code.

Run the gates yourself and report their verbatim output. Do not accept a claimed
gate result you did not see.
```

Its schema must require **both** `confirmed` and `refuted`. A judge that can only confirm is a rubber stamp.

Add the specific questions the run exists to answer, as their own required fields - "is there any path that still shows a user something untrue", "is there any orphaned PII path", "is this safe to build on". A free-text summary lets a judge hedge; a named field with an enum does not.

## Mutation testing

For any fix that matters, instruct the judge to prove the test can fail:

```
Revert the fix in place, re-run the suite, confirm it goes RED, then restore.
Report the failing test name and the actual-vs-expected. If the suite stays green,
the test is decorative - say so and name it.
```

This is what proved `if (true) return;` at the top of `retry()` left 90/90 passing. Without it, a green suite is an assertion, not evidence.
