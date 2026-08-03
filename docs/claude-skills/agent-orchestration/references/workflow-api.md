# Authoring a Workflow script

The `Workflow` tool runs a plain-JavaScript script that spawns sub-agents deterministically. The script is the graph: `phase()` names the nodes, `pipeline()` and `parallel()` are the edges, structured-output schemas are the typed state on them, and `resumeFromRunId` is the checkpoint. There is no second orchestration vocabulary to learn, and inventing one on top would be a rule with no mechanism behind it.

## The shape

Every script begins with a `meta` literal:

```js
export const meta = {
  name: 'upload-foundation-adversarial-verify',
  description: 'Independently verify across five hostile lenses, then judge what survives',
  phases: [{ title: 'Attack' }, { title: 'Judge' }],
}
```

`meta` must be a **pure literal** - no variables, function calls, spreads or template interpolation. `name` and `description` are required. Phase titles are matched exactly against `phase()` calls; a `phase()` with no matching entry gets its own progress group.

## The hooks

- **`agent(prompt, opts)`** - spawns one sub-agent. `opts`: `label`, `phase`, `schema`, `model`, `effort`, `isolation`, `agentType`. With `schema` the sub-agent is forced to call a `StructuredOutput` tool and validation happens at the tool layer, so the model retries on a mismatch rather than handing you malformed text. Returns `null` if the user skips it or it dies after retries - always `.filter(Boolean)`.
- **`pipeline(items, ...stages)`** - each item flows through all stages independently, **no barrier**. Item A can be in stage 3 while item B is in stage 1. This is the default.
- **`parallel(thunks)`** - a barrier. Justified only when the next step genuinely needs every prior result at once: cross-item dedup, early exit on zero, or a prompt that references "the other findings". A thunk that throws resolves to `null`, so `.filter(Boolean)`.
- **`phase(title)`**, **`log(message)`** - progress grouping and a narrator line. Use `log()` to publish arithmetic.
- **`args`** - whatever was passed to the tool, verbatim. Pass arrays as real JSON, not a JSON string.
- **`budget.total / spent() / remaining()`** - a hard ceiling. `agent()` throws past it.

## Concurrency and caps

Concurrent `agent()` calls are capped at `min(16, cores - 2)`; excess queues. A single `parallel()`/`pipeline()` call accepts at most 4096 items. Lifetime cap is 1000 agents per workflow - a runaway backstop, not a target.

## Traps

- Scripts are **plain JavaScript, not TypeScript.** Type annotations, interfaces and generics fail to parse.
- **`Date.now()`, `Math.random()` and argless `new Date()` throw.** They would break resume. Stamp timestamps after the workflow returns; vary randomness by agent index or label.
- No filesystem, no Node APIs. To hand agents a large dossier, write it to a scratch path *before* invoking the workflow and give them the path to read.
- A stage that throws drops that item to `null` and skips its remaining stages.

## Reading results

The tool returns the script's return value, but truncates. The authoritative record is `<transcriptDir>/journal.jsonl` - one `{"type":"result",...}` line per completed agent with its full return value. **Read it before diagnosing an empty or surprising result**; do not assume a cached result was non-empty.

The task-notification `result` field is JSON. The workflow's own return value is nested under `.result`, not at the top level:

```bash
jq -r '.result.judged.confirmed[] | "[\(.severity)] \(.file):\(.line)"' <output-file>
```

## Resume

`Workflow({scriptPath, resumeFromRunId})` replays the longest unchanged prefix of `agent()` calls from cache and runs live from the first edited or new call. Same script plus same args is a 100% cache hit. Stop the prior run before resuming.

Every invocation persists its script under the session directory and returns the path. Iterate by editing that file and re-invoking with `{scriptPath}` rather than re-sending the whole script.

## Verified against

Claude Code 2.1.219. Two items are inferred rather than observed and should be treated as such: the full `isolation` enum (`'worktree'` is documented and near-certain; other values unverified) and whether `agent()`'s `model` option accepts exactly the same set as agent frontmatter.
