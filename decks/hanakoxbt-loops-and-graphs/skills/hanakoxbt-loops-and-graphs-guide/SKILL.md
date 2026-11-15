---
name: hanakoxbt-loops-and-graphs-guide
description: How @hanakoxbt's Loops and Graphs Deck works and how to write good units, checks and lessons for it.
disable-model-invocation: true
---

# Loops and Graphs (@hanakoxbt) Guide

Loops and Graphs runs structured intra-node correction loops over a live topology graph: deterministic setup/checks, isolated parallel Workers, bounded retry edges, one irreversible Human Gate, and a Learning Edge that feeds lessons back into future splits.

## 1. Node Roles and Edges

- **Splitter (`split`)**: Read-only (`ask`) agent that turns a feature requirement + active constraints into 2–5 independent vertical slices.
- **Worker (`write_check`, `impl`, `rework`, `review`)**: Focused agent operating inside an isolated git worktree (for `feature-ship`) or read-only current worktree (for `code-review`).
- **Code & Shell (`preflight`, `plan`, `setup`, `verify_*`, `commit*`, `integrate`, `retro`, `record`, `scope`, `merge`, `learn`)**: Zero-token deterministic steps—command checks, git diffs, schema validation, deduplication.
- **Gate (`*_gate`, `human_gate`)**: Evaluates verifiable conditions. Only `human_gate` pauses for human approval before the irreversible `git merge --no-ff` (`ship`).
- **Correction Edge (orange dashed)**: Bounded back-edges (`red_gate -> write_check` max 2, `green_gate -> impl` max 3, `reverify -> human_gate` max 3, `evidence_gate -> review` max 2). Failures stay isolated to their unit/lens.
- **Learning Edge (green dotted)**: `record -> preflight` inlet. Distilled lessons are proposed to the Vault and, once accepted, mirrored to `.lumzel/hanakoxbt-loops-and-graphs/lessons.md` and injected into the next Splitter run.

## 2. Unit Splitting Rules

- **Vertical slices**: Each unit delivers one cohesive, independently testable slice of behaviour (schema + logic + API or UI + test), not horizontal layers.
- **Disjoint file ownership**: Two units must **never** overlap in `checkFiles` or `implFiles`. Overlapping files create merge conflicts in `integrate`.
- **Bounded count**: Keep units between 2 and 5 (hard cap 6 via `maxUnits`).
- **Self-contained brief**: A Worker starts in a fresh session with no shared memory—include exact file paths, public contracts, and edge cases in `prompt`.

## 3. `checkCmd` Specification

`plan.js` strictly validates every unit's `checkCmd`:

1. Must run **only that unit's acceptance tests** (e.g., `pnpm vitest run src/export/csv.test.ts` or `cargo test --test csv_export`), never the whole suite.
2. Must start with an allowed prefix from `checkPrefixes` (`pnpm `, `npm `, `npx `, `yarn `, `bun `, `vitest`, `jest`, `cargo test`, `pytest`, `python -m pytest`, `uv run pytest`, `go test`, `deno test`, `swift test`, `make test`).
3. **Forbidden shell metacharacters**: `;`, `&`, `|`, `` ` ``, `$`, `<`, `>`, `\`, and newlines are rejected.
4. `checkFiles` must contain relative paths without `..`, spaces, quotes, or metacharacters.

## 4. Writing Effective Constraints (Lessons)

- **Imperative and verifiable**: State a clear action and how it is verified (e.g., `"Compare dates on UTC day boundaries; tests must cover a non-UTC timezone."`).
- **Concise**: Maximum 280 characters. Avoid vague platitudes like `"write clean code"`.
- **Scoped**: Pick the narrowest scope (`split`, `check`, `impl`, `review`, or `general`). `code-review` injects only `review` and `general` constraints; `feature-ship` injects all active constraints.

## 5. Troubleshooting Failures

- **Dirty working tree (`preflight_gate -> $fail`)**: Commit or stash changes outside `.lumzel/hanakoxbt-loops-and-graphs/` and click **Retry from here** on `preflight`.
- **Environment failure in `red_gate`**: Missing binaries or modules (`ENOENT`, `Cannot find module`, exit 126/127) mean `setupCmd` is missing or wrong—configure `setupCmd` in the Checks popover.
- **Modified test files in `green_gate`**: `commit_red` pins acceptance tests; if `impl` modifies `checkFiles`, `green_gate` deterministically checks out `HEAD` on those files and fails the attempt.
- **Merge conflict at `integrate` / `ship`**: Failed units are already isolated and excluded. If `ship` hits a conflict on the main worktree, resolve it manually and click **Retry from here** on `ship`.
