---
name: speckit-specify
description: Author a technology-agnostic feature specification focused on user journeys, testable acceptance scenarios, and explicit edge cases.
---

# Spec-Kit Specify (`/speckit.specify`)

Define **WHAT** the feature does and **WHY** before deciding how to implement it.

## Specification Template

1. **Prioritized User Scenarios (P1 / P2 / P3)**:
   - Each scenario must be independently testable and written in **Given / When / Then** format.
2. **Edge & Failure Cases**:
   - Boundary conditions, concurrent modifications, network/storage failures, and permission denials.
3. **Functional Requirements (`FR-001`, `FR-002`, ...)**:
   - Testable, unambiguous statements (`System MUST ...`). Mark any unresolved ambiguity explicitly with `[NEEDS CLARIFICATION: specific question]` (at most 3).
4. **Measurable Success Criteria**:
   - User-visible and operational outcomes that prove the specification is met.
