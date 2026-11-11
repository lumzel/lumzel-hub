---
name: compound-plan
description: Turn feature ideas into thorough implementation plans grounded in existing codebase patterns, git history, and documented learnings.
---

# Compound Engineering Plan (`/workflows:plan`)

In Compound Engineering, **80% of the leverage lives in Plan & Review**, and 20% in execution.

## Planning Workflow

1. **Mine Institutional Knowledge First**:
   - Search `docs/solutions/`, ADRs, and recent commits in the target area so past pitfalls and established idioms inform the plan from line one.
2. **Reuse Before Inventing**:
   - Name the exact existing helpers, components, schemas, and actions each step reuses before proposing any new abstraction.
3. **Lock Hard-to-Reverse Decisions**:
   - Explicitly specify data schemas, wire formats, idempotency guarantees, and permission boundaries.
4. **Acceptance & Verification Matrix**:
   - Define the exact automated tests and verification commands that prove the work is complete.
