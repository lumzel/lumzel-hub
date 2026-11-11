---
name: compound-codify
description: Capture non-obvious root causes, architectural lessons, and reusable patterns into the repository so each unit of work makes the next one easier.
---

# Compound Knowledge Codification (`/workflows:compound`)

Make every solved bug, tricky integration, or review insight compound for future sessions.

## When to Run

Trigger after resolving a non-trivial bug, completing a multi-file feature, or addressing significant code review feedback.

## Codification Structure

Document the learning concisely (in `docs/solutions/` or project rules/ADRs) with:
1. **Symptom / Context**: What failed or what problem needed solving.
2. **Root Cause**: Why it happened (the exact invariant or boundary that broke).
3. **Solution & Pattern**: The minimal code pattern that solved it, with file references.
4. **Prevention Rule**: How future changes in this codebase should avoid the trap.
