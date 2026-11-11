---
name: ecc-verification-loop
description: Run the 6-stage ECC verification gate (Build, Typecheck, Lint, Tests, Security Scan, Diff Audit) before claiming completion.
---

# ECC 6-Stage Verification Loop (`/verify`)

Never claim a task is complete without executing the 6-stage verification gate and reporting real command output.

## The 6 Stages

1. **Stage 1 — Build Check**:
   - Run the project build command (`cargo check`/`pnpm build`/`go build`) and ensure zero compilation errors.
2. **Stage 2 — Type Check**:
   - Run strict type checking (`tsc --noEmit` / `pyright` / `cargo clippy`) and resolve all type mismatches.
3. **Stage 3 — Lint & Formatting**:
   - Run the repository linter and formatter; ensure zero new warnings or style violations.
4. **Stage 4 — Test Suite & Coverage**:
   - Run unit and integration tests targeting modified modules and verify zero regressions.
5. **Stage 5 — Secret & Console Log Sweep**:
   - Check `git diff` for leftover `console.log`/`dbg!`/`print` debug statements and accidental credential literals.
6. **Stage 6 — Final Diff Review**:
   - Inspect `git status` and `git diff` to confirm no unrelated files were touched and every requirement is satisfied.
