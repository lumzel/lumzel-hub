---
name: release-readiness-audit
description: Run a pre-release readiness gate check across git status, build and test verification, breaking changes, and release blockers for the current workspace.
disable-model-invocation: true
---

# Release Readiness Audit

Verify whether the current workspace is ready to tag and ship. Inspect real repository state and command results instead of guessing.

## Procedure

1. **Workspace & Git State**: Check `git status`, current branch, latest tag (`git describe --tags --abbrev=0` if tags exist), and commits since the previous release or base branch. Flag uncommitted or untracked release-affecting files.
2. **Build & Automated Tests**: Detect the project's test/lint/typecheck/build scripts (`package.json`, `Cargo.toml`, `Makefile`, `pyproject.toml`, etc.) and run the fast verification suite. Record exact pass/fail results.
3. **Compatibility & Migration Gate**: Inspect diffs since the last tag/base for database schema changes, config/env var additions, IPC/API contract changes, or version number mismatches across manifests.
4. **Verdict Report**: Summarize results in four sections:
   - **Gate Verdict**: `READY`, `READY WITH NOTES`, or `BLOCKED`
   - **Checks Passed**: concrete commands and checks verified
   - **Blockers & Risks**: each issue with `file:line` or failing command output
   - **Next Steps**: exact commands or fixes required before tagging
