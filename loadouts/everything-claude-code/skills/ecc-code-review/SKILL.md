---
name: ecc-code-review
description: Execute a severity-tiered code review (CRITICAL, HIGH, MEDIUM, LOW) covering security, correctness, performance, and maintainability.
---

# ECC Severity-Tiered Code Review (`/code-review`)

Review staged or branch changes (`git diff`) systematically and classify findings by severity.

## Severity Tiers

- **[CRITICAL]** (Blocks merge immediately):
  - Hardcoded credentials, SQL/command injection, auth bypass, data corruption, unhandled crash on primary path.
- **[HIGH]** (Must fix before merge):
  - Race conditions, memory/resource leaks, missing error handling at I/O boundaries, N+1 queries, missing tests for new behavior, functions > 50 lines or files > 800 lines.
- **[MEDIUM]** (Should fix):
  - In-place state mutation instead of immutable updates, deep nesting (> 4 levels), magic numbers/strings, weak type annotations (`any`).
- **[LOW]** (Optional polish):
  - Minor naming improvements, comment clarity, non-blocking refactoring opportunities.

## Output Format

For each finding, report:
`[SEVERITY] path/to/file:line — Issue summary`
- **Why it matters**: Concrete failure mode or maintenance cost.
- **Suggested fix**: Minimal code snippet or refactoring action.

End with a **Verdict**: `APPROVE`, `WARNING` (only MEDIUM/LOW issues), or `BLOCK` (any CRITICAL/HIGH issue).
