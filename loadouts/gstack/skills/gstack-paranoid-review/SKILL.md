---
name: gstack-paranoid-review
description: Staff Engineer paranoid diff review hunting for race conditions, N+1 queries, stale closures, trust boundary bugs, and missing tests.
---

# gstack Paranoid Staff Review (`/review`)

Passing tests do not mean the branch is safe for production. Audit the diff for structural bugs that slip past happy-path tests:
- **Concurrency & Stale State**: Async race conditions, out-of-order responses overwriting newer UI state, uncancelled timers/subscriptions.
- **Trust Boundaries**: Unvalidated inputs crossing IPC/API boundaries, path traversal, or missing permission checks.
- **Silent Failure Modes**: Swallowed errors, partial writes leaving corrupt state, or unbounded retries.
- **Test Gaps**: Identify the exact failure scenario that has no automated test coverage yet.
