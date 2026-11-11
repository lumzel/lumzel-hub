---
name: subagent-driven-development
description: Execute an implementation plan by dispatching a fresh subagent per task followed by a two-stage Spec and Code Quality review gate.
---

# Subagent-Driven Development

Execute an implementation plan with high quality and zero context pollution by running a fresh subagent per task and enforcing a two-stage review gate.

## Per-Task Loop

1. **Dispatch `task-implementer` Subagent**:
   - Provide the full text of the current task and its architectural context so the subagent does not have to guess.
   - Require the subagent to follow TDD, run tests, and self-review before reporting back.
2. **Stage 1 Review — Dispatch `spec-compliance-reviewer`**:
   - Verify the code matches the task specification with zero missing requirements and zero unrequested extras.
   - Do not trust the implementer's self-report; the reviewer reads the actual diff and code.
3. **Stage 2 Review — Dispatch `code-quality-reviewer`**:
   - Only after Stage 1 passes, review the diff for clean abstractions, error handling, test quality, and maintainability.
4. **Mark Task Complete & Advance**:
   - Proceed to the next task only when both review stages approve.
