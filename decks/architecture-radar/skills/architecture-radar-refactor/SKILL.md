---
name: architecture-radar-refactor
description: Identify high-complexity or tightly coupled hotspot files and propose safe, seam-preserving incremental refactoring slices.
disable-model-invocation: true
---

# Architecture Hotspot & Refactor Plan

Pinpoint the highest-friction modules in the codebase and design low-risk, incremental refactoring steps.

## Procedure

1. **Locate Hotspots**: Combine file size, import fan-in/fan-out, recent `git log` churn, and mixed responsibilities (divergent change / shotgun surgery) to surface the top 3–5 hotspot files or modules.
2. **Diagnose Root Coupling**: For each hotspot, explain *why* it is hard to change safely (hidden mutable state, wide interface, mixed IO + domain logic, repeated branching).
3. **Design Seam-First Slices**: Propose ordered, behavior-preserving extraction steps:
   - Which public seam to test before touching internals
   - What cohesive module/type to extract
   - Expected reduction in coupling and blast radius
4. **Wait Before Editing**: Present the prioritized refactor plan first; do not rewrite production code until the user chooses a slice.
