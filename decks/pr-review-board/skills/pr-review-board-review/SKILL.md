---
name: pr-review-board-review
description: Run a structured two-axis code review (Coding Standards + Spec Compliance) on the current branch diff and uncommitted changes.
disable-model-invocation: true
---

# Dual-Axis PR Code Review

Review current workspace and branch changes along two independent axes — **Standards** and **Spec** — so clean style never masks a wrong behavior and working features never hide maintainability debt.

## Procedure

1. **Resolve Diff Scope**: Determine the comparison base (`main` / `master` merge-base via `git diff <base>...HEAD`, plus any staged/unstaged working tree changes) and list commits in scope.
2. **Axis 1 — Coding Standards & Quality**:
   - Check repository-documented rules (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, lint/architecture conventions) first.
   - Check error handling, race conditions, security boundaries, resource cleanup, and code smells (duplicated logic, feature envy, shotgun surgery).
3. **Axis 2 — Spec & Behavior Compliance**:
   - Locate any linked issue, design doc, ticket, or commit intent.
   - Check completeness, edge-case coverage, backward compatibility, test coverage at public seams, and unintended scope creep.
4. **Report Side by Side**: Present findings under `## Standards` and `## Spec`, ordered by severity (`Blocker`, `Major`, `Minor`), each with `file:line`, root cause, and concrete fix. Do not modify files unless asked.
