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

- **Vertical slices**: Each unit delivers one cohesive, independently verifiable slice of behaviour (schema + logic + API or UI + build/test), not arbitrary horizontal layers.
- **Minimize file overlap**: Prefer disjoint `checkFiles` and `implFiles` across units so sequential runs in the current worktree do not step on each other.
- **Unit modes (`tdd` vs `verify`)**:
  - `tdd` (non-empty `checkFiles`): `write_check` writes failing tests, `red_gate` verifies they fail before implementation and hashes `checkFiles`, then `impl` makes them pass without modifying `checkFiles`.
  - `verify` (`checkFiles: []`): skips `write_check`/`red_gate` and verifies `impl` directly via `checkCmd` (ideal for UI styling, layout, config, or project-wiring units).
- **Bounded count**: Keep units within `maxUnits` (1–6, default 5).
- **Self-contained brief**: A Worker starts in a fresh isolated Session with no shared memory—include exact file paths, public contracts, and edge cases in `prompt`.

## 3. `checkCmd` Specification

`plan.js` validates every unit's `checkCmd` without hardcoding a language or framework whitelist:

1. Must be a single-line, non-empty, non-trivial command appropriate for the repository's real toolchain (e.g., `xcodebuild test ...`, `swift test`, `pnpm vitest run ...`, `cargo test ...`, `./gradlew test`, `make check`).
2. If `inputs.checkPrefixes` is explicitly configured (non-empty), `checkCmd` must start with one of those prefixes; by default (`[]`), any toolchain command is accepted.
3. No-op commands (`true`, `:`, `echo`, `exit 0`) and destructive commands are rejected.
4. `checkFiles` must contain relative paths without `..` traversal or control characters.

## 4. Writing Effective Constraints (Lessons)

- **Imperative and verifiable**: State a clear action and how it is verified (e.g., `"Compare dates on UTC day boundaries; tests must cover a non-UTC timezone."`).
- **Concise**: Maximum 280 characters. Avoid vague platitudes like `"write clean code"`.
- **Scoped**: Pick the narrowest scope (`split`, `check`, `impl`, `review`, or `general`). `code-review` injects only `review` and `general` constraints; `feature-ship` injects all active constraints.

## 5. Troubleshooting Failures

- **Not a git repository (`preflight_gate -> $fail`)**: Ensure the active project root is inside a git worktree and click **Retry from here** on `preflight`. Existing uncommitted changes in the working tree are allowed.
- **Environment failure in `red_gate`**: Missing binaries or modules (`Cannot find module`, exit 126/127) mean `setupCmd` is missing or wrong—configure `setupCmd` in the Checks popover.
- **Modified test files in `green_gate`**: `redCheck` hashes `checkFiles` after red verification passes; if `impl` modifies `checkFiles`, `green_gate` detects the hash mismatch and fails the attempt.
- **Rework at `human_gate`**: Rejecting with a note runs `rework` directly in the current working tree and re-verifies with `reverify` before returning to `human_gate`.
