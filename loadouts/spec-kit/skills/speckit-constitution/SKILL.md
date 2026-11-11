---
name: speckit-constitution
description: Establish or audit the project's architectural constitution—non-negotiable governing principles, stack invariants, and testing gates.
---

# Spec-Kit Constitution (`/speckit.constitution`)

Maintain and enforce the project's governing engineering principles (`constitution.md` or architectural invariants).

## Core Dimensions

1. **Architecture & Module Boundaries**:
   - Library-first modularity, allowed dependency directions, and state ownership rules.
2. **Contract & Data Invariants**:
   - Schema versioning, wire-format compatibility, and error contract standards.
3. **Testing & Verification Gates**:
   - Required contract, integration, and unit test coverage before any merge.
4. **Simplicity & Anti-Bloat Guardrails**:
   - Maximum abstraction depth and explicit justification required before adding new dependencies.
