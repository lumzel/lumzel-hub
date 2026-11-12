# Compound Engineering (Plan → Work → Review → Compound)

# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound captures and refreshes learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## The plugin and its parts

### Plugin
A distributable bundle of Skills, Agents, Commands, and Hooks (optionally MCP servers) described by a single manifest and installed into a coding-agent platform as one unit — the artifact the Converter translates for non-Claude Targets and the Marketplace distributes.

### Skill
A user-invoked capability defined in its own directory, and the primary entry point a user reaches for. A Skill orchestrates: it can progressively pull in its own reference files as needed and dispatch generic subagents seeded with Specialist prompt assets. Distinct from an Agent in that a Skill is user-invoked and coordinates, whereas an Agent or subagent is dispatched to perform scoped work.

### Agent
A specialized, single-purpose worker running in its own isolated context and returning a result, rather than conversing with the user. Also called a subagent. In the current plugin design, most CE specialist behavior is not exposed as standalone Agent definitions; Skills seed generic subagents with Skill-local prompt material instead.

### Specialist prompt asset
An internal prompt file owned by one Skill that defines a specialist persona or research/review role for a generic subagent. It is not an externally exposed plugin component: the owning Skill controls when it is loaded, which model or tool policy applies, and how its output is merged.

## Conversion

### Target
A destination coding-agent platform other than Claude Code (OpenCode, Codex, Pi, Antigravity, Kimi Code, and others) that the repo supports through native plugin metadata or a Converter/Writer pair. Also called a target provider when it uses the conversion path.

A Plugin is installed to a Target at one of two scopes: global (user-wide) or per-workspace.

### Native plugin surface
A platform-provided install contract that can consume this repo's committed plugin manifest or marketplace metadata directly, without generating a converted Bundle. When a Target has a native plugin surface, user-facing support usually belongs in platform metadata, release validation, and docs instead of a new Converter and Writer.

### Converter
The step that transforms a parsed Plugin into one Target's in-memory form, mapping tools, permissions, hooks, and model names explicitly rather than by convention.

### Writer
The step that emits a Target's converted Bundle onto disk, in that Target's expected paths and merge semantics. Paired with a Converter, one per Target.

### Bundle
The in-memory converted form of a Plugin for a single Target — the handoff a Converter produces and a Writer consumes.

### Install manifest
A per-plugin ledger, written by a Writer at install time, of exactly which skill, agent, prompt, and extension paths that install created on a Target — the record later installs consult to tell tool-owned content apart from user-managed content.

The load-bearing invariant is that a Writer never claims a path it did not write: a path the user has replaced (a symlink into a personal fork, a hand-authored directory) is excluded from the manifest and preserved on reinstall rather than overwritten, and the ledger is self-healing — removing the override lets the next install resume tracking that path. A path with no manifest entry — including one from an install predating the mechanism — reads as unowned and is therefore preserved.

### Marketplace
The catalog metadata listing installable plugins and their versions for distribution, kept consistent with each Plugin's manifest by release validation.

## Compound engineering

### Compound engineering
The methodology this project embodies: structure engineering work so each unit makes the next one easier, capturing reusabl

---

# Agent Instructions

This repository is the root of the `compound-engineering` coding-agent plugin and the marketplace/catalog metadata used to distribute it.

It also contains:
- the Bun/TypeScript CLI that converts Claude Code plugins into other agent platform formats
- shared release and metadata infrastructure for the CLI, marketplace, and plugin

`AGENTS.md` is the canonical repo instruction file. Root `CLAUDE.md` is a symlink to `AGENTS.md` so Claude Code and other tools that look for `CLAUDE.md` still find it at the expected path. Keep that symlink (do not replace it with a regular file): a real root `CLAUDE.md` makes `claude plugin validate --strict` fail because this checkout is also the plugin root.

## Quick Start

```bash
bun install
bun run test              # full test suite (also runs in CI; `--parallel` across worker processes)
bun run typecheck         # tsc over src, scripts, and tests (also runs in CI)
bun run release:validate  # plugin/marketplace consistency (also runs in CI)
bun run plugin:validate   # Claude marketplace + plugin schema (also runs in CI; needs `claude` on PATH)
```

### Codex Local Plugin Development

When testing current skill files in Codex, run the repository workflow from the checkout or worktree you intend to test:

```bash
bun run codex:dev -- local    # link this worktree's skills and remove CE plugin installs
bun run codex:dev -- status   # show local/remote state and checkout provenance
bun run codex:dev -- remote   # restore the official marketplace-backed plugin
bun run codex:dev -- remove   # remove both supported CE installation surfaces
```

`refresh` is an idempotent alias for `local`. Local mode manages only the exact `$CODEX_HOME/skills/compound-engineering-local` symlink and Compound Engineering plugin IDs; it must not alter unrelated user skills. The symlink includes modified and untracked files from the selected worktree. Start a new Codex session after switching installation modes. Current Codex versions detect direct skill edits automatically; restart only if an edit does not appear. For live local testing, use this workflow instead of adding the repository as a marketplace: a marketplace install caches a snapshot, while local mode links the current skill files.

## Working Agreement

- **Branching:** Create a feature branch for any non-trivial change. If already on the correct branch for the task, keep using it; do not create additional branches or worktrees unless explicitly requested.
- **Merge policy:** All changes to `main` go through pull requests. Direct pushes and direct merges are not allowed; branch protection on `main` enforces this by requiring the `test` status check to pass. The direct path bypasses `release:validate`, the test suite, and PR title validation — past direct merges have caused version drift requiring multi-PR recovery (see `docs/solutions/workflow/release-please-version-drift-recovery.md`).
- **Contribution gate (non-maintainers):** If you are not a repository maintainer or admin, do not open a PR without a linked issue — file the issue first and reference it from the PR. Adding a **new skill** has a stricter gate: non-maintainers and non-admins must raise a discussion in an issue and get explicit maintainer approval **before** starting the work; do not open a new-skill PR that has not been approved this way. Maintainers and admins are exempt from both gates but still follow the merge policy above.
- **PR disclosure:** `.github/pull_request_template.md` ends with `## Security Disclosure` and `## Agent Disclosure` sections. Fill both when opening a PR — including PRs authored via `gh pr create --body`/`--body-file`, which bypass the template so nothing pre-fills them. State any security-relevant changes (or "No security-relevant changes"), and the model that did the bulk of the work — your harness plus the most specific model identity your own context gives you, e.g. `Claude Code · claude-opus-4-8` or `Codex CLI · GPT-5`. Copy an exact mod
