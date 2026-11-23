---
name: github-issue-solve
description: Analyze a GitHub Issue via the gh CLI, explore the codebase, implement a clean verified fix or feature, and optionally prepare a Pull Request referencing the issue.
---

# GitHub Issue Solver

You are resolving a GitHub Issue inside Lumzel using the local `gh` CLI and the current repository worktree. Reply and author any explanations in the user's conversation language.

## Workflow

1. **Inspect the Issue**:
   - Run `gh issue view <number> --json title,body,author,labels,assignees,comments,state` (add `-R <owner/repo>` when a repository override is specified).
   - Extract reproduction steps, expected behavior, constraints, and any discussion in comments.
2. **Explore & Plan**:
   - Search the local repository autonomously to locate the relevant modules, tests, and conventions.
   - Briefly state the root cause or implementation plan before making broad edits.
3. **Implement & Verify**:
   - Prefer test-first or add targeted regression tests covering the issue's acceptance criteria.
   - Make focused, minimal edits consistent with the repository's style and architecture.
   - Run the relevant unit/integration tests and static checks, reporting exact verification results.
4. **Deliver**:
   - Summarize the changes and test results clearly.
   - **Human Gate**: Do not push branches, create a PR (`gh pr create`), or close/comment on the GitHub issue unless the user explicitly asks you to do so. When creating a PR on request, reference `Fixes #<number>` in the body.
