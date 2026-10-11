# Career Intelligence and Humanizer backend repair verification

Local implementation and synthetic/runtime validation, 2026-09-28. No production accounts, external providers, deployment or commits.

## Career Intelligence

- Version6 twin has60-second TTL; invalidation tokens prevent a concurrent refresh overwriting a newer invalidation. Recommendation and summary derive from the same twin, without independent cache.
- Source-read failures propagate rather than becoming persisted empty constraints. Paginated identity reads include mixed timestamp records, up to5000 per collection; larger collections return an explicit error rather than incorrect total. Source counts/completeness, timestamp, data version and cache origin exposed.
- Canonical submitted/ever-interview/ever-offer predicates now serve Outcomes too. First response includes earliest recorded reply and same-day response. No fabricated trend from empty question windows.
- Learning completion and versioned latest assessments retain distinct provenance. Canonical fit analyses expose source IDs. Placeholder STAR drafts do not count as prepared coverage. Recommendations no longer assert frequent market demand or causal practice benefit.
- Mutable profile documents remain editable; computed profile/career_twin and fit_analyses are client-write denied. Source mutation hooks cover application/manual/offer/outcome, morale, resume CRUD and assessed/learning progress; TTL bounds freshness when a hook fails.
- Weekly action entries expose record IDs. Demo Overview funnel uses the same application records as Results.

Tests: `node --test scripts/career-intelligence-integrity.test.js` passed11/11. Prior targeted application/practice/client suites29/29 passed. Every test resolves repository from __dirname; no developer-specific repo path.

## Humanizer

- Authenticated request receipts atomically reserve the unchanged monthly input-word and free lifetime-run allowances. Payload binding and final-response caching support exact replay even at cap. Five-minute worker leases support interrupted retry and reject stale settlement. Refunds are bound to receipt month; failed requests release both word and run reservations.
- Invalid paragraph selection rejected before reservation. Full output requires rewritten text; targeted output requires exactly selected unique patches. Required changes/stat fields checked at runtime. Provider or quality failure does not return/charge a failed rewrite.
- Raw source bytes retained: unselected paragraphs preserve whitespace, CRLF, smart quotes and instruction-like quoted prose. No destructive normalization or global punctuation cleanup is applied to source/output.
- Fixed percentage extraction and whole-term numeric matching; quotes/numerical tokens protected. Corrected escaped factual-token regexes. Every changed rewrite warns that meaning needs user review; seven harmful synthetic fact mutations never receive an all-clear. Token matching does not certify semantics.
- Unusable Deep Scan output has unavailable status/null confidence and no usage charge, including empty, wrong-count or punctuation-only completions.

Tests: `node --test scripts/humanizer-integrity.test.js` passed14/14. Combined writing contract suites26/26 passed. Tests invoke actual route, quality, router and metering logic with controlled provider/storage boundaries; no real provider calls.

## Actual emulator evidence

`npm run test:workspace:rules` passed18/18 against localhost Auth/Firestore. Includes actual concurrent word reservations and exact cached replay, not just fake transaction tests; owner-denied nested receipt/twin/fit writes; legitimate editable profile; prior workspace/offer tests.

`git diff --check` passed. Last type check had only concurrent Oracle UI missing-helper errors reported to root; Career/Humanizer code emitted no type errors. Root owns final integrated type/build/browser checks.

Remaining boundaries: live provider quality/latency, statistical authorship accuracy, semantic equivalence and downstream job outcomes are not certified by these tests. Career scoring is a disclosed heuristic. Anonymous public Humanizer retains its existing IP daily limit; authenticated metering uses receipts. Free run limits and monthly word amounts were not increased.

## Frontend integration follow-up

Owner-scoped retry identity is persisted before request dispatch and restored after reload; storage failure is labeled while same-mounted retries retain their ID. Displayed checks bind to both exact output and writing settings. Deep Scan clears old samples and rejects unavailable/null confidence responses. Original/review/undo and intentionally empty cloud output are preserved.

`node --test scripts/writing-state.test.js scripts/writing-review-export.test.js scripts/humanizer-integrity.test.js` passed33/33 (16 actual-component state tests). Typecheck and diff checks passed at this checkpoint.

Billing limitation is explicitly disclosed in the UI: selected-paragraph rewriting currently reserves the entire input document's word count. Replays of the same request charge once. No allowance amount or charge unit changed.
