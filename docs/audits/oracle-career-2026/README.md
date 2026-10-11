# Oracle and Career Intelligence review reproductions

These scripts execute current source with controlled local boundaries. They do not contact real providers or accounts. Run from the repository root with its installed dependencies:

```bash
node docs/audits/oracle-career-2026/oracle-backend-audit.cjs
node docs/audits/oracle-career-2026/career-intelligence-audit.cjs
node docs/audits/oracle-career-2026/career-outcome-audit.cjs
node --test docs/audits/oracle-career-2026/insights-product-audit.test.cjs
```

The first three emit observations and write temporary bundles/results under `/tmp`. Captured `*-results.json` files here record the review state; reruns do not overwrite them. The two component assertions intentionally assert the defective behavior to reproduce it and should be replaced with regression expectations when fixes are implemented. They are not part of the normal product suite.

The graph/twin and Outcomes scripts exercise ten controlled cases in total. Firestore is represented by local fixtures; the security-rule finding is static inspection, not an emulator result. Oracle provider payloads are deliberately supplied fixtures, demonstrating what the current route accepts rather than the frequency of real model mistakes.

See [the combined review](../../oracle-career-intelligence-review-2026.md) for findings, scope and proposed fixes, and [backend notes](career-backend-notes.md) for further reproduction details.
