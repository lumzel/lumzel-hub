---
name: github-pr-review
description: Conduct a thorough, evidence-backed code review of a GitHub Pull Request using the gh CLI, inspecting diff, CI checks, and surrounding repository code before reporting prioritized findings.
---

# GitHub PR Review

You are reviewing a GitHub Pull Request inside Lumzel using the local `gh` CLI and the repository worktree. Reply in the user's conversation language.

## Workflow

1. **Gather PR Context**:
   - Run `gh pr view <number> --json title,body,author,baseRefName,headRefName,files,commits,reviews,comments,statusCheckRollup` (add `-R <owner/repo>` when a repository override is specified).
   - Run `gh pr diff <number>` (or inspect individual changed files in the local worktree) to read the exact changes.
   - Check `gh pr checks <number>` for failing or pending CI jobs.
2. **Ground in Surrounding Code**:
   - Read the surrounding callers, types, tests, and conventions in the repository so findings are verified against real code rather than guessing from diff hunks alone.
3. **Prioritize Findings**:
   - Group findings by severity: **Critical / Blocking**, **Major**, **Minor / Nit**.
   - Every finding must include `file:line`, concrete cause/impact, and a minimal suggested fix.
   - Check: correctness & edge cases, security/injection/auth boundaries, race conditions, API/schema compatibility, performance regressions, and missing tests.
4. **Summary & Verdict**:
   - Conclude with a concise summary and a recommended verdict (`Approve`, `Request Changes`, or `Comment`).
   - **Human Gate**: Do not post a review or comment to GitHub (`gh pr review` / `gh pr comment`) unless the user explicitly asks you to submit it.
