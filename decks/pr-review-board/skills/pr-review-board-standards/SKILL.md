---
name: pr-review-board-standards
description: Audit current branch and working tree changes against repository coding standards, architectural rules, error safety, and maintainability heuristics.
disable-model-invocation: true
---

# Coding Standards & Maintainability Review

Review the active diff strictly for engineering conventions, architectural boundaries, runtime safety, and code clarity.

## Procedure

1. **Load Repo Conventions**: Read project rule files (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `.editorconfig`, lint/arch configs) so documented repository conventions take precedence over generic preferences.
2. **Inspect the Diff**: Diff against the merge-base (`git diff <base>...HEAD` and uncommitted changes). Focus on touched modules and their immediate callers.
3. **Check High-Signal Dimensions**:
   - Documented rule or layer violations
   - Unhandled errors, panics/unwraps on untrusted input, or leaked listeners/handles
   - Duplicated logic, leaky abstractions, primitive obsession, or unclear naming
   - Missing or brittle tests on changed public interfaces
4. **Output**: Distinguish **Hard Rule Breaches** (cite rule file + line) from **Design Judgement Calls**, quoting `file:line` and a concise fix for each.
