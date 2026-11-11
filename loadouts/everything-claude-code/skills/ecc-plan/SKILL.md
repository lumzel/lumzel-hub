---
name: ecc-plan
description: Create a phased implementation blueprint with architectural review, file impact analysis, and risk assessment before writing code.
---

# ECC Implementation Planner (`/plan`)

Before writing code for any multi-file feature or architectural refactor, produce a structured implementation blueprint and wait for user confirmation.

## Blueprint Structure

1. **Requirements & Scope Summary**:
   - Core user-visible outcomes and explicit non-goals.
2. **Architecture & Data Flow Review**:
   - Affected modules, state boundaries, API/IPC contracts, and database/storage changes.
3. **File Impact Map**:
   - Exact files to create, modify, or delete, with a one-line responsibility note per file.
4. **Phased Implementation Steps**:
   - Ordered, independently verifiable slices (Tests → Implementation → Integration).
5. **Risk Matrix & Mitigations**:
   - Breaking changes, performance bottlenecks, security surfaces, and rollback strategy.
6. **Verification Gate**:
   - Exact build, typecheck, and test commands that must pass before completion.
