---
name: architecture-radar-scan
description: Map module boundaries, package responsibilities, dependency direction, layer violations, and circular dependency risks across the repository.
disable-model-invocation: true
---

# Architecture Boundary & Dependency Scan

Analyze the repository's real module structure, dependency direction, and coupling hotspots.

## Procedure

1. **Discover Workspace Layout**: Identify top-level packages, apps, crates, or domain directories and summarize each module's single responsibility.
2. **Check Dependency Direction**: Trace cross-module imports (`import`, `use`, `require`, workspace dependencies) to see what depends on what. Flag:
   - Circular dependencies between modules or packages
   - Lower-level/domain modules reaching upward into UI, CLI, or transport layers
   - Shared "god" utility modules accumulating unrelated concerns
3. **Boundary Health Summary**: Output a concise module map, dependency direction diagram (Mermaid or structured tree), and ranked boundary violations with `file:line` references. Do not modify files during the scan.
