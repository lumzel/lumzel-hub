---
name: writing-plans
description: Decompose an approved design into bite-sized 2-5 minute TDD implementation tasks with exact file paths and verification commands.
---

# Superpowers Writing Plans

Write implementation plans assuming the executing engineer (or subagent) has zero prior conversation context.

## Task Granularity Rules

Every task in the plan must be a bite-sized vertical action (2–5 minutes of work) specifying:
- **Exact File Paths**: Files to create, modify, or test.
- **Step 1 — Write the Failing Test**: The exact behavior and assertion to test.
- **Step 2 — Run Test to Verify Failure**: The exact command and expected failure reason.
- **Step 3 — Write Minimal Implementation**: The minimal code change to pass the test (DRY, YAGNI).
- **Step 4 — Run Test to Verify Pass**: The exact command to confirm green status.
- **Step 5 — Commit**: A clean, atomic commit point.
