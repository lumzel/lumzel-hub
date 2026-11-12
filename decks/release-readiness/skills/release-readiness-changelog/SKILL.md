---
name: release-readiness-changelog
description: Generate structured release notes, breaking-change warnings, and upgrade instructions from commits and diffs since the last release tag or base branch.
disable-model-invocation: true
---

# Release Changelog & Migration Notes

Draft accurate, user-facing release notes and upgrade guidance grounded in the actual commit history and diff.

## Procedure

1. **Determine Release Range**: Find the most recent release tag (`git tag --sort=-creatordate | head -n 5`) or fall back to the default base branch (`main` / `master`), unless the user specifies a range.
2. **Inspect Commits & Diffs**: Read `git log <base>..HEAD --oneline` and inspect key file diffs so entries describe real user/developer impact rather than raw commit typos or internal churn.
3. **Classify Changes**:
   - **Breaking Changes & Migrations**: schema updates, removed/renamed flags or APIs, required env/config updates, and step-by-step migration actions.
   - **Added / Features**: net-new user or API capabilities.
   - **Fixed**: user-visible bug fixes and stability improvements.
   - **Changed / Performance**: notable behavior refinements or speedups.
4. **Output**: Present clean Markdown ready to paste into `CHANGELOG.md` or a GitHub Release, omitting empty sections. Do not overwrite `CHANGELOG.md` unless asked.
