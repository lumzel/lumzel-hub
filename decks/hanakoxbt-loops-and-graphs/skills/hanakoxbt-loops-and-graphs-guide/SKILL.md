---
name: hanakoxbt-loops-and-graphs-guide
description: How @hanakoxbt's Loops and Graphs Deck works and how to write good units, checks and lessons for it.
disable-model-invocation: true
---

# Loops and Graphs (@hanakoxbt) Guide

Loops and Graphs runs structured intra-node correction loops over a live topology graph: deterministic setup/checks, sequential Workers in the current worktree (for `feature-ship`) or parallel read-only reviewers (for `code-review`), bounded retry edges, one Human Gate, and a Learning Edge that feeds lessons back into future splits.

## 1. Node Roles and Edges

- **Splitter (`split`)**: Read-only (`ask`) agent that turns a feature requirement + active constraints into 2–5 independent vertical slices.
- **Worker (`write_check`, `impl`, `rework`, `review`)**: Focused agent operating directly inside the current git worktree (`write_check`/`impl`/`rework` sequentially in `feature-ship`, or parallel read-only in `code-review`).
- **Code & Shell (`preflight`, `plan`, `setup`, `verify_*`, `integrate`, `retro`, `record`, `scope`, `merge`, `learn`)**: Zero-token deterministic steps—command checks, working tree diffs, schema validation, deduplication.
- **Gate (`*_gate`, `human_gate`)**: Evaluates verifiable conditions. Only `human_gate` pauses for human approval before `ship` confirms completion with changes kept in the working tree.
- **Correction Edge (orange dashed)**: Bounded back-edges (`red_gate -> write_check` max 2, `green_gate -> impl` max 3, `reverify -> human_gate` max 3, `evidence_gate -> review` max 2). Failures stay bounded to their unit/lens.
- **Learning Edge (green dotted)**: `record -> preflight` inlet. Distilled lessons are proposed to the Vault and, once accepted, mirrored to `.lumzel/hanakoxbt-loops-and-graphs/lessons.md` and injected into the next Splitter run.

## 2. Unit Splitting Rules

- **Vertical slices**: Each unit delivers one cohesive, independently testable slice of behaviour (schema + logic + API or UI + test), not horizontal layers.
- **Disjoint file ownership**: Two units must **never** overlap in `checkFiles` or `implFiles`. Overlapping files create interference when running sequentially in the same worktree.
- **Bounded count**: Keep units between 2 and 5 (hard cap 6 via `maxUnits`).
- **Self-contained brief**: A Worker starts in a fresh subsession with no shared memory—include exact file paths, public contracts, and edge cases in `prompt`.

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

- **Not a git repository (`preflight_gate -> $fail`)**: Ensure the active project root is inside a git worktree and click **Retry from here** on `preflight`. Existing uncommitted changes in the working tree are allowed.
- **Environment failure in `red_gate`**: Missing binaries or modules (`ENOENT`, `Cannot find module`, exit 126/127) mean `setupCmd` is missing or wrong—configure `setupCmd` in the Checks popover.
- **Modified test files in `green_gate`**: `redCheck` hashes `checkFiles` after red verification passes; if `impl` modifies `checkFiles`, `green_gate` detects the hash mismatch and fails the attempt.
- **Rework at `human_gate`**: Rejecting with a note runs `rework` directly in the current working tree and re-verifies with `reverify` before returning to `human_gate`.
