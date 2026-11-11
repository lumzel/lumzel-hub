---
name: compound-review
description: Run multi-angle parallel code reviews across simplicity, data integrity, performance, and security before merging.
---

# Compound Multi-Agent Review (`/workflows:review`)

Dispatch specialized review subagents in parallel to inspect a change from orthogonal angles:

1. **`simplicity-reviewer`**: Challenges unnecessary abstractions, premature configuration, and over-engineering; asks how the diff could achieve the same result in half the lines.
2. **`data-integrity-reviewer`**: Checks transaction boundaries, migration safety, race conditions, partial failure states, and backwards compatibility.
3. **`performance-oracle`**: Spots N+1 queries, unbounded loops, unnecessary re-renders, blocking I/O on hot paths, and memory retention.

Synthesize findings into `P1 (Blocking)`, `P2 (Important)`, and `P3 (Nit)` items with concrete file/line citations.
