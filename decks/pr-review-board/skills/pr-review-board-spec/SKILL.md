---
name: pr-review-board-spec
description: Verify current branch and working tree changes against feature specs, tickets, or commit goals for missing requirements, edge cases, and scope creep.
disable-model-invocation: true
---

# Specification & Behavior Compliance Review

Verify whether the code changes faithfully fulfill the intended specification without regressions or unrequested scope creep.

## Procedure

1. **Locate Spec Context**: Check `docs/`, `specs/`, linked tickets, or commit messages (`git log <base>..HEAD`) to establish the expected behavior and acceptance criteria. If no written spec exists, infer the stated intent from commits and note that explicitly.
2. **Trace Requirement Coverage**: Compare each requirement and user flow against the actual implementation and tests in the diff:
   - **Missing or Partial**: requirements or UI/API states not handled
   - **Incorrect Behavior**: subtle logic bugs, off-by-one/state-sync flaws, broken error/empty states, or i18n/theme gaps
   - **Scope Creep**: unrelated edits, speculative abstractions, or silent breaking changes outside scope
3. **Output**: List findings with spec requirement reference, `file:line` evidence, and verification test suggestions.
