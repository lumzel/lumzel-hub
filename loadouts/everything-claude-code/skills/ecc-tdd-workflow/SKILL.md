---
name: ecc-tdd-workflow
description: Enforce strict RED-GREEN-REFACTOR test-driven development with unit, integration, and edge-case coverage gates.
---

# ECC Test-Driven Development Workflow (`/tdd`)

Every feature, bug fix, or refactor follows the strict **RED → GREEN → REFACTOR** cycle.

## Workflow Steps

1. **Define Interfaces & Contracts**:
   - Specify input/output types, invariants, and error cases first.
2. **RED — Write Failing Tests First**:
   - Write unit and integration tests that exercise the public contract, boundary conditions (`null`/empty, invalid types, concurrency, error paths).
   - Run the test suite and verify the new tests fail for the expected reason.
3. **GREEN — Minimal Implementation**:
   - Write the simplest, cleanest code required to make the failing tests pass.
   - Do not add speculative features or premature optimizations.
4. **REFACTOR — Clean Up Under Green**:
   - Remove duplication, extract clear helpers, enforce immutability, and keep functions under 50 lines and files under 800 lines while keeping tests green.
5. **Coverage & Regression Gate**:
   - Verify >= 80% test coverage on touched modules (100% on auth, financial, or security-critical paths).
